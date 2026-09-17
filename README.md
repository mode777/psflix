# PSflix

A Netflix-style catalog for PlayStation 1 games. Browse a curated grid of titles, open a details view with cover, screenshots, and disc metadata. React frontend, PocketBase backend.

**Live instance:** https://psx.alexklingenbeck.de

## Repo layout

See [`AGENTS.md`](AGENTS.md) for the full breakdown of `psflix_design/`, `pocketbase-docs/`, `pb_schema.json`, and the conventions to follow when working on this repo.

## References

- Design system: [`psflix_design/design/DESIGN.md`](psflix_design/design/DESIGN.md)
- PocketBase docs mirror: [`pocketbase-docs/`](pocketbase-docs/)
- Backend schema (source of truth): [`pb_schema.json`](pb_schema.json)

## Build specs

The original 10-stage build plan is archived at [`archive/specs/README.md`](archive/specs/README.md). All stages are done; new work happens directly against the source tree.

## Local dev

Implemented in Stage 1 ([`specs/01-scaffold.md`](specs/01-scaffold.md)). `npm install && npm run dev` brings up the SPA against the live PocketBase instance.

## Quality gates

The repo runs four checks per PR — these are the green-light gates configured in Stage 8 ([`specs/08-quality-gates.md`](specs/08-quality-gates.md)):

| Command             | What it does                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint + Prettier (check only)                                                           |
| `npm run typecheck` | `tsc --noEmit`                                                                           |
| `npm run test`      | Vitest unit + component tests                                                            |
| `npm run test:cov`  | Vitest with coverage report (target: ≥ 70% on `src/features/**` and `src/components/**`) |
| `npm run test:e2e`  | Playwright e2e (Chromium + iPhone 13) against the live PB instance                       |

The same four scripts are run by CI on every push and PR.

A pre-commit hook (Husky + lint-staged) runs ESLint and Prettier on staged files. Install it locally with `npm install` (it runs `husky` via the `prepare` script).

## Build

Produce the static artifact that ships inside the Docker image:

    npm run build       # outputs dist/
    npm run verify:build  # boots dist/ via a local server and curls it

## Deployment

Pushing a `v*` git tag builds the SPA, builds a Docker image (PocketBase + `dist/` + `pb_migrations/` + `pb_hooks/`) and pushes it to `harbor.alexklingenbeck.de/my/psflix:<version>`. The Flux cluster runs the image. See AGENTS.md.
