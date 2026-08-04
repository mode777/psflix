// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SaveStateSyncEngine } from '@/vendor/psxanywhere/client/SaveStateSyncEngine';
import type { Repository } from 'repository';
import { InMemorySaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import type {
  SaveStateStorage,
  SaveStateRecord,
} from '@/vendor/psxanywhere/client/saveStateStorage';
import { UNSYNCED, SYNCED } from '@/vendor/psxanywhere/client/slotKey';

// Local DTO shape (mirrors repository.SaveStateRecordDto) — defined locally so
// the test never imports the 'repository' barrel (which would load PocketBase).
interface DtoShape {
  id: string;
  updated: string;
  type: string;
  discId: string;
  dataFilename: string;
  discSerial: string | null;
}

function dto(o: Partial<DtoShape> & { id: string }): DtoShape {
  return {
    updated: '2024-01-01T00:00:00.000Z',
    type: 'slot1',
    discId: 'd1',
    dataFilename: 'file.bin',
    discSerial: 'SLUS001',
    ...o,
  };
}

function buf(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

function unsyncedRec(): SaveStateRecord {
  return {
    id: 'SLUS001:slot1',
    buf: buf(1),
    discSerial: 'SLUS001',
    slot: 0,
    localTimestamp: 1000,
    synced: UNSYNCED,
    pocketbaseId: null,
    serverUpdated: null,
  };
}

interface SyncRepoOpts {
  authed?: boolean;
  userId?: string | null;
  upload?: (discSerial: string) => DtoShape;
  uploadThrow?: Error;
  download?: () => { buf: ArrayBuffer; recordId: string; updated: string };
  getRecord?: (id: string) => DtoShape;
  list?: () => DtoShape[];
  bytes?: (id: string) => ArrayBuffer;
  lookup?: (id: string) => string;
}

function createSyncRepo(opts: SyncRepoOpts = {}) {
  const calls = {
    upload: [] as { discSerial: string; type: string; userId: string }[],
    download: [] as string[],
    bytes: [] as string[],
    getRecord: [] as string[],
    list: [] as (string | undefined)[],
    lookup: [] as string[],
  };
  const repo: Repository = {
    isAuthenticated: () => opts.authed ?? false,
    currentUsername: () => null,
    onAuthChange: () => {},
    loginWithEmailPassword: async () => {},
    registerWithEmailPassword: async () => {},
    logout: () => {},
    getCurrentUserId: () => opts.userId ?? 'u1',
    fetchGames: async () => [],
    fetchBiosUrl: async () => '',
    resolveDiscId: async () => '',
    uploadSaveState: async (discSerial, type, _buf, userId) => {
      calls.upload.push({ discSerial, type, userId });
      if (opts.uploadThrow) throw opts.uploadThrow;
      return (
        opts.upload
          ? opts.upload(discSerial)
          : dto({ id: 'pb-up', updated: '2024-06-01T00:00:00.000Z', discSerial })
      ) as any;
    },
    downloadSaveState: async (discSerial, type) => {
      calls.download.push(`${discSerial}:${type}`);
      return opts.download
        ? opts.download()
        : { buf: buf(55), recordId: 'pb-dl', updated: '2024-06-02T00:00:00.000Z' };
    },
    fetchSaveStateBytes: async (r: any) => {
      calls.bytes.push(r.id);
      return opts.bytes ? opts.bytes(r.id) : buf(33);
    },
    getSaveStateRecord: async (id: string) => {
      calls.getRecord.push(id);
      return (
        opts.getRecord ? opts.getRecord(id) : dto({ id, updated: '2024-01-01T00:00:00.000Z' })
      ) as any;
    },
    fetchSaveStatesFor: async (_disc: string, _user: string, since?: string) => {
      calls.list.push(since);
      return (opts.list ? opts.list() : []) as any;
    },
    lookupDiscSerial: async (id: string) => {
      calls.lookup.push(id);
      return opts.lookup ? opts.lookup(id) : 'SLUS001';
    },
    hasRemoteState: async () => false,
    fetchNewerSaveStates: async () => [],
    uploadMemcard: async () => {},
    downloadMemcard: async () => ({ buf: new ArrayBuffer(0), recordId: '', updated: '' }),
    hasRemoteMemcard: async () => false,
  };
  return { repo, calls };
}

function engineWith(opts: SyncRepoOpts = {}) {
  const storage = new InMemorySaveStateStorage();
  const { repo, calls } = createSyncRepo(opts);
  const engine = new SaveStateSyncEngine(
    storage,
    repo,
    () => {},
    () => {},
  );
  return { engine, storage, repo, calls };
}

// ── Auth gating ───────────────────────────────────────────────────────

describe('SaveStateSyncEngine auth gating', () => {
  it('syncNow is a no-op when unauthed', async () => {
    const { engine, storage, calls } = engineWith({ authed: false });
    await storage.put(unsyncedRec());
    await engine.syncNow();
    expect(calls.upload).toHaveLength(0);
  });

  it('skips the download phase when no active disc is set', async () => {
    const { engine, calls } = engineWith({
      authed: true,
      list: () => [dto({ id: 'x' })],
    });
    await engine.syncNow();
    expect(calls.list).toHaveLength(0);
  });
});

// ── Upload ────────────────────────────────────────────────────────────

describe('SaveStateSyncEngine upload', () => {
  it('pushes unsynced records and marks them SYNCED with the cloud identity', async () => {
    const { engine, storage, calls } = engineWith({ authed: true });
    await storage.put(unsyncedRec());

    await engine.syncNow();

    expect(calls.upload).toEqual([{ discSerial: 'SLUS001', type: 'slot1', userId: 'u1' }]);
    expect(calls.getRecord).toHaveLength(0); // no cloud twin known → no pre-check
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(SYNCED);
    expect(rec!.pocketbaseId).toBe('pb-up');
    expect(rec!.serverUpdated).toBe('2024-06-01T00:00:00.000Z');
  });

  it('pulls instead of pushing when the cloud twin is newer than the local edit', async () => {
    const storage = new InMemorySaveStateStorage();
    await storage.put({
      ...unsyncedRec(),
      pocketbaseId: 'pb1',
      serverUpdated: '2024-01-01T00:00:00.000Z',
      localTimestamp: 1000,
    });
    const { repo, calls } = createSyncRepo({
      authed: true,
      getRecord: (id) => dto({ id, updated: '2030-01-01T00:00:00.000Z' }),
      download: () => ({ buf: buf(88), recordId: 'pb1', updated: '2030-01-01T00:00:00.000Z' }),
    });
    const engine = new SaveStateSyncEngine(
      storage,
      repo,
      () => {},
      () => {},
    );

    await engine.syncNow();

    expect(calls.getRecord).toEqual(['pb1']);
    expect(calls.download).toEqual(['SLUS001:slot1']);
    expect(calls.upload).toHaveLength(0);
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(SYNCED);
    expect(new Uint8Array(rec!.buf)[0]).toBe(88);
    expect(rec!.serverUpdated).toBe('2030-01-01T00:00:00.000Z');
  });

  it('pushes when the cloud twin has not moved since the last known version', async () => {
    const storage = new InMemorySaveStateStorage();
    const known = '2024-05-01T00:00:00.000Z';
    await storage.put({
      ...unsyncedRec(),
      pocketbaseId: 'pb1',
      serverUpdated: known,
      localTimestamp: 1000,
    });
    const { repo, calls } = createSyncRepo({
      authed: true,
      getRecord: (id) => dto({ id, updated: known }),
    });
    const engine = new SaveStateSyncEngine(
      storage,
      repo,
      () => {},
      () => {},
    );

    await engine.syncNow();

    expect(calls.upload).toHaveLength(1);
    expect(calls.download).toHaveLength(0);
  });

  it('keeps the record unsynced and logs when an upload throws', async () => {
    const log = vi.fn();
    const storage = new InMemorySaveStateStorage();
    await storage.put(unsyncedRec());
    const { repo, calls } = createSyncRepo({ authed: true, uploadThrow: new Error('net') });
    const engine = new SaveStateSyncEngine(storage, repo, log, () => {});

    await engine.syncNow();

    expect(calls.upload).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('error', expect.stringContaining('Upload failed'));
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(UNSYNCED);
  });
});

// ── Download ──────────────────────────────────────────────────────────

describe('SaveStateSyncEngine download', () => {
  it('downloads and stores a brand-new server state', async () => {
    const { engine, storage, calls } = engineWith({
      authed: true,
      list: () => [dto({ id: 'pbA', updated: '2024-03-01T00:00:00.000Z' })],
      bytes: () => buf(12),
    });
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();

    expect(calls.list).toHaveLength(1);
    expect(calls.bytes).toEqual(['pbA']);
    const rec = await storage.get('SLUS001:slot1');
    expect(rec).not.toBeNull();
    expect(rec!.synced).toBe(SYNCED);
    expect(rec!.pocketbaseId).toBe('pbA');
    expect(new Uint8Array(rec!.buf)[0]).toBe(12);
  });

  it('overwrites a local twin when the server is strictly newer', async () => {
    const storage = new InMemorySaveStateStorage();
    await storage.put({
      id: 'SLUS001:slot1',
      buf: buf(1),
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: 1000,
      synced: SYNCED,
      pocketbaseId: 'pbOld',
      serverUpdated: '2020-01-01T00:00:00.000Z',
    });
    const { repo, calls } = createSyncRepo({
      authed: true,
      list: () => [dto({ id: 'pbNew', updated: '2024-09-01T00:00:00.000Z' })],
      bytes: () => buf(99),
    });
    const engine = new SaveStateSyncEngine(
      storage,
      repo,
      () => {},
      () => {},
    );
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();

    const rec = await storage.get('SLUS001:slot1');
    expect(new Uint8Array(rec!.buf)[0]).toBe(99);
    expect(rec!.pocketbaseId).toBe('pbNew');
    expect(rec!.serverUpdated).toBe('2024-09-01T00:00:00.000Z');
    expect(rec!.synced).toBe(SYNCED);
    expect(calls.bytes).toHaveLength(1);
  });

  it('marks the local twin UNSYNCED when the local edit is newer than the server', async () => {
    const storage = new InMemorySaveStateStorage();
    await storage.put({
      id: 'SLUS001:slot1',
      buf: buf(1),
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: Date.now(),
      synced: SYNCED,
      pocketbaseId: 'pbOld',
      serverUpdated: '2020-01-01T00:00:00.000Z',
    });
    const { repo, calls } = createSyncRepo({
      authed: true,
      list: () => [dto({ id: 'pbNew', updated: '2021-01-01T00:00:00.000Z' })],
    });
    const engine = new SaveStateSyncEngine(
      storage,
      repo,
      () => {},
      () => {},
    );
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();

    expect(calls.bytes).toHaveLength(0);
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(UNSYNCED);
    expect(new Uint8Array(rec!.buf)[0]).toBe(1); // untouched
  });

  it('is a noop when the local twin is already at the server version', async () => {
    const storage = new InMemorySaveStateStorage();
    const same = '2024-05-05T00:00:00.000Z';
    await storage.put({
      id: 'SLUS001:slot1',
      buf: buf(1),
      discSerial: 'SLUS001',
      slot: 0,
      localTimestamp: 1000,
      synced: SYNCED,
      pocketbaseId: 'pbSame',
      serverUpdated: same,
    });
    const { repo, calls } = createSyncRepo({
      authed: true,
      list: () => [dto({ id: 'pbSame', updated: same })],
    });
    const engine = new SaveStateSyncEngine(
      storage,
      repo,
      () => {},
      () => {},
    );
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();

    expect(calls.bytes).toHaveLength(0);
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(SYNCED);
    expect(rec!.pocketbaseId).toBe('pbSame');
  });

  it('resolves discSerial via lookupDiscSerial when the DTO lacks it', async () => {
    const { engine, storage, calls } = engineWith({
      authed: true,
      list: () => [dto({ id: 'pbA', discSerial: null, discId: 'd42' })],
      bytes: () => buf(7),
      lookup: (id) => (id === 'd42' ? 'SLUS999' : 'SLUS001'),
    });
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();

    expect(calls.lookup).toEqual(['d42']);
    const rec = await storage.get('SLUS999:slot1');
    expect(rec).not.toBeNull();
    expect(rec!.discSerial).toBe('SLUS999');
  });

  it('only downloads once per session and records the sync cursor', async () => {
    const { engine, storage, calls } = engineWith({ authed: true, list: () => [] });
    engine.setActiveDisc('SLUS001');

    await engine.syncNow();
    await engine.syncNow();

    expect(calls.list).toHaveLength(1);
    expect(await storage.getMeta('lastSyncTime:SLUS001')).not.toBeNull();
  });
});

// ── Sync-level failure ───────────────────────────────────────────────

describe('SaveStateSyncEngine failure handling', () => {
  it('toasts when the sync itself throws at the top level', async () => {
    const base = new InMemorySaveStateStorage();
    const storage: SaveStateStorage = {
      get: (k) => base.get(k),
      put: (r) => base.put(r),
      getAllUnsynced: async () => {
        throw new Error('idb gone');
      },
      getMeta: (k) => base.getMeta(k),
      putMeta: (k, v) => base.putMeta(k, v),
    };
    const toast = vi.fn();
    const { repo } = createSyncRepo({ authed: true });
    const engine = new SaveStateSyncEngine(storage, repo, () => {}, toast);

    await engine.syncNow();

    expect(toast).toHaveBeenCalledWith(expect.stringContaining('State sync failed'));
  });
});

// ── Timer / lifecycle ────────────────────────────────────────────────

describe('SaveStateSyncEngine timer lifecycle', () => {
  it('stops the periodic sync after dispose()', async () => {
    vi.useFakeTimers();
    try {
      const storage = new InMemorySaveStateStorage();
      await storage.put(unsyncedRec()); // stays unsynced: upload throws
      const { repo, calls } = createSyncRepo({ authed: true, uploadThrow: new Error('net') });
      const engine = new SaveStateSyncEngine(
        storage,
        repo,
        () => {},
        () => {},
      );

      engine.onAuthChange(true);
      await vi.advanceTimersByTimeAsync(0); // flush the immediate _doSync
      const afterImmediate = calls.upload.length;
      expect(afterImmediate).toBeGreaterThanOrEqual(1);

      await vi.advanceTimersByTimeAsync(1000); // one interval tick
      expect(calls.upload.length).toBe(afterImmediate + 1);

      engine.dispose();
      await vi.advanceTimersByTimeAsync(5000); // would tick ~5 more times if not disposed
      expect(calls.upload.length).toBe(afterImmediate + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the periodic sync on de-auth (onAuthChange(false))', async () => {
    vi.useFakeTimers();
    try {
      const storage = new InMemorySaveStateStorage();
      await storage.put(unsyncedRec());
      const { repo, calls } = createSyncRepo({ authed: true, uploadThrow: new Error('net') });
      const engine = new SaveStateSyncEngine(
        storage,
        repo,
        () => {},
        () => {},
      );

      engine.onAuthChange(true);
      await vi.advanceTimersByTimeAsync(0);
      const afterImmediate = calls.upload.length;

      await vi.advanceTimersByTimeAsync(1000);
      expect(calls.upload.length).toBe(afterImmediate + 1);

      engine.onAuthChange(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls.upload.length).toBe(afterImmediate + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
