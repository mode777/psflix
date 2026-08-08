import { cn } from '@/lib/cn';

export type SearchBarProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChange, placeholder = 'Search library...' }: SearchBarProps) {
  return (
    <div className="relative w-full md:max-w-2xl">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
        search
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search games"
        className={cn(
          'w-full bg-surface-container-high/40 border border-white/10 rounded-lg',
          'py-2 pl-10 pr-4 text-on-surface placeholder:text-outline',
          'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          'transition-all font-body-md text-body-md',
        )}
      />
    </div>
  );
}
