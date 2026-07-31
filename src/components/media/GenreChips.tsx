import { cn } from '@/lib/cn';

export type GenreChipsProps = {
  genres: readonly string[];
  value: string;
  onChange: (next: string) => void;
};

export function GenreChips({ genres, value, onChange }: GenreChipsProps) {
  return (
    <div
      aria-label="Filter by genre"
      role="group"
      className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide"
    >
      {genres.map((g) => {
        const active = g === value;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            aria-pressed={active}
            className={cn(
              'px-4 py-2 rounded-full font-label-caps text-label-caps whitespace-nowrap transition-colors',
              active
                ? 'bg-primary/20 text-primary'
                : 'bg-white/5 text-on-surface hover:bg-white/10',
            )}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}
