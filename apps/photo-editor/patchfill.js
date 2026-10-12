// 省記憶體的消除（iPhone、iPad 用）：多尺度 PatchMatch 補洞（Wexler 2007、Barnes 2009 的做法），
// 從洞的周圍找最像的小方塊拼進去，由粗到細一層層修。不用下載模型，只多用幾十 MB 記憶體。
// MI-GAN 在手機上要多 500MB 以上，Safari 超過上限會直接重新載入頁面。

const R = 3;                 // 方塊半徑：7×7
const COARSE = 40;           // 最粗那層的長邊至少這麼大，太小找不到夠多方塊

// rgba：w×h×4（Uint8ClampedArray）；hole：w×h，1 = 要補。回傳補好的 rgba（新陣列）
export function patchFill(rgba, hole, w, h) {
  // 金字塔：每層縮一半，洞只要底下有一格是洞就算洞
  const lv = [{ w, h, img: toF(rgba, w, h), hole: Uint8Array.from(hole) }];
  while (Math.max(lv[0].w, lv[0].h) >= COARSE * 2 && Math.min(lv[0].w, lv[0].h) >= 2 * (4 * R + 8)) {
    const n = down(lv[0]);
    if (!sourcesOf(n).count) break;    // 再縮就沒地方找方塊了
    lv.unshift(n);
  }
  let nnf = null;
  for (let l = 0; l < lv.length; l++) {
    const L = lv[l];
    L.valid = sourcesOf(L).valid;
    L.targets = targetsOf(L);
    if (!nnf) { diffuse(L); nnf = randomNNF(L); }
    else { nnf = upNNF(lv[l - 1], nnf, L); vote(L, nnf); }
    const last = l === lv.length - 1, em = l === 0 ? 16 : last ? 4 : 8;
    for (let i = 0; i < em; i++) { search(L, nnf, i); vote(L, nnf, last && i === em - 1 ? 0.25 : 0.75); }
  }
  const T = lv[lv.length - 1], out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < w * h; i++) if (hole[i]) { out[i * 4] = T.img[i * 3]; out[i * 4 + 1] = T.img[i * 3 + 1]; out[i * 4 + 2] = T.img[i * 3 + 2]; }
  return out;
}

function toF(rgba, w, h) {
  const f = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { f[i * 3] = rgba[i * 4]; f[i * 3 + 1] = rgba[i * 4 + 1]; f[i * 3 + 2] = rgba[i * 4 + 2]; }
  return f;
}

// 縮一半：只平均不是洞的格子
function down(L) {
  const w = L.w >> 1, h = L.h >> 1, img = new Float32Array(w * h * 3), hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, r = 0, g = 0, b = 0, any = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const j = (y * 2 + dy) * L.w + x * 2 + dx;
      if (L.hole[j]) { any = 1; continue; }
      r += L.img[j * 3]; g += L.img[j * 3 + 1]; b += L.img[j * 3 + 2]; n++;
    }
    const i = y * w + x;
    hole[i] = any;
    if (n) { img[i * 3] = r / n; img[i * 3 + 1] = g / n; img[i * 3 + 2] = b / n; }
  }
  return { w, h, img, hole };
}

// 可以拿來用的方塊中心：整個方塊在照片內、而且完全不碰洞
function sourcesOf(L) {
  const { w, h, hole } = L, near = dilate(hole, w, h, R), valid = new Uint8Array(w * h);
  let count = 0;
  for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) { const i = y * w + x; if (!near[i]) { valid[i] = 1; count++; } }
  return { valid, count };
}
// 要找對應方塊的格子：方塊碰到洞的
function targetsOf(L) {
  const near = dilate(L.hole, L.w, L.h, R), t = [];
  for (let i = 0; i < near.length; i++) if (near[i]) t.push(i);
  return Int32Array.from(t);
}
function dilate(m, w, h, r) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) a[y * w + x] = 1; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) a[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (a[y * w + x]) last = y; if (y - last <= r) b[y * w + x] = 1; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (a[y * w + x]) last = y; if (last - y <= r) b[y * w + x] = 1; }
  }
  return b;
}

// 最粗那層先用周圍顏色一圈圈往內填
function diffuse(L) {
  const { w, h, img } = L, todo = Uint8Array.from(L.hole);
  let left = todo.reduce((s, v) => s + v, 0);
  while (left > 0) {
    const fill = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!todo[i]) continue;
      let n = 0, r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (todo[j]) continue;
        r += img[j * 3]; g += img[j * 3 + 1]; b += img[j * 3 + 2]; n++;
      }
      if (n) fill.push(i, r / n, g / n, b / n);
    }
    if (!fill.length) break;
    for (let k = 0; k < fill.length; k += 4) { const i = fill[k]; img[i * 3] = fill[k + 1]; img[i * 3 + 1] = fill[k + 2]; img[i * 3 + 2] = fill[k + 3]; todo[i] = 0; left--; }
  }
}

