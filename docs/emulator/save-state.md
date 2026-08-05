# Save / load state

The running PS1's emulated machine state (RAM, registers, timers, GPU, SPU,
CD controller, …) can be serialized to an `ArrayBuffer` and restored later.
The libretro core exposes the three primitives (`retro_serialize_size`,
`retro_serialize`, `retro_unserialize` in `pcsx_rearmed/frontend/libretro.c`);
this feature wires them to the worker, the `Emulator` facade, and the
`EmulatorClient` persistence stack.

> **Migrated + adapted** from upstream `docs/save-state.md` to the vendored
> tree. In this revision the persistence layer was refactored: upstream's
> `src/client/StateStore.ts` + `src/client/stateDb.ts` became the storage-port
> layout `client/SaveStateStore.ts` + `client/saveStateStorage.ts` +
> `client/saveStateHeader.ts` + `client/slotKey.ts`, orchestrated by
> `client/save-load.ts` (`SaveLoadController`) and synced by
> `client/SaveStateSyncEngine.ts`. The worker/C side
> (`worker/save-load.ts`, `host.c` wrappers) is unchanged.

## The pieces

| Layer                | File                               | Role                                                                                                                                                                                                |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C wrappers           | `emulator/worker/host.c`, `host.h` | `host_serialize_size` / `host_save_state` / `host_load_state` — thin wrappers over the libretro serialize primitives; `host_get_cdrom_id` — pointer to the game serial for disc-identity validation |
| Protocol             | `emulator/messages.js`             | `SAVE_STATE` / `LOAD_STATE` (main→worker), `SAVE_STATE_RESULT` / `LOAD_STATE_RESULT` (worker→main, with `cdromId` on save)                                                                          |
| Worker               | `emulator/worker/save-load.ts`     | `handleSaveState` / `handleLoadState`: `malloc` → copy against `Module.HEAPU8` → `free`, post result (transferred); reads `CdromId` from WASM memory                                                |
| Facade               | `emulator/Emulator.ts`             | `saveState(slot)` / `loadState(slot, buf)` Promises + result routing; raw core bytes, no header                                                                                                     |
| Storage port         | `client/saveStateStorage.ts`       | `SaveStateStorage` interface + `IdbSaveStateStorage` (DB `psx-saves` v2; `save-states` + `sync-meta` stores) + `InMemorySaveStateStorage` test double                                               |
| Store                | `client/SaveStateStore.ts`         | local CRUD with cloud cache-on-miss: `save`/`load`/`hasState`                                                                                                                                       |
| Sync engine          | `client/SaveStateSyncEngine.ts`    | debounced cloud sync (download-on-auth, dirty upload by slot)                                                                                                                                       |
| Slot mapping         | `client/slotKey.ts`                | `SLOT_AUTO`, `slotToType` ↔ `typeToSlot`, `compositeKey`, `UNSYNCED`/`SYNCED`                                                                                                                       |
| Orchestration        | `client/save-load.ts`              | `SaveLoadController`: `save(slot, serial)` / `load(slot, serial)` — wraps `Emulator.saveState/loadState` with header + store                                                                        |
| Header codec         | `client/saveStateHeader.ts`        | `buildSaveStateHeader(coreBuf, discUrl, cdromId)` / `parseSaveStateHeader(buf)` (PSAS format)                                                                                                       |
| Facade orchestration | `client/EmulatorClient.ts`         | `saveState(slot)`, `loadState(slot)`, `hasState(slot)`, `loadStateFromFile(buf)`; onSaved → `state-saved` event                                                                                     |

## `host.c` wrappers

Three one-liners (in `emulator/worker/host.c`, declared in `host.h`):

```c
size_t host_serialize_size(void)            { return retro_serialize_size(); }
bool    host_save_state(void *out, size_t s){ return (s && out) ? retro_serialize(out, s) : false; }
bool    host_load_state(const void *d, size_t s) { return (s && d) ? retro_unserialize(d, s) : false; }
```

No heap allocation happens in C — the JS side owns the `malloc`/`free`. The
wrappers are deliberately non-reentrant-safe at the C level; the safety
guarantee is the worker's single-threaded message dispatch (see
"Concurrency" below).

`host_get_cdrom_id(void)` returns the global `CdromId[10]` from `misc.h` —
9-char PS1 serial + null terminator (e.g. `"SLUS94465"`).

## `emulator/worker/save-load.ts`

### `handleSaveState(msg)` — `MSG.SAVE_STATE { slot }`

1. If no game is loaded (`!bootHas(BOOT.GAME)`) → post
   `SAVE_STATE_RESULT { slot, buf: null }` (soft fail).
