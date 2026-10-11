import { Renderer } from './gl.js';
import { FILTERS, bakeLUT, thumb } from './filters.js';
import { detectFaces, segment, skinMask, faceWarps, featureMask, faceGeom, blurCanvas, faceAnchor } from './ai.js';
import { STICKERS, EMOJIS, EMOJI_FONT, stickerById, stickerImage } from './stickers.js';
import { FX, OVERLAYS, BG_PHOTOS, EXPOSURES, FRAMES, frameById, drawFrame, paint, fitSize } from './creative.js';
import { matte } from './matte.js';
import { GRADE_P0, gradeOn, gradeFn, gradeKey, tabGrade, gradeHide } from './grade.js';
import { HAIR, HAIR_P0, DYES, HairFx, prepHair, hairWarps, hairNeedsSeg, hairColorOn } from './hair.js';
import { tabErase, eraseLeave } from './erase.js';
import { makeupLayer, makeupTab } from './makeup.js';
import { SKIN, WRINKLE, SKIN_P0, skinOn, skinKey, prepSkin, SkinFx, skinNote } from './skin.js';
import { BODY, BODY_P0, bodyOn, detectBody, measureBody, bodyWarps, bodyNote } from './body.js';
import { SHAPE_CATS, setShape, getShape, shapeIsSet, shapeMoves, resetShape } from './faceshape.js';
import { WarpField } from './warpfield.js';
import { initCollage, openCollage } from './collage.js';

const $ = s => document.querySelector(s);
const MAX_SIDE = 4096, MAX_AREA = 16e6;

const P0 = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, temp: 0, tint: 0, highlights: 0, shadows: 0,
  sharpen: 0, vignette: 0, grain: 0, fade: 0,
  filter: 'none', filterAmt: 80,
  smooth: 0, white: 0, slim: 0, vface: 0, eyes: 0, nose: 0, mouth: 0,
  chin: 0, dark: 0, fold: 0, eyeb: 0, teeth: 0, slimL: 0, slimR: 0, eyesL: 0, eyesR: 0,
  bg: 'keep', bgColor: '#ffffff',
  oneTap: -1, oneAmt: 100,
  light: -1, lightAmt: 60, lightRot: 0, flash: -1, flashAmt: 60,
  blur: 0, fx: '', fxAmt: 80, ov: '', ovAmt: 80, ex: 'forest', bgImg: 'beach', bgBlur: 30, frame: '',
  ...HAIR_P0,
  bgProtect: 1, // 背景保護：變形時背景不跟著彎
  mk: {}, mkLook: -1, mkLookAmt: 100,
  ...BODY_P0,
  ...GRADE_P0,
  ...SKIN_P0,
};

const I = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  contrast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  exposure: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 21L21 3M7 8h4M9 6v4M14 16h4"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>',
  temp: '<svg viewBox="0 0 24 24"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>',
  tint: '<svg viewBox="0 0 24 24"><circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/></svg>',
  high: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z" fill="currentColor" opacity=".5"/></svg>',
  shadow: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18a9 9 0 0 1-18 0z" fill="currentColor" opacity=".5"/></svg>',
  sharp: '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3z"/></svg>',
  vig: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><ellipse cx="12" cy="12" rx="5" ry="4"/></svg>',
  grain: '<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="17" cy="6" r="1"/><circle cx="8" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="6" cy="18" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="18" cy="18" r="1"/></svg>',
  fade: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15l5-5 4 4 3-3 6 6" opacity=".6"/></svg>',
  magic: '<svg viewBox="0 0 24 24"><path d="M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z"/></svg>',
  skin: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="9"/><path d="M9 15c1.5 1 4.5 1 6 0"/></svg>',
  white: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="9"/><path d="M15 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>',
  slim: '<svg viewBox="0 0 24 24"><path d="M6 6c0 8 3 14 6 14s6-6 6-14"/><path d="M3 11l3 1M21 11l-3 1"/></svg>',
  vface: '<svg viewBox="0 0 24 24"><path d="M5 5c0 6 4 15 7 15s7-9 7-15"/><path d="M12 20v-3"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  nose: '<svg viewBox="0 0 24 24"><path d="M12 4v9l-3 3c1 1.5 5 1.5 6 0l-3-3"/></svg>',
  mouth: '<svg viewBox="0 0 24 24"><path d="M4 12c3-3 5-3 8-1 3-2 5-2 8 1-3 4-13 4-16 0z"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M8 7L3 12l5 5zM16 7l5 5-5 5z"/></svg>',
  flipv: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><path d="M7 8l5-5 5 5zM7 16l5 5 5-5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  stroke: '<svg viewBox="0 0 24 24"><path d="M6 19L12 5l6 14M8.5 14h7"/></svg>',
  font: '<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v13"/></svg>',
  chin: '<svg viewBox="0 0 24 24"><path d="M6 4c0 7 2 13 6 13s6-6 6-13"/><path d="M12 17v4M10 19l2 2 2-2"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M3 10s4-5 9-5 9 5 9 5"/><path d="M6 15c3 2 9 2 12 0" opacity=".6"/></svg>',
  fold: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="9"/><path d="M10 10c-2 3-2 5-1 7M14 10c2 3 2 5 1 7"/></svg>',
  eyeb: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M13 10.5l1-1"/></svg>',
  teeth: '<svg viewBox="0 0 24 24"><path d="M4 9c3-2 13-2 16 0-1 6-4 9-8 9s-7-3-8-9z"/><path d="M8 9.5v3M12 9.3v3.2M16 9.5v3"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  flash: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="18" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
};

const ADJUST = [
  ['brightness', '亮度', I.sun], ['contrast', '對比', I.contrast], ['exposure', '曝光', I.exposure], ['saturation', '飽和', I.drop],
  ['temp', '色溫', I.temp], ['tint', '色調', I.tint], ['highlights', '高光', I.high], ['shadows', '陰影', I.shadow],
  ['sharpen', '銳化', I.sharp, 0], ['vignette', '暗角', I.vig], ['grain', '顆粒', I.grain, 0], ['fade', '褪色', I.fade, 0],
];
const BEAUTY = [
  ['smooth', '磨皮', I.skin, 0], ['white', '美白', I.white, 0], ['dark', '黑眼圈', I.dark, 0], ['fold', '法令紋', I.fold, 0],
  ['eyeb', '亮眼', I.eyeb, 0], ['teeth', '白牙', I.teeth, 0],
  ['slim', '瘦臉', I.slim], ['vface', '小 V 臉', I.vface], ['chin', '下巴', I.chin],
  ['eyes', '大眼', I.eye], ['nose', '瘦鼻', I.nose], ['mouth', '嘴巴', I.mouth],
];
// 第一次點開時的起始強度，照醒圖點開滑桿時的預設值
const BEAUTY_DEF = { white: 60 };
// 可以左右分開調的項目
const SIDED = ['slim', 'eyes'];
// 打光：燈的方向用畫面座標（x 向右、y 向下、z 朝鏡頭）
const n3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LIGHTS = [
  { name: '側光', lights: [{ dir: n3(-0.85, -0.25, 0.5), col: [1, 0.97, 0.92] }], amb: 0.55, bg: 0.35 },
  { name: '頂光', lights: [{ dir: n3(0, -0.85, 0.5), col: [1, 1, 1] }], amb: 0.55, bg: 0.3 },
  { name: '柔光', lights: [{ dir: n3(0, -0.3, 1), col: [1, 0.98, 0.95] }], amb: 0.85, bg: 0.1 },
  { name: '輪廓光', lights: [{ dir: n3(-0.9, -0.2, -0.35), col: [1, 0.95, 0.85] }, { dir: n3(0.9, -0.2, -0.35), col: [1, 0.95, 0.85] }], amb: 1, bg: 0.35, mode: 1 },
  { name: '霓虹', lights: [{ dir: n3(-0.85, -0.1, 0.45), col: [1, 0.35, 0.7] }, { dir: n3(0.85, -0.1, 0.45), col: [0.3, 0.55, 1] }], amb: 0.45, bg: 0.5 },
];
const FLASHES = [
  { name: '直閃', lift: 1, spec: 1, bg: 0.55, shadow: 1, retro: 0 },
  { name: '柔閃', lift: 0.7, spec: 0.5, bg: 0.25, shadow: 0, retro: 0 },
  { name: '復古閃', lift: 1, spec: 0.8, bg: 0.6, shadow: 1, retro: 1 },
];
// 兩種一鍵美顏
//   美圖俊俊：照美圖「智能美化」，膚質加一點臉型
//   醒俊：照醒圖「一鍵美顏」，只修膚質不動臉型，整體上限 60%
const ONE_TAPS = [
  { name: '美圖俊俊', set: { smooth: 70, white: 40, slim: 15, vface: 0, eyes: 10, nose: 0, mouth: 0 } },
  { name: '醒俊', set: { smooth: 30, white: 18, slim: 0, vface: 0, eyes: 0, nose: 0, mouth: 0 } },
];
const RATIOS = [['free', '自由'], ['orig', '原比例'], [1, '1:1'], [3 / 4, '3:4'], [4 / 3, '4:3'], [9 / 16, '9:16'], [16 / 9, '16:9']];
const TEXT_COLORS = ['#ffffff', '#111111', '#ff5c8a', '#ffb36b', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];
const BG_COLORS = ['#ffffff', '#f1f3f5', '#ffe3ec', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#212529'];
const FONTS = [['-apple-system,"PingFang TC","Noto Sans TC",sans-serif', '黑體'], ['"Songti TC","Noto Serif TC",serif', '明體'], ['"Kaiti TC","BiauKai",cursive', '楷書']];

// ---------- 狀態 ----------
let R;               // Renderer
let base = null;     // { canvas, faces, seg, mask, thumbs }
let P = { ...P0 };
let texts = [];
let stickers = [];   // { kind: 'svg' | 'emoji', v, x, y, size, rot, flip, op }
let side = 'both';
let selSt = -1;
let hist = [], hi = -1;
let tab = 'adjust', cur = 'brightness', selText = -1;
let cropState = null;
let cSec = 'fx';          // 創意分頁目前在哪一區：景深、特效、光效
let exOwn = null, exN = 0; // 雙重曝光自己選的第二張照片
let frameK = 1;
const lutCache = new Map();

let WF;              // 臉型位移場
try { R = new Renderer($('#gl')); WF = new WarpField(R.gl); }
catch (e) { $('#empty p').textContent = '這個瀏覽器不支援 WebGL2，請改用新版 Safari、Chrome 或 Edge。'; }

// ---------- 小工具 ----------
let toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function busy(msg) { $('#busyText').textContent = msg || '處理中…'; $('#busy').classList.toggle('on', !!msg); }
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- 載入照片 ----------
async function loadFile(file) {
  if (!file || !R) return;
  busy('讀取照片…');
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
      const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
    });
    let w = bmp.width, h = bmp.height;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)));
    w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    P = { ...P0 }; texts = []; selText = -1; stickers = []; selSt = -1;
    hist = []; hi = -1;
    setBase(c);
    $('#empty').style.display = 'none';
    $('#wrap').classList.add('on'); $('#panel').classList.remove('off');
    ['#bSave', '#bCmp'].forEach(s => $(s).disabled = false);
    commit();
    showTab('adjust');
  } catch (e) {
    console.error(e); toast('這張照片打不開');
  } finally { busy(); }
}

