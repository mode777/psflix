import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { fileUrl } from '@/lib/pb-files';
import { showToast } from '@/lib/toast';
import { useEmulator } from '@/features/console/hooks/useEmulator';
import { useConsoleSettings } from '@/features/console/hooks/useConsoleSettings';
import { useSaveStates, useSaveStateMutation } from '@/features/console/hooks/useSaveStates';
import { GameWindow } from '@/features/console/components/GameWindow';
import { DiscSelector } from '@/features/console/components/DiscSelector';
import { ControllerPortSelector } from '@/features/console/components/ControllerPortSelector';
import { ConsoleMenu } from '@/features/console/components/ConsoleMenu';
import { SlotPickerDialog } from '@/features/console/components/SlotPickerDialog';
import { MemoryManagerDialog } from '@/features/console/components/memory/MemoryManagerDialog';
import { ConsoleSkeleton } from '@/features/console/components/ConsoleSkeleton';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { useState } from 'react';
import type { SaveSlot } from '@/features/console/types';
import { SAVE_SLOTS } from '@/features/console/types';
import { emulatorService } from '@/features/console/services';

const VALID_SLOTS = new Set<string>(SAVE_SLOTS.map((s) => s.value));

/** Parses the `?resume=<slot>` query param into a validated slot, or null. */
function parseResumeSlot(raw: string | null): SaveSlot | null {
  if (!raw) return null;
  if (raw === '1') return 'auto';
  return VALID_SLOTS.has(raw) ? (raw as SaveSlot) : null;
}

/**
 * Parses the `?disc=<n>` query param (1-based disc position). Defaults to 1
 * when absent/invalid; clamping to the actual disc count happens in
 * `useEmulator`, where the discs array is available.
 */
