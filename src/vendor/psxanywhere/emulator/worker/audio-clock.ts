'use strict';

import { AUDIO_OFF_AV_FPS, audioHeaderView } from '../sab/layout';
import { WorkerContext, logInfo, logWarn } from './context';

export function sampleRate(ctx: WorkerContext): number {
  if (!ctx.sabs || !ctx.sabs.audioSAB) return 0;
  const hdr = audioHeaderView(ctx.sabs.audioSAB);
  return Atomics.load(hdr, 3);
}

export function readFps(ctx: WorkerContext): number {
  if (!ctx.sabs || !ctx.sabs.audioSAB) return 0;
  const fpsI32 = new Int32Array(ctx.sabs.audioSAB, AUDIO_OFF_AV_FPS, 2);
  const lo = Atomics.load(fpsI32, 0);
  const hi = Atomics.load(fpsI32, 1);
  const buf = new ArrayBuffer(8);
  const i32 = new Int32Array(buf);
  i32[0] = lo;
  i32[1] = hi;
  return new Float64Array(buf)[0];
}

export function recomputeMasterN(ctx: WorkerContext, reason: string) {
  if (!ctx.sabs || !ctx.sabs.audioSAB) return;
  if (ctx.workletSampleRate <= 0) return;
  const sr = sampleRate(ctx);
  const fps = readFps(ctx);
  if (!(sr > 0) || !(fps > 0)) return;
  const quantum = ctx.workletQuantum > 0 ? ctx.workletQuantum : 128;
  const tpf = ctx.workletSampleRate / fps / quantum;
  const prev = {
    masterN: ctx.masterN,
    ticksPerFrame: ctx.ticksPerFrame,
    workletQuantum: ctx.workletQuantum,
  };
  ctx.ticksPerFrame = tpf;
  ctx.masterN = Math.max(1, Math.round(tpf));
  logInfo(
    `worker: master clock recomputed (${reason}) spu_sr=${sr} worklet_sr=${ctx.workletSampleRate} fps=${fps.toFixed(4)} quantum=${quantum} -> ticksPerFrame=${ctx.ticksPerFrame.toFixed(5)} masterN=${ctx.masterN} (was ticksPerFrame=${prev.ticksPerFrame.toFixed(5)} masterN=${prev.masterN} quantum=${prev.workletQuantum})`,
  );
}

export function onAudioTick(ctx: WorkerContext, e: MessageEvent, paintFromSab: () => void) {
  if (!e || !e.data) return;
  if (e.data.type === 'ready') {
    const reportedQuantum = e.data.quantum | 0;
    if (reportedQuantum > 0 && reportedQuantum !== ctx.workletQuantum) {
      const prevQuantum = ctx.workletQuantum;
      ctx.workletQuantum = reportedQuantum;
      if (ctx.audioClockActive) {
        logWarn(
          `worker: worklet quantum changed mid-run (${prevQuantum} -> ${ctx.workletQuantum}); not supported, ignoring`,
        );
      } else {
        recomputeMasterN(ctx, 'worklet-ready');
      }
    }
    return;
  }
  if (e.data.type !== 'tick' || !ctx.audioClockActive) return;
  ctx.audioTickCount++;
  ctx.frameAccumulator += 1.0;
  if (ctx.frameAccumulator > 2 * ctx.ticksPerFrame) ctx.frameAccumulator = 2 * ctx.ticksPerFrame;
  while (ctx.frameAccumulator >= ctx.ticksPerFrame) {
    ctx.cfunc.host_run_frame();
    ctx.retroRunCount++;
    ctx.fpsCounter++;
    paintFromSab();
    ctx.frameAccumulator -= ctx.ticksPerFrame;
  }
}

export function warmupTick(ctx: WorkerContext, paintFromSab: () => void) {
  if (ctx.wholeFile) return;
  if ((ctx.bootState & 4) !== 4) return;
  ctx.cfunc.host_run_frame();
  ctx.retroRunCount++;
  ctx.fpsCounter++;
  paintFromSab();
  ctx.warmupLeft--;
  if (ctx.warmupLeft > 0) {
    setTimeout(() => warmupTick(ctx, paintFromSab), 0);
  } else {
    ctx.audioClockActive = true;
    logInfo(
      `worker: master clock armed (N=${ctx.masterN}, ticksPerFrame=${ctx.ticksPerFrame.toFixed(5)}, worklet_sr=${ctx.workletSampleRate}, worklet_quantum=${ctx.workletQuantum}, wholeFile=false)`,
    );
  }
}
