// Default environment: jsdom (set in vite.config.ts test block).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BUTTON, CONTROLLER } from 'emulator-core';
import {
  InputController,
  createControllerConfig,
  type InputControllerOptions,
} from '@/vendor/psxanywhere/client/input';
import { RebindStore } from '@/vendor/psxanywhere/client/rebind-store';
import { createMockEmulator, type MockEmulator } from './helpers/emulator-mock';

const bit = (b: number) => 1 << b;

function makeController(emu: MockEmulator, opts: InputControllerOptions = {}): InputController {
  return new InputController(emu as any, {
    rebindStore: RebindStore.forMemory(),
    getGamepads: () => [],
    ...opts,
  });
}

function attachKeyboard(ctrl: InputController, port = 0): void {
  ctrl.attachController(
    port,
    createControllerConfig({
      port,
      source: 'keyboard',
      device: CONTROLLER.STANDARD,
    }),
  );
}

function keyDownOn(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );
}

// ── Registry ─────────────────────────────────────────────────────────────

describe('InputController — registry', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('attachController returns a writer and exposes its key map via findKeyForBit', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    expect(ctrl.findKeyForBit(0, BUTTON.UP)).toBe('ArrowUp');
  });

  it('detachController falls back to the store map', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    expect(ctrl.findKeyForBit(0, BUTTON.UP)).toBe('ArrowUp');
    ctrl.detachController(0);
    expect(ctrl.findKeyForBit(0, BUTTON.UP)).toBe('ArrowUp'); // defaults still resolvable
  });

  it('clearControllers removes every writer', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    attachKeyboard(ctrl, 1);
    ctrl.clearControllers();
    // no writer → unknown bit resolves to the placeholder
    expect(ctrl.findKeyForBit(0, 999)).toBe('?');
  });
});

// ── Rebind persistence + onRebind ────────────────────────────────────────

describe('InputController — setRebind / setGamepadRebind', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('applies a key rebind to the live writer, persists it, and fires onRebind', () => {
    const onRebind = vi.fn();
    const ctrl = makeController(emu, { onRebind });
    attachKeyboard(ctrl, 0);

    expect(ctrl.setRebind(BUTTON.UP, 'u', 0)).toBe(true);
    // writer map updated
    expect(ctrl.findKeyForBit(0, BUTTON.UP)).toBe('u');
    // onRebind observed
    expect(onRebind).toHaveBeenCalledWith(BUTTON.UP, 'u', 0);
  });

  it('rejects invalid key rebind arguments', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    expect(ctrl.setRebind(-1, 'u')).toBe(false);
    expect(ctrl.setRebind(BUTTON.UP, '')).toBe(false);
  });

  it('applies a gamepad rebind and reports it via onRebind', () => {
    const onRebind = vi.fn();
    const ctrl = makeController(emu, { onRebind });
    attachKeyboard(ctrl, 0);

    expect(ctrl.setGamepadRebind(BUTTON.A, 3, 0)).toBe(true);
    expect(ctrl.findGamepadBtnForBit(0, BUTTON.A)).toBe(3);
    expect(onRebind).toHaveBeenCalledWith(
      BUTTON.A,
      expect.objectContaining({ type: 'gamepad', buttonIndex: 3 }),
      0,
    );
  });
});

// ── Find lookups ─────────────────────────────────────────────────────────

describe('InputController — findGamepadBtnForBit', () => {
  it('resolves default bindings and returns -1 for unknown bits', () => {
    const emu = createMockEmulator();
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    expect(ctrl.findGamepadBtnForBit(0, BUTTON.A)).toBe(1); // default A → button 1
    expect(ctrl.findGamepadBtnForBit(0, 999)).toBe(-1);
  });
});

// ── DOM listener fan-out (rAF suppressed for determinism) ────────────────

