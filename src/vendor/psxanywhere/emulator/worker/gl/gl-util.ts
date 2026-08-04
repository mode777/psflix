'use strict';

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  label = '',
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed${label ? ' (' + label + ')' : ''}: ${log}`);
  }
  return sh;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
  label = '',
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`program link failed${label ? ' (' + label + ')' : ''}: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export function createProgramFromSources(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  label = '',
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc, label);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, label);
  return linkProgram(gl, vs, fs, label);
}

export async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch ' + url + ' failed: ' + r.status);
  return r.text();
}
