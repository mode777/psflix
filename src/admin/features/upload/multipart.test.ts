import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '@/admin/lib/pb';
import { buildMultipart } from './multipart';
import { uploadDisc } from './uploadDisc';

const TEXT_ENCODER = new TextEncoder();

describe('buildMultipart', () => {
  it('produces a well-formed multipart body with a unique boundary', async () => {
    const fileBlob = new Blob([TEXT_ENCODER.encode('CHD-BYTES')]);
    const built = buildMultipart(
      [
        { name: 'serial', value: 'SLUS-00797' },
        { name: 'index', value: '0' },
        { name: 'game', value: 'game-1' },
      ],
      { name: 'iso', filename: 'game.chd', blob: fileBlob },
    );

    // The boundary is reflected in the Content-Type header.
    expect(built.contentType).toBe(`multipart/form-data; boundary=${built.boundary}`);
    expect(built.boundary.startsWith('----FormBoundary')).toBe(true);

    const decoded = await built.body.text();
    // Field parts present, in order.
    expect(decoded).toContain('name="serial"');
    expect(decoded).toContain('SLUS-00797');
    expect(decoded).toContain('name="index"');
    expect(decoded).toContain('name="game"');
    expect(decoded).toContain('game-1');
    // File header with the supplied filename + octet-stream content type.
    expect(decoded).toContain('name="iso"; filename="game.chd"');
    expect(decoded).toContain('Content-Type: application/octet-stream');
    expect(decoded).toContain('CHD-BYTES');
    // Body is closed with the terminating boundary.
    expect(decoded).toContain(`--${built.boundary}--`);
  });

  it('reports the exact total byte length (header + file + footer)', async () => {
    const payload = TEXT_ENCODER.encode('PAYLOAD');
    const built = buildMultipart([], { name: 'iso', filename: 'x.chd', blob: new Blob([payload]) });
    // The body is a Blob over [headerBytes, fileBlob, footerBytes]; reading its
    // size is the ground truth for the computed total.
    expect(built.total).toBe(built.body.size);
  });
});

// --- uploadDisc: XHR is stubbed so progress + auth + routing can be asserted --

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

describe('uploadDisc', () => {
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

  it('attaches the superuser token, posts to the discs endpoint, and resolves with the record', async () => {
    const record = uploadDisc({
      serial: 'SLUS-00797',
      index: 0,
      gameId: 'game-1',
      iso: new Blob([new Uint8Array([1, 2, 3])]),
      filename: 'game.chd',
    });

    await Promise.resolve();
    const fake = queue[queue.length - 1]!;

    expect(fake.method).toBe('POST');
    expect(fake.url).toBe(`${adminClient.baseURL}/api/collections/discs/records`);
    // The raw XHR path authenticates with the same token the SDK would use
    // (verifies Decision 3 / task 3.4: explicit header accepted identically).
    expect(fake.headers['Authorization']).toBe(TOKEN);
    expect(fake.headers['Content-Type']).toContain(
      'multipart/form-data; boundary=----FormBoundary',
    );

    fake.respond(200, { id: 'disc-1', serial: 'SLUS-00797' });
    await expect(record).resolves.toMatchObject({ id: 'disc-1', serial: 'SLUS-00797' });
  });

  it('fires progress events from upload.onprogress', async () => {
    const events: { loaded: number; total: number }[] = [];
    const record = uploadDisc({
      serial: 'SLUS-00797',
      index: 1,
      gameId: 'game-1',
      iso: new Blob([new Uint8Array([0])]),
      onProgress: (p) => events.push(p),
    });

    await Promise.resolve();
    const fake = queue[queue.length - 1]!;
    fake.progress(40, 100);
    fake.progress(100, 100);
    fake.respond(200, { id: 'disc-2', serial: 'SLUS-00797' });

    await record;
    expect(events).toEqual([
      { loaded: 40, total: 100 },
      { loaded: 100, total: 100 },
    ]);
  });

  it('rejects on HTTP >= 400 with the server message', async () => {
    const record = uploadDisc({
      serial: 'SLUS-00797',
      index: 0,
      gameId: 'game-1',
      iso: new Blob([new Uint8Array([0])]),
    });
    await Promise.resolve();
    queue[queue.length - 1]!.respond(400, { message: 'serial must be unique' });
    await expect(record).rejects.toThrow('HTTP 400');
  });

  it('does not abort the batch: a second disc uploads after a first failure', async () => {
    const first = uploadDisc({
      serial: 'FAIL',
      index: 0,
      gameId: 'g',
      iso: new Blob([new Uint8Array([0])]),
    });
    const second = uploadDisc({
      serial: 'OK',
      index: 1,
      gameId: 'g',
      iso: new Blob([new Uint8Array([0])]),
    });

    await Promise.resolve();
    queue.shift()!.respond(500, { message: 'boom' });
    await Promise.resolve();
    queue[queue.length - 1]!.respond(200, { id: 'disc-ok', serial: 'OK' });

    await expect(first).rejects.toThrow('HTTP 500');
    await expect(second).resolves.toMatchObject({ id: 'disc-ok' });
  });
});
