# WS7 — Docs + verification

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** all prior
workstreams (WS1–WS6). **Unblocks:** merge.

## Goal

Update the documentation that the new behavior supersedes, and run the full
verification suite (typecheck, lint, tests, build, verify:build) to confirm
the change is green. Capture the runtime acceptance steps for the reviewer.

This workstream carries no logic changes — only docs and verification. Run it
last, after WS1–WS6 are code-complete.

## Files

| File                                    | Change                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `AGENTS.md`                             | Update the memory-card bullets (collections table, field gotchas, cloud sync UX).     |
| `specs/emulator-integration/phase-2.md` | Mark the "Future work → Cloud memcard slot assignment" item done; annotate §M / §N.4. |
| `docs/emulator/memcard.md`              | Rewrite the "Cloud sync (`MemcardSync`)" section for the slot-aware library model.    |
| `docs/emulator/api.md`                  | Add `setMemcardSlotBinding` / `syncMemcards` to the `EmulatorClient` surface (WS2).   |
| `src/types/pocketbase.ts`               | Confirm `mounted` is present on `MemoryCardsRecord` (WS3).                            |

## Doc edits

### `AGENTS.md`

In the **Collections** table / `memory_cards` row, note that `mounted` is now
the authoritative slot marker (slot1/slot2/empty), used by the Data Management
feature.

In the **Field gotchas an agent will miss** section, replace/update the
existing `memory_cards` bullet to state:

- `memory_cards` holds a **per-user library of named cards**. `mounted`
  (`select`: `slot1`/`slot2`) marks the card active in each slot (at most one
  each); it is now read/written by the manager on mount/eject. Card identity =
  record `id` (stable across renames); `label` is display. There is no unique
  index on `(label, user)` or `(user, mounted)` — the client upserts by `id`
  (rename-safe) and enforces slot exclusivity client-side.
- The vendored `MemcardSync` is **slot- + label-aware**: it uploads/downloads
  both slots, each under a host-supplied `{id, label}` binding. The host
  (`PsxAnywhereEmulatorService`) sets bindings from the cloud `mounted` field
  on auth and caches them in `localStorage` (`psflix:memcard-slots:<userId>`,
  now `{slot1:{id,label}|null, slot2:...}`) for boot-time restore.
- `save_state.data` is required; `memory_cards.data` is **optional** (a freshly
  created spare card may have no file until it is mounted/edited).

In the **Emulator integration (cloud sync live)** section, update the
"Cloud sync UX" bullet: `memcard-sync-complete` now also triggers a library
refresh (`memoryCardManager.refreshLibrary`) in addition to invalidating
`['memory-cards']`. Cross-device card changes apply on the next boot
(decision: no hot-swap into the running emulator).

### `specs/emulator-integration/phase-2.md`

- §M (Memory-card cloud ops): add a note that this is **superseded** by
  [`specs/memory-manager-cloud-sync/`](../memory-manager-cloud-sync/spec.md)
  — the model moved from "one memcard per user, label `default`" to a
  `mounted`-backed card library with both slots syncing.
- §N.4 (`setMemorySlot` localStorage): mark superseded — slot assignment is now
  `mounted` on the cloud record + a binding cache (see WS5).
- "Future work → Cloud memcard slot assignment": move to **done**, linking the
  new spec folder.
- "Definition of Done" item "Cross-device memcard sync verified manually":
  now satisfied for **both** slots (was slot-1-only).

### `docs/emulator/memcard.md`

Rewrite the **Cloud sync (`MemcardSync`)** section (currently lines ~140-176,
which describe the slot-1-only / `default`-label model). New content:

- The cloud identity of a card is its record `id`; `label` is display; the
  `memory_cards.mounted` select marks the active card per slot.
- `MemcardSync` is slot- + label-aware: per-slot `{id, label}` bindings,
  per-slot 5s debounce + SHA-256 dedup, per-slot upload via
  `uploadMemcard(buf, userId, label, recordId)`.
- `setSlotBinding(slot, binding|null)` establishes/clears a binding and resets
  the slot's dedup hash.
- Download (`syncNow` / `onAuthChange(true)` / `ensureDownloaded`): for each
  _bound_ slot, `downloadMemcard(userId, label)` → IDB slot. A 404 on one slot
  does not abort the other. `onSyncStart`/`onSyncComplete` fire once per pass.
- Conflict resolution: last-write-wins per slot (unchanged).
- Cross-reference [`specs/memory-manager-cloud-sync/spec.md`](../../specs/memory-manager-cloud-sync/spec.md)
  for the PSflix-side library/`mounted` model and the boot-timing cache.

### `docs/emulator/api.md`

Add to the `EmulatorClient` memory-card methods block (done in WS2; confirm
here that the doc edit landed):

