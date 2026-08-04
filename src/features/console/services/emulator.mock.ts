import { create } from 'zustand';
import type { DiscsResponse } from '@/types/pocketbase';
import type {
  ConsoleSettings,
  ControllerPorts,
  ControllerType,
  MemoryCardInfo,
  MemorySlotAssignment,
  PlayerRuntimeState,
  SaveSlot,
  SaveStateInfo,
} from '../types';
import type { EmulatorService } from './emulator';

const SETTINGS_KEY = 'psflix:console-settings';
const DEFAULT_SETTINGS: ConsoleSettings = { crtFilter: true, masterVolume: 85 };
const DEFAULT_SLOT_ASSIGNMENT: MemorySlotAssignment = { slot1: 'mc-main', slot2: null };
const SIM_LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSettings(): ConsoleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ConsoleSettings>;
    return {
      crtFilter:
        typeof parsed.crtFilter === 'boolean' ? parsed.crtFilter : DEFAULT_SETTINGS.crtFilter,
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? Math.min(100, Math.max(0, parsed.masterVolume))
          : DEFAULT_SETTINGS.masterVolume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: ConsoleSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore (private mode / quota)
  }
}

type MockState = {
  runtime: PlayerRuntimeState;
  saves: Record<string, SaveStateInfo[]>;
  memoryCards: MemoryCardInfo[];
  slotAssignment: Record<string, MemorySlotAssignment>;
  controllers: ControllerPorts;
  settings: ConsoleSettings;
  setRuntime: (patch: Partial<PlayerRuntimeState>) => void;
  setSaves: (key: string, saves: SaveStateInfo[]) => void;
  setSlotAssignment: (userId: string, assignment: MemorySlotAssignment) => void;
  setControllers: (patch: Partial<ControllerPorts>) => void;
  setSettings: (patch: Partial<ConsoleSettings>) => void;
};

function savesKey(discId: string, userId: string): string {
  return `${discId}:${userId}`;
}

function seedMemoryCards(): MemoryCardInfo[] {
  return [
    { id: 'mc-main', label: 'Main Save', usedBlocks: 12, totalBlocks: 15 },
    { id: 'mc-rpg', label: 'RPG Card', usedBlocks: 8, totalBlocks: 15 },
  ];
}

const useMockStore = create<MockState>((set) => ({
  runtime: { status: 'idle', currentDiscId: null, elapsedMs: 0 },
  saves: {},
  memoryCards: seedMemoryCards(),
  slotAssignment: {},
  controllers: { port1: 'standard', port2: 'none' },
  settings: loadSettings(),
  setRuntime: (patch) => set((s) => ({ runtime: { ...s.runtime, ...patch } })),
  setSaves: (key, saves) => set((s) => ({ saves: { ...s.saves, [key]: saves } })),
  setSlotAssignment: (userId, assignment) =>
    set((s) => ({ slotAssignment: { ...s.slotAssignment, [userId]: assignment } })),
  setControllers: (patch) => set((s) => ({ controllers: { ...s.controllers, ...patch } })),
  setSettings: (patch) =>
    set((s) => {
      const next = { ...s.settings, ...patch };
      saveSettings(next);
      return { settings: next };
    }),
}));

export class MockEmulatorService implements EmulatorService {
  async attachCanvas(): Promise<void> {
    // The mock has no real core to boot; no-op.
  }

  destroy(): void {
    // The mock owns no external resources.
  }

  getCanvas(): HTMLCanvasElement | null {
    return null;
  }

  getFatal(): string | null {
    return null;
  }

  async loadDisc(disc: DiscsResponse): Promise<void> {
    useMockStore.getState().setRuntime({ status: 'loading', currentDiscId: disc.id, elapsedMs: 0 });
    await delay(SIM_LATENCY_MS);
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  async swapDisc(disc: DiscsResponse): Promise<void> {
    await this.loadDisc(disc);
  }

  async play(): Promise<void> {
    const { status } = useMockStore.getState().runtime;
    if (status === 'playing') return;
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  pause(): void {
    const { status } = useMockStore.getState().runtime;
    if (status === 'paused' || status === 'idle') return;
    useMockStore.getState().setRuntime({ status: 'paused' });
  }

  async reset(): Promise<void> {
    useMockStore.getState().setRuntime({ status: 'loading', elapsedMs: 0 });
    await delay(SIM_LATENCY_MS);
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  getRuntime(): PlayerRuntimeState {
    return useMockStore.getState().runtime;
  }

  subscribeRuntime(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }

  async listSaveStates(discId: string, userId: string): Promise<SaveStateInfo[]> {
    await delay(SIM_LATENCY_MS);
    const key = savesKey(discId, userId);
    return useMockStore.getState().saves[key] ?? [];
  }

  async saveState(slot: SaveSlot, discId: string, userId: string): Promise<SaveStateInfo> {
    await delay(SIM_LATENCY_MS);
    const key = savesKey(discId, userId);
    const existing = useMockStore.getState().saves[key] ?? [];
    const filtered = existing.filter((s) => s.slot !== slot);
    const created: SaveStateInfo = {
      id: `save-${slot}-${Date.now()}`,
      slot,
      discId,
      updatedAt: new Date().toISOString(),
      blocks: Math.floor(Math.random() * 6) + 1,
    };
    useMockStore.getState().setSaves(key, [...filtered, created]);
    return created;
  }

  async loadState(slot: SaveSlot, discId: string, userId: string): Promise<void> {
    const key = savesKey(discId, userId);
    const existing = useMockStore.getState().saves[key] ?? [];
    const found = existing.find((s) => s.slot === slot);
    if (!found) {
      throw new Error(`No save in ${slot} for this disc`);
    }
    useMockStore.getState().setRuntime({ status: 'loading' });
    await delay(SIM_LATENCY_MS);
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  async deleteState(slot: SaveSlot, discId: string, userId: string): Promise<void> {
    await delay(SIM_LATENCY_MS);
    const key = savesKey(discId, userId);
    const existing = useMockStore.getState().saves[key] ?? [];
    useMockStore.getState().setSaves(
      key,
      existing.filter((s) => s.slot !== slot),
    );
  }

  async listMemoryCards(userId: string): Promise<MemoryCardInfo[]> {
    await delay(SIM_LATENCY_MS);
    void userId;
    return useMockStore.getState().memoryCards;
  }

  getMemorySlotAssignment(userId: string): MemorySlotAssignment {
    return useMockStore.getState().slotAssignment[userId] ?? DEFAULT_SLOT_ASSIGNMENT;
  }

  setMemorySlot(port: 1 | 2, cardId: string | null, userId: string): void {
    const current = this.getMemorySlotAssignment(userId);
    const next: MemorySlotAssignment = {
      ...current,
      [port === 1 ? 'slot1' : 'slot2']: cardId,
    };
    useMockStore.getState().setSlotAssignment(userId, next);
  }

  subscribeMemorySlots(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }

  getControllerPorts(): ControllerPorts {
    return useMockStore.getState().controllers;
  }

  setController(port: 1 | 2, type: ControllerType): void {
    useMockStore.getState().setControllers({ [port === 1 ? 'port1' : 'port2']: type });
  }

  subscribeControllers(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }

  getSettings(): ConsoleSettings {
    return useMockStore.getState().settings;
  }

  setSettings(patch: Partial<ConsoleSettings>): void {
    useMockStore.getState().setSettings(patch);
  }

  subscribeSettings(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }
}
