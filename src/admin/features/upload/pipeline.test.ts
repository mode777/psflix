import { describe, expect, it } from 'vitest';
import { buildReview, discIndexInMetadata, type DiscItem } from './pipeline';
import type { GameMetadata } from './metadata';

function makeMetadata(serials: string[]): GameMetadata {
  return {
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
    firstDiscSerial: serials[0] ?? '',
    discs: serials.map((s, i) => ({ disc_number: i + 1, printed_serial: s, serial_in_disc: s })),
    discCount: serials.length,
  };
}

function makeDiscItem(
  over: Partial<DiscItem> & Pick<DiscItem, 'id' | 'discId' | 'index' | 'metadata'>,
): DiscItem {
  return {
    file: new File([], 'x.chd'),
    fileName: over.id + '.chd',
    fileSize: 0,
    status: 'ready',
    existingGameId: null,
    existingDisc: false,
    error: null,
    progress: null,
    ...over,
  };
}

describe('discIndexInMetadata', () => {
  it('returns the metadata disc-list position regardless of ingest order', () => {
    const m = makeMetadata(['SLUS-001', 'SLUS-002', 'SLUS-003']);
    expect(discIndexInMetadata('SLUS-001', m)).toBe(0);
    expect(discIndexInMetadata('SLUS-002', m)).toBe(1);
    expect(discIndexInMetadata('SLUS-003', m)).toBe(2);
  });

  it('falls back to 0 when the serial is absent from the list', () => {
    expect(discIndexInMetadata('NOPE', makeMetadata(['SLUS-001']))).toBe(0);
  });
});

describe('buildReview', () => {
  it('groups discs of the same title under one game and sorts by index', () => {
    const m = makeMetadata(['SLUS-001', 'SLUS-002']);
    // Ingested out of order: disc 2 first, then disc 1.
    const items = [
      makeDiscItem({ id: 'a', discId: 'SLUS-002', index: 1, metadata: m }),
      makeDiscItem({ id: 'b', discId: 'SLUS-001', index: 0, metadata: m }),
    ];

    const { games, failed } = buildReview(items);

    expect(failed).toHaveLength(0);
    expect(games).toHaveLength(1);
    expect(games[0].firstDiscSerial).toBe('SLUS-001');
    // Sorted ascending by index, independent of ingest order.
    expect(games[0].discItems.map((d) => d.discId)).toEqual(['SLUS-001', 'SLUS-002']);
  });

  it('keeps distinct titles as separate games', () => {
    const m1 = makeMetadata(['SCES-001']);
    const m2 = makeMetadata(['SLPS-001']);
    const items = [
      makeDiscItem({ id: 'a', discId: 'SCES-001', index: 0, metadata: m1 }),
      makeDiscItem({ id: 'b', discId: 'SLPS-001', index: 0, metadata: m2 }),
    ];
    const { games } = buildReview(items);
    expect(games).toHaveLength(2);
  });

  it('collects failed items separately (identification / enrichment failures)', () => {
    const m = makeMetadata(['SLUS-001']);
    const items = [
      makeDiscItem({ id: 'ok', discId: 'SLUS-001', index: 0, metadata: m }),
      makeDiscItem({
        id: 'bad',
        discId: null,
        index: 0,
        metadata: null,
        status: 'failed',
        error: 'No PS1 disc ID found',
      }),
    ];
    const { games, failed } = buildReview(items);
    expect(games).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBe('No PS1 disc ID found');
  });

  it('marks a group as reusing an existing game when any disc reports one', () => {
    const m = makeMetadata(['SLUS-001', 'SLUS-002']);
    const items = [
      makeDiscItem({
        id: 'a',
        discId: 'SLUS-001',
        index: 0,
        metadata: m,
        existingGameId: 'existing-game-7',
      }),
      makeDiscItem({ id: 'b', discId: 'SLUS-002', index: 1, metadata: m }),
    ];
    const { games } = buildReview(items);
    expect(games[0].existingGameId).toBe('existing-game-7');
  });

  it('treats an already-existing disc as a usable member of its game group', () => {
    const m = makeMetadata(['SLUS-001']);
    const items = [
      makeDiscItem({
        id: 'a',
        discId: 'SLUS-001',
        index: 0,
        metadata: m,
        status: 'exists',
        existingDisc: true,
      }),
    ];
    const { games, failed } = buildReview(items);
    expect(failed).toHaveLength(0);
    expect(games).toHaveLength(1);
    expect(games[0].discItems[0].status).toBe('exists');
  });
});
