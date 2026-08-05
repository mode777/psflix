# Architecture

A playable PS1 game in the browser: a self-compiled `pcsx_rearmed` core runs
inside a **Web Worker** as a single-threaded WASM module, the disc image is a
CHD streamed over HTTP `206` range requests, and the emu thread blocks on
async range fetches via `Atomics.wait()` over `SharedArrayBuffer`s. The whole
design hinges on `crossOriginIsolated === true` (COOP/COEP), which is what
unlocks `SharedArrayBuffer` + `Atomics.wait` in a Worker.

> **Migrated + adapted.** This mirrors the upstream PSxAnywhere
> `docs/architecture.md`, rewritten for the **vendored** tree at
> `src/vendor/psxanywhere/` (a newer revision whose client layer is the
> single `EmulatorClient` facade, streaming-only — the `?load=whole` /
> `canvas.ts` path is gone). See [`./README.md`](./README.md).

This document is the map: the thread model, the five SABs, the `MSG.*`
postMessage protocol, the file-by-file layout, and the boot sequence. The
deeper articles are [`stream.md`](./stream.md) (the streaming cache),
[`worker.md`](./worker.md) (the worker/C side), [`render.md`](./render.md)
(the WebGL2 path), and [`memcard.md`](./memcard.md) (memory-card persistence).

## Thread model

Two threads, one emu:

```
   main thread (PSflix React + vendored client)     worker thread (vendored emulator/worker/*)
   ─────────────────────────────────────────        ───────────────────────────────────────────
   PsxAnywhereEmulatorService ── facade/adapter     coreWorker.ts ── message dispatcher
   EmulatorClient ── boot, load, reset, sync        boot.ts/audio-clock.ts/memcard.ts/save-load.ts
   bridge.ts ── streaming-IO servicing              host.c ── libretro callbacks
   RemoteChd/ChunkStore ── HTTP + Cache API         sab_runtime.js ── JS-library
   input.ts ── keyboard/gamepad → inputSAB          gl/blit.ts + crt-shader.ts
   AudioManager ── AudioContext + worklet
   audio-worklet.ts ── frame clock + audio
```

- The **emu thread is the worker.** It runs `retro_run_frame()` once per audio
  tick. It is single-threaded (`USE_PTHREADS=0`); the only blocking primitive
  is `Atomics.wait()`, which suspends the worker on a control SAB slot until
  the main thread services a CHD range request and `Atomics.notify`s it.
- The **frame clock is the AudioWorklet** (`src/vendor/psxanywhere/emulator/audio-worklet.ts`).
  Its `process()` callback posts `tick` messages on a `MessagePort` to the
  worker; the worker accumulates fractional ticks and calls `host_run_frame()`
  when one frame's worth has elapsed (NTSC ≈ 59.94 fps). This keeps audio and
  video locked to the host's audio hardware clock.
- The **main thread never touches the emu's memory.** All shared state goes
  through the five `SharedArrayBuffer`s below.

## The public surface (PSflix-specific)

PSflix never talks to the `Emulator` class or the worker directly. The
integration points are:

