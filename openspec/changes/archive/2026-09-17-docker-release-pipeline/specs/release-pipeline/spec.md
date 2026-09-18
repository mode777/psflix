# Spec Delta

## Purpose

Defines how PSflix is run locally against a local PocketBase, packaged into a self-contained Docker image, and published to Harbor on version tags — including where the SPA resolves its PocketBase URL in each runtime context.

## ADDED Requirements

### Requirement: Local full-stack development

The project SHALL provide npm scripts that download the PocketBase binary for the current platform into a gitignored `bin/` directory and serve it against a gitignored local data directory, applying `pb_migrations/` and loading `pb_hooks/`, with the built SPA as the served public directory. Running the local stack SHALL NOT require Docker, and the downloaded binary and data directory SHALL NOT be committed to the repository.

#### Scenario: First-time local setup

- **WHEN** a developer runs the PocketBase download script on a supported platform
- **THEN** a PocketBase binary for that platform/architecture exists under `bin/` and is executable

#### Scenario: Local stack serves schema and UI

- **WHEN** the PocketBase serve script runs after `npm run build`
- **THEN** PocketBase listens on `127.0.0.1:8090`, applies all migrations from `pb_migrations/`, loads `pb_hooks/`, and serves the built SPA from `dist/` at the URL root

#### Scenario: Local data is disposable

- **WHEN** the local PocketBase data directory is deleted
- **THEN** the next serve run recreates it and re-applies all migrations without errors

### Requirement: Backend URL resolution by build context

The SPA and admin UI SHALL resolve their PocketBase URL as follows: an explicitly configured `VITE_PB_URL` SHALL always take precedence; a development build without `VITE_PB_URL` SHALL default to `http://127.0.0.1:8090`; a production build without `VITE_PB_URL` SHALL default to same-origin (`window.location.origin`). No hardcoded deployment hostname SHALL remain as a production fallback.

#### Scenario: Image runs with zero configuration

- **WHEN** a production build with no `VITE_PB_URL` set is served by its own PocketBase container and loaded in a browser
- **THEN** all API calls target the serving origin and catalog data loads without any environment configuration

#### Scenario: Dev server targets local backend

- **WHEN** the SPA runs under the Vite dev server without `VITE_PB_URL` set
- **THEN** API calls target `http://127.0.0.1:8090`

#### Scenario: Explicit override wins

- **WHEN** `VITE_PB_URL` is set to a URL at build time
- **THEN** both dev and production builds use that URL for all API calls

### Requirement: Release image packaging

A version-tagged release SHALL produce a Docker image that contains the PocketBase server, the built SPA, the schema migrations, and the server hooks. The base image SHALL be pinned to a specific version tag. The image SHALL start with the base image's default entrypoint, and PocketBase SHALL apply migrations before serving. The image SHALL set cross-origin isolation headers (COOP: same-origin, COEP: require-corp, CORP: same-origin) and disable read/write timeouts via the shipped hooks, so no external reverse proxy is required for emulator workloads.

#### Scenario: Tagged build produces a complete image

- **WHEN** the release image is built from a repository state with migrations, hooks, and a completed SPA build
- **THEN** the image contains the SPA at the static root, the migrations directory, and the hooks directory, on top of the pinned PocketBase base image

#### Scenario: Fresh image boots with schema

- **WHEN** a freshly built image starts against an empty data volume
- **THEN** PocketBase applies all migrations before accepting requests and serves both the SPA and the API on port 8090

#### Scenario: Emulator headers on every response

- **WHEN** any route of the running image is requested
- **THEN** the response carries `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Resource-Policy: same-origin`

### Requirement: Tag-driven release publishing

Pushing a git tag matching `v*` SHALL trigger the release workflow, which builds and verifies the SPA, then builds and pushes the release image to `harbor.alexklingenbeck.de/my/psflix` tagged with the version without the leading `v` (e.g. tag `v0.5.3` → image `0.5.3`). Registry credentials SHALL come from GitHub Actions secrets, never from files in the repository. Pushes that are not `v*` tags SHALL NOT publish images. Pull requests and pushes to main SHALL run build verification without publishing.

#### Scenario: Release tag publishes image

- **WHEN** git tag `v1.2.3` is pushed
- **THEN** the workflow builds the SPA, verifies the build output, and pushes `harbor.alexklingenbeck.de/my/psflix:1.2.3`

#### Scenario: Non-release push does not publish

- **WHEN** a commit is pushed to main or a pull request is opened
- **THEN** the build verification workflow runs and no image is pushed to Harbor

#### Scenario: Fresh instance has schema but no content

- **WHEN** a released image boots against an empty data volume
- **THEN** all collections exist per the migrations, but the catalog contains no games, discs, BIOS, or documents
