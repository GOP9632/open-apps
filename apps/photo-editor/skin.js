// 膚質、祛皺
//   醒圖的「膚質」有 14 項：8 項是在裝置上跑的效果包（原生感、少女肌、奶油肌、嬰兒肌、磨砂皮、磨皮、皮膚紋理、祛油光），
//   另外 6 項（素顏肌、水光肌、啞光肌、腮紅肌、美黑肌、身體嫩膚）是上傳到伺服器用 AI 重畫，只有兩檔。
//   「祛皺」5 項（抬頭紋、法令紋、頸紋、眼紋、唇紋）在裝置上跑，配皺紋偵測模型。
//   範圍都是 0~100，第一次點開時的強度照醒圖面板的預設值（看醒圖的面板設定檔得知）。
//   這裡全部自己寫、全部在裝置上做：
//     - 用人像分割的皮膚類別 + 臉部特徵點畫出皮膚、各部位的遮罩
//     - 照片在 GPU 上算三種粗細的模糊，拆成「細紋理、中等起伏、大範圍明暗」三層，再分別調整
//   流程跟頭髮一樣：先算出「改過膚質的照片」，再交給主管線（美顏、濾鏡…）接著處理。

// [key, 名稱, 圖示, 最小, 第一次點開的強度]
const ic = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const FACE = '<ellipse cx="12" cy="12" rx="7" ry="9"/>';
export const SKIN = [
  ['skNative', '原生感', ic(FACE + '<path d="M9 15c1.5 1 4.5 1 6 0"/>'), 0, 60],
  ['skGirl', '少女肌', ic(FACE + '<circle cx="8.5" cy="13.5" r="1.6" fill="currentColor" opacity=".35"/><circle cx="15.5" cy="13.5" r="1.6" fill="currentColor" opacity=".35"/>'), 0, 60],
  ['skCream', '奶油肌', ic('<path d="M6 14c0-4 3-7 6-7s6 3 6 7"/><path d="M5 14h14c0 3-3 6-7 6s-7-3-7-6z"/>'), 0, 70],
  ['skBaby', '嬰兒肌', ic('<circle cx="12" cy="12" r="8"/><path d="M9 11h.01M15 11h.01M10 15c1 .8 3 .8 4 0"/>'), 0, 75],
  ['skFrost', '磨砂皮', ic(FACE + '<path d="M9 9h.01M12 8h.01M15 9h.01M10 12h.01M14 12h.01M12 15h.01"/>'), 0, 70],
  ['smooth', '磨皮', ic(FACE + '<path d="M9 15c1.5 1 4.5 1 6 0"/>'), 0, 0],
  ['skTex', '皮膚紋理', ic('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'), 0, 0],
  ['skOil', '祛油光', ic(FACE + '<path d="M12 7l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M7 19l10-14" opacity=".6"/>'), 0, 0],
  ['skBare', '素顏肌', ic(FACE), 0, 75],
  ['skBody', '身體嫩膚', ic('<circle cx="12" cy="6" r="3"/><path d="M6 21c0-6 2-10 6-10s6 4 6 10"/>'), 0, 100],
  ['skDewy', '水光肌', ic(FACE + '<path d="M10 8c1-1 3-1 4 0M8 12.5c.5-.8 1.5-1 2-.8M16 12.5c-.5-.8-1.5-1-2-.8"/>'), 0, 75],
  ['skMatte', '啞光肌', ic(FACE + '<path d="M8 10h8M8 13h8" opacity=".5"/>'), 0, 90],
  ['skBlush', '腮紅肌', ic(FACE + '<ellipse cx="8.3" cy="13.5" rx="2" ry="1.3" fill="currentColor" opacity=".45"/><ellipse cx="15.7" cy="13.5" rx="2" ry="1.3" fill="currentColor" opacity=".45"/>'), 0, 60],
  ['skTan', '美黑肌', ic('<circle cx="12" cy="12" r="4" fill="currentColor" opacity=".45"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'), 0, 70],
];
// 膚色（照 Hypic 修飾 › 膚色）：膚色統一，加上紅潤、冷白、仿曬三種整體膚色，只作用在皮膚上
export const TONE = [
  ['skUnify', '膚色統一', ic('<ellipse cx="9" cy="12" rx="5" ry="7"/><ellipse cx="15" cy="12" rx="5" ry="7" fill="currentColor" opacity=".3"/>'), 0, 60],
  ['skRosy', '紅潤', ic(FACE + '<ellipse cx="8.5" cy="13.5" rx="2" ry="1.3" fill="currentColor" opacity=".35"/><ellipse cx="15.5" cy="13.5" rx="2" ry="1.3" fill="currentColor" opacity=".35"/>'), 0, 60],
  ['skCool', '冷白', ic(FACE + '<path d="M12 9v6M9.5 10.5l5 3M14.5 10.5l-5 3"/>'), 0, 60],
  ['skSun', '仿曬', ic('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'), 0, 60],
];
export const WRINKLE = [
  ['wkHead', '抬頭紋', ic(FACE + '<path d="M8.5 6.5h7M8 8.5h8"/>'), 0, 90],
  ['wkFold', '法令紋', ic(FACE + '<path d="M10 10c-2 3-2 5-1 7M14 10c2 3 2 5 1 7"/>'), 0, 70],
  ['wkNeck', '頸紋', ic('<path d="M8 3c0 4 1 6 4 6s4-2 4-6"/><path d="M8 9v12M16 9v12M9 14h6M9 17h6"/>'), 0, 70],
  ['wkEye', '眼紋', ic('<path d="M2 12s4-5 9-5 9 5 9 5-4 5-9 5-9-5-9-5z"/><circle cx="11" cy="12" r="2.5"/><path d="M20.5 9l1.5-1M21 12h1.5M20.5 15l1.5 1"/>'), 0, 60],
  ['wkLip', '唇紋', ic('<path d="M4 12c3-3 5-3 8-1 3-2 5-2 8 1-3 4-13 4-16 0z"/><path d="M9 11.5v2M12 11.5v2.5M15 11.5v2"/>'), 0, 60],
];
// AI 美肌（照 Hypic 的 AI 美肌面板：臉部 8 項、身體 8 項，名稱和第一次點開的強度照 Hypic）
//   Hypic 是上傳到雲端用圖生圖模型重畫，這裡全部在手機上用膚質遮罩和三層模糊做出類似的樣子
const BODYI = '<circle cx="12" cy="6" r="3"/><path d="M6 21c0-6 2-10 6-10s6 4 6 10"/>';
export const AI_FACE = [
  ['aiFreckle', '雀斑', ic(FACE + '<path d="M9 13h.01M10.5 14h.01M8 14.5h.01M15 13h.01M13.5 14h.01M16 14.5h.01M12 12.5h.01"/>'), 0, 95],
  ['aiRosy', '水光紅潤', ic(FACE + '<ellipse cx="8.5" cy="13.5" rx="1.8" ry="1.2" fill="currentColor" opacity=".4"/><ellipse cx="15.5" cy="13.5" rx="1.8" ry="1.2" fill="currentColor" opacity=".4"/><path d="M10 8c1-1 3-1 4 0"/>'), 0, 90],
  ['aiClear', '清透素顏', ic(FACE + '<path d="M9 15c1.5 1 4.5 1 6 0"/>'), 0, 90],
  ['aiMatte', '霧面感', ic(FACE + '<path d="M8 10h8M8 13h8" opacity=".5"/>'), 0, 90],
  ['aiGloss', '光澤感', ic(FACE + '<path d="M12 6l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>'), 0, 75],
  ['aiGlass', '玻璃肌', ic(FACE + '<path d="M9 9l3-2M10 12l4-3" opacity=".7"/>'), 0, 75],
  ['aiSunkiss', '仿曬妝', ic(FACE + '<path d="M7.5 13c1.5-1 7.5-1 9 0" stroke-width="2.4" opacity=".35"/>'), 0, 70],
  ['aiBronze', '古銅色', ic('<ellipse cx="12" cy="12" rx="7" ry="9" fill="currentColor" opacity=".35"/>'), 0, 45],
];
export const AI_BODY = [
  ['aiVelvet', '絲絨嫩膚', ic(BODYI), 0, 95],
  ['aiBDewy', '水光肌', ic(BODYI + '<path d="M10 15c1-1 3-1 4 0"/>'), 0, 75],
  ['aiTanLine', '曬痕', ic(BODYI + '<path d="M9 11l1 6M15 11l-1 6" opacity=".6"/>'), 0, 100],
  ['aiBGlass', '玻璃肌', ic(BODYI + '<path d="M10 16l3-2" opacity=".7"/>'), 0, 90],
  ['aiBGloss', '光澤感', ic(BODYI + '<path d="M12 13l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z"/>'), 0, 90],
  ['aiRose', '玫瑰金', ic(BODYI + '<circle cx="12" cy="16" r="2" fill="currentColor" opacity=".4"/>'), 0, 90],
  ['aiChamp', '香檳金', ic(BODYI + '<circle cx="12" cy="16" r="2" fill="currentColor" opacity=".25"/>'), 0, 90],
  ['aiBBronze', '古銅色', ic('<circle cx="12" cy="6" r="3" fill="currentColor" opacity=".35"/><path d="M6 21c0-6 2-10 6-10s6 4 6 10z" fill="currentColor" opacity=".35"/>'), 0, 85],
];
const AI = [...AI_FACE, ...AI_BODY].map(x => x[0]);
// 臉型分頁的豐臉、拉皮額頭也要在這裡補亮、淡化細紋（值存在臉型的 fs_ 鍵）
const FILL = { uFFore: 'fs_fill_fore', uFCheek: 'fs_fill_cheek', uFFold: 'fs_fill_fold', uFBag: 'fs_fill_bag', uLFore: 'fs_lift_fore', uLEye: 'fs_lift_eye' };
// 塑臉的「顏色」4 條（值存在 sc_ 鍵，預設值在 makeup.js）
const SCCOL = { uScEye: 'sc_eye', uScEyeC: 'sc_eyeCol', uScLip: 'sc_lipCol', uScCheek: 'sc_cheekCol' };
const KEYS = [...[...SKIN, ...TONE, ...WRINKLE, ...AI_FACE, ...AI_BODY].map(x => x[0]).filter(k => k !== 'smooth'), ...Object.values(FILL), ...Object.values(SCCOL)];
export const SKIN_P0 = Object.fromEntries(KEYS.filter(k => !k.startsWith('fs_') && !k.startsWith('sc_')).map(k => [k, 0]));
export const skinOn = p => KEYS.some(k => p[k]);
export const skinKey = p => KEYS.map(k => p[k] || 0).join('|');

