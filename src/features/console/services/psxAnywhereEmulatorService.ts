import { create } from 'zustand';
import { EmulatorClient } from 'emulator-client';
import { fileUrl } from '@/lib/pb-files';
import { showToast } from '@/lib/toast';
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
import { SAVE_SLOTS } from '../types';
import type { EmulatorService } from './emulator';
import { psxAnywhereRepository } from './psxAnywhereRepository';

const SETTINGS_KEY = 'psflix:console-settings';
const DEFAULT_SETTINGS: ConsoleSettings = { crtFilter: true, masterVolume: 85 };
const DEFAULT_SLOT_ASSIGNMENT: MemorySlotAssignment = { slot1: 'mc-main', slot2: null };
const AUTO_SAVE_INTERVAL_MS = 5 * 60_000;

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

function persistSettings(settings: ConsoleSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore (private mode / quota)
  }
}

function seedMemoryCards(): MemoryCardInfo[] {
  return [
    { id: 'mc-main', label: 'Main Save', usedBlocks: 12, totalBlocks: 15 },
    { id: 'mc-rpg', label: 'RPG Card', usedBlocks: 8, totalBlocks: 15 },
  ];
}

/** Map a PSflix SaveSlot ('auto'|'slot1'|'slot2'|'slot3') onto the facade's Slot. */
export function mapSlot(slot: SaveSlot): number | typeof EmulatorClient.SLOT_AUTO {
  if (slot === 'auto') return EmulatorClient.SLOT_AUTO;
  return Number(slot.replace('slot', '')) - 1; // slot1→0, slot2→1, slot3→2
}

function mapControllerType(type: ControllerType): number {
  switch (type) {
    case 'standard':
      return EmulatorClient.CONTROLLER.STANDARD;
    case 'dualshock':
      return EmulatorClient.CONTROLLER.DUALSHOCK;
    case 'mouse':
      return EmulatorClient.CONTROLLER.MOUSE;
    case 'none':
      return 0;
  }
}

type ServiceState = {
  runtime: PlayerRuntimeState;
  controllers: ControllerPorts;
  settings: ConsoleSettings;
  slotAssignment: Record<string, MemorySlotAssignment>;
  /** `${discId}:${slot}` → ISO timestamp of the last local save (session-only). */
  saveMeta: Record<string, string>;
  /** Bumped whenever the facade replaces the canvas, so listeners re-render. */
  canvasGen: number;
  setRuntime: (patch: Partial<PlayerRuntimeState>) => void;
  setControllers: (patch: Partial<ControllerPorts>) => void;
  setSettings: (patch: Partial<ConsoleSettings>) => void;
  setSlotAssignment: (userId: string, assignment: MemorySlotAssignment) => void;
  setSaveMeta: (key: string, iso: string) => void;
  bumpCanvas: () => void;
};

const store = create<ServiceState>((set) => ({
  runtime: { status: 'idle', currentDiscId: null, elapsedMs: 0 },
  controllers: { port1: 'standard', port2: 'none' },
  settings: loadSettings(),
  slotAssignment: {},
  saveMeta: {},
  canvasGen: 0,
  setRuntime: (patch) => set((s) => ({ runtime: { ...s.runtime, ...patch } })),
  setControllers: (patch) => set((s) => ({ controllers: { ...s.controllers, ...patch } })),
  setSettings: (patch) =>
    set((s) => {
      const next = { ...s.settings, ...patch };
      persistSettings(next);
      return { settings: next };
    }),
  setSlotAssignment: (userId, assignment) =>
    set((s) => ({ slotAssignment: { ...s.slotAssignment, [userId]: assignment } })),
  setSaveMeta: (key, iso) => set((s) => ({ saveMeta: { ...s.saveMeta, [key]: iso } })),
  bumpCanvas: () => set((s) => ({ canvasGen: s.canvasGen + 1 })),
}));

/**
 * PsxAnywhereEmulatorService implements PSflix's EmulatorService over a
 * lazily-constructed PSxAnywhere `EmulatorClient`. The service is a module
 * singleton, but the live facade (canvas-bound, per-session) is created on
 * demand when `attachCanvas` runs and torn down via `destroy`.
 *
 * Phase 1: save states + memory cards persist to local IndexedDB through the
 * facade. Cloud sync is stubbed in the repository (Phase 2).
 */
