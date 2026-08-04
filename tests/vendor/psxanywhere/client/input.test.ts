// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { BUTTON, CONTROLLER } from 'emulator-core';
import { ControllerWriter, createControllerConfig } from '@/vendor/psxanywhere/client/input';
import { RebindStore } from '@/vendor/psxanywhere/client/rebind-store';
import { DEFAULT_GAMEPAD_MAP } from '@/vendor/psxanywhere/client/input-constants';
import { createMockEmulator, type MockEmulator } from './helpers/emulator-mock';

// ── Fakes ────────────────────────────────────────────────────────────────

function keyEvent(key: string, shift = false): KeyboardEvent {
  return {
    key,
    shiftKey: shift,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as KeyboardEvent;
}

function mouseEvent(
  opts: {
    button?: number;
    movementX?: number;
    movementY?: number;
    clientX?: number;
    clientY?: number;
  } = {},
): MouseEvent {
  return {
    button: opts.button ?? 0,
    movementX: opts.movementX ?? 0,
    movementY: opts.movementY ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as MouseEvent;
}

function fakeGamepad(pressed: boolean[], axes: number[] = [], index = 0): Gamepad {
  return {
    index,
    id: 'fake',
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: pressed.map((p) => ({ pressed: p, value: p ? 1 : 0, touched: false })),
    axes,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function fakeRect(width = 320, height = 240): DOMRect {
  return {
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  } as unknown as DOMRect;
}

interface MakeOpts {
  device?: number;
  source?: string;
  gamepadIndex?: number;
  gamepadMap?: Record<number, number>;
  rect?: DOMRect | null;
  gamepads?: () => (Gamepad | null)[];
}

function makeWriter(emu: MockEmulator, opts: MakeOpts = {}): ControllerWriter {
  const rebindStore = RebindStore.forMemory();
  const cfg = createControllerConfig({
    port: 0,
    source: opts.source ?? 'keyboard',
    device: opts.device ?? CONTROLLER.STANDARD,
    gamepadIndex: opts.gamepadIndex,
    gamepadMap: opts.gamepadMap,
  });
  const rect = opts.rect === undefined ? null : opts.rect;
  return new ControllerWriter(
    emu as any,
    0,
    cfg,
    () => rect,
    rebindStore,
    opts.gamepads ?? (() => []),
  );
}

const bit = (b: number) => 1 << b;

function lastAnalog(emu: MockEmulator, stick: 'left' | 'right') {
  for (let i = emu.analogCalls.length - 1; i >= 0; i--) {
    if (emu.analogCalls[i].stick === stick) return emu.analogCalls[i];
  }
  return undefined;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ControllerWriter — keyboard joypad', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('press sets the button mask and fires a single rising edge', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('ArrowUp')); // bit UP(4)

    expect(emu.lastButtons).toBe(bit(BUTTON.UP));
    expect(emu.edgeCalls).toHaveLength(1);
    expect(emu.edgeCalls[0].bits).toBe(bit(BUTTON.UP));
  });

  it('does not re-fire the rising edge while held', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('ArrowUp'));
    const edgesAfterPress = emu.edgeCalls.length;
    w.publish(); // same mask, held frame
    expect(emu.edgeCalls.length).toBe(edgesAfterPress);
    expect(emu.lastButtons).toBe(bit(BUTTON.UP));
  });

  it('release clears the mask and produces no new edge', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('ArrowUp'));
    emu.clear();
    w.onKeyUp(keyEvent('ArrowUp'));

    expect(emu.lastButtons).toBe(0);
    expect(emu.edgeCalls).toHaveLength(0);
  });

  it('ignores keys that are not bound', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('F9')); // unmapped
    expect(emu.buttonsCalls).toHaveLength(0);
  });

  it('onBlur clears all pressed bits', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('ArrowUp'));
    w.onKeyDown(keyEvent('Enter')); // START(3)
    emu.clear();
    w.onBlur();
    w.publish();
    expect(emu.lastButtons).toBe(0);
  });

  it('combines multiple held keys into one mask', () => {
    const w = makeWriter(emu);
    w.onKeyDown(keyEvent('ArrowUp')); // 4
    w.onKeyDown(keyEvent('x')); // A(8)
    emu.clear();
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.UP) | bit(BUTTON.A));
  });
});

