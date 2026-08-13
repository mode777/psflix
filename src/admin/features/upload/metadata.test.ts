import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MetadataNotFoundError,
  fetchGameMetadata,
  normalizeMetadata,
  type PsxDatacenterGame,
} from './metadata';
import { capScreenshotUrls, downloadImage, proxyImageUrl } from './images';

/** Minimal sample modeled on `psx-uploader/samples/SLUS-00797.json`. */
const sample: PsxDatacenterGame = {
  serial: 'SLUS-00797',
  title: 'R4 - RIDGE RACER TYPE 4',
  official_title: 'R4 - Ridge Racer Type 4',
  region: 'NTSC-U',
  genre: 'Driving',
  developer: 'Namco',
  publisher: 'Namco',
  date_released: '1999-05-05',
  languages: ['English'],
  description: 'Arcade racing.',
  manufacturer_description: 'Best-looking racer.',
  features: ['3D graphics', 'Racing theme.'],
  players: '1 or 2 Players',
  cover_image: 'https://psxdatacenter.com/images/covers/U/R/SLUS-00797.jpg',
  screenshots: Array.from({ length: 20 }, (_, i) => `https://psxdatacenter.com/ss${i}.jpg`),
  discs: [
    { disc_number: 1, printed_serial: 'SLUS-00797', serial_in_disc: 'SLUS-00797' },
    { disc_number: 2, printed_serial: 'SLUS-90049', serial_in_disc: 'SLUS-90049' },
  ],
};

describe('normalizeMetadata', () => {
  it('maps fields to the normalized shape', () => {
    const m = normalizeMetadata(sample);
    expect(m.officialTitle).toBe('R4 - Ridge Racer Type 4');
    expect(m.region).toBe('NTSC-U');
    expect(m.dateReleased).toBe('1999-05-05');
    expect(m.manufacturerDescription).toBe('Best-looking racer.');
    expect(m.players).toBe('1 or 2 Players');
  });

  it('derives firstDiscSerial from discs[0].printed_serial', () => {
    const m = normalizeMetadata(sample);
    expect(m.firstDiscSerial).toBe('SLUS-00797');
    expect(m.discCount).toBe(2);
  });

  it('falls back to serial_in_disc then the top-level serial when discs are absent', () => {
    expect(
      normalizeMetadata({ ...sample, discs: [{ serial_in_disc: 'SLUS-90049' }] }).firstDiscSerial,
    ).toBe('SLUS-90049');
    expect(normalizeMetadata({ serial: 'SLUS-00797' }).firstDiscSerial).toBe('SLUS-00797');
  });

  it('exposes languages and features as arrays', () => {
    const m = normalizeMetadata(sample);
    expect(Array.isArray(m.languages)).toBe(true);
    expect(m.languages).toEqual(['English']);
    expect(Array.isArray(m.features)).toBe(true);
    expect(m.features).toHaveLength(2);
  });

  it('defaults languages/features/screenshots to empty arrays when missing', () => {
    const m = normalizeMetadata({});
    expect(m.languages).toEqual([]);
    expect(m.features).toEqual([]);
    expect(m.screenshots).toEqual([]);
    expect(m.discCount).toBe(0);
  });

  it('keeps the full screenshot list in metadata (capping happens at game-build)', () => {
    const m = normalizeMetadata(sample);
    expect(m.screenshots).toHaveLength(20);
  });
});

describe('capScreenshotUrls', () => {
  it('caps the screenshot list at 5', () => {
    expect(capScreenshotUrls(normalizeMetadata(sample).screenshots)).toHaveLength(5);
    expect(capScreenshotUrls(['a', 'b'])).toHaveLength(2);
    expect(capScreenshotUrls([])).toHaveLength(0);
  });
});

describe('fetchGameMetadata', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => sample,
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes the fetched document', async () => {
    const m = await fetchGameMetadata('SLUS-00797');
    expect(m.firstDiscSerial).toBe('SLUS-00797');
    expect(fetch).toHaveBeenCalledWith(
      'https://mode777.github.io/psxdatacenter-dump/api/SLUS-00797.json',
    );
  });

  it('throws MetadataNotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }));
    await expect(fetchGameMetadata('NOPE')).rejects.toBeInstanceOf(MetadataNotFoundError);
  });
});

describe('proxyImageUrl', () => {
  it('routes the raw image URL through the CORS-enabled proxy and forces jpeg', () => {
    const url = 'https://psxdatacenter.com/images/covers/U/R/SLUS-00797.jpg';
    expect(proxyImageUrl(url)).toBe(
      'https://wsrv.nl/?url=https%3A%2F%2Fpsxdatacenter.com%2Fimages%2Fcovers%2FU%2FR%2FSLUS-00797.jpg&output=jpg',
    );
  });
});

describe('downloadImage graceful degradation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches via the image proxy, not the raw (CORS-less) host', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => new ArrayBuffer(4),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await downloadImage('https://psxdatacenter.com/covers/SLUS-00797.jpg');
    expect(file).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('wsrv.nl/?url=https%3A%2F%2Fpsxdatacenter.com'),
      expect.anything(),
    );
  });

  it('returns null when the proxy fetch fails (CORS-blocked / proxy down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    expect(await downloadImage('https://psxdatacenter.com/img.jpg')).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await downloadImage('https://psxdatacenter.com/img.jpg')).toBeNull();
  });

  it('builds a File with an inferred content type on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => new ArrayBuffer(4),
      }),
    );
    const file = await downloadImage('https://psxdatacenter.com/covers/SLUS-00797.jpg');
    expect(file).not.toBeNull();
    expect(file!.type).toBe('image/jpeg');
    expect(file!.name).toBe('SLUS-00797.jpg');
  });
});
