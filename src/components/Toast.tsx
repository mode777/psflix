import { useToastStore } from '@/lib/toast';
import { cn } from '@/lib/cn';

export function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'glass-panel rounded-xl ambient-shadow border border-white/10',
            'p-3 flex items-start gap-3 text-body-md',
            t.kind === 'error' ? 'border-error/40' : 'border-primary/30',
          )}
        >
          <span
            className={cn(
              'material-symbols-outlined mt-0.5 shrink-0',
              t.kind === 'error' ? 'text-error' : 'text-primary',
            )}
            aria-hidden="true"
          >
            {t.kind === 'error' ? 'error' : 'info'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface break-words">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="mt-1 text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
            className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
