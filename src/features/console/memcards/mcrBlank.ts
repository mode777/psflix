// Blank / format helpers for PS1 memory card (.mcr) images (128 KB raw dump).
//
// A freshly-formatted card (matching the real device / pcsx-rearmed
// `CreateMcd` layout) is:
//   - header frame: "MC" magic at 0x0000, remainder zero-filled
//   - directory frames 0–14: 0xA0 (free) with size 0 / next 0xFFFF, rest zeros
//   - directory frame 15: sentinel, all 0xFF
//   - broken-sector list (0x0880..0x08FF): 0x00 (no broken sectors)
//   - 0x0900..0x1FFF reserved: 0x00
//   - 15 data blocks (0x2000..0x1FFFF): 0xFF (unwritten)

import { CARD_SIZE, DIRECTORY_OFFSET, DIRECTORY_FRAMES, FRAME_SIZE, STATE_FREE } from 'mcrreader';

/** Create a fresh, formatted, empty memory card image (all 15 blocks free). */
export function createEmptyCard(): Uint8Array {
  const bytes = new Uint8Array(CARD_SIZE);
  bytes.fill(0xff, 0x2000); // data blocks unwritten

  bytes[0] = 0x4d; // 'M'
  bytes[1] = 0x43; // 'C'

  for (let i = 0; i < DIRECTORY_FRAMES - 1; i++) {
    const frame = DIRECTORY_OFFSET + i * FRAME_SIZE;
    bytes.fill(0, frame, frame + FRAME_SIZE);
    bytes[frame + 0x00] = STATE_FREE;
    bytes[frame + 0x08] = 0xff; // next = 0xFFFF (end of chain)
    bytes[frame + 0x09] = 0xff;
  }
  // Frame 15 is the all-0xFF sentinel (already 0xFF from the base fill? no —
  // region 0x0080..0x2000 holds directory + broken list; ensure it is 0xFF).
  bytes.fill(0xff, DIRECTORY_OFFSET + (DIRECTORY_FRAMES - 1) * FRAME_SIZE, 0x2000);

  return bytes;
}

/** Wipe a card back to factory state. Returns a fresh 128 KB image. */
export function formatCard(): Uint8Array {
  return createEmptyCard();
}