function setBase(canvas, keep) {
  base = { canvas, faces: null, geoms: [], seg: null, segB: null, mask: null, mask2: null, thumbs: null, facesP: null, ...keep };
  applyBase();
}
function applyBase() {
  R.setImage(base.canvas);
  R.setMask(base.mask); R.setMask2(base.mask2);
  R.setSeg(base.matte || base.seg?.person); R.setSegB(base.segB);
  const o = $('#orig'); o.width = base.canvas.width; o.height = base.canvas.height;
  o.getContext('2d').drawImage(base.canvas, 0, 0);
  layout(); render();
  if (!base.faces) findFaces();
  if (needSeg() && !base.seg) findPerson(P.bg === 'keep');
  if (needMatte()) getMatte(base);
}

const fxById = id => FX.find(f => f.id === id);
const needSeg = () => P.bg !== 'keep' || P.light >= 0 || P.flash >= 0 || P.blur > 0 || !!fxById(P.fx)?.seg;
// 換背景、去背、景深、分身要精細到頭髮絲，用摳圖模型
const needMatte = () => P.bg !== 'keep' || P.blur > 0 || !!fxById(P.fx)?.seg;
function getMatte(b) {
  if (!b.matteP) {
    const t = setTimeout(() => b === base && !b.matte && toast('正在精細摳圖（第一次要下載模型）…', 4000), 600);
    b.matteP = matte(b.canvas).then(m => {
      clearTimeout(t);
      b.matte = m; b.segB = blurCanvas(m); b.harm = null;
      if (b === base) { R.setSeg(m); R.setSegB(b.segB); render(); }
      return m;
    }).catch(e => { clearTimeout(t); console.warn(e); b.matteP = null; if (b === base) toast('精細摳圖載入失敗，先用一般去背'); return null; });
  }
  return b.matteP;
}

// 背景先找臉和皮膚，美顏打開時就準備好了
function getSeg(b) {
  b.segP ||= segment(b.canvas).then(s => {
    b.seg = s;
    if (!b.matte) { b.segB = blurCanvas(s.person); if (b === base) { R.setSeg(s.person); R.setSegB(b.segB); render(); } }
    return s;
  })
    .catch(e => { console.warn(e); b.segP = null; return null; });
  return b.segP;
}
function findFaces() {
  const b = base;
  if (b.facesP) return b.facesP;
  b.facesP = detectFaces(b.canvas).then(async f => {
    b.faces = f; b.geoms = f.map(faceGeom);
    b.mask2 = f.length ? featureMask(f, b.canvas.width, b.canvas.height) : null;
    if (b === base) { R.setMask2(b.mask2); render(); }
    const seg = f.length ? await getSeg(b) : null;
    b.mask = f.length ? skinMask(f, b.canvas.width, b.canvas.height, seg) : null;
    if (b === base) { R.setMask(b.mask); render(); if (tab === 'beauty' || tab === 'sticker' || tab === 'makeup') showTab(tab); }
    return f;
  }).catch(e => { console.warn(e); b.faces = []; b.faceErr = true; if (b === base && (tab === 'beauty' || tab === 'makeup')) showTab(tab); return []; });
  return b.facesP;
}
async function findPerson(quiet) {
  const b = base;
  if (needMatte()) getMatte(b);
  if (b.seg) return b.seg;
  if (!quiet) busy('找出人像…');
  const s = await getSeg(b);
  if (!quiet) busy();
  if (!s) toast('人像模型載入失敗，檢查一下網路');
  return s;
}

// ---------- 畫面 ----------
function layout() {
  if (!base) return;
  const st = $('#stage').getBoundingClientRect();
  const pad = 12, w = base.canvas.width, h = base.canvas.height;
  const f = curFrame(), g = f ? f.geom(w, h) : { W: w, H: h, x: 0, y: 0 };
  const k = Math.min((st.width - pad * 2) / g.W, (st.height - pad * 2) / g.H);
  const fb = $('#fbox');
  fb.style.width = Math.round(g.W * k) + 'px'; fb.style.height = Math.round(g.H * k) + 'px';
  Object.assign($('#wrap').style, { left: Math.round(g.x * k) + 'px', top: Math.round(g.y * k) + 'px', width: Math.round(w * k) + 'px', height: Math.round(h * k) + 'px' });
  frameK = k; paintFrame();
  drawTexts(); drawStickers(); if (cropState) drawCrop();
}
// 裁切的時候先不顯示邊框
const curFrame = () => !cropState && P.frame ? frameById(P.frame) : null;
function paintFrame() {
  const fc = $('#frame'), f = curFrame();
  fc.hidden = !f;
  if (!f) return;
  const w = base.canvas.width, h = base.canvas.height, g = f.geom(w, h), k = frameK * Math.min(2, devicePixelRatio || 1);
  fc.width = Math.max(1, Math.round(g.W * k)); fc.height = Math.max(1, Math.round(g.H * k));
  const ctx = fc.getContext('2d'); ctx.setTransform(k, 0, 0, k, 0, 0);
  drawFrame(ctx, f, w, h, $('#gl'));
}
new ResizeObserver(layout).observe($('#stage'));

