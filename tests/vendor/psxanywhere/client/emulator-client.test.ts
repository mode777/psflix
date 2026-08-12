'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONTROLLER, BUTTON, BUTTON_LABELS, CRT_SHADER_DEFAULT_PARAMS } from 'emulator-core';
import type { Repository } from 'repository';
import type { InputHandle } from '@/vendor/psxanywhere/client/input';

// ---------------------------------------------------------------------------
// Mock Emulator (EventTarget + lifecycle stubs)
// ---------------------------------------------------------------------------

interface MockEmulator extends EventTarget {
  destroyed: boolean;
  init(): Promise<void>;
  loadDisc(_req: any): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
  setPortDevice(_port: number, _device: number): void;
  flushMemcards(): void;
  setVolume(_v: number): void;
  setCrt(_on: boolean): void;
  setCrtParam(_key: string, _value: number): void;
  screenshot(): Promise<Blob | null>;
  evictCache(): Promise<void>;
  getStats(): Record<string, unknown>;
  getCdromId(): string | null;
  getCurrentDiscUrl(): string | null;
  swapDisc(_url: string): Promise<void>;
  sendMemcardsToWorker(_cards: Map<number, Uint8Array | null>): void;
  exportMemcard(_slot: number): Promise<Uint8Array | null>;
  importMemcard(_slot: number, _buf: ArrayBuffer): Promise<void>;
  loadState(_slot: any, _raw: ArrayBuffer): Promise<void>;
  saveState(_slot: any): Promise<ArrayBuffer | null>;
}

function createMockEmulator(): MockEmulator {
  const target = new EventTarget() as MockEmulator;
  target.destroyed = false;
  target.init = vi.fn(
    async function (this: MockEmulator) {
      this.dispatchEvent(new CustomEvent('ready', { detail: { info: 'test-ready' } }));
    }.bind(target),
  );
  target.loadDisc = vi.fn(
    async function (this: MockEmulator) {
      this.dispatchEvent(new CustomEvent('loaded', { detail: {} }));
    }.bind(target),
  );
  target.start = vi.fn(async () => {});
  target.stop = vi.fn(
    function (this: MockEmulator) {
      this.dispatchEvent(new CustomEvent('stopped', { detail: {} }));
    }.bind(target),
  );
  target.destroy = vi.fn(
    function (this: MockEmulator) {
      this.destroyed = true;
    }.bind(target),
  );
  target.setPortDevice = vi.fn();
  target.flushMemcards = vi.fn();
  target.setVolume = vi.fn();
  target.setCrt = vi.fn();
  target.setCrtParam = vi.fn();
  target.screenshot = vi.fn(async () => null);
  target.evictCache = vi.fn(async () => {});
  target.getStats = vi.fn(() => ({}));
  target.getCdromId = vi.fn(() => null);
  target.getCurrentDiscUrl = vi.fn(() => null);
  target.swapDisc = vi.fn(async () => {});
  target.sendMemcardsToWorker = vi.fn();
  target.exportMemcard = vi.fn(async () => new Uint8Array([1, 2, 3]));
  target.importMemcard = vi.fn(async () => {});
  target.loadState = vi.fn(async () => {});
  target.saveState = vi.fn(async () => new ArrayBuffer(16));
  return target;
}

// Track all MockEmulatorClass instances created, so tests can access the
// underlying mock for assertions. Index 0 = first boot, index 1 = after first
// reset, etc.
const mockInstances: MockEmulator[] = [];

// ---------------------------------------------------------------------------
// Replace the Emulator class entirely. The real Emulator constructor checks
// crossOriginIsolated / OffscreenCanvas / AudioContext which are unavailable
// in jsdom. The MockEmulatorClass delegates all EventTarget operations
// (addEventListener/removeEventListener/dispatchEvent) and lifecycle methods
// to an internal MockEmulator instance.
// ---------------------------------------------------------------------------

