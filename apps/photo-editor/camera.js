// 相機濾鏡：仿 CCD、底片、富士、理光 GR、拍立得、徠卡、閃光燈這些現在流行的相機色調
// 數值是依公開的相機／底片描述（富士官方、Fuji X Weekly 配方、GR Blog 等）自己調出來的，
// 研究筆記在專案的 plans/修圖/流行特效與相機濾鏡研究.md。
// 每款 = 一個顏色函式（烘成 LUT）+ 質感（顆粒、高光柔光、紅色光暈、暗角、銳化、日期戳、閃光）
import { curve, clamp, lum } from './filters.js';

// ---------- 調色工具 ----------
const ID = v => v;
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hk = ((h % 360) + 360) % 360 / 360;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(hk + 1 / 3), f(hk), f(hk - 1 / 3)];
}
// 八個色相區：紅 0、橙 30、黃 60、綠 120、青 180、藍 220、紫 275、洋紅 320
const HUES = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 220, purple: 275, magenta: 320 };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
// hsl：{ green: [色相位移°, 飽和倍率, 亮度位移] ... }
function applyHsl(c, hsl) {
  let [h, s, l] = rgb2hsl(c[0], c[1], c[2]);
  if (s < 0.02) return c;
  let dh = 0, ds = 0, dl = 0, wsum = 0;
  for (const k in hsl) {
    const w = Math.max(0, 1 - hueDist(h, HUES[k]) / 45);
    if (!w) continue;
    const [a, m = 1, b = 0] = hsl[k];
    dh += a * w; ds += (m - 1) * w; dl += b * w; wsum += w;
  }
  if (!wsum) return c;
  const ws = Math.min(1, s * 3); // 很灰的顏色少動一點
  h += dh * ws; s = clamp(s * (1 + ds)); l = clamp(l + dl * ws * 0.5 * (1 - Math.abs(2 * l - 1)) * 2);
  return hsl2rgb(h, s, l);
}
// 色溫（正 = 暖，1 約等於 +1000K）、色調（正 = 洋紅）
function wb(c, temp, tint) {
  return [c[0] * (1 + 0.07 * temp) * (1 + 0.004 * tint), c[1] * (1 - 0.008 * tint), c[2] * (1 - 0.09 * temp) * (1 + 0.004 * tint)];
}
function splitTone(c, sh, hi) {
  const l = lum(c[0], c[1], c[2]), ws = (1 - l) * (1 - l), wh = l * l;
  return c.map((v, i) => v + (sh[i] * ws + hi[i] * wh) / 255);
}
function satAdj(c, s) { const l = lum(c[0], c[1], c[2]); return c.map(v => l + (v - l) * s); }

// 一款濾鏡的顏色部分
function look({ temp = 0, tint = 0, exp = 0, curve: cv, r, g, b, sat = 1, hsl, split, fade = 0, mono }) {
  const C = cv ? curve(cv) : ID, R = r ? curve(r) : ID, G = g ? curve(g) : ID, B = b ? curve(b) : ID;
  const k = Math.pow(2, exp);
  return (r0, g0, b0) => {
    let c = wb([r0 * k, g0 * k, b0 * k], temp, tint);
    c = [R(C(clamp(c[0]))), G(C(clamp(c[1]))), B(C(clamp(c[2])))];
    if (hsl) c = applyHsl(c.map(clamp), hsl);
    if (sat !== 1) c = satAdj(c, sat);
    if (split) c = splitTone(c, split[0], split[1]);
    if (mono) { const l = lum(c[0], c[1], c[2]); c = [l, l, l]; }
    if (fade) c = c.map(v => v * (1 - fade) + fade * 0.5);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2])];
  };
}

