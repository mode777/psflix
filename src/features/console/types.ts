import type { SaveStateTypeOptions } from '@/types/pocketbase';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

export type ControllerType = 'none' | 'standard' | 'dualshock' | 'mouse';

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
};

export type PlayerRuntimeState = {
  status: PlayerStatus;
  currentDiscId: string | null;
  elapsedMs: number;
};

export type ControllerPorts = {
  port1: ControllerType;
  port2: ControllerType;
};

export type MemorySlotAssignment = {
  slot1: string | null;
  slot2: string | null;
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
