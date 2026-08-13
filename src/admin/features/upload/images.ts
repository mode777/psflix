/**
 * Image-download helper. Cross-origin cover/screenshot URLs from psxdatacenter
 * are fetched and re-uploaded as `File` objects (no hot-linking).
 *
 * psxdatacenter serves images **without CORS headers**, so the browser cannot
 * read their bytes directly (verified in manual e2e). Every download is routed
 * through `wsrv.nl`, a purpose-built image proxy that sends
 * `Access-Control-Allow-Origin: *`. A per-image failure (proxy down, network
 * error, non-OK status) resolves `null` rather than throwing, so the game is
 * still created without that image (graceful degradation).
 */

/** Maximum screenshots stored per game (`games.screenshots` `maxSelect: 10`; the
 * pipeline caps at 5 to keep upload size bounded, matching the CLI). */
export const MAX_SCREENSHOTS = 5;

/** CORS-enabled image proxy base (wsrv.nl is the successor domain of images.weserv.nl). */
const IMAGE_PROXY_BASE = 'https://wsrv.nl/';

/**
 * Rewrite a raw image URL into a proxy URL. `output=jpg` normalizes every image
 * to JPEG (smaller, uniform); the proxy fetches server-side and returns the
 * bytes with permissive CORS headers.
 */
export function proxyImageUrl(url: string): string {
  return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(url)}&output=jpg`;
}

/** Pure helper: take the first `max` screenshot URLs (default cap of 5). */
export function capScreenshotUrls(urls: string[], max: number = MAX_SCREENSHOTS): string[] {
  return urls.slice(0, max);
}

export async function downloadImage(url: string): Promise<File | null> {
  let response: Response;
  try {
    response = await fetch(proxyImageUrl(url), { signal: AbortSignal.timeout(30_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || '';
  const ext = getImageExtension(url, contentType);
  const basename = url.split('/').pop();
  const filename = basename && basename.length > 0 ? ensureExtension(basename, ext) : `image${ext}`;
  return new File([buffer], filename, { type: contentType || 'application/octet-stream' });
}

function getImageExtension(url: string, contentType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return '.jpg';
  if (url.endsWith('.png')) return '.png';
  if (url.endsWith('.webp')) return '.webp';
  return '.bin';
}

function ensureExtension(filename: string, ext: string): string {
  return /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename}${ext}`;
}
