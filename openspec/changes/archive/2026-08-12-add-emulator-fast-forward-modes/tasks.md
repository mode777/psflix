## 1. Mode Domain and Lifecycle Defaults

- [x] 1.1 Add a fast-forward mode domain type (`1x`, `2x`) to console runtime state.
- [x] 1.2 Initialize fast-forward mode to `1x` whenever an emulator session loads.
- [x] 1.3 Extend emulator service interfaces to expose get/set behavior for fast-forward mode and lifecycle reset hooks.

## 2. Emulator Control Path

- [x] 2.1 Add fast-forward mode setter plumbing from PSflix service to vendored emulator client/facade without changing unrelated runtime APIs.
- [x] 2.2 Extend emulator worker message protocol with a speed-mode update message and corresponding typed handling points.
- [x] 2.3 Update worker timing logic to apply mode-based pacing targets for `1x` and `2x` using the existing audio-tick clock path.
- [x] 2.4 Ensure reset and disc swap explicitly set fast-forward mode back to `1x` after operation completion.
- [x] 2.5 Ensure pause/resume preserves the currently selected in-session mode.
- [x] 2.6 Discard accelerated muted audio in the AudioWorklet and skip intermediate WebGL/CRT paints so audio-ring pressure and duplicate presentation do not stall the worker.

## 3. Audio Policy

- [x] 3.1 Implement effective output gain logic so fast-forward mode (`2x`) forces mute while preserving persisted master volume.
- [x] 3.2 Restore normal audible output automatically when mode returns to `1x`.
- [x] 3.3 Verify mute/unmute transitions do not mutate saved volume settings or break existing volume controls.

## 4. Emulator Window UX

- [x] 4.1 Add a fast-forward control button in the emulator window control row adjacent to Save and Load.
- [x] 4.2 Implement click-cycle behavior with exact order `1x -> 2x -> 1x`.
- [x] 4.3 Display currently active mode on the control so speed state is always explicit.
- [x] 4.4 Keep control available regardless of authentication state and aligned with fullscreen control visibility behavior.

## 5. Verification and Tests

- [x] 5.1 Add/adjust unit tests for default `1x` mode on emulator session load.
- [x] 5.2 Add/adjust timing-path tests to validate mode-driven pacing behavior and stable default `1x` behavior.
- [x] 5.3 Add/adjust service/UI tests to validate cycle order, displayed active mode, and placement next to Save/Load controls.
- [x] 5.4 Add/adjust audio policy tests to validate forced mute at `2x` and restoration at `1x` without altering stored volume.
- [x] 5.5 Add/adjust lifecycle tests to validate reset and disc swap force `1x`, while pause/resume preserves the selected mode.
- [x] 5.6 Run project validation (build/tests) and execute manual regression checks for load-at-`1x`, play/pause, reset, disc swap, and save/load continuity.
- [x] 5.7 Add a real AudioWorklet regression test proving accelerated audio is discarded while worker clock ticks continue.
