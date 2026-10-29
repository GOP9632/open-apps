// 光影 › 相機閃光燈的 AI 模型（第 2 版）：我們自己用 139 張 Unsplash 人像和 Hypic 的成品練的小模型，權重在 flashcam.bin。
// 做法跟 HDRNet 那類一樣：
//   1. 低解析度（256×256，整張照片壓成正方形）看整張照片加人像、皮膚、頭髮、臉的遮罩和臉中心的相對位置，
//      算一張 32×32×8 格的調色表，每格是一個 3×4 的仿射矩陣（新 RGB = A × 舊 RGB + b）。這裡算，每張照片一次
//   2. 每個像素用自己在照片上的位置和「引導值」（RGB、皮膚、頭髮、人、臉遮罩過一層 1×1 的小網路）查表，
//      套在自己的顏色上（gl.js 主 shader，三線性內插）。所以邊緣清楚，不會有一圈光暈
// 訓練時的輸入照 plans/修圖/閃光燈評審 的 prep.py：照片縮到長邊 512（PIL 的雙線性縮小），各通道再縮到 256×256；
// 這裡的縮法照抄 PIL（Resample.c），同一張照片進來的數字跟訓練時一樣。
// 主執行緒、背景執行緒（prepwork.js）都能用，不碰 DOM
import { mkCanvas } from './masktools.js';

export const FULL = 512, LOW = 256, NB = 8, GS = 32;
// 權重的形狀，順序跟 flashcam.bin 一樣（PyTorch state_dict 的順序，float16 小端）
const SHAPES = [
  ['d1', 16 * 10 * 9], ['d1b', 16], ['d2', 32 * 16 * 9], ['d2b', 32], ['d3', 64 * 32 * 9], ['d3b', 64],
  ['l1', 64 * 64 * 9], ['l1b', 64], ['l2', 64 * 64 * 9], ['g1', 64 * 64 * 9], ['g1b', 64], ['g2', 64 * 64 * 9], ['g2b', 64],
  ['gf1', 64 * 64], ['gf1b', 64], ['gf2', 64 * 64], ['gf2b', 64], ['out', 96 * 64], ['outb', 96],
  ['gd1', 8 * 7], ['gd1b', 8], ['gd2', 8], ['gd2b', 1],
];

const half = h => {
  const s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  return e === 0 ? s * f * 2 ** -24 : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * 2 ** (e - 15);
};
// flashcam.bin（ArrayBuffer）→ { d1: Float32Array, ... }
export function parseNet(buf) {
  const u = new Uint16Array(buf), W = {};
  let o = 0;
  for (const [k, n] of SHAPES) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = half(u[o + i]); W[k] = a; o += n; }
  if (o !== u.length) throw new Error('flashcam.bin 大小不對');
  return W;
}