describe('ControllerWriter — device gating', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('a non-joypad device ignores plain keyboard input', () => {
    const w = makeWriter(emu, { device: CONTROLLER.MOUSE });
    w.onKeyDown(keyEvent('ArrowUp')); // no shift → not a mouse delta
    expect(emu.buttonsCalls).toHaveLength(0);
  });

  it('mouse accumulates delta via Shift+Arrow and flushes on publish', () => {
    const w = makeWriter(emu, { device: CONTROLLER.MOUSE });
    w.onKeyDown(keyEvent('ArrowUp', true)); // shift held → mouseDy -= 3
    w.onKeyDown(keyEvent('ArrowRight', true)); // mouseDx += 3
    w.publish();

    expect(emu.mouseDeltaCalls).toHaveLength(1);
    expect(emu.mouseDeltaCalls[0]).toEqual({ port: 0, dx: 3, dy: -3 });
    // delta is consumed each publish
    w.publish();
    expect(emu.mouseDeltaCalls[1]).toEqual({ port: 0, dx: 0, dy: 0 });
  });
});

describe('ControllerWriter — mouse buttons', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('left/right mouse buttons map to MOUSE_LEFT/RIGHT bits', () => {
    const w = makeWriter(emu, { device: CONTROLLER.MOUSE });
    w.onMouseDown(mouseEvent({ button: 0 }));
    w.onMouseDown(mouseEvent({ button: 2 }));
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.MOUSE_LEFT) | bit(BUTTON.MOUSE_RIGHT));

    w.onMouseUp(mouseEvent({ button: 0 }));
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.MOUSE_RIGHT));
  });

  it('accumulates movement deltas across events', () => {
    const w = makeWriter(emu, { device: CONTROLLER.MOUSE });
    w.onMouseMove(mouseEvent({ movementX: 5, movementY: 7 }));
    w.onMouseMove(mouseEvent({ movementX: 1, movementY: 2 }));
    w.publish();
    expect(emu.mouseDeltaCalls[0]).toEqual({ port: 0, dx: 6, dy: 9 });
  });

  it('ignores mouse events when the device is a joypad', () => {
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD });
    w.onMouseDown(mouseEvent({ button: 0 }));
    w.onMouseMove(mouseEvent({ movementX: 5, movementY: 5 }));
    w.publish();
    expect(emu.mouseDeltaCalls).toHaveLength(0);
  });
});

describe('ControllerWriter — lightgun', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('trigger/aux/offscreen map to the lightgun bits', () => {
    const w = makeWriter(emu, { device: CONTROLLER.GUNCON, rect: fakeRect() });
    w.onMouseDown(mouseEvent({ button: 0 })); // trigger
    w.onMouseDown(mouseEvent({ button: 2 })); // aux
    w.onMouseLeave(); // offscreen
    w.publish();

    expect(emu.lastButtons).toBe(
      bit(BUTTON.LIGHTGUN_TRIGGER) | bit(BUTTON.LIGHTGUN_AUX) | bit(BUTTON.LIGHTGUN_OFFSCREEN),
    );

    // re-entering clears the offscreen bit
    emu.clear();
    w.onMouseEnter();
    w.publish();
    expect(emu.lastButtons & bit(BUTTON.LIGHTGUN_OFFSCREEN)).toBe(0);
  });

  it('reports lightgun coordinates derived from the canvas rect', () => {
    const w = makeWriter(emu, { device: CONTROLLER.GUNCON, rect: fakeRect(320, 240) });
    w.onMouseMove(mouseEvent({ clientX: 160, clientY: 120 })); // midpoint
    w.publish();

    expect(emu.lightgunCalls).toHaveLength(1);
    const c = emu.lightgunCalls[0];
    expect(c.x).toBe(Math.round((160 / 320) * 511));
    expect(c.y).toBe(Math.round((120 / 240) * 255));
  });

  it('skips coordinates when no rect is available', () => {
    const w = makeWriter(emu, { device: CONTROLLER.GUNCON, rect: null });
    w.publish();
    expect(emu.lightgunCalls).toHaveLength(1);
    expect(emu.lightgunCalls[0]).toEqual({ port: 0, x: 0, y: 0 });
  });
});

describe('ControllerWriter — gamepad', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('scans all standard gamepads when no index is pinned', () => {
    const gp = fakeGamepad(
      [
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      // sub-threshold x (0.2 < STICK_TO_DPAD_THRESHOLD) so the left-stick→d-pad
      // emulation doesn't add bits here — keeps this test focused on button mapping.
      [0.2, 0, 0, 0],
    );
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.publish();

    // button 1 → A(8)
    expect(emu.lastButtons).toBe(bit(BUTTON.A));
    // left stick axes forwarded
    expect(emu.analogCalls.some((c) => c.stick === 'left' && c.x === 0.2)).toBe(true);
  });

  it('reads only the pinned gamepad index', () => {
    const gp0 = fakeGamepad([true, false], [], 0); // button 0 → B
    const gp1 = fakeGamepad([false, true], [], 1); // button 1 → A
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp0, gp1] });
    w.setGamepadIndex(0);
    w.publish();

    expect(emu.lastButtons).toBe(bit(BUTTON.B)); // gp0 only
    expect(emu.lastButtons & bit(BUTTON.A)).toBe(0); // gp1 ignored
  });

  it('ignores non-standard-mapped gamepads', () => {
    const gp = fakeGamepad([true], []);
    (gp as any).mapping = 'dinput';
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.publish();
    expect(emu.lastButtons).toBe(0);
  });

  it('resets analog sticks to zero when no input is active', () => {
    // joypad, empty mask, no pinned gamepad → centre the sticks
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [] });
    w.publish();
    expect(emu.analogCalls).toEqual([
      { port: 0, stick: 'left', x: 0, y: 0 },
      { port: 0, stick: 'right', x: 0, y: 0 },
    ]);
  });
});