let raf = 0;
function render() {
  if (!base || raf) return;
  if (needMatte() && !base.matteP) getMatte(base);
  raf = requestAnimationFrame(() => {
    raf = 0;
    const lut = gradeOn(P) ? getGradeLut() : P.filter === 'none' ? null : getLut(P.filter);
    R.setLut(lut);
    draw();
    if (curFrame()?.live) paintFrame();
  });
}
function draw() {
  syncTex(); syncHair(); syncShape();
  if (bodyOn(P) && !base.body) getBody(base);
  // 身體的變形要排在最前面（長腿會改到整張照片的上下位置）
  const warps = [...(base.body ? bodyWarps(base.body, base.faces, P) : []), ...(base.faces ? [...faceWarps(base.faces, P), ...hairWarps(base.faces, P, base.hair)] : [])];
  R.render(gradeOn(P) ? { ...P, filterAmt: 100 } : P, warps, effects());
}
// 身體塑形：找人體關節，再用人像分割量身體寬度
function getBody(b) {
  b.bodyP ||= Promise.all([detectBody(b.canvas), getSeg(b), findFaces()]).then(([body, s]) => {
    measureBody(body, s);
    b.body = body;
    if (b === base) { render(); if (tab === 'body') showTab('body'); }
    return body;
  }).catch(e => { console.warn(e); b.body = { ok: false }; if (b === base && tab === 'body') showTab('body'); return b.body; });
  return b.bodyP;
}
// 頭髮：先把頭髮改好的照片交給主管線，參數沒變就不重算
let hairFx = null, hairKey = '', hairFor = null;
function syncHair() {
  const want = hairColorOn(P) && base.hair;
  const key = want ? HAIR_P0_KEYS.map(k => P[k]).join('|') : '';
  const sWant = skinOn(P) && base.skin;
  const sKey = sWant ? skinKey(P) : '';
  if (hairNeedsSeg(P) && !base.hair) getHair(base);
  if (skinOn(P) && !base.skin) getSkin(base);
  if (hairFor === base && key === hairKey && sKey === skinKeyNow) return;
  const first = hairFor !== base;
  hairFor = base; hairKey = key; skinKeyNow = sKey;
  // 先改頭髮，再改膚質，最後交給主管線
  let img = base.canvas;
  if (want) { hairFx ||= new HairFx(); img = hairFx.apply(base.canvas, base.hair, P); }
  if (sWant) { skinFx ||= new SkinFx(); img = skinFx.apply(img, base.skin, P, key); }
  if (want || sWant || !first) R.setImage(img);
}
// 膚質、祛皺：要皮膚分割和臉，同一張照片只準備一次
let skinFx = null, skinKeyNow = '';
function getSkin(b) {
  b.skinP ||= Promise.all([getSeg(b), findFaces()]).then(([s, f]) => {
    if (!s) { b.skinP = null; return null; }
    b.skin = prepSkin(b.canvas, s, f || []);
    if (b === base) { hairFor = null; render(); if (tab === 'skin') showTab('skin'); }
    return b.skin;
  }).catch(e => { console.warn(e); b.skinP = null; return null; });
  return b.skinP;
}
const HAIR_P0_KEYS = Object.keys(HAIR_P0);
function getHair(b) {
  b.hairP ||= Promise.all([getSeg(b), findFaces()]).then(([s, f]) => {
    if (!s) { b.hairP = null; return null; }
    b.hair = prepHair(b.canvas, s, f || []);
    if (b === base) { hairFor = null; render(); if (tab === 'hair') showTab('hair'); }
    return b.hair;
  }).catch(e => { console.warn(e); b.hairP = null; return null; });
  return b.hairP;
}
// 臉型：所有滑桿換成位移圖
function syncShape() {
  const sm = base.faces?.length ? shapeMoves(base.faces, P) : { moves: [], pins: [] };
  R.setDisp(WF.update(base.canvas.width, base.canvas.height, base.faces || [], sm.moves, sm.pins));
}
// 光效、背景、雙重曝光的圖：要用的時候才畫，照片比例變了就重畫
const texKey = {};
let bgStat = null, bgOwn = null, bgN = 0;
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
  return imgCache.get(src);
}
// 背景照片裁成跟人像照一樣的比例（置中鋪滿），順便算平均顏色給融合用
async function bgCanvas(W, H) {
  const img = P.bgImg === 'own' ? bgOwn : await loadImg(BG_PHOTOS.find(b => b.id === P.bgImg).src).catch(() => null);
  if (!img) return null;
  const [w, h] = fitSize(W, H, 1600), c = newCanvas(w, h), ctx = c.getContext('2d');
  const k = Math.max(w / img.width, h / img.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
  c.stat = meanColor(c);
  return c;
}
function meanColor(src, wsrc) {
  const n = 48, c = newCanvas(n, n), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let wd = null;
  if (wsrc) { const m = newCanvas(n, n), mc = m.getContext('2d', { willReadFrequently: true }); mc.drawImage(wsrc, 0, 0, n, n); wd = mc.getImageData(0, 0, n, n).data; }
  const s = [0, 0, 0]; let ws = 0;
  for (let i = 0; i < n * n; i++) {
    const wt = wd ? wd[i * 4] / 255 : 1;
    // 從 sRGB 換成線性再平均，比較接近眼睛看到的
    for (let ch = 0; ch < 3; ch++) s[ch] += Math.pow(d[i * 4 + ch] / 255, 2.2) * wt;
    ws += wt;
  }
  return s.map(v => v / Math.max(ws, 1e-6));
}
// 人要往背景的色調靠多少：色偏取一半，亮度只拉一點點
function harmony() {
  if (!bgStat || !base.matte) return null;
  base.harm ||= meanColor(base.canvas, base.matte);
  const f = base.harm, b = bgStat, lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const lf = lum(f), lb = lum(b), L = Math.pow(lb / Math.max(lf, 1e-4), 0.12);
  return [0, 1, 2].map(i => {
    const r = Math.pow((b[i] / Math.max(lb, 1e-4)) / (f[i] / Math.max(lf, 1e-4)), 0.35) * L;
    return Math.pow(Math.min(1.35, Math.max(0.75, r)), 1 / 2.2);
  });
}
function syncTex() {
  const W = base.canvas.width, H = base.canvas.height, [w, h] = fitSize(W, H);
  const want = (slot, key, make, set) => { if (texKey[slot] !== key) { texKey[slot] = key; set(key ? make() : null); } };
  want('ov', P.ov ? `${P.ov}|${w}x${h}` : '', () => paint(OVERLAYS, P.ov, w, h), c => R.setOver(c));
  const bk = P.bg === 'img' ? (P.bgImg === 'own' ? 'own' + bgN : P.bgImg) + `|${W}x${H}` : '';
  if (texKey.bg !== bk) {
    texKey.bg = bk;
    if (bk) bgCanvas(W, H).then(c => { if (texKey.bg === bk && c) { R.setBgImg(c); bgStat = c.stat; render(); } });
  }
  const mk = makeupLayer(base, P.mk);
  if (texKey.mk !== mk.key) { texKey.mk = mk.key; R.setMakeup(mk.canvas); }
  const own = P.ex === 'own' && exOwn;
  want('ex', P.fx === 'double' ? (own ? 'own' + exN : `${P.ex}|${w}x${h}`) : '', () => own ? exOwn : paint(EXPOSURES, P.ex === 'own' ? 'forest' : P.ex, ...fitSize(W, H, 1024)), c => R.setEx(c));
}
// 打光、閃光燈的參數
function effects() {
  const fx = { faces: base.geoms };
  if (P.light >= 0) {
    const L = LIGHTS[P.light], a = P.lightRot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    fx.light = { ...L, amt: P.lightAmt / 100, lights: L.lights.map(l => ({ col: l.col, dir: [l.dir[0] * c - l.dir[1] * s, l.dir[0] * s + l.dir[1] * c, l.dir[2]] })) };
  }
  if (P.flash >= 0) fx.flash = { ...FLASHES[P.flash], amt: P.flashAmt / 100 };
  const e = fxById(P.fx);
  if (e) { fx.fxMode = e.mode; fx.fxAmt = P.fxAmt / 100; }
  if (P.ov) fx.over = P.ovAmt / 100;
  fx.blur = P.blur / 100;
  if (P.bg === 'img') { fx.bgBlur = P.bgBlur / 100; fx.harm = harmony(); }
  return fx;
}
// 調色（HSL、曲線、分色）跟濾鏡合成一張 LUT，強度已經混在裡面
let gradeLut = null, gradeLutKey = '';
function getGradeLut() {
  const k = gradeKey(P) + '|' + P.filter + '|' + P.filterAmt;
  if (k !== gradeLutKey) { gradeLutKey = k; gradeLut = bakeLUT(gradeFn(P, P.filter === 'none' ? null : FILTERS.find(f => f.id === P.filter).fn)); }
  return gradeLut;
}
function getLut(id) {
  if (!lutCache.has(id)) lutCache.set(id, bakeLUT(FILTERS.find(f => f.id === id).fn));
  return lutCache.get(id);
}

// ---------- 復原、重做 ----------
function commit() {
  hist = hist.slice(0, hi + 1);
  hist.push({ base, P: clone(P), texts: clone(texts), stickers: clone(stickers) });
  if (hist.length > 40) hist.shift();
  hi = hist.length - 1;
  syncHist();
}
function restore(i) {
  hi = i;
  const s = hist[i];
  const changed = s.base !== base;
  P = clone(s.P); texts = clone(s.texts); stickers = clone(s.stickers); selText = -1; selSt = -1;
  if (changed) { base = s.base; applyBase(); } else render();
  showTab(tab); drawTexts(); drawStickers(); syncHist();
}
function syncHist() { $('#bUndo').disabled = hi <= 0; $('#bRedo').disabled = hi >= hist.length - 1; }
$('#bUndo').onclick = () => hi > 0 && restore(hi - 1);
$('#bRedo').onclick = () => hi < hist.length - 1 && restore(hi + 1);

// 按住看原圖
const cmp = on => { $('#wrap').classList.toggle('cmp', on); };
$('#bCmp').addEventListener('pointerdown', e => { e.preventDefault(); cmp(true); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#bCmp').addEventListener(ev, () => cmp(false)));

// ---------- 面板 ----------
const slider = $('#slider');
function setSlider(label, min, max, val, onInput) {
  $('#srow').classList.remove('hide');
  $('#sLabel').textContent = label;
  slider.min = min; slider.max = max; slider.value = val;
  slider._on = onInput;
  paintSlider();
}
function hideSlider() { $('#srow').classList.add('hide'); slider._on = null; }
function paintSlider() {
  const min = +slider.min, max = +slider.max, v = +slider.value;
  const pos = (v - min) / (max - min) * 100, zero = (0 - min) / (max - min) * 100;
  slider.style.setProperty('--fill-a', Math.min(pos, zero) + '%');
  slider.style.setProperty('--fill-b', Math.max(pos, zero) + '%');
  $('#sVal').textContent = v;
}
slider.addEventListener('input', () => { paintSlider(); slider._on?.(+slider.value); });
slider.addEventListener('change', () => commit());
$('#sVal').onclick = () => { if (!slider._on) return; slider.value = Math.max(+slider.min, 0); paintSlider(); slider._on(+slider.value); commit(); };

$('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); };

function item({ label, icon, on, set, onclick, cls = '', style = '' }) {
  const b = document.createElement('button');
  b.className = `it ${cls} ${on ? 'on' : ''} ${set ? 'set' : ''}`;
  b.innerHTML = `<span class="ic" style="${style}">${icon || ''}<i class="dot"></i></span>${cls.includes('wide') ? '' : `<span>${label}</span>`}`;
  b.onclick = onclick;
  return b;
}

function showTab(t) {
  if (t !== 'crop' && cropState) endCrop();
  if (t !== 'erase') eraseLeave();
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const box = $('#items'); box.innerHTML = '';
  $('#note').textContent = ''; $('#textedit').hidden = true; $('#cats').hidden = true;
  gradeHide();
  if (!base) return;
  ({ grade: tabGrade2, adjust: tabAdjust, filter: tabFilter, beauty: tabBeauty, shape: tabShape, makeup: tabMakeup, body: tabBody, hair: tabHair, skin: tabSkin, light: tabLight, sticker: tabSticker, fun: tabFun, frame: tabFrame, crop: tabCrop, cutout: tabCutout, text: tabText, erase: tabEraseHere })[t](box);
  drawTexts(); drawStickers();
  $('#wrap').classList.toggle('lightdrag', t === 'light' && P.light >= 0);
}

const isSet = k => P[k] !== 0 || (SIDED.includes(k) && (P[k + 'L'] !== 0 || P[k + 'R'] !== 0));
function paramItems(box, list, def, itemsOnly) {
  if (!itemsOnly && !list.some(x => x[0] === cur)) cur = def;
  const els = {};
  for (const [k, label, icon] of list) {
    box.append(els[k] = item({ label, icon, on: k === cur && !itemsOnly, set: isSet(k), onclick: () => {
      cur = k;
      const d = list === BEAUTY ? BEAUTY_DEF[k] : list.find(x => x[0] === k)[4];
      if (d && P[k] === 0) { P[k] = d; if (list === BEAUTY) P.oneTap = -1; render(); commit(); }
      showTab(tab);
    } }));
  }
  if (itemsOnly) return;
  const it = list.find(x => x[0] === cur);
  // 瘦臉、大眼可以只調一邊
  const sided = list === BEAUTY && SIDED.includes(cur);
  if (sided) {
    $('#note').textContent += (($('#note').textContent ? '　' : '') + '可以只調左邊或右邊');
    box.prepend(...[['both', '兩邊'], ['L', '左'], ['R', '右']].map(([sd, lb]) => item({
      label: lb, icon: lb, cls: 'wide', on: side === sd, onclick: () => { side = sd; showTab(tab); },
    })));
  }
  const key = sided && side !== 'both' ? cur + side : cur;
  setSlider(it[1] + (sided && side !== 'both' ? (side === 'L' ? '左' : '右') : ''), it[3] ?? -100, it[5] ?? 100, P[key], v => {
    P[key] = v; if (list === BEAUTY) P.oneTap = -1; render();
    els[cur].classList.toggle('set', isSet(cur));
  });
}

// 消除筆在 erase.js，這裡把它要用的東西傳過去
const eraseApp = { get base() { return base; }, setBase, commit, item, hideSlider, showTab, toast, busy };
function tabEraseHere(box) { tabErase(box, eraseApp); }

function tabAdjust(box) { paramItems(box, ADJUST, 'brightness'); }
function tabGrade2(box) {
  tabGrade(box, { P: () => P, render, commit, setSlider, hideSlider, item, note: t => { $('#note').textContent = t; }, refresh: () => showTab('grade') });
}

function tabFilter(box) {
  base.thumbs ||= FILTERS.map(f => thumb(base.canvas, f.fn));
  FILTERS.forEach((f, i) => box.append(item({
    label: f.name, cls: 'ft', on: P.filter === f.id, style: `background-image:url(${base.thumbs[i]})`,
    onclick: () => {
      if (P.filter === f.id && f.id !== 'none') return;
      P.filter = f.id; render(); commit(); showTab('filter');
    },
  })));
  if (P.filter === 'none') hideSlider();
  else setSlider('強度', 0, 100, P.filterAmt, v => { P.filterAmt = v; render(); });
}

function tabBeauty(box) {
  const faces = base.faces;
  if (!faces) { $('#note').textContent = '正在找臉…'; findFaces(); }
  else if (!faces.length) $('#note').textContent = base.faceErr ? '臉部偵測模型載入失敗，檢查一下網路再換一次照片。' : '這張照片沒找到臉，美顏只對人臉有效。';
  else $('#note').textContent = `找到 ${faces.length} 張臉`;
  ONE_TAPS.forEach((t, i) => box.append(item({
    label: t.name, icon: I.magic, on: P.oneTap === i, onclick: () => {
      const off = P.oneTap === i;
      P.oneTap = off ? -1 : i; P.oneAmt = 100;
      Object.keys(t.set).forEach(k => P[k] = off ? 0 : t.set[k]);
      cur = off ? 'smooth' : 'oneTap';
      render(); commit(); showTab('beauty');
    },
  })));
  if (cur === 'oneTap' && P.oneTap >= 0) {
    paramItems(box, BEAUTY, 'smooth', true);
    const t = ONE_TAPS[P.oneTap];
    setSlider('強度', 0, 100, P.oneAmt, v => {
      P.oneAmt = v;
      Object.keys(t.set).forEach(k => P[k] = Math.round(t.set[k] * v / 100));
      render();
    });
  } else paramItems(box, BEAUTY, 'smooth');
}

// ---------- 膚質、祛皺 ----------
let skSec = 'skin';
function tabSkin(box) {
  if (!base.faces) findFaces();
  if (!base.skin) getSkin(base);
  const list = skSec === 'skin' ? SKIN : WRINKLE;
  // 上面一排：膚質、祛皺兩類（跟醒圖美顏面板的分類一樣）
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['skin', '膚質', SKIN], ['wrinkle', '祛皺', WRINKLE]].forEach(([s, lb, l]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: skSec === s, set: l.some(x => isSet(x[0])),
    onclick: () => { skSec = s; cur = l[0][0]; showTab('skin'); },
  })));
  paramItems(box, list, list[0][0]);
  $('#note').textContent = skinNote(base, cur);
}

// ---------- 身體 ----------
function tabBody(box) {
  if (!base.body) getBody(base);
  paramItems(box, BODY, 'bodyAuto');
  $('#note').textContent = bodyNote(base.body, cur);
}

// ---------- 頭髮 ----------
function tabHair(box) {
  if (!base.faces) findFaces();
  if (!base.hair) getHair(base);
  const faces = base.faces;
  $('#note').textContent = !faces || !base.hair ? '正在找頭髮…'
    : !faces.length ? '這張照片沒找到臉，蓬鬆感和髮際線需要看得到臉。'
      : base.hair.area < 0.002 ? '這張照片裡頭髮很少，效果會不明顯。' : '';
  if (cur === 'hairDye') {
    box.append(item({ label: '原色', icon: I.off, on: !P.hairDye, onclick: () => { P.hairDye = ''; render(); commit(); showTab('hair'); } }));
    DYES.forEach(d => box.append(item({
      label: d.name, on: P.hairDye === d.id, style: `background:rgb(${d.c.map(v => Math.round(v * 255)).join(',')})`,
      onclick: () => { P.hairDye = d.id; render(); commit(); showTab('hair'); },
    })));
    box.prepend(item({ label: '返回', icon: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', onclick: () => { cur = 'hairUni'; showTab('hair'); } }));
    if (P.hairDye) setSlider('染髮', 0, 100, P.hairDyeAmt, v => { P.hairDyeAmt = v; render(); });
    else hideSlider();
    return;
  }
  box.append(item({ label: '染髮', icon: '<svg viewBox="0 0 24 24"><path d="M5 20c0-9 3-15 7-15s7 6 7 15"/><path d="M15 3l4 4-6 6-2-2z" fill="currentColor" opacity=".4"/></svg>', set: !!P.hairDye, onclick: () => { cur = 'hairDye'; showTab('hair'); } }));
  paramItems(box, HAIR, 'hairUni');
  box.append(protectItem());
}
// 背景保護開關：蓬鬆感、臉型、身體這些變形都會用到
function protectItem() {
  return item({
    label: '背景保護', on: !!P.bgProtect, set: !!P.bgProtect,
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    onclick: () => { P.bgProtect = P.bgProtect ? 0 : 1; toast(P.bgProtect ? '背景保護已開：變形時背景不會跟著彎' : '背景保護已關'); render(); commit(); showTab(tab); },
  });
}

// ---------- 美妝（makeup.js） ----------
function tabMakeup(box) {
  makeupTab(box, {
    P: () => P, base: () => base, item, setSlider, hideSlider, render, commit, findFaces,
    refresh: () => showTab('makeup'), note: t => { $('#note').textContent = t; },
  });
}

// ---------- 臉型（照醒圖的臉型面板） ----------
let shapeCat = 'face', shapeCur = '', shapeSide = 'both';
const SHAPE_IC = {
  nose: I.nose, face: I.slim, style: I.vface, eye: I.eye, mouth: I.mouth, d3: I.rotate, ratio: I.chin,
  brow: '<svg viewBox="0 0 24 24"><path d="M3 13c3-4 9-6 18-3"/><path d="M5 17c2-1 5-1.5 8-1"/></svg>',
};
function tabShape(box) {
  const faces = base.faces;
  if (!faces) { $('#note').textContent = '正在找臉…'; findFaces(); }
  else if (!faces.length) $('#note').textContent = base.faceErr ? '臉部偵測模型載入失敗，檢查一下網路再換一次照片。' : '這張照片沒找到臉，臉型只對人臉有效。';
  else $('#note').textContent = `找到 ${faces.length} 張臉`;
  const cat = SHAPE_CATS.find(c => c.id === shapeCat);
  if (!cat.items.some(it => it.id === shapeCur)) shapeCur = cat.items[0].id;
  const it = cat.items.find(x => x.id === shapeCur);
  // 上面一排：分類，最後是重置這一類
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  SHAPE_CATS.forEach(c => cats.append(item({
    label: c.name, icon: c.name, cls: 'wide', on: c.id === shapeCat, set: c.items.some(x => shapeIsSet(P, x.id)),
    onclick: () => { shapeCat = c.id; showTab('shape'); },
  })));
  cats.append(item({ label: '重置', icon: '重置', cls: 'wide', onclick: () => { resetShape(P, shapeCat); render(); commit(); showTab('shape'); } }));
  if (it.sided) {
    $('#note').textContent += '　可以只調左邊或右邊';
    box.append(...[['both', '兩邊'], ['L', '左'], ['R', '右']].map(([sd, lb]) => item({
      label: lb, icon: lb, cls: 'wide', on: shapeSide === sd, onclick: () => { shapeSide = sd; showTab('shape'); },
    })));
  }
  const side = it.sided ? shapeSide : 'both';
  const els = {};
  cat.items.forEach(x => box.append(els[x.id] = item({
    label: x.name, icon: SHAPE_IC[cat.id], on: x.id === shapeCur, set: shapeIsSet(P, x.id),
    onclick: () => {
      shapeCur = x.id;
      // 第一次點開時套用醒圖的預設強度（風格類 30~60、臉部對稱 100 等）
      if (x.def && !shapeIsSet(P, x.id)) { setShape(P, x.id, 'both', x.def); render(); commit(); }
      showTab('shape');
    },
  })));
  setSlider(it.name + (side === 'L' ? '左' : side === 'R' ? '右' : ''), it.min, 100, getShape(P, it.id, side), v => {
    setShape(P, it.id, side, v); render();
    cat.items.forEach(x => els[x.id].classList.toggle('set', shapeIsSet(P, x.id)));
  });
}

// ---------- 光影：打光、閃光燈 ----------
function tabLight(box) {
  if (!base.faces) findFaces();
  const need = () => { if (!base.seg) findPerson(true); };
  if (cur !== 'light' && cur !== 'flash') cur = P.flash >= 0 && P.light < 0 ? 'flash' : 'light';
  box.append(item({ label: '不打光', icon: I.off, on: P.light < 0, onclick: () => { P.light = -1; cur = 'light'; render(); commit(); showTab('light'); } }));
  LIGHTS.forEach((L, i) => box.append(item({
    label: L.name, icon: I.bulb, on: P.light === i, set: P.light === i,
    style: `color:rgb(${L.lights[0].col.map(c => Math.round(c * 255)).join(',')})`,
    onclick: () => { if (P.light !== i) P.lightRot = 0; P.light = i; cur = 'light'; need(); render(); commit(); showTab('light'); },
  })));
  box.append(item({ label: '不閃光', icon: I.off, on: P.flash < 0, onclick: () => { P.flash = -1; cur = 'flash'; render(); commit(); showTab('light'); } }));
  FLASHES.forEach((F, i) => box.append(item({
    label: F.name, icon: I.flash, on: P.flash === i, set: P.flash === i,
    onclick: () => { P.flash = i; cur = 'flash'; need(); render(); commit(); showTab('light'); },
  })));
  if (cur === 'light' && P.light >= 0) {
    setSlider('打光', 0, 100, P.lightAmt, v => { P.lightAmt = v; render(); });
    $('#note').textContent = '在照片上拖曳可以移動光源方向。';
  } else if (cur === 'flash' && P.flash >= 0) {
    setSlider('閃光', 0, 100, P.flashAmt, v => { P.flashAmt = v; render(); });
    $('#note').textContent = '模擬手機開閃光燈拍照的感覺。';
  } else { hideSlider(); $('#note').textContent = '打光和閃光燈可以一起用。'; }
}
// 拖曳照片轉動光源
(() => {
  let drag = null;
  const ang = e => {
    const r = $('#wrap').getBoundingClientRect(), g = base.geoms[0];
    const cx = g ? r.left + g.cx / base.canvas.width * r.width : r.left + r.width / 2;
    const cy = g ? r.top + g.cy / base.canvas.height * r.height : r.top + r.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
  };
  $('#wrap').addEventListener('pointerdown', e => {
    if (tab !== 'light' || P.light < 0 || e.target.closest('.st,.tx')) return;
    e.preventDefault(); $('#wrap').setPointerCapture(e.pointerId);
    drag = { a: ang(e), r: P.lightRot };
  });
  $('#wrap').addEventListener('pointermove', e => {
    if (!drag) return;
    P.lightRot = drag.r + ang(e) - drag.a; render();
  });
  const up = () => { if (drag) { drag = null; commit(); } };
  $('#wrap').addEventListener('pointerup', up); $('#wrap').addEventListener('pointercancel', up);
})();

// ---------- 貼紙 ----------
function tabSticker(box) {
  const faces = base.faces;
  if (!faces) findFaces();
  const st = stickers[selSt];
  if (st) {
    box.append(item({ label: '完成', icon: I.check, onclick: () => { selSt = -1; showTab('sticker'); } }));
    box.append(item({ label: '翻轉', icon: I.flip, onclick: () => { st.flip = !st.flip; drawStickers(); commit(); } }));
    box.append(item({ label: '複製', icon: I.copy, onclick: () => {
      stickers.push({ ...st, x: Math.min(0.95, st.x + 0.05), y: Math.min(0.95, st.y + 0.05) }); selSt = stickers.length - 1;
      drawStickers(); commit(); showTab('sticker');
    } }));
    box.append(item({ label: '刪除', icon: I.trash, onclick: () => { stickers.splice(selSt, 1); selSt = -1; drawStickers(); commit(); showTab('sticker'); } }));
    const modes = [['size', '大小'], ['rot', '旋轉'], ['op', '透明度']];
    if (!modes.some(m => m[0] === cur)) cur = 'size';
    modes.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: cur === k, onclick: () => { cur = k; showTab('sticker'); } })));
    if (cur === 'size') setSlider('大小', 3, 100, Math.round(st.size * 100), v => { st.size = v / 100; drawStickers(); });
    if (cur === 'rot') setSlider('旋轉', -180, 180, Math.round(st.rot * 180 / Math.PI), v => { st.rot = v * Math.PI / 180; drawStickers(); });
    if (cur === 'op') setSlider('透明', 10, 100, Math.round(st.op * 100), v => { st.op = v / 100; drawStickers(); });
    $('#note').textContent = '拖曳移動，兩指可以縮放和旋轉。';
    return;
  }
  hideSlider();
  $('#note').textContent = !faces ? '正在找臉…' : faces.length ? `臉部貼紙會自動貼到 ${faces.length} 張臉上` : '點一下加到照片上';
  STICKERS.forEach(sk => box.append(item({
    label: sk.name, cls: 'stk', icon: sk.svg, onclick: () => addSticker({ kind: 'svg', v: sk.id }, sk.face),
  })));
  EMOJIS.forEach(e => box.append(item({ label: '', cls: 'stk emo', icon: e, onclick: () => addSticker({ kind: 'emoji', v: e }) })));
}
function addSticker(s, face) {
  const W = base.canvas.width, H = base.canvas.height;
  const add = (x, y, size, rot) => stickers.push({ ...s, x: x / W, y: y / H, size: size / W, rot, flip: false, op: 1 });
  if (face && base.faces?.length) {
    base.faces.forEach(pts => faceAnchor(pts, face).forEach(a => add(a.x, a.y, a.size, a.rot)));
    selSt = -1;
  } else {
    add(W / 2, H / 2, Math.min(W, H) * 0.3, 0);
    selSt = stickers.length - 1; cur = 'size';
  }
  drawStickers(); commit(); showTab('sticker');
}
function stickerHTML(s, px) {
  if (s.kind === 'emoji') return `<span style="font-size:${px * 0.82}px;line-height:1;font-family:${EMOJI_FONT}">${s.v}</span>`;
  return stickerById(s.v).svg;
}
function drawStickers() {
  const layer = $('#stickers'), wr = $('#wrap').getBoundingClientRect();
  layer.innerHTML = '';
  stickers.forEach((s, i) => {
    const d = document.createElement('div'), px = s.size * wr.width;
    const ar = s.kind === 'svg' ? stickerById(s.v).ar : 1;
    d.className = 'st' + (i === selSt && tab === 'sticker' ? ' sel' : '');
    d.innerHTML = stickerHTML(s, px);
    Object.assign(d.style, {
      left: s.x * 100 + '%', top: s.y * 100 + '%', width: px + 'px', height: px / ar + 'px', opacity: s.op,
      transform: `translate(-50%,-50%) rotate(${s.rot}rad) scaleX(${s.flip ? -1 : 1})`,
    });
    const pts = new Map(); let g = null;
    const start = () => {
      const [a, b] = [...pts.values()];
      g = { x: s.x, y: s.y, size: s.size, rot: s.rot, p: { ...a }, d: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0, a: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0, moved: false };
    };
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start();
      if (selSt !== i || tab !== 'sticker') { selSt = i; cur = 'size'; if (tab !== 'sticker') showTab('sticker'); else showTab('sticker'); }
    });
    d.addEventListener('pointermove', e => {
      if (!g || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = $('#wrap').getBoundingClientRect(), [a, b] = [...pts.values()];
      if (b && g.d) {
        s.size = Math.max(0.02, g.size * Math.hypot(b.x - a.x, b.y - a.y) / g.d);
        s.rot = g.rot + Math.atan2(b.y - a.y, b.x - a.x) - g.a;
      } else {
        s.x = g.x + (a.x - g.p.x) / r.width; s.y = g.y + (a.y - g.p.y) / r.height;
      }
      g.moved = true;
      const px2 = s.size * r.width;
      Object.assign(d.style, { left: s.x * 100 + '%', top: s.y * 100 + '%', width: px2 + 'px', height: px2 / ar + 'px',
        transform: `translate(-50%,-50%) rotate(${s.rot}rad) scaleX(${s.flip ? -1 : 1})` });
      if (s.kind === 'emoji') d.firstChild.style.fontSize = px2 * 0.82 + 'px';
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (g?.moved && !pts.size) { commit(); if (tab === 'sticker') showTab('sticker'); }
      if (pts.size) start(); else g = null;
    };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    layer.append(d);
  });
}

