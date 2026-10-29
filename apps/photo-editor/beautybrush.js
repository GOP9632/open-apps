// 美顏筆：照 Hypic「修飾 › 筆刷」，用手指塗哪裡就修哪裡。8 種：
//   磨皮、除斑去痘、去黑眼圈、眼部亮白、去油光、調膚質、牙齒美白、去法令紋
// 做法照醒圖拆解的數字（見 plans/修圖/醒圖拆解重點.md）：
//   磨皮：模糊後按「1 − 變異度／(變異度 + ε)」混回去，暗部（R < 0.2）不磨、0.2～0.45 漸增
//   去黑眼圈：跟周圍亮的皮膚比，差值上限 0.2、係數 1.5；去法令紋：上限 0.3、係數 1.4 × 0.8
//   眼部亮白：細節 × 2 × 0.5，再提亮
// 怎麼存也照 Hypic（見 plans/修圖/Hypic美顏筆記憶體.md）：
//   每支筆一張半解析度遮罩（0～1），筆畫只畫進遮罩。強度是「塗到的地方最後多強」，同一處重複塗，
//   遮罩到這個強度就停（磨皮多塗一次會再細一點，最多到 1.5 倍），不會像以前越疊越假。
//   效果一律從「這一串美顏筆開始之前的照片」算：大範圍的模糊、參考膚色在短邊 400 的小圖上只算一次，
//   原尺寸只做逐點混合和幾個像素的小模糊。放開手指只重算遮罩改到的那一塊，256 格一塊、暫存陣列重用
//   （以前一筆要配 250～370MB 暫存，同一處畫幾次 iPhone 就整頁重開）。
//   除斑去痘照 Hypic 去痘：放開手指時只修筆刷附近那一塊，修在「開始之前的照片」上，再跟其他筆一起混合。
// 算好的結果寫進照片（app 的 paintPatch），復原只存改到的那一塊；遮罩、原圖的改動跟著那一步一起對調。
// 放開手指那一筆排進佇列在 GPU 上算，不等它算完，手指可以馬上畫下一筆；算好才把粉紅筆跡換成效果。
// 逐像素的迴圈都拆成小函式：放在大函式裡，瀏覽器很晚才最佳化，一個 30 萬像素的迴圈要 30～70ms（小函式 4～13ms）。
import { pinch, stageZoom } from './ui.js';
import { boxBlur } from './cblur.js';
import { gpuMix, gpuBlem, gpuWarm, gpuPrime, gpuFree } from './bbgpu.js';

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
// erase：擦除（Hypic 每支筆都有塗抹、擦除兩種，擦掉這支筆塗過的地方）
const st = { tool: 'smooth', size: 30, erase: false, str: Object.fromEntries(BRUSHES.map(b => [b.id, b.str])) };
const MASKED = ['smooth', 'circle', 'fold', 'eye', 'oil', 'texture', 'teeth'];

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
// 筆刷半徑（照片像素）：大小 1~100 → 照片沒放大時是短邊的 0.4%~12%；照片放大幾倍筆刷就細幾倍
export const bbRadius = (size, W, H) => Math.min(W, H) * (0.003 + 0.117 * size / 100) / stageZoom.z;

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const blur = (a, w, h, r) => boxBlur(new Float32Array(a), w, h, Math.max(1, r));
// 生成器一口氣跑完（筆畫當場要用）；stepwise：一步一步跑，每步之間讓畫面走一格，alive() 變 false 就停、回傳 null
// （點開美顏筆時在背景先算的那些，iPhone 一口氣做完要停 0.1～0.2 秒，評審 #159）
const done = g => { let r; while (!(r = g.next()).done); return r.value; };
async function stepwise(g, alive) {
  let r;
  while (!(r = g.next()).done) { await new Promise(f => setTimeout(f)); if (!alive()) return null; }
  return r.value;
}
// 加權模糊：sum(a·wt) / sum(wt)；三個顏色共用一次權重的模糊（每模糊一次是一步）
const wblur3 = (...a) => done(wblur3s(...a));
function* wblur3s(c, wt, w, h, r) {
  const ww = blur(wt, w, h, r), out = [];
  yield;
  for (const a of c) {
    const b = boxBlur(mulW(a, wt), w, h, Math.max(1, r));
    out.push(divW(b, ww, a)); yield;
  }
  return out;
}
// 生成器裡的逐像素迴圈瀏覽器很晚才最佳化（評審 #162：換黑眼圈那步 144ms），迴圈都放在下面這些小函式
function mulW(a, wt) { const n = wt.length, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] * wt[i]; return o; }
function divW(b, ww, a) { for (let i = 0, n = b.length; i < n; i++) b[i] = ww[i] > 1e-6 ? b[i] / ww[i] : a[i]; return b; }
function sqDiff(L, Lb) { const n = L.length, V = new Float32Array(n); for (let i = 0; i < n; i++) V[i] = (L[i] - Lb[i]) ** 2; return V; }
function pow4(L) { const n = L.length, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = L[i] ** 4 + 1e-4; return o; }
function oilWt(L, Lb) { const n = L.length, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = 1 - sstep(0.02, 0.1, L[i] - Lb[i]) * sstep(0.5, 0.8, L[i]) + 1e-4; return o; }
function darkD(ref, low, cap) {
  const n = ref[0].length, D = [0, 1, 2].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const dl = 0.299 * (ref[0][i] - low[0][i]) + 0.587 * (ref[1][i] - low[1][i]) + 0.114 * (ref[2][i] - low[2][i]);
    const keep = 1 - sstep(cap, cap * 1.7, dl);
    for (let j = 0; j < 3; j++) D[j][i] = Math.min(cap, Math.max(0, ref[j][i] - low[j][i])) * keep;
  }
  return D;
}

// 暫存陣列：每一塊都拿同一組，不要一直重配
const pool = new Map();
function buf(key, n) {
  let a = pool.get(key);
  if (!a || a.length < n) { a = new Float32Array(Math.max(n, 1 << 16)); pool.set(key, a); }
  return a.subarray(0, n);
}
// 小塊方框模糊（結果放 dst），暫存也重用
const blurTo = (src, dst, w, h, r) => { dst.set(src); return boxBlur(dst, w, h, r, 3, buf('tmp', src.length)); };
// 雙線性取樣用的格子：第 p0 + k 個像素落在小圖哪兩格之間
// key：同一個 key 每塊重用同一組陣列（評審量到一筆配 460～590 個小陣列，多半是這裡）
const ipool = new Map();
function ibuf(key, n) {
  let a = ipool.get(key);
  if (!a || a.length < n) { a = new Int32Array(Math.max(n, 4096)); ipool.set(key, a); }
  return a.subarray(0, n);
}
function grid(p0, n, s, size, key) {
  const i0 = ibuf(key + '0', n), i1 = ibuf(key + '1', n), f = buf('g' + key, n);
  for (let k = 0; k < n; k++) {
    const u = Math.min(size - 1, Math.max(0, (p0 + k + 0.5) * s - 0.5)), a = Math.floor(u);
    i0[k] = a; i1[k] = Math.min(size - 1, a + 1); f[k] = u - a;
  }
  return { i0, i1, f };
}
const bil = (a, w, gx, gy, x, y) => {
  const r0 = gy.i0[y] * w, r1 = gy.i1[y] * w, c0 = gx.i0[x], c1 = gx.i1[x], fx = gx.f[x], fy = gy.f[y];
  const t = a[r0 + c0] + (a[r0 + c1] - a[r0 + c0]) * fx, b = a[r1 + c0] + (a[r1 + c1] - a[r1 + c0]) * fx;
  return t + (b - t) * fy;
};
// 兩塊像素之間複製（a、b 各自的左上角和寬），只複製 [x0,x1)×[y0,y1)
function blit(a, ax, ay, aw, b, bx, by, bw, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) b.set(a.subarray(((y - ay) * aw + x0 - ax) * 4, ((y - ay) * aw + x1 - ax) * 4), ((y - by) * bw + x0 - bx) * 4);
}

