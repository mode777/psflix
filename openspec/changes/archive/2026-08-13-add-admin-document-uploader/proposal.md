## Why

The end-user DetailsView already renders manuals and strategy guides attached to a game (via `PdfPopover`), and the `documents` collection already accepts them — but its write rules are superuser-only (`createRule`/`updateRule`/`deleteRule` are all `null`), so they can only be added through the raw PocketBase admin UI. There is no operator workflow in the PSflix admin surface for attaching PDFs to existing games, which is exactly the kind of repetitive catalog-curation work the admin surface exists to make ergonomic.

## What Changes

- Add a new **Documents** admin area at route `/documents`, with a sidebar nav entry (icon `menu_book`), reachable only behind the existing superuser gate.
- Introduce a **file-first upload workflow**: the operator drops or selects PDF files first, then assigns each file to a target game and a document type (`manual` or `guide`) before uploading.
- Provide a **searchable game combobox** that filters games by typed query (title or `first_disc_serial`) so the workflow scales to a large catalog without rendering every game up front.
- Restrict intake to **`.pdf` files only**; non-PDF files are rejected at the dropzone rather than uploaded.
- Upload with **real per-file and overall progress**, reusing the existing multipart/XHR progress machinery from the game-upload feature.
- Use **append-by-default semantics with optional replacement**: by default, uploading creates new `documents` records and never modifies or deletes existing ones. When the selected game already has a document of the chosen type, the existing duplicate indicator additionally offers an opt-in, per-file **replace** — after the new record is created, the prior same-type documents for that game are deleted, leaving exactly one. Replacement is per file and unchecked by default; append remains the default, so the workflow stays safe for bulk additions.
- Reuse the operator's existing admin superuser session for all reads and writes — no separate credentials.

Non-goals (explicitly out of scope for this change):

- **Standalone document CRUD** — a dedicated area for listing, editing, or deleting already-uploaded documents independent of an upload is deferred to a later change. Replacement is supported only as an opt-in mode of this upload workflow.
- **Folder picker** — PDFs are ingested as individual files; the recursive `webkitdirectory` picker from the game uploader is not carried over.
- **Non-PDF document types** — only `.pdf` is accepted, matching what the downstream `PdfPopover` viewer renders.

## Capabilities

### New Capabilities

- `admin/document-upload`: An operator workflow within the admin surface that ingests PDF files, lets the operator assign each to an existing game and a document type (manual or guide), and uploads them to the `documents` collection with progress under the existing admin superuser session, with an optional per-file replace mode that deletes prior same-type documents for the assigned game after the new record is created.

### Modified Capabilities

- `admin`: The "Multi-view admin navigation" requirement currently enumerates the dashboard and the game upload area as the navigation's required entries. It is extended so the navigation also includes the new documents upload area.

## Impact

- **New code** under `src/admin/features/documents/`: the view, a PDF-filtered dropzone, a searchable game combobox (+ its data hook), a per-file staging list with game/type assignment and a per-file replace toggle, an `uploadDocument` helper, and a same-type-document delete helper for replace.
- **Admin shell wiring**: a new `<Route path="/documents">` in `src/admin/AdminApp.tsx` and a new entry in `NAV_ENTRIES` in `src/admin/components/AdminSidebar.tsx`.
- **Reused infrastructure**: the generic `buildMultipart` helper in `src/admin/features/upload/multipart.ts` is reused as-is; the new `uploadDocument` helper is a thin sibling of `uploadDisc.ts` (same XHR + `upload.onprogress` shape, different collection URL and fields: `type`, `game`, `file`).
- **No backend changes**: the `documents` collection schema, types (`DocumentsResponse`, `DocumentsTypeOptions`), and access rules are already sufficient. No schema migration, no new PocketBase hooks, no new environment variables. Replacement deletes existing `documents` records via the stock PocketBase delete API under the existing superuser session (delete is already superuser-allowed); no rule or schema change.
- **No new dependencies**: built with the existing PocketBase SDK, React, react-hook-form, zod, and Tailwind stack already in use across the admin app.
- **Downstream effect is already wired**: uploaded documents render automatically on the end-user DetailsView, because `useGame` already expands `documents_via_game` and `DetailsView` splits them into manual vs. guide. No end-user UI changes are required for uploads to appear.
