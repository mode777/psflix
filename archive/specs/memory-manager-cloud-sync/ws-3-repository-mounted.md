# WS3 — Repository: `mounted` support + library CRUD

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** nothing (can
run in parallel with WS1/WS2). **Unblocks:** WS4.

## Goal

Make PSflix's `PsxAnywhereRepository` (`src/features/console/services/psxAnywhereRepository.ts`)
speak the **cloud card library** model: list cards with their `mounted` slot,
write `mounted` on mount/eject, upsert card bytes by record `id` (rename-safe),
and expose full library CRUD (create / rename / delete). The vendored
`Repository` interface itself is widened in WS1 with `recordId`; this
workstream adds `mounted` and the adapter-only library methods on the PSflix
side.

## Files

| File                                                     | Change                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/console/services/psxAnywhereRepository.ts` | `uploadMemcard` += `recordId`, `mounted`; `fetchMemcardsForUser` returns `mounted`; new `createMemcard` / `renameMemcard` / `deleteMemcard` / `setMemcardMounted`. |
| `src/types/pocketbase.ts`                                | Add `mounted` to `MemoryCardsRecord` (optional). Run `npm run typegen` to regenerate, or hand-edit and keep in sync.                                               |
| `tests/console/services/psxAnywhereRepository.test.ts`   | Add `mounted` round-trips, library CRUD, `setMemcardMounted` clears previous occupant.                                                                             |

## Design

All methods are owner-scoped (`pb_schema.json:827-831`: every rule is
`@request.auth.id = user.id`), so they require an authenticated `pb`. The
facade gates on `isAuthenticated()`; the PSflix store/manager should too.

### `uploadMemcard` — widen to `(buf, userId, label, recordId?, mounted?)`

`psxAnywhereRepository.ts:269-290` today sends only `user`, `label`, `data`
and upserts by `(label, user)` lookup. Change to:

```ts
async uploadMemcard(
  buf: ArrayBuffer,
  userId: string,
  label: string,
  recordId?: string,
  mounted?: 'slot1' | 'slot2' | null,
): Promise<unknown> {
  assertUserId(userId);
  assertLabel(label);

  let existing: { id: string } | null = null;
  if (recordId) {
    existing = { id: recordId };                       // trust the host (rename-safe)
  } else {
    try {
      existing = await pb
        .collection('memory_cards')
        .getFirstListItem(`label="${label}" && user="${userId}"`);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  const form = new FormData();
  form.append('user', userId);
  form.append('label', label);
  form.append('data', new Blob([buf as BlobPart]), 'memcard.mcd');
  if (mounted !== undefined) {
    form.append('mounted', mounted ?? '');              // '' clears the select
  }

  if (existing) return pb.collection('memory_cards').update(existing.id, form);
  return pb.collection('memory_cards').create(form);
}
```

Notes:

- **`recordId` path** skips the lookup entirely. WS1's `MemcardSync._doUpload`
  passes the binding's `id`, so a renamed card updates in place — no duplicate.
- **`mounted` only appended when defined** (`!== undefined`) so the dirty-upload
  path (bytes only) does not clobber an existing `mounted` value. The
  mount/eject path passes `mounted` explicitly to set/clear it.
- **Clearing a select** in PocketBase: append the empty string (`''`).
  Verify this against the running instance; if the SDK rejects `''`, append the
  JSON `null` via a small workaround (the schema marks `mounted` as
  `required: false`, so an empty value is valid).

### `fetchMemcardsForUser` — return `mounted`

`psxAnywhereRepository.ts:327-341` today returns `{id, label, data, updated}[]`.
Add `mounted`:

```ts
async fetchMemcardsForUser(
  userId: string,
): Promise<{
  id: string;
  label: string;
  data: string;
  updated: string;
  mounted: 'slot1' | 'slot2' | null;
}[]> {
  assertUserId(userId);
  const records: any[] = await pb
    .collection('memory_cards')
    .getFullList({ filter: `user="${userId}"` });
  return records.map((r) => ({
    id: r.id,
    label: r.label ?? '',
    data: r.data,
    updated: r.updated,
    mounted: normalizeMounted(r.mounted),
  }));
}
```

Where `normalizeMounted` tolerates legacy/odd values:

```ts
function normalizeMounted(v: unknown): 'slot1' | 'slot2' | null {
  return v === 'slot1' || v === 'slot2' ? v : null;
}
```

### New adapter-only methods (NOT on the vendored `Repository` interface)

Mirror the existing `deleteSaveStateBySlot` / `fetchMemcardsForUser` pattern:
these exist so the PSflix `MemoryCardCloudStore` (WS4) can drive the library
without widening the vendored contract.

```ts
/** Create a new card in the user's library. Bytes optional (spare card with
 *  no image yet). mounted optional (used when creating + mounting in one
 *  step — though mount is normally a separate setMemcardMounted call). */
async createMemcard(
  userId: string,
  label: string,
  bytes?: ArrayBuffer | Uint8Array,
  mounted?: 'slot1' | 'slot2' | null,
): Promise<{ id: string; label: string; mounted: 'slot1' | 'slot2' | null }> {
  assertUserId(userId);
  assertLabel(label);
  const form = new FormData();
  form.append('user', userId);
  form.append('label', label);
  if (bytes) {
    const ab = bytes instanceof Uint8Array ? bytes.buffer : bytes;
    form.append('data', new Blob([ab as BlobPart]), 'memcard.mcd');
  }
  if (mounted) form.append('mounted', mounted);
  const r: any = await pb.collection('memory_cards').create(form);
  return { id: r.id, label: r.label ?? label, mounted: normalizeMounted(r.mounted) };
}

/** Rename a library card. Safe on a mounted card: only `label` changes; the
 *  record `id` and `mounted` are untouched. The host (WS4) re-binds the slot
 *  with the new label so subsequent uploads key off the same id. */
async renameMemcard(recordId: string, label: string): Promise<void> {
  assertLabel(label);
  await pb.collection('memory_cards').update(recordId, { label });
}

/** Delete a card from the library. Refuse on the client side too if it is
 *  currently mounted (the host guards, but a defensive check here prevents
 *  orphaning a slot marker). */
async deleteMemcard(recordId: string): Promise<void> {
  await pb.collection('memory_cards').delete(recordId);
}

/** Set or clear a card's `mounted` slot, ensuring slot exclusivity: when
 *  mounting into slotN, first clear `mounted` on whichever card currently
 *  holds slotN for this user (the previous occupant). Two calls; not atomic
 *  but the single-session client makes the race negligible. */
async setMemcardMounted(
  userId: string,
  recordId: string,
  slot: 'slot1' | 'slot2' | null,
): Promise<void> {
  assertUserId(userId);
  if (slot) {
    // Clear the previous occupant of this slot (if any, if different).
    try {
      const prev = await pb
        .collection('memory_cards')
        .getFirstListItem(`mounted="${slot}" && user="${userId}"`);
      if (prev.id !== recordId) {
        await pb.collection('memory_cards').update(prev.id, { mounted: '' });
      }
    } catch (e) {
      if (!isNotFound(e)) throw e;       // no previous occupant is fine
    }
    await pb.collection('memory_cards').update(recordId, { mounted: slot });
  } else {
    await pb.collection('memory_cards').update(recordId, { mounted: '' });
  }
}
```

### Bytes fetch helper (already used by `downloadMemcard`)

`downloadMemcard` (`:292-308`) already resolves the file URL via `fileUrl` and
fetches. No change needed. The library list returns the `data` filename; the
store (WS4) uses `downloadMemcard(userId, label)` to pull bytes on demand when
a card is mounted or displayed with block counts. Keep `downloadMemcard`
label-keyed (it's on the vendored interface); for id-based fetch, the host
knows the label from the library row.

## Types

`src/types/pocketbase.ts` — `MemoryCardsRecord` (`:115-122`) gains
`mounted?: 'slot1' | 'slot2'` (matching the schema select values at
`pb_schema.json:904-907`). Regenerate with `npm run typegen` if a script
exists (check `package.json`); otherwise hand-add the field and keep the
comment noting it mirrors `pb_schema.json`.

## Tests

File: `tests/console/services/psxAnywhereRepository.test.ts`. Extend the
existing `memory_cards` collection mock (it likely follows the
`saveStateCollection()` pattern at `:78-90`) with a `mounted` field and a
record store.

### New coverage

- **`fetchMemcardsForUser` returns `mounted`:** seed two records (one
  `mounted: 'slot1'`, one `mounted: null`); assert the array carries the field
  and that `normalizeMounted` coerces odd values (`undefined`, `''`, `'foo'`)
  to `null`.
- **`uploadMemcard` with `recordId`:** seed a record; call `uploadMemcard(buf,
userId, label, recordId)` → assert `update(recordId, …)` is called and no
  `getFirstListItem` lookup happens.
- **`uploadMemcard` with `mounted`:** assert the FormData carries `mounted`;
  with `mounted: null` it carries `''` (clears).
- **`uploadMemcard` without `mounted`:** assert `mounted` is NOT appended
  (dirty-upload path must not clobber the slot marker).
- **`createMemcard`:** assert `create` is called with `user`, `label`, and
  `data` only when bytes are provided; returns `{id, label, mounted}`.
- **`renameMemcard`:** assert `update(id, { label })` and that `mounted` is
  untouched (the mock record keeps its `mounted`).
- **`deleteMemcard`:** assert `delete(id)` is called.
- **`setMemcardMounted` mounts:** with no previous occupant → one `update` (sets `mounted`).
- **`setMemcardMounted` clears previous occupant:** seed a card with
  `mounted: 'slot1'`; mount a different card into slot1 → assert two `update`
  calls: first clears the previous occupant, second sets the new card.
- **`setMemcardMounted` unmount (`slot: null`):** single `update` clearing the
  target's `mounted`.
- **`setMemcardMounted` no-op when same card re-mounted:** mounting the card
  that already holds the slot → only one `update` (or zero, if optimized);
  document the chosen behavior.

Auth gating: assert these throw / behave when `pb.authStore.record` is null
(matching the existing pattern in the file).

## Verify (this workstream alone)

```sh
npm test -- psxAnywhereRepository
npm run typecheck
npm run lint
```

`npm run typegen` (if present) to regenerate `src/types/pocketbase.ts` with the
`mounted` field on `MemoryCardsRecord`.

## Out of scope for WS3

- The `MemoryCardCloudStore` interface + impl that consumes these methods
  (WS4).
- The `MemoryCardManager` cloud-awareness (WS4).
- Schema change / unique index (decision #5: none).
- The vendored `PocketbaseRepository.uploadMemcard` — that's WS1's concern
  (and PSflix does not use that class anyway).
