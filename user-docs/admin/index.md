# Administration

Instance operators manage the catalog — games, disc images, manuals — through two surfaces:

- **The PSflix admin app** at `/admin.html` — purpose-built screens for uploading games and documents.
- **The PocketBase admin UI** at `/_/` — the full backend: every collection, record, file, user, and setting.

Both sign in with the **superuser account** created during [hosting setup](/hosting/#first-run-checklist). A superuser is not a player account — it bypasses all access rules, so treat its credentials accordingly.

## Adding games

Open **`/admin.html`** and go to **Upload** in the sidebar. The flow is file-first with a review step:

1. **Drop your disc images** into the dropzone — strictly **CHD files** (`.chd`), see [Creating CHD images](#creating-chd-images).
2. **Identification** — the serial number is detected in the browser, and the entry is enriched with metadata and cover artwork.
3. **Review** — check the identified title, metadata, and artwork before anything is uploaded. Multi-disc games are handled as one game with several discs.
4. **Upload** — progress is shown per file, followed by a done summary.

::: warning Only CHD images are accepted
PSflix's streaming emulator reads CHD v5 images. BIN/CUE, ISO, and other formats are **rejected** at upload — convert first (below). This is what makes [streaming with caching](/playing/#streaming-and-the-first-launch) possible: CHD supports the random-access reads the emulator performs over HTTP.
:::

### Creating CHD images

The standard tool is **`chdman`** from the MAME project. It converts a cue sheet plus binary image pair:

```sh
chdman createcd -i "Game (Europe).cue" -o "Game (Europe).chd"
```

Requirements and tips:

- You need the **`.cue` sheet and its `.bin` file(s)** together — chdman reads the cue to rebuild tracks (including audio) into the CHD.
- Verify the result: `chdman verify -i "Game.chd"`.
- Keep the CHD (you can discard the cue/bin afterwards); the upload flow does not need them.

Authoritative references:

- [MAME — commonly used tools](https://docs.mamedev.org/usingmame/commonlyusedtools.html) — official `chdman` documentation
- [MAME releases](https://mamedev.org/release.html) — official binaries for Windows/macOS/Linux
- [libretro CHD guide](https://docs.libretro.com/guides/roms-chd/) — background on the format and conversions

::: warning Be careful with "online CHD converters"
Web-based chdman frontends exist, but converting means uploading your disc image to someone else's server. PSflix is a self-hosted, personal-use project — run conversions locally and keep your discs to yourself.
:::

## Adding manuals and strategy guides

Open **`/admin.html`** → **Documents**:

1. **Pick the PDF** — the queue is file-first, so several documents can be lined up.
2. **Assign a game** — link the document to its game record.
3. **Pick the type** — `manual` (shows as _Digital Manual_) or `guide` (shows as _Strategy Guide_). Multiple guides per game are fine; there is one manual slot per game.
4. **Upload** — sequential, with an optional _replace existing_ for swapping in a better scan.

Once uploaded, players see the document on the game's [detail page](/browsing/#the-game-detail-page) — readable in-app and downloadable.

## Catalog housekeeping

Everything else happens in the **PocketBase admin UI at `/_/`** (see [PocketBase's docs](https://pocketbase.io/docs/) — the admin UI and collections behave exactly as documented there):

- **Edit game and disc records** — titles, descriptions, region (`NTSC-U`, `NTSC-J`, `PAL`), languages/features (JSON fields), screenshots (up to 10 per game). The schema in `pb_schema.json` (repo root) is the source of truth for what exists.
- **Upload the BIOS** — open the `consoles` collection, edit the `SCPH1001` record, and attach the BIOS file (`SCPH1001.BIN`, max 5 MB) to the `bios` field. Without it, no game boots.
- **Manage player accounts** — the `users` collection; reset or remove accounts as needed.
- **Backups & logs** — Settings → Backups (schedule them; `pb_data` is the only state) and the request log viewer.

::: tip Mind the schema
`games.first_disc_serial` is the unique natural key for a title, and `(game, index)` is unique per disc — the UI relies on both. Prefer the Upload flow for adding games; use `/_/` for corrections.
:::
