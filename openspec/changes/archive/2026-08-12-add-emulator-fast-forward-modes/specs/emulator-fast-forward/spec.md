## Purpose

Define user-visible fast-forward behavior for PSflix console sessions, including mode selection, session-default initialization, playback pacing semantics, and accelerated-mode audio policy.

## ADDED Requirements

### Requirement: In-window fast-forward mode control

The system SHALL provide a fast-forward control inside the emulator window in the same control cluster as Save and Load actions.

#### Scenario: Control is visible during a playable session

- **WHEN** a game is loaded and the emulator window controls are shown
- **THEN** the UI shows a fast-forward control adjacent to Save and Load

#### Scenario: Control is available without cloud authentication

- **WHEN** the player is not signed in
- **THEN** the fast-forward control remains available

### Requirement: Deterministic mode cycling

The system SHALL cycle fast-forward modes in this exact order on each activation: `1x -> 2x -> 1x`.

#### Scenario: Repeated activations advance through all modes

- **WHEN** the player activates the control twice starting from `1x`
- **THEN** the selected mode sequence is `2x`, then `1x`

#### Scenario: Active mode is always explicit

- **WHEN** any fast-forward mode is selected
- **THEN** the control presents the currently active mode (`1x` or `2x`) as visible state

### Requirement: Session-default mode initialization

The system SHALL treat fast-forward mode as session-scoped and SHALL initialize mode to `1x` when an emulator session loads.

#### Scenario: New session starts at 1x

- **WHEN** the emulator session loads
- **THEN** the active fast-forward mode is `1x`

#### Scenario: Prior session selection is not reused

- **WHEN** the player ended a previous session on `2x` and later opens a new emulator session
- **THEN** the new session starts with mode `1x`

### Requirement: Runtime pacing and audio policy

The system SHALL apply playback pacing according to the selected mode and SHALL mute emulator audio output while mode is `2x`.

#### Scenario: Normal mode uses audible playback

- **WHEN** selected mode is `1x`
- **THEN** gameplay runs at normal speed and audio output is not force-muted by fast-forward policy

#### Scenario: Accelerated mode enforces mute

- **WHEN** selected mode changes to `2x`
- **THEN** gameplay speed increases and emulator audio output is muted

#### Scenario: Returning to normal mode restores non-muted output

- **WHEN** selected mode changes from `2x` back to `1x`
- **THEN** fast-forward muting is removed and normal audio output resumes

### Requirement: Lifecycle reinitialization to 1x

The system SHALL reinitialize fast-forward mode to `1x` on emulator reset and disc swap operations.

#### Scenario: Reset returns mode to 1x

- **WHEN** the player triggers reset during a session with mode `2x`
- **THEN** the active mode is set to `1x` after reset completes

#### Scenario: Disc swap returns mode to 1x

- **WHEN** the player swaps discs in a multi-disc session while `2x` is selected
- **THEN** the active mode is set to `1x` after disc swap completes

#### Scenario: Pause and resume do not change selection

- **WHEN** the player pauses and later resumes gameplay
- **THEN** the selected mode remains unchanged and is applied on resume
