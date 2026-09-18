# Proposal

## Why

PSflix currently has PocketBase migrations and hooks but no way to run the full stack locally, and no release artifact: the k8s cluster hostPath-mounts a hand-copied `dist/`, `pb_migrations/`, and `pb_hooks/` onto the node. We want a repeatable, CI-driven pipeline — the same pattern trackify uses — where a pushed `v*` git tag produces a self-contained Docker image (PocketBase + SPA + migrations + hooks) in Harbor, which Flux runs. The cross-origin-isolation reverse proxy on the k8s side has been removed; PocketBase itself now sets the COI headers via `pb_hooks/main.pb.js`, which makes a single self-sufficient image possible.

## What Changes

- Add local PocketBase tooling (ported from trackify): `pocketbase:download` (fetches the upstream binary to gitignored `bin/`) and `pocketbase:serve` (serves `dist/` + applies `pb_migrations/` + loads `pb_hooks/` into gitignored `pb_data/`), so `npm run dev` + `npm run pocketbase:serve` is a complete local stack.
- Change the SPA backend URL default (in `src/lib/pb.ts` and `src/admin/lib/pb.ts`): production builds fall back to same-origin (`window.location.origin`), dev falls back to `http://127.0.0.1:8090`; an explicit `VITE_PB_URL` always wins. **BREAKING** for anyone relying on the previous hardcoded `https://psx.alexklingenbeck.de` fallback in a production build — that fallback moves to dev only.
- Add a minimal `Dockerfile` (`FROM adrianmusante/pocketbase:0.40.4`, pinned): `dist/` → `/pocketbase/public/`, `pb_migrations/` → `/pocketbase/migrations/`, `pb_hooks/` → `/pocketbase/hooks/`. The base image entrypoint runs `pocketbase serve` and applies migrations on startup.
- Add `publish.sh` (`docker buildx build --platform linux/amd64 --push` to `harbor.alexklingenbeck.de/my/psflix:<version>`).
- Add GitHub Actions: `ci.yml` (checkout, Node 20, `npm ci`, `npm run build`) on push/PR; `release.yml` (same build steps + buildx + Harbor login via `HARBOR_USERNAME`/`HARBOR_PASSWORD` secrets + `./publish.sh "${GITHUB_REF_NAME#v}"`) on `v*` tags. No emsdk/ninja needed (the wasm core is prebuilt static).
- Extend `.gitignore` with `bin/` and `pb_data/`.
- Update docs (AGENTS.md, README.md) — already done in this session — describing the image-based deploy and the hook-provided COI headers.

## Capabilities

### New Capabilities

- `release-pipeline`: how PSflix is built, run locally against a local PocketBase, packaged into a Docker image, and published to Harbor on version tags — including where the SPA resolves its backend URL in each context.

### Modified Capabilities

<!-- None: no existing spec's requirements change. The emulator/admin specs
     are unaffected; the URL fallback change is specified under release-pipeline. -->

## Impact

- **New files**: `Dockerfile`, `publish.sh`, `tools/download-pocketbase.mjs`, `tools/serve-pocketbase.mjs`, `.github/workflows/{ci,release}.yml`.
- **Modified**: `package.json` (two scripts), `.gitignore`, `src/lib/pb.ts`, `src/admin/lib/pb.ts`.
- **Runtime deps**: none added (download script uses Node built-ins only); PocketBase binary is downloaded at dev time, not an npm dep.
- **GitHub repo**: `HARBOR_USERNAME` / `HARBOR_PASSWORD` actions secrets (the `robot$docker` Harbor robot account) — already set on `mode777/psflix`.
- **Cluster (out of repo)**: the `psx` Deployment switches to `image: harbor.alexklingenbeck.de/my/psflix:<tag>`, dropping the three hostPath mounts; data volume + rclone sidecar unchanged.
- **Fresh instances**: migrations create schema only — no games/discs/BIOS content. Accepted; content arrives via admin UI upload or backup restore.
