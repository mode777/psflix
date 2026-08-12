## Context

See proposal.md for motivation and scope. The existing console runtime splits concerns across a React UI layer (`GameWindow` controls), a PSflix adapter service (`PsxAnywhereEmulatorService`), a vendored emulator facade (`EmulatorClient`/`Emulator`), and a worker/audio-clock timing pipeline. Playback stepping is audio-worklet tick driven, not display-loop driven, so speed control must be introduced on the timing path rather than only in UI state.

## Goals / Non-Goals

**Goals:**

- Add a single in-window control near Save/Load that cycles speed modes `1x -> 2x -> 1x`.
- Initialize fast-forward mode to `1x` whenever an emulator session loads.
- Apply selected mode at runtime through the emulator control path.
- Enforce deterministic audio muting whenever fast-forward mode is `2x`.
- Keep selected mode stable through pause/resume, and force mode back to `1x` on reset and disc swap.

**Non-Goals:**

- Introducing additional speed tiers beyond `1x` and `2x`.
- Adding keyboard hotkeys for fast-forward in this change.
- Changing save-state formats, cloud schema, or sync protocol behavior.
- Adding backend APIs or dependencies.

## Decisions

### 1) Represent speed as an explicit session-scoped mode enum

- Decision: Add a runtime fast-forward mode with values `1x`, `2x` that is not persisted across sessions.
  - Rationale: This matches UX semantics for temporary playback acceleration and ensures each emulator load starts from a predictable `1x` baseline.
  - Alternatives considered:
    - Persist selected mode across sessions: rejected because requirement now mandates a default `1x` start for every emulator load.
    - Derive mode from transient runtime counters only: rejected because explicit mode state is required for deterministic cycling and clear UI feedback.
    - Include `4x` tier: rejected because the worker cannot produce frames fast enough to sustain 4x reliably.

### 2) Place UI control in emulator window control cluster

- Decision: Add a dedicated cycle button inside `GameWindow` next to Save/Load controls.
- Rationale: This matches user expectation that speed is a live gameplay control and keeps access consistent in fullscreen.
- Alternatives considered:
  - Put control in ConsoleMenu: rejected for slower access and lower in-session discoverability.
  - Global header control: rejected because speed is scoped to active emulator session.

### 3) Apply speed in worker timing path via protocol message

- Decision: Extend emulator message protocol with a speed-mode update that reaches worker timing state and recomputes pacing. Forward the multiplier to the AudioWorklet over the existing bidirectional tick `MessagePort` so it discards muted accelerated audio while continuing to emit clock ticks. Run all accelerated core frames but present only the latest frame per pair (one WebGL/CRT paint per two frames at `2x`).
- Rationale: The core clock is audio tick driven; applying mode in worker timing is the only reliable way to scale emulation speed while preserving architecture boundaries. Discarding accelerated audio prevents the 1x consumer from being overrun, while skipping intermediate presentation avoids duplicate texture uploads and CRT rendering without skipping emulation state updates.
- Alternatives considered:
  - UI-only throttling or requestAnimationFrame tricks: rejected because they do not control emulation step rate.
  - Rebooting emulator per speed change: rejected due to disruptive UX and unnecessary lifecycle churn.

### 4) Keep master volume persistent and layer fast-forward muting separately

- Decision: Fast-forward muting sets effective output gain to zero for `2x` without altering persisted `masterVolume`.
- Rationale: Prevents accidental user-setting loss and ensures instant restoration when returning to `1x`.
- Alternatives considered:
  - Overwrite stored master volume during fast-forward: rejected due to poor UX and state corruption risk.
  - Leave audio unmuted at accelerated speeds: rejected by explicit requirement.

### 5) Force lifecycle reinitialization to 1x on reset and disc swap

- Decision: Reset and disc swap explicitly set fast-forward mode to `1x`, while pause/resume retains the in-session selection.
- Rationale: This directly enforces the updated behavior contract and avoids implicit carry-over of acceleration across major session transitions.
- Alternatives considered:
  - Preserve selected accelerated mode across reset/disc swap: rejected because lifecycle transitions must reinitialize to `1x`.

## Risks / Trade-offs

- [Risk] High-speed mode may be bounded by device/network throughput and not always sustain true 2x.
  - Mitigation: Treat `2x` as a target mode; the worker drops frames naturally if the host cannot keep up.

- [Risk] New protocol/state plumbing across UI -> service -> vendor facade -> worker can regress playback controls.
  - Mitigation: Keep API surface narrow (single mode setter), preserve defaults at `1x`, and add focused unit/integration tests around mode changes.

- [Risk] Audio mute/unmute transitions may pop on some browsers.
  - Mitigation: Use existing gain-control path and avoid rewriting persisted volume; test mode transitions during active playback.

- [Risk] Accelerated core frames produce audio faster than the real-time AudioWorklet can consume it.
  - Mitigation: Signal accelerated mode through the existing tick `MessagePort` and drain generated audio while muted, preserving worklet ticks as the pacing source without changing the fixed control SAB layout.

## Migration Plan

1. Add fast-forward mode domain state with default runtime value `1x` at emulator session load.
2. Add UI cycle control and connect it to emulator service mode updates.
3. Extend service and vendor facade APIs to propagate speed mode changes.
4. Extend worker message protocol and timing logic to apply selected mode.
5. Add explicit lifecycle handling so reset and disc swap set mode to `1x`; keep pause/resume mode continuity.
6. Add/adjust tests for initialization-at-`1x`, reset/swap-to-`1x`, cycle order, timing behavior, and mute policy.
7. Validate build/tests and manually verify lifecycle continuity (load, play/pause, reset, disc swap).

Rollback strategy:

- Revert to default `1x` behavior by disabling new mode setter wiring while keeping parsed setting fallback safe.
- Because no backend/schema changes are introduced, rollback is code-only.
