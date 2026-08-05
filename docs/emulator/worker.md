# The worker

The Worker (`src/vendor/psxanywhere/emulator/worker/coreWorker.ts`) is the emu
thread. It loads the self-compiled `pcsx_rearmed` WASM core, owns the libretro
host shim (`host.c`), the streaming-IO bridge's C/JS halves
(`streaming_core_file.c` + `sab_runtime.js`), the WebGL2 render path (`gl/`),
and memory-card file management in MEMFS. This document covers everything that
runs **inside the worker** except the render shaders (those are in
[`render.md`](./render.md)); the main-thread half of the streaming bridge is in
[`stream.md`](./stream.md).

> **Migrated + adapted** from upstream `docs/worker.md` to the vendored tree
> at `src/vendor/psxanywhere/`. Build-time specifics (the `EXPORTED_FUNCTIONS`
> list in `scripts/build-core.js`, the emcc `--js-library` codegen) are NOT
> reproduced here — PSflix never rebuilds the core (see
> [`./README.md`](./README.md)). The C↔JS contract notes are kept because the
> worker ships in-tree and the boundary is load-bearing for understanding the
> runtime.

`coreWorker.ts` is a thin message dispatcher. The actual logic is split into
five sub-modules in a hub-and-spoke pattern:

```
coreWorker.ts  (orchestrator / message dispatcher)
  ├── context.ts     (shared WorkerContext interface + logging/boot helpers; leaf, no deps)
  ├── boot.ts        (init, BIOS/CHD loading, disc swap, tryInitAndLoad)
  ├── audio-clock.ts (sample rate, FPS, master clock, worklet tick handler)
  ├── memcard.ts     (memcard hashing, flush polling, import/export)
  └── save-load.ts   (save/load state serialization)
```

`context.ts` is the dependency root — every other worker module imports from
it. `boot.ts` is the most cross-cutting, importing from `context`,
`audio-clock`, and `memcard`. `audio-clock.ts` and `save-load.ts` are
relatively independent.

## `coreWorker.ts`

The worker entry. Uses `self.postMessage`; exports nothing. A thin dispatcher
(≈250 lines): creates the `WorkerContext` state bag, sets up `self.onmessage`
with a message queue/dispatch pattern, and delegates all logic to the imported
sub-modules.

### Sub-modules

- **`context.ts`** — exports the `WorkerContext` interface (shared mutable
  state: `Module`, `cfunc`, `sabs`, `gl`, `blit`, `crt`, `canvas`, boot flags,
  audio clock fields, frame counters, CRT state) and leaf helpers: `logInfo`,
  `logWarn`, `logError`, `post`, `BOOT` bitmask constants, `bootHas`,
  `MEMCARD_SLOTS`, `memcardPath`, `getTextDecoder`.
- **`boot.ts`** — exports `handleInit`, `handleBios`, `handleChd`,
  `handleCd`, `handleSwapDisc`, `tryInitAndLoad`.
- **`audio-clock.ts`** — exports `sampleRate`, `readFps`,
  `recomputeMasterN`, `onAudioTick`, `warmupTick`.
- **`memcard.ts`** — exports `hashMemcard`, `readMemcardHash`,
  `findMemcardFiles`, `flushMemcards`, `handleMemcardExport`,
  `handleMemcardImport`, `startMemcardFlushPoll`. See
  [`memcard.md`](./memcard.md).
- **`save-load.ts`** — exports `handleSaveState`, `handleLoadState`. See
  [`save-state.md`](./save-state.md).

### Boot

- `BOOT` bitmask: `BIOS=1`, `CD=2`, `GAME=4`. `bootState` tracks progression;
  `tryInitAndLoad()` fires once both `BIOS|CD` bits are set.
- **`TextDecoder` neuter.** Before `import('/pcsx_rearmed.js')` the worker
  sets `self.TextDecoder = undefined`. Emscripten's runtime otherwise calls
  `TextDecoder.decode` on a _resizable_ `ArrayBuffer` (the heap, under
  `ALLOW_MEMORY_GROWTH=1`), which throws. With `TextDecoder` gone the runtime
  falls back to a manual per-byte string walk. The worker keeps a private
  `_TextDecoder` for its own `readSystemInfo` and copies the bytes into a
  non-resizable `Uint8Array` first.