// ---------- 創意玩法 ----------
const FX_ICON = { comic: '💥', pop: '🔴', sketch: '✏️', pencil: '🖍️', mosaic: '🟪', glitch: '📺', mirror: '🪞', ghost: '👥', double: '🌄' };
// 小縮圖：照片縮小一份，給光效、背景、邊框的預覽用
function small() {
  if (!base.small) {
    const [w, h] = fitSize(base.canvas.width, base.canvas.height, 160);
    base.small = newCanvas(w, h); base.small.getContext('2d').drawImage(base.canvas, 0, 0, w, h);
  }
  return base.small;
}
const thumbCache = new Map();
function thumbOf(key, make) {
  const k = key + '|' + base.canvas.width + 'x' + base.canvas.height;
  if (!thumbCache.has(k)) { if (thumbCache.size > 80) thumbCache.clear(); thumbCache.set(k, make()); }
  return thumbCache.get(k);
}
function squareThumb(draw) {
  const c = newCanvas(124, 124), ctx = c.getContext('2d'), s = small();
  const k = Math.max(124 / s.width, 124 / s.height);
  ctx.drawImage(s, (124 - s.width * k) / 2, (124 - s.height * k) / 2, s.width * k, s.height * k);
  draw?.(ctx);
  return c.toDataURL('image/jpeg', 0.8);
}
const ovThumb = o => thumbOf('ov' + o.id, () => squareThumb(ctx => { ctx.globalCompositeOperation = 'screen'; ctx.drawImage(paint(OVERLAYS, o.id, 124, 124), 0, 0); }));
const listThumb = (list, id) => thumbOf('p' + id, () => paint(list, id, 124, 124).toDataURL('image/jpeg', 0.8));

