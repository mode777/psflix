# Phase 2 — PocketBase cloud sync

Prerequisite: **Phase 1 complete** ([`phase-1.md`](./phase-1.md)). This phase adds
cloud persistence for save states and memory cards against the existing
`save_state` and `memory_cards` collections (which already match PSxAnywhere's
schema 1:1). Local-first IDB remains the primary store; cloud is a sync layer.

Exit criteria: a save created on device A appears on device B after the user
signs in on B; memory cards persist across reloads and devices; the
auth-gated save/load UI unlocks on sign-in.

## What changes vs. Phase 1

Phase 1 left every cloud method on `PsxAnywhereRepository` as a stub. Phase 2
implements them. The vendored facade's sync engines (`SaveStateStore`,
`SaveStateSyncEngine`, `MemcardSync`) are already wired to the repository (they
were constructed in `EmulatorClient`); they were just no-op'ing on the stubs.
Implementing the methods "turns on" sync with **no facade-side change**.

The only adapter-side work is:

1. Implementing the repository methods.
2. Bridging the existing PSflix UI/hooks to cloud-backed data (the `listSaveStates`
   / `listMemoryCards` hooks should reflect cloud records, not just IDB).
3. Surfacing sync status (`state-sync-complete`) to invalidate queries.

## Workstream map

| #   | Workstream                                    | Touches                                                                  |
| --- | --------------------------------------------- | ------------------------------------------------------------------------ |
| K   | Implement Disc-ID resolution                  | `psxAnywhereRepository.ts`                                               |
| L   | Implement save-state cloud ops                | `psxAnywhereRepository.ts`                                               |
| M   | Implement memcard cloud ops                   | `psxAnywhereRepository.ts`                                               |
| N   | Adapter: list/save/load against cloud         | `psxAnywhereEmulatorService.ts`, `useSaveStates.ts`, `useMemoryCards.ts` |
| O   | Sync-status UX (sync indicator, invalidation) | `GameWindow.tsx`, `ControlsPanel.tsx`, `useRuntime.ts`                   |
| P   | Tests + verification                          | `tests/console/services/**`, e2e                                         |

Recommended order: **K → L → M → N → O → P**.

---

## K. Disc-ID resolution

The repository keys cloud save states by `discs.id` (the PocketBase relation),
while PSflix's UI keys by `disc.serial` (`first_disc_serial`). PSxAnywhere's
`Repository` exposes the bridge:

```ts
resolveDiscId(discSerial: string): Promise<string>;   // serial → discs.id
lookupDiscSerial(discId: string): Promise<string>;     // discs.id → serial
```

Implement in `psxAnywhereRepository.ts`, mirroring `psxanywhere/src/repository/repository.ts:169-184`:

```ts
private readonly _discIdCache = new Map<string, string>();

async resolveDiscId(discSerial: string): Promise<string> {
  assertSerial(discSerial);
  const cached = this._discIdCache.get(discSerial);
  if (cached) return cached;
  const disc = await pb.collection('discs').getFirstListItem(`serial="${discSerial}"`);
  this._discIdCache.set(discSerial, disc.id);
  return disc.id;
}

async lookupDiscSerial(discId: string): Promise<string> {
  for (const [serial, id] of this._discIdCache) if (id === discId) return serial;
  const disc = await pb.collection('discs').getOne(discId);
  this._discIdCache.set(disc.serial, disc.id);
  return disc.serial;
}
```

Port the small validators (`assertSerial`, `assertUserId`, `assertLabel`, `isNotFound`) from `psxanywhere/src/repository/repository.ts:21-35` into the adapter (or a shared `util.ts` under `services/`). The `discs.serial` unique index (`pb_schema.json:320`) makes the `getFirstListItem` safe.

---

## L. Save-state cloud ops

The `save_state` collection (`pb_schema.json:775-885`) has fields `type` (select:
`auto`/`slot1`/`slot2`/`slot3`), `disc` (relation → `discs`), `user` (relation →
`users`), `data` (file, required), unique on `(type, disc, user)`. Access is
owner-only (`@request.auth.id = user.id`).

