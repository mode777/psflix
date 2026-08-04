'use strict';

import { MSG } from '../messages';
import { WorkerContext, post, logInfo, logWarn, logError, BOOT, bootHas } from './context';

export function handleSaveState(ctx: WorkerContext, msg: any) {
  const slot = msg.slot;
  if (!bootHas(ctx, BOOT.GAME) || !ctx.Module) {
    post({ type: MSG.SAVE_STATE_RESULT, slot, buf: null });
    return;
  }
  try {
    const size = ctx.cfunc.host_serialize_size();
    if (!(size > 0)) {
      logWarn(`worker: saveState ${slot}: serialize_size returned 0`);
      post({ type: MSG.SAVE_STATE_RESULT, slot, buf: null });
      return;
    }
    const ptr = ctx.cfunc.malloc(size);
    if (!ptr) {
      logError(`worker: saveState ${slot}: malloc(${size}) failed`);
      post({ type: MSG.SAVE_STATE_RESULT, slot, buf: null });
      return;
    }
    try {
      const ok = ctx.cfunc.host_save_state(ptr, size);
      if (!ok) {
        logWarn(`worker: saveState ${slot}: retro_serialize returned false`);
        post({ type: MSG.SAVE_STATE_RESULT, slot, buf: null });
        return;
      }
      const bytes = new Uint8Array(size);
      bytes.set(new Uint8Array(ctx.Module.HEAPU8.buffer, ptr, size));
      const ab = bytes.buffer;
      const cdromIdPtr = ctx.cfunc.host_get_cdrom_id();
      const cdromId = ctx.Module.UTF8ToString(cdromIdPtr, 9);
      post({ type: MSG.SAVE_STATE_RESULT, slot, buf: ab, cdromId }, [ab]);
      logInfo(`worker: saveState ${slot}: ${size} bytes`);
    } finally {
      ctx.cfunc.free(ptr);
    }
  } catch (e: any) {
    logError(`worker: saveState ${slot} failed: ${e && e.message ? e.message : e}`);
    post({ type: MSG.SAVE_STATE_RESULT, slot, buf: null });
  }
}

export function handleLoadState(ctx: WorkerContext, msg: any) {
  const slot = msg.slot;
  const buf = msg.buf;
  if (!bootHas(ctx, BOOT.GAME) || !ctx.Module || !buf || buf.byteLength === 0) {
    post({ type: MSG.LOAD_STATE_RESULT, slot, ok: false, error: 'no game loaded or empty buffer' });
    return;
  }
  try {
    const len = buf.byteLength;
    const ptr = ctx.cfunc.malloc(len);
    if (!ptr) {
      logError(`worker: loadState ${slot}: malloc(${len}) failed`);
      post({ type: MSG.LOAD_STATE_RESULT, slot, ok: false, error: 'malloc failed' });
      return;
    }
    try {
      new Uint8Array(ctx.Module.HEAPU8.buffer, ptr, len).set(new Uint8Array(buf));
      const ok = !!ctx.cfunc.host_load_state(ptr, len);
      if (ok) {
        logInfo(`worker: loadState ${slot}: ${len} bytes restored`);
        post({ type: MSG.LOAD_STATE_RESULT, slot, ok: true });
      } else {
        logWarn(`worker: loadState ${slot}: retro_unserialize returned false (wrong disc / size?)`);
        post({
          type: MSG.LOAD_STATE_RESULT,
          slot,
          ok: false,
          error: 'retro_unserialize failed (state may be for a different disc)',
        });
      }
    } finally {
      ctx.cfunc.free(ptr);
    }
  } catch (e: any) {
    logError(`worker: loadState ${slot} failed: ${e && e.message ? e.message : e}`);
    post({
      type: MSG.LOAD_STATE_RESULT,
      slot,
      ok: false,
      error: String(e && e.message ? e.message : e),
    });
  }
}
