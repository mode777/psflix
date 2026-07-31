export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; data?: { message?: string }; status?: number };
    if (e.data?.message) return e.data.message;
    if (e.message) return e.message;
  }
  return fallback;
}
