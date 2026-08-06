// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src).

import {
  CARD_SIZE,
  DATA_OFFSET,
  DATA_SECTORS,
  DIR_CODE,
  DIR_CODE_LEN,
  DIR_NEXT,
  DIR_SIZE,
  DIRECTORY_FRAMES,
  DIRECTORY_OFFSET,
  FRAME_SIZE,
  LAST_BLOCK,
  SAVE_CLUT,
  SAVE_CLUT_LEN,
  SAVE_ICONTYPE,
  SAVE_ICON_OFFSET,
  SAVE_TITLE,
  SAVE_TITLE_LEN,
  SECTOR_SIZE,
  STATE_FIRST,
  STATE_FREE,
  STATE_LAST,
  STATE_MIDDLE,
} from './constants';
import type { BlockKind, DirectoryFrame, MemoryCard, Region, Save, SaveIcon } from './types';

const REGIONS: Record<string, string> = {
  BA: 'Americas',
  BE: 'Europe',
  BI: 'Japan',
};

const sjis = new TextDecoder('shift-jis');
const ascii = new TextDecoder('ascii');

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toUint8(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function readU16(bytes: Uint8Array, off: number): number {
  return bytes[off]! | (bytes[off + 1]! << 8);
}

function readU32(bytes: Uint8Array, off: number): number {
  return (
    bytes[off]! |
    (bytes[off + 1]! << 8) |
    (bytes[off + 2]! << 16) |
    (bytes[off + 3]! * 0x1_00_00_00)
  );
}

function readAscii(bytes: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  const limit = Math.min(off + maxLen, bytes.length);
  while (end < limit && bytes[end] !== 0) end++;
  return ascii.decode(bytes.subarray(off, end)).trim();
}

function decodeTitle(bytes: Uint8Array, off: number): string {
  const slice = bytes.subarray(off, off + SAVE_TITLE_LEN);
  const decoded = sjis.decode(slice);
  const nul = decoded.indexOf('\u0000');
  const text = nul >= 0 ? decoded.slice(0, nul) : decoded;
  return text.replace(/\s+$/, '');
}

function blockKind(state: number): BlockKind {
  switch (state) {
    case STATE_FIRST:
      return 'first';
    case STATE_MIDDLE:
      return 'middle';
    case STATE_LAST:
      return 'last';
    case STATE_FREE:
      return 'free';
    default:
      return 'corrupt';
  }
}

function decodeRegion(productCode: string): Region {
  const code = (productCode.slice(0, 2) || '??').toUpperCase();
  return { code, name: REGIONS[code] ?? 'Unknown' };
}

function dataOffsetFor(frameIndex: number): number {
  return DATA_OFFSET + frameIndex * SECTOR_SIZE;
}

export function parseDirectoryFrame(bytes: Uint8Array, index: number): DirectoryFrame {
  const offset = DIRECTORY_OFFSET + index * FRAME_SIZE;
  const stateByte = bytes[offset]!;
  return {
    index,
    offset,
    stateByte,
    kind: blockKind(stateByte),
    sizeBytes: readU32(bytes, offset + DIR_SIZE),
    nextBlock: (() => {
      const n = readU16(bytes, offset + DIR_NEXT);
      return n === LAST_BLOCK ? null : n;
    })(),
    productCode: readAscii(bytes, offset + DIR_CODE, DIR_CODE_LEN),
  };
}

function parseIcon(bytes: Uint8Array, dataOffset: number): SaveIcon {
  const frameCount = Math.min(3, Math.max(1, bytes[dataOffset + SAVE_ICONTYPE]! & 0x0f));
  const clut = bytes.subarray(dataOffset + SAVE_CLUT, dataOffset + SAVE_CLUT + SAVE_CLUT_LEN);
  const pixels: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i++) {
    const off = dataOffset + SAVE_ICON_OFFSET + i * FRAME_SIZE;
    pixels.push(bytes.subarray(off, off + FRAME_SIZE));
  }
  return { frames: frameCount, clut, pixels };
}

function parseSave(bytes: Uint8Array, frames: DirectoryFrame[], first: DirectoryFrame): Save {
  const blocks: number[] = [first.index];
  const seen = new Set<number>([first.index]);
  let currentIndex = first.index;
  for (let guard = 0; guard < DIRECTORY_FRAMES; guard++) {
    const frame = frames[currentIndex];
    if (!frame || frame.nextBlock === null) break;
    const next = frame.nextBlock;
    if (next < 0 || next >= DIRECTORY_FRAMES || seen.has(next)) break;
    seen.add(next);
    blocks.push(next);
    currentIndex = next;
  }

  const dataOffset = dataOffsetFor(first.index);
  const span = Math.min(first.sizeBytes, blocks.length * SECTOR_SIZE);
  const icon = parseIcon(bytes, dataOffset);
  const data = bytes.subarray(dataOffset, dataOffset + span);

  return {
    index: first.index,
    blocks,
    productCode: first.productCode,
    region: decodeRegion(first.productCode),
    sizeBytes: first.sizeBytes,
    title: decodeTitle(bytes, dataOffset + SAVE_TITLE),
    iconFrames: icon.frames,
    icon,
    data,
    hash: crc32(data).toString(16).padStart(8, '0'),
  };
}

export function parseMemoryCard(data: Uint8Array | ArrayBuffer): MemoryCard {
  const bytes = toUint8(data);
  if (bytes.length !== CARD_SIZE) {
    throw new Error(`Invalid memory card size: expected ${CARD_SIZE} bytes, got ${bytes.length}`);
  }

  const magic = String.fromCharCode(bytes[0]!, bytes[1]!);
  if (magic !== 'MC') {
    throw new Error(`Invalid memory card: bad magic "${magic}" (expected "MC")`);
  }

  const frames: DirectoryFrame[] = [];
  for (let i = 0; i < DIRECTORY_FRAMES; i++) {
    frames.push(parseDirectoryFrame(bytes, i));
  }

  const saves = frames.filter((f) => f.kind === 'first').map((f) => parseSave(bytes, frames, f));

  const freeBlocks = frames.filter((f) => f.kind === 'free').length;

  return {
    bytes,
    magic,
    frames,
    saves,
    freeBlocks,
    totalBlocks: DATA_SECTORS,
  };
}
