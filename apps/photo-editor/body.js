// 身體塑形：一鍵美體、瘦身、長腿、瘦腿、瘦腰、瘦手臂、豐胸、美胯、寬肩、直角肩、天鵝頸、小頭
//   研究醒圖的做法：本機、不用去背也不補背景，靠人體關節點沿著骨架線（肩到髖、髖到膝…）把兩側往中間收；
//   每一項要先看得到需要的關節才能用；一張照片只處理一個人。
//   這裡自己重寫：MediaPipe 人體姿勢找關節，人像分割量出身體實際寬度，
//   再用主管線的局部變形（骨架收窄、腿部拉長、推移、縮放）在 GPU 上一次算完。
import { faceGeom, runTask } from './ai.js';

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

// [key, 名稱, 圖示, 最小, 點開時的強度, 最大]
// 前 9 項的順序、範圍、預設照 Hypic 自動塑身（美胯 -100~100，其他 0~100；只有瘦身點開是 40）；
// 一鍵美體、寬肩、直角肩是醒圖電腦版的，範圍照醒圖
export const BODY = [
  ['bodyHead', '小頭', '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><circle cx="12" cy="7" r="2" stroke-dasharray="1.5 1.5"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/></svg>', 0, 0, 100],
  ['bodySlim', '瘦身', '<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2"/><path d="M9 8h6l-1 7h-4zM10.5 15l-.5 6M13.5 15l.5 6"/><path d="M4 12h3M20 12h-3"/></svg>', 0, 40, 100],
  ['bodyLeg', '長腿', '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 7h-4z"/><path d="M10 10l-1 11M14 10l1 11"/><path d="M19 13v8M17.5 19.5L19 21l1.5-1.5"/></svg>', 0, 0, 100],
  ['bodyThigh', '瘦腿', '<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 8-1 10M9 11l1 10M8 3l1 8"/><path d="M4 12h2.5M20 12h-2.5"/></svg>', 0, 0, 100],
  ['bodyWaist', '瘦腰', '<svg viewBox="0 0 24 24"><path d="M7 3c0 5 3 6 3 9s-3 4-3 9M17 3c0 5-3 6-3 9s3 4 3 9"/><path d="M4 12h3M20 12h-3"/></svg>', 0, 0, 100],
  ['bodyBreast', '豐胸', '<svg viewBox="0 0 24 24"><path d="M5 4v4M19 4v4"/><path d="M5 8c0 4 3 6 7 6s7-2 7-6"/><circle cx="8.5" cy="11" r="1"/><circle cx="15.5" cy="11" r="1"/></svg>', 0, 0, 100],
  ['bodyHip', '美胯', '<svg viewBox="0 0 24 24"><path d="M8 3c0 4-3 6-3 10 0 3 2 4 3 8M16 3c0 4 3 6 3 10 0 3-2 4-3 8"/><path d="M2 13h2M22 13h-2"/></svg>', -100, 0, 100],
  ['bodyArm', '瘦手臂', '<svg viewBox="0 0 24 24"><path d="M5 5c3 0 5 2 7 5l5 7"/><path d="M7 9c2 0 3 1 4 3l4 6"/><path d="M3 15l2-1M18 9l-1 2"/></svg>', 0, 0, 100],
  ['bodyNeck', '天鵝頸', '<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2.5"/><path d="M11 7v6M13 7v6M5 17c2-3 4-4 6-4h2c2 0 4 1 6 4"/></svg>', 0, 0, 100],
  ['bodyAuto', '一鍵美體', '<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2"/><path d="M8 9h8l-1 6h-6zM10 15l-1 6M14 15l1 6"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z" fill="currentColor"/></svg>', 0, 30, 100],
  ['bodyShoulder', '寬肩', '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5"/><path d="M4 12c1-3 4-4 8-4s7 1 8 4"/><path d="M2 9l2 2M22 9l-2 2"/></svg>', -50, 20, 50],
  ['bodySquare', '直角肩', '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5"/><path d="M10 9H4v6M14 9h6v6"/></svg>', 0, 40, 100],
];
// 手動塑身（照 Hypic，順序也照它）：增高（兩條橫線之間拉長）、瘦身（兩條腰身弧線之間往中軸收）、重塑（圓裡面放大縮小），都是 −100~100
export const BODY_MAN = [
  ['bmHeight', '增高', '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 17h18" stroke-dasharray="2 2"/><path d="M12 9v6M10 11l2-2 2 2M10 13l2 2 2-2"/></svg>', -100, 0, 100],
  ['bmSlim', '瘦身', '<svg viewBox="0 0 24 24"><path d="M7 4q2.5 8 0 16M17 4q-2.5 8 0 16"/><path d="M12 5v14" stroke-dasharray="2 2"/></svg>', -100, 0, 100],
  ['bmZoom', '重塑', '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>', -100, 0, 100],
];
// 範圍（null 是還沒動過，用預設的位置）。位置是照片的比例（0~1），長度是照片寬的比例（轉了也一樣長）：
//   增高 { y0, y1 }；瘦身 { cx, cy, hw, hh, a }（中心、半寬、半高、轉幾度，弧度）；重塑 { cx, cy, r }
const MAN_REG = { bmRegH: null, bmRegS: null, bmRegZ: null };
export const BODY_P0 = { ...Object.fromEntries([...BODY, ...BODY_MAN].map(b => [b[0], 0])), ...MAN_REG };
export const REG_OF = { bmHeight: 'bmRegH', bmSlim: 'bmRegS', bmZoom: 'bmRegZ' };
// 預設照 Hypic（兩張照片量的，plans/修圖/瘦身與手動塑身.md）：增高兩條線固定在照片高的 0.75、0.90；
// 重塑的圓在照片中間偏上（0.5, 0.49），半徑是照片高的 9.2%；瘦身框高（中心到上下端）是照片高的 7.8%、不斜，
// 找得到人就放在腰上（肩到髖 0.655 那列、左右照那列身體的實際範圍置中），弧線在腰寬的 1.62 倍（Hypic 全身照的框）；
// 找不到人跟 Hypic 一樣放照片中間、寬高一樣。
// 以前的草稿存的是方框 { x0, x1, y0, y1 }，換成現在的樣子
export function manualRegion(key, body, p, W, H) {
  const r = p[REG_OF[key]];
  if (key === 'bmHeight') {
    if (r) return { y0: r.y0, y1: r.y1 };
  } else if (r && r.x0 != null) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, hw = (r.x1 - r.x0) / 2;
    return key === 'bmSlim' ? { cx, cy, hw, hh: (r.y1 - r.y0) / 2 * H / W, a: 0 } : { cx, cy, r: hw };
  } else if (r) return r;
  if (key === 'bmHeight') return { y0: 0.75, y1: 0.9 };
  if (key === 'bmZoom') return { cx: 0.5, cy: 0.49, r: 0.092 * H / W };
  const hh = 0.078 * H / W, ok = body?.ok && body.vis[LS] && body.vis[RS] && body.vis[LH] && body.vis[RH] && body.slimC;
  if (!ok) return { cx: 0.5, cy: 0.49, hw: hh, hh, a: 0 };
  const c = body.slimC;
  return { cx: c.x / W, cy: c.y / H, hw: Math.min(0.45, Math.max(hh * 0.6, body.waistHW * 1.62 / W)), hh, a: 0 };
}
// 手動塑身的變形（W、H 是照片的像素大小）。強度照 Hypic 截圖量的（半身、全身兩張照片光流擬合取中間，見 plans/修圖/瘦身與手動塑身.md）
export function manualWarps(body, p, W, H) {
  const out = [];
  const h = (p.bmHeight || 0) / 100, sl = (p.bmSlim || 0) / 100, z = (p.bmZoom || 0) / 100;
  if (h) {
    // 兩條線之間整段一樣拉長（往左縮短）。Hypic 拉到底多出照片高的 4.8%，不管框多大（兩張照片量的：框佔 15%、26% 都是），
    // 框越小拉得越多（最多拉成兩倍、壓成一半）。跟 Hypic 一樣照片跟著變高，框下面整段往下移、不壓（評審 M47）。
    // ext：照片多出來幾列；拉的時候畫面上先這樣畫，離開增高才真的改照片（app.js bmBake）
    // 線和多出來的列數都取整數：畫面上看到的跟真的拉長的照片一模一樣
    const r = manualRegion('bmHeight', body, p, W, H), y0 = Math.round(Math.min(r.y0, r.y1) * H), y1 = Math.round(Math.max(r.y0, r.y1) * H), L = Math.max(y1 - y0, 1);
    const ext = Math.round(Math.max(-0.5 * L, Math.min(L, 0.048 * H * h)));
    if (y1 - y0 > 4 && ext) { out.push({ type: 'band', y0, y1, s: ext / L, H, Ho: H + ext }); out.ext = ext; }
  }
  if (sl) {
    // 兩條弧線之間往中軸收（往左撐開）：影響範圍比弧線寬一點、比上下兩端長一成
    const r = manualRegion('bmSlim', body, p, W, H);
    out.push({ type: 'slim', cx: r.cx * W, cy: r.cy * H, a: r.a || 0, R: r.hw * W * (sl > 0 ? 1.15 : 1.35), Hh: r.hh * W * 1.13, k: (sl > 0 ? 0.3 : 0.234) * sl });
  }
  if (z) {
    const r = manualRegion('bmZoom', body, p, W, H);
    out.push({ type: 'scale', cx: r.cx * W, cy: r.cy * H, r: r.r * W * (z > 0 ? 1.165 : 1.124), s: (z > 0 ? 0.225 : 0.193) * z, ey: 1, rot: 0 });
  }
  return out;
}
export const bodyOn = p => BODY.some(b => p[b[0]]);

