import { useEffect, useRef } from 'react';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';
import { cn } from '@/lib/cn';
import { SAVE_SLOTS, type SaveSlot, type SaveStateInfo } from '../types';

type SlotPickerMode = 'save' | 'load' | 'delete';

type SlotPickerDialogProps = {
  open: boolean;
  mode: SlotPickerMode;
  saves: SaveStateInfo[];
  onSelect: (slot: SaveSlot) => void;
  onClose: () => void;
};

const MODE_COPY: Record<SlotPickerMode, { title: string; verb: string; empty: string }> = {
  save: { title: 'Save State', verb: 'Save to', empty: 'Empty — will create new save' },
  load: { title: 'Load State', verb: 'Load from', empty: 'No save in this slot' },
  delete: { title: 'Delete State', verb: 'Delete from', empty: 'No save in this slot' },
};

export function SlotPickerDialog({ open, mode, saves, onSelect, onClose }: SlotPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useFocusOnDialog(open, dialogRef);
  const copy = MODE_COPY[mode];

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open) {
      if (!dlg.open) dlg.showModal();
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

  const findSave = (slot: SaveSlot) => saves.find((s) => s.slot === slot);

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm p-0 m-0 max-w-none max-h-none w-screen h-screen"
    >
      <div className="w-screen h-screen flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-headline-xl-mobile text-white font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                {mode === 'save' ? 'save' : mode === 'load' ? 'download' : 'delete'}
              </span>
              {copy.title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="bg-white/5 p-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-white" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <p className="text-on-surface-variant text-xs mb-4">{copy.verb} which slot?</p>

          <div className="grid grid-cols-2 gap-3">
            {SAVE_SLOTS.map((s) => {
              const save = findSave(s.value);
              const occupied = !!save;
              const disabled = mode !== 'save' && !occupied;
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(s.value);
                    dialogRef.current?.close();
                  }}
                  className={cn(
                    'text-left p-3 rounded border transition-all',
                    'flex flex-col gap-1 min-h-[72px]',
                    disabled
                      ? 'bg-white/[0.02] border-white/5 cursor-not-allowed opacity-50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/40',
                  )}
                >
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    {s.label}
                  </span>
                  {occupied ? (
                    <span className="flex flex-col">
                      <span className="text-white text-sm font-semibold">
                        {save!.blocks} block{save!.blocks === 1 ? '' : 's'}
                      </span>
                      <span className="text-[10px] text-white/40">
                        {new Date(save!.updatedAt).toLocaleString()}
                      </span>
                    </span>
                  ) : (
                    <span className="text-white/30 text-xs italic">{copy.empty}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </dialog>
  );
}