- `main()` imports `/pcsx_rearmed.js` (the committed `PcsxModule` factory in
  `public/`) via a `Blob` URL (so the served `.js` is treated as a module by
  the Worker), instantiates with `{noInitialRun, print, printErr, locateFile}`,
  and wires `cfunc`:
  `sab_init: _sab_init`; `host_init/host_load/host_run_frame/host_get_system_info`
  via `cwrap`; `host_serialize_size/host_save_state/host_load_state` via
  `cwrap`; `host_set_controller_port_device` via `cwrap`;
  `host_swap_disc`/`host_register_disc`/`host_get_cdrom_id` via `cwrap`;
  `streaming_init: cwrap('streaming_core_file_init', ['number','number'])`;
  `malloc`/`free`; `fs_write_file: FS_writeFile`.
- `Module._onStreamingIo = () => self.postMessage({type:'io'})` — this is the
  trigger the main-thread `bridge.ts` listens for.

### Message handlers

- `handleInit` — stores the SABs, `audioTickPort`, `workletSampleRate`
  (default 48000 if not passed), calls `_sab_init(videoSAB, audioSAB,
inputSAB)`, stores `AUDIO_CAPACITY_FRAMES` into `audioHeader[2]`, posts
  `MSG.READY`. Streaming path: gets the `webgl2` context, registers
  `webglcontextlost` → fatal, `createBlit(gl)`, sets the canvas to `1440×960`,
  `new CRTShader(gl, {letterbox:true, displayAspect: canvas.width/canvas.height})`,
  `crt.setSourceTexture(blit.fboTexture, 1, 1)`, `crtOn=true`, wires
  `audioTickPort.onmessage = onAudioTick`.
- `handleBios` — `FS.writeFile('/scph1001.bin', buf)`, sets `BOOT.BIOS`.
- `handleCd` (streaming) — `FS.writeFile('/game.chd', new Uint8Array(0))`
  (stub; the real bytes come over the bridge), stashes
  `Module._streamingControlSab` / `_streamingDataSab` /
  `_streamingControlView` / `_streamingDataView`, calls
  `cfunc.streaming_init(chdTotal | 0, Math.floor(chdTotal / 0x100000000))`,
  sets `BOOT.CD`. (There is no whole-file `handleChd` path in this tree.)
- `handleSwapDisc` — `needsRegister` branch: writes a 0-byte MEMFS stub at
  `path`, calls `cfunc.host_register_disc(slot, path)`. Both branches:
  `cfunc.streaming_init(...)`, then `cfunc.host_swap_disc(slot)`. On success,
  re-reads `CdromId` via `host_get_cdrom_id` and posts
  `MSG.SWAP_DISC_RESULT { ok, cdromId? }`.

Messages received before the WASM module is ready are queued and flushed in
order once `workerReady` flips.

### Init + load

`tryInitAndLoad()`:

1. `host_init()` must return `0` (verifies `retro_api_version`, registers all
   libretro callbacks, `retro_init`, reads av_info, calls
   `sab_set_audio_sample_rate(sample_rate)` and `sab_set_av_fps(fps)`).
2. Posts `MSG.MEMCARD_LOAD_REQUEST` and **awaits** a `MEMCARD_IMPORT_DONE`
   signal before loading the game. The client (`EmulatorClient`) listens,
   syncs memcards (cloud via `MemcardSync.ensureDownloaded()`), then sends
   each card back via `MSG.MEMCARD_IMPORT` and a final
   `MSG.MEMCARD_IMPORT_DONE`. The worker uses a 10 s safety timeout. This
   ordering matters: the core's `load_memcards()` runs inside `host_load`, so
   imported cards must be in MEMFS _before_ `host_load` so it reads them
   instead of `CreateMcd()`-ing fresh empty cards.
3. Reads `sampleRate()` (audio header) + `readFps()` (the Float64 `AV_FPS`
   field). If valid, defaults `workletQuantum=128`, calls
   `recomputeMasterN('init')`.
