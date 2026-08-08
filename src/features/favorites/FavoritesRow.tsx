import { Link } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import { useFavorites } from './useFavorites';
import type { FavoriteGame } from './types';

export function FavoritesRow() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: favorites, isLoading } = useFavorites(user?.id);

  if (!isAuthenticated || isLoading || !favorites || favorites.length === 0) return null;

  return (
    <section aria-labelledby="favorites-heading" className="mb-12">
      <h2 id="favorites-heading" className="text-headline-lg text-on-surface font-semibold mb-4">
        Favorites
      </h2>
      <ul
        className={cn(
          'flex gap-4 md:gap-6 overflow-x-auto pb-4 -mx-1 px-1',
          'snap-x snap-mandatory',
        )}
      >
        {favorites.map((fav) => {
          const game = fav.expand?.game as FavoriteGame | undefined;
          if (!game) return null;
          const cover = game.cover_image ? fileUrl(game, game.cover_image) : null;
          const href = `/game/${encodeURIComponent(game.first_disc_serial)}`;
          return (
            <li key={fav.id} className="shrink-0 snap-start">
              <Link
                to={href}
                aria-label={game.title}
                className={cn(
                  'group relative block w-40 md:w-48 aspect-square rounded-xl overflow-hidden',
                  'card-hover-effect border border-white/10 bg-surface-container',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-favorite',
                )}
              >
                {cover ? (
                  <img
                    alt={`Cover art for ${game.title}`}
                    src={cover}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface-container-high text-on-surface-variant text-label-caps p-2 text-center">
                    {game.title}
                  </div>
                )}
                <div className="absolute inset-0 vignette-overlay flex flex-col justify-end p-3">
                  <h3 className="font-body-lg text-body-lg text-white font-semibold leading-tight drop-shadow-md">
                    {game.title}
                  </h3>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
