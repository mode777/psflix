import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '@/admin/lib/pb';
import { uploadDocument } from './uploadDocument';

// --- XHR is stubbed so fields/URL/auth/progress/error can be asserted ---
type FakeXhrState = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  upload: { onprogress: ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  status: number;
  responseText: string;
  open: (method: string, url: string) => void;
  setRequestHeader: (key: string, value: string) => void;
  send: (body: unknown) => void;
  progress: (loaded: number, total: number) => void;
  respond: (status: number, body: unknown) => void;
};

let queue: FakeXhrState[] = [];

function installFakeXhr(): void {
  queue = [];
  const FakeXHR = function (this: FakeXhrState) {
    this.method = '';
    this.url = '';
    this.headers = {};
    this.body = null;
    this.upload = { onprogress: null };
    this.onload = null;
    this.onerror = null;
    this.status = 0;
    this.responseText = '';
    this.progress = (loaded, total) => {
      this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
    };
    this.respond = (status, body) => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    };
    this.open = (method, url) => {
      this.method = method;
      this.url = url;
    };
    this.setRequestHeader = (key, value) => {
      this.headers[key] = value;
    };
    this.send = (body) => {
      this.body = body;
    };
    queue.push(this);
  } as unknown as { new (): FakeXhrState };
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
}

const TEXT_ENCODER = new TextEncoder();

describe('uploadDocument', () => {
  const TOKEN = 'admin-jwt-token';

  beforeEach(() => {
    adminClient.authStore.save(TOKEN, {
      id: 's1',
      email: 'admin@example.com',
      collectionName: '_superusers',
    } as never);
    installFakeXhr();
  });

  afterEach(() => {
    adminClient.authStore.clear();
    vi.unstubAllGlobals();
  });

  it('posts to the documents endpoint with the superuser token and resolves with the record', async () => {
    const record = uploadDocument({
      type: 'manual',
      gameId: 'game-1',
      file: new Blob([TEXT_ENCODER.encode('%PDF-1.4')]),
      filename: 'manual.pdf',
    });

    await Promise.resolve();
    const fake = queue[queue.length - 1]!;

    expect(fake.method).toBe('POST');
    expect(fake.url).toBe(`${adminClient.baseURL}/api/collections/documents/records`);
    // The raw XHR authenticates with the same token the SDK would use — a raw
    // XHR does not inherit the SDK auth store, so it must be attached by hand.
    expect(fake.headers['Authorization']).toBe(TOKEN);
    expect(fake.headers['Content-Type']).toContain(
      'multipart/form-data; boundary=----FormBoundary',
    );

    // The field values are encoded into the multipart body.
    const decoded = await (fake.body as Blob).text();
    expect(decoded).toContain('name="type"');
    expect(decoded).toContain('manual');
    expect(decoded).toContain('name="game"');
    expect(decoded).toContain('game-1');
    expect(decoded).toContain('name="file"; filename="manual.pdf"');
    expect(decoded).toContain('%PDF-1.4');

    fake.respond(200, { id: 'doc-1', type: 'manual', game: 'game-1' });
    await expect(record).resolves.toMatchObject({ id: 'doc-1', type: 'manual' });
  });

  it('fires progress events from upload.onprogress', async () => {
    const events: { loaded: number; total: number }[] = [];
    const record = uploadDocument({
      type: 'guide',
      gameId: 'game-1',
      file: new Blob([TEXT_ENCODER.encode('PDF-BYTES')]),
      onProgress: (p) => events.push(p),
    });

    await Promise.resolve();
    const fake = queue[queue.length - 1]!;
    fake.progress(25, 100);
    fake.progress(100, 100);
    fake.respond(200, { id: 'doc-2', type: 'guide' });

    await record;
    expect(events).toEqual([
      { loaded: 25, total: 100 },
      { loaded: 100, total: 100 },
    ]);
  });

  it('rejects on HTTP >= 400 with the server message', async () => {
    const record = uploadDocument({
      type: 'manual',
      gameId: 'game-1',
      file: new Blob([TEXT_ENCODER.encode('PDF')]),
    });
    await Promise.resolve();
    queue[queue.length - 1]!.respond(400, { message: 'validation failed' });
    await expect(record).rejects.toThrow('HTTP 400');
  });

  it('defaults the filename to the File name when not supplied', async () => {
    const record = uploadDocument({
      type: 'guide',
      gameId: 'game-1',
      file: new File([TEXT_ENCODER.encode('PDF')], 'strategy.pdf'),
    });
    await Promise.resolve();
    const fake = queue[queue.length - 1]!;
    const decoded = await (fake.body as Blob).text();
    expect(decoded).toContain('filename="strategy.pdf"');
    fake.respond(200, { id: 'doc-3', type: 'guide' });
    await record;
  });

  it('does not abort the batch: a second document uploads after a first failure', async () => {
    const first = uploadDocument({
      type: 'manual',
      gameId: 'g',
      file: new Blob([TEXT_ENCODER.encode('PDF')]),
      filename: 'first.pdf',
    });
    const second = uploadDocument({
      type: 'guide',
      gameId: 'g',
      file: new Blob([TEXT_ENCODER.encode('PDF')]),
      filename: 'second.pdf',
    });

    await Promise.resolve();
    queue.shift()!.respond(500, { message: 'boom' });
    await Promise.resolve();
    queue[queue.length - 1]!.respond(200, { id: 'doc-ok', type: 'guide' });

    await expect(first).rejects.toThrow('HTTP 500');
    await expect(second).resolves.toMatchObject({ id: 'doc-ok' });
  });
});
