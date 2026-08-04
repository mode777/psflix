import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

/**
 * Cloud-sync status for save states / memory cards. Subscribes to the
 * emulator-service store so the UI re-renders when the facade finishes a sync
 * pass (`state-sync-complete`) or queues an upload (`state-saved`).
 */
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeSyncStatus(l),
    () => emulatorService.getSyncStatus(),
    () => emulatorService.getSyncStatus(),
  );
}
