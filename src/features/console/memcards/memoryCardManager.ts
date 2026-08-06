// In-memory memory card manager.
//
// Session-only by design: all card images (the two emulator slots + a card
// library) live in a zustand store and are wiped on reload. Nothing is written
// to IDB or the cloud here. The manager reads current slot bytes from the
// running core and pushes changes back into it (`importMemcard`) so the game
// sees mounted / transferred / edited cards immediately; the facade's own
// persistence is untouched and will be reconciled to this feature in a later
// pass.

import { create } from 'zustand';
import type { MemoryCard, Save } from 'mcrreader';
import { parseMemoryCard } from 'mcrreader';
import { emulatorService } from '../services';
import type { EmulatorService } from '../services/emulator';
import { createEmptyCard } from './mcrBlank';
import {
  copySaveTo,
  deleteSave as deleteSaveFromCard,
  moveSave as moveSaveBetweenCards,
} from './mcrWrite';

export type MemorySlotNumber = 1 | 2;

export interface MemoryLibraryCard {
  id: string;
  label: string;
  bytes: Uint8Array;
}

export interface MemoryManagerSlotView {
  slot: MemorySlotNumber;
  bytes: Uint8Array;
  parsed: MemoryCard;
  /** Library card mounted into this slot, if any. */
  libraryId: string | null;
}

export interface MemoryManagerView {
  slot1: MemoryManagerSlotView | null;
  slot2: MemoryManagerSlotView | null;
  library: MemoryLibraryCard[];
  hydrated: boolean;
}

type MemoryManagerState = {
  slot1: Uint8Array | null;
  slot2: Uint8Array | null;
  mountId1: string | null;
  mountId2: string | null;
  library: MemoryLibraryCard[];
  hydrated: boolean;
};

