import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Self-contained mock of the PSflix `pb` singleton. The factory must not
// reference outer scope, so it attaches its internal handles to the returned
// `pb` object (prefixed `__`) for the test to drive. Both the repository and
// this test resolve to the same mocked instance.
vi.mock('@/lib/pb', () => {
  const subscribers = new Set<() => void>();
  const authRecord = { current: null as null | { id: string; username?: string; email?: string } };
  const mockCollection = vi.fn();
  const pb = {
    collection: mockCollection,
    files: {
      getURL: vi.fn(
        (record: { collectionId: string; id: string }, filename: string): string =>
          `https://pb/api/files/${record.collectionId}/${record.id}/${filename}`,
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
        subscribers.forEach((cb) => cb());
      },
      onChange: (cb: () => void) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
      },
    },
    __authRecord: authRecord,
    __subscribers: subscribers,
  };
  return { pb };
});

import { pb } from '@/lib/pb';
import { psxAnywhereRepository } from '@/features/console/services/psxAnywhereRepository';

type MockPb = typeof pb & {
  __authRecord: { current: null | { id: string; username?: string; email?: string } };
  __subscribers: Set<() => void>;
};
const mocked = pb as MockPb;

// ── Collection mocks ─────────────────────────────────────────────────

function notFound(): never {
  const e = new Error('not found');
  (e as { status?: number }).status = 404;
  throw e;
}

function match(filter: string, key: string): string | undefined {
  const m = filter.match(new RegExp(`${key}="([^"]+)"`));
  return m?.[1];
}

function discsCollection() {
  return {
    // Derives a deterministic id from the serial so any serial resolves.
    getFirstListItem: vi.fn(async (filter: string) => {
      const serial = match(filter, 'serial');
      if (!serial) notFound();
      return { id: `disc-${serial}`, serial, collectionId: 'pbc_discs' };
    }),
    getOne: vi.fn(async (id: string) => {
      const serial = id.replace(/^disc-/, '');
      return { id, serial, collectionId: 'pbc_discs' };
    }),
  };
}

function saveStateCollection() {
  const records = new Map<string, Record<string, unknown>>();
  let next = 1;
  return {
    getFirstListItem: vi.fn(async (filter: string) => {
      const type = match(filter, 'type');
      const disc = match(filter, 'disc');
      const user = match(filter, 'user');
      for (const r of records.values()) {
        if (r.type === type && r.disc === disc && r.user === user) return r;
      }
      notFound();
    }),
    getFullList: vi.fn(async (opts?: { filter?: string }) => {
      const filter = opts?.filter ?? '';
      const user = match(filter, 'user');
      const disc = match(filter, 'disc');
      let arr = [...records.values()];
      if (user) arr = arr.filter((r) => r.user === user);
      if (disc) arr = arr.filter((r) => r.disc === disc);
      return arr;
    }),
    getOne: vi.fn(async (id: string, opts?: { expand?: string }) => {
      const r = records.get(id);
      if (!r) notFound();
      if (opts?.expand === 'disc') {
        return { ...r, expand: { disc: { serial: 'SLUS001' } } };
      }
      return r;
    }),
    create: vi.fn(async (form: FormData) => {
      const id = `ss-${next++}`;
      const r = {
        id,
        type: String(form.get('type')),
        disc: String(form.get('disc')),
        user: String(form.get('user')),
        data: 'save.state',
        updated: '2024-01-01T00:00:00.000Z',
        collectionId: 'pbc_ss',
      };
      records.set(id, r);
      return r;
    }),
    update: vi.fn(async (id: string, form: FormData) => {
      const r = records.get(id);
      if (!r) notFound();
      const updated = {
        ...r,
        type: String(form.get('type') ?? r!.type),
        disc: String(form.get('disc') ?? r!.disc),
        data: 'save.state',
        updated: '2024-01-02T00:00:00.000Z',
        collectionId: 'pbc_ss',
      };
      records.set(id, updated);
      return updated;
    }),
    delete: vi.fn(async (id: string) => {
      records.delete(id);
    }),
    __records: records,
  };
}