| Surface                                         | Where                                                         | Role                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmulatorClient`                                | `src/vendor/psxanywhere/client/EmulatorClient.ts`             | Single facade PSflix constructs per console session (canvas + repository). Owns the `Emulator` instance, input, IDB persistence, cloud sync. Exposes the `canvas-replaced`, `state-saved`, `state-sync-complete`, `auth-change` events PSflix's adapter consumes. |
| `PsxAnywhereEmulatorService`                    | `src/features/console/services/psxAnywhereEmulatorService.ts` | PSflix's own `EmulatorService` implementation wrapping one `EmulatorClient`, bridging its events into the zustand store + react-query.                                                                                                                            |
| `PsxAnywhereRepository`                         | `src/features/console/services/psxAnywhereRepository.ts`      | Implements the vendored `Repository` interface over PSflix's `pb` singleton.                                                                                                                                                                                      |
| `Repository` interface + `PocketbaseRepository` | `src/vendor/psxanywhere/repository/repository.ts`             | The upstream contract. `PocketbaseRepository` is provided but PSflix uses its own adapter (one auth source).                                                                                                                                                      |

## The five SABs

All allocated on the main thread in `Emulator.ts` and posted to the worker in
the `MSG.INIT` message (the canvas is also transferred there for the
OffscreenCanvas path). Sizes and slot layouts live in
`src/vendor/psxanywhere/emulator/sab/layout.js` — that file is the single source
of truth.

| SAB          | Constant            | Bytes     | Backing type                               | Writers → Readers                                  |
| ------------ | ------------------- | --------- | ------------------------------------------ | -------------------------------------------------- |
| `videoSAB`   | `VIDEO_SAB_BYTES`   | 1,048,592 | Int32[4] header + Uint16 RGB565            | C `sab_publish_video` → worker `blit`              |
| `audioSAB`   | `AUDIO_SAB_BYTES`   | 384,024   | Int32[4]/Float64 hdr + Float32 stereo ring | C `sab_publish_audio` → `audio-worklet.ts`         |
| `inputSAB`   | `INPUT_SAB_BYTES`   | 512       | Int32 per-port region (8 × 64 B)           | `input.ts` (per-port writers) → C `sab_load_input` |
| `controlSAB` | `CONTROL_SAB_BYTES` | 28        | Int32[7]                                   | worker `streaming_io_read` ↔ `bridge.ts`           |
| `dataSAB`    | `DATA_SAB_BYTES`    | 4,194,304 | Uint8 (4 MB)                               | `bridge.ts` → worker `streaming_io_read`           |

### VIDEO SAB (`src/vendor/psxanywhere/emulator/sab/layout.js`)

`VIDEO_SAB_BYTES = VIDEO_HEADER_BYTES (16) + VIDEO_PIXEL_BYTES (1024·512·2)`.
Max backing store is 1024×512 RGB565 (larger than any PSX mode); the active
width/height/pitch are in the header.

| Byte | Constant              | Writer | Meaning                                     |
| ---- | --------------------- | ------ | ------------------------------------------- |
| 0    | `VIDEO_OFF_WRITE_IDX` | C      | monotonic write index (wraps at 0x7fffffff) |
| 4    | `VIDEO_OFF_WIDTH`     | C      | frame width (px)                            |
| 8    | `VIDEO_OFF_HEIGHT`    | C      | frame height (px)                           |
| 12   | `VIDEO_OFF_PITCH`     | C      | row pitch (bytes)                           |
| 16…  | pixels                | C      | `Uint16Array` of RGB565                     |

### AUDIO SAB

`AUDIO_SAB_BYTES = AUDIO_HEADER_BYTES (24) + AUDIO_CAPACITY_FRAMES (48000) · AUDIO_FRAME_BYTES (8)`.
Stereo interleaved Float32. The ring capacity (48000 frames ≈ 1 s of audio)
is deliberate headroom over the PS1 SPU rate (44100).

| Byte  | Constant                     | Writer                          | Meaning                                          |
| ----- | ---------------------------- | ------------------------------- | ------------------------------------------------ |
| 0     | `AUDIO_OFF_WRITE_IDX`        | C (`sab_publish_audio`)         | ring write index (frames, mod capacity)          |
| 4     | `AUDIO_OFF_READ_IDX`         | worklet                         | ring read index (frames, mod capacity)           |
| 8     | `AUDIO_OFF_CAPACITY`         | JS (`coreWorker.ts`)            | capacity = 48000                                 |
| 12    | `AUDIO_OFF_SAMPLE_RATE`      | C (`sab_set_audio_sample_rate`) | SPU rate (44100)                                 |
| 16…23 | `AUDIO_OFF_AV_FPS` (Float64) | C (`sab_set_av_fps`)            | `g_av_info.timing.fps` (NTSC 59.940, PAL 50.008) |
| 24…   | samples                      | C                               | `Float32Array`, stereo L,R,L,R…                  |

> The `AV_FPS` Float64 occupies bytes 16..23 and needs a `Float64Array` view;
> `audioHeaderView()` only covers the first four Int32s (0..15).

### INPUT SAB

`INPUT_SAB_BYTES = MAX_PORTS * INPUT_PORT_BYTES = 8 * 64 = 512`. Each port's
64-byte region is laid out below. Written by `client/input.ts` on a
`requestAnimationFrame` loop and on key/mouse events; read by C
`sab_load_input`. `MAX_PORTS = 8` matches `pcsx_rearmed/frontend/libretro.c`'s
`PORTS_NUMBER` (multitap-capable build). The button mask is a full int32:
bits 0–15 are the RetroPad joypad buttons, 16–20 carry mouse/lightgun state.
The **edge latch** at `INPUT_OFF_EDGE` (byte 20, slot 5) lets rising-edge
button writes survive streaming stalls — see
[`input.md`](./input.md#edge-latch-input-during-streaming-stalls).

| Byte (within port) | Constant                  | Writer | Meaning                                                                                                                                  |
| ------------------ | ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0                  | `INPUT_OFF_BUTTONS`       | JS     | int32 button bitmask (bits 0–15 joypad; 16=mouse-left, 17=mouse-right, 18=lightgun-trigger, 19=lightgun-aux, 20=lightgun-offscreen)      |
| 4                  | `INPUT_OFF_LX_LY`         | JS     | `(lx                                                                                                                                     | (ly<<16))` int16 pair                                   |
| 8                  | `INPUT_OFF_RX_RY`         | JS     | `(rx                                                                                                                                     | (ry<<16))` int16 pair                                   |
| 12                 | `INPUT_OFF_MOUSE_PACK`    | JS     | `(dX                                                                                                                                     | (dY<<16))` int16 mouse-delta pair                       |
| 16                 | `INPUT_OFF_LIGHTGUN_PACK` | JS     | `(X                                                                                                                                      | (Y<<16))` uint16 lightgun coord pair (X 0–511, Y 0–255) |
| 20                 | `INPUT_OFF_EDGE`          | JS     | int32 edge-latch — rising edge OR'd in by `Emulator.orEdgeBits(port, bits)`; loss-free-drained by `sab_drain_input_edge_bits` after read |

### CONTROL SAB (streaming-IO mailbox)

`CONTROL_SAB_BYTES = 28` (7 Int32). See [`stream.md`](./stream.md) for the
state machine; the layout:

| Byte | Constant                  | Writer      | Meaning                                                            |
| ---- | ------------------------- | ----------- | ------------------------------------------------------------------ |
| 0    | `CONTROL_OFF_STATE`       | worker↔main | `0`=idle, `1`=waiting (worker blocked in `Atomics.wait`), `2`=done |
| 4    | `CONTROL_OFF_OP`          | worker      | operation; `0`=read                                                |
| 8    | `CONTROL_OFF_OFF_HI`      | worker      | byte offset high 32 bits                                           |
| 12   | `CONTROL_OFF_OFF_LO`      | worker      | byte offset low 32 bits                                            |
| 16   | `CONTROL_OFF_LEN`         | worker      | requested length (capped to `DATA_SAB_BYTES`)                      |
| 20   | `CONTROL_OFF_RESULT`      | main        | bytes read, or `-1` on error                                       |
| 24   | `CONTROL_OFF_FETCH_STAGE` | main        | `0`=PENDING, `1`=CACHE, `2`=NETWORK (read by the worklet)          |

### DATA SAB

`DATA_SAB_BYTES = 4·1024·1024` (4 MB). `dataView(sab)` = `Uint8Array(sab, 0)`.
Written by `bridge.ts` with the fetched chunk; copied out by
`sab_runtime.js#streaming_io_read` into the in-worker local block cache and
then into `HEAPU8`.

