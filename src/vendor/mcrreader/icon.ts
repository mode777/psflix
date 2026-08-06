// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src).

import { FRAME_SIZE } from './constants';
import type { SaveIcon } from './types';

export const ICON_WIDTH = 16;
export const ICON_HEIGHT = 16;
const PIXELS = ICON_WIDTH * ICON_HEIGHT; // 256
export const ICON_RGBA_BYTES = PIXELS * 4; // 1024

/**
 * PAL refresh rate (50 Hz) — the timing basis the PS1 BIOS uses to advance
 * animated memory-card icons.
 */
export const ICON_PAL_FPS = 50;

/**
 * Return the delay between icon frame advances, in milliseconds.
 *
 * Per the PS1 memory-card data format (psx-spx), a 2-frame icon advances every
 * 16 PAL frames (~320 ms) and a 3-frame icon every 11 PAL frames (~220 ms). A
 * single-frame (static) icon never animates, so `Infinity` is returned.
 *
 * Frames cycle forward, wrapping from the last frame back to the first.
 */
export function iconFrameDelayMs(frames: number): number {
  const period = frames === 3 ? 11 : frames === 2 ? 16 : Infinity;
  return (period / ICON_PAL_FPS) * 1000;
}

/**
 * Decode one icon frame to RGBA pixels.
 *
 * The bitmap is 16×16 at 4 bpp (128 bytes). In each byte the **low nibble is
 * the left pixel**. Indices address the 16-color CLUT, which is BGR555
 * little-endian. Color index 0 is treated as fully transparent (alpha 0).
 */
export function decodeIconFrame(icon: SaveIcon, frame = 0): Uint8Array {
  const out = new Uint8Array(ICON_RGBA_BYTES);
  const pixels = icon.pixels[frame];
  if (!pixels) return out;

  for (let i = 0; i < FRAME_SIZE; i++) {
    const byte = pixels[i]!;
    writePixel(out, i * 2, byte & 0x0f, icon.clut);
    writePixel(out, i * 2 + 1, (byte >> 4) & 0x0f, icon.clut);
  }
  return out;
}

function writePixel(
  out: Uint8Array,
  pixelIndex: number,
  colorIndex: number,
  clut: Uint8Array,
): void {
  const off = pixelIndex * 4;
  const value = clut[colorIndex * 2]! | (clut[colorIndex * 2 + 1]! << 8);
  out[off] = (value & 0x1f) << 3; // R (expand 5 → 8 bits)
  out[off + 1] = ((value >>> 5) & 0x1f) << 3; // G
  out[off + 2] = ((value >>> 10) & 0x1f) << 3; // B
  out[off + 3] = colorIndex === 0 ? 0 : 255; // index 0 = transparent
}
