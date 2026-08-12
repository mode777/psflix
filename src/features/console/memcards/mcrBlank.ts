// Blank / format helpers for PS1 memory card (.mcr) images (128 KB raw dump).
//
// A freshly-formatted card mirrors the real device / pcsx-rearmed `CreateMcd`
// layout for block 0 (64 frames × 128 bytes), with every checksummed frame
// carrying a valid XOR checksum at byte 0x7F (header + 15 directory + 20
// broken-sector-list + write-test). Data blocks 1..15 are 0xFF (unwritten).
//
//   frame 0       (0x0000) header        : "MC" + 125 zeros + cksum 0x0E
//   frames 1..15  (0x0080) directory     : 0xA0 free, next=0xFFFF + cksum
//   frames 16..35 (0x0800) broken list   : [0-3]=FFFFFFFF, [8-9]=FFFF, cksum
//   frames 36..55 (0x1200) replacement   : 0x00 (no checksum)
//   frames 56..62 (0x1C00) unused        : 0x00
//   frame 63      (0x1F80) write-test    : "MC" + 125 zeros + cksum 0x0E
//   0x2000..0x1FFFF data blocks          : 0xFF (unwritten)
//
// See psx-spx "PSX Memory Card Data Format" for the byte-level spec.

import { CARD_SIZE, DIRECTORY_FRAMES, DIRECTORY_OFFSET, FRAME_SIZE, STATE_FREE } from 'mcrreader';
import { writeFrameChecksum } from './mcrChecksum';

const HEADER_OFFSET = 0x0000;
const WRITE_TEST_OFFSET = 63 * FRAME_SIZE;
const BROKEN_LIST_OFFSET = 16 * FRAME_SIZE;
const BROKEN_LIST_FRAMES = 20;

const HEADER_MAGIC = [0x4d, 0x43]; // "MC"

/** Write a header-style frame ("MC" + zeros + checksum 0x0E) at `offset`. */
function writeHeaderFrame(bytes: Uint8Array, offset: number): void {
  bytes.fill(0, offset, offset + FRAME_SIZE);
  bytes[offset] = HEADER_MAGIC[0]!;
  bytes[offset + 1] = HEADER_MAGIC[1]!;
  writeFrameChecksum(bytes, offset);
}

/** Write a free directory frame (0xA0, next=0xFFFF, zeros, checksum 0xA0). */
function writeFreeDirectoryFrame(bytes: Uint8Array, offset: number): void {
  bytes.fill(0, offset, offset + FRAME_SIZE);
  bytes[offset] = STATE_FREE;
  bytes[offset + 0x08] = 0xff; // next = 0xFFFF (end of chain)
  bytes[offset + 0x09] = 0xff;
  writeFrameChecksum(bytes, offset);
}

/**
 * Write a broken-sector-list frame encoding "no broken sector":
 * [0x00-0x03]=FFFFFFFF, [0x08-0x09]=FFFF, rest zero, plus checksum.
 */
function writeBrokenSectorFrame(bytes: Uint8Array, offset: number): void {
  bytes.fill(0, offset, offset + FRAME_SIZE);
  bytes[offset + 0x00] = 0xff;
  bytes[offset + 0x01] = 0xff;
  bytes[offset + 0x02] = 0xff;
  bytes[offset + 0x03] = 0xff;
  bytes[offset + 0x08] = 0xff;
  bytes[offset + 0x09] = 0xff;
  writeFrameChecksum(bytes, offset);
}

/** Create a fresh, formatted, empty memory card image (all 15 blocks free). */
export function createEmptyCard(): Uint8Array {
  const bytes = new Uint8Array(CARD_SIZE);

  // Data blocks (0x2000..) default to 0xFF (unwritten). Block-0 frames below
  // default to 0x00 (the device fills replacement data + unused with zeros).
  bytes.fill(0xff, 0x2000);

  writeHeaderFrame(bytes, HEADER_OFFSET);

  for (let i = 0; i < DIRECTORY_FRAMES - 1; i++) {
    writeFreeDirectoryFrame(bytes, DIRECTORY_OFFSET + i * FRAME_SIZE);
  }

  for (let i = 0; i < BROKEN_LIST_FRAMES; i++) {
    writeBrokenSectorFrame(bytes, BROKEN_LIST_OFFSET + i * FRAME_SIZE);
  }

  // Frames 36..62 (replacement data + unused) stay zero-filled, matching the
  // real device (no checksum applies to these regions).
  writeHeaderFrame(bytes, WRITE_TEST_OFFSET);

  return bytes;
}

/** Wipe a card back to factory state. Returns a fresh 128 KB image. */
export function formatCard(): Uint8Array {
  return createEmptyCard();
}
