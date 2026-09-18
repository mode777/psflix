## Context

PSflix is a React SPA + PocketBase app deployed as a Docker image to a k8s cluster; GitHub Actions exist for CI (`ci.yml`) and releases (`release.yml`), but the repo has no GitHub Pages usage yet. `docs/` holds internal reference material (emulator architecture, PocketBase mirror) that must not be published. The repo root is Node 20 / Vite with ESLint scoped to `.ts,.tsx`, Prettier already formatting `*.md`, and `tsconfig.json` including only `src/`. GitHub Pages for `mode777/psflix` resolves to `https://mode777.github.io/psflix/`, and a marketing landing page will later share that single Pages site (out of scope here).

## Goals / Non-Goals

**Goals:**

- A branded, searchable user-docs site generated from Markdown, deployable with zero manual steps after merge to `master`.
- URL stability: docs permanently under `/docs/` so the future landing page can take the site root without breaking links.
- Total isolation from the app toolchain: root `npm ci`, build, typecheck, and lint behave exactly as before.
- Repo-side composition seam (`_pages/docs/` inside the Pages artifact) ready for the landing-page change to drop files at the artifact root.

**Non-Goals:**

- The flashy landing page itself (separate change; this change only reserves the layout for it).
- Publishing internal docs (`docs/emulator/`, `pocketbase-docs/`) or contributor documentation.
- Docs versioning, i18n / translations, MDX-style interactive embeds, comment system, analytics.
- A custom domain for Pages (config accommodates it later; no CNAME work in this change).

## Decisions

### D1: VitePress as the generator (over Docusaurus, Starlight, MkDocs Material)

VitePress is the lightest option in the existing Node/Vite toolchain: near-zero config, built-in client-side local search, first-class dark-mode and theming hooks, fast builds. Docusaurus matches the team's React skills and adds versioning/i18n we do not need, at 5–10x the dependency weight. Starlight would introduce a new framework (Astro). MkDocs Material adds a Python runtime to a JS repo. Content is plain Markdown either way, so the choice is cheap to revisit before content grows large — but not after, since theme/config/layout conventions accrue.

### D2: Self-contained `user-docs/` project, not `docs/`

`user-docs/` holds its own `package.json` + lockfile; the docs workflow installs only there. This keeps root `npm ci` lean (VitePress would otherwise bloat every app install), avoids `docs/` (reserved for internal reference material), and gives the site its own dependency lifecycle. Conventional VitePress layout inside: `.vitepress/config.mts`, `.vitepress/theme/{index.ts,custom.css}`, Markdown at the project root.

### D3: URL topology — base `/psflix/docs/`, artifact composed under `docs/` prefix

GH Pages serves one site per repo at `https://mode777.github.io/psflix/`. Decision: docs claim only `<pages>/docs/` from day one.

Subtlety worth recording: VitePress `base: '/psflix/docs/'` makes emitted _links_ root-correct but still writes `index.html` at the _root_ of `dist/`. Since Pages serves the artifact root at `.../psflix/`, the workflow composes the artifact as `_pages/docs/` (contents of `dist/`) before `upload-pages-artifact`. Consequences: (a) deep links like `/psflix/docs/playing/` resolve from a cold load; (b) the artifact root stays free for the landing-page change, which will place its files at `_pages/` root — the two changes coordinate purely through this directory layout, no rework; (c) GitHub Actions is the **only** allowed Pages deployer, so the landing change must eventually fold into (or compose with) this workflow — flagged as a risk below.

`cleanUrls` stays off (default `.html`-style links) — GH Pages has no rewrite layer, and default VitePress links work statically out of the box.

Base path lives in a single config constant (env-overridable via `BASE_URL`-style build input) so a future custom domain (`base: '/'`, docs still at `/docs/`) is a one-line change.

### D4: Deployment pipeline — modern Pages actions, PR validation in the same workflow

`docs.yml`:

