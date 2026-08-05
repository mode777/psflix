# Migrated emulator docs (psanywhere → PSflix)

These documents were **migrated from the PSxAnywhere source project's
`docs/`** during the emulator-integration work (see
[`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md)).
They describe the **vendored** emulator tree at `src/vendor/psxanywhere/` and
are the reference material for anyone touching the console feature.

## Why these were adapted (read this first)

PSflix vendors a **newer revision** of PSxAnywhere than the docs in some
upstream checkouts describe. Concretely:

- The **emulator-core layer** (`emulator/Emulator.ts`, `worker/`, `sab/`,
  `gl/`, `streaming_core_file.c`) matches the upstream docs well.
- The **client layer** was refactored upstream into a single facade with
  storage ports. The vendored file layout is:

  | Upstream (older)                            | Vendored here (newer)                                                        |
  | ------------------------------------------- | ---------------------------------------------------------------------------- |
  | `src/app.ts` (orchestrator)                 | `client/EmulatorClient.ts` (single facade)                                   |
  | `src/emulator/MemcardStore.ts`              | `client/memcardStorage.ts` (IdbMemcardStorage)                               |
  | `src/client/stateDb.ts` (PSAS header)       | `client/saveStateHeader.ts`                                                  |
  | `src/client/StateStore.ts`                  | `client/SaveStateStore.ts` + `client/saveStateStorage.ts`                    |
  | `src/client/save-load.ts` (helpers)         | `client/save-load.ts` (`SaveLoadController`)                                 |
  | `src/emulator/canvas.ts` (whole-file paint) | **removed** — streaming only, no whole-file path                             |
  | `src/repository/repository.ts`              | `repository/repository.ts` (`Repository` interface + `PocketbaseRepository`) |

- **Path prefixes:** every doc reference to `src/emulator/…`, `src/client/…`,
  `src/repository/…` maps to `src/vendor/psxanywhere/emulator/…`,
  `src/vendor/psxanywhere/client/…`, `src/vendor/psxanywhere/repository/…`.
- **PSflix-specific surface** sits outside the vendored tree:
  `src/features/console/services/{psxAnywhereRepository,psxAnywhereEmulatorService}.ts`,
  `src/features/console/hooks/`, and `src/features/console/components/`.

## Doc map

| File                                             | What it covers                                                                                                | Still accurate?                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`architecture.md`](./architecture.md)           | Thread model, the five SharedArrayBuffers, `MSG.*` protocol, file map, boot sequence, persistent storage keys | Yes (core layer; whole-file path removed)                       |
| [`api.md`](./api.md)                             | `Emulator` facade API (constants, lifecycle, input, audio, CRT, memcards, save/load state, events)            | Yes; `EmulatorClient` adds the higher-level surface PSflix uses |
| [`worker.md`](./worker.md)                       | `coreWorker.ts`, `host.c`, `sab_runtime.js`, `streaming_core_file.c`, the `handlechd` patch                   | Yes (core layer)                                                |
| [`stream.md`](./stream.md)                       | Streaming CHD cache: `ChunkStore`, inlined Speculator, `RemoteChd`, the control-SAB mailbox                   | Yes (core layer)                                                |
| [`render.md`](./render.md)                       | `blit.ts`, `crt-shader.ts`, shaders                                                                           | Mostly — see [shader note](#shader-inlining)                    |
| [`input.md`](./input.md)                         | Input API, default key/gamepad maps, controller types, edge latch                                             | Mostly — see [input note](#input-note)                          |
| [`memcard.md`](./memcard.md)                     | Memory-card persistence (MEMFS, flush, cloud sync)                                                            | Adapted to `memcardStorage.ts` + `MemcardSync.ts`               |
| [`save-state.md`](./save-state.md)               | Save / load state round-trip, concurrency, PSAS header                                                        | Adapted to `SaveStateStore` + `saveStateHeader.ts`              |
| [`host-app.md`](./host-app.md)                   | COOP/COEP/CORP, nginx config, verifying a deploy                                                              | Adapted to PSflix's deployment                                  |
| [`host-chd.md`](./host-chd.md)                   | CHD range-hosting, Cache API quota, Service Worker caveats                                                    | Mostly — PSflix CHDs are same-origin (see note)                 |
| [`audio-startup-bug.md`](./audio-startup-bug.md) | Chromium-only silent-audio bug + mitigations                                                                  | See file (dither fix caveat)                                    |
| [`testing.md`](./testing.md)                     | Vitest layout, env split, facade mocking for the migrated vendored tests                                      | Adapted to `tests/vendor/psxanywhere/`                          |

### Not migrated (and why)

| Upstream doc    | Why skipped                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build.md`      | Describes compiling the WASM core (`build:core`, emsdk, emcc flags). PSflix does **not** rebuild the core — `public/pcsx_rearmed.{js,wasm}` are committed artifacts (see [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6/§12). |
| `emsdk.md`      | Same as `build.md` — toolchain for building the core.                                                                                                                                                                                                                    |
| `dev-server.md` | PSflix uses its own Vite config (`vite.config.ts`); the CO* dev headers are already documented in [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §8.4 and `AGENTS.md`.                                                           |
| `typescript.md` | Coding-style guide for authoring new psanywhere source. PSflix already has its own conventions (`AGENTS.md`, `.prettierrc`, eslint).                                                                                                                                     |
| `ui.md`         | Top-level UI helper modules (`toast.ts`, `status.ts`, …) — not part of the vendored tree; PSflix has its own React UI.                                                                                                                                                   |
| `pocketbase.md` | PSflix already carries PocketBase reference docs in `pocketbase-docs/` plus the `AGENTS.md` Collections table and `pb_schema.json`.                                                                                                                                      |

## Load-bearing invariants (unchanged by the migration)

- `crossOriginIsolated === true` is required or the constructor throws
  (COOP/COEP/CORP on every response — `host-app.md`).
- Streaming is CHD + HTTP `206` only; there is **no** whole-file
  `?load=whole` path in the vendored tree.
- The emu thread is single-threaded; `Atomics.wait()` is the only blocking
  primitive (on `controlSAB`).
- The worker never touches IndexedDB. Save states and memcards cross the
  worker boundary as bytes via messages; persistence is the client's job.
- The `emulator-core`, `emulator-client`, and `repository` bare-name imports
  resolve through `tsconfig.json` paths + `vite.config.ts`/`vitest.config.ts`
  aliases.

## Shader inlining

Upstream `blit.ts` fetched `fullscreen.vert` / `unpack.frag` at runtime from
`/src/emulator/worker/gl/shaders/`. PSflix is a bundled SPA, so the vendored
`blit.ts` inlines them via Vite `?raw` imports instead (see
[`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.1).
[`render.md`](./render.md) documents the post-inline state.

## Input note

The input maps/controller types described in [`input.md`](./input.md) come
from the vendored `client/input-constants.ts`; button names use the RetroPad
bit positions re-exported as `Emulator.BUTTON`. Rebinding
UI specifics are psanywhere dev-panel behavior — PSflix's `PortManager` is its
own React UI, but the underlying `input.ts`/`RebindStore` API is identical
and vendored.

## See also

- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) — integration decisions, vendoring boundary, config.
- [`../../specs/emulator-integration/phase-1.md`](../../specs/emulator-integration/phase-1.md), [`../../specs/emulator-integration/phase-2.md`](../../specs/emulator-integration/phase-2.md) — implementation phases.
- `src/vendor/psxanywhere/` — the vendored code these docs describe (treat as
  a black box; update by re-copy, per `AGENTS.md`).