vi.mock('emulator-core', async (importOriginal) => {
  const orig: any = await importOriginal();

  class MockEmulatorClass extends EventTarget {
    static CONTROLLER = orig.CONTROLLER;
    static BUTTON = orig.BUTTON;
    static SLOT_AUTO = 'auto' as const;

    private _mock: MockEmulator;

    constructor(_opts: any) {
      super();
      this._mock = createMockEmulator();
      mockInstances.push(this._mock);
    }

    // ── EventTarget delegation ──
    addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
      this._mock.addEventListener(...args);
    }
    removeEventListener(...args: Parameters<EventTarget['removeEventListener']>) {
      this._mock.removeEventListener(...args);
    }
    dispatchEvent(...args: Parameters<EventTarget['dispatchEvent']>) {
      return this._mock.dispatchEvent(...args);
    }

    // ── Lifecycle ──
    init() {
      return this._mock.init();
    }
    loadDisc(req: any) {
      return this._mock.loadDisc(req);
    }
    start() {
      return this._mock.start();
    }
    stop() {
      return this._mock.stop();
    }
    destroy() {
      return this._mock.destroy();
    }
    setPortDevice(p: number, d: number) {
      return this._mock.setPortDevice(p, d);
    }
    flushMemcards() {
      return this._mock.flushMemcards();
    }
    setVolume(v: number) {
      return this._mock.setVolume(v);
    }
    setCrt(on: boolean) {
      return this._mock.setCrt(on);
    }
    setCrtParam(k: string, v: number) {
      return this._mock.setCrtParam(k, v);
    }
    screenshot() {
      return this._mock.screenshot();
    }
    evictCache() {
      return this._mock.evictCache();
    }
    getStats() {
      return this._mock.getStats();
    }
    getCdromId() {
      return this._mock.getCdromId();
    }
    getCurrentDiscUrl() {
      return this._mock.getCurrentDiscUrl();
    }
    swapDisc(url: string) {
      return this._mock.swapDisc(url);
    }
    sendMemcardsToWorker(cards: Map<number, Uint8Array | null>) {
      return this._mock.sendMemcardsToWorker(cards);
    }
    exportMemcard(slot: number) {
      return this._mock.exportMemcard(slot);
    }
    importMemcard(slot: number, buf: ArrayBuffer) {
      return this._mock.importMemcard(slot, buf);
    }
    loadState(slot: any, raw: ArrayBuffer) {
      return this._mock.loadState(slot, raw);
    }
    saveState(slot: any) {
      return this._mock.saveState(slot);
    }
  }

  return {
    ...orig,
    Emulator: MockEmulatorClass,
  };
});

