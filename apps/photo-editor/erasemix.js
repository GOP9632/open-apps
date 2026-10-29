// 消除的選區外擴、羽化、疊回（erase.js 用；iPhone、iPad 連補洞一起在背景執行緒做，評審 M51）。
// 以前這幾步在主執行緒用 canvas 畫：選區往 12 個方向平移各畫一次、模糊、疊回去，再整張照片換掉，
// 按「立即消除」畫面停 0.6 秒以上。這裡照同樣的畫法直接算陣列，結果跟以前一樣，不用等 GPU。
import { patchFill } from './patchfill.js';

// 選區往外擴 px：選區往 12 個方向各平移 px（雙線性）再疊上原位，透明度照 canvas「疊上去」算 1 − Π(1 − a)。
// a：w×h 的 alpha（0～255）。回傳 0～1
export function growAlpha(a, w, h, px) {
  const n = w * h, keep = new Float32Array(n).fill(1), f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = a[i] / 255;
  const add = (dx, dy) => {
    // 畫面上 (X, Y) 拿到的是原本 (X − dx, Y − dy) 那點（像素中心對齊），格子外面是透明
    const ix = Math.floor(-dx), iy = Math.floor(-dy), fx = -dx - ix, fy = -dy - iy;
    const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : f[y * w + x];
    for (let Y = 0; Y < h; Y++) {
      const y0 = Y + iy;
      if (y0 < -1 || y0 >= h) continue;
      for (let X = 0; X < w; X++) {
        const x0 = X + ix;
        if (x0 < -1 || x0 >= w) continue;
        const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
        if (v > 0) keep[Y * w + X] *= 1 - v;
      }
    }
  };
  for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; add(Math.cos(t) * px, Math.sin(t) * px); }
  for (let i = 0; i < n; i++) keep[i] = 1 - keep[i] * (1 - f[i]);
  return keep;
}

// 放大到 W×H（跟 canvas drawImage 一樣像素中心對齊、雙線性），c：每格幾個值
function resize(s, w, h, W, H, c) {
  if (w === W && h === H) return s;
  const o = new Float32Array(W * H * c), kx = w / W, ky = h / H;
  for (let Y = 0; Y < H; Y++) {
    const sy = Math.min(h - 1, Math.max(0, (Y + 0.5) * ky - 0.5)), y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let X = 0; X < W; X++) {
      const sx = Math.min(w - 1, Math.max(0, (X + 0.5) * kx - 0.5)), x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      for (let k = 0; k < c; k++) {
        const a = s[(y0 * w + x0) * c + k], b = s[(y0 * w + x1) * c + k], d = s[(y1 * w + x0) * c + k], e = s[(y1 * w + x1) * c + k];
        o[(Y * W + X) * c + k] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
    }
  }
  return o;
}

// 方框模糊三次 ≈ 標準差 sigma 的高斯（變異數 r(r+1) ≈ sigma²）；外面當透明
function blur(a, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 0.25) - 0.5)), t = new Float32Array(Math.max(w, h)), k = 1 / (2 * r + 1);
  const pass = (n, len, step, line) => {
    for (let l = 0; l < n; l++) {
      const o = line(l);
      for (let i = 0; i < len; i++) t[i] = a[o + i * step];
      let s = 0;
      for (let i = 0; i < Math.min(r, len); i++) s += t[i];
      for (let i = 0; i < len; i++) {
        if (i + r < len) s += t[i + r];
        a[o + i * step] = s * k;
        if (i - r >= 0) s -= t[i - r];
      }
    }
  };
  for (let p = 0; p < 3; p++) { pass(h, w, 1, y => y * w); pass(w, h, w, x => x); }
}

// 要疊回照片的那塊（cw×ch，RGBA，不預乘）：顏色是補好的圖放大回原尺寸，透明度是外擴的選區放大、疊 13 次、羽化
// （以前 canvas 把外擴好的選區在原位畫 13 次再模糊，邊緣才夠實）。fill：w×h RGBA；g：growAlpha 的結果
export function softPatch(fill, g, w, h, cw, ch, feather) {
  const A = Float32Array.from(resize(g, w, h, cw, ch, 1), v => 1 - (1 - v) ** 13);
  blur(A, cw, ch, feather);
  const F = resize(fill, w, h, cw, ch, 4), out = new Uint8ClampedArray(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    out[i * 4] = F[i * 4]; out[i * 4 + 1] = F[i * 4 + 1]; out[i * 4 + 2] = F[i * 4 + 2]; out[i * 4 + 3] = A[i] * 255;
  }
  return out;
}

// 選區外擴、找洞、方塊補洞、做成要疊回的那塊。a：{ d: 縮過的照片那塊 RGBA（w×h）, m: 選區 alpha（w×h）, w, h, cw, ch, px, feather }
export function fillErase(a) {
  const { w, h } = a, g = growAlpha(a.m, w, h, a.px), hole = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) hole[i] = g[i] * 255 > 10 ? 1 : 0;
  const f = patchFill(a.d, hole, w, h);
  for (let i = 0; i < w * h; i++) f[i * 4 + 3] = 255;
  return softPatch(f, g, w, h, a.cw, a.ch, a.feather);
}
