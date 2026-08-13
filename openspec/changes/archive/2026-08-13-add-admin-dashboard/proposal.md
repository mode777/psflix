## Why

PSflix currently has no first-party surface for the operator to inspect the catalog and user base. The data the operator needs is **structurally inaccessible** to a regular user session: `users`, `memory_cards`, and `save_state` carry owner-scoped list rules (`id = @request.auth.id` / `@request.auth.id = user.id`), so only a superuser token — which bypasses all rules — can aggregate counts across them. PocketBase ships a superuser dashboard at `/_/`, but it is unbranded, not on the Obsidian Console design language, and cannot host app-specific admin features as the product grows. We need a branded, design-consistent admin foundation that begins as a stats dashboard and extends over time.

## What Changes

- **New `admin.html` entrypoint.** A second Vite build input (`admin.html` → `src/admin/main.tsx`) producing an isolated admin bundle, distinct from the user-facing `index.html`. The emulator wasm/worker/sync engines stay out of the admin bundle entirely.
- **Isolated superuser authentication.** The admin app authenticates against PocketBase's `_superusers` auth collection using a **dedicated PocketBase client instance** (separate `new PocketBase(url)`), so the admin superuser token never overwrites the user app's `pb.authStore`. A separate admin auth store (zustand) governs admin session state.
- **Superuser login screen.** A gated entry that requires a valid `_superusers` token before any dashboard data loads. No sign-up; access is purely token-based for now.
- **Stats dashboard (MVP).** A single view showing:
  - Counts of `games`, `discs`, and `users` (via `getList(1, 1)` → `totalItems`).
  - Accumulated storage across `discs.iso`, `documents.file`, `save_state.data`, and `memory_cards.data`, computed by HEAD-probing each file URL and summing `Content-Length` (run concurrently with a cap; tolerant of partial failure).
- **Obsidian Console styling.** Admin chrome and dashboard cards reuse the existing Tailwind tokens / `index.css` — charcoal surface tiers, 16px card radii, Inter type, PlayStation-blue accents — with its own admin nav/header (the persistent user `Header` is NOT mounted in admin).
- **Non-goals (explicit).** No CRUD editing of records, no user management UI, no realtime, no role/IP/MFA enforcement beyond the superuser token, no changes to existing user-facing behavior, and no PocketBase schema changes in this change.

## Capabilities

### New Capabilities

- `admin`: A superuser-gated admin surface, delivered as a separate HTML entrypoint with an isolated auth realm, exposing an operator dashboard of catalog/user counts and accumulated file storage. Foundation for future admin features.

### Modified Capabilities

- _(none)_ — no existing spec-level behavior changes. The user-facing app, its routing, its auth collection, and the emulator sync are untouched.

## Impact

- **Build tooling (`vite.config.ts`):** Add `build.rollupOptions.input` for a second entry (`admin.html`). Both entries share the React/Tailwind toolchain; `base: './'` and the COOP/COEP dev headers remain unchanged.
- **New source tree (`src/admin/`):** Admin entry (`main.tsx`), admin providers (QueryClient, Helmet), admin router/layout, superuser auth client + store, dashboard view and stat-fetching logic, shared design tokens via the existing `index.css`.
- **Backend (PocketBase):** No schema changes. Uses the existing `_superusers` collection (not present in `pb_schema.json` export but always present on the instance). Admin reads rely on the superuser token's rule bypass; `games`/`discs` file sizes and owner-only `save_state`/`memory_cards` files become readable for size-probing only because of that bypass.
- **Deployment:** `admin.html` is emitted to `dist/` alongside `index.html` and served by PocketBase's static handler from `pb_public` at `/admin.html` (a real static file — no SPA fallback needed; HashRouter is used inside admin too for the same reason as the main app).
- **Auth model:** Introduces a parallel auth realm (separate PB client + store). The existing `pb` singleton, `useAuthStore`, and the emulator `PsxAnywhereRepository` are provably unaffected because they never share the admin client's auth store.
- **Dependencies:** No new runtime dependencies — `pocketbase`, `react`, `react-router-dom`, `@tanstack/react-query`, `zustand`, and the Tailwind/Inter setup are all already present.
