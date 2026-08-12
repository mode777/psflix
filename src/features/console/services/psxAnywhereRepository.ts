import type { Repository, SaveStateRecordDto } from 'repository';
import { pb } from '@/lib/pb';
import { fileUrl } from '@/lib/pb-files';
import { assertLabel, assertSerial, assertUserId, isNotFound } from './psxUtil';

/**
 * PsxAnywhereRepository adapts PSflix's PocketBase singleton (`pb`) onto
 * PSxAnywhere's `Repository` interface so the vendored `EmulatorClient`
 * facade can talk to the same backend PSflix uses — one auth source, one
 * token store.
 *
 * Phase 2 implements the full cloud-sync surface (disc-ID resolution, save
 * states, memory cards) against the existing `save_state` / `memory_cards` /
 * `discs` collections (which already match PSxAnywhere's schema 1:1). Because
 * it wraps the same `pb` instance `SignInDialog` writes to, sign-in / sign-out
 * updates `pb.authStore`, which fires `onAuthChange` → the facade's sync
 * engines react (download on auth, debounced upload on dirty export).
 *
 * Auth note: `save_state` and `memory_cards` are owner-only
 * (`@request.auth.id = user.id`); these methods require an authenticated `pb`.
 * The facade's sync engines already gate on `isAuthenticated()`, so calls only
 * fire when PSflix's auth store is valid.
 *
 * Adapter-only helpers (`deleteSaveStateBySlot`, `fetchMemcardsForUser`,
 * `createMemcard`, `renameMemcard`, `deleteMemcard`, `setMemcardMounted`) are
 * intentionally NOT on the upstream `Repository` interface — they exist so
 * PSflix's `EmulatorService` / `MemoryCardCloudStore` can drive cloud delete,
 * the memory-card library, and `mounted` slot markers without widening the
 * vendored contract. The cloud card library is keyed by record `id` (stable
 * across renames); the `memory_cards.mounted` select (`slot1`/`slot2`) marks
 * which card is active in each slot.
 */
class PsxAnywhereRepository implements Repository {
  private readonly _discIdCache = new Map<string, string>();

  // ── Auth (delegate to PSflix's pb) ───────────────────────────────────

  isAuthenticated(): boolean {
    return pb.authStore.isValid && !!pb.authStore.record;
  }

  currentUsername(): string | null {
    const r = pb.authStore.record;
    return r ? r.username || r.email || r.name || r.id : null;
  }

