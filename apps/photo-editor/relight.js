// 打光、閃光燈用的立體深度圖
//   身體：人像遮罩模糊後開根號，輪廓邊緣往後彎，中間比較高（像圓柱）
//   臉：臉部特徵點的 z（MediaPipe 給的，越靠近鏡頭越小）連成三角網格，
//       鼻子、眉骨、顴骨、眼窩都有真的高低；頭髮、頭頂用一顆橢球補
//   輸出一張小圖：R 是模糊過的人像遮罩（原本 segB 的用途不變），G、B 是 16 位元的高度
import { boxBlur, mkCanvas } from './masktools.js';
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
const blur = (a, w, h, r) => boxBlur(a, w, h, r, 3, true);

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
  // 臉的網格是一片片三角形，法線會一格一格跳，打光時額頭會出現方塊狀的亮斑；抹平到臉寬的 4%
  blur(Hm, w, h, Math.max(1, Math.round(fw ? fw * 0.04 : Math.max(w, h) / 300)));

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
// 照 Hypic（醒圖國際版）打光面板的 13 個樣式：自然光 5、單色光 4、多色 4。
// 實際打出來的光照 LIGHT_FIT（對照 Hypic 成品擬合）；下面是 Hypic 樣式設定裡的值，現在只用到滑桿和換色：
//   l：Hypic 的燈 [x, y, z, R, G, B, 強度, 高光, 光澤硬度]（彩虹光點的光點位置、雙色寶盒換色用）
//   mode、fg、bg、blur、apart：Hypic 的模式、前景暗、背景暗、柔和度、背景距離（留著對照）
//   seg：顏色滑桿沿著走的色相段 [色相, 飽和, 明度 → 色相, 飽和, 明度, 權重]，cdef 是預設位置
//   lum、spec：有沒有亮度、高光滑桿（spec 是高光預設值）；n：用幾顆燈；pick：隨機挑色的多色樣式
const NOT_USE = [[0, 7], [1, 4], [1, 5], [1, 8], [2, 4], [2, 9], [2, 10], [3, 7], [3, 10], [4, 8], [4, 9], [5, 8], [6, 7], [7, 10], [8, 9], [9, 10], [0, 1], [0, 3], [0, 6], [0, 10], [1, 6], [1, 9], [2, 3], [2, 7], [3, 6], [4, 5], [5, 6], [6, 10]];
const PAL = [[255, 0, 0, 8], [0, 255, 0, 9], [0, 0, 255, 13], [255, 0, 255, 8], [0, 255, 255, 11], [255, 255, 0, 10], [255, 120, 0, 10], [255, 0, 120, 8], [0, 255, 150, 9], [0, 120, 255, 13], [120, 0, 255, 13]];
// 每個樣式擬合出來的燈（對照 Hypic 同一張照片的成品，用最小平方法算出來的數字，不是 Hypic 的檔案）
//   amb：人、背景先壓暗到多少；l：每盞燈 [x, y（以臉中心、臉寬為單位）, 高度, 範圍, 乘（人、背景）, 加（人、背景）, 方向性, 高光, (長寬比, 角度, (邊緣硬度,)) R, G, B]
const LIGHT_FIT = {
  soft: { amb: [0.364, 0.999], l: [[-0.03,0.182,1.886,2.961,0.81,0.0,0.0,0.001,0.125,0.0,0.964,0.953,0.968]] }, // 臉部柔光
  warm: { amb: [0.929, 0.943], l: [[0.303,0.821,1.73,0.694,0.178,0.159,0.0,0.0,0.509,0.03,0.707,0.443,0.072],[2.072,3.0,4.412,3.776,0.171,0.152,0.0,0.0,1.0,0.0,1.263,0.807,0.0]] }, // 氣氛暖光
  dawn: { amb: [0.858, 0.614], l: [[-3.0,-0.94,3.596,3.103,0.734,0.005,0.009,0.0,0.857,0.0,0.367,0.449,0.515],[0.216,-0.181,0.855,4.928,0.135,0.526,0.0,0.0,0.385,0.0,0.899,0.966,1.03]] }, // 清晨陽光
  sunset: { amb: [0.705, 0.748], l: [[3.158,-0.848,3.989,6.0,0.83,0.634,-0.0,-0.0,0.744,0.2,1.0,1.6,3.0,0.36,0.128,0.0],[0.771,0.452,2.942,0.687,0.173,0.0,0.0,0.05,0.0,1.325,0.59,0.689,1.614,0.346,0.069,0.0],[0.074,0.121,1.316,0.461,1.163,1.362,0.021,0.241,0.885,0.0,0.282,-1.391,3.0,0.482,0.168,0.0],[0.649,0.943,1.75,0.083,0.595,0.0,0.0,0.0,0.494,0.0,0.891,0.458,1.979,0.782,0.281,0.014],[-1.785,2.496,1.977,1.319,0.223,0.0,0.002,0.0,0.305,0.0,0.97,0.005,1.215,0.888,0.689,0.572]] }, // 夕陽餘輝
  shards: { amb: [0.99, 1.001], l: [[0.222,-0.472,1.556,0.092,0.257,3.0,0.0,0.0,0.22,0.026,1.0,-0.018,1.0,1.162,1.494,1.542],[0.182,-0.006,5.0,0.146,0.262,0.889,0.0,0.0,1.0,0.0,0.409,0.859,1.0,0.744,0.963,0.978],[0.636,0.863,-0.185,0.167,0.645,0.065,0.0,0.0,0.073,0.0,0.654,0.907,1.0,0.477,0.612,0.626],[0.025,0.02,1.316,0.089,1.4,0.0,0.0,0.0,0.8,0.8,0.421,1.555,1.264,1.193,1.541,1.581]] }, // 陽光碎片
  pink: { amb: [0.789, 0.805], l: [[0.693,0.668,2.858,0.822,0.379,0.167,0.016,0.037,1.0,0.077,0.853,-0.037,0.496,0.0,0.327],[3.453,3.618,4.998,5.456,0.21,0.316,0.0,0.0,1.0,0.001,0.882,-1.596,0.615,0.0,0.513],[1.858,4.0,-0.453,5.998,0.892,0.083,0.0,0.0,0.744,0.0,0.192,0.694,0.47,0.0,0.377]] }, // 暗夜粉
  purple: { amb: [0.763, 0.792], l: [[-3.0,0.555,1.667,1.523,0.909,0.231,0.0,0.0,0.0,0.29,0.215,0.136,0.627],[1.229,0.137,2.334,1.734,0.747,0.579,0.0,0.0,1.0,0.004,0.041,0.0,0.875]] }, // 驚艷紫
  metal: { amb: [0.636, 0.649], l: [[0.236,-0.53,1.692,2.971,0.473,0.109,0.008,0.0,0.851,0.7,0.191,0.941,1.001,0.003,0.063,0.284],[2.879,-3.999,2.341,5.999,0.425,0.372,0.003,0.0,0.894,0.134,0.853,1.6,1.001,0.0,0.118,0.512],[0.007,0.021,-1.0,0.091,1.172,2.67,0.0,0.451,0.578,0.0,0.241,1.551,1.0,0.016,0.183,0.892],[0.148,-0.651,1.47,0.179,0.595,0.0,0.021,0.0,0.317,0.0,0.45,1.563,1.48,0.002,0.18,0.787]] }, // 金屬藍
  red: { amb: [0.711, 0.793], l: [[3.0,0.737,3.969,6.0,0.488,0.448,0.006,0.0,1.0,0.0,0.62,0.216,0.217],[-3.0,0.139,1.485,2.834,0.709,0.122,0.0,0.0,0.0,0.14,0.371,0.253,0.251]] }, // 神秘紅
  rainbow: { amb: [0.495, 0.548], l: [[-1.3,-1.971,3.719,2.577,0.682,0.0,0.0,0.114,0.68,0.0,0.15,1.025,0.415,0.316,1.0],[2.943,-2.822,5.0,3.57,2.992,0.362,0.0,0.001,0.732,0.068,0.416,1.29,0.236,1.536,1.599],[-3.141,0.308,4.042,1.763,1.833,0.847,0.0,0.0,0.0,0.134,0.217,0.286,0.324,0.578,1.032]] }, // 彩虹光點
  duo: { amb: [0.738, 0.739], l: [[-0.847,-0.418,1.735,3.905,0.315,0.224,0.0,0.0,0.778,0.0,0.22,-0.611,1.113,0.0,0.0],[0.948,-0.67,1.819,2.825,0.451,0.341,0.0,0.0,0.791,0.0,0.282,0.597,0.0,0.0,1.028],[-2.318,-2.324,-1.0,1.107,2.834,0.139,0.0,0.0,0.0,0.0,0.237,0.493,0.932,0.0,1.579]] }, // 雙色寶盒
  pinkpurple: { amb: [0.739, 0.741], l: [[-0.532,3.078,0.751,2.377,0.37,0.951,0.12,0.001,0.85,0.023,0.732,0.744,0.0,0.027,0.744],[0.785,-0.883,1.74,3.623,0.542,0.346,0.0,0.001,0.672,0.001,0.213,0.525,0.679,0.001,0.28],[-0.234,0.463,0.87,0.484,0.272,0.0,0.087,0.084,0.438,0.126,0.374,0.964,0.0,0.0,1.2]] }, // 粉紫
  orangecyan: { amb: [0.746, 0.73], l: [[-0.375,1.012,0.75,4.867,0.685,0.601,0.0,0.0,0.907,0.0,0.188,0.469,1.0,0.0,0.391,0.498],[0.77,-0.863,1.743,4.952,0.522,0.359,0.0,0.0,0.777,0.0,0.15,0.532,1.0,0.71,0.204,0.0],[-0.187,0.502,1.099,0.462,0.32,0.0,0.067,0.124,0.0,0.05,0.374,0.981,1.0,0.0,0.464,0.589]] }, // 橘青
};
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
// 光斑最多加多少（0~1）：[開始收、上限]。陽光碎片在暗的皮膚上加太多會爆白
const LIGHT_CAP = { shards: [0.12, 0.18] };
export const LIGHTS = LIGHT_CATS.flatMap(c => c.items.map(it => ({ ...it, cat: c.id, fit: LIGHT_FIT[it.id] })));

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

