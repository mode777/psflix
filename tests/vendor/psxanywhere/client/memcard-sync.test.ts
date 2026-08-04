// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemcardSync } from '@/vendor/psxanywhere/client/MemcardSync';
import type { Repository } from 'repository';
import { InMemoryMemcardStorage } from '@/vendor/psxanywhere/client/memcardStorage';
import { createMockRepository } from './helpers/repository-mock';

// ── Helpers ──────────────────────────────────────────────────────────

function buf(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

/** Deterministic hash for tests — first byte as hex. Avoids crypto.subtle
 *  which doesn't resolve reliably under Vitest's fake timers. */
function mockHash(b: ArrayBuffer): Promise<string> {
  return Promise.resolve(new Uint8Array(b)[0].toString(16).padStart(2, '0'));
}

interface RepoOpts {
  authed?: boolean;
  userId?: string | null;
  downloadMemcardImpl?: () =>
    | { buf: ArrayBuffer; recordId: string; updated: string }
    | Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>;
  downloadMemcardThrow?: Error;
  uploadMemcardImpl?: (buf: ArrayBuffer, userId: string, label: string) => Promise<void>;
  uploadMemcardThrow?: Error;
}

function syncWith(opts: RepoOpts = {}) {
  const storage = new InMemoryMemcardStorage();
  const mock = createMockRepository({
    authed: opts.authed,
    userId: opts.userId ?? undefined,
    downloadMemcardImpl: opts.downloadMemcardImpl,
    downloadMemcardThrow: opts.downloadMemcardThrow,
    uploadMemcardImpl: opts.uploadMemcardImpl,
    uploadMemcardThrow: opts.uploadMemcardThrow,
  });
  const repo = mock as unknown as Repository;
  const log = vi.fn();
  const toast = vi.fn();
  const sync = new MemcardSync(storage, repo, log, toast, { hashFn: mockHash });
  return { sync, storage, repo, calls: mock.calls, log, toast };
}

// ── Auth gating ──────────────────────────────────────────────────────

describe('MemcardSync auth gating', () => {
  it('syncNow is a no-op when unauthed', async () => {
    const { sync, calls } = syncWith({ authed: false });
    await sync.syncNow();
    expect(calls.downloadMemcard).toHaveLength(0);
  });

  it('syncNow downloads when authed', async () => {
    const { sync, calls, storage } = syncWith({ authed: true });
    await sync.syncNow();
    expect(calls.downloadMemcard).toHaveLength(1);
    const loaded = await storage.load(1);
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)[0]).toBe(42);
  });

  it('onAuthChange(true) triggers download', async () => {
    const { sync, calls, storage } = syncWith({ authed: true });
    sync.onAuthChange(true);
    // Flush the microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.downloadMemcard).toHaveLength(1);
    const loaded = await storage.load(1);
    expect(loaded).not.toBeNull();
  });

  it('onAuthChange(false) is a no-op (does not download)', async () => {
    const { sync, calls } = syncWith({ authed: false });
    sync.onAuthChange(false);
    expect(calls.downloadMemcard).toHaveLength(0);
  });
});

// ── Download → storage ───────────────────────────────────────────────

describe('MemcardSync download', () => {
  it('saves downloaded bytes to slot 1 in storage', async () => {
    const storage = new InMemoryMemcardStorage();
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: () => ({ buf: buf(99), recordId: 'r1', updated: '2024-06-01' }),
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );

    await sync.syncNow();

    const loaded = await storage.load(1);
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)[0]).toBe(99);
  });

  it('shows toast on successful download', async () => {
    const { sync, toast } = syncWith({ authed: true });
    await sync.syncNow();
    expect(toast).toHaveBeenCalledWith('Memcard synced');
  });

  it('logs at warn level on download failure (not console.log)', async () => {
    const { sync, log, toast } = syncWith({
      authed: true,
      downloadMemcardThrow: new Error('offline'),
    });
    await sync.syncNow();
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('download failed'));
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('offline'));
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not save anything when download fails', async () => {
    const storage = new InMemoryMemcardStorage();
    const mock = createMockRepository({ authed: true, downloadMemcardThrow: new Error('fail') });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );

    await sync.syncNow();

    const loaded = await storage.load(1);
    expect(loaded).toBeNull();
  });
});

