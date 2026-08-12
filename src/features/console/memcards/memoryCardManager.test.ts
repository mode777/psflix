import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMemoryCard, type Save } from 'mcrreader';
import { MockEmulatorService } from '../services/emulator.mock';
import { MemoryCardManager } from './memoryCardManager';
import { createEmptyCard } from './mcrBlank';
import { deleteSave as deleteSaveFromCard } from './mcrWrite';
import type {
  MemoryCardCloudEntry,
  MemoryCardCloudStore,
  MountedSlot,
} from './memoryCardCloudStore';

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

// ── Cloud-aware paths (WS4) ──────────────────────────────────────────────

type CloudRecord = { id: string; label: string; bytes: Uint8Array; mounted: MountedSlot };

/** In-memory `MemoryCardCloudStore` with vi.fn spies + a `seed` helper. Mirrors
 *  the real store's lazy bytes (`list` returns bytes:null; `fetchBytes` fills). */
class InMemoryCloudStore implements MemoryCardCloudStore {
  records = new Map<string, CloudRecord>();
  private next = 0;

  seed(id: string, over: Partial<Omit<CloudRecord, 'id'>> = {}): void {
    this.records.set(id, {
      id,
      label: 'Card',
      bytes: createEmptyCard(),
      mounted: null,
      ...over,
    });
  }

  list = vi.fn(async (userId: string): Promise<MemoryCardCloudEntry[]> => {
    void userId;
    return [...this.records.values()].map((r) => ({
      id: r.id,
      label: r.label,
      bytes: null, // lazy; fetchBytes fills
      mounted: r.mounted,
      updated: '2024-01-01T00:00:00.000Z',
    }));
  });

  fetchBytes = vi.fn(async (_userId: string, id: string): Promise<Uint8Array | null> => {
    return this.records.get(id)?.bytes ?? null;
  });

  create = vi.fn(
    async (
      _userId: string,
      label: string,
      bytes?: Uint8Array,
      mounted?: MountedSlot,
    ): Promise<MemoryCardCloudEntry> => {
      const id = `c${++this.next}`;
      const rec: CloudRecord = {
        id,
        label,
        bytes: bytes ?? createEmptyCard(),
        mounted: mounted ?? null,
      };
      this.records.set(id, rec);
      return { ...rec, updated: 'now' };
    },
  );

  rename = vi.fn(async (id: string, label: string): Promise<void> => {
    const r = this.records.get(id);
    if (r) r.label = label;
  });

  remove = vi.fn(async (id: string): Promise<void> => {
    this.records.delete(id);
  });

  setMounted = vi.fn(async (_userId: string, id: string, slot: MountedSlot): Promise<void> => {
    if (slot) {
      for (const r of this.records.values()) {
        if (r.mounted === slot) r.mounted = null; // exclusivity
      }
    }
    const r = this.records.get(id);
    if (r) r.mounted = slot;
  });

  updateBytes = vi.fn(async (_userId: string, id: string, bytes: Uint8Array): Promise<void> => {
    const r = this.records.get(id);
    if (r) r.bytes = bytes;
  });
}

function makeCloudManager() {
  const emulator = new MockEmulatorService();
  const cloud = new InMemoryCloudStore();
  const onBindingChange = vi.fn();
  const manager = new MemoryCardManager(emulator, cloud, onBindingChange);
  manager.setUserId('u-1');
  return { emulator, cloud, onBindingChange, manager };
}

