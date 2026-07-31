import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useGames } from '@/features/games/useGames';
import { GENRES } from '@/features/games/genres';
import { GameCard, type GameCardGame } from '@/components/media/GameCard';
import { GameCardSkeleton } from '@/components/media/GameCardSkeleton';
import { GenreChips } from '@/components/media/GenreChips';
import { SearchBar } from '@/components/media/SearchBar';
import { AmbientBackground } from '@/components/media/AmbientBackground';
import { useArrowKeyNav } from '@/hooks/useArrowKeyNav';
import { cn } from '@/lib/cn';

const SKELETON_COUNT = 10;
const EMPTY_MIN_DURATION_MS = 300;

function getColumnsForWidth(width: number): number {
  if (width >= 1280) return 5;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

export default function BrowseView() {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');
  const deferredSearch = useDeferredValue(search);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [columns, setColumns] = useState(() =>
    typeof window === 'undefined' ? 2 : getColumnsForWidth(window.innerWidth),
  );
  const [showEmpty, setShowEmpty] = useState(false);

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, isError, refetch } =
    useGames({
      search: deferredSearch,
      genre,
    });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const featured = items[0] ?? null;
  const itemCount = items.length;

  useEffect(() => {
    const update = () => setColumns(getColumnsForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (isLoading || itemCount > 0) {
      setShowEmpty(false);
      return;
    }
    const t = setTimeout(() => setShowEmpty(true), EMPTY_MIN_DURATION_MS);
    return () => clearTimeout(t);
  }, [isLoading, itemCount]);

  useEffect(() => {
    cardRefs.current.length = itemCount;
  }, [itemCount]);

  const onActivate = (index: number) => {
    cardRefs.current[index]?.click();
  };

  const { onKeyDown } = useArrowKeyNav({
    itemCount,
    columns,
    onActivate,
    isDisabled: isLoading || isError,
  });

  return (
    <>
      <AmbientBackground cover={featured} />

      <main className="relative pt-32 pb-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        <header className="mb-12">
          <h1 className="text-headline-xl-mobile md:text-headline-xl font-extrabold text-on-surface">
            Browse Games
          </h1>
          <p className="text-body-lg text-on-surface-variant mt-2 max-w-2xl">
            Browse essential titles from the PlayStation library
          </p>
        </header>

        <div className="glass-panel rounded-xl p-4 mb-12 flex flex-col md:flex-row gap-4 items-center justify-between border border-white/5">
          <GenreChips genres={GENRES} value={genre} onChange={setGenre} />
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {isError ? (
          <ErrorPanel onRetry={() => void refetch()} />
        ) : (
          <>
            <h2 className="sr-only">Games</h2>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Games grid"
              aria-busy={isLoading}
              onKeyDown={onKeyDown}
              className={cn(
                'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8',
                'focus:outline-none',
              )}
            >
              {isLoading
                ? Array.from({ length: SKELETON_COUNT }).map((_, i) => <GameCardSkeleton key={i} />)
                : items.map((g, i) => (
                    <GameCard
                      key={g.id}
                      game={g as GameCardGame}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      tabIndex={i === 0 ? 0 : -1}
                    />
                  ))}
            </div>
          </>
        )}

        {showEmpty && (
          <p className="text-center text-on-surface-variant py-24" role="status">
            No games match those filters.
          </p>
        )}

        {hasNextPage && !isError && (
          <div className="flex justify-center mt-12">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        'glass-panel rounded-xl ambient-shadow border border-error/30',
        'p-8 flex flex-col items-center text-center gap-4',
      )}
    >
      <span className="material-symbols-outlined text-5xl text-error" aria-hidden="true">
        cloud_off
      </span>
      <h2 className="text-headline-lg text-white">Couldn't reach the server</h2>
      <p className="text-on-surface-variant text-body-md max-w-md">
        We couldn't load the game library. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-6 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
