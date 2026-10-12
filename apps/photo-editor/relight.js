// 打光、閃光燈用的立體深度圖
//   身體：人像遮罩模糊後開根號，輪廓邊緣往後彎，中間比較高（像圓柱）
//   臉：臉部特徵點的 z（MediaPipe 給的，越靠近鏡頭越小）連成三角網格，
//       鼻子、眉骨、顴骨、眼窩都有真的高低；頭髮、頭頂用一顆橢球補
//   輸出一張小圖：R 是模糊過的人像遮罩（原本 segB 的用途不變），G、B 是 16 位元的高度
const LONG = 512;

// Bowyer-Watson 三角化，臉部 468 個點只要幾毫秒
function delaunay(P) {
  const n = P.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of P) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const pts = P.concat([[mx - d, my - d], [mx, my + d], [mx + d, my - d]]);
  const circ = (a, b, c) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-9;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i], bad = [], keep = [];
    for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const k = u < v ? u + ',' + v : v + ',' + u;
      edges.set(k, edges.has(k) ? null : [u, v]);
    }
    for (const e of edges.values()) if (e) keep.push(circ(e[0], e[1], i));
    tris = keep;
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
}

// 三次方框模糊，近似高斯
function blur(a, w, h, r) {
  if (r < 1) return a;
  const b = new Float32Array(w * h), s = 1 / (2 * r + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc * s;
        acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * s;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// segB：模糊過的人像遮罩 canvas；person：人像遮罩 canvas；faces：每張臉 478 個點（有 z）
// 回傳 { canvas, max }，max 是高度的最大值（深度圖像素）
export function buildDepth(segB, person, faces, W, H) {
  const k = Math.min(1, LONG / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const read = src => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (src) ctx.drawImage(src, 0, 0, w, h); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    const d = ctx.getImageData(0, 0, w, h).data, a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4] / 255;
    return a;
  };
  const m = read(person), mB = read(segB);
  const fw = faces.length ? Math.max(...faces.map(p => Math.hypot(p[454].x - p[234].x, p[454].y - p[234].y))) * k : 0;

  // 身體：輪廓邊緣往後彎的圓弧，彎的範圍大約是半個肩寬
  const R = Math.max(3, Math.round(fw ? fw * 0.7 : Math.max(w, h) * 0.07));
  const A = fw ? fw * 0.75 : Math.max(w, h) * 0.12;
  const d = blur(Float32Array.from(m), w, h, R);
  const soft = blur(Float32Array.from(m), w, h, Math.max(1, Math.round(R / 5)));
  const Hm = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) Hm[i] = A * Math.sqrt(Math.max(0, Math.min(1, d[i] * 1.6))) * soft[i];

  for (const pts of faces) {
    if (pts[1].z === undefined) continue;
    const P = pts.slice(0, 468).map(p => [p.x * k, p.y * k, p.z * k]);
    const faceW = Math.hypot(P[454][0] - P[234][0], P[454][1] - P[234][1]);
    // 臉的底：耳朵前面那一圈的 z，往前突出多少就加多少
    const zBack = Math.max(P[234][2], P[454][2], P[152][2], P[10][2]);
    const ci = Math.round(P[1][1]) * w + Math.round(P[1][0]);
    const base = Hm[Math.max(0, Math.min(w * h - 1, ci))] * 0.85;
    const Hf = new Float32Array(w * h), Wf = new Float32Array(w * h);
    for (const [a, b, c] of delaunay(P)) {
      const [ax, ay, az] = P[a], [bx, by, bz] = P[b], [cx, cy, cz] = P[c];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-6) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) continue;
        const z = l1 * az + l2 * bz + l3 * cz, v = base + (zBack - z), i = y * w + x;
        if (!Wf[i] || v > Hf[i]) { Hf[i] = v; Wf[i] = 1; }
      }
    }
    // 頭：一顆跟著頭傾斜的橢球補頭髮、頭頂；網格範圍內用網格。
    // 網格邊緣跟橢球的高度差，往外慢慢接回橢球，所以臉和頭髮接得順，不會有一圈台階
    const top = P[10], chin = P[152], up = [top[0] - chin[0], top[1] - chin[1]], ul = Math.hypot(...up) || 1;
    const hx = (top[0] + chin[0]) / 2 + up[0] * 0.12, hy = (top[1] + chin[1]) / 2 + up[1] * 0.12;
    const rx = faceW * 0.62, ry = ul * 0.78, ca = up[1] / ul, sa = -up[0] / ul;
    const D = (zBack - (P[50][2] + P[280][2]) / 2) * 1.05;
    const E = new Float32Array(w * h), inHead = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      const dx = x - hx, dy = y - hy, lx = (dx * ca + dy * sa) / rx, ly = (-dx * sa + dy * ca) / ry, rr = lx * lx + ly * ly;
      if (rr >= 1) { E[i] = Hm[i]; continue; }
      // 頭裡面的頭髮不能比臉還高（不然會在額頭投影子），所以這裡是取代、不是取大的
      const e = base + D * Math.sqrt(1 - rr), t = Math.min(1, (1 - rr) / 0.35);
      E[i] = Hm[i] + (e - Hm[i]) * t * t * (3 - 2 * t) * Math.max(m[i], Wf[i]);
      inHead[i] = 1;
    }
    const edge = blur(Float32Array.from(Wf), w, h, 1), eW = new Float32Array(w * h), eD = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (Wf[i] && edge[i] < 0.95) { eW[i] = 1; eD[i] = Hf[i] - E[i]; }
    const r = Math.max(2, Math.round(faceW * 0.1));
    const bW = blur(Float32Array.from(eW), w, h, r), bD = blur(eD, w, h, r);
    let peak = 0, pn = 0;
    for (let i = 0; i < w * h; i++) if (eW[i]) { peak += bW[i]; pn++; }
    peak = Math.max(1e-4, peak / Math.max(1, pn));
    for (let i = 0; i < w * h; i++) {
      let v;
      if (Wf[i]) v = Hf[i];
      else { const t = Math.min(1, bW[i] / peak); v = E[i] + (bW[i] > 1e-4 ? bD[i] / bW[i] : 0) * t * t * m[i]; }
      Hm[i] = inHead[i] || Wf[i] ? v : Math.max(Hm[i], v);
    }
  }
  blur(Hm, w, h, Math.max(1, Math.round(Math.max(w, h) / 300)));

  let max = 1e-3;
  for (let i = 0; i < w * h; i++) max = Math.max(max, Hm[i]);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), o = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(Math.max(0, Hm[i]) / max * 65535);
    o[i * 4] = Math.round(mB[i] * 255); o[i * 4 + 1] = v >> 8; o[i * 4 + 2] = v & 255; o[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, max, w, h };
}

