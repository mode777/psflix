// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src).

export type BlockKind = 'first' | 'middle' | 'last' | 'free' | 'corrupt';

export interface DirectoryFrame {
  /** Directory-frame index, 0–15. */
  index: number;
  /** Byte offset of this frame within the card. */
  offset: number;
  /** Raw allocation-state byte. */
  stateByte: number;
  /** Decoded allocation state. */
  kind: BlockKind;
  /** Save size in bytes (only meaningful for the first block of a save). */
  sizeBytes: number;
  /** Next block index in the chain, or `null` if this is the last block. */
  nextBlock: number | null;
  /** ASCII region/product code, e.g. `BASLUS-00922-DINO0`. */
  productCode: string;
}

export interface Region {
  /** Two-letter region code, e.g. `BA`, `BE`, `BI`. */
  code: string;
  /** Human-readable region name. */
  name: string;
}

export interface SaveIcon {
  /** Number of icon frames (1–3). */
  frames: number;
  /** 32-byte CLUT: 16 little-endian BGR555 colors. */
  clut: Uint8Array;
  /** One 128-byte 4-bpp bitmap per frame (16×16, low nibble = left pixel). */
  pixels: Uint8Array[];
}

export interface Save {
  /** Directory-frame index of the first block of this save. */
  index: number;
  /** All directory-frame indices this save occupies (chain order). */
  blocks: number[];
  /** ASCII region/product code. */
  productCode: string;
  /** Decoded region. */
  region: Region;
  /** Save size in bytes (from the directory frame). */
  sizeBytes: number;
  /** Decoded Shift-JIS save title. */
  title: string;
  /** Number of icon frames (1–3). */
  iconFrames: number;
  /** Icon data (CLUT + per-frame bitmaps). */
  icon: SaveIcon;
  /** Raw save bytes (length = sizeBytes), spanning the save's blocks. */
  data: Uint8Array;
  /** CRC32 hex digest of `data`, computed during parsing. */
  hash: string;
}

export interface MemoryCard {
  /** The full card image. */
  bytes: Uint8Array;
  /** Header magic — `"MC"` for a valid card. */
  magic: string;
  /** All 16 directory frames (including the sentinel). */
  frames: DirectoryFrame[];
  /** Saves found on the card (first-block entries only). */
  saves: Save[];
  /** Number of free (unused) data blocks. */
  freeBlocks: number;
  /** Total usable data blocks (15). */
  totalBlocks: number;
}
