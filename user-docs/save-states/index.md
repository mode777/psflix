# Save States

PSflix gives you **four save state slots per disc** — a snapshot of the entire console you can take and restore at any moment, separate from in-game memory card saves.

## Slots and devices

| Slot                         | What it is                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| **Auto**                     | The autosave slot — written automatically, no clicks needed |
| **Slot 1 / Slot 2 / Slot 3** | Your manual slots                                           |

Save states belong to a **disc**, not to your account globally: Slot 1 on _Final Fantasy VII Disc 1_ is independent from Slot 1 on _Disc 2_. Signed-in users get every slot synced to their account, so your states are waiting on any device you sign in from.

## Saving and loading

Use the **Save** and **Load** buttons at the bottom left of the game screen. A picker shows the four slots:

- Occupied slots show their **last-saved time**.
- In save mode an empty slot reads _"Empty — will create new save"_; in load mode empty slots are disabled.

Pick a slot and the state is written or restored — confirmed with a toast like _"Progress saved to Slot 2."_ or _"Restored from Auto."_

## Autosave

You never have to think about the **Auto** slot:

- Every **5 minutes** while a game is running.
- When you **leave the console** (navigation is held for a moment while progress is saved — you will see _"Progress saved."_).
- When you **close the tab or window**.

Autosave only kicks in after you actually started playing (pressed Play at least once) — an untouched paused session saves nothing.

## Cloud sync and the sync chip

When you are [signed in](/getting-started/), save states upload to your account automatically. The **sync chip** at the top right of the game screen keeps you informed:

- **Local only** — you are signed out; saves stay in this browser.
- **Syncing…** — a fresh save is on its way to the cloud.
- **Synced** — the cloud copy is up to date.
- **Sync failed** — the upload did not go through; check your connection. Your local save is safe.

Sign in and any newer saves from your other devices are pulled down right away.

::: warning Newest save wins
If two devices write the same slot, the **newer timestamp replaces** the older one — there is no merging or choosing. For long play sessions on the same game, play on one device at a time.
:::

## Deleting a save state

Open the **⋮ console options** menu and choose **Delete Save State**, then pick the slot to clear.

::: warning A deleted slot can reappear after a reload
Deletion removes the cloud copy and hides the slot for the current session. If the slot receives no new save before you reload the page, the previous state can come back from the browser's local cache. Overwrite the slot (or delete it again after reloading) if you truly want it gone.
:::

## Continue from the details page

The **Continue** button on a game's [detail page](/browsing/#the-game-detail-page) finds your most recent save across **all discs** of the game, boots the right disc, and loads that save in one step.