- Triggers: `push` to `master` with `paths: ['user-docs/**', '.github/workflows/docs.yml']`; `pull_request` with the same paths.
- Build job: checkout → `setup-node@v4` (Node 20, `cache: npm`, `cache-dependency-path: user-docs/package-lock.json`) → `npm ci` in `user-docs/` → `vitepress build` → `configure-pages@v5` → compose `_pages/docs/` → `upload-pages-artifact@v3`.
- Deploy job: `deploy-pages@v4`, gated to `master` pushes (PRs get build-only validation).
- Permissions `pages: write`, `id-token: write`, `contents: read`; concurrency group `pages` with cancel-in-progress.

One-time enablement: repo Pages source must be set to "GitHub Actions" (Settings → Pages, or `gh api repos/mode777/psflix/pages -X POST -f build_type=workflow`). This is a task, not automation.

### D5: Branding via default-theme extension, dark-only

No theme fork: `.vitepress/theme/index.ts` extends `DefaultTheme` and imports `custom.css`, which maps Obsidian Console tokens onto VitePress' CSS variable surface (`--vp-c-bg` → `#121414`, `--vp-c-brand-1/2/3` → `#0072FF` ramp, teal `#00F2FF` for accents/active states, Inter via `@fontsource/inter` dependency, charcoal tier surfaces for sidebar/code blocks). Exact container values are ported from `psflix_design/design/DESIGN.md` during implementation. `appearance: 'dark'` locks dark mode — the Obsidian aesthetic is dark-first, and it halves the theming surface (no light-variant tokens to derive and maintain).

The site home (`index.md`) uses VitePress' `layout: home` hero — a modest branded entry page listing the doc sections. It is deliberately not the flashy landing page; it lives under `/docs/` and makes no claim on the site root.

### D6: Toolchain integration touches

- ESLint: add `user-docs` to `ignorePatterns` in `.eslintrc.cjs` — otherwise root `eslint . --ext .ts,.tsx` crawls `.vitepress/**` and fails on unresolvable `vitepress` imports (mirrors existing `bin`, `pb_data` ignores).
- `.gitignore`: add `user-docs/.vitepress/dist/` and `user-docs/.vitepress/cache/`.
- Root `tsconfig.json` needs no change (includes `src/` only). Prettier's lint-staged `*.{css,md}` rule already covers docs Markdown — no change.

## Risks / Trade-offs

- [Only one workflow may deploy Pages; the landing-page change will need the same channel] → The `_pages/docs/` layout is the contract; when the landing change arrives it either composes both builds into one artifact deployment or absorbs this workflow. Documented here so it is a planned seam, not a surprise.
- [Base-path churn if a custom domain lands] → Single overridable config constant; `/docs/` path prefix survives a domain change, only the repo-name prefix drops.
- [VitePress theming surface is CSS-variable-driven; exotic brand fidelity (exact charcoal tiers, custom radii) may need small overrides beyond variables] → Scope branding to tokens + minor component-level CSS overrides; accept default structural styling. Flashy belongs to the landing page, not the docs.
- [Search index is client-side and ships with the bundle] → Content volume is small; local search is fine. Revisit (Pagefind/Algolia) only if the docs grow past ~100 pages.
- [Docs drift from app behavior] → Troubleshooting content explicitly references environment constraints (cross-origin isolation, Chromium audio quirk) that are stable; feature pages reviewed as part of any app-feature change touching them. No docs-tests automation in this change.
- [VitePress minor releases can tweak default-theme variables] → Pin the exact dependency version in `user-docs/package.json`; upgrades are explicit.

## Migration Plan

1. Enable Pages with "GitHub Actions" source (one-time, before first merge).
2. Merge the change: `user-docs/`, workflow, config touches land together.
3. First push to `master` deploys automatically; verify `https://mode777.github.io/psflix/docs/` renders branded, deep links and search work.
4. Rollback: disable/remove the workflow — Pages keeps serving the last deployed artifact; deleting the `user-docs/` tree and workflow fully reverts the repo.

## Open Questions

- None blocking. Custom-domain timing remains open by design (D3 accommodates it).