Implement, mirroring `psxanywhere/src/repository/repository.ts:194-302`:

| Method                                           | Implementation                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uploadSaveState(discSerial, type, buf, userId)` | `resolveDiscId`; try `getFirstListItem('type="…" && disc="…" && user="…"')`; `FormData` with `type`, `disc`, `user`, `data` blob; `update` if exists else `create`. Return `SaveStateRecordDto` (`toDto` helper). |
| `downloadSaveState(discSerial, type, userId)`    | `resolveDiscId`; `getFirstListItem` same filter; fetch bytes via `fileUrl(rec, rec.data)` → `arrayBuffer()`.                                                                                                      |
| `fetchSaveStateBytes(record)`                    | `getOne(record.id)`; fetch bytes.                                                                                                                                                                                 |
| `hasRemoteState(discSerial, type, userId)`       | `getFirstListItem` → `true`; 404 → `false`.                                                                                                                                                                       |
| `getSaveStateRecord(recordId)`                   | `getOne(id, { expand: 'disc' })` → `toDto`.                                                                                                                                                                       |
| `fetchNewerSaveStates(userId, since?)`           | `getFullList({ filter: 'user="…" && updated > "…"' or 'user="…"' })`.                                                                                                                                             |
| `fetchSaveStatesFor(discSerial, userId, since?)` | `resolveDiscId`; `getFullList({ filter, expand: 'disc' })` → `toDto[]`.                                                                                                                                           |

Define the `toSaveStateDto` helper locally (it projects the raw PB record onto
`SaveStateRecordDto` with `discSerial` from `expand.disc.serial`). The bytes-fetch
helper uses PSflix's `fileUrl()` rather than raw `pb.files.getURL` for consistency.

**Auth note:** these calls require an authenticated `pb` (the `save_state`
`listRule`/`viewRule`/`createRule`/`updateRule` are all `@request.auth.id = user.id`).
The facade's `SaveStateSyncEngine` already gates on `repo.isAuthenticated()` — so
calls only fire when PSflix's auth store is valid. The auth-token duration is 5 days
(`pb_schema.json:189`); the existing `pb-query.ts` 401-handler signs the user out
on expiry, which the repository's `onAuthChange` propagates to the facade.

**Delete** (`deleteState` on `EmulatorService`): the `save_state.deleteRule` is
`@request.auth.id = user.id` (owner can delete). The facade exposes no delete API;
the adapter calls `pb.collection('save_state').delete(recordId)` directly via the
repository (add a thin `deleteSaveState(recordId)` method to the adapter, not the
upstream interface — keep `Repository` shape intact). Wire `useSaveStateMutation`'s
`remove` (currently unused) to it; optionally expose a "delete" mode in
`SlotPickerDialog` (the component already supports `mode: 'delete'`).

---

## M. Memory-card cloud ops

> **Superseded** by [`specs/memory-manager-cloud-sync/`](../memory-manager-cloud-sync/spec.md).
> The model moved from "one memcard per user, label `default`" to a
> `mounted`-backed card **library** with both slots syncing. `uploadMemcard`
> now upserts by record `id` (optional `recordId`); the manager reads/writes
> the `mounted` select on mount/eject. The table below describes the Phase 2
> baseline that the library model extends.

The `memory_cards` collection (`pb_schema.json:682-773`): `user` (relation), `label`
(text), `data` (file). Owner-only access.

Implement, mirroring `psxanywhere/src/repository/repository.ts:304-356`:

| Method                              | Implementation                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `uploadMemcard(buf, userId, label)` | try `getFirstListItem('label="…" && user="…"')`; `FormData` (`user`, `label`, `data`); `update` or `create`. |
| `downloadMemcard(userId, label)`    | `getFirstListItem`; fetch bytes.                                                                             |
| `hasRemoteMemcard(userId, label)`   | `getFirstListItem` → `true`; 404 → `false`.                                                                  |

The facade's `MemcardSync` already calls these on auth change (download) and on
dirty memcard export (debounced upload). Nothing else changes — implementing the
methods activates the flow.

---

## N. Adapter — list/save/load against cloud

### N.1 `listSaveStates(discId, userId)` — reflect cloud

Phase 1 probed IDB via `client.hasState(slot)`. Phase 2 should show real records so
the UI can display `updatedAt` + sync state. Two options:

- **(a) Repository-driven:** `const records = await psxAnywhereRepository.fetchSaveStatesFor(serial, userId);` map each `SaveStateRecordDto` to `SaveStateInfo` (`slot ← type`, `updatedAt ← updated`, `discId ← discId`). Combine with IDB-only entries the cloud doesn't have yet (the facade may have saved locally but not synced).
- **(b) Facade-driven:** keep `client.hasState(slot)` but augment with a parallel `fetchSaveStatesFor` call for metadata.

Recommended: **(a)**, with `useSaveStates`'s query key unchanged (`['save-states', discId, userId]`). The query now returns cloud records; local-only saves that haven't synced yet are surfaced by the `state-saved` → invalidate flow (they appear after the next sync pass).

Map `SaveStateRecordDto` → `SaveStateInfo` (`src/features/console/types.ts:14-20`):
`blocks` is PSflix-specific and has no cloud source — keep the Phase 1 placeholder
(or drop the field if the UI tolerates it; `SlotPickerDialog` displays it, so keep a
default like `0` or compute from `data` size if cheap).

### N.2 `saveState` / `loadState` — unchanged signatures

These already call `client.saveState/loadState`, which the facade routes to
`SaveStateStore` → IDB write → enqueued cloud upload (now real). No adapter change;
just verify the repository methods (L) are correct.

### N.3 `useMemoryCards` — cloud list

`listMemoryCards(userId)` (currently returning mock defaults): return real
`memory_cards` records for the user. Map each to `MemoryCardInfo` (`id`, `label`,
`usedBlocks`/`totalBlocks` — block counts require parsing the `.mcd` header; if not
cheap, return `usedBlocks: 0, totalBlocks: 15` and compute lazily on display). Seed
two default cards client-side if the user has none (matches Phase 1 UX) — or leave
empty and let the user create via the (future) memcard management UI. Decision:
keep the seeded defaults for UX continuity; mark them as local-only.

### N.4 `setMemorySlot` — persist assignment

> **Superseded** by [`specs/memory-manager-cloud-sync/`](../memory-manager-cloud-sync/spec.md)
> (WS5). Slot assignment is now the cloud `memory_cards.mounted` select field
> (source of truth) + a `{slot1:{id,label}|null, slot2:...}` binding cache in
> `localStorage` (`psflix:memcard-slots:<userId>`) read synchronously at boot
> and reconciled with the cloud `mounted` field on auth. The text below
> describes the original Phase 2 approach.

The mock kept slot assignment in memory. Phase 2 should persist the user's
slot↔card choice. Cheapest: store in `localStorage` keyed by `userId` (no schema
change). A cloud-backed assignment would need a new collection — out of scope; use
localStorage.

---

## O. Sync-status UX

### O.1 Sync indicator

The facade emits `state-sync-complete` after each pass. Surface this in the UI:

- Add a `syncing`/`synced`/`error` flag to the runtime store (or a dedicated
  `useSyncStatus` hook reading a new store slice).
- Show a small indicator in `ControlsPanel` or the `GameWindow` header (e.g. a
  spinning icon while syncing, a checkmark on completion, a warning on `fatal`
  sync errors). Use Material Symbols (already a dependency) per the design system.

### O.2 Invalidation

On `state-saved` and `state-sync-complete`, invalidate the `['save-states', ...]`
and `['memory-cards', ...]` react-query caches so the UI reflects fresh data. Wire
this in the adapter's event subscriptions; call `queryClient.invalidateQueries`.

### O.3 Conflict feedback

`SaveStateSyncEngine` resolves conflicts last-write-wins (the vendored
`saveStateConflict.ts` policy). On a download-overwriting-local event, optionally
toast "Newer save downloaded from another device." Keep this subtle; the
`state-sync-complete` event already triggers invalidation.

---

## P. Tests + verification

### P.1 Repository unit tests

`tests/console/services/psxAnywhereRepository.test.ts` — extend the Phase 1 suite
with `MockPb` (PSflix's existing `src/test/MockPb.ts`) covering:

- `resolveDiscId` cache hit/miss + 404 handling.
- `uploadSaveState` create-vs-update branch (mock `getFirstListItem` to 404 then
  succeed; then to found → `update`).
- `downloadSaveState` / `fetchSaveStateBytes` byte fetching.
- `hasRemoteState` / `hasRemoteMemcard` true/false.
- `fetchSaveStatesFor` filter + `expand: 'disc'` → DTO mapping.
- `uploadMemcard` / `downloadMemcard`.
- Auth gating: methods behave when `pb.authStore.record` is null.

### P.2 Vendored sync-engine tests (already migrated in Phase 1)

`save-state-sync-engine.test.ts`, `save-state-store.test.ts`, `memcard-sync.test.ts`
(now hitting the real repository methods against `MockPb` or `createMockRepository()`)
should pass unchanged — they already cover upload/download/conflict. Re-run them
to confirm the repository impl satisfies the contracts.

### P.3 Adapter tests

`psxAnywhereEmulatorService.test.ts` — verify:

- `listSaveStates` returns cloud records mapped to `SaveStateInfo`.
- `state-saved` / `state-sync-complete` triggers query invalidation (mock the queryClient).
- `deleteState` removes via repository.

### P.4 E2E (Playwright)

`e2e/` — PSflix already has Playwright. Add a cross-device sync test (two browser
contexts): sign in on both, save on A, assert it appears in B's slot list after a
sync pass. This requires a staging PocketBase with seed data; mark it `@slow` if CI
cost is a concern.

### P.5 Verify

```sh
npm run typecheck && npm run lint && npm test && npm run test:controller-guard
npm run build && npm run verify:build
```

Runtime:

1. Device A: sign in, play, save to `slot1`. Observe sync indicator → `synced`.
2. Device B: sign in as the same user, navigate to the same game. `slot1` appears
   in the load dialog with A's `updatedAt`. Load it.
3. Memory card: play a game that writes to the card; reload; the card persists.
   On device B, the card downloads on sign-in.
4. Sign out → save/load UI locks (existing `GameWindow.tsx:168-189` gate); local
   IDB saves remain accessible after re-sign-in.

---

## Phase 2 definition of done

- [ ] `resolveDiscId` / `lookupDiscSerial` implemented + cached.
- [ ] All `save_state` cloud methods implemented (upload/download/bytes/has/record/list).
- [ ] All `memory_cards` cloud methods implemented.
- [ ] `listSaveStates` reflects cloud records; `state-saved`/`state-sync-complete` invalidate queries.
- [ ] `listMemoryCards` returns user's cards; seeded defaults preserved for UX.
- [ ] `setMemorySlot` persists to `localStorage`.
- [ ] Sync-status indicator in the UI.
- [ ] `deleteState` wired (optional UI exposure).
- [ ] Repository + adapter + (optional) E2E tests green.
- [ ] Cross-device save + memcard sync verified manually (both slots — satisfied by `specs/memory-manager-cloud-sync/`).
- [ ] `AGENTS.md` updated to note cloud sync is live.

---

## Future work (out of Phase 2)

- **Rebind UI** — port `src/rebind-table.ts` equivalent; expose key/gamepad rebinding in `OptionsDialog`.
- **Gamepad / multi-port / non-standard controllers** — full `setController` richness (analog, DualShock, mouse, lightgun).
- **CRT shader controls** — expose `setCrtParam` in `OptionsDialog` with `EmulatorClient.CRT_SHADER_DEFAULT_PARAMS` for "reset".
- **`OptionsDialog` beyond stub** — video filters, BIOS/region selection (multi-`consoles` records), performance HUD.
- **Realtime** — PocketBase SSE/WS to push saves from other devices instantly (currently poll-on-sync-pass).
- **~~Cloud memcard slot assignment~~** — **done** in [`specs/memory-manager-cloud-sync/`](../memory-manager-cloud-sync/spec.md): the `mounted` select on `memory_cards` is the cloud source of truth, backed by a `localStorage` binding cache for boot-time restore; both slots round-trip.
