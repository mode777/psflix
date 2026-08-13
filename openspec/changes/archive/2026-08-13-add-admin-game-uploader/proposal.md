## Why

PSflix has no first-party way for an operator to add games and discs to the catalog from the admin surface. Today this is done out-of-band by a standalone Node CLI (`psx-uploader`) that authenticates as a superuser, extracts a PS1 disc ID from each CHD via WASM, fetches metadata and artwork, and creates `games`/`discs` records. That pipeline works, but it lives outside the product: it requires a terminal, a separate checkout, locally-stored superuser credentials, and gives no in-app visibility into what was imported. The admin SPA already ships with an isolated superuser session and is the natural home for this workflow. The WASM disc-ID extractor it depends on is browser-native, so the pipeline can be brought in-app at low risk.

## What Changes

- **Admin sidebar navigation.** The admin surface (currently a single dashboard route) gains a persistent sidebar for navigating between admin areas, starting with the existing Dashboard and a new Upload view.
- **Upload view (`/upload`).** A new admin route where the operator drops or selects `.chd` files (multi-file **and** folder selection via `webkitdirectory`, mirroring the CLI's recursive scan).
- **In-browser disc identification.** Each dropped CHD is read in a Web Worker and its PS1 disc ID extracted by the vendored WASM extractor (`extract_id.{js,wasm}`), then game metadata and cover/screenshots are fetched from the psxdatacenter API. The UI stays responsive — extraction never runs on the main thread.
- **Review-before-upload.** Identified items are grouped by game (`first_disc_serial`) and shown as a review list: games to create (with cover/screenshots rendered), their discs to upload (with size and existing/skip state), and any files that failed identification or had no metadata. The operator approves; there is no field editing in this change.
- **Streaming upload with progress.** On approval, discs are uploaded sequentially (CHDs are large) via `XMLHttpRequest` + `upload.onprogress`, hand-building the multipart body — the PocketBase JS SDK exposes no upload-progress hook. Overall and per-file progress are shown. Games and discs that already exist are skipped; the superuser `adminClient` is the sole auth source (the CLI's impersonation/token-persistence dance is dropped entirely).
- **Non-goals (explicit).** No metadata editing in the review list, no parallel uploads, no resume/retry of partial uploads, no deletion/replacement of existing games or discs, no PocketBase schema changes, no changes to the user-facing app, and no change to admin auth isolation.

## Capabilities

### New Capabilities

- `admin/game-upload`: An operator workflow in the admin surface that ingests PS1 CHD disc images — identifying each disc in-browser via the WASM extractor, fetching metadata and artwork, presenting a review list of games/discs to create, and streaming the discs to PocketBase with progress while reusing existing records.

### Modified Capabilities

- `admin`: The admin surface gains persistent multi-view navigation (a sidebar) so the operator can move between the dashboard and other admin areas. Previously a single dashboard view, it now hosts multiple areas under shared chrome.

## Impact

- **Admin source tree (`src/admin/`):** `AdminApp.tsx` is refactored from a single-route shell into a sidebar layout wrapping a `<Routes>`/`<Outlet>` (Dashboard + Upload). New `src/admin/features/upload/` holds the view, the dropzone, the review list, the import pipeline hook (extract → fetch → group → existence-check), the XHR upload-with-progress module, the psxdatacenter metadata fetcher, and the extraction Web Worker.
- **Vendored WASM assets:** `extract_id.js` and `extract_id.wasm` (from `psx-uploader/id-extractor/`) are copied into the repo. The `.wasm` is served from `public/` at the origin root (same pattern as `public/pcsx_rearmed.wasm`); the Emscripten module is loaded via an `instantiateWasm` override to avoid `import.meta.url`/`locateFile` issues.
- **Backend (PocketBase):** No schema changes. Writes target the existing `games` and `discs` collections, whose `createRule` is `null` (superuser-only); the admin `adminClient` already carries a superuser session. Reads use the existing `first_disc_serial` (games) and `serial` (discs) uniqueness for existence checks.
- **External dependency:** Reads from the public psxdatacenter API (`https://mode777.github.io/psxdatacenter-dump/api/<id>.json`) and downloads cover/screenshot image URLs — same sources the CLI uses. Image bytes are fetched through the `wsrv.nl` image proxy (psxdatacenter image hosts send no CORS headers, so the browser cannot fetch them directly) and re-uploaded as `File` objects (no hot-linking); a per-image proxy failure skips that image without affecting the record.
- **Build tooling:** No new runtime dependencies. No `vite.config.ts` change is expected beyond Tailwind `content` already covering `src/**/*`; the WASM is a static `public/` asset. `admin.html` is already a configured build entry.
- **Out-of-scope tooling:** The standalone `psx-uploader` CLI (separate repo) is not removed or modified by this change; the in-app uploader simply ports its pipeline.