// ---------- 縮圖：照抄 PIL 的雙線性縮放（縮小時是三角形濾波、範圍跟著縮小倍數放大） ----------
function coeffs(inSize, outSize) {
  const scale = inSize / outSize, fs = Math.max(scale, 1), sup = fs, ksize = Math.ceil(sup) * 2 + 1;
  const b = new Int32Array(outSize * 2), k = new Float64Array(outSize * ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const c = (xx + 0.5) * scale;
    let x0 = Math.trunc(c - sup + 0.5), x1 = Math.trunc(c + sup + 0.5), ww = 0;
    if (x0 < 0) x0 = 0;
    if (x1 > inSize) x1 = inSize;
    x1 -= x0;
    for (let x = 0; x < x1; x++) { const t = Math.abs((x + x0 - c + 0.5) / fs), w = t < 1 ? 1 - t : 0; k[xx * ksize + x] = w; ww += w; }
    if (ww) for (let x = 0; x < x1; x++) k[xx * ksize + x] /= ww;
    b[xx * 2] = x0; b[xx * 2 + 1] = x1;
  }
  return { b, k, ksize };
}
// 8 位元（PIL 的 L、RGB）：係數換成 22 位元定點，橫的做完先取整到 0～255 再做直的
const PB = 22;
function fixK(c) {
  const q = new Int32Array(c.k.length);
  for (let i = 0; i < q.length; i++) { const v = c.k[i] * (1 << PB); q[i] = v < 0 ? Math.trunc(-0.5 + v) : Math.trunc(0.5 + v); }
  return q;
}
const clip8 = v => { v >>= PB; return v < 0 ? 0 : v > 255 ? 255 : v; };
// src：Uint8Array 一個通道（sw × sh）→ Uint8Array（dw × dh）
export function resize8(src, sw, sh, dw, dh) {
  let a = src, w = sw;
  const ch = coeffs(sw, dw), cv = coeffs(sh, dh);
  // 橫的只做直的會用到的那幾列
  const y0 = cv.b[0], y1 = cv.b[(dh - 1) * 2] + cv.b[(dh - 1) * 2 + 1], rows = y1 - y0;
  if (sw !== dw) {
    const q = fixK(ch), t = new Uint8Array(dw * rows);
    for (let y = 0; y < rows; y++) {
      const r = (y + y0) * sw;
      for (let xx = 0; xx < dw; xx++) {
        const x0 = ch.b[xx * 2], n = ch.b[xx * 2 + 1], kb = xx * ch.ksize;
        let s = 1 << (PB - 1);
        for (let x = 0; x < n; x++) s += a[r + x0 + x] * q[kb + x];
        t[y * dw + xx] = clip8(s);
      }
    }
    a = t; w = dw;
  } else a = src.subarray(y0 * sw, y1 * sw);
  if (sh === dh) return a.length === dw * dh ? a : a.slice(0, dw * dh);
  const q = fixK(cv), o = new Uint8Array(dw * dh);
  for (let yy = 0; yy < dh; yy++) {
    const ys = cv.b[yy * 2] - y0, n = cv.b[yy * 2 + 1], kb = yy * cv.ksize;
    for (let x = 0; x < w; x++) {
      let s = 1 << (PB - 1);
      for (let y = 0; y < n; y++) s += a[(ys + y) * w + x] * q[kb + y];
      o[yy * dw + x] = clip8(s);
    }
  }
  return o;
}
// 浮點（PIL 的 F）：累加用 double，結果存成 float32
export function resizeF(src, sw, sh, dw, dh) {
  const ch = coeffs(sw, dw), cv = coeffs(sh, dh), t = new Float32Array(dw * sh), o = new Float32Array(dw * dh);
  for (let y = 0; y < sh; y++) {
    const r = y * sw;
    for (let xx = 0; xx < dw; xx++) {
      const x0 = ch.b[xx * 2], n = ch.b[xx * 2 + 1], kb = xx * ch.ksize;
      let s = 0;
      for (let x = 0; x < n; x++) s += src[r + x0 + x] * ch.k[kb + x];
      t[y * dw + xx] = s;
    }
  }
  for (let yy = 0; yy < dh; yy++) {
    const y0 = cv.b[yy * 2], n = cv.b[yy * 2 + 1], kb = yy * cv.ksize;
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += t[(y0 + y) * dw + x] * cv.k[kb + y];
      o[yy * dw + x] = s;
    }
  }
  return o;
}

// 長邊 512 的大小（訓練時的 FULL）
export const fullSize = (W, H) => { const k = FULL / Math.max(W, H); return [Math.round(W * k), Math.round(H * k), k]; };

// 畫面（canvas、ImageBitmap）→ ImageData。照片很大時先一半一半縮（每次 2×2 平均），縮到長邊 2×512 以內，
// 最後一步再照 PIL 縮到 512：跟 PIL 直接從原圖縮的差不多，又不用讀整張千萬像素
function pixels(src, w, h) {
  const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
}
function photoAt(src, W, H, fw, fh) {
  let s = src, w = W, h = H;
  while (w > fw * 2 || h > fh * 2) {
    const nw = Math.max(fw, Math.ceil(w / 2)), nh = Math.max(fh, Math.ceil(h / 2)), c = mkCanvas(nw, nh), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high'; x.drawImage(s, 0, 0, nw, nh); s = c; w = nw; h = nh;
  }
  return { d: pixels(s, w, h), w, h };
}
const chan = (d, n, k) => { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = d[i * 4 + k]; return o; };
const q8 = a => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.round(Math.max(0, Math.min(1, a[i])) * 255); return o; };