function memoryCardsCollection() {
  const records = new Map<string, Record<string, unknown>>();
  let next = 1;
  return {
    getFirstListItem: vi.fn(async (filter: string) => {
      const label = match(filter, 'label');
      const user = match(filter, 'user');
      for (const r of records.values()) {
        if (r.label === label && r.user === user) return r;
      }
      notFound();
    }),
    getFullList: vi.fn(async (opts?: { filter?: string }) => {
      const user = match(opts?.filter ?? '', 'user');
      return [...records.values()].filter((r) => (user ? r.user === user : true));
    }),
    create: vi.fn(async (form: FormData) => {
      const id = `mc-${next++}`;
      const r = {
        id,
        label: String(form.get('label')),
        user: String(form.get('user')),
        data: 'memcard.mcd',
        updated: '2024-02-01T00:00:00.000Z',
        collectionId: 'pbc_mc',
      };
      records.set(id, r);
      return r;
    }),
    update: vi.fn(async (id: string, form: FormData) => {
      const r = records.get(id);
      if (!r) notFound();
      const updated = {
        ...r,
        label: String(form.get('label') ?? r!.label),
        data: 'memcard.mcd',
        updated: '2024-02-02T00:00:00.000Z',
        collectionId: 'pbc_mc',
      };
      records.set(id, updated);
      return updated;
    }),
  };
}

function consolesCollection() {
  return {
    getFirstListItem: vi.fn(async () => ({
      id: 'con-1',
      collectionId: 'pbc_consoles',
      bios: 'SCPH1001.BIN',
    })),
  };
}

function usersCollection() {
  return {
    authWithPassword: vi.fn(async () => {
      mocked.__authRecord.current = { id: 'u-1', username: 'player1' };
      mocked.__subscribers.forEach((cb) => cb());
    }),
    create: vi.fn(async () => ({})),
  };
}

// Per-test registry of the in-memory collections so assertions can reach in.
let discs: ReturnType<typeof discsCollection>;
let saveState: ReturnType<typeof saveStateCollection>;
let memcards: ReturnType<typeof memoryCardsCollection>;

function wireCollections(): void {
  discs = discsCollection();
  saveState = saveStateCollection();
  memcards = memoryCardsCollection();
  (pb.collection as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    switch (name) {
      case 'discs':
        return discs;
      case 'save_state':
        return saveState;
      case 'memory_cards':
        return memcards;
      case 'consoles':
        return consolesCollection();
      case 'users':
        return usersCollection();
      default:
        return {} as never;
    }
  });
}

