# WS1 — Vendored `MemcardSync`: slot- + label-aware (both slots)

Part of [Memory Manager Cloud Sync](./spec.md). **Depends on:** nothing.
**Unblocks:** WS2.

## Goal

Replace the single-slot model in `src/vendor/psxanywhere/client/MemcardSync.ts`
(slot 1, label `'default'`) with a **per-slot** model keyed by a host-supplied
binding `{ id, label }`. Both slots 1 and 2 then round-trip through the cloud,
each under its own bound identity. Also widen the vendored `Repository`
interface so uploads can upsert by record `id` (rename-safe).

This is the load-bearing fix: today `onMemcardDirty` early-returns for
`slot !== 1` (`MemcardSync.ts:85`) and slot 2 dirty exports never upload.

## Files

| File                                                         | Change                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/vendor/psxanywhere/client/MemcardSync.ts`               | Rewrite to per-slot state; new `setSlotBinding`; both slots sync. |
| `src/vendor/psxanywhere/repository/repository.ts`            | Widen `Repository.uploadMemcard` with optional `recordId`.        |
| `tests/vendor/psxanywhere/client/memcard-sync.test.ts`       | Update slot-1-only tests; add slot-2 + binding coverage.          |
| `tests/vendor/psxanywhere/client/helpers/repository-mock.ts` | Capture `recordId`; per-slot download impls.                      |

No PSflix-code changes in this workstream (the vendored tree stays
self-contained; PSflix wires it in WS2/WS5).

## Design

### Constants & state (replace the single-slot fields)

Today (`MemcardSync.ts:12-13`):

```ts
const MEMCARD_SLOT = 1;
const MEMCARD_LABEL = 'default';
```

Becomes per-slot state:

```ts
const SLOTS = [1, 2] as const;
type Slot = (typeof SLOTS)[number];

interface SlotBinding {
  id: string; // PocketBase record id — stable across renames; used for upsert
  label: string; // display name / cloud lookup key (legacy path)
}

interface SlotState {
  binding: SlotBinding | null;
  lastUploadedHash: string | null;
  pendingBytes: ArrayBuffer | null;
  dirtyTimer: ReturnType<typeof setTimeout> | null;
}
```

The class holds `private readonly _slots: Map<Slot, SlotState>` initialized
with empty state for both slots. The debounce/dedup constants
(`UPLOAD_DEBOUNCE_MS = 5000`, `RETRY_WHILE_UPLOADING_MS = 1000`) and the
shared `_uploading` flag stay; the `_pendingDownload` promise stays (it now
covers both slots in one pass).

A single `_uploading` boolean is acceptable because uploads are serialized
through `_flushUpload`/`_doUpload` and the re-arm path already handles
"touch arrived mid-flight." Keep the existing re-arm semantics, but check
per-slot pending bytes in the `finally` block.

### Public API

```ts
/** Host declares which cloud card (id+label) is mounted in a slot.
 *  Pass null to unbind (eject). Resets that slot's lastUploadedHash so the
 *  next dirty export under the new identity uploads (not dedup-skipped). */
setSlotBinding(slot: Slot, binding: SlotBinding | null): void;

/** Per-slot dirty hook. No-op if the slot has no binding or repo is unauthed.
 *  Both slots are now handled (the old `if (slot !== 1) return` guard is
 *  removed). Replaces the existing onMemcardDirty. */
onMemcardDirty(slot: number, bytes: ArrayBuffer | Uint8Array): void;

/** Download every *bound* slot's cloud card → storage. Deterministic entry
 *  point (also used by tests + onAuthChange). */
syncNow(): Promise<void>;

/** Await the in-flight syncNow (if any) before the worker loads cards. */
ensureDownloaded(): Promise<void>;

/** Auth state change: on auth, syncNow(); on de-auth, clear per-slot state. */
onAuthChange(authed: boolean): void;