  onAuthChange(callback: () => void): void {
    pb.authStore.onChange(() => callback());
  }

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    await pb.collection('users').authWithPassword(email, password);
  }

  async registerWithEmailPassword(email: string, password: string): Promise<void> {
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    await pb.collection('users').authWithPassword(email, password);
  }

  logout(): void {
    pb.authStore.clear();
  }

  getCurrentUserId(): string | null {
    return pb.authStore.record?.id ?? null;
  }

  // ── BIOS (the facade fetches the BIOS at loadDisc) ───────────────────

  async fetchBiosUrl(): Promise<string> {
    const record = await pb.collection('consoles').getFirstListItem('');
    const bios = record.bios as string;
    return fileUrl(record, bios);
  }

  // ── Catalog (unused — PSflix has its own react-query catalog) ─────────

  async fetchGames(): Promise<never> {
    throw new Error('fetchGames not used — PSflix has its own catalog');
  }

  // ── Disc-ID resolution ───────────────────────────────────────────────
  // The repository keys cloud save states by `discs.id` (the PocketBase
  // relation), while PSflix's UI keys by `disc.serial`. The `discs.serial`
  // unique index (`pb_schema.json`) makes `getFirstListItem('serial="…"')`
  // safe. Results are cached so the cross-lookup is a single round-trip.

  async resolveDiscId(discSerial: string): Promise<string> {
    assertSerial(discSerial);
    const cached = this._discIdCache.get(discSerial);
    if (cached) return cached;
    const disc = await pb.collection('discs').getFirstListItem(`serial="${discSerial}"`);
    this._discIdCache.set(discSerial, disc.id);
    return disc.id;
  }

  async lookupDiscSerial(discId: string): Promise<string> {
    for (const [serial, id] of this._discIdCache) {
      if (id === discId) return serial;
    }
    const disc = await pb.collection('discs').getOne(discId);
    this._discIdCache.set(disc.serial, disc.id);
    return disc.serial;
  }

  // ── Save-state cloud operations ──────────────────────────────────────
  // `save_state` is unique on (type, disc, user) — upserts key on that triple.

  private async _fetchSaveStateBytes(record: {
    collectionId: string;
    id: string;
    data?: string;
  }): Promise<ArrayBuffer> {
    const data = record.data as string;
    const url = fileUrl(record, data);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`save-state fetch failed ${resp.status} ${resp.statusText}`);
    }
    return resp.arrayBuffer();
  }

  async uploadSaveState(
    discSerial: string,
    type: string,
    buf: ArrayBuffer,
    userId: string,
  ): Promise<SaveStateRecordDto> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);

    let existing: { id: string } | null = null;
    try {
      existing = await pb
        .collection('save_state')
        .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }

    const form = new FormData();
    form.append('type', type);
    form.append('disc', discId);
    form.append('user', userId);
    form.append('data', new Blob([buf as BlobPart]), 'save.state');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = existing
      ? await pb.collection('save_state').update(existing.id, form)
      : await pb.collection('save_state').create(form);
    return {
      id: r.id,
      updated: r.updated,
      type: r.type ?? type,
      discId: r.disc ?? discId,
      dataFilename: r.data,
      discSerial,
    };
  }

  async downloadSaveState(
    discSerial: string,
    type: string,
    userId: string,
  ): Promise<{ buf: ArrayBuffer; recordId: string; updated: string }> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);
    const record = await pb
      .collection('save_state')
      .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
    const buf = await this._fetchSaveStateBytes(record);
    return { buf, recordId: record.id, updated: record.updated };
  }

  async fetchSaveStateBytes(record: SaveStateRecordDto): Promise<ArrayBuffer> {
    const fresh = await pb.collection('save_state').getOne(record.id);
    return this._fetchSaveStateBytes(fresh);
  }

  async hasRemoteState(discSerial: string, type: string, userId: string): Promise<boolean> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);
    try {
      await pb
        .collection('save_state')
        .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  async getSaveStateRecord(recordId: string): Promise<SaveStateRecordDto> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await pb.collection('save_state').getOne(recordId, { expand: 'disc' });
    return {
      id: r.id,
      updated: r.updated,
      type: r.type,
      discId: r.disc,
      dataFilename: r.data,
      discSerial: r.expand?.disc?.serial ?? null,
    };
  }

  async fetchNewerSaveStates(userId: string, since?: string): Promise<SaveStateRecordDto[]> {
    assertUserId(userId);
    const filter = since ? `user="${userId}" && updated > "${since}"` : `user="${userId}"`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = await pb.collection('save_state').getFullList({ filter });
    return records.map((r) => ({
      id: r.id,
      updated: r.updated,
      type: r.type,
      discId: r.disc,
      dataFilename: r.data,
      discSerial: null,
    }));
  }

  async fetchSaveStatesFor(
    discSerial: string,
    userId: string,
    since?: string,
  ): Promise<SaveStateRecordDto[]> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);
    const filter = since
      ? `user="${userId}" && disc="${discId}" && updated > "${since}"`
      : `user="${userId}" && disc="${discId}"`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = await pb
      .collection('save_state')
      .getFullList({ filter, expand: 'disc' });
    return records.map((r) => ({
      id: r.id,
      updated: r.updated,
      type: r.type,
      discId: r.disc,
      dataFilename: r.data,
      discSerial: r.expand?.disc?.serial ?? discSerial,
    }));
  }

  /**
   * Adapter-only (NOT on the upstream `Repository` interface): delete the cloud
   * save state for a (disc, slot, user) triple. The facade exposes no delete
   * API, so PSflix's `EmulatorService.deleteState` calls this directly.
   */
  async deleteSaveStateBySlot(discSerial: string, type: string, userId: string): Promise<void> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);
    try {
      const record = await pb
        .collection('save_state')
        .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
      await pb.collection('save_state').delete(record.id);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  // ── Memory-card cloud operations ─────────────────────────────────────
  // `memory_cards` is a per-user library; cloud identity is the record `id`
  // (stable across renames) and the `mounted` select (`slot1`/`slot2`) marks
  // which card is active in each slot. Upserts prefer `recordId` when provided
  // (rename-safe); the legacy `(label, user)` lookup is the fallback.

  async uploadMemcard(
    buf: ArrayBuffer,
    userId: string,
    label: string,
    recordId?: string,
    mounted?: 'slot1' | 'slot2' | null,
  ): Promise<unknown> {
    assertUserId(userId);
    assertLabel(label);

    let existing: { id: string } | null = null;
    if (recordId) {
      // Rename-safe: trust the host-supplied id, skip the label lookup so
      // renaming a mounted card updates in place (no duplicate).
      existing = { id: recordId };
    } else {
      try {
        existing = await pb
          .collection('memory_cards')
          .getFirstListItem(`label="${label}" && user="${userId}"`);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }

    const form = new FormData();
    form.append('user', userId);
    form.append('label', label);
    form.append('data', new Blob([buf as BlobPart]), 'memcard.mcd');
    // Only append `mounted` when explicitly defined so the dirty-upload path
    // (bytes only) does not clobber an existing slot marker. `''` clears the
    // select (schema marks it `required: false`).
    if (mounted !== undefined) {
      form.append('mounted', mounted ?? '');
    }

    if (existing) {
      return pb.collection('memory_cards').update(existing.id, form);
    }
    return pb.collection('memory_cards').create(form);
  }

  async downloadMemcard(
    userId: string,
    label: string,
  ): Promise<{ buf: ArrayBuffer; recordId: string; updated: string }> {
    assertUserId(userId);
    assertLabel(label);
    const record = await pb
      .collection('memory_cards')
      .getFirstListItem(`label="${label}" && user="${userId}"`);
    const url = fileUrl(record, record.data);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`downloadMemcard: fetch failed ${resp.status} ${resp.statusText}`);
    }
    const buf = await resp.arrayBuffer();
    return { buf, recordId: record.id, updated: record.updated };
  }

  async hasRemoteMemcard(userId: string, label: string): Promise<boolean> {
    assertUserId(userId);
    assertLabel(label);
    try {
      await pb.collection('memory_cards').getFirstListItem(`label="${label}" && user="${userId}"`);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  /**
   * Adapter-only (NOT on the upstream `Repository` interface): list a user's
   * cloud memory cards so PSflix's `MemoryCardCloudStore` (WS4) /
   * `EmulatorService.listMemoryCards` can show real records alongside the
   * seeded UX defaults. Carries `mounted` so the caller can derive slot
   * bindings from the source of truth.
   */
  async fetchMemcardsForUser(userId: string): Promise<
    {
      id: string;
      label: string;
      data: string;
      updated: string;
      mounted: 'slot1' | 'slot2' | null;
    }[]
  > {
    assertUserId(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = await pb
      .collection('memory_cards')
      .getFullList({ filter: `user="${userId}"` });
    return records.map((r) => ({
      id: r.id,
      label: r.label ?? '',
      data: r.data,
      updated: r.updated,
      mounted: normalizeMounted(r.mounted),
    }));
  }

  // ── Adapter-only library CRUD (NOT on the vendored Repository interface) ─
  // These exist so PSflix's MemoryCardCloudStore (WS4) can drive the cloud card
  // library (create / rename / delete / mount) without widening the vendored
  // contract. Mirror the existing deleteSaveStateBySlot / fetchMemcardsForUser
  // pattern: all owner-scoped, require an authenticated `pb`.

  /** Create a new card in the user's library. Bytes optional (spare card with
   *  no image yet). `mounted` optional (create + mount in one step). */
  async createMemcard(
    userId: string,
    label: string,
    bytes?: ArrayBuffer | Uint8Array,
    mounted?: 'slot1' | 'slot2' | null,
  ): Promise<{ id: string; label: string; mounted: 'slot1' | 'slot2' | null }> {
    assertUserId(userId);
    assertLabel(label);
    const form = new FormData();
    form.append('user', userId);
    form.append('label', label);
    if (bytes) {
      const ab = bytes instanceof Uint8Array ? bytes.buffer : bytes;
      form.append('data', new Blob([ab as BlobPart]), 'memcard.mcd');
    }
    if (mounted) form.append('mounted', mounted);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await pb.collection('memory_cards').create(form);
    return { id: r.id, label: r.label ?? label, mounted: normalizeMounted(r.mounted) };
  }

  /** Rename a library card. Safe on a mounted card: only `label` changes; the
   *  record `id` and `mounted` are untouched. The host (WS4) re-binds the slot
   *  with the new label so subsequent uploads key off the same id. */
  async renameMemcard(recordId: string, label: string): Promise<void> {
    assertLabel(label);
    await pb.collection('memory_cards').update(recordId, { label });
  }

  /** Delete a card from the library. Callers should refuse on the client side
   *  when the card is currently mounted (the host guards, but a defensive check
   *  prevents orphaning a slot marker). */
  async deleteMemcard(recordId: string): Promise<void> {
    await pb.collection('memory_cards').delete(recordId);
  }

  /** Set or clear a card's `mounted` slot, ensuring slot exclusivity: when
   *  mounting into slotN, first clear `mounted` on whichever card currently
   *  holds slotN for this user (the previous occupant). Two calls; not atomic
   *  but the single-session client makes the race negligible. */
  async setMemcardMounted(
    userId: string,
    recordId: string,
    slot: 'slot1' | 'slot2' | null,
  ): Promise<void> {
    assertUserId(userId);
    if (slot) {
      // Clear the previous occupant of this slot (if any, if different).
      try {
        const prev = await pb
          .collection('memory_cards')
          .getFirstListItem(`mounted="${slot}" && user="${userId}"`);
        if (prev.id !== recordId) {
          await pb.collection('memory_cards').update(prev.id, { mounted: '' });
        }
      } catch (e) {
        if (!isNotFound(e)) throw e; // no previous occupant is fine
      }
      await pb.collection('memory_cards').update(recordId, { mounted: slot });
    } else {
      await pb.collection('memory_cards').update(recordId, { mounted: '' });
    }
  }
}

/** Coerce a raw `mounted` value into the strict union. Tolerant of legacy /
 *  odd values (`undefined`, `''`, anything outside `{slot1, slot2}`) so a stray
 *  value never crashes the library list. */
function normalizeMounted(v: unknown): 'slot1' | 'slot2' | null {
  return v === 'slot1' || v === 'slot2' ? v : null;
}

// Exported as the concrete class type so PSflix's adapter (EmulatorService) can
// reach the adapter-only helpers above. Structurally assignable to the
// vendored `Repository` interface that `EmulatorClient` expects.
export const psxAnywhereRepository = new PsxAnywhereRepository();
