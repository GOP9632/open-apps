// 臉型：照醒圖「臉型」面板的分類和滑桿（鼻子、面部、臉型、眼睛、嘴巴、3D 塑顏、眉毛、比例）
//
// 做法是自己寫的：每個滑桿換成幾個「局部變形」（推移、縮放、旋轉），
// 中心和大小都用 MediaPipe 臉部特徵點算，單位是臉寬，所以大臉小臉、歪頭都一樣。
// 所有變形加起來是一個位移場，交給 warpfield.js 用網格在 GPU 上算出每個像素要取哪裡。
//
// 跟醒圖一樣的規則（研究醒圖程式得到的行為，數值是自己調的）：
//   - 雙向滑桿 -100~100，單向 0~100；滑桿值線性換成強度
//   - 單雙向和點開時的預設以 Hypic 的資源資料為準（瘦臉單向預設 50、M 唇單向 80、對稱 100）
//   - 同一項「兩邊」和「左／右」互斥：調左邊會清掉兩邊的值，反過來也一樣
//   - 臉型風格（經典、幼態…）、鼻型、唇型、眉型各自只能選一個
//   - 左右指畫面的左右（跟美顏分頁一樣）

const S = 'fs_';
export const shapeKey = (id, side) => S + id + (side && side !== 'both' ? '_' + side : '');

// [id, 名稱, 最小值, 點開時的預設值, 可分左右, 互斥群組]
export const SHAPE_CATS = [
  { id: 'nose', name: '鼻子', items: [
    ['nose_root', '山根', -100], ['nose_lift', '提升', -100], ['nose_bridge', '鼻梁', -100],
    ['nose_wing', '鼻翼', -100, 0, 1], ['nose_size', '大小', -100],
    ['nose_natural', '媽生鼻', 0, 50, 0, 'nosep'], ['nose_pug', '小翹鼻', 0, 50, 0, 'nosep'], ['nose_camel', '駝峰鼻', 0, 50, 0, 'nosep'],
  ] },
  { id: 'face', name: '面部', items: [
    ['face_thin', '瘦臉', 0, 50, 1], ['face_width', '窄臉', -100, 0, 1], ['small_face', '小臉', 0],
    ['vface', 'V 臉', 0, 0, 1], ['jaw_len', '下巴長短', -100], ['pointy_chin', '尖下巴', -100, 0, 1],
    ['underjaw', '下顎', -100, 0, 1], ['cheekbone', '顴骨', -100, 0, 1], ['temple', '太陽穴', -100, 0, 1],
    ['hairline', '髮際線', -100], ['head_wrap', '頭包臉', 0, 50], ['small_head', '小頭', 0],
    ['jawline', '下顎線', 0], ['smooth_face', '流暢臉', 0], ['double_chin', '去雙下巴', 0], ['symmetry', '臉部對稱', 0, 100],
  ] },
  { id: 'style', name: '臉型', items: [
    ['st_classic', '經典', 0, 60, 0, 'style'], ['st_young', '幼態', 0, 50, 0, 'style'], ['st_boy', '少年感', 0, 60, 0, 'style'],
    ['st_light', '淡顏', 0, 50, 0, 'style'], ['st_hero', '英氣', 0, 50, 0, 'style'],
  ] },
  { id: 'eye', name: '眼睛', items: [
    ['eye_size', '大小', -100, 0, 1], ['eye_width', '眼寬', -100, 0, 1], ['eye_height', '眼高', -100, 0, 1],
    ['eye_pos', '位置', -100, 0, 1], ['eye_dist', '眼距', -100, 0, 1], ['eye_lower', '下眼瞼', -100, 0, 1],
    ['pupil', '瞳孔大小', -100, 0, 1], ['eye_inner', '內眼角', -100, 0, 1], ['eye_outer', '外眼角', -100, 0, 1],
    ['eye_tail', '眼尾上揚', -100, 0, 1], ['eye_tilt', '傾斜', -100], ['eye_rot_l', '左眼旋轉', -100], ['eye_rot_r', '右眼旋轉', -100],
  ] },
  { id: 'mouth', name: '嘴巴', items: [
    ['mouth_size', '大小', -100], ['mouth_width', '寬度', -100], ['mouth_pos', '位置', -100],
    ['smile_mgr', '笑容管理', -100], ['mouth_tilt', '傾斜', -100], ['smile', '微笑', 0],
    ['lip_m', 'M 唇', 0, 80], ['lip_upper', '豐上唇', -100], ['lip_lower', '豐下唇', -100], ['lip_3d', '立體唇', 0, 40],
    ['lip_petal', '花瓣唇', 0, 30, 0, 'lipp'], ['lip_pout', '嘟嘟唇', 0, 30, 0, 'lipp'], ['lip_west', '歐美唇', 0, 30, 0, 'lipp'],
    ['lip_full', '豐唇', 0, 40], ['lip_pillow', '枕頭唇', 0, 80, 0, 'lipp'],
  ] },
  // 豐臉、拉皮照 Hypic 修飾第二層：都是 0~100，點開的預設照 Hypic 的資源資料
  { id: 'fill', name: '豐臉', items: [
    ['fill_fore', '額頭', 0, 60], ['fill_cheek', '臉頰', 0, 70], ['fill_fold', '法令紋', 0, 80], ['fill_chin', '下巴', 0, 70],
    ['fill_bag', '眼袋', 0, 70], ['fill_mouth', '嘴角', 0, 50], ['fill_nose', '鼻子', 0, 40],
  ] },
  { id: 'lift', name: '拉皮', items: [
    ['lift_fore', '額頭', 0, 100], ['lift_mouth', '嘴角', 0, 70], ['lift_contour', '輪廓', 0, 70], ['lift_cheek', '臉頰', 0, 70], ['lift_eye', '眼周', 0, 70],
  ] },
  { id: 'd3', name: '3D 塑顏', items: [
    ['d3_roll', '旋轉', -100], ['d3_yaw', '左右', -100], ['d3_pitch', '上下', -100],
  ] },
  { id: 'brow', name: '眉毛', items: [
    ['brow_thick', '粗細', -100, 0, 1], ['brow_pos', '位置', -100, 0, 1], ['brow_tilt', '傾斜', -100, 0, 1],
    ['brow_peak', '眉峰', -100, 0, 1], ['brow_dist', '間距', -100, 0, 1], ['brow_len', '長短', -100, 0, 1],
    ['brow_euro', '歐式眉', 0, 20, 0, 'browp'], ['brow_willow', '柳葉眉', 0, 30, 0, 'browp'],
    ['brow_std', '標準眉', 0, 50, 0, 'browp'], ['brow_sword', '劍眉', 0, 30, 0, 'browp'],
  ] },
  { id: 'ratio', name: '比例', items: [
    ['r_upper', '上庭', -100], ['r_crania', '顱頂', -100], ['r_mid', '中庭', -100], ['r_lower', '下庭', -100], ['r_eyes', '眼間距', -100],
  ] },
].map(c => ({ ...c, items: c.items.map(([id, name, min, def = 0, sided = 0, group = '']) => ({ id, name, min, def, sided: !!sided, group })) }));