// ---------- 一串美顏筆 ----------
// 同一張照片連續塗的美顏筆共用一個 ses：
//   O：開始之前的照片，只存塗過的那幾格（256 × 256 一格，第一次要改那一格時才存）
//   Oh：開始之前的照片縮到短邊 400，模糊、參考膚色都在這上面算，各筆第一次用到時算一次（hel）
//   O0：除斑改過的格子，改之前真正的原圖（除斑的橡皮擦換回這個）
//   A：每支筆一張遮罩（半解析度，0～255）
const TS = 256, BS = 256;
const session = (canvas, v0) => done(sessionSteps(canvas, v0));
function* sessionSteps(canvas, v0) {
  const W = canvas.width, H = canvas.height, S = Math.min(W, H), R0 = S * 0.038;  // R0：預設大小的筆刷半徑
  const ms = Math.min(1, Math.max(0.5, 1000 / Math.max(W, H))), hs = Math.min(1, 400 / S);
  const loc = [0.06, 0.03, 0.05].map(f => Math.max(1, Math.round(R0 * f)));  // 眼部亮白、調膚質、去油光的小模糊
  const ses = {
    canvas, ctx: canvas.getContext('2d'), W, H, S, R0, v0,
    mw: Math.max(1, Math.round(W * ms)), mh: Math.max(1, Math.round(H * ms)),
    hw: Math.max(1, Math.round(W * hs)), hh: Math.max(1, Math.round(H * hs)),
    ntx: Math.ceil(W / TS), A: {}, box: {}, O: new Map(), O0: new Map(), hel: {}, hp: [], dirty: [],
    re: loc[0], rt: loc[1], ro: loc[2], mg: 3 * Math.max(...loc, 2) + 2,
  };
  ses.Oh = yield* shrink(canvas, ses.hw, ses.hh);
  return ses;
}
function kill(ses) { Object.assign(ses, { dead: true, canvas: null, ctx: null, O: null, O0: null, A: null, Oh: null, hel: null }); }
// 縮小圖：一次縮一半（瀏覽器一次縮太多會跳格），回傳 [R, G, B, L]（0～1）。
// 每一半照列分段畫（每段約 50 萬像素、剪裁框對齊像素，跟一次畫完一樣），每段是一步：1200 萬像素第一次縮一半 iPhone 要 40ms
function* shrink(src, w, h) {
  let c = src;
  while (c.width / 2 >= w && c.height / 2 >= h) {
    // 中間那幾張也放記憶體：照片在記憶體，畫進 GPU canvas 再讀回要等 GPU（評審 L71：點開美顏筆停 134ms，大半在等）
    const t = newCanvas(Math.ceil(c.width / 2), Math.ceil(c.height / 2)), x = t.getContext('2d', { willReadFrequently: true }), n = Math.max(1, Math.ceil(5e5 / t.width));
    for (let y = 0; y < t.height; y += n) {
      x.save(); x.beginPath(); x.rect(0, y, t.width, Math.min(n, t.height - y)); x.clip(); x.drawImage(c, 0, 0, t.width, t.height); x.restore();
      yield;
    }
    if (c !== src) c.width = 0;
    c = t;
  }
  const t = newCanvas(w, h), x = t.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, h);
  if (c !== src) c.width = 0;
  yield;
  const d = x.getImageData(0, 0, w, h).data, n = w * h, o = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    o[0][i] = r; o[1][i] = g; o[2][i] = b; o[3][i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  t.width = 0;
  return o;
}
function eachTile(ses, x0, y0, x1, y1, f) {
  for (let ty = Math.floor(y0 / TS); ty * TS < y1; ty++) for (let tx = Math.floor(x0 / TS); tx * TS < x1; tx++) f(ty * ses.ntx + tx, tx * TS, ty * TS);
}
// 要改照片的那幾格，改之前先把「開始之前」的樣子存起來
function capture(ses, x0, y0, x1, y1) {
  eachTile(ses, x0, y0, x1, y1, (k, X, Y) => {
    if (ses.O.has(k)) return;
    const w = Math.min(TS, ses.W - X), h = Math.min(TS, ses.H - Y);
    ses.O.set(k, { x: X, y: Y, w, h, d: ses.ctx.getImageData(X, Y, w, h).data });
  });
}
// 讀「開始之前的照片」：沒存過的格子還沒被改過，直接讀照片
function readO(ses, x0, y0, x1, y1) {
  const w = x1 - x0, d = ses.ctx.getImageData(x0, y0, w, y1 - y0).data;
  eachTile(ses, x0, y0, x1, y1, k => {
    const t = ses.O.get(k);
    if (t) blit(t.d, t.x, t.y, t.w, d, x0, y0, w, Math.max(x0, t.x), Math.max(y0, t.y), Math.min(x1, t.x + t.w), Math.min(y1, t.y + t.h));
  });
  return d;
}
function writeO(ses, x0, y0, x1, y1, d) {
  capture(ses, x0, y0, x1, y1);
  eachTile(ses, x0, y0, x1, y1, k => {
    const t = ses.O.get(k);
    if (!ses.O0.has(k)) ses.O0.set(k, { ...t, d: t.d.slice() });
    blit(d, x0, y0, x1 - x0, t.d, t.x, t.y, t.w, Math.max(x0, t.x), Math.max(y0, t.y), Math.min(x1, t.x + t.w), Math.min(y1, t.y + t.h));
  });
  ses.dirty.push([x0, y0, x1, y1]);
}
// 除斑改過「開始之前的照片」：小圖那幾格重算，記下來（ses.hp），各筆的效果下次用到時只重算那一圈
function fresh(ses) {
  if (!ses.dirty.length) return;
  const { W, H, hw, hh, Oh } = ses, sx = hw / W, sy = hh / H;
  for (const [x0, y0, x1, y1] of ses.dirty) {
    const i0 = Math.floor(x0 * sx), i1 = Math.min(hw, Math.ceil(x1 * sx)), j0 = Math.floor(y0 * sy), j1 = Math.min(hh, Math.ceil(y1 * sy));
    const fx0 = Math.floor(i0 / sx), fx1 = Math.min(W, Math.ceil(i1 / sx)), fy0 = Math.floor(j0 / sy), fy1 = Math.min(H, Math.ceil(j1 / sy));
    const d = readO(ses, fx0, fy0, fx1, fy1), acc = new Float32Array((i1 - i0) * (j1 - j0) * 4);
    sumCells(d, fx0, fy0, fx1, fy1, sx, sy, i0, j0, i1, j1, acc);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const o = ((j - j0) * (i1 - i0) + i - i0) * 4, q = j * hw + i, c = acc[o + 3] * 255;
      if (!c) continue;
      const r = acc[o] / c, g = acc[o + 1] / c, b = acc[o + 2] / c;
      Oh[0][q] = r; Oh[1][q] = g; Oh[2][q] = b; Oh[3][q] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    ses.hp.push([i0, j0, i1, j1]);
  }
  ses.dirty = [];
}
// 照片 [fx0,fx1)×[fy0,fy1)（d）每個像素加進小圖 [i0,i1)×[j0,j1) 對應的那格（acc：R G B 個數）
function sumCells(d, fx0, fy0, fx1, fy1, sx, sy, i0, j0, i1, j1, acc) {
  const fw = fx1 - fx0, iw = i1 - i0;
  for (let y = fy0; y < fy1; y++) {
    const jo = (Math.min(j1 - 1, Math.floor(y * sy)) - j0) * iw;
    for (let x = fx0, p = (y - fy0) * fw * 4; x < fx1; x++, p += 4) {
      const o = (jo + Math.min(i1 - 1, Math.floor(x * sx)) - i0) * 4;
      acc[o] += d[p]; acc[o + 1] += d[p + 1]; acc[o + 2] += d[p + 2]; acc[o + 3]++;
    }
  }
}
// 各筆在小圖上只算一次的部分；之後除斑改到的那幾塊（seen 之後的 ses.hp）用到時才補算
function hel(ses, t) {
  let o = ses.hel[t];
  if (!o) { o = ses.hel[t] = helCalc(t, ses.Oh, ses.hw, ses.hh, ses.R0, ses.S, ses.hw / ses.W); o.seen = ses.hp.length; }
  while (o.seen < ses.hp.length) helPatch(ses, t, o, ...ses.hp[o.seen++]);
  return o;
}
// 點開美顏筆時在背景先算 hel（每模糊一次讓畫面走一格）；筆畫比它先要用到，就照舊當場算（這邊算到一半的丟掉）。
// 算的時候除斑改了小圖：seen 記開始那時候，改到的那幾塊之後 hel() 會補算
async function helWarm(ses, t, alive) {
  if (ses.hel[t]) return;
  const seen = ses.hp.length, o = await stepwise(helSteps(t, ses.Oh, ses.hw, ses.hh, ses.R0, ses.S, ses.hw / ses.W), () => alive() && !ses.dead && !ses.hel[t]);
  if (o && !ses.hel[t]) { o.seen = seen; ses.hel[t] = o; }
}
// O：小圖（R G B L）、w × h；k：小圖對原圖的比例
const helCalc = (...a) => done(helSteps(...a));
function* helSteps(t, O, w, h, R0, S, k) {
  const c = O.slice(0, 3), L = O[3];
  let o = {};
  // 三個顏色各模糊一次，每次是一步
  const blur3 = function* (r) { const out = []; for (const a of c) { out.push(blur(a, w, h, r)); yield; } return out; };
  if (t === 'smooth') {
    // 醒圖：短邊 324px 縮圖上 9 點方框、間距 1.5px，約短邊的 1.5%
    const r = S * 0.015 * k, Lb = blur(L, w, h, r);
    yield;
    o = { B: yield* blur3(r), V: boxBlur(sqDiff(L, Lb), w, h, Math.max(1, r)) };
  } else if (t === 'circle' || t === 'fold') {
    // 跟周圍亮的皮膚比，暗多少補多少（只補低頻，紋理留著）；差太多的是眼珠、眉毛、嘴縫這種本來就黑的地方，不補
    const fold = t === 'fold', cap = fold ? 0.3 : 0.2;
    const ref = yield* wblur3s(c, pow4(L), w, h, R0 * (fold ? 0.7 : 0.6) * k);
    const low = yield* blur3(R0 * 0.08 * k);
    o = { D: darkD(ref, low, cap) };
  } else if (t === 'oil') {
    // 周圍不反光的皮膚是什麼顏色
    const r = R0 * 0.4 * k, Lb = blur(L, w, h, r);
    yield;
    o = { Lb, ref: yield* wblur3s(c, oilWt(L, Lb), w, h, r) };
  } else if (t === 'texture') {
    o = { b2: yield* blur3(R0 * 0.25 * k) };
  }
  return o;
}
// 小圖上一個像素改了，各筆的效果最遠會影響到幾格（三次方框模糊一次影響 3r 格，模糊完再模糊就加起來）
function helReach(t, R0, S, k) {
  const r = x => 3 * Math.round(Math.max(1, x));
  if (t === 'smooth') return 2 * r(S * 0.015 * k) + 2;
  if (t === 'circle' || t === 'fold') return Math.max(r(R0 * (t === 'fold' ? 0.7 : 0.6) * k), r(R0 * 0.08 * k)) + 2;
  if (t === 'oil') return 2 * r(R0 * 0.4 * k) + 2;
  if (t === 'texture') return r(R0 * 0.25 * k) + 2;
  return 0;
}
// 除斑改了小圖的 [i0,i1)×[j0,j1)：這支筆的效果只重算受影響的那圈（以前每點一下痘痘，用過的每支筆都整張重算，
// 七支筆都用過時一筆要多花 0.4 秒）。外面再多讀一圈一樣寬的，裡面算出來就跟整張重算一樣
function helPatch(ses, t, o, i0, j0, i1, j1) {
  const { hw, hh, Oh, R0, S } = ses, k = hw / ses.W, M = helReach(t, R0, S, k);
  if (!M) return;
  const a0 = Math.max(0, i0 - M), b0 = Math.max(0, j0 - M), a1 = Math.min(hw, i1 + M), b1 = Math.min(hh, j1 + M);
  const x0 = Math.max(0, a0 - M), y0 = Math.max(0, b0 - M), x1 = Math.min(hw, a1 + M), y1 = Math.min(hh, b1 + M), w = x1 - x0, h = y1 - y0;
  const win = Oh.map(a => { const d = new Float32Array(w * h); for (let y = 0; y < h; y++) d.set(a.subarray((y0 + y) * hw + x0, (y0 + y) * hw + x1), y * w); return d; });
  const p = helCalc(t, win, w, h, R0, S, k);
  const put = (g, l) => { for (let y = b0; y < b1; y++) g.set(l.subarray((y - y0) * w + a0 - x0, (y - y0) * w + a1 - x0), y * hw + a0); };
  for (const key in p) Array.isArray(p[key]) ? o[key].forEach((g, j) => put(g, p[key][j])) : put(o[key], p[key]);
  // GPU 上那張只要重傳改到的這塊（下次用到之前改了好幾塊就合起來）
  o.v = (o.v || 0) + 1; o.pr = o.pr ? [Math.min(o.pr[0], a0), Math.min(o.pr[1], b0), Math.max(o.pr[2], a1), Math.max(o.pr[3], b1)] : [a0, b0, a1, b1];
}

