import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { parseMemoryCard } from 'mcrreader';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';
import type { MemoryLibraryCard, MemorySlotNumber } from '../../memcards/memoryCardManager';

type CardLibrarySheetProps = {
  open: boolean;
  slot: MemorySlotNumber;
  library: MemoryLibraryCard[];
  busy: boolean;
  onClose: () => void;
  onMount: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onImport: (bytes: Uint8Array, label?: string) => Promise<void>;
  onCreate: (label: string) => Promise<void>;
};

export function CardLibrarySheet({
  open,
  slot,
  library,
  busy,
  onClose,
  onMount,
  onRemove,
  onImport,
  onCreate,
}: CardLibrarySheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  useFocusOnDialog(open, dialogRef);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open) {
      if (!dlg.open) dlg.showModal();
      setLabel('');
    } else {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => onClose();
    const handleClick = (e: MouseEvent) => {
      if (e.target === dlg) dlg.close();
    };
    dlg.addEventListener('close', handleClose);
    dlg.addEventListener('click', handleClick);
    return () => {
      dlg.removeEventListener('close', handleClose);
      dlg.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void file
      .arrayBuffer()
      .then((buf) => onImport(new Uint8Array(buf), file.name.replace(/\.(mcr|mcd)$/i, '')))
      .catch(() => {});
    input.value = '';
  };

  const handleCreate = () => {
    if (!label.trim()) return;
    void onCreate(label.trim()).then(() => setLabel(''));
  };

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm m-0 max-w-none max-h-none"
    >
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <div className="glass-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <h3 className="text-xl font-bold text-white">
              Card Library
              <span className="ml-2 text-sm font-normal text-on-surface-variant">
                mount into Slot {slot}
              </span>
            </h3>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-white/10 bg-white/5 p-2 hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-white" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          <div className="memory-scroll min-h-0 flex-1 overflow-y-auto p-5">
            {library.length === 0 ? (
              <p className="mb-4 text-sm text-on-surface-variant">
                No cards in your library yet. Import a .mcr file or initialize a new card below.
              </p>
            ) : (
              <ul className="mb-5 flex flex-col gap-2">
                {library.map((card) => (
                  <LibraryRow
                    key={card.id}
                    card={card}
                    busy={busy}
                    onMount={() => onMount(card.id)}
                    onRemove={() => onRemove(card.id)}
                  />
                ))}
              </ul>
            )}

            <div className="space-y-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-variant px-4 py-2.5 font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload_file
                </span>
                Import .mcr card…
              </button>
              <input ref={fileRef} type="file" accept=".mcr,.mcd" hidden onChange={onFile} />

              <div className="flex items-center gap-2">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="New card name"
                  maxLength={24}
                  className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !label.trim()}
                  onClick={handleCreate}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_circle
                  </span>
                  Initialize
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function LibraryRow({
  card,
  busy,
  onMount,
  onRemove,
}: {
  card: MemoryLibraryCard;
  busy: boolean;
  onMount: () => void;
  onRemove: () => void;
}) {
  const parsed = useMemo(() => {
    try {
      return parseMemoryCard(card.bytes);
    } catch {
      return null;
    }
  }, [card.bytes]);

  const used = parsed ? parsed.totalBlocks - parsed.freeBlocks : null;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-2.5">
      <span className="material-symbols-outlined text-2xl text-primary" aria-hidden="true">
        sd_card
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-on-surface">{card.label}</p>
        <p className="text-xs text-on-surface-variant">
          {parsed
            ? `${parsed.saves.length} save${parsed.saves.length === 1 ? '' : 's'} · ${used}/${parsed.totalBlocks} blocks`
            : 'invalid card image'}
        </p>
      </div>
      <button
        type="button"
        onClick={onMount}
        disabled={busy || !parsed}
        className="shrink-0 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Mount
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${card.label} from library`}
        className="shrink-0 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          delete
        </span>
      </button>
    </li>
  );
}
