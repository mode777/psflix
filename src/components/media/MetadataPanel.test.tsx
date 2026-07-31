import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetadataPanel } from './MetadataPanel';
import type { GameDetail } from '@/features/games/useGame';

const baseGame: GameDetail = {
  id: 'g1',
  collectionId: 'c1',
  first_disc_serial: 'SCUS-12345',
  title: 'Crash Bandicoot',
  developer: 'Naughty Dog',
  publisher: 'Sony Computer Entertainment',
  release: '1996-09-09',
  players: '1',
  region: 'NTSC-U',
  discs: 1,
};

describe('MetadataPanel', () => {
  it('renders all labelled rows for a fully populated game', () => {
    render(<MetadataPanel game={baseGame} />);
    expect(screen.getByText('Game Information')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Naughty Dog')).toBeInTheDocument();
    expect(screen.getByText('Publisher')).toBeInTheDocument();
    expect(screen.getByText('Sony Computer Entertainment')).toBeInTheDocument();
    expect(screen.getByText('First Release')).toBeInTheDocument();
    expect(screen.getByText('Sep 1996')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('Discs')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('NTSC-U')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to "—" for missing fields', () => {
    render(
      <MetadataPanel
        game={{
          ...baseGame,
          developer: undefined,
          publisher: undefined,
          release: undefined,
          players: undefined,
          region: undefined,
          discs: undefined,
        }}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(6);
  });

  it('keeps the release value as-is when it is not a parseable date', () => {
    render(<MetadataPanel game={{ ...baseGame, release: 'not-a-date' }} />);
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });

  it('uses expand.discs.length as a fallback for the disc count', () => {
    render(
      <MetadataPanel
        game={
          {
            ...baseGame,
            discs: undefined,
            expand: {
              discs: [
                {
                  id: 'd1',
                  collectionId: 'c2',
                  collectionName: 'discs',
                  serial: 'S1',
                  index: 1,
                  game: 'g1',
                },
                {
                  id: 'd2',
                  collectionId: 'c2',
                  collectionName: 'discs',
                  serial: 'S2',
                  index: 2,
                  game: 'g1',
                },
              ],
            },
          } as unknown as GameDetail
        }
      />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