// 重算照片的 [x0,x1)×[y0,y1)：開始之前的照片 + 每支筆（強度 0 → 遮罩值）的變化。效果都從開始之前的照片算、各筆互相不疊，
// 四捨五入只有最後一次（以前一般一筆是「現在的照片 + 這支筆舊遮罩 → 新遮罩的變化」，每筆捨一次，多塗的小變化會被捨掉，評審 #149）
async function compose(ses, x0, y0, x1, y1) {
  fresh(ses);
  const w = x1 - x0, h = y1 - y0, before = ses.ctx.getImageData(x0, y0, w, h);
  // 先交給 GPU（bbgpu.js，同樣的公式）；不支援才在這裡逐塊算
  let d = gpu(ses, x0, y0, x1, y1);
  if (d) d = await d;
  if (ses.dead) return null;
  if (!d) {
    d = readO(ses, x0, y0, x1, y1);
    for (let by = y0; by < y1; by += BS) for (let bx = x0; bx < x1; bx += BS) block(ses, bx, by, Math.min(x1, bx + BS), Math.min(y1, by + BS), d, x0, y0, w);
  }
  const after = new ImageData(d, w, h);
  // 只留真的有變的那塊
  const c = diffBox(before.data, d, w, h);
  if (!c) return null;
  const [cx0, cy0, cx1, cy1] = c;
  const crop = im => {
    if (cx0 === 0 && cy0 === 0 && cx1 === w - 1 && cy1 === h - 1) return im;
    const o = new ImageData(cx1 - cx0 + 1, cy1 - cy0 + 1);
    blit(im.data, 0, 0, w, o.data, cx0, cy0, o.width, cx0, cy0, cx1 + 1, cy1 + 1);
    return o;
  };
  return { x: x0 + cx0, y: y0 + cy0, before: crop(before), after: crop(after) };
}
// 兩塊寬 w 高 h 的 RGBA 哪裡不一樣：回傳 [x0, y0, x1, y1]（含），都一樣回傳 null（一個像素當一個 32 位元整數比）
function diffBox(a, b, w, h) {
  const A = new Uint32Array(a.buffer, a.byteOffset, w * h), B = new Uint32Array(b.buffer, b.byteOffset, w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0, i = y * w; x < w; x++, i++) if (A[i] !== B[i]) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    if (l < x0) x0 = l; if (r > x1) x1 = r; if (y < y0) y0 = y; y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
// 遮罩取樣到這一塊的每個像素（0～1）；A 的左上角在 (ox, oy)、寬 w
function maskAt(A, w, ox, oy, gx, gy, bw, bh, dst) {
  let any = false;
  for (let y = 0; y < bh; y++) {
    const r0 = (gy.i0[y] - oy) * w - ox, r1 = (gy.i1[y] - oy) * w - ox, fy = gy.f[y];
    for (let x = 0; x < bw; x++) {
      const c0 = gx.i0[x], c1 = gx.i1[x], fx = gx.f[x];
      const t = A[r0 + c0] + (A[r0 + c1] - A[r0 + c0]) * fx, b = A[r1 + c0] + (A[r1 + c1] - A[r1 + c0]) * fx, v = (t + (b - t) * fy) / 255;
      dst[y * bw + x] = v;
      if (v > 0.002) any = true;
    }
  }
  return any;
}
// 一支筆在一個像素的效果（強度 a、原圖 r g b、亮度 l）→ P0 P1 P2。
// h：小圖上取樣的值（各筆不同）；K：這一塊的小模糊；e：像素在擴大範圍裡的位置
let P0 = 0, P1 = 0, P2 = 0;
const h = new Float64Array(4), K = {};
function pix(t, a, r, g, b, l, e) {
  P0 = r; P1 = g; P2 = b;
  if (a <= 0) return;
  if (t === 'smooth') {
    const f = (1 - h[0] / (h[0] + 0.002)) * sstep(0.2, 0.45, r) * a;
    P0 += (h[1] - r) * f; P1 += (h[2] - g) * f; P2 += (h[3] - b) * f;
  } else if (t === 'circle' || t === 'fold') {
    const k = Math.min(1, (t === 'fold' ? 1.4 * 0.8 : 1.5) * a);
    P0 += h[0] * k; P1 += h[1] * k; P2 += h[2] * k;
  } else if (t === 'eye') {
    const lift = 0.12 * a * sstep(0.15, 0.6, l), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const white = 0.4 * a * (1 - sstep(0.12, 0.3, mx - mn)) * sstep(0.4, 0.6, l);  // 眼白退黃、退紅
    let v = r + (r - K.lb[0][e]) * a; v += (l - v) * white; P0 = v + (1 - v) * lift;
    v = g + (g - K.lb[1][e]) * a; v += (l - v) * white; P1 = v + (1 - v) * lift;
    v = b + (b - K.lb[2][e]) * a; v += (l - v) * white; P2 = v + (1 - v) * lift;
  } else if (t === 'oil') {
    // 換成周圍不反光的皮膚，留一半紋理
    const f = Math.min(1, K.sh[e] * 1.3) * a;
    P0 += (h[0] + (r - K.fine[0][e]) * 0.5 - r) * f; P1 += (h[1] + (g - K.fine[1][e]) * 0.5 - g) * f; P2 += (h[2] + (b - K.fine[2][e]) * 0.5 - b) * f;
  } else if (t === 'texture') {
    // 中頻（不均、坑疤）壓平，細紋理加強一點，皮膚看起來細緻但不假
    const p = 1 - 0.7 * a, q = 1 + 0.5 * a, b1 = K.lb;
    P0 = h[0] + (b1[0][e] - h[0]) * p + (r - b1[0][e]) * q;
    P1 = h[1] + (b1[1][e] - h[1]) * p + (g - b1[1][e]) * q;
    P2 = h[2] + (b1[2][e] - h[2]) * p + (b - b1[2][e]) * q;
  } else if (t === 'teeth') {
    // 偏黃的亮處退黃、提亮；偏紅的嘴唇不動
    const yel = Math.min(1, Math.max(0, ((r + g) / 2 - b) * 3)), red = Math.min(1, Math.max(0, (r - g - 0.08) * 5));
    const gate = sstep(0.25, 0.5, l) * (1 - red), dd = 0.8 * a * yel * gate, lift = 0.15 * a * gate;
    P0 = r + (l - r) * dd; P0 += (1 - P0) * lift; P1 = g + (l - g) * dd; P1 += (1 - P1) * lift; P2 = b + (l - b) * dd; P2 += (1 - P2) * lift;
  }
}
const HELD = { smooth: hp => [hp.V, ...hp.B], circle: hp => hp.D, fold: hp => hp.D, oil: hp => hp.ref, texture: hp => hp.b2, eye: () => [], teeth: () => [] };
// GPU 用：小圖上的效果打包成一張 RGBA 浮點貼圖（去油光多放周圍亮度 Lb），小模糊每個通道的半徑
const PACK = { ...HELD, oil: hp => [...hp.ref, hp.Lb] }, RAD = { eye: s => [s.re, s.re, s.re, 0], texture: s => [s.rt, s.rt, s.rt, 0], oil: s => [2, 2, 2, s.ro] };
// GPU 上一支筆要的東西（見 gpuMix）
function mkJob(ses, t) {
  const hp = hel(ses, t);
  // r：只打包小圖的 [r0,r2)×[r1,r3)
  const pack = (r = [0, 0, ses.hw, ses.hh]) => {
    const a = PACK[t](hp);
    if (!a.length) return null;
    const w = r[2] - r[0], d = new Float32Array(w * (r[3] - r[1]) * 4);
    for (let k = 0; k < a.length; k++) packCh(a[k], d, k, ses.hw, r[0], r[1], w, r[3]);
    return d;
  };
  return { t, A: ses.A[t], m: null, box: ses.box[t], hel: hp, pack, rad: RAD[t]?.(ses) || null };
}
function packCh(c, d, k, hw, x0, y0, w, y1) {
  for (let y = y0, o = k; y < y1; y++) for (let i = y * hw + x0, e = i + w; i < e; i++, o += 4) d[o] = c[i];
}
// 回傳 Promise（GPU 在算）或 null（不支援，用 CPU）
function gpu(ses, x0, y0, x1, y1) {
  // 只算遮罩塗過這一塊的筆（同 block()），其他筆的效果不用補算
  const mx = ses.mw / ses.W, my = ses.mh / ses.H, hit = b => b && b[0] <= x1 * mx + 1 && b[2] >= x0 * mx - 1 && b[1] <= y1 * my + 1 && b[3] >= y0 * my - 1;
  const jobs = MASKED.filter(t => ses.A[t] && hit(ses.box[t])).map(t => mkJob(ses, t));
  return jobs.length ? gpuMix(ses, jobs, ses.mg, (a, b, c, e) => readO(ses, a, b, c, e), x0, y0, x1, y1, null) : null;
}
function block(ses, x0, y0, x1, y1, out, ox, oy, ow) {
  const { W, H, mw, mh, hw, hh } = ses, mx = mw / W, my = mh / H;
  const tools = MASKED.filter(t => {
    const b = ses.box[t];
    return ses.A[t] && b && b[0] <= x1 * mx + 1 && b[2] >= x0 * mx - 1 && b[1] <= y1 * my + 1 && b[3] >= y0 * my - 1;
  });
  if (!tools.length) return;
  const bw = x1 - x0, bh = y1 - y0, nb = bw * bh;
  const gx = grid(x0, bw, mx, mw, 'mx'), gy = grid(y0, bh, my, mh, 'my');
  // 這一塊每支筆的強度；都沒塗到就不用算
  const todo = [];
  for (const t of tools) {
    const a1 = buf('a1' + t, nb);
    if (maskAt(ses.A[t], mw, 0, 0, gx, gy, bw, bh, a1)) todo.push({ t, a1 });
  }
  if (!todo.length) return;
  const local = todo.some(j => j.t === 'eye' || j.t === 'texture' || j.t === 'oil'), mg = local ? ses.mg : 0;
  const ex0 = Math.max(0, x0 - mg), ey0 = Math.max(0, y0 - mg), ex1 = Math.min(W, x1 + mg), ey1 = Math.min(H, y1 + mg), ew = ex1 - ex0, eh = ey1 - ey0;
  const src = readO(ses, ex0, ey0, ex1, ey1), n = ew * eh, c = [buf('c0', n), buf('c1', n), buf('c2', n)], L = buf('L', n);
  for (let i = 0; i < n; i++) {
    const r = src[i * 4] / 255, g = src[i * 4 + 1] / 255, b = src[i * 4 + 2] / 255;
    c[0][i] = r; c[1][i] = g; c[2][i] = b; L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const d = [buf('d0', nb).fill(0), buf('d1', nb).fill(0), buf('d2', nb).fill(0)];
  const hx = grid(x0, bw, hw / W, hw, 'hx'), hy = grid(y0, bh, hh / H, hh, 'hy');
  const blur3 = (key, r) => c.map((a, j) => blurTo(a, buf(key + j, n), ew, eh, r));
  for (const { t, a1 } of todo) {
    const hp = hel(ses, t), hs = HELD[t](hp), nh = hs.length;
    if (t === 'eye') K.lb = blur3('le', ses.re);
    if (t === 'texture') K.lb = blur3('lt', ses.rt);
    if (t === 'oil') {
      // 比周圍亮很多的亮點是油光（逐點算，小亮點才不會被小圖抹掉）
      K.fine = blur3('lf', 2); const sh = K.sh = buf('sh', n);
      const qx = grid(ex0, ew, hw / W, hw, 'qx'), qy = grid(ey0, eh, hh / H, hh, 'qy');
      for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) { const i = y * ew + x; sh[i] = sstep(0.02, 0.1, L[i] - bil(hp.Lb, hw, qx, qy, x, y)) * sstep(0.5, 0.8, L[i]); }
      boxBlur(sh, ew, eh, ses.ro, 3, buf('tmp', n));
    }
    for (let y = 0; y < bh; y++) {
      const r0 = hy.i0[y] * hw, r1 = hy.i1[y] * hw, fy = hy.f[y];
      for (let x = 0; x < bw; x++) {
        const j = y * bw + x, an_ = a1[j];
        if (an_ <= 0.002) continue;
        const e = (y + y0 - ey0) * ew + x + x0 - ex0, r = c[0][e], g = c[1][e], b = c[2][e], l = L[e];
        if (nh) {
          const c0 = hx.i0[x], c1 = hx.i1[x], fx = hx.f[x], w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
          for (let k = 0; k < nh; k++) { const a = hs[k]; h[k] = a[r0 + c0] * w00 + a[r0 + c1] * w01 + a[r1 + c0] * w10 + a[r1 + c1] * w11; }
        }
        pix(t, an_, r, g, b, l, e);
        d[0][j] += P0 - r; d[1][j] += P1 - g; d[2][j] += P2 - b;
      }
    }
  }
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const j = y * bw + x, q = ((y + y0 - oy) * ow + x + x0 - ox) * 4;
    if (!d[0][j] && !d[1][j] && !d[2][j]) continue;
    out[q] += d[0][j] * 255; out[q + 1] += d[1][j] * 255; out[q + 2] += d[2][j] * 255;
  }
}

