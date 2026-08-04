'use strict';

import { ChunkStore } from './ChunkStore';

const DEFAULT_CHUNK_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

export interface RemoteChdOptions {
  chunkBytes?: number;
  cacheEnabled?: boolean;
  cacheName?: string;
}

export interface MissListeners {
  onStart?: (idx: number) => void;
  onEnd?: (idx: number) => void;
}

export interface RemoteChdStats {
  hits: number;
  misses: number;
  bytesIn: number;
  bytesOut: number;
  putErrors: number;
  hitRatio: number;
  networkFetchCount: number;
}

export class RemoteChd {
  url: string;
  chunkBytes: number;
  cacheEnabled: boolean;
  cacheName: string | undefined;
  total: number;
  store: ChunkStore | null;
  bytesOut: number;
  networkFetchCount: number;

  constructor(
    url: string,
    { chunkBytes = DEFAULT_CHUNK_BYTES, cacheEnabled = true, cacheName }: RemoteChdOptions = {},
  ) {
    this.url = url;
    this.chunkBytes = chunkBytes;
    this.cacheEnabled = cacheEnabled;
    this.cacheName = cacheName;
    this.total = 0;
    this.store = null;
    this.bytesOut = 0;
    this.networkFetchCount = 0;
  }

  noteNetworkFetch() {
    this.networkFetchCount++;
  }

  async open() {
    const r = await fetch(this.url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (r.status !== 200 && r.status !== 204) {
      throw new Error(`RemoteChd: HEAD failed with status ${r.status}`);
    }
    const cl = parseInt(r.headers.get('Content-Length')!, 10);
    if (!(cl > 0)) throw new Error('RemoteChd: HEAD has no Content-Length');
    this.total = cl;
    const opts: any = {
      url: this.url,
      chunkBytes: this.chunkBytes,
      totalBytes: this.total,
      cacheEnabled: this.cacheEnabled,
    };
    if (this.cacheName) opts.cacheName = this.cacheName;
    this.store = new ChunkStore(opts);
    await this.store.open();
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (!(length > 0)) return new Uint8Array(0);
    if (offset < 0 || offset >= this.total) {
      throw new Error(
        `RemoteChd: read out of range: offset=${offset} length=${length} total=${this.total}`,
      );
    }
    if (offset + length > this.total) length = this.total - offset;
    this.bytesOut += length;
    const c0 = Math.floor(offset / this.chunkBytes);
    const c1 = Math.floor((offset + length - 1) / this.chunkBytes);
    const intraOffset = offset - c0 * this.chunkBytes;
    if (c0 === c1) {
      const c = await this.store!.getChunk(this.url, c0);
      return c.subarray(intraOffset, intraOffset + length);
    }
    const indices: number[] = [];
    for (let i = c0; i <= c1; i++) indices.push(i);
    const chunks = await Promise.all(indices.map((i) => this.store!.getChunk(this.url, i)));
    const out = new Uint8Array(length);
    let outPos = 0;
    let remaining = length;
    for (let i = 0; i < chunks.length && remaining > 0; i++) {
      const c = chunks[i];
      const start = i === 0 ? intraOffset : 0;
      if (start >= c.length) continue;
      const take = Math.min(c.length - start, remaining);
      out.set(c.subarray(start, start + take), outPos);
      outPos += take;
      remaining -= take;
    }
    return out;
  }

  setMissListeners(listeners: MissListeners) {
    if (this.store) this.store.setMissListeners(listeners);
  }
  setNetworkFetchListener(fn: (() => void) | null) {
    if (this.store) this.store.onNetworkFetch = typeof fn === 'function' ? fn : null;
  }
  getChunkBytes() {
    return this.chunkBytes;
  }
  getTotalChunks() {
    return Math.ceil(this.total / this.chunkBytes);
  }
  prefetchChunk(idx: number) {
    return this.store!.getChunk(this.url, idx, { silent: true });
  }
  // Synchronous cached/in-flight check for the speculator's step (1)
  // "is n+1 in the cache already?" — does NOT kick off a fetch. Returns
  // true for chunks in the Cache API (knownCached) or currently loading
  // (inflight — a joinable promise that will resolve into a cache put).
  hasChunkCached(idx: number) {
    return this.store ? this.store.hasChunk(idx) : false;
  }

  getStats(): RemoteChdStats {
    if (!this.store)
      return {
        hits: 0,
        misses: 0,
        bytesIn: 0,
        bytesOut: 0,
        putErrors: 0,
        hitRatio: 0,
        networkFetchCount: this.networkFetchCount,
      };
    const s = this.store.getStats();
    return { ...s, bytesOut: this.bytesOut, networkFetchCount: this.networkFetchCount };
  }

  async evict() {
    if (this.store) await this.store.evict();
    this.bytesOut = 0;
    this.networkFetchCount = 0;
  }
}