describe('InputController — DOM fan-out', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
    // Suppress the rAF poll loop so publish() only fires from explicit events.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fans a window keydown out to the attached writer', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    ctrl.start();
    try {
      keyDownOn(window, 'ArrowUp');
      expect(emu.lastButtons).toBe(bit(BUTTON.UP));
    } finally {
      ctrl.stop();
    }
  });

  it('stops dispatching after stop()', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    ctrl.start();
    keyDownOn(window, 'ArrowUp');
    const callsAfterStart = emu.buttonsCalls.length;
    ctrl.stop();
    keyDownOn(window, 'ArrowUp'); // listener removed via AbortController
    expect(emu.buttonsCalls.length).toBe(callsAfterStart);
  });

  it('ignores key events originating from form elements', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    ctrl.start();
    try {
      const input = document.createElement('input');
      document.body.appendChild(input);
      const before = emu.buttonsCalls.length;
      keyDownOn(input, 'ArrowUp');
      expect(emu.buttonsCalls.length).toBe(before); // gated by isFormElement
      input.remove();
    } finally {
      ctrl.stop();
    }
  });

  it('clears pressed state on window blur', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    ctrl.start();
    try {
      keyDownOn(window, 'ArrowUp'); // down-set now holds UP
      window.dispatchEvent(new Event('blur')); // onBlur clears the down-set
      keyDownOn(window, 'x'); // A — if UP survived, mask would be UP|A
      expect(emu.lastButtons).toBe(bit(BUTTON.A));
    } finally {
      ctrl.stop();
    }
  });
});

// ── Capture flow ─────────────────────────────────────────────────────────

describe('InputController — rebind capture', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures the next key and applies it as a rebind', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    const onDone = vi.fn();
    ctrl.onCaptureDone(onDone);
    ctrl.start();
    try {
      ctrl.startCapture(0, BUTTON.A, null);
      keyDownOn(window, 'q'); // captured

      expect(onDone).toHaveBeenCalledWith({ type: 'keyboard', bit: BUTTON.A, port: 0, key: 'q' });
      expect(ctrl.findKeyForBit(0, BUTTON.A)).toBe('q');
    } finally {
      ctrl.stop();
    }
  });

  it('Escape cancels an in-progress capture', () => {
    const ctrl = makeController(emu);
    attachKeyboard(ctrl, 0);
    ctrl.start();
    try {
      const btn = document.createElement('button');
      ctrl.startCapture(0, BUTTON.A, btn);
      expect(ctrl.isCapturing(btn)).toBe(true);

      keyDownOn(window, 'Escape');
      expect(ctrl.isCapturing(btn)).toBe(false);
    } finally {
      ctrl.stop();
    }
  });
});

// ── Gamepad capture poll (fake timers drive the rAF loop) ────────────────

describe('InputController — gamepad capture poll', () => {
  let emu: MockEmulator;
  beforeEach(() => {
    emu = createMockEmulator();
  });

  it('detects a newly pressed gamepad button during the poll', () => {
    vi.useFakeTimers();
    try {
      // Button 0 starts RELEASED: primeCaptureGamepadState() snapshots it as
      // unpressed, so a subsequent press registers as a rising edge.
      const gp = {
        index: 0,
        id: 'fake',
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        buttons: [
          { pressed: false, value: 0, touched: false },
          { pressed: false, value: 0, touched: false },
        ],
        axes: [0, 0, 0, 0],
        vibrationActuator: null,
      } as unknown as Gamepad;

      const ctrl = makeController(emu, { getGamepads: () => [gp] });
      attachKeyboard(ctrl, 0);
      const onDone = vi.fn();
      ctrl.onCaptureDone(onDone);
      ctrl.start();
      try {
        ctrl.startCapture(0, BUTTON.A, null); // primes prev[] with current (unpressed) state
        (gp.buttons as any)[0].pressed = true; // user presses button 0
        vi.advanceTimersByTime(32); // run rAF ticks → pollCaptureGamepad

        expect(onDone).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gamepad',
            bit: BUTTON.A,
            gamepadIndex: 0,
            buttonIndex: 0,
          }),
        );
      } finally {
        ctrl.destroy();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
