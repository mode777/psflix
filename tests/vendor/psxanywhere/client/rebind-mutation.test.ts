// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyGamepadRebind,
  applyKeyRebind,
  removeByValue,
} from '@/vendor/psxanywhere/client/rebind-mutation';

describe('removeByValue', () => {
  it('deletes every key whose value equals the target', () => {
    const m: Record<string, number> = { a: 1, b: 2, c: 1 };
    removeByValue(m, 1);
    expect(m).toEqual({ b: 2 });
  });

  it('leaves the map untouched when no value matches', () => {
    const m: Record<string, number> = { a: 1 };
    removeByValue(m, 99);
    expect(m).toEqual({ a: 1 });
  });
});

describe('applyKeyRebind', () => {
  it('sets a new binding and removes the old key that pointed at the same bit', () => {
    const base: Record<string, number> = { x: 8, Enter: 3 };
    const out = applyKeyRebind(base, 8, 'q');
    expect(out.q).toBe(8);
    expect('x' in out).toBe(false); // old key for bit 8 evicted
    expect(out.Enter).toBe(3); // untouched binding preserved
  });

  it('does not mutate the input map', () => {
    const base: Record<string, number> = { x: 8 };
    applyKeyRebind(base, 8, 'q');
    expect(base).toEqual({ x: 8 });
  });
});

describe('applyGamepadRebind', () => {
  it('sets a new button index and evicts the old index for that bit', () => {
    const base: Record<number, number> = { 0: 8, 12: 4 };
    const out = applyGamepadRebind(base, 8, 3);
    expect(out[3]).toBe(8);
    expect(0 in out).toBe(false); // old button index 0 evicted
    expect(out[12]).toBe(4);
  });

  it('does not mutate the input map', () => {
    const base: Record<number, number> = { 0: 8 };
    applyGamepadRebind(base, 8, 3);
    expect(base).toEqual({ 0: 8 });
  });
});
