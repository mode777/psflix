import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, loadControllers, saveControllers } from './persistedSlices';

afterEach(() => localStorage.clear());

describe('persistedSlices — settings', () => {
  it('defaults to crtFilter on + volume 85 when nothing is stored', () => {
    expect(loadSettings()).toEqual({ crtFilter: true, masterVolume: 85 });
  });

  it('round-trips settings and clamps volume to [0, 100]', () => {
    saveSettings({ crtFilter: false, masterVolume: 42 });
    expect(loadSettings()).toEqual({ crtFilter: false, masterVolume: 42 });

    saveSettings({ crtFilter: true, masterVolume: 999 });
    expect(loadSettings().masterVolume).toBe(100);
  });

  it('falls back per-field on invalid stored values', () => {
    localStorage.setItem(
      'psflix:console-settings',
      JSON.stringify({ crtFilter: 'yes', masterVolume: 'loud' }),
    );
    expect(loadSettings()).toEqual({ crtFilter: true, masterVolume: 85 });
  });
});

describe('persistedSlices — controllers', () => {
  it('defaults to standard / none when nothing is stored', () => {
    expect(loadControllers()).toEqual({ port1: 'standard', port2: 'none' });
  });

  it('round-trips controller selections', () => {
    saveControllers({ port1: 'dualshock', port2: 'mouse' });
    expect(loadControllers()).toEqual({ port1: 'dualshock', port2: 'mouse' });
  });

  it('rejects unknown controller values back to the per-port default', () => {
    localStorage.setItem(
      'psflix:console-controllers',
      JSON.stringify({ port1: 'gamepad', port2: 'dualshock' }),
    );
    expect(loadControllers()).toEqual({ port1: 'standard', port2: 'dualshock' });
  });

  it('stores settings and controllers under separate keys', () => {
    saveSettings({ crtFilter: false, masterVolume: 10 });
    saveControllers({ port1: 'mouse', port2: 'standard' });
    expect(localStorage.getItem('psflix:console-settings')).toContain('crtFilter');
    expect(localStorage.getItem('psflix:console-controllers')).toContain('port1');
    expect(localStorage.getItem('psflix:console-settings')).not.toContain('port1');
  });
});
