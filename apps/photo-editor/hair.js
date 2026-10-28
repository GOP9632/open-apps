// 頭髮：染髮、髮色統一、蓬鬆感、髮際線、祛碎髮、補髮縫、增髮
//   醒圖的頭髮面板全部是上傳到伺服器用 AI 重畫，只有低、中、高幾檔。
//   這裡改成在裝置上做：用 MediaPipe 的頭髮分割當遮罩，自己寫的 GPU 調色和局部變形，強度可以連續調。
//   流程：先算出「改過頭髮的照片」，再交給主管線（美顏、濾鏡…）接著處理。
import { boxBlur as blur, mkCanvas } from './masktools.js';

// 第一次點開時的強度，照醒圖點開時預設的那一檔換算（低 33、中 66）
export const HAIR = [
  ['hairUni', '髮色統一', '<svg viewBox="0 0 24 24"><path d="M5 20c0-9 3-15 7-15s7 6 7 15"/><path d="M9 9h6M8 13h8"/></svg>', 0, 50],
  ['hairVol', '蓬鬆感', '<svg viewBox="0 0 24 24"><path d="M4 18c-1-8 3-14 8-14s9 6 8 14"/><path d="M8 18c0-6 2-9 4-9s4 3 4 9"/></svg>', 0, 33],
  ['hairLine', '髮際線', '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="7" ry="8"/><path d="M5.5 10c3-3 10-3 13 0"/><path d="M12 6v3M10.5 7.5L12 9l1.5-1.5"/></svg>', -100, 33],
  ['hairFly', '祛碎髮', '<svg viewBox="0 0 24 24"><path d="M6 20c0-9 2-14 6-14s6 5 6 14"/><path d="M4 7l2 1M20 7l-2 1M5 4l2 2M19 4l-2 2" opacity=".6"/></svg>', 0, 60],
  ['hairGap', '補髮縫', '<svg viewBox="0 0 24 24"><path d="M5 20c0-9 3-15 7-15s7 6 7 15"/><path d="M12 5v6" stroke-dasharray="2 2"/></svg>', 0, 66],
  ['hairDense', '增髮', '<svg viewBox="0 0 24 24"><path d="M5 20c0-9 3-15 7-15s7 6 7 15"/><path d="M9 8v8M12 7v9M15 8v8"/></svg>', 0, 33],
];
export const HAIR_P0 = { hairDye: '', hairDyeAmt: 100, hairUni: 0, hairVol: 0, hairLine: 0, hairFly: 0, hairGap: 0, hairDense: 0 };

// 染髮色號（sRGB，0~1）：用在頭髮的平均亮度上，亮的髮絲會跟著亮
export const DYES = [
  { id: 'brown', name: '栗棕', c: [0.42, 0.25, 0.15] },
  { id: 'milktea', name: '奶茶', c: [0.62, 0.47, 0.36] },
  { id: 'linen', name: '亞麻', c: [0.74, 0.62, 0.46] },
  { id: 'gold', name: '淺金', c: [0.86, 0.72, 0.45] },
  { id: 'wine', name: '酒紅', c: [0.45, 0.12, 0.16] },
  { id: 'pink', name: '粉紫', c: [0.72, 0.45, 0.66] },
  { id: 'blue', name: '霧藍', c: [0.36, 0.45, 0.58] },
  { id: 'ash', name: '灰棕', c: [0.44, 0.37, 0.32] },
  { id: 'black', name: '黑茶', c: [0.13, 0.10, 0.09] },
];

// 要改照片顏色的項目
export const hairColorOn = p => !!p.hairDye || ['hairUni', 'hairFly', 'hairGap', 'hairDense'].some(k => p[k]);
// 要用到頭髮遮罩的項目（髮際線只要臉部特徵點；蓬鬆感要先確定有頭髮，光頭推了會凹凸不平）
export const hairNeedsSeg = p => hairColorOn(p) || !!p.hairVol;