// ---------- 各款 ----------
// fx：grain 顆粒量、gsize 顆粒大小(px，以 1500px 長邊為準)、gcolor 彩色顆粒比例、bloom 高光柔光、bthr 柔光門檻、
//     hal 紅色光暈、vig 暗角、sharp 銳化、soft 柔焦、skin 膚色保護、date 日期戳、flash 閃光燈款式、cool 背景冷暖
export const CAMERAS = [
  // CCD
  { id: 'ccdBlue', group: 'CCD', name: 'CCD 藍調', fn: look({ temp: -0.6, tint: 3, curve: [[0, 18], [64, 70], [192, 205], [255, 248]], sat: 0.9, hsl: { blue: [-5, 1.1], green: [15, 0.95], aqua: [0, 1.1] } }),
    fx: { grain: 0.06, gsize: 1, gcolor: 0.3, bloom: 0.25, bthr: 0.75, sharp: 0.2, skin: 0.35, date: true } },
  { id: 'ccdWarm', group: 'CCD', name: 'CCD 暖黃', fn: look({ temp: 0.4, curve: [[0, 12], [128, 134], [255, 250]], sat: 1.05, split: [[0, 0, 4], [6, 3, -6]], hsl: { orange: [0, 1, 0.05] } }),
    fx: { grain: 0.06, gsize: 1, gcolor: 0.3, bloom: 0.2, bthr: 0.78, sharp: 0.2, date: true } },
  { id: 'ccdCool', group: 'CCD', name: 'CCD 冷白', fn: look({ temp: -0.5, exp: 0.1, curve: [[0, 10], [128, 138], [255, 252]], sat: 0.95, hsl: { orange: [0, 0.95, 0.1] } }),
    fx: { grain: 0.05, gsize: 1, gcolor: 0.3, bloom: 0.2, bthr: 0.78, sharp: 0.2, skin: 0.2, date: true } },
  // 閃光燈
  { id: 'direct', group: '閃光', name: '直閃', fn: look({ temp: -0.2, curve: [[0, 0], [40, 28], [200, 235], [255, 255]] }),
    fx: { grain: 0.04, gsize: 1, gcolor: 0.2, flash: 'direct', bloom: 0.15, bthr: 0.8 } },
  { id: 'burst', group: '閃光', name: '爆閃', fn: look({ temp: -0.25, curve: [[0, 0], [40, 26], [190, 238], [255, 255]], sat: 1.05 }),
    fx: { grain: 0.05, gsize: 1, gcolor: 0.2, flash: 'burst', bloom: 0.4, bthr: 0.7, vig: 0.3 } },
  { id: 'glow', group: '閃光', name: '直閃水光', fn: look({ temp: -0.15, curve: [[0, 4], [60, 52], [200, 228], [255, 255]], sat: 1.02, hsl: { orange: [0, 0.95, 0.06] } }),
    fx: { grain: 0.03, gsize: 1, gcolor: 0.2, flash: 'glow', bloom: 0.3, bthr: 0.7 } },
  // 氛圍
  { id: 'bluehour', group: '氛圍', name: '藍調時刻', fn: look({ temp: -1.4, tint: -2, exp: -0.3, curve: [[0, 15], [128, 124], [255, 230]], hsl: { blue: [0, 1.25, -0.15], aqua: [0, 1.25, -0.15] } }),
    fx: { grain: 0.03, gsize: 1, bloom: 0.35, bthr: 0.82, warmHi: 1, skin: 0.6 } },
  { id: 'blackmist', group: '氛圍', name: '黑柔', fn: look({ curve: [[0, 8], [128, 128], [255, 248]], sat: 0.97 }),
    fx: { bloom: 0.4, bthr: 0.6, soft: 0.15 } },
  { id: 'cine', group: '氛圍', name: '電影感', fn: look({ temp: -0.2, curve: [[0, 20], [128, 124], [255, 235]], sat: 0.72, split: [[0, 4, 8], [8, 3, -6]] }),
    fx: { grain: 0.05, gsize: 1.5, vig: 0.25 } },
  // 底片
  { id: 'portra', group: '底片', name: 'Portra 400', fn: look({ temp: 0.3, tint: 2, curve: [[0, 14], [30, 26], [230, 224], [255, 245]], sat: 0.95, hsl: { orange: [0, 0.95, 0.05], blue: [-8, 0.9], red: [5, 0.9], green: [-5, 0.8] } }),
    fx: { grain: 0.04, gsize: 1, gcolor: 0.3, bloom: 0.1, bthr: 0.75 } },
  { id: 'pro400h', group: '底片', name: '400H 薄荷', fn: look({ exp: 0.2, curve: [[0, 14], [255, 248]], sat: 0.95, hsl: { green: [20, 0.9], orange: [-3, 1, 0.06] }, split: [[0, 0, 0], [3, 0, 3]] }),
    fx: { grain: 0.04, gsize: 1, gcolor: 0.3 } },
  { id: 'gold', group: '底片', name: 'Gold 200', fn: look({ temp: 0.7, tint: 2, curve: [[0, 6], [40, 34], [255, 248]], sat: 1.1, hsl: { yellow: [-5, 1.15], green: [-10, 1] } }),
    fx: { grain: 0.07, gsize: 1.2, gcolor: 0.35 } },
  { id: 'superia', group: '底片', name: 'Superia', fn: look({ temp: 0.4, curve: [[0, 10], [64, 54], [192, 205], [255, 250]], sat: 1.15, split: [[-6, 3, 5], [5, -3, 4]], hsl: { blue: [-10, 1], green: [10, 1] } }),
    fx: { grain: 0.08, gsize: 1.2, gcolor: 0.35 } },
  { id: 'ektar', group: '底片', name: 'Ektar', fn: look({ curve: [[0, 0], [64, 54], [192, 208], [255, 255]], sat: 1.25, hsl: { red: [0, 1.2], blue: [0, 1.2], orange: [-4, 1] } }),
    fx: { grain: 0.02, gsize: 1 } },
  { id: 'kodachrome', group: '底片', name: 'Kodachrome', fn: look({ temp: 0.2, curve: [[0, 0], [30, 20], [128, 130], [230, 226], [255, 250]], sat: 0.85, hsl: { red: [5, 1.35], yellow: [0, 1.2], blue: [-16, 0.9], green: [-5, 0.75] } }),
    fx: { grain: 0.03, gsize: 1, sharp: 0.3 } },
  { id: 'cinestill', group: '底片', name: 'CineStill 800T', fn: look({ temp: -1, curve: [[0, 6], [50, 38], [128, 128], [255, 250]], sat: 1.15 }),
    fx: { grain: 0.1, gsize: 2, gcolor: 0.35, hal: 0.6, bthr: 0.8 } },
  // 富士
  { id: 'chrome', group: '富士', name: '經典正片', fn: look({ curve: [[0, 0], [30, 20], [230, 222], [255, 250]], sat: 0.8, hsl: { blue: [-8, 0.9], red: [5, 0.85], green: [-5, 0.75] } }),
    fx: { grain: 0.03, gsize: 1 } },
  { id: 'neg', group: '富士', name: '經典負片', fn: look({ curve: [[0, 5], [64, 52], [192, 205], [255, 250]], sat: 1.05, split: [[-6, 3, 5], [5, -3, 4]], hsl: { blue: [-10, 1], green: [10, 1] } }),
    fx: { grain: 0.08, gsize: 1.2, gcolor: 0.3 } },
  { id: 'nostalgic', group: '富士', name: '懷舊負片', fn: look({ curve: [[0, 12], [128, 128], [255, 245]], sat: 1.05, split: [[8, 3, -6], [0, 0, 0]], hsl: { blue: [0, 0.9] } }),
    fx: { grain: 0.05, gsize: 1 } },
  { id: 'velvia', group: '富士', name: 'Velvia', fn: look({ curve: [[0, 0], [64, 50], [192, 212], [255, 255]], sat: 1.3, hsl: { blue: [0, 1.15], green: [0, 1.15], orange: [0, 0.9] } }),
    fx: { sharp: 0.1 } },
  { id: 'eterna', group: '富士', name: 'Eterna', fn: look({ curve: [[0, 20], [255, 235]], sat: 0.7, split: [[0, 2, 4], [0, 0, 0]] }),
    fx: { grain: 0.03, gsize: 1 } },
  // 理光 GR
  { id: 'grPos', group: 'GR', name: 'GR 正片', fn: look({ curve: [[0, 0], [64, 54], [192, 206], [255, 255]], sat: 1.15, hsl: { red: [0, 1.1], green: [-8, 1] }, split: [[0, 0, 3], [0, 0, 0]] }),
    fx: { sharp: 0.15 } },
  { id: 'grNeg', group: 'GR', name: 'GR 負片', fn: look({ temp: -0.2, curve: [[0, 15], [192, 210], [255, 252]], sat: 0.9, hsl: { red: [8, 0.9], green: [25, 1], blue: [0, 0.85] } }),
    fx: { grain: 0.04, gsize: 1 } },
  { id: 'grMint', group: 'GR', name: 'GR 薄荷調', fn: look({ temp: -0.3, tint: -4, curve: [[0, 12], [128, 136], [255, 245]], sat: 0.88, hsl: { green: [25, 0.9, 0.1], yellow: [10, 1], orange: [0, 1, 0.05] } }),
    fx: { grain: 0.03, gsize: 1 } },
  // 拍立得
  { id: 'instax', group: '拍立得', name: 'Instax', fn: look({ curve: [[0, 6], [220, 240], [255, 255]], sat: 1.05, hsl: { blue: [0, 1, -0.15] } }),
    fx: { vig: 0.15, grain: 0.03, gsize: 1 } },
  { id: 'polaroid', group: '拍立得', name: 'Polaroid', fn: look({ tint: 8, curve: [[0, 30], [128, 132], [255, 240]], sat: 0.8 }),
    fx: { vig: 0.3, grain: 0.05, gsize: 1.2 } },
  // 徠卡
  { id: 'leica', group: '徠卡', name: '徠卡經典', fn: look({ exp: -0.2, curve: [[0, 0], [50, 38], [200, 205], [255, 250]], sat: 0.95, hsl: { red: [0, 1.05] } }),
    fx: { vig: 0.25 } },
  { id: 'leicaVivid', group: '徠卡', name: '徠卡生動', fn: look({ exp: 0.1, curve: [[0, 8], [255, 255]], sat: 1.12 }),
    fx: {} },
  { id: 'leicaMono', group: '徠卡', name: '徠卡黑白', fn: look({ curve: [[0, 0], [64, 48], [192, 210], [255, 255]], mono: true }),
    fx: { grain: 0.04, gsize: 1 } },
  // 膚色底調
  { id: 'amber', group: '膚色', name: '琥珀', fn: look({ temp: 0.17, hsl: { orange: [0, 1, 0], red: [0, 1] } }), fx: { skinOnly: { temp: 0.5 } } },
  { id: 'rose', group: '膚色', name: '冷玫瑰', fn: look({ temp: -0.1, tint: 2, hsl: { red: [0, 1.08], blue: [0, 1.08] } }), fx: { skinOnly: { temp: -0.3, tint: 5 } } },
];
export const CAMERA_GROUPS = [...new Set(CAMERAS.map(c => c.group))];
export const cameraById = id => CAMERAS.find(c => c.id === id);

