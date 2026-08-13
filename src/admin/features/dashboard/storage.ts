import { adminClient } from '@/admin/lib/pb';

/**
 * Accumulated-storage metric (see design.md, Decision 4).
 *
 * Each category lists the records holding a file, builds the file URL via the
 * admin client helper, HEAD-probes it for `Content-Length` (owner-only files
 * carry the superuser `Authorization` header), and sums the byte sizes. A
 * URL-keyed `localStorage` cache makes repeat loads cheap and self-invalidates
 * because PocketBase suffixes stored filenames with a random part. Probes run
 * with a bounded concurrency cap and tolerate partial failure.
 */

export type StorageCategoryKey = 'discs' | 'documents' | 'save_state' | 'memory_cards';

type CategoryConfig = {
  key: StorageCategoryKey;
  label: string;
  collection: string;
  fileField: string;
};

export const STORAGE_CATEGORIES: readonly CategoryConfig[] = [
  { key: 'discs', label: 'Disc images', collection: 'discs', fileField: 'iso' },
  { key: 'documents', label: 'Documents', collection: 'documents', fileField: 'file' },
  { key: 'save_state', label: 'Save states', collection: 'save_state', fileField: 'data' },
  { key: 'memory_cards', label: 'Memory cards', collection: 'memory_cards', fileField: 'data' },
] as const;

export const categoryLabel = (key: StorageCategoryKey): string =>
  STORAGE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

// --- file URL builder (6.2) -------------------------------------------------

type FileRecord = { id: string; collectionId: string; collectionName: string } & Record<
  string,
  unknown
>;

/** Build a record file URL via the admin client helper (never string concat). */
export function buildFileUrl(record: FileRecord, filename: string): string {
  return adminClient.files.getURL(record, filename);
}

// --- size cache (6.5) -------------------------------------------------------

const CACHE_PREFIX = 'psflix:admin:storage-size:';

export function cacheGetSize(url: string, storage: Storage = localStorage): number | null {
  const raw = storage.getItem(CACHE_PREFIX + url);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function cacheSetSize(url: string, bytes: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(CACHE_PREFIX + url, String(bytes));
  } catch {
    // Quota / private-mode: caching is best-effort.
  }
}

// --- HEAD probe (6.1, 6.3) --------------------------------------------------

/**
 * Resolve a file's byte size. Sends a HEAD with the superuser `Authorization`
 * header (owner-only `save_state` / `memory_cards` files require it). Falls
 * back to a single-byte ranged GET (reading `Content-Range`) if the server does
 * not expose `Content-Length` on HEAD — see design.md Risk 1.
 */
export async function probeFileSize(url: string, token: string): Promise<number> {
  const head = await fetch(url, { method: 'HEAD', headers: { Authorization: token } });
  const len = head.headers.get('content-length');
  if (head.ok && len) return parseInt(len, 10);

  // Fallback: ranged GET.
  const range = await fetch(url, {
    headers: { Authorization: token, Range: 'bytes=0-0' },
  });
  const contentRange = range.headers.get('content-range');
  const match = contentRange?.match(/\/(\d+)/);
  if ((range.ok || range.status === 206) && match) return parseInt(match[1], 10);
  throw new Error(`could not determine size for ${url} (status ${head.status}/${range.status})`);
}

/** Read-through cache: return cached size on hit, otherwise probe and store. */
export async function probeWithCache(
  url: string,
  token: string,
  probe: (url: string, token: string) => Promise<number> = probeFileSize,
): Promise<number> {
  const cached = cacheGetSize(url);
  if (cached != null) return cached;
  const bytes = await probe(url, token);
  cacheSetSize(url, bytes);
  return bytes;
}

// --- bounded concurrency (6.4) ---------------------------------------------

export async function boundedMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- aggregation (6.6, 6.7) — pure, unit-tested -----------------------------

export type ProbeResult = { bytes: number | null };

export type CategoryAggregate = {
  key: StorageCategoryKey;
  label: string;
  totalBytes: number;
  fileCount: number;
  failedCount: number;
  incomplete: boolean;
};

export type StorageAggregate = {
  categories: CategoryAggregate[];
  grandTotal: number;
  incomplete: boolean;
};

export function aggregateCategory(
  key: StorageCategoryKey,
  results: readonly ProbeResult[],
  forceIncomplete = false,
): CategoryAggregate {
  let totalBytes = 0;
  let failedCount = 0;
  for (const r of results) {
    if (r.bytes == null) failedCount++;
    else totalBytes += r.bytes;
  }
  return {
    key,
    label: categoryLabel(key),
    totalBytes,
    fileCount: results.length,
    failedCount,
    incomplete: forceIncomplete || failedCount > 0,
  };
}

export function aggregateStorage(
  perCategory: ReadonlyArray<{
    key: StorageCategoryKey;
    results: readonly ProbeResult[];
    forceIncomplete?: boolean;
  }>,
): StorageAggregate {
  const categories = perCategory.map((c) => aggregateCategory(c.key, c.results, c.forceIncomplete));
  const grandTotal = categories.reduce((sum, c) => sum + c.totalBytes, 0);
  return {
    categories,
    grandTotal,
    incomplete: categories.some((c) => c.incomplete),
  };
}
