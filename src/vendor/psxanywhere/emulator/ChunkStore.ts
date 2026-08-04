'use strict';

const DEFAULT_CACHE_NAME = 'psanywhere-chunks-v1';
const FETCH_TOTAL_BUDGET_MS = 60000;
const FETCH_ATTEMPT_TIMEOUT_MS = 30000;
const FETCH_MAX_ATTEMPTS = 3;
const FETCH_BACKOFF_BASE_MS = 300;

interface MissListeners {
  onStart?: ((idx: number) => void) | null;
  onEnd?: ((idx: number) => void) | null;
}

export interface ChunkStoreStats {
  hits: number;
  misses: number;
  bytesIn: number;
  putErrors: number;
  hitRatio: number;
}

export class ChunkStore {
  url: string | null;
  chunkBytes: number;
  totalBytes: number;
  cacheName: string;
  cacheEnabled: boolean;
  cache: Cache | null;
  inflight: Map<number, Promise<Uint8Array>>;
  hits: number;
  misses: number;
  bytesIn: number;
  putErrors: number;
  onMissStart: ((idx: number) => void) | null;
  onMissEnd: ((idx: number) => void) | null;
  onNetworkFetch: (() => void) | null;
  networkInflight: Set<number>;
  knownCached: Set<number>;

  constructor({
    url,
    chunkBytes,
    totalBytes,
    cacheName = DEFAULT_CACHE_NAME,
    cacheEnabled = true,
  }: {
    url: string;
    chunkBytes: number;
    totalBytes: number;
    cacheName?: string;
    cacheEnabled?: boolean;
  }) {
    if (!(chunkBytes > 0)) throw new Error('ChunkStore: chunkBytes must be > 0');
    if (!(totalBytes > 0)) throw new Error('ChunkStore: totalBytes must be > 0');
    this.url = url || null;
    this.chunkBytes = chunkBytes;
    this.totalBytes = totalBytes;
    this.cacheName = cacheName;
    this.cacheEnabled = cacheEnabled;
    this.cache = null;
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
    this.bytesIn = 0;
    this.putErrors = 0;
    this.onMissStart = null;
    this.onMissEnd = null;
    this.onNetworkFetch = null;
    this.networkInflight = new Set();
    this.knownCached = new Set();
  }

  async open() {
    if (!this.cacheEnabled) return;
    if (typeof caches === 'undefined') {
      this.cacheEnabled = false;
      return;
    }
    this.cache = await caches.open(this.cacheName);
    await this._seedKnownCached();
  }

  async _seedKnownCached() {
    if (!this.cache || !this.url) return;
    let keys: readonly Request[];
    try {
      keys = await this.cache.keys();
    } catch (e: any) {
      console.warn(`ChunkStore: cache.keys() failed: ${e?.message ?? e}`);
      return;
    }
    const prefix = this.url;
    for (const k of keys) {
      try {
        const u = k.url;
        if (!u || !u.startsWith(prefix)) continue;
        const i = u.indexOf('__chunk=');
        if (i < 0) continue;
        const n = parseInt(u.slice(i + 8), 10);
        if (Number.isInteger(n) && n >= 0) this.knownCached.add(n);
      } catch (e: any) {
        console.warn(`ChunkStore: skipping malformed cache key: ${e?.message ?? e}`);
      }
    }
  }

  setMissListeners({ onStart, onEnd }: MissListeners = {}) {
    this.onMissStart = typeof onStart === 'function' ? onStart : null;
    this.onMissEnd = typeof onEnd === 'function' ? onEnd : null;
  }

  async getChunk(url: string, idx: number, { silent = false } = {}): Promise<Uint8Array> {
    const pending = this.inflight.get(idx);
    if (pending) {
      if (!silent && this.onMissStart) this.onMissStart(idx);
      if (!silent && this.networkInflight.has(idx) && this.onNetworkFetch) {
        this.onNetworkFetch();
      }
      if (!silent) {
        pending.then(
          () => {
            if (this.onMissEnd) this.onMissEnd(idx);
          },
          () => {
            if (this.onMissEnd) this.onMissEnd(idx);
          },
        );
      }
      return pending;
    }
    const p = this._load(url, idx, { silent });
    this.inflight.set(idx, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(idx);
    }
  }