4. `host_load('/game.chd')` (forces `Config.CHD_Precache = 0`,
   `retro_load_game`, re-reads av_info). The C side `host_load` also `mkdir`s
   `/saves` (the JS-side `Module.FS.mkdir` is unusable under Closure advanced
   mode).
5. Sets `BOOT.GAME`, starts the memcard flush poll, posts `MSG.LOADED` with
   the cached `cdromId` (`host_get_cdrom_id()` → `UTF8ToString(ptr, 9)`).

### The frame clock

`recomputeMasterN(reason)` (in `audio-clock.ts`):

```
ticksPerFrame = (workletSampleRate / fps) / workletQuantum   // fractional
masterN       = max(1, round(ticksPerFrame))
```

Examples: NTSC@48k → `6.25625`; NTSC@44.1k → `5.74827`; PAL@48k → `7.5`.
`readFps()` reassembles the `AV_FPS` Float64 from two `Atomics.load`ed Int32
halves (little-endian).

`onAudioTick(e)`:

- On `'ready'` — records `workletQuantum`, recomputes `masterN` (only while
  the clock is not yet active).
- On `'tick'` (and `audioClockActive`) — `audioTickCount++`,
  `frameAccumulator += 1.0` (capped at `2·ticksPerFrame`), then runs
  `host_run_frame()` **while** `frameAccumulator >= ticksPerFrame`, painting
  each, and subtracting `ticksPerFrame`. This fractional accumulator stops
  59.94 Hz drifting against a 60 Hz quantum host.

`warmupTick()` (streaming-only): runs 10 `host_run_frame()`s on
`setTimeout(0)` before arming `audioClockActive=true`, so the first
user-visible frame has data.

`handleRunStart`: if `frameCount>0` already, no-op; else
`warmupLeft=10; warmupTick()`.
`handleRunStop`: `frameCount=-1`, `audioClockActive=false`, `warmupLeft=0`,
`flushMemcards()`, posts `MSG.RUN_STOPPED`.

### Rendering

`paintFromSab()`: reads `w/h/pitch` from `videoSAB`, calls `blit.resize` /
`crt.setSourceTexture` on size change, `blit.draw(px, w, h, pitch)`; if
`crtOn && crt` → `crt.render()` else `blit.drawToCanvas(canvas.width,
canvas.height)`. See [`render.md`](./render.md).

### Stats

A `setInterval(…, 1000)` posts `MSG.STATS` with `{fps, retroRunCount,
audioTickCount, masterN, audioOverrunCount, streamLocalHits, streamLocalMisses,
streamLocalRefills, streamLocalRefillBytes, audioClockActive, targetFps,
ticksPerFrame}`. `audioOverrunCount` and `streamLocal*` are read off
`Module['_audioOverrunCount']` etc., which `sab_runtime.js` maintains.

### MEMFS paths

| Path                                             | What                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `/scph1001.bin`                                  | the BIOS (`handleBios`)                                                    |
| `/game.chd`                                      | the disc (streaming: 0-byte stub)                                          |
| `/game/{0..7}.chd`                               | pre-registered slots for multidisc (`handleSwapDisc` with `needsRegister`) |
| `/saves/`                                        | created in `host_load` (from C)                                            |
| `/saves/pcsx-card1.mcd`, `/saves/pcsx-card2.mcd` | the two shared memory cards                                                |

## `host.c` / `host.h` — the libretro host

`src/vendor/psxanywhere/emulator/worker/host.c` implements the libretro host.
Its entry points are exported and called from JS via `cwrap`:

