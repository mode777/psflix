'use strict';

// IndexedDB promise utilities shared by the client-layer persistence modules
// (saveStateStorage, memcardStorage). See docs/save-state.md, docs/memcard.md.

export type OpenDb = () => Promise<IDBDatabase>;

/**
 * Returns a cached `OpenDb` for `name`/`version`. The connection is reused
 * across calls; if the browser closes it (`onclose`/`onerror`), the cache is
 * invalidated so the next call reopens.
 *
 * Self-heals from a broken database: on `NotFoundError` the database is deleted
 * and reopened fresh (data loss is accepted in exchange for not wedging the
 * feature). A `isRetry` guard prevents unbounded recursion.
 */
export function openDbWithRecovery(
  name: string,
  version: number,
  onUpgrade: (db: IDBDatabase) => void,
): OpenDb {
  let cached: Promise<IDBDatabase> | null = null;

  function reset(): void {
    cached = null;
  }

  function openFresh(isRetry: boolean): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => {
        onUpgrade(req.result);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => reset();
        db.onerror = () => reset();
        resolve(db);
      };
      req.onerror = () => {
        const err = req.error;
        if (!isRetry && err && err.name === 'NotFoundError') {
          req.result.close();
          const del = indexedDB.deleteDatabase(name);
          del.onsuccess = () => {
            openFresh(true).then(resolve, reject);
          };
          del.onerror = () => reject(err);
          del.onblocked = () => reject(err);
        } else {
          reject(err);
        }
      };
    });
  }

  return () => {
    if (!cached) cached = openFresh(false);
    return cached;
  };
}

export function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ── Convenience KV operations ────────────────────────────────────────
// Factored from the per-class boilerplate in IdbMemcardStorage /
// IdbSaveStateStorage. Each method previously opened a transaction,
// grabbed the object store, and wrapped the request — these collapse
// that to a one-liner. Read-write ops await `txComplete` so callers
// observe durability.

/** Get a single value by key from `store`, or `undefined` if missing. */
export async function idbGet<T>(
  open: OpenDb,
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await open();
  const tx = db.transaction(store, 'readonly');
  return reqAsPromise<T>(tx.objectStore(store).get(key) as IDBRequest<T>);
}

/** Put `value` into `store` (optional out-of-line `key`). Awaits durability. */
export async function idbPut(
  open: OpenDb,
  store: string,
  value: unknown,
  key?: IDBValidKey,
): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await txComplete(tx);
}

/** Delete `key` from `store`. Awaits durability. */
export async function idbDelete(open: OpenDb, store: string, key: IDBValidKey): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txComplete(tx);
}
