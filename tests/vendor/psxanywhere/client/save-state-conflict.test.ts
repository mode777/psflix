// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  newerSide,
  decideUploadConflict,
  decideDownloadConflict,
} from '@/vendor/psxanywhere/client/saveStateConflict';

const ISO = (ms: number) => new Date(ms).toISOString();

describe('newerSide', () => {
  it('returns "local" when the local timestamp is greater', () => {
    expect(newerSide(2000, ISO(1000))).toBe('local');
  });

  it('returns "server" when the server timestamp is greater', () => {
    expect(newerSide(1000, ISO(2000))).toBe('server');
  });

  it('returns "tie" when both are equal', () => {
    expect(newerSide(1000, ISO(1000))).toBe('tie');
  });
});

describe('decideUploadConflict', () => {
  it('uploads when the server has not moved since the last known version', () => {
    const updated = ISO(5000);
    expect(decideUploadConflict(1234, updated, updated)).toBe('upload');
  });

  it('uploads when the local timestamp is newer than the server', () => {
    expect(decideUploadConflict(9000, ISO(1000), ISO(2000))).toBe('upload');
  });

  it('downloads when the server is strictly newer than the local edit', () => {
    expect(decideUploadConflict(1000, ISO(1000), ISO(9000))).toBe('download');
  });

  it('uploads on a tie (local not strictly older)', () => {
    const updated = ISO(5000);
    expect(decideUploadConflict(5000, ISO(1000), updated)).toBe('upload');
  });
});

describe('decideDownloadConflict', () => {
  it('is a noop when the local twin is already at the server version', () => {
    const updated = ISO(5000);
    expect(decideDownloadConflict(1234, updated, updated)).toBe('noop');
  });

  it('downloads when the server is strictly newer', () => {
    expect(decideDownloadConflict(1000, null, ISO(9000))).toBe('download');
  });

  it('marks the local twin unsynced when the local edit is newer', () => {
    expect(decideDownloadConflict(9000, null, ISO(1000))).toBe('mark-unsynced');
  });

  it('marks unsynced on a tie (server not strictly newer)', () => {
    const updated = ISO(5000);
    expect(decideDownloadConflict(5000, ISO(1000), updated)).toBe('mark-unsynced');
  });
});
