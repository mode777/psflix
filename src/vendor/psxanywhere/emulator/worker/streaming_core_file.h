#ifndef PSANYWHERE_STREAMING_CORE_FILE_H
#define PSANYWHERE_STREAMING_CORE_FILE_H

#include <stdint.h>

#include <libchdr/coretypes.h>

#ifdef __cplusplus
extern "C" {
#endif

core_file *streaming_core_file_get(void);

void streaming_core_file_init(uint32_t total_length_lo, uint32_t total_length_hi);

#ifdef __cplusplus
}
#endif

#endif
