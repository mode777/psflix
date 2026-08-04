'use strict';

import { MSG } from '../messages';
import {
  WorkerContext,
  post,
  logInfo,
  logWarn,
  MEMCARD_SLOTS,
  memcardPath,
  BOOT,
  bootHas,
} from './context';

// Dual-FNV1A hash: 32-bit FNV1a + 64-bit FNV1a variant combined via
// (h1 * 0x100000 + h2). Max combined value ≈ 4.5e15 < Number.MAX_SAFE_INTEGER.
const FNV1A_32_OFFSET = 0x811c9dc5;
const FNV1A_32_PRIME = 0x01000193;
const FNV1A_ALT_OFFSET = 0x84222325;
const FNV1A_ALT_XOR = 0x5a;

export function hashMemcard(bytes: Uint8Array): string {
  let h1 = FNV1A_32_OFFSET >>> 0;
  let h2 = FNV1A_ALT_OFFSET >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, FNV1A_32_PRIME) >>> 0;
    h2 = Math.imul(h2 ^ (b ^ FNV1A_ALT_XOR), FNV1A_32_PRIME) >>> 0;
  }
  return (h1 * 0x100000 + h2).toString(36);
}

export function readMemcardHash(ctx: WorkerContext, slot: number): string | null {
  try {
    const data = ctx.Module.FS_readFile(memcardPath(slot));
    return hashMemcard(data) + ':' + data.byteLength;
  } catch (e: any) {
    logWarn(`worker: readMemcardHash(${slot}) failed: ${e?.message ?? e}`);
    return null;
  }
}

export function findMemcardFiles(ctx: WorkerContext): string[] {
  const results: string[] = [];
  const scan = (dir: string) => {
    try {
      const entries = ctx.Module.FS_readdir(dir);
      for (const name of entries) {
        if (name === '.' || name === '..') continue;
        const full = dir === '/' ? `/${name}` : `${dir}/${name}`;
        try {
          const st = ctx.Module.FS_stat(full);
          if ((st.mode & 0o170000) === 0o040000) {
            if (dir === '/' && (name === 'proc' || name === 'dev' || name === 'tmp')) continue;
            scan(full);
          } else if (
            name.endsWith('.mcd') ||
            name.endsWith('.mcr') ||
            name.includes('memcard') ||
            name.includes('card')
          ) {
            results.push(`${full} (${st.size} bytes)`);
          }
        } catch (e: any) {
          logWarn(`worker: FS_stat(${full}) failed: ${e?.message ?? e}`);
        }
      }
    } catch (e: any) {
      logWarn(`worker: FS_readdir(${dir}) failed: ${e?.message ?? e}`);
    }
  };
  scan('/');
  return results;
}

export const memcardLastHash: Record<number, string | null> = { 1: null, 2: null };
let memcardFlushTimer: ReturnType<typeof setInterval> | null = null;

export function flushMemcards(ctx: WorkerContext) {
  if (!bootHas(ctx, BOOT.GAME) || !ctx.Module) return;
  for (const slot of MEMCARD_SLOTS) {
    try {
      const path = memcardPath(slot);
      let data: Uint8Array;
      try {
        data = ctx.Module.FS_readFile(path);
      } catch (e) {
        const found = findMemcardFiles(ctx);
        if (found.length > 0) {
          logInfo(
            `worker: memcard ${slot}: ${path} missing; found .mcd files: ${JSON.stringify(found)}`,
          );
        }
        continue;
      }
      const cur = hashMemcard(data) + ':' + data.byteLength;
      const prev = memcardLastHash[slot];
      memcardLastHash[slot] = cur;
      if (prev === null) continue;
      if (prev === cur) continue;
      logInfo(`worker: memcard ${slot} dirty detected (${prev} -> ${cur})`);
      const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      post({ type: MSG.MEMCARD_EXPORT_RESULT, slot, buf: copy }, [copy]);
    } catch (e: any) {
      logWarn(`worker: memcard ${slot} flush failed: ${e && e.message ? e.message : e}`);
    }
  }
}

export function startMemcardFlushPoll(ctx: WorkerContext) {
  if (memcardFlushTimer) clearInterval(memcardFlushTimer);
  for (const slot of MEMCARD_SLOTS) {
    const h = readMemcardHash(ctx, slot);
    if (h) memcardLastHash[slot] = h;
  }
  memcardFlushTimer = setInterval(() => flushMemcards(ctx), 5000);
}

export function handleMemcardExport(ctx: WorkerContext, msg: any) {
  const slot = msg.slot | 0;
  if (slot < 1 || slot > 2) return;
  try {
    const data = ctx.Module.FS_readFile(memcardPath(slot));
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    post({ type: MSG.MEMCARD_EXPORT_RESULT, slot, buf: copy }, [copy]);
  } catch (e: any) {
    logWarn(`worker: memcard export ${slot} failed: ${e && e.message ? e.message : e}`);
  }
}

export function handleMemcardImport(ctx: WorkerContext, msg: any) {
  const slot = msg.slot | 0;
  if (slot < 1 || slot > 2) return;
  try {
    const bytes = new Uint8Array(msg.buf);
    const path = memcardPath(slot);
    try {
      const dir = path.substring(0, path.lastIndexOf('/'));
      try {
        ctx.Module.FS_mkdir(dir);
      } catch (e: any) {
        logWarn(`worker: FS_mkdir(${dir}) failed (may already exist): ${e?.message ?? e}`);
      }
    } catch (e: any) {
      logWarn(`worker: memcard import dir prep failed for slot ${slot}: ${e?.message ?? e}`);
    }
    try {
      ctx.Module.FS_writeFile(path, bytes);
    } catch (e: any) {
      logWarn(`worker: FS_writeFile(${path}) failed: ${e?.message ?? e}`);
    }
    logInfo(`worker: imported memcard ${slot} (${bytes.byteLength} bytes)`);
    post({ type: MSG.MEMCARD_IMPORT_RESULT, slot, ok: true });
  } catch (e: any) {
    logWarn(`worker: memcard import ${slot} failed: ${e && e.message ? e.message : e}`);
    post({
      type: MSG.MEMCARD_IMPORT_RESULT,
      slot,
      ok: false,
      error: String(e && e.message ? e.message : e),
    });
  }
}