// Import after vi.mock so the mock is active.
import {
  EmulatorClient,
  type EmulatorClientOptions,
} from '@/vendor/psxanywhere/client/EmulatorClient';
import { Emulator } from 'emulator-core';
import { InMemorySaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import { InMemoryMemcardStorage } from '@/vendor/psxanywhere/client/memcardStorage';
import {
  MemoryControllerStorage,
  ControllerStore,
} from '@/vendor/psxanywhere/client/controller-store';
import type { ControllerStoreEntry } from '@/vendor/psxanywhere/client/controller-store';
import { UNSYNCED } from '@/vendor/psxanywhere/client/slotKey';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepoStub(overrides: Partial<Repository> = {}): Repository {
  return {
    isAuthenticated: () => false,
    currentUsername: () => null,
    onAuthChange: () => {},
    loginWithEmailPassword: async () => {},
    registerWithEmailPassword: async () => {},
    logout: () => {},
    getCurrentUserId: () => null,
    fetchGames: async () => [],
    fetchBiosUrl: async () => 'http://example.com/bios.bin',
    resolveDiscId: async () => '',
    lookupDiscSerial: async () => '',
    uploadSaveState: async () => ({
      id: '',
      updated: '',
      type: '',
      discId: '',
      dataFilename: '',
      discSerial: null,
    }),
    downloadSaveState: async () => ({ buf: new ArrayBuffer(0), recordId: '', updated: '' }),
    fetchSaveStateBytes: async () => new ArrayBuffer(0),
    hasRemoteState: async () => false,
    getSaveStateRecord: async () => ({
      id: '',
      updated: '',
      type: '',
      discId: '',
      dataFilename: '',
      discSerial: null,
    }),
    fetchNewerSaveStates: async () => [],
    fetchSaveStatesFor: async () => [],
    uploadMemcard: async () => ({}),
    downloadMemcard: async () => ({ buf: new ArrayBuffer(0), recordId: '', updated: '' }),
    hasRemoteMemcard: async () => false,
    ...overrides,
  };
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function makeOpts(overrides: Partial<EmulatorClientOptions> = {}): EmulatorClientOptions {
  return {
    canvas: makeCanvas(),
    repository: createRepoStub(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmulatorClient', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Static re-exports ───────────────────────────────────────────────

  it('exposes CONTROLLER, BUTTON, BUTTON_LABELS, SLOT_AUTO, CRT_SHADER_DEFAULT_PARAMS as statics', () => {
    expect(EmulatorClient.CONTROLLER).toBe(CONTROLLER);
    expect(EmulatorClient.BUTTON).toBe(BUTTON);
    expect(EmulatorClient.BUTTON_LABELS).toBe(BUTTON_LABELS);
    expect(EmulatorClient.SLOT_AUTO).toBe(Emulator.SLOT_AUTO);
    expect(EmulatorClient.CRT_SHADER_DEFAULT_PARAMS).toBe(CRT_SHADER_DEFAULT_PARAMS);
  });

  it('exposes gamepadButtonName, controllerTypeName, formatDeviceHex as statics', () => {
    expect(EmulatorClient.gamepadButtonName(0)).toBe('A');
    expect(EmulatorClient.controllerTypeName(CONTROLLER.STANDARD)).toBe('standard');
    expect(EmulatorClient.formatDeviceHex(0x401)).toBe('0x401');
  });

  // ── Construction ────────────────────────────────────────────────────

  it('throws if constructed without a canvas', () => {
    expect(() => new EmulatorClient(makeOpts({ canvas: null as any }))).toThrow(
      'canvas is required',
    );
  });

  // ── Boot ────────────────────────────────────────────────────────────

  it('boot() resolves and input becomes accessible', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    expect(client.input).toBeDefined();
    expect(typeof client.input.attachController).toBe('function');
    client.destroy();
  });

  it('throws if boot() is called twice', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    await expect(client.boot()).rejects.toThrow('already booted');
    client.destroy();
  });

  it('input getter throws before boot', () => {
    const client = new EmulatorClient(makeOpts());
    expect(() => client.input).toThrow('not booted');
    client.destroy();
  });

  // ── Event re-emission ───────────────────────────────────────────────

  it('re-emits ready from the underlying Emulator', async () => {
    const client = new EmulatorClient(makeOpts());
    const readyFn = vi.fn();
    client.addEventListener('ready', readyFn);
    await client.boot();
    expect(readyFn).toHaveBeenCalledTimes(1);
    expect(readyFn.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect((readyFn.mock.calls[0][0] as CustomEvent).detail.info).toBe('test-ready');
    client.destroy();
  });

  // ── Reset ───────────────────────────────────────────────────────────

  it('reset() destroys old Emulator and creates a new one', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock1 = mockInstances[0]; // first boot's mock
    expect(mock1.destroyed).toBe(false);

    await client.reset();
    const mock2 = mockInstances[1]; // second boot's mock (after reset)

    expect(mock1.destroyed).toBe(true);
    expect(mock2.destroyed).toBe(false);
    client.destroy();
  });

  it('reset() emits canvas-replaced with a new canvas', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();

    const replacedFn = vi.fn();
    client.addEventListener('canvas-replaced', replacedFn);
    await client.reset();

    expect(replacedFn).toHaveBeenCalledTimes(1);
    const newCanvas = replacedFn.mock.calls[0][0].detail.canvas;
    expect(newCanvas).toBeInstanceOf(HTMLCanvasElement);
    client.destroy();
  });

  it('client.input after reset points to the new InputController', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const input1 = client.input;

    await client.reset();
    const input2 = client.input;

    expect(input2).not.toBe(input1);
    expect(typeof input2.attachController).toBe('function');
    client.destroy();
  });

  // ── Generation guard ────────────────────────────────────────────────

  it('late event from old Emulator is NOT re-emitted (generation guard)', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock1 = mockInstances[0];

    const loadedFn = vi.fn();
    client.addEventListener('loaded', loadedFn);

    await client.reset();

    // Emit loaded on the OLD (destroyed) mock
    mock1.dispatchEvent(new CustomEvent('loaded', { detail: {} }));
    expect(loadedFn).not.toHaveBeenCalled();
    client.destroy();
  });

  // ── Destroy ─────────────────────────────────────────────────────────

  it('destroy() is idempotent', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    client.destroy();
    expect(mock.destroyed).toBe(true);
    // second destroy should not throw
    client.destroy();
  });

  // ── Disc + run control ──────────────────────────────────────────────

  it('loadDisc() delegates to the underlying Emulator', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    const bios = new ArrayBuffer(256);
    await client.loadDisc({ chdUrl: 'http://example.com/game.chd', bios });
    expect(mock.loadDisc).toHaveBeenCalledWith({
      bios,
      chdUrl: 'http://example.com/game.chd',
      onProgress: undefined,
      pal: false,
    });
    client.destroy();
  });

  it('loadDisc() fetches BIOS via BiosLoader when biosUrl is given', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(512),
        }) as any,
    );
    try {
      const client = new EmulatorClient(makeOpts());
      await client.boot();
      const mock = mockInstances[0];
      await client.loadDisc({
        chdUrl: 'http://example.com/game.chd',
        biosUrl: 'http://example.com/bios.bin',
      });
      expect(mock.loadDisc).toHaveBeenCalled();
      const req = (mock.loadDisc as any).mock.calls[0][0];
      expect(req.bios).toBeInstanceOf(ArrayBuffer);
      expect(req.chdUrl).toBe('http://example.com/game.chd');
      client.destroy();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('loadDisc() fetches BIOS from repo.fetchBiosUrl when no bios/biosUrl', async () => {
    const fetchBiosUrl = vi.fn(async () => 'http://repo-bios.bin');
    const repo = createRepoStub({ fetchBiosUrl });
    // We need to stub global fetch for the BiosLoader
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(1024),
        }) as any,
    );
    try {
      const client = new EmulatorClient(makeOpts({ repository: repo }));
      await client.boot();
      const mock = mockInstances[0];
      await client.loadDisc({ chdUrl: 'http://example.com/game.chd' });
      expect(fetchBiosUrl).toHaveBeenCalled();
      expect(mock.loadDisc).toHaveBeenCalled();
      client.destroy();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('loadDisc() sets currentDiscSerial from serial param', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    expect(client.getCurrentDiscSerial()).toBe('SLUS001');
    client.destroy();
  });

  it('loadDisc() falls back to cdromId when no serial param', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    (mock.getCdromId as any).mockReturnValue('SLUS002');
    await client.loadDisc({ chdUrl: 'http://example.com/game.chd', bios: new ArrayBuffer(1) });
    expect(client.getCurrentDiscSerial()).toBe('SLUS002');
    client.destroy();
  });

  it('start() / stop() delegate and track isRunning', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    expect(client.isRunning).toBe(false);
    await client.start();
    expect(client.isRunning).toBe(true);
    mock.dispatchEvent(new CustomEvent('stopped', { detail: {} }));
    expect(client.isRunning).toBe(false);
    client.destroy();
  });

  // ── Passthroughs ────────────────────────────────────────────────────

  it('setCrt, setVolume, setCrtParam delegate to the emulator', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    client.setCrt(true);
    expect(mock.setCrt).toHaveBeenCalledWith(true);
    client.setVolume(0.5);
    expect(mock.setVolume).toHaveBeenCalledWith(0.5);
    client.setCrtParam('gamma', 2.2);
    expect(mock.setCrtParam).toHaveBeenCalledWith('gamma', 2.2);
    client.destroy();
  });

  // ── Controller management ───────────────────────────────────────────

  it('setController / getController / clearController work', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    expect(client.getController(0)).not.toBeNull();
    client.clearController(0);
    expect(client.getController(0)).toBeNull();
    client.setController(0, { device: CONTROLLER.ANALOG, source: 'gamepad', gamepadIndex: 2 });
    const cfg = client.getController(0);
    expect(cfg).not.toBeNull();
    expect(cfg!.device).toBe(CONTROLLER.ANALOG);
    expect(cfg!.source).toBe('gamepad');
    expect(cfg!.gamepadIndex).toBe(2);
    client.destroy();
  });

  it('setController persists to controller store', async () => {
    const storage = new MemoryControllerStorage();
    const store = new ControllerStore(storage);
    // Pre-load to make loadControllersStore use memory (not possible directly;
    // instead, verify via getControllerStore after setController).
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    client.setController(1, { device: CONTROLLER.ANALOG, source: 'gamepad', gamepadIndex: 3 });
    const storeSnapshot = client.getControllerStore();
    expect(storeSnapshot[1]).toBeDefined();
    expect(storeSnapshot[1].device).toBe(CONTROLLER.ANALOG);
    expect(storeSnapshot[1].source).toBe('gamepad');
    expect(storeSnapshot[1].gamepadIndex).toBe(3);
    client.destroy();
  });

  it('getControllerStore returns persisted store', async () => {
    // Clear any leftover localStorage from other tests
    localStorage.clear();
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    // Persist a controller via setController
    client.setController(0, { device: CONTROLLER.STANDARD, source: 'keyboard' });
    const store = client.getControllerStore();
    expect(store).toBeDefined();
    expect(store[0]).toBeDefined();
    expect(store[0].device).toBe(CONTROLLER.STANDARD);
    expect(store[0].source).toBe('keyboard');
    client.destroy();
  });

  // ── Save / load state ───────────────────────────────────────────────

  it('saveState() delegates to SaveLoadController', async () => {
    const saveStateStorage = new InMemorySaveStateStorage();
    const client = new EmulatorClient(makeOpts({ saveStateStorage }));
    await client.boot();
    const mock = mockInstances[0];
    (mock.getCdromId as any).mockReturnValue('SLUS001');
    (mock.getCurrentDiscUrl as any).mockReturnValue('http://example.com/game.chd');
    // Set a disc serial so saveState doesn't no-op
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    await client.start();
    await client.saveState(0);
    expect(mock.saveState).toHaveBeenCalled();
    client.destroy();
  });

  it('saveState() no-ops when no disc serial', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    await client.saveState(0);
    expect(mock.saveState).not.toHaveBeenCalled();
    client.destroy();
  });

  it('loadState() delegates to SaveLoadController', async () => {
    const saveStateStorage = new InMemorySaveStateStorage();
    // Pre-populate a save state
    const { buildSaveStateHeader } = await import('@/vendor/psxanywhere/client/saveStateHeader');
    const coreBuf = new ArrayBuffer(16);
    const buf = buildSaveStateHeader(coreBuf, 'http://example.com/game.chd', 'SLUS001');
    const { compositeKey } = await import('@/vendor/psxanywhere/client/slotKey');
    await saveStateStorage.put({
      id: compositeKey('SLUS001', 0),
      buf,
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: Date.now(),
      synced: UNSYNCED,
      pocketbaseId: null,
      serverUpdated: null,
    });

    const client = new EmulatorClient(makeOpts({ saveStateStorage }));
    await client.boot();
    const mock = mockInstances[0];
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    await client.loadState(0);
    expect(mock.loadState).toHaveBeenCalled();
    client.destroy();
  });

  it('loadState() no-ops when no disc serial', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    await client.loadState(0);
    expect(mock.loadState).not.toHaveBeenCalled();
    client.destroy();
  });

  it('hasState() returns false when no disc serial', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const result = await client.hasState(0);
    expect(result).toBe(false);
    client.destroy();
  });

  it('hasState() delegates to SaveStateStore', async () => {
    const saveStateStorage = new InMemorySaveStateStorage();
    // Pre-populate a save state
    const { compositeKey } = await import('@/vendor/psxanywhere/client/slotKey');
    await saveStateStorage.put({
      id: compositeKey('SLUS001', 0),
      buf: new ArrayBuffer(16),
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: Date.now(),
      synced: UNSYNCED,
      pocketbaseId: null,
      serverUpdated: null,
    });

    const client = new EmulatorClient(makeOpts({ saveStateStorage }));
    await client.boot();
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    const result = await client.hasState(0);
    expect(result).toBe(true);
    client.destroy();
  });

  it('loadStateFromFile() strips PSAS header and loads raw bytes', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    const { buildSaveStateHeader } = await import('@/vendor/psxanywhere/client/saveStateHeader');
    const coreBuf = new ArrayBuffer(16);
    const buf = buildSaveStateHeader(coreBuf, 'http://example.com/game.chd', 'SLUS001');
    await client.loadStateFromFile(buf);
    expect(mock.loadState).toHaveBeenCalled();
    const passedRaw = (mock.loadState as any).mock.calls[0][1];
    expect(passedRaw.byteLength).toBe(16);
    client.destroy();
  });

  it('loadStateFromFile() treats buffer as raw when no header', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    const raw = new ArrayBuffer(32);
    await client.loadStateFromFile(raw);
    expect(mock.loadState).toHaveBeenCalled();
    const passedRaw = (mock.loadState as any).mock.calls[0][1];
    expect(passedRaw.byteLength).toBe(32);
    client.destroy();
  });

  // ── Memory card methods ────────────────────────────────────────────

  it('exportMemcard() delegates to the emulator', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    const result = await client.exportMemcard(1);
    expect(mock.exportMemcard).toHaveBeenCalledWith(1);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    client.destroy();
  });

  it('exportMemcard() rejects when not booted', async () => {
    const client = new EmulatorClient(makeOpts());
    await expect(client.exportMemcard(1)).rejects.toThrow('not booted');
    client.destroy();
  });

  it('importMemcard() delegates to the emulator', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    const buf = new ArrayBuffer(128);
    await client.importMemcard(1, buf);
    expect(mock.importMemcard).toHaveBeenCalledWith(1, buf);
    client.destroy();
  });

  it('importMemcard() rejects when not booted', async () => {
    const client = new EmulatorClient(makeOpts());
    await expect(client.importMemcard(1, new ArrayBuffer(1))).rejects.toThrow('not booted');
    client.destroy();
  });

  it('downloadMemcard() delegates to the emulator and triggers download', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    await client.downloadMemcard(1);
    expect(mock.exportMemcard).toHaveBeenCalledWith(1);
    client.destroy();
  });

  it('downloadMemcard() no-ops when not booted', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.downloadMemcard(1);
    client.destroy();
  });

  // ── Memcard slot binding + cloud sync pass-throughs ───────────────

  it('setMemcardSlotBinding() forwards to MemcardSync.setSlotBinding', async () => {
    const client = new EmulatorClient(makeOpts());
    const sync = (client as any)._memcardSync;
    const spy = vi.spyOn(sync, 'setSlotBinding');

    client.setMemcardSlotBinding(1, { id: 'c1', label: 'card-1' });
    expect(spy).toHaveBeenCalledWith(1, { id: 'c1', label: 'card-1' });

    client.setMemcardSlotBinding(2, { id: 'c2', label: 'card-2' });
    expect(spy).toHaveBeenCalledWith(2, { id: 'c2', label: 'card-2' });

    // null forwards as null (unbind)
    client.setMemcardSlotBinding(1, null);
    expect(spy).toHaveBeenLastCalledWith(1, null);

    client.destroy();
  });

  it('syncMemcards() forwards to MemcardSync.syncNow', async () => {
    const client = new EmulatorClient(makeOpts());
    const sync = (client as any)._memcardSync;
    const spy = vi.spyOn(sync, 'syncNow');

    await client.syncMemcards();
    expect(spy).toHaveBeenCalledTimes(1);

    client.destroy();
  });

  it('setMemcardSlotBinding + syncMemcards downloads both bound slots into IDB', async () => {
    const memcardStorage = new InMemoryMemcardStorage();
    const repo = createRepoStub({
      isAuthenticated: () => true,
      getCurrentUserId: () => 'u1',
      downloadMemcard: async (_userId: string, label: string) =>
        label === 'card-1'
          ? { buf: new Uint8Array([11]).buffer, recordId: 'c1', updated: 't' }
          : { buf: new Uint8Array([22]).buffer, recordId: 'c2', updated: 't' },
    });
    const client = new EmulatorClient(makeOpts({ repository: repo, memcardStorage }));

    // Bind both slots before syncing — bindings are the per-slot download keys.
    client.setMemcardSlotBinding(1, { id: 'c1', label: 'card-1' });
    client.setMemcardSlotBinding(2, { id: 'c2', label: 'card-2' });

    await client.syncMemcards();

    expect(new Uint8Array((await memcardStorage.load(1))!)[0]).toBe(11);
    expect(new Uint8Array((await memcardStorage.load(2))!)[0]).toBe(22);

    client.destroy();
  });

  // ── Memcard events handled internally ───────────────────────────────

  it('memcard-exported event is handled internally and NOT re-emitted', async () => {
    const memcardStorage = new InMemoryMemcardStorage();
    const client = new EmulatorClient(makeOpts({ memcardStorage }));
    await client.boot();
    const mock = mockInstances[0];

    const memcardFn = vi.fn();
    client.addEventListener('memcard-exported', memcardFn);

    const buf = new Uint8Array([10, 20, 30]);
    mock.dispatchEvent(new CustomEvent('memcard-exported', { detail: { slot: 1, buf } }));

    // Wait for async save
    await vi.waitFor(() => {
      expect(memcardFn).not.toHaveBeenCalled();
    });

    // Verify the data was saved to storage
    const saved = await memcardStorage.load(1);
    expect(saved).not.toBeNull();
    expect(saved![0]).toBe(10);
    client.destroy();
  });

  it('memcard-load-request event is handled internally and NOT re-emitted', async () => {
    const memcardStorage = new InMemoryMemcardStorage();
    // Pre-populate a card in storage
    await memcardStorage.save(1, new Uint8Array([42, 43]));

    const client = new EmulatorClient(makeOpts({ memcardStorage }));
    await client.boot();
    const mock = mockInstances[0];

    const loadReqFn = vi.fn();
    client.addEventListener('memcard-load-request', loadReqFn);

    mock.dispatchEvent(new CustomEvent('memcard-load-request', { detail: {} }));

    // Wait for async handler
    await vi.waitFor(() => {
      expect(mock.sendMemcardsToWorker).toHaveBeenCalled();
    });

    // NOT re-emitted
    expect(loadReqFn).not.toHaveBeenCalled();
    client.destroy();
  });

  // ── Auto-save ───────────────────────────────────────────────────────

  it('auto-save fires after interval when running', async () => {
    vi.useFakeTimers();
    const saveStateStorage = new InMemorySaveStateStorage();
    const client = new EmulatorClient(
      makeOpts({
        saveStateStorage,
        autoSave: { intervalMs: 100 },
      }),
    );
    await client.boot();
    const mock = mockInstances[0];
    (mock.getCdromId as any).mockReturnValue('SLUS001');
    (mock.getCurrentDiscUrl as any).mockReturnValue('http://example.com/game.chd');
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    await client.start();

    expect(mock.saveState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);

    expect(mock.saveState).toHaveBeenCalled();
    client.destroy();
  });

  it('auto-save does not fire when not running', async () => {
    vi.useFakeTimers();
    const client = new EmulatorClient(
      makeOpts({
        autoSave: { intervalMs: 100 },
      }),
    );
    await client.boot();
    const mock = mockInstances[0];
    // Load disc but don't start
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });

    await vi.advanceTimersByTimeAsync(200);

    expect(mock.saveState).not.toHaveBeenCalled();
    client.destroy();
  });

  it('auto-save does not fire when no disc serial', async () => {
    vi.useFakeTimers();
    const client = new EmulatorClient(
      makeOpts({
        autoSave: { intervalMs: 100 },
      }),
    );
    await client.boot();
    const mock = mockInstances[0];
    await client.start();

    await vi.advanceTimersByTimeAsync(200);

    expect(mock.saveState).not.toHaveBeenCalled();
    client.destroy();
  });

  it('auto-save timer stops on destroy', async () => {
    vi.useFakeTimers();
    const client = new EmulatorClient(
      makeOpts({
        autoSave: { intervalMs: 100 },
      }),
    );
    await client.boot();
    const mock = mockInstances[0];
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'SLUS001',
    });
    await client.start();

    client.destroy();

    await vi.advanceTimersByTimeAsync(200);

    // saveState was not called after destroy
    expect(mock.saveState).not.toHaveBeenCalled();
  });

  // ── Auth-driven sync wiring ─────────────────────────────────────────

  it('onAuthChange callback is registered on repository', async () => {
    const onAuthChange = vi.fn();
    const repo = createRepoStub({ onAuthChange });
    const client = new EmulatorClient(makeOpts({ repository: repo }));
    // The constructor called repo.onAuthChange with a callback
    expect(onAuthChange).toHaveBeenCalled();
    client.destroy();
  });

  it('auth-change event is dispatched when repo auth changes', async () => {
    let capturedCb: (() => void) | null = null;
    const repo = createRepoStub({
      onAuthChange: (cb) => {
        capturedCb = cb;
      },
    });
    const client = new EmulatorClient(makeOpts({ repository: repo }));
    const authFn = vi.fn();
    client.addEventListener('auth-change', authFn);

    // Simulate auth change
    capturedCb!();

    expect(authFn).toHaveBeenCalled();
    client.destroy();
  });

  // ── disc-swapped updates stateSync ──────────────────────────────────

  it('disc-swapped event updates _currentDiscSerial', async () => {
    const client = new EmulatorClient(makeOpts());
    await client.boot();
    const mock = mockInstances[0];
    (mock.getCdromId as any).mockReturnValue('SLUS003');
    mock.dispatchEvent(
      new CustomEvent('disc-swapped', { detail: { url: 'http://example.com/swap.chd' } }),
    );
    expect(client.getCurrentDiscSerial()).toBe('SLUS003');
    client.destroy();
  });

  // ── Injected storage ────────────────────────────────────────────────

  it('accepts injected saveStateStorage', async () => {
    const storage = new InMemorySaveStateStorage();
    const client = new EmulatorClient(makeOpts({ saveStateStorage: storage }));
    await client.boot();
    // Verify it works by checking hasState with pre-populated data
    const { compositeKey } = await import('@/vendor/psxanywhere/client/slotKey');
    await storage.put({
      id: compositeKey('TEST', 0),
      buf: new ArrayBuffer(8),
      discSerial: 'TEST',
      slot: 0,
      localTimestamp: Date.now(),
      synced: UNSYNCED,
      pocketbaseId: null,
      serverUpdated: null,
    });
    await client.loadDisc({
      chdUrl: 'http://example.com/game.chd',
      bios: new ArrayBuffer(1),
      serial: 'TEST',
    });
    const result = await client.hasState(0);
    expect(result).toBe(true);
    client.destroy();
  });

  it('accepts injected memcardStorage', async () => {
    const storage = new InMemoryMemcardStorage();
    await storage.save(1, new Uint8Array([99]));
    const client = new EmulatorClient(makeOpts({ memcardStorage: storage }));
    await client.boot();
    const mock = mockInstances[0];
    // Trigger memcard-load-request — it should read from the injected storage
    mock.dispatchEvent(new CustomEvent('memcard-load-request', { detail: {} }));
    await vi.waitFor(() => {
      expect(mock.sendMemcardsToWorker).toHaveBeenCalled();
    });
    const cards = (mock.sendMemcardsToWorker as any).mock.calls[0][0] as Map<number, Uint8Array>;
    expect(cards.get(1)).toEqual(new Uint8Array([99]));
    client.destroy();
  });
});
