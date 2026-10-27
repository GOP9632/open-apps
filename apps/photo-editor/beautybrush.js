// 美顏筆：照 Hypic「修飾 › 筆刷」，用手指塗哪裡就修哪裡。8 種：
//   磨皮、除斑去痘、去黑眼圈、眼部亮白、去油光、調膚質、牙齒美白、去法令紋
// 做法照醒圖拆解的數字（見 plans/修圖/醒圖拆解重點.md）：
//   磨皮：模糊後按「1 − 變異度／(變異度 + ε)」混回去，暗部（R < 0.2）不磨、0.2～0.45 漸增
//   去黑眼圈：跟周圍亮的皮膚比，差值上限 0.2、係數 1.5；去法令紋：上限 0.3、係數 1.4 × 0.8
//   眼部亮白：細節 × 2 × 0.5，再提亮
// 每畫完一筆就畫進照片（跟塗鴉一樣），可以用上一步復原。只算筆刷附近那一塊，大照片也快。
import { pinch } from './ui.js';
import { boxBlur } from './cblur.js';

export const BRUSHES = [
  { id: 'smooth', name: '磨皮', str: 60 },
  { id: 'blemish', name: '除斑去痘', str: 100 },
  { id: 'circle', name: '去黑眼圈', str: 60 },
  { id: 'eye', name: '眼部亮白', str: 50 },
  { id: 'oil', name: '去油光', str: 60 },
  { id: 'texture', name: '調膚質', str: 50 },
  { id: 'teeth', name: '牙齒美白', str: 60 },
  { id: 'fold', name: '去法令紋', str: 70 },
];
const st = { tool: 'smooth', size: 30, str: Object.fromEntries(BRUSHES.map(b => [b.id, b.str])), param: 'size' };

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
// 筆刷半徑（照片像素）：大小 1~100 → 短邊的 1%~12%
export const bbRadius = (size, W, H) => Math.min(W, H) * (0.01 + 0.11 * size / 100);

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const blur = (a, w, h, r) => boxBlur(Float32Array.from(a), w, h, Math.max(1, r));
// 加權模糊：sum(a·wt) / sum(wt)；三個顏色共用一次權重的模糊
function wblur3(c, wt, w, h, r) {
  const n = wt.length, ww = blur(wt, w, h, r);
  return c.map(a => {
    const aw = new Float32Array(n);
    for (let i = 0; i < n; i++) aw[i] = a[i] * wt[i];
    const b = blur(aw, w, h, r);
    for (let i = 0; i < n; i++) b[i] = ww[i] > 1e-6 ? b[i] / ww[i] : a[i];
    return b;
  });
}

