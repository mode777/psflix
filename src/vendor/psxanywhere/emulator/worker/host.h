#ifndef PSANYWHERE_HOST_H
#define PSANYWHERE_HOST_H

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

int  host_init(void);
int  host_load(const char *rom_path);
void host_run_frame(void);
void host_get_system_info(char *out, int out_len);
size_t host_serialize_size(void);
bool    host_save_state(void *out, size_t size);
bool    host_load_state(const void *data, size_t size);
void host_set_controller_port_device(unsigned port, unsigned device);
bool host_swap_disc(unsigned index);
bool host_register_disc(unsigned index, const char *path);
const char* host_get_cdrom_id(void);

#ifdef __cplusplus
}
#endif

#endif
