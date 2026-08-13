import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useGameSearch, type GameSearchResult } from './useGameSearch';

type GameComboboxProps = {
  selected: GameSearchResult | null;
  onSelect: (game: GameSearchResult | null) => void;
  disabled?: boolean;
};

/**
 * Searchable game picker (design.md, Decision 3): a text input plus a dropdown
 * fed by the debounced, server-side `useGameSearch` hook. Renders matched games
 * with title + region + first disc serial; an empty query shows a "type to
 * search" hint. Keyboard accessible: ArrowUp/ArrowDown to move the active row,
 * Enter to select it, Esc to close and clear. The operator must filter — the
 * whole catalog is never rendered, so this scales to a large catalog.
 */
export function GameCombobox({ selected, onSelect, disabled = false }: GameComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isLoading, error } = useGameSearch(open ? query : '');

  useEffect(() => {
    if (activeIndex > results.length - 1)
      setActiveIndex(results.length > 0 ? results.length - 1 : 0);
  }, [results.length, activeIndex]);

  const choose = (game: GameSearchResult | null) => {
    onSelect(game);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (results.length > 0) setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (open && results[activeIndex]) {
        e.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      if (selected) choose(null);
    }
  };

  // When a game is selected, show its title with a clear affordance.
  if (selected) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2',
          disabled && 'opacity-60',
        )}
      >
        <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
          sports_esports
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-on-surface font-body-md">{selected.title}</span>
          <span className="block truncate text-label-caps font-label-caps text-on-surface-variant">
            {selected.region ? `${selected.region} · ` : ''}
            {selected.first_disc_serial}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onSelect(null);
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="btn-ghost rounded-md px-1.5 py-1 text-on-surface-variant hover:text-on-surface"
          aria-label="Change game"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Type to search games…"
        className={cn(
          'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2',
          'text-on-surface font-body-md placeholder:text-on-surface-variant',
          'focus:border-primary focus:outline-none disabled:opacity-60',
        )}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-surface-container-lowest shadow-xl backdrop-blur-xl max-h-72 overflow-auto">
          {error ? (
            <p className="px-3 py-2 text-body-md text-error">Search failed: {error}</p>
          ) : isLoading ? (
            <p className="px-3 py-2 text-body-md text-on-surface-variant">Searching…</p>
          ) : query.trim().length === 0 ? (
            <p className="px-3 py-2 text-body-md text-on-surface-variant">Type to search games</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-body-md text-on-surface-variant">No matching games</p>
          ) : (
            <ul role="listbox">
              {results.map((game, index) => (
                <li key={game.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => {
                      // mousedown over click so the input keeps focus until choose() blurs.
                      e.preventDefault();
                      choose(game);
                    }}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left',
                      index === activeIndex ? 'bg-white/10' : 'hover:bg-white/5',
                    )}
                  >
                    <span className="truncate font-body-md text-on-surface">{game.title}</span>
                    <span className="text-label-caps font-label-caps text-on-surface-variant">
                      {game.region ? `${game.region} · ` : ''}
                      {game.first_disc_serial}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
