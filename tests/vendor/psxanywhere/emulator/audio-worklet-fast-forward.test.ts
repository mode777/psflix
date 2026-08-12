import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CAPACITY_FRAMES,
  AUDIO_HEADER_BYTES,
  AUDIO_SAB_BYTES,
  CONTROL_SAB_BYTES,
} from '../../../../src/vendor/psxanywhere/emulator/sab/layout';

type ProcessorConstructor = new () => {
  port: { onmessage: ((event: MessageEvent) => void) | null };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
};

let Processor: ProcessorConstructor;

beforeAll(async () => {
  class MockAudioWorkletProcessor {
    port = { onmessage: null as ((event: MessageEvent) => void) | null, postMessage: vi.fn() };
  }

  vi.stubGlobal('sampleRate', 48_000);
  vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor);
  vi.stubGlobal('registerProcessor', (_name: string, constructor: ProcessorConstructor) => {
    Processor = constructor;
  });

  await import('../../../../src/vendor/psxanywhere/emulator/audio-worklet');
});

describe('AudioWorklet fast-forward audio policy', () => {
  it('discards accelerated audio while continuing worker clock ticks', () => {
    const audioSAB = new SharedArrayBuffer(AUDIO_SAB_BYTES);
    const audioHeader = new Int32Array(audioSAB, 0, 4);
    Atomics.store(audioHeader, 0, 1_000);
    Atomics.store(audioHeader, 1, 100);
    Atomics.store(audioHeader, 2, AUDIO_CAPACITY_FRAMES);
    Atomics.store(audioHeader, 3, 44_100);
    new Float32Array(audioSAB, AUDIO_HEADER_BYTES).fill(0.75, 0, 2_000);

    expect(CONTROL_SAB_BYTES).toBe(28);
    const controlSAB = new SharedArrayBuffer(CONTROL_SAB_BYTES);

    const tickPort = {
      postMessage: vi.fn(),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    const processor = new Processor();
    processor.port.onmessage?.({
      data: { audioSab: audioSAB, controlSab: controlSAB, tickPort },
    } as MessageEvent);
    tickPort.onmessage?.({ data: { type: 'speed', multiplier: 2 } } as MessageEvent);

    const left = new Float32Array(128);
    const right = new Float32Array(128);
    const keepRunning = processor.process([], [[left, right]]);

    expect(keepRunning).toBe(true);
    expect(Atomics.load(audioHeader, 1)).toBe(1_000);
    expect(left.every((sample) => sample === 0)).toBe(true);
    expect(right.every((sample) => sample === 0)).toBe(true);
    expect(tickPort.postMessage).toHaveBeenCalledWith({ type: 'tick' });
  });
});
