import { QueryClient } from '@tanstack/react-query';

/**
 * Admin's own react-query client. Deliberately a **separate** instance/cache
 * from the user app's `src/lib/queryClient.ts` — the two apps ship as distinct
 * bundles with their own provider trees (see design.md, Decision 6).
 */
export const adminQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
