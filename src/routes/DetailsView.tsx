import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useGame, type GameDetail } from '@/features/games/useGame';
import { useSaveStates } from '@/features/console/hooks/useSaveStates';
import { useAuthStore } from '@/features/auth/store';
import { parseGameFeatures } from '@/types/games';
import type { DiscsResponse, DocumentsResponse } from '@/types/pocketbase';
import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import { CoverImage } from '@/components/media/CoverImage';
import { ScreenshotStack } from '@/components/media/ScreenshotStack';
import { MetadataPanel } from '@/components/media/MetadataPanel';
import { PdfPopover } from '@/components/media/PdfPopover';
import { FeaturesChips } from '@/components/media/FeaturesChips';

export default function DetailsView() {
  const { firstDiscSerial } = useParams<{ firstDiscSerial: string }>();
  const navigate = useNavigate();
  const { data: game, isLoading, isError } = useGame(firstDiscSerial);
  const user = useAuthStore((s) => s.user);
  const [manualOpen, setManualOpen] = useState(false);
  const [openGuide, setOpenGuide] = useState<DocumentsResponse | null>(null);

  const discs: DiscsResponse[] = (game?.expand?.discs_via_game ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const firstDisc = discs[0];
  const { data: saves } = useSaveStates(firstDisc?.id, user?.id);
  const hasSave = (saves?.length ?? 0) > 0;

  if (isLoading) return <DetailsSkeleton />;
  if (isError || !game) return <DetailsNotFound />;

  const features = parseGameFeatures(game.features);
  const documents: DocumentsResponse[] = game.expand?.documents_via_game ?? [];
  const manual = documents.find((d) => d.type === 'manual');
  const guides = documents.filter((d) => d.type === 'guide');
  const manualUrl = manual?.file ? fileUrl(manual, manual.file) : undefined;
  const releaseYear = game.release ? game.release.slice(0, 4) : '';
  const coverUrl = game.cover_image ? fileUrl(game, game.cover_image) : undefined;
  const firstScreenshot =
    game.screenshots && game.screenshots.length > 0 ? game.screenshots[0] : undefined;
  const backdropFile = firstScreenshot ?? game.cover_image;
  const backdropUrl = backdropFile ? fileUrl(game, backdropFile) : undefined;

  return (
    <>
      <Helmet>
        <title>{`${game.title} | PSflix`}</title>
        <meta
          name="description"
          content={game.description?.slice(0, 160) ?? `${game.title} on PSflix`}
        />
        {coverUrl && <meta property="og:image" content={coverUrl} />}
        <meta property="og:title" content={game.title} />
      </Helmet>

      {backdropUrl && (
        <div
          className="page-background"
          style={{ backgroundImage: `url(${backdropUrl})` }}
          aria-hidden="true"
        />
      )}

      <main className="relative animate-fade-in-up motion-reduce:animate-none">
        <section className="pt-16 pb-8 mt-16 bg-black/25">
          <div className="max-w-container-max mx-auto flex flex-col md:flex-row gap-8 items-start px-margin-mobile md:px-margin-desktop">
            <div
              className={cn(
                'w-64 h-64 shrink-0 rounded-lg shadow-2xl border border-white/10 overflow-hidden',
                'bg-surface-container-highest',
              )}
            >
              <CoverImage
                record={game}
                filename={game.cover_image}
                alt={`Cover for ${game.title}`}
              />
            </div>
            <div className="flex flex-col gap-3 flex-grow">
              {game.genre && (
                <p className="text-secondary-container font-body-md font-semibold tracking-wide uppercase">
                  {game.genre}
                </p>
              )}
              <h1 className="font-display-lg text-6xl text-white drop-shadow-2xl font-black">
                {game.title}
              </h1>
              {features.length > 0 && <FeaturesChips features={features} />}
              {(game.developer || game.publisher || releaseYear) && (
                <p className="text-on-surface-variant font-body-md font-bold mt-2">
                  {[game.developer, game.publisher, releaseYear].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap gap-4 mt-4">
                <button
                  type="button"
                  aria-label="Play game"
                  onClick={() => navigate(`/play/${firstDiscSerial}`)}
                  className={cn(
                    'bg-primary hover:bg-primary/90 text-on-primary font-body-md px-8 py-3',
                    'rounded flex items-center gap-2 font-semibold transition-all duration-300',
                    'hover:scale-105 active:scale-100',
                  )}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    play_arrow
                  </span>
                  Play
                </button>
                <button
                  type="button"
                  aria-label="Continue saved game"
                  disabled={!hasSave}
                  title={
                    !hasSave ? 'No saved progress yet — save inside the console first' : undefined
                  }
                  onClick={() => navigate(`/play/${firstDiscSerial}?resume=1`)}
                  className={cn(
                    'btn-ghost text-white font-body-md px-8 py-3 rounded flex items-center gap-2',
                    'font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40',
                    'disabled:hover:scale-100',
                  )}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    resume
                  </span>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="px-margin-mobile md:px-margin-desktop py-8 max-w-container-max mx-auto space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
            <div className="lg:col-span-8 flex flex-col gap-12">
              {game.description && (
                <div className="space-y-4 font-body-lg text-body-lg text-on-surface-variant">
                  {game.description
                    .split(/\n+/)
                    .filter((p) => p.trim().length > 0)
                    .map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-4 flex flex-col gap-4">
              <MetadataPanel game={game as GameDetail} />
              {manualUrl && (
                <DocumentButton
                  label="Digital Manual"
                  icon="auto_stories"
                  iconColor="text-primary"
                  url={manualUrl}
                  onOpen={() => setManualOpen(true)}
                />
              )}
              {guides.map((guide) => {
                const url = guide.file ? fileUrl(guide, guide.file) : undefined;
                if (!url) return null;
                return (
                  <DocumentButton
                    key={guide.id}
                    label="Strategy Guide"
                    icon="map"
                    iconColor="text-secondary-container"
                    url={url}
                    onOpen={() => setOpenGuide(guide)}
                  />
                );
              })}
              {game.screenshots && game.screenshots.length > 0 && (
                <ScreenshotStack
                  screenshots={game.screenshots}
                  record={{ collectionId: game.collectionId, id: game.id }}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      {manualUrl && (
        <PdfPopover
          open={manualOpen}
          url={manualUrl}
          title="Digital Manual"
          onClose={() => setManualOpen(false)}
        />
      )}
      {openGuide && openGuide.file && (
        <PdfPopover
          open
          url={fileUrl(openGuide, openGuide.file)}
          title="Strategy Guide"
          size="wide"
          onClose={() => setOpenGuide(null)}
        />
      )}
    </>
  );
}

function DetailsSkeleton() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto animate-pulse motion-reduce:animate-none">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-64 h-64 rounded-lg bg-surface-container" />
        <div className="flex flex-col gap-4 flex-grow">
          <div className="h-14 w-3/4 rounded bg-surface-container" />
          <div className="h-6 w-1/3 rounded bg-surface-container" />
          <div className="h-4 w-1/2 rounded bg-surface-container" />
        </div>
      </div>
    </main>
  );
}

function DetailsNotFound() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop text-center">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">
        Game not found
      </h1>
      <Link
        to="/"
        className="inline-block mt-6 px-6 py-2 rounded-lg bg-primary text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Back to browse
      </Link>
    </main>
  );
}

type DocumentButtonProps = {
  label: string;
  icon: string;
  iconColor: string;
  url: string;
  onOpen: () => void;
};

function DocumentButton({ label, icon, iconColor, url, onOpen }: DocumentButtonProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'glass-panel rounded-xl px-4 py-3 flex items-center gap-3 flex-1 text-left',
          'group transition-all duration-300 card-hover-effect',
        )}
      >
        <span
          className={cn(
            'material-symbols-outlined text-2xl group-hover:scale-110 transition-transform',
            iconColor,
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="font-body-md text-body-md text-white font-semibold">{label}</span>
      </button>
      <a
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${label}`}
        className={cn(
          'glass-panel rounded-xl px-3 py-3 flex items-center justify-center shrink-0',
          'group transition-all duration-300 card-hover-effect',
        )}
      >
        <span
          className="material-symbols-outlined text-white text-2xl group-hover:scale-110 transition-transform"
          aria-hidden="true"
        >
          download
        </span>
      </a>
    </div>
  );
}
