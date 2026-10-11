// 拼貼與範本：多張照片排進版型（一般、長圖）、海報、範本。
// 醒圖的拼貼頁分「版型（jigsawItems，依比例分組）、範本（templateItems）、長圖（stitchItems）」，
// 另有一般、海報兩種模式；每格可以單獨換照片、套濾鏡（有強度）、翻轉旋轉，長按拖曳交換位置。
// 這裡用 2D canvas 自己畫，預覽和存檔走同一個函式，只差解析度。

import { LAYOUTS, RATIOS, stitch, insetCell, polyPath, inPoly, bbox } from './layouts.js';
import { TEMPLATES, CATS, FONTS, FONT_LIST, BGS, tplById, paintBg, paintDeco, dateText } from './templates.js';
import { FILTERS } from './filters.js';

const MAX_PHOTOS = 9, FULL = 1800, SMALL = 360, OUT_LONG = 2400;
const $ = s => document.querySelector(s);
const TEXT_COLORS = ['#ffffff', '#111111', '#ff5c8a', '#ffb000', '#2a9df4', '#2a9d8f', '#e76f51', '#7b5cff', '#c0392b'];

let H = null;   // 主程式給的工具：loadFile、toast、busy
let S = null;   // 目前狀態
let thumbs = {}; // 範本縮圖快取
let filePurpose = null;

export function initCollage(hooks) {
  H = hooks;
  buildDom();
}

// ---------- 開啟 ----------
// what：'grid'（一般拼貼）、'tpl'（範本）、'poster'（海報）
export async function openCollage(what, sources) {
  H.busy('讀取照片…');
  try {
    const photos = [];
    for (const s of sources.slice(0, MAX_PHOTOS)) { const p = await toPhoto(s); if (p) photos.push(p); }
    if (!photos.length) { H.toast('照片打不開'); return; }
    S = {
      photos, mode: what, sub: 'layout', tplCat: CATS[0], slider: 'inner',
      grid: { idx: 0, stitch: '', ratio: photos.length === 1 ? '3:4' : '1:1', inner: 30, outer: 30, radius: 0, bg: 'white' },
      tpl: null, cells: [], texts: [], sel: null, ver: 1,
    };
    thumbs = {};
    if (what !== 'grid') S.tpl = pickTpl(what === 'poster' ? '海報' : S.tplCat).id;
    if (what === 'poster') S.tplCat = '海報';
    resetCells();
    $('#cg').classList.add('on');
    requestAnimationFrame(() => { fit(); refresh(); });
  } finally { H.busy(); }
}
function pickTpl(cat) {
  const n = S.photos.length, list = TEMPLATES.filter(t => t.cat.includes(cat));
  return list.find(t => uniq(t) === n) || list.find(t => uniq(t) >= n) || list[0];
}
const uniq = t => new Set(t.slots.map((s, i) => s.p ?? i)).size;

async function toPhoto(src) {
  try {
    let bmp = src;
    if (src instanceof Blob) bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }).catch(async () => {
      const img = new Image(); img.src = URL.createObjectURL(src); await img.decode(); return img;
    });
    const mk = max => { const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c; };
    return { full: mk(FULL), small: mk(SMALL), cache: {} };
  } catch (e) { console.error(e); return null; }
}

// ---------- 版面資料 ----------
function design() {
  if (S.mode !== 'grid' && S.tpl) {
    const t = tplById(S.tpl);
    return { ratio: t.ratio, bg: t.bg, deco: t.deco || [], under: t.under, filter: t.filter, slots: t.slots.map(s => ({ ...s, kind: 'rect' })) };
  }
  const g = S.grid, n = Math.min(S.photos.length, MAX_PHOTOS);
  let cells, ratio = RATIOS.find(r => r.id === g.ratio).v;
  if (g.stitch) {
    const st = stitch(S.photos.slice(0, n).map(p => p.full.width / p.full.height), g.stitch === 'v');
    cells = st.cells; ratio = st.ratio;
  } else cells = (LAYOUTS[n] || LAYOUTS[1])[g.idx] || LAYOUTS[n][0];
  return { ratio, bg: BGS.find(b => b.id === g.bg).bg, deco: [], slots: cells.map(poly => ({ kind: 'poly', poly })), grid: true };
}

function resetCells() {
  const d = design(), old = S.cells;
  S.cells = d.slots.map((s, i) => {
    const p = s.p ?? i, o = old[i];
    return { p: o && S.mode === 'grid' ? o.p : (p < S.photos.length ? p : null), zoom: 1, ox: 0, oy: 0, flip: o?.flip || false, rot: o?.rot || 0, filter: o?.filter || '', fAmt: o?.fAmt ?? 80 };
  });
  const user = S.texts.filter(t => t.user);
  const tt = S.mode !== 'grid' && S.tpl ? (tplById(S.tpl).texts || []) : [];
  S.texts = tt.map(t => ({ ...t })).concat(user);
  S.sel = null;
}

