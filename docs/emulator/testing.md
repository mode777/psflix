# Testing the vendored emulator code

PSflix runs **Vitest** for the migrated vendored suite (it reuses Vite's
`resolve.alias`, so the `emulator-core` / `emulator-client` / `repository`
bare imports resolve in tests with zero extra config). This covers the
conventions for the migrated tests under `tests/vendor/psxanywhere/` and the
PSflix adapter tests under `tests/console/services/`.

> **Migrated + adapted** from upstream `docs/testing.md`. The psanywhere
> layout reference (`tests/client/…`) becomes `tests/vendor/psxanywhere/client/…`;
> the environment-split and facade-mocking conventions are unchanged.

## Commands

```sh
npm test                  # vitest run — one-shot, exits non-zero on failure
npm run test:controller-guard   # standalone Node guard (build invariant)
```

## Layout

```
tests/
  vendor/psxanywhere/
    client/                       migrated vendored suite (mirrors src/vendor/psxanywhere/client)
      bios.test.ts                BiosLoader cache miss→fetch→persist
      controller-store.test.ts    ControllerStore round-trip + name/hex helpers
      emulator-client.test.ts     facade end-to-end with mocked Emulator — boot/reset/destroy,
                                    canvas-replaced, loadDisc BIOS paths, save/load, memcard events
      idb.test.ts                 IDB promise utils + self-heal
      input-controller.test.ts    InputController registry/DOM/capture (jsdom env)
      input-pure.test.ts          pure input math (node env)
      input.test.ts               ControllerWriter translation
      memcard-storage-idb.test.ts IdbMemcardStorage vs fake-indexeddb
      memcard-sync.test.ts        MemcardSync auth gating + debounced upload
      save-load.test.ts           SaveLoadController round-trip
      save-state-conflict.test.ts LWW conflict policy
      save-state-header.test.ts   PSAS header codec
      save-state-storage*.test.ts Idb/InMemory SaveStateStorage
      save-state-store.test.ts    SaveStateStore local CRUD + cloud cache-on-miss
      save-state-sync-engine.test.ts  download-on-auth + dirty upload
      slot-key.test.ts            slot↔type mapping
      helpers/
        emulator-mock.ts          createMockEmulator() — recording mock of the facade subset
        repository-mock.ts        createMockRepository() — full Repository interface double
  console/
    services/
      psxAnywhereEmulatorService.test.ts   PSflix adapter
      psxAnywhereRepository.test.ts        PSflix adapter over MockPb
```

The folder mirrors `src/vendor/psxanywhere/`. Tests import their subject by a
relative path or the `@/` alias; the facade barrels are imported by their bare
alias (`emulator-core`, `emulator-client`, `repository`).

## Environment split

One environment **per file**, set in `vite.config.ts` `test` (or a per-file
`// @vitest-environment …` comment):

| Env                           | Use for                                                                            | How to opt in                                   |
| ----------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `happy-dom` (default, PSflix) | code that touches `window`, `AbortController`, `requestAnimationFrame`, `document` | nothing — it's the default                      |
| `node`                        | pure logic / classes that take their dependencies as arguments                     | `// @vitest-environment node` as the first line |
| `jsdom`                       | if happy-dom proves incompatible with a specific DOM test                          | `// @vitest-environment jsdom`                  |

`fake-indexeddb` provides the IDB backend for the storage tests (imported via
`import 'fake-indexeddb/auto'` in each IDB test). PSflix's vitest default is
`happy-dom`; the migrated DOM-touching tests opt into `node`/`jsdom` per file.

## Mocking the facade

`tests/vendor/psxanywhere/client/helpers/emulator-mock.ts` exports
`createMockEmulator()` — a recording mock of the `Emulator` subset input code
calls (`setButtons`, `orEdgeBits`, `setAnalog`, `setMouseDelta`,
`setLightgunPosition`), plus `lastButtons`/`lastEdge` getters and `clear()`.
The facade is imported as a _type_, so a structural mock satisfies it:

