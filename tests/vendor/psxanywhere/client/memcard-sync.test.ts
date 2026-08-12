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

const SLOT1 = { id: 'c1', label: 'card-1' } as const;
const SLOT2 = { id: 'c2', label: 'card-2' } as const;

interface RepoOpts {
  authed?: boolean;
  userId?: string | null;
  downloadMemcardImpl?: (
    userId: string,
    label: string,
  ) =>
    | { buf: ArrayBuffer; recordId: string; updated: string }
    | Promise<{ buf: ArrayBuffer; recordId: string; updated: string }>;
  downloadMemcardThrow?: Error;
  uploadMemcardImpl?: (
    buf: ArrayBuffer,
    userId: string,
    label: string,
    recordId?: string,
  ) => Promise<void>;
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
    sync.setSlotBinding(1, SLOT1);
    await sync.syncNow();
    expect(calls.downloadMemcard).toHaveLength(0);
  });

  it('syncNow downloads when authed', async () => {
    const { sync, calls, storage } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    await sync.syncNow();
    expect(calls.downloadMemcard).toHaveLength(1);
    const loaded = await storage.load(1);
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)[0]).toBe(42);
  });

  it('onAuthChange(true) triggers download', async () => {
    const { sync, calls, storage } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
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
  it('syncNow downloads nothing when no slots are bound', async () => {
    const { sync, calls, storage } = syncWith({ authed: true });
    await sync.syncNow();
    expect(calls.downloadMemcard).toHaveLength(0);
    expect(await storage.load(1)).toBeNull();
    expect(await storage.load(2)).toBeNull();
  });

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
    sync.setSlotBinding(1, SLOT1);

    await sync.syncNow();

    const loaded = await storage.load(1);
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)[0]).toBe(99);
  });

  it('shows toast on successful download', async () => {
    const { sync, toast } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    await sync.syncNow();
    expect(toast).toHaveBeenCalledWith('Memcard synced');
  });

  it('logs at warn level on download failure (not console.log)', async () => {
    const { sync, log } = syncWith({
      authed: true,
      downloadMemcardThrow: new Error('offline'),
    });
    sync.setSlotBinding(1, SLOT1);
    await sync.syncNow();
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('download failed'));
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('offline'));
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
    sync.setSlotBinding(1, SLOT1);

    await sync.syncNow();

    const loaded = await storage.load(1);
    expect(loaded).toBeNull();
  });

  it('syncNow downloads both bound slots into the right IDB keys', async () => {
    const storage = new InMemoryMemcardStorage();
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: (_userId, label) =>
        label === SLOT1.label
          ? { buf: buf(11), recordId: 'c1', updated: 't' }
          : { buf: buf(22), recordId: 'c2', updated: 't' },
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      { hashFn: mockHash },
    );
    sync.setSlotBinding(1, SLOT1);
    sync.setSlotBinding(2, SLOT2);

    await sync.syncNow();

    expect(new Uint8Array((await storage.load(1))!)[0]).toBe(11);
    expect(new Uint8Array((await storage.load(2))!)[0]).toBe(22);
  });

  it('syncNow continues other slots when one slot download rejects (per-slot 404)', async () => {
    const onSyncComplete = vi.fn();
    const storage = new InMemoryMemcardStorage();
    const mock = createMockRepository({
      authed: true,
      downloadMemcardImpl: (_userId, label) => {
        if (label === SLOT2.label) throw new Error('404');
        return { buf: buf(11), recordId: 'c1', updated: 't' };
      },
    });
    const repo = mock as unknown as Repository;
    const sync = new MemcardSync(
      storage,
      repo,
      () => {},
      () => {},
      {
        hashFn: mockHash,
        onSyncComplete,
      },
    );
    sync.setSlotBinding(1, SLOT1);
    sync.setSlotBinding(2, SLOT2);

    await sync.syncNow();

    // Slot 1 still landed in IDB despite slot 2 failing.
    expect(new Uint8Array((await storage.load(1))!)[0]).toBe(11);
    expect(await storage.load(2)).toBeNull();
    // onSyncComplete fires exactly once per pass (not per slot).
    expect(onSyncComplete).toHaveBeenCalledTimes(1);
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
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);
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

  it('ignores dirty exports for unbound slots', async () => {
    const { sync, calls } = syncWith({ authed: true });
    // No setSlotBinding → every slot is unbound → all dirty exports are no-ops.
    sync.onMemcardDirty(0, buf(1));
    sync.onMemcardDirty(1, buf(1));
    sync.onMemcardDirty(2, buf(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('ignores dirty exports when unauthed', async () => {
    const { sync, calls } = syncWith({ authed: false });
    sync.setSlotBinding(1, SLOT1);
    sync.onMemcardDirty(1, buf(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('debounces multiple rapid touches into one upload', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
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
    sync.setSlotBinding(1, SLOT1);
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

  it('fires upload after debounce expires and forwards the binding', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    sync.onMemcardDirty(1, buf(55));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(55);
    expect(calls.uploadMemcard[0].userId).toBe('u1');
    expect(calls.uploadMemcard[0].label).toBe('card-1');
    expect(calls.uploadMemcard[0].recordId).toBe('c1');
  });

  it('uploads slot 2 dirty exports under the slot-2 binding', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(2, SLOT2);
    sync.onMemcardDirty(2, buf(5));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(5);
    expect(calls.uploadMemcard[0].label).toBe('card-2');
    expect(calls.uploadMemcard[0].recordId).toBe('c2');
  });

  it('uploads both slots when both are bound and dirty in the same pass', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    sync.setSlotBinding(2, SLOT2);
    sync.onMemcardDirty(1, buf(1));
    sync.onMemcardDirty(2, buf(2));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0); // let the sequential drain settle

    expect(calls.uploadMemcard).toHaveLength(2);
    const byLabel = Object.fromEntries(calls.uploadMemcard.map((c) => [c.label, c]));
    expect(byLabel['card-1'].recordId).toBe('c1');
    expect(new Uint8Array(byLabel['card-1'].buf)[0]).toBe(1);
    expect(byLabel['card-2'].recordId).toBe('c2');
    expect(new Uint8Array(byLabel['card-2'].buf)[0]).toBe(2);
  });

  it('re-binding a slot clears lastUploadedHash so the next dirty export uploads', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);

    // First upload under binding A.
    sync.onMemcardDirty(1, buf(10));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(1);

    // Re-bind → hash cleared, so identical bytes must upload again.
    sync.setSlotBinding(1, { id: 'c1b', label: 'card-1-renamed' });
    sync.onMemcardDirty(1, buf(10));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.uploadMemcard).toHaveLength(2);
    expect(calls.uploadMemcard[1].recordId).toBe('c1b');
    expect(calls.uploadMemcard[1].label).toBe('card-1-renamed');
  });

  it('re-binding a slot cancels a pending debounce timer and clears pending bytes', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    sync.onMemcardDirty(1, buf(10));
    // Re-bind before the debounce fires → stale pending bytes must not upload.
    sync.setSlotBinding(1, SLOT1);

    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('unbinding a slot makes subsequent dirty exports no-ops', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
    sync.setSlotBinding(1, null);
    sync.onMemcardDirty(1, buf(10));

    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
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
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);
    const u8 = new Uint8Array([77]);
    sync.onMemcardDirty(1, u8);

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.uploadMemcard).toHaveLength(1);
    expect(new Uint8Array(calls.uploadMemcard[0].buf)[0]).toBe(77);
  });

  it('defensively copies the input so later mutation does not affect the upload', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);
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
    sync.setSlotBinding(1, SLOT1);
    sync.onMemcardDirty(1, buf(1));
    sync.onAuthChange(false);

    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.uploadMemcard).toHaveLength(0);
  });

  it('clears lastUploadedHash on de-auth so a re-auth re-uploads', async () => {
    const { sync, calls } = syncWith({ authed: true });
    sync.setSlotBinding(1, SLOT1);

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
    sync.setSlotBinding(1, SLOT1);
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
    sync.setSlotBinding(1, SLOT1);

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
