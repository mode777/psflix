import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

export function useFastForwardMode() {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeFastForwardMode(l),
    () => emulatorService.getFastForwardMode(),
    () => emulatorService.getFastForwardMode(),
  );
}