// ---------- 打光、閃光燈的種類 ----------
// 照 Hypic（醒圖國際版）打光面板的 13 個樣式：自然光 5、單色光 4、多色 4。數字是 Hypic 樣式設定裡的值，算法自己寫
//   l：每顆燈 [x, y, z, R, G, B, 強度, 高光, 光澤硬度]
//      x、y 是照片上的位置（0~1，左上是 0）；z 0~1，越大離鏡頭越近、越在人的正前方
//   mode：1 臉部柔光（光包住整張臉）、2~3 柔和的方向光、4 方向光加高光、6、9 多顆彩色光
//   fg、bg：人和背景先壓暗到多少（Hypic 的 fgDarkLow、bgDarkLow）
//   blur：光和影子的柔和度（blurSize）；apart：背景離人多遠，越小背景越容易被染色
//   seg：顏色滑桿沿著走的色相段 [色相, 飽和, 明度 → 色相, 飽和, 明度, 權重]，cdef 是預設位置
//   lum、spec：有沒有亮度、高光滑桿（spec 是高光預設值）；n：用幾顆燈；pick：隨機挑色的多色樣式
const NOT_USE = [[0, 7], [1, 4], [1, 5], [1, 8], [2, 4], [2, 9], [2, 10], [3, 7], [3, 10], [4, 8], [4, 9], [5, 8], [6, 7], [7, 10], [8, 9], [9, 10], [0, 1], [0, 3], [0, 6], [0, 10], [1, 6], [1, 9], [2, 3], [2, 7], [3, 6], [4, 5], [5, 6], [6, 10]];
const PAL = [[255, 0, 0, 8], [0, 255, 0, 9], [0, 0, 255, 13], [255, 0, 255, 8], [0, 255, 255, 11], [255, 255, 0, 10], [255, 120, 0, 10], [255, 0, 120, 8], [0, 255, 150, 9], [0, 120, 255, 13], [120, 0, 255, 13]];
export const LIGHT_CATS = [
  { id: 'nat', name: '自然光', items: [
    { id: 'soft', name: '臉部柔光', mode: 1, fg: 1, bg: 1, blur: 1, apart: 5, lum: 1, seg: [[0, 0.118, 1, 360, 0.118, 1, 1]], cdef: 0.889, l: [[1, 1, 1, 255, 225, 245, 5, 0, 200]] },
    { id: 'warm', name: '氣氛暖光', mode: 3, fg: 0.95, bg: 0.95, blur: 1, apart: 5, lum: 1, seg: [[0, 0.8, 1, 46.8, 0.8, 1, 1]], cdef: 0.798, l: [[0.5, 0.5, 0.7, 255, 178, 51, 8, 0, 200]] },
    { id: 'dawn', name: '清晨陽光', mode: 2, fg: 0.95, bg: 0.95, blur: 1, apart: 5, lum: 1,
      seg: [[0, 0.255, 1, 36, 0.255, 1, 45], [36, 0.255, 1, 106.2, 0, 1, 5], [106.2, 0, 1, 176.4, 0.255, 1, 5], [176.4, 0.255, 1, 242.1, 0.255, 1, 45]], cdef: 0.764, l: [[0.2, 0.2, 0.6, 190, 225, 255, 7, 0, 200]] },
    { id: 'sunset', name: '夕陽餘輝', mode: 4, dapple: 1, fg: 0.8, bg: 0.8, blur: 7, apart: 0.55, lum: 1, spec: 35, seg: [[7.2, 1, 1, 36, 1, 1, 1]], cdef: 0.5, l: [[0.8, 0.2, 0.5, 255, 92, 0, 6, 7, 36]] },
    { id: 'shards', name: '陽光碎片', mode: 4, fg: 1, bg: 1, blur: 13, apart: 5, spec: 35, dapple: 1,
      seg: [[0, 0.255, 1, 36, 0.255, 1, 45], [36, 0.255, 1, 111.6, 0.255, 1, 5], [111.6, 0.255, 1, 187.2, 0.255, 1, 5], [187.2, 0.255, 1, 206, 0.255, 1, 45]], cdef: 0.55, l: [[1, 0.25, 0.5, 255, 255, 255, 1, 7, 36]] },
  ] },
  { id: 'mono', name: '單色光', items: [
    { id: 'pink', name: '暗夜粉', mode: 4, fg: 0.85, bg: 0.85, blur: 1, apart: 5, lum: 1, seg: [[288, 1, 1, 324, 1, 1, 1]], cdef: 0.693, l: [[0.1, 0.5, 0.6, 255, 0, 200, 7, 1, 200]] },
    { id: 'purple', name: '驚艷紫', mode: 4, fg: 0.85, bg: 0.85, blur: 1, apart: 5, lum: 1, seg: [[226.8, 1, 1, 270, 1, 1, 1]], cdef: 0.393, l: [[0.1, 0.5, 0.6, 16, 0, 255, 13, 1, 200]] },
    { id: 'metal', name: '金屬藍', mode: 4, fg: 0.7, bg: 0.7, blur: 1, apart: 0.55, lum: 1, spec: 50, seg: [[198, 1, 1, 248.4, 1, 1, 1]], cdef: 0.571, l: [[0.8, 0.2, 0.5, 0, 57, 255, 6, 10, 36]] },
    { id: 'red', name: '神秘紅', mode: 4, fg: 0.85, bg: 0.85, blur: 1, apart: 5, lum: 1, seg: [[-43.2, 0.608, 1, 18, 0.608, 1, 1]], cdef: 0.706, l: [[0.1, 0.5, 0.6, 255, 100, 100, 8, 0, 200]] },
  ] },
  { id: 'multi', name: '多色', items: [
    { id: 'rainbow', name: '彩虹光點', mode: 6, fg: 0.6, bg: 0.6, blur: 3, apart: 5, lum: 1, flat: 1, n: 6, pick: 4,
      l: [[0.2, 0.2, 0.7, 200, 230, 255, 7, 1, 200], [0.8, 0.3, 0.7, 200, 230, 255, 7, 1, 200]] },
    { id: 'duo', name: '雙色寶盒', mode: 9, fg: 0.8, bg: 0.8, blur: 3, apart: 0.4, lum: 1, n: 2, pick: 2,
      l: [[0.2, 0.8, 0.6, 255, 0, 0, 8, 0, 200], [0.8, 0.2, 0.6, 0, 255, 0, 9, 0, 200]] },
    { id: 'pinkpurple', name: '粉紫', mode: 4, fg: 0.8, bg: 0.8, blur: 5, apart: 0.4, lum: 1,
      l: [[0.1, 0.9, 0.55, 0, 0, 255, 15, 1, 200], [0.9, 0.1, 0.55, 255, 0, 155, 10, 1, 200]] },
    { id: 'orangecyan', name: '橘青', mode: 4, fg: 0.8, bg: 0.8, blur: 5, apart: 0.4, lum: 1,
      l: [[0.1, 0.9, 0.55, 0, 200, 255, 13, 1, 200], [0.9, 0.1, 0.55, 255, 77, 0, 10, 1, 200]] },
  ] },
];
export const LIGHTS = LIGHT_CATS.flatMap(c => c.items.map(it => ({ ...it, cat: c.id })));

