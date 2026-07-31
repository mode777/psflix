# PSflix — Build Specs (archived)

> **Archived.** All 10 stages (0–9) shipped; see [`../../AGENTS.md`](../../AGENTS.md) and [`../../README.md`](../../README.md) for the current state of the project. This directory is kept for historical reference only — do not start new work from these specs.

One spec per stage. Implement them in order. Each spec is self-contained: pick it up, read it, execute it, mark it done. Cross-stage conventions live in `AGENTS.md`; do not duplicate them here.

## Stages

| #   | Stage                                   | Spec                                                   | Status |
| --- | --------------------------------------- | ------------------------------------------------------ | ------ |
| 0   | Repo hygiene                            | [`00-repo-hygiene.md`](00-repo-hygiene.md)             | done   |
| 1   | Vite + React + Tailwind v3 scaffold     | [`01-scaffold.md`](01-scaffold.md)                     | done   |
| 2   | PocketBase client + generated types     | [`02-pocketbase-client.md`](02-pocketbase-client.md)   | done   |
| 3   | Routing shell + persistent header       | [`03-routing-and-header.md`](03-routing-and-header.md) | done   |
| 4   | Browse view                             | [`04-browse-view.md`](04-browse-view.md)               | done   |
| 5   | Details view                            | [`05-details-view.md`](05-details-view.md)             | done   |
| 6   | Auth (email/password)                   | [`06-auth.md`](06-auth.md)                             | done   |
| 7   | Polish                                  | [`07-polish.md`](07-polish.md)                         | done   |
| 8   | Quality gates (lint/typecheck/test/e2e) | [`08-quality-gates.md`](08-quality-gates.md)           | done   |
| 9   | Build handoff to Flux                   | [`09-build-handoff.md`](09-build-handoff.md)           | done   |

## Execution order

Strict: 0 → 1 → 2 → 3 → (4 ∥ 5) → 6 → 7 → 8 → 9.

Stages 4 and 5 can overlap once Stage 3 lands. Stage 7 (polish) is a sweep after 4–6, not parallel.

## Done definition (per stage)

A stage is "done" when:

1. Every checkbox in its spec is checked.
2. `npm run lint && npm run typecheck && npm run test` all pass (from Stage 8 onward).
3. The stage's "Manual verification" section has been completed and signed off by the user.
4. The Status row above is updated from `todo` → `done`.

## When `pb_schema.json` changes

Re-run `npm run typegen` and re-review Stage 2 + any spec that referenced specific field names (especially 4 and 5).
