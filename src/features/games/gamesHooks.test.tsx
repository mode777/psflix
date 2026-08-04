import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const { pbState, mockPb } = vi.hoisted(() => {
  const collections = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const state = {
    collections,
    defaultImpl: (name: string) => {
      if (!collections.has(name)) {
        collections.set(name, {
          getList: vi.fn().mockResolvedValue({
            items: [],
            page: 1,
            perPage: 24,
            totalItems: 0,
            totalPages: 0,
          }),
          getOne: vi.fn(),
          create: vi.fn(),
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

import { pb } from '@/lib/pb';
import { useGames } from './useGames';
import { useGame } from './useGame';

void pb;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
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

describe('useGames', () => {
  it('fetches a page of games with sort=-created and expand=discs', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [{ id: 'g1' }, { id: 'g2' }],
      page: 1,
      perPage: 24,
      totalItems: 2,
      totalPages: 1,
    });
    pbState.collections.set('games', { getList });

    const { result } = renderHook(() => useGames({}), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getList).toHaveBeenCalledWith(
      1,
      24,
      expect.objectContaining({ sort: '-created', expand: 'discs' }),
    );
    expect(result.current.data?.pages[0]?.items).toHaveLength(2);
  });

  it('builds a filter from the search and genre inputs', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 24,
      totalItems: 0,
      totalPages: 0,
    });
    pbState.collections.set('games', { getList });

    const { result } = renderHook(() => useGames({ search: 'crash', genre: 'Platformer' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getList).toHaveBeenCalledWith(
      1,
      24,
      expect.objectContaining({
        filter: '(title ~ "crash" || first_disc_serial ~ "crash") && genre:lower = "platformer"',
      }),
    );
  });
});

describe('useGame', () => {
  it('does not fetch when the serial is missing', async () => {
    const getList = vi.fn();
    pbState.collections.set('games', { getList });
    const { result } = renderHook(() => useGame(undefined), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 10));
    expect(getList).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches the game by first_disc_serial with expand', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [{ id: 'g1', title: 'Crash Bandicoot' }],
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
    });
    pbState.collections.set('games', { getList });
    const { result } = renderHook(() => useGame('SCUS-12345'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getList).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({
        filter: 'first_disc_serial = "SCUS-12345"',
        expand: 'discs_via_game,documents_via_game',
      }),
    );
    expect(result.current.data?.title).toBe('Crash Bandicoot');
  });

  it('throws when the game is not found', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 1,
      totalItems: 0,
      totalPages: 0,
    });
    pbState.collections.set('games', { getList });
    const { result } = renderHook(() => useGame('SCUS-99999'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Not found');
  });
});
