import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';

const { pbState, mockPb } = vi.hoisted(() => {
  const collections = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const state = {
    collections,
    defaultImpl: (name: string) => {
      if (!collections.has(name)) {
        collections.set(name, {
          getFullList: vi.fn().mockResolvedValue([]),
          getList: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
          getOne: vi.fn(),
          authWithPassword: vi.fn(),
        });
      }
      return collections.get(name);
    },
  };
  const mock = {
    collection: vi.fn((name: string) => state.defaultImpl(name)),
    files: { getURL: vi.fn() },
    authStore: {
      record: null,
      isValid: false,
      clear: vi.fn(),
      onChange: vi.fn(),
    },
    autoCancellation: vi.fn(),
  };
  return { pbState: state, mockPb: mock };
});

vi.mock(import('@/lib/pb'), async () => ({ pb: mockPb as never }));

import { useFavorites } from './useFavorites';
import { useToggleFavorite } from './useToggleFavorite';
import { useFavorite } from './useFavorite';
import { useAuthStore } from '@/features/auth/store';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  pbState.collections.clear();
  mockPb.collection.mockClear();
  mockPb.collection.mockImplementation((name: string) => pbState.defaultImpl(name));
});

describe('useFavorites', () => {
  it('does not fetch when the user id is missing', async () => {
    const getFullList = vi.fn();
    pbState.collections.set('favorites', { getFullList });
    const { result } = renderHook(() => useFavorites(undefined), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 10));
    expect(getFullList).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches the user favorites with expand=game and filters out missing games', async () => {
    const getFullList = vi.fn().mockResolvedValue([
      { id: 'f1', user: 'u1', game: 'g1', expand: { game: { id: 'g1', title: 'Crash' } } },
      { id: 'f2', user: 'u1', game: 'g2', expand: {} },
    ]);
    pbState.collections.set('favorites', { getFullList });

    const { result } = renderHook(() => useFavorites('u1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getFullList).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'user = "u1"', expand: 'game', sort: '-created' }),
    );
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('f1');
  });
});

describe('useToggleFavorite', () => {
  it('creates a favorite on add', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'f1', user: 'u1', game: 'g1' });
    const getFullList = vi.fn().mockResolvedValue([]);
    pbState.collections.set('favorites', { create, getFullList });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: makeWrapper() });
    await act(async () => {
      result.current.mutate({ action: 'add', gameId: 'g1', userId: 'u1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(create).toHaveBeenCalledWith({ user: 'u1', game: 'g1' });
  });

  it('deletes a favorite on remove', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const getFullList = vi.fn().mockResolvedValue([]);
    pbState.collections.set('favorites', { delete: del, getFullList });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: makeWrapper() });
    await act(async () => {
      result.current.mutate({ action: 'remove', id: 'f9', userId: 'u1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(del).toHaveBeenCalledWith('f9');
  });

  it('optimistically updates the favorites cache on add', async () => {
    useAuthStore.getState().setUser({ id: 'u1', email: 'a@b.c' });
    const create = vi.fn().mockReturnValue(new Promise(() => {}));
    const getFullList = vi.fn().mockResolvedValue([]);
    pbState.collections.set('favorites', { create, getFullList });

    const { result } = renderHook(() => useFavorite('g1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isFavorite).toBe(false));

    await act(async () => {
      result.current.toggle();
    });

    expect(create).toHaveBeenCalledWith({ user: 'u1', game: 'g1' });
    expect(result.current.isFavorite).toBe(true);
  });
});
