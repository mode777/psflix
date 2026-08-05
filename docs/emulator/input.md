# Input bindings

PSflix ships the vendored PSxAnywhere input stack. Default keyboard + standard
gamepad mappings exist for the PlayStation 1 (RetroPad); bindings persist in
`localStorage` (rebind maps per port; controller configs under
`psanywhere-controllers-v1`). PSflix exposes this through its own `PortManager`
React UI and the `EmulatorService.setController` adapter — the underlying
`client/input.ts` / `RebindStore` API is unchanged and vendored.

> **Migrated + adapted** from upstream `docs/input.md`. The dev-panel/Bindings
> UI described upstream is psanywhere-specific; PSflix's UI (PortManager,
> OptionsDialog) is React. The key maps, controller types, device gating, and
> edge-latch internals below are identical and apply verbatim.

## Architecture

Input is a **client-side concern**. The `Emulator` facade exposes
PlayStation-centric write methods (`setButtons`, `setAnalog`,
`setMouseDelta`, `setLightgunPosition`, `clearInput`) that write directly to
the `inputSAB` SharedArrayBuffer. The facade does not install browser event
listeners or poll gamepads — that is the client's responsibility.

The vendored `src/vendor/psxanywhere/client/input.ts` module translates
browser events (keyboard, gamepad, mouse) into facade calls:

```
Browser events ──→ input.ts (InputController) ──→ Emulator.setButtons/setAnalog/...
                                                   │
                                                   ▼
                                               inputSAB (SharedArrayBuffer)
                                                   │
                                                   ▼
                                        Worker: host_input_poll_cb → host_input_state_cb
```

`EmulatorClient` constructs an `InputController` internally at `boot()` and
wires each configured controller's writer to it. `EmulatorService.setController`
maps PSflix's `ControllerType` → `EmulatorClient.CONTROLLER.*` device + source.

### Minimal programmatic access (via the facade)

```ts
import { EmulatorClient } from 'emulator-client';

const client = new EmulatorClient({ canvas, repository });
await client.boot();
// port 0 defaults to a STANDARD keyboard pad (created in the constructor).
// To switch device type:
client.setController(0, EmulatorClient.CONTROLLER.DUALSHOCK);
```

## Default keyboard map

From `client/input-constants.ts` (`DEFAULT_KEY_MAP`, re-exported by
`client/input.ts`):

| Key          | RetroPad bit              |
| ------------ | ------------------------- |
| `ArrowUp`    | `BUTTON.UP` (4)           |
| `ArrowDown`  | `BUTTON.DOWN` (5)         |
| `ArrowLeft`  | `BUTTON.LEFT` (6)         |
| `ArrowRight` | `BUTTON.RIGHT` (7)        |
| `Enter`      | `BUTTON.START` (3)        |
| `Tab`        | `BUTTON.SELECT` (2)       |
| `z` / `Z`    | `BUTTON.B` (0) (cross)    |
| `x` / `X`    | `BUTTON.A` (8) (circle)   |
| `a` / `A`    | `BUTTON.Y` (1) (triangle) |
| `s` / `S`    | `BUTTON.X` (9) (square)   |
| `q` / `Q`    | `BUTTON.L` (10) (L1)      |
| `w` / `W`    | `BUTTON.R` (11) (R1)      |
| `e` / `E`    | `BUTTON.L2` (12) (L2)     |
| `r` / `R`    | `BUTTON.R2` (13) (R2)     |
| `Space`      | `BUTTON.B` (cross, alt)   |
| `Escape`     | `BUTTON.A` (circle, alt)  |

## Default gamepad map (W3C standard mapping)

From `client/input-constants.ts` (`DEFAULT_GAMEPAD_MAP`):

| Gamepad button        | RetroPad bit                |
| --------------------- | --------------------------- |
| 0 (A)                 | `BUTTON.B` (cross, 0)       |
| 1 (B)                 | `BUTTON.A` (circle, 8)      |
| 2 (X)                 | `BUTTON.Y` (triangle, 1)    |
| 3 (Y)                 | `BUTTON.X` (square, 9)      |
| 4 (LB / L1)           | `BUTTON.L` (L1, 10)         |
| 5 (RB / R1)           | `BUTTON.R` (R1, 11)         |
| 6 (LT / L2)           | `BUTTON.L2` (L2, 12)        |
| 7 (RT / R2)           | `BUTTON.R2` (R2, 13)        |
| 8 (Back)              | `BUTTON.SELECT` (2)         |
| 9 (Start)             | `BUTTON.START` (3)          |
| 10 (L3)               | `BUTTON.L3` (14)            |
| 11 (R3)               | `BUTTON.R3` (15)            |
| 12 (D-Up)             | `BUTTON.UP` (4)             |
| 13 (D-Down)           | `BUTTON.DOWN` (5)           |
| 14 (D-Left)           | `BUTTON.LEFT` (6)           |
| 15 (D-Right)          | `BUTTON.RIGHT` (7)          |
| `axes[0]` / `axes[1]` | `LX` / `LY` (deadzone 0.08) |
| `axes[2]` / `axes[3]` | `RX` / `RY`                 |

