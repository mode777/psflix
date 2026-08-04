'use strict';

import { MSG } from '../messages';
import { AUDIO_CAPACITY_FRAMES, audioHeaderView } from '../sab/layout';
import { createBlit } from './gl/blit';
import { CRTShader } from './gl/crt-shader';
import {
  WorkerContext,
  post,
  logInfo,
  logWarn,
  logError,
  BOOT,
  bootHas,
  getTextDecoder,
  getCdromId,
} from './context';
import { sampleRate, readFps, recomputeMasterN, onAudioTick } from './audio-clock';
import { startMemcardFlushPoll } from './memcard';

export async function handleInit(ctx: WorkerContext, msg: any, paintFromSab: () => void) {
  logInfo('worker: init received');
  ctx.sabs = msg.sabs;
  ctx.wholeFile = !!msg.wholeFile;
  ctx.audioTickPort = msg.audioTickPort || null;
  ctx.workletSampleRate =
    typeof msg.audioContextSampleRate === 'number' && msg.audioContextSampleRate > 0
      ? msg.audioContextSampleRate
      : 48000;
  logInfo(
    `worker: SABs video=${ctx.sabs.videoSAB.byteLength} audio=${ctx.sabs.audioSAB.byteLength} input=${ctx.sabs.inputSAB.byteLength} control=${(ctx.sabs.controlSAB && ctx.sabs.controlSAB.byteLength) || 0} data=${(ctx.sabs.dataSAB && ctx.sabs.dataSAB.byteLength) || 0} wholeFile=${ctx.wholeFile} workletSampleRate=${ctx.workletSampleRate}`,
  );

  ctx.cfunc.sab_init(ctx.sabs.videoSAB, ctx.sabs.audioSAB, ctx.sabs.inputSAB);
  logInfo('worker: _sab_init done');
  const audioHdr = audioHeaderView(ctx.sabs.audioSAB);
  Atomics.store(audioHdr, 2, AUDIO_CAPACITY_FRAMES);

  const info = readSystemInfo(ctx);
  logInfo(`worker: system info: ${info}`);
  post({ type: MSG.READY, info });
  logInfo('worker: ready posted (host_init deferred until BIOS+CHD in MEMFS)');

  if (!ctx.wholeFile) {
    ctx.canvas = msg.canvas;
    if (!ctx.canvas) {
      post({ type: 'fatal', msg: 'init: wholeFile=false but no OffscreenCanvas was transferred' });
      return;
    }
    ctx.gl = ctx.canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!ctx.gl) {
      post({ type: 'fatal', msg: 'WebGL2 not supported in this worker' });
      return;
    }
    ctx.canvas.addEventListener(
      'webglcontextlost',
      (ev: Event) => {
        ev.preventDefault();
        post({ type: 'fatal', msg: 'WebGL context lost' });
      },
      false,
    );
    ctx.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        logWarn('worker: WebGL context restored (no in-place recovery; reload required)');
      },
      false,
    );
    ctx.blit = await createBlit(ctx.gl);
    // Canvas is fixed 1440x960 CRT output.
    ctx.canvas.width = 1440;
    ctx.canvas.height = 960;
    logInfo('worker: WebGL2 blit ready (native-res FBO, CRT out 1440x960)');
    // displayAspect pins letterbox to canvas aspect ratio (3:2).
    ctx.crt = new CRTShader(ctx.gl, {
      letterbox: true,
      displayAspect: ctx.canvas.width / ctx.canvas.height,
    });
    ctx.crt.setSourceTexture(ctx.blit.fboTexture, 1, 1);
    ctx.crtOn = true;
    ctx.crtBezel = false;
    logInfo(
      `worker: CRT effect armed (newpixie-crt, letterbox=true, bezel=${ctx.crtBezel ? 'on' : 'off (no asset bundled)'})`,
    );
    if (ctx.audioTickPort) {
      ctx.audioTickPort.onmessage = (e: MessageEvent) => onAudioTick(ctx, e, paintFromSab);
      logInfo('worker: audioTickPort.onmessage wired');
    } else {
      post({ type: 'fatal', msg: 'init: wholeFile=false but no audioTickPort was transferred' });
      return;
    }
  }
}

