'use strict';

export function downloadMemcard(
  slot: number,
  buf: Uint8Array,
  log: (level: string, msg: string) => void,
) {
  const blob = new Blob([buf.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pcsx-card${slot}.mcr`;
  a.click();
  URL.revokeObjectURL(url);
  log('info', `Exported memcard ${slot}`);
}
