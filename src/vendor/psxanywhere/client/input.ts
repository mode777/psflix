'use strict';

// Input subsystem: translates browser events (keyboard, mouse, gamepad) into
// Emulator facade calls. Two classes:
//
//   ControllerWriter  — one per port. Owns pressed-bit state for that port and
//                       translates events → emu.setButtons / setAnalog / etc.
//   InputController   — owns the DOM listener wiring, the rAF poll loop, the
//                       rebind capture flow, and the per-port writer registry.
//
// Design notes (see specs/archive/input-api, specs/archive/refactoring/plan-input):
// - DOM listeners are installed once via an AbortController (start/stop), not
//   re-installed on every writer change. Handlers fan out to the live writer
//   registry, so attach/detach needs no listener re-arming.
// - Rebind persistence is delegated to RebindStore (no duplicated load/save).
// - Pure math (axis/lightgun/rising-edge) lives in input-pure.ts and is tested.
// - Dependencies (RebindStore, gamepad source) are injectable for unit tests.

import { BUTTON, CONTROLLER, type Emulator } from 'emulator-core';
import { RebindStore } from './rebind-store';
import { applyKeyRebind, applyGamepadRebind } from './rebind-mutation';
import { createCaptureHandle, type CaptureHandle } from './rebind-capture';
import {
  LIGHTGUN_MAX_X,
  LIGHTGUN_MAX_Y,
  lightgunCoords,
  sampleGamepadRisingEdge,
  primeButtonState,
  setBits,
  stickToDpadBits,
} from './input-pure';
import { DEFAULT_KEY_MAP, DEFAULT_GAMEPAD_MAP } from './input-constants';

export { DEFAULT_KEY_MAP, DEFAULT_GAMEPAD_MAP };
export { gamepadButtonName };

// ── ControllerConfig (value object) ────────────────────────────────────

export type Source = 'keyboard' | 'gamepad' | 'mouse';

export interface ControllerConfig {
  readonly port: number;
  readonly device: number;
  readonly source: Source;
  readonly keyMap: Readonly<Record<string, number>>;
  readonly gamepadMap: Readonly<Record<number, number>>;
  readonly gamepadIndex: number;
}

export function createControllerConfig(
  opts: {
    port?: number;
    device?: number;
    source?: string;
    keyMap?: Record<string, number>;
    gamepadMap?: Record<number, number>;
    gamepadIndex?: number;
  } = {},
): ControllerConfig {
  const source: Source =
    opts.source === 'gamepad' || opts.source === 'mouse' ? opts.source : 'keyboard';
  return {
    port: typeof opts.port === 'number' ? opts.port : 0,
    device: typeof opts.device === 'number' ? opts.device : CONTROLLER.STANDARD,
    source,
    keyMap: source === 'keyboard' ? Object.assign({}, opts.keyMap || DEFAULT_KEY_MAP) : {},
    gamepadMap: source === 'gamepad' ? normalizeGamepadMap(opts.gamepadMap) : {},
    gamepadIndex:
      source === 'gamepad' ? (typeof opts.gamepadIndex === 'number' ? opts.gamepadIndex : -1) : -1,
  };
}

export function withGamepadIndex(cfg: ControllerConfig, gamepadIndex: number): ControllerConfig {
  return { ...cfg, gamepadIndex };
}

function normalizeGamepadMap(m: Record<number, number> | undefined): Record<number, number> {
  const out: Record<number, number> = Object.assign({}, DEFAULT_GAMEPAD_MAP);
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) {
    const btn = Number(k) | 0;
    const bit = Number(v) | 0;
    if (btn >= 0 && bit >= 0) out[btn] = bit;
  }
  return out;
}

// ── Constants ───────────────────────────────────────────────────────────

const JOYPAD_CLASS = new Set<number>([
  CONTROLLER.STANDARD,
  CONTROLLER.ANALOG,
  CONTROLLER.DUALSHOCK,
  CONTROLLER.NEGCON,
]);

