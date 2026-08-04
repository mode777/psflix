'use strict';

// Recording mock satisfying the full `Repository` interface so consumers can
// import from 'repository' without pulling in PocketBase SDK.  Mirrors the
// convention of tests/client/helpers/emulator-mock.ts.
//
// Usage:
//   import type { Repository } from 'repository';
//   const repo = createMockRepository({ authed: true, userId: 'u1' }) as unknown as Repository;

import type { Repository, SaveStateRecordDto } from '@/vendor/psxanywhere/repository/repository';

export interface MockRepoCalls {
  download: string[];
  upload: { discSerial: string; type: string; userId: string }[];
  uploadMemcard: { buf: ArrayBuffer; userId: string; label: string }[];
  downloadMemcard: string[];
  fetchGames: number;
  fetchBiosUrl: number;
  hasRemote: number;
  lookup: string[];
  bytes: string[];
  getRecord: string[];
  list: (string | undefined)[];
}

export interface MockRepository extends Repository {
  calls: MockRepoCalls;
  clear(): void;
}

export interface MockRepoOpts {
  authed?: boolean;
  userId?: string | null;
  uploadSaveStateImpl?: (discSerial: string) => SaveStateRecordDto;
  uploadSaveStateThrow?: Error;
  downloadSaveStateImpl?: () => { buf: ArrayBuffer; recordId: string; updated: string };
  downloadSaveStateThrow?: Error;
  uploadMemcardImpl?: (buf: ArrayBuffer, userId: string, label: string) => Promise<void>;
  uploadMemcardThrow?: Error;
  downloadMemcardImpl?: () =>
    | { buf: ArrayBuffer; recordId: string; updated: string }
    | Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>;
  downloadMemcardThrow?: Error;
  fetchSaveStatesForImpl?: () => SaveStateRecordDto[];
  lookupDiscSerialImpl?: (id: string) => string;
  fetchSaveStateBytesImpl?: (id: string) => ArrayBuffer;
  hasRemoteStateImpl?: () => boolean;
  getSaveStateRecordImpl?: (id: string) => SaveStateRecordDto;
}

export function createMockRepository(opts: MockRepoOpts = {}): MockRepository {
  const calls: MockRepoCalls = {
    download: [],
    upload: [],
    uploadMemcard: [],
    downloadMemcard: [],
    fetchGames: 0,
    fetchBiosUrl: 0,
    hasRemote: 0,
    lookup: [],
    bytes: [],
    getRecord: [],
    list: [],
  };

  const defaultDto = (id: string, updated = '2024-01-01T00:00:00.000Z'): SaveStateRecordDto => ({
    id,
    updated,
    type: 'slot1',
    discId: 'd1',
    dataFilename: 'file.bin',
    discSerial: 'SLUS001',
  });

  function clear() {
    calls.download.length = 0;
    calls.upload.length = 0;
    calls.uploadMemcard.length = 0;
    calls.downloadMemcard.length = 0;
    calls.fetchGames = 0;
    calls.fetchBiosUrl = 0;
    calls.hasRemote = 0;
    calls.lookup.length = 0;
    calls.bytes.length = 0;
    calls.getRecord.length = 0;
    calls.list.length = 0;
  }

  return {
    calls,
    clear,
    // Auth
    isAuthenticated: () => opts.authed ?? false,
    currentUsername: () => null,
    onAuthChange: () => {},
    loginWithEmailPassword: async () => {},
    registerWithEmailPassword: async () => {},
    logout: () => {},
    getCurrentUserId: () => (opts.userId === undefined ? 'u1' : opts.userId),
    // Game catalog
    fetchGames: async () => {
      calls.fetchGames++;
      return [];
    },
    fetchBiosUrl: async () => {
      calls.fetchBiosUrl++;
      return 'https://bios.bin';
    },
    // Disc ID resolution
    resolveDiscId: async (serial: string) => `disc-${serial}`,
    lookupDiscSerial: async (id: string) => {
      calls.lookup.push(id);
      return opts.lookupDiscSerialImpl ? opts.lookupDiscSerialImpl(id) : 'SLUS001';
    },
    // Save state cloud operations
    uploadSaveState: async (discSerial, type, _buf, userId) => {
      calls.upload.push({ discSerial, type, userId });
      if (opts.uploadSaveStateThrow) throw opts.uploadSaveStateThrow;
      const d = opts.uploadSaveStateImpl
        ? opts.uploadSaveStateImpl(discSerial)
        : defaultDto('pb-up', '2024-06-01T00:00:00.000Z');
      return { ...d, discSerial };
    },
    downloadSaveState: async (discSerial, type) => {
      calls.download.push(`${discSerial}:${type}`);
      if (opts.downloadSaveStateThrow) throw opts.downloadSaveStateThrow;
      return opts.downloadSaveStateImpl
        ? opts.downloadSaveStateImpl()
        : {
            buf: new Uint8Array([55]).buffer,
            recordId: 'pb-dl',
            updated: '2024-06-02T00:00:00.000Z',
          };
    },
    fetchSaveStateBytes: async (r) => {
      calls.bytes.push(r.id);
      return opts.fetchSaveStateBytesImpl
        ? opts.fetchSaveStateBytesImpl(r.id)
        : new Uint8Array([33]).buffer;
    },
    hasRemoteState: async () => {
      calls.hasRemote++;
      return opts.hasRemoteStateImpl ? opts.hasRemoteStateImpl() : false;
    },
    getSaveStateRecord: async (id) => {
      calls.getRecord.push(id);
      return opts.getSaveStateRecordImpl ? opts.getSaveStateRecordImpl(id) : defaultDto(id);
    },
    fetchNewerSaveStates: async () => [],
    fetchSaveStatesFor: async (_disc, _user, since) => {
      calls.list.push(since);
      return opts.fetchSaveStatesForImpl ? opts.fetchSaveStatesForImpl() : [];
    },
    // Memory card cloud operations
    uploadMemcard: async (buf, userId, label) => {
      calls.uploadMemcard.push({ buf, userId, label });
      if (opts.uploadMemcardImpl) return opts.uploadMemcardImpl(buf, userId, label);
      if (opts.uploadMemcardThrow) throw opts.uploadMemcardThrow;
    },
    downloadMemcard: async (userId, label) => {
      calls.downloadMemcard.push(`${userId}:${label}`);
      if (opts.downloadMemcardThrow) throw opts.downloadMemcardThrow;
      return opts.downloadMemcardImpl
        ? opts.downloadMemcardImpl()
        : { buf: new Uint8Array([42]).buffer, recordId: 'r1', updated: '2024-01-01T00:00:00.000Z' };
    },
    hasRemoteMemcard: async () => false,
  };
}
