// 美顏筆各筆在小圖（照片縮到短邊 400）上只算一次的部分：大範圍的模糊、參考膚色，跟打包給 GPU 的那張。
// beautybrush.js（筆畫當場要用、背景執行緒開不了時）和背景執行緒 bbwork.js 共用同一份，算出來一模一樣
import { boxBlur } from './cblur.js';

export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const blur = (a, w, h, r) => boxBlur(new Float32Array(a), w, h, Math.max(1, r));
// 生成器一口氣跑完（筆畫當場要用、背景執行緒裡）
export const done = g => { let r; while (!(r = g.next()).done); return r.value; };
// 加權模糊：sum(a·wt) / sum(wt)；三個顏色共用一次權重的模糊（每模糊一次是一步）
export const wblur3 = (...a) => done(wblur3s(...a));
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

// O：小圖（R G B L）、w × h；k：小圖對原圖的比例
export const helCalc = (...a) => done(helSteps(...a));
export function* helSteps(t, O, w, h, R0, S, k) {
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

export const HELD = { smooth: hp => [hp.V, ...hp.B], circle: hp => hp.D, fold: hp => hp.D, oil: hp => hp.ref, texture: hp => hp.b2, eye: () => [], teeth: () => [] };
// GPU 用：小圖上的效果打包成一張 RGBA 浮點貼圖（去油光多放周圍亮度 Lb）
const PACK = { ...HELD, oil: hp => [...hp.ref, hp.Lb] };
function packCh(c, d, k, hw, x0, y0, w, y1) {
  for (let y = y0, o = k; y < y1; y++) for (let i = y * hw + x0, e = i + w; i < e; i++, o += 4) d[o] = c[i];
}
// t 這支筆的效果 o 打包成 RGBA（小圖寬 hw，只打包 [r0,r2)×[r1,r3)）；這支筆沒有小圖上的效果回傳 null
export function packHel(t, o, hw, r) {
  const a = PACK[t](o);
  if (!a.length) return null;
  const w = r[2] - r[0], d = new Float32Array(w * (r[3] - r[1]) * 4);
  for (let k = 0; k < a.length; k++) packCh(a[k], d, k, hw, r[0], r[1], w, r[3]);
  return d;
}
