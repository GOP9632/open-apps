// WebGL2 修圖管線：
//   1. 縮小到短邊 360 做保邊磨皮（不管照片多大，磨皮質感都一樣）
//   2. 主 shader：變形（瘦臉、大眼）→ 銳化 → 磨皮、美白 → 調色 → 濾鏡 LUT → 暗角、顆粒 → 去背
export const MAX_WARPS = 64;
const SMOOTH_SHORT = 360;

const VS = `#version 300 es
in vec2 a;
uniform float uFbo;
out vec2 vUV;
void main(){
  vUV = vec2((a.x + 1.0) * 0.5, uFbo > 0.5 ? (a.y + 1.0) * 0.5 : (1.0 - a.y) * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main(){ o = texture(uTex, vUV); }`;

// 保邊模糊（雙邊濾波）：顏色差太多的鄰居權重變小，所以五官邊緣不會糊掉
const FS_BILATERAL = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uSigR; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
    vec2 off = vec2(float(x), float(y));
    vec3 s = texture(uTex, vUV + off * uTexel * 1.5).rgb;
    vec3 dc = s - c;
    float w = exp(-dot(off, off) / 18.0 - dot(dc, dc) / (2.0 * uSigR * uSigR));
    sum += s * w; wsum += w;
  }
  o = vec4(sum / wsum, 1.0);
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uImg, uSmooth, uMask, uSeg, uLut;
uniform vec2 uSize;
uniform int uWn;
uniform vec4 uW1[${MAX_WARPS}]; // 中心 xy、位移 xy（像素）
uniform vec4 uW2[${MAX_WARPS}]; // 半徑、種類(0 推移 1 放大)、放大強度、橢圓比
uniform float uExposure, uBright, uContrast, uSat, uTemp, uTint, uHigh, uShadow, uSharp, uVig, uGrain, uFade;
uniform float uSmoothAmt, uWhite, uLutAmt, uHasLut;
uniform float uBgMode; uniform vec3 uBgColor;
out vec4 o;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec3 lut(vec3 c){
  float b = c.b * 63.0;
  float b0 = floor(b), b1 = min(b0 + 1.0, 63.0);
  vec2 off = (c.rg * 63.0 + 0.5) / 512.0;
  vec2 q0 = vec2(mod(b0, 8.0), floor(b0 / 8.0)) / 8.0;
  vec2 q1 = vec2(mod(b1, 8.0), floor(b1 / 8.0)) / 8.0;
  return mix(texture(uLut, q0 + off).rgb, texture(uLut, q1 + off).rgb, b - b0);
}