// 筆畫畫進一塊 w × h 的遮罩（左上角 x0, y0、縮放 s），線寬 2R、邊緣羽化，回傳 0～1
function stroke(pts, x0, y0, w, h, s, R) {
  const mc = newCanvas(w, h), mx = mc.getContext('2d', { willReadFrequently: true }), r = R * s, feather = r * 0.25;
  mx.strokeStyle = '#fff'; mx.lineWidth = Math.max(1, 2 * r - feather * 2); mx.lineCap = mx.lineJoin = 'round';
  mx.beginPath();
  pts.forEach((p, i) => i ? mx.lineTo(p.x * s - x0, p.y * s - y0) : mx.moveTo(p.x * s - x0, p.y * s - y0));
  if (pts.length === 1) mx.lineTo(pts[0].x * s - x0 + 0.01, pts[0].y * s - y0);
  mx.stroke();
  const md = mx.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = md[i * 4 + 3] / 255;
  mc.width = 0;
  return boxBlur(m, w, h, Math.max(1, feather / 1.7));
}
function bounds(pts, pad, s, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return [Math.max(0, Math.floor((x0 - pad) * s)), Math.max(0, Math.floor((y0 - pad) * s)), Math.min(W, Math.ceil((x1 + pad) * s)), Math.min(H, Math.ceil((y1 + pad) * s))];
}
// 把一塊存起來的遮罩或原圖跟現在的對調（復原、重做）
function swapMask(ses, m) {
  const A = ses.A[m.tool];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const i = (m.y + y) * ses.mw + m.x + x, j = y * m.w + x, v = A[i]; A[i] = m.d[j]; m.d[j] = v; }
}
function swapO(ses, o) {
  const cur = readO(ses, o.x0, o.y0, o.x1, o.y1);
  writeO(ses, o.x0, o.y0, o.x1, o.y1, o.d); o.d = cur;
}

