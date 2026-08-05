# Streaming a CHD into the worker

The emu thread inside `src/vendor/psxanywhere/emulator/worker/coreWorker.ts`
runs a self-compiled `pcsx_rearmed` core. That core opens the disc image
through libchdr's `chd_open_core_file(...)`, and an upstream patch forks
`libpcsxcore/cdriso.c`'s `handlechd()` to call our shim
(`src/vendor/psxanywhere/emulator/worker/streaming_core_file.c`) instead of
`chd_open_file(cdHandle, ...)`. The shim's `cf_read` blocks the emu thread on
an `Atomics.wait()` until a chunk of the CHD has been fetched from the network
into a `SharedArrayBuffer`. The main thread wakes it back up. Everything in
`emulator/` is the main-thread side of that dance.

> **Migrated + adapted** from upstream `docs/stream.md` to the vendored tree.
> PSflix is streaming-only: there is no `?load=whole` fallback and no
> `cache=off` URL param (the vendored `Emulator` archives neither). The
> default chunk cache (`psanywhere-chunks-v1`) is the only store.

This article walks the main-thread side from the bottom up: `ChunkStore` (the
only store, Cache API + in-flight dedup), the idle Speculator pre-fetcher
(inlined into `bridge.ts`), and `RemoteChd` that wires it to the Worker. The
worker/C side of the bridge is covered in [`worker.md`](./worker.md); the SAB
byte layouts are in [`architecture.md`](./architecture.md).

## The design in one sentence

A Cache-API-backed `ChunkStore` holds every chunk the emu has ever read; an
in-flight `Map` dedupes concurrent requests for the same chunk; an idle
Speculator fetches ahead of the emu during bridge idle time so the emu rarely
blocks on a network round-trip.

## At a glance

```
                  main thread                              worker thread
                ─────────────────                         ─────────────────
  RemoteChd ── ChunkStore ── in-flight Map
     │            │   │
     │            │   ├─► Cache API  (caches.open('psanywhere-chunks-v1'))
     │            │   └─► fetch()  Range: bytes=N-N+CHUNK-1   (1 MB chunks)
     │
     bridge.ts  ◄────── onmessage('io') from worker  ◄── wasm calls
     │                                                       streaming_io_read()
     │                                                          which sets
     │  controlSAB = Int32Array(7):                            controlSAB
     │   [0] STATE  [1] OP  [2] OFF_HI  [3] OFF_LO  [4] LEN      [0] STATE = 1
     │   [5] RESULT [6] FETCH_STAGE                              [1] OP    = 0
     │                                                            [2..4]   request
     │  dataSAB   = Uint8Array(4 MiB) ── bytes copied ───► wasm memcpy
     │                                                       and Atomics.wait(ctrl,0,1)
     │
     └─ Speculator (inlined; ticks every SPEC_LOOP_MS=10ms)
            │
            └─ store.getChunk(url, idx, {silent:true})
                 └─ in-flight join if already loading
                    else cache.get → return
                    else 206 fetch + cache.put → return
```

`bridge.ts`, `ChunkStore.ts`, and `RemoteChd.ts` are all main-thread code
(`src/vendor/psxanywhere/emulator/`). The worker thread is the consumer; it
never imports any of these files.

## The control SAB protocol

The bridge is a strictly-typed mailbox. Two `SharedArrayBuffer`s are allocated
on the main thread and posted to the worker (see `src/vendor/psxanywhere/emulator/sab/layout.js`):

| SAB          | Layout                                              | Source of truth                                  |
| ------------ | --------------------------------------------------- | ------------------------------------------------ |
| `controlSAB` | 28 bytes, seven `Int32` slots (`CONTROL_SAB_BYTES`) | worker writes request, main thread writes result |
| `dataSAB`    | 4 MiB flat `Uint8Array` (`DATA_SAB_BYTES`)          | main thread writes, worker reads                 |

The slot layout:

| Slot / byte  | Name        | Written by                                                | Meaning                                                                                                             |
| ------------ | ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `[0]` / `0`  | STATE       | worker → main = `1` (request), main → worker = `2` (done) | mailbox state                                                                                                       |
| `[1]` / `4`  | OP          | worker                                                    | operation selector; always `0` (read) for now                                                                       |
| `[2]` / `8`  | OFF_HI      | worker                                                    | high 32 bits of file offset                                                                                         |
| `[3]` / `12` | OFF_LO      | worker                                                    | low 32 bits of file offset                                                                                          |
| `[4]` / `16` | LEN         | worker                                                    | byte count requested (capped to `DATA_SAB_BYTES`)                                                                   |
| `[5]` / `20` | RESULT      | main                                                      | bytes copied (≥ 0) or `-1` on error                                                                                 |
| `[6]` / `24` | FETCH_STAGE | main                                                      | `0`=PENDING, `1`=CACHE, `2`=NETWORK — read by the audio worklet to know when the worker is parked on a network miss |

