'use strict';

// RGB565 → RGBA8 blit into an FBO. See docs/render.md.

import { compileShader, linkProgram } from './gl-util';
import fullscreenVert from './shaders/fullscreen.vert?raw';
import unpackFrag from './shaders/unpack.frag?raw';

function makeFullscreenQuad(
  gl: WebGL2RenderingContext,
  aPosLoc: number,
  aUvLoc: number,
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const verts = new Float32Array([
    -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUvLoc);
  gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return vao;
}

export async function createBlit(gl: WebGL2RenderingContext) {
  const vsSrc = fullscreenVert;
  const unpackSrc = unpackFrag;

  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, 'fullscreen.vert');
  const unpackFs = compileShader(gl, gl.FRAGMENT_SHADER, unpackSrc, 'unpack.frag');
  const prog = linkProgram(gl, vs, unpackFs, 'unpack');
  gl.deleteShader(vs);
  gl.deleteShader(unpackFs);

  const aPos = gl.getAttribLocation(prog, 'a_pos');
  const aUv = gl.getAttribLocation(prog, 'a_uv');
  const vao = makeFullscreenQuad(gl, aPos, aUv);

  const uTex = gl.getUniformLocation(prog, 'u_tex');
  const uSize = gl.getUniformLocation(prog, 'u_size');
  const uFrame = gl.getUniformLocation(prog, 'u_frame');

  let r16uiTex: WebGLTexture | null = null;
  let w = 0,
    h = 0;
  let disposed = false;

  let fbo: WebGLFramebuffer | null = null;
  let fboTex: WebGLTexture | null = null;
  let fboW = 0,
    fboH = 0;

  function ensureFBO(width: number, height: number) {
    if (fbo && width === fboW && height === fboH) return;
    if (!fboTex) {
      fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (!fbo) {
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    fboW = width;
    fboH = height;
  }

  function ensureR16uiTex(width: number, height: number) {
    if (!r16uiTex) {
      r16uiTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, r16uiTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, r16uiTex);
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R16UI,
      width,
      height,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      null,
    );
  }

  function resize(width: number, height: number) {
    if (disposed) throw new Error('blit: resize() after dispose()');
    if (width === 0 || height === 0) return;
    ensureR16uiTex(width, height);
    ensureFBO(width, height);
    w = width;
    h = height;
  }

  function draw(rgb565: Uint16Array, width: number, height: number, _pitch: number) {
    if (disposed) throw new Error('blit: draw() after dispose()');
    if (width === 0 || height === 0) return;
    if (width !== w || height !== h) resize(width, height);

    const texels = width * height;
    const src = rgb565.length >= texels ? rgb565.subarray(0, texels) : rgb565;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r16uiTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED_INTEGER, gl.UNSIGNED_SHORT, src);

    gl.viewport(0, 0, width, height);
    gl.bindVertexArray(vao);
    gl.useProgram(prog);
    gl.uniform1i(uTex, 0);
    gl.uniform2f(uSize, width, height);
    gl.uniform2f(uFrame, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  const FLIP_VS = `#version 300 es
    out vec2 v_uv;
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      v_uv = vec2(p.x, 1.0 - p.y);
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;
  const FLIP_FS = `#version 300 es
    precision mediump float;
    uniform sampler2D u_src;
    in vec2 v_uv;
    out vec4 o;
    void main() { o = texture(u_src, v_uv); }`;

  let flipProg: WebGLProgram | null = null;
  let flipVAO: WebGLVertexArrayObject | null = null;

  function ensureFlipProgram() {
    if (flipProg) return;
    const vs = compileShader(gl, gl.VERTEX_SHADER, FLIP_VS, 'flip.vert');
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FLIP_FS, 'flip.frag');
    flipProg = linkProgram(gl, vs, fs, 'flip');
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    flipVAO = gl.createVertexArray();
  }

  function drawToCanvas(dstW: number, dstH: number) {
    if (disposed) throw new Error('blit: drawToCanvas() after dispose()');
    if (!fbo) return;
    ensureFlipProgram();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, dstW, dstH);
    gl.bindVertexArray(flipVAO);
    gl.useProgram(flipProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(gl.getUniformLocation(flipProg!, 'u_src'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (r16uiTex) gl.deleteTexture(r16uiTex);
    if (fboTex) gl.deleteTexture(fboTex);
    if (fbo) gl.deleteFramebuffer(fbo);
    if (flipProg) gl.deleteProgram(flipProg);
    if (flipVAO) gl.deleteVertexArray(flipVAO);
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
  }

  ensureFBO(1, 1);

  return {
    draw,
    drawToCanvas,
    resize,
    dispose,
    get fboTexture() {
      return fboTex;
    },
  };
}
