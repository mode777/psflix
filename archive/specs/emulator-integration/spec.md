# Spec — Emulator Integration (PSxAnywhere → PSflix)

Status: **Planned**. Phased: Phase 1 (local-only IDB) → Phase 2 (PocketBase cloud sync).
Implementation plans: [`phase-1.md`](./phase-1.md), [`phase-2.md`](./phase-2.md).

## 1. Goal

Wire the existing PSxAnywhere emulator (`EmulatorClient` facade) into PSflix's
already-built-but-mocked console feature so that `/play/:firstDiscSerial` boots a
real PS1 game streamed from PocketBase, with save states + memory cards persisted
locally first (Phase 1) and synced to PocketBase second (Phase 2).

The end state replaces the placeholder at `src/features/console/components/NoEmulatorOverlay.tsx`
with a live `<canvas>` driven by the WASM core.

## 2. Decisions (locked)

| #   | Decision                              | Choice                                                                                                                        |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Source consumption                    | **Copy** PSxAnywhere `src/{emulator,client,repository}` into `src/vendor/psxanywhere/` + path aliases. Updates are a re-copy. |
| 2   | Cross-origin isolation headers (prod) | **Reverse proxy** (nginx/Caddy) in front of PocketBase. Vite `server.headers` for dev.                                        |
| 3   | BIOS hosting                          | **Add a `consoles` collection** to PocketBase (so PSxAnywhere's `fetchBiosUrl()` works unchanged).                            |
| 4   | Repository impl                       | **Adapt PSflix's existing `pb` singleton** (`src/lib/pb.ts`) into PSxAnywhere's `Repository` interface — one auth source.     |
| 5   | Scope                                 | **Phase 1 = local-only IDB** (no cloud sync); **Phase 2 = cloud sync** of `save_state` + `memory_cards`.                      |

## 3. Background — what already exists

### PSflix (target)

- React 18 + Vite 5 + TS + Tailwind + react-query + zustand + react-router (HashRouter).
- Bundled SPA deployed to PocketBase's `pb_public` on `https://pb.example.com` (same origin as backend). `vite.config.ts` uses `base: './'`.
- A **full mocked console feature** already exists at `src/features/console/`:
  - Route: `src/App.tsx:26` → `/play/:firstDiscSerial` → `src/routes/ConsoleView.tsx`.
  - Service contract: `src/features/console/services/emulator.ts:25` — `EmulatorService` interface (player lifecycle, save states, memory cards, controller ports, settings). Header comment states the swap seam.
  - Mock impl: `src/features/console/services/emulator.mock.ts` (zustand-backed, 450 ms simulated latency, persists only `ConsoleSettings` to `localStorage`).
  - Singleton swap point: `src/features/console/services/index.ts:12` — `export const emulatorService = new MockEmulatorService()`.
  - Hooks: `useEmulator`, `useRuntime`, `useSaveStates`, `useMemoryCards`, `useControllerPorts`, `useConsoleSettings`, `useMemorySlotAssignment` (all under `src/features/console/hooks/`).
  - Components: `GameWindow` (the 4:3 screen surface + controls), `ControlsPanel`, `DiscSelector`, `OptionsDialog`, `SlotPickerDialog`, `PortManager`, `EnvironmentPanel`, `ConsoleSkeleton`, `NoEmulatorOverlay`.
  - Types: `src/features/console/types.ts` — `PlayerStatus`, `ControllerType`, `SaveSlot` (= `'auto'|'slot1'|'slot2'|'slot3'`), `ConsoleSettings`, `SaveStateInfo`, `MemoryCardInfo`, `PlayerRuntimeState`, `ControllerPorts`, `MemorySlotAssignment`.
- `discs.iso` is in the schema/types (`src/types/pocketbase.ts:52`) but **read by no application code** — it is the `chdUrl` integration point.
- PocketBase client singleton: `src/lib/pb.ts:3` (`new PocketBase(url)`, `url = import.meta.env.VITE_PB_URL || 'https://pb.example.com'`).
- File URL helper: `src/lib/pb-files.ts:5` — `fileUrl(record, filename)` → `pb.files.getURL(...)`.
- Auth: `src/lib/pb-auth.ts` + zustand mirror `src/features/auth/store.ts` (subscribes to `pb.authStore.onChange`).

### PSxAnywhere (source)

- The integration surface is **one class**: `EmulatorClient` (`src/client/EmulatorClient.ts`), exported via the `emulator-client` alias. It owns: Worker + WASM core, audio graph, streaming CHD bridge, input, IndexedDB persistence, cloud sync, BIOS loading, controllers, auto-save.
- Constructs from `{ canvas, repository, ...optional }`; `repository` is PSxAnywhere's `Repository` interface (`src/repository/repository.ts:64`) — the **only** external runtime dep is the `pocketbase` SDK (already in PSflix).
- Boot: `boot()` → `loadDisc({ chdUrl, serial, onProgress })` → `start()` (must be inside a user gesture for audio).
- `EmulatorClient extends EventTarget`; events drive UI (`ready`, `loaded`, `stopped`, `stats`, `fatal`, `buffering`, `canvas-replaced`, `state-saved`, `auth-change`, `gamepad-*`).
- `reset()` destroys + recreates the underlying `Emulator` and **replaces the canvas element** — `canvas-replaced` event is mandatory to handle.
- Schemas already align 1:1 (same PocketBase instance, same collection names + field shapes): `games`, `discs`, `save_state`, `memory_cards`, `users`. The only missing collection is `consoles` (BIOS host) — see §7.

## 4. Architecture after integration

```
┌─────────────────────────────────────────────────────────────────────┐
│ PSflix React app                                                    │
│                                                                     │
│  ConsoleView ──▶ useEmulator ──▶ emulatorService (singleton)        │
│        │                                   │                         │
│        │ <canvas> ref ── attachCanvas ─────┤                         │
│        │                                   ▼                         │
│        │                       PsxAnywhereEmulatorService            │
│        │                       (implements PSflix EmulatorService)   │
│        │                                   │                         │
│        │                                   │  translates events →    │
│        │                                   │  zustand store that the │
│        │                                   │  existing hooks read    │
│        │                                   ▼                         │
│        │                       EmulatorClient  (vendored facade)     │
│        │                       ├── Emulator (Worker + WASM + audio)  │
│        │                       ├── InputController                  │
│        │                       ├── SaveStateStore (IDB)             │
│        │                       ├── MemcardSync                      │
│        │                       └── BiosLoader                       │
│        │                                   │                         │
│        │                                   ▼  (constructor-injected) │
│        │                       PsxAnywhereRepository                │
│        │                       (implements PSxAnywhere Repository;  │
│        │                        delegates to PSflix pb singleton)   │
│        │                                   │                         │
│        └───────────────────────────────────┴── same PocketBase      │
└─────────────────────────────────────────────────────────────────────┘
```

Two adapters sit between PSflix's UI and the vendored facade:

1. **`PsxAnywhereRepository`** — implements PSxAnywhere's `Repository` interface over PSflix's `pb` singleton. Keeps auth unified.
2. **`PsxAnywhereEmulatorService`** — implements PSflix's existing `EmulatorService` interface over an `EmulatorClient` instance. Owns the canvas ref, translates `EventTarget` events into the zustand-shaped `getSnapshot`/`subscribe` pairs the existing hooks already consume via `useSyncExternalStore`.

Both adapters are PSflix code under `src/features/console/services/`. The vendored facade is treated as a black box; nothing in `src/vendor/psxanywhere/` imports back into PSflix.

## 5. Vendoring — what gets copied and where

Copy from `/Users/alexk/repos/psxanywhere/` into `/Users/alexk/repos/psflix/src/vendor/psxanywhere/`:

### 5.1 Source trees (full, preserving relative layout)

```
src/vendor/psxanywhere/
├── emulator/                     # the `emulator-core` alias barrel
│   ├── index.ts                  # barrel: Emulator, CONTROLLER, BUTTON, MSG, ...
│   ├── Emulator.ts               # facade class (spawns worker @ :210)
│   ├── AudioManager.ts
│   ├── ChunkStore.ts             # HTTP-range chunk cache (Cache API)
│   ├── RemoteChd.ts              # streaming CHD reader
│   ├── bridge.ts                 # the Speculator
│   ├── perfWarn.ts
│   ├── rgb565.ts
│   ├── buttons.ts
│   ├── audio-worklet.ts          # runs in worklet scope (WebWorker lib)
│   ├── audio-worklet.d.ts        # ambient worklet types
│   ├── messages.js               # ⚑ .js — see §5.3
│   ├── sab/
│   │   └── layout.js             # ⚑ .js — see §5.3
│   ├── worker/
│   │   ├── coreWorker.ts         # worker entry; fetches pcsx_rearmed.js @ :178
│   │   ├── context.ts
│   │   ├── boot.ts
│   │   ├── audio-clock.ts
│   │   ├── memcard.ts
│   │   ├── save-load.ts
│   │   ├── sab_runtime.js        # ⚑ .js — see §5.3
│   │   ├── host.c, host.h
│   │   ├── streaming_core_file.c, streaming_core_file.h
│   │   └── worker_shim.c
│   └── worker/gl/
│       ├── blit.ts               # ⚑ hardcoded shader path — see §6.1
│       ├── crt-shader.ts
│       ├── gl-util.ts
│       └── shaders/
│           ├── fullscreen.vert
│           └── unpack.frag
├── client/                       # the `emulator-client` alias barrel
│   ├── index.ts                  # barrel: EmulatorClient + types
│   ├── EmulatorClient.ts         # the facade (574 lines)
│   ├── input.ts, input-pure.ts, input-constants.ts
│   ├── controller-store.ts, rebind-store.ts, rebind-mutation.ts, rebind-capture.ts
│   ├── SaveStateStore.ts, SaveStateSyncEngine.ts, saveStateConflict.ts
│   ├── saveStateStorage.ts, saveStateHeader.ts, save-load.ts, slotKey.ts
│   ├── memcardStorage.ts, MemcardSync.ts, memcard-export.ts
│   ├── bios.ts, idb.ts, local-json.ts
└── repository/                   # the `repository` alias barrel
    ├── index.ts                  # barrel: PocketbaseRepository + Repository type
    └── repository.ts             # Repository interface + PocketbaseRepository class
```

**Do NOT copy** PSxAnywhere's top-level `src/*.ts` UI files (`app.ts`, `toast.ts`, `menu.ts`, `auth.ts`, `controllers.ts`, `crt.ts`, `rebind-table.ts`, `loading.ts`, `hud.ts`, `buffering.ts`, `status.ts`) — PSflix has its own React UI. Also skip `index.html`, `id-extractor/`, `core/`, `emsdk/`, `pcsx_rearmed/`, `samples/`, `issues/`, `specs/`, `scripts/` (except the one test guard — see §11).

### 5.2 Static core assets

Copy `psxanywhere/public/pcsx_rearmed.{js,wasm}` (~888 KB total) → `psflix/public/`. These are served at the **origin root** (see §6.2).

### 5.3 The three `.js` files — keep as `.js`

Per PSxAnywhere `AGENTS.md` ("TypeScript layout"), these stay `.js` and must NOT be transpiled to `.ts`:

| File                             | Why `.js`                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `emulator/messages.js`           | Loaded in the audio-worklet scope, type-checked by a separate `WebWorker`-lib tsconfig.                             |
| `emulator/sab/layout.js`         | Source for the SAB codegen step (`materializeSabRuntimeLibrary`); shared verbatim with the worker's `--js-library`. |
| `emulator/worker/sab_runtime.js` | An emcc `--js-library` source; `.ts` would add a build step the codegen doesn't need.                               |

PSflix's tsconfig must enable `allowJs: true` (see §8.1).

### 5.4 Import-boundary audit (verified)

Every import in the three vendored trees resolves either relatively within the vendored set or via the three bare aliases (`emulator-core` / `emulator-client` / `repository`). The **single** external runtime import is `pocketbase` at `repository/repository.ts:6` — already a PSflix dependency. No vendored file reaches into PSflix's `src/`. The vendoring is a clean cut.

## 6. Required modifications to vendored code

These are the load-bearing changes. Without them the production build does not work.

### 6.1 Inline the blit shaders (REQUIRED for `vite build`)

`psxanywhere/src/emulator/worker/gl/blit.ts:7` hardcodes:

```ts
const SHADER_BASE = '/src/emulator/worker/gl/shaders/';
```

used at `blit.ts:36-39` via runtime `fetchText(SHADER_BASE + ...)`. PSxAnywhere serves `src/` **unbundled** (it is not a `vite build` app — `index.html` is an in-tree entry). PSflix **is** a bundled app (`vite build` → `dist/`), so `/src/...` does not exist in production and the worker would 404 the two GLSL files.

Fix: convert the two GLSL files to Vite `?raw` imports so they are inlined at build time (this is exactly how `crt-shader.ts` already inlines its GLSL as template strings). Keep the `shaders/*.vert|frag` files in place as the source of truth; the `?raw` import reads them.

```ts
// blit.ts (after change)
import fullscreenVert from './shaders/fullscreen.vert?raw';
import unpackFrag from './shaders/unpack.frag?raw';
```

Drop the `SHADER_BASE` constant and the `fetchText` calls; pass the raw strings straight to `createProgramFromSources`. Type the `?raw` modules in `src/vite-env.d.ts` (`declare module '*.vert?raw'`) if needed.

### 6.2 Root-absolute URL assumptions (NO change; deployment assumption)

The worker assumes the core artifacts live at the **document origin root**:

- `worker/coreWorker.ts:178` — `fetch('/pcsx_rearmed.js')`
- `worker/coreWorker.ts:187` — `locateFile: (path) => \`/${path}\``(Emscripten calls with`'pcsx_rearmed.wasm'`)

PSflix's `vite.config.ts` uses `base: './'` (relative), but `base` only affects assets Vite **emits and references**; these are raw runtime `fetch()` calls, unaffected by `base`. They resolve to `https://pb.example.com/pcsx_rearmed.{js,wasm}` — which is correct **because PSflix is deployed to PocketBase's `pb_public` at the origin root**. No code change; record the assumption: _the SPA must remain origin-rooted_. (If PSflix ever moves under a sub-path, these two sites must be parameterized.)

### 6.3 No other modifications

The worker spawn (`Emulator.ts:210` `new Worker(new URL('./worker/coreWorker.ts', import.meta.url), { type: 'module' })`) is the Vite-supported pattern and produces a worker chunk at build time — no change. The `EmulatorClient` canvas transfer (`transferControlToOffscreen()` at `Emulator.ts:209`) and `reset()` canvas-clone (`EmulatorClient.ts:254-259`) work as-is.

## 7. Backend — add `consoles` collection (BIOS host)

PSxAnywhere's `PocketbaseRepository.fetchBiosUrl()` (`repository.ts:162-165`) reads:

```js
const record = await this._pb.collection('consoles').getFirstListItem('');
return this._pb.files.getURL(record, record.bios);
```

PSflix's `pb_schema.json` has **no** `consoles` collection.

### 7.1 Schema addition

Add a new `consoles` base collection to `pb_schema.json` (and create it in the running PocketBase):

| Field    | Type   | Required | Notes                                                        |
| -------- | ------ | -------- | ------------------------------------------------------------ |
| `label`  | text   | no       | e.g. `"SCPH1001 (NTSC-U)"`                                   |
| `region` | select | no       | reuse `NTSC-U` / `NTSC-J` / `PAL` values                     |
| `bios`   | file   | **yes**  | `maxSize: 2097152` (2 MB), `mimeTypes: null`, `maxSelect: 1` |

Access rules: **public read** (`listRule: ""`, `viewRule: ""` — empty string = public in PocketBase), no public create/update/delete (`createRule/updateRule/deleteRule: null`). One record is uploaded containing `SCPH1001.BIN`. Public read matters: the CHD streaming bridge fetches the BIOS URL with no auth header, so the file must be publicly readable (matches `discs.iso`, which is also public).

### 7.2 Regenerate types

Run `npm run typegen` (`pocketbase-typegen --json ./pb_schema.json --out ./src/types/pocketbase.ts`) so `ConsolesResponse` exists. Update PSflix's `AGENTS.md` Collections table to document the new collection.

## 8. Config changes (PSflix)

### 8.1 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", // was ES2020; vendored code uses ES2022 APIs (Atomics, etc.)
    "lib": ["ES2022", "DOM", "DOM.Iterable"], // was ES2020
    "allowJs": true, // NEW — for messages.js, sab/layout.js
    // ...rest unchanged...
    "paths": {
      "@/*": ["src/*"],
      "emulator-core": ["src/vendor/psxanywhere/emulator/index"],
      "emulator-client": ["src/vendor/psxanywhere/client/index"],
      "repository": ["src/vendor/psxanywhere/repository/index"],
    },
  },
  "include": ["src"],
  "exclude": [
    "src/vendor/psxanywhere/emulator/audio-worklet.ts",
    "src/vendor/psxanywhere/emulator/audio-worklet.d.ts",
    "src/vendor/psxanywhere/emulator/sab/layout.js",
    "src/vendor/psxanywhere/emulator/worker/sab_runtime.js",
  ],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.audio-worklet.json" }, // NEW
    { "path": "./tsconfig.vendor.json" }, // NEW (see below)
  ],
}
```

**Strictness note**: PSflix sets `noUnusedLocals`/`noUnusedParameters: true`; PSxAnywhere's tsconfig does not. On copy, run `npm run typecheck` and fix any violations in the vendored tree (expected to be a handful). Do not relax PSflix's project-wide strictness for the rest of `src/`. If the violation count is large, fall back to a dedicated `tsconfig.vendor.json` (project reference) that type-checks only `src/vendor/psxanywhere/**` with PSxAnywhere-equivalent settings — but the cleaner default is to fix-on-copy so the vendored code meets PSflix's bar.

### 8.2 `tsconfig.audio-worklet.json` (NEW — copy from PSxAnywhere)

Verbatim from `psxanywhere/tsconfig.audio-worklet.json`, retargeted to the vendored paths:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "WebWorker"], // no DOM — worklet scope
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "allowJs": true,
  },
  "include": [
    "src/vendor/psxanywhere/emulator/audio-worklet.d.ts",
    "src/vendor/psxanywhere/emulator/audio-worklet.ts",
    "src/vendor/psxanywhere/emulator/sab/layout.js",
  ],
}
```

### 8.3 `tsconfig.vendor.json` (NEW — only if needed; see §8.1 note)

Optional fallback. Type-checks the vendored tree under PSxAnywhere's looser settings. If adopted, add to the `typecheck` script.

### 8.4 `vite.config.ts`

Add the three aliases (must mirror tsconfig `paths` exactly) and the CO* dev headers:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    'emulator-core': path.resolve(__dirname, './src/vendor/psxanywhere/emulator/index.ts'),
    'emulator-client': path.resolve(__dirname, './src/vendor/psxanywhere/client/index.ts'),
    'repository': path.resolve(__dirname, './src/vendor/psxanywhere/repository/index.ts'),
  },
},
server: {
  port: 5173,
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
  },
},
```

Vite applies `resolve.alias` to module workers automatically, so `coreWorker.ts`'s internal alias imports resolve. The `new Worker(new URL('./worker/coreWorker.ts', import.meta.url), { type: 'module' })` pattern is handled natively by Vite's build (emits a worker chunk) — no extra config.

### 8.5 `vitest.config.ts`

Mirror the aliases so vendored tests resolve, and widen `include` to pick up migrated tests (§11):

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    'emulator-core': path.resolve(__dirname, './src/vendor/psxanywhere/emulator/index.ts'),
    'emulator-client': path.resolve(__dirname, './src/vendor/psxanywhere/client/index.ts'),
    'repository': path.resolve(__dirname, './src/vendor/psxanywhere/repository/index.ts'),
  },
},
test: {
  // ...
  include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.test.ts'],
},
```

### 8.6 `.eslintrc.cjs`

Add the vendored tree to `ignorePatterns` (it ships under PSxAnywhere's conventions and is a black box):

```js
ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'src/types/pocketbase.ts', 'src/vendor/psxanywhere'],
```

### 8.7 `package.json` scripts

```jsonc
"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.audio-worklet.json",
"test:controller-guard": "node scripts/test/controller-constants.test.js"
```

Add devDependency `fake-indexeddb` (`^6.2.5`) — used by the migrated IDB tests. `pocketbase` is already present.

## 9. Cross-origin isolation (the non-negotiable prerequisite)

`self.crossOriginIsolated === true` is required or `EmulatorClient`'s constructor throws synchronously (the `SharedArrayBuffer` rings + `Atomics.wait()` bridge depend on it). Every response from the host must carry:

```
Cross-Origin-Opener-Policy:   same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

### 9.1 Dev

Vite `server.headers` (§8.4) sends them on every response. Verify in DevTools: `self.crossOriginIsolated === true`.

### 9.2 Prod — reverse proxy in front of PocketBase

A nginx (or Caddy) config fronts PocketBase and attaches the three headers on **every** response, including errors (use `always` in nginx). Reference config: `docs/emulator/host-app.md` (migrated from `psxanywhere/docs/host-app.md`). Apply via the Flux K8s pipeline (out of scope for this repo per `AGENTS.md`).

### 9.3 Why `require-corp` is safe here

Under `COEP: require-corp`, every sub-resource must be same-origin or carry CORP/CORS. PSflix:

- Bundles `@fontsource/inter`, `material-symbols`, react, etc. → same-origin after build. ✅
- Images / CHD / BIOS / PDFs all served from the same PocketBase origin → satisfied by the `CORP: same-origin` header. ✅

If an unexpected cross-origin resource appears, fall back to `COEP: credentialless` (more lenient; strips credentials from cross-origin sub-resources, which PSflix does not rely on cross-origin anyway). Default stays `require-corp` to match upstream.

### 9.4 CHD streaming requirements (verify with curl)

`RemoteChd.open()` does a `HEAD` and refuses to start without `Accept-Ranges: bytes`; range GETs must return `206 Partial Content` + `Content-Range`. The CHD is same-origin (served from `/api/files/discs/<id>/<iso>`), so the CORS `Access-Control-Expose-Headers` requirement from `host-chd.md` does **not** apply (that is cross-origin only). Verify once:

```sh
curl -sI  <chd-url> | grep -iE 'accept-ranges|content-length|HTTP/'
curl -sI -H 'Range: bytes=0-1023' <chd-url> | grep -iE 'HTTP/|content-range|content-length'
```

If PocketBase's file handler does not honor `Range:` (it should), CHDs must move to a dedicated range-capable origin per `host-chd.md`.

## 10. The two adapters (PSflix code)

### 10.1 `PsxAnywhereRepository` (`src/features/console/services/psxAnywhereRepository.ts`)

Implements PSxAnywhere's `Repository` interface (imported as a type via the `repository` alias), delegating to PSflix's `pb` singleton + `fileUrl()`.

```ts
import type { Repository, SaveStateRecordDto } from 'repository';
import { pb } from '@/lib/pb';
import { fileUrl } from '@/lib/pb-files';
```

| Method group                                                                                                         | Phase 1                                                                                                                   | Phase 2                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Auth** (`isAuthenticated`, `currentUsername`, `onAuthChange`, `login*`, `register*`, `logout`, `getCurrentUserId`) | Delegate straight to `pb.authStore` + `pb.collection('users')`. `onAuthChange(cb)` → `pb.authStore.onChange(() => cb())`. | (unchanged)                                                                                            |
| **Catalog** `fetchBiosUrl()`                                                                                         | Implement: `pb.collection('consoles').getFirstListItem('')` → `fileUrl(rec, rec.bios)`.                                   | (unchanged)                                                                                            |
| Catalog `fetchGames()`                                                                                               | Reject (unused — PSflix has its own react-query catalog).                                                                 | (unchanged)                                                                                            |
| **Disc-ID** (`resolveDiscId`, `lookupDiscSerial`)                                                                    | Stub (reject). Not needed until cloud sync.                                                                               | Implement via `pb.collection('discs')` (`getFirstListItem('serial="..."'`).                            |
| **Save state** cloud ops                                                                                             | Stub (reject / return empty). IDB saves still work.                                                                       | Implement via `pb.collection('save_state')` (FormData upload, `getFirstListItem` filter, bytes fetch). |
| **Memcard** cloud ops                                                                                                | Stub (reject / return empty).                                                                                             | Implement via `pb.collection('memory_cards')`.                                                         |

Because it wraps the same `pb` instance the rest of PSflix uses, auth is a single source of truth: when PSflix's `SignInDialog` calls `auth.signInWithPassword`, the `pb.authStore` updates, the zustand auth mirror updates (existing subscription), AND the repository's `onAuthChange` callback fires → the facade's sync engines react.

### 10.2 `PsxAnywhereEmulatorService` (`src/features/console/services/psxAnywhereEmulatorService.ts`)

Implements PSflix's existing `EmulatorService` interface (`emulator.ts:25`) by owning one `EmulatorClient` per console session. This is the most invasive piece; the interface grows minimally and all existing hooks continue to compile.

#### Lifecycle vs. the singleton

The current `emulatorService` is a module singleton, but `EmulatorClient` is canvas-bound and per-session. Resolution: **lazy singleton**. The service is constructed once (module-level, replaces `MockEmulatorService` at `index.ts:12`); the live `EmulatorClient` is created on demand when `ConsoleView` mounts and calls `attachCanvas(canvas)`; torn down on unmount via `destroy()`. Hooks that call methods before `attachCanvas` get safe no-ops / idle state.

#### Interface growth (`emulator.ts`)

Add:

```ts
attachCanvas(canvas: HTMLCanvasElement): Promise<void>;  // boot the EmulatorClient
destroy(): void;                                         // teardown on unmount
```

Make `play()` return `Promise<void>` (it awaits `client.start()`, which is async + user-gesture-bound). Keep `loadDisc`, `pause`, `reset` signatures as-is (`reset` already returns `Promise<void>`).

#### Internal state

A zustand store (mirroring the mock's shape) backs the synchronous getters the existing hooks read via `useSyncExternalStore`. The adapter subscribes to facade events and writes into the store:

| Facade event                 | Store effect                                      |
| ---------------------------- | ------------------------------------------------- |
| `ready`                      | runtime.status `idle` (core ready, no disc)       |
| `loaded`                     | runtime.status `paused` (disc loaded)             |
| `stopped`                    | runtime.status `paused`                           |
| (after `start()` resolves)   | runtime.status `playing`                          |
| `buffering` `{visible}`      | runtime.status `loading` while visible (spinner)  |
| `fatal` `{msg}`              | runtime.status `idle` + surface error (see §10.3) |
| `stats`                      | optional: drive elapsedMs / a perf HUD            |
| `state-saved`                | invalidate the save-state query (Phase 2)         |
| `canvas-replaced` `{canvas}` | update internal canvas ref (see §10.4)            |

#### Method mapping

| `EmulatorService` method               | Adapter implementation                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachCanvas(canvas)`                 | `new EmulatorClient({ canvas, repository: psxAnywhereRepository, log, toast, autoSave: { intervalMs: 5*60_000 } })`; `await client.boot()`.                                                                                                          |
| `loadDisc(disc)`                       | Resolve `chdUrl = fileUrl(disc, disc.iso)`; `await client.loadDisc({ chdUrl, serial: disc.serial, onProgress })`. Set `runtime.currentDiscId = disc.id`.                                                                                             |
| `play()`                               | `runtime.status = 'loading'`; `await client.start()` (must run inside ConsoleView's play click handler); on resolve → `playing`.                                                                                                                     |
| `pause()`                              | `client.stop()`.                                                                                                                                                                                                                                     |
| `reset()`                              | `await client.reset()`; handle `canvas-replaced`.                                                                                                                                                                                                    |
| `getRuntime` / `subscribeRuntime`      | zustand snapshot/subscribe.                                                                                                                                                                                                                          |
| `saveState(slot, discId, userId)`      | `await client.saveState(mapSlot(slot))`; (Phase 2 also surfaces a `SaveStateInfo` from the cloud record).                                                                                                                                            |
| `loadState(slot, discId, userId)`      | `await client.loadState(mapSlot(slot))`. On "no state" reject, throw the existing `Error('No save in ${slot} ...')` so `useEmulator`'s catch + "No saved progress found" toast still fires.                                                          |
| `listSaveStates(discId, userId)`       | Probe `client.hasState(mapSlot(s))` for each slot in `SAVE_SLOTS`; return `SaveStateInfo[]` (Phase 1: local IDB only).                                                                                                                               |
| `deleteState(...)`                     | Phase 2 (facade has no delete; remove via repository).                                                                                                                                                                                               |
| Memory card / slot methods             | Phase 1: stub (return seeded defaults like the mock). Phase 2: delegate to facade memcard methods.                                                                                                                                                   |
| Controller ports                       | Phase 1: defaults (digital pad, port 0, keyboard). `setController` delegates to `client.setController` but the mapping is partial; `PortManager` may show defaults until fully wired. Phase 2: full mapping via `client.getLiveControllerConfigs()`. |
| Settings (`crtFilter`, `masterVolume`) | zustand + `localStorage` (key `psflix:console-settings`, unchanged). On change: `client.setCrt(bool)` and `client.setVolume(vol/100)`.                                                                                                               |

#### Slot mapping

PSflix `SaveSlot` = `'auto'|'slot1'|'slot2'|'slot3'` (the PocketBase `type` values). `EmulatorClient.saveState(slot)` accepts `number | SLOT_AUTO`. Map:

```ts
function mapSlot(slot: SaveSlot): number | typeof SLOT_AUTO {
  if (slot === 'auto') return EmulatorClient.SLOT_AUTO;
  return Number(slot.replace('slot', '')) - 1; // slot1→0, slot2→1, slot3→2
}
```

(The facade + repository translate these to the PB `type` string internally via PSxAnywhere's `slotKey.ts`.)

#### Auto-save

Construct `EmulatorClient` with `autoSave: { intervalMs: 5 * 60_000 }` (5 min, matching the guide's example). The facade also fires on `visibilitychange`/`pagehide`. Writes to `SLOT_AUTO` → `save_state.type = 'auto'`.

### 10.3 Error / fatal UX

On `fatal`, the facade tears down the `Emulator`. Surface a recovery overlay (extend `NoEmulatorOverlay` or add a `FatalOverlay`) with a "Reload console" button that calls `emulatorService.reset()` (which re-attaches the canvas via the `canvas-replaced` flow) or navigates back to `/game/:serial`. The existing `ConsoleSkeleton` covers the `loading` window.

### 10.4 The canvas-ref dance (most common integration bug)

`EmulatorClient.reset()` calls `this._canvas.cloneNode(false)` + `replaceWith(newCanvas)` (`EmulatorClient.ts:254-259`) — **direct DOM mutation**. React must not fight this. Pattern:

- `GameWindow.tsx` renders a single `<canvas ref={canvasRef} />` inside the 4:3 container (`containerRef` at `GameWindow.tsx:87-91`), replacing `<NoEmulatorOverlay>` at `:92` once a real session is live.
- The canvas has a **stable React key** and **no props that change identity** so React never re-creates it.
- On mount (effect): `emulatorService.attachCanvas(canvasRef.current!)`.
- Subscribe to `canvas-replaced` (via the runtime store / a dedicated event hook) and update `canvasRef.current = newCanvas`. Do not let React reconcile the canvas children.
- The CRT overlay, loading spinner, and control clusters already stack above the canvas via z-index (`z-10`/`z-20`/`z-30`/`z-40`); the canvas sits at the base (no z).

### 10.5 Boot order in `ConsoleView` / `useEmulator`

`useEmulator.ts:27-38`'s bootstrap effect becomes (conceptually):

1. Wait for `gameQuery.data` + `discs.length > 0` (existing).
2. `await emulatorService.attachCanvas(canvasRef)` (new — once).
3. If `resume && user`: `await emulatorService.loadState('auto', initial.id, user.id)` (catch → toast "No saved progress found").
4. `await emulatorService.loadDisc(initial)`.
5. Set `runtime.currentDiscId = initial.id`.

`switchDisc(disc)` (`useEmulator.ts:40-45`) → for multi-disc, prefer `client.swapDisc(fileUrl(disc, disc.iso))` over a full `loadDisc` (avoids re-booting the core). The adapter exposes both; `DiscSelector`'s `onChange` may call a dedicated `swapDisc` path.

The play button handler in `GameWindow.tsx` (the `onPlay` cluster ~`:118-150`) already runs inside a click handler — `client.start()`'s user-gesture requirement is satisfied.

## 11. Test migration

PSxAnywhere ships a Vitest suite + a standalone Node guard. Both migrate.

### 11.1 Vitest suite → `tests/vendor/psxanywhere/`

Copy `psxanywhere/tests/client/**` → `psflix/tests/vendor/psxanywhere/client/**`, including helpers (`tests/client/helpers/{emulator-mock,repository-mock}.ts`). Update imports:

- **Alias imports** (`import ... from 'emulator-core'` / `'emulator-client'` / `'repository'`) — **unchanged** (aliases resolve via §8.5).
- **Relative subject imports** (`../../src/client/input`, etc.) — repoint to `@/vendor/psxanywhere/client/input` (or relative `../../../src/vendor/psxanywhere/...`).

Coverage list (one file each):

| Migrated test                    | Covers                                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bios.test.ts`                   | `BiosLoader` cache miss→fetch→persist.                                                                                                                                                                                      |
| `controller-store.test.ts`       | `ControllerStore` round-trip + `formatDeviceHex`/`controllerTypeName`.                                                                                                                                                      |
| `emulator-client.test.ts`        | The facade end-to-end with mocked Emulator — static re-exports, boot/reset/destroy, **canvas-replaced**, generation guard, loadDisc BIOS paths, save/load, memcard events, auto-save. (Largest; highest integration value.) |
| `idb.test.ts`                    | IDB promise utils + self-heal. (Uses `fake-indexeddb`.)                                                                                                                                                                     |
| `input-controller.test.ts`       | `InputController` registry, rebind persistence, DOM fan-out, capture flow. (jsdom/happy-dom env.)                                                                                                                           |
| `input-pure.test.ts`             | Pure input math.                                                                                                                                                                                                            |
| `input.test.ts`                  | `ControllerWriter` translation.                                                                                                                                                                                             |
| `memcard-storage-idb.test.ts`    | `IdbMemcardStorage` vs `fake-indexeddb`.                                                                                                                                                                                    |
| `memcard-sync.test.ts`           | `MemcardSync` auth gating + debounced upload.                                                                                                                                                                               |
| `rebind-mutation.test.ts`        | Rebind mutators.                                                                                                                                                                                                            |
| `rebind-store.test.ts`           | `RebindStore.forMemory()`.                                                                                                                                                                                                  |
| `save-load.test.ts`              | `SaveLoadController` round-trip.                                                                                                                                                                                            |
| `save-state-conflict.test.ts`    | LWW conflict policy.                                                                                                                                                                                                        |
| `save-state-header.test.ts`      | PSAS header codec.                                                                                                                                                                                                          |
| `save-state-storage-idb.test.ts` | `IdbSaveStateStorage` vs `fake-indexeddb`.                                                                                                                                                                                  |
| `save-state-storage.test.ts`     | `InMemorySaveStateStorage`.                                                                                                                                                                                                 |
| `save-state-store.test.ts`       | `SaveStateStore` local CRUD + cloud cache-on-miss.                                                                                                                                                                          |
| `save-state-sync-engine.test.ts` | `SaveStateSyncEngine` auth gating + up/down sync.                                                                                                                                                                           |
| `slot-key.test.ts`               | slot↔type mapping.                                                                                                                                                                                                          |

**Environment note**: PSflix's vitest uses `happy-dom`; PSxAnywhere uses `jsdom`. The DOM-touching tests (`input-controller.test.ts`) opt into jsdom via `// @vitest-environment jsdom` if happy-dom proves incompatible — otherwise leave default.

### 11.2 Standalone Node guard → `scripts/test/`

Copy `psxanywhere/scripts/test/{controller-constants.test.js,package.json}` → `psflix/scripts/test/`. This guard runs under plain Node ESM (`assert` only) and verifies two build invariants:

1. `CONTROLLER.*` values in `messages.js` match the `RETRO_DEVICE_SUBCLASS` IDs the core's `set_pad_type` expects (a mismatch silently makes a controller disappear).
2. Input SAB layout literals (`MAX_PORTS`, `INPUT_PORT_BYTES`, `INPUT_OFF_EDGE`, `INPUT_BIT_*`) match the `#define`s duplicated in `host.c` and the offset in `sab_runtime.js` (which `materializeSabRuntimeLibrary` does NOT substitute).

**Required path fix** in the guard — it imports the `.js` files by relative path; repoint to the vendored location:

```js
// was:  ../../src/emulator/messages.js
// now:  ../../src/vendor/psxanywhere/emulator/messages.js
// was:  ../../src/emulator/sab/layout.js
// now:  ../../src/vendor/psxanywhere/emulator/sab/layout.js
```

Wire into `package.json`: `"test:controller-guard": "node scripts/test/controller-constants.test.js"`. Add to CI alongside `test`.

### 11.3 PSflix-side tests (new)

- Adapter unit tests under `tests/console/services/psxAnywhereRepository.test.ts` (mock `pb`) and `psxAnywhereEmulatorService.test.ts` (mock `EmulatorClient` via a seam — inject a fake facade or use the existing `createMockEmulator()` helper from the vendored test helpers).
- Verify the `mapSlot` mapping and the `loadState` "no save" rejection path.
- These use PSflix's existing `src/test/MockPb.ts` pattern.

## 12. Out of scope / explicit non-goals

- Rebuilding the WASM core (`npm run build:core`). The committed `pcsx_rearmed.{js,wasm}` are stable binaries; rebuild only if the core source changes (it will not in this integration).
- Touching the emulator internals (`sab/`, `worker/`, `gl/` shaders except the §6.1 inline). The facade is the contract.
- Wiring `OptionsDialog` beyond its current stub (future: video filters, input rebind UI, BIOS selection).
- A rebind UI (`src/rebind-table.ts` equivalent). Phase 1 relies on default keyboard mapping.
- Service Worker / PWA. None installed (and `host-chd.md` warns SWs can break the chunk cache).
- Emulator-side realtime subscriptions (PocketBase SSE/WS). Not used; reads are on-demand.

## 13. Risks

| Risk                                                                                       | Likelihood                       | Mitigation                                                                              |
| ------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| PocketBase `/api/files/...` does not honor `Range:` → streaming fails.                     | Low (it should).                 | Curl check §9.4 before integration; if it fails, move CHDs to a dedicated range origin. |
| Reverse proxy strips/misses CO* headers on some responses → `crossOriginIsolated = false`. | Medium.                          | Verify with `curl -sI` on HTML, wasm, and a 404 (§9). `always` flag in nginx.           |
| `require-corp` breaks an unseen cross-origin resource.                                     | Low (PSflix bundles everything). | Fall back to `credentialless`.                                                          |
| TS strictness (`noUnusedLocals`) trips on vendored code.                                   | Medium.                          | Fix-on-copy; fall back to `tsconfig.vendor.json` project reference.                     |
| happy-dom vs jsdom mismatch in migrated DOM tests.                                         | Low-Medium.                      | Per-file `// @vitest-environment jsdom`.                                                |
| Canvas-ref fight between React and `reset()`'s `replaceWith`.                              | Medium (common integration bug). | Stable key + no identity-changing props + handle `canvas-replaced`.                     |
| `discs.iso` files are huge (max 1 GiB) → first-stream latency.                             | Expected.                        | `onProgress` drives the loading overlay; Cache API makes subsequent boots fast.         |
| Two PB SDK instances if upstream `PocketbaseRepository` is accidentally used.              | Avoided by design.               | The adapter wraps PSflix's `pb`; never import `PocketbaseRepository` into app code.     |
| BIOS file token expiry (3 min).                                                            | Low.                             | `fetchBiosUrl()` is called at `loadDisc` time and fetched immediately by the facade.    |

## 14. Verification (acceptance)

**Phase 1:**

- `npm run typecheck` green (both tsconfigs).
- `npm run lint` green.
- `npm test` green (PSflix + migrated vendored suite).
- `npm run test:controller-guard` green.
- `npm run build` green; `dist/pcsx_rearmed.{js,wasm}` present at root.
- `npm run verify:build` green.
- Dev: `npm run dev` → `self.crossOriginIsolated === true`; navigate to `/#/play/<serial>`; disc boots; playable with keyboard; save to slot1, reload, load slot1.
- Prod-shaped: deploy behind the proxy, repeat the runtime smoke against a real CHD in PocketBase.

**Phase 2:** all of the above plus:

- Save state created on device A appears on device B after sign-in.
- Memory card persists across reloads and syncs.
- Auth-gated save/load UI (`GameWindow.tsx:168-189`) unlocks on sign-in.

## 15. Cross-references

Migrated emulator reference docs (adapted from `psxanywhere/docs/`, indexed by `docs/emulator/README.md`):

- Facade API: `docs/emulator/api.md`
- Hosting/headers: `docs/emulator/host-app.md`, `host-chd.md`
- Architecture/SABs/protocol: `docs/emulator/architecture.md`, `worker.md`, `stream.md`, `render.md`
- Input / memcards / save states: `docs/emulator/input.md`, `memcard.md`, `save-state.md`
- Known audio bug: `docs/emulator/audio-startup-bug.md`
- PocketBase backend: `pocketbase-docs/` (official mirror) + `AGENTS.md` Collections table (`pb_schema.json` is the source of truth)
- PSflix conventions: `AGENTS.md` (its Collections table includes `consoles`; the emulator is now wired in).
