// Mutation helpers for PS1 memory card (.mcr) images — the "write" half the
// mcrreader parser doesn't provide. All functions are pure: they read from the
// inputs and return fresh `Uint8Array` copies, never mutating the arguments,
// so callers can freely alias source/target cards.

import {
  DATA_OFFSET,
  DIRECTORY_FRAMES,
  DIRECTORY_OFFSET,
  DIR_CODE,
  DIR_CODE_LEN,
  DIR_NEXT,
  DIR_SIZE,
  FRAME_SIZE,
  LAST_BLOCK,
  SECTOR_SIZE,
  STATE_FIRST,
  STATE_FREE,
  STATE_LAST,
  STATE_MIDDLE,
} from 'mcrreader';
import type { Save } from 'mcrreader';

const LAST_BLOCK_HI = (LAST_BLOCK >> 8) & 0xff;
const LAST_BLOCK_LO = LAST_BLOCK & 0xff;

function setU16(bytes: Uint8Array, off: number, value: number): void {
  bytes[off] = value & 0xff;
  bytes[off + 1] = (value >> 8) & 0xff;
}

function setU32(bytes: Uint8Array, off: number, value: number): void {
  bytes[off] = value & 0xff;
  bytes[off + 1] = (value >> 8) & 0xff;
  bytes[off + 2] = (value >> 16) & 0xff;
  bytes[off + 3] = (value >>> 24) & 0xff;
}

function dataOffsetFor(frameIndex: number): number {
  return DATA_OFFSET + frameIndex * SECTOR_SIZE;
}

/** Directory-frame byte offset for a block index (0–15). */
function frameOffsetFor(index: number): number {
  return DIRECTORY_OFFSET + index * FRAME_SIZE;
}

/** Collect free block indexes (0–14) until `needed` are found, or all free. */
function findFreeBlocks(bytes: Uint8Array, needed: number): number[] {
  const free: number[] = [];
  for (let i = 0; i < DIRECTORY_FRAMES - 1; i++) {
    const frame = frameOffsetFor(i);
    if (bytes[frame] === STATE_FREE) {
      free.push(i);
      if (free.length >= needed) break;
    }
  }
  return free;
}

/** Mark a directory frame (and its data block) as free. */
function freeBlock(bytes: Uint8Array, index: number): void {
  const frame = frameOffsetFor(index);
  bytes.fill(0, frame, frame + FRAME_SIZE);
  bytes[frame] = STATE_FREE;
  bytes[frame + DIR_NEXT] = LAST_BLOCK_LO;
  bytes[frame + DIR_NEXT + 1] = LAST_BLOCK_HI;
  const data = dataOffsetFor(index);
  bytes.fill(0, data, data + SECTOR_SIZE);
}

/** Result of a copy operation: either the new target image or a reason. */
export type CardCopyResult = { ok: true; card: Uint8Array } | { ok: false; error: string };

/** Result of a move operation: either the new source + target or a reason. */
export type CardMoveResult =
  { ok: true; from: Uint8Array; to: Uint8Array } | { ok: false; error: string };

/**
 * Copy a save (its full data blocks verbatim) into a card image. The target
 * must have enough free blocks; the source card's bytes are only read.
 */
export function copySaveTo(
  targetBytes: Uint8Array,
  sourceBytes: Uint8Array,
  save: Save,
): CardCopyResult {
  const needed = Math.max(1, save.blocks.length);
  const alloc = findFreeBlocks(targetBytes, needed);
  if (alloc.length < needed) {
    return { ok: false, error: 'Target card does not have enough free blocks' };
  }

  const copy = new Uint8Array(targetBytes);
  const span = needed * SECTOR_SIZE;
  const srcStart = dataOffsetFor(save.index);
  const srcEnd = Math.min(srcStart + span, sourceBytes.length);
  const data = sourceBytes.subarray(srcStart, srcEnd);

  for (let i = 0; i < alloc.length; i++) {
    const dstStart = dataOffsetFor(alloc[i]!);
    copy.set(data.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE), dstStart);
  }

  writeChain(copy, alloc, save);
  return { ok: true, card: copy };
}

/** Write the directory chain (state / size / next / product code) for a save. */
function writeChain(copy: Uint8Array, alloc: number[], save: Save): void {
  alloc.forEach((blockIndex, i) => {
    const frame = frameOffsetFor(blockIndex);
    copy.fill(0, frame, frame + FRAME_SIZE);
    const isFirst = i === 0;
    const isLast = i === alloc.length - 1;
    copy[frame] = isFirst ? STATE_FIRST : isLast ? STATE_LAST : STATE_MIDDLE;
    if (isFirst) {
      setU32(copy, frame + DIR_SIZE, save.sizeBytes);
      const code = save.productCode;
      for (let c = 0; c < DIR_CODE_LEN; c++) {
        copy[frame + DIR_CODE + c] = c < code.length ? code.charCodeAt(c) & 0xff : 0;
      }
    }
    const next = i + 1 < alloc.length ? alloc[i + 1]! : LAST_BLOCK;
    setU16(copy, frame + DIR_NEXT, next);
  });
}

/**
 * Remove a save from a card image (frees every block in its chain).
 * Returns a fresh image with the save gone.
 */
export function deleteSave(cardBytes: Uint8Array, save: Save): Uint8Array {
  const copy = new Uint8Array(cardBytes);
  for (const blockIndex of save.blocks) {
    freeBlock(copy, blockIndex);
  }
  return copy;
}

/**
 * Move a save from one card to another: copy into the target, then free it in
 * the source. Pure — both inputs are only read.
 */
export function moveSave(fromBytes: Uint8Array, toBytes: Uint8Array, save: Save): CardMoveResult {
  const copied = copySaveTo(toBytes, fromBytes, save);
  if (!copied.ok) return { ok: false, error: copied.error };
  const newFrom = deleteSave(fromBytes, save);
  return { ok: true, from: newFrom, to: copied.card };
}

/** Blocks a save needs to live on a fresh card. */
export function blocksNeeded(save: Save): number {
  return Math.max(1, save.blocks.length);
}
