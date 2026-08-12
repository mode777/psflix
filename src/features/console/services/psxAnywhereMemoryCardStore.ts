// Cloud card library store backed by PocketBase via `psxAnywhereRepository`.
//
// Thin adapter that maps the `MemoryCardCloudStore` contract (library CRUD +
// `mounted`) onto the repository's adapter-only helpers (`createMemcard` /
// `renameMemcard` / `deleteMemcard` / `setMemcardMounted` / `fetchMemcardsForUser`)
// plus the vendored `Repository` label-keyed bytes path (`downloadMemcard` /
// `uploadMemcard`). Cloud identity is the record `id`; bytes are fetched
// label-keyed (the vendored contract) with the id resolved from the library.
//
// Consumed by the cloud-aware `MemoryCardManager`. WS5 owns constructing the
// singleton and wiring it into the manager.

import { psxAnywhereRepository } from './psxAnywhereRepository';
import type {
  MemoryCardCloudEntry,
  MemoryCardCloudStore,
  MountedSlot,
} from '../memcards/memoryCardCloudStore';

export class PsxAnywhereMemoryCardStore implements MemoryCardCloudStore {
  async list(userId: string): Promise<MemoryCardCloudEntry[]> {
    const records = await psxAnywhereRepository.fetchMemcardsForUser(userId);
    return records.map((r) => ({
      id: r.id,
      label: r.label || 'Memory Card',
      // Lazy: bytes fetched on demand via `fetchBytes` (e.g. for mounted cards
      // + block counts). Spares stay null until mounted.
      bytes: null,
      mounted: r.mounted,
      updated: r.updated,
    }));
  }

  async fetchBytes(userId: string, id: string): Promise<Uint8Array | null> {
    // The vendored download is label-keyed; resolve the label from the library.
    const entry = (await this.list(userId)).find((e) => e.id === id);
    if (!entry) return null;
    try {
      const { buf } = await psxAnywhereRepository.downloadMemcard(userId, entry.label);
      return new Uint8Array(buf);
    } catch {
      return null; // 404 / no file yet — treat as empty
    }
  }

  async create(
    userId: string,
    label: string,
    bytes?: Uint8Array,
    mounted?: MountedSlot,
  ): Promise<MemoryCardCloudEntry> {
    const r = await psxAnywhereRepository.createMemcard(
      userId,
      label,
      bytes ?? undefined,
      mounted ?? null,
    );
    return {
      id: r.id,
      label: r.label,
      bytes: bytes ?? null,
      mounted: r.mounted,
      updated: new Date().toISOString(),
    };
  }

  async rename(id: string, label: string): Promise<void> {
    return psxAnywhereRepository.renameMemcard(id, label);
  }

  async remove(id: string): Promise<void> {
    return psxAnywhereRepository.deleteMemcard(id);
  }

  async setMounted(userId: string, id: string, slot: MountedSlot): Promise<void> {
    return psxAnywhereRepository.setMemcardMounted(userId, id, slot);
  }

  async updateBytes(userId: string, id: string, bytes: Uint8Array): Promise<void> {
    // Rename-safe upsert by record id; label is informational (resolved from
    // the library for the legacy lookup fallback).
    const entry = (await this.list(userId)).find((e) => e.id === id);
    if (!entry) return;
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    await psxAnywhereRepository.uploadMemcard(ab, userId, entry.label, id);
  }
}
