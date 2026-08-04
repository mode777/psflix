import type { Repository, SaveStateRecordDto } from 'repository';
import { pb } from '@/lib/pb';
import { fileUrl } from '@/lib/pb-files';

/**
 * PsxAnywhereRepository adapts PSflix's PocketBase singleton (`pb`) onto
 * PSxAnywhere's `Repository` interface so the vendored `EmulatorClient`
 * facade can talk to the same backend PSflix uses — one auth source, one
 * token store.
 *
 * Phase 1 implements only what the facade needs to boot a disc + fetch the
 * BIOS (auth + `fetchBiosUrl`). The cloud save-state / memcard / disc-id
 * methods are stubbed so the facade's sync engines no-op: save states and
 * memory cards persist to local IndexedDB only. Cloud sync lands in Phase 2.
 *
 * Because it wraps the same `pb` instance `SignInDialog` writes to, sign-in /
 * sign-out updates `pb.authStore`, which fires `onAuthChange` → the facade's
 * sync engines react (no-ops in Phase 1, wired for Phase 2).
 */
class PsxAnywhereRepository implements Repository {
  // ── Auth (delegate to PSflix's pb) ───────────────────────────────────

  isAuthenticated(): boolean {
    return pb.authStore.isValid && !!pb.authStore.record;
  }

  currentUsername(): string | null {
    const r = pb.authStore.record;
    return r ? r.username || r.email || r.name || r.id : null;
  }

  onAuthChange(callback: () => void): void {
    pb.authStore.onChange(() => callback());
  }

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    await pb.collection('users').authWithPassword(email, password);
  }

  async registerWithEmailPassword(email: string, password: string): Promise<void> {
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    await pb.collection('users').authWithPassword(email, password);
  }

  logout(): void {
    pb.authStore.clear();
  }

  getCurrentUserId(): string | null {
    return pb.authStore.record?.id ?? null;
  }

  // ── BIOS (Phase 1 needs this — the facade fetches the BIOS at loadDisc) ──

  async fetchBiosUrl(): Promise<string> {
    const record = await pb.collection('consoles').getFirstListItem('');
    const bios = record.bios as string;
    return fileUrl(record, bios);
  }

  // ── Catalog (unused — PSflix has its own react-query catalog) ─────────

  async fetchGames(): Promise<never> {
    throw new Error('fetchGames not used — PSflix has its own catalog');
  }

  // ── Phase 1 stubs (local-only IDB; cloud sync is Phase 2) ────────────

  async resolveDiscId(): Promise<never> {
    throw new Error('resolveDiscId: Phase 2');
  }

  async lookupDiscSerial(): Promise<never> {
    throw new Error('lookupDiscSerial: Phase 2');
  }

  async uploadSaveState(): Promise<never> {
    throw new Error('uploadSaveState: Phase 2');
  }

  async downloadSaveState(): Promise<never> {
    throw new Error('downloadSaveState: Phase 2');
  }

  async fetchSaveStateBytes(): Promise<never> {
    throw new Error('fetchSaveStateBytes: Phase 2');
  }

  async hasRemoteState(): Promise<boolean> {
    return false;
  }

  async getSaveStateRecord(): Promise<never> {
    throw new Error('getSaveStateRecord: Phase 2');
  }

  async fetchNewerSaveStates(): Promise<never[]> {
    return [];
  }

  async fetchSaveStatesFor(): Promise<SaveStateRecordDto[]> {
    return [];
  }

  async uploadMemcard(): Promise<never> {
    throw new Error('uploadMemcard: Phase 2');
  }

  async downloadMemcard(): Promise<never> {
    throw new Error('downloadMemcard: Phase 2');
  }

  async hasRemoteMemcard(): Promise<boolean> {
    return false;
  }
}

export const psxAnywhereRepository: Repository = new PsxAnywhereRepository();
