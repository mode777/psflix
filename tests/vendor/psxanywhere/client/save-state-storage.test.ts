// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { InMemorySaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import { UNSYNCED, SYNCED, SLOT_AUTO } from '@/vendor/psxanywhere/client/slotKey';
import type { SaveStateRecord } from '@/vendor/psxanywhere/client/saveStateStorage';

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

describe('InMemorySaveStateStorage', () => {
  it('round-trips a record through put/get', async () => {
    const s = new InMemorySaveStateStorage();
    await s.put(rec({ id: 'a', discSerial: 'X' }));
    const got = await s.get('a');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('a');
    expect(got!.discSerial).toBe('X');
  });

  it('returns null for a missing key', async () => {
    const s = new InMemorySaveStateStorage();
    expect(await s.get('nope')).toBeNull();
  });

  it('getAllUnsynced returns only UNSYNCED records', async () => {
    const s = new InMemorySaveStateStorage();
    await s.put(rec({ id: 'a', synced: UNSYNCED }));
    await s.put(rec({ id: 'b', synced: SYNCED }));
    const all = await s.getAllUnsynced();
    expect(all.map((r) => r.id)).toEqual(['a']);
  });

  it('returns an empty array when nothing is unsynced', async () => {
    const s = new InMemorySaveStateStorage();
    await s.put(rec({ id: 'a', synced: SYNCED }));
    expect(await s.getAllUnsynced()).toEqual([]);
  });

  it('round-trips meta values', async () => {
    const s = new InMemorySaveStateStorage();
    expect(await s.getMeta('k')).toBeNull();
    await s.putMeta('k', 'v1');
    expect(await s.getMeta('k')).toBe('v1');
    await s.putMeta('k', 'v2');
    expect(await s.getMeta('k')).toBe('v2');
  });

  it('get returns a defensive copy — mutating the result does not corrupt the store', async () => {
    const s = new InMemorySaveStateStorage();
    await s.put(rec({ id: 'a' }));
    const got = await s.get('a');
    new Uint8Array(got!.buf)[0] = 99;
    const got2 = await s.get('a');
    expect(new Uint8Array(got2!.buf)[0]).toBe(0);
  });

  it('put copies the input buffer — mutating the caller buffer does not corrupt the store', async () => {
    const s = new InMemorySaveStateStorage();
    const input = new Uint8Array([1, 2, 3, 4]);
    await s.put(rec({ id: 'a', buf: input.buffer }));
    input[0] = 99;
    const got = await s.get('a');
    expect(new Uint8Array(got!.buf)[0]).toBe(1);
  });

  it('getAllUnsynced returns defensive copies', async () => {
    const s = new InMemorySaveStateStorage();
    await s.put(rec({ id: 'a' }));
    const [first] = await s.getAllUnsynced();
    new Uint8Array(first.buf)[0] = 7;
    const [second] = await s.getAllUnsynced();
    expect(new Uint8Array(second.buf)[0]).toBe(0);
  });
});
