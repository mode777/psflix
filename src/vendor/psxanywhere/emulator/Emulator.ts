'use strict';

// See specs/archive/emulator-facade/spec.md and docs/api.md.

import {
  VIDEO_SAB_BYTES,
  AUDIO_SAB_BYTES,
  INPUT_SAB_BYTES,
  CONTROL_SAB_BYTES,
  DATA_SAB_BYTES,
  VIDEO_HEADER_BYTES,
  MAX_PORTS,
  INPUT_PORT_BYTES,
  INPUT_OFF_MOUSE_PACK,
  INPUT_OFF_LIGHTGUN_PACK,
  INPUT_OFF_EDGE,
} from './sab/layout';
import { MSG, CONTROLLER } from './messages';
import { BUTTON } from './buttons';
import { install as installBridge, BridgeHandle } from './bridge';
import { createPerfWarn } from './perfWarn';
import { RGB565_TO_RGBA } from './rgb565';
import { AudioManager } from './AudioManager';
import { RemoteChd } from './RemoteChd';

// Re-exports for client convenience.
export { CRT_SHADER_DEFAULT_PARAMS } from './worker/gl/crt-shader';
export { BUTTON, BUTTON_LABELS } from './buttons';
export { CONTROLLER, MSG } from './messages';

export interface EmulatorOptions {
  canvas?: HTMLCanvasElement;
  cacheEnabled?: boolean;
  onLog?: (level: string, msg: string) => void;
}

export interface LoadDiscRequest {
  bios: ArrayBuffer;
  chdUrl: string;
  onProgress?: (fraction: number) => void;
  /** PAL pacing hint — forwarded to the worker so it clocks at 50 fps. */
  pal?: boolean;
}

export interface SwapDiscRequest {
  pal?: boolean;
}

type EmulatorState =
  'constructed' | 'initing' | 'ready' | 'loading' | 'loaded' | 'running' | 'stopped' | 'destroyed';

interface DiscSlotEntry {
  slot: number;
  path: string;
  chdTotal: number;
}

interface PendingPromise<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function rejectAll<T>(map: Map<T, PendingPromise<any>>, err: Error) {
  for (const [, p] of map) p.reject(err);
  map.clear();
}

export class Emulator extends EventTarget {
  static CONTROLLER = CONTROLLER;
  static BUTTON = BUTTON;
  static SLOT_AUTO = 'auto' as const;

  _opts: EmulatorOptions;
  _canvas: HTMLCanvasElement | null;
  _cacheEnabled: boolean;
  _onLog: ((level: string, msg: string) => void) | null;

  _state: EmulatorState;
  _destroyed: boolean;

  _videoSAB: SharedArrayBuffer;
  _audioSAB: SharedArrayBuffer;
  _inputSAB: SharedArrayBuffer;
  _controlSAB: SharedArrayBuffer;
  _dataSAB: SharedArrayBuffer;

  _worker: Worker | null;
  _audio: AudioManager;
  _bridge: BridgeHandle | null;
  _remoteChd: any;
  _progressInterval: ReturnType<typeof setInterval> | null;

  _memcardExportPromises: Map<number, PendingPromise<Uint8Array | null>>;
  _memcardImportPromises: Map<number, PendingPromise<void>>;
  _saveStatePromises: Map<number | string, PendingPromise<ArrayBuffer | null>>;
  _loadStatePromises: Map<number | string, PendingPromise<void>>;

  _discSlotMap: Map<string, DiscSlotEntry>;
  _currentDiscUrl: string | null;
  _nextDiscSlot: number;
  _cdromId: string | null;
  _swapDiscPromise: PendingPromise<void> | null;
  _pal: boolean;

  _initResolve: (() => void) | null;
  _initReject: ((err: Error) => void) | null;
  _loadDiscResolve: (() => void) | null;
  _loadDiscReject: ((err: Error) => void) | null;

  _boundOnWorkerMessage: ((e: MessageEvent) => void) | null;
  _boundOnWorkerError: ((e: ErrorEvent) => void) | null;
  _boundOnWorkerMessageError: ((e: MessageEvent) => void) | null;
  _boundOnVisibilityChange: (() => void) | null;