// 模型的低解析度輸入（10 × 256 × 256）：RGB、皮膚、頭髮、人、臉遮罩 R、G、到臉中心的水平、垂直距離（臉寬為單位，±3 截掉再 ÷3）
//   a：{ img（照片：canvas 或 ImageBitmap，可以先縮小）, W, H（照片原尺寸）, seg: { w, h, skin, hair }, person（人像 canvas）, mask（美顏遮罩 canvas）, geom: { cx, cy, W } }
export function lowInput(a) {
  const [fw, fh, k] = fullSize(a.W, a.H), n = fw * fh, L = LOW * LOW, out = new Float32Array(10 * L);
  const put = (i, f8) => { const f = new Float32Array(n); for (let j = 0; j < n; j++) f[j] = f8[j] / 255; out.set(resizeF(f, fw, fh, LOW, LOW), i * L); };
  const p = photoAt(a.img, a.img.width, a.img.height, fw, fh);
  for (let c = 0; c < 3; c++) put(c, resize8(chan(p.d, p.w * p.h, c), p.w, p.h, fw, fh));
  const { w: sw, h: sh } = a.seg;
  put(3, resize8(q8(a.seg.skin), sw, sh, fw, fh));
  put(4, resize8(q8(a.seg.hair), sw, sh, fw, fh));
  const pw = a.person.width, ph = a.person.height;
  put(5, resize8(chan(pixels(a.person, pw, ph), pw * ph, 0), pw, ph, fw, fh));
  const mw = a.mask.width, mh = a.mask.height, md = pixels(a.mask, mw, mh);
  put(6, resize8(chan(md, mw * mh, 0), mw, mh, fw, fh));
  put(7, resize8(chan(md, mw * mh, 1), mw, mh, fw, fh));
  const g = a.geom, dx = new Float32Array(n), dy = new Float32Array(n), cl = v => Math.max(-3, Math.min(3, v)) / 3;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { dx[y * fw + x] = cl((x / k - g.cx) / g.W); dy[y * fw + x] = cl((y / k - g.cy) / g.W); }
  out.set(resizeF(dx, fw, fh, LOW, LOW), 8 * L); out.set(resizeF(dy, fw, fh, LOW, LOW), 9 * L);
  return out;
}

// ---------- 網路 ----------
// 3×3 卷積（補一圈 0），s 步長 1 或 2；x：C × H × W
function conv3(x, C, H, W, w, b, O, s) {
  const Ho = s === 2 ? H >> 1 : H, Wo = s === 2 ? W >> 1 : W, n = Ho * Wo, y = new Float32Array(O * n);
  for (let o = 0; o < O; o++) {
    const yo = y.subarray(o * n, o * n + n);
    if (b) yo.fill(b[o]);
    for (let c = 0; c < C; c++) {
      const xc = c * H * W;
      for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
        const kk = w[((o * C + c) * 3 + ky) * 3 + kx], ox0 = kx === 0 ? 1 : 0, ox1 = Math.min(Wo, Math.floor((W - kx) / s) + 1);
        for (let oy = 0; oy < Ho; oy++) {
          const iy = oy * s + ky - 1;
          if (iy < 0 || iy >= H) continue;
          const xi = xc + iy * W + kx - 1, yi = oy * Wo;
          if (s === 2) for (let ox = ox0; ox < ox1; ox++) yo[yi + ox] += kk * x[xi + 2 * ox];
          else for (let ox = ox0; ox < ox1; ox++) yo[yi + ox] += kk * x[xi + ox];
        }
      }
    }
  }
  return y;
}
const relu = a => { for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0; return a; };
const linear = (x, w, b, O) => { const I = x.length, y = new Float32Array(O); for (let o = 0; o < O; o++) { let s = b[o]; for (let i = 0; i < I; i++) s += w[o * I + i] * x[i]; y[o] = s; } return y; };

