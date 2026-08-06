import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGame } from '@/features/games/useGame';
import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/lib/toast';
import { emulatorService } from '../services';
import { useRuntime } from './useRuntime';
import type { DiscsResponse, GamesRegionOptions } from '@/types/pocketbase';

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
 *
 * The boot effect keys off a stable `hasData` boolean (not the raw query data
 * or the `discs` array, whose identities change every render / on refetch);
 * that way the effect runs exactly once per mount and the `cancelled` flag
 * only trips on real unmount — not on every parent re-render.
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

  const discs = useMemo(
    () => sortByIndex(gameQuery.data?.expand?.discs_via_game ?? []),
    [gameQuery.data],
  );
  const activeDisc = discs.find((d) => d.id === runtime.currentDiscId) ?? discs[0] ?? null;

  // The boot IIFE needs the values that are live *when data arrives*, but the
  // effect must run exactly once per mount. Capture them in refs so the effect
  // can key off a stable `hasData` boolean without re-triggering on every
  // parent re-render or react-query refetch (which would otherwise flip
  // `cancelled = true` and strand the session on `idle`).
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const userRef = useRef(user);
  userRef.current = user;
  const regionRef = useRef<GamesRegionOptions | undefined>(undefined);
  regionRef.current = (gameQuery.data?.region as GamesRegionOptions | undefined) ?? undefined;
  const initialDiscRef = useRef<DiscsResponse | null>(null);
  if (!initialDiscRef.current && discs.length > 0) initialDiscRef.current = discs[0];

  const hasData = !!gameQuery.data && discs.length > 0;

  useEffect(() => {
    if (bootedRef.current || !hasData) return;
    const canvas = canvasRef.current;
    const initial = initialDiscRef.current;
    if (!canvas || !initial) return;
    bootedRef.current = true;
    emulatorService.destroy();
    const resumeNow = resumeRef.current;
    const userNow = userRef.current;
    let cancelled = false;

    void (async () => {
      try {
        await emulatorService.attachCanvas(canvas);
      } catch (err) {
        console.error('Emulator bootstrap failed:', err);
        if (!cancelled) showToast('Could not start the emulator core.', { kind: 'error' });
        return;
      }
      if (cancelled) return;
      if (resumeNow && userNow) {
        try {
          await emulatorService.loadState('auto', initial.id, userNow.id);
        } catch {
          showToast('No saved progress found — starting a fresh session.', { kind: 'info' });
        }
      }
      if (cancelled) return;
      await emulatorService.loadDisc(initial, regionRef.current);
    })();

    return () => {
      cancelled = true;
    };
    // Boot inputs come from refs; only `hasData` flips the effect on/off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  // Tear down the live emulator session when leaving the console view.
  // Empty-deps so this only fires on real unmount (and the dev StrictMode
  // re-mount); the boot guard is reset so a return visit re-attaches cleanly.
  useEffect(() => {
    return () => {
      bootedRef.current = false;
      emulatorService.destroy();
    };
  }, []);

  const switchDisc = useCallback((disc: DiscsResponse) => {
    emulatorService.swapDisc(disc, regionRef.current).catch((err) => {
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