// MediaPipe 人體 33 點裡會用到的
const NOSE = 0, LS = 11, RS = 12, LE = 13, RE = 14, LW = 15, RW = 16, LH = 23, RH = 24, LK = 25, RK = 26, LA = 27, RA = 28;

// 每一項需要看得到哪些關節（跟醒圖一樣：缺了就不能用）
const NEED = {
  bodyAuto: [[LS, RS]],
  bodySlim: [[LS, RS, LH, RH]],
  bodyLeg: [[LH, RH, LK, RK]],
  bodyThigh: [[LH, LK], [RH, RK]],
  bodyWaist: [[LS, RS, LH, RH]],
  bodyArm: [[LS, LE], [RS, RE]],
  bodyBreast: [[LS, RS]],
  bodyHip: [[LH, RH]],
  bodyShoulder: [[LS, RS]],
  bodySquare: [[LS, RS]],
  bodyNeck: [[LS, RS, NOSE]],
  bodyHead: [[LS, RS, NOSE]],
};
const MISSING = {
  bodyLeg: '這張照片看不到髖部和膝蓋，長腿用不了。',
  bodyThigh: '這張照片看不到腿，瘦腿用不了。',
  bodyArm: '這張照片看不到手臂，瘦手臂用不了。',
  bodyHip: '這張照片看不到髖部，美胯用不了。',
};
export function bodyNote(body, key) {
  if (!body) return '正在找人…';
  if (!body.ok) return '這張照片沒找到人。身體塑形要看得到肩膀以下的身體。';
  if (key && !usable(body, key)) return MISSING[key] || '這張照片看不到需要的身體部位（肩膀、髖部），這一項用不了。';
  return '';
}
const usable = (body, key) => NEED[key].some(g => g.every(i => body.vis[i]));

