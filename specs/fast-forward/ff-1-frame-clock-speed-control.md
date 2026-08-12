# FF-1 — Frame-clock speed control (vendored worker + `setSpeed` plumbing)

Part of [Fast-Forward](./spec.md). **Depends on:** nothing.
**Unblocks:** FF-2 ([service orchestration + audio](./ff-2-service-orchestration-and-audio.md)).

> This phase is the **highest-risk slice** (Risk R1/R2 in the master spec): it
> edits the only frame-pacing code in the app. Its whole point is to make that
> edit **provably neutral at 1×** before any UI or orchestration exists.

## Goal

Give the emulator a runtime **speed multiplier** control that reaches the worker's
frame clock:

- `MSG.RUN_SPEED` (main → worker) sets `ctx.speedMul` (`1..4`, clamped).
- `Emulator.setSpeed(n)` and `EmulatorClient.setSpeed(n)` are the public call
  surfaces (pass-throughs, no logic).
- The worker frame budget adds `speedMul` per audio tick _instead of_ `1.0`, so
  `n×` frames run per real second.
- The speed math is factored into a **pure, exported, unit-tested** helper so the
  "1× must be a no-op" property is locked by a test, and so FF-2/FF-3 don't have to
  reason about the accumulation loop again.

Nothing user-visible changes, and the AudioWorklet / WASM core are untouched.

## Files

| File                                                      | Change                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/vendor/psxanywhere/emulator/messages.js`             | Add `RUN_SPEED: 'run:speed'` to `MSG`.                                                                          |
| `src/vendor/psxanywhere/emulator/worker/timing.ts`        | Add pure `advanceFrameBudget(acc, ticksPerFrame, speedMul)` (+ clamp helper).                                   |
| `src/vendor/psxanywhere/emulator/index.ts`                | Re-export `advanceFrameBudget` (alongside `computeTicksPerFrame`/`PAL_FPS`).                                    |
| `src/vendor/psxanywhere/emulator/worker/audio-clock.ts`   | Use `advanceFrameBudget(..., ctx.speedMul)` in `onAudioTick`; drop the hard-coded cap.                          |
| `src/vendor/psxanywhere/emulator/worker/coreWorker.ts`    | `ctx.speedMul = 1`; `case MSG.RUN_SPEED` → set+clamp; reset to 1 in `handleRunStop`; add `speedMul` to `STATS`. |
| `src/vendor/psxanywhere/emulator/Emulator.ts`             | `setSpeed(n)` → guard alive + clamp + `postMessage({type: MSG.RUN_SPEED, speed})`.                              |
| `src/vendor/psxanywhere/client/EmulatorClient.ts`         | `setSpeed(n)` passthrough to `this._emu?.setSpeed(n)` (next to `setCrt`).                                       |
| `tests/vendor/psxanywhere/client/emulator-client.test.ts` | Extend `MockEmulatorClass` + `MockEmulator` with `setSpeed`; assert passthrough + clamp.                        |
| `src/features/console/services/speedPacing.test.ts` (new) | Pure math tests for `advanceFrameBudget` (import via `emulator-core` barrel, like `palPacing.test.ts`).         |

No PSflix _feature_ code changes in this phase — only tests. The vendored tree gets
a small, documented adaptation (same pattern as the existing `pal` option).

## Design

### 1. `MSG.RUN_SPEED` (`messages.js`)

Add to the main→worker block:

```ts
RUN_SPEED: 'run:speed',
```

### 2. Pure budget math (`worker/timing.ts`)

Keep the "today" semantics exactly at `speedMul = 1`. Today the loop is:

```ts
acc += 1.0;
if (acc > 2 * ticksPerFrame) acc = 2 * ticksPerFrame; // stall protector
while (acc >= ticksPerFrame) {
  runFrame();
  acc -= ticksPerFrame;
}
```

New pure helpers (no runtime imports, same module discipline as
`computeTicksPerFrame`):

```ts
/** Speed multiplier domain. The worker clamps everything else to 1. */
export const SPEED_CLAMP_MIN = 1;
export const SPEED_CLAMP_MAX = 4;

export function clampSpeed(speed: unknown): number {
  const s = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1;
  return Math.min(SPEED_CLAMP_MAX, Math.max(SPEED_CLAMP_MIN, s));
}

