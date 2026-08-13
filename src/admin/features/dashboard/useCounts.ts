import { useQueries } from '@tanstack/react-query';
import { COUNT_COLLECTIONS, fetchCount, type CountCollection } from './api';

export type CountResult = {
  collection: CountCollection;
  count: number | null;
  isLoading: boolean;
  isError: boolean;
};

const LABELS: Record<CountCollection, string> = {
  games: 'Games',
  discs: 'Discs',
  users: 'Users',
};

export const countLabel = (c: CountCollection) => LABELS[c];

/**
 * Runs each count as an **independent** react-query query so they execute in
 * parallel and a single failure does not fail the others (satisfies the spec's
 * "individual count failure" scenario). The caller renders a per-card failure
 * state from each result's `isError`.
 */
export function useCounts(): CountResult[] {
  const queries = useQueries({
    queries: COUNT_COLLECTIONS.map((collection) => ({
      queryKey: ['admin', 'count', collection],
      queryFn: () => fetchCount(collection),
    })),
  });

  return queries.map((q, i) => {
    const collection = COUNT_COLLECTIONS[i];
    return {
      collection,
      count: q.data ?? null,
      isLoading: q.isLoading,
      isError: q.isError,
    };
  });
}