export const SHAPE_ITEMS = SHAPE_CATS.flatMap(c => c.items);
const byId = Object.fromEntries(SHAPE_ITEMS.map(it => [it.id, it]));

// 設定一個滑桿，照醒圖的互斥規則清掉衝突的值
export function setShape(P, id, side, v) {
  const it = byId[id];
  if (it.sided) {
    if (side === 'both') { P[shapeKey(id, 'L')] = 0; P[shapeKey(id, 'R')] = 0; }
    else P[shapeKey(id)] = 0;
  }
  if (it.group && v) SHAPE_ITEMS.forEach(o => { if (o.group === it.group && o.id !== id) P[shapeKey(o.id)] = 0; });
  P[shapeKey(id, side)] = v;
}
export const getShape = (P, id, side) => P[shapeKey(id, side)] || 0;
export const shapeIsSet = (P, id) => !!(getShape(P, id) || getShape(P, id, 'L') || getShape(P, id, 'R'));
export const shapeActive = P => Object.keys(P).some(k => k.startsWith(S) && P[k]);
export function resetShape(P, cat) {
  const ids = new Set((cat ? SHAPE_CATS.find(c => c.id === cat).items : SHAPE_ITEMS).map(it => it.id));
  Object.keys(P).forEach(k => { if (k.startsWith(S) && ids.has(k.slice(S.length).replace(/_[LR]$/, ''))) delete P[k]; });
}

