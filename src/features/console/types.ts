import type { SaveStateTypeOptions } from '@/types/pocketbase';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Cloud-sync status for save states / memory cards. Surfaced via a small
 * indicator so the user can tell when a local save has finished syncing.
 * - `idle`: not authenticated, or no sync has run yet.
 * - `syncing`: a sync pass is in flight (upload queued after a local save).
 * - `synced`: the last sync pass completed successfully.
 * - `error`: a sync error was reported by the facade.
 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export type ControllerType = 'none' | 'standard' | 'dualshock' | 'mouse';
export type FastForwardMode = '1x' | '2x';

export type SaveSlot = SaveStateTypeOptions;

export type ConsoleSettings = {
  crtFilter: boolean;
  masterVolume: number;
};

export type SaveStateInfo = {
  id: string;
  slot: SaveSlot;
  discId: string;
  updatedAt: string;
  blocks: number;
};

export type MemoryCardInfo = {
  id: string;
  label: string;
  usedBlocks: number;
  totalBlocks: number;
  /** Which slot this card is mounted into (`slot1`/`slot2`), or null. Derived
   *  from the cloud `memory_cards.mounted` field. */
  mounted: 'slot1' | 'slot2' | null;
};

export type PlayerRuntimeState = {
  status: PlayerStatus;
  currentDiscId: string | null;
  elapsedMs: number;
};

export const FAST_FORWARD_ORDER: FastForwardMode[] = ['1x', '2x'];

export type ControllerPorts = {
  port1: ControllerType;
  port2: ControllerType;
};

export const SAVE_SLOTS: { value: SaveSlot; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'slot1', label: 'Slot 1' },
  { value: 'slot2', label: 'Slot 2' },
  { value: 'slot3', label: 'Slot 3' },
];

export const CONTROLLER_TYPES: { value: ControllerType; label: string }[] = [
  { value: 'standard', label: 'Standard Pad' },
  { value: 'dualshock', label: 'Dual-Shock' },
  { value: 'mouse', label: 'PlayStation Mouse' },
];
