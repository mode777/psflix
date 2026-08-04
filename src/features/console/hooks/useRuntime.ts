import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

export function useRuntime() {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeRuntime(l),
    () => emulatorService.getRuntime(),
    () => emulatorService.getRuntime(),
  );
}
