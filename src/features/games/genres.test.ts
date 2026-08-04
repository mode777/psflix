import { describe, expect, it } from 'vitest';
import { ALL_GENRE, aggregateGenres } from './genres';

describe('ALL_GENRE', () => {
  it('is the "All" sentinel used to clear the genre filter', () => {
    expect(ALL_GENRE).toBe('All');
  });
});

describe('aggregateGenres', () => {
  it('returns an empty list when there are no records', () => {
    expect(aggregateGenres([])).toEqual([]);
  });

  it('returns a single label for a uniform set of records', () => {
    const records = [{ genre: 'Racing' }, { genre: 'Racing' }, { genre: 'Racing' }];
    expect(aggregateGenres(records)).toEqual(['Racing']);
  });

  it('drops records with missing, null, or whitespace-only genres', () => {
    const records = [
      { genre: 'Platformer' },
      { genre: undefined },
      { genre: null },
      { genre: '' },
      { genre: '   ' },
    ];
    expect(aggregateGenres(records)).toEqual(['Platformer']);
  });

  it('sorts genres by descending game count', () => {
    const records = [
      { genre: 'Fighting' },
      { genre: 'Racing' },
      { genre: 'Racing' },
      { genre: 'Racing' },
      { genre: 'Platformer' },
      { genre: 'Platformer' },
    ];
    expect(aggregateGenres(records)).toEqual(['Racing', 'Platformer', 'Fighting']);
  });

  it('breaks count ties alphabetically', () => {
    const records = [
      { genre: 'Zombies' },
      { genre: 'Racing' },
      { genre: 'Racing' },
      { genre: 'Zombies' },
    ];
    expect(aggregateGenres(records)).toEqual(['Racing', 'Zombies']);
  });

  it('groups case-insensitively under the most common original casing', () => {
    const records = [
      { genre: 'Racing' },
      { genre: 'racing' },
      { genre: 'RACING' },
      { genre: 'racing' },
    ];
    expect(aggregateGenres(records)).toEqual(['racing']);
  });

  it('trims surrounding whitespace before grouping', () => {
    const records = [{ genre: '  Racing  ' }, { genre: 'Racing' }];
    expect(aggregateGenres(records)).toEqual(['Racing']);
  });
});
