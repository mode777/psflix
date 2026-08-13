/**
 * Type declaration for the vendored Emscripten module (`extract_id.js`). The
 * module is a minified Emscripten factory; `allowJs` pulls it into the program
 * but `checkJs` is off, so this sibling declaration carries the types. Runtime
 * is the real `.js`.
 *
 * The factory mirrors `psx-uploader/src/extractor.js`: it accepts an
 * `instantiateWasm` override so the worker can feed the `.wasm` bytes directly
 * (avoiding `import.meta.url`/`locateFile` resolution in the worker context).
 */
export interface ExtractIdInstance {
  /** Allocate `size` bytes on the WASM heap; returns a pointer. */
  _malloc(size: number): number;
  /** Release a pointer previously returned by `_malloc`. */
  _free(ptr: number): void;
  /** Extract the PS1 disc id from `length` bytes at `ptr`; 0 means "not found". */
  _extract_id(ptr: number, length: number): number;
  /** Uint8Array view over the WASM heap. */
  HEAPU8: Uint8Array;
  /** Read a NUL-terminated UTF-8 string from a heap pointer. */
  UTF8ToString(ptr: number): string;
}

export type ExtractIdFactoryOptions = {
  instantiateWasm?(
    imports: WebAssembly.Imports,
    successCallback: (instance: WebAssembly.Instance) => void,
  ): unknown;
};

export type ExtractIdFactory = (options?: ExtractIdFactoryOptions) => Promise<ExtractIdInstance>;

declare const ExtractIdModule: ExtractIdFactory;

export default ExtractIdModule;
