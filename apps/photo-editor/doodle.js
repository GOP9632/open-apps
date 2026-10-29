// 塗鴉筆、馬賽克筆：照 Hypic 的塗鴉和馬賽克，粗細 1~100、不透明度 0~100、羽化 0~100
// 每畫完一筆就畫進照片（跟消除一樣），可以用上一步復原
// 橡皮擦：擦掉塗鴉、馬賽克，露出畫之前的照片。同一張照片上畫過的都擦得到（中間用過美顏筆、換過分頁也一樣，評審 L62），
// 只擦畫過的地方：沒畫過塗鴉的地方（像美顏筆塗過的）擦不動。消除、合併、裁切換成新照片以後，之前的塗鴉就畫進照片了

export const DD_COLORS = ['ffffff', '000000', 'ff3b30', 'ff9500', 'ffcc00', '34c759', '30b0c7', '007aff', 'af52de', 'ff2d92'];
import { pinch, stageZoom } from './ui.js';
import { blurred } from './cblur.js';

const st = { tool: 'pen', color: 'ff3b30', size: 20, op: 100, feather: 0, param: 'size', mosaic: 'square' };
export const MOSAICS = [['square', '方格'], ['blur', '模糊'], ['glass', '毛玻璃']];

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
// 筆刷半徑（照片像素）：粗細 1~100 → 照片沒放大時是短邊的 0.2%~8%；照片放大幾倍筆刷就細幾倍
const radius = (W, H) => Math.min(W, H) * (0.002 + 0.078 * st.size / 100) / stageZoom.z;

// 塗鴉這一層（每張照片一份，S.dd）：每個畫過的像素記「畫之前的樣子」（pre，從沒畫過變成畫過的那一筆存）和蓋了多少（cov，0～255）。
// 256 一格，畫到才建。每一筆改到的 cov 跟著那一步存，復原、重做對調（pre 不用：只在 cov 從 0 變多時寫，那之後不會再改）
const TS = 256;
function eachTile(c, x0, y0, x1, y1, f) {
  for (let ty = Math.floor(y0 / TS); ty * TS < y1; ty++) for (let tx = Math.floor(x0 / TS); tx * TS < x1; tx++) f(ty * Math.ceil(c.width / TS) + tx, tx * TS, ty * TS);
}
function tileAt(L, c, k, X, Y) {
  let t = L.get(k);
  if (!t) { const w = Math.min(TS, c.width - X), h = Math.min(TS, c.height - Y); L.set(k, t = { x: X, y: Y, w, h, cov: new Uint8Array(w * h), pre: new Uint8ClampedArray(w * h * 4) }); }
  return t;
}
// [x0,x1)×[y0,y1) 每個像素：f(這格, 格子裡第幾個, 範圍裡第幾個)
function eachPx(L, c, x0, y0, x1, y1, make, f) {
  const w = x1 - x0;
  eachTile(c, x0, y0, x1, y1, (k, X, Y) => {
    const t = make ? tileAt(L, c, k, X, Y) : L.get(k);
    if (!t) return;
    const a0 = Math.max(x0, X), a1 = Math.min(x1, X + t.w), b0 = Math.max(y0, Y), b1 = Math.min(y1, Y + t.h);
    for (let y = b0; y < b1; y++) for (let x = a0, j = (y - Y) * t.w + a0 - X, i = (y - y0) * w + a0 - x0; x < a1; x++, j++, i++) f(t, j, i);
  });
}
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
function bake(S, pts) {
  const src = S.canvas, W = src.width, H = src.height, r = radius(W, H), cell = mosaicCell(W, H), L = S.dd ||= new Map(), dim = { width: W, height: H };
  // 羽化會往外暈開；馬賽克要多留幾格（模糊、毛玻璃會取到旁邊的像素）；方格的起點對齊整張照片的格子
  const pad = Math.ceil(r * (1 + st.feather / 100) + 2 + (st.tool === 'mosaic' ? cell * 2 : 0)), g = st.tool === 'mosaic' && st.mosaic === 'square' ? cell : 1;
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
  const ma = mask.getContext('2d').getImageData(0, 0, w, h).data, old = new Uint8Array(w * h), b = before.data;
  let after;
  if (st.tool === 'erase') {
    // 畫過的地方往「畫之前」換回去（擦多少換多少），蓋了多少跟著減
    after = new ImageData(new Uint8ClampedArray(b), w, h);
    const a = after.data;
    let any = false;
    eachPx(L, dim, x0, y0, x1, y1, false, (t, j, i) => {
      const c = old[i] = t.cov[j], e = ma[i * 4 + 3] / 255;
      if (!c || !e) return;
      for (let q = 0; q < 4; q++) a[i * 4 + q] = b[i * 4 + q] + (t.pre[j * 4 + q] - b[i * 4 + q]) * e + 0.5;
      t.cov[j] = Math.round(c * (1 - e)); any = true;
    });
    // 擦的地方本來就沒畫過：不記一步
    if (!any) return null;
  } else {
    const paint = newCanvas(w, h), px = paint.getContext('2d');
    if (st.tool === 'pen') { px.fillStyle = '#' + st.color; px.fillRect(0, 0, w, h); }
    else px.drawImage(mosaicOf(reg, cell), 0, 0);
    px.globalCompositeOperation = 'destination-in'; px.drawImage(mask, 0, 0);
    o.globalAlpha = st.op / 100; o.drawImage(paint, 0, 0);
    after = o.getImageData(0, 0, w, h);
    const op = st.op / 100;
    eachPx(L, dim, x0, y0, x1, y1, true, (t, j, i) => {
      const c = old[i] = t.cov[j], e = ma[i * 4 + 3] / 255 * op;
      if (!e) return;
      if (!c) for (let q = 0; q < 4; q++) t.pre[j * 4 + q] = b[i * 4 + q];
      t.cov[j] = 255 - Math.round((255 - c) * (1 - e));
    });
  }
  // 復原、重做：這塊的 cov 跟存起來的對調
  // （照片收起來過、這層已經放掉的話就不用換）
  const swap = () => S.dd === L && eachPx(L, dim, x0, y0, x1, y1, true, (t, j, i) => { const v = t.cov[j]; t.cov[j] = old[i]; old[i] = v; });
  return { x: x0, y: y0, before, after, aux: { ses: L, bytes: w * h, swap } };
}

