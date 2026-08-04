'use strict';

import { controlView, dataView, CONTROL_OFF_FETCH_STAGE } from './sab/layout';

// FETCH_STAGE: 0=PENDING, 1=CACHE (brief), 2=NETWORK (long).
const FETCH_STAGE_CACHE = 1;
const FETCH_STAGE_NETWORK = 2;

const SPEC_LOOP_MS = 10;
// Speculator lookahead cap (chunks). See docs/stream.md.
const SPEC_LOOKAHEAD = 100;

const MAX_CONSECUTIVE_FAILURES = 3;

export interface BufferingOverlay {
  show(): void;
  hide(): void;
}

export interface SpeculatorStats {
  fetches: number;
  n: number;
  queued: number | null;
  busy: boolean;
  lastMiss: number;
  running: boolean;
}

export interface BridgeHandle {
  startSpeculator(): void;
  stopSpeculator(): void;
  getSpeculatorStats(): SpeculatorStats;
  swapRemoteChd(newRemote: any): void;
  dispose(): void;
}

export function install(
  worker: Worker,
  controlSAB: SharedArrayBuffer,
  dataSAB: SharedArrayBuffer,
  initialRemoteChd: any,
  bufferingOverlay: BufferingOverlay | null = null,
  onFatal: ((msg: string) => void) | null = null,
  onLog?: ((level: string, msg: string) => void) | null,
): BridgeHandle {
  const ctrl = controlView(controlSAB);
  const dat = dataView(dataSAB);
  let remoteChd = initialRemoteChd;
  let firstLogged = false;
  let ioActive = false;
  let pendingMisses = 0;
  let consecutiveFailures = 0;
  let disposed = false;
  const logWarn = (msg: string) => {
    if (onLog) onLog('warn', msg);
    else console.warn(msg);
  };

  // Speculator state. See docs/stream.md.
  let specN = -1;
  let specQueue: number | null = 0;
  let specBusy = false;
  let specLastMiss = 0;
  let specFetches = 0;
  let specTimer: ReturnType<typeof setInterval> | null = null;

  // missOnStart: speculator input — a cache miss arrived.
  const missOnStart = (idx: number) => {
    if (disposed) return;
    pendingMisses++;
    if (ioActive && bufferingOverlay) bufferingOverlay.show();
    if (Number.isInteger(idx)) {
      specQueue = idx;
      specLastMiss = idx;
    }
  };
  const missOnEnd = () => {
    if (disposed) return;
    if (pendingMisses > 0) pendingMisses--;
    if (!ioActive && pendingMisses === 0 && bufferingOverlay) {
      bufferingOverlay.hide();
    }
  };
  const onNetworkFetch = () => {
    if (disposed) return;
    Atomics.store(ctrl, CONTROL_OFF_FETCH_STAGE / 4, FETCH_STAGE_NETWORK);
    remoteChd.noteNetworkFetch();
  };

  function finalizeRead() {
    if (disposed) return;
    ioActive = false;
    if (pendingMisses === 0 && bufferingOverlay) bufferingOverlay.hide();
  }

  // Buffering overlay driven by miss listeners. Audio-tick suppression
  // is handled race-free in audio-worklet.js via Atomics.load on controlSAB.
  remoteChd.setMissListeners({ onStart: missOnStart, onEnd: missOnEnd });

  // Signal FETCH_STAGE=NETWORK when ChunkStore confirms a cache miss.
  remoteChd.setNetworkFetchListener(onNetworkFetch);

  // specTick: body of the speculator loop.
  function specTick() {
    if (disposed) return;
    if (specBusy) return;
    if (remoteChd.total <= 0) return;
    const total = remoteChd.getTotalChunks();

    let idx: number;
    if (specQueue !== null) {
      idx = specQueue;
      specQueue = null;
    } else {
      const candidate = specN + 1;
      if (candidate >= total) return;
      // Don't scan past lookahead cap.
      if (candidate > specLastMiss + SPEC_LOOKAHEAD) return;
      // Is n+1 cached? If so, idle this tick.
      if (remoteChd.hasChunkCached(candidate)) return;
      idx = candidate;
    }

    if (idx === specN) return; // just fetched this one; skip
    if (idx < 0 || idx >= total) return; // out of range (swap race)

    specBusy = true;
    remoteChd.prefetchChunk(idx).then(
      () => {
        if (disposed) return;
        specFetches++;
        specN = idx;
        specBusy = false;
      },
      (err: any) => {
        if (disposed) return;
        // Advance past failure so next tick moves on.
        console.warn(`bridge: speculator fetch failed for chunk ${idx}:`, err?.message ?? err);
        specN = idx;
        specBusy = false;
      },
    );
  }

  const onMessage = (e: MessageEvent) => {
    if (disposed) return;
    const msg = e.data;
    if (!msg || msg.type !== 'io') return;
    if (Atomics.load(ctrl, 0) !== 1 || Atomics.load(ctrl, 1) !== 0) return;
    const offHi = Atomics.load(ctrl, 2);
    const offLo = Atomics.load(ctrl, 3) >>> 0;
    const off = Number(BigInt(offHi) * 0x100000000n + BigInt(offLo));
    const len = Atomics.load(ctrl, 4);
    ioActive = true;
    // Optimistically signal CACHE; onNetworkFetch upgrades to NETWORK if needed.
    Atomics.store(ctrl, CONTROL_OFF_FETCH_STAGE / 4, FETCH_STAGE_CACHE);
    if (pendingMisses > 0 && bufferingOverlay) bufferingOverlay.show();

    remoteChd
      .read(off, len)
      .then((bytes: Uint8Array) => {
        if (disposed) return;
        consecutiveFailures = 0;
        const n = Math.min(bytes.length, dat.length);
        dat.set(bytes.subarray(0, n), 0);
        if (!firstLogged) {
          firstLogged = true;
          const head = Array.from(bytes.subarray(0, Math.min(8, n)))
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join(' ');
          const ascii = Array.from(bytes.subarray(0, Math.min(8, n)))
            .map((b: number) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
            .join('');
          console.log(
            `bridge: first read off=${off} len=${n} head_hex=${head} ascii='${ascii}' url=${remoteChd.url}`,
          );
        }
        Atomics.store(ctrl, 5, n);
        Atomics.store(ctrl, 0, 2);
        Atomics.notify(ctrl, 0, 1);
        finalizeRead();
      })
      .catch((err: any) => {
        if (disposed) return;
        consecutiveFailures++;
        console.error(
          `bridge: read failed (consecutive=${consecutiveFailures}) off=${off} len=${len}:`,
          err?.message ?? err,
        );
        Atomics.store(ctrl, 5, -1);
        Atomics.store(ctrl, 0, 2);
        Atomics.notify(ctrl, 0, 1);
        finalizeRead();
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && typeof onFatal === 'function') {
          onFatal(
            `stream read failed ${consecutiveFailures}\u00d7 in a row (off=${off} len=${len}): ${err?.message ?? err}`,
          );
        }
      });
  };

  worker.addEventListener('message', onMessage);

  return {
    startSpeculator() {
      if (disposed) return;
      if (!specTimer) specTimer = setInterval(specTick, SPEC_LOOP_MS);
    },
    stopSpeculator() {
      if (specTimer) {
        clearInterval(specTimer);
        specTimer = null;
      }
    },
    getSpeculatorStats(): SpeculatorStats {
      return {
        fetches: specFetches,
        n: specN,
        queued: specQueue,
        busy: specBusy,
        lastMiss: specLastMiss,
        running: !!specTimer,
      };
    },
    swapRemoteChd(newRemote: any) {
      if (disposed) return;
      remoteChd = newRemote;
      remoteChd.setMissListeners({ onStart: missOnStart, onEnd: missOnEnd });
      remoteChd.setNetworkFetchListener(onNetworkFetch);
      specN = -1;
      specQueue = 0;
      specBusy = false;
      specLastMiss = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (specTimer) {
        clearInterval(specTimer);
        specTimer = null;
      }
      ioActive = false;
      pendingMisses = 0;
      specBusy = false;
      specQueue = null;
      try {
        worker.removeEventListener('message', onMessage);
      } catch (e: any) {
        logWarn(`bridge: removeEventListener failed: ${e?.message ?? e}`);
      }
      try {
        remoteChd.setMissListeners({});
      } catch (e: any) {
        logWarn(`bridge: setMissListeners({}) failed: ${e?.message ?? e}`);
      }
      try {
        remoteChd.setNetworkFetchListener(null);
      } catch (e: any) {
        logWarn(`bridge: setNetworkFetchListener(null) failed: ${e?.message ?? e}`);
      }
      if (bufferingOverlay) {
        try {
          bufferingOverlay.hide();
        } catch (e: any) {
          logWarn(`bridge: bufferingOverlay.hide failed: ${e?.message ?? e}`);
        }
      }
    },
  };
}
