'use strict';

// Rebind capture flow: listens for the next keyboard key or gamepad button
// press and applies it as a rebind. Persistence is delegated to RebindStore
// (previously this module duplicated the load/mutate/save sequence that also
// lived in input.ts — that DRY violation is now eliminated).
//
// The capture handle applies rebinds to the live ControllerWriter (via
// getWriter) and persists them via rebindStore. It does not own the DOM
// listeners or the rAF poll — InputController drives those and calls
// finishCaptureKey/finishCaptureGamepad when a press is detected.

import type { ControllerWriter } from './input';
import type { RebindStore } from './rebind-store';

export type CaptureResult =
  | { type: 'keyboard'; bit: number; port: number; key: string }
  | { type: 'gamepad'; bit: number; port: number; gamepadIndex: number; buttonIndex: number };

export interface CaptureCallbacks {
  getWriter(port: number): ControllerWriter | undefined;
  rebindStore: RebindStore;
  gamepadButtonName(idx: number): string;
  onRebind: ((bit: number, binding: any, port: number) => void) | null;
}

export interface CaptureHandle {
  readonly captureNext: boolean;
  readonly capturePort: number;
  startCapture(port: number, bit: number, buttonEl: HTMLButtonElement | null): void;
  cancelCapture(): void;
  isCapturing(buttonEl: HTMLButtonElement): boolean;
  onCaptureDone(cb: (result: CaptureResult) => void): void;
  finishCaptureKey(keyName: string): void;
  finishCaptureGamepad(gamepadIndex: number, buttonIndex: number): void;
  clearCaptureAux(): void;
  destroy(): void;
}

export function createCaptureHandle(cbs: CaptureCallbacks): CaptureHandle {
  let captureNext = false;
  let captureNextBit = 0;
  let capturePort = 0;
  let captureButtonEl: HTMLButtonElement | null = null;
  let captureTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let captureOutsideClickHandler: ((ev: PointerEvent) => void) | null = null;
  const captureDoneListeners: ((result: CaptureResult) => void)[] = [];

  function clearCaptureAux() {
    if (captureTimeoutId !== null) {
      clearTimeout(captureTimeoutId);
      captureTimeoutId = null;
    }
    if (captureOutsideClickHandler) {
      window.removeEventListener('pointerdown', captureOutsideClickHandler, true);
      captureOutsideClickHandler = null;
    }
  }

  function cancelCapture() {
    captureNext = false;
    if (captureButtonEl) {
      captureButtonEl.textContent = 'Rebind';
      captureButtonEl = null;
    }
    clearCaptureAux();
    captureDoneListeners.length = 0;
  }

  function startCapture(port: number, bit: number, buttonEl: HTMLButtonElement | null) {
    clearCaptureAux();
    captureNext = true;
    capturePort = port | 0;
    captureNextBit = bit | 0;
    captureButtonEl = buttonEl || null;
    if (buttonEl) buttonEl.textContent = 'press a key or gamepad button… (Esc to cancel)';
    captureTimeoutId = setTimeout(() => {
      cancelCapture();
    }, 5000);
    captureOutsideClickHandler = (ev: PointerEvent) => {
      if (captureButtonEl && ev.target === captureButtonEl) return;
      cancelCapture();
    };
    window.addEventListener('pointerdown', captureOutsideClickHandler, true);
  }

  function isCapturing(buttonEl: HTMLButtonElement): boolean {
    return captureNext && captureButtonEl === buttonEl;
  }

  function finishCaptureGamepad(gamepadIndex: number, buttonIndex: number) {
    const port = capturePort;
    const bit = captureNextBit;
    const btnIdx = buttonIndex | 0;
    const w = cbs.getWriter(port);
    if (w) w.applyGamepadRebind(bit, btnIdx);
    cbs.rebindStore.setGamepadRebind(port, bit, btnIdx);
    captureNext = false;
    clearCaptureAux();
    if (captureButtonEl) {
      captureButtonEl.textContent = 'Rebind';
      const tdG =
        captureButtonEl.parentElement &&
        (captureButtonEl.parentElement as HTMLElement).previousElementSibling;
      if (tdG) tdG.textContent = cbs.gamepadButtonName(btnIdx);
      captureButtonEl = null;
    }
    if (cbs.onRebind)
      cbs.onRebind(bit, { type: 'gamepad', gamepadIndex, buttonIndex: btnIdx }, port);
    for (const fn of captureDoneListeners) {
      try {
        fn({ type: 'gamepad', bit, port, gamepadIndex, buttonIndex: btnIdx });
      } catch (e: any) {
        console.warn(`rebind-capture: captureDoneListener threw: ${e?.message ?? e}`);
      }
    }
    captureDoneListeners.length = 0;
  }

  function finishCaptureKey(keyName: string) {
    const port = capturePort;
    const bit = captureNextBit;
    const w = cbs.getWriter(port);
    if (w) w.applyKeyRebind(bit, keyName);
    cbs.rebindStore.setKeyRebind(port, bit, keyName);
    captureNext = false;
    clearCaptureAux();
    if (captureButtonEl) {
      captureButtonEl.textContent = 'Rebind';
      const tdK =
        captureButtonEl.parentElement &&
        (captureButtonEl.parentElement as HTMLElement).previousElementSibling;
      if (tdK) tdK.textContent = keyName;
      captureButtonEl = null;
    }
    if (cbs.onRebind) cbs.onRebind(bit, keyName, port);
    for (const fn of captureDoneListeners) {
      try {
        fn({ type: 'keyboard', bit, port, key: keyName });
      } catch (e: any) {
        console.warn(`rebind-capture: captureDoneListener threw: ${e?.message ?? e}`);
      }
    }
    captureDoneListeners.length = 0;
  }

  function onCaptureDone(cb: (result: CaptureResult) => void) {
    captureDoneListeners.push(cb);
  }

  function destroy() {
    clearCaptureAux();
    captureNext = false;
    captureDoneListeners.length = 0;
  }

  return {
    get captureNext() {
      return captureNext;
    },
    get capturePort() {
      return capturePort;
    },
    startCapture,
    cancelCapture,
    isCapturing,
    onCaptureDone,
    finishCaptureKey,
    finishCaptureGamepad,
    clearCaptureAux,
    destroy,
  };
}
