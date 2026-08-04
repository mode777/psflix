import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

export function useConsoleSettings() {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeSettings(l),
    () => emulatorService.getSettings(),
    () => emulatorService.getSettings(),
  );
}
