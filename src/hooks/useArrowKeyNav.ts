import { useCallback, useEffect, useRef } from 'react';

export type ArrowKeyNavOptions = {
  itemCount: number;
  columns: number;
  onActivate?: (index: number) => void;
  isDisabled?: boolean;
};

export function useArrowKeyNav({
  itemCount,
  columns,
  onActivate,
  isDisabled = false,
}: ArrowKeyNavOptions) {
  const focusedIndexRef = useRef(0);

  useEffect(() => {
    if (focusedIndexRef.current >= itemCount) {
      focusedIndexRef.current = Math.max(0, itemCount - 1);
    }
  }, [itemCount]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isDisabled || itemCount === 0) return;
      const current = focusedIndexRef.current;
      let next = current;

      switch (e.key) {
        case 'ArrowRight':
          next = Math.min(itemCount - 1, current + 1);
          break;
        case 'ArrowLeft':
          next = Math.max(0, current - 1);
          break;
        case 'ArrowDown':
          next = Math.min(itemCount - 1, current + Math.max(1, columns));
          break;
        case 'ArrowUp':
          next = Math.max(0, current - Math.max(1, columns));
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = itemCount - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onActivate?.(current);
          return;
        default:
          return;
      }

      e.preventDefault();
      if (next !== current) {
        focusedIndexRef.current = next;
      }
    },
    [columns, isDisabled, itemCount, onActivate],
  );

  return { onKeyDown, focusedIndexRef };
}
