'use strict';

export class AudioManager {
  private _audioCtx: AudioContext | null = null;
  private _audioNode: AudioWorkletNode | null = null;
  private _gainNode: GainNode | null = null;
  private _audioChannel: MessageChannel | null = null;
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _lastHeartbeatTime = 0;
  private _stallWarned = false;
  private _savedVolume = 1;
  private _isMuted = false;
  private _boundOnStateChange: (() => void) | null = null;
  private _log: (level: string, msg: string) => void;

  constructor(log: (level: string, msg: string) => void) {
    this._log = log;
  }

  get audioCtx(): AudioContext | null {
    return this._audioCtx;
  }
  get sampleRate(): number {
    return this._audioCtx?.sampleRate ?? 0;
  }
  get savedVolume(): number {
    return this._savedVolume;
  }
  get isMuted(): boolean {
    return this._isMuted;
  }

  async setup(audioSAB: SharedArrayBuffer, controlSAB: SharedArrayBuffer) {
    const audioCtx = new AudioContext();
    this._audioCtx = audioCtx;
    this._log(
      'info',
      `audio-worklet: AudioContext created (state=${audioCtx.state}, sampleRate=${audioCtx.sampleRate})`,
    );
    this._boundOnStateChange = () => {
      if (!this._audioCtx) return;
      this._log(
        'info',
        `audio: AudioContext.statechange -> ${this._audioCtx.state} (currentTime=${this._audioCtx.currentTime.toFixed(3)})`,
      );
    };
    audioCtx.addEventListener('statechange', this._boundOnStateChange);

    if (audioCtx.state === ('running' as string)) {
      this._log(
        'warn',
        "audio: AudioContext came up already 'running' at page load (autoplay pre-authorized for this origin) — forcing suspend() until Start is pressed; see docs/audio-startup-bug.md",
      );
      audioCtx.suspend().catch((err: any) => {
        this._log(
          'error',
          `audio: suspend() after auto-running AudioContext failed: ${err && err.message ? err.message : err}`,
        );
      });
    }

    const workletUrl = `${import.meta.env.BASE_URL}audio-worklet.js`;
    await audioCtx.audioWorklet.addModule(workletUrl);
    this._audioNode = new AudioWorkletNode(audioCtx, 'ring-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this._gainNode = audioCtx.createGain();
    this._gainNode.gain.value = this._savedVolume;
    this._audioNode.connect(this._gainNode);
    this._gainNode.connect(audioCtx.destination);
    this._audioChannel = new MessageChannel();
    this._audioNode.port.postMessage(
      { audioSab: audioSAB, controlSab: controlSAB, tickPort: this._audioChannel.port1 },
      [this._audioChannel.port1],
    );
    this._audioNode.port.onmessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'ready') {
        this._log('info', `audio-worklet: ready (quantum=${e.data.quantum} frames)`);
      }
    };
    this._log('info', 'audio-worklet: module loaded + RingProcessor wired');
  }

  get tickPort(): MessagePort | null {
    return this._audioChannel?.port2 ?? null;
  }

  async resume(maxAttempts = 3) {
    const audioCtx = this._audioCtx;
    if (!audioCtx) return;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if ((audioCtx.state as string) === 'running') {
        this._log('info', `audio: resume ok on attempt ${attempt} (state=running)`);
        return;
      }
      try {
        await audioCtx.resume();
        this._log(
          'info',
          `audio: resume() resolved on attempt ${attempt} (state=${audioCtx.state})`,
        );
        if (audioCtx.state === 'running') return;
      } catch (err: any) {
        this._log(
          'error',
          `audio: resume() rejected on attempt ${attempt}: ${err && err.message ? err.message : err}`,
        );
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    if (audioCtx.state !== 'running') {
      this._log(
        'error',
        `audio: failed to reach 'running' after ${maxAttempts} attempts (state=${audioCtx.state}).`,
      );
    }
  }

  reconnectGain() {
    try {
      if (this._gainNode && this._audioCtx?.destination) {
        this._gainNode.connect(this._audioCtx.destination);
      }
    } catch (e: any) {
      this._log('warn', `audio: reconnectGain failed: ${e && e.message ? e.message : e}`);
    }
  }

  startHeartbeat() {
    if (this._heartbeatInterval || !this._audioCtx) return;
    this._lastHeartbeatTime = this._audioCtx.currentTime;
    this._stallWarned = false;
    this._heartbeatInterval = setInterval(() => {
      if (!this._audioCtx) return;
      const now = this._audioCtx.currentTime;
      const delta = now - this._lastHeartbeatTime;
      if ((this._audioCtx.state as string) === 'running' && delta <= 0) {
        if (!this._stallWarned) {
          this._stallWarned = true;
          this._log(
            'error',
            'audio: AudioContext reports state=running but currentTime is not advancing — the browser output stream appears stuck.',
          );
        }
      } else if (delta > 0) {
        this._stallWarned = false;
      }
      this._lastHeartbeatTime = now;
    }, 3000);
  }

  stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  setVolume(v: number) {
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this._savedVolume = val;
    this._isMuted = val === 0;
    if (this._gainNode) this._gainNode.gain.value = val;
  }

  dispose() {
    this.stopHeartbeat();
    if (this._audioCtx) {
      if (this._boundOnStateChange) {
        try {
          this._audioCtx.removeEventListener('statechange', this._boundOnStateChange);
        } catch (e: any) {
          this._log('warn', `audio: removeEventListener failed: ${e && e.message ? e.message : e}`);
        }
      }
      try {
        this._audioCtx.close();
      } catch (e: any) {
        this._log('warn', `audio: AudioContext.close failed: ${e && e.message ? e.message : e}`);
      }
      this._audioCtx = null;
    }
  }
}
