// 摳圖圖層：把人像（或另一張照片）摳成可以移動、縮放、描邊、套形狀的圖層
// 跟醒圖一樣：形狀遮罩 5 種（圓形、心形、矩形、星形、三角形），可以調大小、羽化、角度、圓角
import { outlined, strokePad, alphaBox } from './outline.js';

export const LAYER_LIMIT = 25; // 醒圖：「最多只能新增 25 個」
export const SHAPES = [
  { id: 'circle', name: '圓形' },
  { id: 'love', name: '心形' },
  { id: 'rect', name: '矩形' },
  { id: 'star', name: '星形' },
  { id: 'triangle', name: '三角形' },
];
// 形狀遮罩預設：置中、大小 90%、不羽化、不旋轉、矩形圓角 0
export const MASK0 = { s: '', size: 90, feather: 0, angle: 0, radius: 0, cx: 0.5, cy: 0.5 };

// 圖層的圖存在這裡，歷史紀錄只存 id（每次擦除會換一個新 id，才能復原）
const store = new Map();
let seq = 0;
const newId = () => 'L' + (++seq) + '_' + Date.now().toString(36);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
export const MAX_LAYER = 2048;

// rgb：原本的像素（不透明），alpha：透明度（A 通道）。兩張一樣大
export function addImage(rgb, alpha, cut) {
  const id = newId();
  store.set(id, { rgb, alpha, cut: !!cut });
  return id;
}
export const layerInfo = id => store.get(id);
export function cloneAlpha(id) {
  const L = store.get(id), a = canvas(L.alpha.width, L.alpha.height);
  a.getContext('2d').drawImage(L.alpha, 0, 0);
  return addImage(L.rgb, a, L.cut);
}
// 照片 → 整張不透明的圖層
export function photoLayer(src) {
  const k = Math.min(1, MAX_LAYER / Math.max(src.width, src.height));
  const rgb = canvas(src.width * k, src.height * k);
  rgb.getContext('2d').drawImage(src, 0, 0, rgb.width, rgb.height);
  const alpha = canvas(rgb.width, rgb.height), ac = alpha.getContext('2d');
  ac.fillStyle = '#fff'; ac.fillRect(0, 0, alpha.width, alpha.height);
  return addImage(rgb, alpha, false);
}
// 照片 + 透明度（同尺寸）→ 只留主體、裁到主體範圍的圖層。回傳 { id, box }，box 是在 src 上的範圍
export function cutLayer(src, alphaC) {
  const box = alphaBox(alphaC);
  if (!box) return null;
  const k = Math.min(1, MAX_LAYER / Math.max(box.w, box.h));
  const rgb = canvas(box.w * k, box.h * k), alpha = canvas(box.w * k, box.h * k);
  rgb.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, rgb.width, rgb.height);
  alpha.getContext('2d').drawImage(alphaC, box.x, box.y, box.w, box.h, 0, 0, alpha.width, alpha.height);
  return { id: addImage(rgb, alpha, true), box };
}

// 形狀的路徑，畫在 (0,0) 為中心、s 為大小
export function shapePath(ctx, shape, w, h, radius) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
  else if (shape === 'rect') {
    const r = Math.min(w, h) / 2 * radius / 100;
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h);
  } else if (shape === 'love') {
    const s = Math.min(w, h);
    ctx.moveTo(0, s * 0.42);
    ctx.bezierCurveTo(-s * 0.62, s * 0.02, -s * 0.56, -s * 0.5, -s * 0.24, -s * 0.48);
    ctx.bezierCurveTo(-s * 0.09, -s * 0.47, 0, -s * 0.38, 0, -s * 0.28);
    ctx.bezierCurveTo(0, -s * 0.38, s * 0.09, -s * 0.47, s * 0.24, -s * 0.48);
    ctx.bezierCurveTo(s * 0.56, -s * 0.5, s * 0.62, s * 0.02, 0, s * 0.42);
  } else if (shape === 'star') {
    const R = Math.min(w, h) / 2, r = R * 0.45;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.05 + R * 0.06);
    }
  } else if (shape === 'triangle') {
    const s = Math.min(w, h);
    ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.5, s * 0.37); ctx.lineTo(-s * 0.5, s * 0.37);
  }
  ctx.closePath();
}
// 形狀遮罩畫成一張透明度圖（羽化用陰影模糊做，iPhone Safari 也支援）
export function shapeMask(W, H, m) {
  const c = canvas(W, H), ctx = c.getContext('2d');
  const s = m.size / 100, w = m.s === 'rect' ? W * s : Math.min(W, H) * s, h = m.s === 'rect' ? H * s : w;
  const f = m.feather / 100 * Math.min(W, H) * 0.15;
  ctx.fillStyle = '#fff';
  const drawAt = dx => {
    ctx.save(); ctx.translate(m.cx * W + dx, m.cy * H); ctx.rotate(m.angle * Math.PI / 180);
    shapePath(ctx, m.s, w, h, m.radius); ctx.fill(); ctx.restore();
  };
  if (f > 0.5) {
    // 形狀畫在畫布外面，只留下它的模糊陰影
    const off = W + f * 4;
    ctx.shadowColor = '#fff'; ctx.shadowBlur = f; ctx.shadowOffsetX = off;
    drawAt(-off);
  } else drawAt(0);
  return c;
}

// 合成一個圖層：原圖 × 透明度 × 形狀 → 再加描邊。結果會快取
const compCache = new Map();
export function compose(s) {
  const L = store.get(s.v);
  if (!L) return null;
  const key = s.v + '|' + JSON.stringify(s.mk || '') + JSON.stringify(s.st || '');
  if (compCache.has(key)) return compCache.get(key);
  const W = L.rgb.width, H = L.rgb.height, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.drawImage(L.rgb, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(L.alpha, 0, 0);
  if (s.mk?.s) ctx.drawImage(shapeMask(W, H, s.mk), 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  let out = { canvas: c, pad: 0, w: W, h: H };
  if (s.st?.t) { const o = outlined(c, s.st); out = { canvas: o.canvas, pad: o.pad, w: W, h: H }; }
  if (compCache.size > 30) compCache.delete(compCache.keys().next().value);
  compCache.set(key, out);
  return out;
}
export const padOf = s => { const L = store.get(s.v); return L ? strokePad(s.st, L.rgb.width, L.rgb.height) : 0; };

// 擦除／補回：在圖層的透明度上畫一筆（x, y 是圖層內的像素座標）
// hard：硬度 0~100（照 Hypic 手動摳圖預設 80），越低邊緣越柔
export function brush(id, pts, r, restore, hard = 80) {
  const L = store.get(id), ctx = L.alpha.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = restore ? 'source-over' : 'destination-out';
  ctx.strokeStyle = ctx.fillStyle = '#fff'; ctx.lineWidth = r * 2; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.shadowColor = '#fff'; ctx.shadowBlur = r * 2 * (1 - hard / 100);
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  if (pts.length === 1) { ctx.arc(pts[0].x, pts[0].y, r, 0, 7); ctx.fill(); } else ctx.stroke();
  ctx.restore();
  for (const k of [...compCache.keys()]) if (k.startsWith(id + '|')) compCache.delete(k);
}
