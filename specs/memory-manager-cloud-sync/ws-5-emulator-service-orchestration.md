# WS5 — `EmulatorService`: orchestrate bindings + boot timing

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** WS2, WS4.
**Unblocks:** WS6.

## Goal

Wire the cloud-aware `MemoryCardManager` (WS4) to the vendored facade (WS2):
register the binding callback, set initial slot bindings from a localStorage
cache before boot so the worker's `memcard-load-request` downloads the right
cards, reconcile bindings against the cloud on auth, and make
`listMemoryCards` return cloud records with `mounted` and real block counts.

This is the integration layer: it owns the timing that makes "cloud cards
appear at boot" and "auth → both slots sync" work without races.

## Files

| File                                                          | Change                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/console/services/psxAnywhereEmulatorService.ts` | Own the cloud store; register binding callback; boot-time binding cache; auth reconcile; `listMemoryCards` returns `mounted` + blocks. |
| `src/features/console/services/emulator.ts`                   | `MemoryCardInfo` += `mounted`; `setMemorySlot` deprecated/removed.                                                                     |
| `src/features/console/types.ts`                               | `MemoryCardInfo` += `mounted` (if the interface lives here, not `emulator.ts`).                                                        |
| `src/features/console/memcards/memoryCardManager.ts`          | Singleton construction switches to the clouded factory (from WS4).                                                                     |
| `src/features/console/hooks/useMemoryCards.ts`                | (Unchanged, but now has a live consumer — verify.)                                                                                     |
| `tests/console/services/psxAnywhereEmulatorService.test.ts`   | Binding wiring, boot reads cache, auth reconcile, listMemoryCards.                                                                     |

## Design

### Own the cloud store + register the binding callback

The `memoryCardManager` singleton (constructed in WS4) takes
`(emulatorService, cloud?, onBindingChange?)`. WS5 constructs it with:

```ts
import { PsxAnywhereMemoryCardStore } from './psxAnywhereMemoryCardStore';
import type { MemoryCardCloudStore, SlotBinding } from '../memcards/memoryCardCloudStore';

// Inside PsxAnywhereEmulatorService (or a small wiring module the service owns):
const cloudStore = new PsxAnywhereMemoryCardStore();

const onBindingChange = (slot: MemorySlotNumber, binding: SlotBinding | null) => {
  this._client?.setMemcardSlotBinding(slot, binding);
  this._persistBindingCache(slot, binding); // update localStorage
};

// Re-exported singleton consumed by the dialog + hooks.
export const memoryCardManager = createMemoryCardManager(
  emulatorService,
  cloudStore,
  onBindingChange,
);
```

(The exact export site: today `memoryCardManager` is constructed at
`memoryCardManager.ts:262`. WS4 introduces the factory; WS5 flips the default
export to the clouded instance. Keep the legacy session-only path available
for tests by exporting the factory.)

### Boot-time binding cache (the anti-race piece)

The worker fires `memcard-load-request` during `boot()` →
`EmulatorClient._onMemcardLoadRequest` → `_memcardSync.ensureDownloaded()`
→ `syncNow()` downloads **bound** slots. For the download to fetch the right
cards, the bindings must be set **before** `client.boot()` runs.

The `psflix:memcard-slots:<userId>` localStorage key (currently orphaned,
`psxAnywhereEmulatorService.ts:24`) is repurposed to cache the latest bindings
per user, read synchronously at `attachCanvas`:

```ts
type CachedBinding = { id: string; label: string } | null;
type SlotCache = { slot1: CachedBinding; slot2: CachedBinding };