// ── ensureDownloaded ─────────────────────────────────────────────────

describe('MemcardSync ensureDownloaded', () => {
  it('resolves immediately when no download is in flight', async () => {
    const { sync } = syncWith();
    await expect(sync.ensureDownloaded()).resolves.toBeUndefined();
  });

  it('awaits a pending download started by syncNow', async () => {
    let resolveDownload!: () => void;
    const storage = new InMemoryMemcardStorage();
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: () =>
        new Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>((r) => {
          resolveDownload = () => r({ buf: buf(7), recordId: 'r1', updated: 't' });
        }),
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );

    // Start the download — don't await it
    const syncPromise = sync.syncNow();
    // ensureDownloaded should still be pending
    let ensured = false;
    const ensurePromise = sync.ensureDownloaded().then(() => {
      ensured = true;
    });

    // Give microtasks a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(ensured).toBe(false);

    // Resolve the download
    resolveDownload();
    await syncPromise;
    await ensurePromise;
    expect(ensured).toBe(true);
  });

  it('returns a resolved promise after the download completes', async () => {
    const { sync } = syncWith({ authed: true });
    await sync.syncNow();
    // Should resolve immediately (download already done)
    await expect(sync.ensureDownloaded()).resolves.toBeUndefined();
  });
});

// ── Dirty export → debounce → upload ─────────────────────────────────

describe('MemcardSync onMemcardDirty', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores non-slot-1 dirty exports', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(0, buf(1));
    sync.onMemcardDirty(2, buf(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('ignores dirty exports when unauthed', async () => {
    const { sync, calls } = syncWith({ authed: false });
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('debounces multiple rapid touches into one upload', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(1, buf(1));
    sync.onMemcardDirty(1, buf(2));
    sync.onMemcardDirty(1, buf(3)); // last touch wins

    await vi.advanceTimersByTimeAsync(5000); // UPLOAD_DEBOUNCE_MS
    // Let the async upload settle
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    // The upload should contain the final bytes (buf(3))
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(3);
  });

  it('resets the debounce window on each new touch', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(1, buf(1));

    await vi.advanceTimersByTimeAsync(3000); // not yet at 5s
    expect(calls.uploadMemcard).toHaveLength(0);

    sync.onMemcardDirty(1, buf(2)); // reset the timer
    await vi.advanceTimersByTimeAsync(3000); // 3s since reset, still not 5s
    expect(calls.uploadMemcard).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2000); // now 5s since reset
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(2);
  });

  it('fires upload after debounce expires', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(1, buf(55));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(55);
    expect(calls.uploadMemcard[0].userId).toBe('u1');
    expect(calls.uploadMemcard[0].label).toBe('default');
  });
});

// ── Hash dedup ───────────────────────────────────────────────────────

describe('MemcardSync hash dedup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips upload when hash matches the last successful upload', async () => {
    const { sync, calls } = syncWith({ authed: true });

    // First upload
    sync.onMemcardDirty(1, buf(10));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(1);

    // Second upload with same bytes
    sync.onMemcardDirty(1, buf(10));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(1); // still 1 — skipped

    // Third upload with different bytes
    sync.onMemcardDirty(1, buf(20));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(2); // now 2
  });
});

// ── Upload failure ───────────────────────────────────────────────────

describe('MemcardSync upload failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs at warn and does not update hash on upload failure', async () => {
    const { sync, calls, log } = syncWith({ authed: true, uploadMemcardThrow: new Error('net') });

    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('upload failed'));
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('net'));

    // Next touch with same bytes should retry (hash not updated)
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(2);
  });
});

// ── Upload in-flight re-arm ──────────────────────────────────────────

