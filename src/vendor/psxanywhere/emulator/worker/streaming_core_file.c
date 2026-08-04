#include "streaming_core_file.h"

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <libchdr/coretypes.h>

uint64_t g_length  = 0;
uint64_t g_offset  = 0;

extern int32_t streaming_io_read(int32_t buf_ptr, int32_t off_hi, int32_t off_lo, int32_t len);

static uint64_t cf_fsize(core_file *f) {
    (void)f;
    return g_length;
}

static int cf_seek(core_file *f, int64_t offset, int whence) {
    (void)f;
    uint64_t base;
    switch (whence) {
        case 0: base = 0; break;
        case 1: base = g_offset; break;
        case 2: base = g_length; break;
        default: return -1;
    }
    int64_t next = (int64_t)base + offset;
    if (next < 0) next = 0;
    if ((uint64_t)next > g_length) next = (int64_t)g_length;
    g_offset = (uint64_t)next;
    return 0;
}

static size_t cf_read(void *buf, size_t size, size_t nmemb, core_file *f) {
    (void)f;
    size_t len = size * nmemb;
    if (len == 0) {
        return 0;
    }
    uint64_t off = g_offset;
    if (off >= g_length) {
        return 0;
    }
    if (off + len > g_length) {
        len = (size_t)(g_length - off);
    }

    int32_t n = streaming_io_read((int32_t)(intptr_t)buf,
                                (int32_t)(off >> 32),
                                (int32_t)(off & 0xFFFFFFFFu),
                                (int32_t)len);

    if (n > 0) {
        g_offset += (uint64_t)n;
        return (size_t)n / size;
    }
    return 0;
}

static int cf_close(core_file *f) {
    (void)f;
    return 0;
}

static core_file s_cf = {
    .argp   = NULL,
    .fsize  = cf_fsize,
    .fread  = cf_read,
    .fclose = cf_close,
    .fseek  = cf_seek,
};

core_file *streaming_core_file_get(void) {
    return &s_cf;
}

void streaming_core_file_init(uint32_t total_length_lo, uint32_t total_length_hi) {
    g_length = ((uint64_t)total_length_hi << 32) | (uint64_t)total_length_lo;
    g_offset = 0;
}
