import { useCallback, useReducer } from 'react';
import type { DocumentsTypeOptions } from '@/types/pocketbase';

/**
 * Staged-file state for the document upload workflow (design.md, Decision 4).
 * A single reducer holds the list of ingested PDFs and their per-file
 * assignment (`gameId`, `type`) plus upload progress — closer to the game
 * uploader's pipeline reducer than to a form-submit shape, so `react-hook-form`
 * is intentionally not used.
 */

export type DocumentItemStatus = 'staged' | 'uploading' | 'done' | 'error';

export type DocumentItem = {
  id: string;
  file: File;
  /** Target game id; `null` until the operator assigns one via the combobox. */
  gameId: string | null;
  /** `manual` or `guide`; defaults to `guide` on staging. */
  type: DocumentsTypeOptions;
  /**
   * Opt-in replace mode (design.md, Decision 8): when true, the upload loop
   * deletes pre-existing same-(game,type) documents after this file uploads.
   * Defaults to `false` (append).
   */
  replaceExisting: boolean;
  status: DocumentItemStatus;
  progress: { loaded: number; total: number } | null;
  error: string | null;
};

export type DocumentQueueState = {
  items: DocumentItem[];
  /** Monotonic counter for stable item ids within a session. */
  seq: number;
};

const INITIAL_STATE: DocumentQueueState = { items: [], seq: 0 };

/** A staged file is uploadable once it has both a game and a type. */
export function selectUploadable(items: DocumentItem[]): DocumentItem[] {
  return items.filter((i) => i.gameId !== null && i.status === 'staged');
}

/** Intake validation is extension-based (design.md, Decision 7). */
export function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf');
}

export type DocumentQueueAction =
  | { type: 'ADD_FILES'; files: File[] }
  | { type: 'REMOVE'; id: string }
  | { type: 'SET_GAME'; id: string; gameId: string | null }
  | { type: 'SET_TYPE'; id: string; documentType: DocumentsTypeOptions }
  | { type: 'SET_REPLACE'; id: string; replaceExisting: boolean }
  | { type: 'UPLOAD_START'; id: string }
  | { type: 'PROGRESS'; id: string; progress: { loaded: number; total: number } }
  | { type: 'FILE_DONE'; id: string }
  | { type: 'FILE_ERROR'; id: string; error: string };

export function documentQueueReducer(
  state: DocumentQueueState,
  action: DocumentQueueAction,
): DocumentQueueState {
  switch (action.type) {
    case 'ADD_FILES': {
      // Non-PDFs are silently dropped at intake (spec: rejected rather than
      // staged), matching the game uploader's "non-CHD ignored" behavior.
      const pdfs = action.files.filter(isPdf);
      if (pdfs.length === 0) return state;
      let seq = state.seq;
      const added: DocumentItem[] = pdfs.map((file) => {
        seq += 1;
        return {
          id: `${Date.now()}-${seq}`,
          file,
          gameId: null,
          type: 'guide',
          replaceExisting: false,
          status: 'staged',
          progress: null,
          error: null,
        };
      });
      return { items: [...state.items, ...added], seq };
    }
    case 'REMOVE':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'SET_GAME':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, gameId: action.gameId, error: null } : i,
        ),
      };
    case 'SET_TYPE':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, type: action.documentType } : i,
        ),
      };
    case 'SET_REPLACE':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, replaceExisting: action.replaceExisting } : i,
        ),
      };
    case 'UPLOAD_START':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'uploading', progress: null, error: null } : i,
        ),
      };
    case 'PROGRESS':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, progress: action.progress } : i,
        ),
      };
    case 'FILE_DONE':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'done', progress: null, error: null } : i,
        ),
      };
    case 'FILE_ERROR':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'error', progress: null, error: action.error } : i,
        ),
      };
    default:
      return state;
  }
}

export type UseDocumentQueueResult = {
  items: DocumentItem[];
  addFiles: (files: File[]) => void;
  remove: (id: string) => void;
  setGame: (id: string, gameId: string | null) => void;
  setType: (id: string, documentType: DocumentsTypeOptions) => void;
  setReplace: (id: string, replaceExisting: boolean) => void;
  uploadStart: (id: string) => void;
  progress: (id: string, progress: { loaded: number; total: number }) => void;
  fileDone: (id: string) => void;
  fileError: (id: string, error: string) => void;
};

/**
 * React binding over the pure reducer. The upload-loop actions (`uploadStart`,
 * `progress`, `fileDone`, `fileError`) are exposed individually so the view's
 * sequential upload loop can drive progress without re-deriving action objects.
 * Clearing finished/failed items after a batch is done by the view via `remove`
 * (it reads the latest `items`), keeping the reducer surface to the actions
 * specified by the design.
 */
export function useDocumentQueue(): UseDocumentQueueResult {
  const [state, dispatch] = useReducer(documentQueueReducer, INITIAL_STATE);

  const addFiles = useCallback((files: File[]) => dispatch({ type: 'ADD_FILES', files }), []);
  const remove = useCallback((id: string) => dispatch({ type: 'REMOVE', id }), []);
  const setGame = useCallback(
    (id: string, gameId: string | null) => dispatch({ type: 'SET_GAME', id, gameId }),
    [],
  );
  const setType = useCallback(
    (id: string, documentType: DocumentsTypeOptions) =>
      dispatch({ type: 'SET_TYPE', id, documentType }),
    [],
  );
  const setReplace = useCallback(
    (id: string, replaceExisting: boolean) =>
      dispatch({ type: 'SET_REPLACE', id, replaceExisting }),
    [],
  );
  const uploadStart = useCallback((id: string) => dispatch({ type: 'UPLOAD_START', id }), []);
  const progress = useCallback(
    (id: string, prog: { loaded: number; total: number }) =>
      dispatch({ type: 'PROGRESS', id, progress: prog }),
    [],
  );
  const fileDone = useCallback((id: string) => dispatch({ type: 'FILE_DONE', id }), []);
  const fileError = useCallback(
    (id: string, error: string) => dispatch({ type: 'FILE_ERROR', id, error }),
    [],
  );

  return {
    items: state.items,
    addFiles,
    remove,
    setGame,
    setType,
    setReplace,
    uploadStart,
    progress,
    fileDone,
    fileError,
  };
}