  _loadedAt: number | null;
  _perfWarn: any;
  _lastStats: any;

  /**
   * Validates COOP/COEP + browser features, allocates the 5 SABs, installs
   * input. Throws synchronously on an unsupported environment.
   */
  constructor(opts: EmulatorOptions = {}) {
    super();

    if (!self.crossOriginIsolated) {
      throw new Error('crossOriginIsolated is false — server must send COOP/COEP headers');
    }
    if (
      !('OffscreenCanvas' in self) ||
      !('AudioContext' in self) ||
      !('AudioWorkletNode' in self)
    ) {
      throw new Error('browser not supported — need Chrome 100+ / Firefox 100+ / Safari 15.4+');
    }

    this._opts = opts;
    this._canvas = opts.canvas || null;
    this._cacheEnabled = opts.cacheEnabled !== undefined ? !!opts.cacheEnabled : true;
    this._onLog = typeof opts.onLog === 'function' ? opts.onLog : null;

    if (!this._canvas) {
      throw new Error('Emulator: canvas is required (streaming-only mode)');
    }

    this._state = 'constructed';
    this._destroyed = false;

    // SABs
    this._videoSAB = new SharedArrayBuffer(VIDEO_SAB_BYTES);
    this._audioSAB = new SharedArrayBuffer(AUDIO_SAB_BYTES);
    this._inputSAB = new SharedArrayBuffer(INPUT_SAB_BYTES);
    this._controlSAB = new SharedArrayBuffer(CONTROL_SAB_BYTES);
    this._dataSAB = new SharedArrayBuffer(DATA_SAB_BYTES);

    // live resources
    this._worker = null;
    this._audio = new AudioManager((level, msg) => this._log(level, msg));
    this._bridge = null;
    this._remoteChd = null;
    this._progressInterval = null;

    // memcard round-trip trackers
    this._memcardExportPromises = new Map();
    this._memcardImportPromises = new Map();

    // save/load state round-trip trackers
    this._saveStatePromises = new Map();
    this._loadStatePromises = new Map();

    // disc state
    this._discSlotMap = new Map();
    this._currentDiscUrl = null;
    this._nextDiscSlot = 0;
    this._cdromId = null;
    this._swapDiscPromise = null;
    this._pal = false;

    // pending init/loadDisc resolvers
    this._initResolve = null;
    this._initReject = null;
    this._loadDiscResolve = null;
    this._loadDiscReject = null;

    // bound listeners for cleanup
    this._boundOnWorkerMessage = null;
    this._boundOnWorkerError = null;
    this._boundOnWorkerMessageError = null;
    this._boundOnVisibilityChange = null;

    // perf diagnostics
    this._loadedAt = null;
    this._perfWarn = createPerfWarn((level: string, msg: string) => this._log(level, msg));
    this._lastStats = null;
  }

  _log(level: string, msg: string) {
    if (this._onLog) {
      try {
        this._onLog(level, msg);
      } catch (e) {
        console.error('[Emulator._log] onLog callback threw:', e);
      }
    }
  }

  _emit(type: string, detail: any) {
    this.dispatchEvent(new CustomEvent(type, { detail: Object.freeze(detail || {}) }));
  }

  _assertAlive() {
    if (this._destroyed || !this._worker) throw new Error('Emulator: destroyed or no worker');
  }

