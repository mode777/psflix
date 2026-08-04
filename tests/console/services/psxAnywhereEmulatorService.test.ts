import { describe, expect, it } from 'vitest';
import {
  mapSlot,
  PsxAnywhereEmulatorService,
} from '@/features/console/services/psxAnywhereEmulatorService';
import { EmulatorClient } from 'emulator-client';

describe('mapSlot', () => {
  it("maps 'auto' to the facade SLOT_AUTO sentinel", () => {
    expect(mapSlot('auto')).toBe(EmulatorClient.SLOT_AUTO);
  });

  it('maps slotN → N-1 (zero-based port index)', () => {
    expect(mapSlot('slot1')).toBe(0);
    expect(mapSlot('slot2')).toBe(1);
    expect(mapSlot('slot3')).toBe(2);
  });
});

describe('PsxAnywhereEmulatorService — synchronous surface (pre-attach)', () => {
  it('defaults to an idle runtime with no disc', () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(svc.getRuntime()).toEqual({ status: 'idle', currentDiscId: null, elapsedMs: 0 });
    expect(svc.getCanvas()).toBeNull();
    expect(svc.getFatal()).toBeNull();
  });

  it('exposes default controller ports', () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(svc.getControllerPorts()).toEqual({ port1: 'standard', port2: 'none' });
  });

  it('returns a stable default memory-slot assignment per user', () => {
    const svc = new PsxAnywhereEmulatorService();
    const a = svc.getMemorySlotAssignment('user-a');
    const b = svc.getMemorySlotAssignment('user-a');
    expect(a).toEqual({ slot1: 'mc-main', slot2: null });
    // Same reference until mutated — keeps useSyncExternalStore stable.
    expect(a).toBe(b);
  });

  it('seeds memory cards (Phase 1 local-only defaults)', async () => {
    const svc = new PsxAnywhereEmulatorService();
    const cards = await svc.listMemoryCards('user-a');
    expect(cards.map((c) => c.id)).toEqual(['mc-main', 'mc-rpg']);
  });

  it('listSaveStates returns [] before a client is attached', async () => {
    const svc = new PsxAnywhereEmulatorService();
    expect(await svc.listSaveStates('disc-1', 'user-a')).toEqual([]);
  });

  it('requires an attached client for loadState and surfaces the "no save" message shape', async () => {
    const svc = new PsxAnywhereEmulatorService();
    // No canvas attached → _requireClient throws before reaching the facade.
    await expect(svc.loadState('slot1', 'disc-1', 'user-a')).rejects.toThrow(/attach/);
  });

  it('persists settings changes (localStorage round-trip)', () => {
    const svc = new PsxAnywhereEmulatorService();
    svc.setSettings({ masterVolume: 42, crtFilter: false });
    expect(svc.getSettings()).toEqual({ masterVolume: 42, crtFilter: false });
    const raw = localStorage.getItem('psflix:console-settings');
    expect(JSON.parse(raw ?? '{}')).toEqual({ masterVolume: 42, crtFilter: false });
  });
});
