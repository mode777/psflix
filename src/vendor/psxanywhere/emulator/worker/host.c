#include "host.h"

#include <libretro.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "psxcommon.h"

extern char CdromId[10];

extern void sab_publish_video(unsigned w, unsigned h, size_t pitch, const void *src);
extern void sab_publish_audio(size_t frames, const void *src);
extern void sab_load_input(void *dst);
extern void sab_drain_input_edge_bits(int32_t port, uint32_t keepMask);
extern void sab_set_audio_sample_rate(int32_t rate);
extern void sab_set_av_fps(double fps);

#define HOST_AUDIO_SCRATCH_FRAMES 2048

/* MAX_PORTS matches pcsx_rearmed/frontend/libretro.c's PORTS_NUMBER (8) for
 * the multitap-capable build, and MUST match src/emulator/sab/layout.js's MAX_PORTS.
 * The input SAB is MAX_PORTS * 64 bytes; host_input_poll_cb reads the whole
 * SAB into a single scratch buffer (Phase 3 §5.3). See
 * specs/archive/controller-types/phase3.md. */
#define MAX_PORTS 8

/* Must match src/emulator/sab/layout.js INPUT_BIT_* (Phase 2 mouse/lightgun). The
 * codegen in scripts/lib/build.js does not substitute these into C, so the
 * sync is manual — guarded by scripts/test/controller-constants.test.js. */
#define INPUT_BIT_MOUSE_LEFT         16
#define INPUT_BIT_MOUSE_RIGHT        17
#define INPUT_BIT_LIGHTGUN_TRIGGER   18
#define INPUT_BIT_LIGHTGUN_AUX       19
#define INPUT_BIT_LIGHTGUN_OFFSCREEN 20

static struct retro_disk_control_ext_callback g_disk_ctrl;
static bool g_has_disk_ctrl = false;

static struct retro_system_av_info g_av_info;
static int g_pixel_format_ok;
static unsigned g_video_w;
static unsigned g_video_h;
static size_t   g_video_pitch;
/* Per-port input globals (Phase 3 §5.2). Indexing by `port` (0..MAX_PORTS-1)
 * replaces the Phase 1–2 single set of globals; the unconfigured ports stay
 * zero and update_input() skips PSE_PAD_TYPE_NONE ports. */
static uint32_t g_input_buttons[MAX_PORTS];
static int16_t  g_input_lx[MAX_PORTS], g_input_ly[MAX_PORTS];
static int16_t  g_input_rx[MAX_PORTS], g_input_ry[MAX_PORTS];
static int16_t  g_input_mouse_dx[MAX_PORTS], g_input_mouse_dy[MAX_PORTS];
static uint16_t g_input_lgun_x[MAX_PORTS], g_input_lgun_y[MAX_PORTS];

static void host_log_cb(enum retro_log_level level, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    switch (level) {
        case RETRO_LOG_ERROR: fprintf(stderr, "[core-err] "); break;
        case RETRO_LOG_WARN:  fprintf(stderr, "[core-warn] "); break;
        case RETRO_LOG_INFO:  fprintf(stdout, "[core] "); break;
        case RETRO_LOG_DEBUG: /* swallow */ goto out;
        default:              fprintf(stdout, "[core] "); break;
    }
    vfprintf(stdout, fmt, ap);
out:
    va_end(ap);
}

