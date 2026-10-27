// 重新塑形（液化）：照 Hypic 修飾 › 重新塑形的 6 個工具，用手指在照片上推、轉、脹大、縮小、還原
//
// 每一筆拆成很多個小「下」，存在 P.liq（座標除以照片長邊，換解析度也一樣），由 gl.js 的 liqSync 畫成位移場。
// 每一下都是照「現在畫面上看到的樣子」去推（跟醒圖、Photoshop 液化一樣），推很多次也不會疊出坑。
// 「還原」排在「彎曲」旁邊：大筆刷推到背景時常常要用（醒圖是經典推臉、快速推臉、復原），手機上排最後會被擠到畫面外。
// 大小、強度的範圍照 Hypic（1~100）；彎曲的強度預設照 Hypic 20（醒圖「壓力」預設 28），強度 1 幾乎推不動，可以一點一點推。

import { stageZoom } from './ui.js';

export const RESHAPE = [
  { id: 'push', name: '彎曲', size: 40, str: 20, icon: '<svg viewBox="0 0 24 24"><path d="M4 16c4 0 5-8 9-8h7"/><path d="M17 5l3 3-3 3"/></svg>' },
  { id: 'restore', name: '還原', size: 40, str: 80, icon: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/></svg>' },
  { id: 'cw', name: '順時針旋轉', size: 30, str: 50, icon: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M17 2v4h-4"/></svg>' },
  { id: 'ccw', name: '逆時針旋轉', size: 30, str: 50, icon: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M7 2v4h4"/></svg>' },
  { id: 'bloat', name: '脹大', size: 30, str: 20, icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5"/></svg>' },
  { id: 'pucker', name: '縮小', size: 30, str: 20, icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5M9 9L6 6M15 9l3-3M9 15l-3 3M15 15l3 3"/></svg>' },
];
// 筆刷半徑（照片像素）：大小 1~100 → 照片沒放大時是短邊的 0.7%~22%；照片放大幾倍筆刷就細幾倍（螢幕上看起來一樣大）
export const liqRadius = (size, W, H) => Math.min(W, H) * (0.005 + 0.215 * size / 100) / stageZoom.z;

// 一筆畫到一半：從 a 移到 b（照片像素），回傳新的 liq 陣列（只在後面加，前面的不動，gl.js 才能只算新加的）
//   t 0 推：a、b 是位移；1 脹大／縮小：a 是比例；2 旋轉：a 是角度；3 還原：a 是還原多少
export function liqDab(liq, tool, a, b, size, str, W, H) {
  const M = Math.max(W, H), r = liqRadius(size, W, H), k = str / 100;
  const out = liq ? liq.slice() : [];
  const add = (t, x, y, va, vb = 0) => out.push({ t, cx: x / M, cy: y / M, r: r / M, a: va, b: vb });
  if (tool === 'push') {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (!d) return out;
    // 手指一次走太遠就拆成好幾下（每下不超過筆刷半徑的 1/4），推出來才順、不會摺起來。
    // 被推的地方跟著手指走的比例 = 強度：100 整個跟著走，20 走兩成，1 只走百分之一
    const n = Math.ceil(d / (r * 0.25));
    for (let i = 0; i < n; i++) add(0, a.x + dx * i / n, a.y + dy * i / n, dx / n * k / M, dy / n * k / M);
  } else if (tool === 'cw' || tool === 'ccw') {
    add(2, b.x, b.y, (tool === 'cw' ? 1 : -1) * 0.1 * k);
  } else if (tool === 'bloat' || tool === 'pucker') {
    add(1, b.x, b.y, (tool === 'bloat' ? 1 : -1) * 0.1 * k);
  } else if (tool === 'restore') {
    // 畫一筆還原一點：沿著手指每走 0.12 個半徑點一下（點的量照走的距離），按住不動不會一直還原。
    // 一筆劃過的地方大約還原「強度 × 50%」：直線劃過時每點的權重加起來約 8.9（(1−t²)² 積分 ÷ 0.12）
    const step = r * 0.12, A = -Math.log(1 - 0.5 * k) / 8.9;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (!d) add(3, b.x, b.y, A);
    else { const n = Math.ceil(d / step); for (let i = 1; i <= n; i++) add(3, a.x + dx * i / n, a.y + dy * i / n, A * d / n / step); }
  }
  return out;
}