// ---------- 遮罩（在分割圖的解析度上，用 CPU 算一次） ----------
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 用權重平均把顏色「填」到周圍：頭髮的顏色場、背景的顏色場
function field(rgb, wt, w, h, r) {
  const ch = [0, 1, 2].map(c => { const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = rgb[i * 4 + c] / 255 * wt[i]; return blur(a, w, h, r, 3); });
  const ws = blur(Float32Array.from(wt), w, h, r, 3);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = 1 / Math.max(ws[i], 1e-3);
    for (let c = 0; c < 3; c++) out[i * 4 + c] = ch[c][i] * k * 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

// 準備頭髮資料，同一張照片只算一次
//   M：R = 頭髮、G = 髮縫（頭頂範圍內，頭髮包起來但沒被判成頭髮的地方）、B = 頭髮主體（往內縮）
//   HF：頭髮的顏色場；BF：背景的顏色場（祛碎髮把邊緣換成背景）
//   canvas：照片，或 { width, height, img }（同 skin.js prepSkin）
export function prepHair(canvas, seg, faces) {
  const { w, h } = seg, n = w * h;
  const sctx = mkCanvas(w, h).getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas.img || canvas, 0, 0, w, h);
  const rgb = sctx.getImageData(0, 0, w, h).data;
  const H = seg.hair, bg = seg.bg;
  const r = Math.max(2, Math.round(Math.max(w, h) / 90));
  // 主體：模糊後還很確定是頭髮的地方
  const core = blur(Float32Array.from(H), w, h, r);
  for (let i = 0; i < n; i++) core[i] = sstep(0.55, 0.85, core[i]);
  // 髮縫：先膨脹再收縮（closing），補起來的部分就是縫
  const rg = Math.max(2, Math.round(Math.max(w, h) / 60));
  const dil = blur(Float32Array.from(H), w, h, rg);
  for (let i = 0; i < n; i++) dil[i] = sstep(0.12, 0.3, dil[i]);
  const clo = blur(dil, w, h, rg);
  const kx = w / canvas.width, ky = h / canvas.height;
  // 只補頭頂：眉毛以上、離頭頂不遠
  const heads = faces.map(pts => {
    const up = (() => { const a = pts[33], b = pts[263], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }; })();
    const W = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
    return { bx: (pts[105].x + pts[334].x) / 2 * kx, by: (pts[105].y + pts[334].y) / 2 * ky, tx: pts[10].x * kx, ty: pts[10].y * ky, up, R: W * 0.95 * kx };
  });
  // 旁邊是不是背景：背景機率往外擴一點
  const near = blur(Float32Array.from(bg), w, h, r * 2);
  const M = new Uint8ClampedArray(n * 4), F = new Uint8ClampedArray(n * 4);
  const hairW = new Float32Array(n), bgW = new Float32Array(n);
  let mr = 0, mg = 0, mb = 0, ms = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let top = faces.length ? 0 : 1;
    for (const f of heads) {
      const above = (x - f.bx) * f.up.x + (y - f.by) * f.up.y;
      const d = Math.hypot(x - f.tx, y - f.ty);
      top = Math.max(top, sstep(0, f.R * 0.08, above) * (1 - sstep(f.R * 0.7, f.R, d)));
    }
    const gap = Math.max(0, sstep(0.75, 0.92, clo[i]) - H[i]) * top;
    M[i * 4] = H[i] * 255; M[i * 4 + 1] = gap * 255; M[i * 4 + 2] = core[i] * 255; M[i * 4 + 3] = 255;
    F[i * 4] = Math.min(1, H[i] * (1 - core[i]) * 1.6) * sstep(0.25, 0.6, near[i]) * 255; F[i * 4 + 3] = 255;
    hairW[i] = core[i] * core[i];
    bgW[i] = Math.pow(Math.max(0, bg[i] - 0.5) * 2, 2);
    if (core[i] > 0.5) { const wt = core[i]; mr += rgb[i * 4] * wt; mg += rgb[i * 4 + 1] * wt; mb += rgb[i * 4 + 2] * wt; ms += wt; }
  }
  const mean = ms > 0 ? [mr / ms / 255, mg / ms / 255, mb / ms / 255] : [0.15, 0.12, 0.1];
  const img = (d) => { const c = mkCanvas(w, h); c.getContext('2d').putImageData(new ImageData(d, w, h), 0, 0); return c; };
  return {
    M: img(M), F: img(F),
    HF: img(field(rgb, hairW, w, h, r * 2)),
    BF: img(field(rgb, bgW, w, h, r * 3)),
    mean, area: ms / n,
  };
}

