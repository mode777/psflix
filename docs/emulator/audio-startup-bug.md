# Known issue: audio rarely never starts (Chromium-only, persists until browser restart)

> **Migrated + adapted** from upstream `docs/audio-startup-bug.md` to the
> vendored tree at `src/vendor/psxanywhere/`. Status in the vendored copy:
>
> - The **root cause** (Chromium's `media::SilentSinkSuspender`) is a platform
>   bug that applies to PSflix exactly as upstream.
> - Of upstream's two mitigations, only part of fix (1) shipped in this
>   vendored revision: `emulator/AudioManager.ts` force-`suspend()`s a
>   freshly-constructed `AudioContext` that came up already `'running'`, logs
>   `statechange`, and `resume(maxAttempts=3)`s with retry. The **dither fix
>   (2) in the worklet is NOT present** — `emulator/audio-worklet.ts` outputs
>   real silence (with a soft-mute ramp) during network stalls and underrun.
> - PSflix's `AudioManager` is constructed by `Emulator.init()` and resumed by
>   `Emulator.start()` (inside the Play click), so the same "keep the context
>   suspended until the genuine gesture" behavior applies.
>
> Treat this as **unconfirmed in production**; the trigger condition is
> narrower here than upstream (no free multi-second head start is ever given
> to the auto-running case because of the suspend-on-load fix), but the
> worklet dither backstop is missing. See "Residual risk" below.

## Symptom

Rarely, on Start, emulation runs fine (video renders, input works) but no
audio ever plays. Once it happens:

- It is **persistent for the rest of the browser session** — reloading the
  page, hard-refresh, and clearing the HTTP cache all fail to fix it.
- Opening a **new tab** to the same page does **not** fix it.
- **Restarting the browser entirely**, or loading the page under a
  **different browser profile/account**, does fix it (until it recurs).
- Reproduced in Chrome and VS Code's Simple Browser (both Chromium-based).
  Not reproduced in Safari.

## Why this is very unlikely to be a bug in this app's page state

PSflix's frame clock is driven entirely by the `AudioWorkletNode`'s `process()`
callback posting `'tick'` messages over a `MessagePort` to the worker
(`worker/audio-clock.ts#onAudioTick`, which calls `host_run_frame()` once per
accumulated tick — see `masterN` / `ticksPerFrame`). If `process()` stopped
being invoked, emulation would freeze entirely, not just go silent. Since
emulation keeps running during this bug, the Web Audio graph is still alive and
being pulled by the browser; the failure is downstream of our JS, in the actual
platform audio output path, not in the ring buffer or worklet logic.

A full page reload/hard-refresh tears down _everything_ this app's own code
owns — `window`, the `Worker`, the `AudioContext`, the `MessageChannel`. If the
bug survives that, it cannot be page-level JS state, `localStorage`,
IndexedDB, the Cache API tier (`emulator/ChunkStore.ts`), or the HTTP cache.

## Root cause (confirmed upstream)

Captured upstream on 2026-07-11: `chrome://media-internals` from a broken and a
working tab, of the same page, the same game, loaded a couple minutes apart.
The two `Controller` entries differ in exactly one field:

|                 | broken tab  | working tab |
| --------------- | ----------- | ----------- |
| `status`        | `"stopped"` | `"started"` |
| stream present  | no          | yes         |
| everything else | identical   | identical   |

and the in-page logs differ in exactly one other place: **when the
`AudioContext` first reaches `'running'`**. Broken: `AudioContext created
(state=running, ...)` at page load, ~2 s before Start was pressed. Working:
`(state=suspended, ...)` at page load, then `resume()` fires only on Start.

The mechanism: Chromium's `media::SilentSinkSuspender`
(`media/base/silent_sink_suspender.{h,cc}`, instantiated with a hard-coded
**30-second timeout** in `renderer_webaudiodevice_impl.cc`) wraps every real
audio `Render()` call: if `AudioBus::AreFramesZero()` is true (the whole
buffer is bit-exact `0.0f`) for 30 continuous seconds, it calls `sink_->Pause()`
on the _real_ platform sink (turns up in media-internals as `status:
"stopped"`) and swaps in an in-process `FakeAudioWorker` with **no real device
involved**. From JS's point of view everything looks healthy (EMULATION keeps
running, `process()` still fires), only the platform output stream is gone.

