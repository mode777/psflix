# WS6 — Editor ↔ emulator refresh

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** WS4, WS5.
**Unblocks:** nothing (verification-driven).

## Goal

Make the Data Management dialog reflect changes made by the emulator (game-
written saves) and by the cloud (cross-device `mounted`/library updates),
within the constraints of decision #2 (apply-on-next-boot: cloud bytes are
**not** hot-swapped into the running emulator). Specifically:

1. **Reopen dialog → fresh bytes.** The editor must re-pull live slot bytes
   from the core on each open, not show stale in-memory bytes from the last
   session.
2. **`memcard-sync-complete` → refresh library.** After a cloud sync pass
   (auth-driven or dirty-upload landing), the library list + `mounted`
   indicators reflect the latest cloud state.
3. **No hot-swap.** Confirm — and test — that cloud downloads do NOT push
   bytes into the running emulator. Cross-device card changes apply on the
   next boot via IDB (unchanged).

Most of the load-bearing change is already in WS4 (`hydrate()` clobber + cloud
list) and WS5 (`_reconcileMemoryCards` on `memcard-sync-complete`). This
workstream tightens, tests, and documents the refresh behavior, and adds the
small amount of glue that those workstreams left as "verify."

## Files

| File                                                             | Change                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/features/console/memcards/memoryCardManager.ts`             | Finalize `hydrate()` clobber + busy guard (from WS4); expose a `refreshLibrary(userId)` used by WS5.           |
| `src/features/console/services/psxAnywhereEmulatorService.ts`    | Ensure `memcard-sync-complete` triggers `memoryCardManager.refreshLibrary` (in addition to the WS5 reconcile). |
| `src/features/console/components/memory/MemoryManagerDialog.tsx` | Pass `userId` into `hydrate` (if not already done in WS4 via `setUserId`).                                     |
| `src/features/console/memcards/memoryCardManager.test.ts`        | Editor-refresh coverage.                                                                                       |

## Design

### `hydrate()` — clobber + busy guard (finalize WS4)

WS4 introduced the "always re-export both slots" behavior with a busy guard.
Finalize the guard here:

```ts
private readonly _busySlots = new Set<MemorySlotNumber>();

private async _push(slot: MemorySlotNumber, bytes: Uint8Array): Promise<void> {
  this._busySlots.add(slot);
  try {
    await this.emulator.importMemcard(slot, bytes);
  } catch {
    // session-only: keep the in-memory card
  } finally {
    this._busySlots.delete(slot);
  }
}

async hydrate(userId?: string): Promise<void> {
  // ... cloud list + mount derivation (WS4) ...

  const [live1, live2] = await Promise.all([
    this._busySlots.has(1) ? Promise.resolve(this._getSlotBytes(1)) : this.emulator.exportMemcard(1),
    this._busySlots.has(2) ? Promise.resolve(this._getSlotBytes(2)) : this.emulator.exportMemcard(2),
  ]);
  this.store.setState((s) => ({
    slot1: live1 ?? s.slot1,
    slot2: live2 ?? s.slot2,
    hydrated: true,
  }));
}
```

Rationale: an editor mutation calls `_push` (which calls `importMemcard`). If
`hydrate` runs concurrently and re-exports, the export may return the pre-edit
bytes (worker hasn't flushed yet) and momentarily undo the UI change. The busy
guard keeps the in-progress slot's bytes authoritative until `_push` settles;
the worker's dirty-export poll then drives the cloud upload + the next
`hydrate` reflects the new state.

### `refreshLibrary(userId)` — separate from `hydrate`

Split the two concerns so WS5 can refresh the library without re-exporting
slots (e.g., after a cloud sync where we deliberately do NOT hot-swap):

```ts
/** Refresh only the library + mount indicators from the cloud. Does NOT
 *  re-export slot bytes. Use after a sync pass where the library/mounted
 *  metadata changed but the running emulator should keep its current cards. */
