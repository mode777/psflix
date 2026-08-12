# Emulator facade API

The `Emulator` class (`src/vendor/psxanywhere/emulator/Emulator.ts`) is the
low-level facade that runs a playable PS1 in the browser. It owns all
plumbing a consumer should never touch directly: the five
`SharedArrayBuffer`s, the Web Worker, the `AudioContext` + worklet
(delegated to `AudioManager`), and the streaming CHD bridge.

> **Migrated + adapted** from upstream `docs/api.md`. Two notes for PSflix:
>
> 1. PSflix does **not** instantiate `Emulator` directly — it uses the
>    higher-level `EmulatorClient` facade
>    (`src/vendor/psxanywhere/client/EmulatorClient.ts`), which wraps an
>    `Emulator` plus input, IDB persistence and cloud sync. See
>    [`./README.md`](./README.md). This doc still describes the `Emulator`
>    surface for anyone reading the vendored core.
> 2. The vendored tree is **streaming-only** (`?load=whole` and
>    `emulator/canvas.ts` are gone). Everything below reflects that.

Import via the `emulator-core` path alias (resolves through `tsconfig.json`
and `vite.config.ts`):

```ts
import { Emulator } from 'emulator-core';
```

## Lifecycle state machine

```
constructed → initing → ready → loading → loaded → running → stopped
                                                              ↑    │
                                                              └────┘
                                                         (start/stop)
Any state → destroyed  (via destroy())
```

