// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ControllerStore,
  MemoryControllerStorage,
  formatDeviceHex,
  controllerTypeName,
} from '@/vendor/psxanywhere/client/controller-store';

describe('MemoryControllerStorage', () => {
  it('returns an empty record when nothing is stored', () => {
    const s = new MemoryControllerStorage();
    expect(s.load()).toEqual({});
  });

  it('round-trips entries via load/save', () => {
    const s = new MemoryControllerStorage();
    s.save({ 0: { device: 0x001, source: 'keyboard', gamepadIndex: -1 } });
    const loaded = s.load();
    expect(loaded[0]).toEqual({ device: 0x001, source: 'keyboard', gamepadIndex: -1 });
  });

  it('returns a copy on load, not a reference', () => {
    const s = new MemoryControllerStorage();
    s.save({ 0: { device: 0x001, source: 'keyboard', gamepadIndex: -1 } });
    const a = s.load();
    const b = s.load();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('overwrites the entire store on save', () => {
    const s = new MemoryControllerStorage();
    s.save({ 0: { device: 0x001, source: 'keyboard', gamepadIndex: -1 } });
    s.save({ 1: { device: 0x102, source: 'mouse', gamepadIndex: -1 } });
    const loaded = s.load();
    expect(loaded[0]).toBeUndefined();
    expect(loaded[1]!.device).toBe(0x102);
  });
});

describe('ControllerStore', () => {
  it('get returns undefined for an unpopulated port', () => {
    const store = ControllerStore.forMemory();
    expect(store.get(0)).toBeUndefined();
  });

  it('set/get round-trips a single port', () => {
    const store = ControllerStore.forMemory();
    store.set(0, { device: 0x001, source: 'keyboard', gamepadIndex: -1 });
    expect(store.get(0)).toEqual({ device: 0x001, source: 'keyboard', gamepadIndex: -1 });
  });

  it('set is scoped to the given port', () => {
    const store = ControllerStore.forMemory();
    store.set(0, { device: 0x001, source: 'keyboard', gamepadIndex: -1 });
    store.set(2, { device: 0x105, source: 'gamepad', gamepadIndex: 0 });
    expect(store.get(0)!.device).toBe(0x001);
    expect(store.get(1)).toBeUndefined();
    expect(store.get(2)!.device).toBe(0x105);
  });

  it('set overwrites an existing entry for the same port', () => {
    const store = ControllerStore.forMemory();
    store.set(0, { device: 0x001, source: 'keyboard', gamepadIndex: -1 });
    store.set(0, { device: 0x205, source: 'gamepad', gamepadIndex: 2 });
    expect(store.get(0)!.device).toBe(0x205);
    expect(store.get(0)!.gamepadIndex).toBe(2);
  });

  it('dump returns all entries', () => {
    const store = ControllerStore.forMemory();
    store.set(0, { device: 0x001, source: 'keyboard', gamepadIndex: -1 });
    store.set(3, { device: 0x305, source: 'gamepad', gamepadIndex: 1 });
    const all = store.dump();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all[0]).toEqual({ device: 0x001, source: 'keyboard', gamepadIndex: -1 });
    expect(all[3]).toEqual({ device: 0x305, source: 'gamepad', gamepadIndex: 1 });
  });
});

describe('formatDeviceHex', () => {
  it('formats standard device as 3-digit hex', () => {
    expect(formatDeviceHex(0x001)).toBe('0x001');
    expect(formatDeviceHex(0x105)).toBe('0x105');
    expect(formatDeviceHex(0x205)).toBe('0x205');
  });

  it('formats zero', () => {
    expect(formatDeviceHex(0)).toBe('0x000');
  });

  it('formats large device values', () => {
    expect(formatDeviceHex(0xfff)).toBe('0xfff');
    expect(formatDeviceHex(0x305)).toBe('0x305');
  });
});

describe('controllerTypeName', () => {
  it('returns lowercase name for known devices', () => {
    expect(controllerTypeName(0x001)).toBe('standard');
    expect(controllerTypeName(0x105)).toBe('analog');
    expect(controllerTypeName(0x205)).toBe('dualshock');
    expect(controllerTypeName(0x305)).toBe('negcon');
    expect(controllerTypeName(0x102)).toBe('mouse');
    expect(controllerTypeName(0x104)).toBe('guncon');
    expect(controllerTypeName(0x204)).toBe('justifier');
  });

  it('falls back to hex for unknown devices', () => {
    expect(controllerTypeName(0x999)).toBe('0x999');
    expect(controllerTypeName(0)).toBe('0x000');
  });
});
