export const ALL_GENRE = 'All';

export type GenreEntry = { genre?: string | null };

type Bucket = { labelCounts: Map<string, number>; total: number };

export function aggregateGenres(records: GenreEntry[]): string[] {
  const byKey = new Map<string, Bucket>();

  for (const rec of records) {
    const raw = rec?.genre;
    if (typeof raw !== 'string') continue;
    const label = raw.trim();
    if (label.length === 0) continue;

    const key = label.toLowerCase();
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { labelCounts: new Map(), total: 0 };
      byKey.set(key, bucket);
    }
    bucket.total += 1;
    bucket.labelCounts.set(label, (bucket.labelCounts.get(label) ?? 0) + 1);
  }

  const aggregated: { label: string; count: number }[] = [];
  for (const bucket of byKey.values()) {
    let bestLabel = '';
    let bestCount = -1;
    for (const [label, count] of bucket.labelCounts) {
      if (count > bestCount || (count === bestCount && label < bestLabel)) {
        bestLabel = label;
        bestCount = count;
      }
    }
    aggregated.push({ label: bestLabel, count: bucket.total });
  }

  aggregated.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  });

  return aggregated.map((a) => a.label);
}
