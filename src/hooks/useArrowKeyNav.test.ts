import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useArrowKeyNav } from './useArrowKeyNav';

function makeKeyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe('useArrowKeyNav', () => {
  it('returns a stable onKeyDown handler', () => {
    const { result, rerender } = renderHook(
      ({ columns }) => useArrowKeyNav({ itemCount: 5, columns }),
      {
        initialProps: { columns: 2 },
      },
    );
    const first = result.current.onKeyDown;
    rerender({ columns: 2 });
    expect(result.current.onKeyDown).toBe(first);
  });

  it('does nothing when disabled or itemCount is 0', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() =>
      useArrowKeyNav({ itemCount: 5, columns: 2, onActivate, isDisabled: true }),
    );
    result.current.onKeyDown(makeKeyboardEvent('Enter'));
    expect(onActivate).not.toHaveBeenCalled();

    const second = renderHook(() => useArrowKeyNav({ itemCount: 0, columns: 2, onActivate }));
    second.result.current.onKeyDown(makeKeyboardEvent('Enter'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('moves the focus index by one on ArrowRight and ArrowLeft', () => {
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 5, columns: 2 }));
    const ev1 = makeKeyboardEvent('ArrowRight');
    act(() => result.current.onKeyDown(ev1));
    expect(ev1.preventDefault).toHaveBeenCalled();
    expect(result.current.focusedIndexRef.current).toBe(1);

    const ev2 = makeKeyboardEvent('ArrowLeft');
    act(() => result.current.onKeyDown(ev2));
    expect(result.current.focusedIndexRef.current).toBe(0);
  });

  it('moves by one row on ArrowDown and ArrowUp', () => {
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 9, columns: 3 }));
    act(() => result.current.onKeyDown(makeKeyboardEvent('ArrowDown')));
    expect(result.current.focusedIndexRef.current).toBe(3);
    act(() => result.current.onKeyDown(makeKeyboardEvent('ArrowUp')));
    expect(result.current.focusedIndexRef.current).toBe(0);
  });

  it('clamps Home and End to the bounds', () => {
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 5, columns: 2 }));
    act(() => result.current.onKeyDown(makeKeyboardEvent('End')));
    expect(result.current.focusedIndexRef.current).toBe(4);
    act(() => result.current.onKeyDown(makeKeyboardEvent('Home')));
    expect(result.current.focusedIndexRef.current).toBe(0);
  });

  it('does not move past the bounds', () => {
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 5, columns: 2 }));
    act(() => result.current.onKeyDown(makeKeyboardEvent('End')));
    const ev = makeKeyboardEvent('ArrowRight');
    act(() => result.current.onKeyDown(ev));
    expect(result.current.focusedIndexRef.current).toBe(4);
  });

  it('activates the current item on Enter and Space', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 5, columns: 2, onActivate }));
    act(() => result.current.onKeyDown(makeKeyboardEvent('Enter')));
    expect(onActivate).toHaveBeenCalledWith(0);
    act(() => result.current.onKeyDown(makeKeyboardEvent(' ')));
    expect(onActivate).toHaveBeenCalledWith(0);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated keys', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useArrowKeyNav({ itemCount: 5, columns: 2, onActivate }));
    const ev = makeKeyboardEvent('a');
    act(() => result.current.onKeyDown(ev));
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('clamps the focus index when the list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useArrowKeyNav({ itemCount: count, columns: 2 }),
      {
        initialProps: { count: 10 },
      },
    );
    act(() => result.current.onKeyDown(makeKeyboardEvent('End')));
    expect(result.current.focusedIndexRef.current).toBe(9);
    rerender({ count: 3 });
    expect(result.current.focusedIndexRef.current).toBe(2);
  });
});