// 效果：c = [R, G, B]（0~1，Float32Array），回傳修好的 [R, G, B]；R 是筆刷半徑，S 是照片短邊
export function effect(tool, c, w, h, R, k, S = 1000, m = null) {
  const n = w * h, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * c[0][i] + 0.587 * c[1][i] + 0.114 * c[2][i];
  const out = c.map(a => Float32Array.from(a));
  if (tool === 'smooth') {
    // 醒圖：短邊 324px 縮圖上 9 點方框、間距 1.5px，約短邊的 1.5%
    const r = Math.max(2, S * 0.015), b = c.map(a => blur(a, w, h, r)), Lb = blur(L, w, h, r);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = (L[i] - Lb[i]) ** 2;
    boxBlur(v, w, h, r);
    for (let i = 0; i < n; i++) {
      const f = (1 - v[i] / (v[i] + 0.002)) * sstep(0.2, 0.45, c[0][i]) * k;
      for (let j = 0; j < 3; j++) out[j][i] += (b[j][i] - c[j][i]) * f;
    }
  } else if (tool === 'blemish') {
    // 修補筆：塗到的地方用筆刷外面的皮膚補（點一下痘痘就消掉），再把細紋理加回去。
    // 長長一筆塗過去時，中間離邊太遠，就改用附近「不比周圍暗、不比周圍紅」的皮膚補
    const r = Math.max(3, R * 0.4), Lb = blur(L, w, h, r), red = new Float32Array(n);
    for (let i = 0; i < n; i++) red[i] = c[0][i] - c[1][i];
    const redB = blur(red, w, h, r), ok = new Float32Array(n), wt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ok[i] = sstep(-0.06, -0.02, L[i] - Lb[i]) * (1 - sstep(0.03, 0.07, red[i] - redB[i]));
      wt[i] = (1 - m[i]) + 0.03 * ok[i] + 1e-5;
    }
    const fill = wblur3(c, wt, w, h, Math.max(3, R * 0.9));
    // 紋理也不算斑點的像素，斑點邊緣才不會留一圈亮邊
    const okw = Float32Array.from(ok, x => x + 1e-3), fine = wblur3(c, okw, w, h, 1.5);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) out[j][i] += (fill[j][i] + (c[j][i] - fine[j][i]) * ok[i] - c[j][i]) * k;
  } else if (tool === 'circle' || tool === 'fold') {
    // 跟周圍亮的皮膚比，暗多少補多少（只補低頻，紋理留著）
    const fold = tool === 'fold', r = Math.max(3, R * (fold ? 0.7 : 0.6));
    const wt = Float32Array.from(L, x => x ** 4 + 1e-4), ref = wblur3(c, wt, w, h, r);
    const low = c.map(a => blur(a, w, h, Math.max(1.5, R * 0.08)));
    const cap = fold ? 0.3 : 0.2, g = Math.min(1, (fold ? 1.4 * 0.8 : 1.5) * k);
    // 差太多的是眼珠、眉毛、嘴縫這種本來就黑的地方，不補
    for (let i = 0; i < n; i++) {
      const dl = 0.299 * (ref[0][i] - low[0][i]) + 0.587 * (ref[1][i] - low[1][i]) + 0.114 * (ref[2][i] - low[2][i]);
      const keep = 1 - sstep(cap, cap * 1.7, dl);
      for (let j = 0; j < 3; j++) out[j][i] += Math.min(cap, Math.max(0, ref[j][i] - low[j][i])) * g * keep;
    }
  } else if (tool === 'eye') {
    const b = c.map(a => blur(a, w, h, Math.max(1, R * 0.06)));
    for (let i = 0; i < n; i++) {
      const lift = 0.12 * k * sstep(0.15, 0.6, L[i]);
      const mx = Math.max(c[0][i], c[1][i], c[2][i]), mn = Math.min(c[0][i], c[1][i], c[2][i]);
      const white = 0.4 * k * (1 - sstep(0.12, 0.3, mx - mn)) * sstep(0.4, 0.6, L[i]); // 眼白退黃、退紅
      for (let j = 0; j < 3; j++) {
        let v = c[j][i] + (c[j][i] - b[j][i]) * k;
        v += (L[i] - v) * white;
        out[j][i] = v + (1 - v) * lift;
      }
    }
  } else if (tool === 'oil') {
    // 比周圍亮很多的亮點是油光：換成周圍不反光的皮膚，留一半紋理
    const r = Math.max(3, R * 0.4), Lb = blur(L, w, h, r), sh = new Float32Array(n);
    for (let i = 0; i < n; i++) sh[i] = sstep(0.02, 0.1, L[i] - Lb[i]) * sstep(0.5, 0.8, L[i]);
    const wt = Float32Array.from(sh, x => 1 - x + 1e-4), ref = wblur3(c, wt, w, h, r), fine = c.map(a => blur(a, w, h, 1.5));
    boxBlur(sh, w, h, Math.max(1, R * 0.05));
    for (let i = 0; i < n; i++) {
      const f = Math.min(1, sh[i] * 1.3) * k;
      for (let j = 0; j < 3; j++) out[j][i] += (ref[j][i] + (c[j][i] - fine[j][i]) * 0.5 - c[j][i]) * f;
    }
  } else if (tool === 'texture') {
    // 中頻（不均、坑疤）壓平，細紋理加強一點，皮膚看起來細緻但不假
    const b1 = c.map(a => blur(a, w, h, Math.max(1, R * 0.03))), b2 = c.map(a => blur(a, w, h, Math.max(3, R * 0.25)));
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      out[j][i] = b2[j][i] + (b1[j][i] - b2[j][i]) * (1 - 0.7 * k) + (c[j][i] - b1[j][i]) * (1 + 0.5 * k);
    }
  } else if (tool === 'teeth') {
    // 偏黃的亮處退黃、提亮；偏紅的嘴唇不動
    for (let i = 0; i < n; i++) {
      const r = c[0][i], g = c[1][i], b = c[2][i];
      const yel = Math.min(1, Math.max(0, ((r + g) / 2 - b) * 3)), redness = Math.min(1, Math.max(0, (r - g - 0.08) * 5));
      const gate = sstep(0.25, 0.5, L[i]) * (1 - redness), d = 0.8 * k * yel * gate, lift = 0.15 * k * gate;
      for (let j = 0; j < 3; j++) { const v = c[j][i] + (L[i] - c[j][i]) * d; out[j][i] = v + (1 - v) * lift; }
    }
  }
  return out;
}

