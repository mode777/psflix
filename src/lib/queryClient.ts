import { QueryCache, QueryClient } from '@tanstack/react-query';
import { onQueryError } from '@/lib/pb-query';

/**
 * Shared react-query client. Constructed once at module load and consumed both
 * by the React tree (`QueryClientProvider` in main.tsx) and by non-React
 * subsystems that need to invalidate caches — notably the emulator service,
 * which bumps save-state / memory-card queries when the facade finishes a
 * cloud sync pass.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