function loadBindingCache(userId: string): SlotCache {
  try {
    const raw = localStorage.getItem(`psflix:memcard-slots:${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { slot1: null, slot2: null };
}

function saveBindingCache(userId: string, cache: SlotCache): void {
  try {
    localStorage.setItem(`psflix:memcard-slots:${userId}`, JSON.stringify(cache));
  } catch {}
}
```

In `attachCanvas` (`:157-177`), after constructing the client but **before**
`await client.boot()`:

```ts
const userId = psxAnywhereRepository.getCurrentUserId();
if (userId) {
  const cache = loadBindingCache(userId);
  client.setMemcardSlotBinding(1, cache.slot1);
  client.setMemcardSlotBinding(2, cache.slot2);
}
await client.boot();
```

`_persistBindingCache(slot, binding)` (called from `onBindingChange`) updates
the cache entry for the current user and writes it back. This keeps the cache
fresh as the user mounts/ejects/renames during a session.

### Auth reconcile

On `auth-change` (wired at `:252-255`) and on `memcard-sync-complete`
(`:248-251`), the cloud is authoritative for `mounted`. Reconcile:

```ts
private async _reconcileMemoryCards(userId: string): Promise<void> {
  if (!this._client) return;
  // 1. Refresh the manager's library + slot bytes from cloud + live export.
  memoryCardManager.setUserId(userId);
  await memoryCardManager.hydrate(userId);

  // 2. Re-derive bindings from the refreshed `mounted` fields and push to the
  //    sync engine (cloud is authoritative; localStorage cache follows).
  const lib = memoryCardManager.getState().library;
  const bind = (slot: MemorySlotNumber, mounted: 'slot1' | 'slot2') => {
    const card = lib.find((c) => c.mounted === mounted);
    const binding = card ? { id: card.id, label: card.label } : null;
    this._client?.setMemcardSlotBinding(slot, binding);
    this._persistBindingCache(slot, binding);
  };
  bind(1, 'slot1');
  bind(2, 'slot2');

  // 3. Trigger a download pass so both mounted cards' bytes land in IDB for
  //    the next boot (apply-on-next-boot decision).
  await this._client.syncMemcards();

  // 4. Invalidate the react-query list so any subscriber (useMemoryCards)
  //    re-fetches with the new mounted/block data.
  queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
}
```

Wire `_reconcileMemoryCards` into the existing `auth-change` and
`memcard-sync-complete` handlers (it replaces/augments the bare invalidation
at `:241` and `:250`). Guard against concurrent runs (a `_reconciling` flag or
debounce) so a rapid auth toggle does not stack reconcile passes.

**Sign-out:** on `auth-change(authed=false)`, clear the bindings
(`setMemcardSlotBinding(1/2, null)`), call `memoryCardManager.setUserId(null)`.
The library falls back to session-only; the next sign-in re-hydrates.

### `listMemoryCards` — return `mounted` + real block counts

`psxAnywhereEmulatorService.ts:508-525` today maps cloud records to
`MemoryCardInfo` with `usedBlocks: 0` (stubbed). Update:

```ts
async listMemoryCards(userId: string): Promise<MemoryCardInfo[]> {
  if (!psxAnywhereRepository.isAuthenticated()) return [];
  try {
    const records = await psxAnywhereRepository.fetchMemcardsForUser(userId);
    const out: MemoryCardInfo[] = [];
    for (const r of records) {
      let usedBlocks = 0;
      let totalBlocks = 15;
      try {
        const { buf } = await psxAnywhereRepository.downloadMemcard(userId, r.label);
        const parsed = parseMemoryCard(new Uint8Array(buf));
        usedBlocks = parsed.totalBlocks - parsed.freeBlocks;
        totalBlocks = parsed.totalBlocks;
      } catch { /* leave defaults */ }
      out.push({
        id: r.id,
        label: r.label || 'Memory Card',
        usedBlocks,
        totalBlocks,
        mounted: r.mounted,
      });
    }
    return out;
  } catch {
    return [];
  }
}
```

`parseMemoryCard` comes from `mcrreader` (already a dep). Eager byte fetch per
card is acceptable for v1 (decision: documented perf trade-off). If the
`data` file is missing (spare card never saved), `downloadMemcard` throws and
the defaults remain.

### Type changes

`MemoryCardInfo` (`src/features/console/types.ts:32-40` or
`services/emulator.ts` — confirm location):

```ts
export interface MemoryCardInfo {
  id: string;
  label: string;
  usedBlocks: number;
  totalBlocks: number;
  mounted: 'slot1' | 'slot2' | null; // NEW
}
```

`MemorySlotAssignment` + `getMemorySlotAssignment` / `setMemorySlot` /
`subscribeMemorySlots` / the `psflix:memcard-slots` localStorage key in its
current `{slot1: cardId, slot2: cardId}` form: **superseded** by the binding
cache. Either:

- **(a)** Remove `getMemorySlotAssignment`/`setMemorySlot`/`subscribeMemorySlots`
  from the `EmulatorService` interface and delete `useMemorySlotAssignment`
  (the orphaned hook). Repurpose the localStorage key to the binding cache
  shape (above). Cleanest.
- **(b)** Keep the methods as deprecated wrappers that read/write the cache.
  Less churn but leaves dead surface.

Recommend **(a)**: the slot assignment is now expressed via `mounted` on the
cloud records + the binding cache, not a separate `{slot1, slot2}` map. Update
the few test references (`tests/console/services/psxAnywhereEmulatorService.test.ts:165-167`,
`tests/console/hooks/consoleHooks.test.tsx`) to the new model. The
`useMemorySlotAssignment` hook is unused in the UI (per the analysis), so it
can be deleted outright.

### Singleton wiring summary

- `memoryCardManager` is constructed once with `(emulatorService, cloudStore, onBindingChange)`.
- `EmulatorService.attachCanvas` reads the binding cache and calls
  `client.setMemcardSlotBinding` for both slots before `boot()`.
- `EmulatorService` owns `_reconcileMemoryCards`, invoked on `auth-change`
  (authed) and `memcard-sync-complete`.
- `memoryCardManager.setUserId(id|null)` is called from reconcile + on
  sign-out, so the manager knows whether to use cloud paths.

## Tests

File: `tests/console/services/psxAnywhereEmulatorService.test.ts`.

### New coverage

- **Binding callback wired:** constructing the service + manager registers
  `onBindingChange`; calling it invokes `client.setMemcardSlotBinding` (mock
  the client).
- **Boot reads cache:** seed localStorage `psflix:memcard-slots:<userId>` with
  bindings; `attachCanvas` calls `setMemcardSlotBinding(1, …)` and `(2, …)`
  **before** `client.boot()` (assert call order).
- **Auth reconcile:** simulate `auth-change(authed=true)` →
  `memoryCardManager.hydrate` is called; bindings re-derived from the
  (mocked) library's `mounted` fields; `client.syncMemcards()` called;
  `['memory-cards']` invalidated.
- **Auth reconcile cloud-authoritative:** localStorage says slot1=A, but the
  cloud library (mocked) says slot1=B → reconcile sets binding to B
  (cloud wins) and updates the cache.
- **Sign-out clears bindings:** `auth-change(authed=false)` →
  `setMemcardSlotBinding(1/2, null)`; `memoryCardManager.setUserId(null)`.
- **`listMemoryCards` returns mounted + blocks:** mock `fetchMemcardsForUser`
  - `downloadMemcard` returning fixture bytes; assert `usedBlocks` is computed
    from `parseMemoryCard` and `mounted` is passed through.
- **Debounce on rapid auth toggle:** two `auth-change(true)` events in quick
  succession → reconcile runs once (or N times without throwing; document the
  chosen behavior).

Update existing tests that reference `getMemorySlotAssignment`/`setMemorySlot`
(recommended deletion path (a)): remove those assertions; replace with
binding-cache assertions.

## Verify (this workstream alone)

```sh
npm test -- psxAnywhereEmulatorService
npm run typecheck
npm run lint
```

End-to-end smoke (manual, dev):

1. Sign in on a fresh browser. Open Data Management. Library is empty.
2. Initialize "Slot 1 Card", mount into slot 1. Inspect localStorage
   `psflix:memcard-slots:<userId>` → `slot1` binding present.
3. Reload the page → before `boot()`, the cache is read; the worker boots with
   slot1's cloud card (verify in PocketBase: one record, `mounted='slot1'`).
4. Repeat for slot 2 → both records sync on the next dirty export.

## Out of scope for WS5

- The editor-refresh-on-emulator-write tuning (WS6 — `hydrate` clobber is in
  WS4; WS6 adds the sync-complete library refresh).
- `useMemoryCards` getting a live UI consumer (the library is rendered via the
  manager's store; the react-query hook stays for any future cloud-only view).
- Vendored tree changes (WS1/WS2).
- Docs (WS7).