  _setupWorker() {
    const canvasOrOffscreen = this._canvas!.transferControlToOffscreen();
    const worker = new Worker(new URL('./worker/coreWorker.ts', import.meta.url), {
      type: 'module',
    });
    this._worker = worker;

    this._boundOnWorkerError = (e: ErrorEvent) => {
      this._log('error', `worker error: ${e.message || e}`);
      const msg = e.message || String(e);
      this._rejectAllPending(new Error(msg));
      this._emit('fatal', { msg });
      this._teardown();
    };
    this._boundOnWorkerMessageError = (e: MessageEvent) => {
      this._log('error', `worker message error: ${e.data || ''}`);
    };
    this._boundOnWorkerMessage = (e: MessageEvent) => this._onWorkerMessage(e.data || {});
    worker.onerror = this._boundOnWorkerError;
    worker.onmessageerror = this._boundOnWorkerMessageError;
    worker.onmessage = this._boundOnWorkerMessage;

    const initMsg: any = {
      type: MSG.INIT,
      sabs: {
        videoSAB: this._videoSAB,
        audioSAB: this._audioSAB,
        inputSAB: this._inputSAB,
        controlSAB: this._controlSAB,
        dataSAB: this._dataSAB,
      },
      wholeFile: false,
      audioTickPort: this._audio.tickPort,
      audioContextSampleRate: this._audio.sampleRate,
      canvas: canvasOrOffscreen,
    };
    worker.postMessage(initMsg, [canvasOrOffscreen, this._audio.tickPort!]);
    this._log('info', 'init message posted to worker');
  }

  // MSG router
  _onWorkerMessage(msg: any) {
    switch (msg.type) {
      case MSG.READY:
        this._state = 'ready';
        this._log('info', `ready: ${msg.info}`);
        this._emit('ready', { info: msg.info });
        if (this._initResolve) {
          const r = this._initResolve;
          this._initResolve = null;
          r();
        }
        break;
      case MSG.LOADED:
        if (this._progressInterval) {
          clearInterval(this._progressInterval);
          this._progressInterval = null;
        }
        this._state = 'loaded';
        this._loadedAt = Date.now();
        this._cdromId = msg.cdromId || null;
        this._log('info', `game loaded into MEMFS (cdromId=${this._cdromId || 'unknown'})`);
        this._emit('loaded', {});
        if (this._bridge && this._bridge.startSpeculator) this._bridge.startSpeculator();
        if (this._loadDiscResolve) {
          const r = this._loadDiscResolve;
          this._loadDiscResolve = null;
          r();
        }
        break;
      case MSG.RUN_STOPPED:
        this._state = 'stopped';
        this._log('info', 'emulation stopped');
        this._emit('stopped', {});
        break;
      case MSG.FRAME:
        this._emit('frame', {});
        break;
      case MSG.STATS: {
        const merged = this._mergeStats(msg);
        this._emit('stats', merged);
        break;
      }
      case MSG.FATAL:
        this._log('error', `fatal: ${msg.msg}`);
        this._emit('fatal', { msg: msg.msg });
        this._rejectAllPending(new Error(msg.msg));
        this._teardown();
        break;
      case MSG.LOG:
        this._log(msg.level || 'info', msg.msg);
        this._emit('log', { level: msg.level || 'info', msg: msg.msg });
        break;
      case MSG.IO:
        break;
      case MSG.MEMCARD_EXPORT_RESULT: {
        if (msg.buf) {
          // Persistence is the client's responsibility (it owns IDB). The
          // Emulator only forwards the dirty bytes via the event so app.ts
          // can write them to storage and feed MemcardSync.
          this._emit('memcard-exported', { slot: msg.slot, buf: msg.buf });
        }
        const pending = this._memcardExportPromises.get(msg.slot);
        if (pending) {
          this._memcardExportPromises.delete(msg.slot);
          pending.resolve(msg.buf ? new Uint8Array(msg.buf) : null);
        }
        break;
      }
      case MSG.MEMCARD_LOAD_REQUEST: {
        this._emit('memcard-load-request', {});
        break;
      }
      case MSG.MEMCARD_IMPORT_RESULT: {
        const pending = this._memcardImportPromises.get(msg.slot);
        if (pending) {
          this._memcardImportPromises.delete(msg.slot);
          if (msg.ok) pending.resolve();
          else pending.reject(new Error(msg.error || 'memcard import failed'));
        }
        break;
      }
      case MSG.SAVE_STATE_RESULT: {
        const pending = this._saveStatePromises.get(msg.slot);
        if (pending) {
          this._saveStatePromises.delete(msg.slot);
          pending.resolve(msg.buf ? msg.buf.slice(0) : null);
        }
        break;
      }
      case MSG.LOAD_STATE_RESULT: {
        const pending = this._loadStatePromises.get(msg.slot);
        if (pending) {
          this._loadStatePromises.delete(msg.slot);
          if (msg.ok) pending.resolve();
          else pending.reject(new Error(msg.error || 'loadState failed'));
        }
        break;
      }
      case MSG.SET_CONTROLLER_DEVICE_RESULT: {
        this._emit('controller:device-set', {
          ok: msg.ok,
          port: msg.port,
          device: msg.device,
        });
        break;
      }
      case MSG.SWAP_DISC_RESULT: {
        const pending = this._swapDiscPromise;
        if (pending) {
          this._swapDiscPromise = null;
          if (msg.ok) {
            if (msg.cdromId) this._cdromId = msg.cdromId;
            this._log('info', `SWAP_DISC_RESULT ok — cdromId=${msg.cdromId || '(none)'}`);
            pending.resolve();
          } else {
            this._log('error', `SWAP_DISC_RESULT failed — ${msg.error}`);
            pending.reject(new Error(msg.error || 'swapDisc failed'));
          }
        } else {
          this._log('warn', `SWAP_DISC_RESULT received but no _swapDiscPromise pending`);
        }
        break;
      }
      default:
        this._log('warn', `unknown message: ${JSON.stringify(msg)}`);
    }
  }

