'use strict';

export function removeByValue<V>(map: Record<string | number, V>, target: V) {
  for (const k of Object.keys(map)) {
    if (map[k] === target) delete map[k];
  }
}

export function applyKeyRebind(
  map: Record<string, number>,
  bit: number,
  key: string,
): Record<string, number> {
  const out: Record<string, number> = Object.assign({}, map);
  removeByValue(out, bit);
  out[key] = bit;
  return out;
}

export function applyGamepadRebind(
  map: Record<number, number>,
  bit: number,
  btnIdx: number,
): Record<number, number> {
  const out: Record<number, number> = Object.assign({}, map);
  removeByValue(out as Record<string | number, number>, bit);
  out[btnIdx] = bit;
  return out;
}
