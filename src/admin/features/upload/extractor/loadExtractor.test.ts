import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Emscripten module is mocked so the glue logic in `extractDiscId`
 * (malloc → copy onto heap → call `_extract_id` → read UTF-8 result → free) can
 * be exercised hermetically. Asserting a real PS1 serial requires a real CHD
 * fixture (none ships in-repo); that path is covered by the manual end-to-end
 * task (7.4). Here we assert the orchestration and the null-on-no-id contract.
 */
const { mockInstance } = vi.hoisted(() => {
  const heap = new Uint8Array(2048);
  return {
    mockInstance: {
      _malloc: vi.fn(() => 64),
      _free: vi.fn(),
      _extract_id: vi.fn(() => 7),
      HEAPU8: heap,
      UTF8ToString: vi.fn(() => 'SLUS-00797'),
    },
  };
});

vi.mock('./extract_id.js', () => ({
  default: vi.fn(async () => mockInstance),
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  );
  mockInstance._malloc.mockClear();
  mockInstance._free.mockClear();
  mockInstance._extract_id.mockClear();
  mockInstance.UTF8ToString.mockClear();
  mockInstance._extract_id.mockImplementation(() => 7);
  mockInstance.UTF8ToString.mockImplementation(() => 'SLUS-00797');
});

describe('extractDiscId glue', () => {
  it('copies the buffer onto the WASM heap and returns the extracted serial', async () => {
    const { extractDiscId } = await import('./loadExtractor');
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const discId = await extractDiscId(bytes.buffer);

    expect(discId).toBe('SLUS-00797');
    // malloc receives the exact byte length; the result pointer is freed.
    expect(mockInstance._malloc).toHaveBeenCalledWith(bytes.byteLength);
    expect(mockInstance._free).toHaveBeenCalledWith(64);
    // The extractor is invoked with the malloc pointer and the byte length.
    expect(mockInstance._extract_id).toHaveBeenCalledWith(64, bytes.byteLength);
    expect(mockInstance.UTF8ToString).toHaveBeenCalledWith(7);
  });

  it('returns null when no PS1 disc id is found (non-PS1 blob)', async () => {
    mockInstance._extract_id.mockImplementation(() => 0);
    const { extractDiscId } = await import('./loadExtractor');
    const discId = await extractDiscId(new Uint8Array([0, 0, 0]).buffer);

    expect(discId).toBeNull();
    // UTF8ToString must not be called when the extractor reports "not found".
    expect(mockInstance.UTF8ToString).not.toHaveBeenCalled();
    // Heap memory is still released.
    expect(mockInstance._free).toHaveBeenCalled();
  });

  it('propagates a WASM extraction failure as a rejection', async () => {
    mockInstance._extract_id.mockImplementation(() => {
      throw new Error('wasm trap');
    });
    const { extractDiscId } = await import('./loadExtractor');
    await expect(extractDiscId(new Uint8Array([1]).buffer)).rejects.toThrow('wasm trap');
  });
});
