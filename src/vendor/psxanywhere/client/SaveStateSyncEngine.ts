'use strict';

// Background save-state sync engine. Uploads locally-unsynced states and
// downloads server-newer states for the active disc. Owns the periodic sync
// timer and auth/visibility lifecycle hooks.
//
// Conflict resolution (last-write-wins) is delegated to the pure helpers in
// saveStateConflict.ts; this class only orchestrates IO against the injected
// SaveStateStorage port and repository facade.
//
// See docs/save-state.md.

import type { Repository, SaveStateRecordDto } from 'repository';
import { UNSYNCED, SYNCED, slotToType, typeToSlot, compositeKey } from './slotKey';
import type { SaveStateStorage } from './saveStateStorage';
import { formatErr } from './saveStateStorage';
import { decideUploadConflict, decideDownloadConflict } from './saveStateConflict';

// Background sync cadence. The `_syncing` guard prevents overlapping runs, so
// a plain interval is sufficient (the previous recursive-setTimeout recursion
// added no extra safety).
const SYNC_INTERVAL_MS = 1000;

export class SaveStateSyncEngine {
  private readonly _storage: SaveStateStorage;
  private readonly _repo: Repository;
  private readonly _log: (level: string, msg: string) => void;
  private readonly _showToast: (msg: string) => void;
  private readonly _onSyncComplete: (() => void) | null;

  private _syncing = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _activeDiscSerial: string | null = null;
  // One-shot: download runs once after auth, then only on subsequent auths.
  private _shouldDownload = true;

