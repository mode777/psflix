'use strict';

// SAB layout mirrors src/emulator/sab/layout.js. __SAB_..__ tokens are replaced
// with numeric literals by scripts/lib/build.js#materializeSabRuntimeLibrary.
// MUST use `var` (not module-scope vars) — emcc --js-library re-emits these
// as top-level functions, discarding lexical scope. See docs/build.md.

addToLibrary({
  sab_init: function(video, audio, input) {
    Module._videoSab = video;
    Module._audioSab = audio;
    Module._inputSab = input;
    Module._videoWriteIdx = 0;
    Module._audioWriteIdx = 0;
    Module._videoBytes = (Module._videoSab && Module._videoSab.byteLength) || 0;
    Module._audioBytes = (Module._audioSab && Module._audioSab.byteLength) || 0;
    Module._inputBytes = (Module._inputSab && Module._inputSab.byteLength) || 0;
    Module['_streamLocalOffset'] = 0;
    Module['_streamLocalData'] = null;
    Module['_streamLocalHits'] = 0;
    Module['_streamLocalMisses'] = 0;
    Module['_streamLocalRefills'] = 0;
    Module['_streamLocalRefillBytes'] = 0;
  },

  sab_publish_video: function(w, h, pitch, srcPtr) {
    if (w === 0 || h === 0 || pitch === 0) return;
    if (!Module._videoSab) return;
    var header = new Int32Array(Module._videoSab, 0, 4);
    var pixels = new Uint8Array(Module._videoSab, 16);
    var copyBytes = pitch * h;
    if (copyBytes > pixels.length) copyBytes = pixels.length;
    if (srcPtr) {
      pixels.set(HEAPU8.subarray(srcPtr, srcPtr + copyBytes));
    }
    Atomics.store(header, 1, w);
    Atomics.store(header, 2, h);
    Atomics.store(header, 3, pitch);
    var idx = (Module._videoWriteIdx | 0) + 1;
    if (idx > 0x7fffffff) idx = 0;
    Module._videoWriteIdx = idx;
    Atomics.store(header, 0, idx);
  },

  sab_publish_audio: function(frames, srcPtr) {
    if (frames === 0) return;
    if (!Module._audioSab) return;
    var header = new Int32Array(Module._audioSab, 0, 4);
    var capacity = header[2] | 0;
    if (capacity <= 0) return;
    var total = frames * 2;
    var samplesLen = (Module._audioBytes - __SAB_AUDIO_HEADER_BYTES__) / 4;
    if (total > samplesLen) {
      total = samplesLen;
      frames = (total / 2) | 0;
    }
    if (frames === 0) return;
    var writeIdx = header[0] | 0;
    // P4 hardening: detect ring overrun (observability only).
    var readIdx = Atomics.load(header, 1) | 0;
    var used = ((writeIdx - readIdx) % capacity + capacity) % capacity;
    var free = capacity - used;
    if (frames > free) {
      Module['_audioOverrunCount'] = (Module['_audioOverrunCount'] | 0) + 1;
    }
    var startSample = writeIdx * 2;
    if (!srcPtr) {
      var newWrite = (writeIdx + frames) % capacity;
      Module._audioWriteIdx = newWrite;
      Atomics.store(header, 0, newWrite);
      return;
    }
    if (startSample + total <= samplesLen) {
      var dst = new Float32Array(Module._audioSab, __SAB_AUDIO_HEADER_BYTES__ + startSample * 4, total);
      dst.set(new Float32Array(HEAPU8.buffer, srcPtr, total));
    } else {
      var firstPart = samplesLen - startSample;
      if (firstPart < 0) firstPart = 0;
      if (firstPart > total) firstPart = total;
      if (firstPart > 0) {
        new Float32Array(Module._audioSab, __SAB_AUDIO_HEADER_BYTES__ + startSample * 4, firstPart)
          .set(new Float32Array(HEAPU8.buffer, srcPtr, firstPart));
      }
      var secondPart = total - firstPart;
      if (secondPart > 0) {
        new Float32Array(Module._audioSab, __SAB_AUDIO_HEADER_BYTES__, secondPart)
          .set(new Float32Array(HEAPU8.buffer, srcPtr + firstPart * 4, secondPart));
      }
    }
    var newWrite = (writeIdx + frames) % capacity;
    Module._audioWriteIdx = newWrite;
    Atomics.store(header, 0, newWrite);
  },

  sab_load_input: function(dstPtr) {
    if (!Module._inputSab || !dstPtr) return;
    var size = Module._inputBytes;
    if (size <= 0) return;
    HEAPU8.set(new Uint8Array(Module._inputSab, 0, size), dstPtr);
  },

  // Drains edge-latch bits after host_input_poll_cb reads them.
  // Literal 64 and 20 mirror INPUT_PORT_BYTES and INPUT_OFF_EDGE.
  // See docs/input.md §"Edge latch".
  sab_drain_input_edge_bits: function(port, keepMask) {
    if (!Module._inputSab) return;
    var p = port | 0;
    if (p < 0 || p > 7) return; // MAX_PORTS = 8
    var slot = new Int32Array(Module._inputSab, p * 64 + 20, 1);
    Atomics.and(slot, 0, (~keepMask) >>> 0);
  },

  sab_set_audio_sample_rate: function(rate) {
    var audioSab = Module._audioSab;
    if (!audioSab) return;
    var header = new Int32Array(audioSab, 0, 4);
    Atomics.store(header, 3, rate | 0);
  },

  sab_set_av_fps: function(fps) {
    var audioSab = Module._audioSab;
    if (!audioSab) return;
    // Float64 at audioSAB offset __SAB_AUDIO_OFF_AV_FPS_BYTES__.
    var headerF64 = new Float64Array(audioSab, __SAB_AUDIO_OFF_AV_FPS_BYTES__, 1);
    headerF64[0] = fps;
  },

  streaming_io_read: function(bufPtr, offHi, offLo, len) {
    if ((len | 0) <= 0) return 0;
    var reqLen = len | 0;
    var off = (offHi >>> 0) * 4294967296 + (offLo >>> 0);
    var localData = Module['_streamLocalData'];
    var localOff = +Module['_streamLocalOffset'] || 0;
    if (localData) {
      var localEnd = localOff + localData.length;
      var reqEnd = off + reqLen;
      if (off >= localOff && reqEnd <= localEnd) {
        var localStart = (off - localOff) | 0;
        if (bufPtr && reqLen > 0) {
          HEAPU8.set(localData.subarray(localStart, localStart + reqLen), bufPtr);
        }
        Module['_streamLocalHits'] = (Module['_streamLocalHits'] | 0) + 1;
        return reqLen;
      }
    }
    Module['_streamLocalMisses'] = (Module['_streamLocalMisses'] | 0) + 1;

    var ctrl = Module['_streamingControlView'];
    if (!ctrl) return -1;

    var dat = Module['_streamingDataView'];
    if (!dat) return -1;
    // Cap each bridge fetch at 1 MB (one chunk).
    var blockLen = reqLen;
    if (blockLen < 1024 * 1024) blockLen = 1024 * 1024;
    if (blockLen > 1024 * 1024) blockLen = 1024 * 1024;
    if (blockLen > dat.length) blockLen = dat.length;

    ctrl[__SAB_CTRL_STATE__] = 1;
    ctrl[__SAB_CTRL_OP__] = 0;
    ctrl[__SAB_CTRL_OFF_HI__] = offHi | 0;
    ctrl[__SAB_CTRL_OFF_LO__] = offLo | 0;
    ctrl[__SAB_CTRL_LEN__] = blockLen | 0;
    ctrl[__SAB_CTRL_FETCH_STAGE__] = 0;
    var onIo = Module['_onStreamingIo'];
    if (typeof onIo !== 'function') return -1;
    onIo();
    Atomics.wait(ctrl, __SAB_CTRL_STATE__, 1);
    var n = ctrl[__SAB_CTRL_RESULT__] | 0;
    if (n > 0) {
      var copyN = Math.min(n, dat.length);
      if (copyN <= 0) return 0;

      var localCopy = new Uint8Array(copyN);
      localCopy.set(dat.subarray(0, copyN));
      Module['_streamLocalData'] = localCopy;
      Module['_streamLocalOffset'] = off;
      Module['_streamLocalRefills'] = (Module['_streamLocalRefills'] | 0) + 1;
      Module['_streamLocalRefillBytes'] = copyN;

      var outN = Math.min(reqLen, copyN);
      if (bufPtr && outN > 0) {
        HEAPU8.set(localCopy.subarray(0, outN), bufPtr);
      }
      return outN;
    }
    return n;
  },
});