// ---------- 特徵點 ----------
// MediaPipe 臉部網格的點號；L = 畫面左邊那一側
const EYE = {
  L: { ring: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], outer: 33, inner: 133, top: 159, bot: 145, iris: [468, 469, 470, 471, 472] },
  R: { ring: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], outer: 263, inner: 362, top: 386, bot: 374, iris: [473, 474, 475, 476, 477] },
};
const BROW = {
  L: { up: [70, 63, 105, 66, 107], lo: [46, 53, 52, 65, 55] },
  R: { up: [300, 293, 334, 296, 336], lo: [276, 283, 282, 295, 285] },
};
const CONTOUR = {
  temple: { L: [127, 162], R: [356, 389] },
  cheekbone: { L: [234, 93], R: [454, 323] },
  cheek: { L: [132, 58], R: [361, 288] },
  jaw: { L: [172, 136], R: [397, 365] },
  chin: { L: [150, 149, 176, 148], R: [379, 378, 400, 377] },
};
// 從左耳經下巴到右耳的下半臉輪廓
const LOWER = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356];
const HAIRLINE = [10, 109, 67, 103, 338, 297, 332];
// 左右成對的點（臉部對稱用）和中線上的點
const PAIRS = [[338, 109], [297, 67], [332, 103], [284, 54], [251, 21], [389, 162], [356, 127], [454, 234], [323, 93], [361, 132],
  [288, 58], [397, 172], [365, 136], [379, 150], [378, 149], [400, 176], [377, 148],
  [263, 33], [362, 133], [386, 159], [374, 145], [387, 160], [385, 158], [373, 144], [380, 153], [466, 246], [388, 161], [249, 7], [390, 163],
  [300, 70], [293, 63], [334, 105], [296, 66], [336, 107], [276, 46], [283, 53], [282, 52], [295, 65], [285, 55],
  [358, 129], [294, 64], [327, 98], [278, 48], [419, 196], [417, 193],
  [291, 61], [267, 37], [269, 39], [270, 40], [409, 185], [314, 84], [405, 181], [321, 91], [375, 146],
  [473, 468]];
const MID = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 2, 0, 13, 14, 17, 18, 200, 199, 175, 152];