```ts
const emu = createMockEmulator();
const w = new ControllerWriter(emu as unknown as Emulator, port, cfg, …);
w.onKeyDown({ key: 'ArrowUp', … } as KeyboardEvent);
expect(emu.lastButtons).toBe(1 << BUTTON.UP);
```

`helpers/repository-mock.ts` exports `createMockRepository(opts)` — a full
`Repository` interface double (imports the type from
`@/vendor/psxanywhere/repository/repository`) with a `calls` recorder and
injectable impls/errors, used by `emulator-client.test.ts` and the
sync-engine tests.

For PSflix's own adapter tests, `tests/console/services/` uses PSflix's
existing `src/test/MockPb.ts` pattern (see `psxAnywhereRepository.test.ts`).

## Injectable seams (prefer these over reaching for globals)

| Seam                                                                       | What it replaces                        |
| -------------------------------------------------------------------------- | --------------------------------------- |
| `RebindStore.forMemory()` / `ControllerStore.forMemory()`                  | `localStorage` — in-memory persistence  |
| `IdbSaveStateStorage`/`IdbMemcardStorage` constructor `_open` arg          | the real DB open (`openDbWithRecovery`) |
| `InMemorySaveStateStorage` / `InMemoryMemcardStorage`                      | IDB in tests                            |
| storage-port injection on `SaveStateStore` / `MemcardSync`                 | the real IDB adapter                    |
| `EmulatorClient` `saveStateStorage`/`memcardStorage`/`biosStorage` options | the production storages                 |

### Driving the rAF loop

`InputController.start()` schedules a `requestAnimationFrame` poll loop. For
deterministic DOM tests, stub it so the loop never auto-runs:

```ts
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => undefined);
```

When a test actually needs a frame to tick, use fake timers:

```ts
vi.useFakeTimers();
ctrl.startCapture(0, BUTTON.A, null);
vi.advanceTimersByTime(32); // one rAF tick → pollCaptureGamepad
vi.useRealTimers();
```

> **Capture rising-edge gotcha:** `startCapture` snapshots the _current_
> gamepad state via `primeCaptureGamepadState()`. A button already held at
> capture start is therefore **not** a rising edge — the fake gamepad must be
> released at prime time and pressed afterwards.

## Conventions

- **One file per subject**; mirror the source path under
  `tests/vendor/psxanywhere/` (and `tests/console/` for PSflix adapters).
- **Helpers go in `helpers/`**, never loose in the test root. Anything under
  `tests/**/helpers/**` is excluded from collection.
- **No silent catches in tests** — assert error paths, don't swallow.
- **Don't import `src/vendor/psxanywhere/` internals from non-test code.** The
  tests → vendored-tree dependency is one-way test-only.

## Standalone Node guard (build invariant)

`scripts/test/controller-constants.test.js` is **not** collected by Vitest —
it imports the `.js` files directly and runs under plain Node. It verifies:

- `CONTROLLER.*` matches the `RETRO_DEVICE_SUBCLASS` IDs the core's
  `set_pad_type` switch expects (a mismatch silently makes a controller
  "disappear").
- `MAX_PORTS`, `INPUT_PORT_BYTES`, `INPUT_OFF_*`, `INPUT_BIT_*` match the
  literals in `src/vendor/psxanywhere/emulator/worker/host.c` and
  `sab_runtime.js`. See [`architecture.md`](./architecture.md#input-sab) and
  [`input.md`](./input.md#edge-latch-input-during-streaming-stalls).

Run: `npm run test:controller-guard`.

## Cross-references

- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §11 — the full test-migration list.
- [`../../specs/emulator-integration/phase-1.md`](../../specs/emulator-integration/phase-1.md) — the migration checklist.
- [`../../AGENTS.md`](../../AGENTS.md) — PSflix testing conventions for
  the rest of the app.
