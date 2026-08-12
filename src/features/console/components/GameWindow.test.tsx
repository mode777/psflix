import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameWindow } from './GameWindow';
import type { FastForwardMode } from '../types';

function renderWindow(mode: FastForwardMode, status: 'paused' | 'loading' = 'paused') {
  const onCycleFastForward = vi.fn();
  render(
    <GameWindow
      canvasRef={{ current: document.createElement('canvas') }}
      status={status}
      crtFilter={true}
      fastForwardMode={mode}
      title="Test Game"
      onPlay={vi.fn()}
      onPause={vi.fn()}
      onCycleFastForward={onCycleFastForward}
      started={true}
      onStart={vi.fn()}
      isAuthenticated={false}
      isSaveBusy={false}
      saves={[]}
      onSave={vi.fn()}
      onLoad={vi.fn()}
      volume={85}
      onVolumeChange={vi.fn()}
    />,
  );
  return { onCycleFastForward };
}

describe('GameWindow fast-forward control', () => {
  it('renders the mode button next to save/load controls even when unauthenticated', () => {
    renderWindow('1x');
    expect(screen.getByRole('button', { name: /Fast-forward mode 1x/i })).toBeTruthy();
  });

  it('invokes cycle callback when clicked while controls are active', () => {
    const { onCycleFastForward } = renderWindow('2x');
    fireEvent.click(screen.getByRole('button', { name: /Fast-forward mode 2x/i }));
    expect(onCycleFastForward).toHaveBeenCalledTimes(1);
  });

  it('disables mode button while loading', () => {
    renderWindow('2x', 'loading');
    expect(screen.getByRole('button', { name: /Fast-forward mode 2x/i })).toBeDisabled();
  });
});
