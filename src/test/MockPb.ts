import { vi } from 'vitest';
import type { RecordModel, ListResult } from 'pocketbase';

export type MockRecord = RecordModel & { id: string; collectionId: string };

export type MockListResult<T extends MockRecord> = ListResult<T>;

export type FileHandler = (
  record: { collectionId: string; id: string },
  filename: string,
) => string;

export type MockAuthStore = {
  record: MockRecord | null;
  isValid: boolean;
  clear: () => void;
  onChange: (cb: () => void) => () => void;
};

export type MockCollection = {
  getList: ReturnType<typeof vi.fn>;
  getOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  authWithPassword: ReturnType<typeof vi.fn>;
};

export type MockPb = {
  files: { getURL: FileHandler };
  authStore: MockAuthStore;
  collection: ReturnType<typeof vi.fn>;
  autoCancellation: ReturnType<typeof vi.fn>;
};

export type MockPbOptions = {
  url?: string;
};

export function createMockPb(opts: MockPbOptions = {}): MockPb {
  const url = opts.url ?? 'http://localhost:8090';

  const onChangeSubscribers = new Set<() => void>();
  const authRecord: { current: MockRecord | null } = { current: null };

  const authStore: MockAuthStore = {
    get record() {
      return authRecord.current;
    },
    get isValid() {
      return authRecord.current !== null;
    },
    clear: vi.fn(() => {
      authRecord.current = null;
      onChangeSubscribers.forEach((cb) => cb());
    }),
    onChange: vi.fn((cb: () => void) => {
      onChangeSubscribers.add(cb);
      return () => onChangeSubscribers.delete(cb);
    }),
  };

  const files = {
    getURL: vi.fn(
      (record: { collectionId: string; id: string }, filename: string): string =>
        `${url}/api/files/${record.collectionId}/${record.id}/${filename}`,
    ),
  };

  const collections = new Map<string, MockCollection>();
  const collectionFn = vi.fn((name: string): MockCollection => {
    const existing = collections.get(name);
    if (existing) return existing;
    const col: MockCollection = {
      getList: vi.fn(async () => ({
        items: [],
        page: 1,
        perPage: 0,
        totalItems: 0,
        totalPages: 0,
      })),
      getOne: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      create: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      authWithPassword: vi.fn(async () => {
        throw new Error('not implemented');
      }),
    };
    collections.set(name, col);
    return col;
  });

  return {
    files,
    authStore,
    collection: collectionFn,
    autoCancellation: vi.fn(),
  };
}

export function installMockPb(): MockPb {
  const mock = createMockPb();
  vi.mock('pocketbase', () => ({
    default: vi.fn(() => mock),
  }));
  return mock;
}