// 低解析度輸入 → 調色表，排成 gl.js 的 3D 貼圖：寬 32（x）、高 96（3 列 × 32，y）、深 8（引導值），每格 RGBA = 那一列的 A0 A1 A2 b
export function forward(W, low) {
  let a = relu(conv3(low, 10, 256, 256, W.d1, W.d1b, 16, 2));
  a = relu(conv3(a, 16, 128, 128, W.d2, W.d2b, 32, 2));
  a = relu(conv3(a, 32, 64, 64, W.d3, W.d3b, 64, 2));
  const l = conv3(relu(conv3(a, 64, 32, 32, W.l1, W.l1b, 64, 1)), 64, 32, 32, W.l2, null, 64, 1);
  const g8 = relu(conv3(relu(conv3(a, 64, 32, 32, W.g1, W.g1b, 64, 2)), 64, 16, 16, W.g2, W.g2b, 64, 2));
  const gm = new Float32Array(64);
  for (let c = 0; c < 64; c++) { let s = 0; for (let i = 0; i < 64; i++) s += g8[c * 64 + i]; gm[c] = s / 64; }
  const g = linear(relu(linear(gm, W.gf1, W.gf1b, 64)), W.gf2, W.gf2b, 64);
  const P = GS * GS;
  for (let c = 0; c < 64; c++) for (let i = 0; i < P; i++) { const v = l[c * P + i] + g[c]; l[c * P + i] = v > 0 ? v : 0; }
  const tex = new Float32Array(GS * GS * 3 * NB * 4);
  for (let kq = 0; kq < 96; kq++) {
    const z = Math.floor(kq / 12), r = (kq % 12) >> 2, ch = kq & 3, wo = W.out.subarray(kq * 64, kq * 64 + 64), bo = W.outb[kq];
    for (let i = 0; i < P; i++) {
      let s = bo;
      for (let c = 0; c < 64; c++) s += wo[c] * l[c * P + i];
      const gy = (i / GS) | 0, gx = i % GS;
      tex[(((z * 3 + r) * GS + gy) * GS + gx) * 4 + ch] = s;
    }
  }
  return tex;
}

// 引導值那層小網路的權重，排成 gl.js 的 uniform：uFG1[j] = (R, G, B, 皮膚)、uFG1[j+8] = (頭髮, 人, 臉遮罩 R, 常數)、uFG2 = 第二層 8 個 + 常數
export function guideUniforms(W) {
  const g1 = new Float32Array(64), g2 = new Float32Array(12);
  for (let j = 0; j < 8; j++) {
    for (let c = 0; c < 4; c++) g1[j * 4 + c] = W.gd1[j * 7 + c];
    for (let c = 0; c < 3; c++) g1[(j + 8) * 4 + c] = W.gd1[j * 7 + 4 + c];
    g1[(j + 8) * 4 + 3] = W.gd1b[j];
  }
  g2.set(W.gd2); g2[8] = W.gd2b[0];
  return { g1, g2 };
}

// 權重只下載、解開一次（第一次用到相機閃光燈才抓，374KB）
let netP = null;
export function loadNet() {
  netP ||= fetch(new URL('./flashcam.bin', import.meta.url)).then(r => { if (!r.ok) throw new Error('flashcam.bin ' + r.status); return r.arrayBuffer(); }).then(parseNet)
    .catch(e => { netP = null; throw e; });
  return netP;
}
// 一張照片的調色表和引導值網路的權重：{ grid, g }（lowInput 的 a）
export async function flashGrid(a) {
  const W = await loadNet();
  return { grid: forward(W, lowInput(a)), g: guideUniforms(W) };
}
