# Playing Games

Every game runs in your browser through a built-in PlayStation 1 emulator — nothing to install. Disc images are streamed while you play, so a game can start before it has fully downloaded.

## Starting a game

Open a game's [detail page](/browsing/#the-game-detail-page) and pick a way in:

- **Play** — start a single-disc game.
- **Start Disc N** — for multi-disc games, a split button with a dropdown listing every disc. The recommended disc is preselected; you can pick another for the session.
- **Continue** — appears when you have a save for this game. It starts the disc that holds your **latest save state** and loads it immediately.

::: tip Press the big Play button
After loading, the session starts paused with a large **Play** button over the screen (you can also click the screen itself). Browsers only allow audio to start from a click, so this step doubles as the sound switch.
:::

## Controls

### Keyboard

| PS1 button | Key                   |
| ---------- | --------------------- |
| D-pad      | Arrow keys            |
| Start      | Enter                 |
| Select     | Tab                   |
| Cross      | Z or Space            |
| Circle     | X (Escape also works) |
| Triangle   | A                     |
| Square     | S                     |
| L1 / R1    | Q / W                 |
| L2 / R2    | E / R                 |

Keys are ignored while you are typing in a form field.

### Gamepad

Plug in any standard controller (PlayStation or Xbox layout) — it is picked up automatically. Face buttons follow the standard mapping (bottom = Cross, right = Circle, left = Square, top = Triangle), the sticks work, and the left stick also drives the D-pad. There is currently no UI to rebind keys or buttons.

### Mouse

Select the **PS Mouse** controller type (see below) and click the screen to capture your pointer for games that support the PS1 mouse.

## Controller ports

The header shows **P1** and **P2** pills. Each port can hold a **Standard Pad**, a **Dual-Shock**, or a **PS Mouse**; port 2 can also be set to **Empty**. Your choices are remembered per browser.

## In-game controls

Around the game screen you find:

- **Save / Load** (bottom left) — open the [save state slot picker](/save-states/).
- **Fast-forward** (bottom left) — toggles between 1x and 2x speed. Audio is muted while fast-forwarding. Speed resets to 1x after loading a state, switching discs, or resetting.
- **Volume** (bottom right) — speaker icon with a slider. Starts at 85%.
- **Play/Pause** and **Fullscreen** (top right). In fullscreen, all overlays fade out after a few idle seconds — move the mouse to bring them back.
- **Sync chip** (top right, when signed in) — shows whether your saves are **Local only**, **Syncing…**, **Synced**, or **Sync failed**. See [Save States](/save-states/).

## Console options

The **⋮ menu** in the header opens console options:

- **CRT Filter** — scanline overlay for a period-correct look. On by default.
- **Reset Game** — reboot the game from scratch (your save states survive).
- **Delete Save State** — remove a save from a slot.
- **Memory Manager** — manage your virtual [memory cards](/memory-cards/).

## Multi-disc games

Switch discs any time from the **Disc N** pill in the header — the swap happens without rebooting, exactly like swapping discs on a real console. [Save states are stored per disc](/save-states/#slots-and-devices), and the detail page's disc dropdown remembers which disc you last played.

## Streaming and the first launch

Discs are streamed in small chunks and cached in your browser:

- **The first launch of a game is the slowest** — the emulator reads ahead as you play, so a "Loading disc" spinner appears while data arrives on slow connections.
- **Every next session is faster** because chunks come from the local cache.
- There is no separate download step, and no way to disable caching.

Leaving the console (back arrow, logo, or browser back) **autosaves your progress to the Auto slot first** — you will see a "Progress saved." toast. Closing the tab autosaves the same way.

::: tip PAL games run at the right speed
PAL titles automatically run at their native 50 Hz pacing, so they play at the correct speed with intact audio.
:::
