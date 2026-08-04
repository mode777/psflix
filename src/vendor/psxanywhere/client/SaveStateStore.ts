'use strict';

// Local-first save-state store: IndexedDB CRUD with a cloud cache-on-miss.
// Pure data operations — no sync, no UI. Cloud sync lives in SaveStateSyncEngine.
// See docs/save-state.md.

import type { Repository } from 'repository';
import { UNSYNCED, SYNCED, slotToType, compositeKey } from './slotKey';
import type { Slot, SaveStateStorage } from './saveStateStorage';
import { formatErr } from './saveStateStorage';

export class SaveStateStore {
  private readonly _storage: SaveStateStorage;
  private readonly _repo: Repository;
  private readonly _log: (level: string, msg: string) => void;

  constructor(
    storage: SaveStateStorage,
    repo: Repository,
    log: (level: string, msg: string) => void,
  ) {
    this._storage = storage;
    this._repo = repo;
    this._log = log;
  }

  /** Persist a save-state buffer under `${discSerial}:${slotToType(slot)}`. */
  async save(slot: Slot, buf: ArrayBuffer, discSerial: string): Promise<void> {
    const id = compositeKey(discSerial, slot);
    await this._storage.put({
      id,
      buf: buf.slice(0),
      discSerial,
      slot,
      localTimestamp: Date.now(),
      synced: UNSYNCED,
      pocketbaseId: null,
      serverUpdated: null,
    });
  }

  /**
   * Load a save state by slot. Serves from local storage; on a local miss,
   * downloads from the cloud (when authed) and caches it for next time.
   * Returns null if the state does not exist locally or remotely.
   */
  async load(slot: Slot, discSerial: string): Promise<ArrayBuffer | null> {
    const id = compositeKey(discSerial, slot);
    const rec = await this._storage.get(id);
    if (rec) return rec.buf;

    if (!this._repo.isAuthenticated()) return null;
    const userId = this._repo.getCurrentUserId();
    if (!userId) return null;

    try {
      const type = slotToType(slot);
      const { buf, recordId, updated } = await this._repo.downloadSaveState(
        discSerial,
        type,
        userId,
      );
      await this._storage.put({
        id,
        buf,
        discSerial,
        slot,
        localTimestamp: Date.now(),
        synced: SYNCED,
        pocketbaseId: recordId,
        serverUpdated: updated,
      });
      return buf;
    } catch (e: unknown) {
      this._log(
        'warn',
        `SaveStateStore: cloud download failed for ${discSerial} slot ${slot}: ${formatErr(e)}`,
      );
    }
    return null;
  }

  /** True if a state exists locally or (when authed) remotely. */
  async hasState(slot: Slot, discSerial: string): Promise<boolean> {
    const id = compositeKey(discSerial, slot);
    const rec = await this._storage.get(id);
    if (rec) return true;

    if (!this._repo.isAuthenticated()) return false;
    const userId = this._repo.getCurrentUserId();
    if (!userId) return false;

    try {
      const type = slotToType(slot);
      return await this._repo.hasRemoteState(discSerial, type, userId);
    } catch (e: unknown) {
      this._log('warn', `SaveStateStore: hasRemoteState failed for ${discSerial}: ${formatErr(e)}`);
    }
    return false;
  }
}
