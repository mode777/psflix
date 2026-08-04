// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  BiosLoader,
  BiosFetchError,
  BiosCacheCorruptError,
  toMessage,
  DEFAULT_BIOS_STORAGE_KEY,
  type BiosStorage,
  type BiosFetch,
  type BiosFetchResponse,
  type Logger,
} from '@/vendor/psxanywhere/client/bios';

const TEST_BIOS_URL = 'https://test.example/bios.bin';

// ── Test helpers ────────────────────────────────────────────────────

/** In-memory BiosStorage that records every call. */
class MemoryStorage implements BiosStorage {
  store = new Map<string, string>();
  readonly calls: { op: string; key: string; value?: string }[] = [];
  getShouldThrow: Error | null = null;
  setShouldThrow: Error | null = null;
  removeShouldThrow: Error | null = null;

  get(key: string): string | null {
    this.calls.push({ op: 'get', key });
    if (this.getShouldThrow) throw this.getShouldThrow;
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  set(key: string, value: string): void {
    this.calls.push({ op: 'set', key, value });
    if (this.setShouldThrow) throw this.setShouldThrow;
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.calls.push({ op: 'remove', key });
    if (this.removeShouldThrow) throw this.removeShouldThrow;
    this.store.delete(key);
  }
}

/** Build a fake fetch that resolves with the given bytes (HTTP 200). */
function okFetch(bytes: Uint8Array, calls?: { url: string; signal?: AbortSignal }[]): BiosFetch {
  return async (url, init) => {
    calls?.push({ url, signal: init?.signal });
    const buf = bytes.buffer.slice(0) as ArrayBuffer;
    return { ok: true, status: 200, arrayBuffer: async () => buf } satisfies BiosFetchResponse;
  };
}

/** Build a fake fetch that resolves with a non-ok HTTP status. */
function httpErrorFetch(status: number): BiosFetch {
  return async () => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });
}

/** Encode a byte list the same way the loader writes to storage. */
function encode(bytes: number[]): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Capturing logger that collects [level, msg] entries. */
function capturingLogger(): Logger & { entries: [string, string][] } {
  const entries: [string, string][] = [];
  const fn = ((level: string, msg: string) => {
    entries.push([level, msg]);
  }) as Logger & { entries: [string, string][] };
  fn.entries = entries;
  return fn;
}

function makeLoader(opts: {
  storage?: MemoryStorage;
  fetchFn?: BiosFetch;
  log?: Logger;
  url?: string;
  storageKey?: string;
}) {
  return new BiosLoader({
    storage: opts.storage ?? new MemoryStorage(),
    fetchFn: opts.fetchFn ?? okFetch(new Uint8Array([10, 20, 30])),
    log: opts.log ?? (() => {}),
    url: opts.url ?? TEST_BIOS_URL,
    storageKey: opts.storageKey,
  });
}

// ── constructor validation ──────────────────────────────────────────

describe('BiosLoader constructor', () => {
  it('throws when url is not provided', () => {
    expect(() => new BiosLoader({} as any)).toThrow('BiosLoader: url is required');
  });

  it('throws when url is empty string', () => {
    expect(() => new BiosLoader({ url: '' })).toThrow('BiosLoader: url is required');
  });
});

// ── load(): cache miss → fetch → persist ────────────────────────────

