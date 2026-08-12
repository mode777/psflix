# FF-3 — Toggle UX, hardening, docs, and final verification

Part of [Fast-Forward](./spec.md). **Depends on:** FF-1 + FF-2.
**Unblocks:** (none — final phase; ships the feature).

## Goal

Turn the (already-working, FF-1/FF-2) speed control into the shipped UI:

- A **toggle button** in the GameWindow top-right controls that cycles
  `1× → 2× → 4× → 1×`, with clear active-state styling and accessibility.
- **Hardening** of every session interaction (pause/reset/leave/save/swap) so FF
  can never leak, corrupt, or surprise.
- **Docs** for the vendored adaptation (so a future re-copy re-applies it) +
  `AGENTS.md` convention note.
- A **solid end-to-end verification strategy**: unit + component tests, static
  gates, and a manual playbook that a human runs against the deployed app.

## Files

| File                                                        | Change                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/features/console/components/GameWindow.tsx`            | Add fast-forward toggle button to the top-right control group.                                   |
| `src/features/console/hooks/useFastForward.ts`              | _(FF-2)_ consumed by `GameWindow`.                                                               |
| `src/features/console/components/GameWindow.test.tsx` (new) | Component tests for visibility, cycling, and aria/labels.                                        |
| `src/features/console/consoleHooks.test.tsx`                | Add `useFastForward` Probe test (pattern already present).                                       |
| `AGENTS.md`                                                 | Note the `RUN_SPEED`/`setSpeed`/`advanceFrameBudget` adaptation in the re-copy checklist.        |
| `docs/emulator/api.md`                                      | Document `Emulator.setSpeed` + `EmulatorClient.setSpeed` (semantics, clamp, mute note).          |
| `docs/emulator/architecture.md`                             | Add `RUN_SPEED` row to the MSG table; one sentence on `ctx.speedMul` in the frame-clock section. |
| `specs/fast-forward/ff-3-playbook.md` (new)                 | The manual E2E playbook (referenced from this doc).                                              |

No backend, no `pb_schema.json`, no worklet, no core rebuild.

## Design

### 1. GameWindow toggle button

Add to the **top-right** control group (`GameWindow.tsx:200-239`), placed between
play/pause and fullscreen (i.e. second button, before `toggleFullscreen`). Reuse
the existing button recipe (40×40 rounded-full, `bg-black/40 backdrop-blur-md`,
`text-white/60`, active `scale-95`) and the `VolumeControl` active-tone variant
(`bg-primary/20 text-primary border-primary/40`).

**State model** (single source: `useFastForward()` rate):

| Rate | Icon guidance                        | Label / title                                 | Styling                                   |
| ---- | ------------------------------------ | --------------------------------------------- | ----------------------------------------- |
| 1    | `fast_forward` (default)             | “Fast-forward”                                | idle button                               |
| 2    | `fast_forward` (filled) + `×2` badge | “Fast-forward ×2 (press to speed up)”         | active tone (`bg-primary/20 …`)           |
| 4    | `fast_forward` (filled) + `×4` badge | “Fast-forward ×4 (press to return to normal)” | active tone, stronger (`bg-primary/30 …`) |

Concretely:

```tsx
const { rate: ffRate, toggle: toggleFF } = useFastForward();
const ffActive = ffRate > 1;
...
{started && isPlaying && (
  <button
    type="button"
    onClick={toggleFF}
    aria-pressed={ffActive}
    aria-label={ffActive ? `Fast-forward ×${ffRate}` : 'Fast-forward'}
    title={ffActive ? 'Fast-forward on — press to return to normal speed' : 'Fast-forward'}
    className={cn(
      'w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      ffActive
        ? ffRate === 4
          ? 'bg-primary/30 text-primary border border-primary/40'
          : 'bg-primary/20 text-primary border border-primary/40'
        : 'bg-black/40 backdrop-blur-md text-white/60 border border-white/10 hover:bg-black/60 hover:text-white',
    )}
  >
    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
      fast_forward
    </span>
    {ffActive && (
      <span className="absolute -bottom-1 -right-1 px-1 rounded text-[9px] font-bold leading-tight bg-primary text-on-primary">
        ×{ffRate}
      </span>
    )}
  </button>
)}
```

- **Visibility** is `started && isPlaying`: the user must have pressed Play, and
  the game must be running (FF is meaningless paused; the service also resets
  speed on pause, and the button would otherwise flash a stale `×2`). No
  hotkey — toggle button only (Decision 1).
- The button is a **plain `<button>`** (real focusable control, keyboard
  accessible, `aria-pressed`) — consistent with the rest of the control group.

### 2. Hardening checklist (each item verified in the playbook)

| Interaction                          | Guarantee                                                                                                   | Where enforced                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Pause while FF                       | Speed → 1; button hidden (status ≠ playing); next play is real-time.                                        | Service `pause()` (FF-2) + worker `run:stop` (FF-1) |
| Reset while FF                       | Speed → 1 before re-boot; no stale mute.                                                                    | Service `reset()` (FF-2)                            |
| Leave route (in-app navigate)        | `useBlocker` auto-save runs; unmount `destroy()` resets speed; nothing persisted.                           | `ConsoleView` `useBlocker` + service `destroy()`    |
| Save / load while playing w/ FF      | `saveState` serializes between ticks; FF does not change save _content_ semantics.                          | Worker save-load path (unchanged)                   |
| Autosave during FF                   | Wall-clock 5-min timer unchanged; writes are same as real-time.                                             | `EmulatorClient._autoSaveTick` (unchanged)          |
| Disc swap (multi-disc) while FF      | Speed survives the swap within a session (nice for multi-disc RPGs); `swapDisc` doesn’t reset clock params. | `Emulator.swapDisc` (unchanged)                     |
| Streaming stall at 4× (FMV/CD-heavy) | Existing `buffering` overlay + silence; player can toggle FF off; nothing breaks.                           | `bridge.ts`/worklet (unchanged)                     |
| Non-persistence                      | Reload always starts 1×; FF never written to `localStorage`/IDB/PocketBase.                                 | No persistence code (by construction)               |
| Volume changed mid-FF                | Stored volume updates; live gain stays muted; restore picks up the new value.                               | Service `_applyVolumeToClient` (FF-2)               |

### 3. Docs

- **`docs/emulator/api.md`** — under a new `## Speed (fast-forward)` subsection
  after `## Audio`:
  - `Emulator.setSpeed(multiplier)` → posts `MSG.RUN_SPEED`; clamps to `[1, 4]`;
    ignored when destroyed/no worker.
  - `EmulatorClient.setSpeed(multiplier)` → passthrough.
  - Note: the worker adds `multiplier` to its per-tick frame budget
    (`ctx.speedMul`, `worker/audio-clock.ts`), so `n×` frames run per real second;
    no core rebuild. **Muting during FF is the host's concern** (`PsxAnywhereEmulatorService`)
    because the SPU overproduces audio and the ring drops overflow.
  - Add a line to the README’s “PSflix-specific adaptations” list if `api.md`
    references such a section (keep the diff minimal and greppable).
