import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMemoryCard } from 'mcrreader';
import { createEmptyCard, formatCard } from './mcrBlank';
import { blocksNeeded, copySaveTo, deleteSave, moveSave } from './mcrWrite';

function loadFixture(): Uint8Array {
  return readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'pcsx-card1.mcr'));
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
  });

  it('reports the blocks a save occupies', () => {
    const source = parseMemoryCard(loadFixture());
    for (const save of source.saves) {
      expect(blocksNeeded(save)).toBe(Math.max(1, save.blocks.length));
    }
  });
});
