import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { cn } from '@/lib/cn';
import { emulatorService } from '../services';
import type { PlayerStatus, SaveSlot } from '../types';
import { NoEmulatorOverlay } from './NoEmulatorOverlay';
import { SlotPickerDialog } from './SlotPickerDialog';
import type { SaveStateInfo } from '../types';

type GameWindowProps = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  status: PlayerStatus;
  crtFilter: boolean;
  title: string;
  backdropUrl?: string;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
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
  onReset,
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
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'save' | 'load' | null>(null);
  const isDraggingRef = useRef(false);
  const volumeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!volumeOpen) return;
    const handleDown = (e: PointerEvent) => {
      if (isDraggingRef.current) return;
      const el = volumeRef.current;
      if (el && !el.contains(e.target as Node)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleDown);
    return () => document.removeEventListener('pointerdown', handleDown);
  }, [volumeOpen]);

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

  const volIcon = volume === 0 ? 'volume_off' : volume < 50 ? 'volume_down' : 'volume_up';

  return (
    <main className="flex-[3] flex justify-center items-center relative bg-black/20 rounded-xl overflow-hidden border border-white/5">
      <div
        ref={containerRef}
        className="relative bg-black shadow-2xl overflow-hidden flex items-center justify-center"
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

        <div
          className={cn(
            'crt-overlay absolute inset-0 z-10 transition-opacity duration-300',
            crtFilter ? 'opacity-40' : 'opacity-0',
          )}
          aria-hidden="true"
        />

        {/* Top-right: play/pause + fullscreen */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={canControl ? (isPlaying ? onPause : onPlay) : undefined}
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
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-primary border border-white/10 hover:bg-black/60 transition-all active:scale-95 shadow-lg"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        </div>

        {/* Bottom-left: system commands (icon-only) */}
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={canControl ? onReset : undefined}
            disabled={!canControl || isSaveBusy}
            aria-label="Reset game"
            title="Reset"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-all active:scale-95 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              restart_alt
            </span>
          </button>
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
          ref={volumeRef}
          className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1"
        >
          {volumeOpen && (
            <div
              className="bg-black/70 backdrop-blur-md border border-white/10 rounded-lg px-2 py-3 flex flex-col items-center gap-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] font-bold text-primary tabular-nums">{volume}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onPointerDown={() => {
                  isDraggingRef.current = true;
                }}
                onPointerUp={() => {
                  isDraggingRef.current = false;
                }}
                onInput={(e) => onVolumeChange(Number((e.target as HTMLInputElement).value))}
                className="console-range console-range-vertical w-5 h-32 cursor-pointer"
                style={{ ['--vol' as string]: `${volume}%` }}
                aria-label="Master audio volume"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setVolumeOpen((v) => !v)}
            aria-label="Volume"
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center border transition-all active:scale-95 shadow-lg',
              volumeOpen
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-black/40 backdrop-blur-md text-white/60 border-white/10 hover:bg-black/60 hover:text-white',
            )}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {volIcon}
            </span>
          </button>
        </div>

        {pickerMode && (
          <SlotPickerDialog
            open
            mode={pickerMode}
            saves={saves}
            onSelect={(slot) => (pickerMode === 'save' ? onSave(slot) : onLoad(slot))}
            onClose={() => setPickerMode(null)}
          />
        )}
      </div>
    </main>
  );
}
