// 遮罩工具：主執行緒、背景執行緒（prepwork.js）都能用

// 畫布：背景執行緒沒有 document，用 OffscreenCanvas
export const mkCanvas = (w, h) => {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

// 方框模糊（先橫後直，做 n 次），結果寫回 a。邊緣用最邊上的值補。
// 皮膚、頭髮、打光的遮罩都用這個（評審 M7、M8：開照片、第一次開膚質、頭髮時主執行緒卡 0.5～1 秒，大半在模糊）。
// 跟以前各檔案自己寫的那份算法、加減順序都一樣（累加用 double），結果一模一樣；快在兩個地方：
//   - 直的那次改成整排一起往下走（每欄的累加存在一排陣列裡）。以前一欄一欄往下讀，每讀一個跳過一整排，快取一直沒中
//   - 邊緣才夾範圍，中間不用每個像素 Math.min、Math.max
// mul：乘倒數（打光那份這樣寫），不然用除的
export function boxBlur(a, w, h, r, n = 2, mul = false) {
  if (r < 1) return a;
  const b = new Float32Array(w * h), d = 2 * r + 1, k = 1 / d, s = new Float64Array(w), W1 = w - 1, H1 = h - 1;
  for (let pass = 0; pass < n; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let t = 0;
      for (let x = -r; x <= r; x++) t += a[o + (x < 0 ? 0 : x > W1 ? W1 : x)];
      // 左邊緣、中間、右邊緣分開，中間那段不用夾
      const x1 = Math.min(w, r), x2 = Math.max(x1, w - r - 1);
      let x = 0;
      for (; x < x1; x++) { b[o + x] = mul ? t * k : t / d; const xa = x + r + 1; t += a[o + (xa > W1 ? W1 : xa)] - a[o]; }
      if (mul) for (; x < x2; x++) { b[o + x] = t * k; t += a[o + x + r + 1] - a[o + x - r]; }
      else for (; x < x2; x++) { b[o + x] = t / d; t += a[o + x + r + 1] - a[o + x - r]; }
      for (; x < w; x++) { b[o + x] = mul ? t * k : t / d; const xs = x - r; t += a[o + W1] - a[o + (xs < 0 ? 0 : xs)]; }
    }
    s.fill(0);
    for (let y = -r; y <= r; y++) { const o = (y < 0 ? 0 : y > H1 ? H1 : y) * w; for (let x = 0; x < w; x++) s[x] += b[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, ya = y + r + 1, ys = y - r, oa = (ya > H1 ? H1 : ya) * w, os = (ys < 0 ? 0 : ys) * w;
      if (mul) for (let x = 0; x < w; x++) { a[o + x] = s[x] * k; s[x] += b[oa + x] - b[os + x]; }
      else for (let x = 0; x < w; x++) { a[o + x] = s[x] / d; s[x] += b[oa + x] - b[os + x]; }
    }
  }
  return a;
}
