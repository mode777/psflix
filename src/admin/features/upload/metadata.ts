/**
 * psxdatacenter metadata fetch + normalize. Ported almost verbatim from the
 * CLI's `metadata.js` (see design.md, Decision 7): the field mapping was
 * already correct against `pb_schema.json` (region select values, JSON
 * `languages`/`features`, `first_disc_serial` from `discs[0].printed_serial`).
 *
 * The Node CLI used `axios`; this is the browser `fetch` adaptation. A 404 is
 * treated as "no metadata" and surfaced as a typed error the caller can isolate
 * from a transport failure.
 */

const API_BASE = 'https://mode777.github.io/psxdatacenter-dump/api';

/** A single disc entry in the raw psxdatacenter JSON. */
export type PsxDisc = {
  disc_number?: number;
  printed_serial?: string;
  serial_in_disc?: string;
  [key: string]: unknown;
};

/** Raw shape of a psxdatacenter API JSON document (only the fields we use). */
export type PsxDatacenterGame = {
  serial?: string;
  title?: string;
  official_title?: string;
  region?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  date_released?: string;
  languages?: string[];
  description?: string;
  manufacturer_description?: string;
  features?: string[];
  players?: string;
  cover_image?: string | null;
  screenshots?: string[];
  discs?: PsxDisc[];
};

/** Normalized metadata the rest of the pipeline consumes. */
export type GameMetadata = {
  officialTitle: string;
  title: string;
  region: string;
  genre: string;
  developer: string;
  publisher: string;
  dateReleased: string;
  languages: string[];
  description: string;
  manufacturerDescription: string;
  features: string[];
  players: string;
  coverImage: string | null;
  screenshots: string[];
  firstDiscSerial: string;
  discs: PsxDisc[];
  discCount: number;
};

/** The metadata source has no entry for this disc id (HTTP 404). */
export class MetadataNotFoundError extends Error {
  readonly discId: string;
  constructor(discId: string) {
    super(`No metadata found for disc ID: ${discId}`);
    this.name = 'MetadataNotFoundError';
    this.discId = discId;
  }
}

export async function fetchGameMetadata(discId: string): Promise<GameMetadata> {
  const url = `${API_BASE}/${discId}.json`;
  const response = await fetch(url);
  if (response.status === 404) {
    throw new MetadataNotFoundError(discId);
  }
  if (!response.ok) {
    throw new Error(`Metadata request failed for ${discId} (HTTP ${response.status})`);
  }
  const raw = (await response.json()) as PsxDatacenterGame;
  return normalizeMetadata(raw);
}

export function normalizeMetadata(raw: PsxDatacenterGame): GameMetadata {
  return {
    officialTitle: raw.official_title || raw.title || '',
    title: raw.title || '',
    region: raw.region || '',
    genre: raw.genre || '',
    developer: raw.developer || '',
    publisher: raw.publisher || '',
    dateReleased: raw.date_released || '',
    languages: raw.languages || [],
    description: raw.description || '',
    manufacturerDescription: raw.manufacturer_description || '',
    features: raw.features || [],
    players: raw.players || '',
    coverImage: raw.cover_image || null,
    screenshots: raw.screenshots || [],
    firstDiscSerial:
      raw.discs?.[0]?.printed_serial || raw.discs?.[0]?.serial_in_disc || raw.serial || '',
    discs: raw.discs || [],
    discCount: (raw.discs || []).length,
  };
}
