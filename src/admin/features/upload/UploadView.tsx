import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/admin/lib/format';
import { Dropzone } from './Dropzone';
import { ReviewList } from './ReviewList';
import { useImportPipeline } from './useImportPipeline';
import type { UploadSummary } from './pipeline';

/**
 * Game upload workflow: intake (dropzone) → identification/enrichment →
 * review list (grouped by game) → sequential upload with per-file + overall
 * progress → done summary. Styled with the shared Obsidian Console tokens
 * (charcoal tiers, 16px card radii, Inter, PlayStation-blue/teal accents).
 */
export function UploadView() {
  const pipeline = useImportPipeline();
  const { state } = pipeline;

  return (
    <>
      <Helmet>
        <title>Upload — PSflix Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg text-white">Upload games</h1>
          <p className="text-body-md text-on-surface-variant">
            Add PS1 CHD disc images — each is identified in-browser, enriched with metadata and
            artwork, and reviewed before anything is uploaded.
          </p>
        </div>

        {state.stage === 'idle' && <Dropzone onFiles={(files) => void pipeline.addFiles(files)} />}

        {state.stage === 'intake' && (
          <>
            <Dropzone disabled onFiles={(files) => void pipeline.addFiles(files)} />
            <IntakePanel items={state.items} />
          </>
        )}

        {state.stage === 'review' && (
          <ReviewList
            games={state.games}
            failed={state.failed}
            onRemoveItem={pipeline.removeItem}
            onRemoveGame={pipeline.removeGame}
            onApprove={() => void pipeline.startUpload()}
            canApprove={state.games.some((g) => g.discItems.some((d) => d.status === 'ready'))}
          />
        )}

        {(state.stage === 'uploading' || state.stage === 'done') && (
          <UploadProgress games={state.games} />
        )}

        {state.stage === 'done' && state.summary && (
          <DoneSummary summary={state.summary} onReset={pipeline.reset} />
        )}
      </div>
    </>
  );
}

