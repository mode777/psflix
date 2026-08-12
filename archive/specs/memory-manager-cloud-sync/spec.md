# Spec — Memory Manager Cloud Sync (mounted-backed card library)

Status: **Planned**. Implementation plans: [`ws-1`](./ws-1-vendored-memcard-sync.md) …
[`ws-7`](./ws-7-docs-and-verification.md) (one document per workstream).

## 1. Goal

Make the in-console **Data Management** (memory card) feature work end-to-end
with the PocketBase cloud so that:

1. The card **library persists across reloads and devices** (named, swappable
   cards, not just two anonymous slot images).
2. **Mounting a card into slot 1 or 2 is recorded in PocketBase** via the
   `memory_cards.mounted` select field — the source of truth for which card is
   active in each slot.
3. **Cloud sync round-trips for both slots.** Today only slot 1 (label
   `'default'`) syncs; slot 2 dirty writes are dropped. After this change both
   slots upload/download.
4. **Editor changes reach the emulator** (already true via `importMemcard`) and
   from there reach the cloud (today: slot 1 only; after: both slots).
5. **Emulator changes reach the editor.** Today `hydrate()` only fills null
   slots, so game-written saves never refresh the open/reopened editor. After
   this change the editor re-pulls live bytes on dialog reopen and on sync
   completion.
6. **Cross-device** changes apply on the **next boot** (cloud download writes
   IndexedDB; the running emulator is not hot-swapped).

## 2. Decisions (locked)

| #   | Decision                          | Choice                                                                                                                                                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cloud card model                  | **Card library** — many named cards per user; the `mounted` select (`slot1`/`slot2`) marks the card active in each slot (at most one each). Matches the existing `MemoryManagerDialog` library UX.  |
| 2   | Cross-device apply mode           | **Apply on next boot.** Cloud download writes IndexedDB only; the running emulator keeps its current card. Safest; matches the vendored "two physical shared cards" mental model.                   |
| 3   | Slot-2 sync gap location          | **Extend the vendored `MemcardSync`** (`src/vendor/psxanywhere/client/MemcardSync.ts`) to be slot- + label-aware. Keeps sync logic in its designated home; reuses debounce/dedup.                   |
| 4   | Cloud identity of a card          | **Record `id`** (stable across renames). `label` is display name. The vendored `Repository.uploadMemcard` widens to upsert by `id` (optional) so renaming a mounted card cannot create a duplicate. |
| 5   | Schema change                     | **None.** Keep `pb_schema.json` as-is (no unique index on `memory_cards`). Client-side upsert; single-session client makes the race negligible.                                                     |
| 6   | Auth/boot timing for slot binding | **localStorage-cached bindings** (`psflix:memcard-slots:<userId>`, repurposed to `{slot1:{id,label}                                                                                                 | null, slot2:...}`) read synchronously at boot; reconciled against cloud `mounted` on auth. |

## 3. Background — current state (the gaps)

There are **three disconnected "mount/assignment" models** and cloud sync only
works for one slot. Detailed in the analysis; summarized here:

| Layer                                                    | What it holds                                                 | Persisted?     | Wired to UI?         |
| -------------------------------------------------------- | ------------------------------------------------------------- | -------------- | -------------------- |
| `MemoryCardManager` (session zustand)                    | `slot1/slot2` bytes + `mountId1/mountId2` + in-memory library | Session-only   | **Yes** (the dialog) |
| `EmulatorService.getMemorySlotAssignment` (localStorage) | `{slot1:cardId, slot2:cardId}`                                | `localStorage` | **No** (orphaned)    |
| PocketBase `memory_cards.mounted` (select)               | which card is in which slot                                   | PocketBase     | **No** (dead field)  |

### Concrete defects this spec fixes

1. **Slot 2 never reaches the cloud.** `MemcardSync` hardcodes
   `MEMCARD_SLOT = 1` / `MEMCARD_LABEL = 'default'`
   (`src/vendor/psxanywhere/client/MemcardSync.ts:12-13`) and early-returns on
   `slot !== 1` (`MemcardSync.ts:85`). Slot 2 dirty exports reach IDB only
   (`EmulatorClient.ts:641`) and are dropped before upload.
