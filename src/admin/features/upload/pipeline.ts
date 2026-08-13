import type { GameMetadata } from './metadata';

/**
 * Pipeline state model (design.md, Decision 5). Each ingested CHD is a
 * `DiscItem` carrying its own status; the review list and progress view render
 * directly from state. Games group their discs by `first_disc_serial`.
 */
export type ItemStatus =
  | 'pending'
  | 'identifying'
  | 'identified'
  | 'ready'
  | 'exists'
  | 'failed'
  | 'uploading'
  | 'uploaded'
  | 'error';

export type DiscItem = {
  /** Stable client-side id (per ingested file). */
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  status: ItemStatus;
  /** Extracted PS1 disc serial. */
  discId: string | null;
  /** Disc position (0-based) from the metadata disc list. */
  index: number;
  metadata: GameMetadata | null;
  /** Catalog id of an existing game this disc belongs to (null if none). */
  existingGameId: string | null;
  /** Whether this disc serial already exists in the catalog. */
  existingDisc: boolean;
  error: string | null;
  progress: { loaded: number; total: number } | null;
};

export type GameGroupStatus = 'pending' | 'ready' | 'created' | 'reused' | 'error';

export type GameGroup = {
  firstDiscSerial: string;
  metadata: GameMetadata;
  coverImage: string | null;
  status: GameGroupStatus;
  /** Catalog id discovered during the existence check (reused game). */
  existingGameId: string | null;
  /** Catalog id created during upload (lazily, before first disc). */
  createdGameId: string | null;
  discItems: DiscItem[];
};

export type FailedItem = {
  id: string;
  fileName: string;
  fileSize: number;
  reason: string;
};

export type PipelineStage = 'idle' | 'intake' | 'review' | 'uploading' | 'done';

export type UploadSummary = {
  gamesCreated: number;
  gamesReused: number;
  discsUploaded: number;
  discsSkipped: number;
  failed: number;
};

/**
 * The disc's position in the title's metadata disc list — independent of ingest
 * order (a second disc ingested first still gets index 1). Falls back to 0 when
 * the serial is not found (defensive; the extractor only returns known serials).
 */
export function discIndexInMetadata(discId: string, metadata: GameMetadata): number {
  const i = metadata.discs.findIndex((d) => d.printed_serial === discId);
  return i === -1 ? 0 : i;
}

/** `true` for statuses that represent a usable, enriched disc. */
export function isUsableDisc(status: ItemStatus): boolean {
  return status === 'ready' || status === 'exists';
}

/**
 * Build the review-state grouping from enriched items: usable discs are grouped
 * by `first_disc_serial` (multi-disc → one game, sorted by index), and failed
 * items are collected separately. Transient intake statuses are ignored.
 */
export function buildReview(items: DiscItem[]): {
  games: GameGroup[];
  failed: FailedItem[];
} {
  const failed: FailedItem[] = [];
  const bySerial = new Map<string, DiscItem[]>();

  for (const item of items) {
    if (item.status === 'failed' || item.status === 'error') {
      failed.push({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        reason: item.error ?? 'unknown error',
      });
      continue;
    }
    if (!isUsableDisc(item.status) || !item.metadata || !item.discId) continue;

    const key = item.metadata.firstDiscSerial;
    const arr = bySerial.get(key) ?? [];
    arr.push(item);
    bySerial.set(key, arr);
  }

  const games: GameGroup[] = [];
  for (const [serial, discItems] of bySerial) {
    const metadata = discItems[0]!.metadata!;
    const sorted = [...discItems].sort((a, b) => a.index - b.index);
    const existingGameId = sorted.map((d) => d.existingGameId).find((id) => !!id) ?? null;
    games.push({
      firstDiscSerial: serial,
      metadata,
      coverImage: metadata.coverImage,
      status: 'ready',
      existingGameId,
      createdGameId: null,
      discItems: sorted,
    });
  }

  return { games, failed };
}
