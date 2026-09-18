# Tasks

## 1. Local PocketBase tooling

- [x] 1.1 Port `tools/download-pocketbase.mjs` from trackify (pure-Node GitHub-release ZIP extraction into `bin/`); verify `npm run pocketbase:download` produces an executable binary on this platform
- [x] 1.2 Port `tools/serve-pocketbase.mjs` with `--publicDir ./dist --dir ./pb_data --hooksDir ./pb_hooks`; verify migrations apply and `pb_hooks/main.pb.js` loads on startup
- [x] 1.3 Add `pocketbase:download` and `pocketbase:serve` scripts to `package.json`; verify both run via `npm run`
- [x] 1.4 Add `bin/` and `pb_data/` to `.gitignore`; verify `git status` stays clean after a local serve run

## 2. Backend URL resolution

- [x] 2.1 Update `src/lib/pb.ts` and `src/admin/lib/pb.ts` to resolve: `VITE_PB_URL` → else prod `window.location.origin` → else dev `http://127.0.0.1:8090`; remove the hardcoded prod-hostname fallback; verify with `npm run typecheck` and `npm test`
- [x] 2.2 Confirm built bundle contains no absolute deploy origin: run `npm run build` + `npm run verify:build` and note the existing "contains no absolute origins" check passes

## 3. Docker packaging

- [x] 3.1 Create `Dockerfile`: `FROM adrianmusante/pocketbase:0.40.4`, `COPY dist/. /pocketbase/public/`, `COPY pb_migrations/. /pocketbase/migrations/`, `COPY pb_hooks/. /pocketbase/hooks/`; verify image builds after `npm run build`
- [x] 3.2 Create `publish.sh` (`set -e`, usage check, `docker buildx build --platform linux/amd64 -t harbor.alexklingenbeck.de/my/psflix:$VERSION . --push`), executable bit set; verify local `docker build -t psflix:test .` succeeds and serves the SPA + `/api/health` on :8090 (push step exercised only in CI)

## 4. GitHub Actions

- [x] 4.1 Create `.github/workflows/ci.yml` (checkout, Node 20 + npm cache, `npm ci`, `npm run build` — verify:build stays local; npm@10 npx/serve orphan hangs CI) on push to main + PRs; verify workflow syntax with `npx yaml-lint` or actionlint if available, otherwise review manually
- [x] 4.2 Create `.github/workflows/release.yml` (same build-only steps + `docker/setup-buildx-action@v3`, `docker/login-action@v3` against `harbor.alexklingenbeck.de` with `HARBOR_USERNAME`/`HARBOR_PASSWORD`, then `./publish.sh "${GITHUB_REF_NAME#v}"`) on `push: tags: ['v*']` with `permissions: contents: read`
- [x] 4.3 Confirm secrets exist on the repo: `gh secret list -R mode777/psflix` shows `HARBOR_USERNAME` and `HARBOR_PASSWORD`

## 5. End-to-end verification

- [x] 5.1 Local stack smoke test: `npm run build`, `npm run pocketbase:serve`, then `curl /` returns the SPA, `curl /api/health` returns 200, and response headers include COOP/COEP/CORP
- [x] 5.2 Release dry run on a real tag: push a `v*` tag, confirm the workflow publishes `harbor.alexklingenbeck.de/my/psflix:<version>` (first tag is the cutover validation; requires the image repo to auto-create in Harbor)
- [x] 5.3 Pull the published image, run with `-p 8090:8090` against a scratch volume, and verify: SPA loads at `/`, migrations applied (collections listed in `/_/`), COI headers present on `/`
