// 濾鏡：每個濾鏡是一個 (r,g,b) → [r,g,b] 的顏色函式，數值 0～1。
// 開啟時烘成 512×512 的 LUT 圖（64 階、8×8 格），在 GPU 上查表，強度滑桿就是跟原圖混合。

import { xtFn } from './xt.js';

const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// 依控制點做平滑曲線（單調三次內插）
function curve(points) {
  const xs = points.map(p => p[0] / 255), ys = points.map(p => p[1] / 255);
  const n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  const table = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = Math.min(1, Math.max(0, (x - xs[i]) / h));
    const t2 = t * t, t3 = t2 * t;
    table[k] = clamp((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]);
  }
  return v => table[Math.round(clamp(v) * 255)];
}
const ID = curve([[0, 0], [255, 255]]);

function sat(r, g, b, s) {
  const l = lum(r, g, b);
  return [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s];
}
// 陰影偏一個顏色、亮部偏另一個顏色
function splitTone(r, g, b, sh, hi, amt) {
  const l = lum(r, g, b), ws = (1 - l) * (1 - l), wh = l * l;
  return [r + (sh[0] * ws + hi[0] * wh) * amt, g + (sh[1] * ws + hi[1] * wh) * amt, b + (sh[2] * ws + hi[2] * wh) * amt];
}
function mk({ rgb = ID, r = ID, g = ID, b = ID, s = 1, tone, post }) {
  return (R, G, B) => {
    let c = [r(rgb(R)), g(rgb(G)), b(rgb(B))];
    if (s !== 1) c = sat(c[0], c[1], c[2], s);
    if (tone) c = splitTone(c[0], c[1], c[2], tone[0], tone[1], tone[2]);
    if (post) c = post(c[0], c[1], c[2]);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2])];
  };
}

export const FILTERS = [
  { id: 'none', name: '原圖', fn: null },
  { id: 'clear', name: '清透', fn: mk({ rgb: curve([[0, 4], [64, 70], [128, 140], [192, 205], [255, 255]]), b: curve([[0, 10], [255, 255]]), s: 1.06, tone: [[-0.02, 0, 0.03], [0.01, 0.01, -0.01], 1] }) },
  { id: 'cream', name: '奶油', fn: mk({ rgb: curve([[0, 22], [70, 88], [140, 158], [210, 222], [255, 248]]), s: 0.88, tone: [[0.03, 0.015, -0.01], [0.03, 0.02, -0.02], 1] }) },
  { id: 'japan', name: '日系', fn: mk({ rgb: curve([[0, 30], [80, 105], [160, 182], [255, 250]]), g: curve([[0, 4], [255, 255]]), b: curve([[0, 16], [128, 136], [255, 248]]), s: 0.82 }) },
  { id: 'film', name: '膠片', fn: mk({ rgb: curve([[0, 18], [50, 45], [128, 130], [200, 210], [255, 238]]), r: curve([[0, 6], [128, 132], [255, 250]]), b: curve([[0, 22], [128, 122], [255, 228]]), s: 0.9, tone: [[0, 0.02, 0.03], [0.04, 0.02, -0.03], 1] }) },
  { id: 'hk', name: '港風', fn: mk({ rgb: curve([[0, 10], [64, 52], [128, 126], [192, 200], [255, 245]]), r: curve([[0, 0], [128, 138], [255, 255]]), g: curve([[0, 8], [128, 124], [255, 240]]), s: 1.12, tone: [[0, 0.03, 0.02], [0.05, 0.01, -0.04], 1] }) },
  { id: 'coolwhite', name: '冷白', fn: mk({ rgb: curve([[0, 8], [90, 104], [180, 200], [255, 255]]), r: curve([[0, 0], [255, 244]]), b: curve([[0, 12], [255, 255]]), s: 0.85 }) },
  { id: 'sunny', name: '暖陽', fn: mk({ rgb: curve([[0, 6], [128, 138], [255, 255]]), r: curve([[0, 6], [128, 142], [255, 255]]), b: curve([[0, 0], [128, 114], [255, 232]]), s: 1.08 }) },
  { id: 'pink', name: '粉嫩', fn: mk({ rgb: curve([[0, 16], [128, 145], [255, 252]]), r: curve([[0, 8], [255, 255]]), g: curve([[0, 0], [255, 246]]), s: 0.92, tone: [[0.02, 0, 0.02], [0.03, 0, 0.015], 1] }) },
  { id: 'forest', name: '森系', fn: mk({ rgb: curve([[0, 14], [128, 132], [255, 242]]), r: curve([[0, 0], [255, 240]]), g: curve([[0, 6], [128, 134], [255, 252]]), s: 0.86, tone: [[-0.01, 0.02, 0.01], [0.02, 0.03, -0.02], 1] }) },
  { id: 'teal', name: '青橙', fn: mk({ rgb: curve([[0, 4], [64, 58], [192, 200], [255, 252]]), s: 1.1, tone: [[-0.05, 0.02, 0.06], [0.06, 0.02, -0.05], 1] }) },
  { id: 'retro', name: '復古', fn: mk({ rgb: curve([[0, 34], [128, 128], [255, 226]]), r: curve([[0, 10], [128, 136], [255, 250]]), b: curve([[0, 24], [128, 112], [255, 210]]), s: 0.72 }) },
  { id: 'night', name: '夜景', fn: mk({ rgb: curve([[0, 0], [40, 46], [128, 134], [255, 255]]), b: curve([[0, 14], [255, 255]]), s: 1.15, tone: [[-0.02, 0, 0.05], [0.04, 0.01, -0.02], 1] }) },
  { id: 'bw', name: '黑白', fn: mk({ rgb: curve([[0, 8], [64, 56], [192, 204], [255, 250]]), s: 0 }) },
  { id: 'mono', name: '灰調', fn: mk({ rgb: curve([[0, 36], [128, 132], [255, 230]]), s: 0, tone: [[0, 0.005, 0.015], [0.015, 0.01, 0], 1] }) },
];

