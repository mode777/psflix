'use strict';

// Centralized rebind persistence. Previously the load/mutate/save sequence for
// rebinds was duplicated between input.ts (setRebind/setGamepadRebind) and
// rebind-capture.ts (finishCaptureKey/finishCaptureGamepad). RebindStore is the
// single owner of that logic; callers only mutate the in-memory writer map.
//
// The storage backend is injectable (RebindStorage interface) so the store can
// be unit-tested with an in-memory fake without touching localStorage.

import { loadJson, saveJson, noopLog, type LogFn } from './local-json';
import { DEFAULT_KEY_MAP, DEFAULT_GAMEPAD_MAP } from './input-constants';
import { removeByValue } from './rebind-mutation';

/** Persisted rebind shape for one port. Numeric bit keys are stored as strings
 *  (JS object keys are strings). `gamepadRebinds` is the nested gamepad map. */
export interface Rebinds {
  gamepadRebinds?: Record<number, number>;
  [bit: string]: string | Record<number, number> | undefined;
}

/** Injectable persistence backend. */
export interface RebindStorage {
  load(port: number): Rebinds;
  save(port: number, r: Rebinds): void;
}

const REBINDS_KEY = 'psanywhere-input-v2';

function rebindsKey(port: number): string {
  return `${REBINDS_KEY}-port${port}`;
}

/** localStorage-backed RebindStorage. This is the production default. */
export class LocalRebindStorage implements RebindStorage {
  private readonly log: LogFn;
  constructor(log: LogFn = noopLog) {
    this.log = log;
  }
  load(port: number): Rebinds {
    return loadJson<Rebinds>(rebindsKey(port), this.log, {} as Rebinds);
  }
  save(port: number, r: Rebinds): void {
    saveJson(rebindsKey(port), r, this.log);
  }
}

/** In-memory RebindStorage for tests and non-DOM contexts. */
export class MemoryRebindStorage implements RebindStorage {
  private readonly store = new Map<number, Rebinds>();
  load(port: number): Rebinds {
    return this.store.get(port) ?? ({} as Rebinds);
  }
  save(port: number, r: Rebinds): void {
    this.store.set(port, r);
  }
}

/**
 * Owns rebind persistence and map reconstruction from defaults + persisted
 * overrides. Does NOT touch live writer state — callers apply mutations to
 * writers via applyKeyRebind/applyGamepadRebind (rebind-mutation.ts).
 */
export class RebindStore {
  constructor(private readonly storage: RebindStorage) {}

  static forLocalStorage(log?: LogFn): RebindStore {
    return new RebindStore(new LocalRebindStorage(log));
  }

  static forMemory(): RebindStore {
    return new RebindStore(new MemoryRebindStorage());
  }

  load(port: number): Rebinds {
    return this.storage.load(port);
  }

  /** Defaults merged with persisted keyboard rebinds for `port`. */
  buildKeyMap(port: number): Record<string, number> {
    const map: Record<string, number> = Object.assign({}, DEFAULT_KEY_MAP);
    const rebinds = this.storage.load(port);
    for (const [bitStr, keyName] of Object.entries(rebinds)) {
      if (bitStr === 'gamepadRebinds') continue;
      if (!/^\d+$/.test(bitStr)) continue;
      const bit = Number(bitStr) | 0;
      if (!(bit >= 0) || !keyName) continue;
      removeByValue(map, bit);
      map[keyName as string] = bit;
    }
    return map;
  }

  /** Defaults merged with persisted gamepad rebinds for `port`. */
  buildGamepadMap(port: number): Record<number, number> {
    const map: Record<number, number> = Object.assign({}, DEFAULT_GAMEPAD_MAP);
    const rebinds = this.storage.load(port).gamepadRebinds || {};
    for (const [bitStr, btnIdx] of Object.entries(rebinds)) {
      if (!/^\d+$/.test(bitStr)) continue;
      const bit = Number(bitStr) | 0;
      const btn = (btnIdx as number) | 0;
      if (!(bit >= 0) || !(btn >= 0)) continue;
      removeByValue(map as Record<string | number, number>, bit);
      map[btn] = bit;
    }
    return map;
  }

  /** Persist a keyboard rebind for `port`. Does not mutate any writer. */
  setKeyRebind(port: number, bit: number, keyName: string): void {
    const cur = this.storage.load(port);
    for (const k of Object.keys(cur)) {
      if (k === 'gamepadRebinds') continue;
      if (Number(k) === bit) delete cur[k];
    }
    cur[bit] = keyName;
    this.storage.save(port, cur);
  }

  /** Persist a gamepad rebind for `port`. Does not mutate any writer. */
  setGamepadRebind(port: number, bit: number, buttonIndex: number): void {
    const cur = this.storage.load(port);
    const gr: Record<number, number> = Object.assign({}, cur.gamepadRebinds || {});
    for (const k of Object.keys(gr)) {
      if (Number(k) === bit) delete gr[Number(k)];
    }
    gr[bit] = buttonIndex;
    cur.gamepadRebinds = gr;
    this.storage.save(port, cur);
  }
}
