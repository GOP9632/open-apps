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

export function bakeLUT(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(512, 512), d = img.data;
  for (let bi = 0; bi < 64; bi++) {
    const tx = (bi % 8) * 64, ty = Math.floor(bi / 8) * 64;
    for (let gi = 0; gi < 64; gi++) for (let ri = 0; ri < 64; ri++) {
      const o = ((ty + gi) * 512 + tx + ri) * 4;
      const out = fn ? fn(ri / 63, gi / 63, bi / 63) : [ri / 63, gi / 63, bi / 63];
      d[o] = out[0] * 255 + 0.5; d[o + 1] = out[1] * 255 + 0.5; d[o + 2] = out[2] * 255 + 0.5; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
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