## Message protocol

`src/vendor/psxanywhere/emulator/messages.js` defines the `MSG` object — the
string constants used as `type` in `postMessage` between the `Emulator` /
`EmulatorClient` and `coreWorker.ts`. (The worker's internal `log`/`fatal`
posts still use literal strings and must match the `MSG` values; this is
intentional and noted in the file.)

| MSG name                       | String                         | Direction   | Payload                                                                                                                                                                                          |
| ------------------------------ | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INIT`                         | `init`                         | main→worker | `{ sabs:{videoSAB,audioSAB,inputSAB,controlSAB,dataSAB}, audioTickPort, audioContextSampleRate, canvas? }` (canvas + port2 transferred)                                                          |
| `BIOS`                         | `bios`                         | main→worker | `{ buf }` (transferred)                                                                                                                                                                          |
| `CD`                           | `cd`                           | main→worker | `{ url, chdTotal }` (streaming; no buffer)                                                                                                                                                       |
| `RUN_START`                    | `run:start`                    | main→worker | `{}`                                                                                                                                                                                             |
| `RUN_STOP`                     | `run:stop`                     | main→worker | `{}`                                                                                                                                                                                             |
| `CRT_TOGGLE`                   | `crt:toggle`                   | main→worker | `{ on:boolean }`                                                                                                                                                                                 |
| `CRT_PARAM`                    | `crt:param`                    | main→worker | `{ key:string, value:number }`                                                                                                                                                                   |
| `MEMCARD_EXPORT`               | `memcard:export`               | main→worker | `{ slot:1\|2 }`                                                                                                                                                                                  |
| `MEMCARD_IMPORT`               | `memcard:import`               | main→worker | `{ slot, buf }` (transferred)                                                                                                                                                                    |
| `MEMCARD_IMPORT_DONE`          | `memcard:import:done`          | main→worker | `{}` (sent after the last `MEMCARD_IMPORT` so the worker can await completion before `host_load`)                                                                                                |
| `MEMCARD_FLUSH`                | `memcard:flush`                | main→worker | `{}` (also sent on `visibilitychange=hidden`)                                                                                                                                                    |
| `SAVE_STATE`                   | `state:save`                   | main→worker | `{ slot }` (client-chosen integer label, or `SLOT_AUTO`)                                                                                                                                         |
| `LOAD_STATE`                   | `state:load`                   | main→worker | `{ slot, buf }` (transferred)                                                                                                                                                                    |
| `SET_CONTROLLER_DEVICE`        | `set:controller-device`        | main→worker | `{ port, device }` (device = `CONTROLLER.*` constant)                                                                                                                                            |
| `SWAP_DISC`                    | `swap:disc`                    | main→worker | `{ slot, path, chdTotal, needsRegister }` (`needsRegister=true` for the first time a slot is used)                                                                                               |
| `READY`                        | `ready`                        | worker→main | `{ info:string }` (`name\|ver\|ext`)                                                                                                                                                             |
| `LOADED`                       | `loaded`                       | worker→main | `{ cdromId?:string }` (the core's `CdromId` extracted from `SYSTEM.CNF`; cached by the facade)                                                                                                   |
| `RUN_STOPPED`                  | `run:stopped`                  | worker→main | `{}`                                                                                                                                                                                             |
| `FRAME`                        | `frame`                        | worker→main | `{}` (defined; not used by the streaming app path)                                                                                                                                               |
| `STATS`                        | `stats`                        | worker→main | `{ fps, retroRunCount, audioTickCount, masterN, audioOverrunCount, streamLocalHits, streamLocalMisses, streamLocalRefills, streamLocalRefillBytes, audioClockActive, targetFps, ticksPerFrame }` |
| `FATAL`                        | `fatal`                        | worker→main | `{ msg:string }`                                                                                                                                                                                 |
| `LOG`                          | `log`                          | worker→main | `{ level:'info'\|'warn'\|'error', msg:string }`                                                                                                                                                  |
| `IO`                           | `io`                           | worker→main | `{}` (triggers `bridge.ts`)                                                                                                                                                                      |
| `MEMCARD_EXPORT_RESULT`        | `memcard:export:result`        | worker→main | `{ slot, buf?:Uint8Array }`                                                                                                                                                                      |
| `MEMCARD_IMPORT_RESULT`        | `memcard:import:result`        | worker→main | `{ slot, ok:boolean, error?:string }`                                                                                                                                                            |
| `MEMCARD_LOAD_REQUEST`         | `memcard:load-request`         | worker→main | `{}` (worker requests memcard data at boot)                                                                                                                                                      |
| `SAVE_STATE_RESULT`            | `state:save:result`            | worker→main | `{ slot, buf?:ArrayBuffer, cdromId?:string }` (transferred; `buf:null` if no game / soft fail)                                                                                                   |
| `LOAD_STATE_RESULT`            | `state:load:result`            | worker→main | `{ slot, ok:boolean, error?:string }`                                                                                                                                                            |
| `SET_CONTROLLER_DEVICE_RESULT` | `set:controller-device:result` | worker→main | `{ ok:boolean, port, device }`                                                                                                                                                                   |
| `SWAP_DISC_RESULT`             | `swap:disc:result`             | worker→main | `{ ok:boolean, cdromId?:string, error?:string }`                                                                                                                                                 |

`SAVE_STATE` / `LOAD_STATE` run synchronously on the worker between frame
ticks (the worker is single-threaded; save/load does not call
`host_run_frame`, so it cannot race the audio clock or hit the streaming
bridge). See [`save-state.md`](./save-state.md).

The AudioWorklet↔worker protocol uses raw strings (not `MSG`) on the
`audioTickPort`: worklet→worker `{type:'tick'}` and `{type:'ready', quantum}`;
main→worklet `{type:'dither', on}` on `audioNode.port`.

## File map (vendored tree)

```
src/vendor/psxanywhere/
  client/                         the `emulator-client` alias barrel
    index.ts                      barrel: EmulatorClient + types
    EmulatorClient.ts             single facade — canvas, input, IDB, cloud sync
    input.ts / input-pure.ts / input-constants.ts
    controller-store.ts / rebind-store.ts / rebind-mutation.ts / rebind-capture.ts
    SaveStateStore.ts             local CRUD + cloud cache-on-miss
    SaveStateSyncEngine.ts        cloud sync (download-on-auth, debounce)
    saveStateStorage.ts           SaveStateStorage port + Idb adapter
    saveStateHeader.ts            PSAS header codec
    saveStateConflict.ts          last-write-wins conflict policy
    slotKey.ts                    slot ↔ PB `type` mapping
    memcardStorage.ts             MemcardStorage port + Idb adapter
    MemcardSync.ts                cloud memcard sync (SHA-256 dedup)
    save-load.ts                  SaveLoadController (orchestration)
    bios.ts                       BiosLoader (localStorage cache)
    idb.ts                        shared IDB promise helpers
    local-json.ts                 localStorage JSON codec
  emulator/                       the `emulator-core` alias barrel
    index.ts                      barrel: Emulator, CONTROLLER, BUTTON, MSG, …
    Emulator.ts                   facade class (spawns worker; streaming only)
    AudioManager.ts               AudioContext + worklet + gain + failure retry
    messages.js                   MSG.* contract + CONTROLLER constants (.js)
    buttons.ts                    BUTTON bit positions
    bridge.ts                     main-thread half of streaming-IO bridge + Speculator
    RemoteChd.ts                  HEAD + range-read façade over ChunkStore
    ChunkStore.ts                 Cache API + in-flight dedup + retry/backoff
    audio-worklet.ts              RingProcessor: drains audioSAB, drives frame ticks
    perfWarn.ts                   rate-limited perf diagnostics
    rgb565.ts                     RGB565→RGBA8 lookup table
    sab/
      layout.js                   SAB byte sizes + slot offsets (source of truth)
    worker/
      coreWorker.ts               Worker: thin message dispatcher
      context.ts                  WorkerContext interface + boot helpers
      boot.ts                     boot sequencing, BIOS/CHD loading, disc swap
      audio-clock.ts              sample rate, FPS, master clock, worklet tick handler
      memcard.ts                  memcard hashing, flush polling, import/export
      save-load.ts                save/load state serialization
      host.c / host.h             libretro host shim (env/video/audio/input callbacks)
      sab_runtime.js              --js-library: sab_* + streaming_io_read (source)
      streaming_core_file.c/.h    core_file shim → streaming_io_read
      worker_shim.c               dead noop (link-stability placeholder)
      gl/
        blit.ts                   RGB565→RGBA8 unpack at native PSX res (WebGL2)
        crt-shader.ts             newpixie 4-pass CRT chain
        shaders/                  fullscreen.vert, unpack.frag (inlined via ?raw)
  repository/                     the `repository` alias barrel
    index.ts                      barrel
    repository.ts                 Repository interface + PocketbaseRepository
