'use strict';

import {
  Emulator,
  CONTROLLER,
  BUTTON,
  BUTTON_LABELS,
  CRT_SHADER_DEFAULT_PARAMS,
} from 'emulator-core';
import type { Repository } from 'repository';
import { InputController, type InputHandle, type ControllerConfig, type Source } from './input';
import { createControllerConfig, withGamepadIndex } from './input';
import { gamepadButtonName } from './input';
import {
  controllerTypeName,
  formatDeviceHex,
  loadControllersStore,
  saveControllersStore,
} from './controller-store';
import type { ControllerStoreEntry } from './controller-store';
import { anyPortHasMouse } from './input-pure';
import { SaveStateStore } from './SaveStateStore';
import { SaveStateSyncEngine } from './SaveStateSyncEngine';
import { SaveLoadController } from './save-load';
import { MemcardSync } from './MemcardSync';
import { IdbSaveStateStorage } from './saveStateStorage';
import type { SaveStateStorage, Slot } from './saveStateStorage';
import { IdbMemcardStorage } from './memcardStorage';
import type { MemcardStorage } from './memcardStorage';
import { BiosLoader, LocalBiosStorage } from './bios';
import type { BiosStorage } from './bios';
import { parseSaveStateHeader } from './saveStateHeader';
import { downloadMemcard } from './memcard-export';

export type { Source, ControllerConfig, InputHandle, CaptureResult, RebindBinding } from './input';
export type { ControllerStoreEntry } from './controller-store';
export type { SaveStateStorage, Slot } from './saveStateStorage';
export type { MemcardStorage } from './memcardStorage';
export type { BiosStorage } from './bios';
export type { ParsedHeader, ParseResult } from './saveStateHeader';

export interface EmulatorClientOptions {
  canvas: HTMLCanvasElement;
  repository: Repository;
  cacheEnabled?: boolean;
  log?: (level: string, msg: string) => void;
  toast?: (msg: string) => void;
  autoSave?: { intervalMs: number };
  saveStateStorage?: SaveStateStorage;
  memcardStorage?: MemcardStorage;
  biosStorage?: BiosStorage;
}

export interface DiscRequest {
  chdUrl: string;
  serial?: string;
  biosUrl?: string;
  bios?: ArrayBuffer;
  onProgress?: (fraction: number) => void;
  /**
   * PAL frame pacing hint (true = pace the audio clock at 50 fps). Set by the
   * host from the catalog region / disc serial so PAL games don't run fast.
   */
  pal?: boolean;
}

export interface SwapDiscRequest {
  serial?: string;
  pal?: boolean;
}

export class EmulatorClient extends EventTarget {
  static readonly CONTROLLER = CONTROLLER;
  static readonly BUTTON = BUTTON;
  static readonly BUTTON_LABELS = BUTTON_LABELS;
  static readonly SLOT_AUTO = Emulator.SLOT_AUTO;
  static readonly CRT_SHADER_DEFAULT_PARAMS = CRT_SHADER_DEFAULT_PARAMS;

  static gamepadButtonName = gamepadButtonName;
  static controllerTypeName = controllerTypeName;
  static formatDeviceHex = formatDeviceHex;
  static anyPortHasMouse = anyPortHasMouse;

  private _repo: Repository;
  private _canvas: HTMLCanvasElement;
  private _log: (level: string, msg: string) => void;
  private _toast: (msg: string) => void;
  private _cacheEnabled: boolean;

  private _emu: Emulator | null = null;
  private _input: InputController | null = null;
  private _controllerConfigs: (ControllerConfig | null)[] = new Array(8).fill(null);
  private _currentDiscSerial: string | null = null;
  private _isRunning = false;
  private _resetInProgress = false;
  private _gen = 0;
  private _pal = false;

  private _bindings: { type: string; handler: EventListener }[] = [];
  private _gamepadAbort: AbortController | null = null;

  // ── Persistence subsystems (phase 3) ────────────────────────────────
  private _saveStateStorage: SaveStateStorage;
  private _stateStore: SaveStateStore;
  private _stateSync: SaveStateSyncEngine;
  private _saveLoad: SaveLoadController;
  private _memcardStorage: MemcardStorage;
  private _memcardSync: MemcardSync;
  private _biosStorage: BiosStorage;

  // ── Auto-save (phase 3) ─────────────────────────────────────────────
  private _autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _autoSaveIntervalMs: number;
  private _boundOnPageHide: (() => void) | null = null;
  private _boundOnVisibilityChange: (() => void) | null = null;