// HSV（色相 0~360）→ RGB 0~1
const hsv = (h, s, v) => {
  h = ((h % 360) + 360) % 360 / 60;
  const f = k => { const t = (k + h) % 6; return v - v * s * Math.max(0, Math.min(t, 4 - t, 1)); };
  return [f(5), f(3), f(1)];
};
// 顏色滑桿：位置 0~1 沿色相段走（每段照權重分長度），輸出光的顏色
export function lightColor(L, t) {
  if (!L.seg) return null;
  const tot = L.seg.reduce((a, g) => a + g[6], 0);
  let acc = 0;
  for (const g of L.seg) {
    const w = g[6] / tot;
    if (t <= acc + w || g === L.seg[L.seg.length - 1]) {
      const u = Math.max(0, Math.min(1, (t - acc) / w));
      return hsv(g[0] + (g[3] - g[0]) * u, g[1] + (g[4] - g[1]) * u, g[2] + (g[5] - g[2]) * u);
    }
    acc += w;
  }
}
// 顏色滑桿的漸層（給介面畫軌道用）
export function lightGrad(L) {
  if (!L.seg) return '';
  const st = [];
  for (let i = 0; i <= 24; i++) st.push(`rgb(${lightColor(L, i / 24).map(c => Math.round(c * 255)).join(',')}) ${(i / 24 * 100).toFixed(1)}%`);
  return `linear-gradient(90deg,${st.join(',')})`;
}
// 多色樣式「換一組」：照 seed 挑顏色，Hypic 不會一起出現的顏色組合（notUse）不挑；位置也隨機
function pickLights(L, seed) {
  if (!L.pick || !seed) return L.l;
  let r = seed * 9301 + 49297;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const bad = new Set(NOT_USE.map(([a, b]) => a + ',' + b));
  const ok = (a, b) => !bad.has(Math.min(a, b) + ',' + Math.max(a, b));
  const got = [];
  for (let tries = 0; got.length < L.pick && tries < 200; tries++) {
    const k = Math.floor(rnd() * PAL.length);
    if (!got.includes(k) && got.every(g => ok(g, k))) got.push(k);
  }
  if (L.id === 'duo') {
    // 兩盞燈還是一左下一右上，只是換顏色（偶數 seed 左右對調）
    const pos = seed % 2 ? [[0.2, 0.8], [0.8, 0.2]] : [[0.8, 0.8], [0.2, 0.2]];
    return got.map((k, i) => [...pos[i], 0.6, ...PAL[k], 0, 200]);
  }
  // 彩虹光點：前兩顆白藍光固定，其他彩色光點散在照片上
  return [...L.l, ...got.map(k => [0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.5, ...PAL[k], 1, 200])];
}
export function lightList(L, seed) {
  if (!L.pick) return L.l;
  if (seed) return pickLights(L, seed);
  // 預設那組：彩虹光點 2 顆白藍光 + 紫、綠、藍、青 4 個光點（對照 Hypic 成品挑的），光點放在人旁邊的背景上
  if (L.id === 'rainbow') return [...L.l, ...[[0.1, 0.3], [0.9, 0.12], [0.06, 0.75], [0.94, 0.7]].map(([x, y], i) => [x, y, 0.5, ...PAL[[10, 1, 2, 4][i]], 1, 200])];
  // 雙色寶盒：Hypic 每次隨機挑兩色，預設用它成品裡出現的玫瑰紅、紫
  if (L.id === 'duo') return [[0.2, 0.8, 0.6, ...PAL[7], 0, 200], [0.8, 0.2, 0.6, ...PAL[10], 0, 200]];
  return L.l;
}

