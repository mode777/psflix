/**
 * Resolves the PocketBase base URL by context:
 * 1. An explicit VITE_PB_URL always wins (build-time env).
 * 2. Production builds default to same-origin — the SPA is served by the
 *    same PocketBase that serves the API (Docker image / prod).
 * 3. Dev builds default to a local PocketBase on :8090 (`npm run pocketbase:serve`).
 */
export function resolvePbUrl(): string {
  return (
    import.meta.env.VITE_PB_URL ||
    (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:8090')
  );
}
