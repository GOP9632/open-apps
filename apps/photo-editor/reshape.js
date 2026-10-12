// 重新塑形（液化）：照 Hypic 修飾 › 重新塑形的 6 個工具，用手指在照片上推、轉、脹大、縮小、還原
//
// 每一筆拆成很多個小「點」（跟臉型滑桿一樣的局部變形：推移、縮放、旋轉），
// 存在 P.liq，交給 warpfield.js 跟臉型的變形一起算成位移圖。座標都除以照片長邊，換解析度也一樣。
// 大小、強度的範圍和預設照 Hypic（1~100）。

export const RESHAPE = [
  { id: 'push', name: '彎曲', size: 40, str: 50, icon: '<svg viewBox="0 0 24 24"><path d="M4 16c4 0 5-8 9-8h7"/><path d="M17 5l3 3-3 3"/></svg>' },
  { id: 'cw', name: '順時針旋轉', size: 30, str: 50, icon: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M17 2v4h-4"/></svg>' },
  { id: 'ccw', name: '逆時針旋轉', size: 30, str: 50, icon: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M7 2v4h4"/></svg>' },
  { id: 'bloat', name: '脹大', size: 30, str: 20, icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5"/></svg>' },
  { id: 'pucker', name: '縮小', size: 30, str: 20, icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5M9 9L6 6M15 9l3-3M9 15l-3 3M15 15l3 3"/></svg>' },
  { id: 'restore', name: '還原', size: 40, str: 80, icon: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/></svg>' },
];
const MAX = 800;

// 筆刷半徑（照片像素）：大小 1~100 → 短邊的 2%~22%
export const liqRadius = (size, W, H) => Math.min(W, H) * (0.02 + 0.2 * size / 100);

// 一筆畫到一半：從 a 移到 b（照片像素），回傳新的 liq 陣列
export function liqDab(liq, tool, a, b, size, str, W, H) {
  const M = Math.max(W, H), r = liqRadius(size, W, H), k = str / 100;
  const out = liq ? liq.slice() : [];
  const add = m => out.push({ ...m, cx: m.cx / M, cy: m.cy / M, r: m.r / M, ...(m.t === 0 ? { a: m.a / M, b: m.b / M } : {}) });
  const dx = b.x - a.x, dy = b.y - a.y;
  if (tool === 'push') {
    if (!dx && !dy) return out;
    add({ t: 0, cx: a.x, cy: a.y, r, a: dx * (0.4 + 0.8 * k), b: dy * (0.4 + 0.8 * k) });
  } else if (tool === 'cw' || tool === 'ccw') {
    add({ t: 2, cx: b.x, cy: b.y, r, a: (tool === 'cw' ? 1 : -1) * 0.1 * k });
  } else if (tool === 'bloat' || tool === 'pucker') {
    const s = (tool === 'bloat' ? 1 : -1) * 0.1 * k;
    add({ t: 1, cx: b.x, cy: b.y, r, a: s, b: s });
  } else if (tool === 'restore') {
    // 還原：筆刷底下的變形照距離減弱，太小的直接拿掉
    const res = [];
    for (const m of out) {
      const d = Math.hypot(m.cx * M - b.x, m.cy * M - b.y) / (r + m.r * M);
      const f = d < 1 ? 1 - k * 0.5 * (1 - d * d) : 1;
      const n = { ...m, a: m.a * f, b: (m.b || 0) * f };
      const tiny = m.t === 0 ? 0.3 / M : 0.002;
      if (Math.abs(n.a) > tiny || Math.abs(n.b) > tiny) res.push(n);
    }
    return res;
  }
  return out.length > MAX ? merge(out) : out;
}

// 點太多時，把最舊的兩個同類型、位置相近的點合在一起
function merge(liq) {
  const out = liq.slice(-MAX * 0.75);
  const old = liq.slice(0, liq.length - out.length), keep = [];
  for (const m of old) {
    const j = keep.findIndex(q => q.t === m.t && Math.hypot(q.cx - m.cx, q.cy - m.cy) < Math.min(q.r, m.r) * 0.3 && Math.abs(q.r - m.r) < q.r * 0.2);
    if (j >= 0) { keep[j] = { ...keep[j], a: keep[j].a + m.a, b: (keep[j].b || 0) + (m.b || 0) }; } else keep.push(m);
  }
  return [...keep, ...out];
}

// P.liq → evalField 要的 moves（照片像素）；還有每筆要細網格的範圍
export function liqMoves(liq, W, H) {
  if (!liq?.length) return { moves: [], boxes: [] };
  const M = Math.max(W, H);
  const moves = liq.map(m => ({ t: m.t, cx: m.cx * M, cy: m.cy * M, r: m.r * M, cos: 1, sin: 0, asp: 1, a: m.t === 0 ? m.a * M : m.a, b: m.t === 0 ? m.b * M : (m.b || 0) }));
  // 網格範圍：所有點的外框（再大一點），格子大小照最小的筆刷
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, rMin = Infinity;
  for (const m of moves) { x0 = Math.min(x0, m.cx - m.r); y0 = Math.min(y0, m.cy - m.r); x1 = Math.max(x1, m.cx + m.r); y1 = Math.max(y1, m.cy + m.r); rMin = Math.min(rMin, m.r); }
  return { moves, boxes: [{ x0, y0, x1, y1, cell: Math.max(2, rMin / 8) }] };
}
