// Memory card manager.
//
// Cloud-aware: when a `MemoryCardCloudStore` is injected and a user id is set,
// the card library is backed by PocketBase records (`memory_cards`), the
// `mounted` select marks which card is active in each slot, and library CRUD
// (create / import / rename / delete / format) writes through to the cloud.
// Mounting/ejecting persists `mounted` and notifies the host via
// `onBindingChange` so the vendored sync engine uploads under the right card
// identity. When unauthed (no store / no user), it falls back to a
// session-only model: all card images (the two emulator slots + a card library)
// live in a zustand store and are wiped on reload.
//
// The manager always reads current slot bytes from the running core and pushes
// changes back into it (`importMemcard`) so the game sees mounted / transferred
// / edited cards immediately. `hydrate()` re-exports both slots from the live
// core on dialog reopen so game-written saves appear in the editor.
// `refreshLibrary()` re-pulls only the cloud library + mount markers — it does
// NOT touch slot bytes, so a sync pass (cross-device download) updates the
// library list without hot-swapping the running emulator's cards
// (apply-on-next-boot).

import { create } from 'zustand';
import type { MemoryCard, Save } from 'mcrreader';
import { parseMemoryCard } from 'mcrreader';
import type { EmulatorService } from '../services/emulator';
import { createEmptyCard } from './mcrBlank';
import type { MemoryCardCloudEntry, MemoryCardCloudStore } from './memoryCardCloudStore';
import {
  copySaveTo,
  deleteSave as deleteSaveFromCard,
  moveSave as moveSaveBetweenCards,
} from './mcrWrite';

export type MemorySlotNumber = 1 | 2;

/** Cloud card identity notified to the host (sync engine) on mount/rename. */
export type SlotBinding = { id: string; label: string };

export interface MemoryLibraryCard {
  id: string;
  label: string;
  bytes: Uint8Array;
  /** Which slot this card is mounted into, or null when it is a spare. */
  mounted: MemorySlotNumber | null;
  /** Marks cloud-backed entries (set when hydrated/created via the store). */
  cloud?: boolean;
}

export interface MemoryManagerSlotView {
  slot: MemorySlotNumber;
  bytes: Uint8Array;
  parsed: MemoryCard;
  /** Library card mounted into this slot, if any. */
  libraryId: string | null;
}

export interface MemoryManagerView {
  slot1: MemoryManagerSlotView | null;
  slot2: MemoryManagerSlotView | null;
  library: MemoryLibraryCard[];
  hydrated: boolean;
}

type MemoryManagerState = {
  slot1: Uint8Array | null;
  slot2: Uint8Array | null;
  mountId1: string | null;
  mountId2: string | null;
  library: MemoryLibraryCard[];
  hydrated: boolean;
};

