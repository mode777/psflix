import { cn } from '@/lib/cn';
import { useFavorite } from './useFavorite';

type FavoriteButtonProps = {
  gameId: string | undefined;
  className?: string;
  iconClassName?: string;
  hoverReveal?: boolean;
};

export function FavoriteButton({
  gameId,
  className,
  iconClassName,
  hoverReveal,
}: FavoriteButtonProps) {
  const { isAuthenticated, isFavorite, isPending, toggle } = useFavorite(gameId);

  if (!isAuthenticated) return null;

  const hiddenUntilHover = hoverReveal && !isFavorite;

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorite}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={cn(
        'inline-flex items-center justify-center text-favorite',
        'transition-all duration-300 hover:scale-110 active:scale-95',
        'disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100',
        hiddenUntilHover
          ? 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          : 'opacity-100',
        className,
      )}
    >
      <span
        className={cn('material-symbols-outlined', iconClassName)}
        style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
        aria-hidden="true"
      >
        favorite
      </span>
    </button>
  );
}
