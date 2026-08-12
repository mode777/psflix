'use strict';

// ── Narrow interfaces documenting WorkerContext's `any`-typed fields ──
// These are documentation-only; the actual fields use `any` because they
// start as null and are assigned in main(). The interfaces document the
// expected shape for consumers.

export interface PcsxModule {
  _sab_init: (a: SharedArrayBuffer, b: SharedArrayBuffer, c: SharedArrayBuffer) => void;
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => (...args: any[]) => any;
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  UTF8ToString: (ptr: number, max?: number) => string;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _malloc: (n: number) => number;
  _free: (ptr: number) => void;
  FS_readFile: (path: string) => Uint8Array;
  FS_writeFile: (path: string, data: Uint8Array) => void;
  FS_readdir: (path: string) => string[];
  FS_stat: (path: string) => { mode: number; size: number };
  FS_mkdir: (path: string) => void;
  _onStreamingIo?: () => void;
  [key: string]: any;
}

export interface CFuncTable {
  sab_init: (a: SharedArrayBuffer, b: SharedArrayBuffer, c: SharedArrayBuffer) => void;
  host_init: () => number;
  host_load: (path: string) => number;
  host_run_frame: () => void;
  host_get_system_info: (buf: number, len: number) => void;
  host_serialize_size: () => number;
  host_save_state: (buf: number, size: number) => number;
  host_load_state: (buf: number, size: number) => number;
  host_set_controller_port_device: ((port: number, device: number) => void) | null;
  host_swap_disc: (slot: number) => number;
  host_register_disc: (slot: number, path: string) => number;
  host_get_cdrom_id: () => number;
  streaming_init: (lo: number, hi: number) => void;
  malloc: (n: number) => number;
  free: (ptr: number) => void;
  fs_write_file: (path: string, data: Uint8Array) => void;
  [key: string]: any;
}

export interface Sabs {
  videoSAB: SharedArrayBuffer;
  audioSAB: SharedArrayBuffer;
  inputSAB: SharedArrayBuffer;
  controlSAB: SharedArrayBuffer;
  dataSAB: SharedArrayBuffer;
}

export interface WorkerContext {
  Module: any; // PcsxModule after main()
  cfunc: any; // CFuncTable after main()
  sabs: any; // Sabs after handleInit()
  gl: WebGL2RenderingContext | null;
  blit: any;
  crt: any;
  canvas: OffscreenCanvas | null;
  wholeFile: boolean;
  bootState: number;
  initInProgress: boolean;
  memcardImportDoneResolve: (() => void) | null;
  memcardImportDoneTimer: any;
  audioTickPort: MessagePort | null;
  audioClockActive: boolean;
  audioTickCount: number;
  warmupLeft: number;
  retroRunCount: number;
  fpsCounter: number;
  masterN: number;
  ticksPerFrame: number;
  frameAccumulator: number;
  speedMultiplier: number;
  framesSincePaint: number;
  workletQuantum: number;
  workletSampleRate: number;
  /**
   * Override for the frame-clock fps (0 = use the core's reported AV_FPS).
   * Set to PAL_FPS (50) for PAL discs so they don't run too fast — the core
   * publishes 60 fps at host_init (pre-load) and never republishes after the
   * game's PAL region is detected.
   */
  timingFps: number;
  lastW: number;
  lastH: number;
  lastPitch: number;
  chdTotal: number;
  frameCount: number;
  lastAudioWrite: number;
  audioFrameCount: number;
  crtOn: boolean;
  crtBezel: boolean;
}

export function logInfo(msg: string) {
  self.postMessage({ type: 'log', level: 'info', msg });
}
export function logWarn(msg: string) {
  self.postMessage({ type: 'log', level: 'warn', msg });
}
export function logError(msg: string) {
  self.postMessage({ type: 'log', level: 'error', msg });
}
export function post(msg: any, transfer?: Transferable[]) {
  self.postMessage(msg, { transfer: transfer ?? [] });
}

export const BOOT = { BIOS: 1, CD: 2, GAME: 4 };
export function bootHas(ctx: WorkerContext, flag: number) {
  return (ctx.bootState & flag) === flag;
}

export const MEMCARD_SLOTS = [1, 2];
export const memcardPath = (slot: number) => `/saves/pcsx-card${slot}.mcd`;

export function getCdromId(ctx: WorkerContext): string {
  const ptr = ctx.cfunc.host_get_cdrom_id();
  return ctx.Module.UTF8ToString(ptr, 9);
}

// ALLOW_MEMORY_GROWTH makes TextDecoder choke on resizable HEAP views; the
// worker neuters the global TextDecoder at load time (see coreWorker.ts).
// Capture the original reference here before that happens so readSystemInfo
// can still use it without re-checking the neutered global every call.
type TextDecoderCtor = { new (label?: string): { decode: (input: Uint8Array) => string } };
const _TextDecoder: TextDecoderCtor | null =
  typeof self.TextDecoder === 'function' ? (self as any).TextDecoder : null;
export function getTextDecoder(): TextDecoderCtor | null {
  return _TextDecoder;
}
