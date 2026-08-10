import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────
// The service constructs an EmulatorClient inside attachCanvas. We replace it
// with a fake EventTarget-backed class so tests can drive the events the
// service listens to (state-saved, state-sync-complete, auth-change, ...).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeInstances: any[] = [];

vi.mock('emulator-client', () => {
  class FakeClient extends EventTarget {
    static SLOT_AUTO = -1;
    static CONTROLLER = { STANDARD: 1, DUALSHOCK: 2, MOUSE: 3 };
    static BUTTON = {};
    static BUTTON_LABELS = {};
    static CRT_SHADER_DEFAULT_PARAMS = {};
    boot = vi.fn(async () => {});
    destroy = vi.fn(() => {});
    hasState = vi.fn(async () => false);
    saveState = vi.fn(async () => {});
    loadState = vi.fn(async () => {});
    start = vi.fn(async () => {});
    stop = vi.fn(() => {});
    setCrt = vi.fn(() => {});
    setVolume = vi.fn(() => {});
    setController = vi.fn(() => {});
    clearController = vi.fn(() => {});
    constructor() {
      super();
      fakeInstances.push(this);
    }
  }
  return { EmulatorClient: FakeClient };
});

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@/lib/pb', () => {
  const authRecord = { current: null as null | { id: string } };
  return {
    pb: {
      files: {
        getURL: vi.fn(
          (r: { collectionId: string; id: string }, f: string) =>
            `https://pb/api/files/${r.collectionId}/${r.id}/${f}`,
        ),
      },
      authStore: {
        get record() {
          return authRecord.current;
        },
        get isValid() {
          return authRecord.current !== null;
        },
        clear: () => {
          authRecord.current = null;
        },
        onChange: () => () => {},
      },
      collection: vi.fn(),
      __authRecord: authRecord,
    },
  };
});

import { EmulatorClient } from 'emulator-client';
import { queryClient } from '@/lib/queryClient';
import { pb } from '@/lib/pb';
import {
  mapSlot,
  PsxAnywhereEmulatorService,
} from '@/features/console/services/psxAnywhereEmulatorService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedPb = pb as any;

// Registry of per-collection mocks; stubCollection accumulates so multiple
// collections can be stubbed in one test.
const collectionRegistry: Record<string, Record<string, unknown>> = {};

function setAuthed(userId: string | null): void {
  mockedPb.__authRecord.current = userId ? { id: userId } : null;
}

function stubCollection(name: string, impl: Record<string, unknown>): void {
  collectionRegistry[name] = impl;
  mockedPb.collection.mockImplementation((n: string) => collectionRegistry[n] ?? {});
}

describe('mapSlot', () => {
  it("maps 'auto' to the facade SLOT_AUTO sentinel", () => {
    expect(mapSlot('auto')).toBe(EmulatorClient.SLOT_AUTO);
  });

  it('maps slots onto the facade canonical numbers (skipping colliding 1)', () => {
    // slotToType(0) === slotToType(1) === 'slot1', so numeric slot 1 collides
    // with 0. The facade's typeToSlot normalizes slot1→0, slot2→2, slot3→3,
    // and mapSlot must mirror that or slot2 keys into slot1's storage.
    expect(mapSlot('slot1')).toBe(0);
    expect(mapSlot('slot2')).toBe(2);
    expect(mapSlot('slot3')).toBe(3);
  });
});

describe('PsxAnywhereEmulatorService — synchronous surface (pre-attach)', () => {
  beforeEach(() => {
    setAuthed(null);
    mockedPb.collection.mockReset();
    (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();
    fakeInstances.length = 0;
  });

  it('defaults to an idle runtime with no disc', () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(svc.getRuntime()).toEqual({ status: 'idle', currentDiscId: null, elapsedMs: 0 });
    expect(svc.getCanvas()).toBeNull();
    expect(svc.getFatal()).toBeNull();
  });

  it('exposes default controller ports', () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(svc.getControllerPorts()).toEqual({ port1: 'standard', port2: 'none' });
  });

  it('returns a stable default memory-slot assignment per user', () => {
    const svc = new PsxAnywhereEmulatorService();
    const a = svc.getMemorySlotAssignment('user-a');
    const b = svc.getMemorySlotAssignment('user-a');
    expect(a).toEqual({ slot1: null, slot2: null });
    expect(a).toBe(b);
  });

  it('returns no memory cards when unauthenticated (library is in-memory)', async () => {
    setAuthed(null);
    const svc = new PsxAnywhereEmulatorService();
    const cards = await svc.listMemoryCards('user-a');
    expect(cards).toEqual([]);
  });

  it('listSaveStates returns [] before a client is attached', async () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(await svc.listSaveStates('disc-1', 'user-a')).toEqual([]);
  });

  it('requires an attached client for loadState and surfaces the "no save" message shape', async () => {
    const svc = new PsxAnywhereEmulatorService();
    await expect(svc.loadState('slot1', 'disc-1', 'user-a')).rejects.toThrow(/attach/);
  });

  it('persists settings changes (localStorage round-trip)', () => {
    const svc = new PsxAnywhereEmulatorService();
    svc.setSettings({ masterVolume: 42, crtFilter: false });
    expect(svc.getSettings()).toEqual({ masterVolume: 42, crtFilter: false });
    const raw = localStorage.getItem('psflix:console-settings');
    expect(JSON.parse(raw ?? '{}')).toEqual({ masterVolume: 42, crtFilter: false });
  });

  it('persists memory-slot assignment to localStorage', () => {
    const svc = new PsxAnywhereEmulatorService();
    svc.setMemorySlot(1, 'mc-rpg', 'user-x');
    svc.setMemorySlot(2, 'mc-main', 'user-x');
    const raw = localStorage.getItem('psflix:memcard-slots:user-x');
    expect(JSON.parse(raw ?? '{}')).toEqual({ slot1: 'mc-rpg', slot2: 'mc-main' });
    // Same instance returns the updated stable ref.
    const a = svc.getMemorySlotAssignment('user-x');
    expect(a).toEqual({ slot1: 'mc-rpg', slot2: 'mc-main' });
    const b = svc.getMemorySlotAssignment('user-x');
    expect(a).toBe(b);
  });
});

