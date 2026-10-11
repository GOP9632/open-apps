// 調色分頁：HSL、曲線、分色（色彩分級）
// 面板結構和滑桿範圍照醒圖專業版（HSL 八色各 -100～100；曲線分亮度、紅、綠、藍；
// 分色有陰影、中間調、高光、全局四個色輪，色相 0～359、飽和 0～100、亮度 -100～100，
// 外加混合 0～100（預設 50）和平衡 -100～100）。算法是自己寫的。
// 三個效果合成一個顏色函式，跟濾鏡一起烘成同一張 LUT，所以 GPU 那邊不用多一張貼圖。

const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- 參數 ----------
export const HSL_COLORS = [
  { k: 'red', name: '紅', hue: 0, css: '#e5484d' },
  { k: 'orange', name: '橙', hue: 30, css: '#f76b15' },
  { k: 'yellow', name: '黃', hue: 60, css: '#ffd60a' },
  { k: 'green', name: '綠', hue: 120, css: '#30a46c' },
  { k: 'cyan', name: '青', hue: 180, css: '#05a2c2' },
  { k: 'blue', name: '藍', hue: 240, css: '#3e63dd' },
  { k: 'purple', name: '紫', hue: 270, css: '#8e4ec6' },
  { k: 'magenta', name: '洋紅', hue: 310, css: '#d6409f' },
];
const HSL_DIMS = [['h', '色相'], ['s', '飽和度'], ['l', '明亮度']];
export const TONES = [['sh', '陰影'], ['mid', '中間調'], ['hi', '高光'], ['all', '全局']];
const CURVE_CH = [['L', '亮度', '#ffffff'], ['R', '紅', '#ff5a5a'], ['G', '綠', '#4cd964'], ['B', '藍', '#5a9bff']];

export const GRADE_P0 = { curveL: '', curveR: '', curveG: '', curveB: '', cgBlend: 50, cgBalance: 0 };
for (const c of HSL_COLORS) for (const [d] of HSL_DIMS) GRADE_P0[`hsl_${c.k}_${d}`] = 0;
for (const [t] of TONES) Object.assign(GRADE_P0, { [`cg_${t}_h`]: 0, [`cg_${t}_s`]: 0, [`cg_${t}_l`]: 0 });
const KEYS = Object.keys(GRADE_P0);

export const gradeOn = P => KEYS.some(k => P[k] !== undefined && P[k] !== GRADE_P0[k]);

// ---------- 曲線 ----------
// 控制點存成字串 "x,y;x,y"（0～1），空字串是直線
export const parsePts = s => s ? s.split(';').map(p => p.split(',').map(Number)) : [[0, 0], [1, 1]];
const fmtPts = pts => {
  const s = pts.map(([x, y]) => `${+x.toFixed(4)},${+y.toFixed(4)}`).join(';');
  return s === '0,0;1,1' ? '' : s;
};
// 單調三次內插（Fritsch–Carlson），點數少也不會亂彎
function curveTable(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const T = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    if (x <= xs[0]) { T[k] = ys[0]; continue; }
    if (x >= xs[n - 1]) { T[k] = ys[n - 1]; continue; }
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    T[k] = clamp((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]);
  }
  return T;
}
const look = (T, v) => { const x = clamp(v) * 255, i = Math.floor(x), f = x - i; return i >= 255 ? T[255] : T[i] + (T[i + 1] - T[i]) * f; };

// 自己調的曲線預設（醒圖的預設是會員素材，這裡另外調）
export const CURVE_PRESETS = [
  { name: '提亮', L: '0,0;0.25,0.33;0.75,0.86;1,1' },
  { name: '壓暗', L: '0,0;0.3,0.22;0.7,0.63;1,1' },
  { name: '對比', L: '0,0;0.25,0.19;0.75,0.82;1,1' },
  { name: '褪色', L: '0,0.1;0.3,0.32;0.7,0.72;1,0.94' },
  { name: '膠片', L: '0,0.06;0.25,0.22;0.75,0.8;1,0.95', R: '0,0.02;0.5,0.52;1,0.98', B: '0,0.08;0.5,0.48;1,0.9' },
  { name: '日系白', L: '0,0.08;0.4,0.5;1,1', G: '0,0.02;1,1', B: '0,0.06;0.5,0.53;1,0.97' },
  { name: '藍調', L: '0,0.02;0.5,0.5;1,0.98', R: '0,0;0.5,0.46;1,0.95', B: '0,0.1;0.5,0.56;1,1' },
  { name: '粉調', L: '0,0.05;0.5,0.56;1,1', R: '0,0.04;0.5,0.54;1,1', G: '0,0;0.5,0.48;1,0.96' },
];

