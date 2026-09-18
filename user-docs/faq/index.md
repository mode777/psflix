# FAQ

Quick answers to the questions that come up most often. For deeper help, see [Troubleshooting](/troubleshooting/).

## Do I need an account?

No — you can browse and play without one. An account adds your **favorites row**, **cloud-synced save states**, and the **memory card library**. See [Getting Started](/getting-started/).

## What emulator does PSflix use?

PSflix plays games with [pcsx-rearmed](https://github.com/libretro/pcsx_rearmed), a mature open-source PlayStation 1 emulator, compiled to WebAssembly and running entirely in your browser. The site itself is powered by [PocketBase](https://pocketbase.io). You can read more in [Hosting & Running](/hosting/).

## Can I run my own instance?

Yes — PSflix is self-hosted software. The [Hosting & Running](/hosting/) chapter covers the Docker image and the local PocketBase stack, and [Administration](/admin/) explains how to add games (CHD images) and manuals.

## Which browsers work?

Up-to-date versions of **Chrome, Edge, Firefox, and Safari** on desktop. The emulator requires modern browser features (cross-origin isolation in particular); privacy extensions that strip security headers can break game starts — see [the game will not start](/troubleshooting/#the-game-will-not-start-or-shows-a-black-screen).

## Can I play on a phone or tablet?

The catalog browses fine on small screens, but playing is best with a keyboard or gamepad on desktop. There is no touch control layout yet.

## Can I use a gamepad?

Yes — plug in any standard gamepad and it works automatically with the standard button mapping. There is no rebinding UI yet. See [Controls](/playing/#controls).

## Where do my saves live?

Three places, depending on the feature and whether you are signed in:

- **Save states** — in your browser, plus the cloud when signed in.
- **Memory cards** — in the cloud library when signed in; session-only otherwise.
- **Autosaves** go to the **Auto** slot like any save state.

Avoid clearing this site's browser storage — see [the warning about site data](/troubleshooting/#saved-data-or-memory-cards-disappeared).

## Are my saves shared between devices?

Yes, when signed in: save states and memory cards sync to your account. Cards mounted on one device are mounted on others at the **next game boot**, and if two devices write the same save slot the **newest save wins**. Details: [Save States](/save-states/#cloud-sync-and-the-sync-chip).

## Why is the first launch of a game slow?

The disc is streamed in chunks and cached in your browser. The first session pays the network cost; every later session starts faster from cache. See [Streaming and the first launch](/playing/#streaming-and-the-first-launch).

## Can I download games?

No — games stream and are never exposed as files. **Manuals and strategy guides** can be read in-app and downloaded from each game's detail page.

## How do multi-disc games work?

Start any disc from the detail page's disc dropdown, and swap discs mid-game from the **Disc N** pill in the console header. Save states are stored **per disc**. See [Multi-disc games](/playing/#multi-disc-games).

## What is the difference between save states and memory cards?

Save states are instant snapshots of the whole console (four slots per disc, plus autosave). Memory cards are the PS1's own save format — the saves games manage themselves, with 15-block cards you can copy and move between slots. See [Memory cards vs. save states](/memory-cards/#memory-cards-vs-save-states).

## I lost my password. What now?

There is no self-service password reset yet — see the note in [Getting Started](/getting-started/#create-an-account). Contact the site administrator for help.

## What is the "Admin" link in my account menu?

An entry point for the site's administrators to manage the catalog. Regular accounts cannot sign in there — if you do not know what it is, ignore it.

## Is PSflix affiliated with Sony?

No. PSflix is a personal fan project — a catalog and browser player for PlayStation 1 classics. PlayStation is a trademark of Sony Interactive Entertainment.