2. **`mounted` is dead.** Defined in `pb_schema.json:894-908`; absent from the
   TS type `MemoryCardsRecord`; never written by `uploadMemcard`
   (`src/features/console/services/psxAnywhereRepository.ts:281-289`); never
   returned by `fetchMemcardsForUser` (`:335-340`).
3. **`MemoryCardManager` is session-only** (`memoryCardManager.ts:1-9`). The
   library + mount state are wiped on reload; cloud is never consulted.
4. **Boot restore reads IDB only** (`EmulatorClient.ts:622-637`). The cloud
   card _identity_ (which record is mounted) is never resolved, so a card
   mounted on device B does not appear on device A until per-slot download is
   wired.
5. **`hydrate()` won't refresh editor after emulator writes**
   (`memoryCardManager.ts:84-102` — null-only guard). Reopening the dialog
   keeps stale bytes.
6. **`useMemoryCards` (react-query cloud list) has no live subscriber.** Its
   invalidation (`psxAnywhereEmulatorService.ts:241,250`) fires into the void;
   the `CardLibrarySheet` reads the in-memory library.

### What already works (reused, not rebuilt)

- Editor edits → live emulator via `importMemcard` (`memoryCardManager._push`).
- Slot 1 bytes → cloud via the worker 5s dirty-export poll → `memcard-exported`
  → `MemcardSync` (slot 1 only).
- IDB persistence for **both** slots (`_onMemcardExported` saves both).
- Sync status surfacing: `memcard-sync-start`/`memcard-sync-complete` →
  `SyncChip` + query invalidation.
- The full card editor (delete save / copy / move / format / eject / rename) in
  `src/features/console/components/memory/`.

## 4. Target cloud model

```
memory_cards (per user, many rows)
┌──────────────┬───────────────┬──────────────┬─────────────┬─────────────────────┐
│ id (PK)      │ label         │ data (file)  │ mounted     │ updated             │
├──────────────┼───────────────┼──────────────┼─────────────┼─────────────────────┤
│ pbc_…        │ "RPG Saves"   │ memcard.mcd  │ "slot1"     │ 2026-08-10T12:00:00 │
│ pbc_…        │ "Platformers" │ memcard.mcd  │ "slot2"     │ 2026-08-09T18:30:00 │
│ pbc_…        │ "Spare Card"  │ memcard.mcd  │ (empty)     │ 2026-08-01T09:00:00 │
└──────────────┴───────────────┴──────────────┴─────────────┴─────────────────────┘
```

- **Identity** = record `id`. **Display** = `label`. **Slot marker** =
  `mounted`.
