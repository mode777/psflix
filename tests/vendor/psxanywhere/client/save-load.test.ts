// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { Emulator } from 'emulator-core';
import { SaveLoadController } from '@/vendor/psxanywhere/client/save-load';
import { SaveStateStore } from '@/vendor/psxanywhere/client/SaveStateStore';
import type { Repository } from 'repository';
import { InMemorySaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import { UNSYNCED, compositeKey } from '@/vendor/psxanywhere/client/slotKey';
import { createMockRepository } from './helpers/repository-mock';

// ── Local Emulator mock ──────────────────────────────────────────────
// SaveLoadController touches a different Emulator subset than the input
// code; keep this mock local rather than extending tests/client/helpers/
// emulator-mock.ts (which is input-scoped by design).

interface SaveLoadEmulatorCall {
  saveCalls: { slot: number | string }[];
  loadCalls: { slot: number | string; buf: ArrayBuffer }[];
}

type SaveLoadEmulatorSubset = Pick<
  Emulator,
  'saveState' | 'loadState' | 'getCurrentDiscUrl' | 'getCdromId'
>;

interface MockEmulator extends SaveLoadEmulatorCall {
  // Stored as the full Emulator facade (cast via `as unknown as Emulator`,
  // matching the tests/client/helpers/emulator-mock.ts idiom): the controller
  // only calls the four methods above, but its accessor is typed Emulator.
  emu: Emulator;
}

interface SaveLoadEmulatorOpts {
  discUrl?: string;
  cdromId?: string;
  /** Payload the core returns from saveState. Defaults to a 4-byte stub. `null` = no payload. */
  savePayload?: ArrayBuffer | null;
}

function createEmulator(opts: SaveLoadEmulatorOpts = {}): MockEmulator {
  const calls: SaveLoadEmulatorCall = { saveCalls: [], loadCalls: [] };
  const emu: SaveLoadEmulatorSubset = {
    saveState: vi.fn(async (slot: number | string) => {
      calls.saveCalls.push({ slot });
      return opts.savePayload === undefined ? buf([10, 20, 30, 40]) : opts.savePayload;
    }),
    loadState: vi.fn(async (slot: number | string, b: ArrayBuffer) => {
      calls.loadCalls.push({ slot, buf: b });
    }),
    getCurrentDiscUrl: vi.fn(() => opts.discUrl ?? 'https://host/Crash.chd'),
    getCdromId: vi.fn(() => opts.cdromId ?? 'SLUS001'),
  };
  return { ...calls, emu: emu as unknown as Emulator };
}

// ── Helpers ──────────────────────────────────────────────────────────

function buf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

interface Harness {
  controller: SaveLoadController;
  storage: InMemorySaveStateStorage;
  setEmulator: (m: MockEmulator | null) => void;
  showToast: ReturnType<typeof vi.fn>;
  onSaved: ReturnType<typeof vi.fn>;
  logs: { level: string; msg: string }[];
}

function createHarness(initial: MockEmulator | null = null): Harness {
  const storage = new InMemorySaveStateStorage();
  const repo = createMockRepository() as unknown as Repository;
  const store = new SaveStateStore(storage, repo, () => {});
  const showToast = vi.fn();
  const onSaved = vi.fn();
  const logs: { level: string; msg: string }[] = [];
  const log = (level: string, msg: string) => {
    logs.push({ level, msg });
  };

  let holder: MockEmulator | null = initial;
  const controller = new SaveLoadController(
    () => (holder ? holder.emu : null),
    store,
    log,
    showToast,
    onSaved,
  );

  return {
    controller,
    storage,
    setEmulator: (m) => {
      holder = m;
    },
    showToast,
    onSaved,
    logs,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SaveLoadController.save', () => {
  it('persists via the store, toasts, and fires onSaved', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.save(0, 'SLUS001');

    expect(h.showToast).toHaveBeenCalledWith('State saved');
    expect(h.onSaved).toHaveBeenCalledTimes(1);
    expect(mock.saveCalls).toEqual([{ slot: 0 }]);
    const rec = await h.storage.get(compositeKey('SLUS001', 0));
    expect(rec).not.toBeNull();
    expect(rec!.synced).toBe(UNSYNCED);
  });

  it('toasts "Auto-saved" for the auto slot', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.save(Emulator.SLOT_AUTO, 'SLUS001');

    expect(h.showToast).toHaveBeenCalledWith('Auto-saved');
  });

  it('no-ops when the core returns no payload (no toast, no onSaved)', async () => {
    const mock = createEmulator({ savePayload: null });
    const h = createHarness(mock);

    await h.controller.save(0, 'SLUS001');

    expect(h.showToast).not.toHaveBeenCalled();
    expect(h.onSaved).not.toHaveBeenCalled();
    expect(h.logs).toContainEqual({ level: 'warn', msg: 'No game loaded; nothing to save' });
  });

  it('no-ops and logs warn when no emulator is live', async () => {
    const h = createHarness(null);

    await h.controller.save(0, 'SLUS001');

    expect(h.showToast).not.toHaveBeenCalled();
    expect(h.onSaved).not.toHaveBeenCalled();
    expect(h.logs.some((l) => l.level === 'warn' && l.msg.includes('no emulator'))).toBe(true);
  });
});