// 一筆畫進照片：只處理筆刷附近，回傳新的照片 canvas
export function bakeBrush(src, pts, tool, size, str) {
  const W = src.width, H = src.height, R = bbRadius(size, W, H), pad = R * 2.2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
  const w = x1 - x0, h = y1 - y0, out = newCanvas(W, H), o = out.getContext('2d');
  o.drawImage(src, 0, 0);
  if (w < 2 || h < 2) return out;
  // 筆刷遮罩：線寬 2R、邊緣羽化
  const mc = newCanvas(w, h), mx = mc.getContext('2d', { willReadFrequently: true }), feather = R * 0.25;
  mx.strokeStyle = '#fff'; mx.lineWidth = Math.max(1, 2 * R - feather * 2); mx.lineCap = mx.lineJoin = 'round';
  mx.beginPath();
  pts.forEach((p, i) => i ? mx.lineTo(p.x - x0, p.y - y0) : mx.moveTo(p.x - x0, p.y - y0));
  if (pts.length === 1) mx.lineTo(pts[0].x - x0 + 0.01, pts[0].y - y0);
  mx.stroke();
  const md = mx.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = md[i * 4 + 3] / 255;
  boxBlur(m, w, h, Math.max(1, feather / 1.7));
  const img = o.getImageData(x0, y0, w, h), d = img.data, n = w * h;
  const c = [0, 1, 2].map(j => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = d[i * 4 + j] / 255; return a; });
  const e = effect(tool, c, w, h, R, str / 100, Math.min(W, H), m);
  for (let i = 0; i < n; i++) if (m[i] > 0.002) for (let j = 0; j < 3; j++) d[i * 4 + j] = Math.round((c[j][i] + (e[j][i] - c[j][i]) * m[i]) * 255);
  o.putImageData(img, x0, y0);
  return out;
}

export function tabBeautyBrush(box, app) {
  const { item, setSlider, showTab } = app;
  const cats = document.querySelector('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['size', '大小'], ['str', '強度']].forEach(([k, lb]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: st.param === k, onclick: () => { st.param = k; showTab('bbrush'); },
  })));
  BRUSHES.forEach(b => box.append(item({
    label: b.name, icon: b.name, cls: 'wide', on: st.tool === b.id, onclick: () => { st.tool = b.id; showTab('bbrush'); },
  })));
  const b = BRUSHES.find(x => x.id === st.tool);
  if (st.param === 'size') setSlider('大小', 1, 100, st.size, v => { st.size = v; }, 30);
  else setSlider('強度', 0, 100, st.str[st.tool], v => { st.str[st.tool] = v; }, b.str);
  document.querySelector('#note').textContent = `塗抹要${b.name}的地方。每塗一筆都可以用上一步復原。`;
}

// 塗的時候先在照片上面畫半透明的筆跡，放開手指才算進照片
export function beautyBrushInput(wrap, app) {
  let pts = null, ov = null;
  const at = e => { const r = wrap.getBoundingClientRect(), b = app.base.canvas; return { x: (e.clientX - r.left) / r.width * b.width, y: (e.clientY - r.top) / r.height * b.height }; };
  const preview = () => {
    const b = app.base.canvas, k = Math.min(1, 1200 / Math.max(b.width, b.height));
    if (!ov) { ov = newCanvas(b.width * k, b.height * k); ov.id = 'ddov'; wrap.append(ov); }
    const ctx = ov.getContext('2d');
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.strokeStyle = 'rgba(255,90,122,.35)'; ctx.lineWidth = 2 * bbRadius(st.size, b.width, b.height) * k; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k));
    if (pts.length === 1) ctx.lineTo(pts[0].x * k + 0.01, pts[0].y * k);
    ctx.stroke();
  };
  wrap.addEventListener('pointerdown', e => {
    if (app.tab() !== 'bbrush' || !app.base || e.target.closest('.st,.tx') || e.button > 0 || pinch.on) return;
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
    const b = app.base, out = bakeBrush(b.canvas, pts, st.tool, st.size, st.str[st.tool]);
    pts = null; ov?.remove(); ov = null;
    const keep = { ...b }; delete keep.canvas; delete keep.thumbs;
    app.setBase(out, keep); app.commit();
  };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  // 第二指放下是要縮放：這一筆不算
  addEventListener('pinchstart', () => { pts = null; ov?.remove(); ov = null; });
}
