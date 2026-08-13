## 1. Upload data layer

- [x] 1.1 Create `src/admin/features/documents/uploadDocument.ts` — XHR uploader sibling of `uploadDisc.ts`, reusing `buildMultipart` from `../upload/multipart`; fields `type` + `game`, file part `file`, URL `…/collections/documents/records`, explicit `Authorization: adminClient.authStore.token`, `onProgress({loaded,total})` callback
- [x] 1.2 Create `src/admin/features/documents/useGameSearch.ts` — debounced (250ms) hook calling `adminClient.collection('games').getList(1, 20, { filter, sort: 'title' })` with `adminClient.filter('title ~ {:q} || first_disc_serial ~ {:q}', { q })`; returns `{ results, isLoading, error }`; no-op for empty/short query
- [x] 1.3 Create `src/admin/features/documents/useExistingDocuments.ts` — loads all `documents` records once on mount with `fields: 'game,type'`, builds `Map<gameId, Set<type>>`; exposes `hasType(gameId, type)`; refetch helper for post-upload refresh

## 2. Intake & selection UI

- [x] 2.1 Create `src/admin/features/documents/DocumentDropzone.tsx` — adapt `upload/Dropzone.tsx` idiom (drag-depth state, `glass-panel`, gradient CTA); filter to `.pdf` (case-insensitive) via `accept=".pdf"` + extension check on drop; multi-file selection; no folder picker; silently drop non-PDFs
- [x] 2.2 Create `src/admin/features/documents/GameCombobox.tsx` — text input + dropdown consuming `useGameSearch`; shows "type to search" hint when query is empty; renders matched games (title + region + first_disc_serial); calls `onSelect(game)`; keyboard accessible (arrow/enter/esc)

## 3. Staged-file state & view

- [x] 3.1 Define staged-item types and a `useReducer` in `src/admin/features/documents/useDocumentQueue.ts` — item shape `{ id, file, gameId, type, status, progress, error }`; actions `ADD_FILES`, `REMOVE`, `SET_GAME`, `SET_TYPE`, `UPLOAD_START`, `PROGRESS`, `FILE_DONE`, `FILE_ERROR`; default `type: 'guide'`, `gameId: null`, `status: 'staged'`
- [x] 3.2 Build `src/admin/features/documents/DocumentsView.tsx` — page shell (Helmet title/noindex, `glass-panel` layout) wiring `DocumentDropzone`, the staged list, per-row `GameCombobox` + type selector + remove, the non-blocking duplicate indicator from `useExistingDocuments`, an Upload button gated on `items.filter(i => i.gameId && i.type && i.status === 'staged')`, and a log area
- [x] 3.3 Implement the sequential upload loop in `DocumentsView` — iterate fully-assigned staged items, call `uploadDocument` per file with `PROGRESS` updates, mark `FILE_DONE`/`FILE_ERROR`, continue on per-file failure, compute per-file + overall progress, refresh `useExistingDocuments` and clear completed items on batch finish

## 4. Admin shell wiring

- [x] 4.1 Add `<Route path="/documents" element={<DocumentsView />} />` to `src/admin/AdminApp.tsx` and import the view
- [x] 4.2 Add `{ to: '/documents', label: 'Documents', icon: 'menu_book', end: false }` to `NAV_ENTRIES` in `src/admin/components/AdminSidebar.tsx`

## 5. Tests & verification

- [x] 5.1 Add unit tests for the staged-file reducer (ADD_FILES filters non-PDF, SET_GAME/SET_TYPE, upload-enabled predicate, FILE_ERROR keeps batch going)
- [x] 5.2 Add a test for `uploadDocument` (XHR fields/URL/Authorization header, onProgress wiring, error path) using a mocked `XMLHttpRequest`
- [x] 5.3 Run `npm run typecheck` and `npm run lint`; resolve any findings in the new files
- [x] 5.4 Run `npm run build` and `npm run verify:build`; confirm both stay green

## 6. Optional document replacement (delta)

- [x] 6.1 Extend `src/admin/features/documents/useDocumentQueue.ts` — add `replaceExisting: boolean` (default `false`) to `DocumentItem` and a `SET_REPLACE` action + `setReplace(id, replaceExisting)` binding; keep `selectUploadable` unchanged (replace does not gate uploadability)
- [x] 6.2 Add `src/admin/features/documents/replaceExistingDocuments.ts` — given `(gameId, type)`, fetch matching `documents` ids via `adminClient.collection('documents').getList(1, 200, { filter: 'game = {:g} && type = {:t}', fields: 'id' })` (paginated if needed) and delete each via `adminClient.collection('documents').delete(id)` under the admin session; return the deleted count
- [x] 6.3 Surface a per-row opt-in "Replace existing {type} for this game" checkbox in `DocumentsView.tsx` (`StagedRow`/`AssignmentHint`), rendered only when `existing.hasType(item.gameId, item.type)` is true, bound to `item.replaceExisting` via `queue.setReplace`; append stays the default (unchecked)
- [x] 6.4 Update the `runUpload` loop in `DocumentsView.tsx` — for items with `replaceExisting`, snapshot the pre-existing `(gameId,type)` document ids once at batch start, then after that item's `uploadDocument` create succeeds call `replaceExistingDocuments` to delete them (create-before-delete; a failed create MUST NOT delete); on delete failure leave the item `done` and append a non-fatal warning to the log; snapshotting prevents sibling items sharing `(game,type)` from deleting each other's new records
- [x] 6.5 Add unit tests — reducer `SET_REPLACE` toggles only the target item; `replaceExistingDocuments` issues a filtered list + per-id deletes with the admin client (mocked); a `runUpload`-shaped test asserting create-before-delete (no delete when the create rejects)
- [x] 6.6 Run `npm run typecheck` and `npm run lint`, then `npm run build` and `npm run verify:build`; keep all green
