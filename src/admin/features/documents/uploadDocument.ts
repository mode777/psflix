import { adminClient } from '@/admin/lib/pb';
import { buildMultipart, type MultipartField } from '../upload/multipart';
import type { DocumentsTypeOptions } from '@/types/pocketbase';

/**
 * Stream a PDF manual/guide to PocketBase's `documents` collection with real
 * upload progress. A thin sibling of `uploadDisc.ts` (design.md, Decision 5):
 * implemented with `XMLHttpRequest` + `upload.onprogress` because neither the
 * PocketBase SDK nor `fetch()` expose request-body progress.
 *
 * The superuser token from `adminClient.authStore.token` is attached explicitly
 * via the `Authorization` header — a raw XHR does not inherit the SDK's auth.
 * Resolves with the created record; rejects on HTTP >= 400 or a network error.
 */
export type UploadProgress = { loaded: number; total: number };

export type UploadDocumentParams = {
  type: DocumentsTypeOptions;
  gameId: string;
  /** The PDF `File`/`Blob` to attach as `file`. */
  file: Blob;
  /** Filename reported to PocketBase; defaults to the `File` name or `document.pdf`. */
  filename?: string;
  onProgress?: (progress: UploadProgress) => void;
};

export type CreatedDocument = { id: string; type: DocumentsTypeOptions; [key: string]: unknown };

export function uploadDocument(params: UploadDocumentParams): Promise<CreatedDocument> {
  const { type, gameId, file, onProgress } = params;
  const filename = params.filename ?? (file instanceof File ? file.name : 'document.pdf');

  const fields: MultipartField[] = [
    { name: 'type', value: type },
    { name: 'game', value: gameId },
  ];

  const { body, contentType } = buildMultipart(fields, {
    name: 'file',
    filename,
    blob: file,
  });

  const url = `${adminClient.baseURL}/api/collections/documents/records`;
  const token = adminClient.authStore.token;

  return new Promise<CreatedDocument>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', token);
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable) {
          onProgress({ loaded: event.loaded, total: event.total });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 400) {
        reject(new Error(documentUploadErrorMessage(xhr)));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as CreatedDocument);
      } catch (err) {
        reject(new Error(`Invalid JSON response: ${(err as Error).message}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during document upload'));
    xhr.send(body);
  });
}

function documentUploadErrorMessage(xhr: XMLHttpRequest): string {
  let detail = '';
  try {
    const parsed = JSON.parse(xhr.responseText) as { message?: string };
    detail = parsed.message ? `: ${parsed.message}` : '';
  } catch {
    if (xhr.responseText) detail = `: ${xhr.responseText}`;
  }
  return `Document upload failed (HTTP ${xhr.status})${detail}`;
}