// ---------- 遮罩（分割圖的解析度，用 CPU 算一次） ----------
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const R_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const L_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const R_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const NOSTRIL = [[48, 64, 98, 240], [278, 294, 327, 460]];
// 額頭：上半圈臉框到眉毛上緣
const BROW_TOP = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];
const FORE_TOP = [21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const avg = (pts, ids) => ids.reduce((s, i) => ({ x: s.x + pts[i].x / ids.length, y: s.y + pts[i].y / ids.length }), { x: 0, y: 0 });
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function boxBlur(a, w, h, r, n = 2) {
  if (r < 1) return a;
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < n; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0; const o = y * w;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[o + x] = s / (2 * r + 1);
        s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// 準備膚質資料，同一張照片只算一次
//   T1：R = 全部皮膚（扣掉眼、眉、嘴、鼻孔）、G = 臉部皮膚、B = 身體皮膚、A = 嘴唇和嘴唇周圍（唇紋）
//   T2：R = 額頭（抬頭紋）、G = 法令紋、B = 眼周（眼紋）、A = 脖子（頸紋）
//   T3：R = 臉的高點（水光肌）、G = 蘋果肌（腮紅肌）、B = 眼睛裡面（亮眼）、A = 眼皮到眉毛（眼睛顏色）
export function prepSkin(canvas, seg, faces) {
  const w = seg.w, h = seg.h, n = w * h, kx = w / canvas.width, ky = h / canvas.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const r0 = Math.max(1, Math.round(Math.max(w, h) / 200));
  // 畫一層灰階形狀、模糊後取出
  const layer = (draw, r = r0, base = '#000') => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    for (const pts of faces) draw(pts, dist(pts[234], pts[454]) * kx);
    const d = ctx.getImageData(0, 0, w, h).data, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = d[i * 4] / 255;
    return boxBlur(a, w, h, r);
  };
  const X = p => [p.x * kx, p.y * ky];
  const path = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...X(p)) : ctx.moveTo(...X(p))); ctx.closePath(); };
  const grow = (pts, ids, g) => { const m = avg(pts, ids); return ids.map(i => ({ x: m.x + (pts[i].x - m.x) * g, y: m.y + (pts[i].y - m.y) * g })); };
  const poly = (pts, ids, g = 1, col = '#fff') => { path(grow(pts, ids, g)); ctx.fillStyle = col; ctx.fill(); };
  const blob = (p, rx, ry, rot, col = '#fff') => { ctx.beginPath(); ctx.ellipse(p.x * kx, p.y * ky, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); };
  const down = pts => { const a = pts[33], b = pts[263], l = dist(a, b) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; };
  const roll = pts => Math.atan2(pts[263].y - pts[33].y, pts[263].x - pts[33].x);

  const oval = layer(pts => poly(pts, OVAL, 0.98));
  const holes = layer(pts => {
    poly(pts, L_EYE, 1.5, '#000'); poly(pts, R_EYE, 1.5, '#000');
    poly(pts, L_BROW, 1.25, '#000'); poly(pts, R_BROW, 1.25, '#000');
    poly(pts, LIPS, 1.1, '#000'); NOSTRIL.forEach(q => poly(pts, q, 1.4, '#000'));
  }, r0, '#fff');
  const lip = layer((pts, W) => { poly(pts, LIPS, 1.35, '#888'); poly(pts, LIPS, 1.0); }, Math.max(1, r0));
  const fore = layer(pts => {
    const d = down(pts), W = dist(pts[234], pts[454]);
    // 眉毛上緣往上一點，臉框上緣往下一點，避開頭髮邊
    const lo = BROW_TOP.map(i => ({ x: pts[i].x - d.x * W * 0.02, y: pts[i].y - d.y * W * 0.02 })).reverse();
    const hi = FORE_TOP.map(i => ({ x: pts[i].x - d.x * W * 0.01, y: pts[i].y - d.y * W * 0.01 }));
    path([...hi, ...lo]); ctx.fill();
  }, r0 * 2);
  const fold = layer((pts, W) => {
    // 鼻翼外側到嘴角外下方的一條帶子
    for (const [a, b, e] of [[129, 61, 57], [358, 291, 287]]) {
      ctx.lineCap = 'round'; ctx.lineWidth = W * 0.075;
      ctx.beginPath(); ctx.moveTo(...X(pts[a])); ctx.quadraticCurveTo(...X(pts[b === 61 ? 206 : 426]), ...X(pts[e])); ctx.stroke();
    }
  }, r0 * 2);
  const eye = layer((pts, W) => {
    const d = down(pts), rt = roll(pts);
    for (const [ids, outer, inner] of [[L_EYE, 33, 133], [R_EYE, 263, 362]]) {
      const o = pts[outer], ii = pts[inner], ew = dist(o, ii), side = { x: (o.x - ii.x) / ew, y: (o.y - ii.y) / ew };
      // 魚尾紋：外眼角往外
      blob({ x: o.x + side.x * ew * 0.38, y: o.y + side.y * ew * 0.38 + d.y * ew * 0.05 }, ew * 0.4 * kx, ew * 0.32 * kx, rt);
      // 眼下細紋：下眼瞼往下一條
      const m = avg(pts, ids);
      blob({ x: m.x + d.x * ew * 0.42, y: m.y + d.y * ew * 0.42 }, ew * 0.68 * kx, ew * 0.32 * kx, rt);
    }
    ctx.globalCompositeOperation = 'destination-out';
    poly(pts, L_EYE, 1.15); poly(pts, R_EYE, 1.15);
    ctx.globalCompositeOperation = 'source-over';
  }, r0 * 2);
  const neck = layer((pts, W) => {
    const d = down(pts), H = dist(pts[10], pts[152]), ch = pts[152];
    blob({ x: ch.x + d.x * H * 0.55, y: ch.y + d.y * H * 0.55 }, W * 0.36, H * 0.55 * ky, roll(pts));
  }, r0 * 3);
  const glow = layer((pts, W) => {
    const rt = roll(pts), u = W / kx;
    blob(pts[151], u * 0.14 * kx, u * 0.09 * kx, rt);                       // 額頭中間
    blob(avg(pts, [6, 197, 195]), u * 0.035 * kx, u * 0.12 * kx, rt);        // 鼻樑
    blob(pts[4], u * 0.035 * kx, u * 0.03 * kx, rt);                         // 鼻頭
    blob(pts[116], u * 0.1 * kx, u * 0.05 * kx, rt - 0.4);                   // 顴骨
    blob(pts[345], u * 0.1 * kx, u * 0.05 * kx, rt + 0.4);
    blob(avg(pts, [152, 175, 199]), u * 0.07 * kx, u * 0.04 * kx, rt);      // 下巴
    blob(avg(pts, [0, 164]), u * 0.035 * kx, u * 0.02 * kx, rt);             // 唇峰上方
  }, r0 * 5);
  const cheek = layer((pts, W) => {
    const rt = roll(pts);
    blob(avg(pts, [50, 205, 187]), W * 0.13, W * 0.09, rt);
    blob(avg(pts, [280, 425, 411]), W * 0.13, W * 0.09, rt);
  }, r0 * 4);

  const eyeIn = layer(pts => { poly(pts, L_EYE, 1.0); poly(pts, R_EYE, 1.0); }, r0);
  const lid = layer((pts, W) => {
    for (const [ids, brow] of [[L_EYE, L_BROW], [R_EYE, R_BROW]]) {
      const e = avg(pts, ids), b = avg(pts, brow), ew = dist(pts[ids[0]], pts[ids[8]]);
      blob({ x: (e.x + b.x) / 2, y: e.y * 0.6 + b.y * 0.4 }, ew * 0.75 * kx, ew * 0.38 * kx, roll(pts));
    }
    ctx.globalCompositeOperation = 'destination-out';
    poly(pts, L_EYE, 1.05); poly(pts, R_EYE, 1.05); poly(pts, L_BROW, 1.1); poly(pts, R_BROW, 1.1);
    ctx.globalCompositeOperation = 'source-over';
  }, r0 * 2);

  // 皮膚：有臉時臉框內一定算皮膚（分割偶爾會把臉的亮部判成別的）
  const T1 = new Uint8Array(n * 4), T2 = new Uint8Array(n * 4), T3 = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const sk = Math.max(seg.skin[i], oval[i] * 0.9);
    const face = sk * oval[i], body = sk * (1 - oval[i]);
    T1[i * 4] = sk * holes[i] * 255; T1[i * 4 + 1] = face * holes[i] * 255; T1[i * 4 + 2] = body * 255; T1[i * 4 + 3] = lip[i] * 255;
    T2[i * 4] = fore[i] * sk * 255; T2[i * 4 + 1] = fold[i] * sk * 255; T2[i * 4 + 2] = eye[i] * sk * 255; T2[i * 4 + 3] = neck[i] * seg.skin[i] * (1 - oval[i] * 0.7) * 255;
    T3[i * 4] = glow[i] * face * holes[i] * 255; T3[i * 4 + 1] = cheek[i] * face * 255; T3[i * 4 + 2] = eyeIn[i] * 255; T3[i * 4 + 3] = lid[i] * 255;
  }
  // 皮膚平均色（線性空間平均後轉回 sRGB），原生感、素顏肌的膚色統一用
  const s = document.createElement('canvas'); s.width = w; s.height = h;
  const sc = s.getContext('2d', { willReadFrequently: true }); sc.drawImage(canvas, 0, 0, w, h);
  const px = sc.getImageData(0, 0, w, h).data;
  const m = [0, 0, 0]; let ms = 0;
  for (let i = 0; i < n; i += 3) {
    const wt = T1[i * 4] / 255; if (wt < 0.5) continue;
    for (let k = 0; k < 3; k++) m[k] += Math.pow(px[i * 4 + k] / 255, 2.2) * wt;
    ms += wt;
  }
  const mean = ms > 0 ? m.map(v => Math.pow(v / ms, 1 / 2.2)) : [0.8, 0.62, 0.52];
  // 模糊的粗細照臉的大小算（全尺寸像素）
  const W = faces.length ? Math.max(...faces.map(p => dist(p[234], p[454]))) : Math.min(canvas.width, canvas.height) * 0.3;
  return { w, h, T1, T2, T3, mean, W, faces: faces.length, area: ms * 3 / n };
}

