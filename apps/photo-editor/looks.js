// 一鍵出片：一個風格 = 一組現有效果的參數（調整、濾鏡、膚質、美顏、整套妝、打光、閃光燈、景深、光效），
// 一條強度滑桿整組一起縮放。
//
// 醒圖專業版的一鍵出片（用 REA 看 app.asar 和原生模組得知）：每個風格是伺服器下發的一份設定，
// 列出要疊的本機效果（白平衡、去灰、逆光修正、臉部美化、膚色統一、景深、濾鏡妝容包等，各有預設強度）、
// 依照片條件（性別、幾張臉、有沒有臉、是不是 RAW）改參數，再把照片上傳給伺服器，
// 拿回 AI 處理過的整張圖疊在最底層。這裡只做本機那一半：每個風格是自己調的參數組合，
// 「智慧優化」照片條件自動算，照片不上傳。
import { FILTERS } from './filters.js';
import { LOOKS as MK_LOOKS } from './makeup.js';

const mkIdx = name => MK_LOOKS.findIndex(l => l.name === name);

// face：要有臉才有主要效果（沒臉的照片會提醒）
// set：要設定的參數；數字會跟著強度縮放，字串（濾鏡、燈、閃光燈、光效的種類）照原樣
// mk：整套妝的名字（美妝分頁的 8 套之一）和強度
export const LOOKS = [
  { id: 'auto', name: '智慧優化', cat: 'all', auto: true },
  // 人像
  { id: 'glow', name: '好氣色', cat: 'face', face: true, set: { filter: 'clear', filterAmt: 45, brightness: 6, skNative: 50, white: 20, dark: 35, eyeb: 20 }, mk: ['裸妝', 60] },
  { id: 'fair', name: '清透白皙', cat: 'face', face: true, set: { filter: 'coolwhite', filterAmt: 60, exposure: 8, highlights: -12, shadows: 15, skBaby: 50, white: 45, dark: 40, eyeb: 30 } },
  { id: 'cream', name: '韓系奶油', cat: 'face', face: true, set: { filter: 'cream', filterAmt: 70, contrast: -8, fade: 10, skCream: 60, white: 25 }, mk: ['韓系', 70] },
  { id: 'airy', name: '日系空氣', cat: 'face', face: true, set: { filter: 'japan', filterAmt: 70, exposure: 12, contrast: -15, shadows: 25, saturation: -10, skNative: 40, light: 'soft', lightAmt: 40 } },
  { id: 'sweet', name: '元氣少女', cat: 'face', face: true, set: { filter: 'pink', filterAmt: 60, saturation: 8, skGirl: 55, eyes: 10 }, mk: ['少女粉', 70] },
  { id: 'hkfilm', name: '港風', cat: 'face', face: true, set: { filter: 'hk', filterAmt: 80, contrast: 10, grain: 25, vignette: 20, skMatte: 40 }, mk: ['微醺', 60] },
  { id: 'ccd', name: 'CCD 閃光', cat: 'face', face: true, set: { flash: 'ccd', flashAmt: 60, filter: 'film', filterAmt: 45, grain: 20, sharpen: 10 } },
  { id: 'sunset', name: '夕陽氛圍', cat: 'face', face: true, set: { light: 'sunset', lightAmt: 55, filter: 'sunny', filterAmt: 60, ov: 'leakWarm', ovAmt: 40 } },
  { id: 'portrait', name: '大光圈', cat: 'face', face: true, set: { blur: 60, filter: 'clear', filterAmt: 40, light: 'soft', lightAmt: 30, sharpen: 10 } },
  { id: 'guy', name: '男生乾淨', cat: 'face', face: true, set: { filter: 'clear', filterAmt: 30, contrast: 8, sharpen: 20, skNative: 40, dark: 40 }, mk: ['男生', 80] },
  // 生活、風景（不需要臉）
  { id: 'vivid', name: '通透風景', cat: 'scene', set: { filter: 'clear', filterAmt: 60, contrast: 10, saturation: 12, highlights: -25, shadows: 20, sharpen: 20 } },
  { id: 'teal', name: '電影青橙', cat: 'scene', set: { filter: 'teal', filterAmt: 80, contrast: 12, vignette: 25, grain: 10 } },
  { id: 'food', name: '美食暖調', cat: 'scene', set: { filter: 'sunny', filterAmt: 60, saturation: 15, temp: 12, sharpen: 15, shadows: 10 } },
  { id: 'filmday', name: '底片日常', cat: 'scene', set: { filter: 'film', filterAmt: 75, fade: 12, grain: 22, vignette: 12 } },
  { id: 'night', name: '夜景', cat: 'scene', set: { filter: 'night', filterAmt: 70, shadows: 20, highlights: -20, contrast: 8, sharpen: 15 } },
  { id: 'bw', name: '黑白質感', cat: 'scene', set: { filter: 'bw', filterAmt: 100, contrast: 20, grain: 20, vignette: 20 } },
];
const CATS = [['all', '全部'], ['face', '人像'], ['scene', '生活風景']];