describe('PsxAnywhereEmulatorService — Phase 2 cloud sync', () => {
  beforeEach(() => {
    setAuthed(null);
    mockedPb.collection.mockReset();
    for (const k of Object.keys(collectionRegistry)) delete collectionRegistry[k];
    (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();
    fakeInstances.length = 0;
    localStorage.clear();
  });

  describe('listMemoryCards (cloud only)', () => {
    it('returns cloud cards when authed', async () => {
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          { id: 'mc-cloud-1', label: 'default', data: 'memcard.mcd', updated: '2024-01-01' },
        ]),
      });
      const svc = new PsxAnywhereEmulatorService();
      const cards = await svc.listMemoryCards('u-1');
      expect(cards.map((c) => c.id)).toEqual(['mc-cloud-1']);
      expect(cards[0]).toMatchObject({ label: 'default', totalBlocks: 15 });
    });

    it('returns [] when the cloud fetch fails', async () => {
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => {
          throw new Error('network');
        }),
      });
      const svc = new PsxAnywhereEmulatorService();
      const cards = await svc.listMemoryCards('u-1');
      expect(cards).toEqual([]);
    });
  });

  describe('deleteState', () => {
    it('deletes the cloud record via the repository and hides the slot', async () => {
      setAuthed('u-1');
      const deleteMock = vi.fn(async () => undefined);
      const foundRecord = { id: 'ss-1', type: 'slot1', disc: 'disc-1', user: 'u-1' };
      stubCollection('save_state', {
        getFirstListItem: vi.fn(async () => foundRecord),
        delete: deleteMock,
      });
      // discs lookup (resolveDiscId) for the cloud delete path.
      stubCollection('discs', {
        getFirstListItem: vi.fn(async (filter: string) => {
          const serial = filter.match(/serial="([^"]+)"/)?.[1];
          return { id: 'disc-1', serial, collectionId: 'pbc_discs' };
        }),
        getOne: vi.fn(async () => ({ id: 'disc-1', serial: 'SLUS001' })),
      });
      const svc = new PsxAnywhereEmulatorService();
      await svc.deleteState('slot1', 'disc-1', 'u-1');
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith('ss-1');
    });
  });

  describe('sync-status + invalidation (event-driven)', () => {
    async function makeAttachedService(): Promise<{
      svc: PsxAnywhereEmulatorService;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: any;
    }> {
      const canvas = document.createElement('canvas');
      const svc = new PsxAnywhereEmulatorService();
      await svc.attachCanvas(canvas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = fakeInstances[fakeInstances.length - 1];
      return { svc, client };
    }

    it('flips to syncing on state-saved and invalidates save-state queries', async () => {
      const { svc, client } = await makeAttachedService();
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: false } }));
      const invalidate = queryClient.invalidateQueries as ReturnType<typeof vi.fn>;
      invalidate.mockClear();

      client.dispatchEvent(new CustomEvent('state-saved'));
      expect(svc.getSyncStatus()).toBe('syncing');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['save-states'] });
    });

    it('flips to synced on state-sync-complete and invalidates both caches', async () => {
      const { svc, client } = await makeAttachedService();
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: false } }));
      const invalidate = queryClient.invalidateQueries as ReturnType<typeof vi.fn>;
      invalidate.mockClear();

      client.dispatchEvent(new CustomEvent('state-sync-complete'));
      expect(svc.getSyncStatus()).toBe('synced');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['save-states'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['memory-cards'] });
    });

    it('state-saved invalidates save-state queries', async () => {
      const { client } = await makeAttachedService();
      const invalidate = queryClient.invalidateQueries as ReturnType<typeof vi.fn>;
      invalidate.mockClear();
      client.dispatchEvent(new CustomEvent('state-saved'));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['save-states'] });
    });

    it('auth-change drives idle/syncing status', async () => {
      const { svc, client } = await makeAttachedService();
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: false } }));
      expect(svc.getSyncStatus()).toBe('idle');
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: true } }));
      expect(svc.getSyncStatus()).toBe('syncing');
    });
  });
});