void main(){
  // 變形：輸出的每個像素往回找要取原圖哪一點
  vec2 p = vUV * uSize;
  for (int i = 0; i < ${MAX_WARPS}; i++) {
    if (i >= uWn) break;
    vec2 c = uW1[i].xy; float r = uW2[i].x;
    vec2 dv = p - c; dv.y *= uW2[i].w;
    float t = length(dv) / r;
    if (t < 1.0) {
      float f = 1.0 - t * t;
      if (uW2[i].y < 0.5) { p -= uW1[i].zw * f * f; }
      else { p = c + (p - c) * (1.0 - uW2[i].z * f * f); }
    }
  }
  vec2 uv = p / uSize;
  vec3 col = texture(uImg, uv).rgb;

  if (uSharp > 0.0) {
    vec2 px = 1.0 / uSize;
    vec3 n = (texture(uImg, uv + vec2(px.x, 0.0)).rgb + texture(uImg, uv - vec2(px.x, 0.0)).rgb
            + texture(uImg, uv + vec2(0.0, px.y)).rgb + texture(uImg, uv - vec2(0.0, px.y)).rgb) * 0.25;
    col += (col - n) * uSharp * 2.0;
  }

  float m = texture(uMask, uv).r;
  if (uSmoothAmt > 0.0 && m > 0.0) {
    vec3 s = texture(uSmooth, uv).rgb;
    col = mix(col, s, m * uSmoothAmt * 0.9);
  }
  if (uWhite > 0.0 && m > 0.0) {
    float k = m * uWhite;
    col = mix(col, 1.0 - (1.0 - col) * (1.0 - col * 0.55), k * 0.6);
    col = mix(col, vec3(luma(col)), k * 0.12);
  }

  col *= exp2(uExposure);
  col = pow(max(col, 0.0), vec3(1.0 - uBright * 0.45));
  float L = luma(col);
  float sh = 1.0 - smoothstep(0.0, 0.55, L), hl = smoothstep(0.45, 1.0, L);
  col += uShadow * 0.35 * sh * (uShadow > 0.0 ? (1.0 - col) : col);
  col += uHigh * 0.35 * hl * (uHigh > 0.0 ? (1.0 - col) : col);
  col = (col - 0.5) * (1.0 + uContrast * 0.55) + 0.5;
  col.r += uTemp * 0.07; col.b -= uTemp * 0.07;
  col.g -= uTint * 0.05; col.rb += uTint * 0.02;
  L = luma(col);
  col = mix(vec3(L), col, 1.0 + uSat);
  col = mix(col, col * 0.84 + 0.1, uFade);
  col = clamp(col, 0.0, 1.0);

  if (uHasLut > 0.5) col = mix(col, lut(col), uLutAmt);

  if (uVig != 0.0) {
    vec2 d = (vUV - 0.5) * vec2(uSize.x / max(uSize.x, uSize.y), uSize.y / max(uSize.x, uSize.y)) * 2.0;
    float v = smoothstep(0.35, 1.25, length(d));
    col = uVig > 0.0 ? col * (1.0 - uVig * v * 0.85) : mix(col, vec3(1.0), -uVig * v * 0.8);
  }
  if (uGrain > 0.0) col += (hash(vUV * uSize) - 0.5) * uGrain * 0.16;
  col = clamp(col, 0.0, 1.0);

  float a = 1.0;
  if (uBgMode > 0.5) {
    a = texture(uSeg, uv).r;
    if (uBgMode < 1.5) { o = vec4(col * a, a); return; }
    col = mix(uBgColor, col, a); a = 1.0;
  }
  o = vec4(col, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('這個瀏覽器不支援 WebGL2');
    this.gl = gl; this.canvas = canvas;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pCopy = program(gl, FS_COPY);
    this.pBil = program(gl, FS_BILATERAL);
    this.pMain = program(gl, FS_MAIN);
    this.tImg = this.tex(); this.tMask = this.tex(); this.tSeg = this.tex(); this.tLut = this.tex();
    this.blank(this.tMask, 0); this.blank(this.tSeg, 255); this.blank(this.tLut, 0);
    this.fbA = this.fbo(); this.fbB = this.fbo();
    this.hasLut = false;
  }
  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  blank(t, v) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([v, v, v, 255]));
  }
  upload(t, src) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  fbo() { return { f: this.gl.createFramebuffer(), t: this.tex(), w: 0, h: 0 }; }
  sizeFbo(fb, w, h) {
    const gl = this.gl;
    if (fb.w === w && fb.h === h) return;
    gl.bindTexture(gl.TEXTURE_2D, fb.t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.t, 0);
    fb.w = w; fb.h = h;
  }
  pass(prog, target, w, h, tex) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, w, h);
    gl.uniform1f(prog.u.uFbo, target ? 1 : 0);
    if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(prog.u.uTex, 0); }
  }
  setImage(src) {
    this.w = src.width; this.h = src.height;
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.upload(this.tImg, src);
    // 磨皮用的低解析度保邊模糊圖
    const k = SMOOTH_SHORT / Math.min(this.w, this.h);
    const sw = Math.max(1, Math.round(this.w * Math.min(1, k))), sh = Math.max(1, Math.round(this.h * Math.min(1, k)));
    this.sizeFbo(this.fbA, sw, sh); this.sizeFbo(this.fbB, sw, sh);
    const gl = this.gl;
    this.pass(this.pCopy, this.fbA, sw, sh, this.tImg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    let src2 = this.fbA, dst = this.fbB;
    for (let i = 0; i < 3; i++) {
      this.pass(this.pBil, dst, sw, sh, src2.t);
      gl.uniform2f(this.pBil.u.uTexel, 1 / sw, 1 / sh);
      gl.uniform1f(this.pBil.u.uSigR, 0.15);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      [src2, dst] = [dst, src2];
    }
    this.tSmooth = src2.t;
  }
  setMask(src) { src ? this.upload(this.tMask, src) : this.blank(this.tMask, 0); }
  setSeg(src) { src ? this.upload(this.tSeg, src) : this.blank(this.tSeg, 255); }
  setLut(src) { this.hasLut = !!src; if (src) this.upload(this.tLut, src); }

  render(p, warps) {
    const gl = this.gl, u = this.pMain.u;
    this.pass(this.pMain, null, this.w, this.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const texs = [[this.tImg, 'uImg'], [this.tSmooth, 'uSmooth'], [this.tMask, 'uMask'], [this.tSeg, 'uSeg'], [this.tLut, 'uLut']];
    texs.forEach(([t, name], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], i); });
    gl.uniform2f(u.uSize, this.w, this.h);
    const n = Math.min(warps.length, MAX_WARPS), w1 = new Float32Array(MAX_WARPS * 4), w2 = new Float32Array(MAX_WARPS * 4);
    for (let i = 0; i < n; i++) {
      const w = warps[i];
      w1.set([w.cx, w.cy, w.dx || 0, w.dy || 0], i * 4);
      w2.set([w.r, w.type === 'scale' ? 1 : 0, w.s || 0, w.ey || 1], i * 4);
    }
    gl.uniform1i(u.uWn, n);
    gl.uniform4fv(u.uW1, w1); gl.uniform4fv(u.uW2, w2);
    const f = v => (v || 0) / 100;
    gl.uniform1f(u.uExposure, f(p.exposure) * 1.2);
    gl.uniform1f(u.uBright, f(p.brightness));
    gl.uniform1f(u.uContrast, f(p.contrast));
    gl.uniform1f(u.uSat, f(p.saturation));
    gl.uniform1f(u.uTemp, f(p.temp));
    gl.uniform1f(u.uTint, f(p.tint));
    gl.uniform1f(u.uHigh, f(p.highlights));
    gl.uniform1f(u.uShadow, f(p.shadows));
    gl.uniform1f(u.uSharp, f(p.sharpen));
    gl.uniform1f(u.uVig, f(p.vignette));
    gl.uniform1f(u.uGrain, f(p.grain));
    gl.uniform1f(u.uFade, f(p.fade));
    gl.uniform1f(u.uSmoothAmt, f(p.smooth));
    gl.uniform1f(u.uWhite, f(p.white));
    gl.uniform1f(u.uHasLut, this.hasLut ? 1 : 0);
    gl.uniform1f(u.uLutAmt, f(p.filterAmt));
    const mode = { keep: 0, clear: 1, color: 2 }[p.bg] || 0;
    gl.uniform1f(u.uBgMode, mode);
    const hex = p.bgColor || '#ffffff';
    gl.uniform3f(u.uBgColor, parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
