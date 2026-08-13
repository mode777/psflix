import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/admin/lib/format';
import type { FailedItem, GameGroup, ItemStatus } from './pipeline';

type ReviewListProps = {
  games: GameGroup[];
  failed: FailedItem[];
  onRemoveItem: (id: string) => void;
  onRemoveGame: (serial: string) => void;
  onApprove: () => void;
  canApprove: boolean;
};

/**
 * Review-before-upload: items grouped by game (with cover artwork), child disc
 * rows (serial, size, existing/ready state), and a visually distinct section
 * for failed items. The operator approves via "Start upload" — no field
 * editing in this change.
 */
export function ReviewList({
  games,
  failed,
  onRemoveItem,
  onRemoveGame,
  onApprove,
  canApprove,
}: ReviewListProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-headline-lg text-white">Review &amp; approve</h2>
          <span className="text-body-md text-on-surface-variant">
            {games.length} game{games.length === 1 ? '' : 's'} ·{' '}
            {games.reduce((n, g) => n + g.discItems.length, 0)} disc
            {games.reduce((n, g) => n + g.discItems.length, 0) === 1 ? '' : 's'}
          </span>
        </div>

        {games.map((game) => (
          <GameCard
            key={game.firstDiscSerial}
            game={game}
            onRemoveItem={onRemoveItem}
            onRemoveGame={onRemoveGame}
          />
        ))}
      </section>

      {failed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-headline-lg text-white">Failed</h2>
          <div
            className={cn(
              'glass-panel rounded-2xl border border-error/30 p-4',
              'flex flex-col divide-y divide-white/5',
            )}
          >
            {failed.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="material-symbols-outlined text-error" aria-hidden="true">
                  error
                </span>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-on-surface font-body-md truncate">{item.fileName}</span>
                  <span className="text-body-md text-error/90 truncate">{item.reason}</span>
                </div>
                <span className="text-body-md text-on-surface-variant tabular-nums shrink-0">
                  {formatBytes(item.fileSize)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item.fileName}`}
                  onClick={() => onRemoveItem(item.id)}
                  className="btn-ghost rounded-lg p-1.5 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3 pb-4">
        <button
          type="button"
          disabled={!canApprove}
          onClick={onApprove}
          className={cn(
            'rounded-lg px-5 py-2.5 text-body-md font-medium text-on-primary',
            'bg-gradient-to-br from-inverse-primary to-secondary-container',
            'hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          Start upload
        </button>
      </div>
    </div>
  );
}

function GameCard({
  game,
  onRemoveItem,
  onRemoveGame,
}: {
  game: GameGroup;
  onRemoveItem: (id: string) => void;
  onRemoveGame: (serial: string) => void;
}) {
  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <CoverArt url={game.coverImage} title={game.metadata.officialTitle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-body-lg text-on-surface font-semibold truncate">
                {game.metadata.officialTitle || game.firstDiscSerial}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {game.metadata.region && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-label-caps font-label-caps text-on-surface-variant">
                    {game.metadata.region}
                  </span>
                )}
                {game.metadata.genre && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-label-caps font-label-caps text-on-surface-variant">
                    {game.metadata.genre}
                  </span>
                )}
                <span className="text-body-md text-on-surface-variant">{game.firstDiscSerial}</span>
              </div>
            </div>
            <button
              type="button"
              aria-label={`Remove game ${game.metadata.officialTitle}`}
              title="Remove game and its discs"
              onClick={() => onRemoveGame(game.firstDiscSerial)}
              className="btn-ghost rounded-lg p-1.5 text-on-surface-variant hover:text-on-surface shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <ul className="flex flex-col divide-y divide-white/5 mt-2">
            {game.discItems.map((disc) => (
              <li key={disc.id} className="flex items-center gap-3 py-2.5">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                  album
                </span>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-on-surface font-body-md">
                    Disc {disc.index + 1}
                    <span className="text-on-surface-variant"> · {disc.discId}</span>
                  </span>
                  <span className="text-body-md text-on-surface-variant truncate">
                    {disc.fileName}
                  </span>
                </div>
                <span className="text-body-md text-on-surface-variant tabular-nums shrink-0">
                  {formatBytes(disc.fileSize)}
                </span>
                <StatusChip status={disc.status} />
                <button
                  type="button"
                  aria-label={`Remove ${disc.fileName}`}
                  onClick={() => onRemoveItem(disc.id)}
                  className="btn-ghost rounded-lg p-1.5 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CoverArt({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={cn(
          'h-24 w-20 rounded-lg shrink-0 flex items-center justify-center',
          'bg-surface-container-high border border-white/10',
        )}
      >
        <span className="material-symbols-outlined text-on-surface-variant text-[28px]">
          image_not_supported
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`${title} cover`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-24 w-20 rounded-lg object-cover shrink-0 border border-white/10 bg-surface-container-high"
    />
  );
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'Pending',
  identifying: 'Identifying…',
  identified: 'Identified',
  ready: 'Ready',
  exists: 'In catalog',
  failed: 'Failed',
  uploading: 'Uploading…',
  uploaded: 'Uploaded',
  error: 'Failed',
};

function StatusChip({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    pending: 'bg-white/10 text-on-surface-variant',
    identifying: 'bg-white/10 text-on-surface-variant',
    identified: 'bg-white/10 text-on-surface-variant',
    ready: 'bg-white/10 text-on-surface',
    exists: 'bg-secondary-container/15 text-secondary-fixed',
    failed: 'bg-error/15 text-error',
    uploading: 'bg-primary/15 text-primary',
    uploaded: 'bg-favorite/15 text-favorite',
    error: 'bg-error/15 text-error',
  };
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-label-caps font-label-caps shrink-0',
        styles[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
