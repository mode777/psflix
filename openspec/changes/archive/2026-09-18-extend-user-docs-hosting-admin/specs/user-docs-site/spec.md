## ADDED Requirements

### Requirement: Documentation covers self-hosting and administration

The documentation SHALL include a self-hosting group with two chapters. The hosting chapter SHALL present PSflix as a single PocketBase application (API, static SPA, hooks, migrations), SHALL recommend the Docker image variant while stating it is not yet publicly published (buildable from the repo's Dockerfile), SHALL describe at least one non-Docker variant, SHALL explain configuration (data persistence, superuser creation, port/TLS via reverse proxy), and SHALL explain running locally with the PocketBase executable loading `pb_hooks/` and `pb_migrations/`. The administration chapter SHALL explain superuser access via the admin UI, the game upload flow with its CHD-only acceptance, how to create CHD images with `chdman` (including authoritative reference links), and how to add manuals and strategy guides. Both chapters SHALL reference the official PocketBase documentation.

#### Scenario: Operator can stand up an instance

- **WHEN** an operator follows the hosting chapter from a fresh clone
- **THEN** they can run the application either via a container built from the repo or via the local PocketBase stack, reach the app, and create the superuser account

#### Scenario: Operator can add a game from a disc image

- **WHEN** an operator follows the administration chapter to add a game
- **THEN** the docs explain that only CHD images are accepted, show how to produce a CHD from a cue/bin pair with `chdman`, and walk through the upload flow's identification, enrichment, and review steps

#### Scenario: Operator can add a manual

- **WHEN** an operator follows the administration chapter to add a PDF document
- **THEN** the docs explain assigning it to a game with type manual or strategy guide, and the document appears on that game's detail page

### Requirement: No references to the privately hosted instance

The documentation and its navigation SHALL NOT reference the privately hosted PSflix instance (its hostname must not appear anywhere under `user-docs/`); user-facing content SHALL use neutral phrasing ("your instance", "your operator"). The repository's other content (README, contributor docs, env example, internal reference docs, archives) SHALL NOT contain the hostname either, using an example domain where a concrete host is needed.

#### Scenario: Docs make no assumption about where PSflix runs

- **WHEN** a reader follows the Getting Started and Troubleshooting chapters
- **THEN** every instruction works against any PSflix instance URL and no specific hostname is mentioned

#### Scenario: Repository scan is clean

- **WHEN** the tracked repository content is searched for the private hostname
- **THEN** no match is found

### Requirement: Documentation credits the underlying projects

The documentation SHALL credit the projects PSflix is built on: the pcsx-rearmed emulator core (compiled to WebAssembly, linked to its upstream repository) and PocketBase. The credit SHALL be visible from the site (FAQ and hosting overview, plus the docs footer).

#### Scenario: Reader can discover what powers the emulator

- **WHEN** a reader opens the FAQ or the hosting chapter
- **THEN** they find pcsx-rearmed credited with a link to the upstream project