static bool host_env_cb(unsigned cmd, void *data) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_SET_VARIABLES: {
        const struct retro_variable *vars =
            (const struct retro_variable *)data;
        (void)vars;
        return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *var = (struct retro_variable *)data;
        if (var == NULL || var->key == NULL) return false;
        const char *key = var->key;
        if (strcmp(key, "pcsx_rearmed_bios") == 0) {
            var->value = "scph1001.bin";
            return true;
        }
        if (strcmp(key, "pcsx_rearmed_bios_jp") == 0 ||
            strcmp(key, "pcsx_rearmed_bios_eu") == 0) {
            var->value = "scph1001.bin";
            return true;
        }
        if (strcmp(key, "pcsx_rearmed_rgb32_output") == 0) {
            var->value = "disabled";
            return true;
        }
        if (strcmp(key, "pcsx_rearmed_show_bios_bootlogo") == 0) {
            var->value = "enabled";
            return true;
        }
        if (strcmp(key, "pcsx_rearmed_memcard1") == 0 ||
            strcmp(key, "pcsx_rearmed_memcard2") == 0) {
            var->value = "shared";
            return true;
        }
        var->value = NULL;
        return false;
    }
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
        const enum retro_pixel_format *fmt = (const enum retro_pixel_format *)data;
        if (fmt == NULL) return false;
        if (*fmt != RETRO_PIXEL_FORMAT_RGB565) {
            fprintf(stderr, "host_env_cb: core asked for pixel format %d, expected RGB565\n", (int)*fmt);
            return false;
        }
        g_pixel_format_ok = 1;
        return true;
    }
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: {
        struct retro_log_callback *cb = (struct retro_log_callback *)data;
        if (cb == NULL) return false;
        cb->log = host_log_cb;
        return true;
    }
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: {
        const char **dir = (const char **)data;
        if (dir == NULL) return false;
        *dir = "/";
        return true;
    }
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: {
        const char **dir = (const char **)data;
        if (dir == NULL) return false;
        *dir = "/saves";
        return true;
    }
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: {
        const struct retro_input_descriptor *desc =
            (const struct retro_input_descriptor *)data;
        (void)desc;
        return true;
    }
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO: {
        return true;
    }
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: {
        bool *supported = (bool *)data;
        (void)supported;
        return false;
    }
    case RETRO_ENVIRONMENT_SET_AUDIO_CALLBACK: {
        return false;
    }
    case RETRO_ENVIRONMENT_GET_RUMBLE_INTERFACE: {
        return false;
    }
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY: {
        return true;
    }
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK: {
        return true;
    }
    case RETRO_ENVIRONMENT_SET_DISK_CONTROL_EXT_INTERFACE: {
        const struct retro_disk_control_ext_callback *ext =
            (const struct retro_disk_control_ext_callback *)data;
        if (ext == NULL) return false;
        memcpy(&g_disk_ctrl, ext, sizeof(g_disk_ctrl));
        g_has_disk_ctrl = true;
        return true;
    }
    case RETRO_ENVIRONMENT_SET_DISK_CONTROL_INTERFACE: {
        const struct retro_disk_control_callback *ctl =
            (const struct retro_disk_control_callback *)data;
        if (ctl == NULL) return false;
        g_disk_ctrl.set_eject_state     = ctl->set_eject_state;
        g_disk_ctrl.get_eject_state     = ctl->get_eject_state;
        g_disk_ctrl.get_image_index     = ctl->get_image_index;
        g_disk_ctrl.set_image_index     = ctl->set_image_index;
        g_disk_ctrl.get_num_images      = ctl->get_num_images;
        g_disk_ctrl.replace_image_index = ctl->replace_image_index;
        g_disk_ctrl.add_image_index     = ctl->add_image_index;
        g_has_disk_ctrl = true;
        return true;
    }
    default:
        return false;
    }
}

static void host_video_cb(const void *data, unsigned w, unsigned h, size_t pitch) {
    if (data == NULL) {
        sab_publish_video(0, 0, 0, NULL);
        return;
    }
    g_video_w = w;
    g_video_h = h;
    g_video_pitch = pitch;
    sab_publish_video(w, h, pitch, data);
}

static size_t host_audio_batch_cb(const int16_t *data, size_t frames) {
    if (data == NULL || frames == 0) return frames;
    if (frames > HOST_AUDIO_SCRATCH_FRAMES) {
        frames = HOST_AUDIO_SCRATCH_FRAMES;
    }
    static float scratch[HOST_AUDIO_SCRATCH_FRAMES * 2];
    const int16_t *src = data;
    float *dst = scratch;
    for (size_t i = 0; i < frames * 2; ++i) {
        dst[i] = (float)src[i] / 32768.0f;
    }
    sab_publish_audio(frames, scratch);
    return frames;
}

