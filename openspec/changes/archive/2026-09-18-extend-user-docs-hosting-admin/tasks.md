## 1. Private URL scrub

- [x] 1.1 Rephrase `user-docs/getting-started/index.md` (drop instance link, add "privately hosted / your operator" note) and `user-docs/troubleshooting/index.md` (neutral phrasing); verify a repo search for the private hostname finds nothing under `user-docs/`
- [x] 1.2 Remove the "Open PSflix" external nav link from `user-docs/.vitepress/config.mts`; verify docs build passes
- [x] 1.3 Scrub `README.md` (drop live-instance line, fix stale dev-server phrasing), `AGENTS.md` (instance URL line), `.env.example` (stale default comment); verify a repo search for the private hostname finds no matches in these files
- [x] 1.4 Swap hostname to `pb.example.com` in `docs/emulator/`, `archive/specs/`, and openspec artifacts (mechanical sed); verify a repo search for the private hostname finds nothing outside `.git/`
- [x] 1.5 `git rm` the archived duplicate `openspec/changes/docker-release-pipeline/` and confirm the archive copy remains

## 2. Self-hosting docs

- [x] 2.1 Write `user-docs/hosting/index.md`: PocketBase-as-whole-app overview (API + SPA + hooks + migrations), Docker variant (recommended; not yet publicly published — build from repo Dockerfile, run with `pb_data` volume), bare-binary variant, configuration (superuser, port/TLS reverse proxy, backups), links to official PocketBase docs
- [x] 2.2 Document local running in the same page: prerequisites, `npm install`, `pocketbase:download`, `npm run build`, `pocketbase:serve` at 127.0.0.1:8090 with hooks + migrations, frontend dev server, first-run checklist (superuser, BIOS, empty catalog note); verify every command against the repo's actual scripts and Dockerfile
- [x] 2.3 Write `user-docs/admin/index.md`: superuser login at `/admin.html`, PocketBase admin UI reference links, CHD-only game upload flow (dropzone → identify → enrich → review), chdman CHD creation with links (MAME docs/releases, libretro guide) and web-converter caution, manuals/guides upload with game + type assignment, catalog housekeeping (records, BIOS upload, users, backups)

## 3. Navigation and attribution

- [x] 3.1 Add the "Self-Hosting" sidebar group (Hosting & Running, Administration) to `config.mts`; verify build resolves the new pages without dead links
- [x] 3.2 Add self-hosting feature card to the hero, a "What emulator does PSflix use?" FAQ entry crediting pcsx-rearmed (with upstream link), and extend the docs footer credit (pcsx-rearmed · PocketBase); verify credits render and links resolve

## 4. Verification

- [x] 4.1 `npm run build` in `user-docs/` passes with zero dead links; spot-check rendered hosting/admin pages locally
- [x] 4.2 A repo-wide search for the private hostname (excluding `.git/`) returns zero matches; root `npm run lint` and `npm run typecheck` still pass
