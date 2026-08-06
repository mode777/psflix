import { useEffect, useRef, useState } from 'react';
import type { Save } from 'mcrreader';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';
import { showToast } from '@/lib/toast';
import { memoryCardManager, type MemorySlotNumber } from '../../memcards/memoryCardManager';
import { useMemoryManager } from '../../hooks/useMemoryManager';
import { MemoryCardPane } from './MemoryCardPane';
import { EmptyCardPane } from './EmptyCardPane';
import { CardLibrarySheet } from './CardLibrarySheet';

type MemoryManagerDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function MemoryManagerDialog({ open, onClose }: MemoryManagerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const view = useMemoryManager();
  const [libraryFor, setLibraryFor] = useState<MemorySlotNumber | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusOnDialog(open, dialogRef);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open) {
      if (!dlg.open) dlg.showModal();
      // Refresh any slots the core couldn't report before it finished booting;
      // hydrate only fills slots that are still null, so in-memory edits survive.
      void memoryCardManager.hydrate();
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

  const wrap = async (fn: () => Promise<void>, failMsg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      showToast(err instanceof Error ? err.message : failMsg, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const otherSlot = (slot: MemorySlotNumber): MemorySlotNumber => (slot === 1 ? 2 : 1);

  const labelOf = (slot: MemorySlotNumber) => {
    const mountedId = slot === 1 ? view.slot1?.libraryId : view.slot2?.libraryId;
    const entry = mountedId ? view.library.find((c) => c.id === mountedId) : undefined;
    return entry?.label ?? 'Memory Card';
  };

  const handleMount = (slot: MemorySlotNumber, cardId: string) => {
    void wrap(
      () => memoryCardManager.mountCard(slot, cardId).then(() => setLibraryFor(null)),
      'Could not mount the card',
    );
  };

  const handleRemove = (cardId: string) => {
    try {
      memoryCardManager.deleteCard(cardId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove the card', {
        kind: 'error',
      });
    }
  };

  const handleImport = (slot: MemorySlotNumber) => (bytes: Uint8Array, label?: string) =>
    wrap(
      () =>
        memoryCardManager
          .importCard(bytes, label)
          .then((card) =>
            memoryCardManager.mountCard(slot, card.id).then(() => setLibraryFor(null)),
          ),
      'Could not import the card',
    );

  const handleCreate = (slot: MemorySlotNumber) => (label: string) =>
    wrap(
      () =>
        memoryCardManager
          .createCard(label)
          .then((card) =>
            memoryCardManager.mountCard(slot, card.id).then(() => setLibraryFor(null)),
          ),
      'Could not initialize a card',
    );

  const pane = (slot: MemorySlotNumber) => {
    const slotView = slot === 1 ? view.slot1 : view.slot2;
    if (slotView) {
      return (
        <MemoryCardPane
          slot={slot}
          view={slotView}
          label={labelOf(slot)}
          otherSlot={otherSlot(slot)}
          otherMounted={!!(otherSlot(slot) === 1 ? view.slot1 : view.slot2)}
          busy={busy}
          onEject={() =>
            void wrap(() => memoryCardManager.unmountCard(slot), 'Could not eject the card')
          }
          onRename={(label) => {
            const mountedId = slotView.libraryId;
            if (!mountedId) return;
            memoryCardManager.renameCard(mountedId, label);
          }}
          onFormat={() =>
            void wrap(() => memoryCardManager.formatSlot(slot), 'Could not format the card')
          }
          onDeleteSave={(save: Save) =>
            void wrap(() => memoryCardManager.deleteSave(slot, save), 'Could not delete the save')
          }
          onCopySave={(save: Save) =>
            void wrap(
              () => memoryCardManager.transferSave(slot, otherSlot(slot), save, 'copy'),
              'Could not copy the save',
            )
          }
          onMoveSave={(save: Save) =>
            void wrap(
              () => memoryCardManager.transferSave(slot, otherSlot(slot), save, 'move'),
              'Could not move the save',
            )
          }
        />
      );
    }
    return (
      <EmptyCardPane
        slot={slot}
        onMount={() => setLibraryFor(slot)}
        onInitialize={() => setLibraryFor(slot)}
      />
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent m-0 max-h-none max-w-none p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm w-screen h-screen"
    >
      <div className="flex h-screen w-screen items-center justify-center p-4 md:p-6">
        <div className="glass-panel flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 p-5 md:p-6">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-headline-xl-mobile font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  memory
                </span>
                Data Management
              </h2>
              <p className="mt-1 text-on-surface-variant">
                Manage save files and storage allocation across mounted media.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-white" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Panes */}
          <div className="min-h-0 flex-1 p-4 md:p-6">
            {!view.hydrated ? (
              <div className="flex h-full items-center justify-center gap-3 text-on-surface-variant">
                <span
                  className="material-symbols-outlined animate-spin text-primary"
                  aria-hidden="true"
                >
                  progress_activity
                </span>
                Reading memory cards…
              </div>
            ) : (
              <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6">
                {pane(1)}
                {pane(2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {libraryFor !== null && (
        <CardLibrarySheet
          open
          slot={libraryFor}
          library={view.library}
          busy={busy}
          onClose={() => setLibraryFor(null)}
          onMount={(id) => handleMount(libraryFor, id)}
          onRemove={handleRemove}
          onImport={handleImport(libraryFor)}
          onCreate={handleCreate(libraryFor)}
        />
      )}
    </dialog>
  );
}
