'use strict';

import { audioHeaderView, videoHeaderView, videoPixelView } from '../sab/layout';
import { MSG } from '../messages';
import { WorkerContext, post, logInfo, logWarn, logError, BOOT, bootHas } from './context';
import { flushMemcards, handleMemcardExport, handleMemcardImport } from './memcard';
import { handleSaveState, handleLoadState } from './save-load';
import { warmupTick, readFps } from './audio-clock';
import {
  handleInit,
  handleBios,
  handleChd,
  handleCd,
  handleSwapDisc,
  tryInitAndLoad,
} from './boot';
const ctx: WorkerContext = {
  Module: null,
  cfunc: null,
  sabs: null,
  gl: null,
  blit: null,
  crt: null,
  canvas: null,
  wholeFile: false,
  bootState: 0,
  initInProgress: false,
  memcardImportDoneResolve: null,
  memcardImportDoneTimer: null,
  audioTickPort: null,
  audioClockActive: false,
  audioTickCount: 0,
  warmupLeft: 0,
  retroRunCount: 0,
  fpsCounter: 0,
  masterN: 6,
  ticksPerFrame: 1,
  frameAccumulator: 0,
  workletQuantum: 0,
  workletSampleRate: 0,
  timingFps: 0,
  lastW: 0,
  lastH: 0,
  lastPitch: 0,
  chdTotal: 0,
  frameCount: 0,
  lastAudioWrite: 0,
  audioFrameCount: 0,
  crtOn: false,
  crtBezel: false,
};

let messageQueue: any[] = [];
let workerReady = false;

post({ type: 'log', level: 'info', msg: 'worker: script loaded' });

self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  post({
    type: 'fatal',
    msg: 'unhandledrejection: ' + ((e.reason && e.reason.stack) || String(e.reason)),
  });
});

self.addEventListener('error', (e: ErrorEvent) => {
  post({
    type: 'fatal',
    msg: 'worker error: ' + ((e.error && e.error.stack) || e.message || String(e)),
  });
});

const _TextDecoder = typeof self.TextDecoder === 'function' ? self.TextDecoder : null;
if (_TextDecoder) {
  (self as any).TextDecoder = undefined;
  logInfo('worker: disabled global TextDecoder (ALLOW_MEMORY_GROWTH workaround)');
}

self.onmessage = (e: MessageEvent) => {
  logInfo(
    `worker: onmessage fired (ready=${workerReady}), type=${(e.data && e.data.type) || 'undefined'}`,
  );
  if (!workerReady) {
    messageQueue.push(e.data);
    logInfo(`worker: buffered message, queue length=${messageQueue.length}`);
    return;
  }
  dispatch(e.data);
};

function paintFromSab() {
  if (ctx.wholeFile) {
    post({ type: MSG.FRAME });
    return;
  }
  if (!ctx.gl || !ctx.blit || !ctx.canvas) return;
  const hdr = videoHeaderView(ctx.sabs.videoSAB);
  const w = Atomics.load(hdr, 1);
  const h = Atomics.load(hdr, 2);
  const pitch = Atomics.load(hdr, 3);
  if (w === 0 || h === 0) return;
  if (w !== ctx.lastW || h !== ctx.lastH) {
    ctx.blit.resize(w, h);
    if (ctx.crt) ctx.crt.setSourceTexture(ctx.blit.fboTexture, w, h);
    ctx.lastW = w;
    ctx.lastH = h;
    ctx.lastPitch = pitch;
    logInfo(`worker: video frame size changed to ${w}x${h} pitch=${pitch}`);
  }
  const px = videoPixelView(ctx.sabs.videoSAB);
  ctx.blit.draw(px, w, h, pitch);
  if (ctx.crtOn && ctx.crt) {
    ctx.crt.render();
  } else {
    ctx.blit.drawToCanvas(ctx.canvas.width, ctx.canvas.height);
  }
}

