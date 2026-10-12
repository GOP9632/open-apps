// 美妝：口紅、腮紅、眼影、眼線、睫毛、眉毛、修容、高光、美瞳、臥蠶、雙眼皮、痣、眼神光，加上整套妝容
//
// 做法跟醒圖一樣是「每一類一個款式 + 一個顏色 + 一個 0~100 的強度」，每張臉各自畫。
// 醒圖的款式是下載的效果包（遮罩圖 + shader）；這裡的形狀全部是用臉部特徵點即時畫出來的，
// 沒有用到它的任何圖檔、遮罩或 shader。顏色色票參考醒圖面板上標示的色碼。
//
// 輸出一張跟照片同比例的 RGBA 圖（彩妝層），由 gl.js 依顏色深淺決定怎麼疊：
//   很亮、偏白（高光、眼神光、唇彩亮點）用濾色，其他用「保留皮膚紋理的上色」。

const L_UP = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const L_LO = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const R_UP = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const R_LO = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const L_BROW_UP = [70, 63, 105, 66, 107], L_BROW_LO = [46, 53, 52, 65, 55];
const R_BROW_UP = [300, 293, 334, 296, 336], R_BROW_LO = [276, 283, 282, 295, 285];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

// ---------- 面板資料 ----------
// s：款式，c：顏色（[名稱, 色碼]），a：第一次選時的強度
export const MAKEUP = [
  { id: 'lips', name: '口紅', a: 70,
    s: ['滿唇', '霧面', '水潤', '咬唇', '暈染', '唇線'],
    c: [['蜜桃粉', 'e27d8a'], ['珊瑚', 'df7f6a'], ['柔和粉', 'e8999f'], ['烏龍奶茶', 'cf99a3'], ['裸粉', 'f2b0a2'], ['少女粉', 'ffa0aa'],
      ['素顏', 'f0b2c4'], ['甜柚', 'f8ab9c'], ['自然裸', 'd99d9a'], ['奶橘', 'ff9b8f'], ['蘋果紅', 'c22e48'], ['酒紅', '8e2338']] },
  { id: 'blush', name: '腮紅', a: 60,
    s: ['自然', '日系', '微醺', '曬傷', '斜掃', '圓潤'],
    c: [['白桃', 'e97b8c'], ['粉桃', 'eb9a9d'], ['桃子皮', 'f98c9e'], ['杏子', 'eba085'], ['燕麥奶茶', 'df786b'],
      ['莓果', 'bd4549'], ['嬰兒粉', 'f782d7'], ['牛奶粉', 'ffc2fe'], ['落葵', 'f7ada1'], ['野莓', 'ff69f8']] },
  { id: 'shadow', name: '眼影', a: 60,
    s: ['平鋪', '眼尾加深', '煙燻', '下眼影'],
    c: [['大地', 'a5745a'], ['蜜桃', 'e8957e'], ['玫瑰', 'c46a7a'], ['美拉德', '9c5b3b'], ['香檳', 'e8c9a0'],
      ['煙燻灰', '4a3f3f'], ['薄荷', '8fcfb8'], ['牛仔藍', '6c8fc7'], ['多巴胺粉', 'f27ba6']] },
  { id: 'liner', name: '眼線', a: 70,
    s: ['自然', '上揚', '下垂', '圓眼', '小野貓'],
    c: [['溫柔黑', '140a0a'], ['柔霧棕', '5e4939'], ['酒紅棕', '762313'], ['葡萄紫', 'b77ed1'], ['心機藍', '1c55ff'], ['森林綠', '47862e'], ['檸檬黃', 'ffbe1a']] },
  { id: 'lash', name: '睫毛', a: 70,
    s: ['自然', '濃密', '洋娃娃', '根根分明', '下睫毛'],
    c: [['溫柔黑', '140a0a'], ['柔霧棕', '6c3c1e'], ['酒紅棕', '762313']] },
  { id: 'brow', name: '眉毛', a: 50,
    s: ['原生', '平眉', '挑眉', '柳葉', '野生'],
    c: [['深棕', '6b503d'], ['溫柔黑', '140a0a'], ['酒紅棕', '762313'], ['灰棕', '937e6e'], ['淺栗棕', 'c89349'], ['柔粉棕', 'e5745b']] },
  { id: 'contour', name: '修容', a: 50,
    s: ['自然', '小 V 臉', '立體鼻', '全臉'],
    c: [['暖棕', '8c6450'], ['冷灰棕', '7a6a62']] },
  { id: 'glow', name: '高光', a: 50,
    s: ['自然', '高鼻梁', '水光', '全臉'],
    c: [['珍珠白', 'fff6ec'], ['粉光', 'ffe4ec'], ['香檳金', 'fff0d0']] },
  { id: 'lens', name: '美瞳', a: 70,
    s: ['自然', '大直徑'],
    c: [['棕', '7b4a2a'], ['淺灰', '9aa3a8'], ['藍灰', '6f87a0'], ['青灰', '6f9a96'], ['櫻花粉', 'c98a9a'], ['純黑', '1a1414']] },
  { id: 'silk', name: '臥蠶', a: 60, s: ['自然', '明顯', '可愛'] },
  { id: 'lid', name: '雙眼皮', a: 60, s: ['平行', '扇形', '新月'] },
  { id: 'mole', name: '痣', a: 80, s: ['淚痣', '美人痣', '雀斑', '滿臉雀斑'] },
  { id: 'catch', name: '眼神光', a: 80, s: ['圓點', '月牙', '雙點', '星光'] },
];
const BY_ID = Object.fromEntries(MAKEUP.map(m => [m.id, m]));

