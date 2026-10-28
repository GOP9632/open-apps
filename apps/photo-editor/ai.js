// 臉部特徵點與人像分割：Google MediaPipe（免費、在裝置上跑，照片不會上傳）
import { boxBlur as blurArr, mkCanvas } from './masktools.js';
const boxBlur3 = (a, w, h, r) => blurArr(a, w, h, r, 3);
const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

let visionP, faceP, segP;
function vision() {
  visionP ||= import(`${CDN}/vision_bundle.mjs`).then(async m => ({ m, files: await m.FilesetResolver.forVisionTasks(`${CDN}/wasm`) }));
  return visionP;
}
async function create(Cls, opts) {
  const { m, files } = await vision();
  try { return await m[Cls].createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } }); }
  catch { return await m[Cls].createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } }); }
}

function shrink(src, max) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  if (k === 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// 回傳每張臉的 478 個點（像素座標）
//   模型會把輸入縮得很小再找臉，全身照、團體照裡的小臉整張丟進去會找不到。
//   所以整張找完，再把照片切成 2×2、3×3 互相重疊的區塊放大各找一次，
//   同一張臉被找到好幾次時，留臉在區塊裡佔比較大（比較準）的那次。
export async function detectFaces(src) {
  faceP ||= create('FaceLandmarker', { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'IMAGE', numFaces: 5 });
  const fl = await faceP;
  const W = src.width, H = src.height, found = [];
  const run = (x, y, w, h) => {
    const k = Math.min(1, 1024 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    for (const lm of fl.detect(c).faceLandmarks || []) {
      const pts = lm.map(p => ({ x: x + p.x * w, y: y + p.y * h, z: p.z * w }));
      const fw = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
      // 臉貼到區塊邊緣的不算，等相鄰區塊（重疊的地方）找完整的
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y), m = fw * 0.05;
      const cut = (x > 0 && Math.min(...xs) < x + m) || (y > 0 && Math.min(...ys) < y + m)
        || (x + w < W && Math.max(...xs) > x + w - m) || (y + h < H && Math.max(...ys) > y + h - m);
      if (!cut) found.push({ pts, fw, rel: fw / Math.max(w, h) });
    }
  };
  run(0, 0, W, H);
  // 評審 M7：整張就找到夠大的臉（自拍、半身照）就不切區塊找了，區塊是為了全身照、團體照裡的小臉；
  // 臉寬佔長邊兩成，模型看到的臉已經有 200 像素寬，放大也不會更準。區塊之間讓出主執行緒，找臉時拖滑桿、縮放照片才會動
  if (found.some(f => f.rel >= 0.2)) return merge(found);
  for (const n of [2, 3]) {
    const tw = W / n * 1.5, th = H / n * 1.5;
    if (Math.max(tw, th) < 400) break;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      await new Promise(r => setTimeout(r));
      run(Math.round((W - tw) * i / (n - 1)), Math.round((H - th) * j / (n - 1)), Math.round(tw), Math.round(th));
    }
  }
  return merge(found);
}
function merge(found) {
  // 合併同一張臉
  const ctr = f => f.pts[1];
  found.sort((a, b) => b.rel - a.rel);
  const out = [];
  for (const f of found) if (!out.some(g => Math.hypot(ctr(f).x - ctr(g).x, ctr(f).y - ctr(g).y) < Math.max(f.fw, g.fw) * 0.5)) out.push(f);
  return out.sort((a, b) => b.fw - a.fw).slice(0, 5).map(f => f.pts);
}