let idCounter = 0;
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mc-${Date.now().toString(36)}-${++idCounter}`;
}

export class MemoryCardManager {
  private readonly store = create<MemoryManagerState>(() => ({
    slot1: null,
    slot2: null,
    mountId1: null,
    mountId2: null,
    library: [],
    hydrated: false,
  }));

  constructor(private readonly emulator: EmulatorService) {}

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);
  getState = (): MemoryManagerState => this.store.getState();

  /**
   * Pull the current slot images out of the live core. Only *null* slots are
   * fetched (in-memory edits to a mounted slot are never clobbered), so this is
   * safe to re-run whenever the manager dialog opens — e.g. before the core has
   * booted. Sets `hydrated` once a pass has been attempted.
   */
  async hydrate(): Promise<void> {
    const state = this.store.getState();
    const missing = ([1, 2] as const).filter((n) =>
      n === 1 ? state.slot1 === null : state.slot2 === null,
    );
    if (missing.length === 0) {
      this.store.setState({ hydrated: true });
      return;
    }
    const results = await Promise.all(missing.map((n) => this.emulator.exportMemcard(n)));
    this.store.setState((s) => {
      const patch: Partial<MemoryManagerState> = { hydrated: true };
      missing.forEach((n, i) => {
        const key = n === 1 ? 'slot1' : 'slot2';
        if (s[key] === null) patch[key] = results[i] ?? null;
      });
      return patch;
    });
  }

  // ── Card library ────────────────────────────────────────────────────

  async createCard(label: string): Promise<MemoryLibraryCard> {
    const card: MemoryLibraryCard = {
      id: makeId(),
      label: label.trim() || 'New Card',
      bytes: createEmptyCard(),
    };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    return card;
  }

  async importCard(buf: ArrayBuffer | Uint8Array, label?: string): Promise<MemoryLibraryCard> {
    const bytes = buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(buf);
    parseMemoryCard(bytes); // throws on invalid images
    const card: MemoryLibraryCard = {
      id: makeId(),
      label: label?.trim() || 'Imported Card',
      bytes,
    };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    return card;
  }

  renameCard(id: string, label: string): void {
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === id ? { ...c, label: label.trim() || c.label } : c)),
    }));
  }

  deleteCard(id: string): void {
    const s = this.store.getState();
    if (s.mountId1 === id || s.mountId2 === id) {
      throw new Error('Eject the card from its slot before removing it from the library');
    }
    this.store.setState((st) => ({
      library: st.library.filter((c) => c.id !== id),
    }));
  }

  formatLibraryCard(id: string): void {
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === id ? { ...c, bytes: createEmptyCard() } : c)),
    }));
  }

  // ── Slots ───────────────────────────────────────────────────────────

  private _getSlotBytes(slot: MemorySlotNumber): Uint8Array | null {
    const s = this.store.getState();
    return slot === 1 ? s.slot1 : s.slot2;
  }

  private _mountOf(slot: MemorySlotNumber): string | null {
    const s = this.store.getState();
    return slot === 1 ? s.mountId1 : s.mountId2;
  }

  private _setSlot(slot: MemorySlotNumber, bytes: Uint8Array | null, mountId: string | null): void {
    const key = slot === 1 ? 'slot1' : 'slot2';
    const mountKey = slot === 1 ? 'mountId1' : 'mountId2';
    this.store.setState(
      () =>
        ({
          [key]: bytes,
          [mountKey]: mountId,
        }) as Partial<MemoryManagerState>,
    );
  }

  async mountCard(slot: MemorySlotNumber, cardId: string): Promise<void> {
    const card = this.store.getState().library.find((c) => c.id === cardId);
    if (!card) return;
    const bytes = new Uint8Array(card.bytes);
    this._setSlot(slot, bytes, cardId);
    await this._push(slot, bytes);
  }

  /** Eject a card from a slot: write its live bytes back into the library
   *  entry, empty the slot, and mount a blank card so the running core no
   *  longer plays the ejected card. */
  async unmountCard(slot: MemorySlotNumber): Promise<void> {
    const bytes = this._getSlotBytes(slot);
    const mountId = this._mountOf(slot);

    if (mountId && bytes) {
      this.store.setState((s) => ({
        library: s.library.map((c) =>
          c.id === mountId ? { ...c, bytes: new Uint8Array(bytes) } : c,
        ),
      }));
    }
    this._setSlot(slot, null, null);
    await this._push(slot, createEmptyCard());
  }

  async formatSlot(slot: MemorySlotNumber): Promise<void> {
    const bytes = createEmptyCard();
    this._setSlot(slot, bytes, this._mountOf(slot));
    await this._push(slot, bytes);
  }

  // ── Save-level operations ───────────────────────────────────────────

  private _requireSlotBytes(slot: MemorySlotNumber): Uint8Array {
    const bytes = this._getSlotBytes(slot);
    if (!bytes) throw new Error(`Slot ${slot} has no card mounted`);
    return bytes;
  }

  async deleteSave(slot: MemorySlotNumber, save: Save): Promise<void> {
    const current = this._requireSlotBytes(slot);
    const next = deleteSaveFromCard(current, save);
    this._setSlot(slot, next, this._mountOf(slot));
    await this._push(slot, next);
  }

  /**
   * Copy or move a save between the two slots. Throws when the target lacks
   * free blocks. Both slot images are replaced in place.
   */
  async transferSave(
    from: MemorySlotNumber,
    to: MemorySlotNumber,
    save: Save,
    mode: 'copy' | 'move',
  ): Promise<void> {
    if (from === to) return;
    const fromBytes = this._requireSlotBytes(from);
    const toBytes = this._requireSlotBytes(to);

    if (mode === 'move') {
      const result = moveSaveBetweenCards(fromBytes, toBytes, save);
      if (!result.ok) throw new Error(result.error);
      this._setSlot(to, result.to, this._mountOf(to));
      this._setSlot(from, result.from, this._mountOf(from));
      await Promise.all([this._push(from, result.from), this._push(to, result.to)]);
      return;
    }

    const copied = copySaveTo(toBytes, fromBytes, save);
    if (!copied.ok) throw new Error(copied.error);
    this._setSlot(to, copied.card, this._mountOf(to));
    await this._push(to, copied.card);
  }

  /** Push new slot bytes into the live core; never fatal — the in-memory card
   *  stays authoritative for this session even if the core is busy/absent. */
  private async _push(slot: MemorySlotNumber, bytes: Uint8Array): Promise<void> {
    try {
      await this.emulator.importMemcard(slot, bytes);
    } catch {
      // session-only: keep the in-memory card
    }
  }
}

// Singleton consumed by the console view + hooks.
export const memoryCardManager = new MemoryCardManager(emulatorService);