// 整套妝容：每類的 [款式, 顏色, 強度]
export const LOOKS = [
  { name: '裸妝', set: { lips: [0, 8, 45], blush: [0, 3, 35], brow: [0, 3, 40], lash: [0, 1, 40], glow: [0, 0, 40] } },
  { name: '元氣', set: { lips: [2, 5, 70], blush: [1, 0, 60], shadow: [0, 1, 45], lash: [2, 0, 60], catch: [0, 0, 70] } },
  { name: '韓系', set: { lips: [3, 1, 70], blush: [0, 1, 40], brow: [1, 3, 50], liner: [2, 1, 50], silk: [0, 0, 50], glow: [2, 0, 50] } },
  { name: '歐美', set: { lips: [1, 10, 80], contour: [3, 0, 60], glow: [1, 0, 50], liner: [1, 0, 70], lash: [1, 0, 70], brow: [2, 0, 60], shadow: [2, 0, 50] } },
  { name: '微醺', set: { blush: [2, 5, 60], lips: [4, 3, 70], shadow: [3, 2, 40], mole: [0, 0, 60], lash: [0, 0, 50] } },
  { name: '美拉德', set: { shadow: [1, 3, 60], lips: [1, 9, 70], blush: [4, 4, 50], contour: [0, 0, 40], brow: [0, 4, 40], liner: [0, 1, 50] } },
  { name: '少女粉', set: { lips: [2, 0, 65], blush: [5, 6, 50], shadow: [0, 8, 45], lash: [2, 0, 55], lens: [0, 4, 50], silk: [2, 0, 50], catch: [2, 0, 70] } },
  { name: '男生', set: { brow: [0, 1, 40], contour: [0, 1, 40], lips: [1, 8, 25], glow: [0, 0, 20] } },
];
// 疊的順序：底妝的光影先，再來顏色，最後線條
const ORDER = ['contour', 'glow', 'blush', 'shadow', 'silk', 'lid', 'liner', 'lash', 'brow', 'lips', 'lens', 'catch', 'mole'];