const avg = (pts, ids) => { let x = 0, y = 0; ids.forEach(i => { x += pts[i].x; y += pts[i].y; }); return { x: x / ids.length, y: y / ids.length }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 一張臉的座標系：ex 沿著兩眼連線（往畫面右），ey 垂直往下巴，單位長度 = 臉寬
function frame(pts) {
  const W = dist(pts[234], pts[454]);
  const roll = Math.atan2(pts[263].y - pts[33].y, pts[263].x - pts[33].x);
  const ex = { x: Math.cos(roll), y: Math.sin(roll) }, ey = { x: -ex.y, y: ex.x };
  const mid = avg(pts, [234, 454]);
  const yaw = Math.max(-0.9, Math.min(0.9, ((pts[1].x - mid.x) * ex.x + (pts[1].y - mid.y) * ex.y) / (W / 2)));
  return { W, roll, ex, ey, yaw };
}

// ---------- 局部變形 ----------
// 每項是往前的位移：原圖的點 x 會被移到 x + D(x)
//   t 0 推移：D = d·f
//   t 1 縮放：D = f·(sx·u·ex + sy·v·ey)，u、v 是相對中心、沿著臉的座標
//   t 2 旋轉：D = (旋轉 θ·f − 1)(x − c)
// f = (1 − t²)²，t 是到中心的橢圓距離（垂直方向乘上 asp）
function builder(pts, F) {
  const out = [], cs = Math.cos(F.roll), sn = Math.sin(F.roll);
  const add = m => out.push({ ...m, cos: cs, sin: sn });
  const W = F.W;
  const vec = (u, v) => ({ x: (F.ex.x * u + F.ey.x * v) * W, y: (F.ex.y * u + F.ey.y * v) * W });
  const P = i => typeof i === 'number' ? pts[i] : i;
  const push = (c, u, v, r, asp = 1) => { if (!u && !v) return; const d = vec(u, v); c = P(c); add({ t: 0, cx: c.x, cy: c.y, a: d.x, b: d.y, r: r * W, asp }); };
  const pushTo = (c, to, amt, r, asp = 1) => {
    if (!amt) return;
    c = P(c); to = P(to);
    const l = dist(c, to) || 1;
    add({ t: 0, cx: c.x, cy: c.y, a: (to.x - c.x) / l * amt * W, b: (to.y - c.y) / l * amt * W, r: r * W, asp });
  };
  const scale = (c, sx, sy, r, asp = 1) => { if (!sx && !sy) return; c = P(c); add({ t: 1, cx: c.x, cy: c.y, a: sx, b: sy, r: r * W, asp }); };
  const rot = (c, deg, r, asp = 1) => { if (!deg) return; c = P(c); add({ t: 2, cx: c.x, cy: c.y, a: deg * Math.PI / 180, b: 0, r: r * W, asp }); };
  // 往臉外側（outward = +1）或內側：畫面左邊那側的外側是 −ex
  const outU = s => s === 'L' ? -1 : 1;
  return { out, push, pushTo, scale, rot, outU, W, vec };
}

// 把所有臉、所有滑桿換成變形清單
//   moves：局部變形；pins：個別特徵點要移動的量（臉部對稱、流暢臉用，會再擴散開）
export function shapeMoves(faces, P) {
  const moves = [], pins = [];
  if (!shapeActive(P)) return { moves, pins };
  for (const pts of faces) {
    if (!pts || pts.length < 468) continue;
    const F = frame(pts);
    const B = builder(pts, F);
    const g = (id, side) => {
      // 這一側的值：左右分開調的值，沒有就用兩邊的值
      if (side && byId[id].sided) { const s = getShape(P, id, side); if (s) return s / 100; }
      return getShape(P, id) / 100;
    };
    faceMoves(pts, F, B, g, pins);
    moves.push(...B.out);
  }
  return { moves, pins };
}

function faceMoves(pts, F, B, g, pins) {
  const { push, pushTo, scale, rot, outU, W } = B;
  const sides = ['L', 'R'];
  const mid = avg(pts, [168, 6, 197, 195, 5, 4]);
  const midline = { x: mid.x, y: mid.y };
  const v = id => g(id);

  // 臉型風格、鼻型、唇型、眉型 = 幾個基本滑桿的組合
  const styles = {
    st_classic: { face_thin: 0.3, vface: 0.3, small_face: 0.25, pointy_chin: 0.2 },
    st_young: { underjaw: 0.35, jaw_len: -0.35, eye_size: 0.25, hairline: -0.15, r_mid: -0.3, nose_size: -0.2, cheekbone: -0.15 },
    st_boy: { face_thin: 0.2, cheekbone: 0.15, underjaw: -0.1, jaw_len: 0.15, brow_thick: 0.2, brow_tilt: 0.2, eye_height: -0.15 },
    st_light: { nose_size: -0.25, mouth_size: -0.15, nose_wing: -0.2, face_width: 0.15, brow_thick: -0.15 },
    st_hero: { brow_tilt: 0.35, brow_thick: 0.25, pointy_chin: 0.15, cheekbone: -0.1, face_thin: 0.15, eye_tail: 0.25 },
    nose_natural: { nose_wing: -0.4, nose_bridge: -0.3, nose_root: 0.3 },
    nose_pug: { nose_lift: 0.35, nose_size: -0.15, nose_tip: 0.5 },
    nose_camel: { nose_root: 0.5, nose_bridge: -0.4, nose_lift: -0.15, nose_tip: -0.3 },
    lip_petal: { lip_m: 0.5, lip_upper: 0.4, smile: 0.25 },
    lip_pout: { mouth_width: -0.3, lip_upper: 0.5, lip_lower: 0.6 },
    lip_west: { lip_upper: 0.7, lip_lower: 0.6, mouth_width: 0.15 },
    lip_3d: { lip_upper: 0.3, lip_lower: 0.4 },
    // 豐臉：凹下去的地方補亮在 skin.js；這裡是形狀的部分（下巴往前長一點、嘴角微微上揚、鼻梁變挺）
    fill_chin: { jaw_len: 0.12, pointy_chin: 0.08 },
    fill_mouth: { smile: 0.12 },
    fill_nose: { nose_bridge: -0.2, nose_root: 0.3, nose_lift: 0.08 },
    fill_cheek: { cheekbone: -0.06 },
    // 拉皮：往上提（額頭的細紋在 skin.js 一起淡化）
    lift_fore: { brow_pos: 0.12, hairline: 0.04 },
    lift_mouth: { smile_mgr: 0.25, smile: 0.08 },
    lift_contour: { jawline: 0.5, double_chin: 0.35, underjaw: -0.12 },
    lift_cheek: { face_thin: 0.1 },
    lift_eye: { eye_tail: 0.18, brow_pos: 0.05 },
    // 豐唇：上下唇一起變厚；枕頭唇：下唇比上唇厚、嘴角往內收，中間嘟起來像小枕頭
    lip_full: { lip_upper: 0.5, lip_lower: 0.5, mouth_width: 0.05 },
    lip_pillow: { lip_upper: 0.35, lip_lower: 0.6, mouth_width: -0.15, lip_m: -0.2 },
    brow_euro: { brow_peak: 0.6, brow_tilt: 0.3, brow_len: 0.1 },
    brow_willow: { brow_thick: -0.4, brow_len: 0.3, brow_peak: 0.2 },
    brow_std: { brow_thick: 0.1, brow_tilt: 0.1, brow_peak: 0.1 },
    brow_sword: { brow_tilt: 0.55, brow_thick: 0.25, brow_peak: -0.25 },
  };
  const extra = {};
  for (const [sid, mix] of Object.entries(styles)) {
    const a = v(sid);
    if (a) for (const [k, w] of Object.entries(mix)) extra[k] = (extra[k] || 0) + a * w;
  }
  // 基本滑桿的值 = 自己的值 + 風格帶進來的量
  const A = (id, side) => (byId[id] ? g(id, side) : 0) + (extra[id] || 0);

  // ---- 面部輪廓 ----
  for (const s of sides) {
    const o = outU(s);
    // 瘦臉：兩頰到下顎往臉中線推
    const thin = A('face_thin', s);
    if (thin) [[CONTOUR.cheekbone[s][1], 0.7], [CONTOUR.cheek[s][0], 0.9], [CONTOUR.cheek[s][1], 1], [CONTOUR.jaw[s][0], 0.9], [CONTOUR.jaw[s][1], 0.7]]
      .forEach(([i, w]) => pushTo(i, midline, 0.055 * thin * w, 0.24));
    // 窄臉：從太陽穴到下顎整條往內水平推
    const wid = A('face_width', s);
    if (wid) [...CONTOUR.temple[s], ...CONTOUR.cheekbone[s], ...CONTOUR.cheek[s], CONTOUR.jaw[s][0]].forEach(i => push(i, -o * 0.03 * wid, 0, 0.3));
    // 太陽穴：往外補（正值飽滿）
    const tp = A('temple', s);
    if (tp) CONTOUR.temple[s].forEach(i => push(i, o * 0.022 * tp, 0, 0.17));
    // 顴骨：往內收（正值收顴骨）
    const cb = A('cheekbone', s);
    if (cb) CONTOUR.cheekbone[s].forEach(i => push(i, -o * 0.03 * cb, 0, 0.2));
    // 下顎：下顎角往內收
    const uj = A('underjaw', s);
    if (uj) [...CONTOUR.jaw[s], CONTOUR.cheek[s][1]].forEach(i => push(i, -o * 0.035 * uj, -0.01 * uj, 0.2));
    // V 臉：下巴兩側往下巴尖收
    const vf = A('vface', s);
    if (vf) { CONTOUR.chin[s].forEach(i => pushTo(i, 152, 0.03 * vf, 0.15)); CONTOUR.jaw[s].forEach(i => pushTo(i, midline, 0.025 * vf, 0.18)); }
    // 尖下巴：下巴兩側往中間收，下巴尖稍微往下
    const pc = A('pointy_chin', s);
    if (pc) { CONTOUR.chin[s].forEach(i => push(i, -o * 0.028 * pc, 0.008 * pc, 0.12)); push(152, 0, 0.008 * pc, 0.1); }
  }
  // 拉皮・臉頰：兩頰往上提（法令紋附近的肉往顴骨收）
  const lc = A('lift_cheek');
  if (lc) for (const s of sides) [...CONTOUR.cheek[s], ...CONTOUR.jaw[s].slice(0, 1)].forEach(i => push(i, 0, -0.022 * lc, 0.2));
  // 下巴長短
  const jl = A('jaw_len');
  if (jl) [[152, 1], [148, 0.75], [377, 0.75], [176, 0.45], [400, 0.45]].forEach(([i, w]) => push(i, 0, 0.045 * jl * w, 0.2));
  // 小臉：以鼻尖附近為中心整張臉縮小
  const sf = A('small_face');
  if (sf) scale(avg(pts, [4, 152]), -0.09 * sf, -0.09 * sf, 0.75, 0.8);
  // 頭包臉：下半臉輪廓往臉中心收，額頭和頭髮不動
  const hw = A('head_wrap');
  if (hw) LOWER.slice(2, -2).forEach(i => pushTo(i, pts[1], 0.022 * hw, 0.2));
  // 小頭：整顆頭（含頭髮）縮小，中心在臉中心偏上
  const sh = A('small_head');
  if (sh) { const c = avg(pts, [10, 152]); const cc = { x: c.x - F.ey.x * W * 0.15, y: c.y - F.ey.y * W * 0.15 }; scale(cc, -0.12 * sh, -0.12 * sh, 1.25, 0.85); }
  // 髮際線：正值往下（額頭變小）
  const hl = A('hairline');
  if (hl) { const c = avg(pts, HAIRLINE); push({ x: c.x - F.ey.x * W * 0.05, y: c.y - F.ey.y * W * 0.05 }, 0, 0.04 * hl, 0.3, 1.2); }
  // 下顎線：下顎角和下巴兩側稍微往內收緊，線條更俐落
  const jw = A('jawline');
  if (jw) for (const s of sides) [...CONTOUR.jaw[s], ...CONTOUR.chin[s].slice(0, 2)].forEach(i => push(i, -outU(s) * 0.015 * jw, -0.008 * jw, 0.12));
  // 去雙下巴：下巴下方往上收
  const dc = A('double_chin');
  if (dc) push({ x: pts[152].x + F.ey.x * W * 0.14, y: pts[152].y + F.ey.y * W * 0.14 }, 0, -0.045 * dc, 0.2, 1.4);
  // 流暢臉：每個輪廓點往前後兩點的中間移，凹凸變平順
  const sm = A('smooth_face');
  if (sm) for (let k = 2; k < LOWER.length - 2; k++) {
    const p = pts[LOWER[k]], a = avg(pts, [LOWER[k - 2], LOWER[k - 1], LOWER[k + 1], LOWER[k + 2]]);
    pins.push({ x: p.x, y: p.y, dx: (a.x - p.x) * sm * 0.8, dy: (a.y - p.y) * sm * 0.8, r: W * 0.07 });
  }
  // 臉部對稱：左右成對的點各自往「自己和另一邊鏡射位置的中點」移，中線上的點移到中線；轉頭的照片減弱
  const sy = A('symmetry') * Math.max(0, 1 - Math.abs(F.yaw) * 2.5);
  if (sy > 0.01) {
    const c = avg(pts, MID), ex = F.ex;
    const mirror = p => { const u = (p.x - c.x) * ex.x + (p.y - c.y) * ex.y; return { x: p.x - 2 * u * ex.x, y: p.y - 2 * u * ex.y }; };
    const pin = (i, t) => pins.push({ x: pts[i].x, y: pts[i].y, dx: (t.x - pts[i].x) * sy, dy: (t.y - pts[i].y) * sy, r: W * 0.06 });
    for (const [a, b] of PAIRS) {
      if (!pts[a] || !pts[b]) continue;
      const ma = mirror(pts[b]), mb = mirror(pts[a]);
      pin(a, { x: (pts[a].x + ma.x) / 2, y: (pts[a].y + ma.y) / 2 });
      pin(b, { x: (pts[b].x + mb.x) / 2, y: (pts[b].y + mb.y) / 2 });
    }
    MID.forEach(i => { const m = mirror(pts[i]); pin(i, { x: (pts[i].x + m.x) / 2, y: (pts[i].y + m.y) / 2 }); });
  }

  // ---- 眼睛 ----
  for (const s of sides) {
    const E = EYE[s], o = outU(s);
    const c = avg(pts, E.ring), ew = dist(pts[E.outer], pts[E.inner]) / W;
    const sz = A('eye_size', s);
    if (sz) scale(c, 0.26 * sz, 0.26 * sz, 1.25 * ew, 1.25);
    const ewd = A('eye_width', s);
    if (ewd) scale(c, 0.22 * ewd, 0, 1.2 * ew, 1.3);
    const eh = A('eye_height', s);
    if (eh) scale(c, 0, 0.32 * eh, 1.2 * ew, 1.3);
    const ep = A('eye_pos', s);
    if (ep) push(c, 0, -0.025 * ep, 1.15 * ew, 1.2);
    const ed = A('eye_dist', s) + A('r_eyes');
    if (ed) push(c, o * 0.022 * ed, 0, 1.15 * ew, 1.2);
    const lo = A('eye_lower', s);
    if (lo) push(E.bot, 0, 0.06 * ew * lo, 0.55 * ew, 1.3);
    const pu = A('pupil', s);
    if (pu && pts[E.iris[0]]) {
      const ic = pts[E.iris[0]], ir = dist(pts[E.iris[1]], pts[E.iris[3]]) / 2 / W || ew * 0.2;
      scale(ic, 0.32 * pu, 0.32 * pu, ir * 1.7);
    }
    const ic2 = A('eye_inner', s);
    if (ic2) push(E.inner, -o * 0.09 * ew * ic2, 0, 0.38 * ew);
    const oc = A('eye_outer', s);
    if (oc) push(E.outer, o * 0.09 * ew * oc, 0, 0.38 * ew);
    const tl = A('eye_tail', s);
    if (tl) push(E.outer, 0, -0.08 * ew * tl, 0.45 * ew);
    // 傾斜：外眼角往上（正值），兩眼對稱
    const rt = A('eye_tilt') + (s === 'L' ? A('eye_rot_l') : A('eye_rot_r'));
    if (rt) rot(c, (s === 'L' ? 1 : -1) * 7 * rt, 1.2 * ew, 1.3);
  }

  // ---- 眉毛 ----
  for (const s of sides) {
    const Br = BROW[s], o = outU(s);
    const ids = [...Br.up, ...Br.lo], c = avg(pts, ids);
    const outer = avg(pts, [Br.up[0], Br.lo[0]]), inner = avg(pts, [Br.up[4], Br.lo[4]]);
    const bw = dist(outer, inner) / W;
    const th = A('brow_thick', s);
    if (th) scale(c, 0, 0.4 * th, 0.7 * bw, 2.4);
    const bp = A('brow_pos', s);
    if (bp) push(c, 0, -0.022 * bp, 0.7 * bw, 2);
    const bt = A('brow_tilt', s);
    if (bt) rot(c, (s === 'L' ? 1 : -1) * 6 * bt, 0.7 * bw, 2);
    const pk = A('brow_peak', s);
    if (pk) push(avg(pts, [Br.up[1], Br.up[2], Br.lo[1], Br.lo[2]]), 0, -0.016 * pk, 0.32 * bw, 1.2);
    const bd = A('brow_dist', s);
    if (bd) push(c, o * 0.02 * bd, 0, 0.7 * bw, 2);
    const bl = A('brow_len', s);
    if (bl) pushTo(outer, { x: 2 * outer.x - inner.x, y: 2 * outer.y - inner.y }, 0.03 * bl, 0.3 * bw, 1.5);
  }

  // ---- 鼻子 ----
  const nw = dist(pts[64], pts[294]) / W;
  const nc = avg(pts, [4, 2, 64, 294]);
  const ns = A('nose_size');
  if (ns) scale(nc, 0.2 * ns, 0.2 * ns, 0.95 * nw, 0.9);
  for (const s of sides) {
    const o = outU(s);
    const wg = A('nose_wing', s);
    if (wg) (s === 'L' ? [64, 129] : [294, 358]).forEach(i => push(i, o * 0.05 * nw * wg, 0, 0.32 * nw));
  }
  const br = A('nose_bridge');
  if (br) for (const s of sides) (s === 'L' ? [196, 3] : [419, 248]).forEach(i => push(i, outU(s) * 0.04 * nw * br, 0, 0.3 * nw, 0.7));
  const rt = A('nose_root');
  if (rt) for (const s of sides) (s === 'L' ? [193, 122] : [417, 351]).forEach(i => push(i, -outU(s) * 0.045 * nw * rt, 0, 0.3 * nw, 0.8));
  const nl = A('nose_lift');
  if (nl) push(avg(pts, [4, 2]), 0, -0.025 * nl, 0.85 * nw, 1.1);
  const tip = A('nose_tip');
  if (tip) push(4, 0, -0.015 * tip, 0.35 * nw);

  // ---- 嘴巴 ----
  const mc = avg(pts, [13, 14, 61, 291]), mw = dist(pts[61], pts[291]) / W;
  const ms = A('mouth_size');
  if (ms) scale(mc, 0.2 * ms, 0.2 * ms, 0.85 * mw, 1.6);
  const mwd = A('mouth_width');
  if (mwd) scale(mc, 0.18 * mwd, 0, 0.85 * mw, 1.6);
  const mp = A('mouth_pos');
  if (mp) push(mc, 0, -0.025 * mp, 0.9 * mw, 1.4);
  const smg = A('smile_mgr'), smi = A('smile');
  for (const s of sides) {
    const i = s === 'L' ? 61 : 291;
    if (smg) push(i, 0, -0.06 * mw * smg, 0.3 * mw);
    if (smi) push(i, outU(s) * 0.02 * mw * smi, -0.07 * mw * smi, 0.32 * mw);
  }
  const mt = A('mouth_tilt');
  if (mt) rot(mc, 6 * mt, 0.85 * mw, 1.5);
  const lm = A('lip_m');
  if (lm) { push(0, 0, 0.035 * mw * lm, 0.16 * mw); [37, 267].forEach(i => push(i, 0, -0.025 * mw * lm, 0.14 * mw)); }
  const lu = A('lip_upper');
  if (lu) push(avg(pts, [0, 37, 267]), 0, -0.045 * mw * lu, 0.5 * mw, 2.2);
  const ll = A('lip_lower');
  if (ll) push(avg(pts, [17, 84, 314]), 0, 0.05 * mw * ll, 0.5 * mw, 2.2);

  // ---- 3D 塑顏：沒有真的 3D 模型，用平面變形模擬轉頭、抬頭 ----
  const d3r = A('d3_roll');
  if (d3r) rot(avg(pts, [10, 152]), 8 * d3r, 0.95, 0.85);
  const d3y = A('d3_yaw');
  if (d3y) { push(pts[4], 0.06 * d3y, 0, 0.55, 0.8); push(avg(pts, [13, 14]), 0.035 * d3y, 0, 0.4); push(pts[4], 0.02 * d3y, 0, 0.18); }
  const d3p = A('d3_pitch');
  if (d3p) { push(pts[4], 0, -0.045 * d3p, 0.55, 0.9); push(pts[4], 0, -0.015 * d3p, 0.18); }

  // ---- 比例 ----
  const ru = A('r_upper');
  if (ru) { const c = avg(pts, HAIRLINE); push(c, 0, -0.045 * ru, 0.32, 1.2); }
  const rc = A('r_crania');
  if (rc) push({ x: pts[10].x - F.ey.x * W * 0.3, y: pts[10].y - F.ey.y * W * 0.3 }, 0, -0.06 * rc, 0.5, 1.3);
  const rm = A('r_mid');
  if (rm) push(avg(pts, [0, 17]), 0, 0.04 * rm, 0.55);
  const rl = A('r_lower');
  if (rl) push({ x: pts[152].x + F.ey.x * W * 0.05, y: pts[152].y + F.ey.y * W * 0.05 }, 0, 0.05 * rl, 0.42);
}

// ---------- 位移場 ----------
// 在 (x, y) 算總位移，moves 先依範圍排除，pins 用加權平均擴散（越靠近點越接近它要移的量）
export function evalField(moves, pins, x, y, out) {
  let dx = 0, dy = 0;
  for (const m of moves) {
    const rx = x - m.cx, ry = y - m.cy;
    if (rx > m.r || rx < -m.r || ry > m.r || ry < -m.r) continue;
    const cs = m.cos, sn = m.sin;
    const u = rx * cs + ry * sn, v = -rx * sn + ry * cs;
    const t2 = (u * u + v * v * m.asp * m.asp) / (m.r * m.r);
    if (t2 >= 1) continue;
    const f = (1 - t2) * (1 - t2);
    if (m.t === 0) { dx += m.a * f; dy += m.b * f; }
    else if (m.t === 1) { const du = m.a * u * f, dv = m.b * v * f; dx += du * cs - dv * sn; dy += du * sn + dv * cs; }
    else { const th = m.a * f, c = Math.cos(th), s = Math.sin(th); dx += rx * c - ry * s - rx; dy += rx * s + ry * c - ry; }
  }
  if (pins.length) {
    let sx = 0, sy = 0, sw = 0;
    for (const p of pins) {
      const qx = x - p.x, qy = y - p.y;
      if (qx > p.r * 2 || qx < -p.r * 2 || qy > p.r * 2 || qy < -p.r * 2) continue;
      const w = Math.exp(-(qx * qx + qy * qy) / (p.r * p.r));
      sx += p.dx * w; sy += p.dy * w; sw += w;
    }
    if (sw > 0) { const k = 1 / Math.max(1, sw); dx += sx * k; dy += sy * k; }
  }
  out[0] = dx; out[1] = dy;
}

// 每張臉要算細網格的範圍（含頭髮和脖子），臉寬
export function faceBoxes(faces) {
  return faces.filter(p => p && p.length >= 468).map(p => {
    const F = frame(p), c = avg(p, [10, 152]);
    return { cx: c.x, cy: c.y, half: F.W * 1.6, cell: F.W / 60 };
  });
}