- At most one card has `mounted='slot1'`, one `mounted='slot2'` (enforced
  client-side; the previous occupant's `mounted` is cleared on a new mount).
- The emulator's two slots are backed by whichever cards are currently
  `mounted`. Unmounted cards live in the library as spares.

### Round-trip dataflow (after this spec)

```
                       ┌──────────────── PocketBase (memory_cards) ───────────────┐
                       │  library of named cards; `mounted` marks slot1/slot2      │
                       └──────▲───────────────────────────────▲─────────────────────┘
                              │ fetchMemcardsForUser          │ uploadMemcard / setMemcardMounted
                              │ (list + mounted)              │ createMemcard / renameMemcard / deleteMemcard
                       ┌──────┴───────────────────────────────┴─────────────────────┐
                       │            PsxAnywhereMemoryCardStore (WS4)                │
                       │            + psxAnywhereRepository (WS3)                   │
                       └──────▲─────────────────────────────── ▲─────────────────────┘
                              │ hydrate / CRUD / mount        │ onBindingChange(slot,{id,label}|null)
                       ┌──────┴──────────────────┐     ┌───────┴──────────────────────────────────┐
                       │ MemoryCardManager (WS4) │     │ PsxAnywhereEmulatorService (WS5)          │
                       │ - library (cloud-backed)│     │ - owns the store                          │
                       │ - slot1/slot2 bytes     │     │ - bridges binding → client                │
                       │ - hydrate re-exports    │     │ - boot: read localStorage binding cache   │
                       └──────▲──────────────────┘     │ - auth: reconcile with cloud, syncMemcards│
                              │ import/exportMemcard       │ - listMemoryCards returns mounted + blocks│
                       ┌──────┴───────────────────────────────────────────────────┴──────────────┐
                       │            EmulatorClient (vendored facade — WS2)                       │
                       │   setMemcardSlotBinding(slot,{id,label}) → MemcardSync.setSlotBinding    │
                       │   syncMemcards()                       → MemcardSync.syncNow            │
                       │   _onMemcardExported (both slots)      → MemcardSync.onMemcardDirty     │
                       └──────▲───────────────────────────────────────────────── ▲───────────────┘
                              │                                                  │ per-slot upload/download
                       ┌──────┴──────────────────┐                     ┌──────────┴──────────────┐
                       │ Emulator (Worker+WASM)  │                     │ MemcardSync (WS1)        │
                       │  slot1/slot2 MEMFS      │                     │ per-slot debounce+dedup │
                       │  5s dirty-export poll   │────────────────────▶│ uploads under bound      │
                       └─────────────────────────┘   memcard-exported  │ {id,label} per slot      │
                                                    (both slots)       └─────────────────────────┘
```

## 5. Architecture after this change

The layering keeps the vendored facade a black box (no PSflix imports into
`src/vendor/psxanywhere/`) while making it slot- and label-aware via two new
thin host-facing methods. All `mounted`/library knowledge lives in PSflix code.

```
PSflix code (src/features/console/)
├── memcards/
│   ├── memoryCardManager.ts          # cloud-aware (WS4); injects MemoryCardCloudStore
│   ├── memoryCardCloudStore.ts       # NEW (WS4): interface
│   └── mcrBlank.ts, mcrWrite.ts      # unchanged
├── services/
│   ├── psxAnywhereMemoryCardStore.ts # NEW (WS4): impl over repository
│   ├── psxAnywhereRepository.ts      # +mounted +library CRUD (WS3)
│   ├── psxAnywhereEmulatorService.ts # orchestration (WS5)
│   └── emulator.ts                   # MemoryCardInfo += mounted (WS5)
└── components/memory/                # unchanged (reads the manager view)

Vendored code (src/vendor/psxanywhere/)
├── client/
│   ├── MemcardSync.ts                # slot- + label-aware (WS1)
│   └── EmulatorClient.ts             # +setMemcardSlotBinding +syncMemcards (WS2)
└── repository/
    └── repository.ts                 # uploadMemcard += optional recordId (WS1/WS3)
```

The two adapters that bridge PSflix ↔ vendored:

1. **`PsxAnywhereMemoryCardStore`** implements the `MemoryCardCloudStore`
   interface over `psxAnywhereRepository`. Consumed by `MemoryCardManager`.
2. **`PsxAnywhereEmulatorService`** owns the store, registers the manager's
   binding callback, and bridges to `EmulatorClient.setMemcardSlotBinding`.

## 6. Workstreams

Ordered by dependency. WS1 → WS2 → WS3 → WS4 → WS5 → WS6 → WS7. Each has its
own plan document.

| WS  | Document                                                                             | Touches                                                                                                                          | Depends on |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | [`ws-1-vendored-memcard-sync.md`](./ws-1-vendored-memcard-sync.md)                   | `vendor/…/MemcardSync.ts`, `vendor/…/repository/repository.ts`, tests                                                            | —          |
| 2   | [`ws-2-vendored-emulator-client.md`](./ws-2-vendored-emulator-client.md)             | `vendor/…/EmulatorClient.ts`, docs                                                                                               | WS1        |
| 3   | [`ws-3-repository-mounted.md`](./ws-3-repository-mounted.md)                         | `services/psxAnywhereRepository.ts`, tests                                                                                       | —          |
| 4   | [`ws-4-cloud-store-and-manager.md`](./ws-4-cloud-store-and-manager.md)               | `memcards/memoryCardCloudStore.ts` (NEW), `services/psxAnywhereMemoryCardStore.ts` (NEW), `memcards/memoryCardManager.ts`, tests | WS3        |
| 5   | [`ws-5-emulator-service-orchestration.md`](./ws-5-emulator-service-orchestration.md) | `services/psxAnywhereEmulatorService.ts`, `services/emulator.ts` (type), `types.ts`, tests                                       | WS2, WS4   |
| 6   | [`ws-6-editor-refresh.md`](./ws-6-editor-refresh.md)                                 | `memcards/memoryCardManager.ts` (hydrate), `services/psxAnywhereEmulatorService.ts` (sync-complete)                              | WS4, WS5   |
| 7   | [`ws-7-docs-and-verification.md`](./ws-7-docs-and-verification.md)                   | `AGENTS.md`, `specs/emulator-integration/phase-2.md`, `docs/emulator/{memcard,api}.md`, verification                             | all        |

## 7. Edge cases & semantics

- **Unauthed user.** `MemoryCardCloudStore` is absent (or no-ops). The manager
  falls back to legacy session-only behavior. Bindings are null; no uploads.
  Mount/eject still push bytes to the live emulator via `importMemcard`.
- **First-time user (no cloud cards).** Empty library. Create/import produces
  cloud records. Mount sets `mounted`.
- **Cross-device.** Device B boots → localStorage binding cache (or, on a
  fresh device, reconcile-on-auth) → `fetchMemcardsForUser` → derive bindings
  from `mounted` → `client.syncMemcards()` writes both mounted cards' bytes to
  IDB → next boot restores them. A fresh device boots empty on the very first
  session and is populated on the session after the download lands (matches
  "apply on next boot").
- **Rename a mounted card.** Id-based upsert (WS3) + re-bind notification
  (WS4) → the dirty-upload under the new label finds the existing record by
  `id`; **no duplicate**. Eject is not required.
- **Mount replaces a slot's card.** `setMemcardMounted` clears the previous
  occupant's `mounted`, sets the new card's, and the binding switches. The next
  dirty upload writes under the new card's `{id,label}`. The replaced card's
  cloud bytes are untouched.
- **Editor edit (delete save / copy / move / format).** Bytes are pushed to the
  emulator via `importMemcard` (existing). The worker's 5s dirty-export poll
  fires `memcard-exported` for the touched slot → `MemcardSync.onMemcardDirty`
  uploads under that slot's binding. **No new editor→cloud code path** beyond
  WS1's slot-2 fix.
- **LWW conflict (two devices write the same slot).** Last upload wins, per
  the existing phase-2 policy. Cards are opaque binary blobs; no merge is
  possible.
- **Block counts.** `listMemoryCards` and the library parse the `.mcd` header
  via `parseMemoryCard` to compute `usedBlocks`/`totalBlocks`. v1 fetches card
  bytes eagerly (a user won't have hundreds of cards). Revisit with lazy fetch
  if libraries grow.

## 8. Out of scope / non-goals

- **Schema change.** No unique index on `memory_cards`; no migration.
- **Hot-swap into the running emulator.** Cross-device card changes apply on
  the next boot only.
- **Live editor refresh during gameplay.** The editor refreshes on dialog
  reopen and on `memcard-sync-complete`. A live `memcard-exported`
  re-emission for in-dialog refresh is noted as future work.
- **Memory-card realtime (SSE/WS).** Cross-device updates surface on the next
  sync pass, not pushed.
- **Atomic `setMemcardMounted`.** Clearing the previous occupant + setting the
  new card is two PocketBase calls. Single-session client makes the race
  negligible; a future partial unique index on `(user, mounted)` would harden
  it (deferred per decision #5).
- **Save-state changes.** Out of scope; this spec touches memory cards only.

## 9. Risks

| Risk                                                                                         | Likelihood | Mitigation                                                                               |
| -------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| Auth/`syncNow` race: bindings not yet set when worker requests cards.                        | Medium     | localStorage binding cache read synchronously at boot (WS5); cloud reconcile after auth. |
| Rename-while-mounted creates duplicate cloud records.                                        | Avoided    | Id-based upsert (WS1/WS3); re-bind on rename (WS4).                                      |
| Slot-2 dirty export fires before binding is established (early save).                        | Low        | `onMemcardDirty` no-ops when binding is null; the next touch after binding uploads.      |
| Eager byte fetch in `listMemoryCards` is slow for large libraries.                           | Low        | v1 acceptable; lazy fetch documented as future work.                                     |
| Vendored `MemcardSync` test churn breaks the migrated suite.                                 | Medium     | WS1 updates `memcard-sync.test.ts` in lockstep; the "ignores non-slot-1" test changes.   |
| `mounted` select field receives an unexpected value (e.g. legacy `'slot1'` already present). | Low        | Tolerant parsing: any value not in `{slot1, slot2, null/''}` is treated as null.         |

## 10. Verification (acceptance)

**Per-workstream:** see each `ws-*.md` document's "Tests" and "Verify" section.

**End-to-end (all workstreams merged):**

1. `npm run typecheck && npm run lint && npm test && npm run test:controller-guard` green.
2. `npm run build && npm run verify:build` green.
3. **Single device, both slots:**
   - Sign in. Open Data Management. Library is empty (first time) or shows
     cloud cards.
   - Initialize "Slot 1 Card", mount into slot 1. Initialize "Slot 2 Card",
     mount into slot 2. Both appear in PocketBase with `mounted` set.
   - Play a game that writes saves to both cards. After ~5s, both cloud
     records' `data` update (verify `updated` timestamps in PocketBase).
   - Reopen Data Management → both cards show the new saves (editor refresh).
   - Reload the page → both cards restore from cloud, `mounted` preserved.
4. **Cross-device (apply-on-next-boot):**
   - Device A: as above.
   - Device B (same user, fresh browser): sign in, navigate to a game, open
     the console. On boot, the worker requests cards; IDB is empty → empty
     boot. After auth reconcile + `syncMemcards`, IDB is populated. Reload →
     both mounted cards appear with A's saves.
5. **Library operations:**
   - Rename a mounted card → cloud record keeps the same `id`, `mounted`
     unchanged, no duplicate. The next dirty upload lands on the same record.
   - Create a spare card (unmounted) → appears in cloud with `mounted` empty;
     survives reload.
   - Delete an unmounted card → removed from cloud. Delete of a mounted card
     is refused until ejected.
6. **Unauthed:** Data Management still works session-only (mount/eject/edit
   push to the live emulator); nothing writes the cloud; reload wipes the
   library.

## 11. Cross-references

- Phase-2 spec (the predecessor that activated cloud sync for slot 1):
  [`specs/emulator-integration/phase-2.md`](../emulator-integration/phase-2.md)
  — section M (memcard cloud ops) and N.4 (`setMemorySlot` localStorage) are
  superseded by this spec; WS7 updates that document.
- Vendored memcard reference: [`docs/emulator/memcard.md`](../../docs/emulator/memcard.md)
  — the "Cloud sync (`MemcardSync`)" section ("one memcard per user, slot 1,
  label `default`") is superseded; WS7 updates it.
- Facade API: [`docs/emulator/api.md`](../../docs/emulator/api.md) — WS7 adds
  `setMemcardSlotBinding` / `syncMemcards`.
- Schema: `pb_schema.json:825-932` (`memory_cards` collection). `mounted` at
  `:894-908`.
- Existing manager: `src/features/console/memcards/memoryCardManager.ts`
  (session-only header comment `:1-9` is superseded by WS4).