// 人像分割（多類別模型）：回傳
//   person：去背用的人像遮罩 canvas（R 通道 = 前景程度）
//   skin：每個像素是皮膚（臉 + 身體）的機率，美白、磨皮用
export async function segment(src) {
  segP ||= create('ImageSegmenter', { baseOptions: { modelAssetPath: SEG_MODEL }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
  const seg = await segP;
  const img = shrink(src, 1024);
  const res = seg.segment(img);
  const ms = res.confidenceMasks; // 0 背景、1 頭髮、2 身體皮膚、3 臉部皮膚、4 衣服、5 其他
  const w = ms[0].width, h = ms[0].height, bg = ms[0].getAsFloat32Array();
  const body = ms[2].getAsFloat32Array(), face = ms[3].getAsFloat32Array();
  const skin = new Float32Array(w * h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), out = ctx.createImageData(w, h);
  for (let i = 0; i < bg.length; i++) {
    // 稍微拉高對比，邊緣比較俐落
    const f = Math.min(1, Math.max(0, (1 - bg[i] - 0.15) / 0.7));
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = f * 255; out.data[i * 4 + 3] = 255;
    // 去掉衣服邊緣零星的誤判
    const sk = body[i] + face[i];
    skin[i] = sk < 0.3 ? 0 : Math.min(1, (sk - 0.3) / 0.5);
  }
  ctx.putImageData(out, 0, 0);
  // 頭髮分頁用：頭髮機率、背景機率
  const hair = Float32Array.from(ms[1].getAsFloat32Array()), bgA = Float32Array.from(bg);
  res.close?.();
  return { person: c, skin, hair, bg: bgA, w, h };
}

// MediaPipe 特徵點編號
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const R_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const L_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const R_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const NOSTRIL = [[48, 64, 98, 240], [278, 294, 327, 460]];
const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const L_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const R_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const avg = (pts, ids) => ids.reduce((s, i) => ({ x: s.x + pts[i].x / ids.length, y: s.y + pts[i].y / ids.length }), { x: 0, y: 0 });

// 美顏遮罩：R 通道 = 磨皮權重、G 通道 = 美白權重
//   - 有人像分割時，作用在所有露出的皮膚（臉、脖子、手），跟醒圖一樣
//   - 磨皮：臉 1 倍、臉以外的皮膚 0.5 倍（醒圖），眼睛、眉毛、嘴巴、鼻孔不磨
//   - 美白：眉毛 0.6、眼睛 0.2、嘴巴 0.4 倍（美圖），避免眼白、嘴唇被洗白
//   B 通道 = 嘴巴裡面（白牙用）
export function skinMask(faces, w, h, seg, img) {
  const mw = seg ? seg.w : Math.max(1, Math.round(w * Math.min(1, 512 / Math.max(w, h))));
  const mh = seg ? seg.h : Math.max(1, Math.round(h * Math.min(1, 512 / Math.max(w, h))));
  const kx = mw / w, ky = mh / h, r = Math.max(2, Math.round(mw / 110));
  const layer = (bgColor, draw) => {
    const c = mkCanvas(mw, mh);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, mw, mh);
    const poly = (pts, ids, v, grow = 1) => {
      const ctr = avg(pts, ids);
      ctx.beginPath();
      ids.forEach((i, n) => {
        const x = (ctr.x + (pts[i].x - ctr.x) * grow) * kx, y = (ctr.y + (pts[i].y - ctr.y) * grow) * ky;
        n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath(); const g = Math.round(v * 255); ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fill();
    };
    faces.forEach(pts => draw(poly, pts));
    boxBlur(ctx, mw, mh, r);
    const d = ctx.getImageData(0, 0, mw, mh).data, a = new Float32Array(mw * mh);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
    return a;
  };
  const oval = layer('#000', (poly, pts) => poly(pts, OVAL, 1, 0.97));
  const holeS = layer('#fff', (poly, pts) => {
    poly(pts, L_EYE, 0, 1.5); poly(pts, R_EYE, 0, 1.5);
    poly(pts, L_BROW, 0, 1.25); poly(pts, R_BROW, 0, 1.25);
    poly(pts, LIPS, 0, 1.12); NOSTRIL.forEach(n => poly(pts, n, 0, 1.4));
  });
  const teeth = layer('#000', (poly, pts) => poly(pts, INNER_LIPS, 1, 1));
  const holeW = layer('#fff', (poly, pts) => {
    poly(pts, L_EYE, 0.2, 1.3); poly(pts, R_EYE, 0.2, 1.3);
    poly(pts, L_BROW, 0.6, 1.2); poly(pts, R_BROW, 0.6, 1.2);
    poly(pts, LIPS, 0.4, 1.05);
  });
  const c = mkCanvas(mw, mh);
  const ctx = c.getContext('2d'), out = ctx.createImageData(mw, mh), d = out.data;
  for (let i = 0; i < mw * mh; i++) {
    const skin = seg ? seg.skin[i] : oval[i];
    d[i * 4] = skin * (0.5 + 0.5 * oval[i]) * holeS[i] * 255;
    d[i * 4 + 1] = skin * holeW[i] * 255;
    d[i * 4 + 2] = teeth[i] * 255;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  // 閃光燈用的分類圖（gl.js 放進 uSeg 的 G、B、A）：G = 0.5 + 0.5 ×（頭髮 − 五官）、B = 皮膚（挖掉五官）、
  //   A = 1 − 0.5 × 鬍子（beardMap）。五官 = 眼睛、眉毛、嘴唇、鼻孔、牙齒。頭髮和五官幾乎不會重疊，所以共用一個通道
  if (seg) {
    const bd = img ? beardMap(img, c, mw, mh) : null;
    const k2 = mkCanvas(mw, mh);
    const x2 = k2.getContext('2d'), o2 = x2.createImageData(mw, mh), e = o2.data;
    for (let i = 0; i < mw * mh; i++) {
      const sk = seg.skin[i], ft = Math.min(1, sk * (1 - holeS[i]) + teeth[i]);
      e[i * 4 + 1] = (0.5 + 0.5 * (Math.min(1, seg.hair[i]) - ft)) * 255;
      e[i * 4 + 2] = sk * holeS[i] * 255;
      e[i * 4 + 3] = 255 - (bd ? bd[i] * 127 : 0);
    }
    x2.putImageData(o2, 0, 0);
    c.cls = k2;
  }
  return c;
}

// 鬍子圖：皮膚裡不比臉的膚色中位數亮、又有細紋理的地方（鬍子、鬍渣，淺色的也算；陰影的那半邊臉是平滑的，不會被抓到）。
// 閃光燈照頭髮的方式處理這裡，不跟皮膚一起提亮。固定在長邊 512 算，結果放大回遮罩的大小
function boxF(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let k = -r - 1; k < r; k++) s += a[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) { s += a[row + Math.min(w - 1, x + r)] - a[row + Math.max(0, x - r - 1)]; t[row + x] = s / n; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r - 1; k < r; k++) s += t[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) { s += t[Math.min(h - 1, y + r) * w + x] - t[Math.max(0, y - r - 1) * w + x]; o[y * w + x] = s / n; }
  }
  return o;
}
export const beardSize = (mw, mh) => { const k = 512 / Math.max(mw, mh); return [Math.max(1, Math.round(mw * k)), Math.max(1, Math.round(mh * k))]; };
function beardMap(img, mask, mw, mh) {
  const [w, h] = beardSize(mw, mh);
  const c = mkCanvas(w, h);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data;
  x.clearRect(0, 0, w, h); x.drawImage(mask, 0, 0, w, h); const m = x.getImageData(0, 0, w, h).data;
  const n = w * h, L = new Float32Array(n), sk = new Float32Array(n), ls = [];
  for (let i = 0; i < n; i++) {
    L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; sk[i] = m[i * 4] / 255;
    if (sk[i] > 0.5) ls.push(L[i]);
  }
  if (ls.length <= 50) return null;
  ls.sort((a, b) => a - b); const Lm = ls[ls.length >> 1];
  const r = Math.max(1, Math.round(Math.max(w, h) * 0.008)), b1 = boxF(L, w, h, 1), D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = Math.abs(L[i] - b1[i]);
  const Lz = boxF(L, w, h, r), Tx = boxF(D, w, h, r), b = new Float32Array(n);
  const sm = (a, c, v) => { const t = Math.min(1, Math.max(0, (v - a) / (c - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < n; i++) b[i] = sk[i] * (1 - sm(1.0, 1.2, Lz[i] / Lm)) * sm(0.07, 0.12, Tx[i] / Math.max(Lz[i], 0.02));
  const bb = boxF(b, w, h, 2), out = new Float32Array(mw * mh);
  for (let yy = 0; yy < mh; yy++) for (let xx = 0; xx < mw; xx++) {
    const fx = Math.min(w - 1, Math.max(0, (xx + 0.5) * w / mw - 0.5)), fy = Math.min(h - 1, Math.max(0, (yy + 0.5) * h / mh - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    out[yy * mw + xx] = (bb[y0 * w + x0] * (1 - ax) + bb[y0 * w + x1] * ax) * (1 - ay) + (bb[y1 * w + x0] * (1 - ax) + bb[y1 * w + x1] * ax) * ay;
  }
  return out;
}

// 第二張遮罩：R = 黑眼圈、G = 法令紋、B = 眼睛（亮眼）
export function featureMask(faces, w, h) {
  const k = Math.min(1, 512 / Math.max(w, h));
  const mw = Math.max(1, Math.round(w * k)), mh = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = mw; c.height = mh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, mw, mh);
  ctx.globalCompositeOperation = 'lighter';
  const P = p => [p.x * k, p.y * k];
  const fill = (pts, color) => {
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  for (const pts of faces) {
    const W = dist(pts[234], pts[454]);
    // 黑眼圈：下眼瞼往下一條帶狀
    for (const ids of [L_LOWER, R_LOWER]) {
      const lid = ids.map(i => pts[i]);
      const ew = dist(lid[0], lid[lid.length - 1]);
      const down = downDir(pts);
      const lo = lid.map((p, n) => {
        const t = n / (lid.length - 1), m = Math.sin(t * Math.PI);
        return { x: p.x + down.x * ew * (0.08 + 0.32 * m), y: p.y + down.y * ew * (0.08 + 0.32 * m) };
      });
      fill([...lid.map(p => ({ x: p.x + down.x * ew * 0.05, y: p.y + down.y * ew * 0.05 })), ...lo.reverse()], '#f00');
    }
    // 法令紋：鼻翼到嘴角
    for (const [a, b, side] of [[129, 61, -1], [358, 291, 1]]) {
      const pa = pts[a], pb = pts[b], cx = (pts[234].x + pts[454].x) / 2;
      const out = Math.sign(pa.x - cx) || side, wd = W * 0.035;
      fill([
        { x: pa.x, y: pa.y }, { x: pa.x + out * wd * 1.6, y: pa.y + wd },
        { x: pb.x + out * wd * 1.4, y: pb.y + wd * 0.5 }, { x: pb.x - out * wd * 0.2, y: pb.y + wd * 0.8 },
      ], '#0f0');
    }
    fill(L_EYE.map(i => pts[i]), '#00f'); fill(R_EYE.map(i => pts[i]), '#00f');
  }
  ctx.globalCompositeOperation = 'source-over';
  boxBlur(ctx, mw, mh, Math.max(2, Math.round(mw / 140)), true);
  return c;
}
const downDir = pts => {
  const a = pts[33], b = pts[263], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
};

// 每張臉的橢圓、傾斜和左右轉頭，打光、閃光燈、貼紙、變形都會用到
export function faceGeom(pts) {
  const W = dist(pts[234], pts[454]);
  const roll = Math.atan2(pts[263].y - pts[33].y, pts[263].x - pts[33].x);
  const top = pts[10], chin = pts[152];
  const H = dist(top, chin);
  const up = { x: Math.sin(roll), y: -Math.cos(roll) };
  const cx = (top.x + chin.x) / 2 + up.x * H * 0.06, cy = (top.y + chin.y) / 2 + up.y * H * 0.06;
  const mid = { x: (pts[234].x + pts[454].x) / 2, y: (pts[234].y + pts[454].y) / 2 };
  const along = ((pts[1].x - mid.x) * Math.cos(roll) + (pts[1].y - mid.y) * Math.sin(roll)) / (W / 2);
  return { cx, cy, rx: W * 0.5, ry: H * 0.62, roll, yaw: Math.asin(Math.max(-0.9, Math.min(0.9, along))), W, up };
}

// 人像遮罩模糊一份，打光算身體輪廓、閃光燈算影子用
// 模糊得很開，所以縮到長邊 512 再算（全尺寸的照片在手機上要多吃 200MB 記憶體）；用的時候當貼圖放大
export function blurCanvas(src, r) {
  const k = Math.min(1, 512 / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
  boxBlur(ctx, c.width, c.height, Math.max(1, Math.round(r != null ? r * k : Math.max(2, Math.max(c.width, c.height) / 40))));
  return c;
}

function boxBlur(ctx, w, h, r, rgb) {
  if (rgb) { // 三個通道分開模糊
    const img = ctx.getImageData(0, 0, w, h), out = new Uint8ClampedArray(img.data);
    for (let ch = 0; ch < 3; ch++) {
      const a = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) a[i] = img.data[i * 4 + ch];
      boxBlur3(a, w, h, r);
      for (let i = 0; i < w * h; i++) out[i * 4 + ch] = a[i];
    }
    img.data.set(out); ctx.putImageData(img, 0, 0); return;
  }
  const img = ctx.getImageData(0, 0, w, h), d = img.data, a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4];
  boxBlur3(a, w, h, r);
  for (let i = 0; i < w * h; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = a[i];
  ctx.putImageData(img, 0, 0);
}


// 五官變形：每一項是「中心點、半徑、位移方向和量」
//   - 橢圓範圍跟著頭的傾斜轉（rot），歪頭的照片也不會修歪
//   - 瘦臉、大眼可以左右分開調：slimL / slimR、eyesL / eyesR 疊加在兩邊共用的值上（左右指畫面的左右）
export function faceWarps(faces, p) {
  const out = [];
  const v = k => (p[k] || 0) / 100;
  for (const pts of faces) {
    const g = faceGeom(pts), W = g.W, rot = g.roll;
    const side = pt => ((pt.x - g.cx) * Math.cos(rot) + (pt.y - g.cy) * Math.sin(rot)) < 0 ? 'L' : 'R';
    const amt = (k, pt) => v(k) + v(k + side(pt));
    const toward = (a, b, d, r) => {
      if (!d) return;
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      out.push({ cx: a.x, cy: a.y, dx: dx / l * d, dy: dy / l * d, r, rot });
    };
    // 兩頰到下顎往臉中線推
    [[132, 361, 0.9], [58, 288, 1], [172, 397, 0.9], [136, 365, 0.7]].forEach(([l, r, w]) => {
      const m = { x: (pts[l].x + pts[r].x) / 2, y: (pts[l].y + pts[r].y) / 2 };
      toward(pts[l], m, W * 0.06 * amt('slim', pts[l]) * w, W * 0.26);
      toward(pts[r], m, W * 0.06 * amt('slim', pts[r]) * w, W * 0.26);
    });
    if (v('vface')) {
      // 下巴兩側往下巴尖收，下巴尖稍微往下
      [150, 149, 176, 379, 378, 400].forEach(i => toward(pts[i], pts[152], W * 0.035 * v('vface'), W * 0.16));
      toward(pts[152], { x: pts[152].x - g.up.x, y: pts[152].y - g.up.y }, W * 0.02 * v('vface'), W * 0.12);
    }
    if (v('chin')) {
      // 下巴長短：下巴尖沿著臉的方向往下（正值）或往上（負值）
      const down = { x: -g.up.x, y: -g.up.y };
      for (const [i, w] of [[152, 1], [148, 0.75], [377, 0.75], [176, 0.45], [400, 0.45]]) {
        toward(pts[i], { x: pts[i].x + down.x, y: pts[i].y + down.y }, W * 0.05 * v('chin') * w, W * 0.2);
      }
    }
    [[L_EYE, 33, 133], [R_EYE, 263, 362]].forEach(([ids, a, b]) => {
      const c = avg(pts, ids), e = amt('eyes', c);
      if (!e) return;
      const ew = dist(pts[a], pts[b]);
      out.push({ cx: c.x, cy: c.y, r: ew * 1.25, type: 'scale', s: 0.28 * e, ey: 1.25, rot });
    });
    if (v('nose')) {
      toward(pts[129], pts[4], W * 0.022 * v('nose'), W * 0.09);
      toward(pts[358], pts[4], W * 0.022 * v('nose'), W * 0.09);
    }
    if (v('mouth')) {
      // 嘴巴大小：以嘴巴中心縮放（負值縮小）
      const c = avg(pts, LIPS), mw = dist(pts[61], pts[291]);
      out.push({ cx: c.x, cy: c.y, r: mw * 0.85, type: 'scale', s: 0.2 * v('mouth'), ey: 1.6, rot });
    }
  }
  return out;
}

// 臉部貼紙放的位置：頭頂、眼睛、兩頰、鼻子
export function faceAnchor(pts, where) {
  const g = faceGeom(pts), W = g.W;
  const eyeL = avg(pts, L_EYE), eyeR = avg(pts, R_EYE);
  switch (where) {
    case 'top': return [{ x: pts[10].x + g.up.x * W * 0.32, y: pts[10].y + g.up.y * W * 0.32, size: W * 1.25, rot: g.roll }];
    case 'crown': return [{ x: pts[10].x + g.up.x * W * 0.38, y: pts[10].y + g.up.y * W * 0.38, size: W * 0.7, rot: g.roll }];
    case 'eyes': return [{ x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2, size: W * 1.0, rot: g.roll }];
    case 'cheeks': return [205, 425].map(i => ({ x: pts[i].x, y: pts[i].y, size: W * 0.36, rot: g.roll }));
    case 'nose': return [{ x: pts[4].x, y: pts[4].y, size: W * 0.42, rot: g.roll }];
    // 遮臉：整張臉（額頭到下巴）
    case 'cover': return [{ x: (pts[10].x + pts[152].x) / 2, y: (pts[10].y + pts[152].y) / 2, size: W * 1.15, rot: g.roll }];
  }
  return [];
}