function tabFun(box) {
  [['blur', '景深'], ['fx', '特效'], ['ov', '光效']].forEach(([k, lb]) => box.append(item({
    label: lb, icon: lb, cls: 'wide', on: cSec === k, set: k === 'blur' ? P.blur > 0 : k === 'fx' ? !!P.fx : !!P.ov,
    onclick: () => { cSec = k; if (k === 'blur' && !P.blur) { P.blur = 60; findPerson(true); render(); commit(); } showTab('fun'); },
  })));
  if (cSec === 'blur') {
    box.append(item({ label: '關閉', icon: I.off, on: !P.blur, onclick: () => { P.blur = 0; render(); commit(); showTab('fun'); } }));
    setSlider('虛化', 0, 100, P.blur, v => { P.blur = v; if (v) findPerson(true); render(); });
    $('#note').textContent = base.seg ? '自動找出人像，把背景模糊掉，像大光圈拍的。' : '正在找人像…';
    if (!base.seg && P.blur) findPerson(true).then(() => tab === 'fun' && showTab('fun'));
    return;
  }
  if (cSec === 'fx') {
    box.append(item({ label: '無', icon: I.off, on: !P.fx, onclick: () => { P.fx = ''; render(); commit(); showTab('fun'); } }));
    FX.forEach(e => box.append(item({
      label: e.name, icon: FX_ICON[e.id], cls: 'emo2', on: P.fx === e.id,
      onclick: async () => {
        if (P.fx !== e.id) { P.fx = e.id; P.fxAmt = e.def; }
        showTab('fun'); render(); commit();
        if (e.seg && !base.seg) { await findPerson(); render(); }
      },
    })));
    const e = fxById(P.fx);
    if (!e) { hideSlider(); $('#note').textContent = '漫畫、素描、分身、雙重曝光這些都在這裡。'; return; }
    setSlider('強度', 0, 100, P.fxAmt, v => { P.fxAmt = v; render(); });
    $('#note').textContent = { ghost: '自動找出人像，往旁邊複製出殘影。', double: '人的輪廓裡透出第二張圖，可以換成自己的照片。', mirror: '左半邊鏡射到右邊。' }[e.id] || '';
    if (e.id === 'double') {
      EXPOSURES.forEach(x => box.append(item({ label: x.name, cls: 'ft', on: P.ex === x.id, style: `background-image:url(${listThumb(EXPOSURES, x.id)})`,
        onclick: () => { P.ex = x.id; render(); commit(); showTab('fun'); } })));
      box.append(item({ label: '選照片', icon: I.plus, on: P.ex === 'own', onclick: () => $('#file2').click() }));
    }
    return;
  }
  box.append(item({ label: '無', icon: I.off, on: !P.ov, onclick: () => { P.ov = ''; render(); commit(); showTab('fun'); } }));
  OVERLAYS.forEach(o => box.append(item({
    label: o.name, cls: 'ft', on: P.ov === o.id, style: `background-image:url(${ovThumb(o)})`,
    onclick: () => { if (P.ov !== o.id) P.ovAmt = 80; P.ov = o.id; render(); commit(); showTab('fun'); },
  })));
  if (P.ov) setSlider('強度', 0, 100, P.ovAmt, v => { P.ovAmt = v; render(); });
  else hideSlider();
  $('#note').textContent = '漏光、光斑、星光這些光效，可以跟特效一起用。';
}
$('#file3').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    bgOwn = await createImageBitmap(file, { imageOrientation: 'from-image' }); bgN++;
    P.bg = 'img'; P.bgImg = 'own'; render(); commit(); showTab('cutout');
  } catch (err) { console.error(err); toast('這張照片打不開'); }
};
$('#file2').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const [w, h] = fitSize(bmp.width, bmp.height, 1600);
    exOwn = newCanvas(w, h); exOwn.getContext('2d').drawImage(bmp, 0, 0, w, h); exN++;
    P.ex = 'own'; render(); commit(); showTab('fun');
  } catch (err) { console.error(err); toast('這張照片打不開'); }
};

