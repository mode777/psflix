import { describe, expect, it } from 'vitest';
import {
  documentQueueReducer,
  isPdf,
  selectUploadable,
  type DocumentQueueAction,
  type DocumentQueueState,
} from './useDocumentQueue';

function pdf(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name);
}

function png(name: string): File {
  return new File([new Uint8Array([1])], name);
}

const STATE: DocumentQueueState = { items: [], seq: 0 };

function reduce(state: DocumentQueueState, ...actions: DocumentQueueAction[]): DocumentQueueState {
  return actions.reduce((s, a) => documentQueueReducer(s, a), state);
}

/** Returns the ids of items in the order they appear. */
function ids(state: DocumentQueueState): string[] {
  return state.items.map((i) => i.id);
}

describe('isPdf', () => {
  it('accepts .pdf case-insensitively and rejects everything else', () => {
    expect(isPdf(pdf('Manual.pdf'))).toBe(true);
    expect(isPdf(pdf('manual.PDF'))).toBe(true);
    expect(isPdf(pdf('Guide.PdF'))).toBe(true);
    expect(isPdf(png('image.png'))).toBe(false);
    expect(isPdf(png('archive.zip'))).toBe(false);
    expect(isPdf(new File([new Uint8Array([0])], 'noext'))).toBe(false);
  });
});

describe('documentQueueReducer ADD_FILES', () => {
  it('stages every PDF and ignores non-PDFs (spec: rejected at intake)', () => {
    const state = reduce(STATE, {
      type: 'ADD_FILES',
      files: [pdf('a.pdf'), png('b.png'), pdf('c.PDF'), png('d.txt')],
    });
    expect(state.items).toHaveLength(2);
    expect(state.items.map((i) => i.file.name)).toEqual(['a.pdf', 'c.PDF']);
    // Defaults per design: type 'guide', gameId null, status 'staged'.
    for (const item of state.items) {
      expect(item.type).toBe('guide');
      expect(item.gameId).toBeNull();
      expect(item.status).toBe('staged');
      expect(item.progress).toBeNull();
      expect(item.error).toBeNull();
    }
  });

  it('is a no-op when a batch contains no PDFs', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [png('a.png'), png('b.txt')] });
    expect(state.items).toHaveLength(0);
  });

  it('appends to existing items and keeps ids unique', () => {
    const first = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf')] });
    const second = reduce(first, { type: 'ADD_FILES', files: [pdf('b.pdf')] });
    expect(second.items.map((i) => i.file.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(new Set(ids(second)).size).toBe(2);
  });
});

describe('documentQueueReducer REMOVE / SET_GAME / SET_TYPE', () => {
  it('removes the item with the given id', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf'), pdf('b.pdf')] });
    const target = state.items[0]!.id;
    const next = reduce(state, { type: 'REMOVE', id: target });
    expect(next.items.map((i) => i.file.name)).toEqual(['b.pdf']);
  });

  it('sets the game id and clears any prior error', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf')] });
    const id = state.items[0]!.id;
    const errored = reduce(state, {
      type: 'FILE_ERROR',
      id,
      error: 'boom',
    });
    expect(errored.items[0]!.error).toBe('boom');
    const withGame = reduce(errored, { type: 'SET_GAME', id, gameId: 'game-1' });
    expect(withGame.items[0]!.gameId).toBe('game-1');
    expect(withGame.items[0]!.error).toBeNull();
  });

  it('sets the document type independently', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf')] });
    const id = state.items[0]!.id;
    expect(state.items[0]!.type).toBe('guide');
    const manual = reduce(state, { type: 'SET_TYPE', id, documentType: 'manual' });
    expect(manual.items[0]!.type).toBe('manual');
  });
});

describe('documentQueueReducer SET_REPLACE', () => {
  it('toggles replaceExisting on the target item only (default false)', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf'), pdf('b.pdf')] });
    const a = state.items[0]!.id;
    const b = state.items[1]!.id;
    // New items default to append (replaceExisting === false).
    expect(state.items.every((i) => i.replaceExisting === false)).toBe(true);

    const replaced = reduce(state, { type: 'SET_REPLACE', id: a, replaceExisting: true });
    expect(replaced.items.find((i) => i.id === a)!.replaceExisting).toBe(true);
    // Sibling item is untouched.
    expect(replaced.items.find((i) => i.id === b)!.replaceExisting).toBe(false);

    const off = reduce(replaced, { type: 'SET_REPLACE', id: a, replaceExisting: false });
    expect(off.items.find((i) => i.id === a)!.replaceExisting).toBe(false);
  });

  it('does not affect uploadability (replace never gates the upload button)', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf')] });
    const id = state.items[0]!.id;
    const assigned = reduce(state, { type: 'SET_GAME', id, gameId: 'g1' });
    const replaced = reduce(assigned, { type: 'SET_REPLACE', id, replaceExisting: true });
    expect(selectUploadable(replaced.items).map((i) => i.id)).toEqual([id]);
  });
});

describe('selectUploadable', () => {
  it('only includes staged items that have both a game and a type', () => {
    const staged = reduce(STATE, {
      type: 'ADD_FILES',
      files: [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')],
    });
    const a = staged.items[0]!.id;
    const b = staged.items[1]!.id;
    const c = staged.items[2]!.id;
    // Assign game to a + b only.
    const assigned = reduce(
      staged,
      { type: 'SET_GAME', id: a, gameId: 'g1' },
      { type: 'SET_GAME', id: b, gameId: 'g2' },
      // Flip c to uploading — it should drop out even though it has no game.
      { type: 'UPLOAD_START', id: c },
    );
    const uploadable = selectUploadable(assigned.items);
    expect(uploadable.map((i) => i.file.name).sort()).toEqual(['a.pdf', 'b.pdf']);
    expect(
      uploadable.every((i) => i.gameId !== null && i.type !== undefined && i.status === 'staged'),
    ).toBe(true);
  });
});

describe('documentQueueReducer upload lifecycle', () => {
  it('UPLOAD_START -> PROGRESS -> FILE_DONE marks a clean upload', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf')] });
    const id = state.items[0]!.id;
    const started = reduce(state, { type: 'UPLOAD_START', id });
    expect(started.items[0]!.status).toBe('uploading');
    const progressed = reduce(started, {
      type: 'PROGRESS',
      id,
      progress: { loaded: 5, total: 10 },
    });
    expect(progressed.items[0]!.progress).toEqual({ loaded: 5, total: 10 });
    const done = reduce(progressed, { type: 'FILE_DONE', id });
    expect(done.items[0]!.status).toBe('done');
    expect(done.items[0]!.progress).toBeNull();
    expect(done.items[0]!.error).toBeNull();
  });

  it('FILE_ERROR keeps the batch going: other items stay staged/uploadable', () => {
    const state = reduce(STATE, { type: 'ADD_FILES', files: [pdf('a.pdf'), pdf('b.pdf')] });
    const a = state.items[0]!.id;
    const b = state.items[1]!.id;
    const assigned = reduce(
      state,
      { type: 'SET_GAME', id: a, gameId: 'g1' },
      { type: 'SET_GAME', id: b, gameId: 'g2' },
    );
    const errored = reduce(assigned, { type: 'FILE_ERROR', id: a, error: 'HTTP 500' });
    expect(errored.items.find((i) => i.id === a)!.status).toBe('error');
    expect(errored.items.find((i) => i.id === a)!.error).toBe('HTTP 500');
    // The sibling item is unaffected and still uploadable.
    expect(errored.items.find((i) => i.id === b)!.status).toBe('staged');
    expect(selectUploadable(errored.items).map((i) => i.id)).toEqual([b]);
  });
});