// 每一格在畫布上的位置。回傳 {cx,cy,w,h,rot,path(ctx),hit(x,y),frame}
function geometry(d, W, Hh) {
  const u = Math.min(W, Hh), g = S.grid;
  return d.slots.map(s => {
    if (s.kind === 'poly') {
      const ins = insetCell(s.poly, W, Hh, g.inner / 1000 * u, g.outer / 1000 * u), bb = bbox(ins.pts);
      const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, pts = ins.pts.map(([x, y]) => [x - cx, y - cy]), n = pts.length;
      const round = g.outer > 0 ? null : pts.map((_, i) => !ins.border[(i - 1 + n) % n] && !ins.border[i]);
      const r = g.radius / 100 * Math.min(bb.w, bb.h) / 2;
      return { cx, cy, w: bb.w, h: bb.h, rot: 0, path: c => polyPath(c, pts, r, round), inside: (x, y) => inPoly(pts, x, y) };
    }
    const [x, y, w, h] = s.r, pw = w * W, ph = h * Hh, rad = (s.rad || 0) * Math.min(pw, ph);
    return { cx: (x + w / 2) * W, cy: (y + h / 2) * Hh, w: pw, h: ph, rot: (s.rot || 0) * Math.PI / 180, frame: s.frame, rad,
      path: c => { c.beginPath(); c.roundRect(-pw / 2, -ph / 2, pw, ph, rad); }, inside: (lx, ly) => Math.abs(lx) <= pw / 2 && Math.abs(ly) <= ph / 2 };
  });
}
const toLocal = (g, x, y) => { const dx = x - g.cx, dy = y - g.cy, c = Math.cos(-g.rot), s = Math.sin(-g.rot); return [dx * c - dy * s, dx * s + dy * c]; };