// ---------- 邊框 ----------
function frameThumb(f) {
  return thumbOf('f' + f.id, () => {
    const s = small(), g = f.geom(s.width, s.height), k = 124 / Math.max(g.W, g.H);
    const c = newCanvas(124, 124), ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(0, 0, 124, 124);
    ctx.translate((124 - g.W * k) / 2, (124 - g.H * k) / 2); ctx.scale(k, k);
    drawFrame(ctx, f, s.width, s.height, s, (cx, gg) => cx.drawImage(s, gg.x, gg.y));
    return c.toDataURL('image/jpeg', 0.85);
  });
}
function tabFrame(box) {
  hideSlider();
  box.append(item({ label: '拼貼範本', icon: I.grid, onclick: async () => {
    busy('準備中…'); let c; try { c = await compose(); } finally { busy(); render(); }
    openCollage('tpl', [c]);
  } }));
  box.append(item({ label: '無', icon: I.off, on: !P.frame, onclick: () => { P.frame = ''; layout(); commit(); showTab('frame'); } }));
  FRAMES.forEach(f => box.append(item({
    label: f.name, cls: 'ft', on: P.frame === f.id, style: `background-image:url(${frameThumb(f)});background-size:contain;background-repeat:no-repeat`,
    onclick: () => { P.frame = f.id; layout(); commit(); showTab('frame'); },
  })));
  $('#note').textContent = P.frame ? '存檔時邊框會一起存進去。' : '拍立得、底片、模糊背景這些邊框，存檔會一起存進去。';
}

