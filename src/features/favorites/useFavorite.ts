import { useAuthStore } from '@/features/auth/store';
import { useFavorites } from './useFavorites';
import { useToggleFavorite } from './useToggleFavorite';

export function useFavorite(gameId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useFavorites(user?.id);
  const toggle = useToggleFavorite();

  const record = gameId ? data?.find((f) => f.game === gameId) : undefined;
  const isFavorite = !!record;

  const handleToggle = () => {
    if (!user || !gameId) return;
    if (record) {
      toggle.mutate({ action: 'remove', id: record.id, userId: user.id });
    } else {
      toggle.mutate({ action: 'add', gameId, userId: user.id });
    }
  };

  return {
    isAuthenticated,
    isFavorite,
    isPending: toggle.isPending,
    toggle: handleToggle,
  };
}