// 一鍵出片會動到的參數：換風格時先全部歸零，才不會越疊越多
const KEYS = [...new Set(LOOKS.flatMap(l => Object.keys(l.set || {})).concat(['temp', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'saturation', 'sharpen', 'mk', 'mkLook', 'mkLookAmt']))];

// 智慧優化：照醒圖「智能優化」那幾項（智能調色、色偏矯正、去灰、細節增強），依照片的統計自動算
export function autoTune(src) {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data, L = [];
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
    r += R; g += G; b += B; L.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
  }
  const N = n * n; r /= N; g /= N; b /= N;
  L.sort((x, y) => x - y);
  const q = p => L[Math.min(N - 1, Math.floor(p * N))];
  const lo = q(0.03), mid = q(0.5), hi = q(0.97);
  const clamp = (v, a) => Math.round(Math.max(-a, Math.min(a, v)));
  return {
    // 色偏矯正 80%：管線裡色溫 1 會讓紅藍差 0.14，色調 1 會讓綠比紅藍少 0.07
    temp: clamp(-(r - b) / 0.14 * 100 * 0.8, 30),
    tint: clamp((g - (r + b) / 2) / 0.07 * 100 * 0.8, 25),
    // 智能調色：中間調拉向 0.46
    exposure: clamp(Math.log2(0.46 / Math.max(mid, 0.03)) / 1.2 * 100 * 0.6, 35),
    shadows: clamp((0.08 - lo) * 300, 30) > 0 ? clamp((0.08 - lo) * 300, 30) : 0,
    highlights: hi > 0.96 ? clamp(-(hi - 0.9) * 300, 30) : 0,
    // 去灰：亮暗範圍太窄就加對比
    contrast: clamp((0.7 - (hi - lo)) * 60, 20) > 0 ? clamp((0.7 - (hi - lo)) * 60, 20) : 0,
    saturation: 8,
    sharpen: 25, // 細節增強
  };
}

// 風格在這張照片上的完整參數（強度 100）
function fullSet(L, base) {
  if (L.auto) return (base.autoSet ||= autoTune(base.canvas));
  return L.set;
}

// 套用：先把一鍵出片的參數歸零，再按強度放上去
export function applyLook(P, P0, L, amt, base) {
  for (const k of KEYS) P[k] = typeof P0[k] === 'object' ? JSON.parse(JSON.stringify(P0[k])) : P0[k];
  P.look = L ? L.id : '';
  P.lookAmt = amt;
  if (!L) return;
  const s = amt / 100;
  for (const [k, v] of Object.entries(fullSet(L, base))) P[k] = typeof v === 'number' ? Math.round(v * s) : v;
  if (L.set?.light) { P.lightX = P.lightY = null; P.lightCol = 0; }
  if (L.mk) {
    const i = mkIdx(L.mk[0]), a = L.mk[1] * s;
    P.mk = Object.fromEntries(Object.entries(MK_LOOKS[i].set).map(([k, [st, c, v]]) => [k, { s: st, c, a: Math.round(v * a / 100) }]));
    P.mkLook = i; P.mkLookAmt = Math.round(a);
  }
}

