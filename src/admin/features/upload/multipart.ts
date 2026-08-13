/**
 * Hand-built `multipart/form-data` construction for disc uploads.
 *
 * The PocketBase JS SDK exposes no upload-progress hook and `fetch()` exposes
 * progress only for the response; true request-body progress requires
 * `XMLHttpRequest.upload.onprogress` (see design.md, Decision 3). A raw XHR
 * does not encode form fields, so the multipart body is assembled by hand —
 * ported from the CLI's `discs.js` boundary/field/header/footer logic.
 *
 * The body is a `Blob` composed of `[headerBytes, isoBlob, footerBytes]`; the
 * file part is referenced (not copied), so memory stays bounded for large CHDs.
 */

const CRLF = '\r\n';

export type MultipartField = { name: string; value: string };

export type MultipartFilePart = {
  name: string;
  filename: string;
  blob: Blob;
  contentType?: string;
};

export type BuiltMultipart = {
  body: Blob;
  boundary: string;
  contentType: string;
  total: number;
};

function makeBoundary(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `----FormBoundary${Date.now().toString(36)}${rand}`;
}

export function buildMultipart(fields: MultipartField[], file: MultipartFilePart): BuiltMultipart {
  const boundary = makeBoundary();
  const encoder = new TextEncoder();

  let head = '';
  for (const field of fields) {
    head += `--${boundary}${CRLF}`;
    head += `Content-Disposition: form-data; name="${field.name}"${CRLF}${CRLF}`;
    head += `${field.value}${CRLF}`;
  }
  const fileContentType = file.contentType ?? 'application/octet-stream';
  head += `--${boundary}${CRLF}`;
  head += `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"${CRLF}`;
  head += `Content-Type: ${fileContentType}${CRLF}${CRLF}`;

  const footer = `${CRLF}--${boundary}--${CRLF}`;

  const headerBytes = encoder.encode(head);
  const footerBytes = encoder.encode(footer);
  const body = new Blob([headerBytes, file.blob, footerBytes]);
  const total = headerBytes.byteLength + file.blob.size + footerBytes.byteLength;

  return {
    body,
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
    total,
  };
}
