import { cn } from '@/lib/cn';
import { PortManager } from './PortManager';
import { EnvironmentPanel } from './EnvironmentPanel';

type ControlsPanelProps = {
  userId?: string;
  isAuthenticated: boolean;
  onMemory: () => void;
  onOptions: () => void;
  onPowerOff: () => void;
};

export function ControlsPanel({
  userId,
  isAuthenticated,
  onMemory,
  onOptions,
  onPowerOff,
}: ControlsPanelProps) {
  return (
    <aside className="flex-1 w-96 flex flex-col gap-4 glass-panel p-4 rounded-xl border border-white/5 overflow-y-auto hide-scrollbar">
      <PortManager />
      <EnvironmentPanel userId={userId} />

      {!isAuthenticated && (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center">
          Sign in to save progress &amp; manage memory cards
        </p>
      )}

      <div className="mt-auto pt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={onMemory}
          className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/5 rounded text-white/60 text-xs font-bold uppercase hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            sd_card
          </span>
          Memory Manager
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onOptions}
            className="flex-1 py-3 bg-white/5 border border-white/5 rounded text-white/60 text-xs font-bold uppercase hover:bg-white/10 transition-colors"
          >
            Options
          </button>
          <button
            type="button"
            onClick={onPowerOff}
            className={cn(
              'flex-1 py-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded',
              'text-xs font-bold uppercase hover:bg-red-900/30 transition-colors',
            )}
          >
            Power Off
          </button>
        </div>
      </div>
    </aside>
  );
}