// ---------- 裁切、旋轉 ----------
function tabCrop(box) {
  hideSlider();
  if (!cropState) startCrop();
  RATIOS.forEach(([r, label]) => box.append(item({
    label, cls: 'wide', icon: label, on: cropState.ratio === r, onclick: () => { setRatio(r); showTab('crop'); },
  })));
  box.append(item({ label: '旋轉', icon: I.rotate, onclick: () => transform('rot') }));
  box.append(item({ label: '左右翻轉', icon: I.flip, onclick: () => transform('flipH') }));
  box.append(item({ label: '上下翻轉', icon: I.flipv, onclick: () => transform('flipV') }));
  box.append(item({ label: '套用裁切', icon: I.check, onclick: applyCrop }));
  $('#note').textContent = '拖曳框框或四個角來裁切，按「套用裁切」完成。';
}
function startCrop() {
  cropState = { x: 0, y: 0, w: 1, h: 1, ratio: 'free' };
  $('#crop').classList.add('on'); layout();
}
function endCrop() { cropState = null; $('#crop').classList.remove('on'); layout(); }
function setRatio(r) {
  cropState.ratio = r;
  if (r === 'free') return drawCrop();
  const W = base.canvas.width, H = base.canvas.height;
  const ar = r === 'orig' ? W / H : r;
  // 以目前框的中心，取最大的指定比例
  let w = 1, h = (W / ar) / H;
  if (h > 1) { h = 1; w = (H * ar) / W; }
  const cx = cropState.x + cropState.w / 2, cy = cropState.y + cropState.h / 2;
  Object.assign(cropState, { w, h, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)) });
  drawCrop();
}
function drawCrop() {
  const c = cropState, el = $('#crop');
  const b = el.querySelector('.box'), [s1, s2, s3, s4] = el.querySelectorAll('.shade');
  const pc = v => (v * 100) + '%';
  Object.assign(b.style, { left: pc(c.x), top: pc(c.y), width: pc(c.w), height: pc(c.h) });
  Object.assign(s1.style, { left: 0, top: 0, width: '100%', height: pc(c.y) });
  Object.assign(s2.style, { left: 0, top: pc(c.y + c.h), width: '100%', height: pc(1 - c.y - c.h) });
  Object.assign(s3.style, { left: 0, top: pc(c.y), width: pc(c.x), height: pc(c.h) });
  Object.assign(s4.style, { left: pc(c.x + c.w), top: pc(c.y), width: pc(1 - c.x - c.w), height: pc(c.h) });
}
(() => {
  const el = $('#crop'); let drag = null;
  el.addEventListener('pointerdown', e => {
    if (!cropState) return;
    const h = e.target.dataset.h || (e.target.closest('.box') ? 'move' : null);
    if (!h) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    drag = { h, x: e.clientX, y: e.clientY, s: { ...cropState } };
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = $('#wrap').getBoundingClientRect();
    const dx = (e.clientX - drag.x) / r.width, dy = (e.clientY - drag.y) / r.height, s = drag.s, c = cropState;
    const MIN = 0.05;
    if (drag.h === 'move') {
      c.x = Math.min(1 - s.w, Math.max(0, s.x + dx)); c.y = Math.min(1 - s.h, Math.max(0, s.y + dy));
    } else {
      let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
      if (drag.h.includes('l')) x0 = Math.min(x1 - MIN, Math.max(0, x0 + dx));
      if (drag.h.includes('r')) x1 = Math.max(x0 + MIN, Math.min(1, x1 + dx));
      if (drag.h.includes('t')) y0 = Math.min(y1 - MIN, Math.max(0, y0 + dy));
      if (drag.h.includes('b')) y1 = Math.max(y0 + MIN, Math.min(1, y1 + dy));
      if (c.ratio !== 'free') {
        // 固定比例：以寬為準調整高度
        const W = base.canvas.width, H = base.canvas.height, ar = c.ratio === 'orig' ? W / H : c.ratio;
        let w = x1 - x0, h = w * W / ar / H;
        const maxH = drag.h.includes('t') ? y1 : 1 - y0;
        if (h > maxH) { h = maxH; w = h * H * ar / W; if (drag.h.includes('l')) x0 = x1 - w; else x1 = x0 + w; }
        if (drag.h.includes('t')) y0 = y1 - h; else y1 = y0 + h;
      }
      Object.assign(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    drawCrop();
  });
  const up = () => { drag = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
})();

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function applyCrop() {
  const c = cropState, W = base.canvas.width, H = base.canvas.height;
  if (c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999) return toast('先拖曳框框選範圍');
  const sx = Math.round(c.x * W), sy = Math.round(c.y * H), sw = Math.max(1, Math.round(c.w * W)), sh = Math.max(1, Math.round(c.h * H));
  const out = newCanvas(sw, sh);
  out.getContext('2d').drawImage(base.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  // 文字跟著新的範圍移動
  [...texts, ...stickers].forEach(t => { t.x = (t.x - c.x) / c.w; t.y = (t.y - c.y) / c.h; t.size = t.size / c.w; });
  setBase(out);
  cropState = { x: 0, y: 0, w: 1, h: 1, ratio: c.ratio };
  drawCrop(); commit();
}
function transform(kind) {
  const W = base.canvas.width, H = base.canvas.height;
  const out = kind === 'rot' ? newCanvas(H, W) : newCanvas(W, H), ctx = out.getContext('2d');
  if (kind === 'rot') { ctx.translate(H, 0); ctx.rotate(Math.PI / 2); }
  if (kind === 'flipH') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  if (kind === 'flipV') { ctx.translate(0, H); ctx.scale(1, -1); }
  ctx.drawImage(base.canvas, 0, 0);
  [...texts, ...stickers].forEach(t => {
    if (kind === 'rot') { const x = t.x; t.x = 1 - t.y; t.y = x; t.size *= W / H; }
    if (kind === 'flipH') t.x = 1 - t.x;
    if (kind === 'flipV') t.y = 1 - t.y;
  });
  stickers.forEach(s => {
    if (kind === 'rot') s.rot += Math.PI / 2;
    if (kind === 'flipH') { s.rot = -s.rot; s.flip = !s.flip; }
    if (kind === 'flipV') { s.rot = Math.PI - s.rot; s.flip = !s.flip; }
  });
  setBase(out);
  if (cropState) { cropState = { x: 0, y: 0, w: 1, h: 1, ratio: cropState.ratio }; if (cropState.ratio !== 'free') setRatio(cropState.ratio); drawCrop(); }
  commit();
}

// ---------- 去背 ----------
function tabCutout(box) {
  hideSlider();
  const opts = [['keep', '保留背景', I.person], ['clear', '透明', ''], ['color', '換底色', ''], ['img', '換背景', '']];
  opts.forEach(([k, label, icon]) => box.append(item({
    label, icon, on: P.bg === k,
    style: k === 'clear' ? 'background:repeating-conic-gradient(#555 0 25%,#333 0 50%) 0 0/12px 12px' : k === 'color' ? `background:${P.bgColor}`
      : k === 'img' ? `background:url(${P.bgImg === 'own' ? '' : BG_PHOTOS.find(b => b.id === P.bgImg).src}) center/cover` : '',
    onclick: async () => {
      P.bg = k; showTab('cutout');
      if (k !== 'keep') await findPerson();
      render(); commit();
    },
  })));
  if (P.bg === 'color') {
    BG_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'sw' + (P.bgColor === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
      b.onclick = () => { P.bgColor = c; render(); commit(); showTab('cutout'); };
      box.append(b);
    });
    const pick = document.createElement('button');
    pick.className = 'sw'; pick.style.cssText = 'align-self:center;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
    pick.onclick = () => { const cp = $('#colorPick'); cp.value = P.bgColor; cp.oninput = () => { P.bgColor = cp.value; render(); }; cp.onchange = () => { commit(); showTab('cutout'); }; cp.click(); };
    box.append(pick);
  }
  if (P.bg === 'img') {
    box.append(item({ label: '選照片', icon: I.plus, on: P.bgImg === 'own', onclick: () => $('#file3').click() }));
    BG_PHOTOS.forEach(b => box.append(item({
      label: b.name, cls: 'ft', on: P.bgImg === b.id, style: `background-image:url(${b.src})`,
      onclick: () => { P.bgImg = b.id; render(); commit(); showTab('cutout'); },
    })));
    setSlider('背景虛化', 0, 100, P.bgBlur, v => { P.bgBlur = v; render(); });
  } else hideSlider();
  $('#note').textContent = P.bg === 'clear' ? '透明背景會存成 PNG。' : '自動找出照片裡的人，換掉背景。';
}

// ---------- 文字 ----------
function tabText(box) {
  box.append(item({ label: '加文字', icon: I.plus, onclick: () => {
    texts.push({ text: '輸入文字', x: 0.5, y: 0.5, size: 0.08, color: '#ffffff', stroke: true, font: 0 });
    selText = texts.length - 1; drawTexts(); commit(); showTab('text');
    setTimeout(() => { const ti = $('#textInput'); ti.focus(); ti.select(); }, 50);
  } }));
  const t = texts[selText];
  if (!t) {
    hideSlider();
    $('#note').textContent = texts.length ? '點一下照片上的文字來編輯，拖曳可以移動。' : '';
    return;
  }
  $('#textedit').hidden = false;
  const ti = $('#textInput'); ti.value = t.text;
  ti.oninput = () => { t.text = ti.value; drawTexts(); };
  ti.onchange = () => commit();
  box.append(item({ label: '描邊', icon: I.stroke, on: t.stroke, onclick: () => { t.stroke = !t.stroke; drawTexts(); commit(); showTab('text'); } }));
  box.append(item({ label: FONTS[t.font][1], icon: I.font, onclick: () => { t.font = (t.font + 1) % FONTS.length; drawTexts(); commit(); showTab('text'); } }));
  box.append(item({ label: '刪除', icon: I.trash, onclick: () => { texts.splice(selText, 1); selText = -1; drawTexts(); commit(); showTab('text'); } }));
  TEXT_COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw' + (t.color === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
    b.onclick = () => { t.color = c; drawTexts(); commit(); showTab('text'); };
    box.append(b);
  });
  setSlider('大小', 2, 30, Math.round(t.size * 100), v => { t.size = v / 100; drawTexts(); });
}
function drawTexts() {
  const layer = $('#texts'), wr = $('#wrap').getBoundingClientRect();
  layer.innerHTML = '';
  texts.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'tx' + (i === selText && tab === 'text' ? ' sel' : '');
    d.textContent = t.text || ' ';
    Object.assign(d.style, {
      left: t.x * 100 + '%', top: t.y * 100 + '%', fontSize: t.size * wr.width + 'px', color: t.color, fontFamily: FONTS[t.font][0],
      textShadow: t.stroke ? strokeShadow(t.color, Math.max(1, t.size * wr.width / 16)) : 'none',
    });
    let drag = null;
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false };
      if (selText !== i || tab !== 'text') { selText = i; showTab('text'); drawTexts(); }
    });
    d.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = $('#wrap').getBoundingClientRect();
      t.x = drag.tx + (e.clientX - drag.x) / r.width; t.y = drag.ty + (e.clientY - drag.y) / r.height;
      d.style.left = t.x * 100 + '%'; d.style.top = t.y * 100 + '%'; drag.moved = true;
    });
    d.addEventListener('pointerup', () => { if (drag?.moved) commit(); drag = null; });
    layer.append(d);
  });
}
const strokeColor = c => (parseInt(c.slice(1, 3), 16) * 299 + parseInt(c.slice(3, 5), 16) * 587 + parseInt(c.slice(5, 7), 16) * 114) / 1000 > 140 ? '#000' : '#fff';
function strokeShadow(c, w) {
  const s = strokeColor(c), o = [];
  for (let a = 0; a < 16; a++) o.push(`${(Math.cos(a / 8 * Math.PI) * w).toFixed(1)}px ${(Math.sin(a / 8 * Math.PI) * w).toFixed(1)}px 0 ${s}`);
  return o.join(',');
}
$('#stage').addEventListener('pointerdown', e => {
  if (tab === 'text' && !e.target.closest('.tx') && selText >= 0) { selText = -1; drawTexts(); showTab('text'); }
  if (tab === 'sticker' && !e.target.closest('.st') && selSt >= 0) { selSt = -1; drawStickers(); showTab('sticker'); }
});

