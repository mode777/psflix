# Spec — Fast-Forward (cycle 2× / 4×) for the console

Status: **Planned**. Phased: FF-1 (frame-clock speed control in the vendored worker)
→ FF-2 (service-layer orchestration + audio muting) → FF-3 (toggle UX, hardening,
docs, final gates).
Implementation plans: [`ff-1-frame-clock-speed-control.md`](./ff-1-frame-clock-speed-control.md),
[`ff-2-service-orchestration-and-audio.md`](./ff-2-service-orchestration-and-audio.md),
[`ff-3-toggle-ux-hardening-and-gates.md`](./ff-3-toggle-ux-hardening-and-gates.md).

## 1. Goal

Let a player **temporarily speed up a running game** (classic "fast-forward") to
skip through slow sections, grind/farm faster, or blow past dialogue and
cutscenes. Concretely:

1. A **toggle button** in the GameWindow controls cycles the play-speed
   `1× → 2× → 4× → 1×` (a single press enables 2×, next press 4×, next press back
   to real-time).
2. While fast-forwarding the game **runs more frames than real-time** (2× ≈ 119.88
   fps NTSC / 100 fps PAL, 4× ≈ 239.76 / 200).
3. **Audio is muted** while fast-forwarding and restored to the user's volume
   setting when it ends (the SPU overproduces audio at >1×; the ring silently
   drops overflow, so leaving it unmuted sounds chopped/pitched).
4. Fast-forward is **temporary and non-persistent**: it never changes how save
   states are written, it resets to 1× on pause/reset/leave, and it is not stored
   in `ConsoleSettings`.

Non-goals: no rewind, no per-game frame-skip tuning, no slow-motion, no
cutscene-skip that hunts for state-change heuristics. Slowing below 1× is
deliberately out of scope (a _different_ feature could reuse the same seam).

## 2. Decisions (locked)

| #   | Decision                      | Choice                                                                                                                                                                                                                                          |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Activation model              | **Toggle button only** (no keyboard hotkey). Button lives in the GameWindow top-right controls and cycles 1×→2×→4×→1×.                                                                                                                          |
| 2   | Multiplier set                | **2× and 4×** only. Fixed, not configurable (no `ConsoleSettings` change).                                                                                                                                                                      |
| 3   | Audio during FF               | **Mute while FF is active, restore afterwards.** The service (not the UI) owns the gain dance so `setVolume` restores from the current `settings.masterVolume`, even if the user changes volume mid-FF.                                         |
| 4   | Mechanism for running faster  | **Scale the worker frame clock**: the worker already runs `host_run_frame()` N× per real second by accumulating a frame budget per audio-worklet tick. Speed doubles/triples the budget, so frames run faster than wall-clock. No core rebuild. |
| 5   | Vendored-tree changes         | **Yes, minimal adaptation**, matching the existing PAL-pacing adaptation. New `MSG.RUN_SPEED` + `Emulator.setSpeed()` + `EmulatorClient.setSpeed()`. Must be re-applied on any future re-copy of `src/vendor/psxanywhere/`.                     |
| 6   | Speed authority in the worker | `ctx.speedMul` (worker) is the single source of truth. The service mirrors it (`1                                                                                                                                                               | 2   | 4`) only for UI state + mute bookkeeping. Worker resets to `1`on`run:stop`and clamps to`[1, 4]`. |
| 7   | FF vs streaming               | No special handling: FF is bounded by CHD streaming throughput (the existing `buffering`/silence UX applies on stalls). Documented as a known limit, not engineered around.                                                                     |
| 8   | Persistence                   | None. Nothing about FF is serialized; a reload always starts at 1×.                                                                                                                                                                             |

## 3. Background — how the frame clock actually works (read before touching anything)

The emulator is **audio-hardware-clocked**; there is no JS `setInterval`/`rAF`
frame loop for the running game:

1. `src/vendor/psxanywhere/emulator/audio-worklet.ts` — the AudioWorklet
   `RingProcessor.process()` runs every audio quantum (128 frames @ host sample
   rate) and, when the worker is not blocked on a streaming read, posts
   `{ type: 'tick' }` on `tickPort` (`audio-worklet.ts:220-230`). This is a hard
   **real-time** cadence (~344 ticks/sec @ 48 kHz).
2. `src/vendor/psxanywhere/emulator/worker/audio-clock.ts` — worker-side
   `onAudioTick` accumulates a frame budget and emits frames when it crosses the
   threshold:
   ```ts
   ctx.audioTickCount++;
   ctx.frameAccumulator += 1.0;                                   // :80
   if (ctx.frameAccumulator > 2 * ctx.ticksPerFrame) ctx.frameAccumulator = 2 * ctx.ticksPerFrame; // :81
   while (ctx.frameAccumulator >= ctx.ticksPerFrame) {            // :82
     ctx.cfunc.host_run_frame();                                  // :83
     ...
     paintFromSab();
     ctx.frameAccumulator -= ctx.ticksPerFrame;
   }
   ```
   `ticksPerFrame = workletSampleRate / fps / quantum` (`worker/timing.ts:24`,
   ≈5.74 ticks/frame @48k/128 for NTSC 59.94). So one `host_run_frame()` runs per
   **~5.74 real-time quanta** — exactly real-time playback.
