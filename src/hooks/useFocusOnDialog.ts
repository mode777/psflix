import { useEffect, useRef } from 'react';

export function useFocusOnDialog(open: boolean, dialogRef: React.RefObject<HTMLDialogElement>) {
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      dlg.close();
    };
    dlg.addEventListener('cancel', handleCancel);
    return () => dlg.removeEventListener('cancel', handleCancel);
  }, [dialogRef]);
}
