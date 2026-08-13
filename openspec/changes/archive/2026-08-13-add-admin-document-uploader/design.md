## Context

The admin app (`src/admin/`) is a distinct operator surface with its own entry, router, and `adminClient` PocketBase singleton (superuser session, isolated localStorage key). It already contains one upload workflow — the CHD game uploader at `src/admin/features/upload/` — which establishes the conventions this design follows: a feature folder under `src/admin/features/`, a view wired via `<Route>` in `AdminApp.tsx` and an entry in `NAV_ENTRIES` (`AdminSidebar.tsx`), and a raw-XHR uploader (`uploadDisc.ts`) built on a generic multipart helper (`multipart.ts`) for real upload progress.

The `documents` collection already supports everything we need (schema, typed `DocumentsResponse` / `DocumentsTypeOptions`, public read, superuser-only writes), and the end-user DetailsView already renders uploaded documents. So this change is purely an admin-side workflow. See `proposal.md` for motivation and `specs/admin/document-upload/spec.md` for the behavioral contract.

## Goals / Non-Goals

**Goals:**

- Land a documents upload area that mirrors the game uploader's architecture and conventions so it is familiar to maintain.
- Make game selection scale to a large catalog without rendering every game up front.
- Reuse the proven multipart/XHR progress path rather than reinventing it.
- Support refreshing an outdated manual/guide by optionally replacing the existing same-type document for a game, without leaving the upload workflow.

**Non-Goals:**

- Standalone document CRUD (a dedicated list/edit/delete area) — deferred to a later change. Opt-in replacement of same-type documents during upload is in scope (Decision 8); append remains the default.
- Generalizing `uploadDisc.ts` / `Dropzone.tsx` into shared abstractions now. Duplication is small; extraction is only worth it when a third uploader appears.
- Folder (`webkitdirectory`) intake — PDFs are ingested as individual files.

## Decisions

### Decision 1: Module layout mirrors the game uploader

Create `src/admin/features/documents/` with: `DocumentsView.tsx` (page + state), `DocumentDropzone.tsx` (PDF intake), `GameCombobox.tsx` + `useGameSearch.ts` (searchable game picker), `uploadDocument.ts` (XHR uploader), and `useExistingDocuments.ts` (duplicate-awareness count map). Wire a `<Route path="/documents">` in `AdminApp.tsx` and a `NAV_ENTRIES` row in `AdminSidebar.tsx` (icon `menu_book`). This is a direct analog of how `upload/` is wired.

**Alternatives considered:** placing the combobox/dropzone in a shared `src/admin/components/` — rejected; they are documents-specific (PDF filter, document-type coupling) and the game uploader keeps its own `Dropzone` local for the same reason.

### Decision 2: PDF dropzone is a sibling, not a generalization of the CHD dropzone

`src/admin/features/upload/Dropzone.tsx` is CHD-specific: it filters `.chd`, carries a `webkitdirectory` folder picker, and shows CHD copy. Rather than parameterize it, build a smaller `DocumentDropzone` that filters `.pdf`, supports multi-file selection only (no folder picker), and reuses the same drag-depth / `dragging` state idiom and Tailwind classes (`glass-panel`, gradient CTA). The two dropzones share a _pattern_, not code.

**Rationale:** the folder picker and CHD copy are dead weight for PDFs, and parameterizing the existing component risks the working game-upload path for no reuse gain. A sibling is ~60 lines and self-contained.

### Decision 3: Searchable combobox backed by server-side, debounced `getList`

`useGameSearch` debounces the typed query (250 ms) and calls `adminClient.collection('games').getList(1, 20, { filter, sort: 'title' })`, where the filter is built with the SDK's escaping helper to prevent injection:

```
adminClient.filter('title ~ {:q} || first_disc_serial ~ {:q}', { q })
```

The `~` operator is PocketBase's case-insensitive LIKE. Results render in a dropdown; selecting one binds the game id to the staged file. No client-side cache of the full catalog — each search is bounded to 20 rows, so the workflow scales regardless of catalog size. An empty/short query shows nothing (or a "type to search" hint) rather than loading arbitrary rows.

**Alternatives considered:**

- _Load all games once, filter client-side_ (what the reference `guides-uploader.html` does) — rejected; does not scale to thousands of games and wastes bandwidth on a workflow that targets one game at a time.
- _`getFirstListItem` exact-match_ (what `catalog.ts` uses for serial lookup) — rejected; we need partial/fuzzy matching by title, not exact serial.

### Decision 4: Per-file assignment state via `useReducer`, not `react-hook-form`

Staged files are held in a single reducer: an array of `{ id, file, gameId, type, replaceExisting, status, progress, error }` where `status ∈ {staged, uploading, done, error}` and `replaceExisting` is a boolean (default `false`, see Decision 8). Actions: `ADD_FILES`, `REMOVE`, `SET_GAME`, `SET_TYPE`, `SET_REPLACE`, `UPLOAD_START`, `PROGRESS`, `FILE_DONE`, `FILE_ERROR`. The upload-enabled predicate is `items.filter(i => i.gameId && i.type && i.status === 'staged')` (replace does not gate uploadability).

**Rationale:** this workflow is stateful list editing (assign game/type to each item, track per-item upload progress), which is closer to the game uploader's `useImportPipeline` reducer shape than to `SignInView`'s form-submit shape. `react-hook-form` adds ceremony without fitting the model.

