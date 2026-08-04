// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildSaveStateHeader,
  parseSaveStateHeader,
  SAVE_STATE_MAGIC,
  SAVE_STATE_VERSION,
  NO_DISC_CDROM_ID,
} from '@/vendor/psxanywhere/client/saveStateHeader';
import type { ParseResult } from '@/vendor/psxanywhere/client/saveStateHeader';

function ok(r: ParseResult): { discUrl: string; gameId: string; coreOffset: number } {
  if (r.kind !== 'ok') throw new Error(`expected ok, got ${r.kind}`);
  return r;
}

describe('parseSaveStateHeader', () => {
  it('returns no-header for a non-ArrayBuffer', () => {
    expect(parseSaveStateHeader(undefined as unknown as ArrayBuffer)).toEqual({
      kind: 'no-header',
    });
  });

  it('returns no-header for a too-small buffer', () => {
    expect(parseSaveStateHeader(new ArrayBuffer(10))).toEqual({ kind: 'no-header' });
  });

  it('returns no-header when magic is wrong', () => {
    const buf = new ArrayBuffer(30);
    new DataView(buf).setUint32(0, 0xdeadbeef, true);
    expect(parseSaveStateHeader(buf)).toEqual({ kind: 'no-header' });
  });

  it('returns corrupt when version is wrong', () => {
    const buf = new ArrayBuffer(30);
    const view = new DataView(buf);
    view.setUint32(0, SAVE_STATE_MAGIC, true);
    view.setUint32(4, 99, true);
    const r = parseSaveStateHeader(buf);
    expect(r.kind).toBe('corrupt');
    if (r.kind === 'corrupt') expect(r.reason).toContain('99');
  });

  it('returns corrupt when declared urlLen overflows the buffer', () => {
    const buf = new ArrayBuffer(30);
    const view = new DataView(buf);
    view.setUint32(0, SAVE_STATE_MAGIC, true);
    view.setUint32(4, SAVE_STATE_VERSION, true);
    view.setUint32(8, 9999, true);
    const r = parseSaveStateHeader(buf);
    expect(r.kind).toBe('corrupt');
    if (r.kind === 'corrupt') expect(r.reason).toContain('9999');
  });
});

describe('buildSaveStateHeader + parseSaveStateHeader round-trip', () => {
  it('round-trips a disc URL and cdromId', () => {
    const coreBuf = new Uint8Array([1, 2, 3]).buffer;
    const result = buildSaveStateHeader(coreBuf, 'http://example.com/game.chd', 'SLUS94465');
    const parsed = ok(parseSaveStateHeader(result));

    expect(parsed.discUrl).toBe('http://example.com/game.chd');
    expect(parsed.gameId).toBe('SLUS94465');
    expect(parsed.coreOffset).toBe(21 + 'http://example.com/game.chd'.length);

    const core = new Uint8Array(result, parsed.coreOffset);
    expect([...core]).toEqual([1, 2, 3]);
  });

  it('falls back to discUrl as gameId when cdromId is empty', () => {
    const result = buildSaveStateHeader(new ArrayBuffer(1), 'http://example.com/x.chd', '');
    const parsed = ok(parseSaveStateHeader(result));
    // discUrl round-trips fully; gameId is truncated to 9 bytes in the header
    expect(parsed.discUrl).toBe('http://example.com/x.chd');
    expect(parsed.gameId).toBe('http://ex');
  });

  it('falls back to discUrl as gameId when cdromId is NO_DISC_CDROM_ID', () => {
    const result = buildSaveStateHeader(new ArrayBuffer(1), 'http://a.chd', NO_DISC_CDROM_ID);
    const parsed = ok(parseSaveStateHeader(result));
    expect(parsed.discUrl).toBe('http://a.chd');
    // gameId truncated to 9 bytes from the URL
    expect(parsed.gameId).toBe('http://a.');
  });

  it('handles a short disc URL with cdromId present', () => {
    const result = buildSaveStateHeader(new ArrayBuffer(0), 'x', 'SLUS00001');
    const parsed = ok(parseSaveStateHeader(result));
    expect(parsed.discUrl).toBe('x');
    expect(parsed.gameId).toBe('SLUS00001');
    expect(parsed.coreOffset).toBe(21 + 1);
  });

  it('preserves non-ASCII URL bytes through UTF-8 round-trip', () => {
    const url = 'http://例え.jp/game.chd';
    const result = buildSaveStateHeader(new ArrayBuffer(2), url, 'SLUS12345');
    const parsed = ok(parseSaveStateHeader(result));
    expect(parsed.discUrl).toBe(url);
  });

  it('coreOffset points exactly past the header + url + gameId', () => {
    const url = 'a'; // 1 byte url
    const result = buildSaveStateHeader(new ArrayBuffer(4), url, 'SLUS00001');
    const parsed = ok(parseSaveStateHeader(result));
    // MIN_HEADER_SIZE (21) + urlLen (1) = 22
    expect(parsed.coreOffset).toBe(22);
  });

  it('round-trips an empty core buffer', () => {
    const result = buildSaveStateHeader(new ArrayBuffer(0), 'd', 'SLUS00001');
    const parsed = ok(parseSaveStateHeader(result));
    expect(parsed.discUrl).toBe('d');
    expect(parsed.coreOffset).toBe(21 + 1);
  });
});

describe('buildSaveStateHeader input validation', () => {
  const dummyCore = new ArrayBuffer(1);

  it('throws RangeError when both cdromId and discUrl are empty', () => {
    expect(() => buildSaveStateHeader(dummyCore, '', '')).toThrow(RangeError);
    expect(() => buildSaveStateHeader(dummyCore, '', '')).toThrow('empty');
  });

  it('throws RangeError when cdromId exceeds 9 chars', () => {
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'A'.repeat(10))).toThrow(
      RangeError,
    );
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'A'.repeat(10))).toThrow('≤9');
  });

  it('throws RangeError when cdromId has non-ASCII chars', () => {
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'SLUSé')).toThrow(RangeError);
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'SLUSé')).toThrow('ASCII');
  });

  it('allows a 9-char ASCII cdromId', () => {
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'SLUS99999')).not.toThrow();
  });

  it('allows a 1-char cdromId', () => {
    expect(() => buildSaveStateHeader(dummyCore, 'http://a.chd', 'X')).not.toThrow();
  });

  it('allows long discUrl when cdromId is provided', () => {
    expect(() =>
      buildSaveStateHeader(dummyCore, 'http://very-long-url.example.com/game.chd', 'SLUS001'),
    ).not.toThrow();
  });

  it('allows long discUrl as gameId fallback when cdromId is empty', () => {
    // discUrl can be >9 chars; it goes into the variable-length URL field, not the 9-byte gameId field.
    // The gameId is also set to discUrl but that's stored only in the URL + gameId fields together.
    expect(() =>
      buildSaveStateHeader(dummyCore, 'http://very-long-url.example.com/game.chd', ''),
    ).not.toThrow();
  });
});
