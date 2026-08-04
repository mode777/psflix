// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { RebindStore, MemoryRebindStorage } from '@/vendor/psxanywhere/client/rebind-store';
import { DEFAULT_KEY_MAP, DEFAULT_GAMEPAD_MAP } from '@/vendor/psxanywhere/client/input-constants';

describe('MemoryRebindStorage', () => {
  it('returns a fresh empty record for an unknown port', () => {
    const s = new MemoryRebindStorage();
    const r = s.load(0);
    expect(r).toEqual({});
    expect(s.load(0)).not.toBe(r); // distinct empty objects per call
  });

  it('round-trips a record by reference', () => {
    const s = new MemoryRebindStorage();
    const rec = { '8': 'p' };
    s.save(0, rec);
    expect(s.load(0)).toBe(rec);
  });

  it('keeps ports independent', () => {
    const s = new MemoryRebindStorage();
    s.save(0, { '8': 'p' });
    s.save(1, { '8': 'q' });
    expect(s.load(0)['8']).toBe('p');
    expect(s.load(1)['8']).toBe('q');
  });
});

describe('RebindStore.forMemory() key map', () => {
  it('returns a copy of the defaults when nothing is persisted', () => {
    const store = RebindStore.forMemory();
    const km = store.buildKeyMap(0);
    expect(km.x).toBe(DEFAULT_KEY_MAP.x);
    expect(km).not.toBe(DEFAULT_KEY_MAP); // a copy, not the frozen default
  });

  it('rebuilds the map from persisted overrides, evicting the old key', () => {
    // Bit 8 (A) defaults to x / X / Escape. Rebinding it to 'p' must remove all
    // of those and leave 'p' as the sole binding for bit 8.
    const store = RebindStore.forMemory();
    store.setKeyRebind(0, 8, 'p');
    const km = store.buildKeyMap(0);
    expect(km.p).toBe(8);
    expect('x' in km).toBe(false);
    expect('X' in km).toBe(false);
    expect('Escape' in km).toBe(false);
    // an unrelated binding is preserved
    expect(km.Enter).toBe(DEFAULT_KEY_MAP.Enter);
  });

  it('dedups: rebinding a bit twice keeps only the latest key', () => {
    const store = RebindStore.forMemory();
    store.setKeyRebind(0, 8, 'p');
    store.setKeyRebind(0, 8, 'k');
    const km = store.buildKeyMap(0);
    expect(km.k).toBe(8);
    expect('p' in km).toBe(false);
  });
});

describe('RebindStore.forMemory() gamepad map', () => {
  it('returns a copy of the defaults when nothing is persisted', () => {
    const store = RebindStore.forMemory();
    const gm = store.buildGamepadMap(0);
    expect(gm[0]).toBe(DEFAULT_GAMEPAD_MAP[0]);
    expect(gm).not.toBe(DEFAULT_GAMEPAD_MAP);
  });

  it('rebuilds from overrides, evicting the old button index for that bit', () => {
    // Bit 8 (A) defaults to gamepad button 1. Rebinding bit 8 → button 3 evicts
    // button 1 and reassigns button 3 (which defaulted to X/9).
    const store = RebindStore.forMemory();
    store.setGamepadRebind(0, 8, 3);
    const gm = store.buildGamepadMap(0);
    expect(gm[3]).toBe(8);
    expect(1 in gm).toBe(false);
    // unrelated bindings preserved
    expect(gm[12]).toBe(DEFAULT_GAMEPAD_MAP[12]);
  });

  it('dedups: rebinding a bit twice keeps only the latest button index', () => {
    const store = RebindStore.forMemory();
    store.setGamepadRebind(0, 8, 3);
    store.setGamepadRebind(0, 8, 5);
    const gm = store.buildGamepadMap(0);
    expect(gm[5]).toBe(8);
    // the first override (button 3) was overwritten, so button 3 falls back to
    // its default (X/9); only the default A binding (button 1) is evicted.
    expect(gm[3]).toBe(DEFAULT_GAMEPAD_MAP[3]);
    expect(1 in gm).toBe(false);
  });
});

describe('RebindStore.forMemory() cross-port isolation', () => {
  it('persists key and gamepad rebinds per port', () => {
    const store = RebindStore.forMemory();
    store.setKeyRebind(0, 8, 'p');
    store.setKeyRebind(1, 8, 'k');
    store.setGamepadRebind(0, 8, 3);

    expect(store.buildKeyMap(0).p).toBe(8);
    expect(store.buildKeyMap(1).k).toBe(8);
    expect(store.buildGamepadMap(0)[3]).toBe(8);
    expect(store.buildGamepadMap(1)[1]).toBe(DEFAULT_GAMEPAD_MAP[1]); // port 1 untouched
  });
});