// 縮圖：在小圖上用 CPU 近似調整和濾鏡（美顏、妝、打光不畫），讓人一眼看出色調
function lookThumb(src, set) {
  const size = 124, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const m = Math.min(src.width, src.height);
  ctx.drawImage(src, (src.width - m) / 2, (src.height - m) / 2, m, m, 0, 0, size, size);
  const f = k => (set[k] || 0) / 100;
  const flt = set.filter && set.filter !== 'none' ? FILTERS.find(x => x.id === set.filter).fn : null, fa = (set.filterAmt ?? 80) / 100;
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  const ex = Math.pow(2, f('exposure') * 1.2), con = 1 + f('contrast') * 0.55, sat = 1 + f('saturation');
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255 * ex, g = d[i + 1] / 255 * ex, b = d[i + 2] / 255 * ex;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sh = Math.max(0, 1 - Y * 2), hl = Math.max(0, Y * 2 - 1);
    const lift = v => v + f('shadows') * 0.35 * sh * (f('shadows') > 0 ? 1 - v : v) + f('highlights') * 0.35 * hl * (f('highlights') > 0 ? 1 - v : v);
    r = lift(r); g = lift(g); b = lift(b);
    r = (r - 0.5) * con + 0.5; g = (g - 0.5) * con + 0.5; b = (b - 0.5) * con + 0.5;
    r += f('temp') * 0.07; b -= f('temp') * 0.07; g -= f('tint') * 0.05; r += f('tint') * 0.02; b += f('tint') * 0.02;
    const Y2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = Y2 + (r - Y2) * sat; g = Y2 + (g - Y2) * sat; b = Y2 + (b - Y2) * sat;
    r = Math.min(1, Math.max(0, r)); g = Math.min(1, Math.max(0, g)); b = Math.min(1, Math.max(0, b));
    if (flt) { const o = flt(r, g, b); r += (o[0] - r) * fa; g += (o[1] - g) * fa; b += (o[2] - b) * fa; }
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.8);
}

const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z"/><path d="M18 15l.8 1.9 1.9.8-1.9.7L18 20.3l-.8-1.9-1.9-.7 1.9-.8z"/></svg>';
let cat = 'all';

// 面板：上排分類，下排風格；選了風格出現強度滑桿
export function tabLooks(box, api) {
  const P = api.P(), base = api.base();
  const cats = api.cats(); cats.hidden = false; cats.innerHTML = '';
  CATS.forEach(([id, name]) => cats.append(api.item({
    label: name, icon: name, cls: 'wide', on: cat === id, set: LOOKS.some(l => l.id === P.look && (id === 'all' || l.cat === id)),
    onclick: () => { cat = id; api.refresh(); },
  })));
  base.lookThumbs ||= {};
  const pick = L => {
    const off = !L || P.look === L.id;
    applyLook(P, api.P0, off ? null : L, 100, base);
    api.render(); api.commit(); api.refresh();
    if (!off && api.needSeg()) api.findPerson();
  };
  box.append(api.item({ label: '原圖', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>', on: !P.look, onclick: () => pick(null) }));
  LOOKS.filter(L => cat === 'all' || L.cat === cat || L.cat === 'all').forEach(L => {
    const t = base.lookThumbs[L.id] ||= lookThumb(base.canvas, fullSet(L, base));
    box.append(api.item({ label: L.name, cls: 'ft', on: P.look === L.id, style: `background-image:url(${t})`, onclick: () => pick(L) }));
  });
  const L = LOOKS.find(x => x.id === P.look);
  if (L) api.setSlider('強度', 0, 100, P.lookAmt ?? 100, v => { applyLook(api.P(), api.P0, L, v, base); api.render(); });
  else api.hideSlider();
  const faces = base.faces;
  api.note(!L ? '點一下套用整組風格，再點一次取消。套用後各分頁還可以再微調。'
    : L.face && faces && !faces.length ? '這張照片沒找到臉，人像風格只會套到色調；可以試試「生活風景」。'
      : L.auto ? '依這張照片自動校正色偏、亮度、去灰和細節。'
        : '整組效果一起調強度。套用後各分頁還可以再微調。');
}
