import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { cn } from '@/lib/cn';
import { emulatorService } from '../services';
import { useSyncStatus } from '../hooks/useSyncStatus';
import type { PlayerStatus, SaveSlot, SyncStatus } from '../types';
import { NoEmulatorOverlay } from './NoEmulatorOverlay';
import { SlotPickerDialog } from './SlotPickerDialog';
import { VolumeControl } from './VolumeControl';
import type { SaveStateInfo } from '../types';

type GameWindowProps = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  status: PlayerStatus;
  crtFilter: boolean;
  title: string;
  backdropUrl?: string;
  onPlay: () => void;
  onPause: () => void;
  /** True once the player has pressed Play (large overlay or top-right button). */
  started: boolean;
  onStart: () => void;
  isAuthenticated: boolean;
  isSaveBusy: boolean;
  saves: SaveStateInfo[];
  onSave: (slot: SaveSlot) => void;
  onLoad: (slot: SaveSlot) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
};

export function GameWindow({
  canvasRef,
  status,
  crtFilter,
  title,
  backdropUrl,
  onPlay,
  onPause,
  started,
  onStart,
  isAuthenticated,
  isSaveBusy,
  saves,
  onSave,
  onLoad,
  volume,
  onVolumeChange,
}: GameWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'save' | 'load' | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const syncStatus = useSyncStatus();

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setControlsVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      return;
    }

    const showControls = () => {
      setControlsVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };

    showControls();
    document.addEventListener('mousemove', showControls);
    return () => {
      document.removeEventListener('mousemove', showControls);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isFullscreen]);

  // Keep the shared canvas ref pointed at the live node: the facade replaces
  // the canvas element directly via replaceWith() on reset(), so React's ref
  // would otherwise point at a detached node. Sync on every store change
  // (the store bumps canvasGen when the canvas is swapped).
  useEffect(() => {
    return emulatorService.subscribeRuntime(() => {
      const live = emulatorService.getCanvas();
      if (live && canvasRef.current !== live) canvasRef.current = live;
    });
  }, [canvasRef]);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen().catch(() => {});
    }
  };

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';
  const isIdle = status === 'idle';
  const canControl = !isIdle && !isLoading;

  // Before the first Play gesture the player sits paused on the disc's first
  // frame; surface a prominent centered Start button (the AudioContext must
  // resume inside a user gesture, so playback can't be auto-started from the
  // boot chain). Once started, the usual top-right controls take over for the
  // rest of the session (the flag survives pause/reset and only clears on
  // unmount).
  const handlePlay = () => {
    onStart();
    onPlay();
  };
  const showStartOverlay = !started && status === 'paused';

  return (
    <main className="flex-[3] flex justify-center items-center relative bg-black/20 rounded-xl overflow-hidden border border-white/5">
      <div
        ref={containerRef}
        className="game-window-container relative bg-black shadow-2xl overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: '4 / 3', maxWidth: '100%', maxHeight: '100%' }}
      >
        {/*
          Live emulator canvas. Stable React key + no identity-changing props so
          React never re-creates it — the facade mutates this node directly on
          reset() (cloneNode + replaceWith) and we re-bind the ref afterwards.
        */}
        <canvas
          key="emulator-canvas"
          ref={canvasRef}
          className="block w-full h-full"
          tabIndex={0}
          aria-label={`${title} emulator display`}
        />

        {isIdle && (
          <div className="absolute inset-0 z-0">
            <NoEmulatorOverlay title={title} backdropUrl={backdropUrl} />
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-white/70">
              <span
                className="material-symbols-outlined animate-spin"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                progress_activity
              </span>
              <span className="text-xs font-bold uppercase tracking-widest">Loading disc</span>
            </div>
          </div>
        )}

        {showStartOverlay && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Start game"
            className="group absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 cursor-pointer"
          >
            <span
              className={cn(
                'flex h-24 w-24 items-center justify-center rounded-full shadow-2xl',
                'bg-gradient-to-br from-inverse-primary to-secondary-container',
                'transition-transform duration-300 group-hover:scale-110 group-active:scale-95',
                'ring-4 ring-white/10',
              )}
            >
              <span
                className="material-symbols-outlined text-5xl text-white"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                play_arrow
              </span>
            </span>
            <span className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest border border-white/10">
              Play
            </span>
          </button>
        )}

        <div
          className={cn(
            'crt-overlay absolute inset-0 z-10 transition-opacity duration-300',
            crtFilter ? 'opacity-40' : 'opacity-0',
          )}
          aria-hidden="true"
        />

        {/* Top-right: play/pause + fullscreen */}
        <div
          className={cn(
            'absolute top-3 right-3 z-30 flex items-center gap-2 transition-opacity duration-500',
            isFullscreen && !controlsVisible && 'opacity-0 pointer-events-none',
          )}
        >
          {isAuthenticated && <SyncChip status={syncStatus} />}
          <button
            type="button"
            onClick={canControl ? (isPlaying ? onPause : handlePlay) : undefined}
            disabled={!canControl}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isPlaying
                ? 'bg-primary text-on-primary'
                : 'bg-black/40 backdrop-blur-md text-primary border border-white/10 hover:bg-black/60',
            )}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-primary border border-white/10 hover:bg-black/60 transition-all active:scale-95 shadow-lg"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        </div>

        {/* Bottom-left: system commands (icon-only) */}
        <div
          className={cn(
            'absolute bottom-3 left-3 z-30 flex items-center gap-2 transition-opacity duration-500',
            isFullscreen && !controlsVisible && 'opacity-0 pointer-events-none',
          )}
        >
          <button
            type="button"
            onClick={isAuthenticated ? () => setPickerMode('save') : undefined}
            disabled={!isAuthenticated || isSaveBusy}
            aria-label="Save state"
            title="Save"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-all active:scale-95 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {isAuthenticated ? 'save' : 'lock'}
            </span>
          </button>
          <button
            type="button"
            onClick={isAuthenticated ? () => setPickerMode('load') : undefined}
            disabled={!isAuthenticated || isSaveBusy || saves.length === 0}
            aria-label="Load state"
            title="Load"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-all active:scale-95 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {isAuthenticated ? 'file_open' : 'lock'}
            </span>
          </button>
        </div>

        {/* Bottom-right: volume */}
        <div
          className={cn(
            'absolute bottom-3 right-3 z-40 transition-opacity duration-500',
            isFullscreen && !controlsVisible && 'opacity-0 pointer-events-none',
          )}
        >
          <VolumeControl volume={volume} onChange={onVolumeChange} />
        </div>

        {pickerMode && (
          <SlotPickerDialog
            open
            mode={pickerMode}
            saves={saves}
            onSelect={(slot) => {
              if (pickerMode === 'save') onSave(slot);
              else onLoad(slot);
            }}
            onClose={() => setPickerMode(null)}
          />
        )}
      </div>
    </main>
  );
}

const SYNC_META: Record<SyncStatus, { icon: string; label: string; spin: boolean; tone: string }> =
  {
    idle: { icon: 'cloud_off', label: 'Local only', spin: false, tone: 'text-white/40' },
    syncing: { icon: 'restart_alt', label: 'Syncing…', spin: true, tone: 'text-primary' },
    synced: { icon: 'cloud_done', label: 'Synced', spin: false, tone: 'text-teal-300' },
    error: { icon: 'cloud_off', label: 'Sync failed', spin: false, tone: 'text-red-400' },
  };

function SyncChip({ status }: { status: SyncStatus }) {
  const meta = SYNC_META[status];
  return (
    <span
      title={meta.label}
      className="flex items-center gap-1 px-2 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
    >
      <span
        className={cn(
          'material-symbols-outlined text-base',
          meta.tone,
          meta.spin && 'animate-spin',
        )}
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      <span className={cn('text-[10px] font-bold uppercase tracking-widest', meta.tone)}>
        {meta.label}
      </span>
    </span>
  );
}