// 日期戳：仿 CCD 相機的橘色七段數字（自己用線段畫，不用字型）
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
export function dateText(d = new Date()) {
  return `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, ' ')}`;
}
export function drawDate(ctx, text, right, bottom, h) {
  const w = h * 0.52, gap = h * 0.22, t = h * 0.13;
  const widths = [...text].map(ch => ch === "'" ? h * 0.18 : ch === ' ' ? h * 0.3 : w + gap);
  let x = right - widths.reduce((a, b) => a + b, 0), y = bottom - h;
  ctx.save();
  ctx.fillStyle = '#ff9a3c'; ctx.shadowColor = 'rgba(255,90,20,.9)'; ctx.shadowBlur = h * 0.35;
  const seg = (k, x0, y0) => {
    const half = h / 2;
    const R = { a: [x0 + t, y0, w - 2 * t, t], d: [x0 + t, y0 + h - t, w - 2 * t, t], g: [x0 + t, y0 + half - t / 2, w - 2 * t, t],
      f: [x0, y0 + t, t, half - 1.5 * t], b: [x0 + w - t, y0 + t, t, half - 1.5 * t], e: [x0, y0 + half + t / 2, t, half - 1.5 * t], c: [x0 + w - t, y0 + half + t / 2, t, half - 1.5 * t] }[k];
    ctx.fillRect(...R);
  };
  [...text].forEach((ch, i) => {
    if (ch === "'") { ctx.fillRect(x + h * 0.02, y, t, h * 0.3); }
    else if (SEG[ch]) for (const k of SEG[ch]) seg(k, x, y);
    x += widths[i];
  });
  ctx.restore();
}
