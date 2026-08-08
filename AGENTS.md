# PSflix — Agent Notes

Netflix-style catalog for PS1 (PlayStation 1) games. React frontend, PocketBase backend. The build is complete (all 10 stages in `archive/specs/` are done); this file documents the conventions an agent should follow when extending or maintaining the app.

## Repo layout

```
psflix_design/      Design drafts — HTML mocks + design tokens (do not regenerate)
  app_header/       Persistent header mock
  browse_view/      Master / grid view mock
  details_view/     Single-game detail view mock
  design/DESIGN.md  Obsidian Console design system (colors, type, spacing, components)
pocketbase-docs/    Local PocketBase reference docs (mirror of pocketbase.io docs)
docs/               Migrated PSxAnywhere emulator reference docs (see docs/emulator/README.md)
pb_schema.json      PocketBase collection schema export — source of truth for backend shape
src/                React app (routes, components, features, hooks, lib, types)
scripts/            Build-time helpers (verify-build.mjs boots the dist/ artifact and curls it)
archive/            Historical material that is no longer active
  specs/            Stages 0–9 of the original build plan — all done
```

## Design system — read before styling

The app must follow `psflix_design/design/DESIGN.md` (Obsidian Console). Highlights:

- Background obsidian `#121414`, never pure black; surface tiers use charcoal containers.
- Primary `#0072FF` (PlayStation blue), secondary `#00F2FF` (teal); gradients run 45° blue→teal for CTAs.
- Font: Inter only. Material Symbols Outlined for icons (thin 1.5px stroke).
- Glassmorphism + minimalism: 20px backdrop blur on surfaces, 40px on the sidebar.
- Radii: 8px buttons/inputs, 16px cards, 24px heroes/modals. No sharp corners.
- Spacing base 8px; desktop min margin 64px, mobile 20px; container max 1440px.
- Layout: 12-col desktop (24px gutter), 4-col mobile. Drop to `headline-xl-mobile` under 768px.

The mocks in `psflix_design/<view>/code.html` already encode the Tailwind config (colors, radii, spacing, font families) — mirror those tokens when setting up Tailwind, do not redefine the palette.

## Backend — PocketBase

- Instance URL: `https://psx.alexklingenbeck.de`
- Schema: `pb_schema.json` (root of repo) is the source of truth. Re-read it before adding or renaming fields; do not invent fields.
- Docs: `pocketbase-docs/` covers collections, auth, files, relations, realtime, Go/JS hooks, etc. Use the records API doc (`10-api-records.md`) for querying, filtering, expanding, and pagination.

### Collections (from `pb_schema.json`)

| Collection     | Purpose                             | Access                                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------- |
| `users`        | Auth collection (`_pb_users_auth_`) | Self-only (`listRule`/`viewRule` scoped to `@request.auth.id`)      |
| `games`        | A game title                        | Public list/view                                                    |
| `discs`        | One physical disc of a game         | Public; cascade-deletes with `game`                                 |
| `documents`    | Manuals / guides (PDF etc.)         | Public; optional relation to `game`                                 |
| `consoles`     | BIOS host (one record: `SCPH1001`)  | Public read; no public write                                        |
| `memory_cards` | Per-user memory card image          | Owner only (`@request.auth.id = user.id`)                           |
| `save_state`   | Per-user save state file            | Owner only; unique on `(type, disc, user)`                          |
| `favorites`    | User ↔ game favorite link           | Owner only (`@request.auth.id = user.id`); unique on `(user, game)` |
| `game_discs`   | View: flattened disc for streaming  | Public list/view; read-only view of `games` ⋈ `discs`               |

### Field gotchas an agent will miss

