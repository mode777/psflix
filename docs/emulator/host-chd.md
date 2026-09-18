# Hosting the CHD

The streaming pipeline (`emulator/RemoteChd.ts` + `emulator/bridge.ts`) needs
an HTTP origin that can serve `Range:` requests. The persistent chunk cache
(`emulator/ChunkStore.ts`) sits in the user's browser (Cache API), so a hosted
CHD only has to answer byte-range GETs — there is no server-side cache or
fan-out to maintain.

> **Migrated + adapted** from upstream `host-chd.md` to PSflix's deployment.
> In PSflix the CHDs are **same-origin**: they are served from the SPA's own
> PocketBase origin (`/api/files/discs/<id>/<iso>`), not a separate CDN origin.
> That means the cross-origin CORS headers below are a _host-chd.md_ reference
> for a separate-origin setup and do **not** apply in the default PSflix
> layout — but the `Accept-Ranges: bytes` / `Range:` → `206` requirements DO
> (PocketBase's file handler honors byte ranges; verify once, see below).

## Required headers — same-origin (PSflix default)

The only hard requirement for the streaming bridge is:

```
Accept-Ranges: bytes
```

`RemoteChd.open()` does a `HEAD` and refuses to start if it is missing. PocketBase
serves files with `Accept-Ranges: bytes` and honors `Range:` with `206 Partial
Content`. Verify once:

```sh
# 1. HEAD must advertise Accept-Ranges and Content-Length
curl -sI "<chd-url>" | grep -iE 'accept-ranges|content-length|HTTP/'

# 2. Range request must return 206 Partial Content + Content-Range
curl -sI -H 'Range: bytes=0-1023' "<chd-url>" | grep -iE 'HTTP/|content-range|content-length'
```

If a future host stops honoring `Range:` (a `200 OK` for a ranged request), the
CHDs must move to a dedicated range-capable origin — see the cross-origin
section below.

## Required headers — cross-origin (only if CHDs live elsewhere)

If the CHD ever lives on a different origin (e.g. an S3/CloudFront bucket), the
CHD origin's responses must carry:

```
Accept-Ranges: bytes
Cross-Origin-Resource-Policy: cross-origin
Access-Control-Allow-Origin: https://pb.example.com
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length
Cache-Control: public, max-age=31536000, immutable   # content-addressed
```

- `Access-Control-Expose-Headers: Content-Range` is the easy-to-miss one.
  Without it, the browser hides the response header from JS and the streaming
  bridge's sanity check (`r.headers.get('Content-Range')`) sees `null` — the
  read still works, but the HUD's `Content-Range` field reads as missing.
- A `Range: bytes=` request must return `206 Partial Content` with a
  `Content-Range` header. A `200 OK` for a ranged request is wrong;
  `ChunkStore` treats it as a fatal fetch error.

## Cache API quota + Service Worker caveats

`emulator/ChunkStore.ts` uses the Cache API as the persistent chunk store.

### Quota

- Chromium allows up to ~60 % of free disk space per origin for Cache API. A
  451 MB CHD is well under the limit; a large library is fine on most laptops.
- The browser manages its own LRU under storage pressure. Cached chunks can be
  evicted without notification: the next read is a Cache API miss → re-fetch
  over the network → re-store. No data corruption; the HUD's `misses` bumps.
- `Cache.put` is best-effort. Quota errors are caught and counted in
  `putErrors`; the in-flight dedup + network tiers continue to work.

### Service Worker interactions

The persistent cache is per-origin. If you deploy a Service Worker (PSflix
does **not**), it must not intercept the chunk `Range:` requests — the Cache
API is the _client-side_ store and only knows about responses it observed. A
SW that synthesizes a `200 OK` for a missing range will defeat the persistence.
If you must add a SW, pass through `Range:` requests to the network and do not
`cache.put` on the way through.

## Sample nginx config (cross-origin CHD origin)

Only relevant if CHDs are moved off the PocketBase origin:

```nginx
server {
  listen 443 ssl http2;
  server_name chd.example.com;

  add_header Cross-Origin-Resource-Policy cross-origin;
  add_header Access-Control-Allow-Origin https://pb.example.com always;
  add_header Access-Control-Allow-Methods "GET, HEAD" always;
  add_header Access-Control-Expose-Headers "Content-Range, Accept-Ranges, Content-Length" always;

  location / {
    root /srv/chd;
    add_header Accept-Ranges bytes;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }
}
```

## Verifying a hosted CHD

From the command line (same-origin PocketBase case):

```sh
curl -sI https://pb.example.com/api/files/discs/<id>/<iso> | \
  grep -iE 'HTTP/|accept-ranges|content-length|cross-origin-'
curl -sI -H 'Range: bytes=0-1023' https://pb.example.com/api/files/discs/<id>/<iso> | \
  grep -iE 'HTTP/|content-range|content-length|accept-ranges'
```

`HEAD` should be `200 OK` with `Accept-Ranges: bytes`; the ranged request
should be `206 Partial Content` with `Content-Range: bytes 0-1023/<total>`.
This is the acceptance step in [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §9.4.

## Cross-references

- [`stream.md`](./stream.md) — the bridge/ChunkStore internals that consume
  the range responses.
- [`host-app.md`](./host-app.md) — COOP/COEP/CORP for the app origin (CHDs are
  same-origin here, so CORP is satisfied automatically).
- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §9.4 — the curl acceptance criteria.