let idCounter = 0;
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mc-${Date.now().toString(36)}-${++idCounter}`;
}

export class MemoryCardManager {
  private readonly store = create<MemoryManagerState>(() => ({
    slot1: null,
    slot2: null,
    mountId1: null,
    mountId2: null,
    library: [],
    hydrated: false,
  }));

  /** Slots with an in-flight editor push — `hydrate` must not clobber these. */
  private readonly _busySlots = new Set<MemorySlotNumber>();
  private _userId: string | null = null;

  constructor(
    private readonly emulator: EmulatorService,
    private readonly cloud?: MemoryCardCloudStore,
    private readonly onBindingChange?: (
      slot: MemorySlotNumber,
      binding: SlotBinding | null,
    ) => void,
  ) {}

  /** Set/clear the current user id (WS5 calls this on auth change). Cloud
   *  operations gate on a non-null user id; when null the manager is
   *  session-only. */
  setUserId(id: string | null): void {
    this._userId = id;
  }

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);
  getState = (): MemoryManagerState => this.store.getState();

  /**
   * Refresh only the library + mount indicators from the cloud. Does NOT
   * re-export slot bytes or push into the running core (apply-on-next-boot:
   * cloud bytes are never hot-swapped). Existing live slot bytes are preserved;
   * however, when a slot is empty (null) yet the cloud marks a card as mounted
   * there, the slot is seeded from that library card's bytes so the manager
   * always reflects the backend's mounted state. No-op without a cloud store.
   */
  async refreshLibrary(userId: string): Promise<void> {
    if (!this.cloud) return;
    try {
      const entries = await this.cloud.list(userId);
      const withBytes = await Promise.all(
        entries.map(async (e) => ({
          ...e,
          bytes: e.bytes ?? (await this.cloud!.fetchBytes(userId, e.id)),
        })),
      );
      this.store.setState(() => ({
        library: withBytes.map((e) => this._toLibraryCard(e)),
        // Do NOT overwrite slot1/slot2 bytes — apply-on-next-boot. Update the
        // mountId markers so the UI shows the current cloud mount state.
        mountId1: withBytes.find((e) => e.mounted === 'slot1')?.id ?? null,
        mountId2: withBytes.find((e) => e.mounted === 'slot2')?.id ?? null,
      }));
      this._fillMountedSlotsFromLibrary();
    } catch {
      // cloud unavailable — leave the library as-is
    }
  }

  /**
   * Full refresh: cloud library + mount state (when authed + store present)
   * followed by a live re-export of both non-busy slots so game-written saves
   * appear on dialog reopen. `hydrate` = `refreshLibrary` + live re-export.
   * Slots with an in-flight editor push are skipped (busy guard) so a mid-edit
   * slot is not momentarily undone by a stale export snapshot. Sets `hydrated`
   * once a pass has been attempted.
   */
  async hydrate(userId?: string): Promise<void> {
    const uid = userId ?? this._userId;

    // 1. Cloud library + mount markers (when authed + store present). Does NOT
    //    touch slot bytes — those come from the live re-export below.
    if (uid && this.cloud) {
      await this.refreshLibrary(uid);
    }

    // 2. ALWAYS re-export non-busy slots from the live core so game-written
    //    saves appear on dialog reopen. A null export leaves the slot as-is
    //    (e.g. fresh device keeps null until IDB is populated on next boot).
    const slots = ([1, 2] as const).filter((n) => !this._busySlots.has(n));
    const live = await Promise.all(slots.map((n) => this.emulator.exportMemcard(n)));
    this.store.setState(() => {
      const patch: Partial<MemoryManagerState> = { hydrated: true };
      slots.forEach((n, i) => {
        const key = n === 1 ? 'slot1' : 'slot2';
        if (live[i] != null) patch[key] = live[i] as Uint8Array;
      });
      return patch;
    });

    // 3. When the core returned nothing for a slot but the cloud has a card
    //    mounted there, seed the slot from that library card so the UI shows
    //    the backend's mounted state (display only — no core push).
    this._fillMountedSlotsFromLibrary();
  }

  // ── Card library ────────────────────────────────────────────────────

  /** Cloud-only: create a 'default' card and mount it into `slot` when the
   *  library is empty (first-time user). No session-only fallback — if the
   *  cloud is unavailable this throws and the caller (reconcile) skips, retrying
   *  on the next pass. Preserves the legacy phase-2 default-card behavior under
   *  the library model. No-op when unauthed, no cloud store, or the library is
   *  already non-empty. */
  async ensureDefaultCard(slot: MemorySlotNumber = 1): Promise<void> {
    if (!this._userId || !this.cloud) return;
    if (this.getState().library.length > 0) return;
    const bytes = createEmptyCard();
    const entry = await this.cloud.create(this._userId, 'default', bytes);
    const card: MemoryLibraryCard = {
      id: entry.id,
      label: entry.label,
      bytes,
      mounted: null,
      cloud: true,
    };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    await this.mountCard(slot, card.id);
  }

  async createCard(label: string): Promise<MemoryLibraryCard> {
    const bytes = createEmptyCard();
    const name = label.trim() || 'New Card';
    if (this._userId && this.cloud) {
      try {
        const entry = await this.cloud.create(this._userId, name, bytes);
        const card: MemoryLibraryCard = {
          id: entry.id,
          label: entry.label,
          bytes,
          mounted: null,
          cloud: true,
        };
        this.store.setState((s) => ({ library: [...s.library, card] }));
        return card;
      } catch {
        // cloud failure — fall through to session-only
      }
    }
    const card: MemoryLibraryCard = { id: makeId(), label: name, bytes, mounted: null };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    return card;
  }

  async importCard(buf: ArrayBuffer | Uint8Array, label?: string): Promise<MemoryLibraryCard> {
    const bytes = buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(buf);
    parseMemoryCard(bytes); // throws on invalid images
    const name = label?.trim() || 'Imported Card';
    if (this._userId && this.cloud) {
      try {
        const entry = await this.cloud.create(this._userId, name, bytes);
        const card: MemoryLibraryCard = {
          id: entry.id,
          label: entry.label,
          bytes,
          mounted: null,
          cloud: true,
        };
        this.store.setState((s) => ({ library: [...s.library, card] }));
        return card;
      } catch {
        // cloud failure — fall through to session-only
      }
    }
    const card: MemoryLibraryCard = { id: makeId(), label: name, bytes, mounted: null };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    return card;
  }

  renameCard(id: string, label: string): void {
    const trimmed = label.trim();
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === id ? { ...c, label: trimmed || c.label } : c)),
    }));
    if (this._userId && this.cloud) {
      void this.cloud.rename(id, trimmed);
    }
    // If the renamed card is mounted, re-bind so the sync engine uploads under
    // the new label (the id is unchanged → rename-safe upsert in WS3).
    const s = this.store.getState();
    for (const slot of [1, 2] as const) {
      if (this._mountOf(slot) === id) {
        const card = s.library.find((c) => c.id === id);
        this.onBindingChange?.(slot, { id, label: card?.label ?? trimmed });
      }
    }
  }

  deleteCard(id: string): void {
    const s = this.store.getState();
    if (s.mountId1 === id || s.mountId2 === id) {
      throw new Error('Eject the card from its slot before removing it from the library');
    }
    this.store.setState((st) => ({
      library: st.library.filter((c) => c.id !== id),
    }));
    if (this._userId && this.cloud) void this.cloud.remove(id);
  }

  formatLibraryCard(id: string): void {
    const bytes = createEmptyCard();
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === id ? { ...c, bytes } : c)),
    }));
    // Persist the blank image for a cloud spare (outside the dirty-export path)
    // so the format survives reload. Mounted cards format via `formatSlot` and
    // sync through the worker's dirty-export poll.
    if (this._userId && this.cloud) {
      void this.cloud.updateBytes(this._userId, id, bytes);
    }
  }

  // ── Slots ───────────────────────────────────────────────────────────

  private _getSlotBytes(slot: MemorySlotNumber): Uint8Array | null {
    const s = this.store.getState();
    return slot === 1 ? s.slot1 : s.slot2;
  }

  private _mountOf(slot: MemorySlotNumber): string | null {
    const s = this.store.getState();
    return slot === 1 ? s.mountId1 : s.mountId2;
  }

  private _setSlot(slot: MemorySlotNumber, bytes: Uint8Array | null, mountId: string | null): void {
    const key = slot === 1 ? 'slot1' : 'slot2';
    const mountKey = slot === 1 ? 'mountId1' : 'mountId2';
    this.store.setState(
      () =>
        ({
          [key]: bytes,
          [mountKey]: mountId,
        }) as Partial<MemoryManagerState>,
    );
  }

  private _slotKey(slot: MemorySlotNumber): 'slot1' | 'slot2' {
    return slot === 1 ? 'slot1' : 'slot2';
  }

  /** Seed any empty (null) slot whose `mountId` points at a library card with
   *  that card's bytes, so the manager always reflects the backend's mounted
   *  state. Skips busy slots and slots that already have bytes (live is
   *  authoritative). Display-only — does NOT push into the running core. */
  private _fillMountedSlotsFromLibrary(): void {
    const s = this.store.getState();
    const patch: Partial<MemoryManagerState> = {};
    for (const slot of [1, 2] as const) {
      if (this._busySlots.has(slot)) continue;
      const key = this._slotKey(slot);
      const mountId = slot === 1 ? s.mountId1 : s.mountId2;
      if (s[key] == null && mountId) {
        const card = s.library.find((c) => c.id === mountId);
        if (card) patch[key] = new Uint8Array(card.bytes);
      }
    }
    if (Object.keys(patch).length > 0) this.store.setState(() => patch);
  }

  /** Project a cloud entry into a library card. Null bytes (spare with no file
   *  yet) fall back to a blank image so the UI can render block counts. */
  private _toLibraryCard(e: MemoryCardCloudEntry): MemoryLibraryCard {
    return {
      id: e.id,
      label: e.label,
      bytes: e.bytes ?? createEmptyCard(),
      mounted: e.mounted === 'slot1' ? 1 : e.mounted === 'slot2' ? 2 : null,
      cloud: true,
    };
  }

  /** Mark a card as mounted into a slot in the local library, clearing the
   *  slot's previous occupant (local exclusivity mirror of the cloud rule). */
  private _markLibraryMounted(slot: MemorySlotNumber, cardId: string): void {
    this.store.setState((s) => ({
      library: s.library.map((c) => {
        if (c.id === cardId) return { ...c, mounted: slot };
        if (c.mounted === slot) return { ...c, mounted: null };
        return c;
      }),
    }));
  }

  private _markLibraryUnmounted(cardId: string): void {
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === cardId ? { ...c, mounted: null } : c)),
    }));
  }

  async mountCard(slot: MemorySlotNumber, cardId: string): Promise<void> {
    const card = this.store.getState().library.find((c) => c.id === cardId);
    if (!card) return;
    const bytes = new Uint8Array(card.bytes);
    this._setSlot(slot, bytes, cardId);
    await this._push(slot, bytes);
    this._markLibraryMounted(slot, cardId);

    if (this._userId && this.cloud) {
      try {
        await this.cloud.setMounted(this._userId, cardId, this._slotKey(slot));
      } catch {
        // cloud failure: slot is mounted locally; surfaced via the dialog toast
      }
    }
    this.onBindingChange?.(slot, { id: cardId, label: card.label });
  }

  /** Eject a card from a slot: write its live bytes back into the library
   *  entry, empty the slot, and mount a blank card so the running core no
   *  longer plays the ejected card. Clears the cloud `mounted` + unbinds. */
  async unmountCard(slot: MemorySlotNumber): Promise<void> {
    const bytes = this._getSlotBytes(slot);
    const mountId = this._mountOf(slot);

    if (mountId && bytes) {
      this.store.setState((s) => ({
        library: s.library.map((c) =>
          c.id === mountId ? { ...c, bytes: new Uint8Array(bytes), mounted: null } : c,
        ),
      }));
    } else if (mountId) {
      this._markLibraryUnmounted(mountId);
    }
    this._setSlot(slot, null, null);
    await this._push(slot, createEmptyCard());

    if (this._userId && mountId && this.cloud) {
      try {
        await this.cloud.setMounted(this._userId, mountId, null);
      } catch {
        // cloud failure: slot is unmounted locally
      }
    }
    this.onBindingChange?.(slot, null);
  }

  async formatSlot(slot: MemorySlotNumber): Promise<void> {
    const bytes = createEmptyCard();
    this._setSlot(slot, bytes, this._mountOf(slot));
    await this._push(slot, bytes);
  }

  // ── Save-level operations ───────────────────────────────────────────

  private _requireSlotBytes(slot: MemorySlotNumber): Uint8Array {
    const bytes = this._getSlotBytes(slot);
    if (!bytes) throw new Error(`Slot ${slot} has no card mounted`);
    return bytes;
  }

  async deleteSave(slot: MemorySlotNumber, save: Save): Promise<void> {
    const current = this._requireSlotBytes(slot);
    const next = deleteSaveFromCard(current, save);
    this._setSlot(slot, next, this._mountOf(slot));
    await this._push(slot, next);
  }

  /**
   * Copy or move a save between the two slots. Throws when the target lacks
   * free blocks. Both slot images are replaced in place.
   */
  async transferSave(
    from: MemorySlotNumber,
    to: MemorySlotNumber,
    save: Save,
    mode: 'copy' | 'move',
  ): Promise<void> {
    if (from === to) return;
    const fromBytes = this._requireSlotBytes(from);
    const toBytes = this._requireSlotBytes(to);

    if (mode === 'move') {
      const result = moveSaveBetweenCards(fromBytes, toBytes, save);
      if (!result.ok) throw new Error(result.error);
      this._setSlot(to, result.to, this._mountOf(to));
      this._setSlot(from, result.from, this._mountOf(from));
      await Promise.all([this._push(from, result.from), this._push(to, result.to)]);
      return;
    }

    const copied = copySaveTo(toBytes, fromBytes, save);
    if (!copied.ok) throw new Error(copied.error);
    this._setSlot(to, copied.card, this._mountOf(to));
    await this._push(to, copied.card);
  }

  /** Push new slot bytes into the live core; never fatal — the in-memory card
   *  stays authoritative for this session even if the core is busy/absent.
   *  Marks the slot busy for the duration so `hydrate` won't clobber a mid-edit
   *  slot with a stale export snapshot. */
  private async _push(slot: MemorySlotNumber, bytes: Uint8Array): Promise<void> {
    this._busySlots.add(slot);
    try {
      await this.emulator.importMemcard(slot, bytes);
    } catch {
      // session-only: keep the in-memory card
    } finally {
      this._busySlots.delete(slot);
    }
  }
}

/**
 * Factory for constructing a cloud-aware manager. WS5 wires the cloud store +
 * binding callback (so the vendored sync engine uploads under the right card
 * identity). The clouded singleton is constructed + exported from
 * `services/index.ts` (the service owns it); this factory stays free of the
 * service import so there is no module cycle.
 */
export function createMemoryCardManager(
  emulator: EmulatorService,
  cloud?: MemoryCardCloudStore,
  onBindingChange?: (slot: MemorySlotNumber, binding: SlotBinding | null) => void,
): MemoryCardManager {
  return new MemoryCardManager(emulator, cloud, onBindingChange);
}