// 閃光燈：相機閃光燈、富士閃光燈照 Hypic「AI 打光」同名樣式的成品（def 是 Hypic 的預設強度，成品就是那個強度）。
//   相機閃光燈：燈和壓暗（fit）、臉上補光（flat：補平多少、目標亮度、亮部保留顏色；dmax 上限；tint 顏色）、頭頂頭髮壓暗（hair）。
//   CCD 還是舊的：燈在鏡頭上面一點，離人大約 6 個臉寬，再加偏冷、暈光、雜訊
export const FLASHES = [
  // old：臉本來就打得很平、很正面的照片用的舊版（燈和壓暗 fit、臉上補光 flat：補平多少、目標亮度、亮部保留顏色；dmax 上限；tint 顏色；hair 頭頂頭髮壓暗）
  { id: 'direct', name: '相機閃光燈', def: 60, cam: true, old: { fit: { amb: [0.3, 0.32], l: [[0.462,3.624,5.453,3.193,0.0,0.015,1.197,0.798,0.223,0.0,0.434,0.236,1.598,1.14,0.988],[-1.734,0.105,7.228,3.497,0.345,0.115,0.195,0.0,0.06,0.0,0.15,-0.002,1.015,0.831,0.774],[-0.027,-1.591,4.159,7.978,0.537,0.524,0.131,0.0,1.0,0.082,0.184,0.603,1.014,1.003,0.966]] }, flat: [1.1, 0.66, 0.5], dmax: 0.25, tint: [1.06, 0.96, 0.9], hair: 0, skin: 1.0 } },
  // 富士閃光燈的成品大約是 Hypic「調整 › 閃光燈」的 53（8 張測試照擬合），所以直接用它：滑桿 50 = 調整 53
  //   舊版時富士的成品跟調整 › 閃光燈 60 幾乎一樣：滑桿 50 = 調整 60
  { id: 'softf', name: '富士閃光燈', def: 50, adj: 1.06, adjOld: 1.2 },
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

// 閃光燈（gl.js）：照 Hypic 在 8 張公開測試照上的成品擬合（plans/修圖/閃光燈評審）。
// Hypic 的閃光燈是雲端 AI 重畫整張照片，滑桿只是跟原圖按比例混合；這裡用皮膚、頭髮、五官、背景、衣服分開的公式近似它的成品：
//   皮膚：附近皮膚的明暗壓平（陰影那側補亮）、細節保留一部分；顏色往標準膚色拉（洗掉環境色光）
//   調整 › 閃光燈：頭髮變暗去色，背景、衣服往中間亮度收、去色；相機閃光燈：頭髮、背景、衣服只照比例稍微變亮
// 參數：[T 目標亮度, g 明暗壓平, g2 細節, tl 跟著原本的膚色亮度, Cr Cb 標準膚色, k 膚色拉多少, ss 保留原本的顏色變化,
//        頭髮 ×4, 背景 ×4, 衣服 ×3 + 很暗陰影的提亮下限 s0, 鬍子亮度 a + b × 原本亮度、明暗用亮度和 RGB 平均混多少 va、tl2 再跟著膚色亮部,
//        膚色另一種算法「原本的顏色 × 暖色倍率」的 R、B 倍率和混多少, 很細紋理（毛孔、鬍渣）留多少 g3]（調整和相機各一組，用法見 gl.js）
const FLASH_R = 0.2;
// 臉本來就打得很平、很正面（暗部 ÷ 亮部 × 左右亮度比）的照片，Hypic 幾乎只是整體提亮，
// 公式反而會把下顎影子、肩膀弄錯，所以改用舊版：燈和壓暗照 Hypic 強度 100 的成品擬合（格式同 LIGHT_FIT），臉上再補平。
// 平整度在 FLASH_EVEN 之間漸進：低於 [0] 全用公式、高於 [1] 全用舊版，中間兩個成品照比例混合（不會差一點點就整個變樣）
const FLASH_EVEN = [0.6, 0.72];
// 而且背景要比臉亮很多（背景 ÷ 臉上皮膚亮部，室內開燈拍）才用舊版：白背景攝影棚那種（評審第 3 輪第 9 張，1.09）
// 舊版會把背景壓得太暗。同樣在 FLASH_BG 之間漸進
const FLASH_BG = [1.2, 1.35];
// 公式本身也一樣：平整度在 FLASH_FLAT 之間，皮膚從「壓平明暗」漸進到「照原本明暗按比例提亮」（gl.js 的 uFS.w）。
// 8 張公開測試照都在 0.59 以下，不受影響；平光的臉（評審的 A、第 9 張）用壓平會變成一片面具
const FLASH_FLAT = [0.6, 0.72];
// 臉只看得到一邊（側臉、半邊在畫面外）時左右比算不出來，當作一般的 0.85（公開測試照的中間值）
const FLASH_LR0 = 0.85;
const FLASH_FIT_OLD = { amb: [0.5, 0.648], l: [[0.126,1.459,2.53,0.856,0.168,0.0,0.382,0.508,0.632,0.0,0.794,1.478,0.67,0.642,0.581],[-0.218,-0.096,8.0,1.387,0.687,0.154,0.0,0.022,0.212,0.0,0.447,0.184,0.936,1.233,1.215],[0.193,-1.034,2.176,0.83,0.404,0.208,0.0,0.041,1.0,0.0,0.652,1.112,0.888,0.992,1.182]], flat: [1.5, 0.58, 0.5] };
const FLASH_DMAX = 0.2, FLASH_T = [0.73, 1.08, 0.99];
const FLASH_ADJ = [0.762, 0.632, 0.655, 0.127, 1.224, 0.87, 0.646, 0.287, 0.611, 0.206, 0.218, -0.011, 0.493, 0.856, 0.131, -0.737, 0, 0.909, 0.5, 0.441, 0, 1, 1.257, 0.061, 1.041, 0.882, 0, 0.8];
const FLASH_CAM = [0.72, 0.55, 0.774, 0.239, 1.297, 0.834, 0.63, 0.253, 0.922, 0, 0, 0, 1.018, 0.017, 0, 0, 0.969, 0.057, 0, 0.364, 0, 1, 1.299, 0.431, 0.848, 1.187, 0.161, 0.62];
const FLASH_ST0 = { Lh: 0.65, Lm: 0.45, cs: [1.3, 0.94, 0.7], Lb: 0.5, cast: [0, 0, 0] };

// 一組擬合的燈（LIGHT_FIT 的格式）放進 lights：g 亮度倍數、s 範圍倍數、bl 柔焦、sp 高光倍數、ox／oy 位移、col 改顏色、gls 高光指數
function putFit(lights, fit, A, base, k, o = {}) {
  const { g = k, s = 1, bl = 1, sp = 1, ox = 0, oy = 0, col, gls = 36 } = o;
  fit.l.forEach((f, i) => {
    const [, , z, sig, Ip, Ib, Jp, Jb, dr, Sp] = f, q = fitXY(A, base, f), c = f.slice(-3);
    lights.push({
      pos: [q.x + ox, q.y + oy, z * A.F, sig * A.F * s], col: col ? col(c, i) : c, par: [Ip * g, Ib * g, Jp * g, Jb * g],
      dir: [dr / bl, Sp * sp * k, f.length > 13 ? f[10] : 1, f.length > 13 ? f[11] : 0], ext: [gls, f.length > 15 ? 1 + (f[12] - 1) / bl : 1, 0, 1],
    });
  });
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

// 閃光燈要的整張照片統計（照片載入、找到臉和皮膚之後算一次）：
// Lh 臉上皮膚亮度的第 90 百分位、Lm 中位數、cs 臉上皮膚的平均顏色比例（RGB ÷ 亮度）、Lb 背景平均亮度、cast 背景的平均色偏
//   canvas：照片，或 { width, height, img }（同 skin.js prepSkin）
export function flashStats(canvas, seg, mask, geom) {
  const w = seg.w, h = seg.h, c = mkCanvas(w, h);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas.img || canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  x.drawImage(mask, 0, 0, w, h);
  const mk = x.getImageData(0, 0, w, h).data;
  const Ls = [], cs = [0, 0, 0], cast = [0, 0, 0], cx = geom ? geom.cx * w / canvas.width : w / 2, lr = [0, 0, 0, 0];
  let nb = 0, Lb = 0;
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (seg.skin[i] > 0.6 && mk[i * 4] > 204) {
      Ls.push(L); const q = Math.max(L, 1e-3); cs[0] += r / q; cs[1] += g / q; cs[2] += b / q;
      const k = i % w < cx ? 0 : 2; lr[k] += L; lr[k + 1]++;
    }
    if (seg.bg[i] > 0.7) { nb++; Lb += L; cast[0] += r - L; cast[1] += g - L; cast[2] += b - L; }
  }
  if (Ls.length < 50) return null;
  Ls.sort((a, b) => a - b);
  const Lh = Math.max(0.1, Ls[Math.floor(Ls.length * 0.9)]), a = lr[0] / Math.max(lr[1], 1), b = lr[2] / Math.max(lr[3], 1);
  const lrR = lr[1] >= 20 && lr[3] >= 20 ? Math.min(a, b) / Math.max(a, b, 1e-3) : FLASH_LR0;
  return {
    Lh, Lm: Ls[Math.floor(Ls.length * 0.5)], cs: cs.map(v => v / Ls.length),
    // 臉的光有多平：暗部（第 10 百分位）÷ 亮部 × 左右兩半平均亮度的比
    even: Ls[Math.floor(Ls.length * 0.1)] / Lh * lrR,
    Lb: nb > 100 ? Lb / nb : 0.5, cast: nb > 100 ? cast.map(v => v / nb) : [0, 0, 0],
  };
}

// 相機閃光燈的 AI 模型（flashnet.js，第 2 版）：調色表算好了、臉上皮膚的顏色又在訓練照見過的範圍裡，就整個用模型、不用公式。
// 留下來驗收的 20 張和評審的 8 張，平均差 Hypic 全圖 22.9 → 19.4、皮膚 24.7 → 18.6（plans/修圖/閃光燈評審/AI模型_第2版）。
// 只有評審 05 變差：滿臉藍紫色的光，膚色比例（flashStats 的 cs）離一般膚色 0.74，訓練的 139 張最遠才 0.45，
// 模型沒學過要把這種色光洗掉，所以超過 NET_CAST 的照舊用公式（公式有往標準膚色拉）
const NET_CS = [1.3, 0.94, 0.7], NET_CAST = 0.55;
export const flashNetOk = base => !!base.fnet && !!base.flashSt && Math.max(...base.flashSt.cs.map((v, i) => Math.abs(Math.log(Math.max(v, 1e-3) / NET_CS[i])))) < NET_CAST;

// 參數 → gl.js 要的 fx.lit、fx.flash
export function litParams(P, base, geo) {
  const L = LIGHTS.find(x => x.id === P.light), F0 = FLASHES.find(x => x.id === P.flash);
  const net = F0?.cam && flashNetOk(base) ? base.fnet : null;
  // wo：舊版佔多少（見 FLASH_EVEN、FLASH_BG）。同時開打光時不混（混合要用打光前的顏色），照中間值二選一
  const st = base.flashSt, ss = (v, [a, b]) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const w = st ? ss(st.even, FLASH_EVEN) * ss(st.Lb / st.Lh, FLASH_BG) : 0;
  const wo = L ? (w >= 0.5 ? 1 : 0) : w, old = wo > 0, neu = wo < 1;
  // adj：這個樣式就是調整 › 閃光燈換個強度（舊版、公式各自的倍數）
  const Fl = F0?.adj || net ? null : F0, adjF = m => Math.max(0, P.flashFill || 0, F0?.adj ? Math.min(100, P.flashAmt * m) : 0) / 100;
  const ff = adjF(F0?.adjOld), ffN = adjF(F0?.adj);
  if (!L && !Fl && !ff && !ffN && !net) return {};
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
    // 光澤：Hypic 滑桿 0~100 對應高光指數 0~400，預設是樣式資料第 9 欄 ÷4（36 → 9）；越大高光越小越亮
    const gls = L.spec ? Math.max(1, 4 * (P.lightGloss ?? L.l[0][8] / 4)) : 36;
    const bl = 1 + (P.lightBlur || 0) / 25;
    // 顏色滑桿：照滑桿移動的量，把擬合出來的顏色往新顏色推
    let dc = [0, 0, 0];
    if (L.seg && P.lightCol != null) { const a = lightColor(L, L.cdef), b = lightColor(L, P.lightCol / 100); dc = b.map((v, i) => v - a[i]); }
    const home = lightHome(L, base), ox = (P.lightX ?? home.x) - home.x, oy = (P.lightY ?? home.y) - home.y;
    const picks = L.pick && seed ? pickLights(L, seed) : null;
    putFit(lights, fit, A, base, k, {
      g: k * lum / s, s: s * bl, bl, sp, ox, oy, gls,
      col: (c, i) => {
        const m = (c[0] + c[1] + c[2]) / 3;
        c = c.map((v, j) => Math.max(0, v + dc[j] * Math.max(m, 0.3)));
        // 雙色寶盒「換一組」：換成挑到的顏色，亮度照原本那盞
        if (picks && L.id === 'duo' && picks[i]) { const pc = picks[i].slice(3, 6).map(v => v / 255), pm = (pc[0] + pc[1] + pc[2]) / 3 || 1; c = pc.map(v => v / pm * m); }
        return c;
      },
    });
    // 彩虹光點：背景上的彩色發光小球（照片座標）
    if (L.id === 'rainbow') lightList(L, seed).slice(2).forEach(r => lights.push({ pos: [r[0] + ox, r[1] + oy, 0, 1], col: r.slice(3, 6).map(v => v / 255 * k), par: [0, 0, 0, 0], dir: [0, 0, 0, 0], ext: [36, 0, 2, 1] }));
    // 先壓暗：人和背景（前景暗、背景暗滑桿再多壓）
    ambS = (1 + (fit.amb[0] - 1) * k) * (1 - 0.6 * (P.lightFg || 0) / 100);
    ambB = (1 + (fit.amb[1] - 1) * k) * (1 - 0.7 * (P.lightBg || 0) / 100);
  }
  // 舊版（臉本來就打得很平的照片）：調整 › 閃光燈只開它的時候，燈照全強度算，最後在 gl.js 照滑桿跟原圖混合；相機閃光燈的燈照擬合的全強度算
  const Fo = old && Fl?.cam ? Fl.old : null, style = Fo && !L ? Fo : null, flashOnly = old && ff && !L && !Fl;
  if (old && ff) {
    const q = flashOnly ? 1 : ff;
    putFit(lights, FLASH_FIT_OLD, A, base, q);
    ambS *= 1 + (FLASH_FIT_OLD.amb[0] - 1) * q; ambB *= 1 + (FLASH_FIT_OLD.amb[1] - 1) * q;
  }
  if (Fo) {
    // 超過預設：燈只再亮一半的比例，主要靠臉上補得更多
    const r = style ? 1 + 0.5 * Math.max(0, P.flashAmt / Fl.def - 1) : 1;
    putFit(lights, Fo.fit, A, base, style ? r : P.flashAmt / 100);
    const q = style ? 1 : P.flashAmt / 100;
    ambS *= 1 + (Fo.fit.amb[0] - 1) * q; ambB *= 1 + (Fo.fit.amb[1] - 1) * q;
  }
  let flash = null;
  if (Fl && !Fl.cam) {
    // CCD：一盞燈（相機閃光燈全部在 gl.js 算）
    const k = P.flashAmt / 100;
    // 燈在照片正中間上方（相機的位置），不跟著臉
    put(0.5, 0.42 - 0.5 * A.F / gh, 6 * A.F, [0.97, 0.99, 1.03], Fl.I * k, [Fl.wrap, Fl.spec * k, Fl.soft, 1]);
    ambS *= 1 + (Fl.ambS - 1) * k; ambB *= 1 + (Fl.ambB - 1) * k;
    bgDepth = L ? bgDepth : 3.5 * A.F;
    flash = { amt: k, retro: Fl.retro };
  }
  // 閃光燈（gl.js）：F [強度（跟原圖混合的比例）, 1 = 相機閃光燈, 0, 0]。相機閃光燈的滑桿在 Hypic 預設那格就是成品，超過再往外推一點
  // 舊版的臉上補平：O [混合比例, 補平多少, 目標亮度, 亮部保留顏色多少]、G [, 最多亮幾倍]、C 臉的範圍（橢圓）、
  // X [頭頂頭髮壓暗多少, 脖子肩膀也補平（1）, 下巴影子多深, 0]
  const sr = style ? 1 + 0.5 * Math.max(0, P.flashAmt / Fl.def - 1) : 1;
  const flashO = style ? [Math.min(1, P.flashAmt / Fl.def), style.flat[0] * sr, style.flat[1], style.flat[2]] : flashOnly ? [ff, ...FLASH_FIT_OLD.flat] : null;
  const flashG = [0, style ? style.dmax * Math.sqrt(sr) : FLASH_DMAX], flashT = style ? style.tint : FLASH_T;
  const flashX = style ? [style.hair, style.skin ? 1 : 0, style.skin || 0, 0] : [0.25, 0, 0, 0];
  const flashC = [A.x, A.y, 0.85 * A.Fpx / W, 0.95 * A.Fpx / H];
  const fs = base.flashSt || FLASH_ST0, camOn = neu && !!Fl?.cam;
  const famt = camOn ? Math.min(1, P.flashAmt / Fl.def) * (1 + 0.6 * Math.max(0, P.flashAmt / Fl.def - 1)) : ffN;
  // F [強度, 1 = 相機閃光燈, 0, 舊版佔多少]
  const flashF = neu && (camOn || ffN) ? [famt, camOn ? 1 : 0, 0, wo] : null;
  const flashP = camOn ? FLASH_CAM : FLASH_ADJ, flashS = [fs.Lh, fs.Lb, fs.Lm ?? 0.45, st ? ss(st.even, FLASH_FLAT) : 0], flashCs = fs.cs, flashCast = fs.cast;
  const flashR = [FLASH_R * A.Fpx / W, FLASH_R * A.Fpx / H];
  // 模型：滑桿在 Hypic 預設那格就是成品（混合 1），超過再往外推一點（跟公式一樣）
  const flashM = net ? { amt: Math.min(1, P.flashAmt / F0.def) * (1 + 0.6 * Math.max(0, P.flashAmt / F0.def - 1)), g: net.g } : null;
  return { lit: { lights, ambS, ambB, bgDepth, thick: 1.3 * A.F, flashF, flashR, flashP, flashS, flashCs, flashCast, flashO, flashG, flashC, flashT, flashX, flashM, cap: L && LIGHT_CAP[L.id] }, flash };
}