`SilentSinkSuspender::Render()` is self-healing _in principle_: once a later
`Render()` produces a non-all-zero buffer it posts `TransitionSinks(false)` →
`sink_->Play()`. Upstream's broken tab never recovered, pointing at
`sink_->Play()` failing silently at the Audio Service / OS layer — a genuine
Chromium/platform fault this app cannot fix. The part an app _can_ fix is
never reaching the 30-second all-zero trigger in the first place.

## Why "rarely" and why "usual account" specifically

The auto-running profile (autoplay pre-authorized via Media Engagement Index)
gets its ~2 s of guaranteed silence for free at page load, on top of however
long BIOS boot + a game's own silent intro/logo sequence takes (CHD chunk
latency, GC pauses, CPU contention add jitter). Most runs stay comfortably
under 30 s even with the head start; runs that drift close to ~28–30 s tip
over. A low-engagement profile (silence clock only starts at the Start click)
stays just under.

## What the vendored tree does (and doesn't) do

**Present (`emulator/AudioManager.ts`):**

- `setup()` logs `AudioContext created (state=…)` and every `statechange`.
- **Fix (1):** if the freshly-constructed `AudioContext` is already
  `'running'` (autoplay pre-authorized), it immediately `.suspend()`s it back
  down, logging `audio: AudioContext came up already 'running' at page load …
forcing suspend() until Start is pressed`. `Emulator.start()`'s
  `audio.resume()` is then the only thing that resumes it, tied to the genuine
  click gesture. This removes the "free" multi-second head start on silence.
- `resume(maxAttempts = 3)` retries `audioCtx.resume()` up to 3× with backoff
  and logs every attempt/failure — turning "silently no sound" into a clear,
  timestamped trail.

**NOT present (`emulator/audio-worklet.ts`):**

- Upstream fix (2) — the inaudible `±1e-5` dither on every output quantum that
  makes `AreFramesZero()` return `false` unconditionally — is **not** in this
  vendored worklet. The worklet outputs a soft-mute ramp while the worker is
  parked on a network fetch and genuine silence on underrun. That means the
  30 s all-zero trigger is technically still reachable in pathological cases
  (a very long silent intro + network stalls totalling ~30 s).
- Upstream also added a 3 s audio heartbeat + a `visibilitychange`
  `state-sync` hook to upstream `app.ts`; neither exists in the vendored
  client (the heartbeat was upstream main-thread UI, not part of the facade).

Practically: because fix (1) is in place, the auto-running head start is
eliminated for every profile, so the trigger window only opens after the
genuine Start gesture and a ~30 s run of silence/fill. That makes a recurrence
much less likely than upstream observed, but it is not fully closed.

## Residual risk / how to tell if it recurs

Because the underlying `sink_->Play()` failure is a Chromium/platform fault
outside this app's control, it's possible some other path still trips the same
30 s silence timer. The missing worklet dither (fix 2) means the backstop
upstream relied on is not here. If it recurs:

1. Check `chrome://media-internals` for the same `status: "stopped"` /
   no-stream signature on the affected tab's controller — if the signature is
   different, this is a different bug.
2. Check the console for `audio: AudioContext came up already 'running' at page
load` — if it fired, fix (1) engaged as expected; if the bug still happened
   afterward, the practical next step is to **port the worklet dither** (fix 2) into `emulator/audio-worklet.ts` (details in the upstream doc) or to
   confirm the Chromium/platform fault directly.
3. The only known workaround remains: restart the browser (or switch profile)
   to get a fresh Audio Service / OS audio session.

## What to collect next time it reproduces

1. The console log around boot + Start (now includes the state-transition and
   resume-retry lines with timestamps). ES6 note: PSflix's own console feature
   surfaces `fatal` through `PsxAnywhereEmulatorService` — capture those too.
2. `chrome://media-internals`, opened in a spare tab _before_ the bug happens
   if possible, exported after.
3. Chrome's Task Manager (Shift+Esc) — CPU/memory of the row labeled "Audio"
   (the shared Audio Service process), captured while the bug is active.
4. Whether the log shows `state=running` with the emulator running fine (points
   to the SilentSinkSuspender/Audio-Service wedge) vs. stuck at
   `state=suspended` with `resume()` never resolving (points to an
   autoplay-policy/permission-level issue — a different root cause).

## Cross-references

- [`api.md`](./api.md) — `start()` resumes the AudioContext (user gesture).
- [`worker.md`](./worker.md), [`stream.md`](./stream.md) — the worklet tick
  driver and the network-stall soft-mute ramp.