describe('MemoryCardManager (cloud-aware)', () => {
  it('hydrates the library + mount state from the cloud', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'RPG', mounted: 'slot1' });

    await manager.hydrate('u-1');
    const state = manager.getState();
    expect(state.library.map((c) => c.id)).toEqual(['c1']);
    expect(state.library[0]!.cloud).toBe(true);
    expect(state.library[0]!.mounted).toBe(1);
    expect(state.mountId1).toBe('c1');
  });

  it('hydrate re-exports live slot bytes so game-written saves appear', async () => {
    const { emulator, cloud, manager } = makeCloudManager();
    // Cloud says a blank card is mounted in slot 1.
    cloud.seed('c1', { label: 'Slot1', bytes: createEmptyCard(), mounted: 'slot1' });
    // But the live core has real saves written by the game.
    await emulator.importMemcard(1, loadFixture());

    await manager.hydrate('u-1');
    const slot1 = manager.getState().slot1!;
    expect(parseMemoryCard(slot1).saves.length).toBeGreaterThan(0);
  });

  it('hydrate seeds a slot from the library when the core has no card but the cloud has one mounted', async () => {
    const { emulator, cloud, manager } = makeCloudManager();
    emulator.__resetMemcards(); // guarantee the core has no card in slot 1
    // Cloud has a card with saves mounted in slot 1, but the running core is
    // empty (e.g. fresh boot before IDB is populated).
    cloud.seed('c1', { label: 'Mounted', bytes: loadFixture(), mounted: 'slot1' });
    expect(await emulator.exportMemcard(1)).toBeNull();

    await manager.hydrate('u-1');
    const state = manager.getState();
    // The slot is seeded from the library card so the UI reflects the mount.
    expect(state.slot1).not.toBeNull();
    expect(state.mountId1).toBe('c1');
    expect(parseMemoryCard(state.slot1!).saves.length).toBeGreaterThan(0);
  });

  it('refreshLibrary seeds an empty slot when the cloud mounts a card there', async () => {
    const { emulator, cloud, manager } = makeCloudManager();
    emulator.__resetMemcards(); // guarantee both slots start empty
    // Start with no cloud cards; hydrate leaves both slots empty.
    await manager.hydrate('u-1');
    expect(manager.getState().slot1).toBeNull();

    // Cross-device: a card with saves is now mounted in slot 1.
    cloud.seed('c1', { label: 'Newly Mounted', bytes: loadFixture(), mounted: 'slot1' });
    await manager.refreshLibrary('u-1');
    const state = manager.getState();
    expect(state.mountId1).toBe('c1');
    // Empty slot is seeded from the library for display (no core push).
    expect(state.slot1).not.toBeNull();
    expect(parseMemoryCard(state.slot1!).saves.length).toBeGreaterThan(0);
  });

  it('mountCard persists mounted and fires onBindingChange', async () => {
    const { cloud, onBindingChange, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Main' });
    await manager.hydrate('u-1');

    await manager.mountCard(1, 'c1');
    expect(cloud.setMounted).toHaveBeenCalledWith('u-1', 'c1', 'slot1');
    expect(onBindingChange).toHaveBeenCalledWith(1, { id: 'c1', label: 'Main' });
  });

  it('mountCard clears the previous occupant of the slot', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('a', { label: 'A', mounted: 'slot1' });
    cloud.seed('b', { label: 'B' });
    await manager.hydrate('u-1');

    await manager.mountCard(1, 'b');
    expect(cloud.records.get('a')!.mounted).toBeNull();
    expect(cloud.records.get('b')!.mounted).toBe('slot1');
  });

  it('unmountCard clears mounted and unbinds', async () => {
    const { cloud, onBindingChange, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Main', mounted: 'slot1' });
    await manager.hydrate('u-1');

    await manager.unmountCard(1);
    expect(cloud.setMounted).toHaveBeenCalledWith('u-1', 'c1', null);
    expect(onBindingChange).toHaveBeenCalledWith(1, null);
    expect(manager.getState().mountId1).toBeNull();
  });

  it('createCard persists to the cloud and uses the returned id', async () => {
    const { cloud, manager } = makeCloudManager();
    const card = await manager.createCard('RPG');
    expect(cloud.create).toHaveBeenCalledWith('u-1', 'RPG', expect.any(Uint8Array));
    expect(card.cloud).toBe(true);
    // The id comes from the cloud (not a local UUID).
    expect(cloud.records.has(card.id)).toBe(true);
    expect(manager.getState().library.some((c) => c.id === card.id)).toBe(true);
  });

  it('importCard persists parsed bytes to the cloud', async () => {
    const { cloud, manager } = makeCloudManager();
    const fixture = loadFixture();
    const card = await manager.importCard(fixture, 'Imported');
    expect(cloud.create).toHaveBeenCalledWith('u-1', 'Imported', expect.any(Uint8Array));
    expect(card.cloud).toBe(true);
    expect(cloud.records.get(card.id)!.bytes).not.toBeNull();
  });

  describe('ensureDefaultCard', () => {
    it('creates + mounts a default card when the library is empty', async () => {
      const { cloud, onBindingChange, manager } = makeCloudManager();
      await manager.ensureDefaultCard(1);

      expect(cloud.create).toHaveBeenCalledWith('u-1', 'default', expect.any(Uint8Array));
      // The returned cloud id is used (not a session UUID).
      const lib = manager.getState().library;
      expect(lib).toHaveLength(1);
      expect(lib[0]!.label).toBe('default');
      expect(lib[0]!.cloud).toBe(true);
      expect(lib[0]!.mounted).toBe(1);
      // Mounted into slot 1 in the cloud + binding notified.
      expect(cloud.setMounted).toHaveBeenCalledWith('u-1', lib[0]!.id, 'slot1');
      expect(onBindingChange).toHaveBeenCalledWith(1, { id: lib[0]!.id, label: 'default' });
    });

    it('is a no-op when the library is already non-empty', async () => {
      const { cloud, manager } = makeCloudManager();
      cloud.seed('c1', { label: 'Existing' });
      await manager.hydrate('u-1');

      await manager.ensureDefaultCard(1);
      expect(cloud.create).not.toHaveBeenCalled();
    });

    it('does nothing when unauthed (no cloud path)', async () => {
      const emulator = new MockEmulatorService();
      const cloud = new InMemoryCloudStore();
      const manager = new MemoryCardManager(emulator, cloud);
      // _userId never set → cloud path inactive.
      await manager.ensureDefaultCard(1);
      expect(cloud.create).not.toHaveBeenCalled();
      expect(manager.getState().library).toHaveLength(0);
    });
  });

  it('renameCard persists and re-binds when the card is mounted', async () => {
    const { cloud, onBindingChange, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Old' });
    await manager.hydrate('u-1');
    await manager.mountCard(1, 'c1');
    onBindingChange.mockClear();

    manager.renameCard('c1', 'New');
    expect(cloud.rename).toHaveBeenCalledWith('c1', 'New');
    expect(onBindingChange).toHaveBeenCalledWith(1, { id: 'c1', label: 'New' });
  });

  it('deleteCard removes the card from the cloud', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Spare' });
    await manager.hydrate('u-1');

    manager.deleteCard('c1');
    expect(cloud.remove).toHaveBeenCalledWith('c1');
  });

  it('deleteCard refuses a mounted card (and does not call the cloud)', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Mounted', mounted: 'slot1' });
    await manager.hydrate('u-1');

    expect(() => manager.deleteCard('c1')).toThrow(/Eject/);
    expect(cloud.remove).not.toHaveBeenCalled();
  });

  it('formatLibraryCard persists blank bytes for a cloud spare', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Spare' });
    await manager.hydrate('u-1');

    manager.formatLibraryCard('c1');
    expect(cloud.updateBytes).toHaveBeenCalledWith('u-1', 'c1', expect.any(Uint8Array));
    const persisted = cloud.records.get('c1')!.bytes;
    expect(parseMemoryCard(persisted).freeBlocks).toBe(15);
  });

  it('works session-only without a cloud store (no throws, no cloud calls)', async () => {
    const emulator = new MockEmulatorService();
    const manager = new MemoryCardManager(emulator); // no cloud
    const card = await manager.createCard('Spare');
    expect(card.cloud).toBeUndefined();

    await manager.mountCard(1, card.id);
    expect(manager.getState().mountId1).toBe(card.id);
    await manager.unmountCard(1);
    expect(manager.getState().mountId1).toBeNull();
  });

  it('hydrate skips a slot with an in-flight editor push (busy guard)', async () => {
    const emulator = new MockEmulatorService();
    let resolveImport: () => void = () => {};
    const importOrig = emulator.importMemcard.bind(emulator);
    emulator.importMemcard = async (slot, buf) => {
      if (slot === 1)
        await new Promise<void>((r) => {
          resolveImport = r;
        });
      return importOrig(slot, buf);
    };
    const exportSpy = vi.spyOn(emulator, 'exportMemcard');
    const manager = new MemoryCardManager(emulator);
    const card = await manager.createCard('Main');

    // Start a mount whose push hangs on slot 1 (do not await yet).
    const mountP = manager.mountCard(1, card.id);
    await Promise.resolve(); // let the synchronous part of mountCard run

    await manager.hydrate();
    const exportedSlots = exportSpy.mock.calls.map((c) => c[0]);
    expect(exportedSlots).not.toContain(1);

    resolveImport();
    await mountP;

    // After the push settles, a subsequent hydrate re-exports slot 1 and
    // reflects the bytes the edit pushed.
    exportSpy.mockClear();
    await manager.hydrate();
    expect(exportSpy.mock.calls.map((c) => c[0])).toContain(1);
    const slot1 = manager.getState().slot1!;
    expect(parseMemoryCard(slot1).freeBlocks).toBe(15);
  });

  it('hydrate clobbers stale slot bytes with a fresh live re-export', async () => {
    const { emulator, manager } = makeManager();
    // Seed the core with real saves; hydrate picks them up.
    await emulator.importMemcard(1, loadFixture());
    await manager.hydrate();
    const stale = manager.getState().slot1!;
    expect(parseMemoryCard(stale).saves.length).toBeGreaterThan(0);

    // Simulate a game-written save: the core now serves a blank card.
    await emulator.importMemcard(1, createEmptyCard());

    await manager.hydrate();
    const fresh = manager.getState().slot1!;
    expect(parseMemoryCard(fresh).saves).toHaveLength(0);
  });

  // ── refreshLibrary (WS6) ──────────────────────────────────────────────

  it('refreshLibrary updates library + mountId but does NOT touch slot bytes', async () => {
    const { emulator, cloud, manager } = makeCloudManager();
    // Seed slot 1 with live bytes A (fixture with saves).
    await emulator.importMemcard(1, loadFixture());
    await manager.hydrate('u-1');
    expect(parseMemoryCard(manager.getState().slot1!).saves.length).toBeGreaterThan(0);

    // Cloud returns a blank card mounted in slot 1 with bytes B.
    cloud.seed('c1', { label: 'Cloud Card', bytes: createEmptyCard(), mounted: 'slot1' });

    await manager.refreshLibrary('u-1');
    const state = manager.getState();
    // Library + mountId updated from the cloud.
    expect(state.library.map((c) => c.id)).toEqual(['c1']);
    expect(state.mountId1).toBe('c1');
    // Slot bytes unchanged (apply-on-next-boot) — still has the fixture's
    // saves, not the blank cloud card.
    expect(parseMemoryCard(state.slot1!).saves.length).toBeGreaterThan(0);
  });

  it('refreshLibrary updates mounted markers when the cloud flips a card slot', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Card', mounted: 'slot1' });
    await manager.hydrate('u-1');
    expect(manager.getState().mountId1).toBe('c1');
    expect(manager.getState().mountId2).toBeNull();

    // Another device moved the card from slot 1 → slot 2.
    cloud.records.get('c1')!.mounted = 'slot2';
    await manager.refreshLibrary('u-1');
    const state = manager.getState();
    expect(state.mountId1).toBeNull();
    expect(state.mountId2).toBe('c1');
    // The library row reflects the new mount.
    expect(state.library.find((c) => c.id === 'c1')!.mounted).toBe(2);
  });

  it('refreshLibrary is a no-op without a cloud store', async () => {
    const emulator = new MockEmulatorService();
    const manager = new MemoryCardManager(emulator); // no cloud
    await emulator.importMemcard(1, loadFixture());
    await manager.hydrate();
    const before = manager.getState().slot1;
    // Should not throw and should not change slot bytes.
    await manager.refreshLibrary('u-1');
    expect(manager.getState().slot1).toBe(before);
  });

  it('refreshLibrary leaves the library as-is when the cloud throws', async () => {
    const { cloud, manager } = makeCloudManager();
    cloud.seed('c1', { label: 'Original' });
    await manager.hydrate('u-1');
    expect(manager.getState().library).toHaveLength(1);

    cloud.list.mockRejectedValueOnce(new Error('network'));
    await manager.refreshLibrary('u-1');
    // Library unchanged — the catch block preserves existing state.
    expect(manager.getState().library).toHaveLength(1);
  });
});
