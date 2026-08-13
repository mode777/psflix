import { adminClient } from '@/admin/lib/pb';
import type { DocumentsTypeOptions } from '@/types/pocketbase';

export type ReplaceResult = { deleted: number; failed: string[] };

const PER_PAGE = 200;

/**
 * Snapshot every `documents` id matching `(gameId, type)`, paginated (design.md,
 * Decision 8). The upload loop calls this once at batch start so it can delete
 * exactly the records that pre-existed the upload — never a sibling item's
 * freshly-created record.
 */
export async function fetchSameTypeDocumentIds(
  gameId: string,
  type: DocumentsTypeOptions,
): Promise<string[]> {
  const filter = adminClient.filter('game = {:g} && type = {:t}', { g: gameId, t: type });
  const ids: string[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await adminClient.collection('documents').getList(page, PER_PAGE, {
      filter,
      fields: 'id',
    });
    for (const record of result.items) ids.push(record.id);
    if (page >= result.totalPages) break;
    page += 1;
  }
  return ids;
}

/**
 * Delete the given `documents` ids under the admin superuser session. A per-id
 * failure is collected into `failed` and does NOT abort the pass — the caller
 * logs a non-fatal warning and leaves the item `done`.
 */
export async function deleteDocumentsByIds(ids: string[]): Promise<ReplaceResult> {
  let deleted = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await adminClient.collection('documents').delete(id);
      deleted += 1;
    } catch {
      failed.push(id);
    }
  }
  return { deleted, failed };
}

/**
 * Replace path (design.md, Decision 8): delete every existing `documents`
 * record matching `(gameId, type)`. Convenience wrapper around fetch + delete;
 * `excludeIds` spares listed records (e.g. a just-created one when fetching at
 * delete-time instead of via a batch-start snapshot). The upload loop snapshots
 * ids at batch start and calls `deleteDocumentsByIds` directly after each
 * successful create, so sibling same-(game,type) items don't delete each other's
 * new records.
 */
export async function replaceExistingDocuments(params: {
  gameId: string;
  type: DocumentsTypeOptions;
  excludeIds?: string[];
}): Promise<ReplaceResult> {
  const exclude = new Set(params.excludeIds ?? []);
  const ids = (await fetchSameTypeDocumentIds(params.gameId, params.type)).filter(
    (id) => !exclude.has(id),
  );
  return deleteDocumentsByIds(ids);
}