// ---------- 小工具 ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a, v, s = 1) => ({ x: a.x + v.x * s, y: a.y + v.y * s });
const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const mid = (pts, ids) => ids.reduce((s, i) => ({ x: s.x + pts[i].x / ids.length, y: s.y + pts[i].y / ids.length }), { x: 0, y: 0 });
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${a})`;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 折線依長度重新取 n 個點
function resample(line, n) {
  const seg = [0];
  for (let i = 1; i < line.length; i++) seg.push(seg[i - 1] + dist(line[i - 1], line[i]));
  const L = seg[seg.length - 1] || 1, out = [];
  for (let k = 0; k < n; k++) {
    const d = L * k / (n - 1);
    let i = 1; while (i < line.length - 1 && seg[i] < d) i++;
    out.push(lerp(line[i - 1], line[i], (d - seg[i - 1]) / Math.max(seg[i] - seg[i - 1], 1e-6)));
  }
  return out;
}
// 經過點的平滑曲線（中點二次曲線）
function smooth(ctx, p, closed) {
  const n = p.length;
  if (closed) {
    const m0 = lerp(p[n - 1], p[0], 0.5);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) { const m = lerp(p[i], p[(i + 1) % n], 0.5); ctx.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y); }
    ctx.closePath();
  } else {
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < n - 1; i++) { const m = lerp(p[i], p[i + 1], 0.5); ctx.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y); }
    ctx.lineTo(p[n - 1].x, p[n - 1].y);
  }
}

// 畫布支不支援 ctx.filter（舊版 Safari 不支援，改用陰影當模糊）
let FILTER_OK;
function filterOk(ctx) {
  if (FILTER_OK === undefined) { ctx.filter = 'blur(2px)'; FILTER_OK = ctx.filter === 'blur(2px)'; ctx.filter = 'none'; }
  return FILTER_OK;
}
// 羽化填色：path 只建路徑，填色時邊緣模糊 blur（照片像素）
function feather(ctx, d, blur, color, path, stroke) {
  const px = blur * d.k;
  ctx.save();
  if (px < 0.4) { /* 太小就不羽化 */ }
  else if (filterOk(ctx)) ctx.filter = `blur(${px.toFixed(2)}px)`;
  else { const off = 20000; ctx.shadowColor = color; ctx.shadowBlur = px * 2; ctx.shadowOffsetX = off; ctx.translate(-off / d.k, 0); }
  ctx.beginPath(); path(ctx);
  if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
  ctx.restore();
}
// 柔邊橢圓色塊（中間最濃，往外淡掉）
function blob(ctx, c, rx, ry, rot, hex, a) {
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(rot); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, rgba(hex, a)); g.addColorStop(0.35, rgba(hex, a * 0.8)); g.addColorStop(0.7, rgba(hex, a * 0.3)); g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 每張臉的座標系：W 臉寬、up 往額頭、right 往畫面右邊；兩隻眼睛的資料
function frame(pts) {
  const roll = Math.atan2(pts[263].y - pts[33].y, pts[263].x - pts[33].x);
  const right = { x: Math.cos(roll), y: Math.sin(roll) }, up = { x: Math.sin(roll), y: -Math.cos(roll) };
  const W = dist(pts[234], pts[454]);
  const eye = (UP, LO, BU, BL, iris) => {
    const up8 = UP.map(i => pts[i]), lo8 = LO.map(i => pts[i]);
    const w = dist(up8[0], up8[up8.length - 1]);
    const out = norm({ x: up8[0].x - up8[up8.length - 1].x, y: up8[0].y - up8[up8.length - 1].y }); // 往眼尾
    const ctr = mid(pts, [...UP, ...LO]);
    // 虹膜：MediaPipe 的 468、473 兩個虹膜中心，取離這隻眼睛比較近的那個
    let ic = null, ir = 0;
    if (pts.length >= 478) {
      const cand = [[468, [469, 470, 471, 472]], [473, [474, 475, 476, 477]]]
        .map(([c, rim]) => ({ c: pts[c], r: rim.reduce((s, i) => s + dist(pts[i], pts[c]), 0) / 4 }));
      const best = cand.sort((a, b) => dist(a.c, ctr) - dist(b.c, ctr))[0];
      if (dist(best.c, ctr) < w) { ic = best.c; ir = best.r; }
    }
    return {
      up: resample(up8, 16), lo: resample(lo8, 16), w, out, ctr, ic, ir: ir || w * 0.22,
      browUp: resample(BU.map(i => pts[i]), 16), browLo: resample(BL.map(i => pts[i]), 16),
      poly: [...up8, ...lo8.slice(1, -1).reverse()],
    };
  };
  const eyes = [eye(L_UP, L_LO, L_BROW_UP, L_BROW_LO), eye(R_UP, R_LO, R_BROW_UP, R_BROW_LO)];
  return { pts, W, up, right, roll, eyes, sideOf: p => Math.sign((p.x - pts[1].x) * right.x + (p.y - pts[1].y) * right.y) || 1 };
}

// ---------- 塑臉（立體光影） ----------
// 照 Hypic 修飾 › 塑臉：「強度」12 條（6 個區域各有亮、影），「顏色」4 條（區域提色，在 skin.js 做），
// 都是 0~100 預設 0。每一區用臉部特徵點畫一塊柔邊的亮或暗，交給彩妝層去疊（形狀自己畫，沒用 Hypic 的遮罩）
const icS = d => `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="9"/>${d}</svg>`;
const HL = 'fill="currentColor" opacity=".55" stroke="none"', SH = 'stroke-width="2" opacity=".45"';
export const SCULPT = [
  ['sc_nose', '鼻子', icS(`<rect x="11.3" y="8" width="1.4" height="6" rx=".7" ${HL}/>`), 0, 0],
  ['sc_fore', '額頭', icS(`<ellipse cx="12" cy="6.5" rx="3" ry="1.6" ${HL}/>`), 0, 0],
  ['sc_cheek', '臉頰', icS(`<ellipse cx="8" cy="12" rx="1.8" ry="1" ${HL}/><ellipse cx="16" cy="12" rx="1.8" ry="1" ${HL}/>`), 0, 0],
  ['sc_brow', '眉毛', icS(`<ellipse cx="8.5" cy="9" rx="1.6" ry=".7" ${HL}/><ellipse cx="15.5" cy="9" rx="1.6" ry=".7" ${HL}/>`), 0, 0],
  ['sc_chin', '下巴', icS(`<ellipse cx="12" cy="18.5" rx="1.6" ry="1" ${HL}/>`), 0, 0],
  ['sc_lip', '嘴唇', icS(`<ellipse cx="12" cy="15" rx="1.2" ry=".5" ${HL}/>`), 0, 0],
  ['sc_noseS', '鼻子陰影', icS(`<path d="M10.6 8v6M13.4 8v6" ${SH}/>`), 0, 0],
  ['sc_foreS', '額頭陰影', icS(`<path d="M6 7c3-3 9-3 12 0" ${SH}/>`), 0, 0],
  ['sc_cheekS', '臉頰陰影', icS(`<path d="M5.5 13.5l3.5 1.5M18.5 13.5L15 15" ${SH}/>`), 0, 0],
  ['sc_browS', '眉毛陰影', icS(`<path d="M9.5 9.5l1 1.5M14.5 9.5l-1 1.5" ${SH}/>`), 0, 0],
  ['sc_chinS', '下巴陰影', icS(`<path d="M5.5 15c1 3 3 5 6.5 6M18.5 15c-1 3-3 5-6.5 6" ${SH}/>`), 0, 0],
  ['sc_lipS', '嘴巴陰影', icS(`<path d="M10 17.2h4" ${SH}/>`), 0, 0],
];
export const SC_COLOR = [
  ['sc_eye', '亮眼', '<svg viewBox="0 0 24 24"><path d="M2 12s4-5 10-5 10 5 10 5-4 5-10 5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M13 10.8h.01"/></svg>', 0, 0],
  ['sc_eyeCol', '眼睛顏色', '<svg viewBox="0 0 24 24"><path d="M3 13s4-4 9-4 9 4 9 4"/><path d="M5 10c2-3 12-3 14 0" opacity=".5" stroke-width="2.5"/></svg>', 0, 0],
  ['sc_lipCol', '嘴巴顏色', '<svg viewBox="0 0 24 24"><path d="M4 12c3-3 5-3 8-1 3-2 5-2 8 1-3 4-13 4-16 0z" fill="currentColor" opacity=".45"/></svg>', 0, 0],
  ['sc_cheekCol', '臉頰', icS(`<ellipse cx="8" cy="13.5" rx="2" ry="1.3" ${HL}/><ellipse cx="16" cy="13.5" rx="2" ry="1.3" ${HL}/>`), 0, 0],
];
export const SC_P0 = Object.fromEntries([...SCULPT, ...SC_COLOR].map(x => [x[0], 0]));
const scOn = P => SCULPT.some(x => P[x[0]] > 0);
const SC_HI = 'fff6ec', SC_SH = '7e5a48';
function sculpt(ctx, f, P) {
  const p = f.pts, W = f.W, hi = SC_HI, sh = SC_SH;
  const ax = Math.atan2(p[4].y - p[6].y, p[4].x - p[6].x);
  const a = k => Math.min(1, (P[k] || 0) / 100) * 0.7;
  const B = (k, c, rx, ry, rot, hex, w = 1) => { if (P[k] > 0) blob(ctx, c, W * rx, W * ry, rot, hex, a(k) * w); };
  // 亮
  B('sc_nose', lerp(p[6], p[4], 0.45), 0.16, 0.026, ax, hi);
  B('sc_nose', p[4], 0.035, 0.028, ax, hi, 0.7);
  B('sc_fore', add(p[151], f.up, W * 0.02), 0.15, 0.08, f.roll, hi);
  B('sc_chin', lerp(p[152], p[17], 0.4), 0.065, 0.04, f.roll, hi);
  B('sc_lip', add(p[0], f.up, W * 0.02), 0.035, 0.012, f.roll, hi, 0.8);
  B('sc_lip', lerp(p[17], p[14], 0.45), 0.06, 0.018, f.roll, hi, 0.5);
  // 影
  B('sc_foreS', add(p[10], f.up, W * 0.01), 0.24, 0.05, f.roll, sh, 0.8);
  B('sc_lipS', add(p[17], f.up, -W * 0.035), 0.07, 0.022, f.roll, sh, 0.8);
  B('sc_chinS', add(p[152], f.up, -W * 0.07), 0.2, 0.06, f.roll, sh);
  for (const [i, sd] of [[0, -1], [1, 1]]) {
    const e = f.eyes[i];
    B('sc_brow', lerp(e.browLo[10], e.up[10], 0.3), 0.07, 0.022, f.roll, hi, 0.9);
    const [ue, apx] = i ? [p[346], p[280]] : [p[117], p[50]];
    B('sc_cheek', lerp(lerp(ue, apx, 0.4), p[195], 0.15), 0.09, 0.045, f.roll, hi);
    B('sc_noseS', add(lerp(p[6], p[4], 0.45), f.right, sd * W * 0.055), 0.17, 0.022, ax, sh, 0.8);
    const ear = i ? p[454] : p[234], mouth = i ? p[291] : p[61];
    B('sc_cheekS', add(lerp(ear, mouth, 0.3), f.up, -W * 0.04), 0.2, 0.05, Math.atan2(mouth.y - ear.y, mouth.x - ear.x), sh);
    const j1 = i ? p[397] : p[172], j2 = i ? p[365] : p[136];
    B('sc_chinS', j1, 0.15, 0.06, Math.atan2(j2.y - j1.y, j2.x - j1.x), sh, 0.8);
    B('sc_chinS', j2, 0.12, 0.05, Math.atan2(p[152].y - j2.y, p[152].x - j2.x), sh, 0.7);
    B('sc_browS', lerp(i ? p[336] : p[107], i ? p[362] : p[133], 0.5), 0.05, 0.035, f.roll, sh, 0.8);
    B('sc_foreS', i ? p[284] : p[54], 0.1, 0.08, f.roll, sh, 0.5);
  }
}

// 眼睛範圍（剪裁或挖掉用）
const eyePath = (e, grow = 1) => ctx => smooth(ctx, e.poly.map(p => lerp(e.ctr, p, grow)), true);
function clearEye(ctx, d, e, grow = 1, blur = 0.02) {
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  feather(ctx, d, e.w * blur, '#000', eyePath(e, grow));
  ctx.restore();
}

// ---------- 各類的畫法 ----------
const DRAW = {
  lips(ctx, d, f, s, hex) {
    const p = f.pts, outer = LIPS.map(i => p[i]), inner = INNER_LIPS.map(i => p[i]);
    const w = dist(p[61], p[291]), h = Math.max(dist(p[0], p[17]), w * 0.15);
    const c = lerp(p[13], p[14], 0.5);
    const grow = s === 4 ? 1.06 : 1;
    const outerG = outer.map(q => lerp(c, q, grow));
    const lipPath = ctx => smooth(ctx, outerG, true);
    if (s === 3 || s === 4) {
      // 咬唇、暈染：中間濃往外淡
      feather(ctx, d, h * 0.05, rgba(hex, s === 4 ? 0.3 : 0.1), lipPath);
      ctx.save(); ctx.beginPath(); lipPath(ctx); ctx.clip();
      blob(ctx, c, w * (s === 4 ? 0.42 : 0.26), h * (s === 4 ? 0.6 : 0.5), f.roll, hex, 1);
      if (s === 3) blob(ctx, c, w * 0.15, h * 0.3, f.roll, hex, 0.8);
      ctx.restore();
      if (s === 4) { ctx.save(); ctx.globalAlpha = 0.5; blob(ctx, c, w * 0.6, h * 0.7, f.roll, hex, 0.35); ctx.restore(); }
    } else {
      feather(ctx, d, h * (s === 1 ? 0.035 : 0.05), rgba(hex, s === 1 ? 0.95 : s === 5 ? 0.55 : 0.82), lipPath);
      if (s === 5) feather(ctx, d, h * 0.02, rgba(hex, 0.9), lipPath, h * 0.07);
    }
    // 嘴巴裡面（牙齒、舌頭）不上色
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    feather(ctx, d, h * 0.025, '#000', ctx2 => smooth(ctx2, inner, true));
    ctx.restore();
    if (s === 2) {
      // 水潤：下唇中間和上唇各一點亮光
      const lower = lerp(p[14], p[17], 0.45), upper = lerp(p[13], p[0], 0.55);
      blob(ctx, add(lower, f.right, -w * 0.06), w * 0.11, h * 0.07, f.roll, 'ffffff', 0.6);
      blob(ctx, add(upper, f.right, w * 0.1), w * 0.05, h * 0.035, f.roll, 'ffffff', 0.4);
    }
  },

  blush(ctx, d, f, s, hex) {
    const p = f.pts, W = f.W;
    for (const [ap, uy, tp, side] of [[lerp(p[205], p[50], 0.5), p[117], p[127], -1], [lerp(p[425], p[280], 0.5), p[346], p[356], 1]]) {
      const sd = f.sideOf(ap) || side;
      if (s === 0) blob(ctx, ap, W * 0.17, W * 0.12, f.roll, hex, 0.55);
      if (s === 1) blob(ctx, lerp(ap, uy, 0.55), W * 0.2, W * 0.085, f.roll, hex, 0.55);
      if (s === 2) blob(ctx, lerp(ap, uy, 0.35), W * 0.17, W * 0.1, f.roll, hex, 0.5);
      if (s === 3) blob(ctx, lerp(ap, uy, 0.3), W * 0.16, W * 0.09, f.roll, hex, 0.45);
      if (s === 4) blob(ctx, lerp(ap, tp, 0.38), W * 0.21, W * 0.075, f.roll - sd * 0.42, hex, 0.55);
      if (s === 5) blob(ctx, ap, W * 0.14, W * 0.13, f.roll, hex, 0.62);
    }
    // 微醺：鼻梁一條；曬傷：橫過鼻頭一大片
    if (s === 2) blob(ctx, lerp(p[195], p[5], 0.5), W * 0.2, W * 0.06, f.roll, hex, 0.35);
    if (s === 3) { blob(ctx, p[5], W * 0.42, W * 0.07, f.roll, hex, 0.35); blob(ctx, p[4], W * 0.07, W * 0.05, f.roll, hex, 0.35); }
  },

  shadow(ctx, d, f, s, hex) {
    for (const e of f.eyes) {
      const lidUp = e.up.map(q => add(q, f.up, e.w * 0.02));
      const band = (t, a, blur) => {
        const top = lidUp.map((q, i) => lerp(q, e.browLo[i], t));
        feather(ctx, d, e.w * blur, rgba(hex, a), ctx2 => smooth(ctx2, [...lidUp, ...top.reverse()], true));
      };
      if (s === 0) { band(0.6, 0.45, 0.12); band(0.3, 0.5, 0.07); }
      if (s === 1) {
        band(0.45, 0.35, 0.1);
        // 眼尾三角區加深
        const oc = lerp(lidUp[1], e.browLo[1], 0.18);
        blob(ctx, add(oc, e.out, e.w * 0.02), e.w * 0.26, e.w * 0.13, Math.atan2(e.out.y, e.out.x) - (e.out.x > 0 ? 0.35 : -0.35), hex, 0.7);
      }
      if (s === 2) {
        band(0.75, 0.4, 0.14); band(0.4, 0.45, 0.08);
        const low = e.lo.map(q => add(q, f.up, -e.w * 0.14));
        feather(ctx, d, e.w * 0.06, rgba(hex, 0.4), ctx2 => smooth(ctx2, [...e.lo, ...low.reverse()], true));
      }
      if (s === 3) {
        const prof = i => Math.sin(Math.PI * i / (e.lo.length - 1));
        const low = e.lo.map((q, i) => add(q, f.up, -e.w * (0.05 + 0.13 * prof(i))));
        feather(ctx, d, e.w * 0.06, rgba(hex, 0.6), ctx2 => smooth(ctx2, [...e.lo, ...low.reverse()], true));
        blob(ctx, add(e.lo[3], f.up, -e.w * 0.06), e.w * 0.18, e.w * 0.08, f.roll, hex, 0.35);
      }
      clearEye(ctx, d, e, 1.02);
    }
  },

  liner(ctx, d, f, s, hex) {
    for (const e of f.eyes) {
      const n = e.up.length, base = e.up.map(q => add(q, f.up, -e.w * 0.004));
      const th = t => { // t：0 = 眼尾、1 = 眼頭
        if (s === 3) return e.w * (0.03 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
        return e.w * (0.02 + (s === 4 ? 0.1 : 0.075) * Math.pow(1 - t, 1.4));
      };
      const top = base.map((q, i) => add(q, f.up, th(i / (n - 1))));
      const wing = { 1: [0.32, 0.17], 2: [0.24, -0.07], 4: [0.48, 0.24] }[s];
      const pts = [...base];
      if (wing) {
        const tip = add(add(base[0], e.out, e.w * wing[0]), f.up, e.w * wing[1]);
        pts.unshift(tip);
      } else pts.unshift(add(base[0], e.out, e.w * 0.04));
      feather(ctx, d, e.w * 0.012, rgba(hex, 0.92), ctx2 => smooth(ctx2, [...pts, ...top.slice().reverse()], true));
      if (s === 4) {
        // 小野貓：下眼尾也畫一段
        const lo = e.lo.slice(0, 6).map(q => add(q, f.up, -e.w * 0.004));
        feather(ctx, d, e.w * 0.012, rgba(hex, 0.8), ctx2 => smooth(ctx2, lo, false), e.w * 0.03);
      }
      clearEye(ctx, d, e, 0.99, 0.006);
    }
  },

  lash(ctx, d, f, s, hex) {
    const r = rng(7);
    // 一根睫毛：根部粗、尾端尖，往眼尾那側掃再往上翹
    const hair = (q, dir, L, w) => {
      const side = { x: -dir.y, y: dir.x }, tip = add(q, dir, L);
      const ctl = add(add(q, dir, L * 0.55), side, L * 0.1 * Math.sign(side.x * dir.x + side.y * dir.y || 1));
      ctx.beginPath();
      ctx.moveTo(q.x - side.x * w / 2, q.y - side.y * w / 2);
      ctx.quadraticCurveTo(ctl.x, ctl.y, tip.x, tip.y);
      ctx.quadraticCurveTo(ctl.x + side.x * w * 0.3, ctl.y + side.y * w * 0.3, q.x + side.x * w / 2, q.y + side.y * w / 2);
      ctx.closePath(); ctx.fill();
    };
    for (const e of f.eyes) {
      const n = e.up.length;
      const count = { 0: 26, 1: 44, 2: 34, 3: 30, 4: 0 }[s];
      const lenK = { 0: 0.2, 1: 0.24, 2: 0.32, 3: 0.27, 4: 0 }[s];
      const wid = e.w * (s === 1 ? 0.022 : 0.016);
      ctx.fillStyle = rgba(hex, 0.9);
      // 眼尾那側往外掃：用眼睛的往外方向和往上方向組合
      const dirAt = t => norm(add(f.up, e.out, 1.5 * (0.6 - t)));
      for (let k = 0; k < count; k++) {
        const t = 0.03 + 0.94 * (k + r() * 0.6) / count; // 0 = 眼尾
        const i = t * (n - 1), q = lerp(e.up[Math.floor(i)], e.up[Math.min(n - 1, Math.floor(i) + 1)], i % 1);
        const prof = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.1)); // 眼尾中段最長、眼頭最短
        const L = e.w * lenK * prof * (0.75 + r() * 0.5);
        let dir = dirAt(t);
        dir = norm(add(dir, { x: -dir.y, y: dir.x }, (r() - 0.5) * 0.25));
        if (s === 3) { // 根根分明：三根一束往同一點收
          const g = Math.floor(k / 3) * 3 + 1, tg = 0.03 + 0.94 * (g + 0.3) / count;
          const gi = tg * (n - 1), gq = lerp(e.up[Math.floor(gi)], e.up[Math.min(n - 1, Math.floor(gi) + 1)], gi % 1);
          const tip = add(gq, dirAt(tg), L * 1.1);
          dir = norm({ x: tip.x - q.x, y: tip.y - q.y });
          hair(q, dir, Math.hypot(tip.x - q.x, tip.y - q.y), wid); continue;
        }
        hair(q, dir, L, wid * (0.8 + r() * 0.4));
      }
      if (s === 1 || s === 2) feather(ctx, d, e.w * 0.008, rgba(hex, 0.8), ctx2 => smooth(ctx2, e.up, false), e.w * 0.025);
      if (s === 2 || s === 4) { // 下睫毛：短、稀疏、長短不一，往下往眼尾斜
        const m = e.lo.length, N = s === 4 ? 16 : 12;
        ctx.fillStyle = rgba(hex, 0.7);
        for (let k = 0; k < N; k++) {
          const t = 0.06 + 0.7 * (k + r() * 0.7) / N, i = t * (m - 1);
          const q = lerp(e.lo[Math.floor(i)], e.lo[Math.min(m - 1, Math.floor(i) + 1)], i % 1);
          const dir = norm(add({ x: -f.up.x, y: -f.up.y }, e.out, 0.9 * (0.75 - t) + (r() - 0.5) * 0.3));
          hair(q, dir, e.w * (0.05 + 0.06 * (1 - t)) * (0.6 + r() * 0.7), e.w * 0.011);
        }
      }
    }
  },

  brow(ctx, d, f, s, hex) {
    const r = rng(11);
    for (const e of f.eyes) {
      const n = e.browUp.length;
      // 眉毛中線和粗細（i：0 = 眉尾、n-1 = 眉頭）
      let C = e.browUp.map((q, i) => lerp(q, e.browLo[i], 0.5));
      let T = e.browUp.map((q, i) => dist(q, e.browLo[i]));
      const avgT = T.reduce((a, b) => a + b) / n;
      if (s === 1) { // 平眉：把眉峰壓平，粗細平均
        C = C.map((q, i) => lerp(q, lerp(C[0], C[n - 1], i / (n - 1)), 0.55));
        C = C.map(q => add(q, f.up, avgT * 0.05));
        T = T.map((t, i) => avgT * (i < 3 ? 0.75 + 0.08 * i : 1.05));
      }
      if (s === 2) { // 挑眉：眉峰往上提，眉尾變細
        C = C.map((q, i) => add(q, f.up, avgT * 0.45 * Math.exp(-Math.pow((i / (n - 1) - 0.33) / 0.16, 2))));
        T = T.map((t, i) => t * (0.7 + 0.3 * i / (n - 1)));
      }
      if (s === 3) T = T.map((t, i) => t * 0.65 * Math.sin(Math.PI * (0.1 + 0.85 * i / (n - 1))));
      // 眉尾收尖
      T = T.map((t, i) => t * Math.min(1, 0.35 + i / 3));
      const nrm = i => { const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], v = norm({ x: b.x - a.x, y: b.y - a.y }); const nv = { x: -v.y, y: v.x }; return (nv.x * f.up.x + nv.y * f.up.y) > 0 ? nv : { x: -nv.x, y: -nv.y }; };
      const top = C.map((q, i) => add(q, nrm(i), T[i] / 2)), bot = C.map((q, i) => add(q, nrm(i), -T[i] / 2));
      feather(ctx, d, avgT * 0.22, rgba(hex, s === 4 ? 0.28 : 0.5), ctx2 => smooth(ctx2, [...top, ...bot.reverse()], true));
      // 一根根的眉毛：從眉頭往眉尾斜，眉頭比較直立
      const hairs = s === 4 ? 70 : 34;
      ctx.strokeStyle = rgba(hex, s === 4 ? 0.65 : 0.38); ctx.lineCap = 'round'; ctx.lineWidth = avgT * 0.07;
      for (let k = 0; k < hairs; k++) {
        const t = r(), i = Math.min(n - 2, Math.floor(t * (n - 1))), q0 = C[i], q1 = C[i + 1];
        const q = add(lerp(q0, q1, r()), nrm(i), (r() - 0.5) * T[i] * 0.9);
        const along = norm({ x: q0.x - q1.x, y: q0.y - q1.y }); // 往眉尾
        const head = i / (n - 1); // 1 = 眉頭
        const dir = norm(add(along, nrm(i), 0.25 + 1.2 * Math.max(0, head - 0.6)));
        const L = avgT * (s === 4 ? 0.55 : 0.45) * (0.7 + r() * 0.6);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + dir.x * L, q.y + dir.y * L); ctx.stroke();
      }
    }
  },

  contour(ctx, d, f, s, hex) {
    const p = f.pts, W = f.W;
    for (const [ear, mouth, jaw1, jaw2, temple] of [[p[234], p[61], p[172], p[136], p[54]], [p[454], p[291], p[397], p[365], p[284]]]) {
      // 顴骨下的陰影：耳朵往嘴角的方向
      const c = add(lerp(ear, mouth, 0.3), f.up, -W * 0.04), ang = Math.atan2(mouth.y - ear.y, mouth.x - ear.x);
      if (s !== 2) blob(ctx, c, W * 0.2, W * 0.05, ang, hex, s === 0 ? 0.55 : 0.65);
      if (s === 1 || s === 3) {
        blob(ctx, jaw1, W * 0.15, W * 0.06, Math.atan2(jaw2.y - jaw1.y, jaw2.x - jaw1.x), hex, 0.65);
        blob(ctx, jaw2, W * 0.12, W * 0.05, Math.atan2(p[152].y - jaw2.y, p[152].x - jaw2.x), hex, 0.6);
      }
      if (s === 3) blob(ctx, temple, W * 0.12, W * 0.1, f.roll, hex, 0.4);
    }
    if (s === 2 || s === 3) { // 鼻子兩側
      const ax = Math.atan2(p[4].y - p[6].y, p[4].x - p[6].x);
      for (const sd of [-1, 1]) blob(ctx, add(lerp(p[6], p[4], 0.45), f.right, sd * W * 0.055), W * 0.17, W * 0.022, ax, hex, 0.55);
    }
  },

  glow(ctx, d, f, s, hex) {
    const p = f.pts, W = f.W, ax = Math.atan2(p[4].y - p[6].y, p[4].x - p[6].x);
    const k = { 0: [0.45, 0.4, 0.3, 0.25], 1: [0.7, 0.25, 0.2, 0.2], 2: [0.3, 0.65, 0.15, 0.3], 3: [0.6, 0.55, 0.4, 0.4] }[s];
    blob(ctx, lerp(p[6], p[4], 0.45), W * 0.15, W * 0.025, ax, hex, k[0]);
    if (s === 1) blob(ctx, p[4], W * 0.04, W * 0.03, ax, hex, 0.5);
    for (const [ue, ap] of [[p[117], p[50]], [p[346], p[280]]]) blob(ctx, lerp(lerp(ue, ap, 0.4), p[195], 0.2), W * 0.08, W * 0.04, f.roll, hex, k[1]);
    blob(ctx, p[151], W * 0.13, W * 0.07, f.roll, hex, k[2]);
    blob(ctx, lerp(p[152], p[17], 0.4), W * 0.06, W * 0.035, f.roll, hex, k[3]);
    if (s === 3) blob(ctx, add(p[0], f.up, W * 0.02), W * 0.035, W * 0.012, f.roll, hex, 0.45);
  },

  lens(ctx, d, f, s, hex) {
    for (const e of f.eyes) {
      if (!e.ic) continue;
      const R = e.ir * (s === 1 ? 1.12 : 1.0);
      ctx.save(); ctx.beginPath(); eyePath(e, 0.98)(ctx); ctx.clip();
      const g = ctx.createRadialGradient(e.ic.x, e.ic.y, 0, e.ic.x, e.ic.y, R * 1.12);
      g.addColorStop(0, rgba(hex, 0)); g.addColorStop(0.3, rgba(hex, 0)); g.addColorStop(0.45, rgba(hex, 0.7));
      g.addColorStop(0.8, rgba(hex, 0.85)); g.addColorStop(0.86, rgba(hex, 0.95));
      g.addColorStop(0.92, 'rgba(25,18,18,0.75)'); g.addColorStop(1, 'rgba(25,18,18,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.ic.x, e.ic.y, R * 1.12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },

  silk(ctx, d, f, s) {
    for (const e of f.eyes) {
      const m = e.lo.length, depth = e.w * [0.13, 0.15, 0.18][s];
      const prof = i => Math.pow(Math.sin(Math.PI * i / (m - 1)), 0.7);
      const top = e.lo.map(q => add(q, f.up, -e.w * 0.02));
      const low = e.lo.map((q, i) => add(q, f.up, -e.w * 0.02 - depth * prof(i)));
      feather(ctx, d, e.w * 0.045, `rgba(255,242,232,${[0.22, 0.32, 0.36][s]})`, ctx2 => smooth(ctx2, [...top, ...low.slice().reverse()], true));
      // 下緣一條淡淡的陰影，讓它看起來鼓起來
      feather(ctx, d, e.w * 0.03, `rgba(120,80,70,${[0.22, 0.35, 0.28][s]})`, ctx2 => smooth(ctx2, low.slice(2, m - 2), false), e.w * 0.035);
    }
  },

  lid(ctx, d, f, s) {
    for (const e of f.eyes) {
      const n = e.up.length;
      const off = i => { const t = i / (n - 1); // 0 = 眼尾
        return e.w * (s === 0 ? 0.09 : s === 1 ? 0.03 + 0.08 * (1 - t) : 0.05 + 0.06 * Math.sin(Math.PI * t)); };
      const crease = e.up.map((q, i) => add(q, f.up, off(i)));
      feather(ctx, d, e.w * 0.05, 'rgba(130,90,75,0.12)', ctx2 => smooth(ctx2, [...e.up, ...crease.slice().reverse()], true));
      feather(ctx, d, e.w * 0.01, 'rgba(95,65,55,0.55)', ctx2 => smooth(ctx2, crease.slice(1, n - 1), false), e.w * 0.014);
      feather(ctx, d, e.w * 0.012, 'rgba(255,245,238,0.22)', ctx2 => smooth(ctx2, crease.slice(2, n - 2).map(q => add(q, f.up, e.w * 0.025)), false), e.w * 0.02);
      clearEye(ctx, d, e, 1.0, 0.006);
    }
  },

  mole(ctx, d, f, s) {
    const p = f.pts, W = f.W;
    const dot = (c, r, a) => feather(ctx, d, r * 0.35, `rgba(70,42,34,${a})`, ctx2 => ctx2.arc(c.x, c.y, r, 0, Math.PI * 2));
    if (s === 0) { const e = f.eyes[1]; dot(add(add(e.lo[2], f.up, -e.w * 0.22), e.out, e.w * 0.02), W * 0.009, 0.85); }
    if (s === 1) dot(add(add(p[291], f.up, W * 0.07), f.right, W * 0.035), W * 0.009, 0.85);
    if (s >= 2) {
      const r = rng(23), N = s === 2 ? 45 : 110, cx = s === 2 ? p[195] : lerp(p[195], p[5], 0.5);
      for (let k = 0; k < N; k++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r());
        const q = add(add(cx, f.right, Math.cos(a) * rr * W * (s === 2 ? 0.3 : 0.4)), f.up, Math.sin(a) * rr * W * (s === 2 ? 0.09 : 0.16));
        dot(q, W * (0.003 + r() * 0.004), 0.25 + r() * 0.35);
      }
    }
  },

  catch(ctx, d, f, s) {
    for (const e of f.eyes) {
      if (!e.ic) continue;
      const R = e.ir;
      ctx.save(); ctx.beginPath(); eyePath(e, 0.97)(ctx); ctx.clip();
      const c = add(add(e.ic, f.up, R * 0.38), f.right, -R * 0.35);
      const white = a => `rgba(255,255,255,${a})`;
      if (s === 0 || s === 2) feather(ctx, d, R * 0.06, white(0.95), ctx2 => ctx2.arc(c.x, c.y, R * 0.19, 0, Math.PI * 2));
      if (s === 2) { const c2 = add(add(e.ic, f.up, -R * 0.4), f.right, R * 0.35); feather(ctx, d, R * 0.04, white(0.8), ctx2 => ctx2.arc(c2.x, c2.y, R * 0.09, 0, Math.PI * 2)); }
      if (s === 1) feather(ctx, d, R * 0.05, white(0.9), ctx2 => ctx2.arc(e.ic.x, e.ic.y, R * 0.62, f.roll + Math.PI * 1.1, f.roll + Math.PI * 1.65), R * 0.12);
      if (s === 3) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(f.roll);
        feather(ctx, d, R * 0.02, white(0.95), ctx2 => {
          const a = R * 0.3, b = R * 0.06;
          ctx2.moveTo(0, -a); ctx2.lineTo(b, -b); ctx2.lineTo(a, 0); ctx2.lineTo(b, b); ctx2.lineTo(0, a); ctx2.lineTo(-b, b); ctx2.lineTo(-a, 0); ctx2.lineTo(-b, -b); ctx2.closePath();
        });
        ctx.restore();
      }
      ctx.restore();
    }
  },
};

// ---------- 合成 ----------
// 每張照片一組快取：每一類（款式 + 顏色）各畫一張圖層，強度改變時只要重新疊
const cache = new WeakMap();
let serial = 0;
const MAX = 1600;

export const hasMakeup = mk => !!mk && Object.values(mk).some(v => v && v.a > 0);
// 塑臉的值直接放在 P（sc_ 開頭），跟彩妝畫在同一層

// 回傳 { key, canvas }；key 沒變代表不用重新上傳
export function makeupLayer(base, mk, P = {}) {
  const sc = scOn(P);
  if (!base?.faces?.length || (!hasMakeup(mk) && !sc)) return { key: '', canvas: null };
  mk ||= {};
  let c = cache.get(base);
  if (!c) { c = { id: ++serial, layers: new Map(), faces: null }; cache.set(base, c); }
  if (c.faces !== base.faces) { c.faces = base.faces; c.layers.clear(); c.frames = base.faces.map(frame); }
  const key = c.id + '|' + JSON.stringify(ORDER.map(k => mk[k] && mk[k].a > 0 ? [k, mk[k].s, mk[k].c, mk[k].a] : 0)) + (sc ? '|' + SCULPT.map(x => P[x[0]] || 0).join(',') : '');
  if (c.key === key) return { key, canvas: c.out };
  const W = base.canvas.width, H = base.canvas.height, k = Math.min(1, MAX / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const used = new Set();
  // 每次都用新的畫布：重複上傳同一張畫布時，有的瀏覽器會沿用舊的內容
  const out = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const octx = out.getContext('2d');
  for (const id of ORDER) {
    const v = mk[id];
    if (!v || !(v.a > 0)) continue;
    const def = BY_ID[id], hex = def.c ? def.c[Math.min(v.c || 0, def.c.length - 1)][1] : 'ffffff';
    const lk = `${id}|${v.s}|${hex}`;
    used.add(lk);
    let layer = c.layers.get(lk);
    if (!layer) {
      layer = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = layer.getContext('2d');
      ctx.scale(k, k);
      const d = { k };
      for (const f of c.frames) DRAW[id](ctx, d, f, v.s, hex);
      c.layers.set(lk, layer);
    }
    octx.globalAlpha = Math.min(1, v.a / 100);
    octx.drawImage(layer, 0, 0);
  }
  octx.globalAlpha = 1;
  if (sc) { octx.save(); octx.scale(k, k); for (const f of c.frames) sculpt(octx, f, P); octx.restore(); }
  for (const lk of c.layers.keys()) if (!used.has(lk)) c.layers.delete(lk); // 沒在用的圖層丟掉，省記憶體
  c.out = out; c.key = key;
  return { key, canvas: out };
}

// ---------- 面板 ----------
let cat = 'look';
const CSS = `
.mk{flex:1 0 100%;min-width:0;display:flex;flex-direction:column;gap:8px}
.mk .row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0}
.mk .row::-webkit-scrollbar{display:none}
.mk .row.sw2{gap:10px;padding:2px 4px 4px;align-items:center}
.mk .it.wide .ic{height:36px;font-size:14px}
.mk .lk .ic{font-size:12px;line-height:1.15;text-align:center;padding:2px}
.mk .sty .ic{font-size:12px}
@media (min-width:900px){.mk .row{flex-wrap:wrap;overflow:visible}}
`;
function injectCss() {
  if (document.getElementById('mk-css')) return;
  const s = document.createElement('style'); s.id = 'mk-css'; s.textContent = CSS; document.head.append(s);
}
const OFF = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>';

// api：{ P(), setP(p), base(), item, setSlider, hideSlider, render, commit, refresh, note, findFaces }
export function makeupTab(box, api) {
  injectCss();
  const P = api.P(), base = api.base();
  const faces = base.faces;
  if (!faces) { api.note('正在找臉…'); api.findFaces(); }
  else if (!faces.length) api.note(base.faceErr ? '臉部偵測模型載入失敗，檢查一下網路再換一次照片。' : '這張照片沒找到臉，美妝只對人臉有效。');
  else api.note(`找到 ${faces.length} 張臉，每張臉都會上妝`);
  const mk = P.mk || {};
  const wrap = document.createElement('div'); wrap.className = 'mk';
  const row = cls => { const r = document.createElement('div'); r.className = 'row ' + (cls || ''); wrap.append(r); return r; };

  // 第一排：分類
  const r1 = row();
  const setOf = id => id === 'look' ? P.mkLook >= 0 : !!(mk[id] && mk[id].a > 0);
  [{ id: 'look', name: '套裝' }, ...MAKEUP].forEach(m => r1.append(api.item({
    label: m.name, icon: m.name, cls: 'wide', on: cat === m.id, set: setOf(m.id), onclick: () => { cat = m.id; api.refresh(); },
  })));

  const put = (id, val) => { const p = api.P(); p.mk = { ...(p.mk || {}), [id]: val }; p.mkLook = -1; };
  if (cat === 'look') {
    const r2 = row();
    r2.append(api.item({ label: '卸妝', icon: OFF, on: !hasMakeup(mk), onclick: () => {
      const p = api.P(); p.mk = {}; p.mkLook = -1; api.render(); api.commit(); api.refresh();
    } }));
    LOOKS.forEach((L, i) => r2.append(api.item({
      label: L.name, icon: L.name.slice(0, 2), cls: 'lk', on: P.mkLook === i, onclick: () => {
        const p = api.P();
        if (p.mkLook === i) { p.mk = {}; p.mkLook = -1; }
        else { p.mk = Object.fromEntries(Object.entries(L.set).map(([k, [s, c, a]]) => [k, { s, c, a }])); p.mkLook = i; p.mkLookAmt = 100; }
        api.render(); api.commit(); api.refresh();
      },
    })));
    if (P.mkLook >= 0) {
      const L = LOOKS[P.mkLook];
      api.setSlider('強度', 0, 100, P.mkLookAmt ?? 100, v => {
        const p = api.P(); p.mkLookAmt = v;
        p.mk = Object.fromEntries(Object.entries(L.set).map(([k, [s, c, a]]) => [k, { s, c, a: Math.round(a * v / 100) }]));
        api.render();
      });
    } else api.hideSlider();
  } else {
    const def = BY_ID[cat], cur = mk[cat];
    const r2 = row();
    r2.append(api.item({ label: '無', icon: OFF, on: !cur || !(cur.a > 0), onclick: () => {
      const p = api.P(); const m = { ...(p.mk || {}) }; delete m[cat]; p.mk = m; p.mkLook = -1; api.render(); api.commit(); api.refresh();
    } }));
    def.s.forEach((name, i) => r2.append(api.item({
      label: name, icon: name.length > 3 ? name.slice(0, 2) : name, cls: 'sty', on: cur && cur.a > 0 && cur.s === i, onclick: () => {
        put(cat, { s: i, c: cur?.c ?? 0, a: cur && cur.a > 0 ? cur.a : def.a });
        api.render(); api.commit(); api.refresh();
      },
    })));
    if (def.c) {
      const r3 = row('sw2');
      def.c.forEach(([name, hex], i) => {
        const b = document.createElement('button');
        b.className = 'sw' + (cur && cur.a > 0 && (cur.c ?? 0) === i ? ' on' : '');
        b.style.background = '#' + hex; b.title = name; b.setAttribute('aria-label', name);
        b.onclick = () => { put(cat, { s: cur?.s ?? 0, c: i, a: cur && cur.a > 0 ? cur.a : def.a }); api.render(); api.commit(); api.refresh(); };
        r3.append(b);
      });
    }
    if (cur && cur.a > 0) api.setSlider('強度', 0, 100, cur.a, v => { put(cat, { ...cur, a: v }); api.render(); });
    else api.hideSlider();
  }
  box.append(wrap);
}