```
setMemcardSlotBinding(slot: 1|2, binding: {id, label} | null): void
syncMemcards(): Promise<void>
```

with the one-line descriptions from WS2.

## Verification

### Static + unit

```sh
npm run typecheck
npm run lint
npm test
npm run test:controller-guard
```

All must be green. Specific suites touched by this change:

- `tests/vendor/psxanywhere/client/memcard-sync.test.ts` (WS1)
- `tests/vendor/psxanywhere/client/helpers/repository-mock.ts` (WS1)
- `tests/console/services/psxAnywhereRepository.test.ts` (WS3)
- `src/features/console/memcards/memoryCardManager.test.ts` (WS4, WS6)
- `tests/console/services/psxAnywhereEmulatorService.test.ts` (WS5, WS6)

### Build

```sh
npm run build
npm run verify:build
```

`dist/` must build; `verify:build` (which boots the artifact and curls it)
must pass. Confirm `pcsx_rearmed.{js,wasm}` are still emitted at the origin
root (unchanged by this work).

### Runtime acceptance (manual, dev or staging)

Run against `https://psx.alexklingenbeck.de` (or a local PocketBase with seed
data). Two browser profiles / devices for the cross-device steps. All steps
assume the user is signed in unless noted.

**A. Both slots sync (single device)**

1. Open a game's console (`/#/play/<serial>`). Open Data Management.
2. Library is empty (first time). Initialize "Slot 1 Card"; mount into slot 1.
   Initialize "Slot 2 Card"; mount into slot 2.
3. Inspect PocketBase (`memory_cards` collection): two records, one with
   `mounted='slot1'`, one with `mounted='slot2'`.
4. Inspect localStorage `psflix:memcard-slots:<userId>`: bindings present for
   both slots.
5. Play the game; trigger saves to both memory cards (in-game save menu).
6. Within ~5s (debounce), both PocketBase records' `updated` timestamps
   advance and `data` reflects the new bytes (download a card file to verify).
7. Close + reopen Data Management → both slot panes show the new saves
   (editor refresh on reopen).

**B. Cross-device (apply-on-next-boot)**

1. Device A: complete step A above.
2. Device B (same user, fresh browser): sign in, open the same game's console.
   First boot: IDB empty → worker boots empty. After auth reconcile, IDB is
   populated for both slots.
3. Reload device B → both mounted cards appear (slot1 + slot2) with A's saves.
   Data Management library lists both cards + any spares.
4. On device A, create a spare card "Spare". On device B, trigger a sync
   (sign out/in or wait for `memcard-sync-complete`). The library list shows
   "Spare"; device B's mounted slot bytes are **unchanged** (apply-on-next-
   boot). Reload device B → "Spare" still listed; mounted cards unchanged.

**C. Library operations**

1. Rename a mounted card (e.g., "Slot 1 Card" → "Main RPG"). PocketBase: same
   record `id`, `mounted` unchanged, `label` updated. No duplicate record.
   Trigger an in-game save → the upload lands on the same record (rename-safe
   upsert).
2. Create a spare card (unmounted). PocketBase: new record, `mounted` empty.
   Reload → spare survives in the library.
3. Eject a slot → the card's `mounted` clears. Mount a different card into
   that slot → the previous occupant's `mounted` clears, the new card's sets.
4. Delete an unmounted spare → removed from PocketBase. Attempting to delete a
   mounted card is refused ("Eject the card from its slot before removing…").

**D. Unauthed**

1. Sign out. Open Data Management. Library is empty (no cloud).
2. Initialize a card, mount into slot 1, edit (delete a save). The live
   emulator sees the change; PocketBase is **not** written.
3. Reload → library is empty again (session-only fallback). Sign in → cloud
   library (if any) loads; the session card is gone.

**E. COOP/COEP still satisfied**

- DevTools console: `self.crossOriginIsolated === true`. The memory-card
  changes do not touch headers, but verify nothing regressed.

## Merge checklist

- [ ] All static + unit tests green (`typecheck`, `lint`, `test`,
      `test:controller-guard`).
- [ ] `npm run build` + `npm run verify:build` green.
- [ ] `AGENTS.md` updated (memory-card model, cloud sync UX).
- [ ] `specs/emulator-integration/phase-2.md` annotated (superseded sections).
- [ ] `docs/emulator/{memcard,api}.md` updated.
- [ ] `src/types/pocketbase.ts` carries `mounted` on `MemoryCardsRecord`.
- [ ] Manual acceptance A–D run on staging; results recorded in the PR.
- [ ] No schema migration required (decision #5); confirm PocketBase still
      serves the existing `memory_cards` collection without changes.

## Out of scope for WS7

- Code changes (all in WS1–WS6).
- Deploy (handled by the external Flux cluster per `AGENTS.md`).
- Adding a unique index on `memory_cards` (deferred per decision #5).
