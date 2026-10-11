// 拼貼版型：每一格是一個凸多邊形（最多 4 個頂點，所以可以做斜切格），座標是 0~1 的畫布比例。
// 跟醒圖一樣，格子間距和圓角是整組版型共用的兩個參數；貼著畫布外緣的邊用「外框」寬度，
// 格子之間的邊各退一半「間距」。外框是 0 時，貼著外緣的角不做圓角。

const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// 依列（rows）排：每列幾格、每列高度比例、每格寬度比例
function rows(spec, hw, ww) {
  const n = spec.length, hs = hw || spec.map(() => 1), hsum = hs.reduce((a, b) => a + b, 0);
  const out = []; let y = 0;
  spec.forEach((k, r) => {
    const h = hs[r] / hsum, ws = (ww && ww[r]) || Array(k).fill(1), wsum = ws.reduce((a, b) => a + b, 0);
    let x = 0;
    for (let i = 0; i < k; i++) { const w = ws[i] / wsum; out.push(R(x, y, w, h)); x += w; }
    y += h;
  });
  return out;
}
// 依欄排：把 rows 的結果轉置
const cols = (spec, ww, hh) => rows(spec, ww, hh).map(p => p.map(([x, y]) => [y, x])).map(p => [p[0], p[3], p[2], p[1]]);

// 斜切：把矩形格子沿 x 方向斜一點（d 是斜率，0.08 約是畫布寬的 8%）
function slant2(d) { return [[[0, 0], [0.5 + d, 0], [0.5 - d, 1], [0, 1]], [[0.5 + d, 0], [1, 0], [1, 1], [0.5 - d, 1]]]; }
function slant3(d) {
  return [[[0, 0], [1 / 3 + d, 0], [1 / 3 - d, 1], [0, 1]], [[1 / 3 + d, 0], [2 / 3 + d, 0], [2 / 3 - d, 1], [1 / 3 - d, 1]], [[2 / 3 + d, 0], [1, 0], [1, 1], [2 / 3 - d, 1]]];
}
function slantRows(n, d) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    const ya0 = i === 0 ? 0 : a + d, ya1 = i === 0 ? 0 : a - d, yb0 = i === n - 1 ? 1 : b + d, yb1 = i === n - 1 ? 1 : b - d;
    out.push([[0, ya0], [1, ya1], [1, yb1], [0, yb0]]);
  }
  return out;
}

// 依照片張數分組。名稱只給程式看（縮圖直接畫格子）
export const LAYOUTS = {
  1: [rows([1])],
  2: [rows([2]), rows([1, 1]), rows([2], null, [[2, 1]]), rows([1, 1], [2, 1]), slant2(0.08), slantRows(2, 0.08)],
  3: [rows([3]), rows([1, 1, 1]), rows([1, 2]), rows([2, 1]), cols([1, 2]), cols([2, 1]), rows([1, 2], [3, 2]), slant3(0.06), slantRows(3, 0.05),
    [R(0, 0, 0.62, 1), R(0.62, 0, 0.38, 0.5), R(0.62, 0.5, 0.38, 0.5)]],
  4: [rows([2, 2]), rows([4]), rows([1, 1, 1, 1]), rows([1, 3], [2, 1]), cols([1, 3], [2, 1]), rows([3, 1], [1, 2]), rows([2, 2], null, [[2, 1], [1, 2]]),
    [[[0, 0], [0.55, 0], [0.45, 0.5], [0, 0.5]], [[0.55, 0], [1, 0], [1, 0.5], [0.45, 0.5]], [[0, 0.5], [0.45, 0.5], [0.55, 1], [0, 1]], [[0.45, 0.5], [1, 0.5], [1, 1], [0.55, 1]]],
    cols([1, 1, 2])],
  5: [rows([2, 3]), rows([3, 2]), rows([1, 2, 2], [2, 1, 1]), cols([2, 3]), rows([2, 1, 2]), cols([1, 4], [2, 1]), rows([1, 4], [2, 1]),
    [R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5), R(0.3, 0.3, 0.4, 0.4)]],
  6: [rows([3, 3]), rows([2, 2, 2]), rows([1, 2, 3], [2, 1, 1]), cols([3, 3]), rows([3, 1, 2], [1, 2, 1]), rows([1, 1, 1, 1, 1, 1]),
    [R(0, 0, 2 / 3, 2 / 3), R(2 / 3, 0, 1 / 3, 1 / 3), R(2 / 3, 1 / 3, 1 / 3, 1 / 3), R(0, 2 / 3, 1 / 3, 1 / 3), R(1 / 3, 2 / 3, 1 / 3, 1 / 3), R(2 / 3, 2 / 3, 1 / 3, 1 / 3)]],
  7: [rows([3, 1, 3], [1, 1.3, 1]), rows([2, 3, 2]), rows([1, 3, 3], [1.4, 1, 1]), cols([3, 4]), rows([4, 3])],
  8: [rows([4, 4]), rows([2, 2, 2, 2]), rows([3, 2, 3]), cols([4, 4]), rows([1, 3, 4], [1.6, 1, 1])],
  9: [rows([3, 3, 3]), rows([1, 4, 4], [1.6, 1, 1]), rows([4, 1, 4], [1, 1.6, 1]), cols([3, 3, 3]), rows([2, 3, 4])],
};