describe('PsxAnywhereRepository — Phase 2 (cloud sync)', () => {
  beforeEach(() => {
    (pb.collection as ReturnType<typeof vi.fn>).mockReset();
    (pb.files.getURL as ReturnType<typeof vi.fn>).mockClear();
    mocked.__authRecord.current = { id: 'u-1', username: 'neo' };
    mocked.__subscribers.clear();
    // The repository caches disc-id lookups on the singleton; clear between
    // tests so call-count assertions stay deterministic.
    (
      psxAnywhereRepository as unknown as { _discIdCache: Map<string, string> }
    )._discIdCache.clear();
    wireCollections();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('auth (delegates to PSflix pb)', () => {
    it('isAuthenticated reflects pb.authStore', () => {
      expect(psxAnywhereRepository.isAuthenticated()).toBe(true);
      mocked.__authRecord.current = null;
      expect(psxAnywhereRepository.isAuthenticated()).toBe(false);
    });

    it('currentUsername prefers username, then email, then id', () => {
      mocked.__authRecord.current = { id: 'u-1', email: 'a@b.com' };
      expect(psxAnywhereRepository.currentUsername()).toBe('a@b.com');
      mocked.__authRecord.current = { id: 'u-1', username: 'neo', email: 'a@b.com' };
      expect(psxAnywhereRepository.currentUsername()).toBe('neo');
    });

    it('getCurrentUserId returns the record id', () => {
      expect(psxAnywhereRepository.getCurrentUserId()).toBe('u-1');
      mocked.__authRecord.current = null;
      expect(psxAnywhereRepository.getCurrentUserId()).toBeNull();
    });

    it('loginWithEmailPassword auths against the users collection', async () => {
      await psxAnywhereRepository.loginWithEmailPassword('a@b.com', 'pw');
      expect(mocked.__authRecord.current?.id).toBe('u-1');
    });

    it('logout clears the auth store and fires onAuthChange', () => {
      const cb = vi.fn();
      psxAnywhereRepository.onAuthChange(cb);
      psxAnywhereRepository.logout();
      expect(mocked.__authRecord.current).toBeNull();
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('fetchBiosUrl', () => {
    it('reads the first consoles record and resolves the file URL', async () => {
      const url = await psxAnywhereRepository.fetchBiosUrl();
      expect(url).toBe('https://pb/api/files/pbc_consoles/con-1/SCPH1001.BIN');
    });
  });

  describe('K. Disc-ID resolution', () => {
    it('resolveDiscId fetches by serial and caches the result', async () => {
      const id1 = await psxAnywhereRepository.resolveDiscId('SLUS001');
      expect(id1).toBe('disc-SLUS001');
      const id2 = await psxAnywhereRepository.resolveDiscId('SLUS001');
      expect(id2).toBe('disc-SLUS001');
      // Second call served from cache — pb only hit once.
      expect(discs.getFirstListItem).toHaveBeenCalledTimes(1);
    });

    it('resolveDiscId rejects malformed serials', async () => {
      await expect(psxAnywhereRepository.resolveDiscId('not a serial!')).rejects.toThrow(/serial/i);
      expect(discs.getFirstListItem).not.toHaveBeenCalled();
    });

    it('lookupDiscSerial reads from the cache after a resolve', async () => {
      await psxAnywhereRepository.resolveDiscId('SLUS123');
      expect(await psxAnywhereRepository.lookupDiscSerial('disc-SLUS123')).toBe('SLUS123');
      expect(discs.getOne).not.toHaveBeenCalled();
    });

    it('lookupDiscSerial falls back to getOne on cache miss', async () => {
      expect(await psxAnywhereRepository.lookupDiscSerial('disc-SLUS999')).toBe('SLUS999');
      expect(discs.getOne).toHaveBeenCalledWith('disc-SLUS999');
    });
  });

  describe('L. Save-state cloud ops', () => {
    it('uploadSaveState creates when absent, then updates on the second call', async () => {
      const buf = new ArrayBuffer(4);
      const created = await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', buf, 'u-1');
      expect(saveState.create).toHaveBeenCalledTimes(1);
      expect(saveState.update).not.toHaveBeenCalled();
      expect(created.discSerial).toBe('SLUS001');
      expect(created.type).toBe('slot1');

      const updated = await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', buf, 'u-1');
      expect(saveState.update).toHaveBeenCalledTimes(1);
      expect(saveState.create).toHaveBeenCalledTimes(1);
      expect(updated.id).toBe(created.id);
    });

    it('downloadSaveState resolves bytes via the file URL', async () => {
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', new ArrayBuffer(2), 'u-1');
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const out = await psxAnywhereRepository.downloadSaveState('SLUS001', 'slot1', 'u-1');
      expect(out.recordId).toBeTypeOf('string');
      expect(out.buf.byteLength).toBe(8);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/files/');
    });

    it('fetchSaveStateBytes fetches the record fresh then downloads bytes', async () => {
      const created = await psxAnywhereRepository.uploadSaveState(
        'SLUS001',
        'slot2',
        new ArrayBuffer(1),
        'u-1',
      );
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const buf = await psxAnywhereRepository.fetchSaveStateBytes(created);
      expect(buf.byteLength).toBe(16);
      expect(saveState.getOne).toHaveBeenCalledWith(created.id);
    });

    it('hasRemoteState returns true / false correctly', async () => {
      expect(await psxAnywhereRepository.hasRemoteState('SLUS001', 'slot1', 'u-1')).toBe(false);
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', new ArrayBuffer(1), 'u-1');
      expect(await psxAnywhereRepository.hasRemoteState('SLUS001', 'slot1', 'u-1')).toBe(true);
    });

    it('getSaveStateRecord expands disc and projects the serial', async () => {
      const created = await psxAnywhereRepository.uploadSaveState(
        'SLUS001',
        'auto',
        new ArrayBuffer(1),
        'u-1',
      );
      const dto = await psxAnywhereRepository.getSaveStateRecord(created.id);
      expect(dto.discSerial).toBe('SLUS001');
      expect(dto.type).toBe('auto');
      expect(saveState.getOne).toHaveBeenCalledWith(created.id, { expand: 'disc' });
    });

    it('fetchSaveStatesFor returns DTOs for the disc + user', async () => {
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', new ArrayBuffer(1), 'u-1');
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot2', new ArrayBuffer(1), 'u-1');
      // Another user / disc should be excluded.
      mocked.__authRecord.current = { id: 'u-2' };
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', new ArrayBuffer(1), 'u-2');
      mocked.__authRecord.current = { id: 'u-1' };

      const records = await psxAnywhereRepository.fetchSaveStatesFor('SLUS001', 'u-1');
      expect(records).toHaveLength(2);
      expect(records.map((r) => r.type).sort()).toEqual(['slot1', 'slot2']);
      expect(records.every((r) => r.discSerial === 'SLUS001')).toBe(true);
    });

    it('fetchNewerSaveStates filters by user', async () => {
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'auto', new ArrayBuffer(1), 'u-1');
      const records = await psxAnywhereRepository.fetchNewerSaveStates('u-1');
      expect(records).toHaveLength(1);
    });

    it('deleteSaveStateBySlot removes the matching cloud record', async () => {
      await psxAnywhereRepository.uploadSaveState('SLUS001', 'slot3', new ArrayBuffer(1), 'u-1');
      expect(await psxAnywhereRepository.hasRemoteState('SLUS001', 'slot3', 'u-1')).toBe(true);
      await psxAnywhereRepository.deleteSaveStateBySlot('SLUS001', 'slot3', 'u-1');
      expect(await psxAnywhereRepository.hasRemoteState('SLUS001', 'slot3', 'u-1')).toBe(false);
      expect(saveState.delete).toHaveBeenCalledTimes(1);
    });

    it('deleteSaveStateBySlot is a no-op when the record is already gone', async () => {
      await expect(
        psxAnywhereRepository.deleteSaveStateBySlot('SLUS001', 'slot1', 'u-1'),
      ).resolves.toBeUndefined();
      expect(saveState.delete).not.toHaveBeenCalled();
    });

    it('validators reject bad userId', async () => {
      await expect(
        psxAnywhereRepository.uploadSaveState('SLUS001', 'slot1', new ArrayBuffer(1), ''),
      ).rejects.toThrow(/userId/i);
    });
  });

  describe('M. Memory-card cloud ops', () => {
    it('uploadMemcard creates then updates', async () => {
      await psxAnywhereRepository.uploadMemcard(new ArrayBuffer(4), 'u-1', 'default');
      expect(memcards.create).toHaveBeenCalledTimes(1);
      await psxAnywhereRepository.uploadMemcard(new ArrayBuffer(4), 'u-1', 'default');
      expect(memcards.update).toHaveBeenCalledTimes(1);
      expect(memcards.create).toHaveBeenCalledTimes(1);
    });

    it('downloadMemcard fetches bytes via the file URL', async () => {
      await psxAnywhereRepository.uploadMemcard(new ArrayBuffer(4), 'u-1', 'default');
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(32),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const out = await psxAnywhereRepository.downloadMemcard('u-1', 'default');
      expect(out.buf.byteLength).toBe(32);
      expect(out.recordId).toBeTypeOf('string');
    });

    it('hasRemoteMemcard returns true / false', async () => {
      expect(await psxAnywhereRepository.hasRemoteMemcard('u-1', 'default')).toBe(false);
      await psxAnywhereRepository.uploadMemcard(new ArrayBuffer(2), 'u-1', 'default');
      expect(await psxAnywhereRepository.hasRemoteMemcard('u-1', 'default')).toBe(true);
    });

    it('fetchMemcardsForUser returns the user cards', async () => {
      await psxAnywhereRepository.uploadMemcard(new ArrayBuffer(2), 'u-1', 'default');
      const cards = await psxAnywhereRepository.fetchMemcardsForUser('u-1');
      expect(cards.map((c) => c.label)).toEqual(['default']);
    });
  });

  describe('fetchGames (unused — PSflix has its own catalog)', () => {
    it('rejects', async () => {
      await expect(psxAnywhereRepository.fetchGames()).rejects.toThrow(/catalog/);
    });
  });
});
