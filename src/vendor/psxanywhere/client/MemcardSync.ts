'use strict';

// Memory card cloud sync. Downloads from PocketBase on auth, uploads on dirty export.
// Per-slot model: each of slots 1 and 2 is bound to a cloud card via
// setSlotBinding({ id, label }) and syncs independently. See
// specs/memory-manager-cloud-sync/ws-1-vendored-memcard-sync.md.

import type { Repository } from 'repository';
import type { MemcardStorage } from './memcardStorage';
import { formatErr } from './saveStateStorage';

// ── Constants ───────────────────────────────────────────────────────

const SLOTS = [1, 2] as const;
type Slot = (typeof SLOTS)[number];

interface SlotBinding {
  id: string; // PocketBase record id — stable across renames; used for upsert
  label: string; // display name / cloud lookup key (legacy path)
}

interface SlotState {
  binding: SlotBinding | null;
  lastUploadedHash: string | null;
  pendingBytes: ArrayBuffer | null;
  dirtyTimer: ReturnType<typeof setTimeout> | null;
}

// Debounce window for cloud uploads. A single PS1 save touches the card
// several times in quick succession (directory block + save block), and the
// worker's 5s poll can sample intermediate states. Collapsing touches into one
// upload — fired UPLOAD_DEBOUNCE_MS after the last dirty export — uses the
// final bytes and avoids redundant network round-trips.
const UPLOAD_DEBOUNCE_MS = 5000;
// Re-arm delay when an upload is mid-flight and a new dirty touch arrives.
// Short enough to retry promptly once the in-flight upload finishes.
const RETRY_WHILE_UPLOADING_MS = 1000;

export type { SlotBinding };

// ── MemcardSync ─────────────────────────────────────────────────────

export class MemcardSync {
  private readonly _storage: MemcardStorage;
  private readonly _repo: Repository;
  private readonly _log: (level: string, msg: string) => void;
  private readonly _showToast: (msg: string) => void;
  private readonly _hash: (buf: ArrayBuffer) => Promise<string>;
  private readonly _onSyncStart: (() => void) | null;
  private readonly _onSyncComplete: (() => void) | null;

  private readonly _slots: Map<Slot, SlotState>;
  private _pendingDownload: Promise<void> | null = null;
  private _uploading = false;
  private _disposed = false;

  constructor(
    storage: MemcardStorage,
    repo: Repository,
    log: (level: string, msg: string) => void,
    showToast: (msg: string) => void,
    opts?: {
      hashFn?: (buf: ArrayBuffer) => Promise<string>;
      onSyncStart?: () => void;
      onSyncComplete?: () => void;
    },
  ) {
    this._storage = storage;
    this._repo = repo;
    this._log = log;
    this._showToast = showToast;
    this._hash = opts?.hashFn ?? sha256Hex;
    this._onSyncStart = opts?.onSyncStart ?? null;
    this._onSyncComplete = opts?.onSyncComplete ?? null;
    this._slots = new Map<Slot, SlotState>([
      [1, this._newSlotState()],
      [2, this._newSlotState()],
    ]);
  }

  private _newSlotState(): SlotState {
    return { binding: null, lastUploadedHash: null, pendingBytes: null, dirtyTimer: null };
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Host declares which cloud card (id+label) is mounted in a slot.
   *  Pass null to unbind (eject). Resets that slot's lastUploadedHash so the
   *  next dirty export under the new identity uploads (not dedup-skipped).
   *  Cancels any pending debounce timer + clears stale pending bytes. Does not
   *  itself upload — the next dirty export (worker 5s poll) drives that. */
  setSlotBinding(slot: number, binding: SlotBinding | null): void {
    if (slot !== 1 && slot !== 2) return;
    const st = this._slots.get(slot as Slot);
    if (!st) return;
    st.binding = binding;
    st.lastUploadedHash = null;
    if (st.dirtyTimer) {
      clearTimeout(st.dirtyTimer);
      st.dirtyTimer = null;
    }
    st.pendingBytes = null;
  }

  /** Download cloud memcards → storage for every *bound* slot. Deterministic
   *  entry point (also used by tests + onAuthChange). */
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
   *  Per-slot: no-op if the slot has no binding or the repo is unauthed. Both
   *  slots 1 and 2 are handled. `bytes` is an ArrayBuffer from the worker
   *  (transferred), but accepting Uint8Array too keeps the contract tolerant —
   *  the previous direct-upload path happened to work because
   *  `new Uint8Array(bytes).buffer` accepts both. */
  onMemcardDirty(slot: number, bytes: ArrayBuffer | Uint8Array): void {
    if (slot !== 1 && slot !== 2) return; // ignore unknown slots
    if (!this._repo.isAuthenticated()) return;
    const st = this._slots.get(slot as Slot);
    if (!st || !st.binding) return; // unbound slot: no-op
    // Each touch replaces the pending bytes and resets the debounce window so
    // a burst of writes (the core's SaveMcd touches the dir block + save block
    // in sequence) collapses into one upload using the final state.
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    st.pendingBytes = u8.slice().buffer as ArrayBuffer;
    this._armTimer(st, UPLOAD_DEBOUNCE_MS);
  }

  /** Handle auth state change. On auth, download both bound slots; on de-auth,
   *  clear per-slot transient state. */
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
    for (const st of this._slots.values()) {
      if (st.dirtyTimer) {
        clearTimeout(st.dirtyTimer);
        st.dirtyTimer = null;
      }
      st.pendingBytes = null;
    }
    this._uploading = false;
  }

