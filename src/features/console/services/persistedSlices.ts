import { readPersisted, writePersisted, parsers, type Slice } from '@/lib/persist';
import type { ConsoleSettings, ControllerPorts, ControllerType } from '../types';

/**
 * Console state slices persisted to localStorage, declared via the generic
 * `@/lib/persist` helpers. To add a new persisted setting, extend the relevant
 * type + `fallback` + `fields` entry here — no other wiring needed.
 */

const CONTROLLER_VALUES: readonly ControllerType[] = ['none', 'standard', 'dualshock', 'mouse'];

const settingsSlice: Slice<ConsoleSettings> = {
  key: 'psflix:console-settings',
  fallback: { crtFilter: true, masterVolume: 85 },
  fields: {
    crtFilter: parsers.boolean,
    masterVolume: parsers.clamped(0, 100),
  },
};

const controllersSlice: Slice<ControllerPorts> = {
  key: 'psflix:console-controllers',
  fallback: { port1: 'standard', port2: 'none' },
  fields: {
    port1: parsers.enum(CONTROLLER_VALUES),
    port2: parsers.enum(CONTROLLER_VALUES),
  },
};

export function loadSettings(): ConsoleSettings {
  return readPersisted(settingsSlice);
}

export function saveSettings(settings: ConsoleSettings): void {
  writePersisted(settingsSlice, settings);
}

export function loadControllers(): ControllerPorts {
  return readPersisted(controllersSlice);
}

export function saveControllers(controllers: ControllerPorts): void {
  writePersisted(controllersSlice, controllers);
}
