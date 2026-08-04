'use strict';

// Save-state slot/key domain helpers and sync-status constants.

export const SLOT_AUTO = 'auto' as const;

export const UNSYNCED = 0 as const;
export const SYNCED = 1 as const;
export type SyncState = typeof UNSYNCED | typeof SYNCED;

export type SlotType = typeof SLOT_AUTO | `slot${number}`;

export function slotToType(slot: number | string): string {
  if (slot === SLOT_AUTO) return 'auto';
  return slot === 0 ? 'slot1' : `slot${slot}`;
}

export function compositeKey(discSerial: string, slot: number | string): string {
  return `${discSerial}:${slotToType(slot)}`;
}

export function typeToSlot(type: string): number | 'auto' {
  if (type === 'auto') return SLOT_AUTO;
  if (type === 'slot1') return 0;
  const n = parseInt(String(type).replace('slot', ''), 10);
  if (Number.isNaN(n)) throw new RangeError(`Invalid slot type: ${JSON.stringify(type)}`);
  return n;
}
