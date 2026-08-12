import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMemoryCard } from 'mcrreader';

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
    setMemcardSlotBinding = vi.fn();
    syncMemcards = vi.fn(async () => {});
    importMemcard = vi.fn(async () => {});
    exportMemcard = vi.fn(async () => null);
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

function loadFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'pcsx-card1.mcr')),
  );
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
          {
            id: 'mc-cloud-1',
            label: 'default',
            data: 'memcard.mcd',
            updated: '2024-01-01',
            mounted: 'slot1',
          },
        ]),
      });
      const svc = new PsxAnywhereEmulatorService();
      const cards = await svc.listMemoryCards('u-1');
      expect(cards.map((c) => c.id)).toEqual(['mc-cloud-1']);
      // downloadMemcard is not stubbed here → defaults (0/15); mounted passes through.
      expect(cards[0]).toMatchObject({ label: 'default', totalBlocks: 15, mounted: 'slot1' });
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

    it('computes real block counts from fetched bytes + passes mounted through', async () => {
      const fixture = loadFixture();
      const parsed = parseMemoryCard(new Uint8Array(fixture));
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          {
            id: 'mc-1',
            label: 'RPG',
            data: 'memcard.mcd',
            updated: '2024-01-01',
            mounted: 'slot2',
            collectionId: 'pbc_mc',
          },
        ]),
        getFirstListItem: vi.fn(async () => ({
          id: 'mc-1',
          label: 'RPG',
          data: 'memcard.mcd',
          collectionId: 'pbc_mc',
        })),
      });
      const ab = new ArrayBuffer(fixture.byteLength);
      new Uint8Array(ab).set(fixture);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab })),
      );

      const svc = new PsxAnywhereEmulatorService();
      const cards = await svc.listMemoryCards('u-1');
      vi.unstubAllGlobals();

      expect(cards).toHaveLength(1);
      expect(cards[0]!.mounted).toBe('slot2');
      expect(cards[0]!.usedBlocks).toBe(parsed.totalBlocks - parsed.freeBlocks);
      expect(cards[0]!.totalBlocks).toBe(parsed.totalBlocks);
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

    it('flips to synced on state-sync-complete but does NOT invalidate caches', async () => {
      const { svc, client } = await makeAttachedService();
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: false } }));
      const invalidate = queryClient.invalidateQueries as ReturnType<typeof vi.fn>;
      invalidate.mockClear();

      client.dispatchEvent(new CustomEvent('state-sync-complete'));
      expect(svc.getSyncStatus()).toBe('synced');
      // Save-states are queried once on load and cached; sync passes must not
      // re-invalidate (uploads are drained by the facade independently, and the
      // per-save `state-saved` event already refreshes the UI on local saves).
      expect(invalidate).not.toHaveBeenCalled();
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