  _mergeStats(workerStats: any) {
    let s = workerStats;
    if (this._remoteChd) {
      const r = this._remoteChd.getStats();
      s = Object.assign({}, workerStats, r);
    }
    this._lastStats = s;
    if (this._perfWarn) {
      try {
        this._perfWarn.check({ ...s, loadedAt: this._loadedAt });
      } catch (e: any) {
        this._log('warn', `perfWarn.check failed: ${e && e.message ? e.message : e}`);
      }
    }
    return s;
  }

  /** Sets up the audio graph + worker, posts INIT. Resolves on READY. */
  async init() {
    if (this._destroyed) throw new Error('Emulator.init: destroyed');
    if (this._state !== 'constructed')
      throw new Error(`Emulator.init: invalid state ${this._state}`);
    this._state = 'initing';
    try {
      await this._audio.setup(this._audioSAB, this._controlSAB);
      this._setupWorker();
    } catch (err: any) {
      this._emit('fatal', { msg: 'bootstrap failed: ' + err.message });
      throw err;
    }
    await new Promise<void>((resolve, reject) => {
      this._initResolve = resolve;
      this._initReject = reject;
    });
    // Flush memcards when tab is hidden (Emulator owns memcard persistence).
    this._boundOnVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.flushMemcards();
      }
    };
    document.addEventListener('visibilitychange', this._boundOnVisibilityChange);
  }

  /** Fetches BIOS + CHD/CD, arms the streaming bridge, starts Speculator. Resolves on LOADED. */
  async loadDisc(req: LoadDiscRequest) {
    if (this._destroyed) throw new Error('Emulator.loadDisc: destroyed');
    if (this._state !== 'ready' && this._state !== 'loaded' && this._state !== 'stopped') {
      throw new Error(`Emulator.loadDisc: invalid state ${this._state} (call init() first)`);
    }
    this._state = 'loading';
    const bios = req.bios;
    const chdUrl = req.chdUrl;
    if (!(bios instanceof ArrayBuffer) || bios.byteLength === 0) {
      throw new Error('loadDisc: bios must be a non-empty ArrayBuffer');
    }
    if (!chdUrl) throw new Error('loadDisc: chdUrl is required');
    const onProgress = typeof req.onProgress === 'function' ? req.onProgress : null;
    this._pal = !!req.pal;

    try {
      const biosBuf = bios.slice(0);
      this._log('info', `loadDisc: BIOS received from client: ${biosBuf.byteLength} bytes`);
      this._worker!.postMessage({ type: MSG.BIOS, buf: biosBuf }, [biosBuf]);
      this._log('info', 'loadDisc: bios message posted');

      this._log('info', 'loadDisc: streaming path');
      const remote0 = new RemoteChd(chdUrl, { cacheEnabled: this._cacheEnabled });
      await remote0.open();
      this._remoteChd = remote0;
      this._log(
        'info',
        `loadDisc: CHD total = ${remote0.total} bytes; Accept-Ranges ok; cache=${this._cacheEnabled ? 'on' : 'off'}`,
      );
      this._bridge = installBridge(
        this._worker!,
        this._controlSAB,
        this._dataSAB,
        this._remoteChd,
        {
          show: () => this._emit('buffering', { visible: true }),
          hide: () => this._emit('buffering', { visible: false }),
        },
        (fatalMsg: string) => {
          this._log('error', `bridge: ${fatalMsg}`);
          this._emit('fatal', { msg: fatalMsg });
          this._teardown();
        },
      );
      this._discSlotMap.set(chdUrl, { slot: 0, path: '/game.chd', chdTotal: remote0.total });
      this._currentDiscUrl = chdUrl;
      this._nextDiscSlot = 1;
      this._worker!.postMessage({
        type: MSG.CD,
        url: chdUrl,
        chdTotal: remote0.total,
        pal: this._pal,
      });
      this._log('info', 'loadDisc: cd message posted (no buffer)');
      if (onProgress) {
        this._progressInterval = setInterval(() => {
          if (!this._remoteChd || !this._remoteChd.total) return;
          onProgress(this._remoteChd.getStats().bytesIn / this._remoteChd.total);
        }, 100);
      }
    } catch (err) {
      if (this._progressInterval) {
        clearInterval(this._progressInterval);
        this._progressInterval = null;
      }
      throw err;
    }

    await new Promise<void>((resolve, reject) => {
      this._loadDiscResolve = resolve;
      this._loadDiscReject = reject;
    });
  }

  /** Resumes the AudioContext (user-gesture-initiated) + posts RUN_START. */
  async start() {
    if (this._destroyed) throw new Error('Emulator.start: destroyed');
    if (this._state !== 'loaded' && this._state !== 'stopped') {
      throw new Error(`Emulator.start: invalid state ${this._state} (call loadDisc() first)`);
    }
    if (this._audio.audioCtx) {
      this._audio.resume().then(() => {
        this._audio.reconnectGain();
        this._audio.startHeartbeat();
      });
    }
    this._state = 'running';
    this._log('info', 'Start pressed; posting run:start');
    this._worker!.postMessage({ type: MSG.RUN_START });
  }

  /** Posts RUN_STOP. Safe to call when stopped. */
  stop() {
    if (this._destroyed) return;
    if (!this._worker) return;
    this._log('info', 'Stop pressed; posting run:stop');
    this._audio.stopHeartbeat();
    this._worker.postMessage({ type: MSG.RUN_STOP });
  }

  setPortDevice(port: number, device: number) {
    if (this._destroyed || !this._worker) return;
    if (port < 0 || port >= MAX_PORTS) return;
    if (typeof device !== 'number') return;

    this._log('info', `setPortDevice: port ${port} → device=0x${device.toString(16)}`);
    this._worker.postMessage({
      type: MSG.SET_CONTROLLER_DEVICE,
      port,
      device,
    });
  }

  setButtons(port: number, bitmask: number) {
    if (port < 0 || port >= MAX_PORTS) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES, 16);
    Atomics.store(view, 0, bitmask | 0);
  }

  orEdgeBits(port: number, bits: number) {
    if (port < 0 || port >= MAX_PORTS || !bits) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES + INPUT_OFF_EDGE, 1);
    Atomics.or(view, 0, bits | 0);
  }

  setAnalog(port: number, stick: 'left' | 'right', x: number, y: number) {
    if (port < 0 || port >= MAX_PORTS) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES, 16);
    const slot = stick === 'right' ? 2 : 1;
    const ix = this._axisToInt16(x);
    const iy = this._axisToInt16(y);
    Atomics.store(view, slot, ix | (iy << 16) | 0);
  }

  setMouseDelta(port: number, dx: number, dy: number) {
    if (port < 0 || port >= MAX_PORTS) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES, 16);
    const packed = (dx & 0xffff) | ((dy & 0xffff) << 16) | 0;
    Atomics.store(view, INPUT_OFF_MOUSE_PACK / 4, packed);
  }

  setLightgunPosition(port: number, x: number, y: number) {
    if (port < 0 || port >= MAX_PORTS) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES, 16);
    const packed = (x & 0xffff) | ((y & 0xffff) << 16) | 0;
    Atomics.store(view, INPUT_OFF_LIGHTGUN_PACK / 4, packed);
  }

  clearInput(port: number) {
    if (port < 0 || port >= MAX_PORTS) return;
    const view = new Int32Array(this._inputSAB, port * INPUT_PORT_BYTES, 16);
    for (let i = 0; i < 16; i++) Atomics.store(view, i, 0);
  }

  /** @private */
  _axisToInt16(v: number) {
    const DEADZONE = 0.08;
    const ANALOG_MAX = 0x7fff;
    let a = Math.max(-1, Math.min(1, Number(v) || 0));
    if (Math.abs(a) < DEADZONE) a = 0;
    return Math.round(a * ANALOG_MAX) & 0xffff;
  }

  /** 0..1 master gain. */
  setVolume(v: number) {
    this._audio.setVolume(v);
  }

  setFastForwardMode(mode: '1x' | '2x') {
    if (!this._worker) return;
    this._worker.postMessage({ type: MSG.SET_SPEED_MODE, mode });
  }

  setCrt(on: boolean) {
    if (this._worker) this._worker.postMessage({ type: MSG.CRT_TOGGLE, on: !!on });
    this._log('info', `crt: ${on ? 'on' : 'off'}`);
  }
  setCrtParam(key: string, value: number) {
    if (this._worker) this._worker.postMessage({ type: MSG.CRT_PARAM, key, value });
  }

  /** Reads videoSAB, returns a PNG Blob (or null if no frame yet). */
  async screenshot(): Promise<Blob | null> {
    const header = new Int32Array(this._videoSAB, 0, 4);
    const w = Atomics.load(header, 1);
    const h = Atomics.load(header, 2);
    if (w <= 0 || h <= 0) {
      this._log('warn', 'screenshot: no frame available');
      return null;
    }
    const pitch = Atomics.load(header, 3);
    const px16 = new Uint16Array(this._videoSAB, VIDEO_HEADER_BYTES);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(w, h);
    const rgba = new Uint32Array(imageData.data.buffer);
    const rowWords = pitch >>> 1;
    for (let y = 0; y < h; y++) {
      const srcOff = y * rowWords;
      const dstOff = y * w;
      for (let x = 0; x < w; x++) {
        rgba[dstOff + x] = RGB565_TO_RGBA[px16[srcOff + x]];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }

  /** Resolves with the card image bytes, or null if the slot is empty. Rejects on worker error. */
  exportMemcard(slot: number): Promise<Uint8Array | null> {
    this._assertAlive();
    if (slot !== 1 && slot !== 2)
      return Promise.reject(new Error('exportMemcard: slot must be 1 or 2'));
    if (this._memcardExportPromises.has(slot))
      return Promise.reject(new Error(`exportMemcard: slot ${slot} already in progress`));
    return new Promise((resolve, reject) => {
      this._memcardExportPromises.set(slot, { resolve, reject });
      this._worker!.postMessage({ type: MSG.MEMCARD_EXPORT, slot });
    });
  }

  /** Resolves on success; rejects with the worker's error string. */
  importMemcard(slot: number, buf: ArrayBuffer): Promise<void> {
    this._assertAlive();
    if (slot !== 1 && slot !== 2)
      return Promise.reject(new Error('importMemcard: slot must be 1 or 2'));
    if (this._memcardImportPromises.has(slot))
      return Promise.reject(new Error(`importMemcard: slot ${slot} already in progress`));
    return new Promise((resolve, reject) => {
      this._memcardImportPromises.set(slot, { resolve, reject });
      const copy = buf.slice(0);
      this._worker!.postMessage({ type: MSG.MEMCARD_IMPORT, slot, buf: copy }, [copy]);
    });
  }

  /** Fire-and-forget flush (also driven internally on visibilitychange=hidden). */
  flushMemcards() {
    if (!this._worker || this._destroyed) return;
    this._worker.postMessage({ type: MSG.MEMCARD_FLUSH });
  }

  /** Send caller-supplied memcard bytes to the worker. The client loads these
   *  from its own persistence (IDB / cloud) and passes them in. Posts
   *  MEMCARD_IMPORT per slot (when data exists) then a final MEMCARD_IMPORT_DONE
   *  so the worker can await completion before host_load -> load_memcards reads
   *  the files. The Emulator itself never touches IndexedDB. */
  sendMemcardsToWorker(cards: ReadonlyMap<number, Uint8Array | null>): void {
    for (const slot of [1, 2]) {
      const bytes = cards.get(slot);
      if (bytes && bytes.byteLength > 0) {
        const copy = bytes.buffer.slice(0);
        this._worker!.postMessage({ type: MSG.MEMCARD_IMPORT, slot, buf: copy }, [copy]);
        this._log('info', `memcard ${slot} sent to worker (${bytes.byteLength} bytes)`);
      }
    }
    this._worker?.postMessage({ type: MSG.MEMCARD_IMPORT_DONE });
  }

  /** Stops the Speculator + calls RemoteChd.evict(). Does not reload the page. */
  async evictCache() {
    if (this._bridge && this._bridge.stopSpeculator) this._bridge.stopSpeculator();
    if (this._remoteChd) {
      try {
        await this._remoteChd.evict();
      } catch (e: any) {
        this._log('error', `evict failed: ${e && e.message ? e.message : e}`);
        throw e;
      }
    }
    this._log('info', 'Cache evicted');
  }

  /** Sync stats snapshot (worker stats merged with RemoteChd.getStats()). */
  getStats() {
    return this._lastStats || {};
  }

  /** Serializes the running core to an ArrayBuffer (null if no game / empty). */
  saveState(slot: number | string): Promise<ArrayBuffer | null> {
    this._assertAlive();
    if (!(slot === Emulator.SLOT_AUTO || Number.isInteger(slot)))
      return Promise.reject(new Error('saveState: slot must be an integer or SLOT_AUTO'));
    if (this._saveStatePromises.has(slot))
      return Promise.reject(new Error(`saveState: slot ${slot} already in progress`));
    return new Promise((resolve, reject) => {
      this._saveStatePromises.set(slot, { resolve, reject });
      this._worker!.postMessage({ type: MSG.SAVE_STATE, slot });
    });
  }

  /** Restores a previously serialized state. Rejects on incompatible/empty. */
  async loadState(slot: number | string, buf: ArrayBuffer): Promise<void> {
    this._assertAlive();
    if (!(slot === Emulator.SLOT_AUTO || Number.isInteger(slot)))
      return Promise.reject(new Error('loadState: slot must be an integer or SLOT_AUTO'));
    if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0)
      return Promise.reject(new Error('loadState: buf must be a non-empty ArrayBuffer'));

    if (this._loadStatePromises.has(slot))
      return Promise.reject(new Error(`loadState: slot ${slot} already in progress`));
    return new Promise((resolve, reject) => {
      this._loadStatePromises.set(slot, { resolve, reject });
      const copy = buf.slice(0);
      this._worker!.postMessage({ type: MSG.LOAD_STATE, slot, buf: copy }, [copy]);
    });
  }

  /**
   * Swap to a different disc by URL. No-op if already on that disc.
   * Registers the disc with the core on first use (up to 8 unique URLs).
   * Streaming path only.
   */
  async swapDisc(url: string, opts?: SwapDiscRequest) {
    if (this._destroyed) throw new Error('swapDisc: destroyed');
    if (!url || typeof url !== 'string')
      throw new Error('swapDisc: url must be a non-empty string');
    if (url === this._currentDiscUrl) return;
    if (opts && typeof opts.pal === 'boolean') this._pal = opts.pal;
    await this._doSwapDisc(url);
  }

  private async _doSwapDisc(url: string) {
    let entry = this._discSlotMap.get(url);
    let needsRegister = false;
    if (!entry) {
      const slot = this._nextDiscSlot++;
      if (slot >= 8) throw new Error('swapDisc: maximum 8 unique disc URLs exceeded');
      const path = `/game_${slot}.chd`;
      entry = { slot, path, chdTotal: 0 };
      needsRegister = true;
    }

    if (this._bridge?.stopSpeculator) this._bridge.stopSpeculator();

    const newRemote = new RemoteChd(url, { cacheEnabled: this._cacheEnabled });
    await newRemote.open();

    if (needsRegister) entry.chdTotal = newRemote.total;
    this._discSlotMap.set(url, entry);

    this._bridge!.swapRemoteChd(newRemote);
    this._remoteChd = newRemote;

    this._worker!.postMessage({
      type: MSG.SWAP_DISC,
      slot: entry.slot,
      path: entry.path,
      chdTotal: entry.chdTotal,
      needsRegister,
      pal: this._pal,
    });

    await new Promise<void>((resolve, reject) => {
      this._swapDiscPromise = { resolve, reject };
    });

    this._currentDiscUrl = url;
    this._bridge!.startSpeculator();
    this._log('info', `swapDisc complete: ${url}`);
    this._emit('disc-swapped', { url });
  }

  /** Cached game serial (e.g. "SLUS94465"), or null before LOADED. */
  getCdromId() {
    return this._cdromId;
  }

  /** URL of the currently loaded disc, or null. */
  getCurrentDiscUrl() {
    return this._currentDiscUrl;
  }

  _rejectAllPending(err: Error) {
    if (this._initReject) {
      const r = this._initReject;
      this._initReject = null;
      r(err);
    }
    if (this._loadDiscReject) {
      const r = this._loadDiscReject;
      this._loadDiscReject = null;
      r(err);
    }
    rejectAll(this._memcardExportPromises, err);
    rejectAll(this._memcardImportPromises, err);
    rejectAll(this._saveStatePromises, err);
    rejectAll(this._loadStatePromises, err);
    if (this._swapDiscPromise) {
      this._swapDiscPromise.reject(err);
      this._swapDiscPromise = null;
    }
  }

  _teardown() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    this._audio.dispose();
    if (this._bridge) {
      if (this._bridge.dispose) {
        try {
          this._bridge.dispose();
        } catch (e: any) {
          this._log('warn', `bridge.dispose failed: ${e && e.message ? e.message : e}`);
        }
      } else if (this._bridge.stopSpeculator) {
        try {
          this._bridge.stopSpeculator();
        } catch (e: any) {
          this._log('warn', `bridge.stopSpeculator failed: ${e && e.message ? e.message : e}`);
        }
      }
      this._bridge = null;
    }
    if (this._worker) {
      try {
        this._worker.terminate();
      } catch (e: any) {
        this._log('warn', `worker.terminate failed: ${e && e.message ? e.message : e}`);
      }
      this._worker = null;
    }
    if (this._boundOnVisibilityChange) {
      document.removeEventListener('visibilitychange', this._boundOnVisibilityChange);
      this._boundOnVisibilityChange = null;
    }
    this._remoteChd = null;
  }

  /** Tear down all live resources. Idempotent. Instance unusable afterwards. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._state = 'destroyed';
    this._teardown();
    rejectAll(this._memcardExportPromises, new Error('Emulator destroyed'));
    rejectAll(this._memcardImportPromises, new Error('Emulator destroyed'));
    rejectAll(this._saveStatePromises, new Error('Emulator destroyed'));
    rejectAll(this._loadStatePromises, new Error('Emulator destroyed'));
    if (this._swapDiscPromise) {
      this._swapDiscPromise.reject(new Error('Emulator destroyed'));
      this._swapDiscPromise = null;
    }
  }
}