2. `size = cfunc.host_serialize_size()`. If `size <= 0` → `buf: null`.
3. `ptr = cfunc.malloc(size)`. If `0` → log + `buf: null`.
4. `ok = cfunc.host_save_state(ptr, size)`. If `!ok` → `buf: null`.
5. Copy `Module.HEAPU8[ptr, ptr+size)` into a fresh `Uint8Array`, `free(ptr)`,
   then post `SAVE_STATE_RESULT { slot, buf: ab, cdromId }` — read via
   `cfunc.host_get_cdrom_id()` + `UTF8ToString(ptr, 9)` — with `[ab]` in the
   transfer list (the copy must not alias `Module.HEAPU8`, which the worker
   keeps using).

### `handleLoadState(msg)` — `MSG.LOAD_STATE { slot, buf }` (transferred)

1. If no game / empty buffer → `LOAD_STATE_RESULT { slot, ok: false, error }`.
2. `ptr = cfunc.malloc(len)`. If `0` → `ok: false`.
3. Copy `buf` into `Module.HEAPU8[ptr, ptr+len)` via `new Uint8Array(HEAPU8.buffer, ptr, len).set(new Uint8Array(buf))`.
4. `ok = !!cfunc.host_load_state(ptr, len)`. `free(ptr)`. Post
   `LOAD_STATE_RESULT { slot, ok, error? }` — `retro_unserialize` is the sole
   arbiter of compatibility (e.g. captured under a different disc → `false`).

### Soft vs hard failure

`Emulator.saveState` resolves `null` (not rejects) on any
failure — no game, `serialize_size == 0`, `retro_serialize` false, or a thrown
exception. A serialize glitch does **not** tear down the running session (no
`MSG.FATAL`). `loadState` rejects on `ok:false` — a failed restore leaves the
emu in an undefined state the caller must treat as an error.

## `Emulator.ts` facade

`saveState(slot)` / `loadState(slot, buf)` mirror the memcard export/import
shape:

- Trackers `_saveStatePromises` / `_loadStatePromises` (Map: `slot → {resolve, reject}`).
- `SAVE_STATE_RESULT` resolves with `ArrayBuffer | null`; `LOAD_STATE_RESULT`
  resolves on `ok` / rejects with the worker's `error` string.
- `_rejectAllStatePromises(err)` is called from the `FATAL` case, `_teardown`,
  and `destroy()` — so a pending save/load never dangles after teardown.

`slot` is a client-chosen integer label (or `SLOT_AUTO`) used for log lines
and result correlation; the worker never stores bytes keyed by `slot`.

## `EmulatorClient` persistence stack

- **`client/saveStateStorage.ts`** — `SaveStateStorage` port (`get`, `put`,
  `getAllUnsynced`, `getMeta`, `putMeta`) + `IdbSaveStateStorage` on DB
  `psx-saves` v2: object store `save-states` (keyPath `id` =
  `${discSerial}:${slotToType(slot)}`, indexes `by-synced`,
  `by-pocketbase-id`) + `sync-meta` (keyPath `key`). `SaveStateRecord` =
  `{ id, buf, discSerial, slot, localTimestamp, synced, pocketbaseId, serverUpdated }`.
- **`client/saveStateHeader.ts`** — PSAS header codec. `buildSaveStateHeader(coreBuf, discUrl, cdromId)`
  wraps raw core bytes with magic `'PSAS'` + version + url-length + url +
  9-char game id; `parseSaveStateHeader(buf)` returns
  `{ discUrl, gameId, coreOffset }` or `null` (`coreOffset` = where the raw
  core bytes begin).
- **`client/slotKey.ts`** — `SLOT_AUTO='auto'`; `slotToType(slot)` →
  `'auto'` / `'slot1'` / `slotN`; `typeToSlot(type)` inverts;
  `compositeKey(discSerial, slot)` = `${discSerial}:${type}`;
  `UNSYNCED=0` / `SYNCED=1` flags.
- **`client/SaveStateStore.ts`** — `save(slot, buf, discSerial)` always writes
  `synced: UNSYNCED` (local-first); `load(slot, discSerial)` serves local, and
  on a local miss downloads from the cloud (when authed) and caches with
  `synced: SYNCED`; `hasState(slot, discSerial)`.
