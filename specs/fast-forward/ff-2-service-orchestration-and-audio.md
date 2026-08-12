# FF-2 — Service-layer orchestration + audio muting/restore

Part of [Fast-Forward](./spec.md). **Depends on:** FF-1
([frame-clock speed control](./ff-1-frame-clock-speed-control.md)).
**Unblocks:** FF-3 ([toggle UX + hardening + gates](./ff-3-toggle-ux-hardening-and-gates.md)).

## Goal

Expose the FF-1 speed seam through PSflix's `EmulatorService` so a player-facing
control can drive it, and make **audio correctness** the service's job:

- The `EmulatorService` interface grows `setSpeed(n)`; both impls satisfy it
  (real + mock).
- `PsxAnywhereEmulatorService` owns a `speed` mirror (`1 | 2 | 4`) in its store,
  a `toggleFastForward()` that cycles, and the **mute/restore-volume** dance.
- The mute dance is correct under the volume UI: changing the user's master
  volume _while fast-forwarding_ updates what will be restored and never
  un-mutes the running session.
- `useFastForward()` hook gives UI a `{ rate, toggle }` surface.

After this phase FF is **reachable at runtime**: from the browser console a
developer can call `emulatorService.setSpeed(2)` / `toggleFastForward()` while a
game plays and observe 2×/4× + muted audio. The visible button arrives in FF-3.

## Files

| File                                                          | Change                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/features/console/types.ts`                               | `FastForwardRate = 1                                                                                             | 2   | 4`; `FAST_FORWARD_CYCLE`; `nextFastForwardRate()` (pure). |
| `src/features/console/services/emulator.ts`                   | Add `setSpeed(n): void` to `EmulatorService` (documented: 1 = real-time, only 1/2/4).                            |
| `src/features/console/services/psxAnywhereEmulatorService.ts` | `speed` slice + selectors + `setSpeed` + `toggleFastForward` + mute/restore volume + pause/reset/destroy resets. |
| `src/features/console/services/emulator.mock.ts`              | No-op `setSpeed` (mirrors `speed`; no client/audio).                                                             |
| `src/features/console/hooks/useFastForward.ts`                | `useSyncExternalStore` over the service speed slice; returns `{ rate, toggle }`.                                 |
| `src/features/console/services/speed.test.ts` (new)           | Pure helper tests + service mute/restore/cycle tests (extend `FakeEmulatorClient`).                              |
| `tests/vendor/psxanywhere/client/emulator-client.test.ts`     | _(already done in FF-1 — no FF-2 change.)_                                                                       |

## Design

### 1. Types (`types.ts`)

```ts
export type FastForwardRate = 1 | 2 | 4;

/** Cycle order for the toggle: off → 2× → 4× → off. */
export const FAST_FORWARD_CYCLE: readonly FastForwardRate[] = [1, 2, 4];

export function nextFastForwardRate(current: FastForwardRate): FastForwardRate {
  const idx = FAST_FORWARD_CYCLE.indexOf(current);
  return FAST_FORWARD_CYCLE[(idx + 1) % FAST_FORWARD_CYCLE.length];
}
```

### 2. Interface (`services/emulator.ts`)

Add to the settings/passthrough group:

```ts
/**
 * Set emulation speed as a multiple of real-time. Only 1 | 2 | 4 are sent; 1 =
 * real-time (fast-forward off). Safe to call in any runtime state; the worker
 * clamps and no-ops when not running. Audio is muted by the layer while >1.
 */
