import { cn } from '@/lib/cn';
import type { GameDetail } from '@/features/games/useGame';

function formatRelease(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

export function MetadataPanel({ game }: { game: GameDetail }) {
  const discCount = game.discs ?? game.expand?.discs_via_game?.length;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Developer', value: game.developer ?? '—' },
    { label: 'Publisher', value: game.publisher ?? '—' },
    { label: 'First Release', value: formatRelease(game.release) },
    { label: 'Players', value: game.players ?? '—' },
    { label: 'Discs', value: discCount != null ? String(discCount) : '—' },
    { label: 'Region', value: game.region ?? '—' },
  ];

  return (
    <div className={cn('glass-panel rounded-xl p-5 ambient-shadow transition-all duration-300')}>
      <h3 className="text-lg text-white font-semibold mb-2 border-b border-outline-variant/30 pb-2">
        Game Information
      </h3>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="font-label-caps text-label-caps text-on-surface-variant mb-0.5">
              {row.label}
            </p>
            <p className="font-body-md text-body-md text-white font-medium">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
