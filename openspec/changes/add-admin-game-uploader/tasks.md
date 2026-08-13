# Tasks — add-admin-game-uploader

Implements `specs/admin/game-upload/spec.md` and the navigation delta in `specs/admin/spec.md` per `design.md`. Ordered by dependency; each task is verifiable. Design decisions referenced inline (D1–D7).

## 1. Vendor the WASM disc-ID extractor (D2)

- [x] 1.1 Copy `extract_id.js` and `extract_id.wasm` from `psx-uploader/id-extractor/` into the repo (e.g. `src/admin/features/upload/extractor/`); place the `.wasm` in `public/` so Vite serves it at the origin root (same convention as `public/pcsx_rearmed.wasm`)
- [x] 1.2 Write a worker-side loader that instantiates the Emscripten module once via an `instantiateWasm` override reading the `.wasm` bytes directly (mirror the CLI's `extractor.js`), avoiding `import.meta.url`/`locateFile` resolution
- [x] 1.3 Create `extractor.worker.ts`: on `message({ file })`, run `await file.arrayBuffer()` → `_extract_id(...)`, then `postMessage({ discId } | { error })`; handle one file per message
- [x] 1.4 Unit-test the extraction against a small known CHD fixture: assert it returns the expected disc serial, and that a non-PS1 blob returns null/throws cleanly

## 2. Metadata & artwork enrichment (D7)

- [x] 2.1 Port `metadata.js`: `fetchGameMetadata(discId)` using browser `fetch` against `https://mode777.github.io/psxdatacenter-dump/api/<id>.json`, plus `normalizeMetadata` (verbatim); treat HTTP 404 as "no metadata" → throw a typed error the caller can isolate
- [x] 2.2 Port the image-download helper: `fetch(url)` → `new File([buf], filename, { type })`, inferring extension from content-type/url; tolerate per-image failure by returning null
- [x] 2.3 Unit-test `normalizeMetadata` field mapping against a sample psxdatacenter JSON (assert `firstDiscSerial` comes from `discs[0].printed_serial`, languages/features are arrays, screenshot cap ≤ 5)
- [x] 2.4 Confirm CORS behavior on the psxdatacenter + image hosts: if image fetch is CORS-blocked, ensure the game is still created without that image (graceful degradation)

## 3. Disc upload with progress (D3)

- [x] 3.1 Implement `buildMultipart(fields, isoFile)` constructing the `multipart/form-data` body (boundary, `serial`/`index`/`game` field parts, file header/footer) — port the CLI's `discs.js` boundary logic
- [x] 3.2 Implement `uploadDisc({ serial, index, gameId, isoFile, onProgress })` via `XMLHttpRequest`: `xhr.upload.onprogress` → `onProgress({ loaded, total })`; attach `Authorization: adminClient.authStore.token` and the multipart `Content-Type` header; POST to `${adminClient.baseURL}/api/collections/discs/records`; resolve with the parsed record, reject on HTTP ≥ 400 with the response message
- [x] 3.3 Unit-test the multipart body construction (boundary well-formed, field/header/footer bytes correct) with a small fixture; add an integration-style test asserting progress events fire and a record is created against a stubbed/mock endpoint
- [x] 3.4 Verify the superuser token attached via the explicit `Authorization` header is accepted (i.e. the raw XHR path authenticates the same as the SDK path)

## 4. Pipeline orchestration & existence checks (D5, D6, D7)

- [x] 4.1 Implement existence checks using `adminClient`: `findGame(firstDiscSerial)` via `getFirstListItem` on `first_disc_serial` (404 → null); `findDisc(serial)` via `getFirstListItem` on `serial` (404 → null)
- [x] 4.2 Implement `createGame(metadata)`: map fields per the CLI's `games.js` (title, region, genre, developer, publisher, release ISO date, languages, description, manufacturer_description, features, players, first_disc_serial, discs count) + cover_image/screenshots `File` objects; use `adminClient.collection('games').create(body)`
- [x] 4.3 Define the per-item status model (`pending | identifying | identified | ready | exists | failed | uploading | uploaded | error`) and the grouped review-state shape (games keyed by `first_disc_serial`, each with its discs)
- [x] 4.4 Implement the orchestration hook (`useImportPipeline`): intake → identify (worker) + enrich (fetch) + existence-check per file, in parallel; failures become individual failed items without aborting the batch; group ready items by game
- [x] 4.5 Implement approval→upload: create each game lazily (only if a disc will upload), then upload its discs **sequentially** (D4), updating per-file and overall progress; a per-disc failure marks that item `error` and continues to the next disc
- [x] 4.6 Unit-test the grouping (multi-disc → one game) and index assignment (disc `index` taken from metadata disc-list position, independent of ingest order)

## 5. Admin shell: sidebar navigation + route (D1; spec: Multi-view admin navigation)

- [x] 5.1 Refactor `src/admin/AdminApp.tsx` from a single-route shell into a layout with a persistent `<AdminSidebar>` + content `<Outlet>`; keep the existing `AdminHeader`, auth gate, and boot validation intact
- [x] 5.2 Register routes: `/` → existing `DashboardView`, `/upload` → new `UploadView`; default/unknown → dashboard (or a not-found) so reloads resolve cleanly under `HashRouter`
- [x] 5.3 Build `<AdminSidebar>`: nav entries for Dashboard and Upload, current area indicated from the route; styled with Obsidian Console tokens (charcoal surface, 40px backdrop blur per design system)
- [x] 5.4 Confirm the existing dashboard still renders unchanged after the shell refactor

## 6. Upload view UI (specs: intake, review, progress)

- [x] 6.1 Build the dropzone: drag-drop target + file picker supporting multi-file and `webkitdirectory` folder selection; filter to `.chd` and ignore non-CHD files without error
- [x] 6.2 Render the review list grouped by game: game rows with cover artwork, child disc rows with serial + size + existing/ready state, and a distinct section for failed items (no disc id / no metadata)
- [x] 6.3 Add per-item remove controls and a single "Start upload" approval action (disabled until at least one ready item remains); no metadata field editing
- [x] 6.4 Render upload progress: per-file bar for the current disc + overall measure (completed/uploading/remaining counts); surface per-disc completion and per-disc failure
- [x] 6.5 Render a done summary: games created, games reused, discs uploaded, discs skipped (already existed), failed items
- [x] 6.6 Verify the view reuses shared design tokens (charcoal tiers, 16px card radii, Inter, PlayStation-blue accents) — no foreign styling

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and `npm run lint` green
- [x] 7.2 Run `npm run build` and `npm run verify:build` green; confirm the extraction worker is emitted correctly under the multi-entry build and the admin bundle still does not pull the emulator chunk
- [x] 7.3 Run the unit test suite (`npm test`) green, including the new extractor/metadata/multipart/grouping tests
- [ ] 7.4 Manual end-to-end against the live backend: sign in to admin → open Upload → drop a small CHD → see it identified and enriched → review → approve → observe progress to completion; then drop the same CHD again and confirm the disc is detected as existing and skipped; confirm a multi-disc title groups correctly and a non-PS1/unknown CHD shows as a failed item without aborting the batch
