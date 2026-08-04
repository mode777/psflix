#version 300 es
// fullscreen.vert - shared fullscreen-quad vertex shader for the
// worker's WebGL2 blit. Passes a_pos through to clip space and
// forwards a_uv to the fragment shader as v_uv.

in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
