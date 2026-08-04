'use strict';

// Pure, dependency-free input math helpers. No DOM, no Emulator, no storage.
// Every function takes primitives (or plain data) and returns plain data, so
// the input translation layer can be unit-tested without a browser environment.
//
// These were previously inlined as closures inside createControllerWriter /
// install, which made them impossible to test in isolation.

export const DEFAULT_DEADZONE = 0.08;
export const DEFAULT_ANALOG_MAX = 0x7fff;
export const LIGHTGUN_MAX_X = 511;
export const LIGHTGUN_MAX_Y = 255;

/** Threshold a left-stick axis must cross to register a d-pad direction. */
export const STICK_TO_DPAD_THRESHOLD = 0.3;

/** RETRO_DEVICE_ID_JOYPAD_{UP,DOWN,LEFT,RIGHT}. Must stay in sync with
 *  BUTTON.UP/DOWN/LEFT/RIGHT in src/emulator/buttons.ts (guarded by
 *  scripts/test/controller-constants.test.js). Hard-coded as literals here to
 *  keep this file free of emulator-core imports (same pattern as CONTROLLER_MOUSE). */
const DPAD_UP = 4;
const DPAD_DOWN = 5;
const DPAD_LEFT = 6;
const DPAD_RIGHT = 7;

/** RETRO_DEVICE_MOUSE — kept as a literal to avoid importing emulator-core. */
const CONTROLLER_MOUSE = 0x102;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Convert a raw gamepad axis value in [-1, 1] to a signed int16, applying a
 * central deadzone. Returns a value in [0x0000..0xffff] where 0x8000 is centre.
 */
export function axisToInt16(
  v: number,
  deadzone: number = DEFAULT_DEADZONE,
  analogMax: number = DEFAULT_ANALOG_MAX,
): number {
  let a = clamp(Number(v) || 0, -1, 1);
  if (Math.abs(a) < deadzone) a = 0;
  return (Math.round(a * analogMax) & 0xffff) >>> 0;
}

/**
 * Convert a left-stick (x, y) in [-1, 1] to a d-pad button mask. Each axis is
 * tested independently against `threshold`, so diagonal deflections set both
 * cardinal bits. Used to emulate the d-pad from the analog stick on a standard
 * (digital) controller.
 */
export function stickToDpadBits(
  x: number,
  y: number,
  threshold: number = STICK_TO_DPAD_THRESHOLD,
): number {
  let m = 0;
  if (y < -threshold) m = (m | (1 << DPAD_UP)) >>> 0;
  if (y > threshold) m = (m | (1 << DPAD_DOWN)) >>> 0;
  if (x < -threshold) m = (m | (1 << DPAD_LEFT)) >>> 0;
  if (x > threshold) m = (m | (1 << DPAD_RIGHT)) >>> 0;
  return m;
}

/**
 * Map a canvas-relative pointer position to lightgun screen coordinates.
 * `rectW`/`rectH` are the canvas's rendered size in CSS pixels.
 */
export function lightgunCoords(
  canvasX: number,
  canvasY: number,
  rectW: number,
  rectH: number,
  maxX: number = LIGHTGUN_MAX_X,
  maxY: number = LIGHTGUN_MAX_Y,
): { x: number; y: number } {
  if (!rectW || !rectH) return { x: 0, y: 0 };
  const x = Math.round((canvasX / rectW) * maxX);
  const y = Math.round((canvasY / rectH) * maxY);
  return { x: clamp(x, 0, maxX), y: clamp(y, 0, maxY) };
}

/** Minimal button-like shape consumed by the rising-edge sampler. */
export interface ButtonLike {
  pressed: boolean;
}

/**
 * Detect the first button that transitioned from up→down between `prev` and
 * `buttons`. Mutates `prev` in place to reflect the new pressed state and
 * truncates it to `buttons.length`. Returns the newly-pressed index, or -1.
 *
 * Used by the capture flow to find which gamepad button the user pressed.
 */
export function sampleGamepadRisingEdge(prev: boolean[], buttons: readonly ButtonLike[]): number {
  let pressed = -1;
  for (let i = 0; i < buttons.length; i++) {
    const wasPressed = !!prev[i];
    const isPressed = !!(buttons[i] && buttons[i].pressed);
    prev[i] = isPressed;
    if (!wasPressed && isPressed) {
      pressed = i;
      break;
    }
  }
  if (buttons.length < prev.length) prev.length = buttons.length;
  return pressed;
}

/** Initialize a pressed-state snapshot from a button list. */
export function primeButtonState(buttons: readonly ButtonLike[]): boolean[] {
  const out = new Array<boolean>(buttons.length);
  for (let i = 0; i < buttons.length; i++) {
    out[i] = !!(buttons[i] && buttons[i].pressed);
  }
  return out;
}

/**
 * Set every bit in `mask` corresponding to entries in `bits`. Returns the new
 * mask. Pure helper for assembling a joypad button mask from pressed bits.
 */
export function setBits(mask: number, bits: Iterable<number>): number {
  let m = mask >>> 0;
  for (const bit of bits) m = (m | (1 << bit)) >>> 0;
  return m;
}

/** Returns true if any port in `configs` is assigned a mouse device. */
export function anyPortHasMouse(configs: ({ device: number } | null)[]): boolean {
  return configs.some((c) => c && c.device === CONTROLLER_MOUSE);
}
