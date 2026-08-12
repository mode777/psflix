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

/**
 * Cloud-aware memory-card manager singleton. Constructed by the service so the
 * binding callback can close over the live `EmulatorClient` (the service owns
 * the client lifecycle) and the reconcile path can reach the manager. The
 * service ↔ manager wiring lives in WS5 (`specs/memory-manager-cloud-sync/`).
 */
export const memoryCardManager = (
  emulatorService as PsxAnywhereEmulatorService
).buildMemoryCardManager();

export { MockEmulatorService } from './emulator.mock';
export { PsxAnywhereMemoryCardStore } from './psxAnywhereMemoryCardStore';