```

`public/pcsx_rearmed.{js,wasm}` (the committed build artifacts) are served at
the **origin root** (`/pcsx_rearmed.js`, `/pcsx_rearmed.wasm`) — see
[`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.2. `scripts/test/controller-constants.test.js`
guards the `CONTROLLER` values + INPUT SAB offsets.

## Boot sequence

1. PSflix `ConsoleView` → `PsxAnywhereEmulatorService.attachCanvas(canvas)` →
   `new EmulatorClient({ canvas, repository })` → `client.boot()` → creates the
   `Emulator`, allocates the 5 SABs, installs `AudioManager` / `input`,
   `audio.setup()` (creates `AudioContext`, force-`suspend()`s if it came up
   `running`, loads the worklet, wires `audioChannel.port1`→worklet /
   `port2`→worker), then `_setupWorker()` posts `MSG.INIT` (transferring the
   canvas + `audioTickPort`).
2. The worker (`coreWorker.ts#handleInit`) stores the SABs, calls
   `_sab_init(videoSAB, audioSAB, inputSAB)`, writes `AUDIO_CAPACITY_FRAMES`
   into the audio header, builds the WebGL2 context + `blit` + `CRTShader`
   on the transferred `OffscreenCanvas` (1440×960), wires
   `audioTickPort.onmessage = onAudioTick`, and posts `MSG.READY` with the
   system info string.
