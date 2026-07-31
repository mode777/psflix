import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPb = vi.hoisted(() => {
  const authRecord: { current: unknown } = { current: null };
  const onChangeSubscribers = new Set<() => void>();
  return {
    authRecord,
    onChangeSubscribers,
    authStore: {
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
    },
    files: {
      getURL: vi.fn(() => ''),
    },
    collection: vi.fn(),
    autoCancellation: vi.fn(),
  };
});

vi.mock(import('@/lib/pb'), async () => ({ pb: mockPb as never }));

import { pb } from '@/lib/pb';
import { useAuthStore } from './store';
import type { AuthUser } from '@/lib/pb-auth';

void pb;

const TEST_USER: AuthUser = {
  id: 'abc123',
  email: 'demo@example.com',
  name: 'Demo',
};

beforeEach(() => {
  mockPb.authRecord.current = null;
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

describe('useAuthStore', () => {
  it('starts unauthenticated when no user is in pb.authStore', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    mockPb.authRecord.current = null;
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('registers a listener on the pb authStore at module load', () => {
    expect(mockPb.authStore.onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockPb.onChangeSubscribers.size).toBeGreaterThanOrEqual(1);
  });

  it('setUser writes a user and flips isAuthenticated', () => {
    useAuthStore.getState().setUser(TEST_USER);
    expect(useAuthStore.getState().user).toEqual(TEST_USER);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('setUser(null) clears the user and flips isAuthenticated off', () => {
    useAuthStore.getState().setUser(TEST_USER);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('syncs state when pb.authStore.onChange fires', () => {
    useAuthStore.getState().setUser(TEST_USER);

    mockPb.authRecord.current = TEST_USER;
    mockPb.onChangeSubscribers.forEach((cb) => cb());
    expect(useAuthStore.getState().user).toEqual(TEST_USER);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    mockPb.authRecord.current = null;
    mockPb.onChangeSubscribers.forEach((cb) => cb());
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
