import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';

export type GameCardGame = {
  id: string;
  collectionId: string;
  first_disc_serial: string;
  title: string;
  cover_image?: string;
  genre?: string;
};

type GameCardProps = {
  game: GameCardGame;
  tabIndex?: number;
};

export const GameCard = forwardRef<HTMLAnchorElement, GameCardProps>(function GameCard(
  { game, tabIndex },
  ref,
) {
  const cover = game.cover_image ? fileUrl(game, game.cover_image) : null;
  const href = `/game/${encodeURIComponent(game.first_disc_serial)}`;

  return (
    <Link
      to={href}
      ref={ref}
      tabIndex={tabIndex}
      aria-label={game.title}
      className={cn(
        'group relative rounded-xl overflow-hidden card-hover-effect aspect-square',
        'border border-white/10 bg-surface-container block focus:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary',
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
        <div className="w-full h-full flex items-center justify-center bg-surface-container-high text-on-surface-variant text-label-caps">
          {game.title}
        </div>
      )}
      <FavoriteButton
        gameId={game.id}
        hoverReveal
        className="absolute top-2 right-2 z-10 rounded-full bg-black/40 backdrop-blur-md p-1"
        iconClassName="text-base"
      />
      <div
        className={cn(
          'absolute inset-0 vignette-overlay flex flex-col justify-end p-4',
          'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          'transition-opacity duration-300',
        )}
      >
        {game.genre && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'px-2 py-1 bg-white/10 backdrop-blur-md rounded-full',
                'font-label-caps text-label-caps text-on-surface',
              )}
            >
              {game.genre}
            </span>
          </div>
        )}
        <h3
          className={cn(
            'font-body-lg text-body-lg text-white font-semibold leading-tight drop-shadow-md',
          )}
        >
          {game.title}
        </h3>
      </div>
    </Link>
  );
});