export const RATIOS = [
  { id: '1:1', v: 1 }, { id: '3:4', v: 3 / 4 }, { id: '4:5', v: 4 / 5 }, { id: '9:16', v: 9 / 16 },
  { id: '4:3', v: 4 / 3 }, { id: '16:9', v: 16 / 9 }, { id: '2:3', v: 2 / 3 },
];

// 拼長圖（醒圖的 stitchItems）：照片依原比例接起來，畫布比例跟著照片變
export function stitch(aspects, vertical) {
  if (vertical) {
    const hs = aspects.map(a => 1 / a), sum = hs.reduce((a, b) => a + b, 0); let y = 0;
    return { ratio: 1 / sum, cells: hs.map(h => { const c = R(0, y / sum, 1, h / sum); y += h; return c; }) };
  }
  const sum = aspects.reduce((a, b) => a + b, 0); let x = 0;
  return { ratio: sum, cells: aspects.map(w => { const c = R(x / sum, 0, w / sum, 1); x += w; return c; }) };
}

// ---------- 幾何 ----------
const EPS = 0.005; // 醒圖 shader 用 0.5% 判斷頂點是不是貼著畫布邊
function onBorder(a, b) {
  return (a[0] < EPS && b[0] < EPS) || (a[0] > 1 - EPS && b[0] > 1 - EPS) || (a[1] < EPS && b[1] < EPS) || (a[1] > 1 - EPS && b[1] > 1 - EPS);
}
function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

// 把格子換成像素座標並往內退：外緣退 outer，內部邊退 inner/2。回傳 {pts, border[]}（border[i] 表示第 i 條邊貼著外緣）
export function insetCell(poly, W, H, inner, outer) {
  const n = poly.length, border = poly.map((a, i) => onBorder(a, poly[(i + 1) % n]));
  let pts = poly.map(([x, y]) => [x * W, y * H]);
  const sgn = Math.sign(area(pts)) || 1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L * sgn, ny = dx / L * sgn, d = border[i] ? outer : inner / 2; // 內側法向量
    return { p: [a[0] + nx * d, a[1] + ny * d], d: [dx, dy] };
  });
  pts = lines.map((l, i) => {
    const m = lines[(i - 1 + n) % n];
    const den = m.d[0] * l.d[1] - m.d[1] * l.d[0];
    if (Math.abs(den) < 1e-9) return l.p;
    const t = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / den;
    return [m.p[0] + m.d[0] * t, m.p[1] + m.d[1] * t];
  });
  return { pts, border };
}

// 圓角多邊形路徑。round[i] 為 false 的頂點不做圓角
export function polyPath(ctx, pts, r, round) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const rr = round && !round[i] ? 0 : Math.min(r, Math.hypot(p[0] - a[0], p[1] - a[1]) / 2, Math.hypot(p[0] - b[0], p[1] - b[1]) / 2);
    const m = [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2];
    if (i === 0) ctx.moveTo(m[0], m[1]);
    if (rr > 0.5) ctx.arcTo(p[0], p[1], b[0], b[1], rr); else ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

export function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
