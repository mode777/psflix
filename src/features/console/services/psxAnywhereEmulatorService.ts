import { create } from 'zustand';
import { EmulatorClient } from 'emulator-client';
import { parseMemoryCard } from 'mcrreader';
import { fileUrl } from '@/lib/pb-files';
import { queryClient } from '@/lib/queryClient';
import { showToast } from '@/lib/toast';
import type { DiscsResponse, GamesRegionOptions } from '@/types/pocketbase';
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
import { SAVE_SLOTS } from '../types';
import { FAST_FORWARD_ORDER } from '../types';
import type {
  MemoryCardManager,
  MemorySlotNumber,
  SlotBinding,
} from '../memcards/memoryCardManager';
import { createMemoryCardManager } from '../memcards/memoryCardManager';
import type { EmulatorService } from './emulator';
import { isPAL } from './psxRegion';
import { psxAnywhereRepository } from './psxAnywhereRepository';
import { PsxAnywhereMemoryCardStore } from './psxAnywhereMemoryCardStore';
import { loadSettings, saveSettings, loadControllers, saveControllers } from './persistedSlices';

const SLOT_BINDING_KEY = (userId: string) => `psflix:memcard-slots:${userId}`;
const AUTO_SAVE_INTERVAL_MS = 5 * 60_000;

// ── Binding cache (localStorage) ──────────────────────────────────────
// Repurposed from the orphaned `{slot1, slot2}` assignment map to hold the
// latest `{id, label}` binding per slot per user. Read synchronously at
// `attachCanvas` (before `boot()`) so the worker's memcard-load-request
// downloads the right cards. Tolerant of the legacy shape / malformed data.

type CachedBinding = SlotBinding | null;
type SlotBindingCache = { slot1: CachedBinding; slot2: CachedBinding };

function isBinding(v: unknown): v is SlotBinding {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as { id?: unknown }).id === 'string' &&
    typeof (v as { label?: unknown }).label === 'string'
  );
}

