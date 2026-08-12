# WS4 — `MemoryCardCloudStore` + cloud-aware `MemoryCardManager`

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** WS3.
**Unblocks:** WS5, WS6.

## Goal

Make the in-console Data Management feature cloud-aware: the card library is
backed by PocketBase records, mounting/ejecting persists the `mounted` field,
and library CRUD (create / import / rename / delete) writes through to the
cloud. The session-only in-memory model becomes a **cloud-backed** model with
a session-only fallback when unauthed. Also fix `hydrate()` so the editor
re-pulls live bytes from the emulator on dialog reopen (the "editor reloads
emulator changes" path).

This is the largest workstream: it introduces one new interface, one new impl
file, and rewrites the manager's library + mount/eject paths.

## Files

| File                                                          | Change                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/features/console/memcards/memoryCardCloudStore.ts`       | **NEW** — `MemoryCardCloudStore` interface + `MemoryCardCloudEntry` shape.                           |
| `src/features/console/services/psxAnywhereMemoryCardStore.ts` | **NEW** — impl over `psxAnywhereRepository`.                                                         |
| `src/features/console/memcards/memoryCardManager.ts`          | Cloud-aware: injected store, cloud-backed library, mount/eject/CRUD persist, `hydrate()` re-exports. |
| `src/features/console/memcards/memoryCardManager.test.ts`     | Add an in-memory `MemoryCardCloudStore` mock; cover cloud paths.                                     |
| `src/features/console/services/index.ts`                      | Export the new store (if a barrel is used).                                                          |

## Design

### `MemoryCardCloudStore` interface (`memoryCardCloudStore.ts`, new)

```ts
import type { MemorySlotNumber } from './memoryCardManager';

export type MountedSlot = 'slot1' | 'slot2' | null;

export interface MemoryCardCloudEntry {
  id: string; // PocketBase record id (stable across renames)
  label: string;
  bytes: Uint8Array | null; // null = not yet fetched (lazy); populated on demand
  mounted: MountedSlot;
  updated: string; // ISO timestamp of the cloud record
}

export interface MemoryCardCloudStore {
  /** List all of the user's cards (library). Bytes may be null until
   *  `fetchBytes` is called for a card; the host decides eager vs lazy. */
  list(userId: string): Promise<MemoryCardCloudEntry[]>;

  /** Fetch a card's bytes by id. Returns null if the card has no file. */
  fetchBytes(userId: string, id: string): Promise<Uint8Array | null>;

  /** Create a new card in the library. Returns the new entry (id assigned by PB). */
  create(
    userId: string,
    label: string,
    bytes?: Uint8Array,
    mounted?: MountedSlot,
  ): Promise<MemoryCardCloudEntry>;

  /** Rename a card. Safe on a mounted card (only label changes). */
  rename(id: string, label: string): Promise<void>;

  /** Delete an unmounted card. (Host enforces "not mounted"; store trusts caller.) */
  remove(id: string): Promise<void>;

  /** Set or clear a card's mounted slot, enforcing slot exclusivity (clears
   *  the previous occupant of that slot). slot=null unmounts. */
  setMounted(userId: string, id: string, slot: MountedSlot): Promise<void>;
}
```

### `PsxAnywhereMemoryCardStore` impl (`services/psxAnywhereMemoryCardStore.ts`, new)

Thin adapter over `psxAnywhereRepository`:

```ts
import { psxAnywhereRepository } from './psxAnywhereRepository';
import type {
  MemoryCardCloudEntry,
  MemoryCardCloudStore,
  MountedSlot,
} from '../memcards/memoryCardCloudStore';

export class PsxAnywhereMemoryCardStore implements MemoryCardCloudStore {
  async list(userId: string): Promise<MemoryCardCloudEntry[]> {
    const records = await psxAnywhereRepository.fetchMemcardsForUser(userId);
    return records.map((r) => ({
      id: r.id,
      label: r.label || 'Memory Card',
      bytes: null, // lazy; fetchBytes on demand
      mounted: r.mounted,
      updated: r.updated,
    }));
  }

  async fetchBytes(userId: string, id: string): Promise<Uint8Array | null> {
    // Resolve label via list (the vendored downloadMemcard is label-keyed).
    const entry = (await this.list(userId)).find((e) => e.id === id);
    if (!entry) return null;
    try {
      const { buf } = await psxAnywhereRepository.downloadMemcard(userId, entry.label);
      return new Uint8Array(buf);
    } catch {
      return null; // 404 / no file yet
    }
  }

  async create(userId, label, bytes?, mounted?): Promise<MemoryCardCloudEntry> {
    const r = await psxAnywhereRepository.createMemcard(userId, label, bytes, mounted ?? null);
    return {
      id: r.id,
      label: r.label,
      bytes: bytes ?? null,
      mounted: r.mounted,
      updated: new Date().toISOString(),
    };
  }

  async rename(id, label): Promise<void> {
    return psxAnywhereRepository.renameMemcard(id, label);
  }

  async remove(id): Promise<void> {
    return psxAnywhereRepository.deleteMemcard(id);
  }

  async setMounted(userId, id, slot): Promise<void> {
    return psxAnywhereRepository.setMemcardMounted(userId, id, slot);
  }
}
```

**Eager vs lazy bytes:** v1 fetches bytes eagerly in `list()` for mounted
cards only (so block counts render in the slot panes), and lazily for library
spares (block counts computed in `CardLibrarySheet.LibraryRow` via
`parseMemoryCard` once the user mounts). Concretely, after `list()`, the
manager calls `fetchBytes` for each mounted card before populating slot state.
This keeps the common path (open dialog → see mounted cards' contents) fast
without downloading every spare. If perf is fine, simplify to eager-all.

### `MemoryCardManager` changes (`memoryCardManager.ts`)

#### Constructor

```ts
export type SlotBinding = { id: string; label: string };

export class MemoryCardManager {
  constructor(
    private readonly emulator: EmulatorService,
    private readonly cloud?: MemoryCardCloudStore,
    private readonly onBindingChange?: (
      slot: MemorySlotNumber,
      binding: SlotBinding | null,
    ) => void,
  ) {}
  // ...
}
```

`cloud` and `onBindingChange` are optional so legacy tests and the unauthed
fallback keep working. WS5 constructs the singleton with both wired.

#### `MemoryLibraryCard` — id becomes the cloud id (when clouded)

```ts
export interface MemoryLibraryCard {
  id: string; // cloud record id when cloud-backed; UUID otherwise
  label: string;
  bytes: Uint8Array;
  mounted: MemorySlotNumber | null; // NEW: which slot this card is in
  cloud?: boolean; // NEW: marks cloud-backed entries
}
```

`MemoryManagerState.library` keeps the same shape; `mounted` is derived from
the cloud `mounted` field on hydrate and kept in sync on mount/eject.

#### `hydrate()` — cloud list + re-export both slots

Replace the null-only guard (`memoryCardManager.ts:84-102`) with:

```ts
async hydrate(userId?: string): Promise<void> {
  // 1. Cloud library (when authed + store present).
  if (userId && this.cloud) {
    try {
      const entries = await this.cloud.list(userId);
      // Fetch bytes for mounted cards (need them in-slot) + eagerly for the
      // library so block counts render. Spare cards may stay null until mount.
      const withBytes = await Promise.all(
        entries.map(async (e) => ({
          ...e,
          bytes: e.bytes ?? (await this.cloud!.fetchBytes(userId, e.id)),
        })),
      );
      this.store.setState({ library: withBytes.map(this.toLibraryCard) });

      // 2. Derive mount state from cloud `mounted` fields.
      const slot1Card = withBytes.find((e) => e.mounted === 'slot1');
      const slot2Card = withBytes.find((e) => e.mounted === 'slot2');
      this.store.setState((s) => ({
        slot1: slot1Card?.bytes ?? s.slot1,
        slot2: slot2Card?.bytes ?? s.slot2,
        mountId1: slot1Card?.id ?? s.mountId1,
        mountId2: slot2Card?.id ?? s.mountId2,
      }));
    } catch {
      // Cloud unavailable — fall through to live re-export.
    }
  }

  // 3. ALWAYS re-export both slots from the live core so game-written saves
  //    appear on dialog reopen. (The dialog is modal but the worker keeps
  //    running, so a save written while the dialog was closed is picked up
  //    here. Guard against clobbering a mid-edit: see "busy guard" below.)
  const live1 = await this.emulator.exportMemcard(1);
  const live2 = await this.emulator.exportMemcard(2);
  this.store.setState((s) => ({
    slot1: live1 ?? s.slot1,
    slot2: live2 ?? s.slot2,
    hydrated: true,
  }));
}
```

**Busy guard:** if a slot edit is in flight (`_push` running), do not clobber
that slot from the live export. Track a `_busySlots: Set<MemorySlotNumber>`
set in `_push` (enter on start, exit on settle); skip the re-export for busy
slots. This prevents an editor delete from being momentarily undone by a
stale export snapshot.

`hydrate` now takes `userId?`. The dialog (`MemoryManagerDialog.tsx:30`) passes
the current user id (read from the auth store). Update the call site in WS5.

#### `mountCard(slot, cardId)` — persist `mounted` + notify binding

```ts
async mountCard(slot: MemorySlotNumber, cardId: string, userId?: string): Promise<void> {
  const card = this.store.getState().library.find((c) => c.id === cardId);
  if (!card) return;
  const bytes = new Uint8Array(card.bytes);
  this._setSlot(slot, bytes, cardId);
  await this._push(slot, bytes);

  if (userId && this.cloud) {
    try {
      await this.cloud.setMounted(userId, cardId, this.slotKey(slot));
    } catch {
      // cloud failure: slot is mounted locally; surface via toast in the dialog
    }
  }
  this.onBindingChange?.(slot, { id: cardId, label: card.label });
}
```

`slotKey(slot): MountedSlot` returns `'slot1' | 'slot2'`.

#### `unmountCard(slot)` — clear `mounted` + notify unbind

```ts
async unmountCard(slot: MemorySlotNumber, userId?: string): Promise<void> {
  const bytes = this._getSlotBytes(slot);
  const mountId = this._mountOf(slot);
  if (mountId && bytes) {
    this.store.setState((s) => ({
      library: s.library.map((c) => (c.id === mountId ? { ...c, bytes: new Uint8Array(bytes) } : c)),
    }));
  }
  this._setSlot(slot, null, null);
  await this._push(slot, createEmptyCard());

  if (userId && mountId && this.cloud) {
    try { await this.cloud.setMounted(userId, mountId, null); } catch {}
  }
  this.onBindingChange?.(slot, null);
}
```

#### `createCard` / `importCard` — persist to cloud, use returned id

```ts
async createCard(label: string, userId?: string): Promise<MemoryLibraryCard> {
  const bytes = createEmptyCard();
  if (userId && this.cloud) {
    const entry = await this.cloud.create(userId, label.trim() || 'New Card', bytes);
    const card = { id: entry.id, label: entry.label, bytes, mounted: null, cloud: true };
    this.store.setState((s) => ({ library: [...s.library, card] }));
    return card;
  }
  // session-only fallback
  const card = { id: makeId(), label: label.trim() || 'New Card', bytes, mounted: null };
  this.store.setState((s) => ({ library: [...s.library, card] }));
  return card;
}
```

`importCard` mirrors this (passes the parsed bytes; `cloud.create`).

#### `renameCard` — persist + re-bind if mounted

```ts
renameCard(id: string, label: string, userId?: string): void {
  const trimmed = label.trim();
  this.store.setState((s) => ({
    library: s.library.map((c) => (c.id === id ? { ...c, label: trimmed || c.label } : c)),
  }));
  if (userId && this.cloud) {
    void this.cloud.rename(id, trimmed);
  }
  // If the renamed card is mounted, re-bind so the sync engine uploads under
  // the new label (the id is unchanged → rename-safe upsert in WS3).
  const s = this.store.getState();
  for (const slot of [1, 2] as const) {
    const mountId = slot === 1 ? s.mountId1 : s.mountId2;
    if (mountId === id) {
      this.onBindingChange?.(slot, { id, label: trimmed });
    }
  }
}
```

`renameCard` becomes sync again (it was sync before) but kicks off async cloud
work fire-and-forget. Tests can await via a flush.

#### `deleteCard` — persist (refuse if mounted, existing guard)

```ts
deleteCard(id: string, userId?: string): void {
  const s = this.store.getState();
  if (s.mountId1 === id || s.mountId2 === id) {
    throw new Error('Eject the card from its slot before removing it from the library');
  }
  this.store.setState((st) => ({ library: st.library.filter((c) => c.id !== id) }));
  if (userId && this.cloud) void this.cloud.remove(id);
}
```

#### `formatLibraryCard` — persist blank bytes (optional cloud write)

When the formatted card is a cloud spare, persist the blank image so the
format survives reload:

```ts
formatLibraryCard(id: string, userId?: string): void {
  const bytes = createEmptyCard();
  this.store.setState((s) => ({
    library: s.library.map((c) => (c.id === id ? { ...c, bytes } : c)),
  }));
  if (userId && this.cloud) {
    const card = this.store.getState().library.find((c) => c.id === id);
    if (card) void this.cloud.create(userId, card.label, bytes, card.mounted); // upsert by id? see note
  }
}
```

Note: `cloud.create` makes a new record. To update an existing card's bytes
outside the dirty-export path, add `cloud.updateBytes(id, bytes)` to the
interface (delegates to `repository.uploadMemcard(buf, userId, label, id)`).
Decide during implementation: simplest is `updateBytes(id, bytes)` on the
store + repository (label resolved from the library). Add it if spare-card
formatting must persist; otherwise leave spare formats session-only and
document.

#### Editor edits (delete save / copy / move / format slot) — no cloud change

These call `_push(slot, bytes)` → `emulator.importMemcard` → worker dirty poll
→ `memcard-exported` → `MemcardSync.onMemcardDirty` → cloud upload under the
slot's binding. **No new code here** beyond WS1's slot-2 fix. The binding
notified in `mountCard` is what makes the upload land on the right cloud card.

#### Singleton construction

At the bottom of `memoryCardManager.ts` (`:262`), the singleton is currently
constructed with only `emulatorService`. WS5 replaces this with a factory or
direct construction that injects the cloud store + binding callback. To keep
WS4 self-contained, export a `createMemoryCardManager(emulator, cloud?, onBindingChange?)`
factory and have WS5 call it; leave the default `memoryCardManager` export as
session-only for now (legacy tests). WS5 switches the export to the clouded
instance.

## `MemoryManagerDialog` — pass `userId` to manager calls

The dialog (`MemoryManagerDialog.tsx`) reads the auth user (it doesn't today).
Two options:

- **(a)** Read the user id from the auth store (`useAuth` / `pb.authStore.record.id`)
  in the dialog and pass it to every manager method. Verbose.
- **(b)** Store the user id on the manager once (via `manager.setUserId(id)` in
  WS5 on auth change) and have manager methods read it internally. Cleaner.

Recommend **(b)**: add `setUserId(id: string | null)` to the manager; all cloud
calls read `this._userId`. The dialog stays unchanged (calls `mountCard(slot,
id)` without a userId arg). WS5 owns calling `setUserId`.

## Tests

File: `src/features/console/memcards/memoryCardManager.test.ts`.

### New helper: in-memory cloud store

```ts
class InMemoryCloudStore implements MemoryCardCloudStore {
  records = new Map<string, { id: string; label: string; bytes: Uint8Array; mounted: MountedSlot }>();
  let id = 0;
  async list() { return [...this.records.values()]; }
  async fetchBytes(_, id) { return this.records.get(id)?.bytes ?? null; }
  async create(_u, label, bytes, mounted) {
    const id = `c${++this.id}`;
    const rec = { id, label, bytes: bytes ?? createEmptyCard(), mounted: mounted ?? null };
    this.records.set(id, rec); return { ...rec, updated: 'now' };
  }
  async rename(id, label) { const r = this.records.get(id); if (r) r.label = label; }
  async remove(id) { this.records.delete(id); }
  async setMounted(_u, id, slot) {
    if (slot) for (const r of this.records.values()) if (r.mounted === slot) r.mounted = null;
    const r = this.records.get(id); if (r) r.mounted = slot;
  }
}
```

### New coverage

- **Hydrate from cloud:** seed the store with a mounted slot1 card; call
  `hydrate(userId)`; assert `library` is populated and `mountId1` matches.
- **Hydrate re-exports live bytes:** import fixture bytes into the emulator;
  call `hydrate()`; assert slot bytes match the live export even when the
  manager already had prior bytes (clobber).
- **Mount writes `mounted` + fires binding:** `mountCard(1, id, userId)` →
  `cloud.setMounted(userId, id, 'slot1')` called; `onBindingChange` fired with
  `{id, label}`.
- **Mount clears previous occupant:** slot1 has card A; mount card B → store's
  `setMounted` clears A then sets B (the in-memory store enforces exclusivity;
  assert A's `mounted` is null).
- **Eject clears `mounted` + unbinds:** `unmountCard(1, userId)` →
  `cloud.setMounted(userId, id, null)`; `onBindingChange(1, null)`.
- **Create persists:** `createCard('X', userId)` → store has a new record with
  the returned cloud id (not a UUID); library row is `cloud: true`.
- **Rename persists + re-binds when mounted:** mount card, rename it →
  `cloud.rename` called; `onBindingChange` fired again with the new label.
- **Delete persists:** `deleteCard(id, userId)` → `cloud.remove(id)`.
- **Delete mounted refused:** the existing throw is preserved.
- **Unauthed fallback:** construct without a cloud store; mount/eject/create
  still work session-only; no cloud calls (assert no throw).
- **Busy guard:** (optional) while `_push` is pending, `hydrate()` does not
  clobber the busy slot.

## Verify (this workstream alone)

```sh
npm test -- memoryCardManager
npm run typecheck
npm run lint
```

The cloud store + manager unit tests must pass. No UI changes yet beyond
optionally passing `userId` (WS5 owns the singleton wiring).

## Out of scope for WS4

- Singleton wiring + `setUserId` caller (WS5).
- `EmulatorClient.setMemcardSlotBinding` consumption (WS5).
- `listMemoryCards` react-query hook returning `mounted` (WS5).
- Boot-timing localStorage cache (WS5).
- Live editor refresh during gameplay via `memcard-exported` (WS6 / future).
- `docs/emulator/memcard.md` updates (WS7).
