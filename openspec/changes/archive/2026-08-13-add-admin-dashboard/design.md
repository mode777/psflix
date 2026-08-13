## Context

See `proposal.md - Why` for motivation (owner-scoped collections are uncountable without a superuser token; `/_/` is unbranded). See `specs/admin/spec.md` for the behavior contract this design implements.

Current-state constraints that shape the approach:

- The user app is welded to a **single** PocketBase singleton (`src/lib/pb.ts`) whose `authStore` is mirrored into `useAuthStore` (`src/features/auth/store.ts`) and is the auth source for the emulator's cloud sync (`PsxAnywhereRepository`, `SaveStateStore`, `MemcardSync`). Overwriting that `authStore` would corrupt the user session and the emulator sync.
- The app is a single Vite entry (`index.html` → `src/main.tsx`) using `HashRouter`, built because PocketBase's static handler does no SPA fallback. `base: './'`.
- Superusers live in PocketBase's built-in `_superusers` auth collection (always present on the instance, omitted from `pb_schema.json` exports). A superuser token bypasses **all** API rules — which is precisely what makes `users` / `memory_cards` / `save_state` countable.
- File fields store **only** a filename string on the record; PocketBase never returns file size, so storage aggregation requires probing each file URL.
- The design system (Obsidian Console) is fully encoded in `tailwind.config.ts` + `src/styles/index.css` (tokens, Inter, Material Symbols). It is shared by importing the same stylesheet — no token redefinition.

## Goals / Non-Goals

**Goals:**

- Make admin/user auth isolation **structural** (separate JS bundle, separate PocketBase client, separate persisted auth store) so it cannot regress by accident.
- Keep the emulator wasm/worker/sync engines out of the admin bundle.
- Deliver counts and storage with cheap, failure-tolerant data fetching.
- Reuse the design system verbatim.