describe('BiosLoader.load — cache miss → network fetch', () => {
  it('fetches from the configured URL and returns the buffer', async () => {
    const fetchCalls: { url: string; signal?: AbortSignal }[] = [];
    const storage = new MemoryStorage();
    const loader = makeLoader({ storage, fetchFn: okFetch(new Uint8Array([1, 2, 3]), fetchCalls) });

    const bios = await loader.load();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(TEST_BIOS_URL);
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('persists the fetched buffer to storage under the storage key', async () => {
    const storage = new MemoryStorage();
    const loader = makeLoader({ storage, fetchFn: okFetch(new Uint8Array([9, 9])) });

    await loader.load();

    const set = storage.calls.find((c) => c.op === 'set');
    expect(set?.key).toBe(DEFAULT_BIOS_STORAGE_KEY);
    expect(set?.value).toBe(encode([9, 9]));
    expect(storage.store.get(DEFAULT_BIOS_STORAGE_KEY)).toBe(encode([9, 9]));
  });

  it('uses custom url and storageKey when provided', async () => {
    const fetchCalls: { url: string }[] = [];
    const storage = new MemoryStorage();
    const loader = makeLoader({
      storage,
      url: 'https://example.test/bios.bin',
      storageKey: 'custom-key',
      fetchFn: okFetch(new Uint8Array([1]), fetchCalls),
    });

    await loader.load();

    expect(fetchCalls[0].url).toBe('https://example.test/bios.bin');
    expect(storage.store.has('custom-key')).toBe(true);
  });
});

// ── load(): cache hit (no fetch) ────────────────────────────────────

describe('BiosLoader.load — cache hit', () => {
  it('returns the cached buffer without calling fetch', async () => {
    const storage = new MemoryStorage();
    storage.store.set(DEFAULT_BIOS_STORAGE_KEY, encode([7, 7, 7]));
    const fetchFn = vi.fn() as unknown as BiosFetch;
    const log = capturingLogger();
    const loader = makeLoader({ storage, fetchFn, log });

    const bios = await loader.load();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([7, 7, 7]));
    expect(log.entries.some(([l, m]) => l === 'info' && m.includes('from cache'))).toBe(true);
  });

  it('memoizes success: a second load() reuses the promise and never refetches', async () => {
    const fetchCalls: { url: string }[] = [];
    const loader = makeLoader({ fetchFn: okFetch(new Uint8Array([5]), fetchCalls) });

    const p1 = loader.load();
    const p2 = loader.load();
    expect(p1).toBe(p2); // identical memoized promise
    await p1;
    expect(fetchCalls).toHaveLength(1); // fetched exactly once

    const p3 = loader.load();
    expect(p3).toBe(p1); // still memoized after resolve
    expect(fetchCalls).toHaveLength(1);
  });
});

// ── load(): corrupt / edge-case cache ───────────────────────────────

describe('BiosLoader.loadCached — corrupt cache eviction', () => {
  it('evicts and refetches when the stored value is not valid base64', async () => {
    const storage = new MemoryStorage();
    storage.store.set(DEFAULT_BIOS_STORAGE_KEY, '!!!not-base64!!!');
    const fetchCalls: { url: string }[] = [];
    const loader = makeLoader({ storage, fetchFn: okFetch(new Uint8Array([1]), fetchCalls) });

    const bios = await loader.load();

    // corrupt entry was evicted, then fetch repopulated a valid one
    expect(storage.calls.some((c) => c.op === 'remove')).toBe(true);
    expect(storage.store.get(DEFAULT_BIOS_STORAGE_KEY)).not.toBe('!!!not-base64!!!');
    expect(storage.store.get(DEFAULT_BIOS_STORAGE_KEY)).toBe(encode([1]));
    expect(fetchCalls).toHaveLength(1); // fell back to network
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1]));
  });

  it('treats an empty stored string as a miss (falls back to network)', async () => {
    const storage = new MemoryStorage();
    storage.store.set(DEFAULT_BIOS_STORAGE_KEY, ''); // falsy → cache miss
    const fetchCalls: { url: string }[] = [];
    const loader = makeLoader({ storage, fetchFn: okFetch(new Uint8Array([42]), fetchCalls) });

    const bios = await loader.load();

    expect(fetchCalls).toHaveLength(1); // fell back to fetch
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([42]));
    // fetch repopulated the cache with the real bytes
    expect(storage.store.get(DEFAULT_BIOS_STORAGE_KEY)).toBe(encode([42]));
  });

  it('returns null and warns when storage.get throws', async () => {
    const storage = new MemoryStorage();
    storage.getShouldThrow = new Error('quota read denied');
    const log = capturingLogger();
    const loader = makeLoader({ storage, log, fetchFn: okFetch(new Uint8Array([1])) });

    const bios = await loader.load();

    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1])); // fell back to fetch
    expect(log.entries.some(([l]) => l === 'warn')).toBe(true);
  });
});

// ── load(): network failures ───────────────────────────────────────

describe('BiosLoader.load — network failures', () => {
  it('rejects with BiosFetchError on non-ok HTTP status', async () => {
    const loader = makeLoader({ fetchFn: httpErrorFetch(404) });

    await expect(loader.load()).rejects.toBeInstanceOf(BiosFetchError);
    try {
      await loader.load();
    } catch (err) {
      expect((err as BiosFetchError).status).toBe(404);
      expect((err as BiosFetchError).name).toBe('BiosFetchError');
    }
  });

  it('clears the memo on failure so the next call retries', async () => {
    let attempt = 0;
    const fetchFn: BiosFetch = async () => {
      attempt++;
      if (attempt === 1)
        return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1]).buffer.slice(0) as ArrayBuffer,
      };
    };
    const loader = makeLoader({ fetchFn });

    await expect(loader.load()).rejects.toThrow();
    const bios = await loader.load(); // retry succeeds
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1]));
  });

  it('rejects when the network returns an empty body', async () => {
    const fetchFn: BiosFetch = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const loader = makeLoader({ fetchFn });

    await expect(loader.load()).rejects.toBeInstanceOf(BiosCacheCorruptError);
  });

  it('does not persist when storage.set throws, but still returns the buffer', async () => {
    const storage = new MemoryStorage();
    storage.setShouldThrow = new Error('quota exceeded');
    const log = capturingLogger();
    const loader = makeLoader({ storage, log, fetchFn: okFetch(new Uint8Array([1, 2])) });

    const bios = await loader.load();

    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1, 2]));
    expect(log.entries.some(([l, m]) => l === 'warn' && m.includes('failed to cache'))).toBe(true);
  });
});

