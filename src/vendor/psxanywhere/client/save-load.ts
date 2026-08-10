'use strict';

// Save / load state orchestration between the Emulator facade and the
// SaveStateStore. The controller owns the round-trip (serialize → wrap with
// PSAS header → persist, and persist → strip header → deserialize) plus the
// user-facing toasts. All collaborators are injected once at construction;
// the emulator is read through an accessor so the controller survives the
// destroy+recreate recovery flow in app.ts.
//
// See docs/save-state.md.

import { Emulator } from 'emulator-core';
import { buildSaveStateHeader, parseSaveStateHeader } from './saveStateHeader';
import { SaveStateStore } from './SaveStateStore';
import type { LogFn } from './local-json';
import type { Slot } from './saveStateStorage';

export class SaveLoadController {
  private readonly _getEmulator: () => Emulator | null;
  private readonly _stateStore: SaveStateStore;
  private readonly _log: LogFn;
  private readonly _showToast: (msg: string) => void;
  private readonly _onSaved: () => void;

  constructor(
    getEmulator: () => Emulator | null,
    stateStore: SaveStateStore,
    log: LogFn,
    showToast: (msg: string) => void,
    onSaved: () => void,
  ) {
    this._getEmulator = getEmulator;
    this._stateStore = stateStore;
    this._log = log;
    this._showToast = showToast;
    this._onSaved = onSaved;
  }

  /**
   * Persist the emulator's current state under `slot` for `serial`.
   * Wraps the raw core bytes in a PSAS header (carrying disc identity)
   * before handing the buffer to the store. No-ops if there is no live
   * emulator or the core returned no payload.
   */
  async save(slot: Slot, serial: string): Promise<void> {
    const emu = this._getEmulator();
    if (!emu) {
      this._log('warn', 'save-load.save: no emulator');
      return;
    }

    const raw = await emu.saveState(slot);
    if (!raw) {
      this._log('warn', 'No game loaded; nothing to save');
      return;
    }

    const buf = buildSaveStateHeader(raw, emu.getCurrentDiscUrl() || '', emu.getCdromId() || '');
    this._log('info', `save state: discSerial=${serial}, bufSize=${buf.byteLength}`);
    await this._stateStore.save(slot, buf, serial);
    this._showToast(slot === Emulator.SLOT_AUTO ? 'Auto-saved' : 'State saved');
    this._onSaved();
  }

  /**
   * Load the state previously persisted under `slot` for `serial` back into
   * the emulator. Strips the PSAS header (or treats the buffer as raw core
   * bytes when no header is present, for back-compat). No-ops with a toast
   * if no state exists locally or remotely.
   */
  async load(slot: Slot, serial: string): Promise<void> {
    const emu = this._getEmulator();
    if (!emu) {
      this._log('warn', 'save-load.load: no emulator');
      return;
    }

    const stored = await this._stateStore.load(slot, serial);
    if (!stored) {
      this._showToast(slot === Emulator.SLOT_AUTO ? 'No auto-save found' : 'No save state found');
      return;
    }

    const parsed = parseSaveStateHeader(stored);
    if (parsed.kind === 'corrupt') {
      this._showToast('Save state is corrupt — header unreadable');
      this._log('warn', `corrupt header: ${parsed.reason}`);
      return;
    }

    const raw = parsed.kind === 'ok' ? stored.slice(parsed.coreOffset) : stored;
    await emu.loadState(slot, raw);
    //this._showToast(slot === Emulator.SLOT_AUTO ? 'Loaded auto-save' : 'State loaded');
  }
}
