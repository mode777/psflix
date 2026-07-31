import { describe, expect, it } from 'vitest';
import { buildGameFilter } from './filter';

describe('buildGameFilter', () => {
  it('returns undefined when no filters are provided', () => {
    expect(buildGameFilter({})).toBeUndefined();
  });

  it('returns undefined for empty inputs', () => {
    expect(buildGameFilter({ search: '', genre: 'All' })).toBeUndefined();
    expect(buildGameFilter({ search: '   ', genre: 'All' })).toBeUndefined();
  });

  it('builds a search clause on title and first_disc_serial', () => {
    expect(buildGameFilter({ search: 'crash' })).toBe(
      '(title ~ "crash" || first_disc_serial ~ "crash")',
    );
  });

  it('trims surrounding whitespace from the search term', () => {
    expect(buildGameFilter({ search: '  crash bandicoot  ' })).toBe(
      '(title ~ "crash bandicoot" || first_disc_serial ~ "crash bandicoot")',
    );
  });

  it('escapes embedded double quotes in the search term', () => {
    expect(buildGameFilter({ search: 'say "hi"' })).toBe(
      '(title ~ "say \\"hi\\"" || first_disc_serial ~ "say \\"hi\\"")',
    );
  });

  it('ignores the "All" genre sentinel', () => {
    expect(buildGameFilter({ genre: 'All' })).toBeUndefined();
  });

  it('builds a genre clause for any non-All genre', () => {
    expect(buildGameFilter({ genre: 'Action' })).toBe('genre ~ "Action"');
  });

  it('joins search and genre clauses with &&', () => {
    expect(buildGameFilter({ search: 'crash', genre: 'Platformer' })).toBe(
      '(title ~ "crash" || first_disc_serial ~ "crash") && genre ~ "Platformer"',
    );
  });

  it('escapes quotes in the genre value too', () => {
    expect(buildGameFilter({ genre: 'A"B' })).toBe('genre ~ "A\\"B"');
  });
});
