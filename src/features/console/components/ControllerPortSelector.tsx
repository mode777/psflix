import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { emulatorService } from '../services';
import { useControllerPorts } from '../hooks/useControllerPorts';
import { CONTROLLER_TYPES } from '../types';
import type { ControllerType } from '../types';

type ControllerPortSelectorProps = {
  port: 1 | 2;
};

const SHORT_LABEL: Record<ControllerType, string> = {
  none: 'Empty',
  standard: 'Standard Pad',
  dualshock: 'Dual-Shock',
  mouse: 'PS Mouse',
};

export function ControllerPortSelector({ port }: ControllerPortSelectorProps) {
  const ports = useControllerPorts();
  const value = port === 1 ? ports.port1 : ports.port2;
  const allowEmpty = port === 2;

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

  const options: { value: ControllerType; label: string }[] = [
    ...(allowEmpty ? [{ value: 'none' as const, label: 'Empty' }] : []),
    ...CONTROLLER_TYPES,
  ];

  const trigger = (
    <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full flex items-center gap-2">
      <span
        className="material-symbols-outlined text-sm text-primary"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        videogame_asset
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        P{port}
      </span>
      <span className="text-[10px] text-white/60">{SHORT_LABEL[value]}</span>
      <span className="material-symbols-outlined text-base text-white/40">expand_more</span>
    </div>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Controller port ${port}`}
        className="cursor-pointer"
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 z-50 glass-panel rounded-xl border border-white/10 py-1 min-w-[180px] shadow-2xl"
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  emulatorService.setController(port, opt.value);
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
                    {opt.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
