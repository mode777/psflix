## 1. Repo integration groundwork

- [x] 1.1 Add `user-docs` to `ignorePatterns` in `.eslintrc.cjs`; verify `npm run lint` still passes from root (and would not enter `user-docs/` once it exists)
- [x] 1.2 Add `user-docs/.vitepress/dist/` and `user-docs/.vitepress/cache/` to `.gitignore`; verify with `git status` after a local build in section 2

## 2. VitePress project scaffold

- [x] 2.1 Scaffold `user-docs/` with its own `package.json` (pinned `vitepress`, `@fontsource/inter`), `npm install`, and scripts (`dev`, `build`); verify `npm run build` in `user-docs/` produces `.vitepress/dist/`
- [x] 2.2 Create `.vitepress/config.mts` with `base: '/psflix/docs/'` (single constant, env-overridable), dark-only (`appearance: 'dark'`), site title/description, local search provider, and sidebar/nav model matching the content outline; verify dev server serves the site at the `/psflix/docs/` base path
- [x] 2.3 Create a minimal `index.md` (home layout hero) plus one stub page per section so navigation resolves; verify no dead nav/sidebar links in the build output

## 3. Obsidian Console branding

- [x] 3.1 Add `.vitepress/theme/index.ts` extending `DefaultTheme` and import `custom.css`; verify custom styles load on every page
- [x] 3.2 Map Obsidian Console tokens onto VitePress CSS variables in `custom.css` (obsidian `#121414` bg, charcoal surfaces for sidebar/code blocks, `--vp-c-brand-1/2/3` from `#0072FF`, teal `#00F2FF` accents, Inter via `@fontsource/inter`, button/link radius per DESIGN.md); verify pages render dark with a light-mode OS preference and no light theme is reachable

## 4. Documentation content

- [x] 4.1 Write the Getting Started section (account creation, email/password and OAuth2 sign-in) and verify content against a running PSflix instance
- [x] 4.2 Write the Browsing section (catalog grid, details view, managing favorites) and verify all described UI elements exist as documented
- [x] 4.3 Write the Playing section (console view, controls, disc streaming, first-load caching behavior) and verify claims match `specs/emulator-integration/` behavior
- [x] 4.4 Write the Save States section (auto + slot1–3 slots, cloud sync, conflict resolution) and verify against the memory-manager/cloud-sync behavior
- [x] 4.5 Write the Memory Cards section (card library, mounting slots 1/2, renaming, cross-device sync on next boot) and verify against implemented behavior
- [x] 4.6 Write the Troubleshooting section (cross-origin isolation / SharedArrayBuffer browser requirements, how to check `crossOriginIsolated`, the known Chromium audio startup quirk, BIOS loading, first-load wait) and verify the documented symptoms reproduce or are citable from docs/emulator notes
- [x] 4.7 Write the FAQ and cross-link it from the hero page; verify all required sections from the spec are reachable from the docs home

## 5. Build & deploy pipeline

- [x] 5.1 Create `.github/workflows/docs.yml` with paths-filtered push (master) + pull_request triggers, Node 20 + npm cache keyed on `user-docs/package-lock.json`, build, `configure-pages`, artifact composition `_pages/docs/` from `dist/`, and `upload-pages-artifact`; verify the workflow YAML parses (`actionlint` or `gh workflow view`) and the build job succeeds locally-equivalent (`npm run build` in `user-docs/`)
- [x] 5.2 Add the `deploy-pages` deploy job gated to master pushes, with `pages: write` / `id-token: write` / `contents: read` permissions and a `pages` concurrency group; verify the workflow's job graph (deploy only on master, build-only on PRs)
- [x] 5.3 Enable GitHub Pages on the repo with "GitHub Actions" as build source (`gh api repos/mode777/psflix/pages -X POST -f build_type=workflow` or Settings → Pages) and verify the Pages settings report the Actions source

## 6. End-to-end verification

- [x] 6.1 Open a PR touching only `user-docs/**` and confirm the docs build check runs, passes, and deploys nothing
- [x] 6.2 After merge to master, confirm the site deploys and `https://mode777.github.io/psflix/docs/` renders branded dark with correct assets; spot-check a deep link loads directly, search returns results, and `https://mode777.github.io/psflix/` root remains unclaimed by the docs
- [x] 6.3 Confirm application quality gates are untouched: `npm run lint`, `npm run typecheck`, `npm run test` all pass from root on a machine that never installed `user-docs/` dependencies
