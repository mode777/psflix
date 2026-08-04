'use strict';

// Shared client-layer storage helpers: localStorage JSON codec, the
// canonical log callback type, a shared no-op log default, and the
// `unknown -> string` error formatter used across the storage modules.

export type LogFn = (level: string, msg: string) => void;

/** Default log sink: discard. Imported by modules that want a stable default. */
export const noopLog: LogFn = () => {};

/**
 * Format an unknown caught value as a message string (Error.message when
 * available, otherwise String(e)). Replaces the repeated
 * `e && e.message ? e.message : e` idiom across the stores.
 */
export function formatErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function loadJson<T>(key: string, log: LogFn, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch (e: any) {
    log('warn', `loadJson(${key}) failed: ${e?.message ?? e}`);
    return fallback;
  }
}

export function saveJson(key: string, value: unknown, log: LogFn): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e: any) {
    log('warn', `saveJson(${key}) failed: ${e?.message ?? e}`);
  }
}