function dispatch(msg: any) {
  if (!msg || typeof msg !== 'object') {
    logWarn(`dropping non-object message: ${JSON.stringify(msg)}`);
    return;
  }
  try {
    logInfo(`worker: dispatch type=${msg.type}`);
    switch (msg.type) {
      case MSG.INIT:
        return handleInit(ctx, msg, paintFromSab);
      case MSG.BIOS:
        handleBios(ctx, msg);
        tryInitAndLoad(ctx, paintFromSab);
        return;
      case MSG.CHD:
        handleChd(ctx, msg);
        tryInitAndLoad(ctx, paintFromSab);
        return;
      case MSG.CD:
        handleCd(ctx, msg);
        tryInitAndLoad(ctx, paintFromSab);
        return;
      case MSG.RUN_START:
        return handleRunStart();
      case MSG.RUN_STOP:
        return handleRunStop();
      case MSG.CRT_TOGGLE:
        ctx.crtOn = !!msg.on;
        logInfo(`worker: crt ${ctx.crtOn ? 'on' : 'off'}`);
        return;
      case MSG.CRT_PARAM:
        if (ctx.crt && typeof msg.key === 'string') ctx.crt.params[msg.key] = msg.value;
        return;
      case MSG.MEMCARD_EXPORT:
        return handleMemcardExport(ctx, msg);
      case MSG.MEMCARD_IMPORT:
        return handleMemcardImport(ctx, msg);
      case MSG.MEMCARD_IMPORT_DONE: {
        if (ctx.memcardImportDoneTimer) {
          clearTimeout(ctx.memcardImportDoneTimer);
          ctx.memcardImportDoneTimer = null;
        }
        if (ctx.memcardImportDoneResolve) {
          const r = ctx.memcardImportDoneResolve;
          ctx.memcardImportDoneResolve = null;
          r();
        }
        return;
      }
      case MSG.MEMCARD_FLUSH:
        return void flushMemcards(ctx);
      case MSG.SAVE_STATE:
        return handleSaveState(ctx, msg);
      case MSG.LOAD_STATE:
        return handleLoadState(ctx, msg);
      case MSG.SET_CONTROLLER_DEVICE:
        return handleSetControllerDevice(msg);
      case MSG.SWAP_DISC:
        return handleSwapDisc(ctx, msg);
      default:
        logWarn(`unknown message: ${JSON.stringify(msg)}`);
    }
  } catch (err: any) {
    const errMsg = err && err.stack ? err.stack : String(err);
    console.error('worker dispatch error:', errMsg);
    post({ type: 'fatal', msg: errMsg });
  }
}

function handleRunStart() {
  if (!bootHas(ctx, BOOT.GAME)) {
    post({ type: 'fatal', msg: 'run:start received before load' });
    return;
  }
  if (ctx.frameCount > 0) return;
  logInfo(`emulation starting (wholeFile=${ctx.wholeFile})`);
  if (ctx.wholeFile) {
    tick();
  } else {
    ctx.warmupLeft = 10;
    warmupTick(ctx, paintFromSab);
  }
}

function handleRunStop() {
  ctx.frameCount = -1;
  ctx.audioClockActive = false;
  ctx.warmupLeft = 0;
  flushMemcards(ctx);
  logInfo('worker: emulation stopped');
  post({ type: MSG.RUN_STOPPED });
}

function handleSetControllerDevice(msg: any) {
  const { port, device } = msg;
  if (!ctx.Module || typeof port !== 'number' || typeof device !== 'number') {
    post({ type: MSG.SET_CONTROLLER_DEVICE_RESULT, ok: false, port, device });
    return;
  }
  if (!ctx.cfunc.host_set_controller_port_device) {
    logError(
      'worker: host_set_controller_port_device not available — WASM core needs rebuilding (npm run build:core)',
    );
    post({ type: MSG.SET_CONTROLLER_DEVICE_RESULT, ok: false, port, device });
    return;
  }
  ctx.cfunc.host_set_controller_port_device(port, device);
  post({ type: MSG.SET_CONTROLLER_DEVICE_RESULT, ok: true, port, device });
}

function tick() {
  if (ctx.frameCount < 0) return;
  ctx.cfunc.host_run_frame();
  ctx.frameCount++;
  ctx.fpsCounter++;
  const audioHdr = audioHeaderView(ctx.sabs.audioSAB);
  const writeIdx = Atomics.load(audioHdr, 0);
  if (writeIdx !== ctx.lastAudioWrite) {
    let produced = writeIdx - ctx.lastAudioWrite;
    if (produced < 0) produced += 3840;
    ctx.audioFrameCount += produced;
    ctx.lastAudioWrite = writeIdx;
  }
  post({ type: MSG.FRAME });
  setTimeout(tick, 0);
}

