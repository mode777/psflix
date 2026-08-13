import { adminClient } from '@/admin/lib/pb';
import type { DiscsResponse, GamesResponse } from '@/types/pocketbase';
import { capScreenshotUrls, downloadImage } from './images';
import type { GameMetadata } from './metadata';

export type GameRecord = GamesResponse;
export type DiscRecord = DiscsResponse;

/** PocketBase throws a `ClientResponseError` with `.status` on 404 (no match). */
function is404(err: unknown): boolean {
  const e = err as { status?: number; response?: { status?: number } };
  return e?.status === 404 || e?.response?.status === 404;
}

/**
 * Existence check: a game with this first disc serial. 404 → null (none yet).
 * Uses `getFirstListItem` on the unique `first_disc_serial` index (matches the
 * CLI and the schema's unique constraint).
 */
export async function findGame(firstDiscSerial: string): Promise<GameRecord | null> {
  try {
    return await adminClient
      .collection('games')
      .getFirstListItem<GameRecord>(
        adminClient.filter('first_disc_serial = {:serial}', { serial: firstDiscSerial }),
      );
  } catch (err) {
    if (is404(err)) return null;
    throw err;
  }
}

/** Existence check: a disc with this serial. 404 → null. */
export async function findDisc(serial: string): Promise<DiscRecord | null> {
  try {
    return await adminClient
      .collection('discs')
      .getFirstListItem<DiscRecord>(adminClient.filter('serial = {:serial}', { serial }));
  } catch (err) {
    if (is404(err)) return null;
    throw err;
  }
}

/**
 * Pure field mapping from normalized metadata to the `games` create body (the
 * `cover_image` / `screenshots` `File` objects are added separately by
 * `createGame`). Mirrors the CLI's `games.js` mapping (region select values,
 * JSON `languages`/`features`, `first_disc_serial`, ISO `release` date).
 */
export function buildGameFields(metadata: GameMetadata): Record<string, unknown> {
  return {
    title: metadata.officialTitle,
    region: metadata.region,
    genre: metadata.genre,
    developer: metadata.developer,
    publisher: metadata.publisher,
    release: toIsoDate(metadata.dateReleased),
    languages: metadata.languages,
    description: metadata.description,
    manufacturer_description: metadata.manufacturerDescription,
    features: metadata.features,
    players: metadata.players,
    first_disc_serial: metadata.firstDiscSerial,
    discs: metadata.discCount,
  };
}

function toIsoDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/**
 * Create a `games` record from metadata, downloading the cover and up to 5
 * screenshots as `File` objects (cross-origin images are fetched and
 * re-uploaded, never hot-linked). Per-image failure degrades gracefully: the
 * game is created without that image. Uses the SDK `create()` directly (small
 * body, no progress needed).
 */
export async function createGame(metadata: GameMetadata): Promise<GameRecord> {
  const body: Record<string, unknown> = buildGameFields(metadata);

  if (metadata.coverImage) {
    const coverFile = await downloadImage(metadata.coverImage);
    if (coverFile) body.cover_image = coverFile;
  }

  const screenshotUrls = capScreenshotUrls(metadata.screenshots);
  if (screenshotUrls.length > 0) {
    const screenshots: File[] = [];
    for (const url of screenshotUrls) {
      const file = await downloadImage(url);
      if (file) screenshots.push(file);
    }
    if (screenshots.length > 0) body.screenshots = screenshots;
  }

  return adminClient.collection('games').create<GameRecord>(body);
}
