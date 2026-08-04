import assert from 'node:assert';
import { CONTROLLER } from '../../src/vendor/psxanywhere/emulator/messages.js';
import {
  MAX_PORTS,
  INPUT_PORT_BYTES,
  INPUT_OFF_BUTTONS,
  INPUT_OFF_MOUSE_PACK,
  INPUT_OFF_LIGHTGUN_PACK,
  INPUT_OFF_EDGE,
  INPUT_BIT_MOUSE_LEFT,
  INPUT_BIT_MOUSE_RIGHT,
  INPUT_BIT_LIGHTGUN_TRIGGER,
  INPUT_BIT_LIGHTGUN_AUX,
  INPUT_BIT_LIGHTGUN_OFFSCREEN,
} from '../../src/vendor/psxanywhere/emulator/sab/layout.js';

// RETRO_DEVICE_SUBCLASS(base, id) = ((id + 1) << RETRO_DEVICE_TYPE_SHIFT) | base
// where RETRO_DEVICE_TYPE_SHIFT = 8. Device bases (libretro.h):
//   JOYPAD=1, MOUSE=2, LIGHTGUN=4, ANALOG=5
const sub = (base, id) => ((id + 1) << 8) | base;

// Verify the CONTROLLER constants match the expected libretro device subclass IDs.
// These values MUST match the switch in pcsx_rearmed/frontend/libretro.c:1181
// (PSE_PAD_TYPE_*) or the device type silently falls through to
// PSE_PAD_TYPE_NONE and the controller disappears.

assert.strictEqual(CONTROLLER.STANDARD,  0x001, 'STANDARD must be RETRO_DEVICE_JOYPAD (1)');
assert.strictEqual(CONTROLLER.ANALOG,    sub(5, 0), 'ANALOG must be RETRO_DEVICE_SUBCLASS(ANALOG=5, 0)');
assert.strictEqual(CONTROLLER.DUALSHOCK, sub(5, 1), 'DUALSHOCK must be RETRO_DEVICE_SUBCLASS(ANALOG=5, 1)');
assert.strictEqual(CONTROLLER.NEGCON,    sub(5, 2), 'NEGCON must be RETRO_DEVICE_SUBCLASS(ANALOG=5, 2)');
assert.strictEqual(CONTROLLER.MOUSE,     sub(2, 0), 'MOUSE must be RETRO_DEVICE_SUBCLASS(MOUSE=2, 0)');
assert.strictEqual(CONTROLLER.GUNCON,    sub(4, 0), 'GUNCON must be RETRO_DEVICE_SUBCLASS(LIGHTGUN=4, 0)');
assert.strictEqual(CONTROLLER.JUSTIFIER, sub(4, 1), 'JUSTIFIER must be RETRO_DEVICE_SUBCLASS(LIGHTGUN=4, 1)');

// Cross-check: each value must be positive and fit in a uint32
for (const [name, value] of Object.entries(CONTROLLER)) {
  assert.ok(Number.isInteger(value), `${name} must be an integer`);
  assert.ok(value > 0, `${name} must be positive`);
  assert.ok(value <= 0xFFFFFFFF, `${name} must fit in uint32`);
}

// Verify no extra/missing properties on the frozen object
const expectedKeys = ['STANDARD', 'ANALOG', 'DUALSHOCK', 'NEGCON', 'MOUSE', 'GUNCON', 'JUSTIFIER'];
const actualKeys = Object.keys(CONTROLLER);
assert.strictEqual(actualKeys.length, expectedKeys.length, 'CONTROLLER must have exactly the expected number of keys');
for (const key of expectedKeys) {
  assert.ok(key in CONTROLLER, `CONTROLLER must have key ${key}`);
}

console.log('controller-constants.test.js: all assertions passed');

// --- Input SAB layout sync guards -------------------------------------------
// These offsets are duplicated as literals in src/emulator/worker/host.c (the #define
// INPUT_BIT_* block and the byte 20 edge-slot read in host_input_poll_cb) and
// in src/emulator/worker/sab_runtime.js (the port*64+20 drain offset). The build's
// materializeSabRuntimeLibrary does NOT substitute INPUT offsets into C/JS,
// so the sync is manual. These guards catch a silent drift that would either
// misread the edge latch or corrupt an adjacent slot. See docs/input.md.

assert.strictEqual(MAX_PORTS, 8, 'MAX_PORTS must match libretro.c PORTS_NUMBER (8)');
assert.strictEqual(INPUT_PORT_BYTES, 64, 'INPUT_PORT_BYTES must be 64 (mirrors host.c scratch stride)');
// Edge slot must be slot 5 (byte 20) — host.c reads p[20..23] and
// sab_runtime.js uses port*64+20. A change here requires updating both.
assert.strictEqual(INPUT_OFF_EDGE, 20, 'INPUT_OFF_EDGE must be 20 (host.c p[20..23] + sab_runtime port*64+20)');
// The edge slot must not collide with any populated slot.
assert.notStrictEqual(INPUT_OFF_EDGE, INPUT_OFF_BUTTONS);
assert.notStrictEqual(INPUT_OFF_EDGE, INPUT_OFF_MOUSE_PACK);
assert.notStrictEqual(INPUT_OFF_EDGE, INPUT_OFF_LIGHTGUN_PACK);
assert.ok(INPUT_OFF_EDGE + 4 <= INPUT_PORT_BYTES, 'edge slot must fit in the 64-byte per-port region');

// INPUT_BIT_* must match the #define INPUT_BIT_* block in src/emulator/worker/host.c.
assert.strictEqual(INPUT_BIT_MOUSE_LEFT, 16);
assert.strictEqual(INPUT_BIT_MOUSE_RIGHT, 17);
assert.strictEqual(INPUT_BIT_LIGHTGUN_TRIGGER, 18);
assert.strictEqual(INPUT_BIT_LIGHTGUN_AUX, 19);
assert.strictEqual(INPUT_BIT_LIGHTGUN_OFFSCREEN, 20);

console.log('controller-constants.test.js: input SAB layout assertions passed');
