import { adminClient } from '@/admin/lib/pb';
import { buildMultipart, type MultipartField } from './multipart';

/**
 * Stream a CHD disc image to PocketBase's `discs` collection with real upload
 * progress. Implemented with `XMLHttpRequest` + `upload.onprogress` because
 * neither the PocketBase SDK nor `fetch()` expose request-body progress
 * (design.md, Decision 3).
 *
 * The superuser token from `adminClient.authStore.token` is attached explicitly
 * via the `Authorization` header — a raw XHR does not inherit the SDK's auth.
 * Resolves with the created record; rejects on HTTP ≥ 400 or a network error.
 */
export type UploadProgress = { loaded: number; total: number };

export type UploadDiscParams = {
  serial: string;
  index: number;
  gameId: string;
  /** The CHD `File`/`Blob` to attach as `iso`. */
  iso: Blob;
  /** Filename reported to PocketBase; defaults to the `File` name or `disc.chd`. */
  filename?: string;
  onProgress?: (progress: UploadProgress) => void;
};

export type CreatedDisc = { id: string; serial: string; [key: string]: unknown };

export function uploadDisc(params: UploadDiscParams): Promise<CreatedDisc> {
  const { serial, index, gameId, iso, onProgress } = params;
  const filename = params.filename ?? (iso instanceof File ? iso.name : 'disc.chd');

  const fields: MultipartField[] = [
    { name: 'serial', value: serial },
    { name: 'index', value: String(index) },
    { name: 'game', value: gameId },
  ];

  const { body, contentType } = buildMultipart(fields, {
    name: 'iso',
    filename,
    blob: iso,
  });

  const url = `${adminClient.baseURL}/api/collections/discs/records`;
  const token = adminClient.authStore.token;

  return new Promise<CreatedDisc>((resolve, reject) => {
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
        reject(new Error(discUploadErrorMessage(xhr)));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as CreatedDisc);
      } catch (err) {
        reject(new Error(`Invalid JSON response: ${(err as Error).message}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during disc upload'));
    xhr.send(body);
  });
}

function discUploadErrorMessage(xhr: XMLHttpRequest): string {
  let detail = '';
  try {
    const parsed = JSON.parse(xhr.responseText) as { message?: string };
    detail = parsed.message ? `: ${parsed.message}` : '';
  } catch {
    if (xhr.responseText) detail = `: ${xhr.responseText}`;
  }
  return `Disc upload failed (HTTP ${xhr.status})${detail}`;
}