| Symbol                             | Signature                                                              | Does                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_host_init`                       | `int host_init(void)`                                                  | `retro_api_version` check, register all `retro_set_*` callbacks, `retro_init`, `retro_get_system_av_info`, `sab_set_audio_sample_rate(sample_rate)`, `sab_set_av_fps(fps)` |
| `_host_load`                       | `int host_load(const char *rom_path)`                                  | `mkdir("/saves", 0777)`, force `Config.CHD_Precache = 0`, `retro_load_game`, require RGB565 (`g_pixel_format_ok`), re-read av_info                                         |
| `_host_run_frame`                  | `void host_run_frame(void)`                                            | `retro_run()`                                                                                                                                                              |
| `_host_get_system_info`            | `void host_get_system_info(char *out, int len)`                        | `snprintf` `library_name\|library_version\|valid_extensions`                                                                                                               |
| `_host_serialize_size`             | `size_t host_serialize_size(void)`                                     | `retro_serialize_size()` (save-state)                                                                                                                                      |
| `_host_save_state`                 | `bool host_save_state(void *out, size_t size)`                         | `retro_serialize(out, size)`                                                                                                                                               |
| `_host_load_state`                 | `bool host_load_state(const void *data, size_t size)`                  | `retro_unserialize(data, size)`                                                                                                                                            |
| `_host_set_controller_port_device` | `void host_set_controller_port_device(unsigned port, unsigned device)` | `retro_set_controller_port_device(port, device)`                                                                                                                           |
| `_host_swap_disc`                  | `bool host_swap_disc(unsigned index)`                                  | `set_eject_state(true)` → `set_image_index(index)` → `set_eject_state(false)`                                                                                              |
| `_host_register_disc`              | `bool host_register_disc(unsigned index, const char *path)`            | `add_image_index()` until `>= index`, then `replace_image_index(index, {path})`                                                                                            |
| `_host_get_cdrom_id`               | `const char* host_get_cdrom_id(void)`                                  | returns the global `CdromId[10]` (9-char PS1 serial + null, e.g. `"SLUS94465"`)                                                                                            |

Callbacks:

- `host_env_cb(env, cmd)` handles:
  - `GET_VARIABLE` → `pcsx_rearmed_bios`/`_bios_jp`/`_bios_eu` →
    `"scph1001.bin"`; `_rgb32_output` → `"disabled"`; `_show_bios_bootlogo` →
    `"enabled"`; **`pcsx_rearmed_memcard1`/`memcard2` → `"shared"`** (the key
    to memcard persistence — fixed card files, see
    [`memcard.md`](./memcard.md)); `SET_VARIABLES` is a no-op.
  - `SET_PIXEL_FORMAT` — requires `RETRO_PIXEL_FORMAT_RGB565`.
  - `GET_SYSTEM_DIRECTORY` → `"/"`; **`GET_SAVE_DIRECTORY` → `"/saves"`**.
  - `GET_LOG_INTERFACE` and several no-op returns.
  - `SET_DISK_CONTROL_INTERFACE` / `SET_DISK_CONTROL_EXT_INTERFACE` — both
    stash the disk-control vtable in `g_disk_ctrl` and set `g_has_disk_ctrl`.
- `host_video_cb` → `sab_publish_video(w, h, pitch, data)` (NULL data →
  0,0,0,NULL).
- `host_audio_batch_cb` → caps at `HOST_AUDIO_SCRATCH_FRAMES = 2048`,
  int16→float32 (`/32768.0`), `sab_publish_audio(frames, scratch)`, returns
  `frames`.
- `host_input_poll_cb` → `sab_load_input` into a `MAX_PORTS * 64` (512-byte)
  scratch, then unpacks each port's 64-byte region into per-port arrays:
  `g_input_buttons[port]` (LE 4 bytes) + lx/ly/rx/ry (int16 LE) + mouse dX/dY
  (int16 LE, bytes 12–15) + lightgun X/Y (uint16 LE, bytes 16–19). It also
  reads the per-port edge-latch slot (bytes 20–23, `INPUT_OFF_EDGE`), folds it
  into `g_input_buttons[port] |= edge`, and calls
  `sab_drain_input_edge_bits(port, edge)` to loss-free clear only the observed
  bits — see [`input.md`](./input.md#edge-latch-input-during-streaming-stalls).
- `host_input_state_cb` — **port-aware**: `if (port >= MAX_PORTS) return 0;`,
  all globals indexed by `port`. JOYPAD (bit `id` of `g_input_buttons[port]`),
  ANALOG (index 0→lx/ly, 1→rx/ry), MOUSE (`RETRO_DEVICE_ID_MOUSE_X`/`_Y`
  consume-once returning `g_input_mouse_dx[port]`/`_dy[port]` then zeroing
  them; `_LEFT`/`_RIGHT` read bits 16/17), LIGHTGUN (`_SCREEN_X`/`_Y` return
  `g_input_lgun_x[port]`/`_y[port]`; `_TRIGGER`/`_AUX_A`/`_IS_OFFSCREEN` read
  bits 18/19/20).

It `extern`s `sab_publish_video`, `sab_publish_audio`, `sab_load_input`,
`sab_drain_input_edge_bits`, `sab_set_audio_sample_rate`, `sab_set_av_fps` —
all provided by `sab_runtime.js` as a `--js-library`. `host.h` declares the
functions above.

## `sab_runtime.js` — the `--js-library`

**Source** plus the strings `__SAB_*__` tokens for the SAB offsets. In the
upstream repo a build step (`materializeSabRuntimeLibrary`) substitutes the
tokens into a generated file; here the committed `public/pcsx_rearmed.{js,wasm}`
are used as-is and the tokens serve as documentation of the layout. Provided
via `addToLibrary` and called from C:

| Function                                       | Called by                           | Does                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sab_init(video, audio, input)`                | `coreWorker.ts`                     | stashes SABs on `Module._videoSab/_audioSab/_inputSab`, inits `_streamLocal*` counters                                                          |
| `sab_publish_video(w,h,pitch,srcPtr)`          | `host_video_cb`                     | copies RGB565 from the heap into `videoSAB`'s pixel area, writes `w/h/pitch/write_idx` into the header                                          |
| `sab_publish_audio(frames, srcPtr)`            | `host_audio_batch_cb`               | writes interleaved Float32 stereo into the `audioSAB` ring (with wraparound), bumps `write_idx`; overruns increment `Module._audioOverrunCount` |
| `sab_load_input(dstPtr)`                       | `host_input_poll_cb`                | copies the whole input SAB (`MAX_PORTS * 64 = 512` bytes via `Module._inputBytes`) into the heap                                                |
| `sab_drain_input_edge_bits(port, keepMask)`    | `host_input_poll_cb`                | `Atomics.and(inputEdgeSlot, ~keepMask)` — loss-free drain of the per-port edge latch                                                            |
| `sab_set_audio_sample_rate(rate)`              | `host_init`                         | `Atomics.store(audioHeader, 3, rate)`                                                                                                           |
| `sab_set_av_fps(fps)`                          | `host_init`                         | writes the `AV_FPS` Float64 at `AUDIO_OFF_AV_FPS`                                                                                               |
| `streaming_io_read(bufPtr, offHi, offLo, len)` | `streaming_core_file.c`'s `cf_read` | the worker half of the bridge                                                                                                                   |

