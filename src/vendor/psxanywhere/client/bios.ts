'use strict';

// BIOS loader with injectable storage / fetch / logging.
//
// The loader memoizes a single successful BIOS buffer for the process
// lifetime and persists a base64 copy in a synchronous key/value store
// (localStorage by default) so the second boot skips the network.
//
// All collaborators (URL, storage backend, fetch implementation, logger)
// are constructor-injected so the module is unit-testable without global
// stubbing. See specs/archive/separation-of-concerns/spec.md (Client layer).

import { formatErr, type LogFn } from './local-json';

// ── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_BIOS_STORAGE_KEY = 'psxanywhere-bios-v1';

// ── Collaborator abstractions ───────────────────────────────────────

export type BiosLogLevel = 'info' | 'warn' | 'error';

/**
 * Logger callback. Aliased to the canonical `LogFn` (see ./local-json) so
 * every storage module shares one log type. `BiosLogLevel` is kept as a
 * documentation hint of the levels BiosLoader actually emits.
 */
export type Logger = LogFn;

/** Synchronous key/value binary string store. Modeled on localStorage so
 *  the cache read stays on the memoization fast path. An async backend
 *  (e.g. IndexedDB) would require a different interface. */
export interface BiosStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage-backed BiosStorage. */
export class LocalBiosStorage implements BiosStorage {
  get(key: string): string | null {
    return localStorage.getItem(key);
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  remove(key: string): void {
    localStorage.removeItem(key);
  }
}

/** Subset of `Response` the loader consumes (keeps fakes minimal). */
export interface BiosFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type BiosFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<BiosFetchResponse>;

export interface BiosLoaderOptions {
  url: string;
  storageKey?: string;
  storage?: BiosStorage;
  fetchFn?: BiosFetch;
  log?: Logger;
}

// ── Typed errors ────────────────────────────────────────────────────

export class BiosFetchError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(`BIOS fetch failed: ${status}`);
    this.name = 'BiosFetchError';
    this.status = status;
    this.url = url;
  }
}

export class BiosCacheCorruptError extends Error {
  constructor(reason: string) {
    super(`cached BIOS is invalid: ${reason}`);
    this.name = 'BiosCacheCorruptError';
  }
}

// ── BiosLoader ──────────────────────────────────────────────────────

export class BiosLoader {
  private readonly url: string;
  private readonly storageKey: string;
  private readonly storage: BiosStorage;
  private readonly fetchFn: BiosFetch;
  private readonly log: Logger;
  private promise: Promise<ArrayBuffer> | null = null;

  constructor(opts: BiosLoaderOptions) {
    if (!opts.url) throw new Error('BiosLoader: url is required');
    this.url = opts.url;
    this.storageKey = opts.storageKey ?? DEFAULT_BIOS_STORAGE_KEY;
    this.storage = opts.storage ?? new LocalBiosStorage();
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
    this.log = opts.log ?? (() => {});
  }

  /**
   * Returns the BIOS buffer. Success is memoized for the loader's lifetime;
   * a network failure clears the memo so the next call retries. An optional
   * AbortSignal cancels the in-flight fetch (the memo is also cleared on abort).
   */
  load(signal?: AbortSignal): Promise<ArrayBuffer> {
    if (this.promise) return this.promise;
    const cached = this.loadCached();
    if (cached) {
      this.promise = Promise.resolve(cached);
      return this.promise;
    }
    this.promise = this.fetchFromNetwork(signal).catch((err) => {
      this.promise = null;
      throw err;
    });
    return this.promise;
  }

  /** Clears the in-memory memo and the persistent cache entry. */
  invalidate(): void {
    this.promise = null;
    try {
      this.storage.remove(this.storageKey);
      this.log('info', 'bios: cache invalidated');
    } catch (err) {
      this.log('warn', `bios: failed to evict cache: ${formatErr(err)}`);
    }
  }

  /**
   * Reads the persisted cache and decodes it. Returns null (and evicts the
   * entry) when the cache is missing, unreadable, or corrupt. Public so the
   * cache path is independently testable.
   */
  loadCached(): ArrayBuffer | null {
    let encoded: string | null;
    try {
      encoded = this.storage.get(this.storageKey);
    } catch (err) {
      this.log('warn', `bios: cache read failed: ${formatErr(err)}`);
      return null;
    }
    if (!encoded) return null;
    try {
      const bios = decodeStoredBytes(encoded);
      if (bios.byteLength === 0) throw new BiosCacheCorruptError('empty');
      this.log('info', `bios: loaded ${bios.byteLength} bytes from cache`);
      return bios;
    } catch (err: unknown) {
      try {
        this.storage.remove(this.storageKey);
      } catch (rmErr) {
        this.log('warn', `bios: failed to remove invalid cache: ${formatErr(rmErr)}`);
      }
      this.log('warn', `bios: cache invalid, refetching: ${formatErr(err)}`);
      return null;
    }
  }

  private async fetchFromNetwork(signal?: AbortSignal): Promise<ArrayBuffer> {
    this.log('info', `bios: fetching ${this.url}`);
    const resp = await this.fetchFn(this.url, signal ? { signal } : undefined);
    if (!resp.ok) throw new BiosFetchError(resp.status, this.url);
    const bios = await resp.arrayBuffer();
    if (bios.byteLength === 0) throw new BiosCacheCorruptError('network returned empty body');
    this.saveCached(bios);
    this.log('info', `bios: fetched ${bios.byteLength} bytes from network`);
    return bios;
  }

  private saveCached(bios: ArrayBuffer): void {
    try {
      this.storage.set(this.storageKey, encodeBytesForStorage(new Uint8Array(bios)));
      this.log('info', `bios: cached ${bios.byteLength} bytes`);
    } catch (err) {
      this.log('warn', `bios: failed to cache: ${formatErr(err)}`);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Alias of the shared `formatErr` (see ./local-json). Kept under this name
 * for back-compat with external imports and tests/client/bios.test.ts.
 */
export { formatErr as toMessage };

function encodeBytesForStorage(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkBinary = '';
    for (let j = 0; j < chunk.length; j++) chunkBinary += String.fromCharCode(chunk[j]);
    binary += chunkBinary;
  }
  return btoa(binary);
}

function decodeStoredBytes(encoded: string): ArrayBuffer {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
