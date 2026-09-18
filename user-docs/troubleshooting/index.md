# Troubleshooting

Most issues fall into a handful of known patterns. Find your symptom below.

## The game will not start (or shows a black screen)

The emulator needs your browser to run in **cross-origin isolated** mode — a security feature the PSflix server enables, but which browser extensions or strict privacy settings can strip away.

**Check it:** open the browser DevTools console (F12) on any PSflix page and run:

```js
self.crossOriginIsolated;
```

- `true` — isolation is fine; the problem is elsewhere on this page.
- `false` — something removed the required headers.

**Fixes to try:**

1. Disable ad blockers / privacy shields for your PSflix site (Brave Shields, uBlock, "strict" tracking protection and similar are common culprits).
2. Try a private window with extensions off.
3. Make sure your browser is **up to date** — cross-origin isolation requires a current Chrome, Edge, Firefox, or Safari.

## Video works but there is no sound (Chromium bug)

A rare Chromium bug can leave the game **silent for the rest of the browser session**: video and controls work, but audio never plays. Reloading the page, hard-refreshing, or opening a new tab does **not** fix it.

**Fix: restart the entire browser** (all windows). The next session has sound again. The bug is uncommon — most players never hit it.

## Stuck on "Loading disc"

Discs are streamed over the network and cached locally, so the first launch of a game is the slowest — a spinner appears while chunks arrive. If it never finishes:

- Check your connection; the spinner tracks network stalls.
- Try again later if the server is under load — repeated attempts do not lose progress (your autosave has you covered).

## Saved data or memory cards disappeared

Work through this list:

- **Are you signed in?** Signed-out save states and memory card libraries are **session-only** and are wiped on reload. Sign in and your cloud data returns. (See [Save States](/save-states/) and [Memory Cards](/memory-cards/).)
- **A deleted save state is back** — that is a known quirk: deletion hides the slot for the session, and a reload can restore it from the local cache. Delete it again, or overwrite the slot.
- **Cards from another device are missing mid-game** — synced card changes apply on the **next game boot**, never into a running session. Reboot the game.

::: danger Do not "clear site data" casually
Your local save states, memory card images, and streaming cache live in this site's browser storage. Clearing cookies/site data for PSflix **deletes unsynced local saves and cards**. If you must clear data: sign in first, play briefly so everything syncs (sync chip shows _Synced_), and only then clear.
:::

## Audio problems

- **No audio at all, ever, this session** — see the Chromium bug above; restart the browser.
- **No audio while fast-forwarding** — by design; 2x speed mutes audio.
- **Check the volume slider** (bottom-right speaker icon) — it is per-browser and starts at 85%.

## "Couldn't load this game" / "This disc has no game image attached"

The game's data could not be loaded from the server, or the disc entry in the catalog has no image attached yet. Go **Back to details** and try again; if it persists, the title needs administrator attention.

## Nothing here matches my problem

- Try a **Reload console** from the error screen, or a full page reload — a fresh boot resolves most one-off glitches.
- Check the [FAQ](/faq/).
- Still stuck? Note what you clicked last, the page URL, and what the screen showed, and report it to the site administrator.
