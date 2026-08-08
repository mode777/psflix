/**
 * Defensive localStorage helpers for typed "slices" of state.
 *
 * Each slice lives under its own key, declares a default shape (`fallback`) and
 * a per-field validator, so:
 *   - a corrupt / schema-changed slice never poisons the others,
 *   - any parse error, missing key, quota error, or private mode falls back to
 *     the defaults — storage is never a source of fatal runtime errors.
 *
 * Persisting a new piece of state is two steps:
 *   1. add the field to the slice's type + `fallback`,
 *   2. add a matching entry to `fields` (use the shared `parsers` below).
 *
 * Adding a whole new persisted slice: declare a `Slice<T>`, then `readPersisted`
 * at store init and `writePersisted` inside the setter.
 */

export type FieldParser<T> = (raw: unknown, fallback: T) => T;

export type Slice<T extends object> = {
  /** localStorage key the slice is stored under. */
  key: string;
  /** Default value; also defines the full shape and drives per-field validation. */
  fallback: T;
  /** One validator per field; unknown / invalid stored values fall back to the default. */
  fields: { [K in keyof T]: FieldParser<T[K]> };
};

/** Read a slice from localStorage, validating each field against its fallback. */
export function readPersisted<T extends object>(slice: Slice<T>): T {
  try {
    const raw = localStorage.getItem(slice.key);
    if (!raw) return { ...slice.fallback };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = {} as T;
    (Object.keys(slice.fallback) as (keyof T)[]).forEach((field) => {
      out[field] = slice.fields[field](parsed[field as string], slice.fallback[field]);
    });
    return out;
  } catch {
    return { ...slice.fallback };
  }
}

/** Write a slice to localStorage; silently ignores quota / private-mode errors. */
export function writePersisted<T extends object>(slice: Slice<T>, value: NoInfer<T>): void {
  try {
    localStorage.setItem(slice.key, JSON.stringify(value));
  } catch {
    // ignore (private mode / quota)
  }
}

/** Shared field validators for common primitives. */
export const parsers = {
  boolean(raw: unknown, fallback: boolean): boolean {
    return typeof raw === 'boolean' ? raw : fallback;
  },
  number(raw: unknown, fallback: number): number {
    return typeof raw === 'number' ? raw : fallback;
  },
  /** Number clamped to [min, max]; falls back when absent or non-numeric. */
  clamped(min: number, max: number): FieldParser<number> {
    return (raw, fallback) =>
      typeof raw === 'number' ? Math.min(max, Math.max(min, raw)) : fallback;
  },
  /** One of a fixed set of string values (enums / unions of string literals). */
  enum<T extends string>(values: readonly T[]): FieldParser<T> {
    return (raw, fallback) =>
      typeof raw === 'string' && (values as readonly string[]).includes(raw)
        ? (raw as T)
        : fallback;
  },
};