function loadBindingCache(userId: string): SlotBindingCache {
  try {
    const raw = localStorage.getItem(SLOT_BINDING_KEY(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as { slot1?: unknown; slot2?: unknown };
      return {
        slot1: isBinding(parsed.slot1) ? parsed.slot1 : null,
        slot2: isBinding(parsed.slot2) ? parsed.slot2 : null,
      };
    }
  } catch {
    /* ignore malformed */
  }
  return { slot1: null, slot2: null };
}

function saveBindingCache(userId: string, cache: SlotBindingCache): void {
  try {
    localStorage.setItem(SLOT_BINDING_KEY(userId), JSON.stringify(cache));
  } catch {
    // ignore (private mode / quota)
  }
}

/**
 * Map a PSflix SaveSlot ('auto'|'slot1'|'slot2'|'slot3') onto the facade's
 * numeric Slot. The facade's slotToType maps numeric `n` to `slot${n}`, with a
 * special case that `0` also maps to 'slot1' — so numeric slot 1 collides with
 * 0 (both → 'slot1'). typeToSlot mirrors this ('slot1' → 0, 'slot2' → 2,
 * 'slot3' → 3), so the canonical non-colliding numbers are 0, 2, 3. Slot 1 must
 * be skipped, otherwise slot2 keys into slot1's storage and the load-state UI
 * offers an empty slot2 that actually loads slot1's data.
 */
export function mapSlot(slot: SaveSlot): number | typeof EmulatorClient.SLOT_AUTO {
  if (slot === 'auto') return EmulatorClient.SLOT_AUTO;
  const n = Number(slot.replace('slot', '')); // slot1→1, slot2→2, slot3→3
  return n === 1 ? 0 : n; // slot1→0 (matches typeToSlot('slot1')); 2,3 unchanged
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

function nextFastForwardMode(mode: FastForwardMode): FastForwardMode {
  const i = FAST_FORWARD_ORDER.indexOf(mode);
  return FAST_FORWARD_ORDER[(i + 1) % FAST_FORWARD_ORDER.length]!;
}

type ServiceState = {
  runtime: PlayerRuntimeState;
  controllers: ControllerPorts;
  settings: ConsoleSettings;
  fastForwardMode: FastForwardMode;
  /** `${discId}:${slot}` → ISO timestamp of the last local save (session-only). */
  saveMeta: Record<string, string>;
  /** Bumped whenever the facade replaces the canvas, so listeners re-render. */
  canvasGen: number;
  syncStatus: SyncStatus;
  setRuntime: (patch: Partial<PlayerRuntimeState>) => void;
  setControllers: (patch: Partial<ControllerPorts>) => void;
  setSettings: (patch: Partial<ConsoleSettings>) => void;
  setFastForwardMode: (mode: FastForwardMode) => void;
  setSaveMeta: (key: string, iso: string) => void;
  bumpCanvas: () => void;
  setSyncStatus: (status: SyncStatus) => void;
};

const store = create<ServiceState>((set) => ({
  runtime: { status: 'idle', currentDiscId: null, elapsedMs: 0 },
  controllers: loadControllers(),
  settings: loadSettings(),
  fastForwardMode: '1x',
  saveMeta: {},
  canvasGen: 0,
  syncStatus: 'idle',
  setRuntime: (patch) => set((s) => ({ runtime: { ...s.runtime, ...patch } })),
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
  /** Cloud-aware memory-card manager owned by this service (built on demand). */
  private _memoryCardManager: MemoryCardManager | null = null;
  /** Cloud card library store backing the manager. */
  private readonly _cloudStore = new PsxAnywhereMemoryCardStore();
  /** Serializes reconcile passes so a rapid auth-toggle does not stack them. */
  private _reconcileSeq: Promise<void> = Promise.resolve();
  /** `${discId}:${slot}` slots deleted this session — hidden from the local
   *  IDB probe in `listSaveStates` until a new save overwrites them. */
  private readonly _deletedSlots = new Set<string>();
  /** Canvas click → pointer-lock binding (installed while a mouse port is live). */
  private _pointerLockCanvas: HTMLCanvasElement | null = null;
  private _pointerLockClickHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Construct (once) the cloud-aware memory-card manager wired to this service:
   * the cloud store backs the library, and the binding callback pushes mount/
   * eject/rename changes into the vendored sync engine + the localStorage
   * binding cache. WS5 exports the resulting singleton from `services/index.ts`.
   */
  buildMemoryCardManager(): MemoryCardManager {
    if (this._memoryCardManager) return this._memoryCardManager;
    const onBindingChange = (slot: MemorySlotNumber, binding: SlotBinding | null): void => {
      this._client?.setMemcardSlotBinding(slot, binding);
      this._persistBindingCache(slot, binding);
    };
    this._memoryCardManager = createMemoryCardManager(this, this._cloudStore, onBindingChange);
    return this._memoryCardManager;
  }

  // --- lifecycle -------------------------------------------------------

  async attachCanvas(canvas: HTMLCanvasElement): Promise<void> {
    if (this._client) return; // idempotent
    // Session-scoped setting: every emulator load starts from 1x.
    this._setFastForwardMode('1x');
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
    // Set initial slot bindings from the per-user cache BEFORE boot so the
    // worker's memcard-load-request downloads the right cards. Without this,
    // the worker boots with no bindings and downloads nothing (fresh-device
    // gap until the auth reconcile lands).
    const userId = psxAnywhereRepository.getCurrentUserId();
    if (userId) {
      const cache = loadBindingCache(userId);
      client.setMemcardSlotBinding(1, cache.slot1);
      client.setMemcardSlotBinding(2, cache.slot2);
    }
    await client.boot();
    // The facade boots with a default standard pad + CRT on, ignoring our
    // persisted config — push the stored settings + controller ports in.
    this._applyConfig(client);
    this._attachPointerLock(canvas);
    // The vendored client only dispatches `auth-change` on explicit sign-in/out
    // (pb.authStore.onChange), NOT for the already-authed-at-attach case (a
    // persisted token restored at load never fires onChange, and the client's
    // construction-time auth probe at EmulatorClient.ts:172 doesn't dispatch the
    // event). Without this, setUserId never runs and every cloud-gated manager
    // op silently falls back to session-only — cards never reach the cloud and
    // bindings point at non-existent UUID records. Reconcile sets the userId,
    // hydrates the cloud library, derives bindings from cloud `mounted`, seeds a
    // default card if needed, and triggers a download pass. The existing
    // `auth-change` listener still handles sign-in-while-console-open; both are
    // serialized through `_reconcileSeq` so concurrent passes queue safely.
    if (userId) void this._reconcileMemoryCards(userId);
  }

  destroy(): void {
    this._detachPointerLock();
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
      if (detail?.canvas) {
        this._canvasRef = detail.canvas;
        // The facade swapped the canvas on reset(); re-bind click→lock to it.
        this._attachPointerLock(detail.canvas);
      }
      store.getState().bumpCanvas();
    });
    // A local save just landed (manual or auto): the facade queues a cloud
    // upload for it. Flip to "syncing" and invalidate so the UI shows the
    // fresh local timestamp; the next `state-sync-complete` flips to "synced".
    client.addEventListener('state-saved', () => {
      store.getState().setSyncStatus('syncing');
      this._invalidateSaveStateQueries();
    });
    // A sync pass finished *and reconciled something* (the facade only fires
    // this event when an upload or download actually happened, not every idle
    // tick). Save-states are queried once on console load and cached; we do NOT
    // invalidate here — the per-save `state-saved` handler already refreshes
    // the UI immediately after a local save, and uploads are drained by the
    // facade's own timer. Re-querying on every pass would re-hit PocketBase
    // roughly every second; cross-device updates appear on next load/auth.
    client.addEventListener('state-sync-complete', () => {
      store.getState().setSyncStatus('synced');
    });
    // Memory card sync started (upload or download).
    client.addEventListener('memcard-sync-start', () => {
      store.getState().setSyncStatus('syncing');
    });
    // Memory card sync finished. Cloud state may have changed (another device
    // or the just-completed download pass): refresh the manager's library so
    // the editor shows fresh bytes + invalidate the react-query list. This is
    // a LIGHT refresh — it must NOT call syncMemcards() again or the two would
    // loop (sync-complete → reconcile → syncMemcards → sync-complete → …).
    client.addEventListener('memcard-sync-complete', () => {
      store.getState().setSyncStatus('synced');
      const userId = psxAnywhereRepository.getCurrentUserId();
      if (userId) void this._refreshMemoryCards(userId);
      else queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
    });
    client.addEventListener('auth-change', (e) => {
      const detail = (e as CustomEvent).detail as { authed?: boolean } | undefined;
      const authed = !!detail?.authed;
      store.getState().setSyncStatus(authed ? 'syncing' : 'idle');
      if (authed) {
        const userId = psxAnywhereRepository.getCurrentUserId();
        if (userId) void this._reconcileMemoryCards(userId);
      } else {
        this._onSignOut();
      }
    });
  }

  /** Invalidate every save-state query (any disc/user). */
  private _invalidateSaveStateQueries(): void {
    queryClient.invalidateQueries({ queryKey: ['save-states'] });
  }

  /**
   * Push persisted CRT + volume settings into the live client. These are
   * client-side (shader toggle / audio gain) and are not reset by the libretro
   * core, so they can be applied at boot. Controller ports are applied in
   * `loadDisc()` instead — they are core state wiped by `retro_load_game`.
   */
  private _applyConfig(client: EmulatorClient): void {
    const {
      settings: { crtFilter },
      fastForwardMode,
    } = store.getState();
    client.setCrt(crtFilter);
    client.setFastForwardMode(fastForwardMode);
    this._applyEffectiveVolume(client);
  }

  /** Apply output gain derived from master volume + current speed mode policy. */
  private _applyEffectiveVolume(client: EmulatorClient): void {
    const {
      settings: { masterVolume },
      fastForwardMode,
    } = store.getState();
    const gain = fastForwardMode === '1x' ? masterVolume / 100 : 0;
    client.setVolume(gain);
  }

  /** Persist session mode + push runtime side effects (speed + effective gain). */
  private _setFastForwardMode(mode: FastForwardMode): void {
    store.getState().setFastForwardMode(mode);
    const client = this._client;
    if (!client) return;
    client.setFastForwardMode(mode);
    this._applyEffectiveVolume(client);
  }

  /** Push a single port's device type into the live core. */
  private _applyController(client: EmulatorClient, port: 1 | 2, type: ControllerType): void {
    const device = mapControllerType(type);
    if (device === 0) {
      client.clearController(port - 1);
    } else {
      client.setController(port - 1, { device, source: 'keyboard' });
    }
  }

  /** True when any port currently has the PS1 mouse selected. */
  private _isMousePortActive(): boolean {
    const { port1, port2 } = store.getState().controllers;
    return port1 === 'mouse' || port2 === 'mouse';
  }

  /**
   * Bind a click handler to the canvas that locks the pointer when a mouse
   * port is active. The PS1 mouse needs relative deltas (movementX/Y), which
   * are only usable while the cursor is captured. PSxAnywhere deliberately
   * leaves pointer lock to the host; PSflix owns it here.
   */
  private _attachPointerLock(canvas: HTMLCanvasElement): void {
    this._detachPointerLock();
    const handler = () => {
      if (this._isMousePortActive() && document.pointerLockElement !== canvas) {
        // requestPointerLock can reject if called within the browser's brief
        // exit cooldown; swallow that so a rapid click doesn't throw.
        canvas.requestPointerLock().catch(() => {});
      }
    };
    canvas.addEventListener('click', handler);
    this._pointerLockCanvas = canvas;
    this._pointerLockClickHandler = handler;
  }

  private _detachPointerLock(): void {
    if (this._pointerLockCanvas && this._pointerLockClickHandler) {
      this._pointerLockCanvas.removeEventListener('click', this._pointerLockClickHandler);
    }
    this._pointerLockCanvas = null;
    this._pointerLockClickHandler = null;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // --- player lifecycle ------------------------------------------------

  async loadDisc(disc: DiscsResponse, region?: GamesRegionOptions): Promise<void> {
    this._lastDisc = disc;
    const client = this._requireClient();
    const iso = disc.iso;
    if (!iso) throw new Error('This disc has no game image attached.');
    const chdUrl = fileUrl(disc, iso);
    store.getState().setRuntime({ status: 'loading', currentDiscId: disc.id, elapsedMs: 0 });
    await client.loadDisc({ chdUrl, serial: disc.serial, pal: isPAL(region, disc.serial) });
    // The core only fully initializes here (host_init → retro_init, then
    // host_load → retro_load_game); pushing port devices earlier is wiped by
    // retro_load_game, so apply the persisted controller config *after* load.
    const { port1, port2 } = store.getState().controllers;
    this._applyController(client, 1, port1);
    this._applyController(client, 2, port2);
    this._setFastForwardMode('1x');
    store.getState().setRuntime({ status: 'paused' });
  }

  async swapDisc(disc: DiscsResponse, region?: GamesRegionOptions): Promise<void> {
    this._lastDisc = disc;
    const client = this._client;
    if (!client) return this.loadDisc(disc, region);
    const iso = disc.iso;
    if (!iso) throw new Error('This disc has no game image attached.');
    const chdUrl = fileUrl(disc, iso);
    store.getState().setRuntime({ status: 'loading', currentDiscId: disc.id });
    await client.swapDisc(chdUrl, { serial: disc.serial, pal: isPAL(region, disc.serial) });
    this._setFastForwardMode('1x');
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
    // reset() recreates the core (new Emulator), which loses CRT/volume and
    // does not re-call setPortDevice — re-push our stored config.
    this._applyConfig(client);
    await this.loadDisc(disc);
    await this.play();
    this._setFastForwardMode('1x');
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

    // Cloud records are the source of truth when authenticated: they carry the
    // real `updatedAt` and survive cross-device. This path needs no emulator
    // client, so it runs on the details view too (where the console isn't
    // mounted yet) — otherwise Continue would never light up on first visit.
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
    // It requires a live client; without one (details view) only cloud saves
    // are reported.
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
      if (!client) continue;
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

  // --- memory cards (cloud library + live bytes) ------------------------

  async listMemoryCards(userId: string): Promise<MemoryCardInfo[]> {
    if (!psxAnywhereRepository.isAuthenticated()) return [];
    try {
      const records = await psxAnywhereRepository.fetchMemcardsForUser(userId);
      const out: MemoryCardInfo[] = [];
      for (const r of records) {
        let usedBlocks = 0;
        let totalBlocks = 15;
        // Eagerly fetch + parse the .mcd header for real block counts. v1
        // acceptable per the spec's perf trade-off; revisit with lazy fetch if
        // libraries grow. A spare card with no file throws → defaults remain.
        try {
          const { buf } = await psxAnywhereRepository.downloadMemcard(userId, r.label);
          const parsed = parseMemoryCard(new Uint8Array(buf));
          usedBlocks = parsed.totalBlocks - parsed.freeBlocks;
          totalBlocks = parsed.totalBlocks;
        } catch {
          /* leave defaults (0 / 15) */
        }
        out.push({
          id: r.id,
          label: r.label || 'Memory Card',
          usedBlocks,
          totalBlocks,
          mounted: r.mounted,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  // --- memory-card orchestration (cloud ↔ vendored facade) -------------

  /** Update the per-user binding cache entry for one slot (called from the
   *  manager's `onBindingChange` callback). No-op when signed out. */
  private _persistBindingCache(slot: MemorySlotNumber, binding: CachedBinding): void {
    const userId = psxAnywhereRepository.getCurrentUserId();
    if (!userId) return;
    const cache = loadBindingCache(userId);
    if (slot === 1) cache.slot1 = binding;
    else cache.slot2 = binding;
    saveBindingCache(userId, cache);
  }

  /** Light refresh after a memcard sync pass: re-pull the manager's cloud
   *  library + mount markers (so the editor reflects fresh library state) +
   *  invalidate the react-query list. Deliberately calls `refreshLibrary`
   *  (NOT `hydrate`) so the running emulator's slot bytes are NOT re-exported
   *  or clobbered — cross-device downloads apply on the next boot via IDB
   *  (apply-on-next-boot). Also does NOT call syncMemcards (would loop). */
  private async _refreshMemoryCards(userId: string): Promise<void> {
    if (this._memoryCardManager) {
      try {
        await this._memoryCardManager.refreshLibrary(userId);
      } catch {
        /* ignore — refresh is best-effort */
      }
    }
    queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
  }

  /** Full reconcile on auth: cloud is authoritative for `mounted`. Hydrate the
   *  manager, re-derive slot bindings from the refreshed library, push them to
   *  the sync engine + cache, then trigger a download pass so both mounted
   *  cards' bytes land in IDB for the next boot. Serialized so a rapid
   *  auth-toggle runs passes sequentially (no throw, last state wins). */
  private _reconcileMemoryCards(userId: string): Promise<void> {
    this._reconcileSeq = this._reconcileSeq
      .then(() => this._doReconcile(userId))
      .catch(() => {
        /* a failed reconcile must not break the chain */
      });
    return this._reconcileSeq;
  }

  private async _doReconcile(userId: string): Promise<void> {
    const manager = this._memoryCardManager;
    if (!manager) return;
    // 1. Refresh the manager's library + slot bytes from cloud + live export.
    manager.setUserId(userId);
    await manager.hydrate(userId);

    // 2. First-time user (no cloud cards yet): seed a 'default' card in slot 1
    //    so the emulator has a mounted card (preserves the legacy phase-2
    //    default). Cloud-only — if the create fails (network / cloud down) it
    //    is skipped and retried on the next reconcile, rather than falling back
    //    to a session-only card that could never sync. The blank image is
    //    byte-identical to the fresh MEMFS card the worker already created, so
    //    there is no observable difference on the first session — subsequent
    //    boots restore it from IDB (apply-on-next-boot).
    try {
      await manager.ensureDefaultCard(1);
    } catch {
      // Cloud create/mount failed — retry on the next reconcile.
    }

    // 3. Re-derive bindings from the refreshed `mounted` fields and push to
    //    the sync engine (cloud authoritative; the cache follows).
    const lib = manager.getState().library;
    const bind = (slot: MemorySlotNumber): void => {
      const card = lib.find((c) => c.mounted === slot);
      const binding: SlotBinding | null = card ? { id: card.id, label: card.label } : null;
      this._client?.setMemcardSlotBinding(slot, binding);
      this._persistBindingCache(slot, binding);
    };
    bind(1);
    bind(2);

    // 4. Trigger a download pass so both mounted cards' bytes land in IDB for
    //    the next boot (apply-on-next-boot). This fires memcard-sync-complete
    //    when done → the light refresh above (no loop).
    await this._client?.syncMemcards();

    // 5. Invalidate the react-query list so any subscriber re-fetches.
    queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
  }

  /** Sign-out: clear vendored bindings + the manager's user so it falls back
   *  to session-only. The library is wiped on the next sign-in's hydrate. */
  private _onSignOut(): void {
    this._client?.setMemcardSlotBinding(1, null);
    this._client?.setMemcardSlotBinding(2, null);
    this._memoryCardManager?.setUserId(null);
  }

  // --- live memory card bytes (session-scoped) ---------------------------

  async exportMemcard(slot: 1 | 2): Promise<Uint8Array | null> {
    const client = this._client;
    if (!client) return null;
    try {
      return await client.exportMemcard(slot);
    } catch {
      return null;
    }
  }

  async importMemcard(slot: 1 | 2, buf: ArrayBuffer | Uint8Array): Promise<void> {
    const client = this._client;
    if (!client) return;
    const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // `view` is always backed by a plain ArrayBuffer (never a SAB here).
    await client.importMemcard(slot, view.slice().buffer as ArrayBuffer);
  }

  // --- controller ports ------------------------------------------------

  getControllerPorts(): ControllerPorts {
    return store.getState().controllers;
  }

  setController(port: 1 | 2, type: ControllerType): void {
    store.getState().setControllers({ [port === 1 ? 'port1' : 'port2']: type });
    const client = this._client;
    if (client) this._applyController(client, port, type);
    // Drop pointer capture when no port is using the mouse anymore.
    if (!this._isMousePortActive() && document.pointerLockElement) {
      document.exitPointerLock();
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
    if (prev.masterVolume !== next.masterVolume) this._applyEffectiveVolume(client);
  }

  subscribeSettings(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  getFastForwardMode(): FastForwardMode {
    return store.getState().fastForwardMode;
  }

  setFastForwardMode(mode: FastForwardMode): void {
    this._setFastForwardMode(mode);
  }

  cycleFastForwardMode(): FastForwardMode {
    const next = nextFastForwardMode(store.getState().fastForwardMode);
    this._setFastForwardMode(next);
    return next;
  }

  subscribeFastForwardMode(listener: () => void): () => void {
    return store.subscribe(listener);
  }

  // --- internal --------------------------------------------------------

  private _requireClient(): EmulatorClient {
    if (!this._client) throw new Error('Emulator not attached — call attachCanvas first.');
    return this._client;
  }
}
