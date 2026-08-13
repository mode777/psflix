## Context

See `proposal.md - Why` for motivation (the in-app upload replaces an out-of-band CLI). See `specs/admin/game-upload/spec.md` for the behavior contract this design implements.

Current-state constraints that shape the approach:

- The admin surface already exists as a **separate Vite entry** (`admin.html` → `src/admin/main.tsx`) with its own `HashRouter`, an isolated superuser session, a dedicated `adminClient` PocketBase instance (custom `LocalAuthStore` under key `pocketbase_admin_auth`), and its own `adminQueryClient`. Today it renders a single dashboard route. Auth isolation, visual tokens, and the provider tree are settled (see the archived `add-admin-dashboard` design, Decisions 2/5/6).
- `games` and `discs` have `createRule: null` — **superuser-only writes**. The admin `adminClient` already authenticates against `_superusers`, whose token bypasses all API rules. This is the only client the uploader needs.
- The pipeline already exists as a Node CLI (`psx-uploader`). Its modules map cleanly onto browser primitives — except two: the WASM disc-ID extractor, and streaming upload progress.
- The WASM disc-ID extractor (`extract_id.{js,wasm}` + `glue.js`) is **browser-native**: `id-extractor/index.html` is a working reference and `glue.js` exposes `extractId(arrayBuffer)`. The CLI's `extractor.js` is the _Node adaptation_ of that (it re-reads the file via `fs` and feeds the whole buffer to `_extract_id`).
- The PocketBase JS SDK's `collection().create()` exposes **no upload-progress hook**, and the browser `fetch()` API exposes upload progress only for the response, not the request body. The CLI got progress from Node's raw `https.request` + `socket.bytesWritten`.
- `discs.iso` `maxSize` is 1 GiB; real CHDs are hundreds of MB to >1 GiB.
- File fields are uploaded as `File`/`Blob`; the SDK accepts these directly. Cross-origin image URLs (cover/screenshots from psxdatacenter) must be fetched and re-uploaded as `File` objects.

## Goals / Non-Goals

**Goals:**

- Bring the CLI's ingest pipeline in-app, reusing the admin superuser session, with no new auth surface.
- Keep the UI responsive while extracting IDs from very large CHDs.
- Show real per-file and overall upload progress for multi-hundred-MB files.
- Preserve the CLI's idempotency (existing game/disc detection) and multi-disc index correctness.
- Fit the existing admin app's isolation model without coupling to the user app or the emulator bundle.