// ---------- GPU：把頭髮調整套到原尺寸照片上 ----------
const VS = `#version 300 es
in vec2 a; out vec2 vUV;
void main(){ vUV = vec2((a.x + 1.0) * 0.5, (1.0 - a.y) * 0.5); gl_Position = vec4(a, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uImg, uM, uHF, uBF, uF;
uniform vec3 uMean, uDye;
uniform float uDyeAmt, uUni, uFly, uGap, uDense;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 col = texture(uImg, vUV).rgb;
  vec3 m = texture(uM, vUV).rgb;
  float h = m.r, gap = m.g, core = m.b;
  vec3 hf = texture(uHF, vUV).rgb, bf = texture(uBF, vUV).rgb;
  float lm = max(luma(uMean), 0.02);
  // 祛碎髮：頭髮輪廓外圍的細碎髮絲換成背景的顏色
  if (uFly > 0.0) {
    float fly = texture(uF, vUV).r * uFly;
    col = mix(col, bf, fly);
    h *= 1.0 - fly;
  }
  // 補髮縫：縫裡填頭髮的顏色，留一點原本的明暗起伏
  if (uGap > 0.0) {
    float g = gap * uGap;
    vec3 fill = hf * (0.85 + 0.3 * (luma(col) - luma(hf)));
    col = mix(col, fill, g);
    h = max(h, g);
  }
  // 增髮：頭頂稀疏、露出頭皮的地方補上髮色，頭髮主體再加一點密度（變深、髮絲對比高一點）
  if (uDense > 0.0) {
    float g = gap * uDense * 0.8;
    col = mix(col, hf * (0.85 + 0.3 * (luma(col) - luma(hf))), g);
    h = max(h, g);
    float k = uDense * core;
    vec3 d = col - hf;
    col = hf * (1.0 - 0.18 * k) + d * (1.0 + 0.35 * k);
  }
  // 髮色統一：色相、飽和度往整頭的平均色靠，深淺不均（補染、髮根）也拉平一些
  if (uUni > 0.0) {
    float L = luma(col);
    float L2 = L + (lm - luma(hf)) * 0.6;
    vec3 tgt = clamp(vec3(L2) + (uMean - vec3(lm)) * clamp(L2 / lm, 0.0, 1.2) * 0.85, 0.0, 1.0);
    col = mix(col, tgt, uUni * h * 0.8);
  }
  // 染髮：保留髮絲的明暗（相對於整頭平均亮度），顏色換成色號
  if (uDyeAmt > 0.0) {
    float r = clamp(luma(col) / lm, 0.0, 3.0);
    vec3 t = uDye * pow(r, 0.85);
    t += max(vec3(0.0), vec3(luma(t) - 1.0));
    col = mix(col, clamp(t, 0.0, 1.0), uDyeAmt * h);
  }
  o = vec4(col, 1.0);
}`;