// 隨機數（固定種子，同一張照片結果一樣）
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function randomValid(L) {
  const { w, h, valid } = L;
  for (let k = 0; k < 200; k++) { const i = ((R + rnd() * (h - 2 * R)) | 0) * w + ((R + rnd() * (w - 2 * R)) | 0); if (valid[i]) return i; }
  for (let i = 0; i < valid.length; i++) if (valid[i]) return i;
  return -1;
}
function randomNNF(L) {
  seed = 1;
  const nnf = new Int32Array(L.w * L.h).fill(-1);
  for (const p of L.targets) nnf[p] = randomValid(L);
  return nnf;
}
// 上一層的對應放大兩倍
function upNNF(C, cn, L) {
  const nnf = new Int32Array(L.w * L.h).fill(-1);
  for (const p of L.targets) {
    const x = p % L.w, y = (p / L.w) | 0, cx = Math.min(C.w - 1, x >> 1), cy = Math.min(C.h - 1, y >> 1), s = cn[cy * C.w + cx];
    let q = -1;
    if (s >= 0) {
      const sx = (s % C.w) * 2 + (x & 1), sy = ((s / C.w) | 0) * 2 + (y & 1);
      if (sx < L.w && sy < L.h && L.valid[sy * L.w + sx]) q = sy * L.w + sx;
    }
    nnf[p] = q >= 0 ? q : randomValid(L);
  }
  return nnf;
}

// 方塊差異（平方和），超過 best 就提早停
function dist(L, p, s, best) {
  const { w, h, img } = L, px = p % w, py = (p / w) | 0, sx = s % w, sy = (s / w) | 0;
  let d = 0, n = 0;
  for (let dy = -R; dy <= R; dy++) {
    const Y = py + dy; if (Y < 0 || Y >= h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const X = px + dx; if (X < 0 || X >= w) continue;
      const a = (Y * w + X) * 3, b = ((sy + dy) * w + sx + dx) * 3;
      const r = img[a] - img[b], g = img[a + 1] - img[b + 1], bl = img[a + 2] - img[b + 2];
      d += r * r + g * g + bl * bl; n++;
    }
    if (d > best) return Infinity;   // 正規化後只會更大
  }
  return d * 49 / n;
}

function search(L, nnf, it) {
  const { w, h, valid, targets } = L, D = L.D ||= new Float32Array(w * h);
  for (const p of targets) D[p] = dist(L, p, nnf[p], Infinity);
  const n = targets.length, rev = it & 1;
  for (let k = 0; k < n; k++) {
    const p = targets[rev ? n - 1 - k : k], x = p % w, y = (p / w) | 0, st = rev ? -1 : 1;
    let best = nnf[p], bd = D[p];
    const tryS = s => { if (s < 0 || !valid[s] || s === best) return; const d = dist(L, p, s, bd); if (d < bd) { bd = d; best = s; } };
    // 鄰居的對應往這邊挪一格
    if (x - st >= 0 && x - st < w) { const q = nnf[p - st]; if (q >= 0) { const qx = q % w + st; if (qx >= 0 && qx < w) tryS(q + st); } }
    if (y - st >= 0 && y - st < h) { const q = nnf[p - st * w]; if (q >= 0) { const qy = ((q / w) | 0) + st; if (qy >= 0 && qy < h) tryS(q + st * w); } }
    // 在目前對應附近隨機找，範圍一次縮一半
    const bx = best % w, by = (best / w) | 0;
    for (let rad = Math.max(w, h); rad >= 1; rad >>= 1) {
      const X = Math.round(bx + (rnd() * 2 - 1) * rad), Y = Math.round(by + (rnd() * 2 - 1) * rad);
      if (X >= R && Y >= R && X < w - R && Y < h - R) tryS(Y * w + X);
    }
    tryS(randomValid(L));
    nnf[p] = best; D[p] = bd;
  }
}

// 每個洞裡的格子＝蓋到它的方塊對應顏色的加權平均（越像的權重越大）
function vote(L, nnf, pct = 0.75) {
  const { w, h, img, hole, targets } = L;
  const D = L.D;
  let s2 = 0;
  if (D) { const ds = Array.from(targets, p => D[p]).filter(Number.isFinite).sort((a, b) => a - b); s2 = ds[(ds.length * pct) | 0] || 1; }
  const acc = new Float32Array(w * h * 3), ws = new Float32Array(w * h);
  for (const p of targets) {
    const s = nnf[p]; if (s < 0) continue;
    const wt = D && s2 ? Math.exp(-D[p] / (2 * s2)) + 1e-4 : 1;
    const px = p % w, py = (p / w) | 0, sx = s % w, sy = (s / w) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const Y = py + dy; if (Y < 0 || Y >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const X = px + dx; if (X < 0 || X >= w) continue;
        const q = Y * w + X; if (!hole[q]) continue;
        const b = ((sy + dy) * w + sx + dx) * 3;
        acc[q * 3] += wt * img[b]; acc[q * 3 + 1] += wt * img[b + 1]; acc[q * 3 + 2] += wt * img[b + 2]; ws[q] += wt;
      }
    }
  }
  for (let q = 0; q < w * h; q++) if (hole[q] && ws[q] > 0) { img[q * 3] = acc[q * 3] / ws[q]; img[q * 3 + 1] = acc[q * 3 + 1] / ws[q]; img[q * 3 + 2] = acc[q * 3 + 2] / ws[q]; }
}