3. `paintFromSab` (`worker/coreWorker.ts:90-116`) blits the RGB565 frame to the
   OffscreenCanvas on the worker thread; it runs synchronously inside each
   `onAudioTick` frame in the loop above.

### The lever for fast-forward

If per-tick we add `speedMul` to `ctx.frameAccumulator` instead of `1.0`, the
same real-time tick stream drives **`speedMul`× more `host_run_frame()` calls per
second** — i.e. 2× = 120 fps of simulation while the wall clock stays put. The
audio ring (`sab_publish_audio`, `worker/sab_runtime.js:45-84`) is non-blocking
and caps its writes to free ring space, incrementing `_audioOverrunCount`
(observability only) — so the worker never blocks on over-produced audio; it just
drops the excess. That drop is why **muting during FF** (Decision 3) is the right
call: unmuted FF is chopped/pitched.

Why this is safe and complete:

- **No WASM rebuild.** `audio-clock.ts`/`coreWorker.ts`/`messages.js` are worker
  TS bundled by Vite (the committed `pcsx_rearmed.{js,wasm}` is untouched).
- **The worker never blocks on audio**, so running more frames can't deadlock; the
  only blocking primitive stays `Atomics.wait` on the streaming controlSAB.
- **Input keeps working**: `input.ts` writes the current button state to `inputSAB`
  continuously (`src/vendor/psxanywhere/client/input.ts` rAF loop); each
  `host_run_frame` reads the latest state, so holding a direction during FF works.
- **Save/load/autosave are frame-tick gated**, not wall-clock gated; FF just makes
  game-time advance faster between the same operations.

### The ceiling nobody can bypass

FF multiplies CHD range-read demand proportionally. 4× ≈ 4× the read events/sec at
the same residency, bounded by the Cache API + Speculator prefetch + network. On a
cold cache, or in FMV/cutscene-heavy sections, the worker stalls on a range read
(worker parked, worklet sees `CONTROL_STATE_WAITING`, audio outputs silence, the
existing `buffering` overlay shows). This is the **primary runtime risk** (see §6)
and is _expected behavior_, not a bug to engineer around in v1 — 2× is broadly
reliable; 4× is best-effort.

## 4. Architecture after the change

```
GameWindow (toggle button, cycles 1→2→4→1)
   │  useFastForward → emulatorService.setSpeed(n)
   ▼
PsxAnywhereEmulatorService (speed slice 1|2|4; muted/restore-volume bookkeeping)
   │  EmulatorClient.setSpeed(n)   (passthrough)
   ▼
Emulator.setSpeed(n) ──postMessage──▶ coreWorker: msg RUN_SPEED → ctx.speedMul = n
   ▼
audio-worklet ticks (real-time, unchanged)
   ▼
onAudioTick: frameAccumulator += speedMul  →  speedMul× host_run_frame()/sec
```

Removed/changed: **nothing** outside the listed files. The AudioWorklet is
**untouched** — no `build-worklet.mjs` rebuild. The WASM core is **untouched**.

## 5. Scope map (files touched, whole feature)

| Layer                        | File                                                          | Change                                                             |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vendored core (FF-1)         | `src/vendor/psxanywhere/emulator/messages.js`                 | Add `MSG.RUN_SPEED = 'run:speed'`.                                 |
|                              | `src/vendor/psxanywhere/emulator/worker/timing.ts`            | Add pure `advanceFrameBudget`; export via barrel.                  |
|                              | `src/vendor/psxanywhere/emulator/worker/audio-clock.ts`       | Use `advanceFrameBudget` with `ctx.speedMul`.                      |
|                              | `src/vendor/psxanywhere/emulator/worker/coreWorker.ts`        | `ctx.speedMul`; handle `RUN_SPEED`; reset on stop; STATS fields.   |
|                              | `src/vendor/psxanywhere/emulator/Emulator.ts`                 | `setSpeed(n)` → post `RUN_SPEED`.                                  |
|                              | `src/vendor/psxanywhere/client/EmulatorClient.ts`             | `setSpeed(n)` passthrough.                                         |
|                              | `src/vendor/psxanywhere/emulator/index.ts`                    | Export `advanceFrameBudget`.                                       |
| Service layer (FF-2)         | `src/features/console/services/emulator.ts`                   | `setSpeed(n)` on `EmulatorService`.                                |
|                              | `src/features/console/services/psxAnywhereEmulatorService.ts` | `speed` store slice + `setSpeed` + mute/restore-volume.            |
|                              | `src/features/console/services/emulator.mock.ts`              | No-op `setSpeed`.                                                  |
|                              | `src/features/console/types.ts`                               | `FastForwardRate = 1                                               | 2   | 4` + cycle order helper. |
|                              | `src/features/console/hooks/useFastForward.ts`                | `useSyncExternalStore` over service speed slice.                   |
| UX + hardening + docs (FF-3) | `src/features/console/components/GameWindow.tsx`              | Toggle button (cycle icon/`×2`/`×4`), visible while playing.       |
|                              | `src/features/console/hooks/useEmulator.ts`                   | Expose `toggleFastForward`/`fastForwardRate` if not in GameWindow. |
|                              | `tests/vendor/psxanywhere/client/emulator-client.test.ts`     | Mock `setSpeed`; assert passthrough + clamp.                       |
|                              | `src/features/console/services/speed.test.ts` (new)           | FF-2 unit tests (mute/restore/cycle).                              |
|                              | `AGENTS.md`, `docs/emulator/{api,architecture}.md`            | Document `RUN_SPEED`/`setSpeed` adaptation.                        |