function IntakePanel({
  items,
}: {
  items: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    status: string;
    error: string | null;
  }>;
}) {
  const active = items.filter((i) => ['pending', 'identifying', 'identified'].includes(i.status));
  const failed = items.filter((i) => i.status === 'failed');
  const enriched = items.filter((i) => i.status === 'ready' || i.status === 'exists');
  const done = items.length > 0 && active.length === 0;

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-lg text-white">
          {done ? 'Identification complete' : 'Identifying discs…'}
        </h2>
        <span className="text-body-md text-on-surface-variant tabular-nums">
          {enriched.length + failed.length}/{items.length} processed
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-white/5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <IntakeSpinner active={active.some((a) => a.id === item.id)} />
            <span className="flex-1 min-w-0 text-on-surface font-body-md truncate">
              {item.fileName}
            </span>
            <span className="text-body-md text-on-surface-variant tabular-nums shrink-0">
              {formatBytes(item.fileSize)}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-label-caps font-label-caps shrink-0',
                item.status === 'failed'
                  ? 'bg-error/15 text-error'
                  : item.status === 'exists'
                    ? 'bg-secondary-container/15 text-secondary-fixed'
                    : 'bg-white/10 text-on-surface-variant',
              )}
              title={item.error ?? undefined}
            >
              {intakeLabel(item.status, item.error)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IntakeSpinner({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        className="material-symbols-outlined text-primary animate-spin text-[18px] shrink-0"
        aria-hidden="true"
      >
        progress_activity
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined text-on-surface-variant text-[18px] shrink-0">
      album
    </span>
  );
}

function intakeLabel(status: string, error: string | null): string {
  switch (status) {
    case 'pending':
      return 'Queued';
    case 'identifying':
      return 'Identifying…';
    case 'identified':
      return 'Enriching…';
    case 'ready':
      return 'Ready';
    case 'exists':
      return 'In catalog';
    case 'failed':
      return error ?? 'Failed';
    default:
      return status;
  }
}

function UploadProgress({
  games,
}: {
  games: Array<{
    firstDiscSerial: string;
    metadata: { officialTitle: string };
    discItems: Array<{
      id: string;
      fileName: string;
      status: string;
      progress: { loaded: number; total: number } | null;
    }>;
  }>;
}) {
  const discs = games.flatMap((g) => g.discItems);
  const total = discs.length;
  const doneCount = discs.filter((d) => ['uploaded', 'exists', 'error'].includes(d.status)).length;
  const completed = discs.filter((d) => d.status === 'uploaded' || d.status === 'exists').length;
  const uploading = discs.filter((d) => d.status === 'uploading').length;
  const remaining = discs.filter((d) => d.status === 'ready').length;
  const overallPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const current = discs.find((d) => d.status === 'uploading');

  const pct = current?.progress
    ? current.progress.total > 0
      ? Math.round((current.progress.loaded / current.progress.total) * 100)
      : 0
    : 0;

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-headline-lg text-white">Uploading discs</h2>
          <span className="text-body-md text-on-surface-variant tabular-nums">
            {completed} done · {uploading} uploading · {remaining} remaining
          </span>
        </div>
        <ProgressBar pct={overallPct} />
        <span className="text-label-caps font-label-caps text-on-surface-variant tabular-nums">
          {overallPct}% overall
        </span>
      </div>

      {current && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-on-surface font-body-md truncate">{current.fileName}</span>
            <span className="text-body-md text-primary tabular-nums shrink-0">
              {pct}%{current.progress ? ` · ${formatBytes(current.progress.loaded)}` : ''}
            </span>
          </div>
          <ProgressBar pct={pct} />
        </div>
      )}

      <ul className="flex flex-col divide-y divide-white/5">
        {discs.map((disc) => (
          <li key={disc.id} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                'material-symbols-outlined text-[18px] shrink-0',
                disc.status === 'uploaded'
                  ? 'text-favorite'
                  : disc.status === 'error'
                    ? 'text-error'
                    : disc.status === 'exists'
                      ? 'text-secondary-fixed'
                      : disc.status === 'uploading'
                        ? 'text-primary animate-pulse'
                        : 'text-on-surface-variant',
              )}
              aria-hidden="true"
            >
              {disc.status === 'uploaded'
                ? 'check_circle'
                : disc.status === 'error'
                  ? 'error'
                  : disc.status === 'exists'
                    ? 'task_alt'
                    : disc.status === 'uploading'
                      ? 'cloud_upload'
                      : 'schedule'}
            </span>
            <span className="flex-1 min-w-0 text-on-surface font-body-md truncate">
              {disc.fileName}
            </span>
            <span className="text-label-caps font-label-caps text-on-surface-variant shrink-0">
              {uploadStatusLabel(disc.status)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function uploadStatusLabel(status: string): string {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'exists':
      return 'Skipped — already present';
    case 'error':
      return 'Failed';
    case 'uploading':
      return 'Uploading…';
    case 'ready':
      return 'Waiting';
    default:
      return status;
  }
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1 rounded-full bg-white/10 overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-inverse-primary to-secondary-container shadow-[0_0_8px_rgba(175,198,255,0.7)] transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function DoneSummary({ summary, onReset }: { summary: UploadSummary; onReset: () => void }) {
  const rows = [
    { label: 'Games created', value: summary.gamesCreated },
    { label: 'Games reused', value: summary.gamesReused },
    { label: 'Discs uploaded', value: summary.discsUploaded },
    { label: 'Discs skipped (already present)', value: summary.discsSkipped },
    { label: 'Failed items', value: summary.failed, error: summary.failed > 0 },
  ];

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col gap-5">
      <h2 className="text-headline-lg text-white">Upload complete</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              'rounded-2xl p-4 flex flex-col gap-1',
              row.error
                ? 'bg-error/10 border border-error/25'
                : 'bg-white/5 border border-white/10',
            )}
          >
            <span
              className={cn(
                'text-headline-lg tabular-nums',
                row.error ? 'text-error' : 'text-white',
              )}
            >
              {row.value}
            </span>
            <span className="text-label-caps font-label-caps text-on-surface-variant">
              {row.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="btn-ghost rounded-lg px-4 py-2 text-body-md text-on-surface"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
