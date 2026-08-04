'use strict';

// Memory card cloud sync. Downloads from PocketBase on auth, uploads on dirty export.
// See specs/archive/memcard-sync/spec.md.

import type { Repository } from 'repository';
import type { MemcardStorage } from './memcardStorage';
import { formatErr } from './saveStateStorage';

// ── Constants ───────────────────────────────────────────────────────

const MEMCARD_SLOT = 1;
const MEMCARD_LABEL = 'default';
// Debounce window for cloud uploads. A single PS1 save touches the card
// several times in quick succession (directory block + save block), and the
// worker's 5s poll can sample intermediate states. Collapsing touches into one
// upload — fired UPLOAD_DEBOUNCE_MS after the last dirty export — uses the
// final bytes and avoids redundant network round-trips.
const UPLOAD_DEBOUNCE_MS = 5000;
// Re-arm delay when an upload is mid-flight and a new dirty touch arrives.
// Short enough to retry promptly once the in-flight upload finishes.
const RETRY_WHILE_UPLOADING_MS = 1000;

// ── MemcardSync ─────────────────────────────────────────────────────

export class MemcardSync {
  private readonly _storage: MemcardStorage;
  private readonly _repo: Repository;
  private readonly _log: (level: string, msg: string) => void;
  private readonly _showToast: (msg: string) => void;
  private readonly _hash: (buf: ArrayBuffer) => Promise<string>;

  private _pendingDownload: Promise<void> | null = null;
  private _lastUploadedHash: string | null = null;
  private _pendingBytes: ArrayBuffer | null = null;
  private _dirtyTimer: ReturnType<typeof setTimeout> | null = null;
  private _uploading = false;
  private _disposed = false;

  constructor(
    storage: MemcardStorage,
    repo: Repository,
    log: (level: string, msg: string) => void,
    showToast: (msg: string) => void,
    opts?: { hashFn?: (buf: ArrayBuffer) => Promise<string> },
  ) {
    this._storage = storage;
    this._repo = repo;
    this._log = log;
    this._showToast = showToast;
    this._hash = opts?.hashFn ?? sha256Hex;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Download cloud memcard → storage. Deterministic entry point (also used by tests). */
  async syncNow(): Promise<void> {
    if (!this._repo.isAuthenticated()) return;
    this._pendingDownload = this._doDownload();
    try {
      await this._pendingDownload;
    } finally {
      this._pendingDownload = null;
    }
  }

  /** Await pending download before loading memcards into worker. */
  ensureDownloaded(): Promise<void> {
    return this._pendingDownload || Promise.resolve();
  }

  /** Stash a dirty export and (re)arm the debounce timer. Fire-and-forget.
   *  `bytes` is an ArrayBuffer from the worker (transferred), but accepting
   *  Uint8Array too keeps the contract tolerant — the previous direct-upload
   *  path happened to work because `new Uint8Array(bytes).buffer` accepts both. */
  onMemcardDirty(slot: number, bytes: ArrayBuffer | Uint8Array): void {
    if (slot !== MEMCARD_SLOT) return;
    if (!this._repo.isAuthenticated()) return;
    // Each touch replaces the pending bytes and resets the debounce window so
    // a burst of writes (the core's SaveMcd touches the dir block + save block
    // in sequence) collapses into one upload using the final state.
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this._pendingBytes = u8.slice().buffer as ArrayBuffer;
    this._armTimer(UPLOAD_DEBOUNCE_MS);
  }

  /** Handle auth state change. */
  onAuthChange(authed: boolean): void {
    if (authed) {
      void this.syncNow();
    } else {
      this._clearTransientState();
    }
  }

  /** Stop timers and clear transient state. Safe to call repeatedly. */
  dispose(): void {
    this._disposed = true;
    if (this._dirtyTimer) {
      clearTimeout(this._dirtyTimer);
      this._dirtyTimer = null;
    }
    this._pendingBytes = null;
    this._uploading = false;
  }

  // ── Internals ───────────────────────────────────────────────────

  private async _doDownload(): Promise<void> {
    const userId = this._repo.getCurrentUserId();
    if (!userId) return;

    try {
      this._log('info', 'memcard-sync: downloading cloud memcard…');
      const { buf } = await this._repo.downloadMemcard(userId, MEMCARD_LABEL);
      await this._storage.save(MEMCARD_SLOT, buf);
      this._log('info', `memcard-sync: cloud memcard loaded (${buf.byteLength} bytes)`);
      this._showToast('Memcard synced');
    } catch (e: unknown) {
      this._log('warn', `memcard-sync: download failed: ${formatErr(e)}`);
    }
  }

  /** Fired by the debounce timer. Drains the latest pending bytes. */
  private _flushUpload(): void {
    // An upload is mid-flight: re-arm so we re-check once it lands. The
    // _doUpload finally block also re-arms if bytes arrived meanwhile, so the
    // newest touch is never lost.
    if (this._uploading) {
      this._armTimer(RETRY_WHILE_UPLOADING_MS);
      return;
    }
    const buf = this._pendingBytes;
    if (!buf) return;
    this._pendingBytes = null;
    void this._doUpload(buf);
  }

  private async _doUpload(buf: ArrayBuffer): Promise<void> {
    this._uploading = true;
    try {
      const hash = await this._hash(buf);
      if (hash === this._lastUploadedHash) {
        this._log(
          'info',
          'memcard-sync: dirty export detected but hash unchanged — skipping upload',
        );
        return;
      }

      this._log('info', 'memcard-sync: dirty export detected, uploading…');
      const userId = this._repo.getCurrentUserId();
      if (!userId) return;

      await this._repo.uploadMemcard(buf, userId, MEMCARD_LABEL);
      this._lastUploadedHash = hash;
      this._log('info', 'memcard-sync: memcard uploaded');
    } catch (e: unknown) {
      this._log('warn', `memcard-sync: upload failed: ${formatErr(e)}`);
      // Leave _lastUploadedHash unchanged — will retry on next dirty export.
    } finally {
      this._uploading = false;
      // If a touch arrived while uploading, re-arm the debounce to flush it.
      // Guard against dispose() having been called mid-flight.
      if (!this._disposed && this._pendingBytes && !this._dirtyTimer) {
        this._dirtyTimer = setTimeout(() => {
          this._dirtyTimer = null;
          this._flushUpload();
        }, UPLOAD_DEBOUNCE_MS);
      }
    }
  }

  /** Clear transient state on logout/de-auth. Does NOT cancel an in-flight upload. */
  private _clearTransientState(): void {
    this._lastUploadedHash = null;
    this._pendingDownload = null;
    if (this._dirtyTimer) {
      clearTimeout(this._dirtyTimer);
      this._dirtyTimer = null;
    }
    this._pendingBytes = null;
  }

  /** Arm (or re-arm) the debounce timer, replacing any previous timer. */
  private _armTimer(ms: number): void {
    if (this._dirtyTimer) clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(() => {
      this._dirtyTimer = null;
      this._flushUpload();
    }, ms);
  }
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0');
  }
  return hex;
}
