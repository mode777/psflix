# Rendering

The PSX framebuffer is an RGB565 bitmap the core publishes into `videoSAB`
(`sab_publish_video` in `src/vendor/psxanywhere/emulator/worker/sab_runtime.js`).
Getting it onto the canvas is a single **WebGL2 context** owned by the worker,
shared by an unpack pass and (by default) a CRT post-process chain. There is no
second context and no canvas readback in the default path.

> **Migrated + adapted** from upstream `docs/render.md` to the vendored tree.
> Two changes from upstream: (1) the whole-file `?load=whole` path is gone, so
> the worker's WebGL2 path is _the_ render path; (2) the two GLSL shaders are
> **inlined** into `blit.ts` via Vite `?raw` imports (there is no runtime
> `fetchText('/src/emulator/worker/gl/shaders/...')` — the upstream 404 issue
> this tree fixes, see [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.1).

This covers `src/vendor/psxanywhere/emulator/worker/gl/blit.ts`,
`src/vendor/psxanywhere/emulator/worker/gl/crt-shader.ts`, and
`src/vendor/psxanywhere/emulator/worker/gl/shaders/{fullscreen.vert,unpack.frag}`.

## `blit.ts` — RGB565 → RGBA8 unpack at native PSX resolution

`async createBlit(gl)` → `{ draw, drawToCanvas, resize, dispose, get fboTexture }`.

- Inlines `fullscreen.vert` and `unpack.frag` at build time:
  ```ts
  import fullscreenVert from './shaders/fullscreen.vert?raw';
  import unpackFrag from './shaders/unpack.frag?raw';
  ```
- `draw(rgb565, w, h, pitch)` uploads the RGB565 data to an **`R16UI`**
  integer texture (`RED_INTEGER`/`UNSIGNED_SHORT`, NEAREST/CLAMP_TO_EDGE,
  `UNPACK_ALIGNMENT=2`), sets the viewport to `0,0,w,h`, and draws a
  fullscreen quad (6 verts, 2 attributes `a_pos`/`a_uv`) into `fbo`.
- The intermediate **FBO is sized to the PSX's _native_ frame resolution** —
  not a fixed 720×480. It is reallocated on size change (320×240, 640×480,
  512×480 FMV, …) so the unpack is a 1:1 copy at native res. Only the final
  composite pass upscales to 1440×960 — a single bilinear resize.
- `drawToCanvas(dstW, dstH)` uses an inline flip program (`FLIP_VS`/`FLIP_FS`,
  the `gl_VertexID` fullscreen-triangle trick) to sample the FBO texture with
  inverted Y and blit to the default framebuffer (the canvas) at `dstW×dstH`.
  Used only when the CRT effect is **off**.
- `get fboTexture()` returns the live FBO texture so the CRT module can sample
  it directly without a canvas readback. Eagerly creates a 1×1 FBO so
  `fboTexture` is non-null before the first real frame.

## `crt-shader.ts` — the newpixie CRT chain

`class CRTShader`, plus the named export `CRT_SHADER_DEFAULT_PARAMS` (alias of
`DEFAULT_PARAMS`). A WebGL2 port of libretro's 4-pass newpixie-crt shader.
Also exports `CRTShaderParams` and `CRTShaderOptions`.

### Construction

```ts
const crt = new CRTShader(gl, {
  letterbox: true,
  displayAspect: canvas.width / canvas.height, // 1440/960 = 3:2
  params, // defaults to DEFAULT_PARAMS
  frameTexture, // optional bezel texture (Image or texture)
  frameTextureURL, // optional bezel URL — off by default
});
crt.setSourceTexture(blit.fboTexture, srcW, srcH); // wires the unpack FBO as source
```

The worker passes `blit.fboTexture` directly (same-context, GPU compositor
path — no `gl.texImage2D(canvas)` readback). A 1×1 fallback white frame
texture is created so the bezel uniform is always bound.

### The four passes

`render()`:

1. **accumulate** → `_accumRT`. Samples the source texture plus the previous
   frame's `_blur1Read` feedback (`acc_modulate`).
2. **blur_horiz** → `_blur1Write` (ping-pong with `_blur1Read`). 9-tap
   Gaussian, direction-parameterized (`blur_x`/`blur_y`).
3. **blur_vert** → `_blur2RT`.
4. **final composite** → canvas (default framebuffer). Samples `uAccum`,
   `uBlur2`, `uFrame` (bezel). If `letterbox`, computes a centered viewport
   rect via `_computeLetterboxRect(canvasW, canvasH, aspect)` where
   `aspect = displayAspect || (sw/sh)`.

Then swaps `_blur1Read`/`_blur1Write` for the next frame's temporal feedback.

`setSource` / `setSourceTexture` / `updateSource` allocate/reallocate the
source-sized render targets. Reallocation resets `_frameCount=0`.

### Default params

`CRT_SHADER_DEFAULT_PARAMS` (frozen):

| Key                 | Value |
| ------------------- | ----- |
| `acc_modulate`      | 0.5   |
| `blur_x`            | 0.75  |
| `blur_y`            | 1.0   |
| `curvature`         | 0.0   |
| `vignette`          | 0.35  |
| `ghosting`          | 0.3   |
| `use_frame`         | 0.0   |
| `wiggle_toggle`     | 0.0   |
| `scanroll`          | 1.0   |
| `scanline_strength` | 1.0   |
| `filmic_toe`        | 0.013 |
| `filmic_shoulder`   | 5.6   |
| `gamma`             | 1.18  |

Notable GLSL logic: `tsample` applies the newpixie overscan crop only when
`curvature > 0`; `filmic` is a Hable-style tonemap; `curve` is identity when
`curvature <= 0`; `vignette` is defensively clamped to avoid NaN on mismatched
aspect ratios; gamma is applied last as `pow(max(col,0), 1/gamma)`.

### Toggles

The facade posts `MSG.CRT_TOGGLE` (`on:boolean`) and `MSG.CRT_PARAM`
(`{key, value}`) to the worker, which mutates `crtOn` and `crt.params[key]`
directly. PSflix's `EmulatorClient.setCrt(on)` / `setCrtParam(key, value)`
map to these. A "Defaults" reset uses `CRT_SHADER_DEFAULT_PARAMS`.

## The bezel

The bezel (`use_frame` parameter) is wired but **off by default**
(`use_frame: 0.0`), and **no `crtframe.png` asset is bundled**. Enabling it
means sourcing a copy of the newpixie `crtframe.png` into `public/`, passing
`frameTextureURL: '/crtframe.png'` to `new CRTShader(...)`, and/or exposing it
through PSflix's future `OptionsDialog` CRT controls.

## The shaders

### `fullscreen.vert`

Vertex shader for the blit's unpack pass. GLSL ES 3.00. Takes `a_pos` (vec2
clip-space) and `a_uv` (vec2), forwards `a_uv` as `v_uv`. 13 lines.

### `unpack.frag`

Fragment shader that unpacks an `R16UI` (RGB565) texture into RGBA8, 1:1 at
native PSX resolution. Uses a `highp usampler2D` (required for `R16UI`
textures), samples via `texelFetch` at `clamp(ivec2(uv*u_frame), 0, u_frame-1)`,
calls `unpackRGB565(uint p)` → normalized `vec3` (`r/31, g/63, b/31`), outputs
`vec4(rgb, 1.0)`. 34 lines. `u_size` and `u_frame` are both set to the native
frame size by `blit.ts`, so this is a 1:1 copy (no resize).

## Cross-references

- [`architecture.md`](./architecture.md) — `videoSAB` layout, the `MSG.CRT_*`
  messages.
- [`worker.md`](./worker.md) — `coreWorker.ts#paintFromSab` and the canvas
  sizing (1440×960).
- [`../../specs/emulator-integration/spec.md`](../../specs/emulator-integration/spec.md) §6.1 — why the shaders are inlined (`?raw`) in
  the vendored `blit.ts`.
