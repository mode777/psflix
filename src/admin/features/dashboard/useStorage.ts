import { useQuery } from '@tanstack/react-query';
import { fetchStorage } from './fetchStorage';

/**
 * Accumulated-storage query. Runs only when the dashboard is gated open (the
 * caller enables it once the superuser session is validated). Failure-tolerant:
 * `fetchStorage` always resolves a partial result and flags `incomplete`.
 */
export function useStorage(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'storage'],
    enabled,
    queryFn: fetchStorage,
  });
}
