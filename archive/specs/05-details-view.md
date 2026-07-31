# Stage 5 — Details view

Replace the DetailsView stub with the real hero, screenshots carousel, metadata panel, and document links. Match `psflix_design/details_view/code.html` against live data.

## Goal

The details page renders the correct game from PB, including cover, title, genre, features chips, description, screenshots carousel, metadata panel, and links to documents (manual / guide).

## Decisions (locked)

- Single query against PB: `filter: first_disc_serial = ':firstDiscSerial'`, `expand: 'discs,documents'`.
- `firstDiscSerial` is the URL param (set in Stage 3).
- Screenshots carousel uses native CSS scroll-snap (no external carousel lib).
- Lightbox uses native `<dialog>` element.
- Document list comes from `documents` filtered by `game = :id` and `type = 'manual' | 'guide'`.

## Files to create / edit

### `src/features/games/useGame.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';

export function useGame(firstDiscSerial: string | undefined) {
  return useQuery({
    queryKey: ['game', firstDiscSerial],
    enabled: !!firstDiscSerial,
    queryFn: async () => {
      if (!firstDiscSerial) throw new Error('Missing serial');
      const list = await pb.collection('games').getList(1, 1, {
        filter: `first_disc_serial = "${firstDiscSerial.replace(/"/g, '\\"')}"`,
        expand: 'discs,documents',
      });
      const game = list.items[0];
      if (!game) throw new Error('Not found');
      return game;
    },
  });
}
```

Note: PB's filter DSL is equality-safe for plain serials; escape is defensive but rarely needed. We're not exposing user input here.

### `src/components/media/CoverImage.tsx`

A reusable component that takes `record` + `filename` (both optional) and renders a fallback (the `image` Material Symbol) when missing. Used by the hero and the game card.

### `src/components/media/ScreenshotCarousel.tsx`

- Props: `screenshots: string[]`, `record: { collectionId: string; id: string }`.
- Horizontal scroll container with `snap-x snap-mandatory` and `hide-scrollbar` utility.
- Each slide: `w-1/3 aspect-video`, `rounded-xl`, `card-hover-effect`, `<img>` via `fileUrl`.
- Chevron buttons (`chevron_left` / `chevron_right`) appear on hover; scroll the container by one slide width.
- Click a slide → opens `<Lightbox>` at that index.

### `src/components/media/Lightbox.tsx`

- Native `<dialog>` element.
- Shows the full-res image centered.
- `Escape` closes.
- Click backdrop closes.
- Prev/next buttons if multiple images.

### `src/components/media/MetadataPanel.tsx`

Glass panel (`rounded-xl glass-panel p-8 ambient-shadow`) listing:

- Developer
- Publisher
- First Release
- Players
- Discs
- Region

Each row: `label-caps` uppercase label + `body-md` value.

### `src/components/media/DocumentTile.tsx`

Props: `document` (typed from generated types) + `kind: 'manual' | 'guide'`.

- Glass tile, centered icon + label.
- `auto_stories` icon for `manual`, `map` icon for `guide`.
- Icon color: primary for manual, secondary-container for guide.
- `<a href={fileUrl(doc, doc.file)} target="_blank" rel="noopener noreferrer">` — opens the PDF in a new tab.

### `src/components/media/FeaturesChips.tsx`

Pure presentational: takes `features: string[]`, renders each as a pill (`bg-white/10 px-4 py-1.5 rounded-full font-label-caps text-label-caps text-white`).

### `src/routes/DetailsView.tsx` (replace stub)

```tsx
import { Link, useParams } from 'react-router-dom';
import { useGame } from '@/features/games/useGame';
import { parseGameFeatures } from '@/types/games';
import { fileUrl } from '@/lib/pb-files';
import { CoverImage } from '@/components/media/CoverImage';
import { ScreenshotCarousel } from '@/components/media/ScreenshotCarousel';
import { MetadataPanel } from '@/components/media/MetadataPanel';
import { DocumentTile } from '@/components/media/DocumentTile';
import { FeaturesChips } from '@/components/media/FeaturesChips';

