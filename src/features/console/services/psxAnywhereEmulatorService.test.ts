import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscsResponse } from '@/types/pocketbase';

// Shared call log. vi.hoisted runs before any vi.mock factory executes, so the
// factory below can safely close over this array.
const calls = vi.hoisted<string[]>(() => []);

vi.mock('emulator-client', () => {
  // Minimal fake of the vendored EmulatorClient facade: records the call order
  // so the test can assert controllers are pushed AFTER loadDisc resolves.
  class FakeEmulatorClient {
    static CONTROLLER = { STANDARD: 1, ANALOG: 0x0105, DUALSHOCK: 0x0205, MOUSE: 0x0102 };
    static SLOT_AUTO = -1;

    lastController: { port: number; device: number } | null = null;

    async boot(): Promise<void> {
      calls.push('boot');
    }
    // _wireEvents subscribes to many facade events; none are exercised here.
    addEventListener(): void {}
    removeEventListener(): void {}
    setCrt(): void {
      calls.push('setCrt');
    }
    setVolume(): void {
      calls.push('setVolume');
    }
    async loadDisc(): Promise<void> {
      calls.push('loadDisc');
    }
    setController(port: number, cfg: { device: number }): void {
      calls.push(`setController:${port}`);
      this.lastController = { port, device: cfg.device };
    }
    clearController(port: number): void {
      calls.push(`clearController:${port}`);
    }
    destroy(): void {}
  }
  return { EmulatorClient: FakeEmulatorClient };
});

vi.mock('@/lib/pb-files', () => ({
  fileUrl: () => 'https://example.test/api/files/games/d1/game.chd',
}));

import { EmulatorClient } from 'emulator-client';
import { PsxAnywhereEmulatorService } from './psxAnywhereEmulatorService';

describe('PsxAnywhereEmulatorService — controller config timing', () => {
  let service: InstanceType<typeof PsxAnywhereEmulatorService>;

  beforeEach(() => {
    calls.length = 0;
    service = new PsxAnywhereEmulatorService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('applies the selected controller ports after loadDisc, not at boot', async () => {
    // Regression: the selected device used to be pushed to the libretro core
    // during attachCanvas — before retro_init/retro_load_game ran — so the core
    // reset both ports to the default standard pad once the game loaded, and
    // the user's selection was silently dropped. The fix defers controller
    // application to after client.loadDisc() resolves (core fully initialized).
    service.setController(1, 'dualshock');
    service.setController(2, 'none');

    await service.attachCanvas(document.createElement('canvas'));

    const disc = { id: 'd1', serial: 'SLUS001', iso: 'game.chd' } as unknown as DiscsResponse;
    await service.loadDisc(disc);

    const loadDiscAt = calls.indexOf('loadDisc');
    expect(loadDiscAt).toBeGreaterThan(-1);

    // The boot path must push only CRT/volume — never controllers — before load.
    const beforeLoad = calls.slice(0, loadDiscAt);
    expect(beforeLoad).not.toContain('setController:0');
    expect(beforeLoad).not.toContain('clearController:1');

    // Both ports are applied strictly after the core loads the game.
    expect(calls.indexOf('setController:0')).toBeGreaterThan(loadDiscAt);
    expect(calls.indexOf('clearController:1')).toBeGreaterThan(loadDiscAt);

    // The *selected* DualShock device (not the default standard pad) is pushed.
    const client = (
      service as unknown as { _client: { lastController: { device: number } | null } }
    )._client;
    expect(client.lastController?.device).toBe(EmulatorClient.CONTROLLER.DUALSHOCK);
  });
});
