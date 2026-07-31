import { cn } from '@/lib/cn';

export function FeaturesChips({ features }: { features: string[] }) {
  if (features.length === 0) return null;
  const visible = features.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((f) => (
        <span
          key={f}
          className={cn(
            'bg-white/10 px-4 py-1.5 rounded-full',
            'font-label-caps text-label-caps text-white',
          )}
        >
          {f}
        </span>
      ))}
    </div>
  );
}
