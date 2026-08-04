import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('PsxAnywhereRepository — Phase 1', () => {
  beforeEach(() => {
    (pb.collection as ReturnType<typeof vi.fn>).mockReset();
    (pb.files.getURL as ReturnType<typeof vi.fn>).mockClear();
    mocked.__authRecord.current = null;
    mocked.__subscribers.clear();
  });

  describe('auth (delegates to PSflix pb)', () => {
    it('isAuthenticated reflects pb.authStore', () => {
      expect(psxAnywhereRepository.isAuthenticated()).toBe(false);
      mocked.__authRecord.current = { id: 'u-1', username: 'x' };
      expect(psxAnywhereRepository.isAuthenticated()).toBe(true);
    });

    it('currentUsername prefers username, then email, then id', () => {
      expect(psxAnywhereRepository.currentUsername()).toBeNull();
      mocked.__authRecord.current = { id: 'u-1', email: 'a@b.com' };
      expect(psxAnywhereRepository.currentUsername()).toBe('a@b.com');
      mocked.__authRecord.current = { id: 'u-1', username: 'neo', email: 'a@b.com' };
      expect(psxAnywhereRepository.currentUsername()).toBe('neo');
    });

    it('getCurrentUserId returns the record id', () => {
      expect(psxAnywhereRepository.getCurrentUserId()).toBeNull();
      mocked.__authRecord.current = { id: 'u-9' };
      expect(psxAnywhereRepository.getCurrentUserId()).toBe('u-9');
    });

    it('loginWithEmailPassword auths against the users collection', async () => {
      (pb.collection as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
        name === 'users' ? usersCollection() : ({} as never),
      );
      await psxAnywhereRepository.loginWithEmailPassword('a@b.com', 'pw');
      expect(mocked.__authRecord.current?.id).toBe('u-1');
    });

    it('logout clears the auth store and fires onAuthChange', () => {
      const cb = vi.fn();
      psxAnywhereRepository.onAuthChange(cb);
      mocked.__authRecord.current = { id: 'u-1' };
      psxAnywhereRepository.logout();
      expect(mocked.__authRecord.current).toBeNull();
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('fetchBiosUrl (Phase 1 needs this)', () => {
    it('reads the first consoles record and resolves the file URL', async () => {
      (pb.collection as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
        name === 'consoles' ? consolesCollection() : ({} as never),
      );
      const url = await psxAnywhereRepository.fetchBiosUrl();
      expect(url).toBe('https://pb/api/files/pbc_consoles/con-1/SCPH1001.BIN');
    });
  });

  describe('Phase 1 stubs (cloud sync is Phase 2)', () => {
    it('hasRemoteState / hasRemoteMemcard resolve false (no cloud)', async () => {
      expect(await psxAnywhereRepository.hasRemoteState('S', 'slot1', 'u')).toBe(false);
      expect(await psxAnywhereRepository.hasRemoteMemcard('u', 'mc-main')).toBe(false);
    });

    it('fetchSaveStatesFor / fetchNewerSaveStates resolve empty arrays', async () => {
      expect(await psxAnywhereRepository.fetchSaveStatesFor('S', 'u')).toEqual([]);
      expect(await psxAnywhereRepository.fetchNewerSaveStates('u')).toEqual([]);
    });

    it('cloud write/fetch ops reject with a Phase 2 marker', async () => {
      await expect(
        psxAnywhereRepository.uploadSaveState('S', 'slot1', new ArrayBuffer(1), 'u'),
      ).rejects.toThrow(/Phase 2/);
      await expect(psxAnywhereRepository.downloadSaveState('S', 'slot1', 'u')).rejects.toThrow(
        /Phase 2/,
      );
      await expect(psxAnywhereRepository.resolveDiscId('S')).rejects.toThrow(/Phase 2/);
      await expect(
        psxAnywhereRepository.uploadMemcard(new ArrayBuffer(1), 'u', 'mc'),
      ).rejects.toThrow(/Phase 2/);
    });

    it('fetchGames rejects (PSflix has its own react-query catalog)', async () => {
      await expect(psxAnywhereRepository.fetchGames()).rejects.toThrow(/catalog/);
    });
  });
});