/**
 * Next frame-accumulator value per audio tick. Adding `speedMul` per tick makes
 * the worker emit `speedMul`× frames per real second. The cap is a fixed generous
 * stall-protector (3 full frames of slack regardless of speed) so a burst of
 * ticks after a streaming stall still bounds the catch-up loop, matching the
 * intent of today's `2 * ticksPerFrame` clamp.
 */
export function advanceFrameBudget(acc: number, ticksPerFrame: number, speedMul: number): number {
  const next = acc + Math.max(0, speedMul);
  const cap = 3 * Math.max(0.5, ticksPerFrame);
  return Math.min(next, cap);
}
```

Notes:

- At `speedMul = 1` the per-tick delta is identical (`+1.0`), so over any window
  the **1× frame cadence is unchanged**; only the cap constant differs
  (`3×tpf` vs `2×tpf`), which only ever affects the _catch-up bound after a
  stall_, never steady-state pacing.
- `cap = 3 * ticksPerFrame` deliberately keeps the "bounded catch-up" property,
  and `Math.max(0, speedMul)` guards pathological negative inputs. The invariant
  that matters is: `speedMul = 1` ⇒ identical steady-state cadence and a bounded
  cap.

### 3. `onAudioTick` (`worker/audio-clock.ts`)

Replace the accumulator/cap block (`audio-clock.ts:79-81`) with:

```ts
ctx.audioTickCount++;
ctx.frameAccumulator = advanceFrameBudget(ctx.frameAccumulator, ctx.ticksPerFrame, ctx.speedMul);
while (ctx.frameAccumulator >= ctx.ticksPerFrame) {
  /* unchanged loop :82-88 */
}
```

`ctx.speedMul` defaults to `1` (set when the context is built in
`coreWorker.ts`), so before any `RUN_SPEED` arrives the behavior is the 1× path.

### 4. Worker message handling (`worker/coreWorker.ts`)

- Add `speedMul: 1,` to the initial `ctx` literal (`coreWorker.ts:18-51`).
- Add a dispatch case alongside `MSG.CRT_TOGGLE`:

```ts
case MSG.RUN_SPEED:
  ctx.speedMul = clampSpeed(msg.speed);
  logInfo(`worker: speedMul=${ctx.speedMul.toFixed(2)}`);
  return;