export function readSystemInfo(ctx: WorkerContext): string {
  const bufLen = 256;
  const buf = ctx.cfunc.malloc(bufLen);
  try {
    ctx.Module.ccall('host_get_system_info', 'void', ['number', 'number'], [buf, bufLen]);
    const heap = ctx.Module.HEAPU8;
    let end = buf;
    while (end < buf + bufLen && heap[end] !== 0) end++;
    const copy = new Uint8Array(end - buf);
    copy.set(heap.subarray(buf, end));
    const _TextDecoder = getTextDecoder();
    if (_TextDecoder) {
      return new _TextDecoder('utf-8').decode(copy);
    }
    let out = '';
    for (let i = 0; i < copy.length; i++) out += String.fromCharCode(copy[i]);
    return out;
  } finally {
    ctx.cfunc.free(buf);
  }
}

export function tryInitAndLoad(ctx: WorkerContext, _paintFromSab: () => void) {
  if (bootHas(ctx, BOOT.GAME) || ctx.initInProgress) return;
  if (!bootHas(ctx, BOOT.BIOS) || !bootHas(ctx, BOOT.CD)) return;
  ctx.initInProgress = true;
  logInfo('worker: calling host_init (BIOS+CHD in MEMFS)');
  const rcInit = ctx.cfunc.host_init();
  logInfo(`worker: host_init returned rc=${rcInit}`);
  if (rcInit !== 0) {
    post({ type: 'fatal', msg: `host_init failed (rc=${rcInit})` });
    ctx.initInProgress = false;
    return;
  }

  const memcardsReady = new Promise<void>((resolve) => {
    ctx.memcardImportDoneResolve = resolve;
    ctx.memcardImportDoneTimer = setTimeout(() => {
      logWarn(
        'worker: memcard restore timed out; proceeding with host_load (core will create fresh cards)',
      );
      ctx.memcardImportDoneResolve = null;
      resolve();
    }, 10000);
  });
  post({ type: MSG.MEMCARD_LOAD_REQUEST });

  async function runAfterMemcards() {
    await memcardsReady;
    const sr = sampleRate(ctx);
    const fps = readFps(ctx);
    if (sr > 0 && fps > 0 && ctx.workletSampleRate > 0 && !ctx.wholeFile) {
      ctx.workletQuantum = 128;
      recomputeMasterN(ctx, 'init');
    } else {
      ctx.masterN = 1;
      ctx.ticksPerFrame = 1;
      logInfo(
        `worker: spu_sr=${sr} Hz, fps=${fps.toFixed(4)}, worklet_sr=${ctx.workletSampleRate} (wholeFile=${ctx.wholeFile}); using masterN=1`,
      );
    }
    const info = readSystemInfo(ctx);
    logInfo(`worker: system info (post-init): ${info}`);

    const rcLoad = ctx.cfunc.host_load('/game.chd');
    logInfo(`worker: host_load returned rc=${rcLoad}`);
    if (rcLoad !== 0) {
      post({ type: 'fatal', msg: `host_load failed (rc=${rcLoad})` });
      return;
    }
    ctx.bootState |= BOOT.GAME;
    ctx.initInProgress = false;
    startMemcardFlushPoll(ctx);
    const cdromId = getCdromId(ctx);
    post({ type: MSG.LOADED, cdromId });
  }

  // Return the promise so caller can await
  return runAfterMemcards();
}

export function handleBios(ctx: WorkerContext, msg: any) {
  if (!ctx.sabs) {
    post({ type: 'fatal', msg: 'bios received before init' });
    return;
  }
  ctx.cfunc.fs_write_file('/scph1001.bin', new Uint8Array(msg.buf));
  ctx.bootState |= BOOT.BIOS;
  logInfo('BIOS written to MEMFS (/scph1001.bin)');
}