// 遮罩筆一筆：遮罩往「強度」靠近（磨皮第一筆到強度、多塗會再強一點；其他筆第一筆就到強度），
// 再重算遮罩改到的那塊照片。磨皮多塗的上限 C = 強度 ×（1.5 − 強度／2）：輕的時候約 1.5 倍，越強越接近強度本身，
// 50／60／67／80／100 是 0.625／0.72／0.78／0.88／1，相鄰都差 0.06 以上（評審 #149）。
// 以前上限一律 min(1, 1.5 倍)、每筆走 2/3，強度 67 以上第一筆都停在 0.667、多塗都到 1，滑桿上面三分之一沒作用（評審 M35）。
// 照片那塊一律從「開始之前的照片」用全部遮罩重算（四捨五入只有一次）：以前每筆在已經四捨五入的照片上加「新遮罩 − 舊遮罩」，
// 多塗的後幾筆遮罩只多幾階，變化不到半階就被捨掉，多塗等於沒塗（評審 #149）。
// 這筆遮罩有變、照片卻一個像素都沒變時，遮罩照樣留著（不記一步復原），下一筆才累積得上去
// 擦除（erase）：遮罩往 0 走，塗到的地方回到沒塗過的樣子
async function maskStroke(ses, tool, pts, R, k, erase) {
  const { W, H, mw, mh } = ses, s = mw / W;
  const [x0, y0, x1, y1] = bounds(pts, R + 3 / s, s, mw, mh), w = x1 - x0, h = y1 - y0;
  if (w < 1 || h < 1) return null;
  const cov = stroke(pts, x0, y0, w, h, s, R), A = ses.A[tool] ||= new Uint8Array(mw * mh);
  const C = tool !== 'smooth' ? k : k * (1.5 - 0.5 * k), T = erase ? 0 : Math.round(255 * C), dep = erase || C <= 0 ? 1 : Math.min(1, k / C);
  const old = new Uint8Array(w * h), c = toward(A, mw, x0, y0, w, h, cov, T, dep, old);
  if (!c) return null;
  const [cx0, cy0, cx1, cy1] = c;
  const m = { tool, x: x0 + cx0, y: y0 + cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 };
  m.d = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) m.d.set(old.subarray((cy0 + y) * w + cx0, (cy0 + y) * w + cx1 + 1), y * m.w);
  const b = ses.box[tool];
  ses.box[tool] = b ? [Math.min(b[0], m.x), Math.min(b[1], m.y), Math.max(b[2], m.x + m.w), Math.max(b[3], m.y + m.h)] : [m.x, m.y, m.x + m.w, m.y + m.h];
  // 遮罩改到的格子會影響到的照片範圍（雙線性多一格）
  const fx0 = Math.max(0, Math.floor((m.x - 1) / s)), fy0 = Math.max(0, Math.floor((m.y - 1) * H / mh)), fx1 = Math.min(W, Math.ceil((m.x + m.w + 1) / s)), fy1 = Math.min(H, Math.ceil((m.y + m.h + 1) * H / mh));
  capture(ses, fx0, fy0, fx1, fy1);
  const p = await compose(ses, fx0, fy0, fx1, fy1, null);
  if (!p) return null;
  return { ...p, aux: { ses, bytes: m.d.length, swap() { if (!ses.dead) swapMask(ses, m); } } };
}
// 遮罩 A 的 [x0,x0+w)×[y0,y0+h) 往 T 靠近 cov × dep，舊值存進 old；回傳有變的範圍 [x0, y0, x1, y1]（含、相對這塊），沒變回傳 null
function toward(A, mw, x0, y0, w, h, cov, T, dep, old) {
  let cx0 = w, cy0 = h, cx1 = -1, cy1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0, j = y * w, i = (y0 + y) * mw + x0; x < w; x++, j++, i++) {
    const a = A[i];
    old[j] = a;
    if (cov[j] < 0.002) continue;
    const v = Math.round(a + (T - a) * Math.min(1, cov[j] * dep));
    if (v === a) continue;
    A[i] = v;
    if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
  }
  return cx1 < 0 ? null : [cx0, cy0, cx1, cy1];
}