dispose(): void;
```

### `setSlotBinding` semantics (critical)

- Stores the binding in `_slots.get(slot)`.
- Sets `lastUploadedHash = null` for that slot so the **next** dirty export
  uploads unconditionally (the in-IDB bytes may differ from the new card's
  cloud bytes; we must push to establish the binding).
- Cancels any pending `dirtyTimer` for that slot and clears `pendingBytes`
  (stale bytes from the previous card must not upload under the new identity).
- Does **not** itself upload — the host pushes the card's bytes to the emulator
  via `importMemcard` (WS4), the worker's 5s dirty poll fires
  `memcard-exported`, and `onMemcardDirty` uploads under the new binding.

Edge: if the host binds a slot whose bytes already match the cloud card (no
dirty export fires), the upload never happens. That is fine — the cloud
already has those bytes. If the host wants a forced sync, it calls
`syncNow()` (which downloads; the upload path remains dirty-triggered). This
matches the existing model: uploads are always dirty-triggered, downloads are
auth/`syncNow`-triggered.

### `onMemcardDirty` (per-slot)

Mirrors today's logic (`MemcardSync.ts:84-93`) but parameterized by slot:

```ts
onMemcardDirty(slot: number, bytes: ArrayBuffer | Uint8Array): void {
  if (slot !== 1 && slot !== 2) return;     // ignore unknown slots
  if (!this._repo.isAuthenticated()) return;
  const st = this._slots.get(slot as Slot);
  if (!st || !st.binding) return;            // <-- was: if (slot !== 1) return
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  st.pendingBytes = u8.slice().buffer as ArrayBuffer;
  this._armTimer(st, UPLOAD_DEBOUNCE_MS);
}
```

### `_flushUpload` / `_doUpload` (per-slot)

`_flushUpload` is shared (single `_uploading` flag). It scans both slots for
pending bytes and uploads the most recent one, re-arming if mid-flight (as
today). `_doUpload(buf, slot)` resolves the slot's binding and calls:

```ts
await this._repo.uploadMemcard(buf, userId, st.binding.label, st.binding.id);
```

The new optional `recordId` arg tells the repository to update by id (rename-
safe). On success, store `st.lastUploadedHash = hash`. On failure, leave the
hash unchanged (retry on next dirty export) — same policy as today.

If multiple slots have pending bytes simultaneously (both cards dirty), upload
them sequentially within a single `_flushUpload` pass: drain slot 1 then slot
2 before clearing `_uploading`. (Order does not matter; both are independent
records.)

### `syncNow` / `_doDownload` (both bound slots)

```ts
async syncNow(): Promise<void> {
  if (!this._repo.isAuthenticated()) return;
  this._pendingDownload = this._doDownload();
  try { await this._pendingDownload; } finally { this._pendingDownload = null; }
}