// ---------- 顏色轉換 ----------
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
  if (c < 1e-6) return [0, 0, l];
  const s = c / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = l - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
export const hueRGB = h => hsl2rgb(h, 1, 0.5);

// ---------- 合成顏色函式 ----------
function makeFn(P) {
  // 曲線：先跑亮度曲線，再跑各通道
  const tabs = CURVE_CH.map(([c]) => P['curve' + c] ? curveTable(parsePts(P['curve' + c])) : null);
  // HSL：八個顏色依色相距離分權重，相鄰兩色之間線性過渡（加起來剛好是 1）
  const H = HSL_COLORS.map(c => [P[`hsl_${c.k}_h`] / 100, P[`hsl_${c.k}_s`] / 100, P[`hsl_${c.k}_l`] / 100]);
  const hslOn = H.some(v => v[0] || v[1] || v[2]);
  const centers = HSL_COLORS.map(c => c.hue);
  // 分色
  const T = TONES.map(([t]) => {
    const h = P[`cg_${t}_h`], s = P[`cg_${t}_s`] / 100, l = P[`cg_${t}_l`] / 100;
    const c = hueRGB(h), cl = lum(...c);
    return { tint: c.map(v => (v - cl) * s), l };
  });
  const cgOn = TONES.some(([t]) => P[`cg_${t}_s`] || P[`cg_${t}_l`]);
  const bal = P.cgBalance / 100, wid = 0.08 + 0.32 * (P.cgBlend / 100);
  const lo = 0.3 - 0.2 * bal, hi = 0.7 - 0.2 * bal;

  return (r, g, b) => {
    if (tabs[0]) { r = look(tabs[0], r); g = look(tabs[0], g); b = look(tabs[0], b); }
    if (tabs[1]) r = look(tabs[1], r);
    if (tabs[2]) g = look(tabs[2], g);
    if (tabs[3]) b = look(tabs[3], b);

    if (hslOn) {
      let [h, s, l] = rgb2hsl(r, g, b);
      if (s > 0.001) {
        let i = 0; while (i < 7 && h >= centers[i + 1]) i++;
        const a = centers[i], bnd = i === 7 ? 360 : centers[i + 1], t = (h - a) / (bnd - a), j = (i + 1) % 8;
        const wi = 1 - sstep(0, 1, t), wj = 1 - wi;
        const dh = H[i][0] * wi + H[j][0] * wj, ds = H[i][1] * wi + H[j][1] * wj, dl = H[i][2] * wi + H[j][2] * wj;
        // 很灰的顏色幾乎不動，避免把白牆、灰天空也染色
        const sf = sstep(0.03, 0.3, s) * sstep(0.02, 0.12, Math.min(l, 1 - l));
        h += dh * 30 * sf;
        s = ds > 0 ? s + (1 - s) * ds * 0.75 * sf : s * (1 + ds * sf);
        l = dl > 0 ? l + (1 - l) * dl * 0.45 * sf * s : l * (1 + dl * 0.55 * sf * s);
        [r, g, b] = hsl2rgb(h, clamp(s), clamp(l));
      }
    }

    if (cgOn) {
      const L = lum(r, g, b);
      const ws = 1 - sstep(lo - wid, lo + wid, L), wh = sstep(hi - wid, hi + wid, L), wm = Math.max(0, 1 - ws - wh);
      const W = [ws, wm, wh, 1];
      let dr = 0, dg = 0, db = 0, dl = 0;
      for (let k = 0; k < 4; k++) {
        const w = W[k], q = T[k];
        dr += q.tint[0] * w; dg += q.tint[1] * w; db += q.tint[2] * w; dl += q.l * w;
      }
      // 色偏：亮部、暗部都留一點空間，不會把黑色染成彩色
      const room = 0.35 + 0.65 * Math.sqrt(L * (1 - L)) * 2;
      r += dr * 0.3 * room; g += dg * 0.3 * room; b += db * 0.3 * room;
      if (dl) { const k = dl > 0 ? dl * 0.35 : dl * 0.35; r += (dl > 0 ? 1 - r : r) * k; g += (dl > 0 ? 1 - g : g) * k; b += (dl > 0 ? 1 - b : b) * k; }
    }
    return [clamp(r), clamp(g), clamp(b)];
  };
}