export class HairFx {
  constructor() {
    const c = this.canvas = document.createElement('canvas');
    // 不要反鋸齒、深度、模板（同 skin.js SkinFx，評審 M1）
    const gl = this.gl = c.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = this.p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.t = [0, 1, 2, 3, 4].map(() => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    this.src = null; this.data = null;
  }
  up(i, src) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.t[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
  // 效果關掉時放掉跟照片一樣大的畫布和照片貼圖（評審 M1）；頭髮資料留著
  release() {
    const gl = this.gl;
    if (!gl || !this.src) return;
    this.canvas.width = this.canvas.height = 1;
    gl.bindTexture(gl.TEXTURE_2D, this.t[0]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.src = null;
  }
  // 回傳改好頭髮的 canvas
  apply(img, data, p) {
    const gl = this.gl;
    if (!gl) return img;
    if (this.src !== img) { this.src = img; this.canvas.width = img.width; this.canvas.height = img.height; this.up(0, img); }
    if (this.data !== data) { this.data = data; this.up(1, data.M); this.up(2, data.HF); this.up(3, data.BF); this.up(4, data.F); }
    gl.useProgram(this.p);
    gl.viewport(0, 0, img.width, img.height);
    ['uImg', 'uM', 'uHF', 'uBF', 'uF'].forEach((n, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.t[i]); gl.uniform1i(gl.getUniformLocation(this.p, n), i); });
    const u = n => gl.getUniformLocation(this.p, n), f = k => (p[k] || 0) / 100;
    const dye = DYES.find(d => d.id === p.hairDye);
    gl.uniform3fv(u('uMean'), data.mean);
    gl.uniform3fv(u('uDye'), dye ? dye.c : [0, 0, 0]);
    gl.uniform1f(u('uDyeAmt'), dye ? f('hairDyeAmt') * 0.7 : 0 /* 預設 100 照 Hypic，看起來跟以前的 70 一樣 */);
    gl.uniform1f(u('uUni'), f('hairUni')); gl.uniform1f(u('uFly'), f('hairFly'));
    gl.uniform1f(u('uGap'), f('hairGap')); gl.uniform1f(u('uDense'), f('hairDense'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}

// ---------- 蓬鬆感、髮際線：局部變形，跟瘦臉用同一套（主管線裡算） ----------
export function hairWarps(faces, p, hair) {
  const out = [], vol = hair && hair.area > 0.001 ? (p.hairVol || 0) / 100 : 0, line = (p.hairLine || 0) / 100;
  if (!vol && !line) return out;
  for (const pts of faces) {
    const a = pts[33], b = pts[263], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const up = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }, side = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const rot = Math.atan2(b.y - a.y, b.x - a.x);
    const W = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
    const top = pts[10];
    // 頭的中心大約在額頭上方
    const c = { x: top.x - up.x * W * 0.15, y: top.y - up.y * W * 0.15 };
    if (vol) {
      // 頭頂、兩側往外推，讓頭髮看起來比較有份量
      for (const [ang, wt] of [[0, 1], [-0.6, 0.9], [0.6, 0.9], [-1.15, 0.75], [1.15, 0.75], [-1.6, 0.5], [1.6, 0.5]]) {
        const dir = { x: up.x * Math.cos(ang) + side.x * Math.sin(ang), y: up.y * Math.cos(ang) + side.y * Math.sin(ang) };
        const at = { x: c.x + dir.x * W * 0.85, y: c.y + dir.y * W * 0.85 };
        const d = W * 0.13 * vol * wt;
        out.push({ cx: at.x, cy: at.y, dx: dir.x * d, dy: dir.y * d, r: W * 0.4, rot });
      }
    }
    if (line) {
      // 正值：髮際線往下（額頭變小）；負值：往上
      for (const [i, wt] of [[10, 1], [109, 0.85], [338, 0.85], [67, 0.6], [297, 0.6]]) {
        const d = W * 0.08 * line * wt;
        out.push({ cx: pts[i].x + up.x * W * 0.03, cy: pts[i].y + up.y * W * 0.03, dx: -up.x * d, dy: -up.y * d, r: W * 0.24, rot });
      }
    }
  }
  return out;
}
