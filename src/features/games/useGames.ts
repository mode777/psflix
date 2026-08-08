import { useInfiniteQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import { buildGameFilter, type GameFilters } from './filter';
import type { GamesResponse, DiscsResponse } from '@/types/pocketbase';

const PER_PAGE = 24;

export type GameListItem = GamesResponse<unknown, unknown, { discs: DiscsResponse[] }>;

export function useGames(filters: GameFilters) {
  return useInfiniteQuery({
    queryKey: ['games', filters],
    queryFn: ({ pageParam = 1 }) =>
      pb.collection('games').getList<GameListItem>(pageParam, PER_PAGE, {
        filter: buildGameFilter(filters),
        expand: 'discs',
        sort: 'title',
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
