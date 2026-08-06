import type { GamesRegionOptions } from '@/types/pocketbase';

/**
 * PAL frame pacing. pcsx_rearmed targets 50 fps for PAL games (NTSC is 60),
 * see worker/audio-clock.ts. The worklet-driven clock must pace PAL at 50 or
 * the game runs ~20% too fast and the audio ring overruns (cut-off audio).
 */
export const PAL_FPS = 50;

const PAL_SERIALS = ['DTLS3035', 'PBPX95001', 'PBPX95007', 'PBPX95008'];

/**
 * Mirror of pcsx_rearmed's `CheckCdrom()` serial heuristic: PAL discs carry a
 * serial like SLES/SCED (S[anything]E[anything]) plus a few oddball IDs.
 * NTSC releases like SCUS (Wild Arms) are correctly excluded.
 */
export function palFromSerial(serial: string): boolean {
  const s = (serial ?? '').toUpperCase();
  if (!s) return false;
  if (s.length >= 3 && s[0] === 'S' && s[2] === 'E') return true;
  return PAL_SERIALS.some((id) => s.startsWith(id));
}

/**
 * Decide whether a disc must be paced at the PAL frame rate. The catalog
 * `games.region` is authoritative; when it is missing/unknown, fall back to
 * the serial heuristic.
 */
export function isPAL(region?: GamesRegionOptions | string, serial?: string): boolean {
  if (region === 'PAL') return true;
  if (region === 'NTSC-U' || region === 'NTSC-J') return false;
  return palFromSerial(serial ?? '');
}
