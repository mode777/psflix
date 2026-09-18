## Context

The repo went public while ~20 tracked files still reference the privately hosted instance (the private instance hostname): user docs (2 pages + docs nav), repo-facing docs (README, AGENTS.md, `.env.example`), internal emulator reference docs, build archives, and openspec artifacts. The new self-hosting/admin chapters need accurate grounding in the release pipeline (Dockerfile, `pb_hooks`, `pb_migrations`, `npm run pocketbase:download`/`pocketbase:serve`) and the admin SPA (`src/admin`: upload, documents, dashboard). The emulator core is vendored pcsx-rearmed served as `pcsx_rearmed.{js,wasm}`. `playwright.config.ts` is already clean (localhost dev server). Git history still contains the hostname everywhere.

## Goals / Non-Goals

**Goals:**

- Zero occurrences of the private hostname in tracked content, with docs that read naturally against _any_ instance.
- Operator-grade hosting and admin chapters grounded in how the repo actually builds and runs.
- Proper attribution for pcsx-rearmed and PocketBase.

**Non-Goals:**

- Rewriting git history (separate follow-up decision; would re-force-push and re-trigger release).
- Publishing the Docker image publicly.
- Documenting the admin dashboard's storage stats in depth.

## Decisions

### D1: Neutral phrasing vs. example domain

User docs get prose ("your instance", "your operator") — readers there have a URL already or get one from the operator. Internal reference docs, build archives, and openspec artifacts get a mechanical swap to `pb.example.com` (RFC 2606) so nginx/curl examples stay coherent without editorializing historical text. README loses its "Live instance" line entirely.

### D2: chdman as the canonical CHD path

The app's upload flow accepts CHD only (in-browser serial identification expects it), so the admin chapter teaches `chdman createcd -i Game.cue -o Game.chd` (cue + bin pair), `chdman verify`, and links only to authoritative, stable resources: MAME's official tools docs, mamedev.org releases, and the libretro CHD guide. Web-based chdman frontends are mentioned generically (no fabricated URLs) with an explicit caution not to upload copyrighted discs to third-party sites.

### D3: Attribution placement

pcsx-rearmed (linked to `github.com/libretro/pcsx_rearmed`) and PocketBase (linked to `pocketbase.io`) are credited where they are technically relevant — hosting overview ("PSflix is a single PocketBase app running pcsx-rearmed compiled to WebAssembly"), a FAQ entry ("What emulator does PSflix use?"), and the docs footer.

### D4: Stray openspec directory

`openspec/changes/docker-release-pipeline/` is byte-identical to its archive copy (`openspec/changes/archive/2026-09-17-docker-release-pipeline/`); the deletion was silently dropped by a lint-staged stash round-trip during the previous commit. `git rm` it here.

## Risks / Trade-offs

- [Example-domain swap in archives alters historical text] → Mechanical, meaning-preserving, and preferable to leaving a private hostname in a public repo.
- [Docs claim Docker is "recommended" while the image is unpublished] → Chapter states this explicitly and shows `docker build` from the repo Dockerfile as the path today.
- [Future content could reintroduce the hostname] → Spec requirement + `rg` scan step in tasks; cheap to re-check in review.

## Open Questions

- Whether to also scrub git history (filter-repo `--replace-text`) — deliberately deferred; needs user decision because it re-forces master and re-runs the release pipeline.
