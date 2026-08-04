// Barrel export for the client layer. External consumers (src/ top-level,
// tests) import through the `emulator-client` alias; internal client modules
// keep relative imports. The single facade is EmulatorClient — it owns the
// Emulator instance and every client-side subsystem.

export { EmulatorClient } from './EmulatorClient';
export type {
  EmulatorClientOptions,
  DiscRequest,
  ControllerConfig,
  ControllerStoreEntry,
  Source,
  InputHandle,
  CaptureResult,
  RebindBinding,
  Slot,
  ParsedHeader,
  ParseResult,
  // Storage ports stay exported so tests can construct the client (and the
  // sub-systems directly) with InMemory* doubles.
  SaveStateStorage,
  MemcardStorage,
  BiosStorage,
} from './EmulatorClient';
