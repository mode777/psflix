# Tasks — add-admin-dashboard

Implements `specs/admin/spec.md` per `design.md`. Ordered by dependency; each task is verifiable. Design decisions referenced inline (D1–D8).

## 1. Build plumbing (D7)

- [x] 1.1 Create `admin.html` at repo root (mirrors `index.html` shape: dark `<html class="dark">`, `<div id="root">`, module script `/src/admin/main.tsx`, `<base href="./">`)
- [x] 1.2 Add `build.rollupOptions.input = { main: 'index.html', admin: 'admin.html' }` to `vite.config.ts`; keep `base: './'` and dev COOP/COEP headers unchanged
- [x] 1.3 Add `./admin.html` to the Tailwind `content` globs in `tailwind.config.ts`
- [x] 1.4 Verify `npm run build` emits both `dist/index.html` and `dist/admin.html` (and admin does not pull the emulator chunk)

## 2. Isolated admin auth realm (D2)

- [x] 2.1 Create `src/admin/lib/pb.ts`: a dedicated `new PocketBase(url)` constructed with a custom `BaseAuthStore` whose storage key is `'pocketbase_admin_auth'` (distinct from the user app's `'pocketbase_auth'`)
- [x] 2.2 Create `src/admin/lib/pb-auth.ts` admin auth helpers: `signInWithPassword` / `signOut` / `isAuthenticated` / `currentUser`, authenticating against `collection('_superusers').authWithPassword(...)`
- [x] 2.3 Create `src/admin/features/auth/store.ts`: zustand `useAdminAuthStore` seeded from the admin client's `authStore` and resynced on `authStore.onChange`
- [x] 2.4 Write a unit test proving two PocketBase clients with distinct storage keys do not interfere (set token on one, assert the other's `authStore` is untouched) — verifies the spec's "Admin authentication is isolated" requirement

## 3. Admin app shell (D5, D6)

- [x] 3.1 Create `src/admin/main.tsx` mounting `HelmetProvider`, a **separate** `QueryClientProvider` (own `QueryClient`), `HashRouter`, and importing the shared `src/styles/index.css` (no token redefinition)
- [x] 3.2 Create admin layout with its own chrome (admin header showing the signed-in superuser + a sign-out control) — the user app's `Header` must NOT be imported here
- [x] 3.3 Create the admin router with a single guarded dashboard route (unauthenticated state renders sign-in only)

## 4. Superuser sign-in & session (D2; spec: access, persistence, termination)

- [x] 4.1 Build the sign-in view: email/password form styled with Obsidian Console tokens; on invalid credentials show an error and establish no session
- [x] 4.2 Implement the auth gate: when `isAuthenticated` is false, render sign-in only and fetch no dashboard data
- [x] 4.3 Implement boot validation: if a stored token is present, run a cheap authenticated probe (a count request); on `401`/invalid, clear the admin store and show sign-in (covers reload-persists-valid + expired-requires-reauth)
- [x] 4.4 Wire the sign-out control to clear the admin `authStore` and return to the sign-in view

## 5. Count metrics (D3; spec: Catalog and user count metrics)

- [x] 5.1 Create count fetchers for `games`, `discs`, `users` using `getList(1, 1)` → `totalItems` on the admin client
- [x] 5.2 Register each count as an independent react-query query so they run in parallel and one failure does not fail the others
- [x] 5.3 Surface a per-metric failure state (e.g. error chip on the failed card) while successful cards continue to display

## 6. Storage metrics (D4; spec: Accumulated storage metric)

- [x] 6.1 Spike: HEAD-request one PocketBase file URL and confirm the response includes `Content-Length`. If absent, switch the probe to `GET` with `Range: bytes=0-0` (read `Content-Range`) and record the outcome before continuing
- [x] 6.2 Create a file-URL builder using `adminClient.files.getURL(record, filename)` for the four categories: `discs.iso`, `documents.file`, `save_state.data`, `memory_cards.data`
- [x] 6.3 Implement the HEAD-probe helper that attaches the admin superuser `Authorization` header (required for owner-only `save_state.data` / `memory_cards.data`) and parses `Content-Length`
- [x] 6.4 Implement a bounded-concurrency probe runner (cap ~16 in flight) across each category's files
- [x] 6.5 Implement the URL-keyed `localStorage` size cache: read-through (cache hit → no probe), store on miss; rely on filename-suffix versioning for self-invalidation
- [x] 6.6 Aggregate per-category totals + a grand total; a category with no files reports `0`
- [x] 6.7 On partial probe failure, mark the affected category and the grand total as "may be incomplete" while still displaying successfully probed categories
- [x] 6.8 Unit-test aggregation: sums, empty-category zero, partial-failure flagging, and cache hit/miss behavior

## 7. Dashboard view (spec: dashboard UI; Obsidian Console visual consistency)

- [x] 7.1 Build the dashboard view: count cards (games / discs / users) and a storage breakdown (four categories + grand total) using shared design tokens (charcoal surface tiers, 16px card radii, Inter type, PlayStation-blue accents)
- [x] 7.2 Wire loading / error / "incomplete" states into the cards and storage panel
- [x] 7.3 Verify the rendered colors, type, spacing, and radii match the user app's tokens (no foreign styling)

## 8. Discoverability link (D8)

- [x] 8.1 Add an unconditional `<a href="/admin.html">` "Admin" link in the user app (proposed placement: `AccountMenu`) — a plain anchor, not a React Router `<Link>`
- [x] 8.2 Confirm placement with the product owner (AccountMenu vs Header vs footer) and adjust if needed

## 9. Verification

- [x] 9.1 Run `npm run typecheck` and `npm run lint` green
- [x] 9.2 Run `npm run build` and `npm run verify:build` green; confirm the emulator chunk is absent from the admin entry's chunks
- [x] 9.3 Run the unit test suite (`npm test`) green, including the new auth-isolation and storage tests
- [x] 9.4 Manual end-to-end: click the Admin link → land on admin sign-in → sign in as a superuser → counts and storage render; verify signing out of admin leaves a concurrent user-app session intact

## 10. Sign-in UX

- [x] 10.1 Add a password-reveal toggle (eye icon) to the admin sign-in password field