- `games.first_disc_serial` is **required** and has a unique index — it is the natural key for a title, not `id`.
- `discs.serial` is uniquely indexed; `(game, index)` is also uniquely indexed. Multi-disc games use `index` (1..N) plus per-disc `serial`.
- `games.region` select values: `NTSC-U`, `NTSC-J`, `PAL` (no "region-free").
- `documents.type` select values: `manual`, `guide`.
- `save_state.type` select values: `auto`, `slot1`, `slot2`, `slot3` — mirrors PS1 memory card slot convention; `auto` is the autosave slot.
- `games.languages` and `games.features` are **JSON** fields, not relations — parse client-side, do not try to expand them.
- `games.screenshots` is `maxSelect: 10`; `discs.iso` and `documents.file` are single files. All file fields come back as filenames and must be resolved via the PocketBase files URL pattern: `/api/files/<collectionId>/<recordId>/<filename>`.
- `save_state.data` is a required file payload; `memory_cards.data` is **optional** (`required: false`). Both back the emulator's cloud sync (Phase 2). Phase 1 persists save states + memory cards to **local IndexedDB** only via the vendored PSxAnywhere facade; the `save_state` / `memory_cards` collections are not written until Phase 2 lands. See `specs/emulator-integration/`.
- `memory_cards.mounted` is a select (`slot1`, `slot2`) marking which slot a card is inserted into.
- `consoles.bios` is a single file, **optional** (`required: false`), `maxSize` 5 MB — the PS1 BIOS (`SCPH1001.BIN`). Public read matters: the CHD streaming bridge fetches it with no auth header. One record is uploaded.
- `games.manufacturer_description` is an optional free-text field (the publisher/manufacturer blurb), separate from `games.description` (max 50000 chars).
- `favorites` is a base collection linking `user` ↔ `game` (both required, cascade-delete) with a unique index on `(user, game)` — a user can favorite a game once. All API rules are scoped to the owner (`@request.auth.id = user.id`), so the client can list/create/delete a user's own favorites directly.
- `game_discs` is a **view** collection: `viewQuery` joins `games` ⋈ `discs` and exposes `id` = disc `serial`, `title` = `"<game title> (Disc <index+1>)"` (computed string, typed `json`), `file` = `discs.iso`. Public list/view; handy for streaming/CHD disc lookup by serial.

### Auth & realtime

- The auth collection has email/password, OAuth2, and email alerts enabled; MFA/OTP are disabled.
- Auth token duration is 5 days (`432000`s); password-reset and email-change tokens are 30 min; file token is 3 min. Build token refresh around these.
- PocketBase realtime is available for live updates if a future view needs it (see `pocketbase-docs/11-api-realtime.md`).

## Conventions (active, not just for scaffolding)

- Treat `psflix_design/` as read-only reference. Do not edit the mocks; port their Tailwind tokens into the project.
- Keep the header (`app_header`) always mounted — it is global, not per-route.
- Routing needs at minimum: master browse view, single-game details view. Use the URL shape implied by the mocks (e.g. `/` for browse, `/game/:id` or `/game/:first_disc_serial` for details).
- Always expand `discs` (and `screenshots` / `cover_image`) on `games` reads so the UI has what it needs in one request. `games.languages` / `features` come back as raw JSON — type them in the client.
- For file URLs, build them with the PocketBase client helper, not by string concatenation against the base URL.
- The build emits a static SPA via `npm run build`; verify it with `npm run verify:build`. New code must keep these green.

## Emulator integration (cloud sync live)

The console (`/play/:firstDiscSerial`) runs a real PS1 emulator. Spec + phased plan live in `specs/emulator-integration/` (`spec.md`, `phase-1.md`, `phase-2.md`) — Phases 1 (local IDB) and 2 (PocketBase cloud sync) are both complete. Read them before touching the console feature.