- **`client/SaveStateSyncEngine.ts`** — `SYNC_INTERVAL_MS = 1000`; methods
  `setActiveDisc(discSerial)`, `onAuthChange(authed)`, `onVisibilityChange()`,
  `syncIfAuthed()`, `syncNow()`, `dispose()`. On auth it performs a one-shot
  download pass (`_shouldDownload`), then syncs on the interval while the user
  is authed, scoped to the active disc. `_doSync()` uploads unsynced local
  records and downloads newer remote ones; on completion it invokes the
  injected `onSyncComplete` callback (→ EmulatorClient's
  `state-sync-complete` event).
- **`client/save-load.ts`** — `SaveLoadController`:
  - `save(slot, serial)` → `emu.saveState(slot)` → `buildSaveStateHeader(raw, discUrl, cdromId)`
    → `stateStore.save(slot, buf, serial)` → toast + `onSaved()` (→
    `state-saved` event).
  - `load(slot, serial)` → `stateStore.load(slot, serial)` (local + cloud
    cache-on-miss) → `parseSaveStateHeader` → strip header → `emu.loadState(slot, raw)`.
- **`client/EmulatorClient.ts`** — public `saveState(slot)` /
  `loadState(slot)` / `hasState(slot)`; `loadStateFromFile(buf)` strips the
  PSAS header before `emu.loadState(0, raw)`.

PSflix's adapter (`PsxAnywhereEmulatorService`) surfaces these to the UI:
`state-saved` → invalidate `['save-states']`;
`state-sync-complete` → invalidate both `['save-states']` and
`['memory-cards']`; `deleteState` uses the repository's adapter-only
`deleteSaveStateBySlot` (the facade has no delete API — see `AGENTS.md`).

## Concurrency

The worker is single-threaded by build invariant (`USE_PTHREADS=0`). The emu
thread is advanced by the audio-worklet tick driver (`onAudioTick`), which is
a `MessagePort.onmessage` handler. MessagePort messages and the worker's main
`onmessage` share one FIFO queue — a `SAVE_STATE` / `LOAD_STATE` post is
delivered between `tick`s, never preempting one. While `handleSaveState` runs,
no `tick` is being processed, so `retro_serialize` never observes a
half-advanced frame.

`Atomics.wait` on the `controlSAB` (the streaming bridge) can only block inside
a `host_run_frame` → `cdread_chd` → `streaming_io_read` call chain. Save/load
state does not call `host_run_frame`, so it cannot hit that bridge. If
`retro_serialize` / `retro_unserialize` happen to read CD sectors (some cores
snapshot the CD controller state), they go through the same
`streaming_core_file` path gameplay uses — a blocking range fetch resolved by
the main-thread `RemoteChd`/`bridge`, exactly as during a frame. No new
deadlock is introduced.

The one invariant the handlers enforce is `bootHas(BOOT.GAME)` —
serialize/deserialize against an un-booted core is rejected before touching
the C side. There is **no** pause/resume of the audio clock around serialize;
the FIFO argument above makes it unnecessary.

## Persistence, multi-disc

- **Persistence** is `SaveStateStore` (manual _and_ auto-saves) backed by
  `saveStateStorage.ts`. The worker is stateless across all save/load calls —
  `saveState` returns raw core bytes to the client, `loadState` takes raw core
  bytes back. Where the client keeps them (IndexedDB, PocketBase) is the
  client's concern.
- **PSAS header** — the client wraps raw core bytes with a disc-identity
  header (`buildSaveStateHeader`) before persisting, and strips it
  (`parseSaveStateHeader`) before sending to `emu.loadState()`. The Emulator
  facade never knows about header format.
- **Auto-save** — `EmulatorClient` starts a `setInterval` at
  `autoSave.intervalMs` calling `SaveLoadController.save(Emulator.SLOT_AUTO,
currentDiscSerial)` when running; a `pagehide` listener does one extra
  off-and-running auto-save tick. Writes go to `save_state.type = 'auto'`. The
  worker never writes IndexedDB directly.
- **Multi-disc** — save states include a PSAS disc-identity header containing
  the disc URL and game serial (`CdromId`). The client (via
  `parseSaveStateHeader` + `getCdromId()`) can validate the serial against the
  currently loaded game before loading. `EmulatorClient.setActiveDisc(serial)`
  scopes cloud sync to the current disc.

## Cross-references

- [`architecture.md`](./architecture.md) — `MSG.STATE_*` protocol rows,
  `psx-saves` storage keys.
- [`worker.md`](./worker.md) — `host.c` wrappers + the C↔JS boundary.
- [`memcard.md`](./memcard.md) — the analogous export/import round-trip.
- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §10 — slot mapping and the adapter behaviors in
  PSflix.
- [`../../specs/emulator-integration/phase-2.md`](../../specs/emulator-integration/phase-2.md) — cloud sync, conflict policy, query
  invalidation.
