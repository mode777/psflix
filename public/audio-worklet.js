/* Generated from src/vendor/psxanywhere/emulator/audio-worklet.ts — run: npm run build:worklet. Do not edit by hand. */

// src/vendor/psxanywhere/emulator/sab/layout.js
var VIDEO_W = 1024;
var VIDEO_H = 512;
var VIDEO_HEADER_BYTES = 16;
var VIDEO_PIXEL_BYTES = VIDEO_W * VIDEO_H * 2;
var VIDEO_SAB_BYTES = VIDEO_HEADER_BYTES + VIDEO_PIXEL_BYTES;
var AUDIO_CAPACITY_FRAMES = 48e3;
var AUDIO_HEADER_BYTES = 24;
var AUDIO_FRAME_BYTES = 2 * 4;
var AUDIO_SAB_BYTES = AUDIO_HEADER_BYTES + AUDIO_CAPACITY_FRAMES * AUDIO_FRAME_BYTES;
var MAX_PORTS = 8;
var INPUT_PORT_BYTES = 64;
var INPUT_SAB_BYTES = MAX_PORTS * INPUT_PORT_BYTES;
var DATA_SAB_BYTES = 4 * 1024 * 1024;
var CONTROL_OFF_STATE = 0;
var CONTROL_OFF_FETCH_STAGE = 24;

// src/vendor/psxanywhere/emulator/audio-worklet.ts
var lastTickFrames = 0;
var totalFramesProcessed = 0;
var CONTROL_STATE_WAITING = 1;
var FETCH_STAGE_PENDING = 0;
var FETCH_STAGE_NETWORK = 2;
var RingProcessor = class extends AudioWorkletProcessor {
  audioSab;
  tickPort;
  controlView;
  quantumFrames;
  readIdx;
  capacity;
  srcRate;
  ratio;
  haveTwoSamples;
  lastL;
  lastR;
  nextL;
  nextR;
  phase;
  softMuteGain;
  softMuteTarget;
  softMuteStep;
  holdL;
  holdR;
  constructor() {
    super();
    this.audioSab = null;
    this.tickPort = null;
    this.controlView = null;
    this.quantumFrames = void 0;
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
    this.softMuteGain = 1;
    this.softMuteTarget = 1;
    this.softMuteStep = 1 / Math.max(1, Math.floor(sampleRate * 5e-3));
    this.holdL = 0;
    this.holdR = 0;
    this.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.audioSab) this.audioSab = e.data.audioSab;
      if (e.data.tickPort) this.tickPort = e.data.tickPort;
      if (e.data.controlSab) this.controlView = new Int32Array(e.data.controlSab);
    };
  }
  applySoftMute(outL, outR, frames) {
    this.applySoftMuteRange(outL, outR, 0, frames);
  }
  // Ramps the gain per-sample across outL/outR[start..end). The gain
  // moves toward `softMuteTarget` by `softMuteStep` each sample and is
  // clamped. The final gain is stored in `softMuteGain` so the ramp
  // continues seamlessly across quantum boundaries.
  applySoftMuteRange(outL, outR, start, end) {
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
  process(_inputs, outputs) {
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
    if (this.quantumFrames === void 0) {
      this.quantumFrames = frames;
      this.port.postMessage({ type: "ready", quantum: frames });
      this.tickPort.postMessage({ type: "ready", quantum: frames });
    }
    const fetchStage = this.controlView ? Atomics.load(this.controlView, CONTROL_OFF_FETCH_STAGE / 4) : FETCH_STAGE_PENDING;
    const workerBlocked = !!(this.controlView && Atomics.load(this.controlView, CONTROL_OFF_STATE / 4) === CONTROL_STATE_WAITING);
    const networkFetch = workerBlocked && fetchStage === FETCH_STAGE_NETWORK;
    if (networkFetch) {
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
      while (this.phase >= 1) {
        const available = (writeIdx - readIdx + cap) % cap;
        if (available < 1) {
          this.haveTwoSamples = false;
          this.phase = 0;
          break;
        }
        this.lastL = this.nextL;
        this.lastR = this.nextR;
        this.phase -= 1;
        this.nextL = samples[readIdx * 2];
        this.nextR = samples[readIdx * 2 + 1];
        readIdx = (readIdx + 1) % cap;
      }
    }
    if (written > 0) {
      this.holdL = outL[written - 1];
      this.holdR = outR[written - 1];
    }
    for (let i = written; i < frames; i++) {
      outL[i] = this.holdL;
      outR[i] = this.holdR;
    }
    if (written < frames) {
      this.softMuteTarget = 0;
      this.applySoftMuteRange(outL, outR, written, frames);
    } else {
      this.softMuteTarget = 1;
      if (this.softMuteGain < 1) {
        let g = this.softMuteGain;
        const step = this.softMuteStep;
        const rampSamples = Math.min(frames, Math.ceil((1 - g) / step));
        g += step * rampSamples;
        if (g > 1) g = 1;
        this.softMuteGain = g;
      }
    }
    this.readIdx = readIdx;
    Atomics.store(header, 1, readIdx);
    totalFramesProcessed += frames;
    if (!workerBlocked) {
      this.tickPort.postMessage({ type: "tick" });
      if (lastTickFrames > 0) {
        const framesThisInterval = totalFramesProcessed - lastTickFrames;
        const msThisInterval = framesThisInterval / sampleRate * 1e3;
        if (msThisInterval > 3) {
          console.log(`Audio tick interval: ${msThisInterval.toFixed(2)} ms`);
        }
      }
      lastTickFrames = totalFramesProcessed;
    }
    return true;
  }
};
registerProcessor("ring-processor", RingProcessor);