export class PsxAnywhereEmulatorService implements EmulatorService {
  private _client: EmulatorClient | null = null;
  private _canvasRef: HTMLCanvasElement | null = null;
  private _fatalMsg: string | null = null;
  private _statusBeforeBuffer: PlayerRuntimeState['status'] | null = null;

  // --- lifecycle -------------------------------------------------------

  async attachCanvas(canvas: HTMLCanvasElement): Promise<void> {
    if (this._client) return; // idempotent
    this._canvasRef = canvas;
    const client = new EmulatorClient({
      canvas,
      repository: psxAnywhereRepository,
      log: (level, msg) => {
        // eslint-disable-next-line no-console
        console[level === 'error' ? 'error' : 'log'](`[emulator] ${msg}`);
      },
      toast: (msg) => showToast(msg, { kind: 'info' }),
      autoSave: { intervalMs: AUTO_SAVE_INTERVAL_MS },
    });
    this._client = client;
    this._wireEvents(client);
    await client.boot();
    // Push current settings into the live core.
    const { crtFilter, masterVolume } = store.getState().settings;
    client.setCrt(crtFilter);
    client.setVolume(masterVolume / 100);
  }

  destroy(): void {
    this._client?.destroy();
    this._client = null;
    this._canvasRef = null;
    this._fatalMsg = null;
  }

  /** Current canvas node (may be swapped by the facade on `reset()`). */
  getCanvas(): HTMLCanvasElement | null {
    return this._canvasRef;
  }

  /** Last fatal message (read at render time; status flips to 'idle' on fatal). */
  getFatal(): string | null {
    return this._fatalMsg;
  }

  private _wireEvents(client: EmulatorClient): void {
    client.addEventListener('ready', () => store.getState().setRuntime({ status: 'idle' }));
    client.addEventListener('loaded', () => store.getState().setRuntime({ status: 'paused' }));
    client.addEventListener('stopped', () => store.getState().setRuntime({ status: 'paused' }));
    client.addEventListener('fatal', (e) => {
      const detail = (e as CustomEvent).detail as { msg?: string } | undefined;
      this._fatalMsg = detail?.msg ?? 'The emulator encountered a fatal error.';
      store.getState().setRuntime({ status: 'idle' });
    });
    client.addEventListener('buffering', (e) => {
      const detail = (e as CustomEvent).detail as { visible?: boolean } | undefined;
      const visible = !!detail?.visible;
      if (visible) {
        const { status } = store.getState().runtime;
        if (status !== 'loading') {
          this._statusBeforeBuffer = status;
          store.getState().setRuntime({ status: 'loading' });
        }
      } else if (this._statusBeforeBuffer) {
        store.getState().setRuntime({ status: this._statusBeforeBuffer });
        this._statusBeforeBuffer = null;
      }
    });
    client.addEventListener('canvas-replaced', (e) => {
      const detail = (e as CustomEvent).detail as { canvas?: HTMLCanvasElement } | undefined;
      if (detail?.canvas) this._canvasRef = detail.canvas;
      store.getState().bumpCanvas();
    });
  }

  // --- player lifecycle ------------------------------------------------

  async loadDisc(disc: DiscsResponse): Promise<void> {
    const client = this._requireClient();
    const iso = disc.iso;
    if (!iso) throw new Error('This disc has no game image attached.');
    const chdUrl = fileUrl(disc, iso);
    store.getState().setRuntime({ status: 'loading', currentDiscId: disc.id, elapsedMs: 0 });
    await client.loadDisc({ chdUrl, serial: disc.serial });
    store.getState().setRuntime({ status: 'paused' });
  }

  async swapDisc(disc: DiscsResponse): Promise<void> {
    const client = this._client;
    if (!client) return this.loadDisc(disc);
    const iso = disc.iso;
    if (!iso) throw new Error('This disc has no game image attached.');
    const chdUrl = fileUrl(disc, iso);
    store.getState().setRuntime({ status: 'loading', currentDiscId: disc.id });
    await client.swapDisc(chdUrl);
    store.getState().setRuntime({ status: 'paused' });
  }

  async play(): Promise<void> {
    const client = this._requireClient();
    store.getState().setRuntime({ status: 'loading' });
    try {
      await client.start();
      store.getState().setRuntime({ status: 'playing' });
    } catch (err) {
      store.getState().setRuntime({ status: 'paused' });
      throw err;
    }
  }