3. `client.loadDisc({ chdUrl, serial, onProgress })` — BIOS comes from
   `DiskRequest.bios`, or the vendored `BiosLoader` (from `biosUrl` or the
   repository's `fetchBiosUrl()`), possibly cached in `localStorage`
   (`psxanywhere-bios-v1`). Streaming path: `new RemoteChd` → `open()` (HEAD) →
   `installBridge(...)` → `MSG.CD`. Worker (`handleCd`) writes a 0-byte
   `/game.chd`, stashes `Module._streamingControlSab`/`_streamingDataSab`,
   calls `streaming_init(chdTotal_lo, chdTotal_hi)`.
4. Worker `tryInitAndLoad`: `host_init()` (registers libretro callbacks,
   `retro_init`, reads av_info, `sab_set_audio_sample_rate` + `sab_set_av_fps`),
   `mkdir('/saves')` (from C, inside `host_load`), sends `MSG.MEMCARD_LOAD_REQUEST`
   and awaits `MEMCARD_IMPORT_DONE` (the client syncs + sends cards), reads
   `sampleRate()`/`readFps()`, `recomputeMasterN('init')`, `host_load('/game.chd')`
   (forces `Config.CHD_Precache = 0`, `retro_load_game`), starts the memcard
   flush poll, posts `MSG.LOADED` with `cdromId`.
5. `EmulatorClient` on `MSG.LOADED` → emits `loaded`; PSflix sets runtime
   status. `Emulator.loadDisc` resolves, backfills the serial from
   `getCdromId()`, and `client.loadDisc` calls `_stateSync.setActiveDisc(serial)`.
6. User presses **Play** (PSflix `GameWindow` click handler) →
   `client.start()` → `Emulator.start()` resumes the `AudioContext` (genuine
   click gesture) then posts `MSG.RUN_START`. Worker runs a 10-frame
   `setTimeout` warmup then arms `audioClockActive`. Thereafter the worklet's
   `tick` messages drive `host_run_frame()` at the host audio clock.

## Reset lifecycle (session recreate)

Reset is implemented at the facade level — `EmulatorClient.reset()`
(spec.md §10.4 / `AGENTS.md`):

1. Guard against concurrent resets (`_resetInProgress`, `_gen` bump).
2. Stop auto-save + `_stateSync.setActiveDisc(null)`.
3. Best effort `oldEmu.stop()` + bounded wait for `stopped` (3 s).
4. Best effort `flushMemcards()`, unbind events, `input.destroy()`,
   `oldEmu.destroy()`.
5. **Canvas swap:** `this._canvas.cloneNode(false)` + `replaceWith(newCanvas)`
   (shallow clone — no children), reassign `this._canvas`.
6. Recreate `Emulator` + `InputController`, rebind, `await emu.init()`.
7. If the generation is still current, dispatch **`canvas-replaced`**
   `{ detail: { canvas } }`, then restart auto-save.

`bridge.ts` participates via `BridgeHandle.dispose()`, which detaches worker
message listeners, stops the speculator timer, and suppresses late async
callbacks from mutating torn-down sessions.

## Persistent storage keys

- **localStorage** —
  - `psxanywhere-bios-v1` (`client/bios.ts`) — base64 BIOS cache.
  - `psanywhere-controllers-v1` (`client/controller-store.ts`) — controller
    configs.
  - `psanywhere-input-v2-port{N}` (`client/rebind-store.ts`) — per-port rebind
    maps (v2, W3C-standard gamepad layout).
  - `psflix:console-settings`, `psflix:memcard-slots:<userId>` — PSflix's own
    UI state (`AGENTS.md`).
- **IndexedDB** —
  - `psx-memcards` (v1) — memory cards (`client/memcardStorage.ts`), store
    `memcards`, out-of-line keys `"1"` / `"2"`. See [`memcard.md`](./memcard.md).
  - `psx-saves` (v2) — save states (`client/saveStateStorage.ts`), stores
    `save-states` (keyPath `id` = `${discSerial}:${type}`, indexes
    `by-synced` / `by-pocketbase-id`) + `sync-meta`. See [`save-state.md`](./save-state.md).
- **Cache API** — cache name `psanywhere-chunks-v1`
  (`ChunkStore.ts#DEFAULT_CACHE_NAME`), keys `${chdUrl}?__chunk=${idx}`, one
  `Response` per 1 MB chunk index. See [`stream.md`](./stream.md).

## Cross-references

- [`stream.md`](./stream.md) — streaming cache internals.
- [`worker.md`](./worker.md) — worker/C side, `handlechd` patch.
- [`render.md`](./render.md) — WebGL2 blit + CRT.
- [`memcard.md`](./memcard.md), [`save-state.md`](./save-state.md),
  [`input.md`](./input.md) — the client-side subsystems.
- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) — integration decisions and config.