The state machine is:

```
              worker                              main
   ──────────────────────────                ──────────────────────────
   ctrl[0] = 1     ; STATE = request
   ctrl[1] = 0     ; OP = read
   ctrl[2..4] = off,off,len
   Atomics.notify(ctrl, 0, 1)
   Atomics.wait(ctrl, 0, 1)  ; blocks on STATE=1
                                        ; woken by notify
                                        read+copy → dataSAB
                                        ctrl[5] = n
                                        ctrl[6] = FETCH_STAGE (CACHE/NETWORK)
                                        ctrl[0]  = 2     ; STATE = done
                                        Atomics.notify(ctrl, 0, 1)
   Atomics.wait returns; STATE=2
   ctrl[5] now holds the byte count
```

The protocol is implemented on the worker side by the `streaming_io_read`
JS-library function in `sab_runtime.js` (called from C). The C `cf_read` in
`streaming_core_file.c` calls that and only that — the rest of libchdr is
unaware the file is a streaming shim. `streaming_io_read` first consults a
small local cache (`Module._streamLocalData` at `Module._streamLocalOffset`)
of the last fetched block; on a local hit it copies straight from there and
never touches the SAB at all. See [`worker.md`](./worker.md).

### Input during stalls

While the worker is parked in `Atomics.wait` on a chunk miss, the audio
worklet suppresses the `{type:'tick'}` post that drives `host_run_frame()`
(`audio-worklet.ts`'s `if (!workerBlocked) tickPort.postMessage(...)`), so
`host_input_poll_cb` does **not** run for the duration of the stall. Without
mitigation, a button tap fully contained in that window would be lost.

This is closed by the **per-port edge latch**: `input.ts`'s rAF loop (which
keeps running during a stall) `Atomics.or`s every rising edge of the button
mask into `INPUT_OFF_EDGE`, and `host_input_poll_cb` folds the latch into
`g_input_buttons` and loss-free-drains the observed bits on the next poll.
See [`input.md`](./input.md#edge-latch-input-during-streaming-stalls).

## `bridge.ts` — the main-thread listener

`bridge.ts` is a factory: `install(...)` returns a `BridgeHandle` with
`{ startSpeculator, stopSpeculator, getSpeculatorStats, swapRemoteChd }`
plus a `dispose()`. It is set up once at boot by `Emulator.ts` on the
streaming path and stays alive for the life of the page. `swapRemoteChd(newRemote)`
is called by `Emulator.swapDisc` to hot-swap the URL after a disc swap.

What it does on every `MSG.IO` message from the worker:

1. Re-reads the control slots with `Atomics.load`. Anything that isn't
   `STATE === 1` and `OP === 0` is silently dropped.
2. Reconstructs a 64-bit offset from `OFF_HI` and `OFF_LO` (`BigInt`
   arithmetic, then narrowed back to `Number` for the `remoteChd.read` call —
   safe for CHD sizes well under 2⁵³ bytes).
3. Optimistically writes `FETCH_STAGE = CACHE` before the read, so the audio
   worklet immediately knows the worker is parked. `remoteChd`'s
   `setNetworkFetchListener` upgrades the stage to `NETWORK` if the
   `ChunkStore` confirms a cache miss is going to the wire.
4. Stamps `ioActive = true` (drives the buffering overlay lifecycle).
5. Calls `remoteChd.read(off, len)`. The returned `Uint8Array` is copied into
   the data SAB at offset 0 with `dat.set(...)` and the byte count (clamped to
   `dat.length`) goes into `RESULT`.
6. On success: `STATE = 2`, `Atomics.notify(ctrl, 0, 1)`. The `cf_read` in the
   worker returns and libchdr sees the bytes.
7. On failure: same `notify`, but `RESULT = -1` so the C shim reports `0` to
   libchdr, which surfaces as a failed sector read (the emu prints a `cdrom`
   error and usually retries). `consecutiveFailures++`; if it reaches
   `MAX_CONSECUTIVE_FAILURES = 3` the `onFatal` callback tears the session
   down.

The first read gets a one-shot log line so the boot sequence is inspectable.
The bridge also constructs the Speculator (lazily, inside the module) and
returns `startSpeculator` / `stopSpeculator` so `Emulator.ts` can arm it after
the game is loaded.

## `ChunkStore.ts` — the only store

`ChunkStore` is a single class that owns the persistent Cache API store **and**
the in-flight de-duplication `Map`. There is no in-memory LRU — the Cache API
is the only chunk store, and it is fast enough (≈ 1–5 ms per hit) that a warm
read of a 1 MB chunk at 2× CD speed costs well under one 60 fps frame.

```ts
const store = new ChunkStore({
  chunkBytes: 1024 * 1024, // 1 MB (RemoteChd default)
  totalBytes: chdTotal,
  cacheName: 'psanywhere-chunks-v1', // DEFAULT_CACHE_NAME
  cacheEnabled: true,
});
await store.open();
const bytes = await store.getChunk(url, idx /*, {silent} */);
const s = store.getStats();
await store.evict();
```

| Tier         | Backing             | Written by                 | Read by                  |
| ------------ | ------------------- | -------------------------- | ------------------------ |
| `persistent` | Cache API           | every network fetch        | both emu and Speculator  |
| `inflight`   | `Map<idx, Promise>` | first read for a given idx | subsequent reads join it |

Retry/backoff (for the network fetch): `FETCH_TOTAL_BUDGET_MS = 60000`
overall deadline, `FETCH_ATTEMPT_TIMEOUT_MS = 30000` per attempt (via
`AbortSignal.timeout`), `FETCH_MAX_ATTEMPTS = 3`, exponential backoff
`FETCH_BACKOFF_BASE_MS = 300` (×4 per attempt, + jitter). A `Range:` response
that is not `206` throws and counts as an attempt failure.

`getChunk(url, idx, {silent})`:

```ts
async getChunk(url: string, idx: number, { silent } = {}) {
  const pending = this.inflight.get(idx);
  if (pending) return pending;
  const p = this._load(url, idx, { silent });
  this.inflight.set(idx, p);
  try { return await p; } finally { this.inflight.delete(idx); }
}
```

`_load` consults the Cache API; on hit, `hits++` and `knownCached.add(idx)`.
On miss it fires `onMissStart`, adds `idx` to a `networkInflight` set,
optionally fires `onNetworkFetch`, runs `_fetchRangeWithRetry` (requires
`r.status === 206`), validates `bytes.byteLength === expectedLength`,
`misses++`, `bytesIn += len`, fire-and-forgets `_cachePut` (counts
`putErrors`), and `knownCached.add(idx)`.

**Three subtleties:**

- **Cache keys are URLs with a `__chunk=N` query string.** The Cache API
  strips URL fragments before matching, so a `${url}#chunk-${idx}` key
  collapses every chunk to the same request. Query strings are preserved by
  default matching, so `${url}?__chunk=${idx}` (or `&__chunk=` if the URL
  already has a `?`) gives each chunk a unique key.
- **`silent` fetches (the Speculator) do not fire `onMissStart`/`onMissEnd`**
  (so they don't flicker the buffering overlay), **but they do add to
  `networkInflight`** — so a later non-silent emu `getChunk` for the same idx
  can detect the in-flight speculator fetch and fire `onNetworkFetch`. The
  `onNetworkFetch` listener is set via `RemoteChd.setNetworkFetchListener`
  (which writes `store.onNetworkFetch`); `setMissListeners` sets the separate
  `onMissStart`/`onMissEnd` pair that drives the buffering overlay.
- **`knownCached` is a synchronous mirror of "which chunks are cached"** for
  the speculator's step (1) "is n+1 in the cache?" check. It is seeded once
  from `cache.keys()` in `open()` (parsing the `__chunk=N` query on each key
  whose URL matches this store's `url`, since a cache name is shared across
  discs), maintained on every cache hit / successful put, and cleared in
  `evict()`. Stale entries only cause the speculator to idle. `hasChunk(idx)`
  returns true for `knownCached` _or_ `inflight`.

`put` is best-effort. Quota errors are caught and counted in `putErrors`; the
next `getChunk(url, idx)` will miss and re-fetch.

`getStats()` returns `{ hits, misses, bytesIn, putErrors, hitRatio }`, where
`hitRatio = hits / (hits + misses)` is the chunk-level hit ratio — the
headline metric.

## The Speculator — inlined into `bridge.ts`

The Speculator is **not** a separate module; it is a `setInterval`-driven loop
defined inside `bridge.ts`. It runs an independent loop with **one input** (a
cache miss sets the queue) and **one event** (a chunk finishes loading,
clearing the busy flag), and enforces **no concurrent fetches** — at most one
speculative fetch is in flight at a time.

### State

```
specN        : last chunk fetched (init -1 so chunk 0 is a candidate)
specQueue    : a chunk the emu missed and wants prioritised, or null (init 0)
specBusy     : a fetch is in progress (enforces "no concurrent fetches")
specLastMiss : anchor for the lookahead window (most recent emu miss)
specFetches  : cumulative count of completed speculative fetches
```

The queue starts up with chunk 0 in it, so the very first tick fetches chunk 0.

### The algorithm (`specTick`, every `SPEC_LOOP_MS = 10` ms)

```
loop:
  if specBusy: return                       # a fetch is in progress; wait
  if specQueue !== null:                    # (1) is a chunk in the queue? yes
      idx = specQueue; specQueue = null
      if idx === specN: return               #   just fetched this one; skip
      startFetch(idx); return               #   dequeue, fetch, cache, notify
  # (1) no — check n+1:
  candidate = specN + 1
  if candidate >= totalChunks: return       #   end of disc
  if candidate > specLastMiss + SPEC_LOOKAHEAD: return   # lookahead cap
  if remoteChd.hasChunkCached(candidate): return          # in cache → busy-loop
  startFetch(candidate)                     #   put n+1 in the queue & fetch

startFetch(idx):
  specBusy = true
  remoteChd.prefetchChunk(idx)               # silent: won't retrigger onMissStart
    .then(() => { specFetches++; specN = idx; specBusy = false })
    .catch(() => { specN = idx; specBusy = false })        # advance past (avoid spin)

# (2) Cache miss arrives (emu read, non-silent) — ChunkStore.onMissStart(idx):
onMiss(idx):
  specQueue = idx        # replace the queue with this chunk
  specLastMiss = idx     # reposition the lookahead window anchor
```

### Gating

- **Window.** `candidate <= specLastMiss + SPEC_LOOKAHEAD`, where
  `SPEC_LOOKAHEAD = 100` chunks — a **100 MB** rolling window anchored to the
  _most recent emu cache miss_ (`specLastMiss`).
- **No concurrent fetches.** `specBusy` — a single boolean flag — keeps
  speculation linear and leaves the HTTP/1.1 connection pool free for the
  emu's urgent reads.
- **End of disc.** `candidate < totalChunks`.
- **Cache check.** `remoteChd.hasChunkCached(candidate)` — synchronous check
  against `ChunkStore.knownCached` (plus `inflight`).

The Speculator runs **concurrently** with the emu's urgent reads — it does
not wait for a bridge idle gap. The `ChunkStore.inflight` `Map` dedupes any
concurrent request for the same chunk, so they can never race or double-fetch.

`stop()` clears the timer; `start()` is idempotent. `getSpeculatorStats()`
exposes `{ fetches, n, queued, busy, lastMiss, running }`.

### Edge cases

- **Warm boot.** `ChunkStore.open()` seeds `knownCached` from `cache.keys()`,
  so a warm boot makes the speculator fetch chunk 0 (a cheap cache hit), see
  chunk 1 is `knownCached`, and idle.
- **Cold boot.** The emu's first read is the CHD map at a high chunk H (a
  miss) → `onMiss(H)` replaces the queue with H. The emu's urgent read of H
  goes out concurrently and is deduped by `inflight`, so it isn't blocked on
  the speculator.
- **Fetch failure.** The catch advances `specN` past the failed chunk so the
  next tick moves on instead of busy-spinning. Sustained failure is surfaced
  by the emu's read path (`onFatal` after `MAX_CONSECUTIVE_FAILURES`).

The 100 MB window is intentional: an unbounded linear scan would saturate the
network; a 100 MB window fits PS1 CD read patterns (≈ 2× real-time CD-ROM
throughput), and the single-in-flight design never starves the emu's urgent
reads.

## `RemoteChd.ts` — the public surface

`RemoteChd` is what `Emulator.ts` imports. It owns the `ChunkStore` and
exposes the small surface the bridge and the dev panel use.

Constants: `DEFAULT_CHUNK_BYTES = 1024 * 1024` (1 MB); `FETCH_TIMEOUT_MS =
15000` (for the `HEAD`).

```ts
new RemoteChd(url, { chunkBytes, cacheEnabled, cacheName });
```

Lifecycle:

- `await remoteChd.open()` issues the `HEAD` (with `AbortSignal.timeout(15000)`),
  requires `status` 200/204, `Content-Length > 0`, and `Accept-Ranges: bytes`
  (see [`host-chd.md`](./host-chd.md)), sets `this.total`, constructs the
  `ChunkStore` and `await store.open()`. Without a working `HEAD` or without
  `Accept-Ranges: bytes` the boot fails here with a clear error.
- `await remoteChd.read(offset, length)` computes the chunk range `[c0..c1]`,
  `Promise.all`s `store.getChunk(url, i)` for every chunk in
  `[offset, offset+length)`, and assembles them into one
  `Uint8Array(length)`. Tracks `bytesOut += length`. Multi-chunk is the
  steady state — the CHD map, ISO9660 directory walk, and most file reads all
  cross chunk boundaries.
- `getStats()` = `{ ...store.getStats(), bytesOut }`.
- `await remoteChd.evict()` = `store.evict()` + reset `bytesOut`.
- `setMissListeners({onStart, onEnd})` / `setNetworkFetchListener(fn)`
  forward into the `ChunkStore` listeners.
- `prefetchChunk(idx)` = `store.getChunk(url, idx, {silent:true})`.
- `hasChunkCached(idx)` = `store.hasChunk(idx)` — synchronous cached/in-flight
  check; does NOT kick off a fetch.
- `getChunkBytes()`, `getTotalChunks() = ceil(total/chunkBytes)`.

A multi-chunk read on a cache miss does `Promise.all` over the relevant chunk
indices, which means all chunks in the request are fetched concurrently. With
the in-flight dedup, two concurrent reads for the same chunk share a single
network request.

## Boot order

From `Emulator.ts#loadDisc`, streaming path:

1. `const remoteChd = new RemoteChd(CHD_URL, { cacheEnabled })`.
2. `await remoteChd.open()` — `HEAD` → `Accept-Ranges: bytes` confirmed,
   `chunkStore` constructed.
3. `installBridge(worker, controlSAB, dataSAB, remoteChd, buffering, onFatal)`
   — returns `BridgeHandle` with `{ startSpeculator, stopSpeculator, getSpeculatorStats, swapRemoteChd }`.
4. `worker.postMessage({ type: MSG.CD, url: CHD_URL, chdTotal: remoteChd.total })`.
   The worker's `handleCd` writes a 0-byte `/game.chd` to MEMFS, hands the
   SABs to `Module._streamingControlSab` / `_streamingDataSab`, and calls
   `cfunc.streaming_init(chdTotal | 0, Math.floor(chdTotal / 2³²))`.
5. User presses Start → `worker.postMessage({ type: MSG.RUN_START })`. The
   worker does a 10-frame `setTimeout(0)` warmup then arms
   `audioClockActive=true`; `Emulator.ts` then calls `bridge.startSpeculator()`.

The first emu read is almost always the CHD map near the end of the file (a
big multi-chunk `read`). On a cold reload the next boot sees those chunks as
cache hits.

## Failure modes

- **`HEAD` returns 200/204 but no `Accept-Ranges: bytes`.** The host is
  misconfigured; `RemoteChd.open()` throws. Boot fails with a clear error.
  Fix the host, not the code. See [`host-chd.md`](./host-chd.md).
- **`Range:` request returns 200 (not 206).** The host is ignoring the `Range`
  header. `ChunkStore._fetchRangeWithRetry` throws after its retries; the
  bridge surfaces this to the emu as a failed sector read (the emu retries and
  usually recovers). Three consecutive failures call `onFatal` and tear the
  session down. Look for `expected 206` in the console.
- **Cache API quota exceeded.** `Cache.put` rejects; the catch increments
  `putErrors` and the in-flight dedup + network fetch path keep working.
- **Speculator never fires.** If `net` grows in step with `out`, the
  Speculator is not running or is too slow. Check that
  `bridge.startSpeculator()` was called (it happens on the worker's
  `MSG.LOADED` message).
- **`RESULT = -1` in the bridge's catch path.** The C shim reports 0 bytes to
  libchdr, which sees an EOF or read error for that sector. The emu logs a
  CD-ROM error and retries. Sustained failures (≥ `MAX_CONSECUTIVE_FAILURES`)
  trigger `onFatal` and the user should reload.

## Cross-references

- [`architecture.md`](./architecture.md) — the five SABs, the `MSG.*` protocol,
  the thread model.
- [`worker.md`](./worker.md) — `streaming_core_file.c`, `sab_runtime.js`,
  `host.c`, the `chd_open_core_file` fork.
- [`host-chd.md`](./host-chd.md) — what the CHD host must do (`Accept-Ranges:
bytes`, `Access-Control-Expose-Headers: Content-Range`, the Service Worker
  caveat).
- [`host-app.md`](./host-app.md) — COOP/COEP/CORP headers for an isolated page.
