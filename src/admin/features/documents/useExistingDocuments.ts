import { useCallback, useEffect, useState } from 'react';
import { adminClient } from '@/admin/lib/pb';
import type { DocumentsTypeOptions } from '@/types/pocketbase';

export type UseExistingDocumentsResult = {
  hasType: (gameId: string | null | undefined, type: DocumentsTypeOptions) => boolean;
  refetch: () => Promise<void>;
};

const EMPTY_MAP = new Map<string, Set<DocumentsTypeOptions>>();

/**
 * Loads every `documents` record once on mount requesting only the fields the
 * duplicate indicator needs (`game`, `type`) and builds a `Map<gameId,
 * Set<type>>` (design.md, Decision 6). `hasType` powers the non-blocking
 * "already has a {type} — will append" indicator; it never disables upload.
 * `refetch` refreshes the map after a batch so freshly-uploaded documents are
 * reflected. The collection is expected to stay small (manuals/guides are
 * sparse), so the one-time load is cheap; switching to on-demand counts would
 * be a localized change to this hook.
 */
export function useExistingDocuments(): UseExistingDocumentsResult {
  const [map, setMap] = useState<Map<string, Set<DocumentsTypeOptions>>>(EMPTY_MAP);

  const load = useCallback(async () => {
    const next = new Map<string, Set<DocumentsTypeOptions>>();
    try {
      // Page through every record; only `game` and `type` are requested.
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await adminClient.collection('documents').getList(page, 500, {
          fields: 'game,type',
        });
        for (const record of result.items) {
          const gameId = record.game as string | undefined;
          const type = record.type as DocumentsTypeOptions | undefined;
          if (!gameId || !type) continue;
          let bucket = next.get(gameId);
          if (!bucket) {
            bucket = new Set();
            next.set(gameId, bucket);
          }
          bucket.add(type);
        }
        if (page >= result.totalPages) break;
        page += 1;
      }
    } catch {
      // tolerate — the indicator is advisory; an empty map simply hides it.
    }
    setMap(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasType = useCallback(
    (gameId: string | null | undefined, type: DocumentsTypeOptions): boolean => {
      if (!gameId) return false;
      return map.get(gameId)?.has(type) ?? false;
    },
    [map],
  );

  return { hasType, refetch: load };
}
