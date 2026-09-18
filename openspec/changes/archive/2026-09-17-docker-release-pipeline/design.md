# Design

## Context

PSflix already ships `pb_migrations/` (full schema, 35 files) and `pb_hooks/main.pb.js` (route-wide COI headers + disabled read/write timeouts). The k8s proxy that used to provide COI headers is gone; Traefik terminates TLS only. The trackify repo (`../trackify`) solves the same problem with a five-line Dockerfile, two npm scripts, and a two-workflow GitHub Actions setup; this change ports that pattern. Harbor credentials (`robot$docker` robot account) are already set as `HARBOR_USERNAME`/`HARBOR_PASSWORD` action secrets on `mode777/psflix`.

## Goals / Non-Goals

**Goals:**

- Local full stack (`vite dev` or built `dist/` against a local PocketBase) with one command each
- `v*` tag → SPA build → Docker image → Harbor, mirroring trackify exactly
- Image runs with zero configuration (same-origin SPA ↔ API)

**Non-Goals:**

- Seeding catalog content (games/discs/BIOS) into fresh instances — accepted empty; upload via admin UI or backup restore
- Multi-arch images (linux/amd64 only, like trackify)
- Reworking the k8s manifests (cloud.alexklingenbeck.de repo, separate concern)
- `latest`/rolling image tags — release tags only, like trackify

## Decisions

### D1: Backend URL default — context-dependent fallback (Option 1)

`src/lib/pb.ts` and `src/admin/lib/pb.ts` resolve the URL as: `VITE_PB_URL` if set, else production → `window.location.origin`, else dev → `http://127.0.0.1:8090`.

- _Why not bake at image build (multi-stage Dockerfile with `ARG VITE_PB_URL`)_: diverges from trackify's build-outside-copy-in pattern, adds a build stage, and hardcodes a URL into the artifact again. Same-origin needs no configuration at all.
- _Why not keep the prod hostname fallback_: a self-hosted image would silently phone home to `pb.example.com`; auth tokens would leak across origins.
- Implementation shape: `const url = import.meta.env.VITE_PB_URL || (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:8090')` — both entry points use the same expression; the vendored `PocketbaseRepository` class is dead code in PSflix (the adapter wraps the shared `pb` singleton), so no third site exists.
- Note: trackify uses bare `new PocketBase()` (SDK defaults to `window.location.origin`); PSflix keeps the env-var override because the dev server (COI headers on :5173) and local PB (:8090) are different origins — the SDK default alone would break dev.

### D2: Port trackify's download/serve scripts nearly verbatim

`tools/download-pocketbase.mjs` (pure Node: GitHub releases API + in-memory ZIP extraction via `zlib`) and `tools/serve-pocketbase.mjs` (`pocketbase serve --publicDir ./dist --dir ./pb_data --hooksDir ./pb_hooks`). Differences from trackify: `--publicDir ./dist` (PSflix's vite outDir is the default `dist/`, not `build/dist/`).

- _Why not `npx pocketbase` or a Go install_: trackify's script is proven, dependency-free, cross-platform, and caches into `bin/`.

### D3: Base image pinned to `adrianmusante/pocketbase:0.40.4`

Current latest tag (2026-09-12). Prod's deployment runs `0.40` (floating minor) on the same line; `0.40.x` is well past the JSVM APIs the hook needs (`routerUse`, `$app.onServe().bindFunc`, `e.server.readTimeout`). Pinning exact stops the image's PB version from drifting away from the locally-downloaded one.

- _Alternative considered_: floating `latest` like trackify — rejected; the hook uses version-sensitive server APIs, so an unrelated base-image bump could break COI/timeout behavior at runtime.

### D4: CI runs `npm run build` only — no verify step

Unlike trackify, PSflix's emulator core (`public/pcsx_rearmed.{js,wasm}`) and audio worklet (`public/audio-worklet.js`, pre-bundled by `scripts/build-worklet.mjs`, committed) are static files — `npm run build` = `tsc --noEmit && vite build` alone. CI runs `npm ci` (lockfile exists) + `npm run build`.

`verify:build` stays a **local** check. The first CI run hung: npm@10's `npx` spawns the `serve` binary as a grandchild, verify's cleanup killed only the direct child, and the orphaned server kept the stdio pipes open — the step never exited and could not even be reaped by run cancellation. The script now spawns the server detached and kills the whole process group (plus an explicit final `process.exit()`), but CI keeps to plain `npm run build`: deterministic, nothing to reap.

### D5: Release workflow mirrors trackify's shape

`release.yml` on `push: tags: ['v*']` → build/verify → `docker/setup-buildx-action` → `docker/login-action` (Harbor) → `./publish.sh "${GITHUB_REF_NAME#v}"`. `publish.sh` keeps `set -e` + usage check + `docker buildx build --platform linux/amd64 -t harbor.alexklingenbeck.de/my/psflix:$VERSION . --push`. Secrets already exist on the repo.

### D6: Gitignore additions

`bin/` (downloaded binary) and `pb_data/` (local instance data, incl. generated `types.d.ts` from hook compilation) — both machine-local, never committed. `.env` is already ignored.

## Risks / Trade-offs

- [Dev COI mismatch: vite dev sends COEP `credentialless`, the hook sends `require-corp`] → Cross-origin API fetches from the dev server still work (PocketBase sends permissive CORS; `credentialless` allows CORS-mode fetches). The emulator runtime in `public/` is same-origin. No action; document only.
- [Fresh instance is an empty catalog] → Accepted per proposal. Local devs can restore a prod backup into `pb_data/` or upload content via `:8090/_/`.
- [Base image drift] → Exact pin `0.40.4`; bumping is a deliberate change (matches prod's minor line).
- [Image ships an empty `pb_data`? No —] base image defaults to `/pocketbase/pb_data`, created at runtime; persistence is the runtime's volume responsibility (k8s side keeps existing data volume + rclone sidecar).
- [`verify:build` boots a server via npx] → Local-only check; the server is spawned detached and killed as a process group with a forced final exit. CI deliberately runs `npm run build` only (D4).
- [Harbor project `my` must accept the new `psflix` repository] → Harbor creates repositories on first push; the robot account already pushes `trackify`/`pocketcloud` there.

## Migration Plan

1. Land tooling + Dockerfile + workflows + URL change in one change set.
2. First release: push `v0.x.y` → confirm image in Harbor → `docker run --rm -p 8090:8090 harbor.alexklingenbeck.de/my/psflix:0.x.y` → smoke-test `GET /` (SPA) and `GET /api/health`.
3. Cluster cutover (cloud repo, out of scope here): point the `psx` Deployment at the image, drop the `migrations`/`public`/`hooks` hostPath mounts; keep `data` + rclone.
4. Rollback: previous image tag re-push, or redeploy prior manifest — data volume is untouched by either.

## Open Questions

- None. (Cluster cutover mechanics live in the cloud.alexklingenbeck.de repo, deliberately out of scope.)
