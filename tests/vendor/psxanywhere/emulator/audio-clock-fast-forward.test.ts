import { describe, expect, it, vi } from 'vitest';
import { onAudioTick } from '../../../../src/vendor/psxanywhere/emulator/worker/audio-clock';
import type { WorkerContext } from '../../../../src/vendor/psxanywhere/emulator/worker/context';

function context(speedMultiplier: number, ticksPerFrame: number): WorkerContext {
  return {
    audioClockActive: true,
    audioTickCount: 0,
    ticksPerFrame,
    frameAccumulator: 0,
    speedMultiplier,
    framesSincePaint: 0,
    retroRunCount: 0,
    fpsCounter: 0,
    cfunc: { host_run_frame: vi.fn() },
  } as unknown as WorkerContext;
}

function tick(ctx: WorkerContext, count: number, paint: () => void): void {
  for (let i = 0; i < count; i++) {
    onAudioTick(ctx, { data: { type: 'tick' } } as MessageEvent, paint);
  }
}

describe('audio-clock fast-forward pacing', () => {
  it.each([
    { speed: 1, ticksPerFrame: 6.25, expectedFrames: 60 },
    { speed: 2, ticksPerFrame: 3.125, expectedFrames: 120 },
  ])(
    'runs $speed x core frames without squaring the multiplier',
    ({ speed, ticksPerFrame, expectedFrames }) => {
      const ctx = context(speed, ticksPerFrame);
      const paint = vi.fn();

      tick(ctx, 375, paint);

      expect(ctx.cfunc.host_run_frame).toHaveBeenCalledTimes(expectedFrames);
      expect(paint).toHaveBeenCalledTimes(60);
    },
  );

  it('does not process audio ticks while paused', () => {
    const ctx = context(2, 3.125);
    ctx.audioClockActive = false;
    const paint = vi.fn();

    tick(ctx, 20, paint);

    expect(ctx.cfunc.host_run_frame).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
  });
});