const POSE_OPTS = { baseOptions: { modelAssetPath: POSE_MODEL }, runningMode: 'IMAGE', numPoses: 1 };
let poseP = null;
async function landmarker() {
  poseP ||= (async () => {
    const m = await import(`${CDN}/vision_bundle.mjs`);
    const files = await m.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const opts = d => ({ ...POSE_OPTS, baseOptions: { ...POSE_OPTS.baseOptions, delegate: d } });
    try { return await m.PoseLandmarker.createFromOptions(files, opts('GPU')); }
    catch { return await m.PoseLandmarker.createFromOptions(files, opts('CPU')); }
  })();
  return poseP;
}

// 找人：回傳關節點（像素座標）、每個點看不看得到。先在背景執行緒找（ai.js runTask，評審 M7），不行才在這裡
export async function detectBody(src) {
  const k = Math.min(1, 1280 / Math.max(src.width, src.height));
  let img = src;
  if (k < 1) {
    img = document.createElement('canvas');
    img.width = Math.round(src.width * k); img.height = Math.round(src.height * k);
    img.getContext('2d').drawImage(src, 0, 0, img.width, img.height);
  }
  const res = await runTask('PoseLandmarker', POSE_OPTS, img) || (await landmarker()).detect(img);
  const lm = res.landmarks?.[0];
  if (!lm) return { ok: false };
  const W = src.width, H = src.height;
  const pts = lm.map(p => ({ x: p.x * W, y: p.y * H }));
  // 看得到：模型說可見，而且在照片範圍內（稍微超出邊緣還算）
  const vis = lm.map(p => (p.visibility ?? 1) > 0.55 && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02);
  return { ok: vis[LS] || vis[RS] || vis[LH] || vis[RH], pts, vis, W, H };
}

