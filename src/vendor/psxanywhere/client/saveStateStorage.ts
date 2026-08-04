'use strict';

// Storage port for save-state persistence. Decouples StateStore / SyncEngine
// from the IndexedDB module so the sync logic can be unit-tested against an
// in-memory fake. See docs/save-state.md.

import { openDbWithRecovery, reqAsPromise, idbGet, idbPut } from './idb';
import type { OpenDb } from './idb';
import type { SyncState } from './slotKey';
import { UNSYNCED, SLOT_AUTO } from './slotKey';

// Format an unknown caught value as a message string (Error.message when
// available, otherwise String(e)). Replaces the repeated
// `e && e.message ? e.message : e` idiom across the stores.
// Canonical home is `./local-json`; re-exported here for back-compat with
// existing imports from this module.
export { formatErr } from './local-json';

// A save-state slot is either a numbered manual slot (0..N) or the 'auto'
// sentinel used by the background auto-save path.
export type Slot = number | typeof SLOT_AUTO;

// Shape persisted in the `save-states` IDB object store. The composite `id`
// (`${discSerial}:${type}`) is the keyPath; `synced` is indexed for the
// unsynced-pending scan; `pocketbaseId` is indexed for cloud lookups.
export interface SaveStateRecord {
  id: string;
  buf: ArrayBuffer;
  discSerial: string;
  slot: Slot;
  localTimestamp: number;
  synced: SyncState;
  pocketbaseId: string | null;
  serverUpdated: string | null;
}

// ── IndexedDB schema ──────────────────────────────────────────────────

const DB_NAME = 'psx-saves';
const DB_VERSION = 2;
const SAVE_STATES_STORE = 'save-states';
const META_STORE = 'sync-meta';

const openStateDB = openDbWithRecovery(DB_NAME, DB_VERSION, (db) => {
  if (!db.objectStoreNames.contains(SAVE_STATES_STORE)) {
    const store = db.createObjectStore(SAVE_STATES_STORE, { keyPath: 'id' });
    store.createIndex('by-synced', 'synced');
    store.createIndex('by-pocketbase-id', 'pocketbaseId');
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE, { keyPath: 'key' });
  }
});

// ── Read/write surface ────────────────────────────────────────────────

export interface SaveStateStorage {
  get(id: string): Promise<SaveStateRecord | null>;
  put(rec: SaveStateRecord): Promise<void>;
  getAllUnsynced(): Promise<SaveStateRecord[]>;
  getMeta(key: string): Promise<string | null>;
  putMeta(key: string, value: string): Promise<void>;
}

// ── IndexedDB adapter ────────────────────────────────────────────────

export class IdbSaveStateStorage implements SaveStateStorage {
  constructor(private readonly _open: OpenDb = openStateDB) {}

  async get(id: string): Promise<SaveStateRecord | null> {
    const val = await idbGet<SaveStateRecord>(this._open, SAVE_STATES_STORE, id);
    return (val ?? null) as SaveStateRecord | null;
  }

  async put(rec: SaveStateRecord): Promise<void> {
    await idbPut(this._open, SAVE_STATES_STORE, rec);
  }

  async getAllUnsynced(): Promise<SaveStateRecord[]> {
    const db = await this._open();
    const tx = db.transaction(SAVE_STATES_STORE, 'readonly');
    return reqAsPromise<SaveStateRecord[]>(
      tx.objectStore(SAVE_STATES_STORE).index('by-synced').getAll(IDBKeyRange.only(UNSYNCED)),
    );
  }

  async getMeta(key: string): Promise<string | null> {
    const rec = await idbGet<{ key: string; value: string }>(this._open, META_STORE, key);
    return rec ? rec.value : null;
  }

  async putMeta(key: string, value: string): Promise<void> {
    await idbPut(this._open, META_STORE, { key, value });
  }
}

// ── In-memory test double ────────────────────────────────────────────

export class InMemorySaveStateStorage implements SaveStateStorage {
  private _records = new Map<string, SaveStateRecord>();
  private _meta = new Map<string, string>();

  async get(id: string): Promise<SaveStateRecord | null> {
    const r = this._records.get(id);
    // Return a defensive copy so callers can mutate without corrupting state.
    return r ? { ...r, buf: r.buf.slice(0) } : null;
  }

  async put(rec: SaveStateRecord): Promise<void> {
    this._records.set(rec.id, { ...rec, buf: rec.buf.slice(0) });
  }

  async getAllUnsynced(): Promise<SaveStateRecord[]> {
    const out: SaveStateRecord[] = [];
    for (const r of this._records.values()) {
      if (r.synced === UNSYNCED) out.push({ ...r, buf: r.buf.slice(0) });
    }
    return out;
  }

  async getMeta(key: string): Promise<string | null> {
    return this._meta.has(key) ? this._meta.get(key)! : null;
  }

  async putMeta(key: string, value: string): Promise<void> {
    this._meta.set(key, value);
  }
}
