import type {
  ConsoleSettings,
  ControllerPorts,
  ControllerType,
  MemoryCardInfo,
  MemorySlotAssignment,
  PlayerRuntimeState,
  SaveSlot,
  SaveStateInfo,
  SyncStatus,
} from '../types';
import type { DiscsResponse } from '@/types/pocketbase';

/**
 * EmulatorService is the contract for everything the console (playing) view
 * needs from an emulator backend.
 *
 * The production implementation (`PsxAnywhereEmulatorService`) wraps the
 * vendored PSxAnywhere `EmulatorClient` facade and persists save states +
 * memory cards to local IndexedDB (Phase 1). The mock implementation
 * (`MockEmulatorService`) is retained for unit tests / Storybook fixtures.
 *
 * The save-state and memory-card methods are shaped to map 1:1 onto the
 * PocketBase `save_state` and `memory_cards` collections (see pb_schema.json):
 *   - save_state: { type, disc, user, data }  — unique on (type, disc, user)
 *   - memory_cards: { label, data, user }
 */
export interface EmulatorService {
  // --- player lifecycle -------------------------------------------------
  /**
   * Attach a canvas element and boot the underlying emulator core. Called
   * once when the console view mounts; idempotent if already attached.
   */
  attachCanvas(canvas: HTMLCanvasElement): Promise<void>;
  /** Tear down the live emulator session (called on unmount). */
  destroy(): void;
  /** Current canvas node (swapped by the facade on `reset()`), or null. */
  getCanvas(): HTMLCanvasElement | null;
  /** Last fatal error message, or null. Read at render time (status flips to idle on fatal). */
  getFatal(): string | null;
  loadDisc(disc: DiscsResponse): Promise<void>;
  /** Swap to another disc of a multi-disc game without re-booting the core. */
  swapDisc(disc: DiscsResponse): Promise<void>;
  /** Begin playback. Must be invoked from within a user gesture (click). */
  play(): Promise<void>;
  pause(): void;
  reset(): Promise<void>;
  getRuntime(): PlayerRuntimeState;
  /** Subscribe to runtime changes; returns an unsubscribe fn. */
  subscribeRuntime(listener: () => void): () => void;

  // --- cloud sync status (Phase 2) -------------------------------------
  /** Current save-state / memory-card cloud-sync status. */
  getSyncStatus(): SyncStatus;
  /** Subscribe to sync-status changes; returns an unsubscribe fn. */
  subscribeSyncStatus(listener: () => void): () => void;

  // --- save states (maps onto pb.collection('save_state')) --------------
  listSaveStates(discId: string, userId: string): Promise<SaveStateInfo[]>;
  saveState(slot: SaveSlot, discId: string, userId: string): Promise<SaveStateInfo>;
  loadState(slot: SaveSlot, discId: string, userId: string): Promise<void>;
  deleteState(slot: SaveSlot, discId: string, userId: string): Promise<void>;

  // --- memory cards (maps onto pb.collection('memory_cards')) -----------
  listMemoryCards(userId: string): Promise<MemoryCardInfo[]>;
  getMemorySlotAssignment(userId: string): MemorySlotAssignment;
  setMemorySlot(port: 1 | 2, cardId: string | null, userId: string): void;
  subscribeMemorySlots(listener: () => void): () => void;

  // --- controller ports -------------------------------------------------
  getControllerPorts(): ControllerPorts;
  setController(port: 1 | 2, type: ControllerType): void;
  subscribeControllers(listener: () => void): () => void;

  // --- persisted settings (localStorage) --------------------------------
  getSettings(): ConsoleSettings;
  setSettings(patch: Partial<ConsoleSettings>): void;
  subscribeSettings(listener: () => void): () => void;
}
