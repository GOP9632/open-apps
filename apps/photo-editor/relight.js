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
// 分類照醒圖（Hypic）打光面板：自然、單色、多彩；閃光燈在醒圖是雲端 AI，這裡是本機近似
// 燈的位置用「臉寬」當單位，相對臉的中心：dx 往右、dy 往下、z 朝鏡頭（負的是在人後面）
//   I 亮度、wrap 光繞到暗面多少（皮膚透光）、spec 反光、soft 影子邊的柔和度、pow 衰減快慢
//   ambS、ambB：沒照到燈的地方剩多少亮度（人、背景）
//   mirror：第二盞燈左右對稱放
const W3 = [1, 0.95, 0.88], WHITE = [1, 1, 1];
export const LIGHT_CATS = [
  { id: 'nat', name: '自然', items: [
    { id: 'soft', name: '柔光', l: [{ dx: -0.6, dy: -0.9, z: 2.2, col: W3, I: 0.55, wrap: 0.5, spec: 0.15, soft: 6, pow: 0.6 }], ambS: 0.6, ambB: 0.8 },
    { id: 'rembrandt', name: '林布蘭', l: [{ dx: -1.3, dy: -1.1, z: 1.4, col: W3, I: 0.8, wrap: 0.1, spec: 0.25, soft: 1.2, pow: 0.7 }], ambS: 0.38, ambB: 0.5 },
    { id: 'split', name: '側光', l: [{ dx: -1.6, dy: -0.2, z: 0.45, col: W3, I: 1, wrap: 0.1, spec: 0.3, soft: 1, pow: 1 }], ambS: 0.28, ambB: 0.45 },
    { id: 'butterfly', name: '蝴蝶光', l: [{ dx: 0, dy: -1.3, z: 1.4, col: WHITE, I: 0.75, wrap: 0.25, spec: 0.35, soft: 1.5, pow: 1 }], ambS: 0.45, ambB: 0.55 },
    { id: 'rim', name: '輪廓光', mirror: 1, l: [{ dx: -1.3, dy: -0.4, z: -0.5, col: W3, I: 2.4, wrap: 0, spec: 0.2, soft: 2, pow: 0.8 }], ambS: 0.5, ambB: 0.45 },
    { id: 'back', name: '逆光光暈', l: [{ dx: 0.6, dy: -1.2, z: -0.7, col: [1, 0.8, 0.55], I: 1.6, wrap: 0, spec: 0, soft: 3, pow: 0.6 }], ambS: 0.8, ambB: 0.95, haze: [1, 0.78, 0.5] },
  ] },
  { id: 'mono', name: '單色', items: [
    { id: 'warm', name: '暖橘', l: [{ dx: -1.2, dy: -0.6, z: 0.9, col: [1, 0.62, 0.3], I: 1, wrap: 0.3, spec: 0.25, soft: 2, pow: 1 }], ambS: 0.45, ambB: 0.5 },
    { id: 'blue', name: '冷藍', l: [{ dx: 1.2, dy: -0.6, z: 0.9, col: [0.4, 0.62, 1], I: 1.1, wrap: 0.3, spec: 0.25, soft: 2, pow: 1 }], ambS: 0.42, ambB: 0.45 },
    { id: 'pink', name: '玫粉', l: [{ dx: -1.2, dy: -0.5, z: 0.9, col: [1, 0.45, 0.7], I: 1, wrap: 0.3, spec: 0.25, soft: 2, pow: 1 }], ambS: 0.45, ambB: 0.5 },
    { id: 'green', name: '青綠', l: [{ dx: 1.2, dy: -0.5, z: 0.9, col: [0.35, 1, 0.75], I: 0.95, wrap: 0.3, spec: 0.25, soft: 2, pow: 1 }], ambS: 0.42, ambB: 0.45 },
  ] },
  { id: 'multi', name: '多彩', items: [
    { id: 'neon', name: '霓虹', mirror: 1, l: [{ dx: -1.3, dy: -0.3, z: 0.6, col: [1, 0.3, 0.7], I: 1.1, wrap: 0.2, spec: 0.3, soft: 2, pow: 1 }, { col: [0.3, 0.55, 1], I: 1.5 }], ambS: 0.3, ambB: 0.4 },
    { id: 'sunset', name: '夕陽', mirror: 1, l: [{ dx: -1.3, dy: -0.5, z: 0.7, col: [1, 0.6, 0.25], I: 1.05, wrap: 0.25, spec: 0.25, soft: 2, pow: 1 }, { col: [0.6, 0.35, 1], I: 1.4 }], ambS: 0.35, ambB: 0.45 },
    { id: 'cyber', name: '賽博', mirror: 1, l: [{ dx: -1.3, dy: -0.2, z: 0.5, col: [0.2, 0.95, 1], I: 1.1, wrap: 0.2, spec: 0.3, soft: 2, pow: 1 }, { col: [1, 0.25, 0.85], I: 1.3 }], ambS: 0.28, ambB: 0.38 },
  ] },
];
export const LIGHTS = LIGHT_CATS.flatMap(c => c.items.map(it => ({ ...it, cat: c.id })));
// 閃光燈：燈在鏡頭上面一點，離人大約 6 個臉寬；背景在人後面 3.5 個臉寬，所以暗很多，影子投在背景上
export const FLASHES = [
  { id: 'direct', name: '直閃', I: 1.05, ambS: 0.4, ambB: 0.3, spec: 0.7, soft: 0.5, wrap: 0, retro: 0 },
  { id: 'softf', name: '柔閃', I: 0.7, ambS: 0.6, ambB: 0.5, spec: 0.25, soft: 5, wrap: 0.4, retro: 0 },
  { id: 'ccd', name: 'CCD', I: 1.2, ambS: 0.35, ambB: 0.22, spec: 0.8, soft: 0.5, wrap: 0, retro: 1 },
];

