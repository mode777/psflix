import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateCategory,
  aggregateStorage,
  boundedMap,
  cacheGetSize,
  cacheSetSize,
  probeWithCache,
  type ProbeResult,
  type StorageCategoryKey,
} from './storage';

const K = (k: StorageCategoryKey) => k;

describe('aggregateCategory', () => {
  it('sums successful probe byte sizes', () => {
    const r = aggregateCategory(K('discs'), [{ bytes: 100 }, { bytes: 250 }, { bytes: 50 }]);
    expect(r.totalBytes).toBe(400);
    expect(r.fileCount).toBe(3);
    expect(r.failedCount).toBe(0);
    expect(r.incomplete).toBe(false);
  });

  it('reports zero for a category with no files', () => {
    const r = aggregateCategory(K('documents'), []);
    expect(r.totalBytes).toBe(0);
    expect(r.fileCount).toBe(0);
    expect(r.incomplete).toBe(false);
  });

  it('flags incomplete when any probe failed (bytes null) but still sums the rest', () => {
    const r = aggregateCategory(K('save_state'), [{ bytes: 200 }, { bytes: null }, { bytes: 75 }]);
    expect(r.totalBytes).toBe(275);
    expect(r.failedCount).toBe(1);
    expect(r.incomplete).toBe(true);
  });

  it('respects an explicit forceIncomplete override (e.g. list failure)', () => {
    const r = aggregateCategory(K('memory_cards'), [], true);
    expect(r.totalBytes).toBe(0);
    expect(r.incomplete).toBe(true);
  });
});

describe('aggregateStorage', () => {
  it('sums per-category totals into a grand total', () => {
    const agg = aggregateStorage([
      { key: K('discs'), results: [{ bytes: 500 }, { bytes: 500 }] },
      { key: K('documents'), results: [{ bytes: 20 }] },
      { key: K('save_state'), results: [] },
      { key: K('memory_cards'), results: [{ bytes: 0 }] },
    ]);
    expect(agg.categories).toHaveLength(4);
    expect(agg.grandTotal).toBe(1020);
    expect(agg.incomplete).toBe(false);
  });

  it('marks the grand total incomplete if any category is incomplete', () => {
    const agg = aggregateStorage([
      { key: K('discs'), results: [{ bytes: 500 }] },
      { key: K('documents'), results: [{ bytes: null }] },
    ]);
    expect(agg.grandTotal).toBe(500);
    expect(agg.incomplete).toBe(true);
  });

  it('reports zero across the board when every category is empty', () => {
    const agg = aggregateStorage([
      { key: K('discs'), results: [] },
      { key: K('documents'), results: [] },
    ]);
    expect(agg.grandTotal).toBe(0);
    expect(agg.incomplete).toBe(false);
  });
});

describe('size cache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('round-trips a cached size and returns null on miss', () => {
    const url = 'http://x/api/files/discs/rec/iso.bin';
    expect(cacheGetSize(url)).toBeNull();
    cacheSetSize(url, 4096);
    expect(cacheGetSize(url)).toBe(4096);
  });
});

describe('probeWithCache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('returns the cached size without invoking the probe on a cache hit', async () => {
    const url = 'http://x/api/files/discs/a/iso.bin';
    cacheSetSize(url, 1024);
    const probe = vi.fn();
    const size = await probeWithCache(url, 'tok', probe);
    expect(size).toBe(1024);
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes and stores the size on a cache miss', async () => {
    const url = 'http://x/api/files/discs/b/iso.bin';
    const probe = vi.fn().mockResolvedValue(2048);
    const size = await probeWithCache(url, 'tok', probe);
    expect(size).toBe(2048);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(cacheGetSize(url)).toBe(2048);
  });
});

describe('boundedMap', () => {
  it('preserves order and caps concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await boundedMap(items, 3, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return n * 2;
    });
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('handles an empty input', async () => {
    const results = await boundedMap<ProbeResult, number>([], 4, async (r) =>
      Promise.resolve(r.bytes ?? 0),
    );
    expect(results).toEqual([]);
  });
});