When no specific gamepad is bound to a port (`gamepadIndex < 0`), the writer
falls back to every connected standard-mapped gamepad so the d-pad and face
buttons drive the PS1 even if the port's source is `keyboard`. The gamepad is
polled once per `requestAnimationFrame`; plug it in at any time (the next rAF
tick picks it up via `gamepadconnected` / `gamepaddisconnected`).

## Rebinding

Rebinds persist per port: `localStorage['psanywhere-input-v2-port{N}']`
JSON maps of button-bit → key/button name (`client/rebind-store.ts`,
`RebindStore`; pure mutation helpers in `client/rebind-mutation.ts`). The v2
key uses the W3C-standard gamepad layout (L2/R2/Select/Start/L3/R3/d-pad at
indices 6–15). To reset port 0:

```js
localStorage.removeItem('psanywhere-input-v2-port0');
location.reload();
```

PSflix does not (yet) ship a rebind UI — that is future work (see
[`../../specs/emulator-integration/phase-2.md`](../../specs/emulator-integration/phase-2.md) "Future work"). The vendored capture state
machine (`client/rebind-capture.ts`) is ready and unit-tested; a future
`OptionsDialog` rebind table can drive it.

## Controller types

The emulator supports switching the PS1 controller type at runtime, per port.
This affects how the core interprets button bits and analog axes from that
port's 64-byte region of the input SAB — a standard pad ignores analog sticks;
a DualShock reads them.

Available types (`Emulator.CONTROLLER.*` / `EmulatorClient.CONTROLLER.*`):

| Constant    | Value   | PS1 device                       |
| ----------- | ------- | -------------------------------- |
| `STANDARD`  | `0x001` | Standard digital pad             |
| `ANALOG`    | `0x105` | Analog joystick (SCPH-1110)      |
| `DUALSHOCK` | `0x205` | DualShock analog pad (SCPH-1150) |
| `NEGCON`    | `0x305` | NegCon steering controller       |
| `MOUSE`     | `0x102` | PS1 mouse (SCPH-1030)            |
| `GUNCON`    | `0x104` | Guncon lightgun (SCPH-G1)        |
| `JUSTIFIER` | `0x204` | Konami Justifier lightgun        |

Default: `STANDARD` on port 0 (created by `EmulatorClient`). The input SAB
`MAX_PORTS = 8` matches `libretro.c`'s `PORTS_NUMBER` (multitap-capable); the
constants are guarded by `scripts/test/controller-constants.test.js`.

### ControllerConfig

`ControllerConfig` (`client/input.ts`) is a serializable value object
(`port/device/source/keyMap/gamepadMap/gamepadIndex`) with
`toJSON()` / `fromJSON()`, a stable `id`, `isValid()`, and `clone(overrides)`.
`EmulatorClient.setController(port, cfg)` accepts either a `ControllerConfig`
or a `CONTROLLER.*` device constant (the adapter builds the config for PSflix).

### Multi-port

The input SAB carries one 64-byte region per port (`MAX_PORTS = 8`). Each port
is configured independently; only configured ports are non-zero in the SAB
(unconfigured ports stay zeroed and `update_input()` skips `PSE_PAD_TYPE_NONE`).
**Keyboard sharing:** multiple keyboard-mapped controllers share the same
physical keyboard; a key press routes to every controller whose `keyMap`
contains it. **Mouse source singularity:** only one port should be the mouse
source; if two ports request `source: 'mouse'`, only the first accumulates
deltas.

### Hot-plugging

`EmulatorClient` listens for `gamepadconnected`/`gamepaddisconnected` and
dispatches `gamepad-connected`/`gamepad-disconnected`; it auto-assigns a newly
connected pad's index to the first port whose config has `source: 'gamepad'`
with `gamepadIndex === -1`.

### Mouse

Setting the device to `MOUSE` makes the browser mouse drive the PS1 mouse:
movement accumulates `movementX`/`movementY` and publishes once per
`requestAnimationFrame` via `emu.setMouseDelta()`; left → `BUTTON.MOUSE_LEFT`
(bit 16), right → `BUTTON.MOUSE_RIGHT` (bit 17); right-click is intercepted
(`contextmenu` suppressed). Keyboard emulation (optional): with `MOUSE`,
`Shift` + arrows move the cursor ±3 per press. No pointer lock is applied by
the utility — a client may call `canvas.requestPointerLock()`.

### Lightgun (Guncon / Justifier)

Setting the device to `GUNCON` or `JUSTIFIER` maps the canvas-relative pointer
position to the PS1's lightgun range (X 0–511, Y 0–255) and publishes it via
`emu.setLightgunPosition()` every frame. Trigger = mouse left
(`BUTTON.LIGHTGUN_TRIGGER`, bit 18); aux = mouse right (`BUTTON.LIGHTGUN_AUX`,
bit 19); off-screen is a dedicated bit 20 driven by `mouseleave`/`mouseenter`
— not a coordinate sentinel.

### Device-class gating