**Migrated emulator reference docs:** the PSxAnywhere **architecture and API docs were migrated** into `docs/emulator/` (indexed by its `README.md`) and adapted to the vendored tree at `src/vendor/psxanywhere/` — note it vendors a **newer revision** than some upstream checkouts (the client layer is the single `EmulatorClient` facade + storage ports; there is no `app.ts`/`StateStore`/`stateDb`/`MemcardStore`/`canvas.ts`). Docs cover: thread model + SABs + `MSG.*` protocol (`architecture.md`), the `Emulator`/`EmulatorClient` API (`api.md`), the worker/C side (`worker.md`), the streaming cache (`stream.md`), rendering/CRT (`render.md`), input (`input.md`), memory cards (`memcard.md`), save states (`save-state.md`), hosting/COOP-COEP/CHD (`host-app.md`, `host-chd.md`), a known Chromium audio bug (`audio-startup-bug.md`), and test conventions (`testing.md`). Skip `build.md`/`emsdk.md`/`typescript.md`/`ui.md` from upstream — not applicable (PSflix doesn't rebuild the core; its own React UI + TS/lint conventions supersede them).

- **Vendored facade**: `src/vendor/psxanywhere/{emulator,client,repository}` is a clean-cut copy of PSxAnywhere (treated as a black box — do not import back into PSflix). Three path aliases (`emulator-core`, `emulator-client`, `repository`) resolve it; the only external runtime dep is `pocketbase` (already present). ESLint ignores this tree; `tsconfig.audio-worklet.json` type-checks the worklet `.js` files separately. The static core `public/pcsx_rearmed.{js,wasm}` is served at the origin root.
- **Adapters** (PSflix code in `src/features/console/services/`): `PsxAnywhereEmulatorService` wraps `EmulatorClient` and backs the `emulatorService` singleton; `PsxAnywhereRepository` implements PSxAnywhere's `Repository` over PSflix's `pb` singleton (one auth source). The vendored sync engines (`SaveStateStore`, `SaveStateSyncEngine`, `MemcardSync`) drive cloud sync against the repository — sign-in triggers a download pass, dirty memcard exports + local saves are uploaded (debounced), and conflicts resolve last-write-wins. The repository also exposes two adapter-only helpers (`deleteSaveStateBySlot`, `fetchMemcardsForUser`) that are intentionally NOT on the upstream `Repository` interface.
- **Cloud sync UX**: `state-saved` → `syncStatus:'syncing'` + invalidate `['save-states']`; `state-sync-complete` → `syncStatus:'synced'` + invalidate both `['save-states']` and `['memory-cards']`. A `SyncChip` in the `GameWindow` header surfaces this (idle/syncing/synced/error). The shared react-query client lives in `src/lib/queryClient.ts` so the non-React service can invalidate. Memory-card slot assignment persists to `localStorage` (`psflix:memcard-slots:<userId>`); memcard block counts are lazy (cloud cards show `0/15`).
- **Canvas**: `GameWindow` mounts a stable `<canvas>`; `useEmulator` runs the boot order (attach → resume → loadDisc) as one sequenced async chain. The facade swaps the canvas on `reset()`; the ref is re-bound via `emulatorService.getCanvas()`.
- **Cross-origin isolation** (non-negotiable): `SharedArrayBuffer` requires `COOP: same-origin`, `COEP: require-corp`, `CORP: same-origin` on every response. Vite sends them in dev (`vite.config.ts`); prod needs a reverse proxy in front of PocketBase (deployed via Flux, out of repo). Verify `self.crossOriginIsolated === true` in the browser.
- **BIOS**: the facade fetches `SCPH1001.BIN` from the `consoles` collection at `loadDisc` time (public read, no auth header).
- `save_state` and `memory_cards` are owner-only and now read/written by the repository; auth is required for cloud ops (the facade gates on `isAuthenticated()`). The facade has no local-IDB delete API, so `deleteState` removes the cloud record and hides the slot for the session (the local copy lingers until overwritten).

## Deployment

- Build artifacts (`dist/`) are produced by this repo's CI, but the deploy itself is handled by an external **Flux Kubernetes cluster** — out of scope for this project.
- The SPA is served from PocketBase's `pb_public` on `psx.alexklingenbeck.de` (same origin), so **no CORS configuration is needed** for v1. Revisit only if the SPA is ever embedded cross-origin.
- The SPA uses `HashRouter` so all routes resolve to `index.html` without server-side rewrites — PocketBase's static handler does not do SPA fallback.
- The original build plan now lives in `archive/specs/` for historical reference. The repo no longer has an active stage-by-stage plan; new work happens directly against the source tree.
