## Why

PSflix has no user-facing documentation. Players need guidance for features that are not self-explanatory (cloud save-state sync, memory-card library, disc streaming) and for environment constraints they will genuinely hit (cross-origin isolation / SharedArrayBuffer browser requirements, the known Chromium audio startup quirk). A maintained Markdown docs site also gives the project a public home on GitHub Pages, where the planned landing page will later live.

## What Changes

- Add a self-contained VitePress site project under `user-docs/` with its own `package.json`, so root app dependencies and quality gates are untouched.
- Write user documentation in Markdown (English): getting started, browsing, playing, save states, memory cards, troubleshooting, FAQ.
- Theme the site with Obsidian Console brand tokens (obsidian `#121414` background, PS blue `#0072FF` primary, teal `#00F2FF` accent, Inter), dark-only.
- Add a GitHub Actions workflow (`docs.yml`) that builds the site on PRs (validation) and deploys it to GitHub Pages on pushes to `master` (paths-filtered).
- Serve docs under `/psflix/docs/` from day one and compose the Pages artifact with the site rooted at `docs/`, so the future landing page can own `/` without URL churn.
- Adjust repo tooling config: ESLint ignores `user-docs/`, `.gitignore` gains VitePress output/cache paths. No application code changes.

## Capabilities

### New Capabilities

- `user-docs-site`: Covers the user documentation site end to end — Markdown source layout under `user-docs/`, VitePress generation with Obsidian branding, the required documentation content set, CI build validation, and GitHub Pages deployment at the `/psflix/docs/` path with landing-page coexistence.

### Modified Capabilities

<!-- None: the existing release-pipeline (Docker/Harbor), admin, and emulator specs are unaffected; docs deployment is a new, independent pipeline. -->

## Impact

- **New**: `user-docs/` (VitePress project + content), `.github/workflows/docs.yml`.
- **Modified config only**: `.eslintrc.cjs` (ignore `user-docs/`), `.gitignore` (`user-docs/.vitepress/dist`, `user-docs/.vitepress/cache`).
- **Untouched**: `src/`, PocketBase schema/hooks/migrations, existing CI (`ci.yml`) and release (`release.yml`) workflows.
- **External**: GitHub Pages must be enabled once on the repo with "GitHub Actions" as the build source; site is served from `https://mode777.github.io/psflix/docs/`.
