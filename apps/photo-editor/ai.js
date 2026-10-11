// 臉部特徵點與人像分割：Google MediaPipe（免費、在裝置上跑，照片不會上傳）
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
export async function detectFaces(src) {
  faceP ||= create('FaceLandmarker', { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'IMAGE', numFaces: 5 });
  const fl = await faceP;
  const img = shrink(src, 1280);
  const res = fl.detect(img);
  return (res.faceLandmarks || []).map(pts => pts.map(p => ({ x: p.x * src.width, y: p.y * src.height })));
}

// 回傳人像遮罩 canvas（R 通道 = 前景程度）
export async function segmentPerson(src) {
  segP ||= create('ImageSegmenter', { baseOptions: { modelAssetPath: SEG_MODEL }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
  const seg = await segP;
  const img = shrink(src, 1024);
  const res = seg.segment(img);
  const bg = res.confidenceMasks[0];
  const w = bg.width, h = bg.height, a = bg.getAsFloat32Array();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), out = ctx.createImageData(w, h);
  for (let i = 0; i < a.length; i++) {
    // 稍微拉高對比，邊緣比較俐落
    const f = Math.min(1, Math.max(0, (1 - a[i] - 0.15) / 0.7));
    const v = f * 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  res.close?.();
  return c;
}

// MediaPipe 特徵點編號
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const R_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const L_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const R_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const NOSTRIL = [[48, 64, 98, 240], [278, 294, 327, 460]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const avg = (pts, ids) => ids.reduce((s, i) => ({ x: s.x + pts[i].x / ids.length, y: s.y + pts[i].y / ids.length }), { x: 0, y: 0 });

// 皮膚遮罩：臉的輪廓塗白，眼睛、眉毛、嘴巴、鼻孔挖掉，再模糊成柔邊
export function skinMask(faces, w, h) {
  const k = Math.min(1, 512 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  const poly = (pts, ids, color, grow = 1) => {
    const ctr = avg(pts, ids);
    ctx.beginPath();
    ids.forEach((i, n) => {
      const x = (ctr.x + (pts[i].x - ctr.x) * grow) * k, y = (ctr.y + (pts[i].y - ctr.y) * grow) * k;
      n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  for (const pts of faces) {
    poly(pts, OVAL, '#fff', 0.97);
    poly(pts, L_EYE, '#000', 1.5); poly(pts, R_EYE, '#000', 1.5);
    poly(pts, L_BROW, '#000', 1.25); poly(pts, R_BROW, '#000', 1.25);
    poly(pts, LIPS, '#000', 1.12);
    NOSTRIL.forEach(n => poly(pts, n, '#000', 1.4));
  }
  boxBlur(ctx, c.width, c.height, Math.max(2, Math.round(c.width / 90)));
  return c;
}

function boxBlur(ctx, w, h, r) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4];
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = s / (2 * r + 1);
        s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
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
  for (let i = 0; i < w * h; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = a[i];
  ctx.putImageData(img, 0, 0);
}

// 五官變形：每一項是「中心點、半徑、位移方向和量」，跟醒圖的做法一樣
export function faceWarps(faces, p) {
  const out = [];
  const v = k => (p[k] || 0) / 100;
  for (const pts of faces) {
    const W = dist(pts[234], pts[454]);
    const toward = (a, b, amt, r) => {
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      out.push({ cx: a.x, cy: a.y, dx: dx / l * amt, dy: dy / l * amt, r });
    };
    if (v('slim')) {
      // 兩頰到下顎往臉中線推
      [[132, 361, 0.9], [58, 288, 1], [172, 397, 0.9], [136, 365, 0.7]].forEach(([l, r, w]) => {
        const m = { x: (pts[l].x + pts[r].x) / 2, y: (pts[l].y + pts[r].y) / 2 };
        toward(pts[l], m, W * 0.085 * v('slim') * w, W * 0.28);
        toward(pts[r], m, W * 0.085 * v('slim') * w, W * 0.28);
      });
    }
    if (v('vface')) {
      // 下巴兩側往下巴尖收，下巴尖稍微往下
      [150, 149, 176, 379, 378, 400].forEach(i => toward(pts[i], pts[152], W * 0.035 * v('vface'), W * 0.16));
      toward(pts[152], { x: pts[152].x + (pts[152].x - pts[1].x), y: pts[152].y + (pts[152].y - pts[1].y) }, W * 0.02 * v('vface'), W * 0.12);
    }
    if (v('eyes')) {
      [[L_EYE, 33, 133], [R_EYE, 263, 362]].forEach(([ids, a, b]) => {
        const c = avg(pts, ids), ew = dist(pts[a], pts[b]);
        out.push({ cx: c.x, cy: c.y, r: ew * 1.25, type: 'scale', s: 0.34 * v('eyes'), ey: 1.25 });
      });
    }
    if (v('nose')) {
      toward(pts[129], pts[4], W * 0.022 * v('nose'), W * 0.09);
      toward(pts[358], pts[4], W * 0.022 * v('nose'), W * 0.09);
    }
    if (v('mouth')) {
      // 嘴巴大小：以嘴巴中心縮放（負值縮小）
      const c = avg(pts, LIPS), mw = dist(pts[61], pts[291]);
      out.push({ cx: c.x, cy: c.y, r: mw * 0.85, type: 'scale', s: 0.2 * v('mouth'), ey: 1.6 });
    }
  }
  return out;
}
