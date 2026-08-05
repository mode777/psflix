# Memory card persistence

PS1 memory cards persist across reloads. Two shared cards (one per slot) are
stored in IndexedDB and restored into Emscripten MEMFS before the core's
`load_memcards()` runs, flushed back on a 5 s poll and on lifecycle events.
No new C exports are needed — the feature rides on two `libretro_environment`
variables the core already queries.

> **Migrated + adapted** from upstream `docs/memcard.md` to the vendored tree.
> The persistence split changed in this revision: upstream's
> `src/emulator/MemcardStore.ts` is now the storage-port
> `client/memcardStorage.ts` (`IdbMemcardStorage`), and the IDB round-trip is
> owned by `EmulatorClient` (not `app.ts`), which consumes the worker's
> `memcard-load-request` / `memcard-exported` events internally. The worker
> side (`worker/memcard.ts`, `host.c` env vars) is unchanged.

## The pieces

| Layer        | File                                                                                                                        | Role                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage port | `client/memcardStorage.ts`                                                                                                  | `MemcardStorage` interface + `IdbMemcardStorage` (DB `psx-memcards` v1, store `memcards`, keys `"1"`/`"2"`) + `InMemoryMemcardStorage` test double              |
| Facade       | `client/EmulatorClient.ts`                                                                                                  | owns the persistence round-trip: `_onMemcardLoadRequest` (restore at boot) + `_onMemcardExported` (dirty persist) — internal, NOT re-emitted                    |
| Cloud sync   | `client/MemcardSync.ts`                                                                                                     | downloads cloud memcard on auth / boot, uploads on dirty export (SHA-256 dedup, 5 s debounce)                                                                   |
| Repository   | `src/vendor/psxanywhere/repository/repository.ts` + PSflix adapter `src/features/console/services/psxAnywhereRepository.ts` | PocketBase gateway: `uploadMemcard`, `downloadMemcard`, `hasRemoteMemcard`                                                                                      |
| Core vars    | `emulator/worker/host.c` `host_env_cb`                                                                                      | `GET_SAVE_DIRECTORY` → `"/saves"`; `pcsx_rearmed_memcard{1,2}` → `"shared"`                                                                                     |
| Worker       | `emulator/worker/memcard.ts`                                                                                                | manages MEMFS files only: restores imported cards, content-hashes each file (53-bit FNV-1a) to detect dirty writes, posts `MEMCARD_EXPORT_RESULT` for each diff |
| Emulator     | `emulator/Emulator.ts`                                                                                                      | emits `memcard-load-request` and `memcard-exported`; `sendMemcardsToWorker(cards)` posts `MEMCARD_IMPORT`(s) + `MEMCARD_IMPORT_DONE`                            |

## `memcardStorage.ts`

`MemcardStorage` is the storage port; `IdbMemcardStorage` is the IndexedDB
adapter:

- DB `psx-memcards`, version `1`, object store `memcards` (out-of-line keys,
  no `keyPath`).
- Keys: string `"1"` and `"2"` (slot numbers). Values: `Uint8Array`
  (128 KB `.mcd` image).
- `load(slot)` → fresh `Uint8Array` copy (or `null`).
- `save(slot, buf)` → copies the bytes before `put`, so a caller's transferable
  buffer can be detached. Accepts both `ArrayBuffer` and `Uint8Array`.
- `remove(slot)`.
- `InMemoryMemcardStorage` is the in-memory test double (same interface).

The storage is constructed by `EmulatorClient` and injected into `MemcardSync`.
PSflix's own adapter (`PsxAnywhereRepository`) implements the cloud half over
PSflix's `pb` singleton.

> The Cache API isn't a fit here (the keys are fixed slots, not URLs), and
> localStorage's ~5 MB quota can't hold a 128 KB card as base64.

## `host.c` — the two missing cases

The root cause of the old `Could not get save directory!` / `non memcard
config?` log lines was two missing cases in `emulator/worker/host.c`'s
`host_env_cb`:

- `RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY` now returns `"/saves"`.
- `GET_VARIABLE` for `pcsx_rearmed_memcard1` / `pcsx_rearmed_memcard2` now
  returns `"shared"`.

The `"shared"` value makes the core write to fixed card files
`/saves/pcsx-card1.mcd` and `/saves/pcsx-card2.mcd` — shared across all games,
like physical cards plugged into the same slot. The core's own
`SaveMcd`/`CreateMcd`/`LoadMcd` path in `libpcsxcore/sio.c` handles card I/O;
the JS side only persists the resulting files. There is **no** new
`host_memcard_*` bridge surface.

## `EmulatorClient.ts` — the persistence round-trip

### Restore (on worker boot)

When the worker sends `MSG.MEMCARD_LOAD_REQUEST` during `tryInitAndLoad()`,
`EmulatorClient._onMemcardLoadRequest` (line ~607):

1. `await this._memcardSync.ensureDownloaded()` — syncs from cloud if
   authenticated (memcard wind to IDB; no-op if none exists / offline).
2. Reads both slots from `this._memcardStorage` (`IdbMemcardStorage`) and
   builds `cards: ReadonlyMap<number, Uint8Array|null>`.
3. Calls `emu.sendMemcardsToWorker(cards)` — posts `MEMCARD_IMPORT { slot,
buf }` for each non-empty slot followed by a final `MEMCARD_IMPORT_DONE`.

The worker writes to MEMFS and awaits `MEMCARD_IMPORT_DONE` (with a 10 s
safety timeout) before running `host_load('/game.chd')`. This ordering matters:
the core's `load_memcards()` runs inside `host_load`, so the imported cards
must be in MEMFS _before_ `host_load` so `load_memcards()` reads them instead
of `CreateMcd()`-ing fresh empty cards.