// ── load(): abort ──────────────────────────────────────────────────

describe('BiosLoader.load — abort signal', () => {
  it('forwards the AbortSignal to fetch', async () => {
    const ac = new AbortController();
    const seen: AbortSignal[] = [];
    const fetchFn: BiosFetch = async (_url, init) => {
      seen.push(init?.signal ?? (null as unknown as AbortSignal));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1]).buffer.slice(0) as ArrayBuffer,
      };
    };
    const loader = makeLoader({ fetchFn });

    await loader.load(ac.signal);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(ac.signal);
  });

  it('clears the memo when the fetch is aborted, allowing a retry', async () => {
    const ac = new AbortController();
    let attempt = 0;
    const fetchFn: BiosFetch = async () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1]).buffer.slice(0) as ArrayBuffer,
      };
    };
    const loader = makeLoader({ fetchFn });

    await expect(loader.load(ac.signal)).rejects.toThrow();
    const bios = await loader.load(); // retry succeeds (memo was cleared)
    expect(new Uint8Array(bios)).toEqual(new Uint8Array([1]));
    expect(attempt).toBe(2);
  });
});

// ── invalidate() ───────────────────────────────────────────────────

describe('BiosLoader.invalidate', () => {
  it('clears the memo and the persistent cache entry', async () => {
    const storage = new MemoryStorage();
    const loader = makeLoader({ storage, fetchFn: okFetch(new Uint8Array([1])) });

    await loader.load();
    expect(storage.store.has(DEFAULT_BIOS_STORAGE_KEY)).toBe(true);
    const firstPromise = loader.load();
    expect(firstPromise).toBeDefined();

    loader.invalidate();

    expect(storage.store.has(DEFAULT_BIOS_STORAGE_KEY)).toBe(false);
    expect(storage.calls.some((c) => c.op === 'remove')).toBe(true);
  });

  it('forces a refetch on the next load()', async () => {
    const fetchCalls: { url: string }[] = [];
    const loader = makeLoader({ fetchFn: okFetch(new Uint8Array([1]), fetchCalls) });

    await loader.load();
    loader.invalidate();
    await loader.load();

    expect(fetchCalls).toHaveLength(2);
  });

  it('logs a warning (and does not throw) when storage.remove throws', async () => {
    const storage = new MemoryStorage();
    storage.removeShouldThrow = new Error('locked');
    const log = capturingLogger();
    const loader = makeLoader({ storage, log, fetchFn: okFetch(new Uint8Array([1])) });

    await loader.load();
    expect(() => loader.invalidate()).not.toThrow();
    expect(log.entries.some(([l, m]) => l === 'warn' && m.includes('evict'))).toBe(true);
  });
});

// ── toMessage helper ───────────────────────────────────────────────

describe('toMessage', () => {
  it('extracts .message from an Error', () => {
    expect(toMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a bare string', () => {
    expect(toMessage('nope')).toBe('nope');
  });

  it('stringifies arbitrary values', () => {
    expect(toMessage(42)).toBe('42');
    expect(toMessage({ a: 1 })).toBe('[object Object]');
  });

  it('uses the Error message for typed errors (instanceof check)', () => {
    expect(toMessage(new BiosFetchError(503, 'u'))).toBe('BIOS fetch failed: 503');
    expect(toMessage(new BiosCacheCorruptError('x'))).toBe('cached BIOS is invalid: x');
  });
});

// ── LocalBiosStorage wrapper ───────────────────────────────────────

describe('LocalBiosStorage', () => {
  it('delegates get/set/remove to the global localStorage', async () => {
    const { LocalBiosStorage } = await import('@/vendor/psxanywhere/client/bios');
    const fakeLS = new Map<string, string>();
    const stub = {
      getItem: (k: string) => (fakeLS.has(k) ? fakeLS.get(k)! : null),
      setItem: (k: string, v: string) => {
        fakeLS.set(k, v);
      },
      removeItem: (k: string) => {
        fakeLS.delete(k);
      },
    };
    vi.stubGlobal('localStorage', stub);
    try {
      const s = new LocalBiosStorage();
      expect(s.get('k')).toBeNull();
      s.set('k', 'v');
      expect(s.get('k')).toBe('v');
      s.remove('k');
      expect(s.get('k')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
