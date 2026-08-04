import { PsxAnywhereEmulatorService } from './psxAnywhereEmulatorService';
import type { EmulatorService } from './emulator';

/**
 * Singleton emulator service consumed by all console hooks/components.
 *
 * This is the real implementation: it wraps the vendored PSxAnywhere
 * `EmulatorClient` facade and persists save states + memory cards to local
 * IndexedDB (Phase 1). Cloud sync lands in Phase 2 — see
 * `specs/emulator-integration/`.
 *
 * `MockEmulatorService` is still exported below for unit tests / fixtures.
 */
export const emulatorService: EmulatorService = new PsxAnywhereEmulatorService();

export { MockEmulatorService } from './emulator.mock';
