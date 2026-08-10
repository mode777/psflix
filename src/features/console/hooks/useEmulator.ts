import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGame } from '@/features/games/useGame';
import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/lib/toast';
import { emulatorService } from '../services';
import { useRuntime } from './useRuntime';
import type { DiscsResponse, GamesRegionOptions } from '@/types/pocketbase';
import type { SaveSlot } from '../types';

function sortByIndex(discs: DiscsResponse[]): DiscsResponse[] {
  return [...discs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/**
 * Orchestrates the console session for a game: attaches the canvas + boots the
 * emulator core, loads the requested disc (1-based `discNumber`, default Disc
 * 1), then (when `resumeSlot` is set) restores the requested save slot.
 * Exposes runtime state + lifecycle callbacks.
 *
 * The canvas ref is owned by ConsoleView and shared with GameWindow so the
 * boot order (attach → loadDisc → resume) runs as one sequenced async chain,
 * avoiding races between sibling effects.
 *
 * The boot effect keys off a stable `hasData` boolean (not the raw query data
 * or the `discs` array, whose identities change every render / on refetch);
 * that way the effect runs exactly once per mount and the `cancelled` flag
 * only trips on real unmount — not on every parent re-render.
 */
export function useEmulator(
  firstDiscSerial: string | undefined,
  resumeSlot: SaveSlot | null,
  discNumber: number,
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
  // Clamp the requested 1-based disc number to the available discs. Stable for
  // the session (URL-derived); used both as the initial disc to boot and as the
  // activeDisc fallback until the runtime reports the loaded disc id.
  const targetIndex =
    discs.length > 0 ? Math.min(Math.max(discNumber - 1, 0), discs.length - 1) : 0;
  const activeDisc =
    discs.find((d) => d.id === runtime.currentDiscId) ?? discs[targetIndex] ?? null;

  // The boot IIFE needs the values that are live *when data arrives*, but the
  // effect must run exactly once per mount. Capture them in refs so the effect
  // can key off a stable `hasData` boolean without re-triggering on every
  // parent re-render or react-query refetch (which would otherwise flip
  // `cancelled = true` and strand the session on `idle`).
  const resumeSlotRef = useRef(resumeSlot);
  resumeSlotRef.current = resumeSlot;
  const userRef = useRef(user);
  userRef.current = user;
  const regionRef = useRef<GamesRegionOptions | undefined>(undefined);
  regionRef.current = (gameQuery.data?.region as GamesRegionOptions | undefined) ?? undefined;
  const initialDiscRef = useRef<DiscsResponse | null>(null);
  if (!initialDiscRef.current && discs.length > 0) {
    initialDiscRef.current = discs[targetIndex] ?? discs[0];
  }

  const hasData = !!gameQuery.data && discs.length > 0;

  useEffect(() => {
    if (bootedRef.current || !hasData) return;
    const canvas = canvasRef.current;
    const initial = initialDiscRef.current;
    if (!canvas || !initial) return;
    bootedRef.current = true;
    emulatorService.destroy();
    const resumeSlotNow = resumeSlotRef.current;
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
      // The disc must be loaded before a save state can be applied:
      // loadDisc sets the vendored client's `_currentDiscSerial` (which keys
      // the IDB/cloud save lookup) and runs `retro_load_game` (which sets up
      // the memory map `retro_unserialize` restores into). Calling loadState
      // before this silently no-ops, so the resume would never take effect.
      await emulatorService.loadDisc(initial, regionRef.current);
      if (cancelled) return;
      if (resumeSlotNow && userNow) {
        try {
          await emulatorService.loadState(resumeSlotNow, initial.id, userNow.id);
        } catch {
          showToast('No saved progress found — starting a fresh session.', { kind: 'info' });
        }
      }
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

  // On tab/window close, write a final autosave to the 'auto' slot. The
  // vendored EmulatorClient already saves on `pagehide` while *playing*, but
  // its tick gates on `_isRunning` and skips paused sessions — this covers
  // the paused gap. SPA route changes do NOT fire `pagehide`, so this never
  // races the `useBlocker` save-on-navigate in ConsoleView.
  useEffect(() => {
    const onPageHide = () => {
      const { status } = emulatorService.getRuntime();
      if (status !== 'playing' && status !== 'paused') return;
      const disc = initialDiscRef.current;
      const user = userRef.current;
      if (!disc) return;
      // Fire-and-forget: the document is unloading, await is not reliable.
      void emulatorService.saveState('auto', disc.id, user?.id ?? '');
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
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
