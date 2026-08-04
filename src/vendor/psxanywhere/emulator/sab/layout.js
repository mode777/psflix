'use strict';

export const VIDEO_W = 1024;
export const VIDEO_H = 512;
export const VIDEO_HEADER_BYTES = 16;
export const VIDEO_PIXEL_BYTES = VIDEO_W * VIDEO_H * 2;
export const VIDEO_SAB_BYTES = VIDEO_HEADER_BYTES + VIDEO_PIXEL_BYTES;

export const AUDIO_CAPACITY_FRAMES = 48000;
export const AUDIO_HEADER_BYTES = 24;
export const AUDIO_FRAME_BYTES = 2 * 4;
export const AUDIO_SAB_BYTES = AUDIO_HEADER_BYTES + AUDIO_CAPACITY_FRAMES * AUDIO_FRAME_BYTES;

export const MAX_PORTS = 8;
export const INPUT_PORT_BYTES = 64;
export const INPUT_SAB_BYTES = MAX_PORTS * INPUT_PORT_BYTES;
export const CONTROL_SAB_BYTES = 28;

export const DATA_SAB_BYTES = 4 * 1024 * 1024;

export const CONTROL_OFF_STATE  = 0;
export const CONTROL_OFF_OP     = 4;
export const CONTROL_OFF_OFF_HI = 8;
export const CONTROL_OFF_OFF_LO = 12;
export const CONTROL_OFF_LEN    = 16;
export const CONTROL_OFF_RESULT = 20;
export const CONTROL_OFF_FETCH_STAGE = 24;

export const VIDEO_OFF_WRITE_IDX = 0;
export const VIDEO_OFF_WIDTH = 4;
export const VIDEO_OFF_HEIGHT = 8;
export const VIDEO_OFF_PITCH = 12;

export const AUDIO_OFF_WRITE_IDX = 0;
export const AUDIO_OFF_READ_IDX = 4;
export const AUDIO_OFF_CAPACITY = 8;
export const AUDIO_OFF_SAMPLE_RATE = 12;
export const AUDIO_OFF_AV_FPS = 16;

export const INPUT_OFF_BUTTONS = 0;
export const INPUT_OFF_LX_LY = 4;
export const INPUT_OFF_RX_RY = 8;
export const INPUT_OFF_MOUSE_PACK    = 12;
export const INPUT_OFF_LIGHTGUN_PACK = 16;
export const INPUT_OFF_EDGE = 20;

export const INPUT_BIT_MOUSE_LEFT        = 16;
export const INPUT_BIT_MOUSE_RIGHT       = 17;
export const INPUT_BIT_LIGHTGUN_TRIGGER  = 18;
export const INPUT_BIT_LIGHTGUN_AUX      = 19;
export const INPUT_BIT_LIGHTGUN_OFFSCREEN = 20;

export function videoHeaderView(sab) {
  return new Int32Array(sab, 0, 4);
}

export function videoPixelView(sab) {
  return new Uint16Array(sab, VIDEO_HEADER_BYTES);
}

export function audioHeaderView(sab) {
  return new Int32Array(sab, 0, 4);
}

export function audioSampleView(sab) {
  return new Float32Array(sab, AUDIO_HEADER_BYTES);
}

export function inputMaskView(sab) {
  return new Int32Array(sab, 0, (INPUT_SAB_BYTES / 4) | 0);
}

export function inputPortView(sab, port) {
  const byteOffset = (port | 0) * INPUT_PORT_BYTES;
  return new Int32Array(sab, byteOffset, 16);
}

export function inputEdgeView(sab, port) {
  const byteOffset = (port | 0) * INPUT_PORT_BYTES + INPUT_OFF_EDGE;
  return new Int32Array(sab, byteOffset, 1);
}

export function controlView(sab) {
  return new Int32Array(sab, 0, 7);
}

export function dataView(sab) {
  return new Uint8Array(sab, 0);
}
