import { describe, it, expect } from 'vitest';
import { palFromSerial, isPAL, PAL_FPS } from './psxRegion';

describe('palFromSerial', () => {
  it('detects common PAL serial prefixes', () => {
    expect(palFromSerial('SLES-01234')).toBe(true);
    expect(palFromSerial('SLES01234')).toBe(true);
    expect(palFromSerial('SLED-54321')).toBe(true);
    expect(palFromSerial('SCES-12345')).toBe(true);
    expect(palFromSerial('SCES_11111')).toBe(true);
    expect(palFromSerial('SCED-00001')).toBe(true);
  });

  it('excludes NTSC serials (incl. the Wild Arms SCUS exception)', () => {
    expect(palFromSerial('SLUS-94465')).toBe(false);
    expect(palFromSerial('SCUS-94608')).toBe(false);
    expect(palFromSerial('SLPS-01001')).toBe(false);
    expect(palFromSerial('SLPM-86001')).toBe(false);
  });

  it('handles the oddball PAL IDs the core special-cases', () => {
    expect(palFromSerial('DTLS3035')).toBe(true);
    expect(palFromSerial('PBPX95001')).toBe(true);
    expect(palFromSerial('PBPX95007')).toBe(true);
    expect(palFromSerial('PBPX95008')).toBe(true);
  });

  it('is case-insensitive and rejects empty/garbage', () => {
    expect(palFromSerial('sles-01234')).toBe(true);
    expect(palFromSerial('')).toBe(false);
    expect(palFromSerial('      ')).toBe(false);
  });
});

describe('isPAL', () => {
  it('treats the catalog region as authoritative', () => {
    expect(isPAL('PAL', 'SLUS-94465')).toBe(true);
    expect(isPAL('NTSC-U', 'SLES-01234')).toBe(false);
    expect(isPAL('NTSC-J', 'SLES-01234')).toBe(false);
  });

  it('falls back to the serial when the region is unknown', () => {
    expect(isPAL(undefined, 'SLES-01234')).toBe(true);
    expect(isPAL(undefined, 'SLUS-94465')).toBe(false);
    expect(isPAL(undefined, undefined)).toBe(false);
  });
});

describe('PAL frame pacing constant', () => {
  it('targets 50 fps for PAL', () => {
    expect(PAL_FPS).toBe(50);
  });
});
