#version 300 es
// unpack.frag - RGB565 unpack into RGBA8, 1:1 at the PSX's native
// frame resolution (no stretch/resize here).
//
// The PSX framebuffer is RGB565 (5 red, 6 green, 5 blue bits per
// pixel), uploaded to a single-channel R16UI texture. This fragment
// shader unpacks it into RGBA8, sampling the source with
// nearest-neighbour (R16UI is NEAREST-only on WebGL2). u_size and
// u_frame are equal (the target FBO is sized to match the source
// frame), so this is a straight 1:1 copy; any resize/stretch to
// display resolution happens later, downstream of this pass.

precision highp float;

uniform highp usampler2D u_tex;
uniform vec2 u_size;
uniform vec2 u_frame;

in vec2 v_uv;
out vec4 o_color;

vec3 unpackRGB565(uint p) {
  uint r5 = (p >> 11) & 0x1Fu;
  uint g6 = (p >>  5) & 0x3Fu;
  uint b5 = (p      ) & 0x1Fu;
  return vec3(float(r5) / 31.0, float(g6) / 63.0, float(b5) / 31.0);
}

void main() {
  vec2 uv = v_uv;

  ivec2 coord = clamp(ivec2(uv * u_frame), ivec2(0), ivec2(u_frame) - ivec2(1));
  o_color = vec4(unpackRGB565(texelFetch(u_tex, coord, 0).r), 1.0);
}
