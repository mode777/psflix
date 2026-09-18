# Hosting the app (cross-origin isolation)

The whole streaming design — the `SharedArrayBuffer` rings and the
`Atomics.wait()` bridge inside the Worker — requires the page to be
**cross-origin isolated**. Without COOP/COEP, `EmulatorClient`'s constructor
throws and the page won't boot:

```
crossOriginIsolated = false — server must send COOP/COEP headers
```

Browsers only flip `self.crossOriginIsolated` to `true` when the response that
delivered `index.html` carried both `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp`, and _every_ sub-resource was
either same-origin or sent `Cross-Origin-Resource-Policy`/CORS headers that let
the page load it.

> **Migrated + adapted** from upstream `host-app.md` to PSflix's deployment.
> PSflix is a **bundled SPA** served from PocketBase's `pb_public` at
> `https://pb.example.com` (same origin as the backend) — different
> from upstream's unbundled `/src/...` layout. It uses `HashRouter`, so all
> routes resolve to `index.html` with no server-side rewrites. The prod
> reverse proxy in front of PocketBase is deployed via **Flux** (out of this
> repo) and must carry the CO* headers below on every response.
> See [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §9 and `AGENTS.md` §Deployment.

## What to serve

| Path                               | What                                          | Notes                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | the bundled SPA (`dist/` → `pb_public/`)      | single `index.html` + hashed chunks                                                                                                                     |
| `/pcsx_rearmed.js` (origin root)   | Emscripten JS shim (the `PcsxModule` factory) | served from `public/` — **must be at the origin root**, see [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.2 |
| `/pcsx_rearmed.wasm` (origin root) | compiled core                                 | committed artifact, ~888 KB                                                                                                                             |
| `/api/files/.../SCPH1001.BIN`      | BIOS                                          | from the `consoles` collection; public read, no auth header                                                                                             |
| `/api/files/discs/<id>/<iso>`      | CHD disc image                                | same-origin range-served file                                                                                                                           |

The SPA and the CHD/BIOS are all same-origin here, so the cross-origin parts
of the upstream CHD article (`host-chd.md`) mostly don't apply — but the
`Range:`/`Accept-Ranges` requirements for the CHD still do (see
[`host-chd.md`](./host-chd.md)).

## Required response headers

These must go on **every** response from the app origin, including error pages
(404, 403, 5xx), `index.html`, JS, WASM, the favicon, and anything else the
browser might fetch. The browser evaluates `crossOriginIsolated` from the
_top-level document_ headers, but sub-resources are also re-checked against
COEP, and a single sub-resource without an appropriate
`Cross-Origin-Resource-Policy` will fail to load and break the boot.

```
Cross-Origin-Opener-Policy:   same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

In dev, `vite.config.ts` `server.headers` already sends these on every
response. In prod they must be added by the reverse proxy fronting PocketBase
(out of this repo, via Flux). Because everything is same-origin, `require-corp`
is safe here — PSflix bundles its fonts/icons deps and serves media from the
same PocketBase origin. (If a future embedded/cross-origin resource appears,
fall back to `COEP: credentialless`; see spec §9.3.)

## Reverse proxy (nginx) configuration

A production-shaped config for the origin `pb.example.com` fronting
PocketBase. Apply via the Flux pipeline; this is a reference, not in-repo.

```nginx
# /etc/nginx/mime.types: nginx maps .wasm to application/wasm since 1.21.7.
# Older distros: add `types { application/wasm wasm; }`.

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name pb.example.com;

  ssl_certificate     /etc/letsencrypt/live/pb.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pb.example.com/privkey.pem;

  # COOP/COEP/CORP on every response. `always` attaches to error responses too
  # (403/404/5xx) — required, a bare 404 would leave the page half-isolated.
  add_header Cross-Origin-Opener-Policy   "same-origin"        always;
  add_header Cross-Origin-Embedder-Policy "require-corp"       always;
  add_header Cross-Origin-Resource-Policy "same-origin"        always;

  add_header Strict-Transport-Security   "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options       "nosniff"            always;
  add_header Referrer-Policy              "no-referrer"        always;

  # PocketBase reverse-proxied on a local port (Flux manages the upstream).
  location / {
    add_header Cache-Control "no-cache, must-revalidate" always;  # SPA index
    proxy_pass http://pocketbase:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Cache policy notes (adjust where you run the proxy):

- `/pcsx_rearmed.{js,wasm}` are content-addressed by the build — a 1-year
  immutable cache is safe.
- `index.html` and hashed chunks version with every deploy — `no-cache,
must-revalidate` on HTML keeps stale code from sticking.
- The CHD/BIOS files under `/api/files/...` must not be cached in a way that
  breaks byte-range serving — prefer pass-through or `Accept-Ranges`-safe
  caches (see [`host-chd.md`](./host-chd.md)).

## Compressing the response

`text/html`, JS/CSS chunks, and `pcsx_rearmed.js` compress well; the WASM
binary is already compact. In a static file server context:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_proxied any;
gzip_types text/html application/javascript text/javascript application/json text/css;
```

WASM is usually already brotli-dense; advertising it costs nothing.

## Verifying a deploy

From a shell on the host (or any machine that can reach it):

```sh
# 1. index.html must carry the three CO* headers.
curl -sI https://pb.example.com/ | \
  grep -iE 'HTTP/|cross-origin-'

# 2. The WASM core must be application/wasm and carry the CO* headers.
curl -sI https://pb.example.com/pcsx_rearmed.wasm | \
  grep -iE 'HTTP/|content-type|cache-control|cross-origin-'

# 3. A 404 must still carry the CO* headers (COEP applies to sub-resources too).
curl -sI https://pb.example.com/does-not-exist | \
  grep -iE 'HTTP/|cross-origin-'
```

In a browser, open DevTools → Console and confirm:

```js
self
  .crossOriginIsolated // → true
  (new SharedArrayBuffer(4)).byteLength === 4; // → true
```

The boot log also asserts `crossOriginIsolated` and surfaces a clear error if
the headers are missing.

## Common pitfalls

- **`add_header` on the wrong scope.** nginx inherits `add_header` from
  enclosing blocks only when no child `add_header` is present. Put the three
  CO* headers at the `server {}` level with `always`, and don't override them
  in `location {}` blocks without re-adding `always`.
- **Missing `.wasm` MIME type.** On nginx < 1.21.7 the WASM is served as
  `application/octet-stream`; browsers fall back to a slower (but working)
  `WebAssembly.instantiate`. `curl -I <wasm>` is the fastest check.
- **CDN in front of nginx stripping headers.** Cloudflare, CloudFront, Fastly,
  etc. must _forward_ the three CO* headers. A common failure mode is a CDN
  stripping `Cross-Origin-Embedder-Policy` because it's not in its allow-list.
- **Mixed content.** `crossOriginIsolated` is gated on a _secure context_.
  Keep everything HTTPS (the PocketBase origin already is).
- **Service Worker installing itself.** Don't install a SW — the persistent
  chunk cache (`ChunkStore`) is per-origin and a SW intercepting the chunk
  `Range:` requests breaks it (see [`host-chd.md`](./host-chd.md)). PSflix
  ships no SW.
- **COEP breaking a cross-origin resource.** Under `require-corp`, any
  cross-origin sub-resource must carry CORP/CORS. PSflix bundles everything,
  so this shouldn't happen; if it does, prefer `COEP: credentialless` (spec
  §9.3).

## Alternatives

Any static host / reverse proxy that lets you add response headers works —
the COOP/COEP requirement is a _protocol_ requirement, not an nginx one. In
dev, the bundler's `server.headers` (`vite.config.ts`) does it; a plain
`python3 -m http.server` or `file:///` will **not** (no header control) — use
`npm run dev` instead.

## A note specific to PSflix

- The SPA must remain **origin-rooted**: `pcsx_rearmed.{js,wasm}` are fetched
  by the worker at `/pcsx_rearmed.{js,wasm}` (hard-coded), and the SPA uses
  relative asset URLs. If PSflix ever moves under a sub-path, those two sites
  must be parameterized (see [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.2).
- Because everything is same-origin (SPA + backend on `pb.example.com`),
  **no CORS configuration is needed**. Revisit only if the SPA is ever
  embedded cross-origin.

## Cross-references

- [`host-chd.md`](./host-chd.md) — the CHD host (`Accept-Ranges: bytes`,
  `Access-Control-Expose-Headers: Content-Range`).
- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §9 — cross-origin isolation, verification, the
  `credentialless` fallback.
- [`stream.md`](./stream.md) — why `crossOriginIsolated` matters at the
  streaming bridge.