```

- Reset in `handleRunStop` (next to `ctx.frameCount = -1` /
  `ctx.audioClockActive = false`):

```ts
ctx.speedMul = 1;
```

This guarantees a paused/stopped session can never resume with stale FF.

- Add `speedMul: ctx.speedMul` to the `STATS` payload (`coreWorker.ts:291-315`)
  so FF-3 can observe the live rate in diagnostics without new plumbing. (Teams
  that treat worker `STATS` as a frozen shape should still add it — it is an
  additive, backwards-compatible key; `Emulator._mergeStats` passes extras through
  unchanged.)

### 5. `Emulator.setSpeed(n)` (`Emulator.ts`)

Model on `setCrt` (`Emulator.ts:596-599`):

```ts
setSpeed(multiplier: number) {
  if (this._destroyed || !this._worker) return;
  const speed = clampSpeed(multiplier);
  this._worker.postMessage({ type: MSG.RUN_SPEED, speed });
  this._log('info', `emu speed=${speed}x`);
}
```

### 6. `EmulatorClient.setSpeed(n)` (`client/EmulatorClient.ts`)

Add to the "Passthroughs" block (next to `setCrt`, `EmulatorClient.ts:534-536`):

```ts
setSpeed(multiplier: number): void {
  this._emu?.setSpeed(multiplier);
}
```

No clamping here — the `Emulator` layer clamps; keep the client a pure pass-through
so there is exactly one authority.

## Edge cases considered (and how each is neutral at 1×)

| Case                                         | Behavior in this phase                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| No `RUN_SPEED` ever sent                     | `speedMul = 1` from context init → identical cadence to today.                         |
| `setSpeed(0)`, `setSpeed(-1)`, `setSpeed(9)` | `clampSpeed` → `1`, `1`, `4`. Never below real-time.                                   |
| `setSpeed` before load / after destroy       | `Emulator` guards (`!this._worker` / `_destroyed`) → silent no-op.                     |
| Pause → resume                               | `handleRunStop` resets `speedMul=1`; resume runs at 1× unless the caller re-sends.     |
| Streaming stall mid-FF                       | Same as today: worker parks on `Atomics.wait`, `buffering` UX, cap bounds catch-up.    |
| PAL games                                    | `ticksPerFrame` already reflects 50 fps; `speedMul` scales ticks, so 2× = 100 fps PAL. |

## Verification strategy (FF-1)

This phase is verification-heavy by design, because it edits the frame clock.

### A. Pure-math unit tests — `src/features/console/services/speedPacing.test.ts`

Mirror `palPacing.test.ts` (import `advanceFrameBudget`, `clampSpeed` from the
`emulator-core` barrel). Required cases:

1. **1× is a no-op at the cadence level**: advancing `advanceFrameBudget(acc, 5.74,
1)` over any window produces the same frames as `acc += 1` under today's loop
   (assert: after `ceil(5.74)` ticks a frame is emitted; per-tick delta is exactly
   `1`).
2. **2× / 4× emit proportionally more frames**: for a fixed tick count, frames
   emitted scale 1 : 2 : 4 (assert via counting loop / frame-emission predicate).
3. **Cap is bounded**: `advanceFrameBudget(0, tpf, s)` never exceeds `3 * tpf`,
   even for huge inputs; catch-up remains bounded.
4. **Never below real-time**: `advanceFrameBudget(acc, tpf, 0.5)` (a hypothetical
   slow-mo input, even though FF-2 never sends <1) advances no slower than realtime
   — clamp makes `clampSpeed(0.5) → 1`; test `clampSpeed(0.5) === 1`.
5. **Edge inputs**: `clampSpeed(undefined) === 1`, `clampSpeed('4') === 1`
   (non-number → 1), `clampSpeed(9) === 4`.
6. **PAL interplay** (guards R1 regression): with `computeTicksPerFrame(48000, 50,
128) = 7.5`, `speedMul=2` yields 100 fps equivalent — assert frames-per-second
   math is consistent.

### B. `EmulatorClient.setSpeed` delegation — `tests/vendor/psxanywhere/client/emulator-client.test.ts`

- Extend `MockEmulator` (helper `createMockEmulator`) and `MockEmulatorClass`
  (`emulator-client.test.ts:96-184`) with `setSpeed(n)` recording calls.
- New test: `client.setSpeed(2)` → recorded call `setSpeed(2)` on the underlying
  emulator; `client.setSpeed(0)` forwards `0` (clamping is the `Emulator` real
  layer's job, `EmulatorClient` is a pass-through — assert the value is forwarded
  as-given, matching `setCrt`'s test approach).
- This exercises the **entire main-thread message surface** short of a real worker.

### C. Static/regression guards

- `palPacing.test.ts` must stay **unchanged and green** (proves `computeTicksPerFrame`
  untouched).
- `npm run typecheck` (both the app tsconfig and `tsconfig.audio-worklet.json` via
  `npm run typecheck`) — the worklet is untouched but the full TS surface must
  still compile.
- `npm run lint` — the vendored tree is ESLint-ignored per `AGENTS.md`, but PSflix
  files (the new test) must lint clean.
- `npm run build` + `npm run verify:build` — dist artifact must boot.

### D. Runtime smoke (deferred, documented)

True 1×/2×/4× _feel_ needs a live core, which only FF-2's service layer can drive
without UI. Per the phase plan, the first human-runnable FF check is the FF-2
console smoke; FF-1 exit criteria are satisfied by A–C alone. If a reviewer wants
an early peek, they can run **after FF-2 lands** — never in FF-1.

## Exit criteria (FF-1)

1. `speedPacing.test.ts` (A) and the extended `emulator-client.test.ts` (B) are
   green; `palPacing.test.ts` unchanged and green.
2. `npm run typecheck && npm run lint && npm run test && npm run build && npm run
verify:build` all green.
3. Code review confirms `speedMul = 1` produces byte-for-byte the same budget
   arithmetic as today (relative-decodeable via the test in A1).
4. The public API surface is stable (names in §5/§6) so **FF-3's docs update**
   (`docs/emulator/{api,architecture}.md` + `AGENTS.md`) describes the final,
   shipped shapes — docs are authored once, in FF-3, not twice.
