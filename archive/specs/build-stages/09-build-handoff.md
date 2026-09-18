# Stage 9 — Build handoff to Flux

Produce the build artifact the Flux Kubernetes cluster consumes. The cluster owns deploy mechanics; this stage ends with a `dist/` directory that has been verified to work standalone.

## Goal

`npm run build` produces an artifact that boots cleanly when served as static files. The Flux cluster (separate repo) decides how to ship it.

## Decisions (locked)

- **HashRouter** is in place (Stage 3). Confirms hash URLs work without server-side rewrites.
- **`<base href="./">`** in `index.html` so assets resolve under any hash URL.
- The build is a static SPA — no SSR, no edge functions.
- No CORS config needed (single origin with PB).

## Files to create / edit

### `index.html`

Confirm:

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="./" />
    <title>PSflix</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The `<base href="./">` is critical: it makes relative asset paths resolve under any host the cluster puts the SPA behind.

### `vite.config.ts`

Confirm `base: './'` is set (default in Vite is `/`; flip to `./`):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pocketbase: ['pocketbase'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
```

### `scripts/verify-build.mjs`

A small script that:

1. Runs `npm run build`.
2. Bootstraps `npx serve dist -p 5174` in the background.
3. Curls `http://localhost:5174/` — expect 200 + `index.html`.
4. Curls `http://localhost:5174/#/game/SCUS-94121` — expect 200 (same as `/`).
5. Kills the server.

Add to `package.json`:

```json
"scripts": {
  "verify:build": "node scripts/verify-build.mjs"
}
```

### `README.md` (edit)

Add a "Build" section:

```
## Build

Produce a static artifact that the Flux cluster consumes:

    npm run build       # outputs dist/
    npm run verify:build  # boots dist/ via a local server and curls it

Deployment is handled by the Flux Kubernetes cluster — see AGENTS.md.
```

## Acceptance criteria

- [ ] `npm run build` succeeds and produces `dist/index.html` + `dist/assets/`.
- [ ] `npm run verify:build` boots the build and confirms `200 OK` on `/` and on a hash route.
- [ ] `dist/index.html` has `<base href="./">`.
- [ ] All asset URLs in `dist/index.html` are relative (no `https://...` origins).
- [ ] `npm run preview` works (Vite's built-in preview server).
- [ ] `npm run typecheck && npm run lint && npm run test` all pass.

## Manual verification

1. `npm run build`.
2. `ls dist/` → `index.html`, `assets/`, `favicon.svg` (if added).
3. `npx serve dist -p 5174` → open `http://localhost:5174/`.
4. Browse → details → lightbox → sign-in flow all work.
5. Direct-visit `http://localhost:5174/#/game/SCUS-94121` → details view loads.
6. `npm run verify:build` (CI-style) passes.

## What's handed off to the cluster

- `dist/` — the static SPA.
- An assumption that the cluster will serve it from PocketBase's `pb_public` directory (per `AGENTS.md`).
- The PocketBase API at `https://pb.example.com` is already running and has the schema in `pb_schema.json`.

## What's NOT in this stage

- Build publishing (image push, GitOps sync, kustomization) — owned by the cluster.
- Domain / TLS / ingress — owned by the cluster.
- Secrets / env vars (none needed at build time; `VITE_PB_URL` defaults to the production PB).
- CORS configuration — not needed while same-origin.
