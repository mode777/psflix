# Stage 0 — Repo hygiene

Set up the boring stuff first so nothing else leaks into the repo: ignores, a README that explains the project, and a check that `pb_schema.json` is committed.

## Goal

A fresh clone of the repo tells any agent (human or AI) what the project is, how to run it, and where the source of truth lives.

## Files to create

### `.gitignore` (root)

Standard Node + Vite + OS junk. Include at minimum:

```
node_modules
dist
dist-ssr
*.local
.env
.env.*
!.env.example

# editor / OS
.DS_Store
.vscode/*
!.vscode/extensions.json
.idea

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# test artifacts
coverage
playwright-report
test-results
.playwright
```

### `README.md` (root)

A short, scannable README. Not a tutorial. Sections:

- **What is PSflix?** — one paragraph, Netflix-style catalog for PS1 games, React + PocketBase.
- **Live instance** — `https://psx.alexklingenbeck.de`.
- **Repo layout** — copy the layout and "what is where" from `AGENTS.md` (don't duplicate — link to it).
- **References** — link to `psflix_design/design/DESIGN.md`, `pocketbase-docs/`, and `pb_schema.json`.
- **Build specs** — link to `specs/README.md`.
- **Local dev (forward-looking)** — placeholder section: _"Implemented in Stage 1 (`specs/01-scaffold.md`). Until then, `npm install && npm run dev` is not yet available."_
- **Deployment** — one line: _"Handled by an external Flux Kubernetes cluster. Out of scope for this repo."_

Keep the README under ~60 lines. If it grows, push detail into `specs/`.

### `.env.example` (root)

```
# PocketBase instance URL. Defaults to https://psx.alexklingenbeck.de when unset.
VITE_PB_URL=

# Optional: a superuser token for one-off scripts. Never commit a real value.
# PB_SUPERUSER_TOKEN=
```

`.env` itself is gitignored. The actual file is created by humans/agents locally when they need it.

## Files to verify

- `pb_schema.json` exists at root and is checked in (do not edit it; it is the source of truth from the PocketBase instance).
- `AGENTS.md` exists at root and contains the Deployment section (added in the planning phase).

## Acceptance criteria

- [ ] `.gitignore` committed; running `git status` on a fresh clone shows no node_modules / dist.
- [ ] `README.md` committed, links to AGENTS.md and specs/README.md.
- [ ] `.env.example` committed; `.env` is gitignored.
- [ ] `git status` is clean for the working tree after this stage.

## Manual verification

1. In a fresh terminal: `git clone <repo> /tmp/psflix-verify && cd /tmp/psflix-verify`.
2. `git status` is clean.
3. `cat README.md` makes the project purpose clear in under 60 seconds.
4. `cat AGENTS.md` describes the design system, backend, and deployment model.
5. `cat specs/README.md` lists the 10 stages in order.

## Out of scope

- Any `package.json` or source code — that's Stage 1.
- Any toolchain lock-in — Stage 1 chooses Vite + React + Tailwind v3.
