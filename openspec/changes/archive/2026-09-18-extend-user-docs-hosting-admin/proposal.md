## Why

PSflix is now an open-source repo, but (1) its privately hosted instance URL (the private instance hostname) still appears in ~20 files — it is no one's public concern and must go; (2) the docs say nothing about running your own instance or administering the catalog; and (3) the projects PSflix is built on (pcsx-rearmed, PocketBase) receive no credit.

## What Changes

- Remove every reference to the privately hosted instance URL from the repository and the user docs; docs switch to neutral "your instance / your operator" phrasing, internal reference docs and archives use an RFC 2606 example domain.
- Remove the "Open PSflix" external nav link from the docs site.
- Add a **Self-Hosting** docs group with two chapters:
  - **Hosting & Running**: PSflix as a single PocketBase app (API + SPA + hooks + migrations); Docker image as the recommended variant (noting it is not yet publicly published; build from the repo Dockerfile); bare-binary variant; configuration (port, `pb_data` persistence, superuser, TLS via reverse proxy); running locally with the PocketBase executable, `pb_hooks/` and `pb_migrations/`; links to the official PocketBase docs (admin UI especially).
  - **Administration**: superuser admin UI (`/admin.html`); adding games via the upload flow — **strictly CHD images only** — with in-browser identification, metadata/artwork enrichment and review; creating CHDs with `chdman` (cue+bin → chd) including links to MAME docs/downloads and the libretro CHD guide, plus a note on web-based converters with a copyright caution; adding manuals/strategy guides (PDF → assign game + type); catalog housekeeping through the PocketBase admin UI (records, BIOS upload, users, backups).
- Credit the underlying projects: pcsx-rearmed (WASM emulator core, with GitHub link) and PocketBase, in the hosting overview, FAQ, and docs footer.
- Repo hygiene: remove the tracked-but-archived duplicate `openspec/changes/docker-release-pipeline/` (identical to its archive copy; deletions were silently dropped during an earlier commit).

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `user-docs-site`: Three requirement-level changes — (1) new requirement: documentation covers self-hosting (PocketBase-based variants incl. Docker + local) and administration (CHD-only game upload, chdman CHD creation, manuals, PocketBase admin UI); (2) new requirement: documentation and docs navigation make no reference to the privately hosted instance; (3) new requirement: documentation credits pcsx-rearmed and PocketBase.

The non-docs scrub (README, AGENTS.md, `.env.example`, `docs/emulator/`, `archive/`, openspec artifacts) changes no system behavior and carries no spec delta — it is tracked in tasks.

## Impact

- **Docs**: `user-docs/` (2 pages edited, 2 pages added, sidebar/hero/footer/FAQ updates), removed external nav link.
- **Repo content**: `README.md`, `AGENTS.md`, `.env.example`, `docs/emulator/*`, `archive/specs/*`, openspec artifacts — URL scrubbed or rephrased.
- **Deleted**: `openspec/changes/docker-release-pipeline/` (archived duplicate).
- **Untouched**: `src/`, backend, CI/release workflows, `playwright.config.ts` (already env-clean, no instance URL).
- **Known limitation**: git **history** still contains the URL; scrubbing it requires another `filter-repo --replace-text` pass + force-push — offered as a follow-up decision, not part of this change.
