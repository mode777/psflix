# Stage 3 — Routing shell + persistent header

Replace the `App.tsx` placeholder with a router, mount the persistent header once, and stub the three routes. After this stage, navigating the in-app routes works without full reloads.

## Goal

- `HashRouter` wrapping the app (mandatory for the `pb_public` deploy target).
- `Header` mounted exactly once — present on every route.
- Three routes: `/` → BrowseView stub, `/game/:firstDiscSerial` → DetailsView stub, `*` → NotFoundView.
- Internal navigation uses `<Link>` / `<NavLink>`.

## Decisions (locked)

- `react-router-dom` v6+.
- `HashRouter` (not `BrowserRouter`) — TBH: the SPA is served from PB's `pb_public`, which has no SPA fallback. Hash routes keep everything on `index.html`.
- All routes are hash-relative. The PB instance URL is `https://psx.alexklingenbeck.de`, so a game page looks like `https://psx.alexklingenbeck.de/#/game/SCUS-94121`.
- The natural key for a game is `first_disc_serial`, not PocketBase's record ID. Use `firstDiscSerial` as the URL param.

## Files to create / edit

### `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
```

### `src/components/layout/Header.tsx`

Port `psflix_design/app_header/code.html` to TSX. Highlights:

- `<header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-white/10 shadow-2xl shadow-primary/5 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-20">`.
- Logo "PSflix" in **PlayStation red `#E50914`** (`text-[#E50914]`). The mock is intentional — the logo is the one Netflix-style red accent on an otherwise Obsidian screen. Don't change it to the primary blue.
- Logo `<h1>` → wrapped in `<Link to="/">` so clicking it goes home.
- Arrow back / forward buttons call `useNavigate()`: `navigate(-1)` and `navigate(1)`. Hide forward on mobile (per the mock).
- Settings + account_circle icons in the trailing actions. They're buttons with `aria-label`s; the account button opens the auth modal in Stage 6.
- Every interactive surface is a `<button>` or `<Link>` — no raw `<a>` for in-app nav.

### `src/routes/BrowseView.tsx`

Stub:

```tsx
export default function BrowseView() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">Browse Games</h1>
      <p className="text-body-lg text-on-surface-variant mt-2">Browse view (Stage 4).</p>
    </main>
  );
}
```

### `src/routes/DetailsView.tsx`

Stub, takes the URL param:

```tsx
import { useParams } from 'react-router-dom';

export default function DetailsView() {
  const { firstDiscSerial } = useParams<{ firstDiscSerial: string }>();
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">
        Game: {firstDiscSerial}
      </h1>
      <p className="text-body-lg text-on-surface-variant mt-2">Details view (Stage 5).</p>
    </main>
  );
}
```

### `src/routes/NotFoundView.tsx`

```tsx
import { Link } from 'react-router-dom';

export default function NotFoundView() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop text-center">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">404</h1>
      <p className="text-body-lg text-on-surface-variant mt-2">That page doesn't exist.</p>
      <Link to="/" className="inline-block mt-6 px-6 py-2 rounded-lg bg-primary text-on-primary">
        Back to browse
      </Link>
    </main>
  );
}
```

### `src/App.tsx`

```tsx
import { Routes, Route } from 'react-router-dom';
import Header from '@/components/layout/Header';
import BrowseView from '@/routes/BrowseView';
import DetailsView from '@/routes/DetailsView';
import NotFoundView from '@/routes/NotFoundView';

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<BrowseView />} />
        <Route path="/game/:firstDiscSerial" element={<DetailsView />} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </>
  );
}
```

### `src/lib/cn.ts`

Tiny utility for conditional Tailwind classes:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Used in Stages 4, 5, 6.

## Files to verify

- `src/App.tsx` is the route shell.
- `src/components/layout/Header.tsx` matches the mock visually.
- `src/main.tsx` wraps in `HashRouter`.
- `src/lib/cn.ts` exists.

## Acceptance criteria

- [ ] `npm run dev` → header is visible on every route.
- [ ] Clicking the logo returns to `/`.
- [ ] Visiting `#/game/SCUS-94121` renders the DetailsView stub with the serial in the heading.
- [ ] Visiting `#/anything-else` renders NotFoundView.
- [ ] Browser back/forward buttons work (no full reloads).
- [ ] Logo is PlayStation red `#E50914`.
- [ ] `npm run typecheck && npm run lint` pass.

## Manual verification

1. `npm run dev`.
2. Navigate via the address bar: `/#/`, `/#/game/SCUS-94121`, `/#/foo`.
3. Confirm the header is on all three pages.
4. Click the logo → back to `/`.
5. Click the back arrow → previous route.
6. Open DevTools → Network → confirm hash changes do **not** trigger full page reloads.

## Out of scope

- Browse grid, search, filters (Stage 4).
- Details content (Stage 5).
- Auth UI (Stage 6).
- Real header dropdowns (Stage 6).