describe('MemcardSync upload re-arm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-arms at 1s when a dirty touch arrives mid-upload', async () => {
    let resolveUpload!: () => void;
    const storage = new InMemoryMemcardStorage();
    let uploadCount = 0;
    const uploadedBufs: number[] = [];
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: () => ({ buf: buf(0), recordId: '', updated: '' }),
      uploadMemcardImpl: async (b: ArrayBuffer) => {
        uploadCount++;
        uploadedBufs.push(new Uint8Array(b)[0]);
        if (uploadCount === 1) {
          await new Promise<void>((r) => {
            resolveUpload = r;
          });
        }
      },
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );

    // Trigger first upload
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000); // debounce fires, _doUpload starts, _uploading=true
    await vi.advanceTimersByTimeAsync(0); // hash resolves, upload mock enters, hangs

    // Touch while upload is in flight — sets _pendingBytes and new debounce at t=10000
    sync.onMemcardDirty(1, buf(2));

    // Advance to the debounce point — upload is still hanging, so _flushUpload
    // sees _uploading and re-arms at 1s (t=11000)
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(uploadCount).toBe(1);

    // The 1s re-arm fires — still uploading, re-arms again at 1s (t=12000)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(uploadCount).toBe(1);

    // Now resolve the first upload
    resolveUpload();
    await vi.advanceTimersByTimeAsync(0);

    // The re-armed timer at t=12000 fires — _uploading=false, starts second upload
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(uploadCount).toBe(2);
    expect(uploadedBufs).toEqual([1, 2]);
  });

  it('re-arms at full debounce when a touch arrives after upload finishes', async () => {
    const { sync, calls } = syncWith({ authed: true });

    // First upload
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(1);

    // Touch after upload is done (not mid-flight) — should use full debounce
    sync.onMemcardDirty(1, buf(2));
    await vi.advanceTimersByTimeAsync(4000); // not yet 5s
    expect(calls.uploadMemcard).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000); // now 5s
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(2);
  });
});

// ── Uint8Array tolerance ─────────────────────────────────────────────

describe('MemcardSync Uint8Array input', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts Uint8Array as well as ArrayBuffer', async () => {
    const { sync, calls } = syncWith({ authed: true });
    const u8 = new Uint8Array([77]);
    sync.onMemcardDirty(1, u8);

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(77);
  });

  it('defensively copies the input so later mutation does not affect the upload', async () => {
    const { sync, calls } = syncWith({ authed: true });
    const u8 = new Uint8Array([10]);
    sync.onMemcardDirty(1, u8);

    // Mutate the original
    u8[0] = 99;

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(10); // original value
  });
});

// ── onAuthChange / clearTransientState ───────────────────────────────

describe('MemcardSync onAuthChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears pending bytes and timer on de-auth', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(1, buf(1));
    sync.onAuthChange(false);

    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('clears lastUploadedHash on de-auth so a re-auth re-uploads', async () => {
    const { sync, calls } = syncWith({ authed: true });

    // Upload once
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(1);

    // De-auth clears hash
    sync.onAuthChange(false);
    sync.onAuthChange(true); // re-auth

    // Same bytes should upload again (hash was cleared)
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(2);
  });
});

// ── dispose ──────────────────────────────────────────────────────────

describe('MemcardSync dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops the debounce timer', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.onMemcardDirty(1, buf(1));
    sync.dispose();

    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('prevents re-arm after an in-flight upload completes', async () => {
    let resolveUpload!: () => void;
    const storage = new InMemoryMemcardStorage();
    let uploadCount = 0;
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: () => ({ buf: buf(0), recordId: '', updated: '' }),
      uploadMemcardImpl: async () => {
        uploadCount++;
        if (uploadCount === 1) {
          await new Promise<void>((r) => {
            resolveUpload = r;
          });
        }
      },
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );

    // Start an upload
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(uploadCount).toBe(1);

    // Touch while uploading, then dispose
    sync.onMemcardDirty(1, buf(2));
    sync.dispose();

    // Resolve the in-flight upload
    resolveUpload();
    await vi.advanceTimersByTimeAsync(0);

    // Even after time passes, no new upload should fire
    await vi.advanceTimersByTimeAsync(10000);
    expect(uploadCount).toBe(1);
  });
});
