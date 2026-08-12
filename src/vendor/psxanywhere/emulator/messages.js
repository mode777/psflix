'use strict';

// Shared postMessage type constants. See docs/worker.md.

export const CONTROLLER = Object.freeze({
  STANDARD:  0x001,
  ANALOG:    0x105,
  DUALSHOCK: 0x205,
  NEGCON:    0x305,
  MOUSE:     0x102,
  GUNCON:    0x104,
  JUSTIFIER: 0x204,
});

export const MSG = Object.freeze({
  INIT: 'init',
  BIOS: 'bios',
  CHD: 'chd',
  CD: 'cd',
  RUN_START: 'run:start',
  RUN_STOP: 'run:stop',
  SET_SPEED_MODE: 'speed:mode',
  CRT_TOGGLE: 'crt:toggle',
  CRT_PARAM: 'crt:param',
  MEMCARD_EXPORT: 'memcard:export',
  MEMCARD_IMPORT: 'memcard:import',
  MEMCARD_IMPORT_DONE: 'memcard:import:done',
  MEMCARD_FLUSH: 'memcard:flush',
  SAVE_STATE: 'state:save',
  LOAD_STATE: 'state:load',
  SET_CONTROLLER_DEVICE: 'set:controller-device',
  SWAP_DISC: 'swap:disc',

  READY: 'ready',
  LOADED: 'loaded',
  RUN_STOPPED: 'run:stopped',
  FRAME: 'frame',
  STATS: 'stats',
  FATAL: 'fatal',
  LOG: 'log',
  IO: 'io',
  MEMCARD_EXPORT_RESULT: 'memcard:export:result',
  MEMCARD_IMPORT_RESULT: 'memcard:import:result',
  MEMCARD_LOAD_REQUEST: 'memcard:load-request',
  SAVE_STATE_RESULT: 'state:save:result',
  LOAD_STATE_RESULT: 'state:load:result',
  SET_CONTROLLER_DEVICE_RESULT: 'set:controller-device:result',
  SWAP_DISC_RESULT: 'swap:disc:result',
});