export function tabDoodle(box, app) {
  const { item, setSlider, showTab } = app;
  const cats = document.querySelector('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['pen', '塗鴉筆'], ['mosaic', '馬賽克'], ['erase', '橡皮擦']].forEach(([k, lb]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: st.tool === k, onclick: () => { st.tool = k; showTab('doodle'); },
  })));
  if (st.tool === 'pen') {
    DD_COLORS.forEach(c => box.append(item({
      label: '', icon: `<span style="display:block;width:26px;height:26px;border-radius:50%;background:#${c};border:2px solid ${st.color === c ? '#ff5a7a' : '#8886'}"></span>`,
      on: st.color === c, onclick: () => { st.color = c; showTab('doodle'); },
    })));
  } else if (st.tool === 'mosaic') {
    MOSAICS.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: st.mosaic === k, onclick: () => { st.mosaic = k; showTab('doodle'); } })));
  }
  // 橡皮擦沒有不透明度（擦乾淨）
  const params = [['size', '粗細', 1, 20], ['op', '不透明度', 0, 100], ['feather', '羽化', 0, 0]].filter(x => st.tool !== 'erase' || x[0] !== 'op');
  if (!params.some(x => x[0] === st.param)) st.param = 'size';
  params.forEach(([k, lb]) => box.append(item({
    label: lb, icon: lb, cls: 'wide', on: st.param === k, onclick: () => { st.param = k; showTab('doodle'); },
  })));
  const [k, lb, min, def] = params.find(x => x[0] === st.param);
  setSlider(lb, min, 100, st[k], v => { st[k] = v; }, def);
  document.querySelector('#note').textContent = { pen: '在照片上畫。每畫一筆都可以用上一步復原。', mosaic: '塗抹要遮住的地方。', erase: '擦掉畫上去的塗鴉、馬賽克。' }[st.tool];
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
    ctx.globalAlpha = st.tool === 'erase' ? 0.4 : st.op / 100;
    if (st.tool === 'pen') { ctx.fillStyle = '#' + st.color; ctx.fillRect(0, 0, ov.width, ov.height); }
    else { ctx.fillStyle = st.tool === 'erase' ? '#fff' : 'rgba(128,128,128,0.8)'; ctx.fillRect(0, 0, ov.width, ov.height); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); ctx.globalCompositeOperation = 'source-over';
  };
  // 手指移動一格畫面只重畫一次（iPhone 一格畫面可能來兩三個移動事件，每次都把整串筆跡重算）；放開了就不畫
  let pv = 0;
  const previewSoon = () => { if (!pv) pv = requestAnimationFrame(() => { pv = 0; if (pts) preview(); }); };
  wrap.addEventListener('pointerdown', e => {
    if (app.tab() !== 'doodle' || !app.base || e.target.closest('.st,.tx') || e.button > 0 || pinch.on) return;
    e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    pts = [at(e)]; preview();
  });
  wrap.addEventListener('pointermove', e => {
    if (!pts) return;
    // 主執行緒忙的時候手指的移動會被併成一個事件：拿回中間每一點，筆跡才不會變成直線
    const ce = e.getCoalescedEvents?.();
    let add = false;
    for (const c of ce?.length ? ce : [e]) {
      const p = at(c), q = pts[pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) < 2) continue;
      pts.push(p); add = true;
    }
    if (add) previewSoon();
  });
  const up = () => {
    if (!pts) return;
    // 瘦臉、推臉這些變形開著時，畫面上的點換回原圖上的點，才會畫在手指下面
    const map = app.toSrc?.(), patch = bake(app.surf(), map ? pts.map(map) : pts);
    pts = null; ov?.remove(); ov = null;
    if (patch) { app.paint(patch); app.commit(); }
  };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  // 第二指放下是要縮放：這一筆不算
  addEventListener('pinchstart', () => { pts = null; ov?.remove(); ov = null; });
}