// ---------- GPU ----------
const VS = `#version 300 es
in vec2 a; out vec2 vUV;
void main(){ vUV = vec2((a.x + 1.0) * 0.5, (1.0 - a.y) * 0.5); gl_Position = vec4(a, 0.0, 1.0); }`;
// 高斯模糊（分兩次：橫、直）。取樣間距大於 1 像素時讀縮小過的貼圖，免得出現格紋
const BLUR = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uStep; uniform float uLod;
void main(){
  vec4 s = vec4(0.0); float ws = 0.0;
  for (int i = -7; i <= 7; i++) {
    float f = float(i), w = exp(-f * f / 10.9);
    s += textureLod(uSrc, vUV + uStep * f, uLod) * w; ws += w;
  }
  o = s / ws;
}`;
// 主程式：A = 細模糊、B = 中模糊、C = 粗模糊
//   細紋理 = 原圖 - A，中等起伏（細紋、斑）= A - B，大範圍明暗（法令紋、頸紋的陰影）= B - C
const FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uImg, uA, uB, uC, uT1, uT2, uT3;
uniform vec2 uPx;
uniform vec3 uMean;
uniform float uNative, uGirl, uCream, uBaby, uFrost, uTex, uOil, uBare, uBody, uDewy, uMatte, uBlush, uTan, uUnify, uRosy, uCool, uSun;
uniform float uHead, uFold, uNeck, uEye, uLip;
uniform float uFFore, uFCheek, uFFold, uFBag, uLFore, uLEye;
uniform float uAi[16];
uniform float uScEye, uScEyeC, uScLip, uScCheek;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 sat(vec3 c, float k){ float l = luma(c); return vec3(l) + (c - vec3(l)) * k; }
// 去紋：把比周圍暗的細線拉回周圍的亮度，細紋理留著
vec3 unline(vec3 col, vec3 fine, vec3 wide, float k, float keep){
  float v = luma(wide) - luma(fine);
  float w = mix(0.3, 1.0, smoothstep(0.0, 0.035, v));
  vec3 tgt = wide + (col - fine) * keep;
  return mix(col, tgt, clamp(k * w, 0.0, 1.0));
}
void main(){
  vec3 img = texture(uImg, vUV).rgb, col = img;
  vec3 A = texture(uA, vUV).rgb, B = texture(uB, vUV).rgb, C = texture(uC, vUV).rgb;
  vec4 t1 = texture(uT1, vUV), t2 = texture(uT2, vUV), t3 = texture(uT3, vUV);
  float sk = t1.r, face = t1.g, body = t1.b;
  vec3 fineD = img - A;
  // ---- 祛皺 ----
  col = unline(col, A, B, uHead * t2.r * 1.1, 0.5);
  col = unline(col, B, C, uFold * t2.g * 1.1, 0.9);
  col = unline(col, A, B, uFold * t2.g * 0.6, 0.8);
  col = unline(col, A, B, uEye * t2.b, 0.45);
  col = unline(col, B, C, uNeck * t2.a, 0.85);
  col = unline(col, A, B, uNeck * t2.a * 0.8, 0.75);
  col = unline(col, img * 0.5 + A * 0.5, A, uLip * t1.a * 0.9, 0.5);
  // ---- 豐臉：比周圍暗的凹處（額頭、蘋果肌、法令紋、淚溝）補亮，再加一點飽滿的光 ----
  #define FILLR(k, m, g) if ((k) > 0.0) { float hol = max(0.0, luma(C) - luma(B)); col += vec3(hol * 1.5) * (k) * (m); col += (1.0 - col) * (g) * (k) * (m); }
  FILLR(uFFore, t2.r, 0.04)
  FILLR(uFCheek, t3.g, 0.05)
  FILLR(uFFold, t2.g, 0.02)
  FILLR(uFBag, t2.b, 0.03)
  // 拉皮：額頭、眼周的細紋一起淡化
  col = unline(col, A, B, uLFore * t2.r * 0.8, 0.6);
  col = unline(col, A, B, uLEye * t2.b * 0.6, 0.55);
  // ---- 膚質 ----
  // 磨平：中等起伏收掉，細紋理依比例保留
  #define SMOOTH(k, keep) col = mix(col, B + (col - A) * (keep), clamp((k) * sk, 0.0, 1.0))
  // 原生感：斑點、泛紅收平，膚色往整體平均靠，紋理不動
  if (uNative > 0.0) {
    vec3 unify = B + (uMean * (luma(B) / max(luma(uMean), 0.05)) - B) * 0.45;
    col += (unify - B) * uNative * sk;
    SMOOTH(uNative * 0.35, 1.0);
  }
  // 膚色統一（Hypic 修飾 › 膚色，0~100）：臉和身體的皮膚顏色往整體平均膚色拉，亮度和紋理不動，
  // 大範圍的明暗不均（一邊臉暗、脖子偏暗）也收一點
  if (uUnify > 0.0) {
    float lb = luma(B);
    vec3 tgt = uMean * (lb / max(luma(uMean), 0.05));
    col += (tgt - B) * 0.75 * uUnify * sk;
    col += vec3((luma(C) - lb) * 0.3 * uUnify * sk);
  }
  // 素顏肌：比原生感更淡，再把局部泛紅退掉
  if (uBare > 0.0) {
    vec3 unify = B + (uMean * (luma(B) / max(luma(uMean), 0.05)) - B) * 0.3;
    col += (unify - B) * uBare * sk;
    float red = max(0.0, (col.r - col.g) - (uMean.r - uMean.g));
    col.r -= red * 0.5 * uBare * sk;
    SMOOTH(uBare * 0.25, 1.0);
  }
  // 少女肌：中度磨平、透亮、偏粉
  if (uGirl > 0.0) {
    SMOOTH(uGirl * 0.55, 0.6);
    vec3 pink = col + vec3(0.035, 0.0, 0.02) + (1.0 - col) * 0.06;
    col = mix(col, pink, uGirl * sk);
  }
  // 奶油肌：大範圍明暗也收一點，對比降低、偏暖的柔霧感
  if (uCream > 0.0) {
    SMOOTH(uCream * 0.75, 0.45);
    col = mix(col, col + (C - col) * 0.18, uCream * sk);
    vec3 cream = sat(col, 0.9) + (vec3(1.0, 0.95, 0.88) - col) * 0.08;
    col = mix(col, cream, uCream * sk);
  }
  // 嬰兒肌：最平滑，亮一點、粉一點
  if (uBaby > 0.0) {
    SMOOTH(uBaby * 0.8, 0.4);
    vec3 baby = sat(col, 1.04) + vec3(0.03, 0.005, 0.02) + (1.0 - col) * 0.08;
    col = mix(col, baby, uBaby * sk);
  }
  // 磨砂皮：壓掉油亮的高光，再加一層很細的霧面顆粒
  if (uFrost > 0.0) {
    float hl = max(0.0, luma(col) - luma(B) - 0.015);
    col -= vec3(hl) * 0.85 * uFrost * sk;
    SMOOTH(uFrost * 0.35, 0.8);
    float g = noise(vUV / uPx * 0.7) - 0.5;
    col += g * 0.03 * uFrost * sk;
    col = mix(col, sat(col, 0.94), uFrost * sk);
  }
  // 身體嫩膚：只作用在臉以外的皮膚
  if (uBody > 0.0) {
    col = mix(col, B + (col - A) * 0.5, clamp(uBody * 0.75 * body, 0.0, 1.0));
    col = mix(col, col + (1.0 - col) * 0.06, uBody * body);
  }
  // 祛油光：比周圍亮、又不太有顏色的反光收回去
  if (uOil > 0.0 || uMatte > 0.0) {
    float k = uOil + uMatte * 0.55;
    // 油光：一塊比周圍亮、顏色又偏淡的地方。只把多出來的亮度壓回去，紋理留著
    float s0 = max(A.r, max(A.g, A.b)), s1 = min(A.r, min(A.g, A.b));
    float pale = 1.0 - smoothstep(0.2, 0.55, (s0 - s1) / max(s0, 0.01));
    float ex = max(0.0, luma(A) - luma(C) - 0.012);
    float spec = smoothstep(0.0, 0.05, ex) * mix(0.35, 1.0, pale);
    col -= vec3(ex) * 1.1 * clamp(spec * k * face, 0.0, 1.0);
    col = mix(col, sat(col, 1.06), spec * k * face * 0.5);
  }
  // 啞光肌：再降一點對比、收一點起伏
  if (uMatte > 0.0) {
    SMOOTH(uMatte * 0.3, 0.85);
    col = mix(col, mix(col, C, 0.12), uMatte * sk);
    col = mix(col, sat(col, 0.93), uMatte * sk);
  }
  // 水光肌：臉的高點加一層濕潤的光澤，原本的亮部再亮一點
  if (uDewy > 0.0) {
    SMOOTH(uDewy * 0.35, 0.9);
    float hi = max(0.0, luma(B) - luma(C));
    col += (1.0 - col) * (t3.r * t3.r * 0.2 + hi * 1.8 * face) * uDewy;
  }
  // 腮紅肌：蘋果肌透出血色，整體也帶一點粉
  if (uBlush > 0.0) {
    vec3 flush = col * vec3(1.0, 0.86, 0.87) + vec3(0.03, 0.0, 0.01);
    col = mix(col, flush, t3.g * uBlush * 0.65);
    col = mix(col, col + vec3(0.02, 0.0, 0.01), uBlush * face);
  }
  // 美黑肌：皮膚往小麥色、古銅色走，亮部留下來
  if (uTan > 0.0) {
    vec3 c = max(col, vec3(0.0));
    vec3 tan = vec3(pow(c.r, 1.18) * 0.97, pow(c.g, 1.32) * 0.88, pow(c.b, 1.5) * 0.76);
    col = mix(col, sat(tan, 1.05), uTan * sk * 0.85);
  }
  // ---- 膚色 ----
  // 紅潤：中間調帶一點粉紅血色，暗部不動
  if (uRosy > 0.0) {
    float m = smoothstep(0.15, 0.55, luma(col)) * uRosy * sk;
    col = mix(col, col * vec3(1.06, 0.97, 1.0) + vec3(0.02, 0.0, 0.012), m * 0.8);
  }
  // 冷白：退黃、提亮，顏色往偏粉的冷白走
  if (uCool > 0.0) {
    float m = uCool * sk;
    vec3 c = mix(col, vec3(luma(col)), 0.15);
    c = c * vec3(0.98, 1.0, 1.04) + (1.0 - c) * 0.13;
    col = mix(col, c, m * 0.85);
  }
  // 仿曬：小麥色，比美黑肌淡、偏暖金
  if (uSun > 0.0) {
    vec3 c = max(col, vec3(0.0));
    vec3 sun = vec3(pow(c.r, 1.08), pow(c.g, 1.16) * 0.97, pow(c.b, 1.3) * 0.88);
    col = mix(col, sat(sun, 1.04), uSun * sk * 0.8);
  }
  // ---- AI 美肌 ----
  // 臉部：face 是臉上的皮膚，t3.g 是蘋果肌，t3.r 是臉的高點（額頭、鼻樑、顴骨）
  float hiF = max(0.0, luma(B) - luma(C));
  if (uAi[0] > 0.0) {
    // 雀斑：臉頰和鼻樑上一顆顆淺褐色小點，大小跟著照片大小走
    vec2 q = vUV * vec2(uPx.y / uPx.x, 1.0) * 260.0;
    float n = noise(q * 0.9) * 0.7 + noise(q * 2.1 + 5.3) * 0.3;
    float dot1 = smoothstep(0.68, 0.76, n) * (0.6 + 0.4 * noise(q * 0.3));
    float zone = clamp(t3.g * 1.6 + t3.r * 0.6, 0.0, 1.0) * face;
    col = mix(col, col * vec3(0.78, 0.65, 0.55), dot1 * zone * uAi[0] * 0.9);
  }
  if (uAi[1] > 0.0) {
    // 水光紅潤：蘋果肌透紅、高點濕潤反光
    SMOOTH(uAi[1] * 0.3 * face, 0.9);
    col = mix(col, col * vec3(1.0, 0.84, 0.86) + vec3(0.04, 0.0, 0.015), t3.g * uAi[1] * 0.6);
    col += (1.0 - col) * (t3.r * t3.r * 0.15 + min(hiF * 1.5, 0.1) * face) * uAi[1];
  }
  if (uAi[2] > 0.0) {
    // 清透素顏：膚色均勻、退紅、透亮一點
    vec3 un = B + (uMean * (luma(B) / max(luma(uMean), 0.05)) - B) * 0.5;
    col += (un - B) * uAi[2] * face;
    float red = max(0.0, (col.r - col.g) - (uMean.r - uMean.g));
    col.r -= red * 0.6 * uAi[2] * face;
    SMOOTH(uAi[2] * 0.4 * face, 0.85);
    col = mix(col, col + (1.0 - col) * 0.07, uAi[2] * face);
  }
  if (uAi[3] > 0.0) {
    // 霧面感：油光壓掉、對比降、像上了霧面粉底
    float ex = max(0.0, luma(A) - luma(C) - 0.01);
    col -= vec3(ex) * 1.2 * uAi[3] * face;
    SMOOTH(uAi[3] * 0.5 * face, 0.7);
    col = mix(col, sat(mix(col, C, 0.15), 0.92) + 0.02, uAi[3] * face);
  }
  if (uAi[4] > 0.0) {
    // 光澤感：高點帶一層柔亮的光
    col += (1.0 - col) * (t3.r * 0.16 + min(hiF * 1.6, 0.12) * face) * uAi[4];
  }
  if (uAi[5] > 0.0) {
    // 玻璃肌：磨得很平、透亮，高點有清楚的反光
    SMOOTH(uAi[5] * 0.7 * face, 0.5);
    col = mix(col, col + (1.0 - col) * 0.06, uAi[5] * face);
    float sh = smoothstep(0.01, 0.06, hiF) * face;
    col += (1.0 - col) * (sh * 0.22 + t3.r * t3.r * 0.14) * uAi[5];
  }
  if (uAi[6] > 0.0) {
    // 仿曬妝：鼻樑和兩頰一條曬紅、整張臉帶一點小麥色
    vec3 c = max(col, vec3(0.0));
    col = mix(col, vec3(pow(c.r, 1.08), pow(c.g, 1.16), pow(c.b, 1.26)), uAi[6] * face * 0.6);
    float band = clamp(t3.g * 1.4 + t3.r * 0.5, 0.0, 1.0) * face;
    col = mix(col, col * vec3(1.0, 0.8, 0.74) + vec3(0.05, 0.0, 0.0), band * uAi[6] * 0.6);
  }
  if (uAi[7] > 0.0) {
    vec3 c = max(col, vec3(0.0));
    col = mix(col, sat(vec3(pow(c.r, 1.25) * 0.96, pow(c.g, 1.42) * 0.86, pow(c.b, 1.65) * 0.72), 1.08), uAi[7] * face * 0.9);
  }
  // 身體：body 是臉以外的皮膚
  if (uAi[8] > 0.0) {
    col = mix(col, B + (col - A) * 0.35, clamp(uAi[8] * 0.85 * body, 0.0, 1.0));
    col = mix(col, sat(col + (1.0 - col) * 0.06, 0.95), uAi[8] * body);
  }
  if (uAi[9] > 0.0) {
    SMOOTH(uAi[9] * 0.35 * body, 0.9);
    col += (1.0 - col) * hiF * 2.4 * body * uAi[9];
  }
  if (uAi[10] > 0.0) {
    // 曬痕：皮膚曬成小麥色，比較凸出的地方（肩、手臂上緣）微微曬紅
    vec3 c = max(col, vec3(0.0));
    col = mix(col, vec3(pow(c.r, 1.15) * 0.98, pow(c.g, 1.3) * 0.9, pow(c.b, 1.45) * 0.8), uAi[10] * body * 0.8);
    col = mix(col, col * vec3(1.0, 0.85, 0.8) + vec3(0.03, 0.0, 0.0), smoothstep(0.0, 0.03, hiF) * body * uAi[10] * 0.6);
  }
  if (uAi[11] > 0.0) {
    SMOOTH(uAi[11] * 0.65 * body, 0.5);
    col += (1.0 - col) * (smoothstep(0.004, 0.04, hiF) * 0.45 + 0.06) * body * uAi[11];
  }
  if (uAi[12] > 0.0) {
    col += (1.0 - col) * hiF * 3.0 * body * uAi[12];
  }
  if (uAi[13] > 0.0 || uAi[14] > 0.0) {
    // 玫瑰金、香檳金：亮部帶金屬色的光澤，暗部微微染色
    vec3 tint = uAi[13] > 0.0 ? vec3(1.0, 0.76, 0.72) : vec3(1.0, 0.88, 0.62);
    float k = max(uAi[13], uAi[14]);
    float hl = smoothstep(0.35, 0.85, luma(col));
    col = mix(col, col * mix(vec3(1.0), tint, 0.35), k * body);
    col += (1.0 - col) * tint * (hl * 0.18 + hiF * 2.5) * k * body;
  }
  if (uAi[15] > 0.0) {
    vec3 c = max(col, vec3(0.0));
    col = mix(col, sat(vec3(pow(c.r, 1.25) * 0.96, pow(c.g, 1.42) * 0.86, pow(c.b, 1.65) * 0.72), 1.08), uAi[15] * body * 0.9);
  }
  // ---- 塑臉的顏色：區域提色（Hypic 是飽和度調整，不是上色） ----
  if (uScEye > 0.0) {
    // 亮眼：眼白提亮、虹膜顏色更清楚
    float m = t3.b * uScEye, L = luma(col);
    col = mix(col, sat(col, 1.5), m);
    col += (1.0 - col) * smoothstep(0.35, 0.75, L) * 0.18 * m;
    col += (col - A) * 0.6 * m;
  }
  if (uScEyeC > 0.0) col = mix(col, sat(col, 1.6), t3.a * uScEyeC);
  if (uScLip > 0.0) col = mix(col, sat(col, 1.7) * vec3(1.02, 0.98, 0.99), smoothstep(0.55, 0.9, t1.a) * uScLip);
  if (uScCheek > 0.0) col = mix(col, sat(col, 1.45) * vec3(1.02, 0.98, 0.98), t3.g * uScCheek);
  // 皮膚紋理：細紋理加強，再補一點像毛孔的細顆粒，磨皮後才不會像塑膠
  if (uTex > 0.0) {
    col += fineD * 0.9 * uTex * sk;
    float pore = noise(vUV / uPx * 0.45) * 0.6 + noise(vUV / uPx * 0.9) * 0.4 - 0.5;
    col += pore * 0.025 * uTex * sk * smoothstep(0.08, 0.3, luma(col));
  }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class SkinFx {
  constructor() {
    const c = this.canvas = document.createElement('canvas');
    const gl = this.gl = c.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p); return p; };
    this.pBlur = prog(BLUR); this.pMain = prog(FS);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.img = this.tex(); this.T = [this.tex(), this.tex(), this.tex()];
    this.src = null; this.data = null; this.blurs = null;
  }
  tex() {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // 可以當畫布的貼圖（模糊的中間結果）
  target(w, h) {
    const gl = this.gl, t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb, w, h };
  }
  mip(t) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  pass(p, out, w, h, tex, uni) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.viewport(0, 0, w, h);
    tex.forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(p, n), i); });
    uni(n => gl.getUniformLocation(p, n));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 照片換了才重算三張模糊圖
  prepare(img, data, scale) {
    const gl = this.gl, W = img.width, H = img.height;
    this.canvas.width = W; this.canvas.height = H;
    gl.bindTexture(gl.TEXTURE_2D, this.img);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.mip(this.img);
    // 模糊在最長邊 1280 以內的解析度上算
    const k = Math.min(1, 1280 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    if (!this.blurs || this.blurs.w !== w || this.blurs.h !== h) {
      this.blurs = { w, h, tmp: this.target(w, h), out: [0, 1, 2].map(() => this.target(w, h)) };
    }
    const fw = data.W * scale;
    // 細、中、粗三種：細紋寬度、皺紋寬度、法令紋陰影寬度（照臉寬算，全尺寸像素）
    [fw * 0.006, fw * 0.02, fw * 0.06].forEach((sig, i) => {
      const s = Math.max(0.6, sig * k);           // 模糊後的解析度上的 sigma
      const step = s / 2.33;                        // 15 個取樣點涵蓋 ±3 sigma
      const lodH = Math.max(0, Math.log2(step / k)), lodV = Math.max(0, Math.log2(step));
      const b = this.blurs, out = b.out[i];
      this.pass(this.pBlur, b.tmp, w, h, [['uSrc', this.img]], u => { gl.uniform2f(u('uStep'), step / w, 0); gl.uniform1f(u('uLod'), lodH); });
      this.mip(b.tmp.t);
      this.pass(this.pBlur, out, w, h, [['uSrc', b.tmp.t]], u => { gl.uniform2f(u('uStep'), 0, step / h); gl.uniform1f(u('uLod'), lodV); });
    });
    if (this.data !== data) {
      this.data = data;
      [data.T1, data.T2, data.T3].forEach((a, i) => {
        gl.bindTexture(gl.TEXTURE_2D, this.T[i]);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.w, data.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, a);
      });
    }
  }
  // 回傳改好膚質的 canvas；imgKey 變了代表輸入的照片內容變了（例如頭髮改過），要重算模糊
  // scale：img 是原尺寸照片縮小幾倍的預覽（臉寬、毛孔這些照原尺寸算的大小要跟著縮）
  apply(img, data, p, imgKey, scale = 1) {
    const gl = this.gl;
    if (!gl) return img;
    if (this.src !== img || this.data !== data || this.key !== imgKey) { this.src = img; this.key = imgKey; this.prepare(img, data, scale); }
    const b = this.blurs, W = img.width, H = img.height;
    this.pass(this.pMain, null, W, H, [['uImg', this.img], ['uA', b.out[0].t], ['uB', b.out[1].t], ['uC', b.out[2].t], ['uT1', this.T[0]], ['uT2', this.T[1]], ['uT3', this.T[2]]], u => {
      const f = k => (p[k] || 0) / 100;
      gl.uniform2f(u('uPx'), scale / W, scale / H);
      gl.uniform3fv(u('uMean'), data.mean);
      const map = { uNative: 'skNative', uGirl: 'skGirl', uCream: 'skCream', uBaby: 'skBaby', uFrost: 'skFrost', uTex: 'skTex', uOil: 'skOil', uBare: 'skBare', uBody: 'skBody', uDewy: 'skDewy', uMatte: 'skMatte', uBlush: 'skBlush', uTan: 'skTan', uUnify: 'skUnify', uRosy: 'skRosy', uCool: 'skCool', uSun: 'skSun', uHead: 'wkHead', uFold: 'wkFold', uNeck: 'wkNeck', uEye: 'wkEye', uLip: 'wkLip' };
      for (const [n, k] of Object.entries({ ...map, ...FILL, ...SCCOL })) gl.uniform1f(u(n), f(k));
      gl.uniform1fv(u('uAi'), AI.map(f));
    });
    return this.canvas;
  }
}

// 面板上的提示
export function skinNote(base, cur) {
  const d = base.skin;
  if (!d) return '正在找皮膚…';
  if (!d.faces && (cur.startsWith('wk') || ['skDewy', 'skBlush'].includes(cur) || AI_FACE.some(x => x[0] === cur))) return '這張照片沒找到臉，這一項需要看得到臉。';
  if (d.area < 0.003) return '這張照片裡露出的皮膚很少，效果會不明顯。';
  return '';
}
