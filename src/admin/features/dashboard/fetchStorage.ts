import { adminClient } from '@/admin/lib/pb';
import {
  STORAGE_CATEGORIES,
  aggregateStorage,
  boundedMap,
  buildFileUrl,
  probeWithCache,
  type ProbeResult,
  type StorageAggregate,
  type StorageCategoryKey,
} from './storage';

const CONCURRENCY = 16;

type FileRecord = { id: string; collectionId: string; collectionName: string } & Record<
  string,
  unknown
>;

type CategoryFetch = {
  key: StorageCategoryKey;
  results: ProbeResult[];
  forceIncomplete: boolean;
};

/**
 * Compute accumulated storage across all four file categories.
 *
 * For each category: list records holding a file, build each file URL, and
 * HEAD-probe it (read-through the URL-keyed cache) under a shared bounded-
 * concurrency pool. Category listing and individual probe failures mark the
 * affected category (and therefore the grand total) "incomplete" without
 * failing the whole metric (see design.md, Decision 4).
 */
export async function fetchStorage(): Promise<StorageAggregate> {
  const token = adminClient.authStore.token;

  // 1. Gather all probe tasks across categories (category list failures are
  //    tolerated and flag the category incomplete).
  const tasks: Array<{ key: StorageCategoryKey; url: string }> = [];
  const perCategory: CategoryFetch[] = STORAGE_CATEGORIES.map((c) => ({
    key: c.key,
    results: [],
    forceIncomplete: false,
  }));
  const byKey = new Map(perCategory.map((c) => [c.key, c]));

  for (const cat of STORAGE_CATEGORIES) {
    let records: FileRecord[] = [];
    try {
      records = await adminClient.collection(cat.collection).getFullList<FileRecord>();
    } catch {
      byKey.get(cat.key)!.forceIncomplete = true;
      continue;
    }
    for (const r of records) {
      const filename = r[cat.fileField];
      if (typeof filename !== 'string' || filename.length === 0) continue;
      tasks.push({ key: cat.key, url: buildFileUrl(r as FileRecord, filename) });
    }
  }

  // 2. Probe every URL under one bounded-concurrency pool, tagged by category.
  const outcomes = await boundedMap(
    tasks,
    CONCURRENCY,
    async (t): Promise<{ key: StorageCategoryKey; bytes: number | null }> => {
      try {
        const bytes = await probeWithCache(t.url, token);
        return { key: t.key, bytes };
      } catch {
        return { key: t.key, bytes: null };
      }
    },
  );

  // 3. Group outcomes back into their categories and aggregate.
  for (const o of outcomes) {
    byKey.get(o.key)!.results.push({ bytes: o.bytes });
  }

  return aggregateStorage(
    perCategory.map((c) => ({
      key: c.key,
      results: c.results,
      forceIncomplete: c.forceIncomplete,
    })),
  );
}
