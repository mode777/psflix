// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src).

import type { MemoryCard } from './types';

export function isEqual(a: MemoryCard, b: MemoryCard): boolean {
  if (a.saves.length !== b.saves.length) return false;
  const map = new Map(a.saves.map((s) => [s.productCode, s.hash]));
  for (const save of b.saves) {
    if (map.get(save.productCode) !== save.hash) return false;
  }
  return true;
}