(async function main() {
  try {
    logInfo('worker: calling ModuleFactory (fetch + blob; TextDecoder already neutered)');
    const pcsxResponse = await fetch('/pcsx_rearmed.js');
    const pcsxCode = await pcsxResponse.text();
    const pcsxBlob = new Blob([pcsxCode], { type: 'text/javascript' });
    const pcsxBlobUrl = URL.createObjectURL(pcsxBlob);
    const mod = await import(pcsxBlobUrl);
    URL.revokeObjectURL(pcsxBlobUrl);
    const ModuleFactory = mod.default;
    ctx.Module = await ModuleFactory({
      noInitialRun: true,
      locateFile: (path: string) => `/${path}`,
      print: (text: string) => logInfo(text),
      printErr: (text: string) => logWarn(text),
    });
    logInfo('worker: ModuleFactory resolved');

    ctx.cfunc = {
      sab_init: ctx.Module._sab_init,
      host_init: ctx.Module.cwrap('host_init', 'number', []),
      host_load: ctx.Module.cwrap('host_load', 'number', ['string']),
      host_run_frame: ctx.Module.cwrap('host_run_frame', 'void', []),
      host_get_system_info: ctx.Module.cwrap('host_get_system_info', 'void', ['number', 'number']),
      host_serialize_size: ctx.Module.cwrap('host_serialize_size', 'number', []),
      host_save_state: ctx.Module.cwrap('host_save_state', 'number', ['number', 'number']),
      host_load_state: ctx.Module.cwrap('host_load_state', 'number', ['number', 'number']),
      host_set_controller_port_device:
        typeof ctx.Module._host_set_controller_port_device === 'function'
          ? ctx.Module.cwrap('host_set_controller_port_device', null, ['number', 'number'])
          : null,
      host_swap_disc: ctx.Module.cwrap('host_swap_disc', 'number', ['number']),
      host_register_disc: ctx.Module.cwrap('host_register_disc', 'number', ['number', 'string']),
      host_get_cdrom_id: ctx.Module.cwrap('host_get_cdrom_id', 'number', []),
      streaming_init: ctx.Module.cwrap('streaming_core_file_init', 'void', ['number', 'number']),
      malloc: ctx.Module._malloc,
      free: ctx.Module._free,
      fs_write_file: ctx.Module.FS_writeFile,
    };
    logInfo(
      `worker: cfunc wired (_sab_init=${typeof ctx.cfunc.sab_init}, host_init=${typeof ctx.cfunc.host_init})`,
    );

    ctx.Module._onStreamingIo = () => self.postMessage({ type: 'io' });
    logInfo('worker: Module._onStreamingIo installed');

    setInterval(() => {
      const fps = ctx.fpsCounter;
      ctx.fpsCounter = 0;
      const audioOverrunCount = ctx.Module['_audioOverrunCount'] | 0;
      const streamLocalHits = ctx.Module['_streamLocalHits'] | 0;
      const streamLocalMisses = ctx.Module['_streamLocalMisses'] | 0;
      const streamLocalRefills = ctx.Module['_streamLocalRefills'] | 0;
      const streamLocalRefillBytes = ctx.Module['_streamLocalRefillBytes'] | 0;
      post({
        type: MSG.STATS,
        fps,
        retroRunCount: ctx.retroRunCount,
        audioTickCount: ctx.audioTickCount,
        masterN: ctx.masterN,
        wholeFile: ctx.wholeFile,
        audioOverrunCount,
        streamLocalHits,
        streamLocalMisses,
        streamLocalRefills,
        streamLocalRefillBytes,
        audioClockActive: ctx.audioClockActive,
        targetFps: readFps(ctx),
        ticksPerFrame: ctx.ticksPerFrame,
      });
    }, 1000);

    workerReady = true;
    logInfo(`worker: ready, flushing ${messageQueue.length} queued message(s)`);
    while (messageQueue.length > 0) {
      dispatch(messageQueue.shift());
    }
  } catch (err: any) {
    post({ type: 'fatal', msg: err && err.stack ? err.stack : String(err) });
  }
})();