### `streaming_io_read` in detail

This is the worker-side half of the streaming bridge (the main-thread half is
`bridge.ts`; see [`stream.md`](./stream.md)).

1. **Local cache first.** Checks `Module._streamLocalData` (a `Uint8Array`) at
   `Module._streamLocalOffset`. If the request fits inside the cached block,
   copy straight from there → `_streamLocalHits++`. No SAB, no `postMessage`,
   no blocking. This is the steady state.
2. **Otherwise: `_streamLocalMisses++`, then the SAB round-trip.**
   - Compute `blockLen` — **forced to exactly 1 MB** (capped at
     `dataSAB.length`).
   - Write the request into `controlSAB`: `STATE=1`, `OP=0`, `OFF_HI/OFF_LO`,
     `LEN=blockLen`, `FETCH_STAGE=0`.
   - Call `Module._onStreamingIo()` (which posts `{type:'io'}` to the main
     thread).
   - **`Atomics.wait(ctrl, STATE, 1)`** — the emu thread blocks here until the
     bridge stores `RESULT` and sets `STATE=2` and `Atomics.notify`s.
   - On wake: read `n = ctrl[RESULT]`; if `n>0`, copy the bytes into a fresh
     `Uint8Array` stored as the new `_streamLocalData` at offset `off`, then
     copy into `HEAPU8` at `bufPtr`. Return the byte count.

Because `streaming_io_read` is the only thing that ever blocks the emu, the
whole system stays single-threaded and deterministic; `Atomics.wait` is the
one allowed blocking primitive (no pthreads, no async/await on the emu path).

## `streaming_core_file.c` / `.h` — the `core_file` shim

