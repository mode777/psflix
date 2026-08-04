'use strict';

import { CONTROLLER } from 'emulator-core';
import { loadJson, saveJson, noopLog, type LogFn } from './local-json';

export interface ControllerStoreEntry {
  device: number;
  source: string;
  gamepadIndex: number;
}

const CONTROLLERS_STORE_KEY = 'psanywhere-controllers-v1';

// ── Injectable persistence backend ────────────────────────────────────

export interface ControllerStorage {
  load(): Record<number, ControllerStoreEntry>;
  save(store: Record<number, ControllerStoreEntry>): void;
}

export class LocalControllerStorage implements ControllerStorage {
  private readonly log: LogFn;
  constructor(log: LogFn = noopLog) {
    this.log = log;
  }
  load(): Record<number, ControllerStoreEntry> {
    return loadJson(CONTROLLERS_STORE_KEY, this.log, {});
  }
  save(store: Record<number, ControllerStoreEntry>): void {
    saveJson(CONTROLLERS_STORE_KEY, store, this.log);
  }
}

export class MemoryControllerStorage implements ControllerStorage {
  private _store: Record<number, ControllerStoreEntry> = {};
  load(): Record<number, ControllerStoreEntry> {
    return { ...this._store };
  }
  save(store: Record<number, ControllerStoreEntry>): void {
    this._store = { ...store };
  }
}

// ── Eager name lookup (no mutable singleton) ──────────────────────────

const CONTROLLER_NAME_BY_VALUE: ReadonlyMap<number, string> = new Map(
  Object.entries(CONTROLLER).map(([name, value]) => [value as number, name.toLowerCase()]),
);

// ── ControllerStore ───────────────────────────────────────────────────

export class ControllerStore {
  constructor(private readonly storage: ControllerStorage) {}

  static forLocalStorage(log?: LogFn): ControllerStore {
    return new ControllerStore(new LocalControllerStorage(log));
  }

  static forMemory(): ControllerStore {
    return new ControllerStore(new MemoryControllerStorage());
  }

  get(port: number): ControllerStoreEntry | undefined {
    return this.storage.load()[port];
  }

  set(port: number, entry: ControllerStoreEntry): void {
    const store = this.storage.load();
    store[port] = entry;
    this.storage.save(store);
  }

  dump(): Record<number, ControllerStoreEntry> {
    return this.storage.load();
  }
}

// ── Formatting helpers ────────────────────────────────────────────────

export function formatDeviceHex(device: number): string {
  return '0x' + (device | 0).toString(16).padStart(3, '0');
}

export function controllerTypeName(device: number): string {
  return CONTROLLER_NAME_BY_VALUE.get(device) || formatDeviceHex(device);
}

// ── Backward-compatible free functions ────────────────────────────────

export function loadControllersStore(log: LogFn = noopLog): Record<number, ControllerStoreEntry> {
  return new LocalControllerStorage(log).load();
}

export function saveControllersStore(
  store: Record<number, ControllerStoreEntry>,
  log: LogFn = noopLog,
): void {
  new LocalControllerStorage(log).save(store);
}
