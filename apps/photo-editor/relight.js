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
// 每個樣式擬合出來的燈（對照 Hypic 同一張照片的成品，用最小平方法算出來的數字，不是 Hypic 的檔案）
//   amb：人、背景先壓暗到多少；l：每盞燈 [x, y（以臉中心、臉寬為單位）, 高度, 範圍, 乘（人、背景）, 加（人、背景）, 方向性, 高光, R, G, B]
const LIGHT_FIT = {
  soft: { amb: [0.39, 0.999], l: [[-0.034,0.186,1.907,2.916,0.808,0.0,0.0,0.001,0.128,0.0,0.932,0.922,0.935]] }, // 臉部柔光
  warm: { amb: [0.932, 0.949], l: [[0.315,0.793,1.781,0.681,0.256,0.217,0.001,0.0,0.552,0.042,0.472,0.321,0.153],[1.947,3.0,4.278,3.608,0.165,0.14,0.0,0.0,1.0,0.0,1.279,0.88,0.0]] }, // 氣氛暖光
  dawn: { amb: [0.842, 0.685], l: [[-3.0,-0.962,3.591,3.106,0.727,0.004,0.01,0.0,0.873,0.0,0.374,0.441,0.495],[0.205,-0.192,0.892,4.411,0.163,0.477,0.0,0.0,0.334,0.0,0.86,0.919,0.981]] }, // 清晨陽光
  sunset: { amb: [0.751, 0.763], l: [[1.653,-0.113,2.542,4.507,0.786,0.511,0.0,0.0,0.854,0.225,0.418,0.159,0.002],[0.329,0.054,1.857,0.475,0.103,0.0,0.0,0.0,1.0,1.279,0.284,0.084,0.032]] }, // 夕陽餘輝
  shards: { amb: [0.993, 1.0], l: [[0.238,-0.494,1.386,0.12,0.315,3.0,0.0,1.2,0.821,0.041,0.947,1.161,1.196],[0.124,-0.012,1.666,0.147,0.264,0.098,0.0,1.2,1.0,0.0,0.716,0.871,0.901],[0.668,0.867,4.999,0.146,0.0,0.063,0.276,0.0,0.0,0.0,0.629,0.59,0.518]] }, // 陽光碎片
  pink: { amb: [0.801, 0.812], l: [[0.482,0.751,1.917,0.62,0.343,0.002,0.0,0.108,0.859,0.035,0.475,0.0,0.286],[1.929,3.0,4.225,3.387,0.254,0.265,0.0,0.0,0.788,0.0,0.809,0.0,0.704]] }, // 暗夜粉
  purple: { amb: [0.766, 0.792], l: [[-3.0,0.513,1.646,1.5,0.859,0.208,0.0,0.0,0.0,0.302,0.218,0.145,0.609],[1.209,0.148,2.307,1.778,0.592,0.462,0.0,0.0,1.0,0.006,0.04,0.0,0.962]] }, // 驚艷紫
  metal: { amb: [0.642, 0.656], l: [[0.256,-0.634,1.615,1.139,0.427,0.134,0.0,0.0,0.9,0.706,0.005,0.081,0.382],[2.727,-3.0,1.678,4.967,0.409,0.247,0.0,0.0,0.974,0.072,0.0,0.112,0.538]] }, // 金屬藍
  red: { amb: [0.619, 0.772], l: [[3.0,0.79,4.018,6.0,0.512,0.448,0.0,0.0,1.0,0.0,0.569,0.249,0.239],[-2.999,-0.047,1.481,3.732,0.857,0.152,0.0,0.0,0.0,0.076,0.389,0.322,0.319]] }, // 神秘紅
  rainbow: { amb: [0.564, 0.583], l: [[-1.729,0.832,2.075,0.797,0.814,0.0,0.0,0.046,1.0,0.044,0.379,0.322,0.985],[1.686,-2.996,4.951,6.0,0.755,0.022,0.0,0.043,0.838,0.008,0.16,0.486,0.804]] }, // 彩虹光點
  duo: { amb: [0.732, 0.739], l: [[-1.306,-0.487,2.01,0.943,0.384,0.172,0.0,0.0,1.0,0.0,1.178,0.165,0.0],[0.618,-1.393,1.803,1.238,0.551,0.42,0.0,0.0,0.704,0.014,0.352,0.0,0.825]] }, // 雙色寶盒
  pinkpurple: { amb: [0.73, 0.726], l: [[-1.56,3.0,0.533,2.304,0.0,0.627,0.383,0.0,0.808,0.0,0.0,0.061,0.956],[0.707,-1.494,2.068,1.315,0.434,0.309,0.0,0.0,0.77,0.032,0.762,0.089,0.226]] }, // 粉紫
  orangecyan: { amb: [0.695, 0.72], l: [[-0.681,1.14,0.647,1.25,0.237,0.422,0.196,0.025,0.661,0.041,0.0,0.576,0.741],[0.721,-1.435,1.82,1.457,0.493,0.317,0.0,0.019,0.562,0.009,0.739,0.22,0.0]] }, // 橘青
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

// 第一盞燈在照片上的預設位置（0~1）
const fitXY = (A, base, f) => ({ x: A.x + f[0] * A.Fpx / base.canvas.width, y: A.y + f[1] * A.Fpx / base.canvas.height });
export function lightHome(L, base) {
  return fitXY(lightAnchor(base, null), base, L.fit.l[0]);
}
export function lightPosOf(L, P, base) {
  const h = lightHome(L, base);
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
    // 每盞燈是一團有範圍的光（數字是對照 Hypic 成品擬合的，見 LIGHT_FIT）：
    //   位置以臉中心、臉寬為單位；照在人身上時朝燈的面亮、背對的面暗；先把人和背景壓暗
    const k = (P.lightAmt ?? 100) / 100, seed = P.lightSeed || 0, fit = L.fit;
    // 子滑桿照 Hypic：亮度、距離 0~100 預設 50；高光預設照樣式（35 或 50）；柔焦、前景暗、背景暗預設 0
    const lum = L.lum ? (P.lightBri ?? 50) / 50 : 1;
    const s = 0.5 + (P.lightDist ?? 50) / 100;
    const sp = L.spec ? (P.lightSpec ?? L.spec) / L.spec : 1;
    const bl = 1 + (P.lightBlur || 0) / 25;
    // 顏色滑桿：照滑桿移動的量，把擬合出來的顏色往新顏色推
    let dc = [0, 0, 0];
    if (L.seg && P.lightCol != null) { const a = lightColor(L, L.cdef), b = lightColor(L, P.lightCol / 100); dc = b.map((v, i) => v - a[i]); }
    const home = lightHome(L, base), ox = (P.lightX ?? home.x) - home.x, oy = (P.lightY ?? home.y) - home.y;
    const picks = L.pick && seed ? pickLights(L, seed) : null;
    fit.l.forEach((f, i) => {
      const [fx, fy, z, sig, Ip, Ib, Jp, Jb, dr, Sp] = f;
      let col = f.slice(10, 13);
      const m = (col[0] + col[1] + col[2]) / 3;
      col = col.map((v, j) => Math.max(0, v + dc[j] * Math.max(m, 0.3)));
      // 雙色寶盒「換一組」：換成挑到的顏色，亮度照原本那盞
      if (picks && L.id === 'duo' && picks[i]) { const pc = picks[i].slice(3, 6).map(v => v / 255), pm = (pc[0] + pc[1] + pc[2]) / 3 || 1; col = pc.map(v => v / pm * m); }
      const q = fitXY(A, base, f), g = k * lum / s;
      lights.push({ pos: [q.x + ox, q.y + oy, z * A.F, sig * A.F * s * bl], col, par: [Ip * g, Ib * g, Jp * g, Jb * g], dir: [dr / bl, Sp * sp * k, 0, 0], ext: [36, 0, 0, 1] });
    });
    // 彩虹光點：背景上的彩色發光小球（照片座標）
    if (L.id === 'rainbow') lightList(L, seed).slice(2).forEach(r => lights.push({ pos: [r[0] + ox, r[1] + oy, 0, 1], col: r.slice(3, 6).map(v => v / 255 * k), par: [0, 0, 0, 0], dir: [0, 0, 0, 0], ext: [36, 0, 2, 1] }));
    // 先壓暗：人和背景（前景暗、背景暗滑桿再多壓）
    ambS = (1 + (fit.amb[0] - 1) * k) * (1 - 0.6 * (P.lightFg || 0) / 100);
    ambB = (1 + (fit.amb[1] - 1) * k) * (1 - 0.7 * (P.lightBg || 0) / 100);
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
