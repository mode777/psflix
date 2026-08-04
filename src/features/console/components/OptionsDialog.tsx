import { useEffect, useRef } from 'react';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';

type OptionsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function OptionsDialog({ open, onClose }: OptionsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useFocusOnDialog(open, dialogRef);

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

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm p-0 m-0 max-w-none max-h-none w-screen h-screen"
    >
      <div className="w-screen h-screen flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-headline-xl-mobile text-white font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                tune
              </span>
              Options
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
          <p className="text-on-surface-variant text-sm">
            Advanced emulator options (video filters, input mapping, BIOS settings) will live here.
          </p>
        </div>
      </div>
    </dialog>
  );
}
