// @vitest-environment node
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { IdbSaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import type { SaveStateRecord } from '@/vendor/psxanywhere/client/saveStateStorage';
import { UNSYNCED, SYNCED, SLOT_AUTO } from '@/vendor/psxanywhere/client/slotKey';
import { openDbWithRecovery } from '@/vendor/psxanywhere/client/idb';

let _counter = 0;
function uniqueDbName(): string {
  return `psx-saves-test-${++_counter}`;
}

function rec(overrides: Partial<SaveStateRecord> = {}): SaveStateRecord {
  return {
    id: 'SLUS001:auto',
    buf: new ArrayBuffer(4),
    discSerial: 'SLUS001',
    slot: SLOT_AUTO,
    localTimestamp: 1,
    synced: UNSYNCED,
    pocketbaseId: null,
    serverUpdated: null,
    ...overrides,
  };
}

function makeStorage(): IdbSaveStateStorage {
  const name = uniqueDbName();
  const open = openDbWithRecovery(name, 2, (db) => {
    if (!db.objectStoreNames.contains('save-states')) {
      const store = db.createObjectStore('save-states', { keyPath: 'id' });
      store.createIndex('by-synced', 'synced');
      store.createIndex('by-pocketbase-id', 'pocketbaseId');
    }
    if (!db.objectStoreNames.contains('sync-meta')) {
      db.createObjectStore('sync-meta', { keyPath: 'key' });
    }
  });
  return new IdbSaveStateStorage(open);
}

describe('IdbSaveStateStorage', () => {
  it('round-trips a record through put/get', async () => {
    const storage = makeStorage();
    const r = rec({ id: 'test1', discSerial: 'X' });
    await storage.put(r);
    const got = await storage.get('test1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('test1');
    expect(got!.discSerial).toBe('X');
  });

  it('returns null for a missing key', async () => {
    const storage = makeStorage();
    const got = await storage.get('nope');
    expect(got).toBeNull();
  });

  it('getAllUnsynced returns only UNSYNCED records', async () => {
    const storage = makeStorage();
    await storage.put(rec({ id: 'u1', synced: UNSYNCED }));
    await storage.put(rec({ id: 's1', synced: SYNCED }));
    const all = await storage.getAllUnsynced();
    expect(all.map((r) => r.id)).toEqual(['u1']);
  });

  it('round-trips meta values', async () => {
    const storage = makeStorage();
    expect(await storage.getMeta('k')).toBeNull();
    await storage.putMeta('k', 'v1');
    expect(await storage.getMeta('k')).toBe('v1');
    await storage.putMeta('k', 'v2');
    expect(await storage.getMeta('k')).toBe('v2');
  });

  it('get returns a defensive copy — mutating the result does not corrupt the store', async () => {
    const storage = makeStorage();
    await storage.put(rec({ id: 'dc1' }));
    const got = await storage.get('dc1');
    new Uint8Array(got!.buf)[0] = 99;
    const got2 = await storage.get('dc1');
    expect(new Uint8Array(got2!.buf)[0]).toBe(0);
  });

  it('constructor accepts an injectable _open function', async () => {
    const name = uniqueDbName();
    const open = openDbWithRecovery(name, 2, (db) => {
      if (!db.objectStoreNames.contains('save-states')) {
        const store = db.createObjectStore('save-states', { keyPath: 'id' });
        store.createIndex('by-synced', 'synced');
        store.createIndex('by-pocketbase-id', 'pocketbaseId');
      }
      if (!db.objectStoreNames.contains('sync-meta')) {
        db.createObjectStore('sync-meta', { keyPath: 'key' });
      }
    });
    const db = await open();
    const storage = new IdbSaveStateStorage(async () => db);
    await storage.put(rec({ id: 'inj1' }));
    const got = await storage.get('inj1');
    expect(got!.id).toBe('inj1');
    db.close();
  });
});
