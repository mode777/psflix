// Per-frame XOR checksum for PS1 memory card (.mcr) block 0. Per psx-spx
// ("PSX Memory Card Data Format"), every checksummed frame in block 0 ends
// with a checksum byte at offset 0x7F equal to the XOR of bytes 0x00..0x7E.
// The PS1 BIOS and games validate these; a bad checksum makes the frame (and
// any save it describes) read as corrupt. The header frame, the 15 directory
// frames, the 20 broken-sector-list frames, and the write-test frame are all
// checksummed. Broken-sector replacement data (frames 36..55) and the unused
// frames (56..62) carry no checksum.

import { FRAME_SIZE } from 'mcrreader';

/** Offset of the checksum byte within any checksummed frame. */
export const FRAME_CHECKSUM = 0x7f;

/**
 * Recompute and write the checksum byte (offset 0x7F) for the frame at
 * `frameOffset`. Must be called AFTER every other byte of the frame is in
 * place, since the checksum covers bytes 0x00..0x7E.
 */
export function writeFrameChecksum(bytes: Uint8Array, frameOffset: number): void {
  const end = frameOffset + FRAME_CHECKSUM;
  let x = 0;
  for (let i = frameOffset; i < end; i++) x ^= bytes[i]!;
  bytes[end] = x & 0xff;
}

/** Compute the expected checksum byte for the frame at `frameOffset`. */
export function computeFrameChecksum(bytes: Uint8Array, frameOffset: number): number {
  const end = frameOffset + FRAME_CHECKSUM;
  let x = 0;
  for (let i = frameOffset; i < end; i++) x ^= bytes[i]!;
  return x & 0xff;
}

export interface FrameChecksumResult {
  frame: number;
  offset: number;
  stored: number;
  expected: number;
  ok: boolean;
}

// Block-0 frame indices that carry a checksum (header + 15 dir + 20 broken
// list + write-test). Replacement data (36..55) and unused (56..62) do not.
const CHECKSUMMED_FRAMES = [0, ...Array.from({ length: 35 }, (_, i) => i + 1), 63];

/**
 * Validate the checksum of every checksummed block-0 frame. Returns one entry
 * per frame (header, 15 directory, 20 broken-sector-list, write-test) with the
 * stored vs. expected checksum byte. Used by tests; not on the hot path.
 */
export function validateBlock0Checksums(bytes: Uint8Array): FrameChecksumResult[] {
  return CHECKSUMMED_FRAMES.map((frame) => {
    const offset = frame * FRAME_SIZE;
    const expected = computeFrameChecksum(bytes, offset);
    const stored = bytes[offset + FRAME_CHECKSUM]!;
    return { frame, offset, stored, expected, ok: stored === expected };
  });
}
