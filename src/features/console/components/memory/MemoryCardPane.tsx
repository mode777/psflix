import { useState } from 'react';
import type { Save } from 'mcrreader';
import type { MemoryManagerSlotView, MemorySlotNumber } from '../../memcards/memoryCardManager';
import { cn } from '@/lib/cn';
import { SaveIcon } from './SaveIcon';

type MemoryCardPaneProps = {
  slot: MemorySlotNumber;
  view: MemoryManagerSlotView;
  label: string;
  /** The other emulator slot, target for copy/move. */
  otherSlot: MemorySlotNumber;
  otherMounted: boolean;
  busy?: boolean;
  onEject: () => void;
  onRename: (label: string) => void;
  onFormat: () => void;
  onDeleteSave: (save: Save) => void;
  onCopySave: (save: Save) => void;
  onMoveSave: (save: Save) => void;
};

export function MemoryCardPane({
  slot,
  view,
  label,
  otherSlot,
  otherMounted,
  busy,
  onEject,
  onRename,
  onFormat,
  onDeleteSave,
  onCopySave,
  onMoveSave,
}: MemoryCardPaneProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const parsed = view.parsed;
  const usedBlocks = parsed.totalBlocks - parsed.freeBlocks;
  const usedPct = Math.round((usedBlocks / parsed.totalBlocks) * 100);

  const commitRename = () => {
    onRename(draft.trim() || label);
    setEditing(false);
  };

  return (
    <section className="relative flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-20" />

      {/* Slot header */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-outline-variant bg-surface-container-low p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="material-symbols-outlined text-[28px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              sd_card
            </span>
            {editing ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={draft}
                  maxLength={24}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="w-full min-w-0 rounded bg-surface-variant px-2 py-1 text-sm text-white ring-1 ring-outline-variant focus:ring-primary/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={commitRename}
                  aria-label="Save name"
                  className="rounded p-1.5 text-primary hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-base">check</span>
                </button>
              </div>
            ) : (
              <h3 className="truncate font-semibold text-on-surface">
                Slot {slot}: {label}
              </h3>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <IconButton title="Eject Card" icon="eject" onClick={onEject} disabled={busy} />
            <IconButton
              title={view.libraryId ? 'Rename Card' : 'No library entry to rename'}
              icon="edit"
              onClick={() => {
                setDraft(label);
                setEditing(true);
              }}
              disabled={busy || !view.libraryId}
            />
            <IconButton
              title="Format Card"
              icon="delete_sweep"
              onClick={onFormat}
              disabled={busy}
              danger
            />
          </div>
        </div>

        {/* Capacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              Capacity Used
            </span>
            <span className="font-label-caps text-label-caps text-primary">
              {usedBlocks} / {parsed.totalBlocks} Blocks
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-outline-variant bg-surface-variant">
            <div
              className="relative h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, usedPct)}%` }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_25%,rgba(255,255,255,0.2)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.2)_75%,rgba(255,255,255,0.2)_100%)] bg-[length:20px_20px]" />
            </div>
          </div>
        </div>
      </div>

      {/* Save list */}
      <div className="memory-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {parsed.saves.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-on-surface-variant/70">
            This card has no saved games yet.
          </div>
        ) : (
          parsed.saves.map((save) => (
            <div
              key={`${save.index}-${save.hash}`}
              className="group flex items-center rounded-lg border border-outline-variant bg-surface p-2.5 transition-colors hover:border-outline hover:bg-surface-container-high"
            >
              <SaveIcon icon={save.icon} alt={save.title} />
              <div className="ml-3 min-w-0 flex-1">
                <h4 className="truncate text-sm text-on-surface">{save.title || '(untitled)'}</h4>
                <p className="truncate text-xs text-on-surface-variant">
                  {save.productCode || 'Unknown'} · {save.region.name}
                </p>
              </div>
              <span className="ml-2 shrink-0 rounded border border-outline-variant bg-surface-variant px-2 py-0.5 font-label-caps text-label-caps text-on-surface">
                {save.blocks.length} Blocks
              </span>
              <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <SaveAction
                  title={`Copy to Slot ${otherSlot}`}
                  icon="content_copy"
                  disabled={busy || !otherMounted}
                  onClick={() => onCopySave(save)}
                />
                <SaveAction
                  title={`Move to Slot ${otherSlot}`}
                  icon="swap_horiz"
                  disabled={busy || !otherMounted}
                  onClick={() => onMoveSave(save)}
                />
                <SaveAction
                  title="Delete Save"
                  icon="delete"
                  danger
                  disabled={busy}
                  onClick={() => onDeleteSave(save)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function IconButton({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border border-outline-variant bg-surface-variant p-2 text-on-surface transition-colors group/btn',
        'hover:bg-surface-container-high',
        danger && 'hover:border-error hover:bg-error-container',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <span
        className={cn(
          'material-symbols-outlined text-lg transition-colors group-hover/btn:text-primary',
          danger && 'group-hover/btn:text-error',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
    </button>
  );
}

function SaveAction({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded bg-surface p-1.5 text-on-surface-variant transition-colors',
        'border border-transparent hover:border-primary hover:bg-primary-container hover:text-on-primary-container',
        danger && 'hover:border-error hover:bg-error-container hover:text-on-error-container',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-surface disabled:hover:text-on-surface-variant',
      )}
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