// 跟濾鏡合成：先調色再套濾鏡，濾鏡強度在這裡混好
export function gradeFn(P, filterFn) {
  const g = makeFn(P), amt = P.filterAmt / 100;
  if (!filterFn) return g;
  return (r, gg, b) => {
    const c = g(r, gg, b), f = filterFn(c[0], c[1], c[2]);
    return [c[0] + (f[0] - c[0]) * amt, c[1] + (f[1] - c[1]) * amt, c[2] + (f[2] - c[2]) * amt];
  };
}
export const gradeKey = P => KEYS.map(k => P[k]).join('|');

// ---------- 介面 ----------
// ctx：{ P(), render(), commit(), setSlider(), hideSlider(), item(), note(text), refresh() }
let sec = 'hsl', hslColor = 'red', hslDim = 'h', curveCh = 'L', tone = 'sh';

const CSS = `
#gextra{padding:0 16px 8px;display:flex;justify-content:center;gap:16px;align-items:center}
#gextra[hidden]{display:none}
#gextra canvas{touch-action:none;display:block}
#gextra .cv{width:min(260px,62vw);aspect-ratio:1;border-radius:10px;background:#111114}
#gextra .wh{width:min(170px,44vw);aspect-ratio:1}
#gextra .hsv{font-size:13px;color:var(--muted);line-height:1.7;min-width:80px}
.it.cdot .ic{border-radius:50%;width:34px;height:34px;margin:6px}
`;
function extra() {
  let el = document.getElementById('gextra');
  if (!el) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    el = document.createElement('div'); el.id = 'gextra'; el.hidden = true;
    document.getElementById('items').before(el);
  }
  return el;
}
export function gradeHide() { const el = document.getElementById('gextra'); if (el) { el.hidden = true; el.innerHTML = ''; } }

export function tabGrade(box, ctx) {
  const ex = extra(); ex.innerHTML = ''; ex.hidden = true;
  const P = ctx.P();
  const secs = [['hsl', 'HSL'], ['curve', '曲線'], ['cg', '分色']];
  const setS = {
    hsl: HSL_COLORS.some(c => HSL_DIMS.some(([d]) => P[`hsl_${c.k}_${d}`])),
    curve: CURVE_CH.some(([c]) => P['curve' + c]),
    cg: KEYS.some(k => (k.startsWith('cg')) && P[k] !== GRADE_P0[k]),
  };
  secs.forEach(([k, lb]) => box.append(ctx.item({ label: lb, icon: lb, cls: 'wide', on: sec === k, set: setS[k], onclick: () => { sec = k; ctx.refresh(); } })));
  ({ hsl: secHsl, curve: secCurve, cg: secCg })[sec](box, ctx, ex);
}

function secHsl(box, ctx) {
  const P = ctx.P();
  HSL_COLORS.forEach(c => box.append(ctx.item({
    label: c.name, cls: 'cdot', on: hslColor === c.k, style: `background:${c.css}`,
    set: HSL_DIMS.some(([d]) => P[`hsl_${c.k}_${d}`]),
    onclick: () => { hslColor = c.k; ctx.refresh(); },
  })));
  HSL_DIMS.forEach(([d, lb]) => box.append(ctx.item({ label: lb, icon: lb, cls: 'wide', on: hslDim === d, set: !!P[`hsl_${hslColor}_${d}`], onclick: () => { hslDim = d; ctx.refresh(); } })));
  box.append(ctx.item({ label: '重設', icon: '重設', cls: 'wide', onclick: () => {
    HSL_COLORS.forEach(c => HSL_DIMS.forEach(([d]) => P[`hsl_${c.k}_${d}`] = 0)); ctx.render(); ctx.commit(); ctx.refresh();
  } }));
  const key = `hsl_${hslColor}_${hslDim}`, cn = HSL_COLORS.find(c => c.k === hslColor).name;
  ctx.note('選顏色，再調色相、飽和度或明亮度');
  ctx.setSlider(cn + HSL_DIMS.find(x => x[0] === hslDim)[1].slice(0, 2), -100, 100, P[key], v => { ctx.P()[key] = v; ctx.render(); });
}

function secCurve(box, ctx, ex) {
  const P = ctx.P();
  ctx.hideSlider();
  CURVE_CH.forEach(([c, lb, col]) => box.append(ctx.item({
    label: lb, icon: `<b style="color:${col}">${lb}</b>`, cls: 'wide', on: curveCh === c, set: !!P['curve' + c],
    onclick: () => { curveCh = c; ctx.refresh(); },
  })));
  box.append(ctx.item({ label: '重設', icon: '重設', cls: 'wide', onclick: () => { CURVE_CH.forEach(([c]) => P['curve' + c] = ''); ctx.render(); ctx.commit(); ctx.refresh(); } }));
  CURVE_PRESETS.forEach(pr => box.append(ctx.item({
    label: pr.name, icon: pr.name, cls: 'wide',
    on: CURVE_CH.every(([c]) => (pr[c] || '') === P['curve' + c]),
    onclick: () => { CURVE_CH.forEach(([c]) => P['curve' + c] = pr[c] || ''); ctx.render(); ctx.commit(); ctx.refresh(); },
  })));
  ctx.note('點曲線加控制點、拖曳調整，往框外拖出去就刪掉');
  ex.hidden = false;
  const cv = document.createElement('canvas'); cv.className = 'cv'; ex.append(cv);
  curveEditor(cv, ctx);
}