**Default type:** a newly staged file defaults to `guide` (matches the reference tool's intent); the operator can flip it per row. `gameId` defaults to unset, so a file is not uploadable until explicitly assigned.

### Decision 5: `uploadDocument.ts` is a sibling of `uploadDisc.ts`, reusing `buildMultipart`

A thin XHR wrapper, structurally identical to `uploadDisc.ts`, differing only in collection URL and fields:

```
fields: [{ name: 'type', value: type }, { name: 'game', value: gameId }]
file part: { name: 'file', filename, blob: pdf }
url: `${adminClient.baseURL}/api/collections/documents/records`
```

It reuses `buildMultipart` (already generic) and the same `xhr.upload.onprogress` → `onProgress({loaded,total})` wiring. As with `uploadDisc.ts`, the superuser token is attached explicitly via `Authorization: adminClient.authStore.token` because a raw XHR does not inherit the SDK's auth store. Uploads run **sequentially** (one file at a time): this gives clean, unambiguous per-file progress and avoids bandwidth contention, matching the game uploader's approach.

**Alternatives considered:**

- _SDK `documents().create({ file })` directly_ — rejected; it gives no upload progress, and the spec requires per-file + overall progress.
- _Parallel uploads_ — rejected; complicates progress math and throttles poorly on slow links.

### Decision 6: Duplicate-awareness via a one-time document count map

On view mount, `useExistingDocuments` loads all document records requesting only the fields needed (`fields: 'game,type'`) and builds `Map<gameId, Set<type>>` (or counts). When a staged file has both a `gameId` and `type`, the row derives whether that (game, type) already exists and renders a non-blocking indicator (e.g. "already has a manual"); per Decision 8, `hasType` also gates the visibility of the per-row "Replace existing" checkbox. It never disables upload.

**Alternatives considered:**

- _On-demand count query when a game is selected_ (`getList(1,1,{filter})` + total) — cleaner per-query payload, but adds a request per selection and re-fetches on re-selection. The one-time load is simpler and the documents collection is expected to stay small (manuals/guides are sparse). If it ever grows large, switching to on-demand is a localized change to one hook.

### Decision 7: Intake validation is extension-based

PDF-only filtering uses the filename `.pdf` (case-insensitive) check at the dropzone, plus `accept=".pdf"` on the file input. MIME sniffing is not used — it is unreliable across OSes and the schema accepts any MIME anyway. Non-PDF files dropped in a mixed batch are silently filtered out (not staged, no error toast), matching the game uploader's "non-CHD ignored" behavior.

### Decision 8: Optional replacement via create-then-delete

The duplicate indicator from Decision 6 becomes actionable: each staged file whose `(gameId, type)` already exists gets a per-row "Replace existing {type} for this game" checkbox (shown only when `hasType` is true), bound to the `replaceExisting` flag on the item (Decision 4). The checkbox is opt-in — append stays the default — turning the existing "already has a manual" hint into an optional replace, as requested.

When an item with `replaceExisting = true` is uploaded, the loop creates the new record first (via `uploadDocument`), and only on a successful create deletes every pre-existing `(gameId, type)` document. Order is **create-then-delete**: a failed create triggers no delete, so the operator never loses the existing document to an upload failure. For the edge case of multiple items in the same batch sharing `(gameId, type)` all flagged replace, the pre-existing ids are snapshotted once at the start of `runUpload` (a filtered `documents` list per distinct `(gameId, type)` among replace-flagged items) and deleted after the corresponding creates succeed — so no item deletes a sibling item's freshly-created record. Deletes use `adminClient.collection('documents').delete(id)` under the existing superuser session; `documents` delete is superuser-allowed, so there is no backend or schema change.

**Alternatives considered:**

- _delete-then-create (a literal "overwrite")_ — rejected; if the create fails the existing document is already gone (data loss).
- _SDK `update` / upsert_ — n/a; `documents` has no unique constraint on `(game, type)` and PocketBase exposes no upsert primitive; per-id delete is the correct primitive.

## Risks / Trade-offs

- **[Search latency on slow networks]** → 250 ms debounce + bounded page size (20) + server-side filter keep each query cheap; results render as they arrive.
- **[Existing-doc count map grows]** → mitigated by requesting only `game,type` fields (tiny payloads). If the collection becomes large, swap Decision 6 to on-demand counts — localized to one hook.
- **[Raw XHR does not inherit SDK auth]** → `uploadDocument.ts` attaches `adminClient.authStore.token` explicitly, the same proven pattern as `uploadDisc.ts:46`. Forgetting this is the obvious footgun; the sibling structure makes it copy-paste-obvious.
- **[Duplicate manuals render incompletely downstream]** → DetailsView shows only the _first_ manual (`documents.find(d => d.type === 'manual')`). Append (the default) means a second manual upload is stored but not visible to end users. The duplicate indicator surfaces this; the opt-in replace mode (Decision 8) is the supported remedy — it removes the prior same-type document after the new one is created, so exactly one remains and renders. Standalone CRUD is still deferred.
- **[Replace deletes are irreversible under the superuser session]** → mitigated by create-before-delete ordering (Decision 8): the existing document is only removed after the new record is safely created, and replace is opt-in (default append), so an accidental check still requires an explicit upload approval to take effect.
- **[Operator confusion from append-only]** → mitigated by the duplicate indicator and the fact that uploaded files appear in the end-user view immediately (success feedback). Editing/deleting existing docs is an explicitly deferred follow-up.