// 用人像分割量身體的實際寬度：從骨架線上一點往兩側走，走到不是人為止
export function measureBody(body, seg) {
  if (!body?.ok) return;
  const { pts } = body;
  const half = (c, dir, fallback, c2) => {
    if (!seg) return fallback;
    const sx = seg.w / body.W, sy = seg.h / body.H, lim = fallback * 2.2;
    const walk = s => {
      for (let t = 0; t < lim; t += 2) {
        const x = Math.round((c.x + dir.x * s * t) * sx), y = Math.round((c.y + dir.y * s * t) * sy);
        if (x < 0 || y < 0 || x >= seg.w || y >= seg.h) return t;
        if (seg.bg[y * seg.w + x] > 0.5) return t;
      }
      return lim;
    };
    const a = walk(1), b = walk(-1);
    // c2：兩邊走到的正中間（身體不一定在骨架線正中，手動瘦身的預設框放這裡才左右對稱）
    if (c2) { const o = Math.max(-fallback * 0.5, Math.min(fallback * 0.5, (a - b) / 2)); c2.x = c.x + dir.x * o; c2.y = c.y + dir.y * o; }
    // 太窄或太寬都不太可信（手貼著身體、背景跟衣服分不開），夾在估計值附近
    return Math.min(fallback * 1.6, Math.max(fallback * 0.6, (a + b) / 2));
  };
  const sh = dist(pts[LS], pts[RS]) || 1;
  const S = mid(pts[LS], pts[RS]), Hm = mid(pts[LH], pts[RH]);
  const ax = unit(sub(Hm, S)), perp = { x: -ax.y, y: ax.x };
  body.sh = sh;
  body.waistHW = half(lerp(S, Hm, 0.72), perp, sh * 0.36);
  const sc = lerp(S, Hm, 0.655); body.slimC = { ...sc }; half(sc, perp, sh * 0.36, body.slimC);
  body.chestHW = half(lerp(S, Hm, 0.3), perp, sh * 0.45);
  const limb = (a, b, f, t) => { const d = unit(sub(pts[b], pts[a])); return half(lerp(pts[a], pts[b], t), { x: -d.y, y: d.x }, sh * f); };
  body.thighHW = [limb(LH, LK, 0.2, 0.35), limb(RH, RK, 0.2, 0.35)];
  body.calfHW = [limb(LK, LA, 0.13, 0.35), limb(RK, RA, 0.13, 0.35)];
  body.upperArmHW = [limb(LS, LE, 0.11, 0.45), limb(RS, RE, 0.11, 0.45)];
  body.foreArmHW = [limb(LE, LW, 0.09, 0.45), limb(RE, RW, 0.09, 0.45)];
}