  // ── Internals ───────────────────────────────────────────────────

  private async _doDownload(): Promise<void> {
    const userId = this._repo.getCurrentUserId();
    if (!userId) return;

    this._log('info', 'memcard-sync: downloading cloud memcards…');
    this._onSyncStart?.();
    for (const slot of SLOTS) {
      const st = this._slots.get(slot)!;
      if (!st.binding) continue; // unbound slot: skip
      try {
        const { buf } = await this._repo.downloadMemcard(userId, st.binding.label);
        await this._storage.save(slot, buf);
        this._log('info', `memcard-sync: slot ${slot} downloaded (${buf.byteLength} bytes)`);
      } catch (e: unknown) {
        // 404 (no cloud card yet for this label) is benign — leave IDB as-is.
        // One slot's failure must not abort the other slot's download.
        this._log('warn', `memcard-sync: slot ${slot} download failed: ${formatErr(e)}`);
      }
    }
    this._showToast('Memcard synced');
    this._onSyncComplete?.();
  }

  /** Fired by a debounce timer. Drains pending bytes across both slots. */
  private _flushUpload(): void {
    // An upload pass is mid-flight: re-arm so we re-check once it lands. The
    // _drainUpload finally block also re-arms if bytes arrived meanwhile, so
    // the newest touch is never lost.
    if (this._uploading) {
      for (const st of this._slots.values()) {
        if (st.pendingBytes && !st.dirtyTimer) {
          this._armTimer(st, RETRY_WHILE_UPLOADING_MS);
        }
      }
      return;
    }
    // Collect every slot with pending bytes and drain them sequentially within
    // one pass (slot 1 then slot 2). Order is irrelevant: the two records are
    // independent.
    const pending = SLOTS.map((s) => ({ slot: s, st: this._slots.get(s)! })).filter(
      (x) => x.st.pendingBytes,
    );
    if (pending.length === 0) return;
    void this._drainUpload(pending);
  }

  private async _drainUpload(pending: { slot: Slot; st: SlotState }[]): Promise<void> {
    this._uploading = true;
    try {
      for (const { slot, st } of pending) {
        if (!st.pendingBytes) continue;
        const buf = st.pendingBytes;
        st.pendingBytes = null;
        await this._doUpload(buf, slot, st);
      }
    } finally {
      this._uploading = false;
      // If a touch arrived during the pass, re-arm the debounce to flush it.
      // Guard against dispose() having been called mid-flight.
      if (!this._disposed) {
        for (const s of this._slots.values()) {
          if (s.pendingBytes && !s.dirtyTimer) {
            this._armTimer(s, UPLOAD_DEBOUNCE_MS);
          }
        }
      }
    }
  }

  private async _doUpload(buf: ArrayBuffer, slot: Slot, st: SlotState): Promise<void> {
    const hash = await this._hash(buf);
    if (hash === st.lastUploadedHash) {
      this._log(
        'info',
        `memcard-sync: slot ${slot} dirty export detected but hash unchanged — skipping upload`,
      );
      return;
    }

    if (!st.binding) return;
    this._log('info', `memcard-sync: slot ${slot} dirty export detected, uploading…`);
    this._onSyncStart?.();
    const userId = this._repo.getCurrentUserId();
    if (!userId) return;

    try {
      await this._repo.uploadMemcard(buf, userId, st.binding.label, st.binding.id);
      st.lastUploadedHash = hash;
      this._log('info', `memcard-sync: slot ${slot} memcard uploaded`);
      this._onSyncComplete?.();
    } catch (e: unknown) {
      this._log('warn', `memcard-sync: slot ${slot} upload failed: ${formatErr(e)}`);
      this._onSyncComplete?.();
      // Leave lastUploadedHash unchanged — will retry on next dirty export.
    }
  }

  /** Clear transient state on logout/de-auth across both slots. Does NOT cancel
   *  an in-flight upload. */
  private _clearTransientState(): void {
    for (const st of this._slots.values()) {
      st.lastUploadedHash = null;
      if (st.dirtyTimer) {
        clearTimeout(st.dirtyTimer);
        st.dirtyTimer = null;
      }
      st.pendingBytes = null;
    }
    this._pendingDownload = null;
  }

  /** Arm (or re-arm) a slot's debounce timer, replacing any previous timer. */
  private _armTimer(st: SlotState, ms: number): void {
    if (st.dirtyTimer) clearTimeout(st.dirtyTimer);
    st.dirtyTimer = setTimeout(() => {
      st.dirtyTimer = null;
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
