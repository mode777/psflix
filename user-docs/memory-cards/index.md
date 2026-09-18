# Memory Cards

The memory card system mirrors the real console: two slots, a personal library of virtual cards, and PS1 save data you can copy, move, and manage. When you are signed in, the whole library lives in the cloud.

Open it from the game screen: **⋮ console options → Memory Manager** (the dialog is titled _Data Management_). It shows your two slots side by side.

## Slots and capacity

Each mounted card has:

- a **capacity bar** — virtual PS1 cards hold **15 blocks**, and every save on the card lists how many it uses,
- a **save list** with the game's icon, title, product code, and region,
- per-save actions on hover: **Copy to Slot N**, **Move to Slot N**, and **Delete Save**.

Copy/move fails with an error if the target card does not have enough free blocks — delete or format something first.

An empty slot offers two buttons: **Mount Existing Card** (opens the library) and **Initialize New Card**.

## Your card library

The **Card Library** holds all your cards regardless of which slot they are in. From the library you can:

- **Mount** a card into the current slot.
- **Initialize** a new card — give it a name (up to 24 characters) and it is created and mounted immediately.
- **Import** a `.mcr` or `.mcd` memory card image from your computer — the file name (without extension) becomes the card's label. Imported cards are also mounted right away.
- **Delete** a card from the library.

::: warning Eject before deleting
A card that is mounted in a slot cannot be removed from the library. Eject it first — you will see an error reminding you otherwise.
:::

## Mounting and ejecting

- **Mounting** inserts the card into the running game — like pushing a card into a real console. Only one card fits per slot.
- **Ejecting** saves the card's current contents back to your library and inserts a blank card, so the game sees an empty slot until you mount another card.

New or newly imported cards mount automatically, so most of the time you will not touch these controls.

## Managing a card

Each mounted card pane offers:

- **Rename** (pencil icon) — change the label, up to 24 characters.
- **Format Card** — wipe the card back to blank. This deletes all save data on it; there is no undo.
- **Eject Card** — see above.

## Cloud sync and devices

Signed-in users get the full treatment:

- The card **library and its contents sync to your account** — card changes upload automatically a few seconds after the game writes them.
- Your **mounted slots are remembered per device**: sign in on another device and the same cards are mounted on the next game boot.
- Your **first sign-in** creates a card named _default_ and mounts it in Slot 1, so a new account is playable immediately.

::: warning Changes from other devices apply on next boot
Card changes synced from another device are downloaded to this one but are **not hot-swapped into a game that is already running**. Restart the game (or reboot the console) to pick them up.
:::

::: warning Signed out, your library is temporary
Without an account, memory card work is session-only — everything is **wiped when the page reloads**. Sign in to keep your cards.
:::

## Memory cards vs. save states

[Save states](/save-states/) are browser-level snapshots (the whole console state, tied to a disc). Memory cards are the PS1's own save format — the thing games read and write themselves, and the only thing you can export or import as `.mcr`/`.mcd`. Use both: states for quick points in time, memory cards for the saves a game manages.