function curveEditor(cv, ctx) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; };
  const key = () => 'curve' + curveCh;
  let pts = parsePts(ctx.P()[key()]), drag = -1;
  const PAD = 10 * dpr;
  const toPx = ([x, y]) => [PAD + x * (cv.width - 2 * PAD), cv.height - PAD - y * (cv.height - 2 * PAD)];
  const fromEv = e => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * dpr - PAD) / (cv.width - 2 * PAD), (cv.height - PAD - (e.clientY - r.top) * dpr) / (cv.height - 2 * PAD)];
  };
  const col = CURVE_CH.find(c => c[0] === curveCh)[2];
  function paint() {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const [x] = toPx([i / 4, 0]), [, y] = toPx([0, i / 4]);
      g.beginPath(); g.moveTo(x, PAD); g.lineTo(x, H - PAD); g.stroke();
      g.beginPath(); g.moveTo(PAD, y); g.lineTo(W - PAD, y); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(...toPx([0, 0])); g.lineTo(...toPx([1, 1])); g.stroke();
    // 其他通道淡淡畫出來
    CURVE_CH.forEach(([c, , cc]) => {
      if (c === curveCh || !ctx.P()['curve' + c]) return;
      const T = curveTable(parsePts(ctx.P()['curve' + c]));
      g.strokeStyle = cc + '55'; g.lineWidth = 1.5 * dpr; g.beginPath();
      for (let k = 0; k < 256; k++) g[k ? 'lineTo' : 'moveTo'](...toPx([k / 255, T[k]]));
      g.stroke();
    });
    const T = curveTable(pts);
    g.strokeStyle = col; g.lineWidth = 2 * dpr; g.beginPath();
    for (let k = 0; k < 256; k++) g[k ? 'lineTo' : 'moveTo'](...toPx([k / 255, T[k]]));
    g.stroke();
    pts.forEach((p, i) => {
      const [x, y] = toPx(p);
      g.fillStyle = i === drag ? col : '#17171a'; g.strokeStyle = col; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(x, y, 6 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    });
  }
  const save = () => { ctx.P()[key()] = fmtPts(pts); ctx.render(); };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const [x, y] = fromEv(e);
    const hit = 18 * dpr / (cv.width - 2 * PAD);
    drag = pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < hit * 1.6);
    if (drag < 0) {
      const xi = clamp(x); let i = pts.findIndex(p => p[0] > xi); if (i < 0) i = pts.length;
      if (i === 0 || i === pts.length) return;
      if (pts[i][0] - xi < 0.02 || xi - pts[i - 1][0] < 0.02) return;
      pts.splice(i, 0, [xi, clamp(y)]); drag = i; save();
    }
    paint();
  });
  cv.addEventListener('pointermove', e => {
    if (drag < 0) return;
    let [x, y] = fromEv(e);
    const end = drag === 0 || drag === pts.length - 1;
    if (!end && (y < -0.15 || y > 1.15)) { pts.splice(drag, 1); drag = -1; save(); paint(); return; }
    if (end) x = pts[drag][0];
    else x = Math.min(pts[drag + 1][0] - 0.02, Math.max(pts[drag - 1][0] + 0.02, x));
    pts[drag] = [clamp(x), clamp(y)]; save(); paint();
  });
  const up = () => { drag = -1; paint(); ctx.commit(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { drag = -1; paint(); });
  cv.addEventListener('dblclick', e => {
    const [x, y] = fromEv(e);
    const i = pts.findIndex((p, k) => k > 0 && k < pts.length - 1 && Math.hypot(p[0] - x, p[1] - y) < 0.06);
    if (i > 0) { pts.splice(i, 1); save(); paint(); ctx.commit(); }
  });
  requestAnimationFrame(() => { size(); paint(); });
}

