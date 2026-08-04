// @vitest-environment node
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { IdbMemcardStorage } from '@/vendor/psxanywhere/client/memcardStorage';
import { openDbWithRecovery } from '@/vendor/psxanywhere/client/idb';

let _counter = 0;
function uniqueDbName(): string {
  return `psx-memcards-test-${++_counter}`;
}

function makeStorage(): IdbMemcardStorage {
  const name = uniqueDbName();
  const open = openDbWithRecovery(name, 1, (db) => {
    if (!db.objectStoreNames.contains('memcards')) {
      db.createObjectStore('memcards', { keyPath: null });
    }
  });
  return new IdbMemcardStorage(open);
}

function card(byteLength: number, fill: number): Uint8Array {
  const buf = new Uint8Array(byteLength);
  buf.fill(fill);
  return buf;
}

describe('IdbMemcardStorage', () => {
  it('round-trips a card through save/load', async () => {
    const storage = makeStorage();
    const c = card(16, 0xab);
    await storage.save(1, c);
    const got = await storage.load(1);
    expect(got).not.toBeNull();
    expect(got!.byteLength).toBe(16);
    expect(got![0]).toBe(0xab);
  });

  it('returns null for a missing slot', async () => {
    const storage = makeStorage();
    const got = await storage.load(1);
    expect(got).toBeNull();
  });

  it('keeps slots isolated (writing slot 1 does not touch slot 2)', async () => {
    const storage = makeStorage();
    await storage.save(1, card(8, 0x11));
    await storage.save(2, card(8, 0x22));
    const g1 = await storage.load(1);
    const g2 = await storage.load(2);
    expect(g1![0]).toBe(0x11);
    expect(g2![0]).toBe(0x22);
  });

  it('overwrites a slot on re-save', async () => {
    const storage = makeStorage();
    await storage.save(1, card(8, 0x01));
    await storage.save(1, card(8, 0x02));
    const got = await storage.load(1);
    expect(got![0]).toBe(0x02);
  });

  it('deletes a card via remove', async () => {
    const storage = makeStorage();
    await storage.save(1, card(8, 0xff));
    expect(await storage.load(1)).not.toBeNull();
    await storage.remove(1);
    expect(await storage.load(1)).toBeNull();
  });

  it('remove is idempotent on an empty slot', async () => {
    const storage = makeStorage();
    await expect(storage.remove(1)).resolves.toBeUndefined();
  });

  it('save copies the buffer — mutating the caller copy does not corrupt the store', async () => {
    const storage = makeStorage();
    const c = card(8, 0x00);
    await storage.save(1, c);
    c[0] = 0xee;
    const got = await storage.load(1);
    expect(got![0]).toBe(0x00);
  });

  it('load returns an independent copy — mutating the result does not corrupt the store', async () => {
    const storage = makeStorage();
    await storage.save(1, card(8, 0x00));
    const got = await storage.load(1);
    got![0] = 0xee;
    const got2 = await storage.load(1);
    expect(got2![0]).toBe(0x00);
  });

  it('accepts both ArrayBuffer and Uint8Array payloads', async () => {
    const storage = makeStorage();
    const ab = new ArrayBuffer(4);
    new Uint8Array(ab).fill(0x05);
    await storage.save(1, ab);
    const got = await storage.load(1);
    expect(got!.byteLength).toBe(4);
    expect(got![0]).toBe(0x05);
  });

  it('constructor accepts an injectable open function', async () => {
    const name = uniqueDbName();
    const open = openDbWithRecovery(name, 1, (db) => {
      if (!db.objectStoreNames.contains('memcards')) {
        db.createObjectStore('memcards', { keyPath: null });
      }
    });
    const db = await open();
    const storage = new IdbMemcardStorage(async () => db);
    await storage.save(1, card(8, 0x77));
    const got = await storage.load(1);
    expect(got![0]).toBe(0x77);
    db.close();
  });
});