// ---------- 變形 ----------
// 種類：
//   seg：骨架收窄。A→B 一段骨架，半徑 r 內的像素往骨架線收（k 正值變瘦、負值變胖），
//        沿著骨架在 tc 附近最強（ts 越大越平均），inner 指定哪一側只收一點（兩腿、手臂貼身體那側）
//   stretch：髖部以下往下拉長（y0 開始、到腳踝 y1），腳踝以下壓回照片裡，不會把腳切掉
//   原本的推移、縮放（臉部用的那兩種）
export function bodyWarps(body, faces, p) {
  const out = [];
  if (!body?.ok || !bodyOn(p)) return out;
  const { pts, vis } = body, v = k => (usable(body, k) ? (p[k] || 0) / 100 : 0);
  const auto = v('bodyAuto');
  const sh = body.sh, torsoOk = vis[LS] && vis[RS] && vis[LH] && vis[RH];
  const S = mid(pts[LS], pts[RS]), right = unit(sub(pts[RS], pts[LS]));
  // 看不到髖部（半身照）時，用肩寬推估軀幹往下的方向和長度
  const down = torsoOk ? unit(sub(mid(pts[LH], pts[RH]), S)) : { x: -right.y, y: right.x };
  const Hm = torsoOk ? mid(pts[LH], pts[RH]) : add(S, mul(down, sh * 1.45));
  const torso = dist(S, Hm) || sh * 1.4;

  // 長腿要排第一個：先把輸出位置換回「拉長前」的位置，後面的變形才對得上
  const leg = v('bodyLeg') + 0.6 * auto;
  if (leg && torsoOk && Math.abs(down.x) < 0.5) {
    const y0 = Hm.y - 0.12 * torso * down.y;
    const ankles = [LA, RA].filter(i => vis[i]).map(i => pts[i].y);
    const knees = [LK, RK].filter(i => vis[i]).map(i => pts[i].y);
    let y1 = ankles.length ? Math.max(...ankles) : knees.length ? Math.max(...knees) + (Math.max(...knees) - Hm.y) * 0.95 : 0;
    y1 = Math.min(y1, body.H - 1);
    if (y1 > y0 + torso * 0.3) {
      // 腳踝以下最多壓到原本的 45%，所以拉長的量有上限
      const room = body.H - y1, sMax = room * 0.55 / (y1 - y0);
      const s = Math.min(0.16 * leg, sMax);
      if (s > 0.002) out.push({ type: 'stretch', y0, y1, s, H: body.H });
    }
  }

  const seg = (a, b, r, k, tc = 0.5, ts = 0.6, inner = 0) => { if (k) out.push({ type: 'seg', ax: a.x, ay: a.y, bx: b.x, by: b.y, r, k, tc, ts, inner }); };
  // 哪一側是「內側」：從這段骨架看過去，另一個點在左還是右
  const side = (a, b, o) => Math.sign((b.x - a.x) * (o.y - a.y) - (b.y - a.y) * (o.x - a.x)) || 1;

  // 瘦腰：肩膀中點到髖部中點，偏下的地方最強
  const waist = v('bodyWaist') + 0.5 * v('bodySlim') + 0.35 * auto;
  if (waist && torsoOk) seg(S, lerp(S, Hm, 1.15), body.waistHW * 1.75, 0.34 * waist, 0.66, 0.26);
  // 瘦身：整個軀幹再收一點（胸到髖平均）
  const slim = v('bodySlim') + 0.5 * auto;
  if (slim && torsoOk) seg(lerp(S, Hm, 0.15), lerp(S, Hm, 1.1), body.chestHW * 1.7, 0.12 * slim, 0.55, 0.7);

  // 瘦腿：大腿、小腿各一段，兩腿之間那側只收一點，免得把另一條腿拉過來
  const thigh = v('bodyThigh') + 0.5 * slim;
  if (thigh) [[LH, LK, LA, RH, 0], [RH, RK, RA, LH, 1]].forEach(([h, k, a, oh, i]) => {
    if (!vis[h] || !vis[k]) return;
    seg(pts[h], pts[k], body.thighHW[i] * 1.8, 0.3 * thigh, 0.45, 0.55, side(pts[h], pts[k], pts[oh]));
    if (vis[a]) seg(pts[k], pts[a], body.calfHW[i] * 1.8, 0.24 * thigh, 0.35, 0.5, side(pts[k], pts[a], pts[oh]));
  });

  // 瘦手臂：上臂、前臂，貼著身體那側只收一點
  const arm = v('bodyArm') + 0.4 * slim;
  if (arm) [[LS, LE, LW, 0], [RS, RE, RW, 1]].forEach(([s, e, w, i]) => {
    if (!vis[s] || !vis[e]) return;
    seg(pts[s], pts[e], body.upperArmHW[i] * 1.9, 0.32 * arm, 0.55, 0.5, side(pts[s], pts[e], Hm));
    if (vis[w]) seg(pts[e], pts[w], body.foreArmHW[i] * 1.9, 0.22 * arm, 0.4, 0.5, side(pts[e], pts[w], Hm));
  });

  const rot = Math.atan2(right.y, right.x);
  // 豐胸：胸前兩點放大或縮小
  const br = v('bodyBreast') * 0.5; // 滑桿 0~100，100 跟以前 50 一樣強
  if (br) for (const sd of [-1, 1]) {
    const c = add(lerp(S, Hm, 0.3), mul(right, sd * sh * 0.22));
    out.push({ cx: c.x, cy: c.y, r: sh * 0.27, type: 'scale', s: 0.42 * br, ey: 1.1, rot });
  }
  // 美胯：髖部兩側往外（正）或往內（負）
  const hip = v('bodyHip') * 0.5; // 滑桿 -100~100，±100 跟以前 ±50 一樣強
  if (hip) for (const [i, sd] of [[LH, -1], [RH, 1]]) {
    const c = add(pts[i], mul(right, sd * sh * 0.18)), d = sh * 0.16 * hip;
    out.push({ cx: c.x, cy: c.y, dx: right.x * sd * d, dy: right.y * sd * d, r: sh * 0.42, ey: 0.75, rot });
  }
  // 寬肩：兩肩沿著肩線往外（正）或往內（負）
  const sw = v('bodyShoulder');
  if (sw) for (const [i, sd] of [[LS, -1], [RS, 1]]) {
    const d = sh * 0.14 * sw;
    out.push({ cx: pts[i].x, cy: pts[i].y, dx: right.x * sd * d, dy: right.y * sd * d, r: sh * 0.38, rot });
  }
  // 直角肩：肩膀外側往上，斜肩變平
  const sq = v('bodySquare');
  if (sq) for (const [i, sd] of [[LS, -1], [RS, 1]]) {
    const c = add(lerp(S, pts[i], 0.8), mul(down, -sh * 0.1)), d = sh * 0.07 * sq;
    out.push({ cx: c.x, cy: c.y, dx: -down.x * d, dy: -down.y * d, r: sh * 0.24, rot });
  }
  // 天鵝頸：靠脖子的肩膀往下，脖子看起來比較長
  const nk = v('bodyNeck');
  if (nk) for (const i of [LS, RS]) {
    const c = add(lerp(S, pts[i], 0.42), mul(down, -sh * 0.05)), d = sh * 0.06 * nk;
    out.push({ cx: c.x, cy: c.y, dx: down.x * d, dy: down.y * d, r: sh * 0.21, rot });
  }
  // 小頭：以頭為中心縮小；有找到臉就用臉的範圍，比較準
  const head = v('bodyHead') + 0.45 * auto;
  if (head) {
    const f = faces?.length ? faces.map(faceGeom).sort((a, b) => dist2(a, pts[NOSE]) - dist2(b, pts[NOSE]))[0] : null;
    const c = f ? { x: f.cx + f.up.x * f.W * 0.12, y: f.cy + f.up.y * f.W * 0.12 } : add(pts[NOSE], mul(down, -sh * 0.08));
    const r = f ? f.W * 1.35 : sh * 0.62;
    out.push({ cx: c.x, cy: c.y, r, type: 'scale', s: -0.16 * head, ey: 0.85, rot });
  }
  return out;
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist2 = (g, p) => (g.cx - p.x) ** 2 + (g.cy - p.y) ** 2;
const unit = a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
