// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src).
// PS1 memory card (.mcr) byte-level constants. See AGENTS.md there for the
// full layout; psx-spx ("PSX Memory Card") is authoritative.

export const CARD_SIZE = 0x20_000; // 131072 bytes — 16 sectors × 8 KB
export const SECTOR_SIZE = 0x2000; // 8192 bytes
export const FRAME_SIZE = 0x80; // 128 bytes

export const DATA_SECTORS = 15; // usable data blocks (sector 0 is metadata)
export const DIRECTORY_FRAMES = 16; // 15 usable frames + 1 sentinel

export const HEADER_OFFSET = 0x0000;
export const DIRECTORY_OFFSET = 0x0080; // first directory frame
export const DATA_OFFSET = 0x2000; // first data block

// Directory frame field offsets (within the 128-byte frame)
export const DIR_STATE = 0x00; // u8
export const DIR_SIZE = 0x04; // u32 LE — save size in bytes
export const DIR_NEXT = 0x08; // u16 LE — next block in chain
export const DIR_CODE = 0x0a; // ASCII region/product code
export const DIR_CODE_LEN = 0x20; // up to 32 bytes (null-terminated)

// Allocation-state bytes
export const STATE_FIRST = 0x51; // first block of a save
export const STATE_MIDDLE = 0x52; // middle block of a multi-block save
export const STATE_LAST = 0x53; // last block of a multi-block save
export const STATE_FREE = 0xa0; // free block
export const STATE_CORRUPT = 0xff; // corrupted / sentinel
export const LAST_BLOCK = 0xffff; // next-pointer value meaning "end of chain"

// Save header frame field offsets (first 128-byte frame of a data block)
export const SAVE_MAGIC = 0x00; // ASCII "SC"
export const SAVE_ICONTYPE = 0x02; // low nibble = icon frame count (1-3)
export const SAVE_TITLEBLOCKS = 0x03;
export const SAVE_TITLE = 0x04; // Shift-JIS title
export const SAVE_TITLE_LEN = 0x40; // 64 bytes
export const SAVE_CLUT = 0x60; // 16 BGR555 colors
export const SAVE_CLUT_LEN = 0x20; // 32 bytes
export const SAVE_ICON_OFFSET = 0x80; // first icon bitmap frame
