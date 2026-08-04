'use strict';

// Pure save-state conflict resolution. Extracted from the sync engine so the
// last-write-wins policy is unit-testable without IDB or network. See
// docs/save-state.md.

// Which side of a local/cloud comparison is newer, based purely on timestamps.
export type Side = 'local' | 'server' | 'tie';

// Compare a local wall-clock timestamp (ms) against a server `updated` ISO
// string. Returns whichever is newer, or 'tie' if equal.
export function newerSide(localTimestampMs: number, serverUpdatedIso: string): Side {
  const serverMs = new Date(serverUpdatedIso).getTime();
  if (localTimestampMs > serverMs) return 'local';
  if (serverMs > localTimestampMs) return 'server';
  return 'tie';
}

// ── Upload direction (an unsynced local record vs. its server twin) ──────

export type UploadDecision = 'upload' | 'download';

// Decides what to do with an unsynced local record that already has a known
// PocketBase twin. If the server hasn't moved since we last saw it, the local
// edit wins outright; otherwise last-write-wins on the timestamps.
export function decideUploadConflict(
  localTimestampMs: number,
  lastKnownServerUpdated: string,
  currentServerUpdated: string,
): UploadDecision {
  if (currentServerUpdated === lastKnownServerUpdated) return 'upload';
  return newerSide(localTimestampMs, currentServerUpdated) === 'server' ? 'download' : 'upload';
}

// ── Download direction (a server record vs. its local twin) ─────────────

export type DownloadDecision = 'download' | 'mark-unsynced' | 'noop';

// Decides what to do with a server record relative to a local twin. 'noop'
// when in sync; 'download' when the server is strictly newer; 'mark-unsynced'
// when the local copy is newer (so the next upload cycle pushes it).
export function decideDownloadConflict(
  localTimestampMs: number,
  localServerUpdated: string | null,
  currentServerUpdated: string,
): DownloadDecision {
  if (localServerUpdated === currentServerUpdated) return 'noop';
  return newerSide(localTimestampMs, currentServerUpdated) === 'server'
    ? 'download'
    : 'mark-unsynced';
}
