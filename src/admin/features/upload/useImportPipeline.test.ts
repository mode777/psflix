import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImportPipeline } from './useImportPipeline';
import type { GameMetadata } from './metadata';
import { createGame, findDisc, findGame } from './catalog';
import { uploadDisc } from './uploadDisc';

const { makeMetadata } = vi.hoisted(() => {
  const makeMetadata = (): GameMetadata => ({
    officialTitle: 'Test Game',
    title: 'Test Game',
    region: 'NTSC-U',
    genre: 'Action',
    developer: 'Dev',
    publisher: 'Pub',
    dateReleased: '1999-01-01',
    languages: ['English'],
    description: '',
    manufacturerDescription: '',
    features: [],
    players: '1 Player',
    coverImage: null,
    screenshots: [],
    firstDiscSerial: 'SLUS-00797',
    discs: [{ disc_number: 1, printed_serial: 'SLUS-00797', serial_in_disc: 'SLUS-00797' }],
    discCount: 1,
  });
  return { makeMetadata };
});

vi.mock('./extractor/extractorClient', () => ({
  ExtractorClient: class {
    extract = vi.fn(async () => 'SLUS-00797');
    terminate = vi.fn();
  },
}));

vi.mock('./metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./metadata')>();
  return { ...actual, fetchGameMetadata: vi.fn(async () => makeMetadata()) };
});

vi.mock('./catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./catalog')>();
  return {
    ...actual,
    findGame: vi.fn(async () => null),
    findDisc: vi.fn(async () => null),
    createGame: vi.fn(async () => ({ id: 'new-game-1' })),
  };
});

vi.mock('./uploadDisc', () => ({
  uploadDisc: vi.fn(async () => ({ id: 'new-disc-1', serial: 'SLUS-00797' })),
}));

/** Shape of a `renderHook(() => useImportPipeline())` result (RTL v16). */
type PipelineHook = {
  result: { current: ReturnType<typeof useImportPipeline> };
};

/** Render the hook, ingest one CHD, and return the renderHook result at review. */
async function ingest(): Promise<PipelineHook> {
  const hook = renderHook(() => useImportPipeline());
  const file = new File([new Uint8Array([1, 2, 3])], 'game.chd');
  await act(async () => {
    await hook.result.current.addFiles([file]);
  });
  return hook;
}

async function approve(hook: PipelineHook): Promise<void> {
  await act(async () => {
    await hook.result.current.startUpload();
  });
}

describe('useImportPipeline upload robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findGame).mockResolvedValue(null);
    vi.mocked(findDisc).mockResolvedValue(null);
    vi.mocked(createGame).mockResolvedValue({ id: 'new-game-1' } as never);
    vi.mocked(uploadDisc).mockResolvedValue({ id: 'new-disc-1', serial: 'SLUS-00797' } as never);
  });

  it('creates the game, uploads the disc, and reflects it in the grouped games state', async () => {
    const hook = await ingest();
    expect(hook.result.current.state.stage).toBe('review');
    expect(hook.result.current.state.games[0].discItems[0].status).toBe('ready');

    await approve(hook);

    expect(hook.result.current.state.stage).toBe('done');
    // Regression (findings 2/3): the progress panel reads games[].discItems —
    // the status must flow there, not only into the flat items list.
    expect(hook.result.current.state.games[0].discItems[0].status).toBe('uploaded');
    expect(hook.result.current.state.summary).toEqual({
      gamesCreated: 1,
      gamesReused: 0,
      discsUploaded: 1,
      discsSkipped: 0,
      failed: 0,
    });
    expect(vi.mocked(uploadDisc)).toHaveBeenCalledWith(
      expect.objectContaining({ serial: 'SLUS-00797', index: 0, gameId: 'new-game-1' }),
    );
  });

  it('reuses an existing game and uploads the missing disc under its id', async () => {
    vi.mocked(findGame).mockResolvedValue({ id: 'existing-game' } as never);
    const hook = await ingest();
    expect(hook.result.current.state.games[0].existingGameId).toBe('existing-game');

    await approve(hook);

    expect(vi.mocked(createGame)).not.toHaveBeenCalled();
    expect(vi.mocked(uploadDisc)).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'existing-game' }),
    );
    expect(hook.result.current.state.games[0].discItems[0].status).toBe('uploaded');
    expect(hook.result.current.state.summary).toEqual({
      gamesCreated: 0,
      gamesReused: 1,
      discsUploaded: 1,
      discsSkipped: 0,
      failed: 0,
    });
  });

  it('falls back to reusing an existing game when createGame fails (finding 1)', async () => {
    // Intake-time existence check misses the game (returns null); the retry
    // after the failed create finds it.
    vi.mocked(findGame)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-game' } as never);
    vi.mocked(createGame).mockRejectedValue(new Error('first_disc_serial already exists'));

    const hook = await ingest();
    await approve(hook);

    expect(vi.mocked(createGame)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(findGame)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadDisc)).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'existing-game' }),
    );
    expect(hook.result.current.state.games[0].status).toBe('reused');
    expect(hook.result.current.state.games[0].discItems[0].status).toBe('uploaded');
    expect(hook.result.current.state.summary).toEqual({
      gamesCreated: 0,
      gamesReused: 1,
      discsUploaded: 1,
      discsSkipped: 0,
      failed: 0,
    });
  });

  it('treats a failed upload as skipped when the disc turns out to already exist', async () => {
    vi.mocked(uploadDisc).mockRejectedValue(new Error('HTTP 400'));
    // Intake check misses the disc; the post-failure retry finds it.
    vi.mocked(findDisc)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-disc' } as never);

    const hook = await ingest();
    await approve(hook);

    expect(hook.result.current.state.games[0].discItems[0].status).toBe('exists');
    expect(hook.result.current.state.summary).toEqual({
      gamesCreated: 1,
      gamesReused: 0,
      discsUploaded: 0,
      discsSkipped: 1,
      failed: 0,
    });
  });

  it('still marks a genuinely failing disc as error without aborting', async () => {
    vi.mocked(uploadDisc).mockRejectedValue(new Error('network down'));
    // findDisc stays null on the retry → the disc really does not exist.
    const hook = await ingest();
    await approve(hook);

    expect(hook.result.current.state.stage).toBe('done');
    expect(hook.result.current.state.games[0].discItems[0].status).toBe('error');
    expect(hook.result.current.state.summary).toEqual({
      gamesCreated: 1,
      gamesReused: 0,
      discsUploaded: 0,
      discsSkipped: 0,
      failed: 1,
    });
  });
});
