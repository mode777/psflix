'use strict';

// Button bit positions. Must stay in sync with host.c INPUT_BIT_*.

export const BUTTON = Object.freeze({
  B: 0,
  Y: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
  L2: 12,
  R2: 13,
  L3: 14,
  R3: 15,

  MOUSE_LEFT: 16,
  MOUSE_RIGHT: 17,
  LIGHTGUN_TRIGGER: 18,
  LIGHTGUN_AUX: 19,
  LIGHTGUN_OFFSCREEN: 20,
});

export const BUTTON_LABELS = Object.freeze({
  [BUTTON.B]: 'B (cross)',
  [BUTTON.Y]: 'Y (triangle)',
  [BUTTON.A]: 'A (circle)',
  [BUTTON.X]: 'X (square)',
  [BUTTON.SELECT]: 'SELECT',
  [BUTTON.START]: 'START',
  [BUTTON.UP]: 'UP',
  [BUTTON.DOWN]: 'DOWN',
  [BUTTON.LEFT]: 'LEFT',
  [BUTTON.RIGHT]: 'RIGHT',
  [BUTTON.L]: 'L1',
  [BUTTON.R]: 'R1',
  [BUTTON.L2]: 'L2',
  [BUTTON.R2]: 'R2',
  [BUTTON.L3]: 'L3',
  [BUTTON.R3]: 'R3',
});
