import { useSyncExternalStore } from 'react';
import { emulatorService } from '../services';

export function useControllerPorts() {
  return useSyncExternalStore(
    (l) => emulatorService.subscribeControllers(l),
    () => emulatorService.getControllerPorts(),
    () => emulatorService.getControllerPorts(),
  );
}