describe('ControllerWriter — left-stick d-pad emulation (STANDARD only)', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('derives d-pad bits from a left-stick deflection', () => {
    const gp = fakeGamepad([], [0, -1, 0, 0]); // stick straight up
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.UP));
  });

  it('ORs stick-derived bits with real d-pad presses', () => {
    // physical gamepad button 12 is UP (DEFAULT_GAMEPAD_MAP) + stick pushed right
    const gp = fakeGamepad(
      [false, false, false, false, false, false, false, false, false, false, false, false, true],
      [1, 0, 0, 0],
    );
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.UP) | bit(BUTTON.RIGHT));
  });

  it('fires orEdgeBits on a fresh stick deflection', () => {
    const axes: number[] = [0, 0, 0, 0];
    const gp = fakeGamepad([], axes);
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.publish(); // stick at rest → no edge
    expect(emu.lastEdge).toBe(0);

    axes[0] = -1; // deflect left
    w.publish();
    expect(emu.lastEdge).toBe(bit(BUTTON.LEFT));

    // hold steady → no new rising edge
    w.publish();
    expect(emu.edgeCalls).toHaveLength(1);
  });

  it('does not derive d-pad bits on an ANALOG controller', () => {
    const gp = fakeGamepad([], [1, 1, 0, 0]);
    const w = makeWriter(emu, { device: CONTROLLER.ANALOG, gamepads: () => [gp] });
    w.publish();
    expect(emu.lastButtons & (bit(BUTTON.DOWN) | bit(BUTTON.RIGHT))).toBe(0);
    // analog values still pass through unchanged (and are not zeroed afterwards)
    const analogLeft = lastAnalog(emu, 'left');
    expect(analogLeft && analogLeft.x === 1 && analogLeft.y === 1).toBe(true);
  });

  it('does not derive d-pad bits on a DUALSHOCK controller', () => {
    // same deflection that would produce UP|RIGHT on STANDARD must stay clean
    const gp = fakeGamepad([], [1, -1, 0, 0]);
    const w = makeWriter(emu, { device: CONTROLLER.DUALSHOCK, gamepads: () => [gp] });
    w.publish();
    expect(emu.lastButtons).toBe(0);
    expect(
      emu.lastButtons & (bit(BUTTON.UP) | bit(BUTTON.DOWN) | bit(BUTTON.LEFT) | bit(BUTTON.RIGHT)),
    ).toBe(0);
    // left analog still passes through unchanged (and is not zeroed afterwards)
    const dualLeft = lastAnalog(emu, 'left');
    expect(dualLeft && dualLeft.x === 1 && dualLeft.y === -1).toBe(true);
  });

  it('clears the d-pad bits when the controller type is switched STANDARD → DUALSHOCK', () => {
    // Mirrors app.ts: device switch rebuilds the writer with a fresh config
    // (applyControllerRow → rebuildInputWriters), so the new writer's _device
    // is DUALSHOCK and the stick→d-pad emulation must turn off.
    const gp = fakeGamepad([], [1, 0, 0, 0]); // stick right, past threshold

    const stdWriter = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    stdWriter.publish();
    expect(emu.lastButtons & bit(BUTTON.RIGHT)).toBe(bit(BUTTON.RIGHT)); // emulation active

    // Recreate the writer as app.ts does on a DualShock selection.
    const dsWriter = makeWriter(emu, { device: CONTROLLER.DUALSHOCK, gamepads: () => [gp] });
    emu.clear();
    dsWriter.publish();
    expect(emu.lastButtons & bit(BUTTON.RIGHT)).toBe(0); // emulation off
    const switchedLeft = lastAnalog(emu, 'left');
    expect(switchedLeft && switchedLeft.x === 1).toBe(true);
  });

  it('keeps DualShock analog alive in Auto mode with no buttons pressed (re-apply regression)', () => {
    // Reproduces the reported bug: re-applying a DualShock config sends
    // gamepadIndex:-1 (Auto). With a connected gamepad's stick deflected and
    // no buttons held, the analog value must NOT be overwritten with zero.
    const gp = fakeGamepad([], [0.5, 0.25, 0, 0]);
    const w = makeWriter(emu, {
      device: CONTROLLER.DUALSHOCK,
      source: 'gamepad',
      gamepadIndex: -1,
      gamepads: () => [gp],
    });
    w.publish();
    expect(emu.lastButtons).toBe(0); // no buttons
    const left = lastAnalog(emu, 'left');
    expect(left && left.x === 0.5 && left.y === 0.25).toBe(true); // not zeroed
    const right = lastAnalog(emu, 'right');
    expect(right && right.x === 0 && right.y === 0).toBe(true);
  });

  it('still zeroes analog when no gamepad is connected (keyboard joypad)', () => {
    const w = makeWriter(emu, { device: CONTROLLER.DUALSHOCK, gamepads: () => [] });
    w.publish();
    expect(emu.analogCalls).toEqual([
      { port: 0, stick: 'left', x: 0, y: 0 },
      { port: 0, stick: 'right', x: 0, y: 0 },
    ]);
  });
});

