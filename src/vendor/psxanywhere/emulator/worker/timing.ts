'use strict';

// Pure frame-timing constants/helpers shared by the audio clock and exposed to
// the host for testing. No runtime imports, so this module is safe to load in
// any JS environment (including unit tests without a `self` global).

/** pcsx_rearmed drives PAL at 50 fps (NTSC at 60); the audio clock must match. */
export const PAL_FPS = 50;

const PAL_SERIAL_PREFIXES = ['DTLS3035', 'PBPX95001', 'PBPX95007', 'PBPX95008'];

/**
 * Mirror of pcsx_rearmed's `CheckCdrom()` serial heuristic (S[any]E[any] →
 * PAL, e.g. SLES/SCED; NTSC serials like SCUS are excluded) plus oddball IDs.
 */
export function isPalCdrom(cdromId: string): boolean {
  const s = (cdromId ?? '').toUpperCase();
  if (!s) return false;
  if (s.length >= 3 && s[0] === 'S' && s[2] === 'E') return true;
  return PAL_SERIAL_PREFIXES.some((id) => s.startsWith(id));
}

/** Ticks per audio-worklet quantum needed to run `fps` frames per real second. */
export function computeTicksPerFrame(
  workletSampleRate: number,
  fps: number,
  quantum: number,
): number {
  return workletSampleRate / fps / quantum;
}