## 6. Risk register (this is why it's phased)

| #   | Risk                                                                                                                                  | Phase      | Mitigation                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Changing the frame clock breaks 1× playback** (touching the only frame pacing in the app; worst case — every running game is wrong) | FF-1       | Factor the budget math into a **pure, tested** `advanceFrameBudget`; a dedicated test asserts `speedMul=1` is **bit-identical** to today's behavior; existing `palPacing.test.ts` must stay green.                                      |
| R2  | **Speed message never reaches the worker / dead control path** (silent failure — FF button does nothing)                              | FF-1, FF-2 | MSG plumbing is exercised by an `EmulatorClient` unit test (mocked `Emulator` records `setSpeed` calls with clamping). Service test asserts `setSpeed(2)` reaches the client + gain goes to 0.                                          |
| R3  | **Muting clobbers the user's volume or forgets to restore** (annoying, persistent wrong audio)                                        | FF-2       | Service owns the gain dance: restore always from current `settings.masterVolume`; setSettings-while-FF updates the _stored_ value without double-applying; unit-tested with a `setVolume` spy.                                          |
| R4  | **4× stalls on CD streaming / appears frozen** (perceived as a bug)                                                                   | FF-3       | Documented limit, reuses existing `buffering` UX; FF-3 manual playbook tests 2×/4× across an FMV section vs a static section and records expectations.                                                                                  |
| R5  | **FF leaks across pause/reset/leave and corrupts the session** (autosave writes mid-FF, hot mute stuck)                               | FF-3       | Stop-gate hardening: worker resets `speedMul` on `run:stop`; service resets speed→1 + unmute on `pause`/`reset`/`destroy`; FF is session-only, never persisted. Integration tests + manual playbook.                                    |
| R6  | **A future re-copy of the vendored tree silently drops the adaptation**                                                               | all        | Every doc in this feature names the exact adapted files; FF-1 updates `docs/emulator/api.md` + `architecture.md` messages table + `AGENTS.md` convention note so the re-copy checklist (per `AGENTS.md`) re-adds it.                    |
| R7  | **Toggle state drifts from the real speed** (button shows ×4, core is at 1×)                                                          | FF-2       | Single mirror writes: only the service mutates speed and mirrors to the store; worker is authoritative for runtime but only the service writes it (plus worker resets on stop, which implies a service reset too via play/pause hooks). |

## 7. Cross-phase invariants

- `speedMul` is **clamped to `[1, 4]`** at the worker; anything else is treated
  as 1. The service only ever emits `1 | 2 | 4`.
- FF is **only meaningful while `status === 'playing'`**; the button is gated on
  `started && isPlaying`. Calling `setSpeed` in any other state is a harmless no-op
  (client/worker ignore it, service resets to 1 on pause).
- The **AudioWorklet is never modified**; `scripts/build-worklet.mjs` output is
  unchanged.
- `pb_schema.json` is **unchanged** — no backend work at all.
- Every phase must end with green `npm run typecheck` + `npm run lint` + `npm run test`
  - `npm run build`; FF-3 also requires `npm run verify:build`.

## 8. Phase dependency graph

```
FF-1 (worker clock + setSpeed plumbing, tests) ──▶ FF-2 (service + audio, tests, console smoke) ──▶ FF-3 (button UX + hardening + docs + E2E gates)
```

Each phase is independently mergeable and leaves the app **more functional than
entry**:

- After FF-1: nothing user-visible; a unit-tested, regression-proof speed seam
  exists (1× provably unchanged).
- After FF-2: FF is reachable from the service API (usable from a devtools call
  while playing); audio muting correct.
- After FF-3: the shipped toggle button + hardening + docs + full verification.