- **`docs/emulator/architecture.md`** — MSG table: add
  `| RUN_SPEED | run:speed | main→worker | { speed:number } |` after `CRT_PARAM`;
  extend the thread-model frame-clock paragraph (`architecture.md:43-46`) with
  “the worker scales `speedMul` into the tick accumulator to run faster than
  real-time when fast-forwarding (`Emulator.setSpeed`).”
- **`AGENTS.md`** — under _Emulator integration_, add to the re-copy checklist:
  “Re-apply the fast-forward adaptation: `MSG.RUN_SPEED`, `ctx.speedMul` +
  `advanceFrameBudget` in `audio-clock.ts`, `Emulator.setSpeed`,
  `EmulatorClient.setSpeed` (see `specs/fast-forward/`).”

## Verification strategy (FF-3)

### A. Component + hook tests

1. **`useFastForward`** (extend `src/features/console/consoleHooks.test.tsx`, Probe
   pattern): initial render `rate: 1`; toggle → `2`, toggle → `4`, toggle → `1`
   (drives the real singleton store; reset `emulatorService.setSpeed(1)` in
   `afterEach`).
2. **`GameWindow.test.tsx`** (render `GameWindow` with props; `useSyncStatus`
   returns idle; real service store):
   - **Hidden** when `started=false` (start overlay) and when `status='paused'`
     even if `started=true`.
   - **Visible + off** when `status='playing' && started=true`; `aria-pressed
=false`, label “Fast-forward”.
   - Click → rate `2`, `aria-pressed=true`, `×2` badge rendered.
   - Click again → `4`; click thrice → back to off (`aria-pressed=false`).
   - Not disabled; icon `fast_forward` present in all states.

### B. Regression + static gates

- FF-1 `speedPacing.test.ts` and FF-2 `speed.test.ts` stay green (fast-forward
  math + mute/restore).
- `npm run typecheck` (app + `tsconfig.audio-worklet.json`), `npm run lint`,
  `npm run test`, `npm run build`, `npm run verify:build`.

### C. Manual end-to-end playbook (`ff-3-playbook.md`)

Run against the dev server (or `https://psx.alexklingenbeck.de`) with a real
cross-origin-isolated session (`self.crossOriginIsolated === true`). Steps:

1. Boot a lightweight title; press Play.
2. **FF 2×** — press the toggle; confirm via stopwatch (e.g. 60 in-game seconds
   in ~30 wall-seconds: settle for “visibly ≥1.7×” with a stopwatch) and that
   audio is silent.
3. **FF 4×** — press again; confirm proportionally faster; still silent.
4. **Off** — press again; rate 1; audio returns at the _current_ slider volume
   (assert no pop/stuck mute).
5. **Volume during FF** — drag slider while at 4×: stays silent; return to 1×:
   restores new volume.
6. **Pause during FF** — rate resets; button hidden; resume is real-time.
7. **Reset during FF** — session re-runs at 1× with correct volume.
8. **Leave route during FF** — auto-save `toast` appears; returning shows no FF.
9. **Disc swap during FF** (multi-disc game) — speed persists across the swap.
10. **4× through an FMV/cutscene-heavy section** — expect possible `buffering`
    pauses (documented ceiling); nothing corrupts; toggling back to 1× restores
    normal buffering behavior.
11. **Session persistence** — reload: starts at 1×.

Checklist artifact: `specs/fast-forward/ff-3-playbook.md` (one table row per
step, “Pass / Fail / Notes” columns) so the run is reproducible by any reviewer.

### D. Optional Playwright smoke

Only if CI infra for the emulator exists (the real WASM core needs
COOP/COEP + backend, so it is **not** expected here). If added later, gate the
scenario behind MockEmulatorService (button cycle + aria-state) and keep it out
of the default `test:e2e` run until then.

## Exit criteria (FF-3)

1. Button implemented per §1; A/B gates green.
2. The playbook (C) passes all rows; the playbook file is committed.
3. Docs (§3) committed; a reviewer can find `RUN_SPEED`/`setSpeed` in
   `docs/emulator/` and the `AGENTS.md` re-copy note.
4. `npm run verify:build` boots the artifact and serves the SPA (no build
   regressions).
5. Feature is **complete** per master-spec §1 goals 1–4.
