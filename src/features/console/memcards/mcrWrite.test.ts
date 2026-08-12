import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMemoryCard } from 'mcrreader';
import { createEmptyCard, formatCard } from './mcrBlank';
import { validateBlock0Checksums } from './mcrChecksum';
import { blocksNeeded, copySaveTo, deleteSave, moveSave } from './mcrWrite';

function loadFixture(): Uint8Array {
  return readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'pcsx-card1.mcr'));
}

function loadRef(name: 'memcard_default.mcd' | 'memcard_copy.mcd'): Uint8Array {
  return readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', name));
}

/** Assert every checksummed block-0 frame carries a valid XOR checksum. */
function expectAllChecksumsValid(bytes: Uint8Array): void {
  const results = validateBlock0Checksums(bytes);
  const bad = results.filter((r) => !r.ok);
  expect(
    bad,
    bad
      .map(
        (r) =>
          `frame ${r.frame}@0x${r.offset.toString(16)} stored=0x${r.stored.toString(16)} expected=0x${r.expected.toString(16)}`,
      )
      .join(', '),
  ).toEqual([]);
}

/**
 * Assert the header + 15 directory frames carry valid checksums. Use this for
 * ops that start from a legacy fixture whose write-test frame (63) may be
 * pre-existing-invalid — save ops never touch frame 63, so its state is
 * inherited and not meaningful to assert here.
 */
function expectDirectoryChecksumsValid(bytes: Uint8Array): void {
  const bad = validateBlock0Checksums(bytes).filter((r) => r.frame <= 15 && !r.ok);
  expect(
    bad,
    bad
      .map(
        (r) =>
          `frame ${r.frame}@0x${r.offset.toString(16)} stored=0x${r.stored.toString(16)} expected=0x${r.expected.toString(16)}`,
      )
      .join(', '),
  ).toEqual([]);
}

describe('mcrBlank', () => {
  it('produces a parseable, empty, 128 KB card', () => {
    const card = createEmptyCard();
    expect(card.byteLength).toBe(0x20_000);
    const parsed = parseMemoryCard(card);
    expect(parsed.magic).toBe('MC');
    expect(parsed.saves).toHaveLength(0);
    expect(parsed.freeBlocks).toBe(15);
    expect(parsed.totalBlocks).toBe(15);
  });

  it('formatCard wipes a used card back to 15 free blocks', () => {
    const parsed = parseMemoryCard(loadFixture());
    expect(parsed.saves.length).toBeGreaterThan(0);
    const wiped = formatCard();
    const empty = parseMemoryCard(wiped);
    expect(empty.saves).toHaveLength(0);
    expect(empty.freeBlocks).toBe(15);
  });

  it('produces device-accurate block-0 frames with valid checksums', () => {
    const card = createEmptyCard();
    // Header frame: "MC" + zeros + checksum 0x0E
    expect(card[0x00]).toBe(0x4d);
    expect(card[0x01]).toBe(0x43);
    expect(card[0x7f]).toBe(0x0e);
    // Write-test frame (frame 63) mirrors the header.
    expect(card[0x1f80]).toBe(0x4d);
    expect(card[0x1f81]).toBe(0x43);
    expect(card[0x1fff]).toBe(0x0e);
    // Directory frames are free (0xA0) with a valid per-frame checksum.
    for (let i = 0; i < 15; i++) {
      const off = 0x0080 + i * 0x80;
      expect(card[off]).toBe(0xa0);
      expect(card[off + 0x7f]).toBe(0xa0);
    }
    // Broken-sector-list frames encode "no broken sector" (FFFFFFFF / FFFF).
    for (let i = 0; i < 20; i++) {
      const off = 0x0800 + i * 0x80;
      expect(card[off]).toBe(0xff);
      expect(card[off + 0x03]).toBe(0xff);
    }
    // Every checksummed frame validates.
    expectAllChecksumsValid(card);
  });
});

