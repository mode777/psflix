// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  axisToInt16,
  clamp,
  lightgunCoords,
  primeButtonState,
  sampleGamepadRisingEdge,
  setBits,
  stickToDpadBits,
  anyPortHasMouse,
  DEFAULT_DEADZONE,
  DEFAULT_ANALOG_MAX,
  LIGHTGUN_MAX_X,
  LIGHTGUN_MAX_Y,
  STICK_TO_DPAD_THRESHOLD,
} from '@/vendor/psxanywhere/client/input-pure';
import { BUTTON } from 'emulator-core';

describe('clamp', () => {
  it('clamps within [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('axisToInt16', () => {
  it('snapshots central deadzone to zero', () => {
    expect(axisToInt16(0)).toBe(0);
    expect(axisToInt16(0.05)).toBe(0); // below deadzone
    expect(axisToInt16(DEFAULT_DEADZONE - 0.001)).toBe(0);
  });

  it('scales full deflection to analogMax', () => {
    expect(axisToInt16(1)).toBe(DEFAULT_ANALOG_MAX); // 0x7fff
    expect(axisToInt16(-1)).toBe((-DEFAULT_ANALOG_MAX & 0xffff) >>> 0); // 0x8001
  });

  it('clamps out-of-range inputs', () => {
    expect(axisToInt16(5)).toBe(DEFAULT_ANALOG_MAX);
    expect(axisToInt16(-5)).toBe((-DEFAULT_ANALOG_MAX & 0xffff) >>> 0);
  });

  it('respects a custom deadzone and analogMax', () => {
    expect(axisToInt16(0.2, 0.5)).toBe(0); // below custom deadzone
    expect(axisToInt16(1, 0, 100)).toBe(100);
  });
});

describe('lightgunCoords', () => {
  it('returns origin for a zero-size rect', () => {
    expect(lightgunCoords(100, 100, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(lightgunCoords(100, 100, 320, 0)).toEqual({ x: 0, y: 0 });
  });

  it('maps proportionally and clamps to the screen bounds', () => {
    // canvas midpoint → half of max bounds
    const mid = lightgunCoords(160, 120, 320, 240);
    expect(mid.x).toBe(Math.round((160 / 320) * LIGHTGUN_MAX_X));
    expect(mid.y).toBe(Math.round((120 / 240) * LIGHTGUN_MAX_Y));

    // negative pointer → clamped to 0
    expect(lightgunCoords(-10, -10, 320, 240)).toEqual({ x: 0, y: 0 });

    // past the far edge → clamped to max
    expect(lightgunCoords(9999, 9999, 320, 240)).toEqual({ x: LIGHTGUN_MAX_X, y: LIGHTGUN_MAX_Y });
  });
});

describe('primeButtonState', () => {
  it('snapshots pressed flags, treating holes as unpressed', () => {
    const btn = [{ pressed: true }, { pressed: false }, null as any, { pressed: true }];
    expect(primeButtonState(btn)).toEqual([true, false, false, true]);
  });
});

describe('sampleGamepadRisingEdge', () => {
  it('returns the first up→down transition', () => {
    const prev = [false, false];
    const r = sampleGamepadRisingEdge(prev, [{ pressed: false }, { pressed: true }]);
    expect(r).toBe(1);
    expect(prev).toEqual([false, true]);
  });

  it('returns -1 when nothing newly pressed', () => {
    const prev = [true];
    expect(sampleGamepadRisingEdge(prev, [{ pressed: true }])).toBe(-1);
  });

  it('stops syncing prev at the first rising edge', () => {
    // Documented behaviour: prev is mutated up to and including the rising index.
    const prev = [false, false, false];
    const r = sampleGamepadRisingEdge(prev, [
      { pressed: true },
      { pressed: true },
      { pressed: true },
    ]);
    expect(r).toBe(0);
    expect(prev[0]).toBe(true);
    // indices after the break are left stale
    expect(prev[1]).toBe(false);
    expect(prev[2]).toBe(false);
  });

  it('truncates prev to the new button count', () => {
    const prev = [false, false, false];
    sampleGamepadRisingEdge(prev, [{ pressed: false }]);
    expect(prev).toHaveLength(1);
  });
});

describe('setBits', () => {
  it('ORs each bit into the mask', () => {
    expect(setBits(0, [0, 8, 4])).toBe((1 << 0) | (1 << 8) | (1 << 4));
    expect(setBits(0b0001, [3])).toBe(0b1001);
  });

  it('is a no-op for an empty iterable', () => {
    expect(setBits(5, [])).toBe(5);
  });
});

describe('stickToDpadBits', () => {
  const UP = 1 << BUTTON.UP;
  const DOWN = 1 << BUTTON.DOWN;
  const LEFT = 1 << BUTTON.LEFT;
  const RIGHT = 1 << BUTTON.RIGHT;

  it('returns 0 when both axes are within the threshold', () => {
    expect(stickToDpadBits(0, 0)).toBe(0);
    expect(stickToDpadBits(0.2, 0.29)).toBe(0);
    expect(stickToDpadBits(-STICK_TO_DPAD_THRESHOLD, STICK_TO_DPAD_THRESHOLD)).toBe(0);
  });

  it('fires UP for a negative y deflection', () => {
    expect(stickToDpadBits(0, -1)).toBe(UP);
    expect(stickToDpadBits(0, -(STICK_TO_DPAD_THRESHOLD + 0.001))).toBe(UP);
  });

  it('fires DOWN for a positive y deflection', () => {
    expect(stickToDpadBits(0, 1)).toBe(DOWN);
  });

  it('fires LEFT for a negative x deflection', () => {
    expect(stickToDpadBits(-1, 0)).toBe(LEFT);
  });

  it('fires RIGHT for a positive x deflection', () => {
    expect(stickToDpadBits(1, 0)).toBe(RIGHT);
  });

  it('sets both cardinal bits for a diagonal deflection', () => {
    expect(stickToDpadBits(1, 1)).toBe(DOWN | RIGHT);
    expect(stickToDpadBits(-1, -1)).toBe(UP | LEFT);
  });

  it('respects a custom threshold', () => {
    expect(stickToDpadBits(0.4, 0, 0.5)).toBe(0);
    expect(stickToDpadBits(0.6, 0, 0.5)).toBe(RIGHT);
  });

  it('clamps out-of-range axis values without wrapping', () => {
    expect(stickToDpadBits(5, -5)).toBe(UP | RIGHT);
    expect(stickToDpadBits(-5, 5)).toBe(DOWN | LEFT);
  });
});

describe('anyPortHasMouse', () => {
  const MOUSE = 0x102;

  it('returns false for an empty config array', () => {
    expect(anyPortHasMouse([])).toBe(false);
  });

  it('returns false when all ports are null', () => {
    expect(anyPortHasMouse([null, null, null])).toBe(false);
  });

  it('returns false when no port has a mouse', () => {
    expect(anyPortHasMouse([{ device: 0x001 }, { device: 0x205 }])).toBe(false);
  });

  it('returns true when any port has a mouse', () => {
    expect(anyPortHasMouse([{ device: 0x001 }, { device: MOUSE }])).toBe(true);
  });

  it('returns true when the first port has a mouse', () => {
    expect(anyPortHasMouse([{ device: MOUSE }, null])).toBe(true);
  });

  it('skips null entries without throwing', () => {
    expect(anyPortHasMouse([null, { device: MOUSE }, null])).toBe(true);
    expect(anyPortHasMouse([null, { device: 0x001 }, null])).toBe(false);
  });
});
