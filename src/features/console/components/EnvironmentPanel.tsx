import { emulatorService } from '../services';
import { useConsoleSettings } from '../hooks/useConsoleSettings';
import { useMemoryCards } from '../hooks/useMemoryCards';
import { useMemorySlotAssignment } from '../hooks/useMemorySlotAssignment';
import { cn } from '@/lib/cn';

type EnvironmentPanelProps = {
  userId?: string;
};

export function EnvironmentPanel({ userId }: EnvironmentPanelProps) {
  const settings = useConsoleSettings();
  const cardsQuery = useMemoryCards(userId);
  const assignment = useMemorySlotAssignment(userId ?? '');
  const cards = cardsQuery.data ?? [];

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">display_settings</span>
        Environment
      </h3>

      <div className="space-y-4 p-4 rounded bg-white/5 border border-white/5">
        <MemorySlot
          label="Memory Slot 1"
          value={assignment.slot1}
          cards={cards}
          disabled={!userId}
          onChange={(cardId) => userId && emulatorService.setMemorySlot(1, cardId, userId)}
        />
        <MemorySlot
          label="Memory Slot 2"
          value={assignment.slot2}
          cards={cards}
          disabled={!userId}
          onChange={(cardId) => userId && emulatorService.setMemorySlot(2, cardId, userId)}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/60">
            <span className="material-symbols-outlined text-sm">tv</span>
            <span className="text-xs uppercase font-medium">CRT Filter</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.crtFilter}
            aria-label="Toggle CRT filter"
            onClick={() => emulatorService.setSettings({ crtFilter: !settings.crtFilter })}
            className={cn(
              'relative inline-flex h-5 w-10 items-center rounded-full transition-colors',
              settings.crtFilter ? 'bg-primary/30' : 'bg-white/10',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full transition-all',
                settings.crtFilter ? 'translate-x-5 bg-primary' : 'translate-x-0.5 bg-white/30',
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

type MemorySlotProps = {
  label: string;
  value: string | null;
  cards: { id: string; label: string; usedBlocks: number; totalBlocks: number }[];
  disabled?: boolean;
  onChange: (cardId: string | null) => void;
};

function MemorySlot({ label, value, cards, disabled, onChange }: MemorySlotProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-white/60">
        <span className="material-symbols-outlined text-sm">sd_card</span>
        <span className="text-xs uppercase font-medium">{label}</span>
      </div>
      <div className="relative">
        <select
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn(
            'w-full bg-white/10 border border-transparent rounded px-3 py-2 text-xs',
            'focus:border-primary/50 focus:ring-0 focus:outline-none appearance-none cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !value && 'text-white/40 italic',
          )}
        >
          <option value="">Empty Slot</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.usedBlocks}/{c.totalBlocks} Blocks)
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined text-base text-white/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        >
          expand_more
        </span>
      </div>
    </div>
  );
}