### Flush (dirty-write back)

The worker content-hashes each `.mcd` file with a 53-bit FNV-1a composite
(`hashMemcard` in `emulator/worker/memcard.ts`) — `FS.stat().mtime` is broken
by Closure advanced mode (the `mtime` property gets renamed), so a
`mtime+':'+size` key would be constant. Hashing the file bytes is immune.

When a hash differs from the baseline seeded at `host_load` time, the worker
posts `MSG.MEMCARD_EXPORT_RESULT { slot, buf }`. `EmulatorClient._onMemcardExported`
(line ~624) persists to IDB via `this._memcardStorage.save(slot, buf)`, then
calls `this._memcardSync.onMemcardDirty(slot, buf)` which uploads to
PocketBase if the bytes changed (SHA-256 dedup). (`memcard-exported` is consumed
internally; PSflix surfaces sync state via `memcard-sync-start` /
`memcard-sync-complete` or the shared `state-sync-complete` pattern.)

Flush triggers:

- **5 s poll** — the worker's `setInterval(flushMemcards, 5000)` hashes and
  posts `MEMCARD_EXPORT_RESULT` for each dirty slot.
- **`visibilitychange` (hidden)** — the Emulator's listener posts
  `MSG.MEMCARD_FLUSH`.
- **`MSG.RUN_STOP`** — `handleRunStop` calls `flushMemcards()` and posts
  `MEMCARD_FLUSH`.
- **Explicit export** — `handleMemcardExport` reads MEMFS and posts result.

### Export / import (explicit user actions)

`EmulatorClient.exportMemcard(slot)` / `importMemcard(slot, buf)` pass through
to the `Emulator`: `MSG.MEMCARD_EXPORT` → worker reads MEMFS →
`MEMCARD_EXPORT_RESULT` (also persists to IDB and fires `memcard-exported`);
`MSG.MEMCARD_IMPORT` → worker writes to MEMFS → `MEMCARD_IMPORT_RESULT`.
`EmulatorClient.downloadMemcard(slot)` wraps the export in a Blob download
named `pcsx-card${slot}.mcr`.

> **Design note:** The `Emulator` never persists data on its own initiative.
> All IDB access flows through `EmulatorClient` via the injected
> `MemcardStorage`. The worker only manages MEMFS files.

## `emulator/worker/memcard.ts`

The worker only manages MEMFS files — it never reads or writes IndexedDB.

- **Restore (on boot):** `tryInitAndLoad` (in `boot.ts`) posts
  `MSG.MEMCARD_LOAD_REQUEST` and waits for `MSG.MEMCARD_IMPORT_DONE` (10 s
  safety timeout). Each `MSG.MEMCARD_IMPORT` writes the bytes to
  `memcardPath(slot)` via `Module.FS.writeFile`.
- **Flush (dirty detection):** `flushMemcards()` reads each card file,
  computes `hash + ':' + size`; if it differs from the baseline
  (`memcardLastHash[slot]` seeded right after `host_load`), posts
  `MEMCARD_EXPORT_RESULT { slot, buf: copy }` (transfer list).
- **Export / import:** read/write MEMFS only (no IDB).

## Cloud sync (`MemcardSync`)

`MemcardSync` (`client/MemcardSync.ts`) handles PocketBase sync for memory
cards: **one memcard per user** (slot 1, label `"default"`).

### Download (on auth / boot)

`onAuthChange(authed)` → if authed, `syncNow()` — a download pass. Also called
once at construction if already authenticated. `ensureDownloaded()` (used by
`_onMemcardLoadRequest` before handing cards to the worker) downloads the
cloud memcard and writes it to IDB via `memcardStorage.save(1, buf)`. The
worker picks it up on the next `MEMCARD_LOAD_REQUEST`. If no cloud memcard
exists (first-time user or offline), the download silently no-ops.

### Upload (on dirty export)

`onMemcardDirty(slot, bytes)` — slot 1 only — stashes the bytes and arms a
**5 s debounce timer** (`UPLOAD_DEBOUNCE_MS = 5000`). When it fires, it
computes a SHA-256 hash of the bytes; if the hash matches `_lastUploadedHash`,
skip (no change); otherwise uploads to PocketBase via
`repo.uploadMemcard(buf, userId, 'default')`. On success stores the hash.
Fire-and-forget — errors are logged but don't block the UI (and `_lastUploadedHash`
is left unchanged so the next dirty export retries).

### First-time user flow

1. User registers → auth → `onAuthChange(true)` → `syncNow()` → no cloud
   memcard → no-op.
2. Worker boots with empty memcard (normal PS1 behavior).
3. User plays, game writes saves to memcard.
4. Dirty export → `onMemcardDirty` → debounced 5 s → SHA-256 check → upload.
5. Next session: `ensureDownloaded()` gets it back.

### Conflict resolution

Local-wins (last-write-wins). The user's current play session is
authoritative. PS1 memory cards are opaque binary blobs — no merge is possible.

## Cross-references

- [`architecture.md`](./architecture.md) — `MEMCARD_*` protocol, MEMFS paths.
- [`worker.md`](./worker.md) — `worker/memcard.ts`, `host.c` memcard vars.
- [`save-state.md`](./save-state.md) — the analogous save/load round-trip.
- [`../../specs/emulator-integration/phase-2.md`](../../specs/emulator-integration/phase-2.md) — cloud sync activation + PSflix's
  `listMemoryCards` / `setMemorySlot` adapter behavior.
