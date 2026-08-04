/// <reference path="./audio-worklet.d.ts" />

// AudioWorklet ring-drain processor with linear resampler (P3a1).
// See docs/worker.md and docs/audio-startup-bug.md.
// SAB layout: src/emulator/sab/layout.js (AUDIO_OFF_*).

import { AUDIO_HEADER_BYTES, CONTROL_OFF_STATE, CONTROL_OFF_FETCH_STAGE } from './sab/layout';

let lastTickFrames = 0;
let totalFramesProcessed = 0;

// Worker parks here during streaming reads.
const CONTROL_STATE_WAITING = 1;

// FETCH_STAGE: 0=PENDING, 1=CACHE (brief), 2=NETWORK (long, output silence).
const FETCH_STAGE_PENDING = 0;
const FETCH_STAGE_CACHE = 1;
const FETCH_STAGE_NETWORK = 2;

class RingProcessor extends AudioWorkletProcessor {
  audioSab: SharedArrayBuffer | null;
  tickPort: MessagePort | null;
  controlView: Int32Array | null;
  quantumFrames: number | undefined;
  readIdx: number;
  capacity: number;
  srcRate: number;
  ratio: number;
  haveTwoSamples: boolean;
  lastL: number;
  lastR: number;
  nextL: number;
  nextR: number;
  phase: number;
  softMuteGain: number;
  softMuteTarget: number;
  softMuteStep: number;
  holdL: number;
  holdR: number;