  pause(): void {
    this._client?.stop();
  }

  async reset(): Promise<void> {
    const client = this._requireClient();
    this._fatalMsg = null;
    store.getState().setRuntime({ status: 'loading', elapsedMs: 0 });
    await client.reset();
    store.getState().setRuntime({ status: 'paused' });
  }

  getRuntime(): PlayerRuntimeState {
    return store.getState().runtime;
  }

  subscribeRuntime(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- save states (local IDB via facade) ------------------------------

  async listSaveStates(discId: string, userId: string): Promise<SaveStateInfo[]> {
    void userId;
    const client = this._client;
    if (!client) return [];
    const meta = store.getState().saveMeta;
    const out: SaveStateInfo[] = [];
    for (const { value: slot } of SAVE_SLOTS) {
      let exists = false;
      try {
        exists = await client.hasState(mapSlot(slot));
      } catch {
        exists = false;
      }
      if (exists) {
        const key = `${discId}:${slot}`;
        out.push({
          id: `${discId}:${slot}`,
          slot,
          discId,
          updatedAt: meta[key] ?? new Date(0).toISOString(),
          blocks: 1,
        });
      }
    }
    return out;
  }

  async saveState(slot: SaveSlot, discId: string, userId: string): Promise<SaveStateInfo> {
    void userId;
    const client = this._requireClient();
    await client.saveState(mapSlot(slot));
    const updatedAt = new Date().toISOString();
    store.getState().setSaveMeta(`${discId}:${slot}`, updatedAt);
    return { id: `${discId}:${slot}`, slot, discId, updatedAt, blocks: 1 };
  }

  async loadState(slot: SaveSlot, discId: string, userId: string): Promise<void> {
    void userId;
    void discId;
    const client = this._requireClient();
    try {
      await client.loadState(mapSlot(slot));
    } catch {
      throw new Error(`No save in ${slot} for this disc`);
    }
  }

  async deleteState(slot: SaveSlot, discId: string, userId: string): Promise<void> {
    void userId;
    void discId;
    void slot;
    // The facade exposes no delete API in Phase 1; cloud delete is Phase 2.
  }

  // --- memory cards (Phase 1: seeded defaults) -------------------------

  async listMemoryCards(userId: string): Promise<MemoryCardInfo[]> {
    void userId;
    return seedMemoryCards();
  }

  getMemorySlotAssignment(userId: string): MemorySlotAssignment {
    return store.getState().slotAssignment[userId] ?? DEFAULT_SLOT_ASSIGNMENT;
  }

  setMemorySlot(port: 1 | 2, cardId: string | null, userId: string): void {
    const current = this.getMemorySlotAssignment(userId);
    const next: MemorySlotAssignment = {
      ...current,
      [port === 1 ? 'slot1' : 'slot2']: cardId,
    };
    store.getState().setSlotAssignment(userId, next);
  }

  subscribeMemorySlots(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- controller ports ------------------------------------------------

  getControllerPorts(): ControllerPorts {
    return store.getState().controllers;
  }

  setController(port: 1 | 2, type: ControllerType): void {
    store.getState().setControllers({ [port === 1 ? 'port1' : 'port2']: type });
    const client = this._client;
    if (!client) return;
    const device = mapControllerType(type);
    if (device === 0) {
      client.clearController(port - 1);
    } else {
      client.setController(port - 1, { device, source: 'keyboard' });
    }
  }

  subscribeControllers(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- persisted settings (localStorage) -------------------------------

  getSettings(): ConsoleSettings {
    return store.getState().settings;
  }

  setSettings(patch: Partial<ConsoleSettings>): void {
    const prev = store.getState().settings;
    store.getState().setSettings(patch);
    const next = store.getState().settings;
    const client = this._client;
    if (!client) return;
    if (prev.crtFilter !== next.crtFilter) client.setCrt(next.crtFilter);
    if (prev.masterVolume !== next.masterVolume) client.setVolume(next.masterVolume / 100);
  }

  subscribeSettings(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- internal --------------------------------------------------------

  private _requireClient(): EmulatorClient {
    if (!this._client) throw new Error('Emulator not attached — call attachCanvas first.');
    return this._client;
  }
}
