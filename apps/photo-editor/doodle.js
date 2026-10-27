// 塗鴉筆、馬賽克筆：照 Hypic 的塗鴉和馬賽克，粗細 1~100、不透明度 0~100、羽化 0~100
// 每畫完一筆就畫進照片（跟消除一樣），可以用上一步復原

export const DD_COLORS = ['ffffff', '000000', 'ff3b30', 'ff9500', 'ffcc00', '34c759', '30b0c7', '007aff', 'af52de', 'ff2d92'];
import { pinch, stageZoom } from './ui.js';
import { blurred } from './cblur.js';

const st = { tool: 'pen', color: 'ff3b30', size: 20, op: 100, feather: 0, param: 'size', mosaic: 'square' };
export const MOSAICS = [['square', '方格'], ['blur', '模糊'], ['glass', '毛玻璃']];

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
// 筆刷半徑（照片像素）：粗細 1~100 → 照片沒放大時是短邊的 0.2%~8%；照片放大幾倍筆刷就細幾倍
const radius = (W, H) => Math.min(W, H) * (0.002 + 0.078 * st.size / 100) / stageZoom.z;

// 照片上的一筆 → 遮罩（白色、羽化過）
function strokeMask(pts, W, H, r = radius(W, H)) {
  const c = newCanvas(W, H), ctx = c.getContext('2d');
  const f = st.feather / 100 * r;
  ctx.strokeStyle = ctx.fillStyle = '#fff'; ctx.lineWidth = r * 2 * (1 - 0.4 * st.feather / 100); ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
  ctx.stroke();
  return f > 0.5 ? blurred(c, f) : c;
}
// 馬賽克的底圖：方格（縮小再放大）、模糊、毛玻璃（亂數挪動像素）
// cell：方格大小（照整張照片算，只算一塊時格子才對得齊）
const mosaicCell = (W, H) => Math.max(4, Math.round(Math.min(W, H) * (0.008 + 0.03 * st.size / 100)));
function mosaicOf(src, cell) {
  const W = src.width, H = src.height;
  const out = newCanvas(W, H), ctx = out.getContext('2d');
  if (st.mosaic === 'blur') return blurred(src, cell * 0.8);
  if (st.mosaic === 'glass') {
    const n = 6;
    for (let i = 0; i < n; i++) { ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(src, (Math.sin(i * 2.4) * cell) * 0.6, (Math.cos(i * 2.4) * cell) * 0.6); }
    return blurred(out, cell * 0.25);
  }
  const s = newCanvas(W / cell, H / cell), sx = s.getContext('2d');
  sx.drawImage(src, 0, 0, s.width, s.height);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(s, 0, 0, W, H);
  return out;
}
// 一筆畫進照片：只算筆跡附近那一塊，回傳 { x, y, before, after }（那一塊畫之前、之後的像素），
// app 直接改在同一張照片上，復原只存這一塊，不用每筆複製好幾張原尺寸照片
function bake(src, pts) {
  const W = src.width, H = src.height, r = radius(W, H), cell = mosaicCell(W, H);
  // 羽化會往外暈開；馬賽克要多留幾格（模糊、毛玻璃會取到旁邊的像素）；方格的起點對齊整張照片的格子
  const pad = Math.ceil(r * (1 + st.feather / 100) + 2 + (st.tool === 'pen' ? 0 : cell * 2)), g = st.tool !== 'pen' && st.mosaic === 'square' ? cell : 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  x0 = Math.max(0, Math.floor((x0 - pad) / g) * g); y0 = Math.max(0, Math.floor((y0 - pad) / g) * g);
  x1 = Math.min(W, Math.ceil((x1 + pad) / g) * g); y1 = Math.min(H, Math.ceil((y1 + pad) / g) * g);
  const w = x1 - x0, h = y1 - y0;
  if (w < 1 || h < 1) return null;
  const reg = newCanvas(w, h), o = reg.getContext('2d', { willReadFrequently: true });
  o.drawImage(src, x0, y0, w, h, 0, 0, w, h);
  const before = o.getImageData(0, 0, w, h);
  const mask = strokeMask(pts.map(p => ({ x: p.x - x0, y: p.y - y0 })), w, h, r);
  const paint = newCanvas(w, h), px = paint.getContext('2d');
  if (st.tool === 'pen') { px.fillStyle = '#' + st.color; px.fillRect(0, 0, w, h); }
  else px.drawImage(mosaicOf(reg, cell), 0, 0);
  px.globalCompositeOperation = 'destination-in'; px.drawImage(mask, 0, 0);
  o.globalAlpha = st.op / 100; o.drawImage(paint, 0, 0);
  return { x: x0, y: y0, before, after: o.getImageData(0, 0, w, h) };
}

