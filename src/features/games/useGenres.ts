import { useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import { aggregateGenres } from './genres';

const STALE_TIME_MS = 1000 * 60 * 60;

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const rows = await pb.collection('games').getFullList<{ genre?: string }>({
        fields: 'genre',
      });
      return aggregateGenres(rows);
    },
    staleTime: STALE_TIME_MS,
    gcTime: STALE_TIME_MS,
  });
}
