import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGame } from '@/features/games/useGame';
import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/lib/toast';
import { emulatorService } from '../services';
import { useRuntime } from './useRuntime';
import type { DiscsResponse } from '@/types/pocketbase';

function sortByIndex(discs: DiscsResponse[]): DiscsResponse[] {
  return [...discs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/**
 * Orchestrates the console session for a game: attaches the canvas + boots the
 * emulator core, (when `resume` is set) restores the latest autosave, then
 * loads the first disc. Exposes runtime state + lifecycle callbacks.
 *
 * The canvas ref is owned by ConsoleView and shared with GameWindow so the
 * boot order (attach → resume → loadDisc) runs as one sequenced async chain,
 * avoiding races between sibling effects.
 */
export function useEmulator(
  firstDiscSerial: string | undefined,
  resume: boolean,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
) {
  const gameQuery = useGame(firstDiscSerial);
  const runtime = useRuntime();
  const user = useAuthStore((s) => s.user);
  const bootedRef = useRef(false);

  const discs = sortByIndex(gameQuery.data?.expand?.discs_via_game ?? []);
  const activeDisc = discs.find((d) => d.id === runtime.currentDiscId) ?? discs[0] ?? null;

  useEffect(() => {
    if (bootedRef.current || !gameQuery.data || discs.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    bootedRef.current = true;
    emulatorService.destroy();
    const initial = discs[0];

    void (async () => {
      try {
        await emulatorService.attachCanvas(canvas);
      } catch (err) {
        console.error('Emulator bootstrap failed:', err);
        showToast('Could not start the emulator core.', { kind: 'error' });
        return;
      }
      if (resume && user) {
        try {
          await emulatorService.loadState('auto', initial.id, user.id);
        } catch {
          showToast('No saved progress found — starting a fresh session.', { kind: 'info' });
        }
      }
      await emulatorService.loadDisc(initial);
    })();
  }, [gameQuery.data, discs, resume, user, canvasRef]);

  const switchDisc = useCallback((disc: DiscsResponse) => {
    emulatorService.swapDisc(disc).catch((err) => {
      console.error('switchDisc failed:', err);
      showToast('Could not switch discs.', { kind: 'error' });
    });
  }, []);

  const play = useCallback(() => {
    emulatorService.play().catch((err) => {
      console.error('play failed:', err);
      showToast('Could not start playback.', { kind: 'error' });
    });
  }, []);

  const pause = useCallback(() => emulatorService.pause(), []);

  const reset = useCallback(() => {
    emulatorService.reset().catch((err) => {
      console.error('reset failed:', err);
      showToast('Could not reset the console.', { kind: 'error' });
    });
  }, []);

  return {
    game: gameQuery.data,
    isLoading: gameQuery.isLoading,
    isError: gameQuery.isError,
    discs,
    activeDisc,
    runtime,
    user,
    switchDisc,
    play,
    pause,
    reset,
  };
}