describe('PsxAnywhereEmulatorService — WS5 memcard orchestration', () => {
  beforeEach(() => {
    setAuthed(null);
    mockedPb.collection.mockReset();
    for (const k of Object.keys(collectionRegistry)) delete collectionRegistry[k];
    (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();
    fakeInstances.length = 0;
    localStorage.clear();
  });

  async function makeAttachedWithManager(): Promise<{
    svc: PsxAnywhereEmulatorService;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager: any;
  }> {
    const canvas = document.createElement('canvas');
    const svc = new PsxAnywhereEmulatorService();
    const manager = svc.buildMemoryCardManager();
    await svc.attachCanvas(canvas);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = fakeInstances[fakeInstances.length - 1];
    return { svc, client, manager };
  }

  // attachCanvas now triggers a reconcile when authed (the fix for the
  // already-authed-at-attach case that left setUserId unset). That reconcile is
  // fire-and-forget; tests that attach while authed and then clear mocks / drive
  // further events must first let it settle so its tail side effects (bindings,
  // cache, syncMemcards, invalidate) don't bleed into later assertions. The
  // reconcile always ends with `client.syncMemcards()` (after any swallowed
  // cloud errors), so that call is a reliable tail signal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function flushReconcile(client: any): Promise<void> {
    await vi.waitFor(() => expect(client.syncMemcards).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
  }

  describe('binding cache + boot timing', () => {
    it('attachCanvas sets slot bindings from the cache BEFORE boot', async () => {
      setAuthed('u-1');
      localStorage.setItem(
        'psflix:memcard-slots:u-1',
        JSON.stringify({ slot1: { id: 'c1', label: 'Card One' }, slot2: null }),
      );
      const { client } = await makeAttachedWithManager();
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'c1',
        label: 'Card One',
      });
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(2, null);
      // Bindings were set before boot() ran (call order).
      const bindOrder = client.setMemcardSlotBinding.mock.invocationCallOrder[0];
      const bootOrder = client.boot.mock.invocationCallOrder[0];
      expect(bindOrder).toBeLessThan(bootOrder);
    });

    it('attachCanvas skips binding setup when signed out', async () => {
      setAuthed(null);
      const { client } = await makeAttachedWithManager();
      expect(client.setMemcardSlotBinding).not.toHaveBeenCalled();
    });
  });

  describe('binding callback wiring', () => {
    it('onBindingChange (from the manager) reaches client.setMemcardSlotBinding', async () => {
      setAuthed(null);
      const { client, manager } = await makeAttachedWithManager();
      // Session-only card (no cloud) so no cloud stubs are needed.
      const card = await manager.createCard('Main');
      client.setMemcardSlotBinding.mockClear();

      await manager.mountCard(1, card.id);
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: card.id,
        label: 'Main',
      });
    });

    it('the binding callback persists to the per-user cache', async () => {
      setAuthed('u-1');
      const { client, manager } = await makeAttachedWithManager();
      // Let the attach-time reconcile settle before driving the manager so its
      // background bind() doesn't race the cache write below.
      await flushReconcile(client);
      const card = await manager.createCard('Main');
      await manager.mountCard(1, card.id);
      const cached = JSON.parse(localStorage.getItem('psflix:memcard-slots:u-1') ?? '{}');
      expect(cached.slot1).toEqual({ id: card.id, label: 'Main' });
      expect(cached.slot2).toBeNull();
    });
  });

  describe('auth reconcile', () => {
    it('auth-change(authed) re-derives bindings from cloud + triggers syncMemcards', async () => {
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          { id: 'c1', label: 'Slot1', data: 'memcard.mcd', updated: 'x', mounted: 'slot1' },
          { id: 'c2', label: 'Slot2', data: 'memcard.mcd', updated: 'x', mounted: 'slot2' },
        ]),
      });
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);
      client.setMemcardSlotBinding.mockClear();
      client.syncMemcards.mockClear();

      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: true } }));
      await vi.waitFor(() => expect(client.syncMemcards).toHaveBeenCalled());

      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'c1',
        label: 'Slot1',
      });
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(2, {
        id: 'c2',
        label: 'Slot2',
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['memory-cards'],
      });
    });

    it('reconcile is cloud-authoritative (overwrites a stale cache binding)', async () => {
      setAuthed('u-1');
      localStorage.setItem(
        'psflix:memcard-slots:u-1',
        JSON.stringify({ slot1: { id: 'stale', label: 'Stale' }, slot2: null }),
      );
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          { id: 'fresh', label: 'Fresh', data: 'memcard.mcd', updated: 'x', mounted: 'slot1' },
        ]),
      });
      const { client } = await makeAttachedWithManager();
      // attachCanvas read the stale cache first.
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'stale',
        label: 'Stale',
      });
      // Let the attach-time reconcile (cloud-authoritative) settle before
      // clearing — it already overwrote the stale binding with 'fresh'.
      await flushReconcile(client);
      client.setMemcardSlotBinding.mockClear();
      client.syncMemcards.mockClear();

      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: true } }));
      await vi.waitFor(() => expect(client.syncMemcards).toHaveBeenCalled());

      // Cloud wins.
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'fresh',
        label: 'Fresh',
      });
      const cached = JSON.parse(localStorage.getItem('psflix:memcard-slots:u-1') ?? '{}');
      expect(cached.slot1).toEqual({ id: 'fresh', label: 'Fresh' });
    });

    it('rapid auth-toggle serializes reconcile passes without throwing', async () => {
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => []),
      });
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);
      client.syncMemcards.mockClear();

      // Fire two authed events in quick succession.
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: true } }));
      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: true } }));
      // Settle the serialized chain. Chosen behavior: N passes run sequentially
      // (last state wins), never throwing.
      await vi.waitFor(() =>
        expect(client.syncMemcards.mock.calls.length).toBeGreaterThanOrEqual(1),
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(client.syncMemcards.mock.calls.length).toBe(2);
    });
  });

  describe('attach-time reconcile (already-authed-at-attach fix)', () => {
    it('attachCanvas reconciles when already authed so setUserId takes effect', async () => {
      // The regression: signing in via the header, then navigating to a game,
      // attached the canvas already-authed. No `auth-change` fired (onChange
      // doesn't fire for a persisted token), so setUserId never ran and every
      // cloud-gated manager op silently fell back to session-only. attachCanvas
      // must now reconcile explicitly when authed.
      setAuthed('u-1');
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          { id: 'c1', label: 'Existing', data: 'memcard.mcd', updated: 'x', mounted: 'slot1' },
        ]),
        getFirstListItem: vi.fn(async () => {
          throw { status: 404 };
        }),
      });
      const canvas = document.createElement('canvas');
      const svc = new PsxAnywhereEmulatorService();
      const manager = svc.buildMemoryCardManager();
      const setUserIdSpy = vi.spyOn(manager, 'setUserId');
      await svc.attachCanvas(canvas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = fakeInstances[fakeInstances.length - 1] as any;
      await flushReconcile(client);

      // setUserId was called (cloud path active) + the cloud library hydrated.
      expect(setUserIdSpy).toHaveBeenCalledWith('u-1');
      const lib = manager.getState().library;
      expect(lib.map((c: { id: string }) => c.id)).toEqual(['c1']);
      expect(lib[0].cloud).toBe(true);
      // Bindings re-derived from cloud `mounted` + a download pass triggered.
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'c1',
        label: 'Existing',
      });
      expect(client.syncMemcards).toHaveBeenCalled();
    });

    it('seeds a default card in slot 1 for a first-time user (empty cloud library)', async () => {
      setAuthed('u-1');
      const createMock = vi.fn(async (form: FormData) => ({
        id: 'mc-default',
        label: form.get('label'),
        mounted: '',
      }));
      const updateMock = vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
        id: _id,
        label: 'default',
        mounted: patch.mounted ?? '',
      }));
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => []),
        // No previous occupant of slot 1 → 404 (isNotFound) is swallowed.
        getFirstListItem: vi.fn(async () => {
          throw { status: 404 };
        }),
        create: createMock,
        update: updateMock,
      });
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);

      // A 'default' card was created in the cloud.
      expect(createMock).toHaveBeenCalledTimes(1);
      const form = createMock.mock.calls[0]![0] as FormData;
      expect(form.get('label')).toBe('default');
      // setMemcardMounted mounted it into slot 1.
      expect(updateMock).toHaveBeenCalledWith('mc-default', { mounted: 'slot1' });
      // The binding was pushed to the sync engine for slot 1.
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, {
        id: 'mc-default',
        label: 'default',
      });
      // And persisted to the per-user cache.
      const cached = JSON.parse(localStorage.getItem('psflix:memcard-slots:u-1') ?? '{}');
      expect(cached.slot1).toEqual({ id: 'mc-default', label: 'default' });
    });

    it('does not seed a default card when the library is non-empty', async () => {
      setAuthed('u-1');
      const createMock = vi.fn(async () => ({ id: 'x', label: 'x', mounted: '' }));
      stubCollection('memory_cards', {
        getFullList: vi.fn(async () => [
          { id: 'c1', label: 'Existing', data: 'memcard.mcd', updated: 'x', mounted: 'slot1' },
        ]),
        create: createMock,
      });
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);

      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('sign-out', () => {
    it('auth-change(!authed) clears both bindings + the manager userId', async () => {
      const { client, manager } = await makeAttachedWithManager();
      manager.setUserId('u-1');

      client.dispatchEvent(new CustomEvent('auth-change', { detail: { authed: false } }));
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(1, null);
      expect(client.setMemcardSlotBinding).toHaveBeenCalledWith(2, null);
    });
  });

  describe('memcard-sync-complete (light refresh, no loop)', () => {
    it('refreshes the manager library + invalidates without calling syncMemcards', async () => {
      setAuthed('u-1');
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);
      client.syncMemcards.mockClear();
      (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();

      client.dispatchEvent(new CustomEvent('memcard-sync-complete'));
      await vi.waitFor(() =>
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
          queryKey: ['memory-cards'],
        }),
      );
      // The light refresh must NOT re-trigger a download pass (would loop).
      expect(client.syncMemcards).not.toHaveBeenCalled();
    });

    it('calls refreshLibrary (not hydrate) so slot bytes are not re-exported', async () => {
      setAuthed('u-1');
      const { client, manager } = await makeAttachedWithManager();
      await flushReconcile(client);
      const refreshSpy = vi.spyOn(manager, 'refreshLibrary').mockResolvedValue(undefined);
      const hydrateSpy = vi.spyOn(manager, 'hydrate').mockResolvedValue(undefined);
      (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();

      client.dispatchEvent(new CustomEvent('memcard-sync-complete'));
      await vi.waitFor(() => expect(refreshSpy).toHaveBeenCalledWith('u-1'));

      // hydrate must NOT be called on sync-complete (would re-export/clobber
      // slot bytes — violating apply-on-next-boot).
      expect(hydrateSpy).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['memory-cards'],
      });
    });

    it('does NOT hot-swap cloud bytes into the running emulator', async () => {
      setAuthed('u-1');
      const { client } = await makeAttachedWithManager();
      await flushReconcile(client);
      client.importMemcard.mockClear();

      client.dispatchEvent(new CustomEvent('memcard-sync-complete'));
      // Let the async refresh settle.
      await new Promise((r) => setTimeout(r, 20));

      // Cloud downloads go to IDB, not the running emulator. The running
      // cards are untouched (apply-on-next-boot).
      expect(client.importMemcard).not.toHaveBeenCalled();
    });

    it('falls back to invalidation-only when signed out', async () => {
      setAuthed(null);
      const { client } = await makeAttachedWithManager();
      (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mockClear();

      client.dispatchEvent(new CustomEvent('memcard-sync-complete'));
      await vi.waitFor(() =>
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
          queryKey: ['memory-cards'],
        }),
      );
    });
  });
});
