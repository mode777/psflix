'use strict';

export const RGB565_TO_RGBA: Uint32Array = (() => {
  const t = new Uint32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const r5 = (i >> 11) & 0x1f;
    const g6 = (i >> 5) & 0x3f;
    const b5 = i & 0x1f;
    t[i] =
      (0xff << 24) |
      (((b5 << 3) | (b5 >> 2)) << 16) |
      (((g6 << 2) | (g6 >> 4)) << 8) |
      ((r5 << 3) | (r5 >> 2));
  }
  return t;
})();
