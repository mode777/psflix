import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

export function useMemorySlotAssignment(userId: string) {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeMemorySlots(l),
    () => emulatorService.getMemorySlotAssignment(userId),
    () => emulatorService.getMemorySlotAssignment(userId),
  );
}
