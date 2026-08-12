# Phase 1 — Real emulation, local-only IDB persistence

Prerequisite reading: [`spec.md`](./spec.md). This phase delivers a **playable**
console with save states + memory cards persisted in IndexedDB only (no PocketBase
cloud sync). Cloud sync is Phase 2 ([`phase-2.md`](./phase-2.md)).

Exit criteria: a signed-in (or anonymous) user can navigate to
`/#/play/<first_disc_serial>`, the disc boots from PocketBase, plays with the
keyboard, saves to a slot, reloads the page, and loads the save back. All from
local IDB; nothing is written to the `save_state` / `memory_cards` collections.

## Workstream map

| #   | Workstream                                                | Touches                                                                                                                     |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A   | Vendor the emulator source + assets                       | `src/vendor/psxanywhere/**`, `public/*`                                                                                     |
| B   | Config: aliases, tsconfigs, vite, vitest, eslint, package | root configs                                                                                                                |
| C   | Vendored-code modifications (shader inline)               | `src/vendor/psxanywhere/emulator/worker/gl/blit.ts`                                                                         |
| D   | Backend: add `consoles` collection                        | `pb_schema.json`, PB instance, `src/types/pocketbase.ts`                                                                    |
| E   | Cross-origin isolation (dev)                              | `vite.config.ts` (covered by B)                                                                                             |
| F   | Repository adapter (Phase 1 surface)                      | `src/features/console/services/psxAnywhereRepository.ts`                                                                    |
| G   | EmulatorService adapter + interface growth                | `src/features/console/services/{emulator,psxAnywhereEmulatorService,index}.ts`                                              |
| H   | Wire the canvas into `GameWindow` + boot order            | `src/features/console/components/GameWindow.tsx`, `src/routes/ConsoleView.tsx`, `src/features/console/hooks/useEmulator.ts` |
| I   | Migrate vendored tests + Node guard                       | `tests/vendor/psxanywhere/**`, `scripts/test/**`, `package.json`                                                            |
| J   | Docs + verification                                       | `AGENTS.md`, build/test/lint/verify                                                                                         |

Recommended order: **A → B → C → D → I (vendored tests green) → F → G → H → E (dev headers already in B) → J**. Getting the vendored tree to typecheck + its tests green _before_ writing adapters de-risks the whole phase.

---

## A. Vendor the source + assets

### A.1 Copy source trees

From `/Users/alexk/repos/psxanywhere/`, copy into `/Users/alexk/repos/psflix/src/vendor/psxanywhere/`:

- `src/emulator/` → `src/vendor/psxanywhere/emulator/` (full tree — incl. `worker/`, `sab/`, `worker/gl/` + `shaders/`, the `.c`/`.h` files, `audio-worklet.ts`/`.d.ts`, the three `.js` files).
- `src/client/` → `src/vendor/psxanywhere/client/` (full tree).
- `src/repository/` → `src/vendor/psxanywhere/repository/` (full tree).

