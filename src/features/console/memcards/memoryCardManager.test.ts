import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMemoryCard, type Save } from 'mcrreader';
import { MockEmulatorService } from '../services/emulator.mock';
import { MemoryCardManager } from './memoryCardManager';
import { createEmptyCard } from './mcrBlank';
import { deleteSave as deleteSaveFromCard } from './mcrWrite';

function loadFixture(): Uint8Array {
  return readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'pcsx-card1.mcr'));
}

function makeManager() {
  const emulator = new MockEmulatorService();
  const manager = new MemoryCardManager(emulator);
  return { emulator, manager };
}

describe('MemoryCardManager (in-memory)', () => {
  it('hydrates slot images from the running core', async () => {
    const { emulator, manager } = makeManager();
    const card = loadFixture();
    await emulator.importMemcard(1, card);

    await manager.hydrate();
    const state = manager.getState();
    expect(state.slot1).not.toBeNull();
    expect(parseMemoryCard(state.slot1!).saves).toHaveLength(2);
  });

  it('creates a parseable blank card in the library', async () => {
    const { manager } = makeManager();
    const card = await manager.createCard('RPG Card');
    const parsed = parseMemoryCard(card.bytes);
    expect(card.label).toBe('RPG Card');
    expect(parsed.saves).toHaveLength(0);
    expect(parsed.freeBlocks).toBe(15);
  });

  it('mounts a library card into a slot and pushes it to the core', async () => {
    const { emulator, manager } = makeManager();
    const card = await manager.createCard('Main Save');

    await manager.hydrate();
    await manager.mountCard(1, card.id);

    const state = manager.getState();
    expect(state.slot1).not.toBeNull();
    expect(state.mountId1).toBe(card.id);
    // The live core now serves the mounted card.
    const live = await emulator.exportMemcard(1);
    expect(live).not.toBeNull();
    expect(parseMemoryCard(live!).freeBlocks).toBe(15);
  });

  it('copies a save between slots', async () => {
    const { emulator, manager } = makeManager();
    await emulator.importMemcard(1, loadFixture());
    await emulator.importMemcard(2, createEmptyCard());
    await manager.hydrate();

    const source = parseMemoryCard(manager.getState().slot1!);
    const save: Save = source.saves[0]!;
    await manager.transferSave(1, 2, save, 'copy');

    const target = parseMemoryCard(manager.getState().slot2!);
    expect(target.saves).toHaveLength(1);
    expect(target.saves[0]!.hash).toBe(save.hash);
    // Source untouched.
    const sourceAfter = parseMemoryCard(manager.getState().slot1!);
    expect(sourceAfter.saves).toHaveLength(source.saves.length);
    // Live slot 2 reflects the transfer.
    const live2 = parseMemoryCard((await emulator.exportMemcard(2))!);
    expect(live2.saves).toHaveLength(1);
  });

  it('moves a save between slots (removes it from the source)', async () => {
    const { emulator, manager } = makeManager();
    const sourceBytes = loadFixture();
    const source = parseMemoryCard(sourceBytes);
    await emulator.importMemcard(1, sourceBytes);
    await emulator.importMemcard(2, createEmptyCard());
    await manager.hydrate();

    const save = source.saves[0]!;
    await manager.transferSave(1, 2, save, 'move');

    const fromAfter = parseMemoryCard(manager.getState().slot1!);
    const toAfter = parseMemoryCard(manager.getState().slot2!);
    expect(fromAfter.saves.some((s) => s.hash === save.hash)).toBe(false);
    expect(toAfter.saves.some((s) => s.hash === save.hash)).toBe(true);
    // Confirmed on the live side too.
    const live1 = parseMemoryCard((await emulator.exportMemcard(1))!);
    expect(live1.saves.some((s) => s.hash === save.hash)).toBe(false);
  });

  it('deletes a save from a slot', async () => {
    const { emulator, manager } = makeManager();
    const source = parseMemoryCard(loadFixture());
    await emulator.importMemcard(1, source.bytes);
    await manager.hydrate();

    await manager.deleteSave(1, source.saves[0]!);
    const after = parseMemoryCard(manager.getState().slot1!);
    expect(after.saves).toHaveLength(source.saves.length - 1);
  });

  it('ejects a card: writes slot bytes back to its library entry and empties the slot', async () => {
    const { emulator, manager } = makeManager();
    const lib = await manager.createCard('Main Save');
    // Put a real card into the slot, then treat it as "the mounted library card".
    await emulator.importMemcard(1, loadFixture());
    await manager.hydrate();
    await manager.mountCard(1, lib.id); // overwrite slot with library blank

    await manager.unmountCard(1);
    const state = manager.getState();
    expect(state.slot1).toBeNull();
    const entry = state.library.find((c) => c.id === lib.id)!;
    // The eject wrote the slot's last bytes (the mounted library blank) back.
    expect(parseMemoryCard(entry.bytes).freeBlocks).toBe(15);
  });

  it('refuses to delete a library card that is mounted', async () => {
    const { manager } = makeManager();
    const lib = await manager.createCard('Mounted');
    await manager.hydrate();
    await manager.mountCard(1, lib.id);
    expect(() => manager.deleteCard(lib.id)).toThrow(/Eject/);
  });

  it('formatSlot blanks a mounted slot', async () => {
    const { emulator, manager } = makeManager();
    await emulator.importMemcard(1, loadFixture());
    await manager.hydrate();
    expect(parseMemoryCard(manager.getState().slot1!).saves.length).toBeGreaterThan(0);

    await manager.formatSlot(1);
    const parsed = parseMemoryCard(manager.getState().slot1!);
    expect(parsed.saves).toHaveLength(0);
    expect(parsed.freeBlocks).toBe(15);
    expect(parseMemoryCard((await emulator.exportMemcard(1))!).saves).toHaveLength(0);
  });

  it('deleteCard removes an unmounted library entry', async () => {
    const { manager } = makeManager();
    const lib = await manager.createCard('Spare');
    manager.deleteCard(lib.id);
    expect(manager.getState().library.some((c) => c.id === lib.id)).toBe(false);
  });

  it('reuses deleteSaveFromCard helper consistently', () => {
    // sanity: card-level delete is what the manager delegates to
    const source = parseMemoryCard(loadFixture());
    const next = deleteSaveFromCard(source.bytes, source.saves[0]!);
    expect(parseMemoryCard(next).saves).toHaveLength(source.saves.length - 1);
  });
});
