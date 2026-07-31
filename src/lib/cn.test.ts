import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class strings with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('deduplicates adjacent conflicting tailwind classes via twMerge', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });
});
