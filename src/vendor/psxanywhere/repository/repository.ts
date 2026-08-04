'use strict';

// PocketBase repository facade. The ONLY file allowed to import the PB SDK.
// See specs/archive/separation-of-concerns/spec.md and phase1.md.

import PocketBase from 'pocketbase';

// ── Collection constants ──────────────────────────────────────────────

const COL = Object.freeze({
  USERS: 'users',
  GAME_DISCS: 'game_discs',
  DISCS: 'discs',
  SAVE_STATE: 'save_state',
  MEMCARD: 'memory_cards',
  CONSOLES: 'consoles',
});

// ── Input validation ─────────────────────────────────────────────────

function assertSerial(s: string): void {
  if (!/^[A-Z0-9-]+$/i.test(s)) throw new Error(`Invalid serial: ${s}`);
}

function assertUserId(id: string): void {
  if (!id || typeof id !== 'string') throw new Error(`Invalid userId`);
}

function assertLabel(l: string): void {
  if (!l || typeof l !== 'string') throw new Error(`Invalid label`);
}

function isNotFound(e: unknown): boolean {
  return e != null && typeof e === 'object' && (e as any).status === 404;
}

// ── Save-state DTO ────────────────────────────────────────────────────

// PocketBase `save_state` record projected onto a typed shape so consumers
// (StateStore / SyncEngine) never touch raw PB records. `discSerial` is
// populated only when the record was fetched with `expand: 'disc'`.
export interface SaveStateRecordDto {
  id: string;
  updated: string; // PB `updated` ISO string
  type: string; // 'auto' | 'slot1' | 'slotN'
  discId: string; // relation id into `discs`
  dataFilename: string; // PB file field (token for files.getURL)
  discSerial: string | null;
}

function toSaveStateDto(r: any): SaveStateRecordDto {
  return {
    id: r.id,
    updated: r.updated,
    type: r.type,
    discId: r.disc,
    dataFilename: r.data,
    discSerial: r.expand?.disc?.serial ?? null,
  };
}

// ── Repository interface ──────────────────────────────────────────────

export interface Repository {
  // Auth
  isAuthenticated(): boolean;
  currentUsername(): string | null;
  onAuthChange(callback: () => void): void;
  loginWithEmailPassword(email: string, password: string): Promise<void>;
  registerWithEmailPassword(email: string, password: string): Promise<void>;
  logout(): void;
  getCurrentUserId(): string | null;

  // Game catalog
  fetchGames(): Promise<{ name: string; url: string; serial: string }[]>;
  fetchBiosUrl(): Promise<string>;

  // Disc ID resolution
  resolveDiscId(discSerial: string): Promise<string>;
  lookupDiscSerial(discId: string): Promise<string>;

  // Save state cloud operations
  uploadSaveState(
    discSerial: string,
    type: string,
    buf: ArrayBuffer,
    userId: string,
  ): Promise<SaveStateRecordDto>;
  downloadSaveState(
    discSerial: string,
    type: string,
    userId: string,
  ): Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>;
  fetchSaveStateBytes(record: SaveStateRecordDto): Promise<ArrayBuffer>;
  hasRemoteState(discSerial: string, type: string, userId: string): Promise<boolean>;
  getSaveStateRecord(recordId: string): Promise<SaveStateRecordDto>;
  fetchNewerSaveStates(userId: string, since?: string): Promise<any[]>;
  fetchSaveStatesFor(
    discSerial: string,
    userId: string,
    since?: string,
  ): Promise<SaveStateRecordDto[]>;

  // Memory card cloud operations
  uploadMemcard(buf: ArrayBuffer, userId: string, label: string): Promise<unknown>;
  downloadMemcard(
    userId: string,
    label: string,
  ): Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>;
  hasRemoteMemcard(userId: string, label: string): Promise<boolean>;
}

// ── PocketBase implementation ─────────────────────────────────────────

export class PocketbaseRepository implements Repository {
  private readonly _pb: PocketBase;
  private readonly _discIdCache = new Map<string, string>();

  constructor(url: string) {
    this._pb = new PocketBase(url);
  }

