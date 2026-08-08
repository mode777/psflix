import { useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import type { FavoriteRecord } from './types';

export const FAVORITES_KEY = (userId: string) => ['favorites', userId] as const;

export function useFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: FAVORITES_KEY(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const list = await pb.collection('favorites').getFullList<FavoriteRecord>({
        filter: `user = "${userId}"`,
        expand: 'game',
        sort: '-created',
      });
      return list.filter((f) => f.expand?.game);
    },
  });
}
