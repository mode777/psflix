import ExtractIdModule, { type ExtractIdInstance } from './extract_id.js';

/**
 * Worker-side loader for the vendored WASM disc-ID extractor.
 *
 * The Emscripten module is instantiated **once** with an `instantiateWasm`
 * override that reads the `.wasm` bytes directly from the origin-root static
 * asset (`/extract_id.wasm`, same convention as `/pcsx_rearmed.wasm`). This
 * mirrors the CLI's `extractor.js` and avoids `import.meta.url`/`locateFile`
 * path resolution inside the worker context (the minified module reaches for
 * `import.meta.url` only on the fallback path this override short-circuits).
 *
 * The extractor is pure computation (no DOM/fetch beyond the one-time module
 * fetch) and therefore worker-safe; the whole CHD buffer is copied onto the
 * WASM heap, which is exactly why this runs off the main thread.
 */
let modulePromise: Promise<ExtractIdInstance> | null = null;

async function loadModule(): Promise<ExtractIdInstance> {
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const wasmResponse = await fetch(new URL('extract_id.wasm', self.location.origin).href);
    if (!wasmResponse.ok) {
      throw new Error(`Failed to load extract_id.wasm (HTTP ${wasmResponse.status})`);
    }
    const wasmBinary = await wasmResponse.arrayBuffer();

    return ExtractIdModule({
      instantiateWasm(imports, successCallback) {
        WebAssembly.instantiate(wasmBinary, imports).then(({ instance }) => {
          successCallback(instance);
        });
        return {};
      },
    });
  })();

  return modulePromise;
}

/**
 * Extract the PS1 disc id from a whole CHD `ArrayBuffer`. Returns the disc
 * serial (e.g. `SLUS-00797`) or `null` when the buffer does not contain a
 * recognizable PS1 disc id. Mirrors `psx-uploader/id-extractor/glue.js`.
 */
export async function extractDiscId(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const mod = await loadModule();
  const data = new Uint8Array(arrayBuffer);
  const ptr = mod._malloc(data.length);
  mod.HEAPU8.set(data, ptr);
  try {
    const resultPtr = mod._extract_id(ptr, data.length);
    if (resultPtr === 0) return null;
    return mod.UTF8ToString(resultPtr);
  } finally {
    mod._free(ptr);
  }
}
