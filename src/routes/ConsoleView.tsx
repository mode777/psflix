import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useRef } from 'react';
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
import { MemoryManagerDialog } from '@/features/console/components/memory/MemoryManagerDialog';
import { ConsoleSkeleton } from '@/features/console/components/ConsoleSkeleton';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { useState } from 'react';
import type { SaveSlot } from '@/features/console/types';
import { emulatorService } from '@/features/console/services';

export default function ConsoleView() {
  const { firstDiscSerial } = useParams<{ firstDiscSerial: string }>();
  const [searchParams] = useSearchParams();
  const resume = searchParams.get('resume') === '1';
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const emulator = useEmulator(firstDiscSerial, resume, canvasRef);
  const settings = useConsoleSettings();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const fatalMsg = emulatorService.getFatal();

  const savesQuery = useSaveStates(emulator.activeDisc?.id, emulator.user?.id);
  const { save, load, remove } = useSaveStateMutation(emulator.activeDisc?.id, emulator.user?.id);
  const saves = savesQuery.data ?? [];
  const isSaveBusy = save.isPending || load.isPending || remove.isPending;

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
            <ConsoleMenu onMemory={() => setMemoryOpen(true)} />
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
            onReset={emulator.reset}
            isAuthenticated={isAuthenticated}
            isSaveBusy={isSaveBusy}
            saves={saves}
            onSave={handleSave}
            onLoad={handleLoad}
            onDelete={handleDelete}
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
    </>
  );
}
