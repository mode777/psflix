# Stage 4 — Browse view

Replace the BrowseView stub with the real grid, search, filters, and infinite scroll. After this stage, browsing live data from `pb.example.com` works end-to-end.

## Goal

Match `psflix_design/browse_view/code.html` against real data. Filter chips, search, responsive grid, infinite scroll, skeletons, empty state.

## Decisions (locked)

- **TanStack Query** for server state.
- `useInfiniteQuery` for paginated grid.
- Filter sent to PB as a DSL expression (built in `src/features/games/filter.ts`).
- `expand: 'discs'` on every `games` request.
- `sort: '-created'` (newest first); v1 has no user-controlled sort.
- Debounce search input with `useDeferredValue` (250 ms-ish).
- IntersectionObserver sentinel for infinite scroll.

## Files to create / edit

### `package.json` — add deps

```bash
npm install @tanstack/react-query
```

### `src/main.tsx` — wrap in QueryClientProvider

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

<QueryClientProvider client={queryClient}>
  <HashRouter>
    <App />
  </HashRouter>
</QueryClientProvider>;
```

### `src/features/games/filter.ts`

```ts
export type GameFilters = {
  search?: string;
  genre?: string;
};

export function buildGameFilter({ search, genre }: GameFilters): string | undefined {
  const clauses: string[] = [];
  if (search && search.trim().length > 0) {
    const escaped = search.trim().replace(/"/g, '\\"');
    clauses.push(`(title ~ "${escaped}" || first_disc_serial ~ "${escaped}")`);
  }
  if (genre && genre !== 'All') {
    const escaped = genre.replace(/"/g, '\\"');
    clauses.push(`genre ~ "${escaped}"`);
  }
  return clauses.length === 0 ? undefined : clauses.join(' && ');
}
```

PB filter DSL per `pocketbase-docs/04-api-rules-and-filters.md`. `~` is "contains" (case-insensitive).

### `src/features/games/useGames.ts`

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import { buildGameFilter, type GameFilters } from './filter';

const PER_PAGE = 24;

export function useGames(filters: GameFilters) {
  return useInfiniteQuery({
    queryKey: ['games', filters],
    queryFn: ({ pageParam = 1 }) =>
      pb.collection('games').getList(pageParam, PER_PAGE, {
        filter: buildGameFilter(filters),
        expand: 'discs',
        sort: '-created',
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
```

### `src/features/games/genres.ts`

A small static list of genres for the chip row (at minimum: `All`, `Action RPG`, `Survival Horror`, `Platformer`, `Racing`, `Fighting`, `Shooter`, `Sports`). Hard-code for v1 — pulling genres dynamically requires a derived list from PB.

### `src/components/media/GameCard.tsx`

- Props: `game` (typed from generated types + parsed `languages`/`features`).
- `aspect-square` tile.
- Cover image via `<img src={fileUrl(game, game.cover_image)} />` (or fallback if missing).
- `vignette-overlay` flex column at the bottom; opacity 0 by default, opacity 100 on hover.
- Genre chip + title in the overlay.
- Hover scale via `card-hover-effect` class.
- Click or Enter → `<Link to={`/game/${encodeURIComponent(game.first_disc_serial)}`}>`.
- Keyboard focusable; `aria-label` = `game.title`.

### `src/components/media/GameCardSkeleton.tsx`

`aspect-square rounded-xl bg-surface-container animate-pulse`.

### `src/components/media/GenreChips.tsx`

- Scrollable horizontal chip row in a glass panel.
- Pill button per genre; "All" highlights primary.
- `aria-label="Filter by genre"` on the container.

### `src/components/media/SearchBar.tsx`

- Debounced by `useDeferredValue` (250 ms).
- `<input>` styled per the mock (40% opacity high container, primary border on focus).
- `material-symbols-outlined search` icon inside the left edge.

### `src/components/media/AmbientBackground.tsx`

- Renders a `<div className="bg-ambient">` with the cover image of the first featured game.
- When the cover is missing, render a flat obsidian gradient (no broken image).

### `src/routes/BrowseView.tsx` (replace stub)

Composes everything:

```tsx
import { useDeferredValue, useState } from 'react';
import { useGames } from '@/features/games/useGames';
import { GENRES } from '@/features/games/genres';
import { GameCard } from '@/components/media/GameCard';
import { GameCardSkeleton } from '@/components/media/GameCardSkeleton';
import { GenreChips } from '@/components/media/GenreChips';
import { SearchBar } from '@/components/media/SearchBar';
import { AmbientBackground } from '@/components/media/AmbientBackground';

export default function BrowseView() {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, isError } = useGames({
    search: deferredSearch,
    genre,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const featured = items[0];

  return (
    <>
      {featured?.cover_image && <AmbientBackground cover={items[0]} />}

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
          <p className="text-error">Failed to load games.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => <GameCardSkeleton key={i} />)
              : items.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        )}

        {items.length === 0 && !isLoading && (
          <p className="text-center text-on-surface-variant py-24">No games match those filters.</p>
        )}

        {hasNextPage && (
          <div className="flex justify-center mt-12">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
```

The mock used `IntersectionObserver` for sentinel-based loading; the explicit "Load more" button is a v1-shipped simplification. Switch to sentinel in Stage 7 if time allows.

## Files to verify

- `src/features/games/{useGames,filter,genres}.ts` exist.
- `src/components/media/{GameCard,GameCardSkeleton,GenreChips,SearchBar,AmbientBackground}.tsx` exist.
- `src/routes/BrowseView.tsx` is the full view, not a stub.
- `src/main.tsx` wraps the tree in `QueryClientProvider`.

## Acceptance criteria

- [ ] `npm run dev` → browse page renders 24 real games from the live PB.
- [ ] Search input narrows results after the debounce.
- [ ] Genre chip click filters by genre.
- [ ] "Load more" loads page 2 (and beyond).
- [ ] Hovering a card reveals the title overlay.
- [ ] Clicking a card navigates to the details page (which is still a stub at this point — that's fine).
- [ ] Empty filter result shows the "No games match" message.
- [ ] Each tile has a working `fileUrl` cover image (no broken `lh3.googleusercontent.com` URLs from the mocks).
- [ ] `npm run typecheck && npm run lint` pass.

## Manual verification

1. `npm run dev` → `/`.
2. Confirm 24 tiles render with cover images.
3. Type "spyro" in search → results narrow.
4. Click "Survival Horror" chip → filter applies.
5. Click "Load more" → page 2 loads.
6. Click any tile → navigates to `/#/game/<serial>` (still a stub).
7. Resize to mobile width (`< 768px`) → grid collapses to 2 columns, margins shrink to 20px.

## Out of scope

- Details content (Stage 5).
- Auth-aware UI (Stage 6).
- Skeleton animations beyond `animate-pulse` (Stage 7 may polish).
- IntersectionObserver sentinel (Stage 7).