**Non-Goals (design-level, beyond the proposal's scope):**

- No extraction of a shared component library between user app and admin. Admin builds its own minimal chrome; shared components are extracted later if duplication emerges.
- No proactive token refresh / SSO. The 5-day superuser token is validated on boot; expiry just returns the operator to sign-in.
- No operator-only visibility gating on the admin link (the user-app and admin auth realms are separate, so the link is visible to all users; the superuser gate is the real access control). Hiding the link from non-operators is out of MVP scope.
- No change to the emulator, the user `pb` singleton, or `useAuthStore`.

## Decisions

### Decision 1 — Separate HTML entrypoint (`admin.html`), not a route in the existing app

The admin surface is a **second Vite build input** (`admin.html` at repo root → `src/admin/main.tsx`), producing a separate bundle. Rationale:

1. **Auth isolation becomes structural.** A separate JS realm gets its own module-singleton `PocketBase` instance and zustand store; the user app's `pb` cannot be touched from admin and vice versa.
2. **Bundle weight.** The user app statically imports `ConsoleView` in `router.tsx`, so the emulator wasm core + sync engines ship in the user bundle. The admin bundle imports none of it.
3. **Growth runway.** Admin will gain features; a separate entrypoint scales to "the admin app" without risk of coupling back into user auth/sync.

Alternatives considered:

- **Route inside the existing app (`/#/admin`).** Rejected: it solves auth collision only _by convention_ (still needs a second `pb` instance, now co-located with the first), and it forces either suppressing the always-mounted user `Header` or branching the layout. The emulator chunk ships regardless. Lighter on build plumbing, worse on isolation and weight.
- **PocketBase's own dashboard at `/_/`.** Rejected: unbranded, not on the design system, not extensible for app-specific admin features.

### Decision 2 — Dedicated admin PocketBase client with a custom authStore and a distinct storage key

The admin app constructs its **own** `new PocketBase(url)` and authenticates against `_superusers`:

```
adminClient.collection('_superusers').authWithPassword(email, password)
```

The decisive detail: PocketBase's default `BaseAuthStore` persists to `localStorage` under the key `'pocketbase_auth'`. Two default PB instances would **collide on that key** and overwrite each other across reloads — defeating isolation outside the active tab. Therefore the admin client is constructed with a **custom `BaseAuthStore`** (or equivalent storage adapter) that uses a distinct key, e.g. `'pocketbase_admin_auth'`.

```
                user realm                          admin realm
   ┌────────────────────────────────┐   ┌────────────────────────────────┐
   │ src/lib/pb.ts                  │   │ src/admin/lib/pb.ts            │
   │ new PocketBase(url)            │   │ new PocketBase(url, customStore│
   │ authStore key: pocketbase_auth │   │ authStore key: pocketbase_     │
   │                                │   │   admin_auth                   │
   │ → useAuthStore (zustand)       │   │ → useAdminAuthStore (zustand)  │
   │ → emulator PsxAnywhereRepo     │   │ → dashboard queries            │
   └────────────────────────────────┘   └────────────────────────────────┘
                  two separate localStorage keys → two independent sessions
```

This is what makes the spec's "Admin authentication is isolated" requirement actually hold across reloads, not just within a tab.

Alternatives considered:

- **One PB instance, swap tokens manually.** Rejected: fragile; the emulator sync would intermittently run under a superuser token, bypassing owner scoping and leaking every user's data — a privacy/security incident.
- **One PB instance, two store keys via SDK option only.** Rejected: the SDK exposes a single `authStore` per client; there is no per-call store switching. A second client is required.

### Decision 3 — Counts via `getList(1, 1)` → `totalItems`

Each count is one request asking for a single-item page; PocketBase returns the full `totalItems` count in the page envelope (`10-api-records.md`). The superuser token bypasses the owner-scoped list rules on `users` / `memory_cards` / `save_state`, so `totalItems` reflects the **entire** dataset as the spec requires. Counts are issued in parallel; each is an independent react-query query so one failure does not fail the others (satisfies the "individual count failure" scenario).

Alternatives considered:

- **Fetch all records and count client-side.** Rejected: downloads the whole dataset; wasteful.
- **Superuser SQL API (`/api/sql`) with `COUNT(*)`.** Rejected: overkill for three integers; the SQL API is intended for ad-hoc analytics.

### Decision 4 — Storage via HEAD probes of file URLs, summed by category, with concurrency cap, partial-failure tolerance, and URL-keyed localStorage caching

Storage is computed by, for each category, listing all records holding a file, building each file's URL, issuing a `HEAD` request, and summing the `Content-Length` response header.

Key mechanics:

- **File URL construction** uses the admin client's file-URL helper (`pb.files.getURL(record, filename)`) → `/api/files/<collectionId>/<recordId>/<filename>`. Not string concatenation (per project convention).
- **Auth on owner-only files.** `discs.iso` / `documents.file` are public (their collections have empty view rules), so HEAD needs no token. `save_state.data` / `memory_cards.data` are owner-only; their HEAD requests **must carry** the admin superuser token via an explicit `Authorization` header (a raw `fetch` does not auto-attach the SDK header). The superuser token bypasses the owner rule, making those files readable for size-probing only.
- **Concurrency.** Probes run with a bounded concurrency cap (e.g. 16 in flight) per category and across categories.
- **Partial failure.** Per the spec scenario, a failed probe contributes zero to its category but marks the category (and the grand total) as "may be incomplete"; successful categories still display. A category with zero files reports `0`.
- **Caching (long-term strategy).** Probed byte sizes are cached in `localStorage`, **keyed by the file URL**. This is safe and self-invalidating: PocketBase suffixes each stored filename with a random part, so a file's URL changes whenever it is replaced — making the URL a stable, collision-free cache key (a re-upload → new URL → cache miss → fresh probe). Deleted files simply stop being probed; orphaned entries are harmless and may be GC'd by recency. This removes most repeat probe cost after the first load and is why a persisted `size` schema field is unnecessary at foreseeable scale.

```
   for each category (discs.iso, documents.file, save_state.data, memory_cards.data):
     records = adminClient.collection(c).getFullList()      # fields only, no size
     sizes  = await pooledMap(records, r => headSize(buildFileURL(r)))
     categoryTotal = sum(sizes)            # failed probe → 0 + set "incomplete" flag
   grandTotal = sum(categoryTotals)
```

Alternatives considered:

- **Persisted `size` number fields per file field + backfill.** Rejected: the URL-keyed `localStorage` cache (above) removes most repeat probe cost and avoids a schema change + migration. Revisit only if first-load probe volume is a measured problem.
- **Superuser SQL API aggregating internal file sizes.** Rejected: PocketBase does not reliably expose per-file byte size in the queryable schema.
- **GET requests with `Range: bytes=0-0`.** Fallback only if a HEAD spike shows PB does not return `Content-Length` (see Risks).

### Decision 5 — HashRouter inside admin, single dashboard route

Admin uses `HashRouter` for the same reason as the user app (PocketBase static handler does no SPA fallback) and `base: './'`. MVP has one route (the dashboard) plus a sign-in state; a router is adopted now so future admin features slot in without restructuring.

### Decision 6 — Own provider tree and react-query client

`src/admin/main.tsx` mounts its own `HelmetProvider`, `QueryClientProvider` (a **separate** `QueryClient` instance / cache from the user app — they are different bundles), and `HashRouter`. It imports the shared `src/styles/index.css` so Tailwind tokens, Inter, and Material Symbols are identical to the user app, satisfying the "Obsidian Console visual consistency" requirement without redefining any palette.

### Decision 7 — Vite multi-page build

`vite.config.ts` adds `build.rollupOptions.input = { main: 'index.html', admin: 'admin.html' }`. The Tailwind `content` globs add `./admin.html`. `base: './'` and the dev-server COOP/COEP headers are unchanged (they are origin-wide and harmless to admin). Output: `dist/index.html` + `dist/admin.html` + per-entry chunks.

### Decision 8 — Admin is reached via a link, never by typing the URL

Operators reach the admin surface by **clicking a link** in the user app, not by typing a URL. The link is a plain HTML anchor `<a href="/admin.html">` (a full page load to the separate bundle), **not** a React Router `<Link>` — router links only traverse in-app hash routes and cannot cross to a different entrypoint.

- **Placement:** proposed in the user app's `AccountMenu` (the account affordance where management links conventionally live); exact placement to confirm during implementation.
- **Visibility:** the link is **unconditionally visible to all users**. Because the user-app auth realm (`users`) is separate from the admin realm (`_superusers`), the user app has no reliable way to know whether the current user is also an operator, so the link cannot be operator-gated client-side. The **superuser auth gate (Decision 2) is the sole access control** — non-operators who click it see only the admin sign-in screen and cannot proceed, which is consistent with the spec's access requirement.
- **Security implication:** surfacing the link does not weaken the access model; the gate is unchanged, it only removes the need to type a URL.

Alternatives considered:

- **Bookmarking `/admin.html` (no link).** Rejected: operators must not have to type the URL.
- **Server-redirected `/admin` pretty path.** Rejected: PocketBase's static handler does no SPA routing; a clean `/admin` path would need a custom route hook for no functional gain. The anchor target remains the real static file `/admin.html`.

## Risks / Trade-offs

- **[HEAD may not return `Content-Length` on PocketBase file responses]** → Spike one file URL early in implementation. Fallback: `GET` with `Range: bytes=0-0` (read `Content-Range`) or a one-time schema `size` field.
- **[N HEAD requests scales poorly on large catalogs]** → Concurrency cap plus URL-keyed `localStorage` caching (Decision 4): only the first load pays the full probe cost; later loads read cached sizes and re-probe only new/changed files. Counts load first, storage is eventually-consistent. Revisit only if first-load cost is measured as a problem.
- **[authStore localStorage-key collision silently breaks isolation across reload]** → Mitigated by Decision 2: a custom `BaseAuthStore` with a distinct key. This is verified by a test that two clients with different keys do not interfere.
- **[Superuser token in `localStorage` = elevated XSS exposure]** → Same threat model as the existing user token; admin is operator-only and low-traffic. Acceptable for MVP. Revisit (e.g. short-lived tokens / cookie model) only if the admin surface grows sensitive write operations.
- **[Two PB instances = two token lifecycles]** → Admin token is validated on boot via a cheap authenticated probe (a count request); a `401` clears the admin store and shows sign-in. No background refresh for MVP.
- **[Tailwind purge misses admin-only classes]** → Mitigated by adding `./admin.html` to `content` globs and keeping admin source under `src/**/*` (already covered).

## Migration Plan

This change is **additive** — no data migration, and the only user-app change is a single navigation link:

1. Add `admin.html` (repo root) referencing `/src/admin/main.tsx`.
2. Add `src/admin/` tree (entry, providers, router/layout, auth client + store, dashboard view, stat/storage fetchers with URL-keyed localStorage caching).
3. Update `vite.config.ts` (`rollupOptions.input`) and Tailwind `content` globs.
4. Add an unconditional `<a href="/admin.html">` "Admin" link in the user app (proposed: `AccountMenu`) so operators reach admin by clicking, not by typing a URL (Decision 8).
5. Build emits both `dist/index.html` and `dist/admin.html`; both deploy to `pb_public`. `admin.html` is served as a real static file at `/admin.html`.

**Rollback:** remove `admin.html`, `src/admin/`, the config edits, and the one user-app link. No database changes to reverse.