// 閃光燈：燈在鏡頭上面一點，離人大約 6 個臉寬；背景在人後面 3.5 個臉寬，所以暗很多，影子投在背景上
export const FLASHES = [
  { id: 'direct', name: '直閃', I: 1.05, ambS: 0.4, ambB: 0.3, spec: 0.7, soft: 0.5, wrap: 0, retro: 0 },
  { id: 'softf', name: '柔閃', I: 0.7, ambS: 0.6, ambB: 0.5, spec: 0.25, soft: 5, wrap: 0.4, retro: 0 },
  { id: 'ccd', name: 'CCD', I: 1.2, ambS: 0.35, ambB: 0.22, spec: 0.8, soft: 0.5, wrap: 0, retro: 1 },
];

// 臉的中心（照片 0~1）、臉寬（深度圖像素）
export function lightAnchor(base, geo) {
  const W = base.canvas.width, H = base.canvas.height, gs = base.geoms || [];
  const k = geo ? geo.w / W : 1;
  if (gs.length) {
    // 好幾張臉：以所有臉的中間為準，單位放大到涵蓋大家，燈才不會只照到一個人
    const xs = gs.map(g => g.cx), ys = gs.map(g => g.cy);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const F = Math.max(Math.max(...gs.map(g => g.W)), span * 0.5);
    return { x: xs.reduce((a, b) => a + b) / xs.length / W, y: ys.reduce((a, b) => a + b) / ys.length / H, F: F * k, Fpx: F };
  }
  return { x: 0.5, y: 0.38, F: Math.max(W, H) * 0.16 * k, Fpx: Math.max(W, H) * 0.16 };
}