  async _load(url: string, idx: number, { silent = false } = {}): Promise<Uint8Array> {
    let bytes = await this._cacheGet(url, idx);
    if (bytes) {
      this.hits++;
      this.knownCached.add(idx);
      return bytes;
    }
    if (!silent && this.onMissStart) this.onMissStart(idx);
    this.networkInflight.add(idx);
    if (!silent && this.onNetworkFetch) this.onNetworkFetch();
    try {
      const start = idx * this.chunkBytes;
      const end = Math.min(start + this.chunkBytes - 1, this.totalBytes - 1);
      const expectedLength = end - start + 1;
      const r = await this._fetchRangeWithRetry(url, start, end);
      bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength !== expectedLength) {
        throw new Error(
          `ChunkStore: chunk ${idx} bad length: expected ${expectedLength} bytes, got ${bytes.byteLength}`,
        );
      }
      this.misses++;
      this.bytesIn += bytes.byteLength;
      this._cachePut(url, idx, bytes);
      this.knownCached.add(idx);
      return bytes;
    } finally {
      this.networkInflight.delete(idx);
      if (!silent && this.onMissEnd) this.onMissEnd(idx);
    }
  }

  hasChunk(idx: number): boolean {
    return this.knownCached.has(idx) || this.inflight.has(idx);
  }

  async _fetchRangeWithRetry(url: string, start: number, end: number): Promise<Response> {
    const deadline = Date.now() + FETCH_TOTAL_BUDGET_MS;
    let lastErr: any = new Error('ChunkStore: fetch retry budget exhausted');
    for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const remainingForBackoff = deadline - Date.now();
        if (remainingForBackoff <= 0) break;
        const backoff = Math.min(
          FETCH_BACKOFF_BASE_MS * Math.pow(4, attempt - 1) + Math.random() * 100,
          remainingForBackoff,
        );
        if (backoff > 0) await new Promise((resolve) => setTimeout(resolve, backoff));
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const attemptTimeout = Math.min(FETCH_ATTEMPT_TIMEOUT_MS, remaining);
      try {
        const r = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: AbortSignal.timeout(attemptTimeout),
        });
        if (r.status !== 206) throw new Error(`ChunkStore: expected 206, got ${r.status}`);
        return r;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  _cacheKey(url: string, idx: number): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}__chunk=${idx}`;
  }

  async _cacheGet(url: string, idx: number): Promise<Uint8Array | null> {
    if (!this.cache) return null;
    const resp = await this.cache.match(this._cacheKey(url, idx));
    if (!resp) return null;
    return new Uint8Array(await resp.arrayBuffer());
  }

  _cachePut(url: string, idx: number, bytes: Uint8Array) {
    if (!this.cache) return;
    this.cache
      .put(
        this._cacheKey(url, idx),
        new Response(new Blob([bytes.buffer as ArrayBuffer]), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      )
      .catch((e: any) => {
        this.putErrors++;
        console.warn(`ChunkStore: cache.put failed for chunk ${idx}: ${e?.message ?? e}`);
      });
  }

  async evict() {
    this.inflight.clear();
    this.networkInflight.clear();
    this.knownCached.clear();
    this.hits = 0;
    this.misses = 0;
    this.bytesIn = 0;
    this.putErrors = 0;
    if (this.cache) {
      const keys = await this.cache.keys();
      await Promise.all(keys.map((k) => this.cache!.delete(k)));
    }
  }

  getStats(): ChunkStoreStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      bytesIn: this.bytesIn,
      putErrors: this.putErrors,
      hitRatio: total ? this.hits / total : 0,
    };
  }
}
