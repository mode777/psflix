import { adminClient } from '@/admin/lib/pb';

/**
 * Returns the total record count for a collection by requesting a single-item
 * page and reading `totalItems`. The admin superuser token bypasses owner-scoped
 * list rules (on `users` etc.), so `totalItems` reflects the entire dataset
 * (see design.md, Decision 3).
 */
export async function fetchCount(collection: string): Promise<number> {
  const result = await adminClient.collection(collection).getList(1, 1);
  return result.totalItems;
}

export const COUNT_COLLECTIONS = ['games', 'discs', 'users'] as const;
export type CountCollection = (typeof COUNT_COLLECTIONS)[number];
