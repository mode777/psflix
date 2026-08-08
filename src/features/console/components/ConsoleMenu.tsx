import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { emulatorService } from '../services';
import { useConsoleSettings } from '../hooks/useConsoleSettings';

type ConsoleMenuProps = {
  onMemory: () => void;
};

export function ConsoleMenu({ onMemory }: ConsoleMenuProps) {
  const settings = useConsoleSettings();
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Console options"
        className="px-3 py-1 bg-white/5 border border-white/10 rounded-full flex items-center cursor-pointer hover:bg-white/10 transition-colors"
      >
        <span className="material-symbols-outlined text-base text-white/60">more_vert</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 z-50 glass-panel rounded-xl border border-white/10 py-1 min-w-[200px] shadow-2xl"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={settings.crtFilter}
            onClick={() => emulatorService.setSettings({ crtFilter: !settings.crtFilter })}
            className={cn(
              'w-full text-left px-4 py-2 flex items-center gap-3 text-xs',
              'hover:bg-white/10 transition-colors',
            )}
          >
            <span className="material-symbols-outlined text-base text-white/60" aria-hidden="true">
              tv
            </span>
            <span className="flex-1 font-semibold text-on-surface-variant">CRT Filter</span>
            <span
              className="material-symbols-outlined text-base text-primary"
              style={{
                fontVariationSettings: "'FILL' 1",
                opacity: settings.crtFilter ? 1 : 0,
              }}
              aria-hidden="true"
            >
              check
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onMemory();
            }}
            className={cn(
              'w-full text-left px-4 py-2 flex items-center gap-3 text-xs',
              'hover:bg-white/10 transition-colors',
            )}
          >
            <span className="material-symbols-outlined text-base text-white/60" aria-hidden="true">
              sd_card
            </span>
            <span className="flex-1 font-semibold text-on-surface-variant">Memory Manager</span>
          </button>
        </div>
      )}
    </div>
  );
}
