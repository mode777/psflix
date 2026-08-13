import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '@/admin/lib/pb';
import { uploadDocument } from './uploadDocument';
import {
  deleteDocumentsByIds,
  fetchSameTypeDocumentIds,
  replaceExistingDocuments,
} from './replaceExistingDocuments';

const TEXT_ENCODER = new TextEncoder();

type Fn = ReturnType<typeof vi.fn>;

function spyDocumentsCollection(getList: Fn, del: Fn = vi.fn(async () => true)) {
  return vi.spyOn(adminClient, 'collection').mockReturnValue({ getList, delete: del } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSameTypeDocumentIds', () => {
  it('queries documents by (game,type), requests only id, and paginates', async () => {
    const getList = vi.fn();
    getList.mockResolvedValueOnce({
      items: [{ id: 'd1' }, { id: 'd2' }],
      totalItems: 3,
      totalPages: 2,
    });
    getList.mockResolvedValueOnce({
      items: [{ id: 'd3' }],
      totalItems: 3,
      totalPages: 2,
    });
    spyDocumentsCollection(getList);

    const ids = await fetchSameTypeDocumentIds('game-1', 'manual');

    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[0]![0]).toBe(1);
    expect(getList.mock.calls[0]![1]).toBe(200);
    const opts = getList.mock.calls[0]![2] as { filter: string; fields: string };
    expect(opts.fields).toBe('id');
    expect(opts.filter).toContain('game');
    expect(opts.filter).toContain('type');
    expect(ids).toEqual(['d1', 'd2', 'd3']);
  });

  it('stops after one page when totalPages === 1', async () => {
    const getList = vi.fn(async () => ({
      items: [{ id: 'only' }],
      totalItems: 1,
      totalPages: 1,
    }));
    spyDocumentsCollection(getList);
    const ids = await fetchSameTypeDocumentIds('g', 'guide');
    expect(getList).toHaveBeenCalledTimes(1);
    expect(ids).toEqual(['only']);
  });
});

describe('deleteDocumentsByIds', () => {
  it('deletes every id and returns the count', async () => {
    const del = vi.fn(async () => true);
    spyDocumentsCollection(vi.fn(), del);
    const result = await deleteDocumentsByIds(['a', 'b', 'c']);
    expect(del).toHaveBeenCalledTimes(3);
    expect(result.deleted).toBe(3);
    expect(result.failed).toEqual([]);
  });

  it('collects per-id failures without aborting the pass', async () => {
    const del = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce(true);
    spyDocumentsCollection(vi.fn(), del);
    const result = await deleteDocumentsByIds(['a', 'b', 'c']);
    expect(result.deleted).toBe(2);
    expect(result.failed).toEqual(['b']);
  });
});

describe('replaceExistingDocuments', () => {
  it('fetches same-(game,type) ids and deletes them', async () => {
    const getList = vi.fn(async () => ({
      items: [{ id: 'old1' }, { id: 'old2' }],
      totalItems: 2,
      totalPages: 1,
    }));
    const del = vi.fn(async () => true);
    spyDocumentsCollection(getList, del);

    const result = await replaceExistingDocuments({ gameId: 'game-1', type: 'manual' });

    expect(result.deleted).toBe(2);
    expect(del).toHaveBeenCalledWith('old1');
    expect(del).toHaveBeenCalledWith('old2');
  });

  it('spares ids listed in excludeIds (e.g. a just-created record)', async () => {
    const getList = vi.fn(async () => ({
      items: [{ id: 'old1' }, { id: 'new-rec' }],
      totalItems: 2,
      totalPages: 1,
    }));
    const del = vi.fn(async () => true);
    spyDocumentsCollection(getList, del);

    const result = await replaceExistingDocuments({
      gameId: 'game-1',
      type: 'manual',
      excludeIds: ['new-rec'],
    });

    expect(result.deleted).toBe(1);
    expect(del).toHaveBeenCalledWith('old1');
    expect(del).not.toHaveBeenCalledWith('new-rec');
  });
});

// --- create-before-delete contract (design.md, Decision 8) ---
// These mirror the runUpload per-item replace branch against the REAL
// uploadDocument (XHR) + REAL snapshot/delete helpers, asserting the invariant:
// pre-existing documents are deleted only after the new record is created, so a
// failed upload removes nothing.
type FakeXhr = {
  headers: Record<string, string>;
  upload: { onprogress: ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  responseText: string;
  status: number;
  open: (m: string, u: string) => void;
  setRequestHeader: (k: string, v: string) => void;
  send: (b: unknown) => void;
  respond: (status: number, body: unknown) => void;
};

function installFakeXhr(): FakeXhr[] {
  const queue: FakeXhr[] = [];
  const Fake = function (this: FakeXhr) {
    this.headers = {};
    this.upload = { onprogress: null };
    this.onload = null;
    this.responseText = '';
    this.status = 0;
    this.open = () => {};
    this.setRequestHeader = (k, v) => {
      this.headers[k] = v;
    };
    this.send = () => {};
    this.respond = (status, body) => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    };
    queue.push(this);
  } as unknown as { new (): FakeXhr };
  vi.stubGlobal('XMLHttpRequest', Fake);
  return queue;
}

describe('create-before-delete (runUpload-shaped)', () => {
  const TOKEN = 'admin-jwt-token';
  let xhrQueue: FakeXhr[];

  beforeEach(() => {
    adminClient.authStore.save(TOKEN, {
      id: 's1',
      email: 'a@b.c',
      collectionName: '_superusers',
    } as never);
    xhrQueue = installFakeXhr();
  });

  afterEach(() => {
    adminClient.authStore.clear();
    vi.unstubAllGlobals();
  });

  it('deletes the snapshotted ids only after the create succeeds', async () => {
    const getList = vi.fn(async () => ({
      items: [{ id: 'old1' }, { id: 'old2' }],
      totalItems: 2,
      totalPages: 1,
    }));
    const del = vi.fn(async () => true);
    spyDocumentsCollection(getList, del);

    const snapshot = await fetchSameTypeDocumentIds('game-1', 'manual');
    expect(snapshot).toEqual(['old1', 'old2']);

    const created = uploadDocument({
      type: 'manual',
      gameId: 'game-1',
      file: new Blob([TEXT_ENCODER.encode('%PDF-1.4')]),
      filename: 'm.pdf',
    });
    await Promise.resolve();
    xhrQueue[xhrQueue.length - 1]!.respond(200, { id: 'new-rec', type: 'manual' });
    await created; // throws if the create failed → delete below would not run

    await deleteDocumentsByIds(snapshot);
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('old1');
    expect(del).toHaveBeenCalledWith('old2');
  });

  it('does NOT delete when the create rejects', async () => {
    const getList = vi.fn(async () => ({
      items: [{ id: 'old1' }],
      totalItems: 1,
      totalPages: 1,
    }));
    const del = vi.fn(async () => true);
    spyDocumentsCollection(getList, del);

    const snapshot = await fetchSameTypeDocumentIds('game-1', 'manual');

    // Mirror runUpload: try the create, and only delete inside the success path.
    let created = false;
    try {
      const p = uploadDocument({
        type: 'manual',
        gameId: 'game-1',
        file: new Blob([TEXT_ENCODER.encode('%PDF-1.4')]),
        filename: 'm.pdf',
      });
      await Promise.resolve();
      xhrQueue[xhrQueue.length - 1]!.respond(500, { message: 'boom' });
      await p;
      created = true;
    } catch {
      // create failed — runUpload skips the delete branch entirely.
    }
    if (created) {
      await deleteDocumentsByIds(snapshot);
    }

    expect(created).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});