function secCg(box, ctx, ex) {
  const P = ctx.P();
  const items = [...TONES, ['blend', '混合'], ['bal', '平衡']];
  items.forEach(([k, lb]) => box.append(ctx.item({
    label: lb, icon: lb, cls: 'wide', on: tone === k,
    set: k === 'blend' ? P.cgBlend !== 50 : k === 'bal' ? P.cgBalance !== 0 : !!(P[`cg_${k}_s`] || P[`cg_${k}_l`]),
    onclick: () => { tone = k; ctx.refresh(); },
  })));
  box.append(ctx.item({ label: '重設', icon: '重設', cls: 'wide', onclick: () => {
    KEYS.filter(k => k.startsWith('cg')).forEach(k => P[k] = GRADE_P0[k]); ctx.render(); ctx.commit(); ctx.refresh();
  } }));
  if (tone === 'blend') { ctx.note('三個色調之間的過渡，越大越柔和'); ctx.setSlider('混合', 0, 100, P.cgBlend, v => { ctx.P().cgBlend = v; ctx.render(); }); return; }
  if (tone === 'bal') { ctx.note('往右高光的範圍變大，往左陰影變大'); ctx.setSlider('平衡', -100, 100, P.cgBalance, v => { ctx.P().cgBalance = v; ctx.render(); }); return; }
  const name = TONES.find(t => t[0] === tone)[1];
  ctx.note('在色輪上拖曳選顏色，離中心越遠越濃');
  ctx.setSlider('亮度', -100, 100, P[`cg_${tone}_l`], v => { ctx.P()[`cg_${tone}_l`] = v; ctx.render(); });
  ex.hidden = false;
  const cv = document.createElement('canvas'); cv.className = 'wh'; ex.append(cv);
  const info = document.createElement('div'); info.className = 'hsv'; ex.append(info);
  wheel(cv, info, ctx, name);
}

function wheel(cv, info, ctx, name) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const hk = `cg_${tone}_h`, sk = `cg_${tone}_s`;
  let bg = null;
  const R = () => cv.width / 2 - 8 * dpr;
  function makeBg() {
    const W = cv.width, c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d'), img = g.createImageData(W, W), d = img.data, r0 = R();
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const dx = x - W / 2, dy = W / 2 - y, r = Math.hypot(dx, dy) / r0, o = (y * W + x) * 4;
      if (r > 1) continue;
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, [cr, cg, cb] = hsl2rgb(h, 1, 0.5);
      const s = r * 0.85;
      d[o] = (0.5 + (cr - 0.5) * s) * 255; d[o + 1] = (0.5 + (cg - 0.5) * s) * 255; d[o + 2] = (0.5 + (cb - 0.5) * s) * 255;
      d[o + 3] = 255 * clamp((1 - r) * r0);
    }
    g.putImageData(img, 0, 0); return c;
  }
  function paint() {
    const g = cv.getContext('2d'), W = cv.width, P = ctx.P();
    g.clearRect(0, 0, W, W); g.drawImage(bg, 0, 0);
    const a = P[hk] * Math.PI / 180, r = P[sk] / 100 * R();
    const x = W / 2 + Math.cos(a) * r, y = W / 2 - Math.sin(a) * r;
    g.strokeStyle = '#fff'; g.lineWidth = 2.5 * dpr; g.beginPath(); g.arc(x, y, 8 * dpr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 10 * dpr, 0, Math.PI * 2); g.stroke();
    info.innerHTML = `${name}<br>色相 ${P[hk]}<br>飽和度 ${P[sk]}<br>亮度 ${P[`cg_${tone}_l`]}`;
  }
  const set = e => {
    const rc = cv.getBoundingClientRect(), W = cv.width;
    const dx = (e.clientX - rc.left) * dpr - W / 2, dy = W / 2 - (e.clientY - rc.top) * dpr;
    const P = ctx.P();
    P[hk] = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360) % 360;
    P[sk] = Math.round(Math.min(1, Math.hypot(dx, dy) / R()) * 100);
    ctx.render(); paint();
  };
  let on = false;
  cv.addEventListener('pointerdown', e => { e.preventDefault(); on = true; cv.setPointerCapture(e.pointerId); set(e); });
  cv.addEventListener('pointermove', e => on && set(e));
  cv.addEventListener('pointerup', () => { if (on) { on = false; ctx.commit(); } });
  cv.addEventListener('pointercancel', () => { on = false; });
  // 點兩下回到中心（不加顏色）
  cv.addEventListener('dblclick', () => { const P = ctx.P(); P[hk] = 0; P[sk] = 0; ctx.render(); paint(); ctx.commit(); });
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect(); cv.width = cv.height = Math.round(r.width * dpr);
    bg = makeBg(); paint();
  });
}