// 照片一條（寬 Gw、sh 列，從第 sy 列開始）n × n 加進小圖那格（c0 c1 c2：R G B 總和，cnt：個數）
function sumDown(d, Gw, sh, sy, n, gw, c0, c1, c2, cnt) {
  for (let y = 0; y < sh; y++) {
    const ro = ((sy + y) / n | 0) * gw;
    for (let x = 0, p = y * Gw * 4; x < Gw; x++, p += 4) { const o = ro + (x / n | 0); c0[o] += d[p]; c1[o] += d[p + 1]; c2[o] += d[p + 2]; cnt[o]++; }
  }
}
// 除斑去痘一筆：塗到的地方用筆刷外面的皮膚補（點一下痘痘就消掉），再把細紋理加回去。
// 長長一筆塗過去時，中間離邊太遠，就改用附近「不比周圍暗、不比周圍紅」的皮膚補。
// 補的那層是大範圍模糊，筆刷大時縮小算（最多 16 萬格），原尺寸只逐點混合
async function blemishStroke(ses, pts, R, k) {
  const { W, H } = ses;
  const F = bounds(pts, R + 2, 1, W, H), G = bounds(pts, R * 2.2, 1, W, H), Gw = G[2] - G[0], Gh = G[3] - G[1];
  if (F[2] - F[0] < 2 || F[3] - F[1] < 2) return null;
  const n = Math.max(1, Math.round(R / 20), Math.ceil(Math.sqrt(Gw * Gh / 160e3))), gw = Math.ceil(Gw / n), gh = Math.ceil(Gh / n), N = gw * gh;
  // 縮小的原圖（n × n 平均），一次讀一條，不要一口氣讀一大塊
  const c = [0, 1, 2].map(() => new Float32Array(N)), cnt = new Float32Array(N), step = n * Math.max(1, Math.floor(64 / n));
  for (let sy = 0; sy < Gh; sy += step) {
    const sh = Math.min(step, Gh - sy);
    sumDown(readO(ses, G[0], G[1] + sy, G[2], G[1] + sy + sh), Gw, sh, sy, n, gw, c[0], c[1], c[2], cnt);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) c[j][i] = cnt[i] ? c[j][i] / cnt[i] / 255 : 0;
  const m = stroke(pts.map(p => ({ x: p.x - G[0], y: p.y - G[1] })), 0, 0, gw, gh, 1 / n, R);
  const L = new Float32Array(N), red = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = 0.299 * c[0][i] + 0.587 * c[1][i] + 0.114 * c[2][i]; red[i] = c[0][i] - c[1][i]; }
  const r = Math.max(3, R * 0.4) / n, Lb = blur(L, gw, gh, r), redB = blur(red, gw, gh, r), wt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ok = sstep(-0.06, -0.02, L[i] - Lb[i]) * (1 - sstep(0.03, 0.07, red[i] - redB[i]));
    wt[i] = (1 - m[i]) + 0.03 * ok + 1e-5;
  }
  const fill = wblur3(c, wt, gw, gh, Math.max(3, R * 0.9) / n);
  // 原尺寸：補上去，再把「不算斑點」的細紋理加回來（斑點邊緣才不會留一圈亮邊）
  const before = readO(ses, F[0], F[1], F[2], F[3]), fw = F[2] - F[0];
  let cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1;
  // 先交給 GPU（bbgpu.js，同樣的公式）；不支援才在這裡逐塊算
  let g = gpuBlem(W, H, F, G, n, gw, gh, [...fill, m], [Lb, redB], k, (a, b, c, e) => readO(ses, a, b, c, e));
  if (g) g = await g;
  if (ses.dead) return null;
  const after = g || new Uint8ClampedArray(before);
  if (g) {
    const c = diffBox(before, after, fw, F[3] - F[1]);
    if (c) { cx0 = F[0] + c[0]; cy0 = F[1] + c[1]; cx1 = F[0] + c[2]; cy1 = F[1] + c[3]; }
  } else for (let by = F[1]; by < F[3]; by += BS) for (let bx = F[0]; bx < F[2]; bx += BS) {
    const x1 = Math.min(F[2], bx + BS), y1 = Math.min(F[3], by + BS), bw = x1 - bx, bh = y1 - by;
    const gx = grid(bx - G[0], bw, 1 / n, gw, 'bx'), gy = grid(by - G[1], bh, 1 / n, gh, 'by');
    let any = false;
    const mb = buf('bm', bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const v = bil(m, gw, gx, gy, x, y); mb[y * bw + x] = v; if (v > 0.002) any = true; }
    if (!any) continue;
    const ex0 = Math.max(0, bx - 6), ey0 = Math.max(0, by - 6), ex1 = Math.min(W, x1 + 6), ey1 = Math.min(H, y1 + 6), ew = ex1 - ex0, eh = ey1 - ey0, ne = ew * eh;
    const src = readO(ses, ex0, ey0, ex1, ey1), qx = grid(ex0 - G[0], ew, 1 / n, gw, 'bqx'), qy = grid(ey0 - G[1], eh, 1 / n, gh, 'bqy');
    const cc = [buf('c0', ne), buf('c1', ne), buf('c2', ne)], okw = buf('ok', ne), cw = [buf('w0', ne), buf('w1', ne), buf('w2', ne)];
    for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
      const i = y * ew + x, R_ = src[i * 4] / 255, G_ = src[i * 4 + 1] / 255, B_ = src[i * 4 + 2] / 255, l = 0.299 * R_ + 0.587 * G_ + 0.114 * B_;
      const ok = sstep(-0.06, -0.02, l - bil(Lb, gw, qx, qy, x, y)) * (1 - sstep(0.03, 0.07, R_ - G_ - bil(redB, gw, qx, qy, x, y)));
      cc[0][i] = R_; cc[1][i] = G_; cc[2][i] = B_; okw[i] = ok + 1e-3;
      cw[0][i] = R_ * okw[i]; cw[1][i] = G_ * okw[i]; cw[2][i] = B_ * okw[i];
    }
    const okb = blurTo(okw, buf('okb', ne), ew, eh, 1.5);
    for (const a of cw) boxBlur(a, ew, eh, 1.5, 3, buf('tmp', ne));
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const mm = mb[y * bw + x];
      if (mm <= 0.002) continue;
      const e = (y + by - ey0) * ew + x + bx - ex0, q = ((y + by - F[1]) * fw + x + bx - F[0]) * 4, ok = okw[e] - 1e-3;
      for (let j = 0; j < 3; j++) {
        const v = cc[j][e], fine = cw[j][e] / okb[e];
        after[q + j] = (v + (bil(fill[j], gw, gx, gy, x, y) + (v - fine) * ok - v) * k * mm) * 255 + 0.5;
      }
      if (after[q] !== before[q] || after[q + 1] !== before[q + 1] || after[q + 2] !== before[q + 2]) {
        const X = x + bx, Y = y + by;
        if (X < cx0) cx0 = X; if (X > cx1) cx1 = X; if (Y < cy0) cy0 = Y; if (Y > cy1) cy1 = Y;
      }
    }
  }
  if (cx1 < 0) return null;
  return commitO(ses, F, before, after, cx0, cy0, cx1, cy1);
}
// 除斑的橡皮擦：塗到的地方，「開始之前的照片」換回除斑改之前的樣子（O0），再跟其他筆一起重算
async function blemishErase(ses, pts, R) {
  // 擦的範圍比筆刷大一成半、邊緣四倍陡：除斑補的那層會暈到筆刷邊外面一點，以前同大小擦一次邊上留一圈（最多 35 階，
  // 擦兩、三次還剩 15、7 階，評審 L61）。現在擦一次剩 1～3 階，擦一半的邊還是軟的
  const { W, H } = ses, R2 = R * 1.15, F = bounds(pts, R2 + 2, 1, W, H), fw = F[2] - F[0], fh = F[3] - F[1];
  if (fw < 2 || fh < 2) return null;
  const cov = stroke(pts, F[0], F[1], fw, fh, 1, R2), before = readO(ses, F[0], F[1], F[2], F[3]), org = new Uint8ClampedArray(before);
  for (let i = 0; i < cov.length; i++) cov[i] = Math.min(1, cov[i] * 4);
  eachTile(ses, F[0], F[1], F[2], F[3], k => {
    const t = ses.O0.get(k);
    if (t) blit(t.d, t.x, t.y, t.w, org, F[0], F[1], fw, Math.max(F[0], t.x), Math.max(F[1], t.y), Math.min(F[2], t.x + t.w), Math.min(F[3], t.y + t.h));
  });
  const after = new Uint8ClampedArray(before);
  let cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const j = y * fw + x, c = cov[j], q = j * 4;
    if (c < 0.002 || (before[q] === org[q] && before[q + 1] === org[q + 1] && before[q + 2] === org[q + 2])) continue;
    for (let i = 0; i < 3; i++) after[q + i] = Math.round(before[q + i] + (org[q + i] - before[q + i]) * Math.min(1, c));
    if (after[q] !== before[q] || after[q + 1] !== before[q + 1] || after[q + 2] !== before[q + 2]) {
      const X = x + F[0], Y = y + F[1];
      if (X < cx0) cx0 = X; if (X > cx1) cx1 = X; if (Y < cy0) cy0 = Y; if (Y > cy1) cy1 = Y;
    }
  }
  if (cx1 < 0) return null;
  return commitO(ses, F, before, after, cx0, cy0, cx1, cy1);
}
// 「開始之前的照片」F 這塊從 before 改成 after（有變的是 [cx0,cx1]×[cy0,cy1]）：改在 O 上（復原時對調回來），再跟其他筆一起重算這塊
async function commitO(ses, F, before, after, cx0, cy0, cx1, cy1) {
  const { W, H } = ses, fw = F[2] - F[0];
  const o = { x0: cx0, y0: cy0, x1: cx1 + 1, y1: cy1 + 1 }, ow = o.x1 - o.x0, nd = new Uint8ClampedArray(ow * (o.y1 - o.y0) * 4);
  blit(after, F[0], F[1], fw, nd, o.x0, o.y0, ow, o.x0, o.y0, o.x1, o.y1);
  o.d = new Uint8ClampedArray(nd.length);
  blit(before, F[0], F[1], fw, o.d, o.x0, o.y0, ow, o.x0, o.y0, o.x1, o.y1);
  writeO(ses, o.x0, o.y0, o.x1, o.y1, nd);
  const mg = ses.mg, rx0 = Math.max(0, o.x0 - mg), ry0 = Math.max(0, o.y0 - mg), rx1 = Math.min(W, o.x1 + mg), ry1 = Math.min(H, o.y1 + mg);
  capture(ses, rx0, ry0, rx1, ry1);
  const p = await compose(ses, rx0, ry0, rx1, ry1);
  if (!p) { if (!ses.dead) swapO(ses, o); return null; }
  return { ...p, aux: { ses, bytes: o.d.length, swap() { if (!ses.dead) swapO(ses, o); } } };
}

