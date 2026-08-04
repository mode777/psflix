import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { DiscsResponse } from '@/types/pocketbase';

type DiscSelectorProps = {
  discs: DiscsResponse[];
  activeDisc: DiscsResponse | null;
  onChange: (disc: DiscsResponse) => void;
};

export function DiscSelector({ discs, activeDisc, onChange }: DiscSelectorProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (discs.length === 0 || !activeDisc) return null;
  const activeLabel = `Disc ${activeDisc.index ?? 1}`;
  const isMulti = discs.length > 1;

  return (
    <div className="flex items-center gap-1">
      <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full flex items-center gap-2">
        <span
          className="material-symbols-outlined text-sm text-green-400"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          album
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {activeLabel}
        </span>
      </div>

      {isMulti && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="ml-1 p-1 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">
              Change
            </span>
            <span className="material-symbols-outlined text-lg text-white/40">expand_more</span>
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2 z-50 glass-panel rounded-xl border border-white/10 py-1 min-w-[180px] shadow-2xl"
            >
              {discs.map((disc) => {
                const label = `Disc ${disc.index ?? 1}`;
                const isActive = disc.id === activeDisc.id;
                return (
                  <button
                    key={disc.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      onChange(disc);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-4 py-2 flex items-center justify-between gap-3 text-xs',
                      'hover:bg-white/10 transition-colors',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-base"
                        style={{ fontVariationSettings: "'FILL' 1", opacity: isActive ? 1 : 0 }}
                        aria-hidden="true"
                      >
                        check_circle
                      </span>
                      <span
                        className={cn(
                          'font-semibold',
                          isActive ? 'text-white' : 'text-on-surface-variant',
                        )}
                      >
                        {label}
                      </span>
                    </span>
                    <span className="text-[10px] text-white/30 font-mono">{disc.serial}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
