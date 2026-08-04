import { useEffect, useRef } from 'react';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';

export type PdfPopoverProps = {
  open: boolean;
  url: string;
  title: string;
  onClose: () => void;
  size?: 'square' | 'wide';
};

const FRAME_SIZE: Record<NonNullable<PdfPopoverProps['size']>, string> = {
  square: 'w-full max-w-[min(80vh,700px)] aspect-square',
  wide: 'w-full max-w-[min(1200px,112vh)] aspect-[4/3]',
};

export function PdfPopover({ open, url, title, onClose, size = 'square' }: PdfPopoverProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useFocusOnDialog(open, dialogRef);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open) {
      dlg.showModal();
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
      className="bg-transparent backdrop:bg-black/80 backdrop:backdrop-blur-sm p-0 m-0 max-w-none max-h-none w-screen h-screen"
    >
      <div className="w-screen h-screen flex items-center justify-center p-6 relative">
        <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
          <span className="text-white font-body-md text-sm truncate max-w-[60vw]">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="bg-black/60 p-2 rounded-full border border-white/10 hover:bg-black/80 transition-colors"
          >
            <span className="material-symbols-outlined text-white">close</span>
          </button>
        </div>
        <iframe
          src={url}
          title={title}
          className={`${FRAME_SIZE[size]} rounded-xl border border-white/10 shadow-2xl bg-white`}
        />
      </div>
    </dialog>
  );
}