// 這串還能接著塗嗎：同一張照片，而且從開始到現在每一步都是這串的美顏筆（中間塗鴉過、復原到開始之前就重開一串）
function valid(ses, S) {
  if (!ses || ses.dead || ses.canvas !== S.canvas || S.ver < ses.v0) return false;
  for (let k = ses.v0; k < S.ver; k++) if (S.edits[k]?.ses !== ses) return false;
  return true;
}
// 離開美顏筆分頁：下次進來是塗抹
export function bbLeave() { st.erase = false; }
// 照片收起來（壓成檔案）時，這串存的原圖、遮罩一起放掉
export function bbRelease(S) { if (S.bbSes) { kill(S.bbSes); S.bbSes = null; gpuFree(); } }

export function tabBeautyBrush(box, app) {
  const { item, sliderRow, showTab } = app;
  BRUSHES.forEach(b => box.append(item({
    // 換筆回到塗抹（以前擦除一直開著，換了筆、離開再回來都還在擦，評審 L62）
    label: b.name, icon: b.name, cls: 'wide', on: st.tool === b.id, onclick: () => { if (st.tool !== b.id) st.erase = false; st.tool = b.id; showTab('bbrush'); },
  })));
  const b = BRUSHES.find(x => x.id === st.tool);
  // 塗抹、擦除（照 Hypic，切換只換這支筆）
  const seg = document.querySelector('#modeSeg');
  seg.hidden = false;
  seg.querySelectorAll('button').forEach(e => { e.classList.toggle('on', (e.dataset.m === 'erase') === st.erase); e.onclick = () => { st.erase = e.dataset.m === 'erase'; showTab('bbrush'); }; });
  // 大小、強度兩條一起顯示，不用再點膠囊切換（評審 2026-10-27）
  document.querySelector('#rows').append(
    sliderRow({ label: '大小', min: 1, max: 100, val: st.size, def: 30, onInput: v => { st.size = v; } }),
    ...st.erase ? [] : [sliderRow({ label: '強度', min: 0, max: 100, val: st.str[st.tool], def: b.str, onInput: v => { st.str[st.tool] = v; } })]);
  document.querySelector('#note').textContent = st.erase ? `擦掉${b.name}塗過的地方，回到原本的樣子。` : `塗抹要${b.name}的地方。同一處多塗幾次，到上限就停，不會越塗越假。`;
  // 點開美顏筆、換筆時先在背景把縮圖和這支筆要用的資料算好，第一筆放開才不會頓一下。
  // 縮圖、GPU 暖機、這支筆的資料分開做，縮圖每縮一段、資料每模糊一次讓畫面走一格
  // （以前擠在同一下停 134ms，評審 L71；分三下後 iPhone 還有 109+216ms，評審 #159）。
  // 中間塗了一筆（照片換了一版）、換了分頁或換了筆就停，筆畫要用的時候照舊當場算
  clearTimeout(warmT);
  const tok = ++warmTok, tool = st.tool, alive = () => warmTok === tok && app.tab() === 'bbrush' && st.tool === tool;
  warmT = setTimeout(async () => {
    if (!alive()) return;
    const S = app.surf();
    if (!valid(S.bbSes, S)) {
      const v = S.ver, c = S.canvas, ses = await stepwise(sessionSteps(c, v), () => alive() && S.canvas === c && S.ver === v);
      if (!ses) return;
      if (valid(S.bbSes, S)) kill(ses); else { bbRelease(S); S.bbSes = ses; }
    }
    await new Promise(f => setTimeout(f, 30)); if (!alive()) return;
    gpuWarm(tool, !!RAD[tool]);
    await new Promise(f => setTimeout(f, 30)); if (!alive()) return;
    const ses = S.bbSes;
    if (!MASKED.includes(tool) || !valid(ses, S)) return;
    await helWarm(ses, tool, () => alive() && valid(ses, S));
    if (alive() && valid(ses, S)) gpuPrime(ses, mkJob(ses, tool));
  }, 250);
}
let warmT = 0, warmTok = 0;

