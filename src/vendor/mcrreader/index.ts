// Vendored from @mcrreader/lib (mcrreader repo, packages/mcrreader/src). The
// public surface the memory-card manager consumes. Treat this tree as a black
// box — it is a clean-cut copy of the mcrreader parser library.

export * from './constants';
export * from './types';
export { parseMemoryCard, parseDirectoryFrame } from './parse';
export { isEqual } from './compare';
export {
  decodeIconFrame,
  iconFrameDelayMs,
  ICON_PAL_FPS,
  ICON_WIDTH,
  ICON_HEIGHT,
  ICON_RGBA_BYTES,
} from './icon';