static void host_input_poll_cb(void) {
    /* Single full-SAB read, then per-port unpack (Phase 3 §5.3). The scratch
     * MUST be sized to the full SAB (MAX_PORTS * 64), not 64 — an earlier draft
     * used a 64-byte scratch inside a per-port loop and re-read the same 64
     * bytes 8 times; with the real sab_load_input copying Module._inputBytes
     * (512) a 64-byte scratch would overflow. */
    uint8_t scratch[MAX_PORTS * 64];
    sab_load_input(scratch);
    for (unsigned port = 0; port < MAX_PORTS; port++) {
        const uint8_t *p = scratch + port * 64;
        g_input_buttons[port] = (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
                                ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
        g_input_lx[port] = (int16_t)((uint16_t)p[4] | ((uint16_t)p[5] << 8));
        g_input_ly[port] = (int16_t)((uint16_t)p[6] | ((uint16_t)p[7] << 8));
        g_input_rx[port] = (int16_t)((uint16_t)p[8] | ((uint16_t)p[9] << 8));
        g_input_ry[port] = (int16_t)((uint16_t)p[10] | ((uint16_t)p[11] << 8));
        /* Phase 2: mouse deltas (bytes 12–15) + lightgun coords (16–19),
         * read every frame regardless of in_type — cheap, and consumed only
         * when the core queries the matching RETRO_DEVICE_*. */
        g_input_mouse_dx[port] = (int16_t)((uint16_t)p[12] | ((uint16_t)p[13] << 8));
        g_input_mouse_dy[port] = (int16_t)((uint16_t)p[14] | ((uint16_t)p[15] << 8));
        g_input_lgun_x[port]   = (uint16_t)((uint16_t)p[16] | ((uint16_t)p[17] << 8));
        g_input_lgun_y[port]   = (uint16_t)((uint16_t)p[18] | ((uint16_t)p[19] << 8));
        /* Edge latch (INPUT_OFF_EDGE, bytes 20–23): rising edges of the
         * button mask the main thread captured since the last poll —
         * including edges that arrived during a streaming stall, when this
         * callback did not run at all. Fold them into g_input_buttons for
         * this frame only (the next frame's assignment above overwrites, so
         * the edge is naturally one-shot), then drain the observed bits
         * loss-free: sab_drain_input_edge_bits clears ONLY the bits we read
         * here, so an edge that arrived between sab_load_input's bulk copy
         * and this drain survives and is surfaced on the next poll. A quick
         * tap fully contained in a stall thus registers as a one-frame
         * press instead of being silently lost. See docs/input.md. */
        uint32_t edge = (uint32_t)p[20] | ((uint32_t)p[21] << 8) |
                        ((uint32_t)p[22] << 16) | ((uint32_t)p[23] << 24);
        g_input_buttons[port] |= edge;
        sab_drain_input_edge_bits((int32_t)port, edge);
    }
}

static int16_t host_input_state_cb(unsigned port, unsigned device, unsigned index, unsigned id) {
    if (port >= MAX_PORTS) return 0;
    if (device == RETRO_DEVICE_JOYPAD) {
        if (id > 31) return 0;
        return (int16_t)((g_input_buttons[port] >> id) & 1u);
    }
    if (device == RETRO_DEVICE_ANALOG) {
        switch (index) {
        case 0:
            switch (id) {
            case RETRO_DEVICE_ID_ANALOG_X: return g_input_lx[port];
            case RETRO_DEVICE_ID_ANALOG_Y: return g_input_ly[port];
            default: return 0;
            }
        case 1:
            switch (id) {
            case RETRO_DEVICE_ID_ANALOG_X: return g_input_rx[port];
            case RETRO_DEVICE_ID_ANALOG_Y: return g_input_ry[port];
            default: return 0;
            }
        default: return 0;
        }
    }
    if (device == RETRO_DEVICE_MOUSE) {
        switch (id) {
        case RETRO_DEVICE_ID_MOUSE_X: {
            int16_t dx = g_input_mouse_dx[port];
            g_input_mouse_dx[port] = 0; /* consume-once; next poll overwrites */
            return dx;
        }
        case RETRO_DEVICE_ID_MOUSE_Y: {
            int16_t dy = g_input_mouse_dy[port];
            g_input_mouse_dy[port] = 0;
            return dy;
        }
        case RETRO_DEVICE_ID_MOUSE_LEFT:
            return (int16_t)((g_input_buttons[port] >> INPUT_BIT_MOUSE_LEFT) & 1u);
        case RETRO_DEVICE_ID_MOUSE_RIGHT:
            return (int16_t)((g_input_buttons[port] >> INPUT_BIT_MOUSE_RIGHT) & 1u);
        default: return 0;
        }
    }
    if (device == RETRO_DEVICE_LIGHTGUN) {
        switch (id) {
        case RETRO_DEVICE_ID_LIGHTGUN_SCREEN_X: return (int16_t)g_input_lgun_x[port];
        case RETRO_DEVICE_ID_LIGHTGUN_SCREEN_Y: return (int16_t)g_input_lgun_y[port];
        case RETRO_DEVICE_ID_LIGHTGUN_TRIGGER:
            return (int16_t)((g_input_buttons[port] >> INPUT_BIT_LIGHTGUN_TRIGGER) & 1u);
        case RETRO_DEVICE_ID_LIGHTGUN_AUX_A:
            return (int16_t)((g_input_buttons[port] >> INPUT_BIT_LIGHTGUN_AUX) & 1u);
        case RETRO_DEVICE_ID_LIGHTGUN_IS_OFFSCREEN:
            return (int16_t)((g_input_buttons[port] >> INPUT_BIT_LIGHTGUN_OFFSCREEN) & 1u);
        default: return 0;
        }
    }
    return 0;
}

static void host_no_op_audio_sample(int16_t left, int16_t right) {
    (void)left;
    (void)right;
}

int host_init(void) {
    if (retro_api_version() != RETRO_API_VERSION) {
        fprintf(stderr, "host_init: retro_api_version mismatch\n");
        return -1;
    }
    retro_set_environment(host_env_cb);
    retro_set_video_refresh(host_video_cb);
    retro_set_audio_sample(host_no_op_audio_sample);
    retro_set_audio_sample_batch(host_audio_batch_cb);
    retro_set_input_poll(host_input_poll_cb);
    retro_set_input_state(host_input_state_cb);
    retro_init();
    retro_get_system_av_info(&g_av_info);
    sab_set_audio_sample_rate((int32_t)g_av_info.timing.sample_rate);
    sab_set_av_fps(g_av_info.timing.fps);
    fprintf(stdout, "av_info: %ux%u (max %ux%u) sample_rate=%.0f fps=%.3f\n",
            g_av_info.geometry.base_width,
            g_av_info.geometry.base_height,
            g_av_info.geometry.max_width,
            g_av_info.geometry.max_height,
            g_av_info.timing.sample_rate,
            g_av_info.timing.fps);
    return 0;
}

int host_load(const char *rom_path) {
    if (rom_path == NULL) {
        return -1;
    }
    Config.CHD_Precache = 0;
    /* Ensure /saves exists in MEMFS before retro_load_game -> load_memcards()
     * runs CreateMcd (fopen "wb"). The JS-side Module.FS.mkdir is unusable under
     * Closure advanced mode (renames the FS object's method names), so the
     * directory must be created from C. errno == EEXIST is harmless. */
    mkdir("/saves", 0777);
    struct retro_game_info info;
    memset(&info, 0, sizeof(info));
    info.path = rom_path;
    info.data = NULL;
    info.size = 0;
    if (!retro_load_game(&info)) {
        fprintf(stderr, "host_load: retro_load_game failed for %s\n", rom_path);
        return -1;
    }
    if (!g_pixel_format_ok) {
        fprintf(stderr, "host_load: core never set pixel format; refusing to run\n");
        return -2;
    }
    retro_get_system_av_info(&g_av_info);
    fprintf(stdout, "host_load: loaded %s; geometry now %ux%u\n",
            rom_path,
            g_av_info.geometry.base_width,
            g_av_info.geometry.base_height);
    return 0;
}

void host_run_frame(void) {
    retro_run();
}

void host_get_system_info(char *out, int out_len) {
    struct retro_system_info si;
    retro_get_system_info(&si);
    if (out == 0 || out_len <= 0) {
        return;
    }
    snprintf(out, (size_t)out_len, "%s|%s|%s",
             si.library_name  ? si.library_name  : "",
             si.library_version ? si.library_version : "",
             si.valid_extensions ? si.valid_extensions : "");
}

size_t host_serialize_size(void) {
    return retro_serialize_size();
}

bool host_save_state(void *out, size_t size) {
    if (out == NULL || size == 0) return false;
    return retro_serialize(out, size);
}

bool host_load_state(const void *data, size_t size) {
    if (data == NULL || size == 0) return false;
    return retro_unserialize(data, size);
}

void host_set_controller_port_device(unsigned port, unsigned device) {
    retro_set_controller_port_device(port, device);
}

bool host_swap_disc(unsigned index) {
    if (!g_has_disk_ctrl) return false;
    if (!g_disk_ctrl.set_eject_state || !g_disk_ctrl.set_image_index)
        return false;
    g_disk_ctrl.set_eject_state(true);
    if (!g_disk_ctrl.set_image_index(index)) {
        g_disk_ctrl.set_eject_state(false);
        return false;
    }
    g_disk_ctrl.set_eject_state(false);
    return true;
}

bool host_register_disc(unsigned index, const char *path) {
    if (!g_has_disk_ctrl) return false;
    while ((unsigned)g_disk_ctrl.get_num_images() <= index) {
        if (!g_disk_ctrl.add_image_index()) return false;
    }
    struct retro_game_info info;
    memset(&info, 0, sizeof(info));
    info.path = path;
    return g_disk_ctrl.replace_image_index(index, &info);
}

const char* host_get_cdrom_id(void) {
    return CdromId;
}


