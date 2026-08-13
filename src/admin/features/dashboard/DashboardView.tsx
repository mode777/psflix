import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/cn';
import { useCounts, countLabel } from './useCounts';
import { useStorage } from './useStorage';
import { formatBytes } from '@/admin/lib/format';
import { categoryLabel, STORAGE_CATEGORIES } from './storage';

/**
 * Operator dashboard: record counts (games / discs / users) and an accumulated-
 * storage breakdown across the four managed file categories, plus a grand total.
 * Uses the shared Obsidian Console tokens (charcoal surface tiers, 16px card
 * radii, Inter type, PlayStation-blue accents).
 */
export function DashboardView() {
  const counts = useCounts();
  const storage = useStorage(true);

  return (
    <>
      <Helmet>
        <title>PSflix Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <main className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 flex flex-col gap-10">
        <section>
          <h2 className="text-headline-lg text-white mb-4">Catalog &amp; users</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {counts.map((c) => (
              <CountCard key={c.collection} label={countLabel(c.collection)} result={c} />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-headline-lg text-white">Storage</h2>
            {storage.data?.incomplete && (
              <span className="text-body-md text-outline italic">totals may be incomplete</span>
            )}
          </div>
          <StoragePanel
            loading={storage.isLoading}
            isError={storage.isError}
            categories={storage.data?.categories ?? []}
            grandTotal={storage.data?.grandTotal ?? 0}
            incomplete={storage.data?.incomplete ?? false}
          />
        </section>
      </main>
    </>
  );
}

type CountCardProps = {
  label: string;
  result: { count: number | null; isLoading: boolean; isError: boolean };
};

function CountCard({ label, result }: CountCardProps) {
  return (
    <div
      className={cn(
        'glass-panel rounded-2xl ambient-shadow border border-white/10',
        'p-5 flex flex-col gap-2',
      )}
    >
      <span className="text-on-surface-variant text-label-caps font-label-caps">{label}</span>
      {result.isLoading ? (
        <span className="text-headline-lg text-on-surface-variant animate-pulse">…</span>
      ) : result.isError ? (
        <span className="text-headline-lg text-error" title="Failed to load count">
          —
        </span>
      ) : (
        <span className="text-headline-lg text-white tabular-nums">
          {(result.count ?? 0).toLocaleString()}
        </span>
      )}
      {result.isError && <span className="text-body-md text-error/80">failed to load</span>}
    </div>
  );
}

type StoragePanelProps = {
  loading: boolean;
  isError: boolean;
  categories: ReadonlyArray<{
    key: string;
    label: string;
    totalBytes: number;
    fileCount: number;
    incomplete: boolean;
  }>;
  grandTotal: number;
  incomplete: boolean;
};

function StoragePanel({ loading, isError, categories, grandTotal, incomplete }: StoragePanelProps) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl ambient-shadow border border-white/10 p-5 text-on-surface-variant animate-pulse">
        Measuring storage…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass-panel rounded-2xl ambient-shadow border border-error/30 p-5 text-error">
        Failed to measure storage.
      </div>
    );
  }

  // Ensure a row exists for every configured category even when absent from data.
  const rows = STORAGE_CATEGORIES.map((c) => {
    const found = categories.find((cat) => cat.key === c.key);
    return (
      found ?? {
        key: c.key,
        label: categoryLabel(c.key),
        totalBytes: 0,
        fileCount: 0,
        incomplete: false,
      }
    );
  });

  return (
    <div className={cn('glass-panel rounded-2xl ambient-shadow border border-white/10', 'p-5')}>
      <ul className="flex flex-col divide-y divide-white/5">
        {rows.map((c) => (
          <li key={c.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col">
              <span className="text-on-surface font-body-md">{c.label}</span>
              <span className="text-body-md text-on-surface-variant">
                {c.fileCount} file{c.fileCount === 1 ? '' : 's'}
                {c.incomplete && <span className="text-error/80"> · partial</span>}
              </span>
            </div>
            <span className="text-on-surface tabular-nums font-body-md">
              {formatBytes(c.totalBytes)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
        <span className="text-white font-label-caps text-label-caps">Grand total</span>
        <div className="flex items-baseline gap-2">
          {incomplete && (
            <span className="text-body-md text-outline italic">may be incomplete</span>
          )}
          <span className="text-headline-lg text-primary tabular-nums">
            {formatBytes(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