export default function DetailsView() {
  const { firstDiscSerial } = useParams<{ firstDiscSerial: string }>();
  const { data: game, isLoading, isError, error } = useGame(firstDiscSerial);

  if (isLoading) return <DetailsSkeleton />;
  if (isError || !game) return <DetailsNotFound />;

  const features = parseGameFeatures(game.features);
  const documents = (game.expand?.documents ?? []) as Document[];
  const manual = documents.find((d) => d.type === 'manual');
  const guide = documents.find((d) => d.type === 'guide');

  return (
    <>
      {game.cover_image && (
        <div
          className="page-background"
          style={{
            backgroundImage: `url(${fileUrl(game, game.cover_image)})`,
          }}
        />
      )}

      <main className="relative">
        <section className="pt-16 pb-8 px-margin-mobile md:px-margin-desktop mt-16">
          <div className="max-w-container-max mx-auto flex flex-col md:flex-row gap-8 items-start">
            <div className="w-64 h-64 shrink-0 rounded-lg shadow-2xl border border-white/10 overflow-hidden bg-surface-container-highest">
              <CoverImage record={game} filename={game.cover_image} />
            </div>
            <div className="flex flex-col gap-3 flex-grow">
              <h1 className="font-display-lg text-6xl text-white drop-shadow-2xl font-black">
                {game.title}
              </h1>
              <h2 className="text-secondary-container font-headline-lg text-2xl font-semibold">
                {game.genre}
              </h2>
              {features.length > 0 && <FeaturesChips features={features} />}
              <p className="text-on-surface-variant font-body-md font-bold mt-2">
                {game.developer} &middot; {game.publisher} &middot; {game.release?.slice(0, 4)}
              </p>
              <div className="flex flex-wrap gap-4 mt-4">
                <button className="bg-primary hover:bg-primary/90 text-on-primary font-body-md px-8 py-3 rounded flex items-center gap-2 font-semibold">
                  <span className="material-symbols-outlined">play_arrow</span>
                  Play
                </button>
                <button className="btn-ghost text-white font-body-md px-8 py-3 rounded flex items-center gap-2 font-semibold">
                  <span className="material-symbols-outlined">resume</span>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="px-margin-mobile md:px-margin-desktop py-8 max-w-container-max mx-auto space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
            <div className="lg:col-span-8 flex flex-col gap-12">
              <div className="space-y-4 font-body-lg text-body-lg text-on-surface-variant">
                <p>{game.description}</p>
              </div>
              {game.screenshots && game.screenshots.length > 0 && (
                <div className="space-y-6">
                  <h2 className="font-headline-lg text-3xl text-white">Screenshots</h2>
                  <ScreenshotCarousel
                    screenshots={game.screenshots}
                    record={{ collectionId: game.collectionId, id: game.id }}
                  />
                </div>
              )}
            </div>
            <div className="lg:col-span-4 flex flex-col gap-6">
              <MetadataPanel game={game} />
              <div className="grid grid-cols-2 gap-4">
                {manual && <DocumentTile document={manual} kind="manual" />}
                {guide && <DocumentTile document={guide} kind="guide" />}
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function DetailsSkeleton() {
  /* simple shimmering placeholders */
}
function DetailsNotFound() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop text-center">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">
        Game not found
      </h1>
      <Link to="/" className="inline-block mt-6 px-6 py-2 rounded-lg bg-primary text-on-primary">
        Back to browse
      </Link>
    </main>
  );
}
```

Add `.page-background` and `.btn-ghost` to `src/styles/index.css` (carry over from the design mock — not present in Stage 1's styles).

## Files to verify

- `src/features/games/useGame.ts` exists.
- `src/components/media/{CoverImage,ScreenshotCarousel,Lightbox,MetadataPanel,DocumentTile,FeaturesChips}.tsx` exist.
- `src/routes/DetailsView.tsx` is the full view.
- `src/styles/index.css` updated with `.page-background` and `.btn-ghost`.

## Acceptance criteria

- [ ] Navigating from a browse card to `/#/game/:serial` renders the real game.
- [ ] Hero shows cover image, title, genre, features chips, dev/publisher/year.
- [ ] Description is rendered.
- [ ] Screenshot carousel scrolls horizontally and snaps.
- [ ] Clicking a screenshot opens the lightbox.
- [ ] Metadata panel shows all six fields with empty values falling back to `—`.
- [ ] Document tiles link to PB file URLs and open in a new tab.
- [ ] Missing screenshots / documents / metadata fields don't crash the page.
- [ ] `npm run typecheck && npm run lint` pass.

## Manual verification

1. Browse → click any tile.
2. URL becomes `/#/game/<serial>`.
3. Cover, title, genre, chips, description all render.
4. Carousel scrolls on chevron click and on trackpad swipe.
5. Click a screenshot → lightbox opens; `Escape` closes.
6. Click a document tile → PDF opens in a new tab.
7. Direct-navigate to `/#/game/DOES-NOT-EXIST` → "Game not found" with a back link.

## Out of scope

- Play / Continue button actions (no emulator yet — flagged in `AGENTS.md`).
- Auth-aware behavior (Stage 6).
- Polish animations (Stage 7).
