# Getting Started

PSflix is a Netflix-style catalog for PlayStation 1 games. You can browse the library without an account, but signing in unlocks your favorites row, cloud-synced save states, and a personal memory card library that follows you across devices.

::: tip Where is PSflix?
PSflix is self-hosted software — there is no single official address. If you are reading this docs site, your operator runs an instance and can give you its URL.
:::

## Create an account

1. Open your PSflix site and click the **account icon** in the header.
2. In the sign-in dialog, choose **Create an account**.
3. Fill in your **name**, **email**, and a **password** (at least 8 characters, entered twice).
4. Click **Create account** — you are signed in immediately.

Your name shows up in the account menu (a default "Player" label is used if you skip the name).

## Sign in

1. Click the **account icon** in the header.
2. Enter your **email** and **password**.
3. Click **Sign in**.

If the credentials do not match, the dialog shows _Invalid email or password_ — check for typos and try again. Your session stays valid for about **5 days** on the same browser, after which you simply sign in again.

::: tip Keep your password safe
Account creation and sign-in are the only account features right now — there is currently **no email verification and no password reset flow**. If you lose your password, you cannot recover the account yourself yet.
:::

## Sign out

Click your **avatar** (or initial) in the header, then choose **Sign out**. The sign-in dialog reopens.

::: warning Signing out pauses cloud sync
Anything you saved while signed in stays safely in the cloud and comes back on your next sign-in. But a new session started while signed out keeps progress **in this browser only**.
:::

## The account menu

Once signed in, the header avatar opens a small menu with:

- your **display name** and **email**,
- an **Admin** link (only useful if you have administrator credentials — regular accounts cannot sign in there),
- **Sign out**.

## What signing in gives you

| Feature                                         | Signed out                         | Signed in                |
| ----------------------------------------------- | ---------------------------------- | ------------------------ |
| Browsing and playing                            | Yes                                | Yes                      |
| Favorites row and heart buttons                 | No                                 | Yes                      |
| Save states                                     | This session only, in this browser | Synced to your account   |
| Memory card library                             | Session only, wiped on reload      | Persistent, cloud-backed |
| Save state and memory card slots in the console | Locked                             | Unlocked                 |

Next up: [Browsing the Catalog](/browsing/).