export function handleChd(ctx: WorkerContext, msg: any) {
  if (!ctx.sabs) {
    post({ type: 'fatal', msg: 'chd received before init' });
    return;
  }
  ctx.cfunc.fs_write_file('/game.chd', new Uint8Array(msg.buf));
  ctx.bootState |= BOOT.CD;
  logInfo(`CHD written to MEMFS (/game.chd, ${msg.buf.byteLength} bytes)`);
}

export function handleCd(ctx: WorkerContext, msg: any) {
  if (!ctx.sabs) {
    post({ type: 'fatal', msg: 'cd received before init' });
    return;
  }
  ctx.cfunc.fs_write_file('/game.chd', new Uint8Array(0));
  ctx.chdTotal = msg && typeof msg.chdTotal === 'number' ? msg.chdTotal : 0;
  if (ctx.sabs.controlSAB && ctx.sabs.dataSAB) {
    ctx.Module._streamingControlSab = ctx.sabs.controlSAB;
    ctx.Module._streamingDataSab = ctx.sabs.dataSAB;
    ctx.Module._streamingControlView = new Int32Array(ctx.sabs.controlSAB);
    ctx.Module._streamingDataView = new Uint8Array(ctx.sabs.dataSAB, 0);
    ctx.cfunc.streaming_init(ctx.chdTotal | 0, Math.floor(ctx.chdTotal / 0x100000000));
    logInfo(`worker: _streaming_core_file_init done (chdTotal=${ctx.chdTotal})`);
  } else {
    post({ type: 'fatal', msg: 'cd received but control/data SAB is missing' });
    return;
  }
  ctx.bootState |= BOOT.CD;
  logInfo(
    `CD URL received (${msg.url}, ${ctx.chdTotal} bytes); MEMFS stub written; streaming bridge armed`,
  );
}

export function handleSwapDisc(ctx: WorkerContext, msg: any) {
  const { slot, path, chdTotal: swapChdTotal, needsRegister } = msg;
  logInfo(
    `worker: handleSwapDisc: slot=${slot} path=${path} chdTotal=${swapChdTotal} needsRegister=${needsRegister}`,
  );
  if (needsRegister) {
    logInfo(`worker: handleSwapDisc: writing empty stub to ${path}`);
    ctx.cfunc.fs_write_file(path, new Uint8Array(0));
    logInfo(`worker: handleSwapDisc: calling host_register_disc(${slot}, ${path})`);
    const regOk = !!ctx.cfunc.host_register_disc(slot, path);
    logInfo(`worker: handleSwapDisc: host_register_disc result=${regOk}`);
    if (!regOk) {
      logError(`worker: register_disc(${slot}) failed`);
      post({ type: MSG.SWAP_DISC_RESULT, ok: false, error: 'host_register_disc failed' });
      return;
    }
  }
  logInfo(`worker: handleSwapDisc: calling streaming_init(total=${swapChdTotal})`);
  ctx.cfunc.streaming_init(swapChdTotal | 0, Math.floor(swapChdTotal / 0x100000000));
  ctx.Module['_streamLocalData'] = null;
  ctx.Module['_streamLocalOffset'] = 0;
  logInfo(`worker: handleSwapDisc: calling host_swap_disc(${slot})`);
  const ok = !!ctx.cfunc.host_swap_disc(slot);
  logInfo(`worker: handleSwapDisc: host_swap_disc result=${ok}`);
  if (ok) {
    const cdromId = getCdromId(ctx);
    logInfo(`worker: handleSwapDisc: posting SWAP_DISC_RESULT ok cdromId=${cdromId}`);
    post({ type: MSG.SWAP_DISC_RESULT, ok: true, cdromId });
  } else {
    logError(`worker: handleSwapDisc: host_swap_disc failed`);
    post({ type: MSG.SWAP_DISC_RESULT, ok: false, error: 'host_swap_disc failed' });
  }
}