// 放開了、還在算的筆一筆一筆照順序算（每一筆都要從上一筆畫好的照片接著算）；復原、存檔先等這裡算完
let queue = Promise.resolve();
export const bbWait = () => queue;

// 塗的時候先在照片上面畫半透明的筆跡（Hypic 也是先用紅色顯示塗到哪），放開手指才算進照片
export function beautyBrushInput(wrap, app) {
  let pts = null, ov = null;
  const pend = [];  // 放開了、還在算的筆：粉紅筆跡留著，算好才換成效果
  const at = (e, r) => { const b = app.base.canvas; return { x: (e.clientX - r.left) / r.width * b.width, y: (e.clientY - r.top) / r.height * b.height }; };
  const preview = () => {
    const b = app.base?.canvas;
    if (!b || (!pts && !pend.length)) { ov?.remove(); ov = null; return; }
    const k = Math.min(1, 1200 / Math.max(b.width, b.height));
    if (!ov) { ov = newCanvas(b.width * k, b.height * k); ov.id = 'ddov'; wrap.append(ov); }
    const ctx = ov.getContext('2d');
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.lineCap = ctx.lineJoin = 'round';
    // 塗抹是粉紅、擦除是白色
    for (const s of pts ? [...pend, { pts, rd: bbRadius(st.size, b.width, b.height), erase: st.erase }] : pend) {
      ctx.strokeStyle = s.erase ? 'rgba(255,255,255,.4)' : 'rgba(255,90,122,.35)';
      ctx.lineWidth = 2 * s.rd * k;
      ctx.beginPath();
      s.pts.forEach((p, i) => i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0].x * k + 0.01, s.pts[0].y * k);
      ctx.stroke();
    }
  };
  // 手指移動一格畫面只重畫一次（iPhone 一格畫面可能來兩三個移動事件，每次都把整串筆跡重畫）
  let pv = 0;
  const previewSoon = () => { if (!pv) pv = requestAnimationFrame(() => { pv = 0; preview(); }); };
  wrap.addEventListener('pointerdown', e => {
    if (app.tab() !== 'bbrush' || !app.base || e.target.closest('.st,.tx') || e.button > 0 || pinch.on) return;
    e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    pts = [at(e, wrap.getBoundingClientRect())]; preview();
  });
  wrap.addEventListener('pointermove', e => {
    if (!pts) return;
    // 主執行緒忙的那段，手指的移動會被併成一個事件：拿回中間每一點，筆跡才不會變成直線
    const r = wrap.getBoundingClientRect(), ce = e.getCoalescedEvents?.();
    let add = false;
    for (const c of ce?.length ? ce : [e]) {
      const p = at(c, r), q = pts[pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) < 2) continue;
      pts.push(p); add = true;
    }
    if (add) previewSoon();
  });
  const up = () => {
    if (!pts) return;
    const S = app.surf(), b = S.canvas;
    // 瘦臉、推臉這些變形開著時，畫面上的點換回原圖上的點，才會修在手指下面（照放開這時候的變形換）
    const job = { pts, rd: bbRadius(st.size, b.width, b.height), tool: st.tool, erase: st.erase, k: st.str[st.tool] / 100, S, map: app.toSrc?.() };
    pts = null; pend.push(job); preview(); app.queued?.();
    queue = queue.then(() => run(job)).catch(e => console.error(e));
  };
  // 還是放開時那張照片（中間沒有合併、裁切、換照片）
  const same = job => app.base?.surf === job.S && app.base.canvas === job.S.canvas;
  const run = async job => {
    let r = null;
    try {
      if (!same(job)) return;
      const S = job.S;
      if (!valid(S.bbSes, S)) { bbRelease(S); S.bbSes = session(S.canvas, S.ver); }
      const ses = S.bbSes, sp = job.map ? job.pts.map(job.map) : job.pts;
      r = await (job.tool !== 'blemish' ? maskStroke(ses, job.tool, sp, job.rd, job.k, job.erase) : job.erase ? blemishErase(ses, sp, job.rd) : blemishStroke(ses, sp, job.rd, job.k));
      // 擦除沒擦到東西，但這張照片之前塗過別串美顏筆（中間畫過塗鴉、消除…，那串已經畫進照片）：說一聲，不然像壞了（評審 L62）
      if (!r && job.erase && S.edits.slice(0, ses.v0).some(e => e?.ses?.mw && e.ses !== ses)) app.toast?.('之前塗的美顏筆中間做過別的修改，已經畫進照片，擦除只擦得到之後塗的；要拿掉請用復原。', 3500);
      // 算的時候照片被整張換掉（合併、裁切…）：這一筆不算
      if (r && !same(job)) { r.aux.swap(); r = null; }
    } finally {
      pend.splice(pend.indexOf(job), 1); preview();
    }
    if (r) { app.paint(r); app.commit(); }
    if (!pend.length) app.settled?.();
  };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  // 第二指放下是要縮放：這一筆不算（已經放開、在算的照算）
  addEventListener('pinchstart', () => { pts = null; preview(); });
}
