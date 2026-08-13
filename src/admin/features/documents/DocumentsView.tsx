import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/admin/lib/format';
import type { DocumentsTypeOptions } from '@/types/pocketbase';
import { DocumentDropzone } from './DocumentDropzone';
import { GameCombobox } from './GameCombobox';
import { useExistingDocuments } from './useExistingDocuments';
import type { GameSearchResult } from './useGameSearch';
import { selectUploadable, useDocumentQueue, type DocumentItem } from './useDocumentQueue';
import { uploadDocument } from './uploadDocument';
import { deleteDocumentsByIds, fetchSameTypeDocumentIds } from './replaceExistingDocuments';

type LogEntry = {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
};

const DOCUMENT_TYPES: DocumentsTypeOptions[] = ['guide', 'manual'];

/**
 * Document upload workflow (spec: admin/document-upload). File-first intake →
 * per-file game + type assignment → operator-approved sequential upload with
 * per-file and overall progress → append-only creation in the `documents`
 * collection under the admin superuser session. Mirrors the game uploader's
 * architecture and Obsidian Console styling.
 */
export function DocumentsView() {
  const queue = useDocumentQueue();
  const existing = useExistingDocuments();
  const [isUploading, setIsUploading] = useState(false);
  const [batchSize, setBatchSize] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  // The reducer's item shape carries only `gameId` (design.md, Decision 4); the
  // combobox display needs the full game object, so the view keeps a parallel
  // id → GameSearchResult map synced with the queue.
  const [gameByItem, setGameByItem] = useState<Record<string, GameSearchResult>>({});

  const uploadable = useMemo(() => selectUploadable(queue.items), [queue.items]);
  const canUpload = uploadable.length > 0 && !isUploading;

  const appendLog = (level: LogEntry['level'], message: string) => {
    setLog((l) => [
      ...l,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, level, message },
    ]);
  };

  const handleSelectGame = (itemId: string, game: GameSearchResult | null) => {
    queue.setGame(itemId, game ? game.id : null);
    setGameByItem((prev) => {
      if (!game) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: game };
    });
  };

  const handleRemove = (itemId: string) => {
    queue.remove(itemId);
    setGameByItem((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const runUpload = async () => {
    // Snapshot the batch at approval time; the reducer mutates during upload.
    const batch = selectUploadable(queue.items);
    if (batch.length === 0) return;
    setIsUploading(true);
    setBatchSize(batch.length);
    appendLog('info', `Uploading ${batch.length} document${batch.length > 1 ? 's' : ''}…`);

    // Snapshot pre-existing (gameId,type) ids once for replace-flagged items so
    // sibling items in the same batch sharing (game,type) don't delete each
    // other's newly-created records (design.md, Decision 8).
    const replaceKey = (gameId: string, type: DocumentsTypeOptions) => `${gameId}|${type}`;
    const replaceSnapshots = new Map<string, string[]>();
    const replacedIds = new Set<string>();
    const replaceItems = batch.filter((i) => i.replaceExisting);
    if (replaceItems.length > 0) {
      const distinctKeys = new Set(replaceItems.map((i) => replaceKey(i.gameId as string, i.type)));
      await Promise.all(
        [...distinctKeys].map(async (key) => {
          const [gameId, type] = key.split('|') as [string, DocumentsTypeOptions];
          try {
            replaceSnapshots.set(key, await fetchSameTypeDocumentIds(gameId, type));
          } catch {
            // tolerate — an empty snapshot simply skips the replace deletes.
            replaceSnapshots.set(key, []);
          }
        }),
      );
    }

    // Track per-item outcomes locally so clearing on batch finish does not need
    // to read reducer state (which is stale inside this closure).
    const outcomes: Array<{ id: string; ok: boolean }> = [];

    for (const item of batch) {
      queue.uploadStart(item.id);
      try {
        await uploadDocument({
          type: item.type,
          gameId: item.gameId as string,
          file: item.file,
          onProgress: (p) => queue.progress(item.id, p),
        });
        queue.fileDone(item.id);
        outcomes.push({ id: item.id, ok: true });
        appendLog('success', `Uploaded “${item.file.name}” (${item.type}).`);

        // Create-before-delete (Decision 8): only reached if the create above
        // did not throw, so a failed upload never removes the existing doc.
        if (item.replaceExisting) {
          const key = replaceKey(item.gameId as string, item.type);
          const ids = (replaceSnapshots.get(key) ?? []).filter((id) => !replacedIds.has(id));
          if (ids.length > 0) {
            try {
              const { deleted, failed } = await deleteDocumentsByIds(ids);
              ids.forEach((id) => replacedIds.add(id));
              if (failed.length > 0) {
                appendLog(
                  'error',
                  `Replaced ${deleted} existing ${item.type}(s); ${failed.length} delete(s) failed.`,
                );
              } else {
                appendLog('info', `Replaced ${deleted} existing ${item.type}(s) for this game.`);
              }
            } catch {
              appendLog(
                'error',
                `Uploaded “${item.file.name}” but failed to replace existing ${item.type}(s).`,
              );
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Per-file failure is recorded and the batch continues (spec).
        queue.fileError(item.id, message);
        outcomes.push({ id: item.id, ok: false });
        appendLog('error', `Failed “${item.file.name}”: ${message}`);
      }
    }

    // Refresh the duplicate map so freshly-uploaded documents are reflected.
    await existing.refetch();

    // Clear successfully-uploaded items on batch finish (spec: task 3.3);
    // failed items remain visible so the operator can see what went wrong.
    for (const outcome of outcomes) {
      if (outcome.ok) handleRemove(outcome.id);
    }

    setIsUploading(false);
    setBatchSize(0);
    const failedCount = outcomes.filter((o) => !o.ok).length;
    appendLog(
      'info',
      `Batch finished — ${outcomes.filter((o) => o.ok).length} uploaded${failedCount ? `, ${failedCount} failed` : ''}.`,
    );
  };

  const clearFinished = () => {
    for (const item of queue.items) {
      if (item.status === 'done' || item.status === 'error') handleRemove(item.id);
    }
  };

  return (
    <>
      <Helmet>
        <title>Documents — PSflix Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg text-white">Upload documents</h1>
          <p className="text-body-md text-on-surface-variant">
            Add PDF manuals and strategy guides — drop the files, assign each to a game and a type,
            then upload. Existing documents are never modified; uploads only append new records.
          </p>
        </div>

        <DocumentDropzone disabled={isUploading} onFiles={(files) => queue.addFiles(files)} />

        {queue.items.length > 0 && (
          <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-lg text-white">Staged files</h2>
              <span className="text-body-md text-on-surface-variant tabular-nums">
                {uploadable.length}/{queue.items.length} ready
              </span>
            </div>

            {isUploading && <BatchProgress items={queue.items} batchCount={batchSize} />}

            <ul className="flex flex-col divide-y divide-white/5">
              {queue.items.map((item) => (
                <StagedRow
                  key={item.id}
                  item={item}
                  selectedGame={gameByItem[item.id] ?? null}
                  disabled={isUploading}
                  hasExisting={existing.hasType(item.gameId, item.type)}
                  onSetGame={(game) => handleSelectGame(item.id, game)}
                  onSetType={(t) => queue.setType(item.id, t)}
                  onSetReplace={(r) => queue.setReplace(item.id, r)}
                  onRemove={() => handleRemove(item.id)}
                />
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={clearFinished}
                disabled={
                  isUploading ||
                  !queue.items.some((i) => i.status === 'done' || i.status === 'error')
                }
                className="btn-ghost rounded-lg px-3 py-2 text-body-md text-on-surface disabled:opacity-40"
              >
                Clear finished
              </button>
              <button
                type="button"
                onClick={() => void runUpload()}
                disabled={!canUpload}
                className={cn(
                  'rounded-lg px-4 py-2 text-body-md font-medium text-on-primary',
                  'bg-gradient-to-br from-inverse-primary to-secondary-container',
                  'hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {isUploading
                  ? 'Uploading…'
                  : `Upload ${uploadable.length} document${uploadable.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-lg text-white">Log</h2>
              <button
                type="button"
                onClick={() => setLog([])}
                className="btn-ghost rounded-lg px-3 py-1.5 text-body-md text-on-surface-variant hover:text-on-surface"
              >
                Clear
              </button>
            </div>
            <ul className="flex flex-col gap-1 max-h-64 overflow-auto">
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    'text-body-md font-body-md',
                    entry.level === 'success'
                      ? 'text-favorite'
                      : entry.level === 'error'
                        ? 'text-error'
                        : 'text-on-surface-variant',
                  )}
                >
                  {entry.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

type StagedRowProps = {
  item: DocumentItem;
  selectedGame: GameSearchResult | null;
  disabled: boolean;
  hasExisting: boolean;
  onSetGame: (game: GameSearchResult | null) => void;
  onSetType: (type: DocumentsTypeOptions) => void;
  onSetReplace: (replaceExisting: boolean) => void;
  onRemove: () => void;
};

function StagedRow({
  item,
  selectedGame,
  disabled,
  hasExisting,
  onSetGame,
  onSetType,
  onSetReplace,
  onRemove,
}: StagedRowProps) {
  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
      <div className="flex flex-1 min-w-0 items-center gap-3">
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex flex-col">
          <span className="truncate text-on-surface font-body-md">{item.file.name}</span>
          <span className="text-label-caps font-label-caps text-on-surface-variant tabular-nums">
            {formatBytes(item.file.size)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:w-80">
        <GameCombobox selected={selectedGame} onSelect={onSetGame} disabled={disabled} />
        <TypeSelector value={item.type} disabled={disabled} onChange={onSetType} />
        <AssignmentHint
          hasGame={!!item.gameId}
          hasType={!!item.type}
          hasExisting={hasExisting}
          type={item.type}
          replaceExisting={item.replaceExisting}
          disabled={disabled}
          error={item.error}
          progress={item.progress}
          onSetReplace={onSetReplace}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="btn-ghost self-start rounded-lg px-2 py-1.5 text-on-surface-variant hover:text-on-surface disabled:opacity-40 md:self-center"
        aria-label={`Remove ${item.file.name}`}
      >
        <span className="material-symbols-outlined text-[20px]">delete</span>
      </button>
    </li>
  );
}

function TypeSelector({
  value,
  disabled,
  onChange,
}: {
  value: DocumentsTypeOptions;
  disabled: boolean;
  onChange: (type: DocumentsTypeOptions) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
      {DOCUMENT_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-body-md capitalize transition disabled:opacity-40',
            value === t
              ? 'bg-primary/20 text-primary'
              : 'text-on-surface-variant hover:text-on-surface',
          )}
          aria-pressed={value === t}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function AssignmentHint({
  hasGame,
  hasType,
  hasExisting,
  type,
  replaceExisting,
  disabled,
  error,
  progress,
  onSetReplace,
}: {
  hasGame: boolean;
  hasType: boolean;
  hasExisting: boolean;
  type: DocumentsTypeOptions;
  replaceExisting: boolean;
  disabled: boolean;
  error: string | null;
  progress: { loaded: number; total: number } | null;
  onSetReplace: (replaceExisting: boolean) => void;
}) {
  if (error) {
    return <p className="text-body-md text-error">{error}</p>;
  }
  if (progress) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
    return <p className="text-body-md text-primary tabular-nums">Uploading… {pct}%</p>;
  }
  if (!hasGame || !hasType) {
    return (
      <p className="text-body-md text-on-surface-variant">Assign a game and type to upload.</p>
    );
  }
  if (hasExisting) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-body-md text-secondary-fixed">
          {replaceExisting
            ? `The existing ${type} will be replaced.`
            : `Already has a ${type} — a new record will be appended.`}
        </p>
        <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer select-none">
          <input
            type="checkbox"
            checked={replaceExisting}
            disabled={disabled}
            onChange={(e) => onSetReplace(e.target.checked)}
            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
          />
          Replace existing {type} for this game
        </label>
      </div>
    );
  }
  return null;
}

function StatusIcon({ status }: { status: DocumentItem['status'] }) {
  const map: Record<DocumentItem['status'], { icon: string; className: string }> = {
    staged: { icon: 'description', className: 'text-on-surface-variant' },
    uploading: { icon: 'cloud_upload', className: 'text-primary animate-pulse' },
    done: { icon: 'check_circle', className: 'text-favorite' },
    error: { icon: 'error', className: 'text-error' },
  };
  const { icon, className } = map[status];
  return (
    <span
      className={cn('material-symbols-outlined text-[20px] shrink-0', className)}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function BatchProgress({ items, batchCount }: { items: DocumentItem[]; batchCount: number }) {
  const total = batchCount;
  const settled = items.filter((i) => i.status === 'done' || i.status === 'error').length;
  const overallPct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const current = items.find((i) => i.status === 'uploading');
  const currentPct = current?.progress
    ? current.progress.total > 0
      ? Math.round((current.progress.loaded / current.progress.total) * 100)
      : 0
    : 0;

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <div className="flex items-baseline justify-between">
        <span className="text-on-surface font-body-md truncate">
          {current ? current.file.name : 'Uploading…'}
        </span>
        <span className="text-body-md text-on-surface-variant tabular-nums">
          {settled}/{total} · {overallPct}%
        </span>
      </div>
      <ProgressBar pct={overallPct} />
      {current && (
        <div className="flex items-center justify-between">
          <span className="text-label-caps font-label-caps text-on-surface-variant">
            Current file
          </span>
          <span className="text-body-md text-primary tabular-nums">{currentPct}%</span>
        </div>
      )}
    </div>
  );
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
