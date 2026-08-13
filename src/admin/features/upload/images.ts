/**
 * Image-download helper. Cross-origin cover/screenshot URLs from psxdatacenter
 * are fetched and re-uploaded as `File` objects (no hot-linking). A per-image
 * failure (network error, non-OK status, or a CORS-blocked response) resolves
 * `null` rather than throwing, so the game is still created without that image
 * (graceful degradation, per design.md "Risks / Trade-offs").
 */

/** Maximum screenshots stored per game (`games.screenshots` `maxSelect: 10`; the
 * pipeline caps at 5 to keep upload size bounded, matching the CLI). */
export const MAX_SCREENSHOTS = 5;

/** Pure helper: take the first `max` screenshot URLs (default cap of 5). */
export function capScreenshotUrls(urls: string[], max: number = MAX_SCREENSHOTS): string[] {
  return urls.slice(0, max);
}

export async function downloadImage(url: string): Promise<File | null> {
  let response: Response;
  try {
    response = await fetch(url);
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
