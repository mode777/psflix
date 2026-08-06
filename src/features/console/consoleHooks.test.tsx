import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useMemorySlotAssignment } from './hooks/useMemorySlotAssignment';
import { useConsoleSettings } from './hooks/useConsoleSettings';
import { useControllerPorts } from './hooks/useControllerPorts';
import { useRuntime } from './hooks/useRuntime';

function Probe({ id, hook }: { id: string; hook: () => unknown }) {
  const value = hook();
  return <div data-testid={id}>{JSON.stringify(value)}</div>;
}

describe('console sync hooks', () => {
  // Regression: getSnapshot must return a referentially-stable value, otherwise
  // useSyncExternalStore loops ("Maximum update depth exceeded"). The slot
  // assignment default used to be an inline object literal — new every call.
  it('useMemorySlotAssignment renders without infinite loop', () => {
    const { getByTestId } = render(
      <Probe id="slots" hook={() => useMemorySlotAssignment('user-1')} />,
    );
    expect(getByTestId('slots').textContent).toContain('slot1');
  });

  it('useMemorySlotAssignment is stable across re-renders for the same user', () => {
    let snapshots = 0;
    let last: unknown = null;
    const Counting = () => {
      const v = useMemorySlotAssignment('user-2');
      if (v !== last) {
        last = v;
        snapshots += 1;
      }
      return null;
    };
    const { rerender } = render(<Counting />);
    rerender(<Counting />);
    rerender(<Counting />);
    expect(snapshots).toBe(1);
  });

  it('useConsoleSettings renders without infinite loop', () => {
    const { getByTestId } = render(<Probe id="settings" hook={useConsoleSettings} />);
    expect(getByTestId('settings').textContent).toContain('crtFilter');
  });

  it('useControllerPorts renders without infinite loop', () => {
    const { getByTestId } = render(<Probe id="ports" hook={useControllerPorts} />);
    expect(getByTestId('ports').textContent).toContain('port1');
  });

  it('useRuntime renders without infinite loop', () => {
    const { getByTestId } = render(<Probe id="runtime" hook={useRuntime} />);
    expect(getByTestId('runtime').textContent).toContain('status');
  });
});
