import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type VolumeControlProps = {
  volume: number;
  onChange: (v: number) => void;
};

const TRACK_HEIGHT = 120;

export function VolumeControl({ volume, onChange }: VolumeControlProps) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const getVolumeFromY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return volume;
      const rect = track.getBoundingClientRect();
      const fraction = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      return Math.round(fraction * 100);
    },
    [volume],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onChange(getVolumeFromY(e.clientY));
    },
    [getVolumeFromY, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      onChange(getVolumeFromY(e.clientY));
    },
    [dragging, getVolumeFromY, onChange],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const volIcon = volume === 0 ? 'volume_off' : volume < 50 ? 'volume_down' : 'volume_up';
  const thumbOffset = `calc(${volume}% - 7px)`;

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-lg px-3 py-3 flex flex-col items-center gap-2 shadow-2xl">
          <div
            ref={trackRef}
            className="relative w-1.5 rounded-full bg-white/10 cursor-pointer select-none"
            style={{ height: TRACK_HEIGHT }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="absolute bottom-0 left-0 w-full rounded-full bg-primary pointer-events-none"
              style={{ height: `${volume}%` }}
            />
            <div
              className="absolute left-1/2 w-3.5 h-3.5 rounded-full bg-primary -translate-x-1/2 shadow-lg pointer-events-none"
              style={{ bottom: thumbOffset }}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Volume"
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center border transition-all active:scale-95 shadow-lg',
          open
            ? 'bg-primary/20 text-primary border-primary/40'
            : 'bg-black/40 backdrop-blur-md text-white/60 border-white/10 hover:bg-black/60 hover:text-white',
        )}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          {volIcon}
        </span>
      </button>
    </div>
  );
}