setSpeed(multiplier: FastForwardRate): void;
```

(Import `FastForwardRate` from `../types`.)

### 3. Service store + implementation (`psxAnywhereEmulatorService.ts`)

**Store slice** (`ServiceState`, `:84-101`):

```ts
speed: FastForwardRate;                    // default 1
setSpeed: (n: FastForwardRate) => void;    // mirror-only setter (called by service)
```

Initialize `speed: 1` in the store literal (`:103-129`); `setSpeed` is a plain
`set((s) => ({ speed: n }))`.

**Public API on the class** (alongside `getSyncStatus`/`subscribe*`):

```ts
getSpeed(): FastForwardRate {
  return store.getState().speed;
}
subscribeSpeed(listener: () => void): () => void {
  return store.subscribe(listener);
}
/** Cycle 1→2→4→1 and push the result into the live client + audio. */
toggleFastForward(): void {
  this.setSpeed(nextFastForwardRate(store.getState().speed));
}
setSpeed(n: FastForwardRate): void {
  store.getState().setSpeed(n);          // mirror first, so UI updates immediately
  const client = this._client;
  if (client) {
    client.setSpeed(n);
    this._applyVolumeToClient(client);    // mute (n>1) or restore (n===1)
  }
}
```

**Volume authority** — a single private helper replaces the inline
`client.setVolume(...)` call in `setSettings` (currently `:598-606`) and the
boot-time push in `_applyConfig` (`:269-273`), so there is **one** place that
decides the live gain:

```ts
/** The gain to push to the live core: muted whenever FF is active. */
private _audioGain(speed: FastForwardRate, settings: ConsoleSettings): number {
  return speed > 1 ? 0 : settings.masterVolume / 100;
}
private _applyVolumeToClient(client: EmulatorClient): void {
  const { speed, settings } = store.getState();
  client.setVolume(this._audioGain(speed, settings));
}
```

**Wire the setter into every path that can change the gain:**

- `_applyConfig(client)` (`:269-273`) — keep pushing CRT, and push volume via
  `_applyVolumeToClient(client)` (this is the boot path; speed is 1, so it
  restores normal volume).
- `setSettings(patch)` (`:598-606`) — volume branch becomes:
  `if (prev.masterVolume !== next.masterVolume) this._applyVolumeToClient(client);`
  — so when FF is active, the live gain _stays muted_ (the pointer says 0) while
  the stored `masterVolume` updates for later restoration. When speed returns to
  1, `_applyVolumeToClient` pushes the new value. This kills Risk R3.
- `setSpeed` (above) — mute/restore.

**Stop-gates** (kill Risk R5 at the orchestration layer; worker-side reset is
already FF-1):

- `pause()` (`:363-365`) — after `this._client?.stop()`, add
  `store.getState().setSpeed(1);` (no `_applyVolumeToClient` needed — nothing
  plays; the next `play()` path is 1×).
- `reset()` (`:367-379`) — set `speed: 1` before the `loadDisc`/`play` re-run.
- `destroy()` (`:179-185`) — set `speed: 1` so a re-attach never inherits FF.

### 4. Mock (`services/emulator.mock.ts`)

Add a no-op mirror (no audio, no worker):

```ts
setSpeed(n: FastForwardRate): void {
  // The mock has no real clock; keep the toggle state for UI/Storybook parity.
  useMockStore.getState().setSpeed(n);
}
```

(Add `speed` to `MockState` + initializer `speed: 1` so `useFastForward` renders
consistently under the mock.)

### 5. Hook (`hooks/useFastForward.ts`)

Mirror `useSyncStatus.ts`:

```ts
export function useFastForward() {
  const rate = useSyncExternalStore(
    (l) => emulatorService.subscribeSpeed(l),
    () => emulatorService.getSpeed(),
    () => emulatorService.getSpeed(),
  );
  return { rate, toggle: () => emulatorService.toggleFastForward() };
}
```

## Edge cases (all resolved in-test this phase)

| Case                            | Behavior                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `setSpeed(2)` while paused      | Mirrors store → 2; client exists → `setSpeed(2)` (worker no-ops, not running); gain muted.          |
| Volume slider dragged during FF | `setSettings({masterVolume})` updates stored value; live gain **stays 0**; restored later.          |
| FF ends via `setSpeed(1)`       | Gain restored to `settings.masterVolume / 100` (the _latest_ stored value).                         |
| Pause while FF active           | Speed → 1 (store + worker reset via `run:stop`); nothing unmutes until next play (no audio anyway). |
| `toggleFastForward` at 4×       | Cycles back to 1 (off).                                                                             |
| Never-started / no client       | `setSpeed` updates the mirror only; mute logic skipped (no client) — harmless.                      |

## Verification strategy (FF-2)

### A. Pure helper tests (new `src/features/console/services/speed.test.ts`)

1. `nextFastForwardRate`: `1→2`, `2→4`, `4→1`.
2. `volumeWhileSpeed` equivalence: the service's `_audioGain` must equal
   `speed > 1 ? 0 : masterVolume / 100` for `speed ∈ {1,2,4}` and several volumes
   (0, 50, 100) — assert via a tiny exported pure helper if `_audioGain` is kept
   private, or assert the observable client calls in B. Prefer exporting a pure
   `audioGainForSpeed(speed, masterVolume)` from the service module so it is
   directly testable and reused by `_audioGain`.

### B. Service tests (extend `psxAnywhereEmulatorService.test.ts` pattern)

Extend the `FakeEmulatorClient` (`psxAnywhereEmulatorService.test.ts:8-42`) with
`setSpeed(n)` and make `setVolume(v)` record the **value**:
`calls.push('setVolume:' + v)` and capture `lastVolume`/`lastSpeed` on the fake.
Then, after `attachCanvas(canvas)`:

1. `setSpeed(2)` → fake `setSpeed` called with `2` and `setVolume:0` (muted).
2. `setSpeed(1)` → `setVolume:<masterVolume/100>` (restore; assert value equals
   the current `getSettings().masterVolume / 100`).
3. `setSettings({ masterVolume: v })` **while** speed=2 → fake is _not_ given a
   nonzero volume (assert last volume stays muted, or that `setVolume` recorded
   `0` again); then `setSpeed(1)` restores to the **new** `v/100`.
4. `toggleFastForward()` three times → fake `setSpeed` sequence `[2, 4, 1]`.
5. `pause()` while speed=2 → `getSpeed()` returns `1`.
6. Mock: `new MockEmulatorService().setSpeed(4)` keeps `getSpeed() === 4` (UI
   parity), no throw.

### C. Contract + regression gates

- `EmulatorService` interface growth forces `MockEmulatorService` to implement
  `setSpeed` (typecheck failure if missed) — this is a compile-time contract test.
- `npm run typecheck && npm run lint && npm run test && npm run build && npm run
verify:build` all green.

### D. First human-runnable FF smoke (no UI yet)

After FF-1 + FF-2 land, in `/#/play/...` while a game is running:

1. Devtools console: `emulatorService.toggleFastForward()` → game runs visibly
   ~2× (in-game clock / character speed); audio mutes.
2. `emulatorService.toggleFastForward()` → ~4×; still muted.
3. `emulatorService.toggleFastForward()` → back to 1×; audio returns at the set
   volume.
4. Drag the volume slider to a new value _while_ at 4× → still silent; return to
   1× → new volume restored (no loud pop/stuck-mute).
5. Pause during FF → `emulatorService.getSpeed() === 1`.

Record results as a comment in the PR (or a short `specs/fast-forward/ff-2-smoke.md`
runbook if reviewers want a durable artifact — not required).

## Exit criteria (FF-2)

1. A + B tests green; `C` gates green.
2. `setSpeed`/`toggleFastForward`/mute-while-FF is verified from a devtools
   console per D (a human has actually felt 2×/4× and confirmed mute/restore at
   least once).
3. No UI yet intentionally — GameWindow still shows no FF control.