// ---------- 濾鏡（CPU 查表，三線性內插） ----------
const luts = {};
function lut(id) {
  if (luts[id]) return luts[id];
  const fn = FILTERS.find(f => f.id === id)?.fn, N = 33, t = new Float32Array(N * N * N * 3);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = fn ? fn(r / (N - 1), g / (N - 1), b / (N - 1)) : [r / (N - 1), g / (N - 1), b / (N - 1)], i = ((b * N + g) * N + r) * 3;
    t[i] = o[0] * 255; t[i + 1] = o[1] * 255; t[i + 2] = o[2] * 255;
  }
  return luts[id] = t;
}
function filtered(src, id) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, t = lut(id), N = 33, k = (N - 1) / 255;
  for (let i = 0; i < d.length; i += 4) {
    const fr = d[i] * k, fg = d[i + 1] * k, fb = d[i + 2] * k;
    const r0 = Math.min(fr | 0, N - 2), g0 = Math.min(fg | 0, N - 2), b0 = Math.min(fb | 0, N - 2), dr = fr - r0, dg = fg - g0, db = fb - b0;
    const i000 = ((b0 * N + g0) * N + r0) * 3, sR = 3, sG = N * 3, sB = N * N * 3;
    for (let ch = 0; ch < 3; ch++) {
      const a = i000 + ch;
      const c00 = t[a] + (t[a + sR] - t[a]) * dr, c10 = t[a + sG] + (t[a + sG + sR] - t[a + sG]) * dr;
      const c01 = t[a + sB] + (t[a + sB + sR] - t[a + sB]) * dr, c11 = t[a + sB + sG] + (t[a + sB + sG + sR] - t[a + sB + sG]) * dr;
      const c0 = c00 + (c10 - c00) * dg, c1 = c01 + (c11 - c01) * dg;
      d[i + ch] = c0 + (c1 - c0) * db;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function img(pi, id, small) {
  const p = S.photos[pi], src = small ? p.small : p.full;
  if (!id || id === 'none') return src;
  const key = (small ? 's' : 'f') + id;
  return p.cache[key] || (p.cache[key] = filtered(src, id));
}

// ---------- 畫 ----------
function render(ctx, W, Hh, opt = {}) {
  const d = design(), u = W;
  const first = S.cells.find(c => c.p != null);
  paintBg(ctx, d.bg, W, Hh, first ? img(first.p, '', true) : null);
  if (d.under) d.deco.forEach(x => paintDeco(ctx, x, W, Hh));
  const geo = geometry(d, W, Hh);
  geo.forEach((g, i) => drawSlot(ctx, g, S.cells[i], d, u, opt));
  if (!d.under) d.deco.forEach(x => paintDeco(ctx, x, W, Hh));
  const hits = S.texts.map((t, i) => drawText(ctx, t, W, Hh, geo, opt.preview && S.sel?.k === 'text' && S.sel.i === i));
  if (opt.preview && S.sel?.k === 'cell' && geo[S.sel.i]) outline(ctx, geo[S.sel.i], u, '#ff5c8a');
  if (opt.preview && opt.target != null && geo[opt.target]) outline(ctx, geo[opt.target], u, '#ffffff');
  return { geo, hits };
}
function outline(ctx, g, u, color) {
  ctx.save(); ctx.translate(g.cx, g.cy); ctx.rotate(g.rot); g.path(ctx);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, u * 0.006); ctx.stroke(); ctx.restore();
}
function drawSlot(ctx, g, cell, d, u, opt) {
  ctx.save(); ctx.translate(g.cx, g.cy); ctx.rotate(g.rot);
  const f = g.frame, sh = () => { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = u * 0.025; ctx.shadowOffsetY = u * 0.008; };
  if (f) {
    ctx.save(); if (f.shadow) sh();
    if (f.kind === 'polaroid') {
      const [l, t, r, b] = f.pad.map(v => v * g.w);
      ctx.fillStyle = f.c || '#fbfaf6'; ctx.fillRect(-g.w / 2 - l, -g.h / 2 - t, g.w + l + r, g.h + t + b);
    } else if (f.kind === 'border') {
      const bw = f.w * u; ctx.fillStyle = f.c; ctx.beginPath(); ctx.roundRect(-g.w / 2 - bw, -g.h / 2 - bw, g.w + bw * 2, g.h + bw * 2, g.rad ? g.rad + bw : 0); ctx.fill();
    } else { ctx.fillStyle = '#000'; g.path(ctx); ctx.fill(); }
    ctx.restore();
  }
  g.path(ctx); ctx.clip();
  if (cell && cell.p != null && S.photos[cell.p]) {
    const fid = cell.filter || d.filter || '';
    const base = img(cell.p, '', opt.small), im = fid && fid !== 'none' ? img(cell.p, fid, opt.small) : null;
    const odd = cell.rot % 2, iw = odd ? base.height : base.width, ih = odd ? base.width : base.height;
    const s = Math.max(g.w / iw, g.h / ih) * cell.zoom;
    ctx.translate(cell.ox * g.w, cell.oy * g.h); ctx.rotate(cell.rot * Math.PI / 2); if (cell.flip) ctx.scale(-1, 1);
    const dw = base.width * s, dh = base.height * s;
    if (!im || cell.fAmt < 100) ctx.drawImage(base, -dw / 2, -dh / 2, dw, dh);
    if (im) { ctx.globalAlpha = (cell.filter ? cell.fAmt : 100) / 100; ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh); }
  } else {
    ctx.fillStyle = '#e4e4e8'; ctx.fillRect(-g.w, -g.h, g.w * 2, g.h * 2);
    if (opt.preview || opt.small) {
      const k = Math.min(g.w, g.h) * 0.12; ctx.strokeStyle = '#9a9aa3'; ctx.lineWidth = Math.max(1.5, k * 0.18); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-k, 0); ctx.lineTo(k, 0); ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.stroke();
    }
  }
  ctx.restore();
}
const textOf = t => t.t || (t.date ? dateText(t.date) : '');
function drawText(ctx, t, W, Hh, geo, selected) {
  const txt = textOf(t); if (!txt && !selected) return null;
  ctx.save();
  let x = t.x * W, y = t.y * Hh;
  if (t.slot != null && geo[t.slot]) { const g = geo[t.slot]; ctx.translate(g.cx, g.cy); ctx.rotate(g.rot); x = t.x * g.w; y = t.y * g.h; }
  ctx.translate(x, y); if (t.rot) ctx.rotate(t.rot * Math.PI / 180);
  const fs = t.s * W, lines = (txt || ' ').split('\n'), lh = fs * 1.2, a = t.a || 'center';
  ctx.font = `${t.it ? 'italic ' : ''}${t.w || 600} ${fs}px ${FONTS[t.f] || FONTS.sans}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = (t.ls || 0) * fs + 'px';
  ctx.textAlign = a; ctx.textBaseline = 'middle';
  const ws = lines.map(l => ctx.measureText(l).width), mw = Math.max(...ws), y0 = -(lines.length - 1) * lh / 2;
  const bx = a === 'left' ? 0 : a === 'right' ? -mw : -mw / 2;
  if (t.bgc) {
    ctx.fillStyle = t.bgc;
    lines.forEach((l, i) => { const lx = a === 'left' ? 0 : a === 'right' ? -ws[i] : -ws[i] / 2; ctx.beginPath(); ctx.roundRect(lx - fs * 0.4, y0 + i * lh - fs * 0.62, ws[i] + fs * 0.8, fs * 1.24, fs * 0.3); ctx.fill(); });
  }
  if (t.sh) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = fs * 0.15; }
  lines.forEach((l, i) => {
    const ly = y0 + i * lh;
    if (t.outline) { ctx.strokeStyle = t.c; ctx.lineWidth = fs * 0.035; ctx.strokeText(l, 0, ly); return; }
    if (t.st) { ctx.strokeStyle = t.st; ctx.lineWidth = fs * 0.16; ctx.lineJoin = 'round'; ctx.strokeText(l, 0, ly); }
    ctx.fillStyle = t.c; ctx.fillText(l, 0, ly);
  });
  const box = [bx - fs * 0.3, y0 - lh / 2 - fs * 0.1, bx + mw + fs * 0.3, y0 + (lines.length - 0.5) * lh + fs * 0.1];
  if (selected) {
    ctx.shadowColor = 'transparent'; ctx.setLineDash([fs * 0.15, fs * 0.1]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, W * 0.003);
    ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  }
  const m = ctx.getTransform();
  ctx.restore();
  return { m, box };
}

// ---------- 預覽 ----------
let cv, last = null, raf = 0, drag = null;
function fit() {
  const st = $('#cgStage'), d = design(), dpr = Math.min(devicePixelRatio || 1, 2);
  const aw = st.clientWidth - 24, ah = st.clientHeight - 24;
  let w = aw, h = w / d.ratio; if (h > ah) { h = ah; w = h * d.ratio; }
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}
function draw(opt = {}) {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); last = render(ctx, cv.width, cv.height, { preview: true, ...opt }); });
}
function refresh() { panel(); fit(); draw(); }

function pt(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
function hitText(x, y) {
  if (!last) return -1;
  for (let i = last.hits.length - 1; i >= 0; i--) {
    const h = last.hits[i]; if (!h) continue;
    const p = h.m.inverse().transformPoint(new DOMPoint(x, y));
    if (p.x >= h.box[0] && p.x <= h.box[2] && p.y >= h.box[1] && p.y <= h.box[3]) return i;
  }
  return -1;
}
function hitSlot(x, y) {
  if (!last) return -1;
  for (let i = last.geo.length - 1; i >= 0; i--) { const g = last.geo[i], [lx, ly] = toLocal(g, x, y); if (g.inside(lx, ly)) return i; }
  return -1;
}
function clampCell(i) {
  const c = S.cells[i], g = last?.geo[i]; if (!c || !g || c.p == null) return;
  const b = S.photos[c.p].full, odd = c.rot % 2, iw = odd ? b.height : b.width, ih = odd ? b.width : b.height;
  const s = Math.max(g.w / iw, g.h / ih) * c.zoom, mx = Math.max(0, (iw * s - g.w) / 2 / g.w), my = Math.max(0, (ih * s - g.h) / 2 / g.h);
  c.ox = Math.max(-mx, Math.min(mx, c.ox)); c.oy = Math.max(-my, Math.min(my, c.oy));
}

const pointers = new Map();
function onDown(e) {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, pt(e));
  if (pointers.size === 2 && drag?.k === 'cell') {
    const [a, b] = [...pointers.values()]; drag.pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: S.cells[drag.i].zoom }; clearTimeout(drag.lp); return;
  }
  if (pointers.size > 1) return;
  const [x, y] = pt(e), ti = hitText(x, y);
  if (ti >= 0) { drag = { k: 'text', i: ti, x, y, moved: false, wasSel: S.sel?.k === 'text' && S.sel.i === ti }; S.sel = { k: 'text', i: ti }; draw(); panel(); return; }
  const si = hitSlot(x, y);
  if (si < 0) { drag = null; if (S.sel) { S.sel = null; draw(); panel(); } return; }
  drag = { k: 'cell', i: si, x, y, moved: false };
  drag.lp = setTimeout(() => { if (drag && !drag.moved && S.cells[si].p != null) { drag.k = 'swap'; navigator.vibrate?.(15); H.toast('拖到另一格交換位置', 1200); draw({ target: si }); } }, 450);
}
function onMove(e) {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, pt(e));
  const [x, y] = pt(e), dx = x - drag.x, dy = y - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6 * (cv.width / cv.clientWidth)) return;
  drag.moved = true; clearTimeout(drag.lp);
  if (drag.k === 'text') {
    const t = S.texts[drag.i];
    if (t.slot != null && last.geo[t.slot]) { const g = last.geo[t.slot], c = Math.cos(-g.rot), s = Math.sin(-g.rot); t.x += (dx * c - dy * s) / g.w; t.y += (dx * s + dy * c) / g.h; }
    else { t.x += dx / cv.width; t.y += dy / cv.height; }
    drag.x = x; drag.y = y; draw(); return;
  }
  if (drag.k === 'swap') { const ti = hitSlot(x, y); draw({ target: ti >= 0 && ti !== drag.i ? ti : null }); drag.tx = x; drag.ty = y; return; }
  const c = S.cells[drag.i], g = last.geo[drag.i]; if (!c || c.p == null) return;
  if (drag.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]; c.zoom = Math.max(1, Math.min(5, drag.pinch.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.pinch.d0));
  } else {
    const co = Math.cos(-g.rot), si = Math.sin(-g.rot);
    c.ox += (dx * co - dy * si) / g.w; c.oy += (dx * si + dy * co) / g.h; drag.x = x; drag.y = y;
  }
  clampCell(drag.i); draw();
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (!drag || pointers.size) return;
  clearTimeout(drag.lp);
  const d = drag; drag = null;
  if (d.k === 'swap') {
    const ti = d.tx != null ? hitSlot(d.tx, d.ty) : -1;
    if (ti >= 0 && ti !== d.i) swap(d.i, ti);
    draw(); return;
  }
  if (d.k === 'text') { if (!d.moved && d.wasSel) setTimeout(() => { const ta = $('#cgText'); ta.focus(); ta.select(); }, 30); return; }
  if (d.k === 'cell' && !d.moved) {
    if (S.cells[d.i].p == null) { pickFor(d.i); return; }
    S.sel = S.sel?.k === 'cell' && S.sel.i === d.i ? null : { k: 'cell', i: d.i }; draw(); panel();
  }
}
function swap(a, b) {
  const A = S.cells[a], B = S.cells[b];
  for (const k of ['p', 'flip', 'rot', 'filter', 'fAmt']) [A[k], B[k]] = [B[k], A[k]];
  for (const c of [A, B]) { c.zoom = 1; c.ox = 0; c.oy = 0; }
  if (S.sel?.k === 'cell') S.sel.i = b;
}
function onWheel(e) {
  e.preventDefault();
  const [x, y] = pt(e), i = hitSlot(x, y), c = S.cells[i]; if (!c || c.p == null) return;
  c.zoom = Math.max(1, Math.min(5, c.zoom * Math.exp(-e.deltaY * 0.002))); clampCell(i); draw();
}

// ---------- 加照片、換照片 ----------
function pickFor(slot) { filePurpose = { slot }; $('#cgFile').multiple = false; $('#cgFile').click(); }
async function onFiles(files) {
  if (!files.length || !filePurpose) return;
  const pur = filePurpose; filePurpose = null;
  H.busy('讀取照片…');
  try {
    if (pur.add) {
      const room = MAX_PHOTOS - S.photos.length;
      if (room <= 0) { H.toast(`最多 ${MAX_PHOTOS} 張`); return; }
      for (const f of files.slice(0, room)) { const p = await toPhoto(f); if (p) S.photos.push(p); }
      if (files.length > room) H.toast(`最多 ${MAX_PHOTOS} 張，多的沒有加進來`);
      if (S.mode === 'grid') S.grid.idx = 0;
      const was = S.cells; resetCells();
      if (S.mode !== 'grid') S.cells.forEach((c, i) => { if (was[i]?.p != null) Object.assign(c, { p: was[i].p }); });
    } else {
      const p = await toPhoto(files[0]); if (!p) { H.toast('照片打不開'); return; }
      const c = S.cells[pur.slot], old = c.p;
      // 這張照片只有這一格用到就直接換掉，否則加成新照片
      const shared = old != null && S.cells.some((x, i) => i !== pur.slot && x.p === old);
      if (old != null && !shared) S.photos[old] = p; else { S.photos.push(p); c.p = S.photos.length - 1; }
      Object.assign(c, { zoom: 1, ox: 0, oy: 0 });
    }
    thumbs = {}; S.ver++; refresh();
  } finally { H.busy(); }
}

// ---------- 面板 ----------
function it({ label, html, on, onclick, cls = '' }) {
  const b = document.createElement('button');
  b.className = 'it ' + cls + (on ? ' on' : '');
  b.innerHTML = `<span class="ic">${html || ''}</span><span>${label || ''}</span>`;
  b.onclick = onclick; return b;
}
function chip(label, on, onclick) { return it({ label: '', html: label, on, onclick, cls: 'wide' }); }
function slider(label, min, max, val, onInput) {
  const row = $('#cgSrow'), s = $('#cgSlider');
  row.classList.remove('hide'); $('#cgSLabel').textContent = label;
  s.min = min; s.max = max; s.value = val; $('#cgSVal').textContent = val;
  s.oninput = () => { $('#cgSVal').textContent = s.value; onInput(+s.value); };
}
const noSlider = () => $('#cgSrow').classList.add('hide');

function layoutSvg(cells, ratio) {
  const w = 40, h = Math.max(20, Math.min(56, 40 / ratio));
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${w * 0.8}px;height:${h * 0.8}px;stroke:none">` + cells.map(p => {
    const ins = insetCell(p, w, h, 2.4, 1.5);
    return `<polygon points="${ins.pts.map(q => q.join(',')).join(' ')}" fill="currentColor"/>`;
  }).join('') + '</svg>';
}
function tplThumb(t, h = 148) {
  const key = t.id + ':' + S.ver + ':' + h;
  if (!thumbs[key]) {
    const w = Math.round(h * t.ratio), c = document.createElement('canvas'); c.width = w; c.height = h;
    const keep = { mode: S.mode, tpl: S.tpl, cells: S.cells, texts: S.texts, sel: S.sel };
    S.mode = 'tpl'; S.tpl = t.id; S.texts = []; resetCellsFor(t);
    try { render(c.getContext('2d'), w, h, { small: true }); } catch (e) { console.error(e); }
    Object.assign(S, keep);
    thumbs[key] = c;
  }
  const src = thumbs[key], c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
function resetCellsFor(t) {
  S.cells = t.slots.map((s, i) => { const p = s.p ?? i; return { p: p < S.photos.length ? p : null, zoom: 1, ox: 0, oy: 0, flip: false, rot: 0, filter: '', fAmt: 80 }; });
  S.texts = (t.texts || []).map(x => ({ ...x }));
}

function panel() {
  const items = $('#cgItems'), cats = $('#cgCats'), te = $('#cgTextedit'), note = $('#cgNote');
  items.innerHTML = ''; cats.innerHTML = ''; cats.hidden = true; te.hidden = true; note.textContent = ''; noSlider();
  document.querySelectorAll('#cgTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));

  // 選了文字
  if (S.sel?.k === 'text') {
    const t = S.texts[S.sel.i]; te.hidden = false;
    const ta = $('#cgText'); ta.value = textOf(t);
    ta.oninput = () => { t.t = ta.value; t.date = t.t ? t.date : t.date; draw(); };
    items.append(it({ label: (FONT_LIST.find(f => f[0] === t.f) || FONT_LIST[0])[1], html: 'Aa', onclick: () => {
      const i = FONT_LIST.findIndex(f => f[0] === t.f); t.f = FONT_LIST[(i + 1) % FONT_LIST.length][0]; draw(); panel();
    } }));
    items.append(it({ label: '刪除', html: '✕', onclick: () => { S.texts.splice(S.sel.i, 1); S.sel = null; draw(); panel(); } }));
    items.append(it({ label: '完成', html: '✓', onclick: () => { S.sel = null; draw(); panel(); } }));
    TEXT_COLORS.forEach(c => {
      const b = document.createElement('button'); b.className = 'sw' + (t.c === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
      b.onclick = () => { t.c = c; if (t.outline) t.outline = false; draw(); panel(); }; items.append(b);
    });
    slider('大小', 2, 40, Math.round(t.s * 100), v => { t.s = v / 100; draw(); });
    return;
  }
  // 選了一格
  if (S.sel?.k === 'cell') {
    const i = S.sel.i, c = S.cells[i];
    if (S.sub === 'filter') {
      note.textContent = '這格的濾鏡';
      items.append(it({ label: '返回', html: '‹', onclick: () => { S.sub = 'layout'; panel(); } }));
      const p = S.photos[c.p];
      FILTERS.forEach(f => {
        const b = it({ label: f.name, on: (c.filter || 'none') === f.id, cls: 'ft', onclick: () => { c.filter = f.id === 'none' ? '' : f.id; H.busy('套用濾鏡…'); setTimeout(() => { draw(); H.busy(); panel(); }, 20); } });
        const tc = document.createElement('canvas'); tc.width = tc.height = 124;
        const src = img(c.p, f.id, true), s = Math.min(src.width, src.height);
        tc.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 124, 124);
        Object.assign(tc.style, { width: '100%', height: '100%' });
        b.querySelector('.ic').append(tc); items.append(b);
      });
      if (c.filter) slider('強度', 0, 100, c.fAmt, v => { c.fAmt = v; draw(); });
      return;
    }
    note.textContent = '拖曳移動照片，兩指或滾輪縮放，長按拖到別格交換。';
    items.append(it({ label: '換照片', html: '⇄', onclick: () => pickFor(i) }));
    items.append(it({ label: '濾鏡', html: '◐', on: !!c.filter, onclick: () => { S.sub = 'filter'; panel(); } }));
    items.append(it({ label: '翻轉', html: '⇋', onclick: () => { c.flip = !c.flip; draw(); } }));
    items.append(it({ label: '旋轉', html: '↻', onclick: () => { c.rot = (c.rot + 1) % 4; c.zoom = 1; c.ox = c.oy = 0; draw(); } }));
    items.append(it({ label: '置中', html: '⊙', onclick: () => { c.zoom = 1; c.ox = c.oy = 0; draw(); } }));
    items.append(it({ label: '完成', html: '✓', onclick: () => { S.sel = null; draw(); panel(); } }));
    slider('縮放', 100, 500, Math.round(c.zoom * 100), v => { c.zoom = v / 100; clampCell(i); draw(); });
    return;
  }

  if (S.mode === 'grid') {
    cats.hidden = false;
    [['layout', '版型'], ['ratio', '比例'], ['border', '邊框'], ['bg', '背景']].forEach(([k, n]) => cats.append(chip(n, S.sub === k, () => { S.sub = k; panel(); })));
    const g = S.grid, n = Math.min(S.photos.length, MAX_PHOTOS), r = design().ratio;
    if (S.sub === 'layout' || S.sub === 'filter') {
      items.append(it({ label: '加照片', html: '+', onclick: () => { filePurpose = { add: true }; $('#cgFile').multiple = true; $('#cgFile').click(); } }));
      (LAYOUTS[n] || []).forEach((cells, i) => items.append(it({ label: '', html: layoutSvg(cells, g.stitch ? 1 : RATIOS.find(x => x.id === g.ratio).v), cls: 'lo', on: !g.stitch && g.idx === i,
        onclick: () => { g.stitch = ''; g.idx = i; resetCells(); refresh(); } })));
      if (n > 1) {
        items.append(it({ label: '直拼長圖', html: '<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="1.5"/><path d="M7 9h10M7 15h10"/></svg>', cls: 'lo', on: g.stitch === 'v', onclick: () => { g.stitch = 'v'; resetCells(); refresh(); } }));
        items.append(it({ label: '橫拼長圖', html: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M9 7v10M15 7v10"/></svg>', cls: 'lo', on: g.stitch === 'h', onclick: () => { g.stitch = 'h'; resetCells(); refresh(); } }));
      }
      note.textContent = `${n} 張照片。點一格可以換照片、套濾鏡；長按拖曳交換位置。`;
    } else if (S.sub === 'ratio') {
      if (g.stitch) note.textContent = '長圖的比例跟著照片走。';
      RATIOS.forEach(x => items.append(chip(x.id, !g.stitch && g.ratio === x.id, () => { g.stitch = ''; g.ratio = x.id; S.cells.forEach(c => { c.zoom = 1; c.ox = c.oy = 0; }); refresh(); })));
    } else if (S.sub === 'border') {
      const opts = [['inner', '間距', 0, 100], ['outer', '外框', 0, 100], ['radius', '圓角', 0, 100]];
      opts.forEach(([k, label]) => items.append(chip(label, S.slider === k, () => { S.slider = k; panel(); })));
      items.append(chip('無邊框', false, () => { g.inner = g.outer = g.radius = 0; draw(); panel(); }));
      const o = opts.find(x => x[0] === S.slider);
      slider(o[1], o[2], o[3], g[o[0]], v => { g[o[0]] = v; draw(); });
    } else if (S.sub === 'bg') {
      BGS.forEach(b => {
        const btn = document.createElement('button'); btn.className = 'sw' + (g.bg === b.id ? ' on' : ''); btn.style.alignSelf = 'center';
        if (typeof b.bg === 'string') btn.style.background = b.bg;
        else { const c = document.createElement('canvas'); c.width = c.height = 30; paintBg(c.getContext('2d'), b.bg, 30, 30, S.photos[0].small); btn.style.background = `url(${c.toDataURL()}) center/cover`; }
        btn.title = b.id; btn.onclick = () => { g.bg = b.id; draw(); panel(); }; items.append(btn);
      });
    }
    void r; return;
  }

  // 範本、海報
  const cat = S.mode === 'poster' ? null : S.tplCat;
  if (cat) { cats.hidden = false; CATS.filter(c => c !== '海報').forEach(c => cats.append(chip(c, c === cat, () => { S.tplCat = c; panel(); }))); }
  const list = S.mode === 'poster' ? TEMPLATES.filter(t => t.cat.includes('海報')) : TEMPLATES.filter(t => t.cat.includes(cat));
  list.forEach(t => {
    const n = uniq(t), b = it({ label: `${t.name}${n > 1 ? ` · ${n}張` : ''}`, cls: 'tp', on: S.tpl === t.id, onclick: () => { S.tpl = t.id; resetCells(); refresh(); } });
    const ic = b.querySelector('.ic'); ic.style.width = Math.round(74 * Math.min(1.5, Math.max(0.42, t.ratio))) + 'px'; ic.append(tplThumb(t));
    items.append(b);
  });
  const t = tplById(S.tpl), need = t ? uniq(t) : 0;
  note.textContent = t ? (need > S.photos.length ? `這個範本放 ${need} 張照片，點灰色的格子加照片。` : '點文字可以改字，點照片可以換照片、套濾鏡。') : '';
}

// ---------- 輸出 ----------
function exportCanvas() {
  const d = design(), long = OUT_LONG, W = Math.round(d.ratio >= 1 ? long : long * d.ratio), Hh = Math.round(d.ratio >= 1 ? long / d.ratio : long);
  // 長圖可能很長，限制總像素（iPhone canvas 上限約 1600 萬）
  const k = Math.min(1, Math.sqrt(16e6 / (W * Hh)));
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(Hh * k);
  render(c.getContext('2d'), c.width, c.height, {});
  return c;
}
async function save() {
  H.busy('輸出中…');
  try {
    const c = exportCanvas();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const name = `隨手修-拼貼-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.jpg`;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); H.toast('已下載');
    }
  } catch (e) { console.error(e); H.toast('儲存失敗'); }
  finally { H.busy(); }
}
async function toEditor() {
  H.busy('輸出中…');
  let file;
  try {
    const c = exportCanvas(), blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    file = new File([blob], 'collage.jpg', { type: 'image/jpeg' });
  } finally { H.busy(); }
  close();
  await H.loadFile(file);
}
function close() { $('#cg').classList.remove('on'); S = null; thumbs = {}; }

// ---------- DOM ----------
function buildDom() {
  const el = document.createElement('div'); el.id = 'cg';
  el.innerHTML = `
  <header class="top">
    <button class="ib" id="cgClose" title="離開"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <span class="sp"></span>
    <button class="ib" id="cgAddText" title="加文字"><svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg></button>
    <button class="cgbtn" id="cgEdit">繼續修圖</button>
    <button class="save" id="cgSave">儲存</button>
  </header>
  <main id="cgStage"><canvas id="cgCanvas"></canvas></main>
  <section class="cgp">
    <div class="srow hide" id="cgSrow"><label id="cgSLabel"></label><input type="range" id="cgSlider" aria-label="數值"><output id="cgSVal"></output></div>
    <div class="note" id="cgNote"></div>
    <div class="textedit" id="cgTextedit" hidden><textarea id="cgText" rows="1" placeholder="輸入文字"></textarea></div>
    <div class="items" id="cgCats" hidden></div>
    <div class="items" id="cgItems"></div>
    <nav class="tabs" id="cgTabs"><button class="tab" data-m="grid">一般</button><button class="tab" data-m="tpl">範本</button><button class="tab" data-m="poster">海報</button></nav>
  </section>
  <input type="file" id="cgFile" accept="image/*" hidden>`;
  document.body.append(el);
  cv = $('#cgCanvas');
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  $('#cgFile').onchange = e => { const f = [...e.target.files]; e.target.value = ''; onFiles(f); };
  $('#cgClose').onclick = () => { if (confirm('離開拼貼？還沒儲存的會不見。')) close(); };
  $('#cgSave').onclick = save;
  $('#cgEdit').onclick = toEditor;
  $('#cgAddText').onclick = () => {
    S.texts.push({ t: '輸入文字', x: 0.5, y: 0.5, s: 0.08, f: 'sans', c: '#ffffff', st: '#111111', w: 700, user: true });
    S.sel = { k: 'text', i: S.texts.length - 1 }; draw(); panel();
    setTimeout(() => { const ta = $('#cgText'); ta.focus(); ta.select(); }, 50);
  };
  $('#cgTabs').onclick = e => {
    const m = e.target.closest('.tab')?.dataset.m; if (!m || !S || m === S.mode) return;
    S.mode = m; S.sub = 'layout';
    if (m !== 'grid') { const cur = S.tpl && tplById(S.tpl); if (!cur || (m === 'poster') !== cur.cat.includes('海報')) S.tpl = pickTpl(m === 'poster' ? '海報' : S.tplCat).id; }
    resetCells(); refresh();
  };
  addEventListener('resize', () => { if (S) { fit(); draw(); } });
}

// 給自動測試用
window.__collage = { get S() { return S; }, exportCanvas, design, open: openCollage, panel: () => panel(), thumb: (id, h) => tplThumb(tplById(id), h), refresh: () => refresh() };
