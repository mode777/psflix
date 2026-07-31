# Stage 1 — Vite + React + Tailwind v3 scaffold

Bootstrap a working Vite + React + TypeScript app styled with the Obsidian Console design tokens. After this stage, `npm run dev` shows a blank page that already renders the right typography and background.

## Goal

Blank page on `http://localhost:5173` that already uses the Obsidian Console font, color, and background — proving the Tailwind config is wired correctly before any UI work starts.

## Decisions (locked in earlier)

- **Vite + React 18 + TypeScript**.
- **Tailwind v3.4** (the mocks' `tailwind.config` is v3-shaped).
- **Self-hosted fonts** via `@fontsource/inter` — no Google Fonts CDN.
- **Material Symbols** via the `material-symbols` npm package, not a CDN `<link>`.

## Files to create

### `package.json`

Use `npm create vite@latest . -- --template react-ts` to scaffold, then add deps:

```bash
npm install react-router-dom clsx tailwind-merge @fontsource/inter material-symbols
npm install -D tailwindcss@3.4 postcss autoprefixer @types/node \
  eslint prettier eslint-plugin-react-hooks eslint-plugin-react-refresh \
  @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-config-prettier
```

Scripts (final):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,css,md}\""
  }
}
```

(Tests are added in Stage 8.)

### `vite.config.ts`

- React plugin.
- `@` path alias to `src`.
- `server.port: 5173` (default).

### `tsconfig.json` + `tsconfig.node.json`

Standard Vite TS template. Add `"baseUrl": "."` and `"paths": { "@/*": ["src/*"] }` to match the Vite alias.

### `tailwind.config.ts`

**Mirror the tokens from `psflix_design/*/code.html`.** Three config blocks are identical across the mocks (color, radius, spacing, fontFamily, fontSize) — copy the union. Do not invent new palette entries.

Required entries (paraphrased from the mocks; full values in DESIGN.md):

- `darkMode: 'class'`
- `content: ['./index.html', './src/**/*.{ts,tsx}']`
- `theme.extend.colors` — the full Obsidian Console palette (surface, surface-container-low/lowest/high/highest, background, on-surface, on-surface-variant, primary, primary-container, secondary, secondary-container, tertiary, tertiary-container, error, error-container, outline, outline-variant, inverse-surface, inverse-primary, and the `primary-fixed`/`secondary-fixed`/`tertiary-fixed` families).
- `theme.extend.borderRadius` — `DEFAULT: '0.25rem'`, `lg: '0.5rem'`, `xl: '0.75rem'`, `full: '9999px'`.
- `theme.extend.spacing` — `unit: '8px'`, `margin-mobile: '20px'`, `margin-desktop: '64px'`, `gutter: '24px'`, `container-max: '1440px'`.
- `theme.extend.fontFamily` — every variant in DESIGN.md (`display-lg`, `headline-xl`, `headline-xl-mobile`, `headline-lg`, `body-lg`, `body-md`, `label-caps`) all set to `['Inter']`.
- `theme.extend.fontSize` — mirror the size + lineHeight + letterSpacing + fontWeight tuples from DESIGN.md.

### `postcss.config.js`

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

### `src/styles/index.css`

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/inter/800.css';
@import 'material-symbols';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    @apply dark;
  }
  body {
    background-color: #0a0a0c; /* Obsidian base layer */
    color: #e2e2e2;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .material-symbols-outlined {
    font-variation-settings:
      'FILL' 0,
      'wght' 300,
      'GRAD' 0,
      'opsz' 24;
  }
}

@layer components {
  .glass-panel {
    background: rgba(22, 22, 26, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .card-hover-effect {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .card-hover-effect:hover {
    transform: scale(1.05);
    box-shadow: 0 0 40px rgba(175, 198, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.2);
  }
  .vignette-overlay {
    background: linear-gradient(to top, rgba(10, 10, 12, 0.9) 0%, rgba(10, 10, 12, 0) 50%);
  }
  .bg-ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-size: cover;
    background-position: center;
    filter: blur(60px) brightness(0.4);
    transform: scale(1.1);
  }
  .ambient-shadow {
    box-shadow: 0 20px 60px rgba(10, 10, 12, 0.8);
  }
}
```

### `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### `src/App.tsx`

A placeholder for now — Stages 3+ will replace it with the router shell.

```tsx
export default function App() {
  return (
    <main className="min-h-screen px-margin-mobile md:px-margin-desktop py-32">
      <h1 className="text-headline-xl-mobile md:text-headline-xl font-extrabold text-on-surface">
        PSflix
      </h1>
      <p className="text-body-lg text-on-surface-variant mt-2">
        Scaffold OK — Tailwind tokens applied.
      </p>
    </main>
  );
}
```

### `index.html`

- `<html lang="en" class="dark">`.
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
- `<title>PSflix — PlayStation Catalog</title>`.
- `<base href="./">` (defer until Stage 9 if you prefer, but adding now is fine).

### `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`

Standard TS + React + Prettier config. Prettier: `singleQuote: true`, `semi: true`, `printWidth: 100`. ESLint extends `eslint:recommended`, `plugin:@typescript-eslint/recommended`, `plugin:react-hooks/recommended`, `prettier`.

## Files to verify

- `node_modules/` installed.
- `npm run dev` boots without errors.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` produces `dist/index.html`.

## Acceptance criteria

- [ ] `npm run dev` renders a page with the Obsidian background and Inter text.
- [ ] `tailwind.config.ts` contains every color, radius, spacing, fontFamily, fontSize from DESIGN.md.
- [ ] No raw `<a>` to external Google Fonts in `index.html`; fonts are self-hosted.
- [ ] `npm run typecheck && npm run lint` both pass.
- [ ] `npm run build` produces `dist/index.html`.

## Manual verification

1. `npm run dev` → open `http://localhost:5173`.
2. Page background is `#0A0A0C` (not pure black).
3. Headline renders in Inter, weight 800.
4. Browser DevTools → Lighthouse → confirm fonts are served same-origin (no fonts.gstatic.com requests).
5. `npm run build` → `ls dist/` shows `index.html` and `assets/`.

## Out of scope

- Router, real routes (Stage 3).
- PocketBase client (Stage 2).
- Tests (Stage 8).
