import { describe, expect, it } from 'vitest';
import { extractErrorMessage } from './extractErrorMessage';

describe('extractErrorMessage', () => {
  it('returns the fallback for non-object errors', () => {
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
    expect(extractErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(extractErrorMessage('boom', 'fallback')).toBe('fallback');
    expect(extractErrorMessage(42, 'fallback')).toBe('fallback');
  });

  it('prefers PocketBase-style data.message over message', () => {
    expect(
      extractErrorMessage(
        { message: 'top-level', data: { message: 'specific' }, status: 400 },
        'fallback',
      ),
    ).toBe('specific');
  });

  it('falls back to top-level message when data.message is missing', () => {
    expect(extractErrorMessage({ message: 'top-level' }, 'fallback')).toBe('top-level');
  });

  it('falls back when no message fields are present', () => {
    expect(extractErrorMessage({ status: 400 }, 'fallback')).toBe('fallback');
    expect(extractErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
