'use strict';

// Rate-limited perf diagnostics. See issues/frame-timing-slowness.md.

const CONSECUTIVE = 2;
const FPS_RATIO = 0.9;
const CACHE_HIT_RATIO = 0.85;
const NETWORK_FETCHES_PER_SEC = 5;
const COOLDOWN_MS = 15000;
const CLOCK_NOT_ARMMED_COOLDOWN_MS = 30000;
const MASTERN_COOLDOWN_MS = 30000;
const CLOCK_NOT_ARMED_GRACE_MS = 2000;

interface Condition {
  bad: boolean;
  consecutive: number;
  lastWarn: number;
}

export function createPerfWarn(logger: (level: string, msg: string) => void) {
  const log = typeof logger === 'function' ? logger : () => {};

  const conds = new Map<string, Condition>();
  function cond(id: string): Condition {
    let c = conds.get(id);
    if (!c) {
      c = { bad: false, consecutive: 0, lastWarn: 0 };
      conds.set(id, c);
    }
    return c;
  }

  let prevNetworkFetchCount: number | null = null;
  let prevHits: number | null = null;
  let prevMisses: number | null = null;
  let loadedAt: number | null = null;

  function warn(id: string, cooldown: number, msg: string) {
    const c = cond(id);
    const now = Date.now();
    if (!c.bad) {
      c.consecutive++;
      if (c.consecutive < CONSECUTIVE) return;
      c.bad = true;
      c.lastWarn = now;
      log('warn', msg);
      return;
    }
    c.consecutive = 0;
    if (now - c.lastWarn >= cooldown) {
      c.lastWarn = now;
      log('warn', msg);
    }
  }

  function recover(id: string, msg: string) {
    const c = cond(id);
    if (c.bad) {
      c.bad = false;
      c.consecutive = 0;
      log('info', msg);
    } else {
      c.consecutive = 0;
    }
  }

  function check(stats: any) {
    if (!stats) return;

    if (stats.loadedAt) loadedAt = stats.loadedAt;
    const now = Date.now();

    const targetFps = +stats.targetFps;
    const fps = +stats.fps;
    const masterN = +stats.masterN;
    const tpf = +stats.ticksPerFrame;
    const audioClockActive = !!stats.audioClockActive;

    const deltaNet =
      prevNetworkFetchCount === null
        ? 0
        : Math.max(0, (stats.networkFetchCount | 0) - prevNetworkFetchCount);
    prevNetworkFetchCount = stats.networkFetchCount | 0;

    const dHits = prevHits === null ? 0 : Math.max(0, (stats.streamLocalHits | 0) - prevHits);
    const dMisses =
      prevMisses === null ? 0 : Math.max(0, (stats.streamLocalMisses | 0) - prevMisses);
    prevHits = stats.streamLocalHits | 0;
    prevMisses = stats.streamLocalMisses | 0;

    const totalReads = dHits + dMisses;
    const intervalHitRatio = totalReads > 0 ? dHits / totalReads : null;

    if (loadedAt !== null && now - loadedAt >= CLOCK_NOT_ARMED_GRACE_MS) {
      if (!audioClockActive) {
        warn(
          'clock-not-armed',
          CLOCK_NOT_ARMMED_COOLDOWN_MS,
          `perf: audio clock not armed — host_run_frame is not being called; emulation is frozen or running off the warmup setTimeout path (see issues/frame-timing-slowness.md)`,
        );
      } else {
        recover('clock-not-armed', 'perf: clock-not-armed recovered (audio clock armed)');
      }
    }

    const masternBad = !(targetFps > 0) || !(masterN > 0) || !(tpf > 0) || tpf < 0.5 || tpf > 20;
    if (masternBad) {
      warn(
        'mastern-invalid',
        MASTERN_COOLDOWN_MS,
        `perf: master clock params invalid (targetFps=${targetFps}, masterN=${masterN}, ticksPerFrame=${tpf}) — recomputeMasterN likely got a bad readFps()/workletSampleRate; see issues/frame-timing-slowness.md`,
      );
    } else {
      recover('mastern-invalid', 'perf: mastern-invalid recovered (master clock params valid)');
    }

    if (!audioClockActive || !(targetFps > 0)) {
      recover('running-behind', 'perf: running-behind recovered (clock inactive, clearing state)');
      recover('cache-cold', 'perf: cache-cold recovered (clock inactive, clearing state)');
      recover('network-thrash', 'perf: network-thrash recovered (clock inactive, clearing state)');
      recover('slow-frames', 'perf: slow-frames recovered (clock inactive, clearing state)');
      return;
    }

    const fpsLow = fps < targetFps * FPS_RATIO;

    const streamingHealthy = intervalHitRatio === null || intervalHitRatio >= 0.9;

    if (fpsLow) {
      if (streamingHealthy) {
        warn(
          'slow-frames',
          COOLDOWN_MS,
          `perf: slow frames with healthy streaming — emu itself is the bottleneck (fps=${fps} vs target=${targetFps.toFixed(2)}, cacheHitRatio=${intervalHitRatio === null ? 'n/a' : intervalHitRatio.toFixed(2)}); see issues/frame-timing-slowness.md`,
        );
        recover('running-behind', 'perf: running-behind recovered (reclassified as slow-frames)');
      } else {
        warn(
          'running-behind',
          COOLDOWN_MS,
          `perf: running behind realtime — likely streaming-starved (fps=${fps} vs target=${targetFps.toFixed(2)}, cacheHitRatio=${intervalHitRatio!.toFixed(2)}); see issues/frame-timing-slowness.md`,
        );
        recover('slow-frames', 'perf: slow-frames recovered (reclassified as running-behind)');
      }
    } else {
      recover('running-behind', 'perf: running-behind recovered (fps caught up)');
      recover('slow-frames', 'perf: slow-frames recovered (fps caught up)');
    }

    if (intervalHitRatio !== null && totalReads > 0) {
      if (intervalHitRatio < CACHE_HIT_RATIO) {
        warn(
          'cache-cold',
          COOLDOWN_MS,
          `perf: streaming cache cold (hit ratio=${intervalHitRatio.toFixed(2)} over ${totalReads} reads this sec, cumulative hits=${stats.streamLocalHits} misses=${stats.streamLocalMisses}); see issues/frame-timing-slowness.md`,
        );
      } else {
        recover('cache-cold', 'perf: cache-cold recovered (hit ratio healthy)');
      }
    } else {
      recover('cache-cold', 'perf: cache-cold recovered (no streaming reads this sec)');
    }

    if (deltaNet > NETWORK_FETCHES_PER_SEC) {
      warn(
        'network-thrash',
        COOLDOWN_MS,
        `perf: network fetch thrash (${deltaNet} fetches/sec, cumulative=${stats.networkFetchCount}); see issues/frame-timing-slowness.md`,
      );
    } else {
      recover('network-thrash', 'perf: network-thrash recovered (fetch rate normal)');
    }
  }

  return { check };
}
