// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  SLOT_AUTO,
  UNSYNCED,
  SYNCED,
  slotToType,
  typeToSlot,
  compositeKey,
} from '@/vendor/psxanywhere/client/slotKey';

describe('slotToType', () => {
  it('returns "auto" for SLOT_AUTO', () => {
    expect(slotToType(SLOT_AUTO)).toBe('auto');
  });

  it('returns "slot1" for 0', () => {
    expect(slotToType(0)).toBe('slot1');
  });

  it('returns "slotN" as a direct numeric mapping', () => {
    // slotToType(N) = `slot${N}` for N > 0
    expect(slotToType(1)).toBe('slot1');
    expect(slotToType(2)).toBe('slot2');
    expect(slotToType(5)).toBe('slot5');
  });
});

describe('typeToSlot', () => {
  it('returns SLOT_AUTO for "auto"', () => {
    expect(typeToSlot('auto')).toBe(SLOT_AUTO);
  });

  it('returns 0 for "slot1"', () => {
    expect(typeToSlot('slot1')).toBe(0);
  });

  it('parses other slot strings', () => {
    expect(typeToSlot('slot2')).toBe(2);
    expect(typeToSlot('slot6')).toBe(6);
  });

  it('throws RangeError for unparseable input', () => {
    expect(() => typeToSlot('garbage')).toThrow(RangeError);
    expect(() => typeToSlot('garbage')).toThrow('Invalid slot type');
  });
});

describe('slotToType / typeToSlot round-trip', () => {
  it('round-trips slot 0', () => {
    expect(typeToSlot(slotToType(0))).toBe(0);
  });

  it('round-trips slot 2', () => {
    expect(typeToSlot(slotToType(2))).toBe(2);
  });

  it('round-trips slot 7', () => {
    expect(typeToSlot(slotToType(7))).toBe(7);
  });

  it('round-trips SLOT_AUTO', () => {
    expect(typeToSlot(slotToType(SLOT_AUTO))).toBe(SLOT_AUTO);
  });

  it('slot 0 and slot 1 both map to "slot1" (canonical)', () => {
    // 0-indexed: slot 0 → 'slot1', slot 1 → 'slot1' (also)
    // typeToSlot('slot1') → 0 (canonical)
    expect(slotToType(0)).toBe('slot1');
    expect(slotToType(1)).toBe('slot1');
    expect(typeToSlot('slot1')).toBe(0);
  });
});

describe('compositeKey', () => {
  it('produces "serial:auto" for SLOT_AUTO', () => {
    expect(compositeKey('SLUS001', SLOT_AUTO)).toBe('SLUS001:auto');
  });

  it('produces "serial:slot1" for slot 0', () => {
    expect(compositeKey('SLUS001', 0)).toBe('SLUS001:slot1');
  });

  it('produces "serial:slotN" for other slots', () => {
    expect(compositeKey('SLUS001', 3)).toBe('SLUS001:slot3');
  });
});

describe('UNSYNCED / SYNCED constants', () => {
  it('are distinct', () => {
    expect(UNSYNCED).not.toBe(SYNCED);
  });

  it('have expected values', () => {
    expect(UNSYNCED).toBe(0);
    expect(SYNCED).toBe(1);
  });
});