// 濾鏡 id → 顏色函式；醒圖風格濾鏡（xt 開頭）在 xt.js，還沒載入時回傳 null
export const filterFn = id => !id || id === 'none' ? null : FILTERS.find(f => f.id === id)?.fn ?? xtFn(id);
// 皮膚、頭髮另外那套顏色（只有部分醒圖風格濾鏡有）
export const skinFilterFn = id => xtFn(id, 'skin');
export const hairFilterFn = id => xtFn(id, 'hair');

// n < 64：只在 n³ 個格點算顏色函式，其他用三線性內插補滿（拖滑桿時用，64³ 要算 26 萬次太慢）
export function bakeLUT(fn, n = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(512, 512), d = img.data;
  if (fn && n < 64) {
    const g = new Float32Array(n * n * n * 3);
    for (let b = 0, q = 0; b < n; b++) for (let gg = 0; gg < n; gg++) for (let r = 0; r < n; r++, q += 3) {
      const o = fn(r / (n - 1), gg / (n - 1), b / (n - 1)); g[q] = o[0]; g[q + 1] = o[1]; g[q + 2] = o[2];
    }
    // 每一軸 64 格落在哪兩個格點之間、權重多少
    const i0 = new Int32Array(64), w1 = new Float32Array(64);
    for (let i = 0; i < 64; i++) { const u = i / 63 * (n - 1), a = Math.min(n - 2, Math.floor(u)); i0[i] = a; w1[i] = u - a; }
    const sr = 3, sg = n * 3, sb = n * n * 3;
    for (let bi = 0; bi < 64; bi++) {
      const tx = (bi % 8) * 64, ty = Math.floor(bi / 8) * 64, ob = i0[bi] * sb, fb = w1[bi];
      for (let gi = 0; gi < 64; gi++) {
        const og = ob + i0[gi] * sg, fg = w1[gi];
        for (let ri = 0; ri < 64; ri++) {
          const q = og + i0[ri] * sr, fr = w1[ri], o = ((ty + gi) * 512 + tx + ri) * 4;
          for (let k = 0; k < 3; k++) {
            const p = q + k;
            const c0 = g[p] + (g[p + sr] - g[p]) * fr, c1 = g[p + sg] + (g[p + sg + sr] - g[p + sg]) * fr;
            const c2 = g[p + sb] + (g[p + sb + sr] - g[p + sb]) * fr, c3 = g[p + sb + sg] + (g[p + sb + sg + sr] - g[p + sb + sg]) * fr;
            const e0 = c0 + (c1 - c0) * fg, e1 = c2 + (c3 - c2) * fg;
            d[o + k] = (e0 + (e1 - e0) * fb) * 255 + 0.5;
          }
          d[o + 3] = 255;
        }
      }
    }
  } else {
    for (let bi = 0; bi < 64; bi++) {
      const tx = (bi % 8) * 64, ty = Math.floor(bi / 8) * 64;
      for (let gi = 0; gi < 64; gi++) for (let ri = 0; ri < 64; ri++) {
        const o = ((ty + gi) * 512 + tx + ri) * 4;
        const out = fn ? fn(ri / 63, gi / 63, bi / 63) : [ri / 63, gi / 63, bi / 63];
        d[o] = out[0] * 255 + 0.5; d[o + 1] = out[1] * 255 + 0.5; d[o + 2] = out[2] * 255 + 0.5; d[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 調色：只在 n³ 個格點算（排成 n × n² 的浮點貼圖，第 r 欄、第 g＋b×n 列），醒圖濾鏡、內插都在 GPU 上做（gl.js bakeXt）。
// q：先照 bakeLUT 的方式取整成 0～255 階（只有調色、沒有濾鏡時用，色表跟以前 CPU 烘的一模一樣）
const u8 = new Uint8ClampedArray(1);
export function bakeGrid(fn, n = 64, q = false) {
  const d = new Float32Array(n * n * n * 4);
  for (let b = 0, i = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++, i += 4) {
    const o = fn(r / (n - 1), g / (n - 1), b / (n - 1));
    if (q) for (let k = 0; k < 3; k++) { u8[0] = o[k] * 255 + 0.5; d[i + k] = u8[0] / 255; }
    else { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
    d[i + 3] = 1;
  }
  return d;
}

// 濾鏡縮圖：直接在小圖上用 CPU 套顏色函式
export function thumb(src, fn, size = 124) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = Math.min(src.width, src.height);
  ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
  if (fn) {
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const o = fn(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return c.toDataURL('image/jpeg', 0.8);
}