private async _doDownload(): Promise<void> {
  const userId = this._repo.getCurrentUserId();
  if (!userId) return;
  this._onSyncStart?.();
  for (const slot of SLOTS) {
    const st = this._slots.get(slot)!;
    if (!st.binding) continue;               // unbound slot: skip
    try {
      const { buf } = await this._repo.downloadMemcard(userId, st.binding.label);
      await this._storage.save(slot, buf);
      this._log('info', `memcard-sync: slot ${slot} downloaded (${buf.byteLength} bytes)`);
    } catch (e: unknown) {
      // 404 (no cloud card yet for this label) is benign — leave IDB as-is.
      this._log('warn', `memcard-sync: slot ${slot} download failed: ${formatErr(e)}`);
    }
  }
  this._showToast('Memcard synced');
  this._onSyncComplete?.();
}
```

Fire `onSyncStart`/`onSyncComplete` **once per pass** (not per slot) so the
`SyncChip` UX is unchanged. A 404 on one slot must not abort the other slot's
download — wrap each in its own try/catch.

### `onAuthChange`, `dispose`, `_clearTransientState`

Operate across both slots:

- `onAuthChange(true)` → `syncNow()` (downloads both bound slots).
- `onAuthChange(false)` → iterate slots: clear `lastUploadedHash`,
  `pendingBytes`, cancel `dirtyTimer`; reset `_pendingDownload`.
- `dispose()` → set `_disposed`, cancel all timers, clear pending bytes.

### `_armTimer` (per-slot)

Takes the `SlotState` so each slot has its own timer:

```ts
private _armTimer(st: SlotState, ms: number): void {
  if (st.dirtyTimer) clearTimeout(st.dirtyTimer);
  st.dirtyTimer = setTimeout(() => {
    st.dirtyTimer = null;
    this._flushUpload();
  }, ms);
}
```

## Repository interface widening

`src/vendor/psxanywhere/repository/repository.ts:105`:

```ts
// was:
uploadMemcard(buf: ArrayBuffer, userId: string, label: string): Promise<unknown>;
// becomes:
uploadMemcard(
  buf: ArrayBuffer,
  userId: string,
  label: string,
  recordId?: string,
): Promise<unknown>;
```

Update the vendored `PocketbaseRepository.uploadMemcard` (`:314-337`) to honor
`recordId`: when provided, skip the `getFirstListItem` lookup and
`update(recordId, form)` directly. When absent, keep the current label-based
upsert (backward compat for any caller that doesn't pass an id). PSflix's
`PsxAnywhereRepository.uploadMemcard` is updated in WS3 to match (and to also
accept `mounted`).

The mock `createMockRepository` (`tests/.../helpers/repository-mock.ts:156-160`)
captures `{ buf, userId, label }` today; extend to capture `recordId?` too.
Add a per-slot `downloadMemcardImpl` keyed by label so tests can return
different bytes for slot1 vs slot2.

## Tests

File: `tests/vendor/psxanywhere/client/memcard-sync.test.ts`.

### Update existing tests

- **"ignores non-slot-1 dirty exports" (`:208-214`)** → rename to **"ignores
  dirty exports for unbound slots"**: with no `setSlotBinding`, both slots'
  dirty exports are no-ops. Keep the assertion shape (`calls.uploadMemcard`
  length 0).
- The slot-1 tests ("debounces multiple rapid touches", "resets the debounce
  window", "fires upload after debounce", hash dedup, upload failure, re-arm,
  Uint8Array tolerance, onAuthChange, dispose) all need a `sync.setSlotBinding(1, { id: 'c1', label: 'card-1' })`
  in their setup, otherwise dirty exports are no-ops under the new model.
  After that change, assertions are unchanged.
- The download tests ("syncNow downloads when authed", "saves downloaded bytes
  to slot 1") still pass after `setSlotBinding(1, …)` is added; without a
  binding, `syncNow` downloads nothing (add a "syncNow is a no-op with no
  bindings" test).

### New coverage

- **Slot 2 round-trip:** `setSlotBinding(2, {id:'c2',label:'card-2'})` →
  `onMemcardDirty(2, buf)` → after debounce →
  `calls.uploadMemcard[0]` has `label='card-2'`, `recordId='c2'`.
- **Both slots simultaneously:** bind both; dirty both; expect two uploads
  with the right `(label, recordId)` per slot.
- **Re-bind resets hash:** upload under binding A; `setSlotBinding(1, B)` →
  next dirty export with **same bytes** uploads again (hash was cleared).
- **Re-bind cancels pending:** dirty slot 1; before the debounce fires,
  `setSlotBinding(1, …)` → no upload of the stale pending bytes fires (timer
  cleared).
- **Unbind (`setSlotBinding(1, null)`):** subsequent `onMemcardDirty(1, …)` is
  a no-op.
- **`syncNow` downloads both bound slots' bytes into the right IDB keys:**
  bind both with different labels and `downloadMemcardImpl` returning distinct
  bytes per label; assert `storage.load(1)` and `storage.load(2)` hold the
  right bytes.
- **`syncNow` continues on per-slot 404:** slot 1 download resolves, slot 2
  rejects (404) → slot 1 bytes still land in IDB; `onSyncComplete` fires once.
- **`recordId` is forwarded:** `calls.uploadMemcard[0].recordId` equals the
  binding's id.

## Verify (this workstream alone)

```sh
npm test -- memcard-sync
npm run typecheck
npm run lint
```

All vendored memcard-sync tests must pass under the new per-slot model. No
PSflix code depends on this yet, so no integration test changes.

## Out of scope for WS1

- PSflix-side wiring of `setSlotBinding` (WS5) — here, only the vendored
  engine is made capable.
- `EmulatorClient` pass-through methods (WS2).
- The PSflix `PsxAnywhereRepository.uploadMemcard` widening to also accept
  `mounted` (WS3) — here we only widen the interface signature with
  `recordId`.
- `mounted` field semantics (WS3/WS4).