// ---------- 儲存 ----------
// 把目前的成品（含邊框、貼紙、文字）畫成一張 canvas，存檔和「拼貼／範本」共用
async function compose() {
  draw();
  const W = base.canvas.width, H = base.canvas.height, gl = $('#gl'), f = P.frame ? frameById(P.frame) : null;
  const g = f ? f.geom(W, H) : { W, H, x: 0, y: 0 };
  // iPhone 的 canvas 最大約 1600 萬像素，邊框加大後超過就整張等比縮小
  const sc = Math.min(1, Math.sqrt(16e6 / (g.W * g.H)));
  const out = newCanvas(g.W * sc, g.H * sc), ctx = out.getContext('2d');
  ctx.scale(sc, sc);
  if (f) drawFrame(ctx, f, W, H, gl, (c, gg) => c.drawImage(gl, gg.x, gg.y, W, H));
  else ctx.drawImage(gl, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, W, H); ctx.clip(); ctx.translate(g.x, g.y);
  for (const s of stickers) {
    const w = s.size * W;
    ctx.save(); ctx.globalAlpha = s.op; ctx.translate(s.x * W, s.y * H); ctx.rotate(s.rot); if (s.flip) ctx.scale(-1, 1);
    if (s.kind === 'emoji') {
      ctx.font = `${w * 0.82}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.v, 0, 0);
    } else {
      const h = w / stickerById(s.v).ar;
      ctx.drawImage(await stickerImage(s.v), -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
  for (const t of texts) {
    const fs = t.size * W;
    ctx.font = `700 ${fs}px ${FONTS[t.font][0]}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = (t.text || '').split('\n'), lh = fs * 1.2, y0 = t.y * H - (lines.length - 1) * lh / 2;
    lines.forEach((ln, i) => {
      if (t.stroke) { ctx.lineWidth = fs / 8; ctx.lineJoin = 'round'; ctx.strokeStyle = strokeColor(t.color); ctx.strokeText(ln, t.x * W, y0 + i * lh); }
      ctx.fillStyle = t.color; ctx.fillText(ln, t.x * W, y0 + i * lh);
    });
  }
  ctx.restore();
  return out;
}
async function save() {
  if (!base) return;
  busy('輸出中…');
  try {
    const out = await compose();
    const png = P.bg === 'clear';
    const blob = await new Promise(r => out.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.95));
    const name = `隨手修-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${png ? 'png' : 'jpg'}`;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('已下載');
    }
  } catch (e) { console.error(e); toast('儲存失敗'); }
  finally { busy(); render(); }
}
$('#bSave').onclick = save;

// ---------- 開啟照片 ----------
$('#bPick').onclick = () => $('#file').click();
$('#bOpen').onclick = () => $('#file').click();
$('#bCam').onclick = () => $('#cam').click();
// 拼貼、範本：一次選多張照片
let multiFor = 'grid';
$('#bCollage').onclick = () => { multiFor = 'grid'; $('#fileMulti').click(); };
$('#bTpl').onclick = () => { multiFor = 'tpl'; $('#fileMulti').click(); };
$('#fileMulti').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) openCollage(multiFor, f); };
initCollage({ loadFile, toast, busy });
['#file', '#cam'].forEach(s => $(s).onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });
addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });

// 給自動測試用
window.__editor = { loadFile, get P() { return P; }, get base() { return base; }, get stickers() { return stickers; }, showTab, save, render };
