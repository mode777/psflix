# Hosting & Running

PSflix is designed to be run by individuals or small groups on their own hardware. This chapter explains what an instance is made of, the two ways to run it, and how to configure it.

::: tip Credit where due
PSflix is a single [PocketBase](https://pocketbase.io) application that serves a React app playing games through [pcsx-rearmed](https://github.com/libretro/pcsx_rearmed) compiled to WebAssembly. Everything runs on one machine with one process.
:::

## What an instance is made of

A PSflix deployment is one PocketBase binary with four things layered on top — all of them live in this repository:

| Piece              | Where                       | What it does                                                                                                     |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **API + database** | PocketBase core             | REST API, auth, file storage, SQLite under the hood                                                              |
| **SPA**            | `dist/` (built) → `public/` | The catalog, details pages, and console UI                                                                       |
| **Hooks**          | `pb_hooks/`                 | Sets the cross-origin isolation headers (COOP/COEP) the emulator requires; no reverse-proxy header config needed |
| **Migrations**     | `pb_migrations/`            | Create the full schema on first boot — the database starts **empty** (no games, no BIOS)                         |

Because the SPA is served by the same PocketBase that provides the API, everything is same-origin — no CORS setup.

## Variant 1: Docker image (recommended)

The release pipeline builds a self-contained image: PocketBase with the SPA, hooks, and migrations baked in.

::: warning Not yet publicly published
The image is currently pushed to a **private registry** and is not on Docker Hub yet. Until it is published, build it yourself from the repository root:

```sh
npm install && npm run build   # produces dist/
docker build -t psflix .
```

:::

Run it:

```sh
docker run -d --name psflix \
  -p 8090:8090 \
  -v psflix-data:/pocketbase/pb_data \
  psflix
```

- **`-v psflix-data:/pocketbase/pb_data`** — the only state that matters lives in `pb_data` (SQLite + uploaded files). Mount a volume or you lose everything on container replacement.
- The container listens on **8090**; map whatever host port you like.
- To create the superuser account in the container:

```sh
docker exec -it psflix /pocketbase/pocketbase superuser upsert you@example.com 'a-long-password'
```

## Variant 2: Local dev stack

For trying PSflix or developing it, the repository ships helper scripts that download a PocketBase binary and run the exact production layout on your machine:

```sh
npm install
npm run pocketbase:download   # fetches the PocketBase binary into bin/
npm run build                 # builds the SPA into dist/
npm run pocketbase:serve      # API + SPA at http://127.0.0.1:8090
```

The serve script runs the downloaded binary with `--publicDir ./dist --dir ./pb_data --hooksDir ./pb_hooks`, and migrations apply automatically on boot. For frontend development with hot reload, keep the serve script running and use `npm run dev` (the Vite dev server targets the local backend by default).

Create the superuser for the local instance:

```sh
# Linux/macOS                     # Windows: use bin\pocketbase.exe
./bin/pocketbase superuser upsert you@example.com 'a-long-password'
```

## First-run checklist

A freshly migrated instance has **schema but no content**. To get it playable:

1. **Create the superuser** (see above for either variant).
2. **Upload the BIOS** — the console UI needs a PlayStation 1 BIOS (`SCPH1001.BIN`, max 5 MB) before any game can boot. See [Administration](/admin/#catalog-housekeeping).
3. **Add games** — CHD images go in through the admin upload flow. See [Administration](/admin/#adding-games).

## Configuration notes

- **Backend URL**: normally leave `VITE_PB_URL` unset — production builds talk to their own origin. Only set it at build time if you deliberately want the SPA to call a different server.
- **TLS**: PocketBase serves plain HTTP; put it behind a reverse proxy (Caddy, Traefik, nginx) for HTTPS. Header config is **not** required — the hooks set the cross-origin isolation headers themselves. PocketBase's [production guide](https://pocketbase.io/docs/going-to-production) covers proxy setups.
- **Backups**: PocketBase has built-in backups (admin UI → Settings → Backups). Schedule them — `pb_data` is the only state.
- **Verify isolation**: after deploying, open the console in devtools on your instance and check `self.crossOriginIsolated === true` — games will not start without it (see [Troubleshooting](/troubleshooting/)).

## PocketBase reference

Since PSflix _is_ a PocketBase app, PocketBase's own documentation is the authority for the server side — collections, the built-in admin UI at `/_/`, auth, files, and backups all behave exactly as documented:

- [PocketBase docs](https://pocketbase.io/docs/)
- [Going to production](https://pocketbase.io/docs/going-to-production) — TLS, reverse proxies
- [Collections & the admin UI](https://pocketbase.io/docs/collections)