Manifest in [`spec.md` §5.1](./spec.md#51-source-trees-full-preserving-relative-layout). Preserve relative layout exactly — the worker is spawned via `new Worker(new URL('./worker/coreWorker.ts', import.meta.url))` (`Emulator.ts:210`), so `Emulator.ts`'s position relative to `worker/` must not change.

**Do not copy** PSxAnywhere top-level `src/*.ts` UI, `index.html`, `core/`, `emsdk/`, `pcsx_rearmed/`, `id-extractor/`, `samples/`, `scripts/` (except the guard — Workstream I), `issues/`, `specs/`.

### A.2 Copy static core assets

`psxanywhere/public/pcsx_rearmed.{js,wasm}` → `psflix/public/`. These are served at the origin root (verified assumption in [`spec.md` §6.2](./spec.md#62-root-absolute-url-assumptions-no-change-deployment-assumption)).

### A.3 Verify the boundary

After copy, confirm no vendored file imports anything outside the vendored set except `pocketbase` (at `repository/repository.ts:6`). Expected: clean. The `emulator`/`client` layers import only via relative paths or the three bare aliases.

---

## B. Config changes

### B.1 `tsconfig.json` — aliases, allowJs, ES2022, worklet excludes

Apply the diff in [`spec.md` §8.1](./spec.md#81-tsconfigjson):

- `target`/`lib` → `ES2022` (was `ES2020`).
- add `"allowJs": true` (messages.js, sab/layout.js).
- add the three `paths`: `emulator-core`, `emulator-client`, `repository`.
- add `exclude` entries for `audio-worklet.ts`, `audio-worklet.d.ts`, `sab/layout.js`, `worker/sab_runtime.js` (covered by the dedicated worklet config).
- add `references` to the two new tsconfigs.

### B.2 `tsconfig.audio-worklet.json` (NEW)

Create verbatim from [`spec.md` §8.2](./spec.md#82-tsconfigaudio-workletjson-new--copy-from-psxanywhere) — `WebWorker` lib, the three worklet files only.

### B.3 `vite.config.ts` — aliases + dev headers

Add the three `resolve.alias` entries (mirror tsconfig `paths` exactly) and the `server.headers` block (COOP/COEP/CORP) per [`spec.md` §8.4](./spec.md#84-viteconfigts). Vite applies aliases to module workers automatically, so the worker's internal imports resolve.

### B.4 `vitest.config.ts` — aliases + include

Add the same three aliases; widen `include` to `['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.test.ts']` so migrated tests run.

### B.5 `.eslintrc.cjs`

Add `'src/vendor/psxanywhere'` to `ignorePatterns`.

### B.6 `package.json`

- `devDependencies`: add `fake-indexeddb` (`^6.2.5`).
- `scripts.typecheck`: `tsc --noEmit && tsc --noEmit -p tsconfig.audio-worklet.json`.
- `scripts.test:controller-guard`: `node scripts/test/controller-constants.test.js` (used in Workstream I; harmless if the file isn't there yet — add when I lands).

### B.7 Run typecheck, fix violations

`npm run typecheck`. The vendored tree was authored under PSxAnywhere's tsconfig (no `noUnusedLocals`/`noUnusedParameters`); PSflix enables both. Fix the violations in the vendored copy (expected: a handful). If the count is large, adopt the `tsconfig.vendor.json` fallback from [`spec.md` §8.3](./spec.md#83-tsconfigvendorjson-new--only-if-needed-see-81-note) instead of relaxing project-wide settings.

**Checkpoint:** `npm run typecheck` green. Do not proceed until it is.

---

## C. Vendored-code modification — inline the blit shaders

`src/vendor/psxanywhere/emulator/worker/gl/blit.ts:7` hardcodes
`SHADER_BASE = '/src/emulator/worker/gl/shaders/'` and fetches the two GLSL files
at runtime (`blit.ts:36-39`). PSxAnywhere serves `src/` unbundled; PSflix bundles,
so this 404s in production.

Convert to Vite `?raw` imports (inlined at build; this is how `crt-shader.ts`
already handles its GLSL):

```ts
// blit.ts (top of file)
import fullscreenVert from './shaders/fullscreen.vert?raw';
import unpackFrag from './shaders/unpack.frag?raw';
```

Remove the `SHADER_BASE` constant and the `fetchText` calls; pass the two raw
strings into the program builder. If `?raw` modules lack types, add ambient
declarations to `src/vite-env.d.ts`:

```ts
declare module '*.vert?raw' {
  const s: string;
  export default s;
}
declare module '*.frag?raw' {
  const s: string;
  export default s;
}
```

Keep the `shaders/*.vert|frag` source files in place — the `?raw` import reads
them, so they remain the source of truth.

No other vendored files change in Phase 1.

---

## D. Backend — add `consoles` collection

### D.1 Schema

Add the `consoles` collection to `pb_schema.json` per [`spec.md` §7.1](./spec.md#71-schema-addition): fields `label` (text), `region` (select NTSC-U/NTSC-J/PAL), `bios` (file, required, `maxSize: 2097152`). Public read (`listRule`/`viewRule: ""`), no public write (`createRule`/`updateRule`/`deleteRule: null`).

### D.2 Apply to the running PocketBase

Create the collection in the live instance and upload one record containing `SCPH1001.BIN` (region `NTSC-U`). This is a one-time data action outside the repo.

### D.3 Regenerate types

`npm run typegen` → produces `ConsolesResponse` in `src/types/pocketbase.ts`.

### D.4 Doc

Update `AGENTS.md` Collections table to include `consoles`.

---

## I. Migrate vendored tests + Node guard

Do this **before** writing adapters — a green vendored test suite proves the
aliases + tsconfig + allowJs are correct, isolating that risk from adapter bugs.

### I.1 Copy the Vitest suite

`psxanywhere/tests/client/**` → `psflix/tests/vendor/psxanywhere/client/**` (incl. `helpers/`). Full list in [`spec.md` §11.1](./spec.md#111-vitest-suite--testsvendorpsxanywhere).

### I.2 Repoint imports

- Alias imports (`'emulator-core'` / `'emulator-client'` / `'repository'`) — unchanged.
- Relative subject imports — repoint to the vendored tree. Example:
  ```ts
  // was: import { ... } from '../../src/client/input';
  import { ... } from '@/vendor/psxanywhere/client/input';
  ```
- Helper imports inside `tests/vendor/psxanywhere/client/helpers/` stay relative within the copied subtree.

### I.3 Environment

Default environment is `happy-dom` (PSflix vitest config). If `input-controller.test.ts` fails under happy-dom, add `// @vitest-environment jsdom` as the first line of that file. Pure tests already carry `// @vitest-environment node`.

### I.4 `fake-indexeddb`

The IDB tests (`idb.test.ts`, `memcard-storage-idb.test.ts`, `save-state-storage-idb.test.ts`) `import 'fake-indexeddb/auto'` themselves — the devDep from B.6 satisfies this.

### I.5 Node guard

Copy `psxanywhere/scripts/test/{controller-constants.test.js,package.json}` → `psflix/scripts/test/`. Repoint the two `.js` imports inside the guard:

```js
// messages.js path
import { MSG, CONTROLLER } from '../../src/vendor/psxanywhere/emulator/messages.js';
// layout.js path
import { ... } from '../../src/vendor/psxanywhere/emulator/sab/layout.js';
```

Run `npm run test:controller-guard` (script added in B.6).

**Checkpoint:** `npm test` green (PSflix suite + vendored suite), `npm run test:controller-guard` green. Aliases + tsconfig are now proven correct.

---

## F. Repository adapter (Phase 1 surface)

New file: `src/features/console/services/psxAnywhereRepository.ts`.

Implements PSxAnywhere's `Repository` interface (type-only import via `repository` alias) over PSflix's `pb` singleton. Phase 1 implements only what the facade needs to boot + fetch the BIOS; the rest stub cleanly so IDB persistence works and sync is skipped (the guide's "null backend" pattern).

```ts
import type { Repository, SaveStateRecordDto } from 'repository';
import { pb } from '@/lib/pb';
import { fileUrl } from '@/lib/pb-files';

class PsxAnywhereRepository implements Repository {
  // ── Auth (delegate to PSflix's pb) ───────────────────────────────
  isAuthenticated() {
    return pb.authStore.isValid && !!pb.authStore.record;
  }
  currentUsername() {
    const r = pb.authStore.record;
    return r ? r.username || r.email || r.name || r.id : null;
  }
  onAuthChange(cb: () => void) {
    pb.authStore.onChange(() => cb());
  }
  async loginWithEmailPassword(email, password) {
    await pb.collection('users').authWithPassword(email, password);
  }
  async registerWithEmailPassword(email, password) {
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    await pb.collection('users').authWithPassword(email, password);
  }
  logout() {
    pb.authStore.clear();
  }
  getCurrentUserId() {
    return pb.authStore.record?.id ?? null;
  }

  // ── BIOS (Phase 1 needs this) ───────────────────────────────────
  async fetchBiosUrl(): Promise<string> {
    const rec = await pb.collection('consoles').getFirstListItem('');
    return fileUrl(rec, rec.bios);
  }

  // ── Catalog (unused by PSflix — react-query catalog instead) ────
  async fetchGames(): Promise<never> {
    throw new Error('fetchGames not used — PSflix has its own catalog');
  }

  // ── Phase 1 stubs (local-only IDB; cloud sync is Phase 2) ───────
  async resolveDiscId(): Promise<never> {
    throw new Error('Phase 2');
  }
  async lookupDiscSerial(): Promise<never> {
    throw new Error('Phase 2');
  }
  async uploadSaveState(): Promise<never> {
    throw new Error('Phase 2');
  }
  async downloadSaveState(): Promise<never> {
    throw new Error('Phase 2');
  }
  async fetchSaveStateBytes(): Promise<never> {
    throw new Error('Phase 2');
  }
  async hasRemoteState(): Promise<boolean> {
    return false;
  }
  async getSaveStateRecord(): Promise<never> {
    throw new Error('Phase 2');
  }
  async fetchNewerSaveStates(): Promise<never[]> {
    return [];
  }
  async fetchSaveStatesFor(): Promise<SaveStateRecordDto[]> {
    return [];
  }
  async uploadMemcard(): Promise<never> {
    throw new Error('Phase 2');
  }
  async downloadMemcard(): Promise<never> {
    throw new Error('Phase 2');
  }
  async hasRemoteMemcard(): Promise<boolean> {
    return false;
  }
}

export const psxAnywhereRepository: Repository = new PsxAnywhereRepository();
```

Key property: because it wraps the same `pb` instance `SignInDialog` uses, sign-in/out updates `pb.authStore`, which fires the repository's `onAuthChange` callback → the facade's sync engines react (in Phase 1 they no-op on the stubbed cloud methods, but the wiring is correct for Phase 2).

**Note on auth in Phase 1:** the existing auth-gating UI (`GameWindow.tsx:168-189`) disables save/load when `!isAuthenticated`. Phase 1 keeps that gate even though saves are local IDB — it matches the existing UX and Phase 2 removes the asymmetry. (If you want anon saves in Phase 1, relax the gate in `GameWindow` — but that diverges from the existing design; default is to keep the gate.)

---

## G. EmulatorService adapter

### G.1 Grow the interface — `src/features/console/services/emulator.ts`

Add (non-breaking):

```ts
attachCanvas(canvas: HTMLCanvasElement): Promise<void>;
destroy(): void;
```

Change `play(): void` → `play(): Promise<void>` (`start()` is async). Callers (`ConsoleView` via `useEmulator`) already `await` nothing today — update `useEmulator.ts:47-49` to await.

While here, remove the duplicate `getMemorySlotAssignment`/`setMemorySlot` declarations (`emulator.ts:42-44` and `:52-54` — TypeScript merges them, but they are a latent cleanup).

### G.2 `PsxAnywhereEmulatorService`

New file: `src/features/console/services/psxAnywhereEmulatorService.ts`. Sketch + behavior in [`spec.md` §10.2](./spec.md#102-psxanywhereemulatorservice-srcfeaturesconsoleservicespsxanywhereemulatorservicets). Concretely:

- **Internal store**: a small zustand store mirroring the mock's shape (`runtime`, `controllers`, `settings`, plus slot/memory-card placeholders). Existing hooks read via `useSyncExternalStore` against `subscribeRuntime`/`subscribeControllers`/`subscribeSettings`/`subscribeMemorySlots` — keep those returning the store's `subscribe` + `getState`.
- **`attachCanvas(canvas)`**: construct `EmulatorClient({ canvas, repository: psxAnywhereRepository, log, toast, autoSave: { intervalMs: 5*60_000 } })`, wire every event in the table below, `await client.boot()`. Idempotent if already attached.
- **Event wiring**:
  | Event             | Effect                                                                                                                                                   |
  | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `ready`           | `runtime.status = 'idle'`                                                                                                                                |
  | `loaded`          | `runtime.status = 'paused'`; `runtime.currentDiscId` set in `loadDisc`                                                                                   |
  | `stopped`         | `runtime.status = 'paused'`                                                                                                                              |
  | `buffering`       | `runtime.status = 'loading'` while `detail.visible` else restore prior                                                                                   |
  | `fatal`           | `runtime.status = 'idle'`; stash `fatalMsg`; expose via a `getFatal()` accessor the UI reads                                                             |
  | `canvas-replaced` | update `this._canvasRef = e.detail.canvas`; emit a React-facing signal (the runtime store bumps so `useRuntime` re-renders and `GameWindow` can re-bind) |
  | `state-saved`     | invalidate save-state query (no-op in Phase 1; the list is local)                                                                                        |
- **`loadDisc(disc)`**: `const chdUrl = fileUrl(disc, disc.iso); await client.loadDisc({ chdUrl, serial: disc.serial, onProgress: f => this._progress = f }); set({ runtime: { currentDiscId: disc.id, status: 'paused' } })`.
- **`play()`**: `set(status: 'loading'); await client.start(); set(status: 'playing')`.
- **`pause()`**: `client.stop()` (facade emits `stopped`).
- **`reset()`**: `await client.reset()` (facade replaces canvas + emits `canvas-replaced`).
- **Save/load** (local IDB via facade):
  - `saveState(slot, discId, userId)` → `await client.saveState(mapSlot(slot))`.
  - `loadState(slot, discId, userId)` → `await client.loadState(mapSlot(slot))`; on rejection throw `Error('No save in ${slot} for this disc')` so `useEmulator`'s existing catch + toast fires.
  - `listSaveStates(discId, userId)` → probe `client.hasState(mapSlot(s))` for each `s` in `SAVE_SLOTS`; return `SaveStateInfo[]` (synthesize `id`/`updatedAt` locally — Phase 1 has no server record; use slot-derived ids).
  - `deleteState(...)` → Phase 2 (facade has no delete API; would go through repository).
- **Memory cards / slots**: return the mock's seeded defaults (`mc-main`, `mc-rpg`) and the default slot assignment. Real memcard persistence is Phase 2.
- **Controllers**: defaults (`port1: 'standard'`, `port2: 'none'`). `setController(port, type)` maps `ControllerType` → `EmulatorClient.CONTROLLER.*` and calls `client.setController(port-1, { device, source: 'keyboard' })`. Phase 1 keeps the mapping minimal.
- **Settings**: zustand + `localStorage` (`psflix:console-settings`, unchanged). On `setSettings`: if `crtFilter` changed → `client.setCrt(bool)`; if `masterVolume` changed → `client.setVolume(vol/100)` and also call the facade only after `attachCanvas` (guard against pre-attach calls).
- **`mapSlot`**: see [`spec.md` §10.2 "Slot mapping"](./spec.md#slot-mapping).

### G.3 Swap the singleton — `src/features/console/services/index.ts`

```ts
import { PsxAnywhereEmulatorService } from './psxAnywhereEmulatorService';
import type { EmulatorService } from './emulator';
export const emulatorService: EmulatorService = new PsxAnywhereEmulatorService();
// Mock kept for tests: export { MockEmulatorService } from './emulator.mock';
```

Keep `MockEmulatorService` exported so existing unit tests + Storybook-style fixtures still work; the production singleton is the real adapter.

---

## H. Wire the canvas + boot order

### H.1 `GameWindow.tsx` — mount the canvas

- Add a `<canvas ref={canvasRef} />` inside the 4:3 `containerRef` div (`GameWindow.tsx:87-91`), at the base layer (no `z-*`). The CRT overlay (`z-10`), loading overlay (`z-20`), control clusters (`z-30`), volume (`z-40`) already stack above it.
- Replace `<NoEmulatorOverlay />` at `:92` with: render the overlay only while no live session is attached (e.g. `runtime.status === 'idle' && !hasCanvas`). Once `attachCanvas` resolves, the canvas is visible.
- Stable React key on the canvas + **no props that change identity** — React must never re-create it (the facade mutates the DOM directly on `reset()`).
- On mount effect: `emulatorService.attachCanvas(canvasRef.current!)`.
- Subscribe to canvas-replaced: when the runtime store signals a replacement, update `canvasRef.current` to the new node (read via an accessor on the service, e.g. `emulatorService.getCanvas()`). Do **not** let React reconcile the canvas's children.
- `onPlay` already runs inside the click handler at the play button cluster (`:118-150`) → `client.start()`'s user-gesture requirement is satisfied. Make the handler `async` and `await emulatorService.play()`.

### H.2 `ConsoleView.tsx` — pass canvas through

`ConsoleView` already renders `<GameWindow .../>` at `:97`. The canvas lives inside `GameWindow`; no prop drilling needed beyond what's there. Surface `fatalMsg` (from G.2) into a recovery overlay: a "Reload console" button calling `emulatorService.reset()` (which re-attaches via `canvas-replaced`) or `navigate('/game/${firstDiscSerial}')`.

### H.3 `useEmulator.ts` — boot order

Adjust the bootstrap effect (`useEmulator.ts:27-38`):

1. Keep the `bootedRef` one-shot guard + the wait for `gameQuery.data` + `discs.length > 0`.
2. After `attachCanvas` is done (the `GameWindow` mount effect handles it; `useEmulator` can `await emulatorService.attachCanvas(canvas)` if the canvas ref is passed in, or rely on `GameWindow` doing it first — pick one owner; recommended: `GameWindow` owns the canvas ref + `attachCanvas`, `useEmulator` waits on a `ready` signal exposed by the service).
3. If `resume && user`: `await emulatorService.loadState('auto', initial.id, user.id)` (catch → existing toast).
4. `await emulatorService.loadDisc(initial)`.
5. `set({ runtime: { currentDiscId: initial.id } })`.

`switchDisc(disc)` (`:40-45`): for a multi-disc swap, expose `emulatorService.swapDisc(disc)` → `client.swapDisc(fileUrl(disc, disc.iso))` (avoids re-booting the core). Wire `DiscSelector.onChange` to `switchDisc`.

`play`/`pause`/`reset` (`:47-49`): make async; `await` the service calls.

### H.4 Slot/save UI

No change to `SlotPickerDialog` / `useSaveStates` / `useSaveStateMutation` — they already call `emulatorService.listSaveStates/saveState/loadState`, which now hit IDB through the facade. The "no save" toast path is preserved by the adapter's rejection.

---

## E. Cross-origin isolation (dev) — already done in B

`vite.config.ts` `server.headers` (B.3) sends the three headers in dev. Verify once:

```js
// browser console at http://localhost:5173
self.crossOriginIsolated; // → true
```

If `false`, confirm the headers landed (DevTools → Network → any response → Headers).

Prod headers are deployed via the reverse proxy (out of this repo). For Phase 1 verification in a prod-shaped env, deploy behind the proxy and re-check.

---

## J. Docs + verification

### J.1 `AGENTS.md`

- Add `consoles` to the Collections table (D).
- Replace the "no emulator is wired in yet" note in the save_state/memory_cards "Field gotchas" with "Emulator wired in (Phase 1: local IDB; Phase 2: cloud sync)."
- Add a short section pointing at `specs/emulator-integration/`.

### J.2 Verify

Run, in order, all green:

```sh
npm run typecheck                       # both tsconfigs
npm run lint
npm test                                # PSflix + migrated vendored suite
npm run test:controller-guard           # standalone Node guard
npm run build                           # tsc --noEmit && vite build
npm run verify:build                    # boots dist + curls
```

Confirm `dist/pcsx_rearmed.{js,wasm}` exist at the bundle root.

### J.3 Runtime smoke (dev)

1. Ensure `consoles` has the BIOS record (D.2) and at least one `discs.iso` is a real CHD in PocketBase.
2. `npm run dev`, open `http://localhost:5173`.
3. DevTools console: `self.crossOriginIsolated === true`.
4. Navigate to `/#play/<first_disc_serial>` (e.g. via a game's "Play" button).
5. Disc boots, BIOS + title visible, no `fatal` in console, playable with keyboard.
6. Save to `slot1`. Reload the page. Resume → the `slot1` save loads from IDB.
7. Multi-disc game (if available): `DiscSelector` swap changes the disc without a full reload.

### J.4 Runtime smoke (prod-shaped)

Behind the reverse proxy with CO* headers, repeat J.3 against the deployed origin + a real PocketBase CHD. Verify `crossOriginIsolated`, `Accept-Ranges`/`206` on the CHD (curl §9.4 in spec).

---

## Phase 1 definition of done

- [ ] Vendored tree copies clean; `pocketbase` is the only external import.
- [ ] `blit.ts` shaders inlined (`?raw`); no `/src/...` runtime fetch remains.
- [ ] `consoles` collection exists; `SCPH1001.BIN` uploaded; types regenerated.
- [ ] `tsconfig` (both) + `vite` + `vitest` + `eslint` + `package.json` updated.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:controller-guard` all green.
- [ ] `PsxAnywhereRepository` delegates auth + BIOS, stubs cloud.
- [ ] `PsxAnywhereEmulatorService` replaces the mock singleton; interface grown; events → store; canvas-ref dance handled.
- [ ] `GameWindow` mounts a real `<canvas>`; boot order in `useEmulator` works; multi-disc swap via `swapDisc`.
- [ ] Dev smoke (J.3) passes; prod-shaped smoke (J.4) passes.
- [ ] `AGENTS.md` updated.

Phase 2 picks up at cloud sync: [`phase-2.md`](./phase-2.md).