describe('SaveLoadController.load', () => {
  it('round-trips: load after save feeds the original core bytes to emu.loadState', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.save(0, 'SLUS001');
    mock.loadCalls.length = 0;
    await h.controller.load(0, 'SLUS001');

    expect(mock.loadCalls).toHaveLength(1);
    expect(mock.loadCalls[0].slot).toBe(0);
    expect([...new Uint8Array(mock.loadCalls[0].buf)]).toEqual([10, 20, 30, 40]);
    expect(h.showToast).toHaveBeenLastCalledWith('State loaded');
  });

  it('toasts "Loaded auto-save" for the auto slot', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.save(Emulator.SLOT_AUTO, 'SLUS001');
    mock.loadCalls.length = 0;
    await h.controller.load(Emulator.SLOT_AUTO, 'SLUS001');

    expect(h.showToast).toHaveBeenLastCalledWith('Loaded auto-save');
  });

  it('toasts "No save state found" when nothing is persisted', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.load(0, 'SLUS001');

    expect(mock.loadCalls).toHaveLength(0);
    expect(h.showToast).toHaveBeenCalledWith('No save state found');
  });

  it('toasts "No auto-save found" for the auto slot when nothing is persisted', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    await h.controller.load(Emulator.SLOT_AUTO, 'SLUS001');

    expect(mock.loadCalls).toHaveLength(0);
    expect(h.showToast).toHaveBeenCalledWith('No auto-save found');
  });

  it('rejects a corrupt header (toast + warn log, no loadState call)', async () => {
    const mock = createEmulator();
    const h = createHarness(mock);

    // Correct PSAS magic but unsupported version. Layout per saveStateHeader:
    // magic(4) + version=99(4) + urlLen=0(4) + gameId(9) + 1 core byte = 22.
    const corrupt = new ArrayBuffer(22);
    const view = new DataView(corrupt);
    view.setUint32(0, 0x50534153, true);
    view.setUint32(4, 99, true);
    view.setUint32(8, 0, true);
    await h.storage.put({
      id: compositeKey('SLUS001', 0),
      buf: corrupt,
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: Date.now(),
      synced: UNSYNCED,
      pocketbaseId: null,
      serverUpdated: null,
    });

    await h.controller.load(0, 'SLUS001');

    expect(mock.loadCalls).toHaveLength(0);
    expect(h.showToast).toHaveBeenCalledWith('Save state is corrupt — header unreadable');
    expect(h.logs.some((l) => l.level === 'warn' && l.msg.startsWith('corrupt header:'))).toBe(
      true,
    );
  });

  it('no-ops and logs warn when no emulator is live', async () => {
    const h = createHarness(null);

    await h.controller.load(0, 'SLUS001');

    expect(h.showToast).not.toHaveBeenCalled();
    expect(h.logs.some((l) => l.level === 'warn' && l.msg.includes('no emulator'))).toBe(true);
  });
});

describe('SaveLoadController emulator lifecycle', () => {
  it('reads the emulator through the accessor (survives destroy+recreate)', async () => {
    const first = createEmulator();
    const h = createHarness(first);

    await h.controller.save(0, 'SLUS001');
    expect(first.saveCalls).toHaveLength(1);

    const second = createEmulator({ discUrl: 'https://host/Spyro.chd', cdromId: 'SLUS002' });
    h.setEmulator(second);

    await h.controller.save(0, 'SLUS002');
    expect(first.saveCalls).toHaveLength(1);
    expect(second.saveCalls).toHaveLength(1);
  });
});