libchdr talks to discs through a `core_file` vtable (`fread`/`fseek`/
`fsize`/`fclose`). `streaming_core_file.c` implements that vtable so every
read goes through `streaming_io_read`:

- `streaming_core_file_init(total_lo, total_hi)` — exported as
  `_streaming_core_file_init`; sets the file's `g_length` and resets
  `g_offset`. Called from `coreWorker.ts#handleCd` (and `handleSwapDisc`).
- `streaming_core_file_get(void)` — returns `&s_cf`, a single static
  `core_file` with the streaming vtable. Called by the patched `handlechd()`.
- `cf_read` computes `len = size*nmemb`, clamps to `[0, g_length-off]`, calls
  `streaming_io_read(buf, off>>32, off&0xFFFFFFFF, len)`; on `n>0` advances
  `g_offset += n` and returns `n/size`; else 0.
- `cf_seek` handles `whence` 0/1/2, clamps to `[0, g_length]`.
- `cf_fsize` returns `g_length`; `cf_close` is a no-op.

A short read (`n < len`) is safe — libchdr's `core_file` reader re-reads. The
single static `core_file` means only one streaming file is open at a time
(fine — only the CHD, and a disc swap re-`chd_open_core_file`s on the same
vtable). `streaming_core_file.h` is included by both `streaming_core_file.c`
and the patched `libpcsxcore/cdriso.c`.

## The `handlechd` patch

A ~21-line unified diff against `libpcsxcore/cdriso.c`. Inside the `#ifdef
HAVE_CHD` block it adds `#include "streaming_core_file.h"` and swaps
`chd_open_file(cdHandle, CHD_OPEN_READ, NULL, &chd_img->chd)` for
`chd_open_core_file(streaming_core_file_get(), CHD_OPEN_READ, NULL, &chd_img->chd)`.
`Config.CHD_Precache = 0` is enforced in `host.c#host_load`, not by a patch —
precaching the whole CHD would defeat the streaming design.

> The patch lives in the upstream build tree (`core/build/patches/`). The
> vendored tree ships the _compiled_ artifacts; the patch file itself is not
> copied. See [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §12 (core rebuild is out of scope).

## `worker_shim.c`

A tiny file: `void worker_shim_noop(void) {}`. It exists only so emcc has a
second C translation unit to link alongside `host.c` (a single `.c` plus a `.a`
archive can otherwise confuse the link step). Not exported or called.

## C↔JS boundary cheat-sheet

| JS calls C (`_symbol`)                                                                                                                                                                                                                     | C calls JS (`addToLibrary`)                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_host_init`, `_host_load`, `_host_run_frame`, `_host_get_system_info`, `_host_serialize_size`, `_host_save_state`, `_host_load_state`, `_host_set_controller_port_device`, `_host_swap_disc`, `_host_register_disc`, `_host_get_cdrom_id` | `sab_init`, `sab_publish_video`, `sab_publish_audio`, `sab_load_input`, `sab_drain_input_edge_bits`, `sab_set_audio_sample_rate`, `sab_set_av_fps`, `streaming_io_read` |
| `_streaming_core_file_init`, `_malloc`, `_free`                                                                                                                                                                                            |                                                                                                                                                                         |

JS-side properties the worker writes onto `Module` (from `coreWorker.ts` /
`boot.ts`, not `sab_runtime.js`, so Closure's bracket-notation trap doesn't
apply): `Module._streamingControlSab`, `Module._streamingDataSab`,
`Module._streamingControlView`, `Module._streamingDataView`,
`Module._onStreamingIo`, plus the counters `Module._streamLocalHits` etc.

## Cross-references

- [`architecture.md`](./architecture.md) — SAB layouts and the `MSG.*`
  protocol this worker speaks.
- [`stream.md`](./stream.md) — the main-thread half of the bridge
  (`bridge.ts` + `ChunkStore`).
- [`render.md`](./render.md) — `blit.ts`, `crt-shader.ts`, the shaders.
- [`memcard.md`](./memcard.md) — memcard vars + IDB + MEMFS.
- [`save-state.md`](./save-state.md) — `host.c` wrappers + concurrency.
