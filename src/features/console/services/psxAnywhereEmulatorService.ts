import { create } from 'zustand';
import { EmulatorClient } from 'emulator-client';
import { fileUrl } from '@/lib/pb-files';
import { queryClient } from '@/lib/queryClient';
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
  SyncStatus,
} from '../types';
import { SAVE_SLOTS } from '../types';
import type { EmulatorService } from './emulator';
import { psxAnywhereRepository } from './psxAnywhereRepository';

const SETTINGS_KEY = 'psflix:console-settings';
const SLOT_ASSIGNMENT_KEY = (userId: string) => `psflix:memcard-slots:${userId}`;
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

function loadSlotAssignment(userId: string): MemorySlotAssignment {
  try {
    const raw = localStorage.getItem(SLOT_ASSIGNMENT_KEY(userId));
    if (!raw) return { ...DEFAULT_SLOT_ASSIGNMENT };
    const parsed = JSON.parse(raw) as Partial<MemorySlotAssignment>;
    return {
      slot1: parsed.slot1 === null || typeof parsed.slot1 === 'string' ? parsed.slot1 : 'mc-main',
      slot2: parsed.slot2 === null || typeof parsed.slot2 === 'string' ? parsed.slot2 : null,
    };
  } catch {
    return { ...DEFAULT_SLOT_ASSIGNMENT };
  }
}

