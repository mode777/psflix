import { useEffect, useState } from 'react';
import { adminClient } from '@/admin/lib/pb';
import type { GamesResponse } from '@/types/pocketbase';

export type GameSearchResult = Pick<GamesResponse, 'id' | 'title' | 'region' | 'first_disc_serial'>;

export type UseGameSearchResult = {
  results: GameSearchResult[];
  isLoading: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 1;
const PAGE_SIZE = 20;

/**
 * Debounced (250 ms) server-side game search for the document-upload combobox
 * (design.md, Decision 3). Matches by title or `first_disc_serial` using the
 * SDK's `~` (case-insensitive LIKE) operator, capped at 20 rows so the workflow
 * scales regardless of catalog size. An empty/short query yields no results
 * rather than loading arbitrary rows. All reads use the admin superuser session
 * via `adminClient`.
 */
export function useGameSearch(query: string): UseGameSearchResult {
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const filter = adminClient.filter('title ~ {:q} || first_disc_serial ~ {:q}', {
          q: trimmed,
        });
        const page = await adminClient.collection('games').getList(1, PAGE_SIZE, {
          filter,
          sort: 'title',
        });
        if (cancelled) return;
        const mapped = page.items.map((r) => ({
          id: r.id,
          title: r.title,
          region: r.region,
          first_disc_serial: r.first_disc_serial,
        }));
        setResults(mapped);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading, error };
}