async refreshLibrary(userId: string): Promise<void> {
  if (!this.cloud) return;
  try {
    const entries = await this.cloud.list(userId);
    const withBytes = await Promise.all(
      entries.map(async (e) => ({
        ...e,
        bytes: e.bytes ?? (await this.cloud!.fetchBytes(userId, e.id)),
      })),
    );
    this.store.setState((s) => ({
      library: withBytes.map(this.toLibraryCard),
      // Do NOT touch slot1/slot2 bytes — apply-on-next-boot.
      // Update mountId markers so the UI shows current mount state.
      mountId1: withBytes.find((e) => e.mounted === 'slot1')?.id ?? s.mountId1,
      mountId2: withBytes.find((e) => e.mounted === 'slot2')?.id ?? s.mountId2,
    }));
  } catch {
    // cloud unavailable — leave the library as-is
  }
}
```

`hydrate` = `refreshLibrary` + live re-export. WS5 calls `hydrate` on
`auth-change` (full refresh) and `refreshLibrary` on `memcard-sync-complete`
(metadata refresh, no slot clobber).

### `memcard-sync-complete` handler (finalize WS5)

In `_wireEvents` (`psxAnywhereEmulatorService.ts:248-251`), augment the handler:

```ts
client.addEventListener('memcard-sync-complete', () => {
  store.getState().setSyncStatus('synced');
  queryClient.invalidateQueries({ queryKey: ['memory-cards'] });
  const userId = psxAnywhereRepository.getCurrentUserId();
  if (userId) void memoryCardManager.refreshLibrary(userId);
});
```

Note: `memcard-sync-complete` fires after both uploads and downloads
(`MemcardSync._onSyncComplete`). For downloads, the bytes went to IDB (not the
running emulator) — `refreshLibrary` updates the library but the slot panes
keep showing the live (local) bytes. This is the intended apply-on-next-boot
behavior: the user sees the library list reflect the cloud, but their current
play session's cards are untouched.

### Dialog re-hydrate on open (verify WS4 wiring)

`MemoryManagerDialog.tsx:23-34` already calls `memoryCardManager.hydrate()`
on open. Verify it passes the user id (via `memoryCardManager.setUserId` done
in WS5, or an explicit arg). No structural change here — just confirm the
flow: open dialog → `setUserId` already set → `hydrate(userId)` → cloud list +
live re-export → user sees fresh saves.

### No hot-swap — explicit non-behavior (test it)

Add a test that proves cloud download does NOT call `importMemcard` on the
running emulator. This guards against a future regression that "helpfully"
hot-swaps.

## Tests

File: `src/features/console/memcards/memoryCardManager.test.ts` (extend).

### New coverage

- **`hydrate` clobbers stale slot bytes:** import fixture bytes into the
  emulator (simulating a game save after the manager last saw the slot);
  call `hydrate()`; assert slot bytes now match the live export, not the
  stale in-memory copy.
- **Busy guard:** start an edit (`_push` pending via a deferred
  `importMemcard` mock); call `hydrate()` concurrently; assert the busy slot
  is NOT re-exported (its bytes stay as the edit set them); after `_push`
  settles, a subsequent `hydrate` reflects the new state.
- **`refreshLibrary` does not clobber slots:** seed slot1 with bytes A in the
  store; call `refreshLibrary` where the cloud returns a mounted slot1 card
  with bytes B; assert `library` updated and `mountId1` set, but `slot1`
  bytes remain A (apply-on-next-boot).
- **`refreshLibrary` updates `mounted` markers:** cloud flips a card's
  `mounted` from slot1 to slot2 elsewhere; `refreshLibrary` updates the
  library row + `mountId2`.

File: `tests/console/services/psxAnywhereEmulatorService.test.ts` (extend).

- **`memcard-sync-complete` triggers `refreshLibrary`:** simulate the event;
  assert `memoryCardManager.refreshLibrary` called with the current userId and
  `['memory-cards']` invalidated.
- **No hot-swap regression:** simulate a `memcard-sync-complete` after a
  download (mock returns different bytes); assert `client.importMemcard` is
  NOT called for the running slots.

## Verify (this workstream alone)

```sh
npm test -- memoryCardManager psxAnywhereEmulatorService
npm run typecheck
npm run lint
```

Manual smoke (dev):

1. Play a game that writes a save to slot 1. Without closing the game, open
   Data Management → slot 1 shows the new save.
2. Close the dialog; play more (another save). Reopen → the newer save appears
   (re-export on open).
3. On a second device, change the library (create a spare card). On device A,
   trigger a sync (re-auth or wait) → the library list shows the new spare
   card, but device A's mounted slot bytes are unchanged (apply-on-next-boot).
   Reload device A → the mounted card is unchanged; the spare is in the
   library.

## Out of scope for WS6

- Live in-dialog refresh during gameplay via re-emitted `memcard-exported`
  (future enhancement; noted in the spec's non-goals).
- Pushing cloud bytes into the running emulator (explicitly decided against).
- Docs (WS7).