// Hypic 的 x、y 是自拍畫面上的位置，臉大概在正中間。這裡換成以臉為中心、約 5 個臉寬的框，
// 全身照、臉不在中間的照片，燈才會照在人身上
const SPAN = 5;
const toPhoto = (A, base, x, y) => ({ x: A.x + (x - 0.5) * SPAN * A.Fpx / base.canvas.width, y: A.y + (y - 0.5) * SPAN * A.Fpx / base.canvas.height });
// 第一盞燈在照片上的預設位置（0~1）；臉部柔光的燈在臉的正前方稍微上面
export function lightHome(L, base, seed) {
  const r = lightList(L, seed)[0], A = lightAnchor(base, null);
  return L.mode === 1 ? { x: A.x, y: A.y - 0.5 * A.Fpx / base.canvas.height } : toPhoto(A, base, r[0], r[1]);
}
export function lightPosOf(L, P, base) {
  const h = lightHome(L, base, P.lightSeed || 0);
  return { x: P.lightX ?? h.x, y: P.lightY ?? h.y };
}

// 參數 → gl.js 要的 fx.lit、fx.flash
export function litParams(P, base, geo) {
  const L = LIGHTS.find(x => x.id === P.light), Fl = FLASHES.find(x => x.id === P.flash);
  if (!L && !Fl) return {};
  const A = lightAnchor(base, geo), W = base.canvas.width, H = base.canvas.height;
  const gw = geo?.w || W, gh = geo?.h || H, hFace = geo ? geo.max * 0.8 : 0;
  const lights = [];
  let ambS = 1, ambB = 1, bgDepth = 0;
  // x、y：照片 0~1；z：深度圖像素
  const put = (x, y, zz, col, I, par, ext, ref) => {
    ref = ref || Math.hypot((x - A.x) * gw, (y - A.y) * gh, zz - hFace);
    lights.push({ pos: [x, y, zz, ref], col: col.map(c => c * I), par, ext: ext || [36, 1, 0, 0] });
  };
  if (L) {
    const k = (P.lightAmt ?? 100) / 100, seed = P.lightSeed || 0;
    // 子滑桿照 Hypic：亮度、距離 0~100 預設 50；高光預設照樣式（35 或 50）；柔焦、前景暗、背景暗預設 0
    const lum = L.lum ? (P.lightBri ?? 50) / 50 : 1;
    const s = 0.5 + (P.lightDist ?? 50) / 100;
    const sp = L.spec ? (P.lightSpec ?? L.spec) / L.spec : 1;
    const bl = 1 + (P.lightBlur || 0) / 25;
    const col0 = L.seg ? lightColor(L, P.lightCol == null ? L.cdef : P.lightCol / 100) : null;
    const m = L.mode;
    // mode 1 臉部柔光：光包住臉、幾乎沒影子；2~3 柔和方向光；4 方向光；6、9 多顆彩色光
    const wrap = m === 1 ? 0.7 : m < 4 ? 0.4 : m === 4 ? 0.12 : 0.25;
    const pw = (m === 1 ? 0.3 : m < 4 ? 0.35 : m === 4 ? 0.9 : 1.3) / s;
    const soft = (1 + L.blur * 0.35) * s * s * bl;
    const home = lightHome(L, base, seed), ox = (P.lightX ?? home.x) - home.x, oy = (P.lightY ?? home.y) - home.y;
    // 多色：彩虹光點的燈都照在人身上；雙色的兩盞燈只染背景（Hypic 成品裡人只有壓暗）
    const ls = lightList(L, seed), many = L.id === 'rainbow' ? 0.8 : ls.length > 1 ? 0.65 : 1, only = m === 1 || L.id === 'rainbow' ? 2 : ls.length > 1 ? 3 : 1;
    ls.forEach((r, i) => {
      let [x, y, z, R, G, B, I, spk, shine] = r;
      // 光點是畫在照片上的發光小球，直接用 Hypic 的畫面座標
      const orbXY = L.pick && i >= (L.id === 'rainbow' ? 2 : 0);
      ({ x, y } = i === 0 && m === 1 ? home : orbXY ? { x, y } : toPhoto(A, base, x, y));
      x += ox; y += oy;
      const zz = A.F * (z * 4 - 1.2) * s;
      const col = col0 || [R / 255, G / 255, B / 255];
      // 彩虹光點的彩色小光點只照附近：參考距離縮短
      const spot = L.pick && L.id === 'rainbow' && i >= 2;
      // 陽光碎片是太陽光：很遠，不衰減
      // ext：[光澤硬度, 要不要投影, 1 光斑／2 光點, 1 整體調色／2 只照人]
      const fx = L.dapple ? 1 : L.pick && i >= (L.id === 'rainbow' ? 2 : 0) ? 2 : 0;
      put(x, y, zz, col, I / 8 * lum * k * many, [wrap, spk / 10 * sp * k, soft, L.dapple ? 0 : pw * (spot ? 1.6 : 1)],
        [shine, L.flat || i > 2 ? 0 : 1, fx, only], spot ? A.F * 1.4 : 0);
    });
    // 先壓暗：照 Hypic 的 fgDarkLow、bgDarkLow，人和背景一起壓
    ambS = (1 + (L.fg - 1) * k) * (1 - 0.6 * (P.lightFg || 0) / 100);
    ambB = (1 + (L.bg - 1) * k) * (1 - 0.7 * (P.lightBg || 0) / 100);
    bgDepth = A.F * Math.min(4, 0.2 + L.apart * 0.8);
  }
  let flash = null;
  if (Fl) {
    const k = P.flashAmt / 100;
    // 燈在照片正中間上方（相機的位置），不跟著臉
    put(0.5, 0.42 - 0.5 * A.F / gh, 6 * A.F, [0.97, 0.99, 1.03], Fl.I * k, [Fl.wrap, Fl.spec * k, Fl.soft, 1]);
    ambS *= 1 + (Fl.ambS - 1) * k; ambB *= 1 + (Fl.ambB - 1) * k;
    bgDepth = L ? bgDepth : 3.5 * A.F;
    flash = { amt: k, retro: Fl.retro };
  }
  return { lit: { lights, ambS, ambB, bgDepth, thick: 1.3 * A.F }, flash };
}