function persistSlotAssignment(userId: string, assignment: MemorySlotAssignment): void {
  try {
    localStorage.setItem(SLOT_ASSIGNMENT_KEY(userId), JSON.stringify(assignment));
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
  syncStatus: SyncStatus;
  setRuntime: (patch: Partial<PlayerRuntimeState>) => void;
  setControllers: (patch: Partial<ControllerPorts>) => void;
  setSettings: (patch: Partial<ConsoleSettings>) => void;
  setSlotAssignment: (userId: string, assignment: MemorySlotAssignment) => void;
  setSaveMeta: (key: string, iso: string) => void;
  bumpCanvas: () => void;
  setSyncStatus: (status: SyncStatus) => void;
};

const store = create<ServiceState>((set) => ({
  runtime: { status: 'idle', currentDiscId: null, elapsedMs: 0 },
  controllers: { port1: 'standard', port2: 'none' },
  settings: loadSettings(),
  slotAssignment: {},
  saveMeta: {},
  canvasGen: 0,
  syncStatus: 'idle',
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
  setSyncStatus: (status) => set({ syncStatus: status }),
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
  private _lastDisc: DiscsResponse | null = null;
  private _fatalMsg: string | null = null;
  private _statusBeforeBuffer: PlayerRuntimeState['status'] | null = null;
  /** Stable per-user slot-assignment refs (memoized across renders). */
  private readonly _slotCache = new Map<string, MemorySlotAssignment>();
  /** `${discId}:${slot}` slots deleted this session — hidden from the local
   *  IDB probe in `listSaveStates` until a new save overwrites them. */
  private readonly _deletedSlots = new Set<string>();

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
    // A local save just landed (manual or auto): the facade queues a cloud
    // upload for it. Flip to "syncing" and invalidate so the UI shows the
    // fresh local timestamp; the next `state-sync-complete` flips to "synced".
    client.addEventListener('state-saved', () => {
      store.getState().setSyncStatus('syncing');
      this._invalidateSaveStateQueries();
    });
    // A sync pass finished (download + upload reconciled). Mark synced and
    // invalidate both caches so records from another device appear.
    client.addEventListener('state-sync-complete', () => {
      store.getState().setSyncStatus('synced');
      this._invalidateSaveStateQueries();
      queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
    });
    // Memory card sync started (upload or download).
    client.addEventListener('memcard-sync-start', () => {
      store.getState().setSyncStatus('syncing');
    });
    // Memory card sync finished.
    client.addEventListener('memcard-sync-complete', () => {
      store.getState().setSyncStatus('synced');
      queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
    });
    client.addEventListener('auth-change', (e) => {
      const detail = (e as CustomEvent).detail as { authed?: boolean } | undefined;
      store.getState().setSyncStatus(detail?.authed ? 'syncing' : 'idle');
    });
  }

  /** Invalidate every save-state query (any disc/user). */
  private _invalidateSaveStateQueries(): void {
    queryClient.invalidateQueries({ queryKey: ['save-states'] });
  }

  // --- player lifecycle ------------------------------------------------

  async loadDisc(disc: DiscsResponse): Promise<void> {
    this._lastDisc = disc;
    const client = this._requireClient();
    const iso = disc.iso;
    if (!iso) throw new Error('This disc has no game image attached.');
    const chdUrl = fileUrl(disc, iso);
    store.getState().setRuntime({ status: 'loading', currentDiscId: disc.id, elapsedMs: 0 });
    await client.loadDisc({ chdUrl, serial: disc.serial });
    store.getState().setRuntime({ status: 'paused' });
  }

  async swapDisc(disc: DiscsResponse): Promise<void> {
    this._lastDisc = disc;
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
    const disc = this._lastDisc;
    if (!disc) throw new Error('No disc loaded — cannot reset.');
    this._fatalMsg = null;
    store.getState().setRuntime({ status: 'loading', elapsedMs: 0 });
    await client.reset();
    await this.loadDisc(disc);
    await this.play();
  }

  getRuntime(): PlayerRuntimeState {
    return store.getState().runtime;
  }

  subscribeRuntime(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  getSyncStatus(): SyncStatus {
    return store.getState().syncStatus;
  }

  subscribeSyncStatus(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- save states (local IDB via facade) ------------------------------

  async listSaveStates(discId: string, userId: string): Promise<SaveStateInfo[]> {
    const client = this._client;
    if (!client) return [];

    // Cloud records are the source of truth when authenticated: they carry the
    // real `updatedAt` and survive cross-device. Falls back to local IDB only
    // when unauthed or if the fetch fails (offline / 401 mid-session).
    const cloudBySlot = new Map<SaveSlot, SaveStateInfo>();
    if (psxAnywhereRepository.isAuthenticated()) {
      try {
        const serial = await psxAnywhereRepository.lookupDiscSerial(discId);
        const records = await psxAnywhereRepository.fetchSaveStatesFor(serial, userId);
        for (const dto of records) {
          if (
            dto.type !== 'auto' &&
            dto.type !== 'slot1' &&
            dto.type !== 'slot2' &&
            dto.type !== 'slot3'
          ) {
            continue;
          }
          const slot = dto.type as SaveSlot;
          cloudBySlot.set(slot, {
            id: `${discId}:${slot}`,
            slot,
            discId,
            updatedAt: dto.updated,
            blocks: 1,
          });
        }
      } catch {
        // Cloud unavailable — fall through to the local IDB probe.
      }
    }

    // Local IDB probe catches saves the facade wrote but hasn't synced yet
    // (or all saves when unauthed). Slots deleted this session are hidden.
    const meta = store.getState().saveMeta;
    const out: SaveStateInfo[] = [];
    for (const { value: slot } of SAVE_SLOTS) {
      const cloud = cloudBySlot.get(slot);
      if (cloud) {
        this._deletedSlots.delete(`${discId}:${slot}`);
        out.push(cloud);
        continue;
      }
      if (this._deletedSlots.has(`${discId}:${slot}`)) continue;
      let exists = false;
      try {
        exists = await client.hasState(mapSlot(slot));
      } catch {
        exists = false;
      }
      if (exists) {
        out.push({
          id: `${discId}:${slot}`,
          slot,
          discId,
          updatedAt: meta[`${discId}:${slot}`] ?? new Date(0).toISOString(),
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
    this._deletedSlots.delete(`${discId}:${slot}`);
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
    const key = `${discId}:${slot}`;
    // Hide the slot immediately even though the facade has no local-IDB
    // delete API — the local copy lingers until overwritten, but the UI no
    // longer surfaces it for the rest of this session.
    this._deletedSlots.add(key);
    if (psxAnywhereRepository.isAuthenticated()) {
      try {
        const serial = await psxAnywhereRepository.lookupDiscSerial(discId);
        await psxAnywhereRepository.deleteSaveStateBySlot(serial, slot, userId);
      } catch {
        // Cloud delete failed (already gone / network) — local hide still
        // applies; surface nothing, the slot is treated as empty now.
      }
    }
  }

  // --- memory cards (cloud + seeded UX defaults) -----------------------

  async listMemoryCards(userId: string): Promise<MemoryCardInfo[]> {
    const seeded = seedMemoryCards();
    if (!psxAnywhereRepository.isAuthenticated()) return seeded;
    try {
      const records = await psxAnywhereRepository.fetchMemcardsForUser(userId);
      const cloud = records.map<MemoryCardInfo>((r) => ({
        id: r.id,
        label: r.label || 'Memory Card',
        // Block counts require parsing the .mcd header; not cheap to fetch per
        // card, so return the PS1 card frame (15 blocks) and compute lazily.
        usedBlocks: 0,
        totalBlocks: 15,
      }));
      return [...cloud, ...seeded];
    } catch {
      return seeded;
    }
  }

  getMemorySlotAssignment(userId: string): MemorySlotAssignment {
    const stored = store.getState().slotAssignment[userId];
    if (stored) return stored;
    const cached = this._slotCache.get(userId);
    if (cached) return cached;
    const loaded = loadSlotAssignment(userId);
    this._slotCache.set(userId, loaded);
    return loaded;
  }

  setMemorySlot(port: 1 | 2, cardId: string | null, userId: string): void {
    const current = this.getMemorySlotAssignment(userId);
    const next: MemorySlotAssignment = {
      ...current,
      [port === 1 ? 'slot1' : 'slot2']: cardId,
    };
    this._slotCache.set(userId, next);
    store.getState().setSlotAssignment(userId, next);
    persistSlotAssignment(userId, next);
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
