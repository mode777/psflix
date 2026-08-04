// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SaveStateStore } from '@/vendor/psxanywhere/client/SaveStateStore';
import type { Repository } from 'repository';
import { InMemorySaveStateStorage } from '@/vendor/psxanywhere/client/saveStateStorage';
import { UNSYNCED, SYNCED, SLOT_AUTO } from '@/vendor/psxanywhere/client/slotKey';
import type { Slot } from '@/vendor/psxanywhere/client/saveStateStorage';

interface RepoOpts {
  authed?: boolean;
  userId?: string | null;
  hasRemote?: boolean;
  download?: () => { buf: ArrayBuffer; recordId: string; updated: string };
}

function createRepo(opts: RepoOpts = {}) {
  const calls = { download: [] as string[], hasRemote: 0 };
  const repo: Repository = {
    isAuthenticated: () => opts.authed ?? false,
    currentUsername: () => null,
    onAuthChange: () => {},
    loginWithEmailPassword: async () => {},
    registerWithEmailPassword: async () => {},
    logout: () => {},
    getCurrentUserId: () => (opts.userId === undefined ? 'user1' : opts.userId),
    fetchGames: async () => [],
    fetchBiosUrl: async () => '',
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
    downloadSaveState: async (discSerial, type) => {
      calls.download.push(`${discSerial}:${type}`);
      if (opts.download) return opts.download();
      return { buf: new ArrayBuffer(8), recordId: 'rec1', updated: '2024-01-01T00:00:00.000Z' };
    },
    fetchSaveStateBytes: async () => new ArrayBuffer(0),
    hasRemoteState: async () => {
      calls.hasRemote += 1;
      return opts.hasRemote ?? false;
    },
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
    uploadMemcard: async () => {},
    downloadMemcard: async () => ({ buf: new ArrayBuffer(0), recordId: '', updated: '' }),
    hasRemoteMemcard: async () => false,
  };
  return { repo, calls };
}

function buf(n: number): ArrayBuffer {
  const a = new Uint8Array([n]);
  return a.buffer;
}

describe('SaveStateStore.save', () => {
  it('persists a buffer that load can read back', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo } = createRepo();
    const store = new SaveStateStore(storage, repo, () => {});

    await store.save(0, buf(42), 'SLUS001');
    const loaded = await store.load(0, 'SLUS001');
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)[0]).toBe(42);
  });

  it('writes the record as UNSYNCED with no cloud identity', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo } = createRepo();
    const store = new SaveStateStore(storage, repo, () => {});

    await store.save(SLOT_AUTO as Slot, buf(1), 'SLUS001');
    const rec = await storage.get('SLUS001:auto');
    expect(rec).not.toBeNull();
    expect(rec!.synced).toBe(UNSYNCED);
    expect(rec!.pocketbaseId).toBeNull();
    expect(rec!.serverUpdated).toBeNull();
  });

  it('defensive-copies the buffer (mutating the caller buffer does not change the stored state)', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo } = createRepo();
    const store = new SaveStateStore(storage, repo, () => {});

    const input = new Uint8Array([9]);
    await store.save(0, input.buffer, 'SLUS001');
    input[0] = 99;
    const loaded = await store.load(0, 'SLUS001');
    expect(new Uint8Array(loaded!)[0]).toBe(9);
  });
});

describe('SaveStateStore.load', () => {
  it('serves a local hit without touching the repo', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: true });
    const store = new SaveStateStore(storage, repo, () => {});

    await store.save(0, buf(5), 'SLUS001');
    const loaded = await store.load(0, 'SLUS001');
    expect(new Uint8Array(loaded!)[0]).toBe(5);
    expect(calls.download).toHaveLength(0);
  });

  it('downloads and caches on a local miss when authed', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({
      authed: true,
      download: () => ({ buf: buf(77), recordId: 'rec9', updated: '2024-02-02T00:00:00.000Z' }),
    });
    const store = new SaveStateStore(storage, repo, () => {});

    const loaded = await store.load(0, 'SLUS001');
    expect(new Uint8Array(loaded!)[0]).toBe(77);
    expect(calls.download).toEqual(['SLUS001:slot1']);

    // Cached now: a second load must not re-download.
    const loaded2 = await store.load(0, 'SLUS001');
    expect(new Uint8Array(loaded2!)[0]).toBe(77);
    expect(calls.download).toHaveLength(1);

    // The cached record carries the cloud identity and is marked SYNCED.
    const rec = await storage.get('SLUS001:slot1');
    expect(rec!.synced).toBe(SYNCED);
    expect(rec!.pocketbaseId).toBe('rec9');
    expect(rec!.serverUpdated).toBe('2024-02-02T00:00:00.000Z');
  });

  it('returns null on a local miss when unauthed (no download attempted)', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: false });
    const store = new SaveStateStore(storage, repo, () => {});

    expect(await store.load(0, 'SLUS001')).toBeNull();
    expect(calls.download).toHaveLength(0);
  });

  it('returns null and logs when authed but the download fails', async () => {
    const storage = new InMemorySaveStateStorage();
    const log = vi.fn();
    const { repo, calls } = createRepo({
      authed: true,
      download: () => {
        throw new Error('boom');
      },
    });
    const store = new SaveStateStore(storage, repo, log);

    expect(await store.load(0, 'SLUS001')).toBeNull();
    expect(calls.download).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('cloud download failed'));
  });

  it('returns null when authed but no user id is available', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: true, userId: null });
    const store = new SaveStateStore(storage, repo, () => {});

    expect(await store.load(0, 'SLUS001')).toBeNull();
    expect(calls.download).toHaveLength(0);
  });
});

describe('SaveStateStore.hasState', () => {
  it('is true on a local hit without a remote check', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: true, hasRemote: true });
    const store = new SaveStateStore(storage, repo, () => {});

    await store.save(0, buf(1), 'SLUS001');
    expect(await store.hasState(0, 'SLUS001')).toBe(true);
    expect(calls.hasRemote).toBe(0);
  });

  it('falls back to the remote check on a local miss when authed', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: true, hasRemote: true });
    const store = new SaveStateStore(storage, repo, () => {});

    expect(await store.hasState(0, 'SLUS001')).toBe(true);
    expect(calls.hasRemote).toBe(1);
  });

  it('is false on a local miss when unauthed', async () => {
    const storage = new InMemorySaveStateStorage();
    const { repo, calls } = createRepo({ authed: false, hasRemote: true });
    const store = new SaveStateStore(storage, repo, () => {});

    expect(await store.hasState(0, 'SLUS001')).toBe(false);
    expect(calls.hasRemote).toBe(0);
  });

  it('is false and logs when the remote check throws', async () => {
    const storage = new InMemorySaveStateStorage();
    const log = vi.fn();
    const { repo } = createRepo({ authed: true });
    repo.hasRemoteState = async () => {
      throw new Error('net');
    };
    const store = new SaveStateStore(storage, repo, log);

    expect(await store.hasState(0, 'SLUS001')).toBe(false);
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('hasRemoteState failed'));
  });
});
