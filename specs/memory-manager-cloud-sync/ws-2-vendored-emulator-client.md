# WS2 — Vendored `EmulatorClient`: expose binding + sync APIs

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** WS1.
**Unblocks:** WS5.

## Goal

Expose two thin pass-through methods on `EmulatorClient` so PSflix's
`PsxAnywhereEmulatorService` (WS5) can drive the new slot bindings and
re-trigger downloads without reaching into the vendored `MemcardSync` directly.
Also confirm the boot-restore path needs no change now that WS1 made the sync
engine slot-aware.

## Files

| File                                                      | Change                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/vendor/psxanywhere/client/EmulatorClient.ts`         | Add `setMemcardSlotBinding`, `syncMemcards`.                                              |
| `docs/emulator/api.md`                                    | Document the two new methods on the `EmulatorClient` surface.                             |
| `docs/emulator/memcard.md`                                | Rewrite the "Cloud sync (`MemcardSync`)" section for the slot-aware model.                |
| `tests/vendor/psxanywhere/client/emulator-client.test.ts` | Add coverage for the two new pass-throughs (if the migrated suite covers memcard wiring). |

## Design

### Method additions (around `EmulatorClient.ts:495-509`, the "Memory card methods" block)

```ts
// ── Memory card methods ───────────────────────────────────────────

exportMemcard(slot: number): Promise<Uint8Array | null> { ... }   // unchanged
importMemcard(slot: number, buf: ArrayBuffer): Promise<void> { ... } // unchanged
async downloadMemcard(slot: number): Promise<void> { ... }          // unchanged

/** Declare which cloud card (record id + label) is mounted in a slot, or null
 *  to unbind. The vendored MemcardSync uses the binding to (a) route dirty
 *  exports to the right cloud record and (b) download the right bytes on
 *  syncNow. Host-side concern: PSflix derives the binding from the cloud
 *  `mounted` field and the library card list. */
setMemcardSlotBinding(slot: 1 | 2, binding: { id: string; label: string } | null): void {
  this._memcardSync.setSlotBinding(slot, binding);
}

/** Re-run a download pass for every bound slot (writes IDB; the worker picks
 *  it up on the next memcard-load-request, or the host may force a re-load).
 *  Used by the host after reconciling bindings with the cloud on auth. */
syncMemcards(): Promise<void> {
  return this._memcardSync.syncNow();
}
```

These are deliberately thin: no new state on `EmulatorClient`, no new events.
The host (WS5) is responsible for deciding _when_ to bind and _when_ to sync.

### Why no event re-emission

The host already learns about memcard changes via the existing
`memcard-sync-start` / `memcard-sync-complete` events (wired at
`EmulatorClient.ts:156-159`). The internal `memcard-exported` event
(`:639-647`) stays internal — re-emitting it would create per-flush noise the
host does not need. (A future "live editor refresh during gameplay" enhancement
could re-emit `memcard-exported`; out of scope here, see WS6.)

### Boot-restore path (verify, do not change)

`_onMemcardLoadRequest` (`EmulatorClient.ts:622-637`) already:

1. Awaits `_memcardSync.ensureDownloaded()`.
2. Loads both slots from IDB (`_memcardStorage.load(1)` and `(2)`).
3. Hands them to the worker via `sendMemcardsToWorker`.

After WS1, `ensureDownloaded` awaits a `syncNow` that downloads **both bound
slots**. For this to populate IDB correctly at boot, the bindings must be set
**before** the worker's `memcard-load-request` fires. That ordering is a host
responsibility (WS5): PSflix reads the localStorage binding cache synchronously
in `attachCanvas` (before `client.boot()`) and calls
`setMemcardSlotBinding` for both slots. No `EmulatorClient` change is needed
here — just verify with a test that bindings set before `boot()` flow through
to the worker's card map.

### Dirty-export path (verify, no change)

`_onMemcardExported` (`EmulatorClient.ts:639-647`) saves both slots to IDB and
forwards both to `_memcardSync.onMemcardDirty`. After WS1, `onMemcardDirty`
handles slot 2 too. No change here — just verify the existing event binding
(`:587`) keeps firing for both slots.

## Docs

### `docs/emulator/api.md` — `EmulatorClient` surface

Add to the memcard methods block (near `exportMemcard`/`importMemcard`):

```
setMemcardSlotBinding(slot: 1|2, binding: {id, label} | null): void
  Tell the facade which cloud card is mounted in a slot (or null to unbind).
  The vendored MemcardSync uses the binding to route dirty exports and
  downloads. Must be called before boot() for boot-restore to pull the right
  bytes; the host reads the cloud `mounted` field and the library.

syncMemcards(): Promise<void>
  Trigger a download pass for every bound slot (writes IDB; the worker picks
  it up on the next boot or memcard-load-request). Used by the host after
  reconciling bindings with the cloud on auth.
```

### `docs/emulator/memcard.md` — "Cloud sync (`MemcardSync`)" section

Replace the current text (lines ~140-176, which says "one memcard per user,
slot 1, label `'default`'") with the slot-aware, library-backed model:

- Two slots, each bound to a cloud card via `{id, label}`.
- `setMemcardSlotBinding(slot, binding|null)` establishes / clears a binding;
  clears the slot's `lastUploadedHash` so the next dirty export uploads.
- Download (`syncNow` / `onAuthChange(true)` / `ensureDownloaded`): for each
  _bound_ slot, `downloadMemcard(userId, label)` → IDB slot. A 404 on one slot
  does not abort the other.
- Upload (`onMemcardDirty(slot, bytes)`): per-slot 5s debounce + SHA-256 dedup;
  uploads via `uploadMemcard(buf, userId, label, recordId)` so renames are safe.
- Conflict resolution: last-write-wins per slot (unchanged).
- Cross-reference this spec folder for the cloud-library / `mounted` model.

## Tests

If `tests/vendor/psxanywhere/client/emulator-client.test.ts` covers the
memcard wiring (the migrated suite lists it under "memcard events"), add:

- `setMemcardSlotBinding(1, {id, label})` forwards to `MemcardSync.setSlotBinding`
  (assert via a spy on the sync instance — the test harness already constructs
  `EmulatorClient` with a mock/in-memory sync).
- `syncMemcards()` calls `MemcardSync.syncNow` (same spy).
- Null binding forwards as null (unbind).

If the migrated suite does not isolate `MemcardSync` from `EmulatorClient`
(most of it uses the real sync with a mock repository), add a focused unit
test that constructs `EmulatorClient` with an `InMemoryMemcardStorage` + mock
repo, binds both slots, calls `syncMemcards`, and asserts IDB is populated for
both. This doubles as the boot-restore verification.

## Verify (this workstream alone)

```sh
npm test -- emulator-client
npm run typecheck
npm run lint
```

The two new methods are pass-throughs; if the type checks and the focused
tests pass, WS2 is done. No PSflix integration yet (WS5 consumes these).

## Out of scope for WS2

- PSflix-side callers of the new methods (WS5).
- Library / `mounted` logic (WS3, WS4).
- Boot-timing correctness (WS5's localStorage cache).
- Re-emitting `memcard-exported` for live editor refresh (WS6 / future).
