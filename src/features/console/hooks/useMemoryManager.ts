import { useMemo, useSyncExternalStore } from 'react';
import { parseMemoryCard } from 'mcrreader';
import { memoryCardManager } from '../services';
import type {
  MemoryManagerSlotView,
  MemoryManagerView,
  MemorySlotNumber,
} from '../memcards/memoryCardManager';

function viewForSlot(
  slot: MemorySlotNumber,
  bytes: Uint8Array | null,
  libraryId: string | null,
): MemoryManagerSlotView | null {
  if (!bytes) return null;
  try {
    return { slot, bytes, parsed: parseMemoryCard(bytes), libraryId };
  } catch {
    return null;
  }
}

/**
 * Live view of the in-memory memory card manager (both emulator slots, parsed,
 * plus the session card library). Hydration is owned by the dialog (it re-runs
 * `memoryCardManager.hydrate()` whenever it opens), so this hook just stays in
 * sync with the store.
 */
export function useMemoryManager(): MemoryManagerView {
  const state = useSyncExternalStore(
    memoryCardManager.subscribe,
    memoryCardManager.getState,
    memoryCardManager.getState,
  );

  return useMemo(
    () => ({
      slot1: viewForSlot(1, state.slot1, state.mountId1),
      slot2: viewForSlot(2, state.slot2, state.mountId2),
      library: state.library,
      hydrated: state.hydrated,
    }),
    [state],
  );
}