describe('mcrWrite', () => {
  it('copies a save verbatim onto a blank card', () => {
    const source = parseMemoryCard(loadFixture());
    const save = source.saves.find((s) => s.productCode === 'BASLUS-00922-DINO0')!;
    const target = createEmptyCard();

    const result = copySaveTo(target, source.bytes, save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = parseMemoryCard(result.card);
    expect(parsed.saves).toHaveLength(1);
    const copied = parsed.saves[0]!;
    expect(copied.productCode).toBe(save.productCode);
    expect(copied.title).toBe(save.title);
    expect(copied.hash).toBe(save.hash);
    expect(copied.blocks).toHaveLength(save.blocks.length);
    expect(parsed.freeBlocks).toBe(14);
    expectAllChecksumsValid(result.card);
  });

  it('allocates first-fit so later copies land on later blocks', () => {
    const source = parseMemoryCard(loadFixture());
    const [dino, alundra] = source.saves;
    const target = createEmptyCard();

    const first = copySaveTo(target, source.bytes, dino);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = copySaveTo(first.card, source.bytes, alundra);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const parsed = parseMemoryCard(second.card);
    expect(parsed.saves).toHaveLength(2);
    const copiedAlundra = parsed.saves.find((s) => s.productCode === alundra.productCode)!;
    expect(copiedAlundra.index).not.toBe(dino.index);
    expect(copiedAlundra.hash).toBe(alundra.hash);
  });

  it('rejects copies when the target has no free blocks', () => {
    const source = parseMemoryCard(loadFixture());
    const save = source.saves[0]!;
    // Occupy every frame so nothing is allocatable.
    const target = createEmptyCard();
    for (let i = 0; i < 15; i++) target[0x0080 + i * 0x80] = 0x51;

    const result = copySaveTo(target, source.bytes, save);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      'Target card does not have enough free blocks',
    );
  });

  it('deletes a save and leaves the others bit-identical', () => {
    const original = parseMemoryCard(loadFixture());
    const dino = original.saves.find((s) => !s.productCode.includes('ALUNDRA'))!;
    const alundra = original.saves.find((s) => s.productCode.includes('ALUNDRA'))!;

    const next = deleteSave(original.bytes, dino);
    const parsed = parseMemoryCard(next);

    expect(parsed.saves).toHaveLength(1);
    expect(parsed.saves[0]!.hash).toBe(alundra.hash);
    expect(parsed.freeBlocks).toBe(14);
    expect(parsed.saves.some((s) => s.productCode === dino.productCode)).toBe(false);
    expectDirectoryChecksumsValid(next);
  });

  it('moves a save between cards (copy to target, free in source)', () => {
    const source = parseMemoryCard(loadFixture());
    const alundra = source.saves.find((s) => s.productCode.includes('ALUNDRA'))!;
    const target = createEmptyCard();

    const res = moveSave(source.bytes, target, alundra);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const fromParsed = parseMemoryCard(res.from);
    const toParsed = parseMemoryCard(res.to);

    expect(fromParsed.saves).toHaveLength(1);
    expect(fromParsed.saves[0]!.productCode).not.toContain('ALUNDRA');
    expect(fromParsed.freeBlocks).toBe(14);

    expect(toParsed.saves).toHaveLength(1);
    expect(toParsed.saves[0]!.hash).toBe(alundra.hash);
    expectDirectoryChecksumsValid(res.from);
    expectDirectoryChecksumsValid(res.to);
  });

  it('reports the blocks a save occupies', () => {
    const source = parseMemoryCard(loadFixture());
    for (const save of source.saves) {
      expect(blocksNeeded(save)).toBe(Math.max(1, save.blocks.length));
    }
  });
});

// Regression for the reported bug: copying saves to another card produced a
// card whose block-0 frames had zeroed checksums, so the UI listed the saves
// but games could not detect them. `memcard_copy.mcd` is the broken output;
// `memcard_default.mcd` is the working source. Replaying the copy with the fix
// must yield a card whose every block-0 frame checksum is valid, while
// preserving the save set (product codes + data hashes).
describe('memory-card copy regression (ref fixtures)', () => {
  it('the buggy ref copy has invalid block-0 checksums (guard against regression)', () => {
    const buggy = loadRef('memcard_copy.mcd');
    const results = validateBlock0Checksums(buggy);
    const bad = results.filter((r) => !r.ok);
    // Header + every directory frame + broken-sector list are broken in the
    // buggy output; only the all-0xFF write-test sentinel happens to validate.
    expect(bad.length).toBeGreaterThan(0);
  });

  it('replaying the copy off the default card yields valid checksums + matching saves', () => {
    const source = parseMemoryCard(loadRef('memcard_default.mcd'));
    // The default card has 1-2 saves whose own checksums are already bad on
    // disc; only copy saves whose source directory frame is checksum-valid so
    // the data-hash comparison is meaningful.
    const valid = source.saves.filter((s) => {
      const off = 0x0080 + s.index * 0x80;
      const frame = source.bytes.subarray(off, off + 0x80);
      let x = 0;
      for (let i = 0; i < 0x7f; i++) x ^= frame[i]!;
      return (x & 0xff) === frame[0x7f];
    });
    expect(valid.length).toBeGreaterThan(0);

    let target = createEmptyCard();
    for (const save of valid) {
      const res = copySaveTo(target, source.bytes, save);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      target = res.card;
    }

    // Every block-0 frame must now carry a valid checksum.
    expectAllChecksumsValid(target);

    // Save set on the target matches the (valid) source saves.
    const parsed = parseMemoryCard(target);
    expect(parsed.saves).toHaveLength(valid.length);
    for (const save of valid) {
      const copy = parsed.saves.find((s) => s.productCode === save.productCode);
      expect(copy, `missing copied save ${save.productCode}`).toBeDefined();
      expect(copy!.hash).toBe(save.hash);
    }
  });
});