  constructor(opts: EmulatorClientOptions) {
    super();
    this._repo = opts.repository;
    this._log =
      opts.log ??
      ((level: string, msg: string) => {
        console[level === 'error' ? 'error' : 'log'](msg);
      });
    this._toast = opts.toast ?? (() => {});
    this._cacheEnabled = opts.cacheEnabled !== undefined ? !!opts.cacheEnabled : true;
    if (!opts.canvas) throw new Error('EmulatorClient: canvas is required');
    this._canvas = opts.canvas;
    this._controllerConfigs[0] = createControllerConfig({
      port: 0,
      device: CONTROLLER.STANDARD,
      source: 'keyboard',
    });
    this._autoSaveIntervalMs = opts.autoSave?.intervalMs ?? 0;

    // ── Persistence subsystems ──────────────────────────────────────
    this._saveStateStorage = opts.saveStateStorage ?? new IdbSaveStateStorage();
    this._stateStore = new SaveStateStore(this._saveStateStorage, this._repo, this._log);
    this._stateSync = new SaveStateSyncEngine(
      this._saveStateStorage,
      this._repo,
      this._log,
      this._toast,
      () => this.dispatchEvent(new CustomEvent('state-sync-complete')),
    );

    this._saveLoad = new SaveLoadController(
      () => this._emu,
      this._stateStore,
      this._log,
      this._toast,
      () => this.dispatchEvent(new CustomEvent('state-saved')),
    );

    this._memcardStorage = opts.memcardStorage ?? new IdbMemcardStorage();
    this._memcardSync = new MemcardSync(this._memcardStorage, this._repo, this._log, this._toast, {
      onSyncStart: () => this.dispatchEvent(new CustomEvent('memcard-sync-start')),
      onSyncComplete: () => this.dispatchEvent(new CustomEvent('memcard-sync-complete')),
    });

    this._biosStorage = opts.biosStorage ?? new LocalBiosStorage();

    // ── Auth-driven sync wiring ─────────────────────────────────────
    this._repo.onAuthChange(() => {
      const authed = this._repo.isAuthenticated();
      this._stateSync.onAuthChange(authed);
      this._memcardSync.onAuthChange(authed);
      this.dispatchEvent(new CustomEvent('auth-change', { detail: { authed } }));
    });
    this._stateSync.syncIfAuthed();
    this._memcardSync.onAuthChange(this._repo.isAuthenticated());

    // ── Visibility / pagehide listeners ─────────────────────────────
    this._boundOnPageHide = () => {
      if (!this._currentDiscSerial || !this._isRunning) return;
      void this._autoSaveTick();
    };
    this._boundOnVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this._stateSync.onVisibilityChange();
      }
    };
    document.addEventListener('visibilitychange', this._boundOnVisibilityChange);
    window.addEventListener('pagehide', this._boundOnPageHide);

    this._installGamepadListeners();
  }

  private _installGamepadListeners(): void {
    const ac = new AbortController();
    this._gamepadAbort = ac;
    window.addEventListener(
      'gamepadconnected',
      (e: GamepadEvent) => {
        const gp = e.gamepad;
        this.dispatchEvent(new CustomEvent('gamepad-connected', { detail: { gamepad: gp } }));
        for (let port = 0; port < this._controllerConfigs.length; port++) {
          const cfg = this._controllerConfigs[port];
          if (cfg && cfg.source === 'gamepad' && cfg.gamepadIndex === -1) {
            this._controllerConfigs[port] = withGamepadIndex(cfg, gp.index);
            this._rebuildInputWriters();
            break;
          }
        }
      },
      { signal: ac.signal },
    );
    window.addEventListener(
      'gamepaddisconnected',
      (e: GamepadEvent) => {
        const gp = e.gamepad;
        this.dispatchEvent(new CustomEvent('gamepad-disconnected', { detail: { gamepad: gp } }));
        for (let port = 0; port < this._controllerConfigs.length; port++) {
          const cfg = this._controllerConfigs[port];
          if (cfg && cfg.source === 'gamepad' && cfg.gamepadIndex === gp.index) {
            this._controllerConfigs[port] = withGamepadIndex(cfg, -1);
            this._rebuildInputWriters();
          }
        }
      },
      { signal: ac.signal },
    );
  }

  private _rebuildInputWriters(): void {
    const e = this._emu;
    const inp = this._input;
    if (!e || !inp) return;
    inp.clearControllers();
    for (let port = 0; port < this._controllerConfigs.length; port++) {
      const cfg = this._controllerConfigs[port];
      if (!cfg || cfg.device === 0) continue;
      inp.attachController(port, cfg);
    }
  }

  async boot(): Promise<void> {
    if (this._emu) throw new Error('EmulatorClient: already booted');
    this._gen++;
    this._emu = new Emulator({
      canvas: this._canvas,
      cacheEnabled: this._cacheEnabled,
      onLog: this._log,
    });
    this._input = new InputController(this._emu, { canvas: this._canvas });
    this._input.start();
    this._rebuildInputWriters();
    this._bindEmulatorEvents(this._emu);
    await this._emu.init();
    this._startAutoSave();
  }

  async reset(): Promise<void> {
    if (this._resetInProgress) return;
    this._resetInProgress = true;
    const oldEmu = this._emu;
    this._gen++;
    const myGen = this._gen;

    try {
      this._stopAutoSave();
      this._stateSync.setActiveDisc(null);

      if (oldEmu && this._isRunning) {
        try {
          oldEmu.stop();
          await this._waitForStopped(oldEmu);
        } catch (err: any) {
          this._log('warn', `reset: stop wait failed: ${err?.message ?? err}`);
        }
      }

      try {
        oldEmu?.flushMemcards();
      } catch (err: any) {
        this._log('warn', `reset: memcard flush failed: ${err?.message ?? err}`);
      }

      this._unbindEmulatorEvents(oldEmu);
      if (this._input) {
        this._input.destroy();
        this._input = null;
      }
      oldEmu?.destroy();

      this._currentDiscSerial = null;
      this._isRunning = false;

      const newCanvas = this._canvas.cloneNode(false) as HTMLCanvasElement;
      newCanvas.width = this._canvas.width;
      newCanvas.height = this._canvas.height;
      newCanvas.style.cssText = this._canvas.style.cssText;
      this._canvas.replaceWith(newCanvas);
      this._canvas = newCanvas;

      this._emu = new Emulator({
        canvas: this._canvas,
        cacheEnabled: this._cacheEnabled,
        onLog: this._log,
      });
      this._input = new InputController(this._emu, { canvas: this._canvas });
      this._input.start();
      this._rebuildInputWriters();
      this._bindEmulatorEvents(this._emu);
      await this._emu.init();

      if (myGen !== this._gen) return;
      this.dispatchEvent(new CustomEvent('canvas-replaced', { detail: { canvas: this._canvas } }));
      this._startAutoSave();
    } catch (err: any) {
      this._log('error', `reset failed: ${err?.message ?? err}`);
      throw err;
    } finally {
      this._resetInProgress = false;
    }
  }

  destroy(): void {
    this._stopAutoSave();
    this._stateSync.dispose();
    this._memcardSync.dispose();
    if (this._boundOnVisibilityChange) {
      document.removeEventListener('visibilitychange', this._boundOnVisibilityChange);
      this._boundOnVisibilityChange = null;
    }
    if (this._boundOnPageHide) {
      window.removeEventListener('pagehide', this._boundOnPageHide);
      this._boundOnPageHide = null;
    }
    if (this._gamepadAbort) {
      this._gamepadAbort.abort();
      this._gamepadAbort = null;
    }
    this._unbindEmulatorEvents(this._emu);
    if (this._input) {
      this._input.destroy();
      this._input = null;
    }
    this._emu?.destroy();
    this._emu = null;
    this._gen = 0;
    this._isRunning = false;
    this._currentDiscSerial = null;
  }

  get input(): InputHandle {
    if (!this._input) throw new Error('EmulatorClient: not booted');
    return this._input;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  // ── Controller management ─────────────────────────────────────────

  setController(
    port: number,
    cfg: { device: number; source: Source; gamepadIndex?: number },
  ): void {
    if (port < 0 || port >= 8) return;
    const gpIdx = typeof cfg.gamepadIndex === 'number' ? cfg.gamepadIndex : -1;
    this._controllerConfigs[port] = createControllerConfig({
      port,
      device: cfg.device,
      source: cfg.source,
      gamepadIndex: gpIdx,
    });
    this._emu?.setPortDevice(port, cfg.device);
    this._rebuildInputWriters();

    const store = loadControllersStore(this._log);
    store[port] = { device: cfg.device, source: cfg.source, gamepadIndex: gpIdx };
    saveControllersStore(store, this._log);
  }

  clearController(port: number): void {
    this._controllerConfigs[port] = null;
    this._input?.detachController(port);
  }

  getController(port: number): ControllerConfig | null {
    return this._controllerConfigs[port] ?? null;
  }

  getControllerStore(): Record<number, ControllerStoreEntry> {
    return loadControllersStore(this._log);
  }

  getLiveControllerConfigs(): (ControllerConfig | null)[] {
    return this._controllerConfigs.map((c) => (c ? { ...c } : null));
  }

  // ── Disc loading ──────────────────────────────────────────────────

  async loadDisc(req: DiscRequest): Promise<void> {
    if (!this._emu) throw new Error('EmulatorClient: not booted');
    this._currentDiscSerial = req.serial ?? null;
    this._pal = !!req.pal;

    let bios: ArrayBuffer;
    if (req.bios) {
      bios = req.bios;
    } else {
      const biosUrl = req.biosUrl ?? (await this._repo.fetchBiosUrl());
      const loader = new BiosLoader({ url: biosUrl, storage: this._biosStorage, log: this._log });
      bios = await loader.load();
    }

    await this._emu.loadDisc({
      bios,
      chdUrl: req.chdUrl,
      onProgress: req.onProgress,
      pal: this._pal,
    });

    if (!this._currentDiscSerial) this._currentDiscSerial = this._emu.getCdromId() || null;
    this._stateSync.setActiveDisc(this._currentDiscSerial);
  }

  async swapDisc(url: string, opts?: SwapDiscRequest): Promise<void> {
    if (!this._emu) throw new Error('EmulatorClient: not booted');
    if (opts && typeof opts.pal === 'boolean') this._pal = opts.pal;
    if (opts?.serial) this._currentDiscSerial = opts.serial;
    await this._emu.swapDisc(url, { pal: this._pal });
  }

  getCdromId(): string | null {
    return this._emu?.getCdromId() ?? null;
  }

  getCurrentDiscUrl(): string | null {
    return this._emu?.getCurrentDiscUrl() ?? null;
  }

  getCurrentDiscSerial(): string | null {
    return this._currentDiscSerial;
  }

  // ── Run control ───────────────────────────────────────────────────

  async start(): Promise<void> {
    if (!this._emu) throw new Error('EmulatorClient: not booted');
    this._isRunning = true;
    try {
      await this._emu.start();
    } catch (err) {
      this._isRunning = false;
      throw err;
    }
  }

  stop(): void {
    this._emu?.stop();
  }

  // ── Save / load state ─────────────────────────────────────────────

  async saveState(slot: Slot): Promise<void> {
    if (!this._currentDiscSerial) {
      this._log('warn', 'saveState: no disc serial');
      return;
    }
    await this._saveLoad.save(slot, this._currentDiscSerial);
  }

  async loadState(slot: Slot): Promise<void> {
    if (!this._currentDiscSerial) {
      this._log('warn', 'loadState: no disc serial');
      return;
    }
    await this._saveLoad.load(slot, this._currentDiscSerial);
  }

  hasState(slot: Slot): Promise<boolean> {
    if (!this._currentDiscSerial) return Promise.resolve(false);
    return this._stateStore.hasState(slot, this._currentDiscSerial);
  }

  async loadStateFromFile(buf: ArrayBuffer): Promise<void> {
    const e = this._emu;
    if (!e) return;
    const parsed = parseSaveStateHeader(buf);
    if (parsed.kind === 'corrupt') {
      this._log('warn', `corrupt header: ${parsed.reason}`);
      return;
    }
    const raw = parsed.kind === 'ok' ? buf.slice(parsed.coreOffset) : buf;
    await e.loadState(0, raw);
    this._log('info', 'State restored from file');
  }

  // ── Memory card methods ───────────────────────────────────────────

  exportMemcard(slot: number): Promise<Uint8Array | null> {
    if (!this._emu) return Promise.reject(new Error('not booted'));
    return this._emu.exportMemcard(slot);
  }

  importMemcard(slot: number, buf: ArrayBuffer): Promise<void> {
    if (!this._emu) return Promise.reject(new Error('not booted'));
    return this._emu.importMemcard(slot, buf);
  }

  async downloadMemcard(slot: number): Promise<void> {
    if (!this._emu) return;
    const buf = await this._emu.exportMemcard(slot);
    if (buf) downloadMemcard(slot, buf, this._log);
  }

  // ── Passthroughs ──────────────────────────────────────────────────

  setVolume(v: number): void {
    this._emu?.setVolume(v);
  }
  setCrt(on: boolean): void {
    this._emu?.setCrt(on);
  }
  setCrtParam(key: string, value: number): void {
    this._emu?.setCrtParam(key, value);
  }
  async screenshot(): Promise<Blob | null> {
    return this._emu?.screenshot() ?? null;
  }
  async evictCache(): Promise<void> {
    await this._emu?.evictCache();
  }
  getStats(): Record<string, unknown> {
    return this._emu?.getStats() ?? {};
  }

  // ── Auto-save ─────────────────────────────────────────────────────

  private _startAutoSave(): void {
    if (!this._autoSaveIntervalMs) return;
    this._stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      void this._autoSaveTick();
    }, this._autoSaveIntervalMs);
  }

  private async _autoSaveTick(): Promise<void> {
    if (!this._currentDiscSerial || !this._isRunning) return;
    try {
      await this._saveLoad.save(Emulator.SLOT_AUTO, this._currentDiscSerial);
    } catch (e: any) {
      this._log('warn', `auto-save: ${e?.message ?? e}`);
    }
  }

  private _stopAutoSave(): void {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private _waitForStopped(target: Emulator, timeoutMs = 3000): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        target.removeEventListener('stopped', onStopped);
        clearTimeout(timer);
        resolve();
      };
      const onStopped = () => finish();
      const timer = setTimeout(finish, timeoutMs);
      target.addEventListener('stopped', onStopped, { once: true });
    });
  }

  private _bindEmulatorEvents(emu: Emulator): void {
    const bindings: { type: string; handler: EventListener }[] = [
      { type: 'ready', handler: this._forward('ready') },
      { type: 'loaded', handler: this._forward('loaded') },
      { type: 'stopped', handler: this._onStopped },
      { type: 'stats', handler: this._forward('stats') },
      { type: 'fatal', handler: this._forward('fatal') },
      { type: 'buffering', handler: this._forward('buffering') },
      { type: 'disc-swapped', handler: this._onDiscSwapped },
      { type: 'controller:device-set', handler: this._forward('controller:device-set') },
      { type: 'memcard-load-request', handler: this._onMemcardLoadRequest },
      { type: 'memcard-exported', handler: this._onMemcardExported },
    ];
    for (const b of bindings) emu.addEventListener(b.type, b.handler);
    this._bindings = bindings;
  }

  private _unbindEmulatorEvents(emu: Emulator | null): void {
    if (!emu) {
      this._bindings = [];
      return;
    }
    for (const b of this._bindings) emu.removeEventListener(b.type, b.handler);
    this._bindings = [];
  }

  private _onStopped = (): void => {
    const gen = this._gen;
    this._isRunning = false;
    if (gen === this._gen) {
      this.dispatchEvent(new CustomEvent('stopped', { detail: {} }));
    }
  };

  private _onDiscSwapped = (e: Event): void => {
    const gen = this._gen;
    const url = (e as CustomEvent).detail?.url;
    if (!this._currentDiscSerial) this._currentDiscSerial = this._emu?.getCdromId() || null;
    this._stateSync.setActiveDisc(this._currentDiscSerial);
    if (gen === this._gen) {
      this.dispatchEvent(new CustomEvent('disc-swapped', { detail: { url } }));
    }
  };

  // ── Memcard persistence (internal, NOT re-emitted) ────────────────

  private _onMemcardLoadRequest = async (): Promise<void> => {
    const gen = this._gen;
    await this._memcardSync.ensureDownloaded();
    const e = this._emu;
    if (!e || gen !== this._gen) return;
    const cards = new Map<number, Uint8Array | null>();
    for (const slot of [1, 2]) {
      try {
        const bytes = await this._memcardStorage.load(slot);
        if (bytes) cards.set(slot, bytes);
      } catch (err: any) {
        this._log('warn', `memcard ${slot} restore from IDB failed: ${err?.message ?? err}`);
      }
    }
    if (this._gen === this._currentGen()) e.sendMemcardsToWorker(cards);
  };

  private _onMemcardExported = (e: Event): void => {
    const { slot, buf } = (e as CustomEvent).detail;
    this._memcardStorage
      .save(slot, buf)
      .catch((err: any) =>
        this._log('warn', `memcard ${slot} IDB persist failed: ${err?.message ?? err}`),
      );
    this._memcardSync.onMemcardDirty(slot, buf);
  };

  private _currentGen(): number {
    return this._gen;
  }

  private _forward(type: string): EventListener {
    const gen = this._gen;
    return ((e: Event) => {
      if (this._gen !== gen) return;
      this.dispatchEvent(new CustomEvent(type, { detail: (e as CustomEvent).detail }));
    }) as EventListener;
  }
}
