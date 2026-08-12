# FF-3 — Manual end-to-end playbook (fast-forward)

Companion to [`ff-3-toggle-ux-hardening-and-gates.md`](./ff-3-toggle-ux-hardening-and-gates.md).
Run against the dev server (or `https://psx.alexklingenbeck.de`) with a real
emulator session. **Precondition:** `self.crossOriginIsolated === true` in the
browser console (COOP/COEP active), a game booted, and Play pressed.

For each row: set **Pass / Fail / Notes**. “Pass” requires the behavior in the
_Expectation_ column, observed, once, on a real core.

| #   | Action                                                                | Expectation                                                                                                                                   |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Boot a lightweight title, press Play.                                 | Game runs at 1×; no fast-forward button until Play was pressed.                                                                               |
| 2   | Press the fast-forward toggle (top-right, `fast_forward`).            | Rate ×2. Stopwatch/visual: in-game time advances ≥ 1.7× wall-clock. Audio silent. Button shows active tone + `×2` badge. `aria-pressed=true`. |
| 3   | Press the toggle again.                                               | Rate ×4 (proportionally faster than step 2). Audio still silent. `×4` badge.                                                                  |
| 4   | Press the toggle again.                                               | Back to 1×. Audio returns at the current volume slider value. Button returns to neutral, `aria-pressed=false`.                                |
| 5   | At 4×, drag the volume slider to a new value; then toggle back to 1×. | While 4×: stays silent (slider changes nothing audible). After 1×: new volume is heard (no stuck mute, no pop).                               |
| 6   | At 2×, pause.                                                         | Runtime `paused`; FF button hidden; `emulatorService.getSpeed() === 1`. Resume → real-time.                                                   |
| 7   | At 4×, hit Reset.                                                     | Session restarts at 1× with correct volume; no mute stuck; no FF button until Play again.                                                     |
| 8   | At 2×, navigate away (header link / back).                            | `useBlocker` auto-save toast appears; returning to the console starts fresh at 1× (no persistence).                                           |
| 9   | Multi-disc title: at 2×, swap discs.                                  | FF rate survives the swap (still ×2 after load); no clock anomaly.                                                                            |
| 10  | At 4× through an FMV/cutscene/CD-heavy section.                       | Possible `buffering` pauses are tolerated (documented streaming ceiling); nothing corrupts; toggling to 1× restores normal behavior.          |
| 11  | Reload the page while FF was active.                                  | Fresh session at 1×.                                                                                                                          |
| 12  | Save state while playing at 2×; load it back.                         | Save/load works; loaded state is exactly the pre-save game-time (FF never changes save semantics).                                            |

All rows **Pass** → feature verified; commit this file with the results filled in.
