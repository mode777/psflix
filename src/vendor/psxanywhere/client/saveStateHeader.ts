'use strict';

// PSAS save-state header codec (pure ArrayBuffer ↔ struct).
// See specs/archive/multidisc/spec.md §8 and docs/save-state.md.

export const SAVE_STATE_MAGIC = 0x50534153 as const;
export const SAVE_STATE_VERSION = 1 as const;

/** Sentinel cdromId the PS1 core uses when no disc is inserted. */
export const NO_DISC_CDROM_ID = 'SLUS99999';

const MIN_HEADER_SIZE = 21;

export interface ParsedHeader {
  discUrl: string;
  gameId: string;
  coreOffset: number;
}

export type ParseResult =
  | { kind: 'ok'; discUrl: string; gameId: string; coreOffset: number }
  | { kind: 'no-header' }
  | { kind: 'corrupt'; reason: string };

export function buildSaveStateHeader(
  coreBuf: ArrayBuffer,
  discUrl: string,
  cdromId: string,
): ArrayBuffer {
  const gameId = cdromId && cdromId !== '' && cdromId !== NO_DISC_CDROM_ID ? cdromId : discUrl;

  if (gameId.length === 0)
    throw new RangeError('gameId is empty: both cdromId and discUrl are empty');
  if (cdromId && cdromId.length > 9)
    throw new RangeError(
      `cdromId must be ≤9 chars, got ${cdromId.length}: ${JSON.stringify(cdromId)}`,
    );
  for (let i = 0; i < gameId.length; i++) {
    if (gameId.charCodeAt(i) > 127)
      throw new RangeError(
        `gameId must be ASCII, got non-ASCII char at index ${i}: ${JSON.stringify(gameId[i])}`,
      );
  }

  const urlBytes = new TextEncoder().encode(discUrl);
  const headerSize = 4 + 4 + 4 + urlBytes.length + 9;
  const header = new ArrayBuffer(headerSize);
  const view = new DataView(header);
  view.setUint32(0, SAVE_STATE_MAGIC, true);
  view.setUint32(4, SAVE_STATE_VERSION, true);
  view.setUint32(8, urlBytes.length, true);
  new Uint8Array(header, 12, urlBytes.length).set(urlBytes);
  const gameIdBytes = new Uint8Array(header, 12 + urlBytes.length, 9);
  for (let i = 0; i < 9; i++) gameIdBytes[i] = i < gameId.length ? gameId.charCodeAt(i) : 0;
  const combined = new Uint8Array(headerSize + coreBuf.byteLength);
  combined.set(new Uint8Array(header), 0);
  combined.set(new Uint8Array(coreBuf), headerSize);
  return combined.buffer;
}

export function parseSaveStateHeader(buf: ArrayBuffer): ParseResult {
  if (!(buf instanceof ArrayBuffer)) return { kind: 'no-header' };
  if (buf.byteLength < MIN_HEADER_SIZE + 1) return { kind: 'no-header' };

  const view = new DataView(buf);
  if (view.getUint32(0, true) !== SAVE_STATE_MAGIC) return { kind: 'no-header' };
  if (view.getUint32(4, true) !== SAVE_STATE_VERSION) {
    return { kind: 'corrupt', reason: `unsupported version ${view.getUint32(4, true)}` };
  }

  const urlLen = view.getUint32(8, true);
  if (buf.byteLength < MIN_HEADER_SIZE + urlLen) {
    return {
      kind: 'corrupt',
      reason: `truncated: declared urlLen=${urlLen}, available=${buf.byteLength - MIN_HEADER_SIZE}`,
    };
  }

  const discUrl = new TextDecoder().decode(new Uint8Array(buf, 12, urlLen));
  const gameIdRaw = new Uint8Array(buf, 12 + urlLen, 9);
  let gameId = '';
  for (let i = 0; i < 9 && gameIdRaw[i] !== 0; i++) gameId += String.fromCharCode(gameIdRaw[i]);

  return { kind: 'ok', discUrl, gameId, coreOffset: MIN_HEADER_SIZE + urlLen };
}
