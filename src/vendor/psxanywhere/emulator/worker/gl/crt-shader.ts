// newpixie-crt — 4-pass WebGL2 CRT shader. See docs/render.md.

import { compileShader, createProgramFromSources } from './gl-util';

const VERTEX_SRC = `#version 300 es
    out vec2 vTexCoord;
    void main() {
      vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      vTexCoord = pos;
      gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

const ACCUMULATE_FRAG = `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    out vec4 FragColor;

    uniform sampler2D uSource;
    uniform sampler2D uFeedback;
    uniform float acc_modulate;

    void main() {
      vec4 a = texture(uFeedback, vTexCoord) * acc_modulate;
      vec4 b = texture(uSource, vTexCoord);
      FragColor = max(a, b * 0.96);
    }
  `;

const BLUR_FRAG = `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    out vec4 FragColor;

    uniform sampler2D uSource;
    uniform float uAmount;
    uniform vec2 uTexel;
    uniform vec2 uDir;

    void main() {
      vec2 blur = uDir * uAmount * uTexel;
      vec2 uv = vTexCoord;
      vec4 sum = texture(uSource, uv) * 0.2270270270;
      sum += texture(uSource, uv - 4.0 * blur) * 0.0162162162;
      sum += texture(uSource, uv - 3.0 * blur) * 0.0540540541;
      sum += texture(uSource, uv - 2.0 * blur) * 0.1216216216;
      sum += texture(uSource, uv - 1.0 * blur) * 0.1945945946;
      sum += texture(uSource, uv + 1.0 * blur) * 0.1945945946;
      sum += texture(uSource, uv + 2.0 * blur) * 0.1216216216;
      sum += texture(uSource, uv + 3.0 * blur) * 0.0540540541;
      sum += texture(uSource, uv + 4.0 * blur) * 0.0162162162;
      FragColor = sum;
    }
  `;

const FINAL_FRAG = `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    out vec4 FragColor;

    uniform sampler2D uAccum;
    uniform sampler2D uBlur2;
    uniform sampler2D uFrame;

    uniform vec2 uOutputSize;
    uniform float uFrameCount;

    uniform float use_frame;
    uniform float curvature;
    uniform float wiggle_toggle;
    uniform float scanroll;
    uniform float vignette;
    uniform float ghosting;
    uniform float scanline_strength;
    uniform float filmic_toe;
    uniform float filmic_shoulder;
    uniform float gamma;

    vec3 tsample(sampler2D samp, vec2 tc) {
      if (curvature > 0.0) {
        tc = tc * vec2(1.025, 0.92) + vec2(-0.0125, 0.04);
      }
      vec3 s = pow(abs(texture(samp, vec2(tc.x, 1.0 - tc.y)).rgb), vec3(2.2));
      return s * vec3(1.25);
    }

    vec3 filmic(vec3 LinearColor) {
      vec3 x = max(vec3(0.0), LinearColor - vec3(filmic_toe));
      return (x * (filmic_shoulder * x + 0.5)) / (x * (filmic_shoulder * x + 1.7) + 0.06);
    }

    vec2 curve(vec2 uv) {
      if (curvature <= 0.0) return uv;
      uv = uv - 0.5;
      uv *= vec2(0.925, 1.095);
      vec2 cuv = uv * curvature;
      cuv.x *= 1.0 + pow(abs(cuv.y) / 4.0, 2.0);
      cuv.y *= 1.0 + pow(abs(cuv.x) / 3.0, 2.0);
      uv = cuv / curvature;
      uv += 0.5;
      uv = uv * 0.92 + 0.04;
      return uv;
    }

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 fragCoord = vTexCoord * uOutputSize;
      float time = mod(uFrameCount, 849.0) * 36.0;

      vec2 uv = vTexCoord;
      vec2 curved_uv = mix(curve(uv), uv, 0.4);
      float scale = curvature > 0.0 ? -0.101 : 0.0;
      vec2 scuv = curved_uv * (1.0 - scale) + scale / 2.0
                 + (curvature > 0.0 ? vec2(0.003, -0.001) : vec2(0.0));
      uv = scuv;

      vec3 col;
      float x = wiggle_toggle * sin(0.1 * time + curved_uv.y * 13.0) * sin(0.23 * time + curved_uv.y * 19.0) * sin(0.3 + 0.11 * time + curved_uv.y * 23.0) * 0.0012;
      float o = sin(fragCoord.y * 1.5) / uOutputSize.x;
      x += o * 0.25;
      time = mod(uFrameCount, 640.0);

      col.r = tsample(uAccum, vec2(x + scuv.x + 0.0009, scuv.y + 0.0009)).x + 0.02;
      col.g = tsample(uAccum, vec2(x + scuv.x + 0.0000, scuv.y - 0.0011)).y + 0.02;
      col.b = tsample(uAccum, vec2(x + scuv.x - 0.0015, scuv.y + 0.0000)).z + 0.02;

      float i = clamp(col.r * 0.299 + col.g * 0.587 + col.b * 0.114, 0.0, 1.0);
      i = pow(1.0 - pow(i, 2.0), 1.0);
      i = (1.0 - i) * 0.85 + 0.15;

      float ghs = 0.15 * ghosting;
      vec3 r = tsample(uBlur2, vec2(x - 0.014, -0.027) * 0.85 + 0.007 * vec2(
                  0.35 * sin(1.0 / 7.0 + 15.0 * curved_uv.y + 0.9 * time),
                  0.35 * sin(2.0 / 7.0 + 10.0 * curved_uv.y + 1.37 * time))
                + vec2(scuv.x + 0.001, scuv.y + 0.001)) * vec3(0.5, 0.25, 0.25);
      vec3 g = tsample(uBlur2, vec2(x - 0.019, -0.020) * 0.85 + 0.007 * vec2(
                  0.35 * cos(1.0 / 9.0 + 15.0 * curved_uv.y + 0.5 * time),
                  0.35 * sin(2.0 / 9.0 + 10.0 * curved_uv.y + 1.50 * time))
                + vec2(scuv.x + 0.000, scuv.y - 0.002)) * vec3(0.25, 0.5, 0.25);
      vec3 b = tsample(uBlur2, vec2(x - 0.017, -0.003) * 0.85 + 0.007 * vec2(
                  0.35 * sin(2.0 / 3.0 + 15.0 * curved_uv.y + 0.7 * time),
                  0.35 * cos(2.0 / 3.0 + 10.0 * curved_uv.y + 1.63 * time))
                + vec2(scuv.x - 0.002, scuv.y + 0.000)) * vec3(0.25, 0.25, 0.5);

      col += vec3(ghs * (1.0 - 0.299)) * pow(clamp(vec3(3.0) * r, vec3(0.0), vec3(1.0)), vec3(2.0)) * vec3(i);
      col += vec3(ghs * (1.0 - 0.587)) * pow(clamp(vec3(3.0) * g, vec3(0.0), vec3(1.0)), vec3(2.0)) * vec3(i);
      col += vec3(ghs * (1.0 - 0.114)) * pow(clamp(vec3(3.0) * b, vec3(0.0), vec3(1.0)), vec3(2.0)) * vec3(i);

      col *= vec3(0.95, 1.05, 0.95);
      col = clamp(col * 1.3 + 0.75 * col * col + 1.25 * col * col * col * col * col, vec3(0.0), vec3(10.0));

      float vig = ((1.0 - 0.99 * vignette) + 1.0 * 16.0 * curved_uv.x * curved_uv.y * (1.0 - curved_uv.x) * (1.0 - curved_uv.y));
      vig = 1.3 * sqrt(max(vig, 0.0));
      col *= vig;

      time *= scanroll;

      float scans = clamp(1.0 - scanline_strength * (0.65 - 0.18 * sin(6.0 * time - curved_uv.y * uOutputSize.y * 1.5)), 0.0, 1.0);
      float s = pow(scans, 0.9);
      col = col * vec3(s);

      col *= 1.0 - 0.23 * (clamp(mod(fragCoord.x, 3.0) / 2.0, 0.0, 1.0));

      col = filmic(col);

      vec2 seed = curved_uv * uOutputSize;
      col -= 0.015 * pow(vec3(rand(seed + time), rand(seed + time * 2.0), rand(seed + time * 3.0)), vec3(1.5));

      col *= 1.0 - 0.004 * (sin(50.0 * time + curved_uv.y * 2.0) * 0.5 + 0.5);

      uv = curved_uv;
      uv = vec2(uv.x, 1.0 - uv.y);
      vec4 f = texture(uFrame, vTexCoord.xy);
      f.xyz = mix(f.xyz, vec3(0.5, 0.5, 0.5), 0.5);
      float fvig = clamp(-0.00 + 512.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.2, 0.8);
      col = mix(col, mix(max(col, 0.0), pow(abs(f.xyz), vec3(1.4)) * fvig, f.w * f.w), vec3(use_frame));

      col = pow(max(col, vec3(0.0)), vec3(1.0 / max(gamma, 0.0001)));

      FragColor = vec4(col, 1.0);
    }
  `;

const DEFAULT_PARAMS = Object.freeze({
  acc_modulate: 0.5,
  blur_x: 0.75,
  blur_y: 1.0,
  curvature: 0.0,
  vignette: 0.35,
  ghosting: 0.3,
  use_frame: 0.0,
  wiggle_toggle: 0.0,
  scanroll: 1.0,
  scanline_strength: 1.0,
  filmic_toe: 0.013,
  filmic_shoulder: 5.6,
  gamma: 1.18,
});

export type CRTShaderParams = typeof DEFAULT_PARAMS;

export interface CRTShaderOptions {
  letterbox?: boolean;
  displayAspect?: number | null;
  params?: Partial<Record<string, number>>;
  frameTexture?: WebGLTexture | null;
  frameTextureURL?: string | null;
}

interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface ProgramSet {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class CRTShader {
  gl: WebGL2RenderingContext;
  letterbox: boolean;
  displayAspect: number | null;
  params: Record<string, number>;
  _frameCount: number;
  _sourceWidth: number;
  _sourceHeight: number;
  _sourceTexture: WebGLTexture | null;
  _accumRT: RenderTarget | null;
  _blur2RT: RenderTarget | null;
  _blur1A: RenderTarget | null;
  _blur1B: RenderTarget | null;
  _blur1Read: RenderTarget | null;
  _blur1Write: RenderTarget | null;
  _frameTexture: WebGLTexture | null;
  _fallbackFrameTexture: WebGLTexture;
  _programs: { accumulate: ProgramSet; blur: ProgramSet; final: ProgramSet };
  _frameTextureReadyPromise: Promise<WebGLTexture | null>;

  constructor(gl: WebGL2RenderingContext, options: CRTShaderOptions = {}) {
    if (!gl) throw new Error('CRTShader: a WebGL2 context is required');
    if (typeof gl.createShader !== 'function') {
      throw new Error('CRTShader: passed context does not look like a WebGL2 rendering context');
    }

    this.gl = gl;
    this.letterbox = options.letterbox !== false;
    this.displayAspect = options.displayAspect || null;
    this.params = { ...DEFAULT_PARAMS, ...(options.params || {}) };
    this._frameCount = 0;
    this._sourceWidth = 0;
    this._sourceHeight = 0;
    this._sourceTexture = null;
    this._accumRT = null;
    this._blur2RT = null;
    this._blur1A = null;
    this._blur1B = null;
    this._blur1Read = null;
    this._blur1Write = null;
    this._frameTexture = null;
    this._fallbackFrameTexture = this._createFallbackFrameTexture();

    this._programs = this._compilePrograms();

    if (options.frameTexture) {
      this._frameTexture = options.frameTexture;
      this._frameTextureReadyPromise = Promise.resolve(options.frameTexture);
    } else {
      this._frameTextureReadyPromise = this._loadFrameTexture(options.frameTextureURL);
    }
  }

  get ready() {
    return this._frameTextureReadyPromise;
  }
  get frameCount() {
    return this._frameCount;
  }
  get sourceWidth() {
    return this._sourceWidth;
  }
  get sourceHeight() {
    return this._sourceHeight;
  }

  setSource(source: TexImageSource, width: number, height: number) {
    if (this._sourceTexture) {
      this._updateTextureFromSource(this._sourceTexture, source);
    } else {
      this._sourceTexture = this._createTextureFromSource(source);
    }
    this._allocateSourceSizedTargets(width, height);
  }

  setSourceTexture(texture: WebGLTexture, width: number, height: number) {
    this._sourceTexture = texture;
    this._allocateSourceSizedTargets(width, height);
  }

  updateSource(source: TexImageSource, width: number, height: number) {
    if (!this._sourceTexture || width !== this._sourceWidth || height !== this._sourceHeight) {
      this.setSource(source, width, height);
      return;
    }
    this._updateTextureFromSource(this._sourceTexture, source);
  }

  render() {
    if (!this._sourceTexture || !this._accumRT) {
      throw new Error('CRTShader: no source set; call setSource() before render()');
    }
    const gl = this.gl;
    this._frameCount++;
    const sw = this._sourceWidth,
      sh = this._sourceHeight;
    const texel = [1 / sw, 1 / sh];
    const canvas = gl.canvas as HTMLCanvasElement;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._accumRT.framebuffer);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(this._programs.accumulate.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._sourceTexture);
    gl.uniform1i(this._programs.accumulate.uniforms.uSource, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._blur1Read!.texture);
    gl.uniform1i(this._programs.accumulate.uniforms.uFeedback, 1);
    gl.uniform1f(this._programs.accumulate.uniforms.acc_modulate, this.params.acc_modulate);
    this._drawFullscreenTriangle();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._blur1Write!.framebuffer);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(this._programs.blur.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumRT.texture);
    gl.uniform1i(this._programs.blur.uniforms.uSource, 0);
    gl.uniform1f(this._programs.blur.uniforms.uAmount, this.params.blur_x);
    gl.uniform2fv(this._programs.blur.uniforms.uTexel, texel);
    gl.uniform2f(this._programs.blur.uniforms.uDir, 1.0, 0.0);
    this._drawFullscreenTriangle();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._blur2RT!.framebuffer);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(this._programs.blur.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._blur1Write!.texture);
    gl.uniform1i(this._programs.blur.uniforms.uSource, 0);
    gl.uniform1f(this._programs.blur.uniforms.uAmount, this.params.blur_y);
    gl.uniform2fv(this._programs.blur.uniforms.uTexel, texel);
    gl.uniform2f(this._programs.blur.uniforms.uDir, 0.0, 1.0);
    this._drawFullscreenTriangle();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let outW: number, outH: number;
    if (this.letterbox) {
      const aspect = this.displayAspect || sw / sh;
      const rect = this._computeLetterboxRect(canvas.width, canvas.height, aspect);
      gl.viewport(rect.x, rect.y, rect.w, rect.h);
      outW = rect.w;
      outH = rect.h;
    } else {
      outW = canvas.width;
      outH = canvas.height;
    }

    gl.useProgram(this._programs.final.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumRT.texture);
    gl.uniform1i(this._programs.final.uniforms.uAccum, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._blur2RT!.texture);
    gl.uniform1i(this._programs.final.uniforms.uBlur2, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._frameTexture || this._fallbackFrameTexture);
    gl.uniform1i(this._programs.final.uniforms.uFrame, 2);
    gl.uniform2f(this._programs.final.uniforms.uOutputSize, outW, outH);
    gl.uniform1f(this._programs.final.uniforms.uFrameCount, this._frameCount);
    gl.uniform1f(this._programs.final.uniforms.use_frame, this.params.use_frame);
    gl.uniform1f(this._programs.final.uniforms.curvature, this.params.curvature);
    gl.uniform1f(this._programs.final.uniforms.wiggle_toggle, this.params.wiggle_toggle);
    gl.uniform1f(this._programs.final.uniforms.scanroll, this.params.scanroll);
    gl.uniform1f(this._programs.final.uniforms.vignette, this.params.vignette);
    gl.uniform1f(this._programs.final.uniforms.ghosting, this.params.ghosting);
    gl.uniform1f(this._programs.final.uniforms.scanline_strength, this.params.scanline_strength);
    gl.uniform1f(this._programs.final.uniforms.filmic_toe, this.params.filmic_toe);
    gl.uniform1f(this._programs.final.uniforms.filmic_shoulder, this.params.filmic_shoulder);
    gl.uniform1f(this._programs.final.uniforms.gamma, this.params.gamma);
    this._drawFullscreenTriangle();

    const tmp = this._blur1Read;
    this._blur1Read = this._blur1Write;
    this._blur1Write = tmp;
  }

  destroy() {
    const gl = this.gl;
    if (this._sourceTexture) gl.deleteTexture(this._sourceTexture);
    if (this._frameTexture) gl.deleteTexture(this._frameTexture);
    if (this._fallbackFrameTexture) gl.deleteTexture(this._fallbackFrameTexture);
    for (const key of ['_accumRT', '_blur2RT', '_blur1A', '_blur1B'] as const) {
      const rt = this[key];
      if (rt) {
        gl.deleteTexture(rt.texture);
        gl.deleteFramebuffer(rt.framebuffer);
      }
    }
    if (this._programs) {
      for (const { program } of Object.values(this._programs)) {
        gl.deleteProgram(program);
      }
    }
  }

  _compileShader(type: number, src: string): WebGLShader {
    return compileShader(this.gl, type, src, 'CRT');
  }

  _createProgram(vsSrc: string, fsSrc: string): ProgramSet {
    const gl = this.gl;
    const prog = createProgramFromSources(gl, vsSrc, fsSrc, 'CRT');
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { program: prog, uniforms };
  }

  _compilePrograms() {
    return {
      accumulate: this._createProgram(VERTEX_SRC, ACCUMULATE_FRAG),
      blur: this._createProgram(VERTEX_SRC, BLUR_FRAG),
      final: this._createProgram(VERTEX_SRC, FINAL_FRAG),
    };
  }

  _drawFullscreenTriangle() {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _createRenderTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width, height };
  }

  _destroyRenderTarget(rt: RenderTarget | null) {
    if (!rt) return;
    const gl = this.gl;
    gl.deleteTexture(rt.texture);
    gl.deleteFramebuffer(rt.framebuffer);
  }

  _createTextureFromSource(source: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  _updateTextureFromSource(texture: WebGLTexture, source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  _allocateSourceSizedTargets(w: number, h: number) {
    this._destroyRenderTarget(this._accumRT);
    this._destroyRenderTarget(this._blur2RT);
    this._destroyRenderTarget(this._blur1A);
    this._destroyRenderTarget(this._blur1B);
    this._accumRT = this._createRenderTarget(w, h);
    this._blur2RT = this._createRenderTarget(w, h);
    this._blur1A = this._createRenderTarget(w, h);
    this._blur1B = this._createRenderTarget(w, h);
    this._blur1Read = this._blur1A;
    this._blur1Write = this._blur1B;
    this._sourceWidth = w;
    this._sourceHeight = h;
    this._frameCount = 0;
  }

  _computeLetterboxRect(canvasW: number, canvasH: number, aspect: number) {
    let w = canvasW;
    let h = Math.round(w / aspect);
    if (h > canvasH) {
      h = canvasH;
      w = Math.round(h * aspect);
    }
    const x = Math.round((canvasW - w) / 2);
    const y = Math.round((canvasH - h) / 2);
    return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  }

  _createFallbackFrameTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  _loadFrameTexture(url: string | null | undefined): Promise<WebGLTexture | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const gl = this.gl;
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._frameTexture = texture;
        resolve(texture);
      };
      img.onerror = () => {
        console.warn(
          'CRTShader: could not load frame texture from',
          url,
          '— the bezel overlay will be disabled.',
        );
        resolve(null);
      };
      img.src = url;
    });
  }
}

export const CRT_SHADER_DEFAULT_PARAMS: Readonly<Record<string, number>> = DEFAULT_PARAMS;
