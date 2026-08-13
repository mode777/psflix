import '@testing-library/jest-dom/vitest';

/**
 * Conditional in-memory `localStorage` polyfill.
 *
 * Some test environments (notably certain happy-dom + Node combinations) do not
 * bridge `localStorage` onto globalThis, which breaks any code that persists
 * auth tokens / slices there. When no `localStorage` global is present we
 * install a minimal spec-compliant in-memory Storage so tests run hermetically.
 * In environments that already provide one this is a no-op.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const polyfill: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: polyfill,
    configurable: true,
    writable: true,
  });
}
