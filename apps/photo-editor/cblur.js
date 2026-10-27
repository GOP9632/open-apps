// 畫布模糊：ctx.filter 在 iPhone 的 Safari 不一定支援（不支援時設了也沒作用），
// 不支援就先縮小、用程式做方框模糊、再放大回來，結果跟 blur(px) 差不多。

let OK;
export function filterOk() {
  if (OK === undefined) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.filter = 'blur(2px)'; OK = ctx.filter === 'blur(2px)';
  }
  return OK;
}
export function forceNoFilter(v = true) { OK = !v; } // 測試用：模擬不支援 ctx.filter

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });

// 回傳模糊過的新畫布（同尺寸）；px 跟 CSS blur() 一樣是高斯的標準差
export function blurred(src, px) {
  const W = src.width, H = src.height, out = newCanvas(W, H), o = out.getContext('2d');
  if (!(px > 0.4)) { o.drawImage(src, 0, 0); return out; }
  if (filterOk()) { o.filter = `blur(${px}px)`; o.drawImage(src, 0, 0); return out; }
  // 縮到標準差約 3 格，三次方框模糊（變異數 r(r+1) ≈ 標準差²）
  const s = Math.min(1, 3 / px), sw = Math.max(1, Math.round(W * s)), sh = Math.max(1, Math.round(H * s));
  const sigma = px * (sw / W), r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 0.25) - 0.5));
  const pad = r * 3, t = newCanvas(sw + pad * 2, sh + pad * 2), tc = t.getContext('2d', { willReadFrequently: true });
  tc.drawImage(src, pad, pad, sw, sh);
  const img = tc.getImageData(0, 0, t.width, t.height);
  boxRGBA(img.data, t.width, t.height, r);
  tc.putImageData(img, 0, 0);
  o.imageSmoothingQuality = 'high';
  o.drawImage(t, pad, pad, sw, sh, 0, 0, W, H);
  return out;
}

// RGBA 先乘 alpha 再模糊，透明邊緣才不會變黑
function boxRGBA(d, w, h, r) {
  const n = w * h, ch = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; ch[0][i] = d[i * 4] * a; ch[1][i] = d[i * 4 + 1] * a; ch[2][i] = d[i * 4 + 2] * a; ch[3][i] = d[i * 4 + 3]; }
  for (const a of ch) boxBlur(a, w, h, r);
  for (let i = 0; i < n; i++) {
    const al = ch[3][i], k = al > 0.01 ? 255 / al : 0;
    d[i * 4] = ch[0][i] * k; d[i * 4 + 1] = ch[1][i] * k; d[i * 4 + 2] = ch[2][i] * k; d[i * 4 + 3] = al;
  }
}

// 單通道三次方框模糊（就地），邊緣用最邊上的值。
// 橫向一列一列滑動加總；直向整列一起加（記憶體連續，比一行一行往下跳快一倍）
export function boxBlur(a, w, h, r, passes = 3) {
  r = Math.round(r);
  if (r < 1) return a;
  const inv = 1 / (2 * r + 1), row = new Float32Array(w), s = new Float32Array(w);
  const src = a, dst = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w, L = src[o], Rv = src[o + w - 1];
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += x < 0 ? L : x >= w ? Rv : src[o + x];
      for (let x = 0; x < w; x++) {
        row[x] = acc * inv;
        const ai = x + r + 1, si = x - r;
        acc += (ai < w ? src[o + ai] : Rv) - (si >= 0 ? src[o + si] : L);
      }
      dst.set(row, o);
    }
    s.fill(0);
    for (let y = -r; y <= r; y++) { const o = Math.min(h - 1, Math.max(0, y)) * w; for (let x = 0; x < w; x++) s[x] += dst[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, ao = Math.min(h - 1, y + r + 1) * w, so = Math.max(0, y - r) * w;
      for (let x = 0; x < w; x++) { src[o + x] = s[x] * inv; s[x] += dst[ao + x] - dst[so + x]; }
    }
  }
  return a;
}