function parseDiscNumber(raw: string | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export default function ConsoleView() {
  const { firstDiscSerial } = useParams<{ firstDiscSerial: string }>();
  const [searchParams] = useSearchParams();
  const resumeSlot = parseResumeSlot(searchParams.get('resume'));
  const discNumber = parseDiscNumber(searchParams.get('disc'));
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const emulator = useEmulator(firstDiscSerial, resumeSlot, discNumber, canvasRef);
  const settings = useConsoleSettings();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fatalMsg = emulatorService.getFatal();

  const savesQuery = useSaveStates(emulator.activeDisc?.id, emulator.user?.id);
  const { save, load, remove } = useSaveStateMutation(emulator.activeDisc?.id, emulator.user?.id);
  const saves = savesQuery.data ?? [];
  const isSaveBusy = save.isPending || load.isPending || remove.isPending;

  // Save to the 'auto' slot when leaving the console via an in-app navigation
  // (header links, browser back, the Back buttons below). `useBlocker` lets us
  // await the async save *before* the unmount tears the emulator core down —
  // an unmount cleanup can't reliably await, and destroy() kills the worker
  // mid-save. Tab/window close (`pagehide`) is covered separately in
  // useEmulator. Only block when a session is actually live (playing/paused)
  // and the destination is a different route (query-param changes like disc
  // swaps stay on the same pathname and must not be blocked).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (emulator.runtime.status === 'playing' || emulator.runtime.status === 'paused'),
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const disc = emulator.activeDisc;
    if (!disc) {
      blocker.proceed();
      return;
    }
    let cancelled = false;
    emulatorService
      .saveState('auto', disc.id, emulator.user?.id ?? '')
      .then(() => {
        if (cancelled) return;
        showToast('Progress saved.', { kind: 'info' });
        blocker.proceed();
      })
      .catch(() => {
        if (cancelled) return;
        showToast('Could not save progress before leaving.');
        blocker.proceed();
      });
    return () => {
      cancelled = true;
    };
  }, [blocker, emulator.activeDisc, emulator.user]);

  const handleSave = (slot: SaveSlot) => {
    save.mutate(slot, {
      onSuccess: () => showToast(`Progress saved to ${slot}.`, { kind: 'info' }),
      onError: () => showToast('Could not save state.'),
    });
  };

  const handleLoad = (slot: SaveSlot) => {
    load.mutate(slot, {
      onSuccess: () => showToast(`Restored from ${slot}.`, { kind: 'info' }),
      onError: () => showToast('Could not load state.'),
    });
  };

  const handleDelete = (slot: SaveSlot) => {
    remove.mutate(slot, {
      onSuccess: () => showToast(`Cleared ${slot}.`, { kind: 'info' }),
      onError: () => showToast('Could not delete state.'),
    });
  };

  if (emulator.isLoading || !emulator.game) return <ConsoleSkeleton />;
  if (emulator.isError) {
    return (
      <main className="pt-32 px-margin-mobile md:px-margin-desktop text-center">
        <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">
          Couldn&apos;t load this game
        </h1>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-block mt-6 px-6 py-2 rounded-lg bg-primary text-on-primary"
        >
          Back to browse
        </button>
      </main>
    );
  }

  const { game, activeDisc, discs, runtime } = emulator;
  const releaseYear = game.release ? game.release.slice(0, 4) : '';
  const byline = [game.developer, releaseYear].filter(Boolean).join(' • ');
  const firstScreenshot = game.screenshots?.[0];
  const backdropFile = firstScreenshot ?? game.cover_image;
  const backdropUrl = backdropFile
    ? fileUrl({ collectionId: game.collectionId, id: game.id }, backdropFile)
    : undefined;

  return (
    <>
      <Helmet>
        <title>{`${game.title} (Playing) | PSflix`}</title>
      </Helmet>

      <main className="flex flex-col h-[calc(100vh-5rem)] mt-20 px-margin-mobile md:px-margin-desktop pt-6 pb-6 gap-6 max-w-container-max mx-auto">
        <header className="flex justify-between items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-white truncate">{game.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              {byline && (
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-semibold">
                  {byline}
                </p>
              )}
              <FavoriteButton
                gameId={game.id}
                className="rounded-full bg-black/40 backdrop-blur-md p-1 w-7 h-7"
                iconClassName="text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ControllerPortSelector port={1} />
            <ControllerPortSelector port={2} />
            <DiscSelector discs={discs} activeDisc={activeDisc} onChange={emulator.switchDisc} />
            <ConsoleMenu
              onMemory={() => setMemoryOpen(true)}
              onReset={emulator.reset}
              onDeleteState={() => setDeleteOpen(true)}
              isAuthenticated={isAuthenticated}
              isSaveBusy={isSaveBusy}
              hasSaves={saves.length > 0}
              canReset={runtime.status !== 'idle' && runtime.status !== 'loading'}
            />
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
          <GameWindow
            canvasRef={canvasRef}
            status={runtime.status}
            crtFilter={settings.crtFilter}
            title={game.title}
            backdropUrl={backdropUrl}
            onPlay={emulator.play}
            onPause={emulator.pause}
            isAuthenticated={isAuthenticated}
            isSaveBusy={isSaveBusy}
            saves={saves}
            onSave={handleSave}
            onLoad={handleLoad}
            volume={settings.masterVolume}
            onVolumeChange={(v) => emulatorService.setSettings({ masterVolume: v })}
          />
          {fatalMsg && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm">
              <p className="text-white/80 text-sm text-center max-w-md px-6">{fatalMsg}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/game/${firstDiscSerial}`)}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white/80 text-xs font-bold uppercase hover:bg-white/20 transition-colors"
                >
                  Back to details
                </button>
                <button
                  type="button"
                  onClick={() =>
                    emulatorService.reset().catch(() => navigate(`/game/${firstDiscSerial}`))
                  }
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold uppercase hover:opacity-90 transition-opacity"
                >
                  Reload console
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <MemoryManagerDialog open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      {deleteOpen && (
        <SlotPickerDialog
          open
          mode="delete"
          saves={saves}
          onSelect={(slot) => {
            handleDelete(slot);
            setDeleteOpen(false);
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}
