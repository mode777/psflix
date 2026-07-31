import { describe, expect, it } from 'vitest';
import { GENRES, type Genre } from './genres';

describe('GENRES', () => {
  it('includes the "All" sentinel first', () => {
    expect(GENRES[0]).toBe('All');
  });

  it('contains at least one specific genre', () => {
    expect(GENRES.length).toBeGreaterThan(1);
    expect(GENRES).toContain('Action RPG');
  });

  it('exposes Genre as a type-safe union of the list', () => {
    const sample: Genre = 'Platformer';
    expect(GENRES).toContain(sample);
  });
});