  constructor(
    storage: SaveStateStorage,
    repo: Repository,
    log: (level: string, msg: string) => void,
    showToast: (msg: string) => void,
    onSyncComplete?: () => void,
  ) {
    this._storage = storage;
    this._repo = repo;
    this._log = log;
    this._showToast = showToast;
    this._onSyncComplete = onSyncComplete ?? null;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Set the disc whose states should be downloaded. Download sync is scoped to
   * the active disc only — swapping discs does not backfill other discs'
   * states. Must be called (or the download phase no-ops).
   */
  setActiveDisc(discSerial: string | null): void {
    this._activeDiscSerial = discSerial;
  }

  onAuthChange(authed: boolean): void {
    if (authed) {
      this._shouldDownload = true;
      void this._doSync();
      this._start();
    } else {
      this._stop();
    }
  }

  onVisibilityChange(): void {
    if (!this._repo.isAuthenticated()) return;
    void this._doSync();
    this._start();
  }

  syncIfAuthed(): void {
    if (!this._repo.isAuthenticated()) return;
    void this._doSync();
    this._start();
  }

  /** Trigger one sync cycle and await it. No-op (resolves immediately) when
   *  unauthed or another sync is already in flight. Exposed primarily as a
   *  deterministic entry point for tests; callers normally use syncIfAuthed(). */
  syncNow(): Promise<void> {
    return this._doSync();
  }

  /** Stop the periodic timer and clear transient state. Safe to call repeatedly. */
  dispose(): void {
    this._stop();
    this._activeDiscSerial = null;
  }

  // ── Timer ───────────────────────────────────────────────────────

  private _start(): void {
    if (this._timer) return;
    this._timer = setInterval(() => {
      void this._doSync();
    }, SYNC_INTERVAL_MS);
  }

  private _stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ── Sync internals ──────────────────────────────────────────────

  private async _doSync(): Promise<void> {
    if (this._syncing || !this._repo.isAuthenticated()) return;
    this._syncing = true;
    try {
      // Track whether this pass reconciled anything. `onSyncComplete` is only
      // meaningful when real work happened (an upload or a download pass);
      // firing it every tick caused the host to re-invalidate its caches once
      // per second and hammer the backend even while idle.
      let didWork = false;
      if (await this._uploadPending()) didWork = true;
      if (this._shouldDownload) {
        this._log('info', 'Downloading newer save states from server...');
        await this._downloadNewer(this._activeDiscSerial);
        this._shouldDownload = false;
        didWork = true;
      }
      if (didWork && this._onSyncComplete) {
        try {
          this._onSyncComplete();
        } catch (e: unknown) {
          this._log('warn', `SaveStateSyncEngine: onSyncComplete callback failed: ${formatErr(e)}`);
        }
      }
    } catch (e: unknown) {
      this._showToast('State sync failed: ' + formatErr(e));
    } finally {
      this._syncing = false;
    }
  }

  /** Upload all locally-unsynced states. Returns true if there was work to do. */
  private async _uploadPending(): Promise<boolean> {
    const unsynced = await this._storage.getAllUnsynced();
    if (unsynced.length === 0) return false;
    this._log('info', `Uploading ${unsynced.length} unsynced save states...`);

    for (const rec of unsynced) {
      try {
        const type = slotToType(rec.slot);
        const userId = this._repo.getCurrentUserId();
        if (!userId) continue;

        // If a cloud twin is known, reconcile before pushing: if the server
        // moved and is newer, pull it instead of clobbering it.
        if (rec.pocketbaseId) {
          const server = await this._repo.getSaveStateRecord(rec.pocketbaseId);
          if (
            decideUploadConflict(rec.localTimestamp, rec.serverUpdated ?? '', server.updated) ===
            'download'
          ) {
            const dl = await this._repo.downloadSaveState(rec.discSerial, type, userId);
            rec.buf = dl.buf;
            rec.pocketbaseId = dl.recordId;
            rec.serverUpdated = dl.updated;
            rec.synced = SYNCED;
            await this._storage.put(rec);
            continue;
          }
        }

        const uploaded = await this._repo.uploadSaveState(rec.discSerial, type, rec.buf, userId);
        rec.synced = SYNCED;
        rec.pocketbaseId = uploaded.id;
        rec.serverUpdated = uploaded.updated;
        await this._storage.put(rec);
        this._log('info', `Uploaded save state for disc ${rec.discSerial}, slot ${rec.slot}`);
      } catch (e: unknown) {
        this._log(
          'error',
          `Upload failed for save state ${rec.discSerial} slot ${rec.slot}: ${formatErr(e)}`,
        );
      }
    }
    return true;
  }

  private async _downloadNewer(discSerial: string | null): Promise<void> {
    this._log('info', 'Checking for newer save states on server...');
    if (!discSerial) return;
    const userId = this._repo.getCurrentUserId();
    if (!userId) return;

    const metaKey = `lastSyncTime:${discSerial}`;
    const since = await this._storage.getMeta(metaKey);

    let serverRecords: SaveStateRecordDto[];
    try {
      serverRecords = await this._repo.fetchSaveStatesFor(discSerial, userId, since ?? undefined);
    } catch (e: unknown) {
      this._log('warn', `SaveStateSyncEngine: fetchSaveStatesFor failed: ${formatErr(e)}`);
      return;
    }

    for (const dto of serverRecords) {
      const recDiscSerial =
        dto.discSerial ?? (await this._safeLookupDiscSerial(dto.discId, discSerial));
      const slot = typeToSlot(dto.type);
      const id = compositeKey(recDiscSerial, slot);
      const localRec = await this._storage.get(id);

      if (!localRec) {
        try {
          const buf = await this._repo.fetchSaveStateBytes(dto);
          await this._storage.put({
            id,
            buf,
            discSerial: recDiscSerial,
            slot,
            localTimestamp: Date.now(),
            synced: SYNCED,
            pocketbaseId: dto.id,
            serverUpdated: dto.updated,
          });
        } catch (e: unknown) {
          this._log(
            'warn',
            `SaveStateSyncEngine: download failed for ${recDiscSerial} slot ${slot}: ${formatErr(e)}`,
          );
        }
        continue;
      }

      const decision = decideDownloadConflict(
        localRec.localTimestamp,
        localRec.serverUpdated,
        dto.updated,
      );
      if (decision === 'download') {
        try {
          const buf = await this._repo.fetchSaveStateBytes(dto);
          localRec.buf = buf;
          localRec.pocketbaseId = dto.id;
          localRec.serverUpdated = dto.updated;
          localRec.synced = SYNCED;
          await this._storage.put(localRec);
        } catch (e: unknown) {
          this._log(
            'warn',
            `SaveStateSyncEngine: download update failed for ${recDiscSerial}: ${formatErr(e)}`,
          );
        }
      } else if (decision === 'mark-unsynced') {
        localRec.synced = UNSYNCED;
        await this._storage.put(localRec);
      }
      // 'noop' — already in sync, nothing to do.
    }

    await this._storage.putMeta(metaKey, new Date().toISOString());
  }

  /** Resolve a disc serial by id, falling back to the active disc on failure
   *  (every returned record belongs to the active disc, so the fallback is
   *  correct and a lookup error no longer aborts the whole download pass). */
  private async _safeLookupDiscSerial(discId: string, fallback: string): Promise<string> {
    try {
      return await this._repo.lookupDiscSerial(discId);
    } catch (e: unknown) {
      this._log(
        'warn',
        `SaveStateSyncEngine: lookupDiscSerial failed for ${discId}: ${formatErr(e)}`,
      );
      return fallback;
    }
  }
}
