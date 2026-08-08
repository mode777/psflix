import { afterEach, describe, expect, it } from 'vitest';
import { readPersisted, writePersisted, parsers, type Slice } from './persist';

type Demo = { on: boolean; count: number; mode: 'a' | 'b' | 'c' };

const slice: Slice<Demo> = {
  key: 'test:demo',
  fallback: { on: true, count: 5, mode: 'a' },
  fields: {
    on: parsers.boolean,
    count: parsers.clamped(0, 100),
    mode: parsers.enum(['a', 'b', 'c'] as const),
  },
};

afterEach(() => localStorage.clear());

describe('readPersisted', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(readPersisted(slice)).toEqual({ on: true, count: 5, mode: 'a' });
  });

  it('returns a copy of the fallback (not the same reference)', () => {
    expect(readPersisted(slice)).not.toBe(slice.fallback);
  });

  it('round-trips values written by writePersisted', () => {
    writePersisted(slice, { on: false, count: 42, mode: 'c' });
    expect(readPersisted(slice)).toEqual({ on: false, count: 42, mode: 'c' });
  });

  it('clamps out-of-range numbers', () => {
    writePersisted(slice, { on: true, count: 9999, mode: 'a' });
    expect(readPersisted(slice).count).toBe(100);
  });

  it('falls back per-field when stored values are invalid', () => {
    localStorage.setItem(slice.key, JSON.stringify({ on: 'yes', count: 'big', mode: 'zzz' }));
    const got = readPersisted(slice);
    expect(got).toEqual({ on: true, count: 5, mode: 'a' });
  });

  it('falls back to the whole default when the stored JSON is corrupt', () => {
    localStorage.setItem(slice.key, '{not json');
    expect(readPersisted(slice)).toEqual({ on: true, count: 5, mode: 'a' });
  });

  it('falls back when the stored value is not an object', () => {
    localStorage.setItem(slice.key, JSON.stringify(123));
    expect(readPersisted(slice)).toEqual(slice.fallback);
  });
});

describe('writePersisted', () => {
  it('writes JSON the reader can parse', () => {
    writePersisted(slice, { on: false, count: 7, mode: 'b' });
    expect(localStorage.getItem(slice.key)).toContain('"count":7');
  });
});