  // ── Auth ──────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return this._pb.authStore.isValid && !!this._pb.authStore.record;
  }

  currentUsername(): string | null {
    const r = this._pb.authStore.record;
    if (!r) return null;
    return r.username || r.email || r.name || r.id;
  }

  onAuthChange(callback: () => void) {
    this._pb.authStore.onChange(() => callback());
  }

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    await this._pb.collection(COL.USERS).authWithPassword(email, password);
  }

  async registerWithEmailPassword(email: string, password: string): Promise<void> {
    await this._pb.collection(COL.USERS).create({
      email,
      password,
      passwordConfirm: password,
    });
    await this._pb.collection(COL.USERS).authWithPassword(email, password);
  }

  logout() {
    this._pb.authStore.clear();
  }

  // ── Game catalog ──────────────────────────────────────────────────

  async fetchGames() {
    const records = await this._pb.collection(COL.GAME_DISCS).getFullList();
    return records.map((r: any) => ({
      name: r.title,
      url: this._pb.files.getURL(r, r.file),
      serial: r.id,
    }));
  }

  // ── BIOS URL ──────────────────────────────────────────────────────

  async fetchBiosUrl(): Promise<string> {
    const record = await this._pb.collection(COL.CONSOLES).getFirstListItem('');
    return this._pb.files.getURL(record, record.bios);
  }

  // ── Disc ID resolution ────────────────────────────────────────────

  async resolveDiscId(discSerial: string): Promise<string> {
    assertSerial(discSerial);
    if (this._discIdCache.has(discSerial)) return this._discIdCache.get(discSerial)!;
    const disc = await this._pb.collection(COL.DISCS).getFirstListItem(`serial="${discSerial}"`);
    this._discIdCache.set(discSerial, disc.id);
    return disc.id;
  }

  async lookupDiscSerial(discId: string): Promise<string> {
    for (const [serial, id] of this._discIdCache) {
      if (id === discId) return serial;
    }
    const disc = await this._pb.collection(COL.DISCS).getOne(discId);
    this._discIdCache.set(disc.serial, disc.id);
    return disc.serial;
  }

  // ── Current user helpers ──────────────────────────────────────────

  getCurrentUserId(): string | null {
    return this._pb.authStore.record?.id ?? null;
  }

  // ── Save state cloud operations ───────────────────────────────────

  private async _fetchBytesFromRecord(r: any): Promise<ArrayBuffer> {
    const url = this._pb.files.getURL(r, r.data);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`save-state fetch failed ${resp.status} ${resp.statusText}`);
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

    let existing = null;
    try {
      existing = await this._pb
        .collection(COL.SAVE_STATE)
        .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
    } catch (e) {
      if (isNotFound(e)) {
        /* not found — will create */
      } else throw e;
    }

    const form = new FormData();
    form.append('type', type);
    form.append('disc', discId);
    form.append('user', userId);
    form.append('data', new Blob([buf as BlobPart]), 'save.state');

    const r = existing
      ? await this._pb.collection(COL.SAVE_STATE).update(existing.id, form)
      : await this._pb.collection(COL.SAVE_STATE).create(form);
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

    const record = await this._pb
      .collection(COL.SAVE_STATE)
      .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
    const buf = await this._fetchBytesFromRecord(record);
    return { buf, recordId: record.id, updated: record.updated };
  }

  async fetchSaveStateBytes(record: SaveStateRecordDto): Promise<ArrayBuffer> {
    const fresh = await this._pb.collection(COL.SAVE_STATE).getOne(record.id);
    return this._fetchBytesFromRecord(fresh);
  }

  async hasRemoteState(discSerial: string, type: string, userId: string): Promise<boolean> {
    assertSerial(discSerial);
    assertUserId(userId);
    const discId = await this.resolveDiscId(discSerial);
    try {
      await this._pb
        .collection(COL.SAVE_STATE)
        .getFirstListItem(`type="${type}" && disc="${discId}" && user="${userId}"`);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  async getSaveStateRecord(recordId: string): Promise<SaveStateRecordDto> {
    const r = await this._pb.collection(COL.SAVE_STATE).getOne(recordId, { expand: 'disc' });
    return toSaveStateDto(r);
  }

  async fetchNewerSaveStates(userId: string, since?: string) {
    assertUserId(userId);
    const filter = since ? `user="${userId}" && updated > "${since}"` : `user="${userId}"`;
    return this._pb.collection(COL.SAVE_STATE).getFullList({ filter });
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
    const records = await this._pb
      .collection(COL.SAVE_STATE)
      .getFullList({ filter, expand: 'disc' });
    return records.map(toSaveStateDto);
  }

  // ── Memory card cloud operations ──────────────────────────────────

  async uploadMemcard(buf: ArrayBuffer, userId: string, label: string) {
    assertUserId(userId);
    assertLabel(label);
    let existing = null;
    try {
      existing = await this._pb
        .collection(COL.MEMCARD)
        .getFirstListItem(`label="${label}" && user="${userId}"`);
    } catch (e) {
      if (isNotFound(e)) {
        /* not found — will create */
      } else throw e;
    }

    const form = new FormData();
    form.append('user', userId);
    form.append('label', label);
    form.append('data', new Blob([buf as BlobPart]), 'memcard.mcd');

    if (existing) {
      return this._pb.collection(COL.MEMCARD).update(existing.id, form);
    }
    return this._pb.collection(COL.MEMCARD).create(form);
  }

  async downloadMemcard(userId: string, label: string) {
    assertUserId(userId);
    assertLabel(label);
    const record = await this._pb
      .collection(COL.MEMCARD)
      .getFirstListItem(`label="${label}" && user="${userId}"`);

    const url = this._pb.files.getURL(record, record.data);
    const resp = await fetch(url);
    if (!resp.ok)
      throw new Error(`downloadMemcard: fetch failed ${resp.status} ${resp.statusText}`);
    const buf = await resp.arrayBuffer();
    return { buf, recordId: record.id, updated: record.updated };
  }

  async hasRemoteMemcard(userId: string, label: string): Promise<boolean> {
    assertUserId(userId);
    assertLabel(label);
    try {
      await this._pb
        .collection(COL.MEMCARD)
        .getFirstListItem(`label="${label}" && user="${userId}"`);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}