describe('ControllerWriter — rebinds', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('applyKeyRebind reassigns a bit to a new key and drops the old key', () => {
    const w = makeWriter(emu);
    w.applyKeyRebind(BUTTON.UP, 'u'); // UP was ArrowUp
    w.onKeyDown(keyEvent('u'));
    expect(emu.lastButtons).toBe(bit(BUTTON.UP));

    emu.clear();
    w.onKeyDown(keyEvent('ArrowUp')); // no longer bound
    expect(emu.buttonsCalls).toHaveLength(0);
  });

  it('applyGamepadRebind reassigns a bit to a new button index', () => {
    const gp = fakeGamepad([false, false, true], [0, 0, 0, 0]); // button 2
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.applyGamepadRebind(BUTTON.A, 2); // A(8) now on button 2 (was button 1)
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.A));
  });

  it('setKeyMap(null) falls back to the rebind store defaults', () => {
    const w = makeWriter(emu);
    w.applyKeyRebind(BUTTON.UP, 'u');
    w.setKeyMap(null as any); // → DEFAULT_KEY_MAP
    w.onKeyDown(keyEvent('ArrowUp'));
    expect(emu.lastButtons).toBe(bit(BUTTON.UP));
  });

  it('setGamepadMap(null) falls back to the rebind store defaults', () => {
    const gp = fakeGamepad([false, true], [0, 0, 0, 0]); // button 1
    const w = makeWriter(emu, { device: CONTROLLER.STANDARD, gamepads: () => [gp] });
    w.setGamepadMap({ 0: BUTTON.A }); // only A on button 0
    w.publish();
    expect(emu.lastButtons).toBe(0); // button 1 no longer bound
    w.setGamepadMap(null as any); // → DEFAULT_GAMEPAD_MAP
    emu.clear();
    w.publish();
    expect(emu.lastButtons).toBe(bit(BUTTON.A));
  });
});

describe('ControllerWriter — constructor map merge', () => {
  it('merges persisted gamepad rebinds with explicit overrides', () => {
    const emu = createMockEmulator();
    const rebindStore = RebindStore.forMemory();
    rebindStore.setGamepadRebind(0, BUTTON.UP, 12); // persisted: UP(4) → button 12

    const cfg = createControllerConfig({
      port: 0,
      source: 'gamepad',
      device: CONTROLLER.STANDARD,
      gamepadIndex: 0,
      gamepadMap: { 3: BUTTON.A }, // explicit: A(8) → button 3
    });
    const w = new ControllerWriter(
      emu as any,
      0,
      cfg,
      () => null,
      rebindStore,
      () => [],
    );

    expect(w.gamepadMap[12]).toBe(BUTTON.UP); // persisted survived
    expect(w.gamepadMap[3]).toBe(BUTTON.A); // explicit applied
    // default still present where not overridden
    expect(w.gamepadMap[0]).toBe(DEFAULT_GAMEPAD_MAP[0]);
  });

  it('uses the rebind-store key map when the config provides none', () => {
    const emu = createMockEmulator();
    const rebindStore = RebindStore.forMemory();
    rebindStore.setKeyRebind(0, BUTTON.UP, 'u');
    // source 'gamepad' → keyMap is {} → writer falls back to the store
    const cfg = createControllerConfig({
      port: 0,
      source: 'gamepad',
      device: CONTROLLER.STANDARD,
      gamepadIndex: 0,
    });
    const w = new ControllerWriter(
      emu as any,
      0,
      cfg,
      () => null,
      rebindStore,
      () => [],
    );

    expect(w.keyMap.u).toBe(BUTTON.UP);
  });
});
