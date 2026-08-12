## Why

PSflix currently has no fast-forward control in the console UI, which makes routine gameplay tasks (grinding, traversal, repeated retries) slower than necessary. Adding a predictable, in-window fast-forward mode now improves play ergonomics while preserving the existing emulator architecture and save/sync behavior.

## What Changes

- Add a fast-forward mode control inside the emulator window next to Save and Load controls.
- Define a click-to-cycle interaction: `1x -> 2x -> 1x`.
- Treat fast-forward mode as session-scoped (non-persisted).
- Initialize fast-forward mode to `1x` whenever an emulator session loads.
- Apply selected mode to emulator frame pacing at runtime (normal speed, 2x).
- Mute audio output whenever fast-forward mode is `2x`; restore normal audio when mode returns to `1x`.
- Keep selected mode across pause/resume during a session, but force mode back to `1x` on reset and disc swap.

## Capabilities

### New Capabilities

- `emulator-fast-forward`: Fast-forward mode selection, persistence, runtime pacing control, and audio muting policy for accelerated playback.

### Modified Capabilities

- None.

## Impact

- Affected code areas: console UI controls, emulator service contract/implementation, vendor emulator message protocol, worker timing path, and audio gain behavior.
- No new external dependencies are expected.
- No backend schema/API changes are expected.
- Behavior impact: users can accelerate gameplay with explicit visible mode state; accelerated modes are intentionally silent; sessions always begin at `1x` and reset/disc swap return mode to `1x`.
