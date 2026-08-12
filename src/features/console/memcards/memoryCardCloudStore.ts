// Cloud card library store contract.
//
// The cloud card model (see specs/memory-manager-cloud-sync/spec.md) is a
// per-user library of named cards in PocketBase (`memory_cards`). Cloud
// identity is the record `id` (stable across renames); the `mounted` select
// (`slot1`/`slot2`) marks which card is active in each emulator slot.
//
// This interface is implemented by `PsxAnywhereMemoryCardStore` (over
// `psxAnywhereRepository`) and consumed by the cloud-aware `MemoryCardManager`.
// It is intentionally a separate, host-side concern — the vendored
// `Repository` interface stays focused on the sync engine's label-keyed bytes
// path; library CRUD + `mounted` live here.

/** Which slot a card is mounted into (`slot1`/`slot2`), or null when unmounted. */
export type MountedSlot = 'slot1' | 'slot2' | null;

/** A card as returned by the cloud library. */
export interface MemoryCardCloudEntry {
  /** PocketBase record id — stable across renames; the cloud identity. */
  id: string;
  /** Display name (mutable via `rename`). */
  label: string;
  /** Card image bytes, or null when not yet fetched (lazy — call `fetchBytes`). */
  bytes: Uint8Array | null;
  /** Slot this card is mounted into, or null when it is a spare. */
  mounted: MountedSlot;
  /** ISO timestamp of the cloud record's last update. */
  updated: string;
}

/**
 * Cloud card library store. All methods are owner-scoped (every
 * `memory_cards` rule is `@request.auth.id = user.id`) and require an
 * authenticated backend; the manager gates on a non-null `userId`.
 */
export interface MemoryCardCloudStore {
  /** List all of the user's cards (the library). Bytes may be null until
   *  `fetchBytes` is called for a card; the host decides eager vs lazy. */
  list(userId: string): Promise<MemoryCardCloudEntry[]>;

  /** Fetch a card's bytes by id. Returns null if the card has no file yet. */
  fetchBytes(userId: string, id: string): Promise<Uint8Array | null>;

  /** Create a new card in the library. Returns the new entry (id assigned by
   *  PocketBase). `bytes` optional (spare card with no image yet); `mounted`
   *  optional (create + mount in one step). */
  create(
    userId: string,
    label: string,
    bytes?: Uint8Array,
    mounted?: MountedSlot,
  ): Promise<MemoryCardCloudEntry>;

  /** Rename a card. Safe on a mounted card — only `label` changes; the record
   *  `id` and `mounted` are untouched. */
  rename(id: string, label: string): Promise<void>;

  /** Delete an unmounted card. The host enforces "not mounted"; the store
   *  trusts the caller. */
  remove(id: string): Promise<void>;

  /** Set or clear a card's `mounted` slot, enforcing slot exclusivity (clears
   *  the previous occupant of that slot). `slot: null` unmounts. */
  setMounted(userId: string, id: string, slot: MountedSlot): Promise<void>;

  /** Replace a card's bytes by id (e.g. persisting a format of a spare card
   *  outside the dirty-export path). Rename-safe: upserts by record `id`. */
  updateBytes(userId: string, id: string, bytes: Uint8Array): Promise<void>;
}
