'use strict';

// Recording mock satisfying the structural subset of the `Emulator` facade that
// client-side input code touches (setButtons / orEdgeBits / setAnalog /
// setMouseDelta / setLightgunPosition). Cast to `Emulator` at the call site via
// `as unknown as Emulator` — we only need the methods ControllerWriter calls.
//
// Reused by every tests/client/*.test.ts that drives a ControllerWriter /
// InputController, so the assertions stay uniform across the suite.

export interface ButtonsCall {
  port: number;
  bitmask: number;
}
export interface EdgeCall {
  port: number;
  bits: number;
}
export interface AnalogCall {
  port: number;
  stick: 'left' | 'right';
  x: number;
  y: number;
}
export interface MouseDeltaCall {
  port: number;
  dx: number;
  dy: number;
}
export interface LightgunCall {
  port: number;
  x: number;
  y: number;
}

export interface MockEmulator {
  buttonsCalls: ButtonsCall[];
  edgeCalls: EdgeCall[];
  analogCalls: AnalogCall[];
  mouseDeltaCalls: MouseDeltaCall[];
  lightgunCalls: LightgunCall[];
  /** Most recent setButtons bitmask recorded (0 when none recorded). */
  readonly lastButtons: number;
  /** Most recent orEdgeBits value recorded (0 when none recorded). */
  readonly lastEdge: number;
  clear(): void;
  // Facade subset (the methods ControllerWriter / InputController call).
  setButtons(port: number, bitmask: number): void;
  orEdgeBits(port: number, bits: number): void;
  setAnalog(port: number, stick: 'left' | 'right', x: number, y: number): void;
  setMouseDelta(port: number, dx: number, dy: number): void;
  setLightgunPosition(port: number, x: number, y: number): void;
}

export function createMockEmulator(): MockEmulator {
  const buttonsCalls: ButtonsCall[] = [];
  const edgeCalls: EdgeCall[] = [];
  const analogCalls: AnalogCall[] = [];
  const mouseDeltaCalls: MouseDeltaCall[] = [];
  const lightgunCalls: LightgunCall[] = [];

  return {
    buttonsCalls,
    edgeCalls,
    analogCalls,
    mouseDeltaCalls,
    lightgunCalls,
    get lastButtons() {
      return buttonsCalls.length ? buttonsCalls[buttonsCalls.length - 1].bitmask : 0;
    },
    get lastEdge() {
      return edgeCalls.length ? edgeCalls[edgeCalls.length - 1].bits : 0;
    },
    clear() {
      buttonsCalls.length = 0;
      edgeCalls.length = 0;
      analogCalls.length = 0;
      mouseDeltaCalls.length = 0;
      lightgunCalls.length = 0;
    },
    setButtons(port: number, bitmask: number) {
      buttonsCalls.push({ port, bitmask: bitmask >>> 0 });
    },
    orEdgeBits(port: number, bits: number) {
      edgeCalls.push({ port, bits: bits >>> 0 });
    },
    setAnalog(port: number, stick: 'left' | 'right', x: number, y: number) {
      analogCalls.push({ port, stick, x, y });
    },
    setMouseDelta(port: number, dx: number, dy: number) {
      mouseDeltaCalls.push({ port, dx, dy });
    },
    setLightgunPosition(port: number, x: number, y: number) {
      lightgunCalls.push({ port, x, y });
    },
  };
}