**Non-Goals (design-level, beyond the proposal's scope):**

- No metadata editing, no parallel uploads, no resume/retry of partial uploads, no deletion or replacement of existing records.
- No change to admin auth, the user app, the emulator, or the PocketBase schema.
- No extraction of a shared component library between user app and admin.

## Decisions

### Decision 1 — Upload is a new admin route plus a sidebar layout, not a new entrypoint

The uploader lives at admin route `/upload` inside the existing `admin.html` bundle. `AdminApp.tsx` is refactored from a single-route shell into a persistent sidebar (`<AdminSidebar>`) wrapping a `<Routes>`/`<Outlet>` that hosts the existing Dashboard (`/`) and the new Upload (`/upload`). The `AdminHeader` stays. This reuses every settled admin decision (auth isolation, providers, visual tokens) and is the minimal structural change that satisfies the new multi-view navigation requirement.

Alternatives considered:

- **A third Vite entry (`upload.html`).** Rejected: the uploader is tightly coupled to the admin session/client and design tokens; a separate bundle would duplicate the provider tree and the `adminClient` for no isolation benefit (the auth realm is identical to admin's).
- **A PocketBase admin hook / server-side import.** Rejected: out of scope; PSflix does not run custom PB server code in this repo.

### Decision 2 — Disc identification runs the vendored WASM in a Web Worker

`extract_id.js` and `extract_id.wasm` (from `psx-uploader/id-extractor/`) are copied into the repo. Extraction runs in a dedicated Web Worker:

```
   main thread                 extractor worker
   ┌────────────┐   File       ┌────────────────────────────┐
   │ drop CHD   │─────────────▶│ await file.arrayBuffer()   │
   │ UI alive   │              │ mod._extract_id(...)       │
   │            │◀──discId─────│  (WASM, synchronous, OK    │
   └────────────┘   /error     │   because it's not on UI)  │
                               └────────────────────────────┘
```

Rationale: `_extract_id` reads the **entire** CHD into WASM heap memory and runs synchronously. On the main thread, a 500 MiB+ CHD freezes the tab for seconds. The WASM is pure computation (no DOM, no fetch), so it is worker-safe. The worker loads the module once and handles one file per message; the Emscripten module is instantiated with an `instantiateWasm` override that reads the `.wasm` bytes directly (the CLI's `extractor.js` already demonstrates this), avoiding `import.meta.url`/`locateFile` path resolution entirely. This keeps the main thread free and satisfies the responsiveness requirement.

The `.wasm` is placed in `public/` so Vite serves it at the origin root (same convention as `public/pcsx_rearmed.wasm`); the worker fetches it as a static asset.

Alternatives considered:

- **Extraction on the main thread.** Rejected: violates the responsiveness requirement for large files.
- **Streaming/partial read of the CHD to avoid loading the whole file.** Rejected: the extractor's contract is whole-buffer input; changing that means modifying the Emscripten build, which is out of scope.

### Decision 3 — Disc upload uses `XMLHttpRequest` with `upload.onprogress`, not the SDK or `fetch`

Because neither the PocketBase SDK nor `fetch()` expose request-body upload progress, the disc uploader hand-builds the `multipart/form-data` body (the CLI's `discs.js` already constructs the boundary, field parts, and file header/footer) and sends it via `XMLHttpRequest`, reading `xhr.upload.onprogress` (whose `event.loaded`/`event.total` give true upload progress):

```
   buildMultipart(fields + iso File/Blob)
        │
        ▼
   new XMLHttpRequest()
     xhr.upload.onprogress ──▶ update per-file % + overall %
     xhr.open('POST', `${baseURL}/api/collections/discs/records`)
     xhr.setRequestHeader('Authorization', adminClient.authStore.token)
     xhr.setRequestHeader('Content-Type', multipart/form-data; boundary=…)
     xhr.send(body)
```

The admin superuser token is attached explicitly via the `Authorization` header (a raw XHR does not inherit the SDK's auth). Game creation (which carries cover/screenshots `File` objects but is small) uses the SDK's `create()` directly — no progress needed there. This is the one genuinely new module versus the CLI; everything else in the pipeline is a port.

Alternatives considered:

- **SDK `create()` with a fake/indeterminate progress.** Rejected: CHDs are large enough that an indeterminate spinner is a poor operator experience, and the spec requires per-file progress.
- **`fetch()` + a `ReadableStream` request body with a counting `TransformStream`.** Rejected: progress from a stream-counting wrapper is unreliable across browsers (the stream may be buffered by the network stack before `loaded` advances); XHR `upload.onprogress` is the well-supported primitive for true send progress.

### Decision 4 — Discs upload sequentially, one at a time

Uploads proceed one disc at a time. Rationale: CHDs are hundreds of MB to >1 GiB; parallel multi-GiB uploads saturate the operator's uplink, inflate browser memory (each body is held), and risk PocketBase request timeouts. Sequential upload gives a predictable, interpretable progress bar and matches the CLI's behavior. Per-file and overall progress are both surfaced; on a per-file failure the batch continues with the next disc (satisfies the "failed disc does not abort the batch" requirement).

Game records are created lazily — just before their first disc uploads — so a game is only created if at least one of its discs is actually going to be uploaded (skipping a game whose every disc already exists).

Alternatives considered:

- **Bounded parallel uploads (e.g. 2–3 at once).** Rejected for MVP: marginal throughput gain on typical home/office uplinks, real timeout and memory risk. Revisit only if sequential throughput is measured as a problem.

### Decision 5 — The pipeline is a client-side state machine driven by one orchestration hook

The UI moves through stages on a single piece of state, mirroring the flow the CLI performed imperatively:

```
                         ┌──────────────────────────────────────┐
   INTAKE ──────────────▶│ IDENTIFY (worker) + ENRICH (fetch)   │
   (drop/select files)   │ per file, in parallel                │
                         │   → checkExisting (game? disc?)      │
                         └──────────────┬───────────────────────┘
                                        │ group discs by first_disc_serial
                         ┌──────────────▼───────────────────────┐
                         │ REVIEW  (grouped list, approve/remove)│
                         └──────────────┬───────────────────────┘
                                        │ operator approves
                         ┌──────────────▼───────────────────────┐
                         │ UPLOAD  (sequential, per-file +      │
                         │          overall progress)           │
                         └──────────────┬───────────────────────┘
                                        │
                                     DONE (summary: created/reused/skipped/failed)
```

- Identification failures (no disc ID) and enrichment failures (metadata 404) become individual failed items rather than aborting the batch — a deliberate divergence from the CLI, which threw on error.
- Each item carries its own status (`pending | identified | ready | exists | failed | uploading | uploaded | error`), so the review list and progress view render directly from state.
- Existence checks use `getFirstListItem` on `first_disc_serial` (games) and `serial` (discs), matching the CLI and the schema's unique indexes.

### Decision 6 — Reuse the admin superuser session; drop the CLI's auth entirely

The uploader uses the existing `adminClient` for every read and write. The CLI's `auth.js` — superuser password prompting, impersonation-token generation, file-persisted credentials, expiry checks — is **not ported**. The admin session is already boot-validated on entry to the admin surface (the dashboard's existing probe), so the uploader can assume a valid superuser token. This removes an entire credential-handling surface and the security footprint of persisted superuser tokens on disk.

### Decision 7 — Metadata and image enrichment port almost verbatim from the CLI

`metadata.js` (psxdatacenter `fetch` + `normalizeMetadata`) and `games.js` (field mapping + cover/screenshots download) map directly onto browser `fetch()` + `new File([buf], name, { type })`. The normalize and field-mapping logic is already correct against `pb_schema.json` (region select values, JSON `languages`/`features`, `first_disc_serial` from `discs[0].printed_serial`, screenshot count cap of 5, `release` ISO date). These become small, pure, testable modules. The disc `index` is taken from the metadata disc list position (Decision D in the proposal), preserving multi-disc correctness.

**Revision (manual e2e finding):** psxdatacenter serves images **without CORS headers**, so a browser cannot `fetch()` the raw image bytes (the Node CLI never hit this). Image downloads therefore route through the `wsrv.nl` image proxy — `https://wsrv.nl/?url=<encoded psxdatacenter url>&output=jpg` — which fetches server-side and returns the bytes with `Access-Control-Allow-Origin: *`. `output=jpg` normalizes every image to JPEG (smaller, uniform). The proxy is an additional external dependency; a proxy failure degrades per-image (the record is created without that image), preserving the existing graceful-degradation contract. A self-hosted PocketBase `pb_hooks` proxy route would remove the third party but requires server code, which is out of scope for this change (see Decision 1); revisit if the proxy proves unreliable.

## Risks / Trade-offs

- **[Very large CHDs may exhaust worker/WASM heap on low-memory machines]** → The whole-file buffer is inherent to the extractor. Mitigation: process files one at a time in the worker (not many in parallel), and surface an out-of-memory failure as a per-item error rather than a tab crash. Revisit partial/streaming extraction only if real-world failures are reported.
- **[Hand-built multipart body must exactly match PocketBase's parser]** → The boundary/field/header construction is ported from the CLI's working `discs.js`. Mitigation: port the construction verbatim and add a test that posts a small fixture disc through the real XHR path (or a mocked server) asserting both progress events fire and the record is created.
- **[psxdatacenter is a third-party static host; outages/latency affect enrichment]** → Same dependency as the CLI. Mitigation: per-item failure handling already isolates a 404/timeout to one item; the operator sees which items failed and can retry just those.
- **[psxdatacenter image hosts send no CORS headers; direct browser `fetch` of the image bytes is blocked]** → Confirmed in manual e2e. Mitigation: every image download is routed through the `wsrv.nl` CORS-enabled image proxy (Decision 7). If the proxy fails, the image download degrades gracefully (the game is created without that image), exactly as the CLI already tolerates per-image failure. No correctness impact on the record.
- **[wsrv.nl is a third-party image proxy; outages/latency affect artwork]** → Same class of dependency as psxdatacenter itself. Mitigation: per-image null fallback (above); covers/screenshots are the only thing lost, never the game/disc records.
- **[XHR upload has no native resume; a dropped connection mid-GiB disc loses the whole upload]** → Accepted for MVP (non-goal: resume/retry). The per-disc failure is surfaced and the operator can re-run the intake for that disc (existence check will skip already-uploaded discs).
- **[Identifying a disc the operator has not yet ingested disc 1 of]** → Not a problem: `first_disc_serial` comes from the metadata of _any_ disc of the title (the metadata returns the full disc list), so a game is created with the correct first-disc serial even when disc 2 is ingested first.

## Migration Plan

This change is **additive** — no data migration and no backend change:

1. Copy `extract_id.js` and `extract_id.wasm` into the repo; place the `.wasm` in `public/`.
2. Add `src/admin/features/upload/` (view, dropzone, review list, orchestration hook, XHR uploader, metadata fetcher, extraction worker, worker-side WASM loader).
3. Refactor `src/admin/AdminApp.tsx` into a sidebar layout + `<Outlet>` and register the `/upload` route alongside the existing `/` dashboard route.
4. No `vite.config.ts` change is expected: `admin.html` is already a build entry, the `.wasm` is a static `public/` asset, and Tailwind `content` already covers `src/**/*`. (Confirm the worker is emitted correctly under the multi-entry build during implementation.)
5. `npm run build` continues to emit `dist/index.html` and `dist/admin.html`; both deploy to `pb_public`.

**Rollback:** remove the `/upload` route and sidebar, revert the `AdminApp.tsx` shell to its single-route form, and delete `src/admin/features/upload/` and the copied WASM assets. No database changes to reverse; no records are mutated by the presence of the feature.

## Open Questions

- Exact sidebar placement and collapsed/expanded behavior on narrow viewports is a visual-design detail to confirm during implementation against the Obsidian Console mocks; it does not affect the spec or the task breakdown.