The progression is: `init()` → `loadDisc()` → `start()` → `stop()` /
`start()` (repeatable) → `destroy()`. Reset is implemented at the
`EmulatorClient` level as a **session recreate** — see
[`architecture.md`](./architecture.md#reset-lifecycle-session-recreate).

## Construction

```ts
const emu = new Emulator(opts?)
```

| Option         | Type                   | Default | Description                                                          |
| -------------- | ---------------------- | ------- | -------------------------------------------------------------------- |
| `canvas`       | `HTMLCanvasElement`    | —       | Render target. **Required** (streaming-only mode throws if missing). |
| `cacheEnabled` | `boolean`              | `true`  | Enable the Cache API chunk store for streaming.                      |
| `onLog`        | `function(level, msg)` | `null`  | Receives all internal log messages (`'info'`, `'warn'`, `'error'`).  |

Throws synchronously if `crossOriginIsolated` is false or required browser
features (`OffscreenCanvas`, `AudioContext`, `AudioWorkletNode`) are missing.

## Static constants

### `Emulator.CONTROLLER`

Controller device types for `setPortDevice()`:

| Constant    | Value   | PS1 device                       |
| ----------- | ------- | -------------------------------- |
| `STANDARD`  | `0x001` | Standard digital pad             |
| `ANALOG`    | `0x105` | Analog joystick (SCPH-1110)      |
| `DUALSHOCK` | `0x205` | DualShock analog pad (SCPH-1150) |
| `NEGCON`    | `0x305` | NegCon steering controller       |
| `MOUSE`     | `0x102` | PS1 mouse (SCPH-1030)            |
| `GUNCON`    | `0x104` | Guncon lightgun (SCPH-G1)        |
| `JUSTIFIER` | `0x204` | Konami Justifier lightgun        |

See [`input.md`](./input.md#controller-types) for details on each type.

### `Emulator.BUTTON`

Button bit positions for `setButtons()` (also `EmulatorClient.BUTTON_BU2` /
`BUTTON_LABELS`):

| Constant             | Bit | PS1 button          |
| -------------------- | --- | ------------------- |
| `B`                  | 0   | Cross               |
| `Y`                  | 1   | Triangle            |
| `SELECT`             | 2   | Select              |
| `START`              | 3   | Start               |
| `UP`                 | 4   | D-pad Up            |
| `DOWN`               | 5   | D-pad Down          |
| `LEFT`               | 6   | D-pad Left          |
| `RIGHT`              | 7   | D-pad Right         |
| `A`                  | 8   | Circle              |
| `X`                  | 9   | Square              |
| `L`                  | 10  | L1                  |
| `R`                  | 11  | R1                  |
| `L2`                 | 12  | L2                  |
| `R2`                 | 13  | R2                  |
| `L3`                 | 14  | L3                  |
| `R3`                 | 15  | R3                  |
| `MOUSE_LEFT`         | 16  | Mouse left button   |
| `MOUSE_RIGHT`        | 17  | Mouse right button  |
| `LIGHTGUN_TRIGGER`   | 18  | Lightgun trigger    |
| `LIGHTGUN_AUX`       | 19  | Lightgun aux        |
| `LIGHTGUN_OFFSCREEN` | 20  | Lightgun off-screen |

### `Emulator.SLOT_AUTO`

Auto-save slot sentinel (`'auto'`). Use as the `slot` argument to
`saveState()` / `loadState()` for auto-saves.

### `Emulator.CRT_SHADER_DEFAULT_PARAMS`

Re-exported CRT parameter defaults (from `crt-shader.ts`). Use for the
"Reset to defaults" button in the CRT settings panel.

## Lifecycle methods

### `async init()`

Sets up the audio graph (`AudioContext` + `AudioWorkletNode` via
`AudioManager`) and spawns the Worker. Resolves when the Worker reports
`READY` (core initialized). Must be called before `loadDisc()`.

### `async loadDisc(req)`

Receives BIOS bytes from the client, opens the disc image, and arms the
streaming bridge (HTTP `206` range-backed path). Resolves when the Worker
reports `LOADED` (game in MEMFS, ready to run).

| Parameter        | Type              | Required | Description                                               |
| ---------------- | ----------------- | -------- | --------------------------------------------------------- |
| `req.bios`       | `ArrayBuffer`     | **Yes**  | BIOS image bytes. The client owns fetching/caching.       |
| `req.chdUrl`     | `string`          | **Yes**  | CHD disc image URL.                                       |
| `req.onProgress` | `function(float)` | No       | Called with 0..1 download progress (streaming path only). |

### `async start()`

Resumes the `AudioContext` (user-gesture-required) and posts `RUN_START` to
the Worker. Emulation begins. Call from a user interaction (click/tap)
handler so the audio resume succeeds.

### `stop()`

Posts `RUN_STOP` to the Worker. Emulation pauses. Safe to call when already
stopped. Call `start()` to resume.

### `destroy()`

Tears down all live resources (Worker, `AudioContext`, streaming bridge). The
instance is unusable afterwards. Idempotent. (`EmulatorClient.reset()` uses
stop → flush → destroy → recreate; `destroy()` alone is the hard teardown.)

## Multidisc

The facade mirrors real PS1 hardware: you load a disc, it runs; you swap a
disc by URL, it runs.

### `async swapDisc(url)`

Swaps to a different disc by URL. No-op if already on that disc. On first use
of a new URL, the disc is registered with the core automatically (up to 8
unique URLs). The streaming bridge is hot-swapped to the new disc's URL.

### `getCdromId()`

Returns the cached game serial (e.g. `"SLUS94465"`), or `null` before
`LOADED`. The serial is extracted from `SYSTEM.CNF` inside the CHD during
boot. If extraction fails, the value is `"SLUS99999"`. Use this to check the
currently inserted disc's identity — e.g. before deciding whether to swap
discs when restoring a save state.

### `getCurrentDiscUrl()`

Returns the URL of the currently loaded disc, or `null` before `LOADED`.
Use this when building a PSAS save-state header (the header records which
disc URL the state was captured under).

## Controller management

### `setPortDevice(port, device)`

Sets the PS1 controller device type for a port. The core reconfigures how it
interprets that port's input data.

- `port` — `0` to `MAX_PORTS - 1` (8 ports, matching `libretro.c`'s
  `PORTS_NUMBER`).
- `device` — an `Emulator.CONTROLLER.*` constant.

Fire-and-forget; the Worker posts a `controller:device-set` event on
completion.

## Input methods

The facade writes directly to the `inputSAB` SharedArrayBuffer via
`Atomics.store`. It holds no per-port state, no event listeners, and no
gamepad polling — that is the client's concern. See [`input.md`](./input.md)
for the browser-event utility (`client/input.ts`) that wraps these calls.

### `setButtons(port, bitmask)`

Sets the 32-bit button mask for a port. Bits 0–15 are RetroPad joypad
buttons; bits 16–20 are mouse/lightgun extended bits. OR together
`Emulator.BUTTON.*` constants.

### `orEdgeBits(port, bits)`

ORs the given bits into the per-port **edge-latch** slot (`INPUT_OFF_EDGE`).
Used by `input.ts` to make a button _tap_ (rising edge) survive a streaming
stall — see [`input.md`](./input.md#edge-latch-input-during-streaming-stalls).

### `setAnalog(port, stick, x, y)`

Sets one analog stick's position. `stick` — `'left'` or `'right'`; `x`, `y` —
`-1..1` (deadzone 0.08, scaled to int16).

### `setMouseDelta(port, dx, dy)`

Sets packed mouse deltas for a port (`MOUSE` device). Call once per frame;
the Worker consumes and zeros these on read.

### `setLightgunPosition(port, x, y)`

Sets lightgun screen coordinates for a port (`GUNCON`/`JUSTIFIER` device).
Coordinates are in the PS1's lightgun range: X 0–511, Y 0–255.

### `clearInput(port)`

Zeroes all input (buttons, analog, mouse, lightgun) for a port.

## Audio

### `setVolume(v)`

Sets master volume. `v` is `0..1`. Internally sets the `GainNode` value and
tracks mute state. (Auto-retry audio startup lives in `AudioManager` — see
[`audio-startup-bug.md`](./audio-startup-bug.md).)

## CRT post-processing

### `setCrt(on)`

Enables (`true`) or disables (`false`) the CRT shader effect. On by default.
Posts `CRT_TOGGLE` to the Worker.

### `setCrtParam(key, value)`

Sets an individual CRT shader parameter at runtime. Posts `CRT_PARAM` to the
Worker. See [`render.md`](./render.md) for available parameters.

## Memory cards

PS1 memory card persistence. See [`memcard.md`](./memcard.md). In the
streaming-only tree the Emulator **never persists to IDB** — persistence is
the client's job (vendored `memcardStorage.ts`, driven by `EmulatorClient`).

### `sendMemcardsToWorker(cards)`

Takes a `ReadonlyMap<number, Uint8Array|null>` (slot → card bytes, or `null`
for empty) and posts `MEMCARD_IMPORT` for each non-empty slot, then a final
`MEMCARD_IMPORT_DONE` so the worker can await completion before `host_load`
→ `load_memcards()` runs. `EmulatorClient` calls this from its internal
`memcard-load-request` handler (after syncing from the cloud).

### `async exportMemcard(slot)`

Resolves with the card image bytes (`Uint8Array`) or `null` if the slot is
empty. `slot` is `1` or `2`. Rejects on Worker error.

### `async importMemcard(slot, buf)`

Imports a card image. `slot` is `1` or `2`; `buf` is an `ArrayBuffer` (or
`Uint8Array`). The buffer is transferred to the Worker (a copy). Resolves on
success; rejects with the Worker's error string.

### `flushMemcards()`

Fire-and-forget flush of dirty cards (posts `MEMCARD_FLUSH`). The Emulator
also flushes on `visibilitychange` (hidden) and `run:stop`. The client does
not need to call this for periodic flush — only for explicit user actions.

> **Note:** the higher-level `EmulatorClient` adds two host-facing memcard
> methods on top of the `Emulator` surface:
>
> - `setMemcardSlotBinding(slot: 1|2, binding: { id, label } | null)` — tell
>   the facade which cloud card is mounted in a slot (or `null` to unbind). The
>   vendored `MemcardSync` uses the binding to route dirty exports and
>   downloads. Must be called before `boot()` for boot-restore to pull the right
>   bytes; the host reads the cloud `mounted` field and the library.
> - `syncMemcards()` — trigger a download pass for every bound slot (writes
>   IDB; the worker picks it up on the next boot or `memcard-load-request`).
>   Used by the host after reconciling bindings with the cloud on auth.
>
> Both delegate to `MemcardSync` (see [`memcard.md`](./memcard.md)).

## Save / load state

Serializes and restores the running PS1's full machine state. The Worker is
stateless across calls — bytes go to/from the client; no persistence layer
ships here. See [`save-state.md`](./save-state.md).

**Important:** `saveState()` returns **raw core bytes** (no header);
`loadState()` accepts **raw core bytes** (no header). The client is
responsible for wrapping/stripping the PSAS disc-identity header using
`buildSaveStateHeader()` / `parseSaveStateHeader()` from
`client/saveStateHeader.ts`.

### `async saveState(slot)`

Serializes the core to an `ArrayBuffer`. `slot` is a client-chosen integer
label, or `Emulator.SLOT_AUTO` for auto-saves. Resolves with
`ArrayBuffer | null` — `null` on soft failure (no game, serialize failed).
Does **not** reject on failure; does **not** tear down the session.

### `async loadState(slot, buf)`

Restores a previously serialized state. `buf` must be a non-empty
`ArrayBuffer` of **raw core bytes** (no PSAS header). Resolves on success;
rejects if the state is incompatible or empty. A failed restore leaves the
emu in an undefined state — treat rejection as an error.

### PSAS header utilities (client layer — `client/saveStateHeader.ts`)

- `buildSaveStateHeader(coreBuf, discUrl, cdromId)` — wraps raw core bytes
  with the disc-identity header (magic `'PSAS'` + version + url + 9-char
  serial).
- `parseSaveStateHeader(buf)` — returns `{ discUrl, gameId, coreOffset }` or
  `null` if no valid header. `coreOffset` is where the raw core state begins.

Import from `saveStateHeader.ts` (client concern, not part of the Emulator
facade):

```ts
import { parseSaveStateHeader } from 'emulator-client';
const header = parseSaveStateHeader(stateBuf);
if (header && header.gameId !== emu.getCdromId()) {
  // wrong game — don't load
}
```

## Cache management

### `async evictCache()`

Stops the Speculator pre-fetcher and calls `RemoteChd.evict()` to clear the
Cache API chunk store. Does not reload the page.

## Stats

### `getStats()`

Returns a snapshot of the last stats object (Worker stats merged with
`RemoteChd.getStats()`). For fresh numbers, listen to the `stats` event
instead.

## Events

`Emulator` extends `EventTarget`. All event details are frozen objects on
`event.detail`.

| Event                   | Detail                 | When                                                                   |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `ready`                 | `{ info: string }`     | Worker initialized, core loaded.                                       |
| `loaded`                | `{}`                   | Game loaded into MEMFS, ready to run.                                  |
| `stopped`               | `{}`                   | Emulation paused (`RUN_STOPPED`).                                      |
| `frame`                 | `{}`                   | A video frame was produced.                                            |
| `stats`                 | `object`               | Worker + streaming stats merged.                                       |
| `buffering`             | `{ visible: boolean }` | Streaming buffer overlay show/hide.                                    |
| `fatal`                 | `{ msg: string }`      | Unrecoverable error. Instance torn down.                               |
| `log`                   | `{ level, msg }`       | Internal log message forwarded.                                        |
| `controller:device-set` | `{ ok, port, device }` | Result of `setPortDevice()`.                                           |
| `disc-swapped`          | `{ url }`              | Disc swap completed (`swapDisc()`).                                    |
| `memcard-load-request`  | `{}`                   | Worker ready for memcard data (client calls `sendMemcardsToWorker()`). |
| `memcard-exported`      | `{ slot, buf }`        | A memcard was flushed from MEMFS (= dirty write detected).             |

For PSflix, `EmulatorClient` adds a higher-level event set — `canvas-replaced`,
`state-saved`, `state-sync-complete`, `auth-change`, `gamepad-*` — consumed by
`PsxAnywhereEmulatorService` (see `AGENTS.md`).

## Complete example (EmulatorClient, the PSflix surface)

```ts
import { EmulatorClient } from 'emulator-client';
import type { Repository } from 'repository';

const client = new EmulatorClient({
  canvas: document.getElementById('screen'),
  repository: myRepository, // Repository interface (PSflix: PsxAnywhereRepository)
  autoSave: { intervalMs: 5 * 60_000 },
});
await client.boot(); // Emulator.init() under the hood
await client.loadDisc({ chdUrl, serial, onProgress });
await client.start(); // user gesture required for audio
await client.saveState(0);
await client.loadState(0);
client.destroy();
```

## Cross-references

- [`architecture.md`](./architecture.md) — SAB layouts, message protocol,
  boot sequence.
- [`input.md`](./input.md) — browser-event input utility, key maps,
  controller types, edge latch.
- [`memcard.md`](./memcard.md) — memory card persistence.
- [`save-state.md`](./save-state.md) — save / load state round-trip,
  concurrency, PSAS header.
- [`render.md`](./render.md) — WebGL2 blit, CRT shader.
- [`worker.md`](./worker.md) — Worker internals, `host.c`, `sab_runtime.js`.