const GAMEPAD_BUTTON_NAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'D-Up',
  'D-Down',
  'D-Left',
  'D-Right',
  'Guide',
  'Capture',
];

function gamepadButtonName(idx: number): string {
  if (typeof idx !== 'number' || idx < 0) return '?';
  return GAMEPAD_BUTTON_NAMES[idx] || 'Btn ' + idx;
}

function getGamepads(): (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? navigator.getGamepads()
    : [];
}

function isFormElement(target: EventTarget | null): boolean {
  if (!target || (target as Node).nodeType !== 1) return false;
  const tag = (target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (
    typeof (target as HTMLElement).isContentEditable === 'boolean' &&
    (target as HTMLElement).isContentEditable
  )
    return true;
  return false;
}

// ── Types ───────────────────────────────────────────────────────────────

/** A function returning the canvas's current rect (cached upstream). */
export type RectProvider = () => DOMRect | null;

/** A rebind binding as reported via the onRebind callback. */
export type RebindBinding = string | { type: 'gamepad'; gamepadIndex: number; buttonIndex: number };

export type CaptureResult =
  | { type: 'keyboard'; bit: number; port: number; key: string }
  | { type: 'gamepad'; bit: number; port: number; gamepadIndex: number; buttonIndex: number };

export interface InputControllerOptions {
  canvas?: HTMLCanvasElement | null;
  onRebind?: (bit: number, binding: RebindBinding, port: number) => void;
  /** Persistence backend; defaults to localStorage. Injectable for tests. */
  rebindStore?: RebindStore;
  /** Gamepad source override; defaults to navigator.getGamepads(). */
  getGamepads?: () => (Gamepad | null)[];
}

export interface InputHandle {
  attachController(port: number, cfg: ControllerConfig): ControllerWriter;
  detachController(port: number): void;
  clearControllers(): void;
  start(): void;
  stop(): void;
  setRebind(bit: number, keyName: string, port?: number): boolean;
  setGamepadRebind(bit: number, buttonIndex: number, port?: number): boolean;
  onCaptureDone(cb: (result: CaptureResult) => void): void;
  findKeyForBit(port: number, bit: number): string;
  findGamepadBtnForBit(port: number, bit: number): number;
  startCapture(port: number, bit: number, buttonEl: HTMLButtonElement | null): void;
  cancelCapture(): void;
  isCapturing(buttonEl: HTMLButtonElement): boolean;
  destroy(): void;
}

// ── ControllerWriter ────────────────────────────────────────────────────

/**
 * One instance per port. Holds pressed-bit state and translates browser events
 * into Emulator facade calls. Construction merges ControllerConfig overrides
 * with persisted rebinds (via RebindStore).
 *
 * The class itself is the exported type — no separate interface needed (TS
 * structural typing). Public getters expose read-only state; private `_`-prefixed
 * backing fields hold mutable internal state.
 */
export class ControllerWriter {
  private readonly emu: Emulator;
  readonly port: number;

  private down = new Set<number>();
  private _gamepadIndex: number;
  private _device: number;
  private mouseDx = 0;
  private mouseDy = 0;
  private mouseButtons = 0;
  private lightgunOffscreen = false;
  private lastCanvasX = 0;
  private lastCanvasY = 0;

  private _keyMap: Record<string, number>;
  private _gamepadMap: Record<number, number>;
  /** Precomputed [btnIdx, bit] pairs for the per-frame hot path (no coercion). */
  private gamepadEntries: [number, number][];

  private prevMask = 0;

  constructor(
    emu: Emulator,
    port: number,
    controller: ControllerConfig,
    private readonly rectProvider: RectProvider,
    private readonly rebindStore: RebindStore,
    private readonly getGamepadsFn: () => (Gamepad | null)[] = getGamepads,
  ) {
    this.emu = emu;
    this.port = port;
    this._gamepadIndex = typeof controller.gamepadIndex === 'number' ? controller.gamepadIndex : -1;
    this._device = controller.device;
    this._keyMap =
      controller.keyMap && Object.keys(controller.keyMap).length > 0
        ? { ...controller.keyMap }
        : rebindStore.buildKeyMap(port);
    const explicitMap = controller.gamepadMap || {};
    this._gamepadMap =
      Object.keys(explicitMap).length > 0
        ? Object.assign({}, rebindStore.buildGamepadMap(port), explicitMap)
        : rebindStore.buildGamepadMap(port);
    this.gamepadEntries = this.computeEntries(this._gamepadMap);
  }

  private computeEntries(m: Record<number, number>): [number, number][] {
    const out: [number, number][] = [];
    for (const [btnIdxStr, bit] of Object.entries(m)) {
      const btnIdx = Number(btnIdxStr) | 0;
      if (btnIdx >= 0 && (bit as number) >= 0) out.push([btnIdx, bit as number]);
    }
    return out;
  }

  private isJoypad(): boolean {
    return JOYPAD_CLASS.has(this._device);
  }

  private getLightgunCoords(rect: DOMRect | null): { x: number; y: number } {
    if (!rect) return { x: 0, y: 0 };
    return lightgunCoords(
      this.lastCanvasX,
      this.lastCanvasY,
      rect.width,
      rect.height,
      LIGHTGUN_MAX_X,
      LIGHTGUN_MAX_Y,
    );
  }

  publish(): void {
    let buttonMask = 0;
    let gamepadContributed = false;

    if (this.isJoypad()) {
      buttonMask = setBits(buttonMask, this.down);

      const gps = this.getGamepadsFn();
      if (this._gamepadIndex >= 0) {
        const gp = gps[this._gamepadIndex];
        if (gp && gp.connected && gp.mapping === 'standard') {
          this.applyGamepad(gp, buttonMask, (m) => {
            buttonMask = m;
          });
          gamepadContributed = true;
        }
      } else {
        for (let i = 0; i < gps.length; i++) {
          const gp = gps[i];
          if (gp && gp.connected && gp.mapping === 'standard') {
            this.applyGamepad(gp, buttonMask, (m) => {
              buttonMask = m;
            });
            gamepadContributed = true;
          }
        }
      }
    }

    if (this._device === CONTROLLER.MOUSE) {
      if (this.mouseButtons & 1) buttonMask = (buttonMask | (1 << BUTTON.MOUSE_LEFT)) >>> 0;
      if (this.mouseButtons & 2) buttonMask = (buttonMask | (1 << BUTTON.MOUSE_RIGHT)) >>> 0;
    }

    if (this._device === CONTROLLER.GUNCON || this._device === CONTROLLER.JUSTIFIER) {
      if (this.mouseButtons & 1) buttonMask = (buttonMask | (1 << BUTTON.LIGHTGUN_TRIGGER)) >>> 0;
      if (this.mouseButtons & 2) buttonMask = (buttonMask | (1 << BUTTON.LIGHTGUN_AUX)) >>> 0;
      if (this.lightgunOffscreen)
        buttonMask = (buttonMask | (1 << BUTTON.LIGHTGUN_OFFSCREEN)) >>> 0;
    }

    this.emu.setButtons(this.port, buttonMask);

    const rising = (~this.prevMask >>> 0) & buttonMask;
    if (rising) this.emu.orEdgeBits(this.port, rising);
    this.prevMask = buttonMask >>> 0;

    if (this._device === CONTROLLER.MOUSE) {
      this.emu.setMouseDelta(this.port, this.mouseDx, this.mouseDy);
      this.mouseDx = 0;
      this.mouseDy = 0;
    }

    if (this._device === CONTROLLER.GUNCON || this._device === CONTROLLER.JUSTIFIER) {
      const r = this.rectProvider();
      const lg = this.getLightgunCoords(r);
      this.emu.setLightgunPosition(this.port, lg.x, lg.y);
    }

    // Centre analog only when no gamepad fed input this frame (e.g. keyboard-only).
    if (this.isJoypad() && !gamepadContributed) {
      this.emu.setAnalog(this.port, 'left', 0, 0);
      this.emu.setAnalog(this.port, 'right', 0, 0);
    }
  }

  /** Applies one gamepad's buttons + analog axes to the mask. */
  private applyGamepad(gp: Gamepad, maskIn: number, setMask: (m: number) => void): void {
    const btn = gp.buttons || [];
    const axes = gp.axes || [];
    let mask = maskIn;
    for (const [btnIdx, bit] of this.gamepadEntries) {
      if (btnIdx < 0) continue;
      if (btn[btnIdx] && btn[btnIdx].pressed) mask = (mask | (1 << bit)) >>> 0;
    }
    // On a standard (digital) pad, also drive the d-pad bits from the left
    // stick. Real d-pad presses OR in cleanly; edge-tap detection in
    // publish() picks up stick deflections as rising edges too.
    if (this._device === CONTROLLER.STANDARD) {
      mask = (mask | stickToDpadBits(axes[0] || 0, axes[1] || 0)) >>> 0;
    }
    setMask(mask);
    if (axes[0] !== undefined || axes[1] !== undefined) {
      this.emu.setAnalog(this.port, 'left', axes[0] || 0, axes[1] || 0);
    }
    if (axes[2] !== undefined || axes[3] !== undefined) {
      this.emu.setAnalog(this.port, 'right', axes[2] || 0, axes[3] || 0);
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (
      this._device === CONTROLLER.MOUSE &&
      e.shiftKey &&
      typeof e.key === 'string' &&
      e.key.startsWith('Arrow')
    ) {
      e.preventDefault();
      if (e.key === 'ArrowUp') this.mouseDy -= 3;
      if (e.key === 'ArrowDown') this.mouseDy += 3;
      if (e.key === 'ArrowLeft') this.mouseDx -= 3;
      if (e.key === 'ArrowRight') this.mouseDx += 3;
      return;
    }
    const bit = this._keyMap[e.key];
    if (bit === undefined) return;
    if (!this.isJoypad()) return;
    e.preventDefault();
    e.stopPropagation();
    this.down.add(bit);
    this.publish();
  }

  onKeyUp(e: KeyboardEvent): void {
    const bit = this._keyMap[e.key];
    if (bit === undefined) return;
    if (!this.isJoypad()) return;
    e.preventDefault();
    e.stopPropagation();
    this.down.delete(bit);
    this.publish();
  }

  onBlur(): void {
    this.down.clear();
  }

  onMouseMove(e: MouseEvent): void {
    if (
      this._device !== CONTROLLER.MOUSE &&
      this._device !== CONTROLLER.GUNCON &&
      this._device !== CONTROLLER.JUSTIFIER
    )
      return;
    this.mouseDx += e.movementX || 0;
    this.mouseDy += e.movementY || 0;
    const r = this.rectProvider();
    if (r) {
      this.lastCanvasX = e.clientX - r.left;
      this.lastCanvasY = e.clientY - r.top;
    }
  }

  onMouseDown(e: MouseEvent): void {
    if (
      this._device !== CONTROLLER.MOUSE &&
      this._device !== CONTROLLER.GUNCON &&
      this._device !== CONTROLLER.JUSTIFIER
    )
      return;
    if (e.button === 0) this.mouseButtons |= 1;
    else if (e.button === 2) this.mouseButtons |= 2;
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseButtons &= ~1;
    else if (e.button === 2) this.mouseButtons &= ~2;
  }

  onMouseLeave(): void {
    if (this._device === CONTROLLER.GUNCON || this._device === CONTROLLER.JUSTIFIER)
      this.lightgunOffscreen = true;
  }
  onMouseEnter(): void {
    if (this._device === CONTROLLER.GUNCON || this._device === CONTROLLER.JUSTIFIER)
      this.lightgunOffscreen = false;
  }

  setDevice(d: number): void {
    if (typeof d === 'number') this._device = d;
  }
  setGamepadIndex(idx: number): void {
    this._gamepadIndex = typeof idx === 'number' ? idx : -1;
  }
  setKeyMap(m: Record<string, number>): void {
    this._keyMap = m || this.rebindStore.buildKeyMap(this.port);
  }
  setGamepadMap(m: Record<number, number>): void {
    this._gamepadMap = m || this.rebindStore.buildGamepadMap(this.port);
    this.gamepadEntries = this.computeEntries(this._gamepadMap);
  }

  applyKeyRebind(bit: number, keyName: string): void {
    this._keyMap = applyKeyRebind(this._keyMap, bit, keyName);
  }
  applyGamepadRebind(bit: number, buttonIndex: number): void {
    this._gamepadMap = applyGamepadRebind(this._gamepadMap, bit, buttonIndex);
    this.gamepadEntries = this.computeEntries(this._gamepadMap);
  }

  destroy(): void {
    this.down.clear();
  }

  get keyMap(): Record<string, number> {
    return this._keyMap;
  }
  get gamepadMap(): Record<number, number> {
    return this._gamepadMap;
  }
  get device(): number {
    return this._device;
  }
  get gamepadIndex(): number {
    return this._gamepadIndex;
  }
}

// Back-compat factory (specs reference createControllerWriter). Constructs a
// ControllerWriter directly. The InputController uses this internally too.
export function createControllerWriter(
  emu: Emulator,
  port: number,
  controller: ControllerConfig,
  rectProvider: RectProvider,
  rebindStore: RebindStore,
): ControllerWriter {
  return new ControllerWriter(emu, port, controller, rectProvider, rebindStore);
}

// ── InputController ─────────────────────────────────────────────────────

/**
 * Owns the DOM listener wiring, the rAF poll loop, rebind capture, and the
 * per-port writer registry. Construct, then call start() to activate.
 */
export class InputController implements InputHandle {
  private readonly emu: Emulator;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly onRebind: ((bit: number, binding: RebindBinding, port: number) => void) | null;
  private readonly rebindStore: RebindStore;
  private readonly getGamepadsFn: () => (Gamepad | null)[];

  private readonly writers = new Map<number, ControllerWriter>();
  private capture: CaptureHandle;

  private rafId: number | null = null;
  private listenerAbort: AbortController | null = null;
  private running = false;

  private cachedRect: DOMRect | null = null;
  private cachedRectT = 0;

  private readonly prevAnyGpButtons = new Map<number, boolean[]>();
  private lastRafError: string | null = null;

  constructor(emu: Emulator, opts: InputControllerOptions = {}) {
    this.emu = emu;
    this.canvas = opts.canvas || null;
    this.onRebind = typeof opts.onRebind === 'function' ? opts.onRebind : null;
    this.rebindStore = opts.rebindStore ?? RebindStore.forLocalStorage();
    this.getGamepadsFn = opts.getGamepads ?? getGamepads;

    this.capture = createCaptureHandle({
      getWriter: (port: number) => this.writers.get(port),
      rebindStore: this.rebindStore,
      gamepadButtonName,
      onRebind: this.onRebind,
    });
  }

  // ── Writer registry ──

  attachController(port: number, cfg: ControllerConfig): ControllerWriter {
    const w = new ControllerWriter(
      this.emu,
      port,
      cfg,
      () => this.getCanvasRect(),
      this.rebindStore,
    );
    this.writers.set(port, w);
    return w;
  }

  detachController(port: number): void {
    const w = this.writers.get(port);
    if (w) {
      w.destroy();
      this.writers.delete(port);
    }
  }

  clearControllers(): void {
    for (const w of this.writers.values()) w.destroy();
    this.writers.clear();
  }

  // ── Lifecycle ──

  start(): void {
    if (this.running) return;
    this.running = true;
    this.installListeners();
    this.rafId = requestAnimationFrame(this.rAFLoop);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.removeListeners();
  }

  destroy(): void {
    this.stop();
    this.capture.destroy();
    this.clearControllers();
  }

  // ── Rect caching (shared by all writers via the injected RectProvider) ──

  private getCanvasRect(): DOMRect | null {
    if (!this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.cachedRect || now - this.cachedRectT > 16) {
      this.cachedRect = this.canvas.getBoundingClientRect();
      this.cachedRectT = now;
    }
    return this.cachedRect;
  }

  // ── DOM listeners (AbortController-managed) ──

  private installListeners(): void {
    this.removeListeners();
    const ac = new AbortController();
    this.listenerAbort = ac;
    const opts = { signal: ac.signal };

    window.addEventListener('keydown', this.onKeyDown, { capture: true, signal: ac.signal });
    window.addEventListener('keyup', this.onKeyUp, opts);
    window.addEventListener('blur', this.onBlur, opts);

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('mousemove', this.onMouseMove, opts);
      this.canvas.addEventListener('mousedown', this.onMouseDown, opts);
      this.canvas.addEventListener('mouseup', this.onMouseUp, opts);
      this.canvas.addEventListener('mouseleave', this.onMouseLeave, opts);
      this.canvas.addEventListener('mouseenter', this.onMouseEnter, opts);
      this.canvas.addEventListener('contextmenu', this.onContextMenu, opts);
    }
  }

  private removeListeners(): void {
    if (this.listenerAbort) {
      this.listenerAbort.abort();
      this.listenerAbort = null;
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isFormElement(e.target)) return;
    if (this.capture.captureNext) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.capture.cancelCapture();
        return;
      }
      if (e.key && e.key !== '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.capture.finishCaptureKey(e.key);
      }
      return;
    }
    for (const w of this.writers.values()) w.onKeyDown(e);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (isFormElement(e.target)) return;
    for (const w of this.writers.values()) w.onKeyUp(e);
  };

  private onBlur = (): void => {
    for (const w of this.writers.values()) w.onBlur();
  };

  private onMouseMove = (e: MouseEvent): void => {
    for (const w of this.writers.values()) w.onMouseMove(e);
  };
  private onMouseDown = (e: MouseEvent): void => {
    for (const w of this.writers.values()) w.onMouseDown(e);
  };
  private onMouseUp = (e: MouseEvent): void => {
    for (const w of this.writers.values()) w.onMouseUp(e);
  };
  private onMouseLeave = (): void => {
    for (const w of this.writers.values()) w.onMouseLeave();
  };
  private onMouseEnter = (): void => {
    for (const w of this.writers.values()) w.onMouseEnter();
  };
  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  // ── rAF poll loop ──

  private rAFLoop = (): void => {
    for (const w of this.writers.values()) {
      try {
        w.publish();
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg !== this.lastRafError) {
          this.lastRafError = msg;
          console.warn(`input: rAFLoop publish error: ${msg}`);
        }
      }
    }
    if (this.capture.captureNext) {
      this.pollCaptureGamepad();
    }
    this.rafId = requestAnimationFrame(this.rAFLoop);
  };

  private pollCaptureGamepad(): void {
    const gps = this.getGamepadsFn();
    const w = this.writers.get(this.capture.capturePort);
    const preferred = w && w.gamepadIndex >= 0 ? w.gamepadIndex : -1;
    let hit: { gamepadIndex: number; buttonIndex: number } | null = null;
    if (preferred >= 0 && gps[preferred] && gps[preferred]!.connected) {
      hit = this.sampleGamepadIndex(preferred);
    }
    if (!hit) {
      for (let i = 0; i < gps.length; i++) {
        if (i === preferred) continue;
        if (!gps[i] || !gps[i]!.connected) continue;
        const h = this.sampleGamepadIndex(i);
        if (h) {
          hit = h;
          break;
        }
      }
    }
    if (hit) {
      this.capture.finishCaptureGamepad(hit.gamepadIndex, hit.buttonIndex);
    }
  }

  private sampleGamepadIndex(gpIdx: number): { gamepadIndex: number; buttonIndex: number } | null {
    const gps = this.getGamepadsFn();
    const gp = gps[gpIdx];
    if (!gp || !gp.connected || gp.mapping !== 'standard') return null;
    const btn = gp.buttons || [];
    let prev = this.prevAnyGpButtons.get(gpIdx);
    if (!prev) {
      prev = [];
      this.prevAnyGpButtons.set(gpIdx, prev);
    }
    const pressed = sampleGamepadRisingEdge(prev, btn);
    return pressed >= 0 ? { gamepadIndex: gpIdx, buttonIndex: pressed } : null;
  }

  // ── Rebind lookup ──

  findKeyForBit(port: number, bit: number): string {
    const w = this.writers.get(port);
    const km = w ? w.keyMap : this.rebindStore.buildKeyMap(port);
    for (const k of Object.keys(km)) {
      if (km[k] === bit) return k;
    }
    return '?';
  }

  findGamepadBtnForBit(port: number, bit: number): number {
    const w = this.writers.get(port);
    const gm = w ? w.gamepadMap : this.rebindStore.buildGamepadMap(port);
    for (const [k, v] of Object.entries(gm)) {
      if (v === bit) return Number(k) | 0;
    }
    return -1;
  }

  // ── Rebind mutation (persist + apply to writer) ──

  setRebind(bit: number, keyName: string, port = 0): boolean {
    if (!(bit >= 0) || !keyName) return false;
    port = port | 0;
    const w = this.writers.get(port);
    if (w) w.applyKeyRebind(bit, keyName);
    this.rebindStore.setKeyRebind(port, bit, keyName);
    if (this.onRebind) this.onRebind(bit, keyName, port);
    return true;
  }

  setGamepadRebind(bit: number, buttonIndex: number, port = 0): boolean {
    if (!(bit >= 0) || !(buttonIndex >= 0)) return false;
    port = port | 0;
    const w = this.writers.get(port);
    if (w) w.applyGamepadRebind(bit, buttonIndex);
    this.rebindStore.setGamepadRebind(port, bit, buttonIndex);
    if (this.onRebind) this.onRebind(bit, { type: 'gamepad', gamepadIndex: -1, buttonIndex }, port);
    return true;
  }

  // ── Capture delegation ──

  onCaptureDone(cb: (result: CaptureResult) => void): void {
    this.capture.onCaptureDone(cb as (result: any) => void);
  }

  startCapture(port: number, bit: number, buttonEl: HTMLButtonElement | null): void {
    this.capture.startCapture(port, bit, buttonEl);
    this.primeCaptureGamepadState();
  }

  cancelCapture(): void {
    this.capture.cancelCapture();
  }
  isCapturing(buttonEl: HTMLButtonElement): boolean {
    return this.capture.isCapturing(buttonEl);
  }

  private primeCaptureGamepadState(): void {
    this.prevAnyGpButtons.clear();
    const gps = this.getGamepadsFn();
    for (let i = 0; i < gps.length; i++) {
      const gp = gps[i];
      if (!gp || !gp.connected || gp.mapping !== 'standard') continue;
      this.prevAnyGpButtons.set(i, primeButtonState(gp.buttons || []));
    }
  }
}

// Back-compat factory (specs reference `install`). Prefer `new InputController`.
export function install(emu: Emulator, opts: InputControllerOptions = {}): InputHandle {
  const ctrl = new InputController(emu, opts);
  ctrl.start();
  return ctrl;
}
