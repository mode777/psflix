import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import { FAVORITES_KEY } from './useFavorites';
import type { FavoriteRecord } from './types';

type ToggleArgs =
  | { action: 'add'; gameId: string; userId: string }
  | { action: 'remove'; id: string; userId: string };

export function useToggleFavorite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ToggleArgs) => {
      if (args.action === 'add') {
        return pb.collection('favorites').create<FavoriteRecord>({
          user: args.userId,
          game: args.gameId,
        });
      }
      await pb.collection('favorites').delete(args.id);
      return null;
    },
    onMutate: async (args) => {
      const key = FAVORITES_KEY(args.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FavoriteRecord[]>(key);
      if (args.action === 'add') {
        const optimistic: FavoriteRecord = {
          id: `optimistic-${args.gameId}`,
          user: args.userId,
          game: args.gameId,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
        qc.setQueryData<FavoriteRecord[]>(key, (old = []) => [...old, optimistic]);
      } else {
        qc.setQueryData<FavoriteRecord[]>(key, (old = []) => old.filter((f) => f.id !== args.id));
      }
      return { previous, key };
    },
    onError: (_err, _args, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, args) => {
      void qc.invalidateQueries({ queryKey: FAVORITES_KEY(args.userId) });
    },
  });
}