  constructor() {
    super();
    this.audioSab = null;
    this.tickPort = null;
    this.controlView = null;
    this.quantumFrames = undefined;
    this.readIdx = 0;
    this.capacity = 0;
    this.srcRate = 0;
    this.ratio = 0;
    this.haveTwoSamples = false;
    this.lastL = 0;
    this.lastR = 0;
    this.nextL = 0;
    this.nextR = 0;
    this.phase = 0;
    this.softMuteGain = 1.0;
    this.softMuteTarget = 1.0;
    this.softMuteStep = 1.0 / Math.max(1, Math.floor(sampleRate * 0.005));
    this.holdL = 0;
    this.holdR = 0;
    this.port.onmessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.audioSab) this.audioSab = e.data.audioSab;
      if (e.data.tickPort) this.tickPort = e.data.tickPort;
      if (e.data.controlSab) this.controlView = new Int32Array(e.data.controlSab);
    };
  }

  applySoftMute(outL: Float32Array, outR: Float32Array, frames: number) {
    this.applySoftMuteRange(outL, outR, 0, frames);
  }

  // Ramps the gain per-sample across outL/outR[start..end). The gain
  // moves toward `softMuteTarget` by `softMuteStep` each sample and is
  // clamped. The final gain is stored in `softMuteGain` so the ramp
  // continues seamlessly across quantum boundaries.
  applySoftMuteRange(outL: Float32Array, outR: Float32Array, start: number, end: number) {
    let gain = this.softMuteGain;
    const target = this.softMuteTarget;
    const step = this.softMuteStep;
    for (let i = start; i < end; i++) {
      if (gain < target) {
        gain += step;
        if (gain > target) gain = target;
      } else if (gain > target) {
        gain -= step;
        if (gain < target) gain = target;
      }
      outL[i] *= gain;
      outR[i] *= gain;
    }
    this.softMuteGain = gain;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.audioSab || !this.tickPort) {
      return true;
    }
    const out = outputs[0];
    if (!out || out.length < 2) {
      return true;
    }
    const outL = out[0];
    const outR = out[1];
    const frames = outL.length;
    if (this.quantumFrames === undefined) {
      this.quantumFrames = frames;
      this.port.postMessage({ type: 'ready', quantum: frames });
      // Also post on tickPort so the worker's 'ready' handler is reachable.
      this.tickPort.postMessage({ type: 'ready', quantum: frames });
    }
    // Worker blocked on streaming read: CACHE → drain ring, NETWORK → silence.
    const fetchStage = this.controlView
      ? Atomics.load(this.controlView, CONTROL_OFF_FETCH_STAGE / 4)
      : FETCH_STAGE_PENDING;
    const workerBlocked = !!(
      this.controlView &&
      Atomics.load(this.controlView, CONTROL_OFF_STATE / 4) === CONTROL_STATE_WAITING
    );
    const networkFetch = workerBlocked && fetchStage === FETCH_STAGE_NETWORK;

    if (networkFetch) {
      // Network fetch: output silence with soft-mute ramp.
      this.softMuteTarget = 0;
      outL.fill(this.holdL);
      outR.fill(this.holdR);
      this.applySoftMute(outL, outR, frames);
      return true;
    }

    const header = new Int32Array(this.audioSab, 0, 4);
    if (this.capacity === 0) {
      this.capacity = Atomics.load(header, 2) | 0;
      if (this.capacity <= 0) this.capacity = 1;
    }
    if (this.srcRate === 0) {
      this.srcRate = Atomics.load(header, 3) | 0;
      if (this.srcRate <= 0) this.srcRate = 44100;
    }
    if (this.ratio === 0) {
      this.ratio = this.srcRate / sampleRate;
    }

    const writeIdx = Atomics.load(header, 0) | 0;
    const samples = new Float32Array(this.audioSab, AUDIO_HEADER_BYTES);
    const cap = this.capacity;
    let readIdx = this.readIdx;
    let written = 0;

    while (written < frames) {
      if (!this.haveTwoSamples) {
        const available = (writeIdx - readIdx + cap) % cap;
        if (available < 2) break;
        this.lastL = samples[readIdx * 2];
        this.lastR = samples[readIdx * 2 + 1];
        readIdx = (readIdx + 1) % cap;
        this.nextL = samples[readIdx * 2];
        this.nextR = samples[readIdx * 2 + 1];
        readIdx = (readIdx + 1) % cap;
        this.phase = 0;
        this.haveTwoSamples = true;
      }

      outL[written] = this.lastL + (this.nextL - this.lastL) * this.phase;
      outR[written] = this.lastR + (this.nextR - this.lastR) * this.phase;
      written++;

      this.phase += this.ratio;
      while (this.phase >= 1.0) {
        const available = (writeIdx - readIdx + cap) % cap;
        if (available < 1) {
          this.haveTwoSamples = false;
          this.phase = 0;
          break;
        }
        this.lastL = this.nextL;
        this.lastR = this.nextR;
        this.phase -= 1.0;
        this.nextL = samples[readIdx * 2];
        this.nextR = samples[readIdx * 2 + 1];
        readIdx = (readIdx + 1) % cap;
      }
    }

    if (written > 0) {
      this.holdL = outL[written - 1];
      this.holdR = outR[written - 1];
    }

    // Underrun tail: hold last sample, ramp gain down for smooth transition.
    for (let i = written; i < frames; i++) {
      outL[i] = this.holdL;
      outR[i] = this.holdR;
    }

    if (written < frames) {
      this.softMuteTarget = 0;
      this.applySoftMuteRange(outL, outR, written, frames);
    } else {
      // Ramp gain back up (applies to next underrun or network-fetch path).
      this.softMuteTarget = 1;
      // Advance gain toward 1 without touching real audio.
      if (this.softMuteGain < 1.0) {
        let g = this.softMuteGain;
        const step = this.softMuteStep;
        const rampSamples = Math.min(frames, Math.ceil((1.0 - g) / step));
        g += step * rampSamples;
        if (g > 1.0) g = 1.0;
        this.softMuteGain = g;
      }
    }

    this.readIdx = readIdx;
    Atomics.store(header, 1, readIdx);

    // Track frames (no performance.now() in AudioWorklet).
    totalFramesProcessed += frames;

    if (!workerBlocked) {
      this.tickPort.postMessage({ type: 'tick' });
      if (lastTickFrames > 0) {
        const framesThisInterval = totalFramesProcessed - lastTickFrames;
        const msThisInterval = (framesThisInterval / sampleRate) * 1000;
        if (msThisInterval > 3) {
          console.log(`Audio tick interval: ${msThisInterval.toFixed(2)} ms`);
        }
      }
      lastTickFrames = totalFramesProcessed;
    }
    return true;
  }
}

registerProcessor('ring-processor', RingProcessor);