const rot = (c, deg) => {
  // 色相旋轉（保持亮度大致不變）
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), k = 1 / 3, s3 = Math.sqrt(k);
  const m = [cs + (1 - cs) * k, k * (1 - cs) - s3 * sn, k * (1 - cs) + s3 * sn];
  return [c[0] * m[0] + c[1] * m[1] + c[2] * m[2], c[0] * m[2] + c[1] * m[0] + c[2] * m[1], c[0] * m[1] + c[1] * m[2] + c[2] * m[0]].map(v => Math.max(0, v));
};
const temp = (c, t) => t >= 0 ? [c[0], c[1] * (1 - 0.12 * t), c[2] * (1 - 0.3 * t)] : [c[0] * (1 + 0.25 * t), c[1] * (1 + 0.08 * t), c[2]];

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

// 參數 → gl.js 要的 fx.lit、fx.flash
export function litParams(P, base, geo) {
  const L = LIGHTS.find(x => x.id === P.light), Fl = FLASHES.find(x => x.id === P.flash);
  if (!L && !Fl) return {};
  const A = lightAnchor(base, geo), W = base.canvas.width, H = base.canvas.height;
  const gw = geo?.w || W, gh = geo?.h || H, hFace = geo ? geo.max * 0.8 : 0;
  const lights = [];
  let ambS = 1, ambB = 1, bgDepth = 0, haze = null, hazeCol = null;
  const put = (dx, dy, z, col, I, par) => {
    const x = A.x + dx * A.F / gw, y = A.y + dy * A.F / gh, zz = z * A.F;
    const ref = Math.hypot(dx * A.F, dy * A.F, zz - hFace);
    lights.push({ pos: [x, y, zz, ref], col: col.map(c => c * I), par });
  };
  if (L) {
    const k = P.lightAmt / 100, bri = 1 + (P.lightBri - 50) / 100, /* 亮度 0~100，預設 50 照 Hypic */ s = 0.4 + P.lightDist / 50 * 0.6; // 距離 0~100 → 0.4~1.6 倍
    const l0 = L.l[0];
    const dx = P.lightX ?? l0.dx, dy = P.lightY ?? l0.dy;
    const tint = c => L.cat === 'nat' ? temp(c, P.lightCol / 50) : rot(c, P.lightCol * 3.6);
    // 燈越遠越柔、明暗差越小
    // 子滑桿照 Hypic：高光 0~100 預設 50、模糊（燈更柔）、前景暗、背景暗 0~100 預設 0
    const sp = (P.lightSpec ?? 50) / 50, bl = 1 + (P.lightBlur || 0) / 50;
    const par = { ...l0 }, soft = l0.soft * s * s * bl, pw = l0.pow / s / Math.sqrt(bl);
    put(dx * s, dy * s, l0.z * s, tint(l0.col), l0.I * k * bri, [l0.wrap, l0.spec * k * sp, soft, pw]);
    if (L.mirror) { const l1 = { ...par, ...L.l[1] }; put(-dx * s, dy * s, l1.z * s, tint(l1.col), l1.I * k * bri, [l1.wrap, l1.spec * k * sp, soft, pw]); }
    ambS *= (1 + (L.ambS - 1) * k) * bri * (1 - 0.6 * (P.lightFg || 0) / 100); ambB *= (1 + (L.ambB - 1) * k) * bri * (1 - 0.7 * (P.lightBg || 0) / 100); bgDepth = 4 * A.F;
    if (L.haze) {
      haze = [A.x + dx * s * A.F / gw, A.y + dy * s * A.F / gh, 0.45 * s, 0.55 * k * bri];
      hazeCol = tint(L.haze);
    }
  }
  let flash = null;
  if (Fl) {
    const k = P.flashAmt / 100;
    // 燈在照片正中間上方（相機的位置），不跟著臉
    const dx = (0.5 - A.x) * gw / A.F, dy = (0.42 - A.y) * gh / A.F - 0.5;
    put(dx, dy, 6, [0.97, 0.99, 1.03], Fl.I * k, [Fl.wrap, Fl.spec * k, Fl.soft, 1]);
    ambS *= 1 + (Fl.ambS - 1) * k; ambB *= 1 + (Fl.ambB - 1) * k;
    bgDepth = L ? bgDepth : 3.5 * A.F;
    flash = { amt: k, retro: Fl.retro };
  }
  return { lit: { lights, ambS, ambB, bgDepth, thick: 1.3 * A.F, haze, hazeCol }, flash };
}
