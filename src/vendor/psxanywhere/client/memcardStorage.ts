'use strict';

// Storage port for memory-card persistence. Decouples MemcardSync (and the
// app.ts memcard round-trip) from the IndexedDB-backed adapter so the sync
// logic can be unit-tested against an in-memory fake. Mirrors the
// SaveStateStorage / IdbSaveStateStorage / InMemorySaveStateStorage pattern.
// See docs/memcard.md.

import { openDbWithRecovery, idbGet, idbPut, idbDelete } from './idb';
import type { OpenDb } from './idb';

// ── Port ─────────────────────────────────────────────────────────────

export interface MemcardStorage {
  save(slot: number, buf: ArrayBuffer | Uint8Array): Promise<void>;
  load(slot: number): Promise<Uint8Array | null>;
  remove(slot: number): Promise<void>;
}

// ── IndexedDB schema ──────────────────────────────────────────────────

const DB_NAME = 'psx-memcards';
const DB_VERSION = 1;
const STORE = 'memcards';

const openMemcardDB = openDbWithRecovery(DB_NAME, DB_VERSION, (db) => {
  if (!db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: null });
  }
});

// ── IndexedDB adapter ────────────────────────────────────────────────

export class IdbMemcardStorage implements MemcardStorage {
  constructor(private readonly _open: OpenDb = openMemcardDB) {}

  async load(slot: number): Promise<Uint8Array | null> {
    const val = await idbGet<ArrayBuffer>(this._open, STORE, String(slot));
    if (val == null) return null;
    return new Uint8Array(val);
  }

  async save(slot: number, buf: ArrayBuffer | Uint8Array): Promise<void> {
    // Copy before put: callers may pass a transferable buffer that gets
    // detached, and IDB writeback is async.
    await idbPut(this._open, STORE, new Uint8Array(buf), String(slot));
  }

  async remove(slot: number): Promise<void> {
    await idbDelete(this._open, STORE, String(slot));
  }
}

// ── In-memory test double ────────────────────────────────────────────

export class InMemoryMemcardStorage implements MemcardStorage {
  private _cards = new Map<number, Uint8Array>();

  async save(slot: number, buf: ArrayBuffer | Uint8Array): Promise<void> {
    this._cards.set(slot, new Uint8Array(buf));
  }

  async load(slot: number): Promise<Uint8Array | null> {
    const c = this._cards.get(slot);
    return c ? new Uint8Array(c) : null;
  }

  async remove(slot: number): Promise<void> {
    this._cards.delete(slot);
  }
}
