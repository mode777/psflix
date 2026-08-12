import { create } from 'zustand';
import type { DiscsResponse } from '@/types/pocketbase';
import type {
  ConsoleSettings,
  ControllerPorts,
  ControllerType,
  FastForwardMode,
  MemoryCardInfo,
  PlayerRuntimeState,
  SaveSlot,
  SaveStateInfo,
  SyncStatus,
} from '../types';
import { FAST_FORWARD_ORDER } from '../types';
import type { EmulatorService } from './emulator';
import { loadSettings, saveSettings, loadControllers, saveControllers } from './persistedSlices';

const SIM_LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MockState = {
  runtime: PlayerRuntimeState;
  saves: Record<string, SaveStateInfo[]>;
  memoryCards: MemoryCardInfo[];
  memcardBytes: Record<number, Uint8Array | null>;
  controllers: ControllerPorts;
  settings: ConsoleSettings;
  fastForwardMode: FastForwardMode;
  setRuntime: (patch: Partial<PlayerRuntimeState>) => void;
  setSaves: (key: string, saves: SaveStateInfo[]) => void;
  setMemcardBytes: (slot: number, bytes: Uint8Array | null) => void;
  setControllers: (patch: Partial<ControllerPorts>) => void;
  setSettings: (patch: Partial<ConsoleSettings>) => void;
  setFastForwardMode: (mode: FastForwardMode) => void;
};

function savesKey(discId: string, userId: string): string {
  return `${discId}:${userId}`;
}

function seedMemoryCards(): MemoryCardInfo[] {
  // No seeded defaults — see psxAnywhereEmulatorService.seedMemoryCards.
  return [];
}

const useMockStore = create<MockState>((set) => ({
  runtime: { status: 'idle', currentDiscId: null, elapsedMs: 0 },
  saves: {},
  memoryCards: seedMemoryCards(),
  memcardBytes: { 1: null, 2: null },
  controllers: loadControllers(),
  settings: loadSettings(),
  fastForwardMode: '1x',
  setRuntime: (patch) => set((s) => ({ runtime: { ...s.runtime, ...patch } })),
  setSaves: (key, saves) => set((s) => ({ saves: { ...s.saves, [key]: saves } })),
  setMemcardBytes: (slot, bytes) =>
    set((s) => ({ memcardBytes: { ...s.memcardBytes, [slot]: bytes } })),
  setControllers: (patch) =>
    set((s) => {
      const next = { ...s.controllers, ...patch };
      saveControllers(next);
      return { controllers: next };
    }),
  setSettings: (patch) =>
    set((s) => {
      const next = { ...s.settings, ...patch };
      saveSettings(next);
      return { settings: next };
    }),
  setFastForwardMode: (mode) => set({ fastForwardMode: mode }),
}));

function nextFastForwardMode(mode: FastForwardMode): FastForwardMode {
  const i = FAST_FORWARD_ORDER.indexOf(mode);
  return FAST_FORWARD_ORDER[(i + 1) % FAST_FORWARD_ORDER.length]!;
}

export class MockEmulatorService implements EmulatorService {
  async attachCanvas(): Promise<void> {
    // The mock has no real core to boot; no-op.
    useMockStore.getState().setFastForwardMode('1x');
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

  async loadDisc(disc: DiscsResponse, region?: unknown): Promise<void> {
    void region;
    useMockStore.getState().setFastForwardMode('1x');
    useMockStore.getState().setRuntime({ status: 'loading', currentDiscId: disc.id, elapsedMs: 0 });
    await delay(SIM_LATENCY_MS);
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  async swapDisc(disc: DiscsResponse, region?: unknown): Promise<void> {
    void region;
    useMockStore.getState().setRuntime({ status: 'loading', currentDiscId: disc.id });
    await delay(SIM_LATENCY_MS);
    useMockStore.getState().setFastForwardMode('1x');
    useMockStore.getState().setRuntime({ status: 'paused' });
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
    useMockStore.getState().setFastForwardMode('1x');
    useMockStore.getState().setRuntime({ status: 'playing' });
  }

  getRuntime(): PlayerRuntimeState {
    return useMockStore.getState().runtime;
  }

  subscribeRuntime(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }

  getSyncStatus(): SyncStatus {
    return 'idle';
  }

  subscribeSyncStatus(): () => void {
    return () => {};
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

  async exportMemcard(slot: 1 | 2): Promise<Uint8Array | null> {
    const bytes = useMockStore.getState().memcardBytes[slot];
    return bytes ? new Uint8Array(bytes) : null;
  }

  async importMemcard(slot: 1 | 2, buf: ArrayBuffer | Uint8Array): Promise<void> {
    useMockStore.getState().setMemcardBytes(slot, new Uint8Array(buf));
  }

  /** Test-only: clear both memcard slots in the shared mock store so a test
   *  can assert the "core has no card" path without leakage from earlier
   *  tests in the same file (the store is module-scoped). */
  __resetMemcards(): void {
    useMockStore.getState().setMemcardBytes(1, null);
    useMockStore.getState().setMemcardBytes(2, null);
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

  getFastForwardMode(): FastForwardMode {
    return useMockStore.getState().fastForwardMode;
  }

  setFastForwardMode(mode: FastForwardMode): void {
    useMockStore.getState().setFastForwardMode(mode);
  }

  cycleFastForwardMode(): FastForwardMode {
    const current = useMockStore.getState().fastForwardMode;
    const next = nextFastForwardMode(current);
    useMockStore.getState().setFastForwardMode(next);
    return next;
  }

  subscribeFastForwardMode(listener: () => void): () => void {
    return useMockStore.subscribe(listener);
  }
}
