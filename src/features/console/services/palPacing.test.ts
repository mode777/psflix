import { describe, it, expect } from 'vitest';
import { computeTicksPerFrame, PAL_FPS } from 'emulator-core';

describe('frame pacing math (worker audio-clock)', () => {
  it('paces PAL at 50 fps (7.5 ticks/frame @48k/128)', () => {
    expect(computeTicksPerFrame(48000, PAL_FPS, 128)).toBeCloseTo(7.5, 5);
  });

  it('paces NTSC at the core fps (~6.25 ticks/frame @48k/128)', () => {
    expect(computeTicksPerFrame(48000, 60, 128)).toBeCloseTo(6.25, 5);
    expect(computeTicksPerFrame(48000, 59.94, 128)).toBeGreaterThan(6.25);
    expect(computeTicksPerFrame(48000, 59.94, 128)).toBeLessThan(6.26);
  });

  it('scales with the worklet sample rate and quantum', () => {
    // Same real-time rate regardless of quantum for a fixed worklet SR.
    expect(computeTicksPerFrame(44100, 50, 128)).toBeCloseTo(6.8906, 3);
    expect(computeTicksPerFrame(48000, 50, 512)).toBeCloseTo(1.875, 5);
  });

  it('supports fast-forward pacing by reducing ticks/frame at higher target fps', () => {
    const oneX = computeTicksPerFrame(48000, 60, 128);
    const twoX = computeTicksPerFrame(48000, 120, 128);
    const fourX = computeTicksPerFrame(48000, 240, 128);
    expect(twoX).toBeCloseTo(oneX / 2, 5);
    expect(fourX).toBeCloseTo(oneX / 4, 5);
  });
});
