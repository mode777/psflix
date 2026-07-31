import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusOnDialog } from './useFocusOnDialog';
import { createRef } from 'react';

describe('useFocusOnDialog', () => {
  it('captures and restores the previous active element on unmount', () => {
    const previous = document.createElement('button');
    document.body.appendChild(previous);
    previous.focus();
    expect(document.activeElement).toBe(previous);

    const dialogRef = createRef<HTMLDialogElement>();
    const { unmount } = renderHook(() => useFocusOnDialog(true, dialogRef));
    unmount();
    expect(document.activeElement).toBe(previous);
    document.body.removeChild(previous);
  });

  it('does nothing when the dialog is not open', () => {
    const dialogRef = createRef<HTMLDialogElement>();
    const { result } = renderHook(() => useFocusOnDialog(false, dialogRef));
    expect(result.current).toBeUndefined();
  });

  it('adds a cancel handler that closes the dialog', () => {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    const closeSpy = vi.spyOn(dialog, 'close');
    const dialogRef = { current: dialog } as React.RefObject<HTMLDialogElement>;
    renderHook(() => useFocusOnDialog(true, dialogRef));
    const evt = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(evt);
    expect(closeSpy).toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(true);
    document.body.removeChild(dialog);
  });
});