Keyboard and gamepad joypad contributions (bits 0–15 and analog sticks) are
only written when the device is joypad-class (`STANDARD`/`ANALOG`/`DUALSHOCK`/
`NEGCON`). Mouse/lightgun writes are likewise gated to their own device
classes. This gating is handled by the `input.ts` writers.

## Edge latch (input during streaming stalls)

The input pipeline is **level-triggered**: the rAF loop re-publishes the
held-button mask to the `inputSAB` every display frame, and the worker's
`host_input_poll_cb` copies the whole SAB once per emulated frame. This is
correct for _held_ keys, but a quick tap can be lost when no poll runs.

The streaming CHD backend parks the worker in `Atomics.wait` on every chunk
miss (cache hit ~5 ms, network 206 fetch 100–500+ ms). While parked, the
audio worklet suppresses the `{type:'tick'}` post that drives
`host_run_frame()` (see [`stream.md`](./stream.md#input-during-stalls)), so
`host_input_poll_cb` does **not** run. A tap fully contained in the stall
window would be invisible to the next poll.

The **edge latch** closes this gap. Each port's 64-byte region has an extra
Int32 slot `INPUT_OFF_EDGE` (byte 20, slot 5):

- On every `publish()`, `input.ts` computes the rising edges of the button
  mask (`~prevMask & buttonMask`) and `Atomics.or`s them into the port's edge
  slot via `Emulator.orEdgeBits(port, bits)`. The rAF loop keeps running
  during a stall, so a rising edge that arrives while the worker is parked is
  latched.
- In `host_input_poll_cb`, after the bulk SAB copy, the worker reads the edge
  slot, folds it into `g_input_buttons[port] |= edge` (one-shot), then calls
  `sab_drain_input_edge_bits(port, edge)` which `Atomics.and`s with `~edge` —
  clearing **only** the bits it observed, so an edge that arrived between the
  bulk copy and the drain survives for the next poll.

A tap fully contained in a stall thus registers as a one-frame press on the
next poll instead of being silently lost. Two presses of the same button
during one stall coalesce into a single one-frame press — acceptable, since
one frame is enough for a game to register a tap. Mouse/lightgun button bits
(16–20) ride the same latch; mouse _deltas_ do not and remain stall-lossy.
The edge offset is duplicated as a literal in `host.c` (`p[20..23]`) and
`sab_runtime.js` (`port*64+20`); the sync is guarded by
`scripts/test/controller-constants.test.js`.

### Window blur

The `window` `blur` listener (`input.ts`) does **not** clear held keys.
Clearing on alt-tab/notification loses holds that browsers do not re-fire
`keydown` for on refocus. Instead `down` is kept intact: the rAF loop
continues publishing the held state, and browsers deliver `keyup` for keys
released while blurred in practice. A key released in another app while our
window is blurred may not deliver a `keyup` — the accepted trade-off for not
losing holds on focus return. (The edge latch above is unrelated to blur; it
only covers stall windows.)

## Button constants

Button bit positions are exported from `src/vendor/psxanywhere/emulator/buttons.ts`
and re-exported as `Emulator.BUTTON` / `EmulatorClient.BUTTON`:

| Constant                    | Bit | Label               |
| --------------------------- | --- | ------------------- |
| `BUTTON.B`                  | 0   | B (cross)           |
| `BUTTON.Y`                  | 1   | Y (triangle)        |
| `BUTTON.SELECT`             | 2   | SELECT              |
| `BUTTON.START`              | 3   | START               |
| `BUTTON.UP`                 | 4   | UP                  |
| `BUTTON.DOWN`               | 5   | DOWN                |
| `BUTTON.LEFT`               | 6   | LEFT                |
| `BUTTON.RIGHT`              | 7   | RIGHT               |
| `BUTTON.A`                  | 8   | A (circle)          |
| `BUTTON.X`                  | 9   | X (square)          |
| `BUTTON.L`                  | 10  | L1                  |
| `BUTTON.R`                  | 11  | R1                  |
| `BUTTON.L2`                 | 12  | L2                  |
| `BUTTON.R2`                 | 13  | R2                  |
| `BUTTON.L3`                 | 14  | L3                  |
| `BUTTON.R3`                 | 15  | R3                  |
| `BUTTON.MOUSE_LEFT`         | 16  | Mouse left button   |
| `BUTTON.MOUSE_RIGHT`        | 17  | Mouse right button  |
| `BUTTON.LIGHTGUN_TRIGGER`   | 18  | Lightgun trigger    |
| `BUTTON.LIGHTGUN_AUX`       | 19  | Lightgun aux        |
| `BUTTON.LIGHTGUN_OFFSCREEN` | 20  | Lightgun off-screen |

## Cross-references

- [`api.md`](./api.md) — the facade input methods (`setButtons`, `setAnalog`,
  `orEdgeBits`, …).
- [`architecture.md`](./architecture.md) — INPUT SAB layout + edge latch slot.
- [`stream.md`](./stream.md) — why input taps are at risk during stalls.
- [`worker.md`](./worker.md) — `host_input_poll_cb` / `host_input_state_cb`.
