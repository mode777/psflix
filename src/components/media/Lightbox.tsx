import { useEffect, useRef, useState } from 'react';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';

export type LightboxProps = {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  alt?: string;
};

export function Lightbox({ open, images, index, onClose, onIndexChange, alt }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);

  useFocusOnDialog(open, dialogRef);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !internalOpen) {
      dlg.showModal();
      setInternalOpen(true);
    } else if (!open && internalOpen) {
      dlg.close();
      setInternalOpen(false);
    }
  }, [open, internalOpen]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      setInternalOpen(false);
      onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (e.target === dlg) {
        dlg.close();
      }
    };
    dlg.addEventListener('close', handleClose);
    dlg.addEventListener('click', handleClick);
    return () => {
      dlg.removeEventListener('close', handleClose);
      dlg.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const current = images[safeIndex];

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent backdrop:bg-black/80 backdrop:backdrop-blur-sm p-0 m-0 max-w-none max-h-none w-screen h-screen"
    >
      <div className="w-screen h-screen flex items-center justify-center p-6 relative">
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialogRef.current?.close()}
          className="absolute top-4 right-4 z-30 bg-black/60 p-2 rounded-full border border-white/10 hover:bg-black/80 transition-colors"
        >
          <span className="material-symbols-outlined text-white">close</span>
        </button>

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => onIndexChange((safeIndex - 1 + images.length) % images.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 bg-black/60 p-2 rounded-full border border-white/10 hover:bg-black/80 transition-colors"
            >
              <span className="material-symbols-outlined text-white">chevron_left</span>
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => onIndexChange((safeIndex + 1) % images.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 bg-black/60 p-2 rounded-full border border-white/10 hover:bg-black/80 transition-colors"
            >
              <span className="material-symbols-outlined text-white">chevron_right</span>
            </button>
          </>
        )}

        {current && (
          <img
            src={current}
            alt={alt ?? ''}
            className="max-w-full max-h-full w-full h-full object-contain rounded-xl shadow-2xl [image-rendering:pixelated]"
          />
        )}
      </div>
    </dialog>
  );
}
