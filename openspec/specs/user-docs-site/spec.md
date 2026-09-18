## Purpose

Provides a maintained, publicly hosted documentation site for PSflix end users, authored as Markdown in the repository and published automatically to GitHub Pages so players can learn the product's features and resolve environment issues without filing support questions.

## Requirements

### Requirement: Documentation is authored as Markdown in the repository

User documentation SHALL be authored as Markdown source files inside a dedicated `user-docs/` directory that carries its own package manifest, independent of the application's dependency tree. Contributing a documentation change SHALL NOT require installing or modifying application dependencies.

#### Scenario: Docs-only contribution

- **WHEN** a contributor edits or adds a Markdown page under `user-docs/` and opens a pull request
- **THEN** the change builds and validates without any change to `src/` or the root `package.json`

#### Scenario: App toolchain is unaffected

- **WHEN** a fresh clone runs the application's lint and build from the repository root without installing the docs site's dependencies
- **THEN** all application quality gates pass and no docs file causes a lint, typecheck, or build failure

### Requirement: Pull requests validate the documentation build

The repository SHALL run a documentation site build on every pull request that touches the docs sources or their workflow, reporting a pass/fail check.

#### Scenario: Broken docs build on PR

- **WHEN** a pull request contains a docs change that fails the site build
- **THEN** the docs build check fails on the pull request

#### Scenario: Docs change builds cleanly

- **WHEN** a pull request contains a valid docs change
- **THEN** the docs build check passes without deploying anything

### Requirement: Documentation deploys to GitHub Pages from master

Pushes to the default branch that change the documentation SHALL build the site and deploy it to GitHub Pages. The deployment SHALL be skipped when the push does not touch the documentation.

#### Scenario: Docs change merged to master

- **WHEN** a commit changing the documentation lands on the default branch
- **THEN** the site is rebuilt and the GitHub Pages deployment is updated automatically

#### Scenario: Unrelated change on master

- **WHEN** a commit that touches no documentation files lands on the default branch
- **THEN** no docs build or GitHub Pages deployment is triggered by the docs workflow

### Requirement: Docs live under the /docs/ path with the site root reserved

The documentation SHALL be served under the `docs/` path of the GitHub Pages site (that is, `https://mode777.github.io/psflix/docs/`), and all internal links and assets SHALL resolve against that base path. The deployed artifact SHALL place docs content under a `docs/` prefix so the site root remains unclaimed by the documentation.

#### Scenario: Visiting the docs

- **WHEN** a user opens `https://mode777.github.io/psflix/docs/`
- **THEN** the documentation home renders with working navigation, styles, and assets, and no resource is requested from an incorrect base path

#### Scenario: Deep link within the docs

- **WHEN** a user opens a deep link to a section such as `https://mode777.github.io/psflix/docs/<section>/`
- **THEN** the section page renders correctly when loaded directly (not only via in-site navigation)

### Requirement: Site uses Obsidian Console branding in dark mode

The site SHALL render exclusively in dark mode using the Obsidian Console design tokens: obsidian `#121414` background, PlayStation blue `#0072FF` as the primary brand color, teal `#00F2FF` as accent, and Inter as the typeface. No light theme SHALL be offered.

#### Scenario: Viewing with any OS color-scheme preference

- **WHEN** the site is loaded on a device set to light mode
- **THEN** the site still renders in the dark Obsidian Console palette

### Requirement: Documentation covers the core user journeys

The documentation SHALL include, at minimum, sections covering: creating an account and signing in; browsing the catalog and managing favorites; playing games (console view, controls, disc streaming and first-load behavior); save states and cloud sync; the memory card library and slot mounting; troubleshooting (browser requirements including cross-origin isolation, and known browser-specific issues such as the Chromium audio startup quirk); and a FAQ. The documentation SHALL be written in English.

#### Scenario: New user onboarding path

- **WHEN** a first-time visitor opens the docs home and follows the navigation
- **THEN** they can reach every required section and each section contains substantive content for its topic

#### Scenario: Troubleshooting a playback failure

- **WHEN** a user whose browser lacks cross-origin isolation cannot start the emulator
- **THEN** the troubleshooting section explains the requirement and how to recognize and work around the problem

### Requirement: Site provides navigation and search

The documentation site SHALL provide top navigation, a section sidebar, and client-side search across all documentation pages.

#### Scenario: Searching the docs

- **WHEN** a user enters a term such as "memory card" into the site search
- **THEN** matching documentation pages are offered and selectable

#### Scenario: Navigating sections

- **WHEN** a user browses the site
- **THEN** they can move between sections via the navigation and sidebar without returning to the home page

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
