import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useConsoleSettings } from './hooks/useConsoleSettings';
import { useControllerPorts } from './hooks/useControllerPorts';
import { useFastForwardMode } from './hooks/useFastForwardMode';
import { useRuntime } from './hooks/useRuntime';

function Probe({ id, hook }: { id: string; hook: () => unknown }) {
  const value = hook();
  return <div data-testid={id}>{JSON.stringify(value)}</div>;
}

describe('console sync hooks', () => {
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

  it('useFastForwardMode renders without infinite loop', () => {
    const { getByTestId } = render(<Probe id="ff" hook={useFastForwardMode} />);
    expect(getByTestId('ff').textContent).toContain('1x');
  });
});
