// Small input validators + error helpers shared by the PSxAnywhere repository
// adapter. Ported from `psxanywhere/src/repository/repository.ts` so the
// adapter enforces the same preconditions as the upstream implementation
// without reaching into the vendored tree.

export function assertSerial(s: string): void {
  if (!/^[A-Z0-9-]+$/i.test(s)) throw new Error(`Invalid serial: ${s}`);
}

export function assertUserId(id: string): void {
  if (!id || typeof id !== 'string') throw new Error('Invalid userId');
}

export function assertLabel(l: string): void {
  if (!l || typeof l !== 'string') throw new Error('Invalid label');
}

/** PocketBase throws an object with `status === 404` on record-not-found. */
export function isNotFound(e: unknown): boolean {
  return e != null && typeof e === 'object' && (e as { status?: unknown }).status === 404;
}