export function tabDoodle(box, app) {
  const { item, setSlider, showTab } = app;
  const cats = document.querySelector('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['pen', '塗鴉筆'], ['mosaic', '馬賽克']].forEach(([k, lb]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: st.tool === k, onclick: () => { st.tool = k; showTab('doodle'); },
  })));
  if (st.tool === 'pen') {
    DD_COLORS.forEach(c => box.append(item({
      label: '', icon: `<span style="display:block;width:26px;height:26px;border-radius:50%;background:#${c};border:2px solid ${st.color === c ? '#ff5a7a' : '#8886'}"></span>`,
      on: st.color === c, onclick: () => { st.color = c; showTab('doodle'); },
    })));
  } else {
    MOSAICS.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: st.mosaic === k, onclick: () => { st.mosaic = k; showTab('doodle'); } })));
  }
  [['size', '粗細', 1, 20], ['op', '不透明度', 0, 100], ['feather', '羽化', 0, 0]].forEach(([k, lb]) => box.append(item({
    label: lb, icon: lb, cls: 'wide', on: st.param === k, onclick: () => { st.param = k; showTab('doodle'); },
  })));
  const [k, lb, min, def] = [['size', '粗細', 1, 20], ['op', '不透明度', 0, 100], ['feather', '羽化', 0, 0]].find(x => x[0] === st.param);
  setSlider(lb, min, 100, st[k], v => { st[k] = v; }, def);
  document.querySelector('#note').textContent = st.tool === 'pen' ? '在照片上畫。每畫一筆都可以用上一步復原。' : '塗抹要遮住的地方。';
}

// 畫的時候先畫在照片上面的透明畫布，放開手指才畫進照片
export function doodleInput(wrap, app) {
  let pts = null, ov = null;
  const at = e => { const r = wrap.getBoundingClientRect(), b = app.base.canvas; return { x: (e.clientX - r.left) / r.width * b.width, y: (e.clientY - r.top) / r.height * b.height }; };
  const preview = () => {
    const b = app.base.canvas, k = Math.min(1, 1200 / Math.max(b.width, b.height));
    if (!ov) { ov = newCanvas(b.width * k, b.height * k); ov.id = 'ddov'; wrap.append(ov); }
    const ctx = ov.getContext('2d'), m = strokeMask(pts.map(p => ({ x: p.x * k, y: p.y * k })), ov.width, ov.height);
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.globalAlpha = st.op / 100;
    if (st.tool === 'pen') { ctx.fillStyle = '#' + st.color; ctx.fillRect(0, 0, ov.width, ov.height); }
    else { ctx.fillStyle = 'rgba(128,128,128,0.8)'; ctx.fillRect(0, 0, ov.width, ov.height); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); ctx.globalCompositeOperation = 'source-over';
  };
  wrap.addEventListener('pointerdown', e => {
    if (app.tab() !== 'doodle' || !app.base || e.target.closest('.st,.tx') || e.button > 0 || pinch.on) return;
    e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    pts = [at(e)]; preview();
  });
  wrap.addEventListener('pointermove', e => {
    if (!pts) return;
    const p = at(e), q = pts[pts.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 2) return;
    pts.push(p); preview();
  });
  const up = () => {
    if (!pts) return;
    // 瘦臉、推臉這些變形開著時，畫面上的點換回原圖上的點，才會畫在手指下面
    const map = app.toSrc?.(), patch = bake(app.base.canvas, map ? pts.map(map) : pts);
    pts = null; ov?.remove(); ov = null;
    if (patch) { app.paint(patch); app.commit(); }
  };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  // 第二指放下是要縮放：這一筆不算
  addEventListener('pinchstart', () => { pts = null; ov?.remove(); ov = null; });
}
