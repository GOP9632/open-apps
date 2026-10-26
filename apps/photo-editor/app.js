import { Renderer } from './gl.js';
import { FILTERS, bakeLUT, thumb, filterFn, skinFilterFn, hairFilterFn } from './filters.js';
import { loadXT, xtData, xtItem } from './xt.js';
import { detectFaces, segment, skinMask, faceWarps, featureMask, faceGeom, blurCanvas, faceAnchor } from './ai.js';
import { COVERS, COVER_CATS, coverPixels } from './coverface.js';
import { STICKERS, STICKER_CATS, EMOJIS, EMOJI_FONT, BLENDS, blendById, stickerAR, stickerURL, svgURL, renderSticker, putCanvas, getCanvas, canvasURL, touchCanvas, ownImages, NET_PACKS, netURL, loadNetSticker } from './stickers.js';
import { FX, OVERLAYS, BG_PHOTOS, FRAMES, frameById, drawFrame, paint, fitSize } from './creative.js';
import { matte, LOW_MEM } from './matte.js';
import { GRADE_P0, gradeOn, gradeFn, gradeKey, tabGrade, gradeHide } from './grade.js';
import { HAIR, HAIR_P0, DYES, HairFx, prepHair, hairWarps, hairNeedsSeg, hairColorOn } from './hair.js';
import { tabErase, eraseLeave } from './erase.js';
import { makeupLayer, makeupTab, SCULPT, SC_COLOR, SC_P0 } from './makeup.js';
import { SKIN, TONE, WRINKLE, AI_FACE, AI_BODY, SKIN_P0, skinOn, skinKey, prepSkin, SkinFx, skinNote } from './skin.js';
import { BODY, BODY_P0, BODY_MAN, REG_OF, bodyOn, detectBody, measureBody, bodyWarps, manualWarps, manualRegion, bodyNote } from './body.js';
import { SHAPE_CATS, setShape, getShape, shapeIsSet, shapeMoves, resetShape } from './faceshape.js';
import { WarpField } from './warpfield.js';
import { RESHAPE, liqDab, liqMoves, liqRadius } from './reshape.js';
import { tabDoodle, doodleInput } from './doodle.js';
import { tabBeautyBrush, beautyBrushInput } from './beautybrush.js';
import { FONTS, T0, TEXT_COLORS, TEXT_FX, TEMPLATES, applyTemplate, upgradeText, loadFont, layout as textLayout, pad, drawText } from './text.js';
import { initCollage, openCollage } from './collage.js';
import { CATS as TPL_CATS } from './templates.js';
import { buildDepth, LIGHT_CATS, LIGHTS, FLASHES, litParams, lightPosOf, lightGrad, flashStats } from './relight.js';
import { enhanceRanges, paintRange, setGrad, nudge, canvasZoom } from './ui.js';
import { tabLooks } from './looks.js';
import { STROKES, STROKE_COLORS, STROKE0, strokeLayer, alphaFromMatte, alphaBox } from './outline.js';
import { SHAPES, MASK0, LAYER_LIMIT, shapePath, photoLayer, cutLayer, layerInfo, cloneAlpha, compose as composeLayer, brush } from './layers.js';
import { POPS, POP_BGS, POP_P0, drawPop } from './popout.js';

const $ = s => document.querySelector(s);
const MAX_SIDE = 4096, MAX_AREA = 16e6;

const P0 = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, temp: 0, tint: 0, highlights: 0, shadows: 0,
  sharpen: 0, vignette: 0, grain: 0, fade: 0, vibrance: 0, structure: 0, texture: 0, lightSense: 0, backlight: 0, flashFill: 0,
  filter: 'none', filterAmt: 60, // 照 Hypic：濾鏡強度預設 60
  smooth: 0, white: 0, slim: 0, vface: 0, eyes: 0, nose: 0, mouth: 0,
  chin: 0, dark: 0, fold: 0, eyeb: 0, teeth: 0, slimL: 0, slimR: 0, eyesL: 0, eyesR: 0,
  bg: 'keep', bgColor: '#ffffff',
  oneTap: -1, oneAmt: 100,
  light: '', lightAmt: 100, lightBri: 50, lightCol: null, lightDist: 50, lightSpec: null, lightGloss: null, lightBlur: 0, lightFg: 0, lightBg: 0, lightX: null, lightY: null, lightSeed: 0, flash: '', flashAmt: 60,
  blur: 0, blurStyle: 'classic', blurSize: 55, fx: '', fxAmt: 80, ov: '', ovAmt: 80, ex: 'lake', bgImg: 'beach', bgBlur: 30, frame: '',
  ...HAIR_P0,
  bgProtect: 1, // 背景保護：變形時背景不跟著彎
  liq: [], // 重新塑形（液化）畫的每一點，見 reshape.js
  mk: {}, mkLook: -1, mkLookAmt: 100,
  look: '', lookAmt: 100, // 一鍵出片
  ...BODY_P0,
  ...GRADE_P0,
  ...SKIN_P0, ...SC_P0,
  ...POP_P0,
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
  vib: '<svg viewBox="0 0 24 24"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/></svg>',
  struct: '<svg viewBox="0 0 24 24"><path d="M3 20l6-10 4 6 3-4 5 8z"/></svg>',
  texture: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity=".6"/></svg>',
  lsense: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/><path d="M12 8a4 4 0 0 1 0 8z" fill="currentColor"/></svg>',
  backlit: '<svg viewBox="0 0 24 24"><circle cx="17" cy="6" r="3"/><circle cx="9" cy="10" r="3"/><path d="M3 21c1-4 3-6 6-6s5 2 6 6"/></svg>',
  off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
  flashA: '<svg viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
  merge: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".6"/></svg>',
};

const ADJUST = [
  ['flashFill', '閃光燈', I.flashA, 0, 60, 100], ['brightness', '亮度', I.sun], ['lightSense', '光感', I.lsense], ['exposure', '曝光', I.exposure], ['contrast', '對比', I.contrast], ['saturation', '飽和', I.drop],
  ['vibrance', '自然飽和', I.vib], ['texture', '質感', I.texture, 0], ['sharpen', '銳化', I.sharp, 0], ['structure', '結構', I.struct],
  ['highlights', '高光', I.high], ['shadows', '陰影', I.shadow], ['backlight', '背光校正', I.backlit, 0], ['temp', '色溫', I.temp], ['tint', '色調', I.tint],
  ['grain', '顆粒', I.grain, 0], ['fade', '褪色', I.fade, 0], ['vignette', '暗角', I.vig],
];
const BEAUTY = [
  ['smooth', '磨皮', I.skin, 0], ['white', '美白', I.white, 0], ['dark', '黑眼圈', I.dark, 0], ['fold', '法令紋', I.fold, 0],
  ['eyeb', '亮眼', I.eyeb, 0], ['teeth', '白牙', I.teeth, 0],
  ['slim', '瘦臉', I.slim, 0], ['vface', '小 V 臉', I.vface, 0], ['chin', '下巴', I.chin],
  ['eyes', '大眼', I.eye], ['nose', '瘦鼻', I.nose], ['mouth', '嘴巴', I.mouth],
];
// 第一次點開時的起始強度，照醒圖點開滑桿時的預設值
const BEAUTY_DEF = { white: 60, slim: 50 }; // 瘦臉點開 50 照 Hypic
// 可以左右分開調的項目
const SIDED = ['slim', 'eyes'];
// 兩種一鍵美顏
//   美圖俊俊：照美圖「智能美化」，膚質加一點臉型
//   醒俊：照醒圖「一鍵美顏」，只修膚質不動臉型，整體上限 60%
const ONE_TAPS = [
  { name: '美圖俊俊', set: { smooth: 70, white: 40, slim: 15, vface: 0, eyes: 10, nose: 0, mouth: 0 } },
  { name: '醒俊', set: { smooth: 30, white: 18, slim: 0, vface: 0, eyes: 0, nose: 0, mouth: 0 } },
];
const RATIOS = [['free', '自由'], ['orig', '原比例'], [1, '1:1'], [3 / 4, '3:4'], [4 / 3, '4:3'], [9 / 16, '9:16'], [16 / 9, '16:9']];
const BG_COLORS = ['#ffffff', '#f1f3f5', '#ffe3ec', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#212529'];

// ---------- 狀態 ----------
let R;               // Renderer
let base = null;     // { canvas, faces, seg, mask, thumbs }
let P = { ...P0 };
let texts = [];
let stickers = [];   // { kind: 'svg' | 'emoji' | 'img', v, x, y, size, rot, flip, flipv, op, blend, mask }
let side = 'both';
let selSt = -1;
let hist = [], hi = -1;
let tab = 'beauty', cur = 'brightness', selText = -1;
let cropState = null;
let landing = false;  // 剛開照片、使用者還沒自己換分頁
// 景深的 6 種光斑樣式，名稱照 Hypic 背景模糊
const bi = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const BOKEH = [
  ['galaxy', '銀河', bi('<path d="M12 4v16M4 12h16" stroke-width="1.2"/><path d="M7 7l10 10M17 7L7 17" stroke-width=".8" opacity=".6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>')],
  ['cateye', '貓眼', bi('<path d="M4 12c3-5 13-5 16 0-3 5-13 5-16 0z"/><circle cx="12" cy="12" r="2.5" fill="currentColor" opacity=".5"/>')],
  ['swirl', '漩渦散景', bi('<path d="M12 12c0-2 3-2 3 0s-2 5-6 4-5-6-1-9 11-1 10 5"/>')],
  ['classic', '經典', bi('<circle cx="8" cy="9" r="3.5" fill="currentColor" opacity=".35"/><circle cx="16" cy="10" r="4" fill="currentColor" opacity=".55"/><circle cx="11" cy="16" r="3" fill="currentColor" opacity=".45"/>')],
  ['motion', '動態', bi('<path d="M4 8h12M2 12h16M5 16h11"/><circle cx="19" cy="12" r="2" fill="currentColor"/>')],
  ['heart', '愛心', bi('<path d="M12 19s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5c0 5-7 9.5-7 9.5z" fill="currentColor" opacity=".5"/>')],
];
// 跟 gl.js 的散景樣式編號對上：經典 0、愛心 1、貓眼 2、漩渦 3、動態 4、銀河 5
const BOKEH_GL = { classic: 0, heart: 1, cateye: 2, swirl: 3, motion: 4, galaxy: 5 };
let blurK = 'blur';
let cSec = 'pop';         // 創意分頁目前在哪一區：出框、景深、特效、光效
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
    ['#bSave', '#bCmp', '#bResetAll'].forEach(s => $(s).disabled = false);
    view.reset(); $('#zoom').classList.add('on');
    commit();
    // 照 Hypic：人像照進來先停在「人像」；找不到臉就改停在濾鏡
    landing = true; showTab('beauty');
  } catch (e) {
    console.error(e); toast('這張照片打不開');
  } finally { busy(); }
}

const BASE0 = { faces: null, geoms: [], seg: null, segB: null, mask: null, mask2: null, thumbs: null, facesP: null };
function setBase(canvas, keep) {
  const old = base;
  base = { canvas, ...BASE0, ...keep };
  applyBase();
  if (old) shelve(old);
}
// 復原紀錄裡的舊照片：一張原尺寸照片在 iPhone 要 50MB 左右，塗鴉、消除、美顏筆每畫一筆就多一張，
// 存太多 Safari 會把整頁重新載入（修到一半跳回選照片）。不在畫面上的舊照片壓成檔案，復原時再解開
const shelving = new WeakSet();
function shelve(b) {
  const c = b.canvas;
  if (!c || shelving.has(b) || !hist.some(h => h.base === b)) return;
  shelving.add(b);
  c.toBlob(blob => {
    shelving.delete(b);
    if (!blob || b === base || b.canvas !== c) return;
    Object.assign(b, { canvas: null, blob, w: c.width, h: c.height });
    new Set(hist.map(h => h.base)).forEach(strip);
  }, hasAlpha(c) ? 'image/png' : 'image/jpeg', 0.95);
}
// 壓起來的舊照片：跟現在這張共用的偵測結果（臉、人像）留著；不共用的放掉，復原時再重算
function strip(b) {
  if (!b.blob || !('facesP' in b) || b.facesP === base.facesP) return;
  const { blob, w, h } = b;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, { canvas: null, blob, w, h });
}
async function unshelve(b) {
  if (b.canvas) return;
  const bmp = await createImageBitmap(b.blob), c = newCanvas(b.w, b.h);
  c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
  if (!('facesP' in b)) Object.assign(b, BASE0);
  b.canvas = c; b.blob = null;
}
function hasAlpha(c) {
  const t = newCanvas(32, 32), x = t.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
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
const needSeg = () => P.bg !== 'keep' || !!P.light || !!P.flash || P.blur > 0 || !!P.flashFill || !!fxById(P.fx)?.seg;
// 換背景、去背、景深、分身要精細到頭髮絲，用摳圖模型
const needMatte = () => P.bg !== 'keep' || P.blur > 0 || !!fxById(P.fx)?.seg || !!P.pop;
function getMatte(b) {
  if (!b.matteP) {
    const t = setTimeout(() => b === base && !b.matte && toast(LOW_MEM ? '正在摳出人像…' : '正在精細摳圖（第一次要下載模型）…', 4000), 600);
    b.matteP = matte(b.canvas).then(m => {
      clearTimeout(t);
      b.matte = m; b.segB = blurCanvas(m); b.harm = null;
      if (b === base) { R.setSeg(m); R.setSegB(b.segB); render(); if (tab === 'fun' && cSec === 'pop') showTab('fun'); }
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
    if (b === base && !f.length && landing && tab === 'beauty') { landing = false; showTab('filter'); }
    const seg = f.length ? await getSeg(b) : null;
    b.mask = f.length ? skinMask(f, b.canvas.width, b.canvas.height, seg, b.canvas) : null;
    b.flashSt = seg && b.mask ? flashStats(b.canvas, seg, b.mask, b.geoms[0]) : null;
    if (b === base) { R.setMask(b.mask); render(); if (tab === 'beauty' || tab === 'sticker' || tab === 'makeup' || tab === 'looks') showTab(tab); }
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
  frameK = k; syncView(); paintFrame();
  drawTexts(); drawStickers(); if (cropState) drawCrop();
  view.apply();
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
// 畫布縮放：觸控板捏合、⌘＋滾輪、⌘＋／⌘－／⌘0、手機雙指
// 會在照片上拖曳的工具（消除、裁切、移動燈）不接手機雙指，免得跟筆刷打架
const view = canvasZoom({
  stage: $('#stage'), box: $('#fbox'),
  canPan: (e, touch) => !!base && !e.target.closest('.st,.tx') && (!touch || !(tab === 'erase' || tab === 'crop' || tab === 'reshape' || tab === 'doodle' || tab === 'bbrush' || (tab === 'light' && P.light))),
  // 手機上平常不顯示縮放按鈕，放大了才出現（點百分比回到全覽）
  unit: () => frameK,
  onChange: z => { zoomZ = z; syncView(); $('#zPct').textContent = Math.round(frameK * z * 100) + '%'; $('#zoom').classList.toggle('zoomed', z !== 1); },
});
$('#zIn').onclick = () => view.zoomStep(1);
$('#zOut').onclick = () => view.zoomStep(-1);
$('#zPct').onclick = () => view.reset();
new ResizeObserver(layout).observe($('#stage'));

let raf = 0;
function render() {
  if (!base || raf) return;
  if (needMatte() && !base.matteP) getMatte(base);
  raf = requestAnimationFrame(() => {
    raf = 0;
    const f = liveFilter(), lut = gradeOn(P) ? getGradeLut() : f === 'none' ? null : getLut(f);
    // 皮膚、頭髮另外一套顏色要用皮膚遮罩和分類圖，還沒找過臉就先找
    if ((lut?.skin || lut?.hair) && !base.facesP) findFaces();
    R.setLut(lut?.c, lut?.skin, lut?.hair);
    draw();
    paintPop();
    if (curFrame()?.live) paintFrame();
  });
}
// 存檔、合併、摳圖要原尺寸；其他時候畫預覽大小
let holdFull = false;
function draw(full) {
  syncTex(); syncHair(); syncShape();
  if (bodyOn(P) && !base.body) getBody(base);
  // 身體的變形要排在最前面（長腿會改到整張照片的上下位置）
  // 手動增高也會改整張照片的上下位置，排第一個
  const warps = [...manualWarps(base.body, P, base.canvas.width, base.canvas.height), ...(base.body ? bodyWarps(base.body, base.faces, P) : []), ...(base.faces ? [...faceWarps(base.faces, P), ...hairWarps(base.faces, P, base.hair)] : [])];
  R.render(gradeOn(P) ? { ...P, filterAmt: 100 } : P, warps, effects(), full || holdFull);
}
// 預覽解析度：螢幕上實際有幾個像素就畫幾個（放大時跟著變細），一次跳 √2 倍，縮放時不會每一格都重畫
let zoomZ = 1;
function syncView() {
  if (!R || !base) return;
  const s = frameK * zoomZ * Math.min(3, devicePixelRatio || 1);
  const q = Math.min(1, 2 ** (Math.ceil(Math.log2(Math.max(s, 1e-3)) * 2) / 2));
  if (q !== R.view) { R.view = q; render(); }
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
  const lq = liqMoves(P.liq, base.canvas.width, base.canvas.height);
  R.setDisp(WF.update(base.canvas.width, base.canvas.height, base.faces || [], [...sm.moves, ...lq.moves], sm.pins, lq.boxes));
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
  const mk = makeupLayer(base, P.mk, P);
  if (texKey.mk !== mk.key) { texKey.mk = mk.key; R.setMakeup(mk.canvas); }
  const own = P.ex === 'own' && exOwn;
  // 雙重曝光的第二張圖：用內建的風景照（或自己選的照片）
  const ek = P.fx === 'double' ? (own ? 'own' + exN : P.ex) : '';
  if (texKey.ex !== ek) {
    texKey.ex = ek;
    if (!ek) R.setEx(null);
    else if (own) R.setEx(exOwn);
    else loadImg((BG_PHOTOS.find(b => b.id === P.ex) || BG_PHOTOS.find(b => b.id === 'lake')).src).then(img => {
      if (texKey.ex !== ek) return;
      const c = newCanvas(...fitSize(img.width, img.height, 1024)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      R.setEx(c); render();
    }).catch(e => console.warn(e));
  }
}
// 打光、閃光燈的參數
function effects() {
  const fx = { faces: base.geoms };
  if (P.flashFill > 0 && !base.segP) getSeg(base);
  if (P.light || P.flash || P.flashFill > 0) Object.assign(fx, litParams(P, base, ensureGeo()));
  const e = fxById(P.fx);
  if (e) { fx.fxMode = e.mode; fx.fxAmt = P.fxAmt / 100; }
  if (P.ov) fx.over = P.ovAmt / 100;
  fx.blur = P.blur / 100;
  // 散景的光斑半徑：強度 × 大小（大小 55 照 Hypic 預設）
  if (P.blur > 0) fx.bokeh = { style: BOKEH_GL[P.blurStyle] ?? 0, r: 0.06 * P.blur / 100 * (0.4 + 1.2 * P.blurSize / 100) };
  if (P.bg === 'img') { fx.bgBlur = P.bgBlur / 100; fx.harm = harmony(); }
  return fx;
}
// 調色（HSL、曲線、分色）跟濾鏡合成一張 LUT，強度已經混在裡面
let gradeLut = null, gradeLutKey = '';
// 醒圖一鍵出片的「富士閃光」只對有人的照片有效，沒有臉的照片醒圖保持原樣，這裡也不套
function liveFilter() {
  const x = xtItem(P.filter);
  return x?.name === '富士閃光' && xtData().cats[x.cat] === '📸一鍵出片' && base?.faces && !base.faces.length ? 'none' : P.filter;
}
function getGradeLut() {
  const f = liveFilter(), k = gradeKey(P) + '|' + f + '|' + P.filterAmt;
  if (k !== gradeLutKey) {
    gradeLutKey = k; const sk = skinFilterFn(f), hr = hairFilterFn(f);
    gradeLut = lutPair(bakeLUT(gradeFn(P, filterFn(f))), sk && bakeLUT(gradeFn(P, sk)), hr && bakeLUT(gradeFn(P, hr)));
  }
  return gradeLut;
}
// 一般顏色、皮膚那套、頭髮那套拼成一張 1536×512（沒有的那套就放一般顏色）
function lutPair(a, b, h) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 512;
  const x = c.getContext('2d'); x.drawImage(a, 0, 0); x.drawImage(b || a, 512, 0); x.drawImage(h || a, 1024, 0);
  return { c, skin: !!b, hair: !!h };
}
function getLut(id) {
  if (!lutCache.has(id)) {
    const fn = filterFn(id); if (!fn) return null;
    const sk = skinFilterFn(id), hr = hairFilterFn(id);
    lutCache.set(id, lutPair(bakeLUT(fn), sk && bakeLUT(sk), hr && bakeLUT(hr)));
  }
  return lutCache.get(id);
}

// ---------- 復原、重做 ----------
function commit() {
  hist = hist.slice(0, hi + 1);
  hist.push({ base, P: clone(P), texts: clone(texts), stickers: clone(stickers) });
  if (hist.length > 50) hist.shift();  // 醒圖：最多復原 50 步
  // 塗鴉、消除每一步都是一張新的整張照片：舊的會壓成檔案（見 shelve），最多留 15 張不同的照片
  while (new Set(hist.map(h => h.base)).size > 15) hist.shift();
  hi = hist.length - 1;
  syncHist();
}
let restoring = false;
async function restore(i) {
  if (restoring) return;
  const s = hist[i];
  const changed = s.base !== base;
  if (changed && !s.base.canvas) {
    restoring = true; busy('復原中…');
    try { await unshelve(s.base); } catch (e) { console.error(e); toast('這一步復原不了'); return; } finally { restoring = false; busy(); }
  }
  hi = i;
  P = clone(s.P); texts = clone(s.texts); stickers = clone(s.stickers); selText = -1; selSt = -1;
  if (changed) { const old = base; base = s.base; applyBase(); shelve(old); } else render();
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
function setSlider(label, min, max, val, onInput, def) {
  $('#srow').classList.remove('hide');
  $('#sLabel').textContent = label;
  slider.min = min; slider.max = max; slider.value = val;
  if (def !== undefined) slider.dataset.def = def; else delete slider.dataset.def; // 點數字、雙擊回到的值
  slider._on = onInput;
  setGrad(slider, label);
  paintSlider();
}
function hideSlider() { $('#srow').classList.add('hide'); slider._on = null; }
function paintSlider() { paintRange(slider, $('#sVal')); }
enhanceRanges();
slider.addEventListener('input', () => { paintSlider(); slider._on?.(+slider.value); });
slider.addEventListener('change', () => { commit(); syncNav(); });
$('#sVal').onclick = () => { if (!slider._on) return; slider.value = slider.dataset.def ?? Math.max(+slider.min, 0); paintSlider(); slider._on(+slider.value); commit(); };

$('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) { landing = false; showTab(b.dataset.tab); } };

// ---------- 主選單（照醒圖電腦版：少數幾個大類，底下再分段） ----------
const GI = {
  adjust: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  portrait: I.person,
  filter: I.tint,
  compose: '<svg viewBox="0 0 24 24"><path d="M6 2v16h16"/><path d="M2 6h16v16"/></svg>',
  tpl: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="10" height="7" rx="1"/><path d="M7 16h10M7 18.5h6"/></svg>',
  erase: '<svg viewBox="0 0 24 24"><path d="M16 3l5 5-11 11H5v-5z"/><path d="M12 7l5 5M5 21h14"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  fun: I.magic,
};
// [id, 名稱, 快捷鍵, 底下的分頁]；不在這裡的分頁（之後新增的）放到最後一組
// 順序照 Hypic 編輯頁第一層：修飾、濾鏡、調整、清除、特效、貼圖、文字……重新塑形；
// 人像底下照 Hypic「修飾」第二層：臉部、彩妝、皮膚、打光、頭髮、塑身
const GROUPS = [
  ['portrait', '人像', 'P', ['beauty', 'shape', 'sculpt', 'makeup', 'skin', 'aiskin', 'bbrush', 'light', 'hair', 'body', 'reshape', 'cover']],
  ['filter', '濾鏡', 'F', ['looks', 'filter']],
  ['adjust', '調節', 'A', ['adjust', 'grade']],
  ['erase', '消除', 'E', ['erase', 'doodle', 'cutout']],
  ['fun', '創意', 'X', ['fun', 'cut']],
  ['text', '文字', 'T', ['text', 'sticker']],
  ['compose', '構圖', 'C', ['crop', 'frame']],
  // Hypic 編輯頁第一層有「模板」：用目前的照片套雜誌封面、拍立得、海報這些範本
  ['tpl', '範本', 'M', ['tpl']],
];
const groupOf = t => GROUPS.find(g => g[3].includes(t)) || GROUPS[GROUPS.length - 1];
const lastTab = {};
const wide = matchMedia('(min-width:900px)');
const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
document.querySelectorAll('#tabs .tab').forEach(b => b.insertAdjacentHTML('beforeend', '<i class="tdot"></i>' + CHEV));
GROUPS.forEach(([id, name, key]) => {
  const b = document.createElement('button');
  b.className = 'g'; b.dataset.g = id; b.title = `${name}（${key}）`;
  b.innerHTML = GI[id] + `<span>${name}</span>`;
  b.onclick = () => openGroup(id);
  $('#groups').append(b);
});
function openGroup(id) {
  if (!base) return;
  landing = false;
  const g = GROUPS.find(x => x[0] === id);
  const tabs = [...document.querySelectorAll('#tabs .tab')].map(b => b.dataset.tab).filter(t => groupOf(t) === g);
  showTab(tabs.includes(lastTab[id]) ? lastTab[id] : tabs[0]);
}
function syncNav() {
  const g = groupOf(tab);
  lastTab[g[0]] = tab;
  document.querySelectorAll('#groups .g').forEach(b => b.classList.toggle('on', b.dataset.g === g[0]));
  let n = 0;
  document.querySelectorAll('#tabs .tab').forEach(b => {
    const mine = groupOf(b.dataset.tab) === g;
    n += mine;
    b.classList.toggle('out', !mine);
    b.classList.toggle('set', mine && !!TAB_RESET[b.dataset.tab]?.on());
  });
  $('#tabs').classList.toggle('single', n < 2);
  // 電腦版：內容接在目前分段的標題下面（像可收合的區塊）；手機版：內容在分段列上面
  const pb = $('#pbody'), on = $(`#tabs .tab[data-tab="${tab}"]`);
  if (wide.matches && on) { if (on.nextElementSibling !== pb) on.after(pb); }
  else if (pb.parentElement !== $('#panel') || pb.nextElementSibling !== $('#tabs')) $('#tabs').before(pb);
  const r = TAB_RESET[tab];
  $('#bTabReset').hidden = !r || !r.on();
}
wide.addEventListener('change', () => { syncNav(); showTab(tab); });

// ---------- 重設 ----------
// 每個分頁：on() 有沒有調過，reset() 回到原樣
const keysOf = list => list.flatMap(x => SIDED.includes(x[0]) ? [x[0], x[0] + 'L', x[0] + 'R'] : [x[0]]);
const toP0 = keys => keys.forEach(k => { P[k] = clone(P0[k]); });
const keysOn = keys => () => keys.some(k => JSON.stringify(P[k]) !== JSON.stringify(P0[k]));
const tabKeys = {
  adjust: keysOf(ADJUST), beauty: [...keysOf(BEAUTY), 'oneTap', 'oneAmt'], skin: keysOf([...SKIN, ...TONE, ...WRINKLE]), aiskin: keysOf([...AI_FACE, ...AI_BODY]), sculpt: Object.keys(SC_P0), reshape: ['liq'],
  body: Object.keys(BODY_P0), hair: Object.keys(HAIR_P0), makeup: ['mk', 'mkLook', 'mkLookAmt'], filter: ['filter', 'filterAmt'],
  light: ['light', 'lightAmt', 'lightBri', 'lightCol', 'lightDist', 'lightSpec', 'lightGloss', 'lightBlur', 'lightFg', 'lightBg', 'lightX', 'lightY', 'lightSeed', 'flash', 'flashAmt'],
  fun: ['blur', 'blurStyle', 'blurSize', 'fx', 'fxAmt', 'ov', 'ovAmt', 'ex', ...Object.keys(POP_P0)], frame: ['frame'], cutout: ['bg', 'bgColor', 'bgImg', 'bgBlur'],
};
const TAB_RESET = Object.fromEntries(Object.entries(tabKeys).map(([t, keys]) => [t, { on: keysOn(keys), reset: () => toP0(keys) }]));
TAB_RESET.grade = {
  on: () => gradeOn(P),
  reset: () => { Object.keys(P).forEach(k => { if (/^(hsl_|cg_)/.test(k)) delete P[k]; }); Object.assign(P, clone(GRADE_P0)); },
};
TAB_RESET.shape = { on: () => SHAPE_CATS.some(c => c.items.some(x => shapeIsSet(P, x.id))), reset: () => SHAPE_CATS.forEach(c => resetShape(P, c.id)) };
$('#bTabReset').onclick = () => {
  const r = TAB_RESET[tab]; if (!r) return;
  r.reset(); layout(); render(); commit(); showTab(tab);
};
$('#bResetAll').onclick = () => {
  if (!base) return;
  P = { ...clone(P0) }; layout(); render(); commit(); showTab(tab);
  toast('效果已全部重設，按復原可以找回來');
};

// ---------- 一個區塊的滑桿全部列出來（電腦版） ----------
function sliderRow({ label, min, max, val, def, onInput }) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label></label><input type="range"><output></output>`;
  const [lb, inp, out] = row.children;
  lb.textContent = label; lb.title = label;
  Object.assign(inp, { min, max, value: val }); inp.setAttribute('aria-label', label);
  if (def !== undefined) inp.dataset.def = def;
  setGrad(inp, label);
  const sync = () => { paintRange(inp, out); row.classList.toggle('set', +inp.value !== Math.min(max, Math.max(min, 0))); };
  inp.addEventListener('input', () => { sync(); onInput(+inp.value); });
  inp.addEventListener('change', () => { commit(); syncNav(); });
  // 點數字回到預設（閃光燈 60 照 Hypic，其他 0）
  out.onclick = () => { inp.value = def ?? Math.min(max, Math.max(min, 0)); sync(); onInput(+inp.value); commit(); syncNav(); };
  sync();
  return row;
}

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
  const box = $('#items'); box.innerHTML = ''; $('#rows').innerHTML = ''; $('#items').hidden = false;
  $('#note').textContent = ''; $('#textedit').hidden = true; $('#stsearch').hidden = true; $('#cats').hidden = true;
  gradeHide();
  if (!base) return;
  ({ looks: tabLooksHere, grade: tabGrade2, adjust: tabAdjust, filter: tabFilter, beauty: tabBeauty, shape: tabShape, makeup: tabMakeup, body: tabBody, cover: tabCover, hair: tabHair, skin: tabSkin, aiskin: tabAiSkin, sculpt: tabSculpt, reshape: tabReshape, doodle: box => tabDoodle(box, { item, setSlider, showTab }), bbrush: box => tabBeautyBrush(box, { item, setSlider, showTab }), light: tabLight, sticker: tabSticker, cut: tabCut, fun: tabFun, frame: tabFrame, crop: tabCrop, tpl: tabTpl, cutout: tabCutout, text: tabText, erase: tabEraseHere })[t](box);
  drawTexts(); drawStickers();
  $('#wrap').classList.toggle('lightdrag', t === 'light' && !!P.light);
  lightDot(); bmBox(); rsRing();
  syncNav();
}

const isSet = k => P[k] !== 0 || (SIDED.includes(k) && (P[k + 'L'] !== 0 || P[k + 'R'] !== 0));
function paramItems(box, list, def, itemsOnly) {
  if (!itemsOnly && wide.matches) return paramRows(box, list);
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
  }, it[4]);
}

// 電腦版：每個項目一條滑桿，全部列出來
function paramRows(box, list) {
  hideSlider();
  const sided = list === BEAUTY;
  if (sided) {
    box.append(...[['both', '兩邊'], ['L', '左'], ['R', '右']].map(([sd, lb]) => item({
      label: lb, icon: lb, cls: 'wide', on: side === sd, onclick: () => { side = sd; showTab(tab); },
    })));
    $('#note').textContent += (($('#note').textContent ? '　' : '') + '瘦臉、大眼可以只調左邊或右邊');
  } else $('#items').hidden = !box.children.length;
  const rows = $('#rows');
  for (const [k, label, , min, d, max] of list) {
    const key = sided && SIDED.includes(k) && side !== 'both' ? k + side : k;
    const sfx = key !== k ? (side === 'L' ? '（左）' : '（右）') : '';
    rows.append(sliderRow({
      label: label + sfx, min: min ?? -100, max: max ?? 100, val: P[key], def: d,
      onInput: v => { P[key] = v; cur = k; if (list === BEAUTY) P.oneTap = -1; render(); bmBox(); },
    }));
  }
}

// 消除筆在 erase.js，這裡把它要用的東西傳過去
const eraseApp = { get base() { return base; }, setBase, commit, item, hideSlider, showTab, toast, busy };
doodleInput($('#wrap'), { get base() { return base; }, tab: () => tab, setBase, commit });
beautyBrushInput($('#wrap'), { get base() { return base; }, tab: () => tab, setBase, commit });
function tabEraseHere(box) { tabErase(box, eraseApp); }

function tabAdjust(box) { paramItems(box, ADJUST, 'brightness'); }
function tabGrade2(box) {
  tabGrade(box, { P: () => P, render, commit, setSlider, hideSlider, item, note: t => { $('#note').textContent = t; }, refresh: () => showTab('grade') });
}

// 濾鏡分類：「基本」是自己調的 15 個，其他是照醒圖分類的醒圖風格濾鏡（xt.js）
let fCat = -1, thumbJob = 0;
function tabFilter(box) {
  const xd = xtData();
  if (!xd) loadXT().then(d => { if (d && tab === 'filter') showTab('filter'); });
  if (xd && fCat === -1 && xtItem(P.filter)) fCat = xtItem(P.filter).cat;
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [[-1, '基本'], ...(xd ? xd.cats.map((c, i) => [i, c]) : [])].forEach(([i, name]) => cats.append(item({
    label: name, icon: name, cls: 'wide', on: fCat === i, set: i === -1 ? FILTERS.some(f => f.id === P.filter && f.id !== 'none') : xtItem(P.filter)?.cat === i,
    onclick: () => { fCat = i; showTab('filter'); },
  })));
  base.thumbs ||= {};
  const list = fCat === -1 || !xd ? FILTERS.map(f => ({ ...f, def: P0.filterAmt })) : [{ ...FILTERS[0], def: P0.filterAmt }, ...xd.items.filter(x => x.cat === fCat && (!x.hide || x.id === P.filter))];
  // 合併：把目前的濾鏡畫進照片，就能再疊下一個濾鏡（醒圖、美圖秀秀的「合併」）
  if (P.filter !== 'none') box.append(item({ label: '合併', icon: I.merge, cls: 'ft merge', onclick: mergeFilter }));
  const els = list.map(f => {
    const el = item({
      label: f.name, cls: 'ft', on: P.filter === f.id, style: base.thumbs[f.id] ? `background-image:url(${base.thumbs[f.id]})` : '',
      onclick: () => {
        if (P.filter === f.id && f.id !== 'none') return;
        P.filter = f.id; P.filterAmt = f.def ?? P0.filterAmt; render(); commit(); showTab('filter');
      },
    });
    box.append(el); return el;
  });
  // 縮圖分批算，不卡畫面
  const job = ++thumbJob, src = base.thumbSrc ||= (() => { const c = document.createElement('canvas'); c.width = c.height = 96; const s = Math.min(base.canvas.width, base.canvas.height); c.getContext('2d').drawImage(base.canvas, (base.canvas.width - s) / 2, (base.canvas.height - s) / 2, s, s, 0, 0, 96, 96); return c; })();
  let k = 0;
  const step = () => {
    if (job !== thumbJob || tab !== 'filter') return;
    const t0 = performance.now();
    for (; k < list.length && performance.now() - t0 < 12; k++) {
      const f = list[k];
      if (!base.thumbs[f.id]) base.thumbs[f.id] = thumb(src, filterFn(f.id), 96);
      els[k].querySelector('.ic').style.backgroundImage = `url(${base.thumbs[f.id]})`;
    }
    if (k < list.length) setTimeout(step, 0);
  };
  step();
  if (P.filter === 'none') hideSlider();
  else setSlider('強度', 0, 100, P.filterAmt, v => { P.filterAmt = v; render(); });
}

// 只套濾鏡、其他調整先不算，畫成原尺寸的新照片；其他調整、美顏照舊留著可以再改
async function mergeFilter() {
  if (P.filter === 'none') return;
  busy('合併中…');
  try {
    // 濾鏡裡皮膚、頭髮另外一套顏色要等臉找完
    await findFaces();
    const now = P, f = liveFilter(), lut = getLut(f);
    P = { ...clone(P0), filter: now.filter, filterAmt: now.filterAmt };
    let out;
    try {
      R.setLut(lut?.c, lut?.skin, lut?.hair);
      draw(true);
      out = newCanvas(base.canvas.width, base.canvas.height);
      out.getContext('2d').drawImage($('#gl'), 0, 0);
    } finally { P = now; }
    P = { ...now, filter: 'none', filterAmt: P0.filterAmt };
    // 臉、人像這些偵測結果還是同一張照片，留著不用重算；濾鏡縮圖要照新照片重算
    const keep = { ...base };
    for (const k of ['canvas', 'thumbs', 'thumbSrc', 'harm', 'small', 'lookThumbs', 'autoSet']) delete keep[k];
    setBase(out, keep); commit(); showTab('filter');
    toast('已合併，可以再選一個濾鏡疊上去');
  } catch (e) { console.error(e); toast('合併失敗，再試一次'); }
  finally { busy(); }
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
  const list = skSec === 'skin' ? SKIN : skSec === 'tone' ? TONE : WRINKLE;
  // 上面一排：膚質、膚色、祛皺（跟醒圖美顏面板的分類一樣）
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['skin', '膚質', SKIN], ['tone', '膚色', TONE], ['wrinkle', '祛皺', WRINKLE]].forEach(([s, lb, l]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: skSec === s, set: l.some(x => isSet(x[0])),
    onclick: () => { skSec = s; cur = l[0][0]; showTab('skin'); },
  })));
  paramItems(box, list, list[0][0]);
  $('#note').textContent = skinNote(base, cur);
}

// ---------- 塑臉（立體光影） ----------
// 照 Hypic 修飾 › 塑臉：上面一排「強度」（6 區各有亮、影，共 12 條）、「顏色」（4 區提色），都是 0~100
let scSec = 'str';
function tabSculpt(box) {
  if (!base.faces) findFaces();
  if (!base.skin) getSkin(base);
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['str', '強度', SCULPT], ['col', '顏色', SC_COLOR]].forEach(([s, lb, l]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: scSec === s, set: l.some(x => isSet(x[0])),
    onclick: () => { scSec = s; cur = l[0][0]; showTab('sculpt'); },
  })));
  const list = scSec === 'str' ? SCULPT : SC_COLOR;
  paramItems(box, list, list[0][0]);
  $('#note').textContent = base.faces && !base.faces.length ? '這張照片沒找到臉。' : scSec === 'str' ? '亮的地方往前、陰影往後，臉看起來更立體。' : '在眼睛、眼周、嘴唇、臉頰提一點顏色。';
}

// ---------- AI 美肌 ----------
// 照 Hypic 的 AI 美肌面板：臉部、身體兩類。Hypic 上傳雲端重畫，這裡在手機上算
let aiSec = 'face';
function tabAiSkin(box) {
  if (!base.faces) findFaces();
  if (!base.skin) getSkin(base);
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['face', '臉部', AI_FACE], ['body', '身體', AI_BODY]].forEach(([s, lb, l]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: aiSec === s, set: l.some(x => isSet(x[0])),
    onclick: () => { aiSec = s; cur = l[0][0]; showTab('aiskin'); },
  })));
  const list = aiSec === 'face' ? AI_FACE : AI_BODY;
  paramItems(box, list, list[0][0]);
  $('#note').textContent = skinNote(base, cur);
}

// ---------- 身體 ----------
// 上面一排照 Hypic：自動塑身（找關節）、手動塑身（自己框範圍）
let bodySec = 'auto';
function tabBody(box) {
  if (!base.body) getBody(base);
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['auto', '自動塑身', BODY], ['man', '手動塑身', BODY_MAN]].forEach(([s, lb, l]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: bodySec === s, set: l.some(x => isSet(x[0])),
    onclick: () => { bodySec = s; cur = l[0][0]; showTab('body'); },
  })));
  if (bodySec === 'man') {
    paramItems(box, BODY_MAN, 'bmHeight');
    $('#note').textContent = '在照片上拖曳框線調整範圍，拖框的中間可以移動。';
    return;
  }
  paramItems(box, BODY, 'bodyHead');
  $('#note').textContent = bodyNote(base.body, cur);
}
// 手動塑身的框：增高是兩條橫線，瘦身是長方形，放大是橢圓
const manKey = () => base && tab === 'body' && bodySec === 'man' ? (BODY_MAN.some(x => x[0] === cur) ? cur : 'bmHeight') : null;
function bmBox() {
  let d = $('#bmbox');
  if (!d) { d = document.createElement('div'); d.id = 'bmbox'; $('#wrap').append(d); }
  const k = manKey();
  d.hidden = !k;
  if (!k) return;
  const r = manualRegion(k, base.body, P);
  d.className = k === 'bmHeight' ? 'band' : k === 'bmZoom' ? 'oval' : 'rect';
  Object.assign(d.style, { left: r.x0 * 100 + '%', top: r.y0 * 100 + '%', width: (r.x1 - r.x0) * 100 + '%', height: (r.y1 - r.y0) * 100 + '%' });
}
(() => {
  let drag = null;
  const pos = e => { const r = $('#wrap').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: r.width, h: r.height }; };
  $('#wrap').addEventListener('pointerdown', e => {
    const k = manKey();
    if (!k || e.target.closest('.st,.tx')) return;
    const q = pos(e), r = { ...manualRegion(k, base.body, P) }, tx = 22 / q.w, ty = 22 / q.h;
    const inX = q.x > r.x0 - tx && q.x < r.x1 + tx, inY = q.y > r.y0 - ty && q.y < r.y1 + ty;
    // 靠近哪條邊就拖那條邊，在框裡面就整個移動
    const edge = {
      x0: k !== 'bmHeight' && inY && Math.abs(q.x - r.x0) < tx, x1: k !== 'bmHeight' && inY && Math.abs(q.x - r.x1) < tx,
      y0: (k === 'bmHeight' || inX) && Math.abs(q.y - r.y0) < ty, y1: (k === 'bmHeight' || inX) && Math.abs(q.y - r.y1) < ty,
    };
    if (edge.y0 && edge.y1) edge[Math.abs(q.y - r.y0) < Math.abs(q.y - r.y1) ? 'y1' : 'y0'] = false;
    if (edge.x0 && edge.x1) edge[Math.abs(q.x - r.x0) < Math.abs(q.x - r.x1) ? 'x1' : 'x0'] = false;
    const move = !Object.values(edge).some(Boolean);
    if (move && !(q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1)) return;
    e.preventDefault(); $('#wrap').setPointerCapture(e.pointerId);
    drag = { k, q, r, edge, move };
  });
  $('#wrap').addEventListener('pointermove', e => {
    if (!drag) return;
    const q = pos(e), dx = q.x - drag.q.x, dy = q.y - drag.q.y, r0 = drag.r, r = { ...r0 }, m = 0.03;
    const cl = v => Math.max(0, Math.min(1, v));
    if (drag.move) {
      const ex = drag.k === 'bmHeight' ? 0 : Math.max(-r0.x0, Math.min(1 - r0.x1, dx)), ey = Math.max(-r0.y0, Math.min(1 - r0.y1, dy));
      r.x0 += ex; r.x1 += ex; r.y0 += ey; r.y1 += ey;
    } else {
      if (drag.edge.x0) r.x0 = Math.min(cl(r0.x0 + dx), r.x1 - m);
      if (drag.edge.x1) r.x1 = Math.max(cl(r0.x1 + dx), r.x0 + m);
      if (drag.edge.y0) r.y0 = Math.min(cl(r0.y0 + dy), r.y1 - m);
      if (drag.edge.y1) r.y1 = Math.max(cl(r0.y1 + dy), r.y0 + m);
    }
    P[REG_OF[drag.k]] = r; render(); bmBox();
  });
  const up = () => { if (drag) { drag = null; commit(); } };
  $('#wrap').addEventListener('pointerup', up); $('#wrap').addEventListener('pointercancel', up);
})();

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
// ---------- 重新塑形（液化，reshape.js） ----------
// 照 Hypic 修飾 › 重新塑形：彎曲、順時針旋轉、逆時針旋轉、脹大、縮小、還原，每個工具各自記大小、強度
let rsTool = 'push', rsParam = 'size';
const rsVal = Object.fromEntries(RESHAPE.map(t => [t.id, { size: t.size, str: t.str }]));
function tabReshape(box) {
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['size', '大小'], ['str', '強度']].forEach(([k, lb]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: rsParam === k, onclick: () => { rsParam = k; showTab('reshape'); },
  })));
  RESHAPE.forEach(t => box.append(item({ label: t.name, icon: t.icon, on: rsTool === t.id, onclick: () => { rsTool = t.id; showTab('reshape'); } })));
  box.append(protectItem());
  const v = rsVal[rsTool], def = RESHAPE.find(t => t.id === rsTool)[rsParam];
  setSlider(rsParam === 'size' ? '大小' : '強度', 1, 100, v[rsParam], x => { v[rsParam] = x; rsRing(); }, def);
  $('#note').textContent = rsTool === 'push' ? '用手指在照片上推，被推的地方會跟著走。兩指可以縮放照片。' : rsTool === 'restore' ? '塗抹改過的地方，慢慢變回原樣。' : '在要改的地方按住或來回塗抹。';
  rsRing();
}
// 筆刷大小的圓圈（調大小時顯示在照片中間，畫的時候跟著手指）
function rsRing(p) {
  let d = $('#rsring');
  if (!d) { d = document.createElement('div'); d.id = 'rsring'; $('#wrap').append(d); }
  d.hidden = !(base && tab === 'reshape');
  if (d.hidden) return;
  const W = base.canvas.width, H = base.canvas.height, r = liqRadius(rsVal[rsTool].size, W, H);
  Object.assign(d.style, { width: r * 2 / W * 100 + '%', height: r * 2 / H * 100 + '%', left: (p ? p.x / W : 0.5) * 100 + '%', top: (p ? p.y / H : 0.5) * 100 + '%' });
  d.classList.toggle('idle', !p);
}
(() => {
  let last = null, timer = 0;
  const at = e => { const r = $('#wrap').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * base.canvas.width, y: (e.clientY - r.top) / r.height * base.canvas.height }; };
  const dab = (a, b) => { const v = rsVal[rsTool]; P.liq = liqDab(P.liq, rsTool, a, b, v.size, v.str, base.canvas.width, base.canvas.height); render(); };
  $('#wrap').addEventListener('pointerdown', e => {
    if (tab !== 'reshape' || !base || e.target.closest('.st,.tx') || e.button > 0) return;
    e.preventDefault(); $('#wrap').setPointerCapture(e.pointerId);
    last = at(e); rsRing(last);
    // 旋轉、脹大、縮小、還原：按住不動也會一直作用
    if (rsTool !== 'push') { dab(last, last); timer = setInterval(() => last && dab(last, last), 90); }
  });
  $('#wrap').addEventListener('pointermove', e => {
    if (!last) return;
    const p = at(e), r = liqRadius(rsVal[rsTool].size, base.canvas.width, base.canvas.height);
    rsRing(p);
    if (Math.hypot(p.x - last.x, p.y - last.y) < r * 0.12) return;
    if (rsTool === 'push') dab(last, p); else dab(p, p);
    last = p;
  });
  const up = () => { if (!last) return; last = null; clearInterval(timer); rsRing(); commit(); };
  $('#wrap').addEventListener('pointerup', up); $('#wrap').addEventListener('pointercancel', up);
})();

// 背景保護開關：蓬鬆感、臉型、身體這些變形都會用到
function protectItem() {
  return item({
    label: '背景保護', on: !!P.bgProtect, set: !!P.bgProtect,
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    onclick: () => { P.bgProtect = P.bgProtect ? 0 : 1; toast(P.bgProtect ? '背景保護已開：變形時背景不會跟著彎' : '背景保護已關'); render(); commit(); showTab(tab); },
  });
}

// ---------- 一鍵出片（looks.js） ----------
function tabLooksHere(box) {
  tabLooks(box, {
    P: () => P, P0, base: () => base, item, setSlider, hideSlider, render, commit, needSeg,
    findPerson: () => findPerson(true).then(() => render()),
    cats: () => $('#cats'), refresh: () => showTab('looks'), note: t => { $('#note').textContent = t; },
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

// ---------- 光影：打光、閃光燈（relight.js） ----------
// 照 Hypic 的打光面板：上面一排分類（自然光、單色光、多色），13 個樣式；燈可以在照片上拖。
// 每個樣式只出現它有的滑桿（亮度、距離、顏色、高光；有高光的才有光澤），柔焦、前景暗、背景暗每個樣式都有
let lightSec = 'nat', lightParam = 'lightBri';
const lightSliders = L => [
  L.lum && ['lightBri', '亮度', 0, 100, 50], ['lightDist', '距離', 0, 100, 50],
  L.seg && ['lightCol', '顏色', 0, 100, Math.round(L.cdef * 100)], L.spec && ['lightSpec', '高光', 0, 100, L.spec], L.spec && ['lightGloss', '光澤', 0, 100, L.l[0][8] / 4],
  ['lightBlur', '柔焦', 0, 100, 0], ['lightFg', '前景暗', 0, 100, 0], ['lightBg', '背景暗', 0, 100, 0],
].filter(Boolean);
// 立體深度圖：人像遮罩或臉換了才重算
function ensureGeo() {
  const b = base, mask = b.matte || b.seg?.person;
  if (!b.segB || !mask) return null;
  if (!b.geo || b.geo.segB !== b.segB || b.geo.faces !== b.faces) {
    b.geo = { segB: b.segB, faces: b.faces, d: buildDepth(b.segB, mask, b.faces || [], b.canvas.width, b.canvas.height) };
  }
  if (R.geo !== b.geo.d) R.setGeo(b.geo.d);
  return b.geo.d;
}
function tabLight(box) {
  if (!base.faces) findFaces();
  const need = () => { if (!base.seg) findPerson(true); };
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [...LIGHT_CATS.map(c => [c.id, c.name, c.items.some(x => x.id === P.light)]), ['flash', '閃光燈', !!P.flash]].forEach(([id, name, set]) => cats.append(item({
    label: name, icon: name, cls: 'wide', on: lightSec === id, set,
    onclick: () => { lightSec = id; showTab('light'); },
  })));
  if (lightSec === 'flash') {
    box.append(item({ label: '不閃光', icon: I.off, on: !P.flash, onclick: () => { P.flash = ''; render(); commit(); showTab('light'); } }));
    FLASHES.forEach(F => box.append(item({
      label: F.name, icon: I.flash, on: P.flash === F.id, set: P.flash === F.id,
      onclick: () => { if (P.flash !== F.id && F.def) P.flashAmt = F.def; P.flash = F.id; need(); render(); commit(); showTab('light'); },
    })));
    if (P.flash) setSlider('閃光', 0, 100, P.flashAmt, v => { P.flashAmt = v; render(); }, FLASHES.find(F => F.id === P.flash)?.def ?? 60);
    else hideSlider();
    $('#note').textContent = '模擬開閃光燈拍的照片：臉亮、背景暗、後面有影子。醒圖的閃光燈是上傳到雲端用 AI 算，這裡全部在手機上算。';
    return;
  }
  const cat = LIGHT_CATS.find(c => c.id === lightSec);
  box.append(item({ label: '不打光', icon: I.off, on: !P.light, onclick: () => { P.light = ''; render(); commit(); showTab('light'); } }));
  cat.items.forEach(L => box.append(item({
    label: L.name, icon: I.bulb, on: P.light === L.id, set: P.light === L.id,
    style: `color:rgb(${(L.l[0].slice(3, 6)).join(',')})`,
    onclick: () => {
      if (P.light !== L.id) Object.assign(P, { lightX: null, lightY: null, lightCol: null, lightSpec: null, lightGloss: null, lightSeed: 0 });
      P.light = L.id; need(); render(); commit(); showTab('light');
    },
  })));
  const L = LIGHTS.find(x => x.id === P.light);
  if (!L || L.cat !== lightSec) {
    hideSlider();
    $('#note').textContent = '打光和閃光燈可以一起用。';
    return;
  }
  // 多色樣式照 Hypic 會隨機換顏色組合，這裡用「換一組」
  if (L.pick) box.append(item({ label: '換一組', icon: '換一組', cls: 'wide', onclick: () => { P.lightSeed = (P.lightSeed || 0) + 1; P.lightX = P.lightY = null; render(); commit(); lightDot(); } }));
  const SL = lightSliders(L);
  if (!SL.some(x => x[0] === lightParam)) lightParam = SL[0][0];
  box.append(...SL.map(([k, name]) => item({
    label: name, icon: name, cls: 'wide', on: lightParam === k, onclick: () => { lightParam = k; showTab('light'); },
  })));
  const [k, name, min, max, def] = SL.find(x => x[0] === lightParam);
  setSlider(name, min, max, P[k] ?? def, v => { P[k] = v; render(); lightDot(); }, def);
  if (k === 'lightCol') { slider.classList.add('grad'); slider.style.setProperty('--trk', lightGrad(L)); }
  $('#note').textContent = (base.faces && !base.faces.length ? '沒找到臉，燈以照片中間為準。' : '') + '在照片上拖曳移動燈的位置。';
}
// 燈的位置：照片上的一個小圓圈
function lightPos() {
  const L = LIGHTS.find(x => x.id === P.light);
  return L ? lightPosOf(L, P, base) : null;
}
function lightDot() {
  let d = $('#lightdot');
  if (!d) { d = document.createElement('div'); d.id = 'lightdot'; $('#wrap').append(d); }
  const p = base && tab === 'light' && lightSec !== 'flash' ? lightPos() : null;
  d.hidden = !p;
  if (p) { d.style.left = Math.max(0, Math.min(100, p.x * 100)) + '%'; d.style.top = Math.max(0, Math.min(100, p.y * 100)) + '%'; }
}
// 拖曳照片移動燈
(() => {
  let drag = false;
  const move = e => {
    const r = $('#wrap').getBoundingClientRect(), W = base.canvas.width, H = base.canvas.height;
    P.lightX = (e.clientX - r.left) / r.width;
    P.lightY = (e.clientY - r.top) / r.height;
    render(); lightDot();
  };
  $('#wrap').addEventListener('pointerdown', e => {
    if (tab !== 'light' || !P.light || lightSec === 'flash' || e.target.closest('.st,.tx')) return;
    e.preventDefault(); $('#wrap').setPointerCapture(e.pointerId);
    drag = true; move(e);
  });
  $('#wrap').addEventListener('pointermove', e => { if (drag) move(e); });
  const up = () => { if (drag) { drag = false; commit(); } };
  $('#wrap').addEventListener('pointerup', up); $('#wrap').addEventListener('pointercancel', up);
})();

// ---------- 貼紙 ----------
// 選項照醒圖貼圖面板：大小、旋轉、不透明度、暈染（10 種混合模式）、擦除和復原筆、
// 順序（置頂、上移、下移、置底）、橫向和直向翻轉、複製、刪除，加上分類貼紙庫、搜尋、匯入圖片
let stCat = 'face', stSec = 'adjust', stQ = '';
let stBrush = 20, stHard = 100, stPen = 'erase', stEsub = 'size';
const ST_SECS = [['adjust', '調整'], ['blend', '混合'], ['erase', '擦除'], ['layer', '圖層']];
function tabSticker(box) {
  const faces = base.faces;
  if (!faces) findFaces();
  const st = stickers[selSt]?.kind === 'cut' ? null : stickers[selSt];
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  if (st) {
    cats.append(item({ label: '完成', icon: '完成', cls: 'wide', onclick: () => { selSt = -1; showTab('sticker'); } }));
    ST_SECS.forEach(([k, lb]) => cats.append(item({
      label: lb, icon: lb, cls: 'wide', on: stSec === k, set: k === 'blend' ? (st.blend || 'normal') !== 'normal' : k === 'erase' ? !!st.mask : false,
      onclick: () => { stSec = k; showTab('sticker'); drawStickers(); },
    })));
    const redo = () => { drawStickers(); commit(); showTab('sticker'); };
    if (stSec === 'adjust') {
      const modes = [['size', '大小'], ['rot', '旋轉'], ['op', '不透明度']];
      if (!modes.some(m => m[0] === cur)) cur = 'size';
      modes.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: cur === k, onclick: () => { cur = k; showTab('sticker'); } })));
      if (cur === 'size') setSlider('大小', 3, 100, Math.round(st.size * 100), v => { st.size = v / 100; drawStickers(); });
      if (cur === 'rot') setSlider('旋轉', -180, 180, Math.round(st.rot * 180 / Math.PI), v => { st.rot = v * Math.PI / 180; drawStickers(); });
      if (cur === 'op') setSlider('透明', 0, 100, Math.round(st.op * 100), v => { st.op = v / 100; drawStickers(); });
      $('#note').textContent = '拖曳移動，兩指可以縮放和旋轉。';
    } else if (stSec === 'blend') {
      hideSlider();
      BLENDS.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: (st.blend || 'normal') === k, onclick: () => { st.blend = k; redo(); } })));
      $('#note').textContent = '混合模式決定貼紙怎麼跟照片融在一起，例如色彩增值會讓白色變透明。';
    } else if (stSec === 'erase') {
      box.append(item({ label: '擦除', icon: '擦除', cls: 'wide', on: stPen === 'erase', onclick: () => { stPen = 'erase'; showTab('sticker'); } }));
      box.append(item({ label: '復原', icon: '復原', cls: 'wide', on: stPen === 'restore', onclick: () => { stPen = 'restore'; showTab('sticker'); } }));
      box.append(item({ label: '全部復原', icon: '全部復原', cls: 'wide', onclick: () => { st.mask = null; redo(); } }));
      box.append(item({ label: '大小', icon: '大小', cls: 'wide', on: stEsub === 'size', onclick: () => { stEsub = 'size'; showTab('sticker'); } }));
      box.append(item({ label: '硬度', icon: '硬度', cls: 'wide', on: stEsub === 'hard', onclick: () => { stEsub = 'hard'; showTab('sticker'); } }));
      if (stEsub === 'size') setSlider('筆刷', 1, 100, stBrush, v => { stBrush = v; });
      else setSlider('硬度', 0, 100, stHard, v => { stHard = v; });
      $('#note').textContent = stPen === 'erase' ? '在貼紙上塗抹，擦掉不要的地方。' : '在貼紙上塗抹，把擦掉的地方補回來。';
    } else {
      hideSlider();
      const mv = to => { const [x] = stickers.splice(selSt, 1); selSt = Math.max(0, Math.min(stickers.length, to)); stickers.splice(selSt, 0, x); redo(); };
      const top = stickers.length - 1;
      box.append(item({ label: '置頂', icon: '置頂', cls: 'wide', onclick: () => selSt < top && mv(top) }));
      box.append(item({ label: '上移', icon: '上移', cls: 'wide', onclick: () => selSt < top && mv(selSt + 1) }));
      box.append(item({ label: '下移', icon: '下移', cls: 'wide', onclick: () => selSt > 0 && mv(selSt - 1) }));
      box.append(item({ label: '置底', icon: '置底', cls: 'wide', onclick: () => selSt > 0 && mv(0) }));
      box.append(item({ label: '橫向翻轉', icon: I.flip, onclick: () => { st.flip = !st.flip; redo(); } }));
      box.append(item({ label: '直向翻轉', icon: I.flipv, onclick: () => { st.flipv = !st.flipv; redo(); } }));
      box.append(item({ label: '複製', icon: I.copy, onclick: () => {
        stickers.push({ ...st, x: Math.min(0.95, st.x + 0.05), y: Math.min(0.95, st.y + 0.05) }); selSt = stickers.length - 1; redo();
      } }));
      if (st.kind === 'img' && !st.v.startsWith('net')) box.append(item({ label: '摳出人像', icon: I.person, onclick: () => cutoutSticker(st) }));
      box.append(item({ label: '刪除', icon: I.trash, onclick: () => { stickers.splice(selSt, 1); selSt = -1; redo(); } }));
      $('#note').textContent = stickers.length > 1 ? `第 ${selSt + 1} 層，共 ${stickers.length} 層` : '';
    }
    return;
  }
  hideSlider();
  // 沒選貼紙：上面一排是分類，下面是貼紙庫，可以搜尋
  // 線上貼紙包排在內建分類後面、「我的」前面
  const net = NET_PACKS.find(p => p[0] === stCat);
  [...STICKER_CATS.slice(0, -1), ...NET_PACKS, ...STICKER_CATS.slice(-1)].forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: !stQ && stCat === k, onclick: () => { stCat = k; stQ = ''; showTab('sticker'); } })));
  const sr = $('#stsearch'); sr.hidden = false;
  const q = $('#stkQ'); q.value = stQ;
  q.oninput = () => { stQ = q.value.trim(); showTab('sticker'); q.focus(); };
  $('#note').textContent = stQ ? '' : stCat === 'face' ? (!faces ? '正在找臉…' : faces.length ? `臉部貼紙會自動貼到 ${faces.length} 張臉上` : '點一下加到照片上')
    : stCat === 'mine' ? '匯入自己的圖片當貼紙，人像照可以自動摳圖。' : net ? '線上貼紙包，要連網路。圖案是 Microsoft Fluent Emoji（MIT 授權）。' : '點一下加到照片上';
  const list = stQ ? STICKERS.filter(sk => sk.name.toLowerCase().includes(stQ.toLowerCase()))
    : stCat === 'emoji' || stCat === 'mine' || net ? [] : STICKERS.filter(sk => sk.cat === stCat);
  list.forEach(sk => box.append(item({
    label: sk.name, cls: 'stk', icon: `<img src="${svgURL(sk.id)}" alt="">`, onclick: () => addSticker({ kind: 'svg', v: sk.id }, sk.face),
  })));
  if (stQ && !list.length) $('#note').textContent = '找不到這個貼紙，換個關鍵字試試。';
  if (!stQ && stCat === 'emoji') EMOJIS.forEach(e => box.append(item({ label: '', cls: 'stk emo', icon: e, onclick: () => addSticker({ kind: 'emoji', v: e }) })));
  if (!stQ && net) {
    net[2].forEach(code => box.append(item({
      label: '', cls: 'stk', icon: `<img src="${netURL(code)}" alt="" loading="lazy" crossorigin="anonymous">`,
      onclick: () => loadNetSticker(code).then(id => addSticker({ kind: 'img', v: id })).catch(() => toast('下載不到這張貼紙，檢查一下網路')),
    })));
    box.querySelector('img')?.addEventListener('error', () => { $('#note').textContent = '沒有網路，線上貼紙包載入不了。'; });
  }
  if (!stQ && stCat === 'mine') {
    box.append(item({ label: '匯入圖片', icon: I.plus, onclick: () => $('#file5').click() }));
    ownImages().forEach(id => box.append(item({ label: '', cls: 'stk', icon: `<img src="${canvasURL(id)}" alt="">`, onclick: () => addSticker({ kind: 'img', v: id }) })));
  }
}
// ---------- 遮臉 ----------
// 遮臉的圖案也放進貼紙庫，貼上去以後就是一般的貼紙
STICKERS.push(...COVERS.filter(c => c.svg));
let cvCat = 'daily';
function tabCover(box) {
  const faces = base.faces;
  if (!faces) findFaces().then(() => tab === 'cover' && showTab('cover'));
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  COVER_CATS.forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: cvCat === k, onclick: () => { cvCat = k; showTab('cover'); } })));
  COVERS.filter(c => c.cat === cvCat).forEach(c => box.append(item({
    label: c.name, cls: 'stk', icon: c.svg ? `<img src="${svgURL(c.id)}" alt="">` : c.name.slice(0, 2), onclick: () => addCover(c),
  })));
  hideSlider();
  $('#note').textContent = !faces ? '正在找臉…' : !faces.length ? '這張照片沒找到臉。' : `點一下貼到 ${faces.length} 張臉上，貼上後可以到「貼紙」移動或刪除。`;
}
function addCover(c) {
  if (!base.faces?.length) return toast('這張照片沒找到臉');
  const W = base.canvas.width, H = base.canvas.height;
  for (const pts of base.faces) for (const a of faceAnchor(pts, c.at)) {
    const s = c.pix ? { kind: 'img', v: putCanvas(coverPixels(base.canvas, c.pix, a.x, a.y, a.size, a.rot), 'cov') } : { kind: 'svg', v: c.id };
    stickers.push({ ...s, x: a.x / W, y: a.y / H, size: a.size / W, rot: a.rot, flip: false, flipv: false, op: 1, blend: 'normal', mask: null });
  }
  selSt = -1; drawStickers(); commit(); toast(`已遮住 ${base.faces.length} 張臉`);
}
function addSticker(s, face) {
  const W = base.canvas.width, H = base.canvas.height;
  const add = (x, y, size, rot) => stickers.push({ ...s, x: x / W, y: y / H, size: size / W, rot, flip: false, flipv: false, op: 1, blend: 'normal', mask: null });
  if (face && base.faces?.length) {
    base.faces.forEach(pts => faceAnchor(pts, face).forEach(a => add(a.x, a.y, a.size, a.rot)));
    selSt = -1;
  } else {
    add(W / 2, H / 2, Math.min(W, H) * (s.kind === 'img' && !s.v.startsWith('net') ? 0.5 : 0.3 * Math.min(2, Math.max(1, stickerAR(s)))), 0);
    selSt = stickers.length - 1; cur = 'size'; stSec = 'adjust';
  }
  drawStickers(); commit(); showTab('sticker');
}
// 匯入圖片當貼紙：長邊縮到 1024 像素
$('#file5').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !base) return;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const [w, h] = fitSize(bmp.width, bmp.height, 1024), c = newCanvas(w, h);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    stCat = 'mine'; addSticker({ kind: 'img', v: putCanvas(c, 'img') });
  } catch (err) { console.warn(err); toast('這張圖片打不開'); }
};
// 匯入的人像照自動摳圖，再把空白邊裁掉
async function cutoutSticker(st) {
  const src = getCanvas(st.v);
  if (!src) return;
  busy('摳圖中…');
  try {
    const m = await matte(src), w = src.width, h = src.height;
    const c = newCanvas(w, h), ctx = c.getContext('2d');
    ctx.drawImage(m, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h), a = d.data;
    const o = src.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, al = a[i];
      a[i] = o[i]; a[i + 1] = o[i + 1]; a[i + 2] = o[i + 2]; a[i + 3] = Math.min(o[i + 3], al);
      if (al > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) { toast('沒找到人像'); return; }
    ctx.putImageData(d, 0, 0);
    const out = newCanvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(c, -x0, -y0);
    // 裁掉邊之後，維持人在照片上的位置和大小
    const k = st.size * base.canvas.width / w;
    st.x += ((x0 + x1) / 2 - w / 2) * k / base.canvas.width; st.y += ((y0 + y1) / 2 - h / 2) * k / base.canvas.height;
    st.size *= out.width / w; st.v = putCanvas(out, 'img'); st.mask = null;
    drawStickers(); commit(); showTab('sticker');
  } catch (err) { console.warn(err); toast('摳圖模型載入失敗，檢查一下網路再試一次'); }
  finally { busy(); }
}
function stickerHTML(s, px) {
  if (s.kind === 'emoji') return `<span style="font-size:${px * 0.82}px;line-height:1;font-family:${EMOJI_FONT}">${s.v}</span>`;
  return `<img src="${stickerURL(s)}" alt="" draggable="false">`;
}
function stickerStyle(d, s, px, ar) {
  const m = s.mask ? `url(${canvasURL(s.mask)})` : '';
  Object.assign(d.style, {
    left: s.x * 100 + '%', top: s.y * 100 + '%', width: px + 'px', height: px / ar + 'px', opacity: s.op,
    transform: `translate(-50%,-50%) rotate(${s.rot}rad) scale(${s.flip ? -1 : 1},${s.flipv ? -1 : 1})`,
    mixBlendMode: blendById(s.blend)[3], webkitMaskImage: m, maskImage: m,
  });
}
// 擦除筆：遮罩跟貼紙同比例，長邊 512 像素，白色是留下、透明是擦掉
function stickerMask(s, ar) {
  const old = s.mask && getCanvas(s.mask);
  const [w, h] = ar >= 1 ? [512, Math.max(1, Math.round(512 / ar))] : [Math.max(1, Math.round(512 * ar)), 512];
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  if (old) ctx.drawImage(old, 0, 0, w, h); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  s.mask = putCanvas(c, 'mask');
  return c;
}
function paintMask(c, s, d, a, b) {
  // 螢幕座標換成貼紙自己的座標：先轉回去，再處理翻轉
  const r = d.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const wr = $('#wrap').getBoundingClientRect(), pw = s.size * wr.width;
  const loc = p => {
    let x = p.x - cx, y = p.y - cy;
    const cs = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    [x, y] = [x * cs - y * sn, x * sn + y * cs];
    if (s.flip) x = -x; if (s.flipv) y = -y;
    return { x: (x / pw + 0.5) * c.width, y: (y / (pw / (c.width / c.height)) + 0.5) * c.height };
  };
  const p0 = loc(a), p1 = loc(b), ctx = c.getContext('2d');
  // 筆刷大小以螢幕寬度為準，跟消除筆一樣：100 大約是螢幕寬的 1/5
  const rad = Math.max(1, stBrush / 100 * wr.width * 0.1) * c.width / pw;
  ctx.globalCompositeOperation = stPen === 'erase' ? 'destination-out' : 'source-over';
  // 硬度 100 是實心圓，越低邊緣越柔：沿著線段蓋一串漸層圓點
  const inner = rad * (0.2 + 0.8 * stHard / 100);
  const n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / Math.max(1, rad * 0.25)));
  for (let k = 0; k <= n; k++) {
    const x = p0.x + (p1.x - p0.x) * k / n, y = p0.y + (p1.y - p0.y) * k / n;
    const g = ctx.createRadialGradient(x, y, inner, x, y, rad);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = stHard >= 100 ? '#fff' : g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}
// 貼紙外框的寬高（px：貼紙「本體」的寬度）。摳圖圖層加了描邊會變大，本體大小不變
function stBox(s, px) {
  if (s.kind === 'cut') { const c = composeLayer(s); return c ? [px * c.canvas.width / c.w, px * c.canvas.height / c.w] : [px, px]; }
  return [px, px / stickerAR(s)];
}
const stTab = s => s?.kind === 'cut' ? 'cut' : 'sticker';
// 摳圖圖層畫成螢幕大小的小圖放進去（原圖可能很大）
function cutView(s, w, h, plain) {
  const c = composeLayer(plain ? { ...s, st: null } : s), cv = document.createElement('canvas');
  const k = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, Math.min(c.canvas.width, Math.round(w * k))); cv.height = Math.max(1, Math.round(cv.width * h / w));
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  if (plain) { // 擦除時先不算描邊，比較快；本體放在描邊留白的位置
    const full = composeLayer(s), sc = cv.width / full.canvas.width;
    ctx.drawImage(c.canvas, full.pad * sc, full.pad * sc, c.w * sc, c.h * sc);
  } else ctx.drawImage(c.canvas, 0, 0, cv.width, cv.height);
  return cv;
}
let brushR = 40; // 1~100，照 Hypic 手動摳圖筆刷預設 40；半徑 = 值 × 1.5 像素
let cutHard = 80, cutBsub = 'size'; // 硬度 0~100 預設 80 照 Hypic
function drawStickers() {
  const layer = $('#stickers'), wr = { width: $('#wrap').offsetWidth };
  layer.innerHTML = '';
  stickers.forEach((s, i) => {
    const d = document.createElement('div'), px = s.size * wr.width;
    if (s.kind === 'cut' && !composeLayer(s)) return;
    const [bw, bh] = stBox(s, px), T = stTab(s), ar = bw / bh;
    const sel = i === selSt && tab === T, erasing = sel && T === 'sticker' && stSec === 'erase';
    d.className = 'st' + (sel ? ' sel' : '') + (erasing ? ' erasing' : '');
    if (s.kind === 'cut') d.append(cutView(s, bw, bh)); else d.innerHTML = stickerHTML(s, px);
    stickerStyle(d, s, bw, ar);
    const pts = new Map(); let g = null, paint = null, pen = null;
    const start = () => {
      const [a, b] = [...pts.values()];
      g = { x: s.x, y: s.y, size: s.size, rot: s.rot, p: { ...a }, d: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0, a: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0, moved: false };
    };
    // 螢幕上的點 → 圖層裡的像素座標
    const local = (cx, cy) => {
      const r = $('#wrap').getBoundingClientRect(), c = composeLayer(s), sc = s.size * r.width / c.w;
      const dx = cx - (r.left + s.x * r.width), dy = cy - (r.top + s.y * r.height), co = Math.cos(s.rot), si = Math.sin(s.rot);
      let lx = dx * co + dy * si; const ly = -dx * si + dy * co;
      if (s.flip) lx = -lx;
      return { x: lx / sc + c.w / 2, y: ly / sc + c.h / 2, sc };
    };
    const painting = () => tab === 'cut' && selSt === i && (cur === 'erase' || cur === 'restore');
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); try { d.setPointerCapture(e.pointerId); } catch {}
      if (painting()) {
        s.v = cloneAlpha(s.v); // 每一筆存成新的一份，才能復原
        const p = local(e.clientX, e.clientY);
        paint = { pts: [p], r: brushR * 1.5 / p.sc };
        brush(s.v, paint.pts, paint.r, cur === 'restore', cutHard);
        d.replaceChildren(cutView(s, bw, bh, true));
        return;
      }
      if (erasing) {
        const p = { x: e.clientX, y: e.clientY };
        pen = { c: stickerMask(s, ar), last: p };
        paintMask(pen.c, s, d, p, p); touchCanvas(s.mask); stickerStyle(d, s, px, ar);
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start();
      if (selSt !== i || tab !== T) { selSt = i; cur = 'size'; if (T === 'sticker') stSec = 'adjust'; showTab(T); }
    });
    let rafM = 0;
    d.addEventListener('pointermove', e => {
      if (paint) {
        const p = local(e.clientX, e.clientY);
        brush(s.v, [paint.pts[paint.pts.length - 1], p], paint.r, cur === 'restore', cutHard); paint.pts.push(p);
        d.replaceChildren(cutView(s, bw, bh, true));
        return;
      }
      if (pen) {
        const p = { x: e.clientX, y: e.clientY };
        paintMask(pen.c, s, d, pen.last, p); pen.last = p;
        if (!rafM) rafM = requestAnimationFrame(() => { rafM = 0; touchCanvas(s.mask); stickerStyle(d, s, s.size * $('#wrap').offsetWidth, ar); });
        return;
      }
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
      const ww = $('#wrap').offsetWidth, [w2, h2] = stBox(s, s.size * ww);
      stickerStyle(d, s, w2, w2 / h2);
      if (s.kind === 'emoji') d.firstChild.style.fontSize = s.size * ww * 0.82 + 'px';
    });
    const up = e => {
      if (paint) { paint = null; drawStickers(); commit(); return; }
      if (pen) { pen = null; touchCanvas(s.mask); stickerStyle(d, s, s.size * $('#wrap').offsetWidth, ar); commit(); showTab('sticker'); return; }
      pts.delete(e.pointerId);
      if (g?.moved && !pts.size) { commit(); if (tab === T) showTab(T); }
      if (pts.size) start(); else g = null;
    };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    layer.append(d);
  });
}
let dsRaf = 0;
const drawStickersSoon = () => { dsRaf ||= requestAnimationFrame(() => { dsRaf = 0; drawStickers(); }); };

// ---------- 摳圖圖層 ----------
let stGroup = 'basic', stK = 'w', mkK = 'size', popK = 'y', addCut = false;
const CUT_MODES = [['size', '大小'], ['rot', '旋轉'], ['op', '透明度'], ['stroke', '描邊'], ['mask', '形狀'], ['erase', '擦除'], ['restore', '補回']];
const cutCount = () => stickers.filter(s => s.kind === 'cut').length;
function newCut(id, x, y, size) {
  if (cutCount() >= LAYER_LIMIT) { toast(`最多只能新增 ${LAYER_LIMIT} 個`); return; }
  stickers.push({ kind: 'cut', v: id, x, y, size, rot: 0, flip: false, op: 1, st: { ...STROKE0 }, mk: { ...MASK0 } });
  selSt = stickers.length - 1; cur = 'stroke';
  drawStickers(); commit(); showTab('cut');
}
// 從目前的照片（含調整、美顏）摳出人像，放在原本的位置上
async function cutPerson() {
  busy('摳出人像…');
  try {
    const m = await getMatte(base);
    if (!m) return;
    base.matteA ||= alphaFromMatte(m);
    draw(true);
    const r = cutLayer($('#gl'), base.matteA);
    render();
    if (!r) return toast('照片裡找不到人像');
    const W = base.canvas.width, H = base.canvas.height;
    newCut(r.id, (r.box.x + r.box.w / 2) / W, (r.box.y + r.box.h / 2) / H, r.box.w / W);
    toast('已摳出人像，可以拖曳移動、加描邊');
  } finally { busy(); }
}
$('#file4').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const W = base.canvas.width, H = base.canvas.height;
    const c = newCanvas(...fitSize(bmp.width, bmp.height, 2048)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (addCut) {
      busy('摳圖中…');
      try {
        const r = cutLayer(c, alphaFromMatte(await matte(c)));
        if (!r) return toast('這張照片找不到人像');
        const size = Math.min(0.6, 0.6 * (H / W) * r.box.w / r.box.h);
        newCut(r.id, 0.5, 0.55, size);
      } finally { busy(); }
    } else newCut(photoLayer(c), 0.5, 0.5, 0.5);
  } catch (err) { console.error(err); toast('這張照片打不開'); }
};
// 照片圖層按「摳圖」：只留下人，範圍縮到人，位置不跳
async function cutSelected(s) {
  const L = layerInfo(s.v);
  busy('摳圖中…');
  try {
    const src = newCanvas(L.rgb.width, L.rgb.height), ctx = src.getContext('2d');
    ctx.drawImage(L.rgb, 0, 0);
    const A = alphaFromMatte(await matte(src)), ac = A.getContext('2d');
    ac.globalCompositeOperation = 'destination-in'; ac.drawImage(L.alpha, 0, 0);
    const r = cutLayer(src, A);
    if (!r) return toast('這張照片找不到人像');
    // 新的中心在圖層裡偏了多少，照圖層的翻轉、旋轉換回照片座標
    const k = s.size / L.rgb.width, ar = base.canvas.width / base.canvas.height;
    let ox = r.box.x + r.box.w / 2 - L.rgb.width / 2; const oy = r.box.y + r.box.h / 2 - L.rgb.height / 2;
    if (s.flip) ox = -ox;
    const co = Math.cos(s.rot), si = Math.sin(s.rot);
    s.x += (ox * co - oy * si) * k; s.y += (ox * si + oy * co) * k * ar;
    s.size = r.box.w * k; s.v = r.id;
    drawStickers(); commit(); showTab('cut');
  } finally { busy(); }
}
// 描邊縮圖：小人形套上描邊
const strokeThumbs = new Map();
function strokeThumb(t, c) {
  const k = t + c;
  if (!strokeThumbs.has(k)) {
    const g = newCanvas(64, 64), x = g.getContext('2d');
    x.fillStyle = '#c9c9d1'; x.beginPath(); x.arc(32, 23, 9, 0, 7); x.fill();
    x.beginPath(); x.ellipse(32, 52, 14, 13, 0, Math.PI, 0); x.fill(); x.fillRect(18, 52, 28, 12);
    const o = newCanvas(64, 64), ox = o.getContext('2d');
    if (t) { const sl = strokeLayer(g, { t, c, w: 100, o: 100 }); ox.drawImage(sl.canvas, -sl.pad, -sl.pad); }
    ox.drawImage(g, 0, 0);
    strokeThumbs.set(k, o.toDataURL());
  }
  return strokeThumbs.get(k);
}
// 描邊面板：摳圖圖層和出框的人共用。st 直接改，change 要畫面更新，done 要存一筆歷史
function strokePanel(box, st, change, done) {
  [['basic', '基本'], ['fx', '進階']].forEach(([g, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: stGroup === g, onclick: () => { stGroup = g; showTab(tab); } })));
  box.append(item({ label: '無', icon: I.off, on: !st.t, onclick: () => { st.t = ''; change(); done(); showTab(tab); } }));
  STROKES.filter(x => x.g === stGroup).forEach(x => box.append(item({
    label: x.name, cls: 'ft', on: st.t === x.id, style: `background:#2a2a2e url(${strokeThumb(x.id, st.c)}) center/contain no-repeat`,
    onclick: () => { st.t = x.id; change(); done(); showTab(tab); },
  })));
  if (!st.t || st.t === 'rainbow') return hideSlider();
  STROKE_COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw' + (st.c === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
    b.onclick = () => { st.c = c; change(); done(); showTab(tab); };
    box.append(b);
  });
  const pick = document.createElement('button');
  pick.className = 'sw'; pick.style.cssText = 'align-self:center;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
  pick.onclick = () => { const cp = $('#colorPick'); cp.value = st.c; cp.oninput = () => { st.c = cp.value; change(); }; cp.onchange = () => { done(); showTab(tab); }; cp.click(); };
  box.append(pick);
}
function strokeSlider(st, change) {
  if (!st.t) return;
  if (stK === 'o') setSlider('不透明', 0, 100, st.o, v => { st.o = v; change(); });
  else setSlider('粗細', 1, 100, st.w, v => { st.w = v; change(); });
}
function strokeKChips(box) {
  [['w', '粗細'], ['o', '不透明度']].forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: stK === k, onclick: () => { stK = k; showTab(tab); } })));
}
const shapeIcon = id => { const c = newCanvas(44, 44), x = c.getContext('2d'); x.translate(22, 22); x.fillStyle = '#fff'; shapePath(x, id, 34, 34, 30); x.fill(); return c.toDataURL(); };
const SHAPE_ICONS = {};
function tabCut(box) {
  const s = stickers[selSt]?.kind === 'cut' ? stickers[selSt] : null;
  const cats = $('#cats'); cats.innerHTML = '';
  if (!s) {
    selSt = -1; hideSlider();
    box.append(item({ label: '摳出人像', icon: I.person, onclick: cutPerson }));
    box.append(item({ label: '加照片摳圖', icon: I.plus, onclick: () => { addCut = true; $('#file4').click(); } }));
    box.append(item({ label: '加照片', icon: I.plus, onclick: () => { addCut = false; $('#file4').click(); } }));
    $('#note').textContent = cutCount() ? '點一下照片上的圖層來編輯。' : '把人摳出來變成圖層，可以描邊、套形狀、複製成好幾個。照片只在你的裝置上處理。';
    return;
  }
  const L = layerInfo(s.v);
  cats.hidden = false;
  cats.append(item({ label: '完成', icon: '完成', cls: 'wide', onclick: () => { selSt = -1; showTab('cut'); } }));
  CUT_MODES.forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: cur === k,
    set: k === 'stroke' ? !!s.st.t : k === 'mask' ? !!s.mk.s : false, onclick: () => { cur = k; showTab('cut'); } })));
  if (!CUT_MODES.some(m => m[0] === cur)) cur = 'size';
  const ch = () => drawStickersSoon(), done = () => { drawStickers(); commit(); };
  if (cur === 'stroke') {
    strokePanel(box, s.st, ch, done);
    if (s.st.t) { strokeKChips(box); strokeSlider(s.st, ch); }
    $('#note').textContent = '';
    return;
  }
  if (cur === 'mask') {
    box.append(item({ label: '無', icon: I.off, on: !s.mk.s, onclick: () => { s.mk.s = ''; done(); showTab('cut'); } }));
    SHAPES.forEach(x => box.append(item({ label: x.name, icon: `<img src="${SHAPE_ICONS[x.id] ||= shapeIcon(x.id)}" width="24" height="24">`, on: s.mk.s === x.id,
      onclick: () => { s.mk.s = x.id; done(); showTab('cut'); } })));
    if (!s.mk.s) { hideSlider(); $('#note').textContent = '套上形狀，只留下形狀裡面的部分。'; return; }
    const ks = [['size', '大小', 10, 150], ['feather', '羽化', 0, 100], ['angle', '旋轉', -180, 180], ...(s.mk.s === 'rect' ? [['radius', '圓角', 0, 100]] : []),
      ['cx', '左右', 0, 100], ['cy', '上下', 0, 100]];
    if (!ks.some(k => k[0] === mkK)) mkK = 'size';
    ks.forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: mkK === k, onclick: () => { mkK = k; showTab('cut'); } })));
    const [k, lb, a, b] = ks.find(x => x[0] === mkK), pct = k === 'cx' || k === 'cy';
    setSlider(lb, a, b, Math.round(pct ? s.mk[k] * 100 : s.mk[k]), v => { s.mk[k] = pct ? v / 100 : v; ch(); });
    $('#note').textContent = '';
    return;
  }
  if (cur === 'erase' || cur === 'restore') {
    [['size', '大小'], ['hard', '硬度']].forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: cutBsub === k, onclick: () => { cutBsub = k; showTab('cut'); } })));
    if (cutBsub === 'hard') setSlider('硬度', 0, 100, cutHard, v => { cutHard = v; });
    else setSlider('筆刷', 1, 100, brushR, v => { brushR = v; });
    $('#note').textContent = cur === 'erase' ? '在圖層上塗抹，擦掉不要的地方。' : '塗抹把擦掉的地方補回來。';
    return;
  }
  if (!L.cut) box.append(item({ label: '摳圖', icon: I.person, onclick: () => cutSelected(s) }));
  box.append(item({ label: '翻轉', icon: I.flip, onclick: () => { s.flip = !s.flip; done(); } }));
  box.append(item({ label: '複製', icon: I.copy, onclick: () => {
    if (cutCount() >= LAYER_LIMIT) return toast(`最多只能新增 ${LAYER_LIMIT} 個`);
    stickers.push(clone({ ...s, x: Math.min(0.95, s.x + 0.06), y: Math.min(0.95, s.y + 0.04) })); selSt = stickers.length - 1;
    done(); showTab('cut');
  } }));
  box.append(item({ label: '上移', icon: '▲', onclick: () => { if (selSt < stickers.length - 1) { [stickers[selSt], stickers[selSt + 1]] = [stickers[selSt + 1], stickers[selSt]]; selSt++; done(); } } }));
  box.append(item({ label: '下移', icon: '▼', onclick: () => { if (selSt > 0) { [stickers[selSt], stickers[selSt - 1]] = [stickers[selSt - 1], stickers[selSt]]; selSt--; done(); } } }));
  box.append(item({ label: '刪除', icon: I.trash, onclick: () => { stickers.splice(selSt, 1); selSt = -1; done(); showTab('cut'); } }));
  if (cur === 'size') setSlider('大小', 3, 150, Math.round(s.size * 100), v => { s.size = v / 100; ch(); });
  if (cur === 'rot') setSlider('旋轉', -180, 180, Math.round(s.rot * 180 / Math.PI), v => { s.rot = v * Math.PI / 180; ch(); });
  if (cur === 'op') setSlider('透明', 10, 100, Math.round(s.op * 100), v => { s.op = v / 100; ch(); });
  $('#note').textContent = '拖曳移動，兩指可以縮放和旋轉。';
}

// ---------- 出框 ----------
const POP_CLASH = ['pop', 'mirror'];
const popStroke = { key: '', v: null };
// 畫出框圖：W×H 是要輸出的大小
function popDraw(ctx, W, H) {
  const gl = $('#gl');
  let person = null, stroke = null, box = null;
  if (base.matte) {
    base.matteA ||= alphaFromMatte(base.matte);
    base.mBox ||= alphaBox(base.matteA);
    const BW = base.canvas.width, k = W / BW;
    person = newCanvas(W, H);
    const pc = person.getContext('2d'); pc.imageSmoothingQuality = 'high';
    pc.drawImage(gl, 0, 0, W, H); pc.globalCompositeOperation = 'destination-in'; pc.drawImage(base.matteA, 0, 0, W, H);
    if (base.mBox) box = { x: base.mBox.x * k, y: base.mBox.y * k, w: base.mBox.w * k, h: base.mBox.h * k };
    if (P.popSt.t) {
      const key = [W, H, JSON.stringify(P.popSt)].join('|');
      if (popStroke.key !== key || popStroke.base !== base) {
        const a = newCanvas(W, H); a.getContext('2d').drawImage(base.matteA, 0, 0, W, H);
        Object.assign(popStroke, { key, base, v: strokeLayer(a, P.popSt) });
      }
      stroke = popStroke.v;
    }
  }
  drawPop(ctx, W, H, P, gl, person, stroke, box);
}
function paintPop() {
  const on = !!P.pop && !cropState, pc = $('#pop');
  $('#wrap').classList.toggle('popon', on);
  if (!on) return;
  const r = $('#wrap').getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(Math.min(base.canvas.width, r.width * k))), H = Math.max(1, Math.round(W * base.canvas.height / base.canvas.width));
  if (pc.width !== W || pc.height !== H) { pc.width = W; pc.height = H; }
  const ctx = pc.getContext('2d'); ctx.clearRect(0, 0, W, H);
  popDraw(ctx, W, H);
}
function popThumb(id) {
  return thumbOf('pop' + id + (base.matte ? 'm' : ''), () => {
    const s = small(), c = newCanvas(s.width, s.height), keep = P.pop;
    P.pop = id;
    try { popDrawSmall(c.getContext('2d'), s); } finally { P.pop = keep; }
    return squareFit(c);
  });
}
function popDrawSmall(ctx, s) {
  const W = s.width, H = s.height;
  let person = null, box = null;
  if (base.matte) {
    base.matteA ||= alphaFromMatte(base.matte); base.mBox ||= alphaBox(base.matteA);
    const k = W / base.canvas.width;
    person = newCanvas(W, H); const pc = person.getContext('2d');
    pc.drawImage(s, 0, 0); pc.globalCompositeOperation = 'destination-in'; pc.drawImage(base.matteA, 0, 0, W, H);
    if (base.mBox) box = { x: base.mBox.x * k, y: base.mBox.y * k, w: base.mBox.w * k, h: base.mBox.h * k };
  }
  drawPop(ctx, W, H, { ...P, popBg: P.popBg }, s, person, null, box);
}
function squareFit(c) {
  const o = newCanvas(124, 124), x = o.getContext('2d'), k = Math.max(124 / c.width, 124 / c.height);
  x.drawImage(c, (124 - c.width * k) / 2, (124 - c.height * k) / 2, c.width * k, c.height * k);
  return o.toDataURL('image/jpeg', 0.8);
}
function tabPop(box) {
  const cats = $('#cats'), ch = () => render(), done = () => commit();
  const ks = !P.pop ? [] : P.pop === 'behind' ? [['y', '文字位置'], ['text', '文字'], ['st', '人像描邊']] : [['y', '框高度'], ['m', '邊距'], ['bg', '背景'], ['st', '人像描邊']];
  if (!ks.some(k => k[0] === popK)) popK = 'y';
  if (ks.length) {
    const sep = document.createElement('span'); sep.style.cssText = 'flex:none;width:1px;background:var(--line);margin:6px 4px';
    cats.append(sep);
    ks.forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: popK === k, onclick: () => { popK = k; showTab('fun'); } })));
  }
  $('#note').textContent = !P.pop ? '照片放進相框或九宮格，人像衝出框外。全部在你的裝置上處理。' : base.matte ? '' : LOW_MEM ? '正在摳出人像…' : '正在摳出人像（第一次要下載模型）…';
  // 背景、文字、描邊：選項取代範本列表
  if (popK === 'bg') {
    hideSlider();
    POP_BGS.forEach(([v, lb]) => box.append(item({ label: lb, on: P.popBg === v, style: v === 'blur' ? 'background:linear-gradient(135deg,#888,#333)' : `background:${v}`,
      onclick: () => { P.popBg = v; render(); commit(); showTab('fun'); } })));
    return;
  }
  if (popK === 'text') {
    hideSlider();
    $('#textedit').hidden = false;
    const ti = $('#textInput'); ti.value = P.popText;
    ti.oninput = () => { P.popText = ti.value; ch(); }; ti.onchange = () => commit();
    TEXT_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'sw' + (P.popTC === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
      b.onclick = () => { P.popTC = c; render(); commit(); showTab('fun'); };
      box.append(b);
    });
    return;
  }
  if (popK === 'st') {
    hideSlider();
    strokePanel(box, P.popSt, ch, done);
    if (P.popSt.t) { strokeKChips(box); strokeSlider(P.popSt, ch); }
    return;
  }
  box.append(item({ label: '無', icon: I.off, on: !P.pop, onclick: () => { P.pop = ''; render(); commit(); showTab('fun'); } }));
  POPS.forEach(p => box.append(item({ label: p.name, cls: 'ft', on: P.pop === p.id, style: `background-image:url(${popThumb(p.id)})`,
    onclick: () => { P.pop = p.id; if (POP_CLASH.includes(P.fx)) P.fx = ''; render(); commit(); showTab('fun'); } })));
  if (!P.pop) return hideSlider();
  if (popK === 'm') setSlider('邊距', 0, 25, P.popM, v => { P.popM = v; ch(); });
  else setSlider(P.pop === 'behind' ? '位置' : '高度', 0, 100, P.popY, v => { P.popY = v; ch(); });
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
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  [['pop', '出框'], ['blur', '景深'], ['fx', '特效'], ['ov', '光效']].forEach(([k, lb]) => cats.append(item({
    label: lb, icon: lb, cls: 'wide', on: cSec === k, set: k === 'pop' ? !!P.pop : k === 'blur' ? P.blur > 0 : k === 'fx' ? !!P.fx : !!P.ov,
    onclick: () => { cSec = k; if (k === 'blur' && !P.blur) { P.blur = 40; findPerson(true); render(); commit(); } showTab('fun'); },
  })));
  if (cSec === 'pop') return tabPop(box);
  if (cSec === 'blur') {
    box.append(item({ label: '關閉', icon: I.off, on: !P.blur, onclick: () => { P.blur = 0; render(); commit(); showTab('fun'); } }));
    BOKEH.forEach(([id, lb, ic]) => box.append(item({ label: lb, icon: ic, on: !!P.blur && P.blurStyle === id, onclick: () => {
      P.blurStyle = id; if (!P.blur) P.blur = 40; findPerson(true); render(); commit(); showTab('fun');
    } })));
    if (P.blur) [['blurSize', '大小'], ['blur', '強度']].forEach(([k, lb]) => box.prepend(item({ label: lb, icon: lb, cls: 'wide', on: blurK === k, onclick: () => { blurK = k; showTab('fun'); } })));
    if (blurK === 'blurSize' && P.blur) setSlider('大小', 0, 100, P.blurSize, v => { P.blurSize = v; render(); }, P0.blurSize);
    else setSlider('虛化', 0, 100, P.blur, v => { P.blur = v; if (v) findPerson(true); render(); });
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
        if (POP_CLASH.includes(e.id)) P.pop = ''; // 四格、鏡像會改變人的位置，跟出框不能一起用
        showTab('fun'); render(); commit();
        if (e.seg && !base.seg) { await findPerson(); render(); }
      },
    })));
    const e = fxById(P.fx);
    if (!e) { hideSlider(); $('#note').textContent = '漫畫、素描、分身、雙重曝光這些都在這裡。'; return; }
    setSlider('強度', 0, 100, P.fxAmt, v => { P.fxAmt = v; render(); });
    $('#note').textContent = { ghost: '自動找出人像，往旁邊複製出殘影。', double: '人的輪廓裡透出第二張圖，可以換成自己的照片。', mirror: '左半邊鏡射到右邊。' }[e.id] || '';
    if (e.id === 'double') {
      BG_PHOTOS.forEach(x => box.append(item({ label: x.name, cls: 'ft', on: P.ex === x.id, style: `background-image:url(${x.src})`,
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
  texts.forEach(t => {
    if (kind === 'rot') t.rot = (t.rot || 0) + Math.PI / 2;
    else t.rot = -(t.rot || 0);
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
// 面板照醒圖文字工具：範本、字型、樣式、描邊、效果、陰影、背景、彎曲、排列、圖層
let txSec = 'tpl', txSub = {};
const TX_SECS = [['tpl', '範本'], ['font', '字型'], ['style', '樣式'], ['stroke', '描邊'], ['fx', '效果'], ['shadow', '陰影'], ['bg', '背景'], ['curve', '彎曲'], ['arrange', '排列'], ['layer', '圖層']];
// 範本縮圖：用同一支繪製程式畫一個「Aa」
const tplThumbs = new Map();
function tplThumb(tp) {
  if (!tplThumbs.has(tp.id)) {
    const c = newCanvas(92, 92), ctx = c.getContext('2d'), t = { ...T0, text: 'Aa' };
    applyTemplate(t, tp); t.text = 'Aa';
    ctx.translate(46, 46); drawText(ctx, t, 40);
    tplThumbs.set(tp.id, c.toDataURL());
  }
  return tplThumbs.get(tp.id);
}
function addText(tp) {
  const t = { ...T0 };
  if (tp) applyTemplate(t, tp);
  texts.push(t); selText = texts.length - 1; txSec = 'tpl';
  loadFont(t.font, t.text).then(drawTexts);
  drawTexts(); commit(); showTab('text');
  setTimeout(() => { const ti = $('#textInput'); ti.focus(); ti.select(); }, 50);
}
// 一排色票，最後一個是自選顏色
function swatches(box, val, set, extra = []) {
  extra.forEach(e => box.append(e));
  TEXT_COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw' + (val === c ? ' on' : ''); b.style.background = c; b.style.alignSelf = 'center';
    b.onclick = () => { set(c); drawTexts(); commit(); showTab('text'); };
    box.append(b);
  });
  const pick = document.createElement('button');
  pick.className = 'sw'; pick.style.cssText = 'align-self:center;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
  pick.onclick = () => { const cp = $('#colorPick'); cp.value = val || '#ffffff'; cp.oninput = () => { set(cp.value); drawTexts(); }; cp.onchange = () => { commit(); showTab('text'); }; cp.click(); };
  box.append(pick);
}
// 幾個滑桿共用一排切換鈕
function subSliders(box, sec, defs, t) {
  const k = txSub[sec] && defs.some(d => d[0] === txSub[sec]) ? txSub[sec] : defs[0][0];
  txSub[sec] = k;
  defs.forEach(([id, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: id === k, onclick: () => { txSub[sec] = id; showTab('text'); } })));
  const [, lb, min, max] = defs.find(d => d[0] === k);
  setSlider(lb.slice(0, 2), min, max, t[k], v => { t[k] = v; drawTexts(); });
}
function tabText(box) {
  const t = texts[selText];
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  if (!t) {
    hideSlider();
    cats.hidden = true;
    box.append(item({ label: '加文字', icon: I.plus, onclick: () => addText() }));
    TEMPLATES.forEach(tp => box.append(item({ label: tp.name, cls: 'ft', style: `background-image:url(${tplThumb(tp)});background-color:#3a3a42`, onclick: () => addText(tp) })));
    $('#note').textContent = texts.length ? '點一下照片上的文字來編輯，拖曳移動，兩指縮放旋轉。' : '點「加文字」，或直接選一個範本。';
    return;
  }
  $('#textedit').hidden = false;
  const ti = $('#textInput'); ti.value = t.text;
  ti.oninput = () => { t.text = ti.value; drawTexts(); if (FONTS[t.font].gf) loadFont(t.font, t.text).then(drawTexts); };
  ti.onchange = () => commit();
  const redo = () => { drawTexts(); commit(); showTab('text'); };
  const isSet = {
    tpl: !!t.tpl, font: t.font > 0, style: t.italic || t.under || !t.bold || t.op < 100 || !!t.color2, stroke: t.stroke > 0,
    fx: !!t.fx, shadow: t.shadow > 0, bg: t.bg > 0, curve: !!t.curve, arrange: t.align !== 'center' || !!t.ls || !!t.lh || t.vert, layer: false,
  };
  cats.append(item({ label: '完成', icon: '完成', cls: 'wide', onclick: () => { selText = -1; drawTexts(); showTab('text'); } }));
  TX_SECS.forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: txSec === k, set: isSet[k], onclick: () => { txSec = k; showTab('text'); } })));
  const sizeSlider = () => setSlider('大小', 2, 40, Math.round(t.size * 100), v => { t.size = v / 100; drawTexts(); });
  hideSlider();
  if (txSec === 'tpl') {
    sizeSlider();
    box.append(item({ label: '無', icon: I.off, on: !t.tpl, onclick: () => { applyTemplate(t, null); redo(); } }));
    TEMPLATES.forEach(tp => box.append(item({
      label: tp.name, cls: 'ft', on: t.tpl === tp.id, style: `background-image:url(${tplThumb(tp)});background-color:#3a3a42`,
      onclick: () => { applyTemplate(t, tp); loadFont(t.font, t.text).then(drawTexts); redo(); },
    })));
  } else if (txSec === 'font') {
    sizeSlider();
    FONTS.forEach((f, i) => box.append(item({
      label: f.name, icon: f.name.length > 3 ? f.name : '字', cls: 'wide', on: t.font === i, style: `font-family:${f.css.replace(/"/g, "'")};font-size:15px`,
      onclick: () => { t.font = i; redo(); if (f.gf) loadFont(i, t.text).then(drawTexts); },
    })));
    FONTS.forEach((f, i) => f.gf && loadFont(i, f.name));
    $('#note').textContent = '中文字型來自開源字型（SIL OFL），第一次用會下載。';
  } else if (txSec === 'style') {
    box.append(item({ label: '粗體', icon: '<b>B</b>', on: t.bold, onclick: () => { t.bold = !t.bold; redo(); } }));
    box.append(item({ label: '斜體', icon: '<i>I</i>', on: t.italic, onclick: () => { t.italic = !t.italic; redo(); } }));
    box.append(item({ label: '底線', icon: '<u>U</u>', on: t.under, onclick: () => { t.under = !t.under; redo(); } }));
    box.append(item({ label: '漸層', icon: '漸', on: !!t.color2, onclick: () => { t.color2 = t.color2 ? null : TEXT_COLORS[(TEXT_COLORS.indexOf(t.color) + 3) % TEXT_COLORS.length]; redo(); } }));
    if (t.color2) {
      swatches(box, t.color2, c => { t.color2 = c; });
      $('#note').textContent = '現在選的是漸層下半部的顏色。';
    } else swatches(box, t.color, c => { t.color = c; });
    setSlider('透明', 0, 100, t.op, v => { t.op = v; drawTexts(); });
  } else if (txSec === 'stroke') {
    const auto = item({ label: '自動', icon: '自動', cls: 'wide', on: !t.strokeColor, onclick: () => { t.strokeColor = null; if (!t.stroke) t.stroke = 30; redo(); } });
    swatches(box, t.strokeColor, c => { t.strokeColor = c; if (!t.stroke) t.stroke = 30; }, [auto]);
    setSlider('寬度', 0, 100, t.stroke, v => { t.stroke = v; drawTexts(); });
  } else if (txSec === 'fx') {
    box.append(item({ label: '無', icon: I.off, on: !t.fx, onclick: () => { t.fx = ''; redo(); } }));
    TEXT_FX.forEach(([id, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: t.fx === id, onclick: () => { t.fx = id; redo(); } })));
    if (t.fx && t.fx !== 'hollow' && t.fx !== 'glitch') swatches(box, t.fxColor, c => { t.fxColor = c; });
    if (t.fx && t.fx !== 'hollow') setSlider(t.fx === '3d' ? '厚度' : t.fx === 'glitch' ? '錯開' : '寬度', 0, 100, t.fxAmt, v => { t.fxAmt = v; drawTexts(); });
    $('#note').textContent = t.fx === 'hollow' ? '鏤空只留描邊，描邊顏色、寬度到「描邊」調。' : '花字效果畫在描邊下面，可以跟描邊、陰影一起用。';
  } else if (txSec === 'shadow') {
    if (!t.shadow) { t.shadow = 60; drawTexts(); }
    subSliders(box, 'shadow', [['shadow', '不透明度', 0, 100], ['shadowBlur', '模糊', 0, 100], ['shadowAngle', '角度', -180, 180], ['shadowDist', '位移', 0, 100]], t);
    swatches(box, t.shadowColor, c => { t.shadowColor = c; if (!t.shadow) t.shadow = 60; });
  } else if (txSec === 'bg') {
    swatches(box, t.bg ? t.bgColor : null, c => { t.bgColor = c; if (!t.bg) t.bg = 100; }, [item({ label: '無', icon: I.off, on: !t.bg, onclick: () => { t.bg = 0; redo(); } })]);
    setSlider('透明', 0, 100, t.bg, v => { t.bg = v; drawTexts(); });
  } else if (txSec === 'curve') {
    subSliders(box, 'curve', [['curve', '曲線', -100, 100], ['curveOff', '位移', -100, 100]], t);
    $('#note').textContent = t.vert ? '直書文字不能彎曲，先到「排列」改回橫書。' : '往右拱起、往左彎下，位移讓文字沿著弧線轉。';
  } else if (txSec === 'arrange') {
    box.append(item({ label: t.vert ? '直書' : '橫書', icon: t.vert ? '直書' : '橫書', cls: 'wide', on: t.vert, onclick: () => { t.vert = !t.vert; redo(); } }));
    (t.vert ? [['left', '靠上'], ['center', '置中'], ['right', '靠下']] : [['left', '靠左'], ['center', '置中'], ['right', '靠右']])
      .forEach(([k, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: t.align === k, onclick: () => { t.align = k; redo(); } })));
    subSliders(box, 'arrange', [['ls', '字距', -20, 100], ['lh', '行距', -20, 100]], t);
  } else {
    const mv = to => { const [x] = texts.splice(selText, 1); selText = Math.max(0, Math.min(texts.length, to)); texts.splice(selText, 0, x); redo(); };
    const top = texts.length - 1;
    box.append(item({ label: '置頂', icon: '置頂', cls: 'wide', onclick: () => selText < top && mv(top) }));
    box.append(item({ label: '上移', icon: '上移', cls: 'wide', onclick: () => selText < top && mv(selText + 1) }));
    box.append(item({ label: '下移', icon: '下移', cls: 'wide', onclick: () => selText > 0 && mv(selText - 1) }));
    box.append(item({ label: '置底', icon: '置底', cls: 'wide', onclick: () => selText > 0 && mv(0) }));
    box.append(item({ label: '複製', icon: I.copy, onclick: () => { texts.push({ ...t, x: Math.min(0.95, t.x + 0.04), y: Math.min(0.95, t.y + 0.04) }); selText = texts.length - 1; redo(); } }));
    box.append(item({ label: '刪除', icon: I.trash, onclick: () => { texts.splice(selText, 1); selText = -1; redo(); } }));
    sizeSlider();
  }
}
// 每段文字畫成一張 canvas，跟存檔用同一支程式，看到什麼就存什麼
const measureCtx = newCanvas(1, 1).getContext('2d');
function paintText(cv, t, fs) {
  const L = textLayout(measureCtx, t, fs), p = pad(t, fs), dpr = Math.min(3, devicePixelRatio || 1);
  const w = L.box.w + p * 2, h = L.box.h + p * 2;
  cv.width = Math.max(1, Math.ceil(w * dpr)); cv.height = Math.max(1, Math.ceil(h * dpr));
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, w / 2 * dpr, h / 2 * dpr);
  drawText(ctx, t, fs, L);
}
function drawTexts() {
  const layer = $('#texts'), wr = { width: $('#wrap').offsetWidth };
  layer.innerHTML = '';
  texts.forEach((t, i) => {
    Object.assign(t, upgradeText(t));
    const d = document.createElement('div'), cv = document.createElement('canvas');
    d.className = 'tx' + (i === selText && tab === 'text' ? ' sel' : '');
    d.append(cv);
    const place = () => {
      const w = $('#wrap').offsetWidth;
      paintText(cv, t, t.size * w);
      Object.assign(d.style, { left: t.x * 100 + '%', top: t.y * 100 + '%', transform: `translate(-50%,-50%) rotate(${t.rot || 0}rad)` });
    };
    place();
    // 拖曳移動，兩指縮放和旋轉
    const pts = new Map(); let g = null;
    const start = () => {
      const [a, b] = [...pts.values()];
      g = { x: t.x, y: t.y, size: t.size, rot: t.rot || 0, p: { ...a }, d: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0, a: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0, moved: g?.moved };
    };
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); try { d.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start();
      if (selText !== i || tab !== 'text') { selText = i; showTab('text'); }
    });
    d.addEventListener('pointermove', e => {
      if (!g || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = $('#wrap').getBoundingClientRect(), [a, b] = [...pts.values()];
      if (b && g.d) {
        t.size = Math.max(0.01, g.size * Math.hypot(b.x - a.x, b.y - a.y) / g.d);
        t.rot = g.rot + Math.atan2(b.y - a.y, b.x - a.x) - g.a;
        place();
      } else {
        t.x = g.x + (a.x - g.p.x) / r.width; t.y = g.y + (a.y - g.p.y) / r.height;
        d.style.left = t.x * 100 + '%'; d.style.top = t.y * 100 + '%';
      }
      g.moved = true;
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (g?.moved && !pts.size) { commit(); if (tab === 'text' && txSec === 'layer') showTab('text'); }
      if (pts.size) start(); else g = null;
    };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    layer.append(d);
    if (FONTS[t.font]?.gf && !FONTS[t.font].ok) loadFont(t.font, t.text).then(() => { FONTS[t.font].ok = true; place(); });
  });
}
$('#stage').addEventListener('pointerdown', e => {
  if (tab === 'text' && !e.target.closest('.tx') && selText >= 0) { selText = -1; drawTexts(); showTab('text'); }
  if ((tab === 'sticker' || tab === 'cut') && !e.target.closest('.st') && selSt >= 0) { selSt = -1; drawStickers(); showTab(tab); }
});

// ---------- 儲存 ----------
// 把目前的成品（含邊框、貼紙、文字）畫成一張 canvas，存檔和「拼貼／範本」共用
async function compose() {
  holdFull = true;
  try { return await composeFull(); } finally { holdFull = false; render(); }
}
async function composeFull() {
  if (P.pop && !base.matte) await getMatte(base);
  draw(true);
  const W = base.canvas.width, H = base.canvas.height, gl = $('#gl'), f = P.frame ? frameById(P.frame) : null;
  const g = f ? f.geom(W, H) : { W, H, x: 0, y: 0 };
  // iPhone 的 canvas 最大約 1600 萬像素，邊框加大後超過就整張等比縮小
  const sc = Math.min(1, Math.sqrt(16e6 / (g.W * g.H)));
  const out = newCanvas(g.W * sc, g.H * sc), ctx = out.getContext('2d');
  ctx.scale(sc, sc);
  // 出框要用原尺寸重畫一次（畫面上的是螢幕大小）
  let photo = gl;
  if (P.pop) { photo = newCanvas(W, H); popDraw(photo.getContext('2d'), W, H); }
  if (f) drawFrame(ctx, f, W, H, gl, (c, gg) => c.drawImage(photo, gg.x, gg.y, W, H));
  else ctx.drawImage(photo, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, W, H); ctx.clip(); ctx.translate(g.x, g.y);
  for (const s of stickers) {
    const w = s.size * W;
    ctx.save(); ctx.globalAlpha = s.op; ctx.globalCompositeOperation = blendById(s.blend)[2];
    ctx.translate(s.x * W, s.y * H); ctx.rotate(s.rot); ctx.scale(s.flip ? -1 : 1, s.flipv ? -1 : 1);
    if (s.kind === 'cut') {
      const c = composeLayer(s);
      if (c) { const k = w / c.w; ctx.drawImage(c.canvas, -c.canvas.width * k / 2, -c.canvas.height * k / 2, c.canvas.width * k, c.canvas.height * k); }
    } else {
      // 貼紙先畫成跟輸出一樣大的圖（套好擦除遮罩），再用混合模式疊上去
      const h = w / stickerAR(s), k = ctx.getTransform(), px = Math.hypot(k.a, k.b);
      ctx.drawImage(await renderSticker(s, w * px, h * px), -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
  await Promise.all(texts.map(t => loadFont(t.font, t.text)));
  for (const t of texts) {
    ctx.save(); ctx.translate(t.x * W, t.y * H); ctx.rotate(t.rot || 0);
    drawText(ctx, upgradeText(t), t.size * W);
    ctx.restore();
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

// 範本：選一個分類，用目前的照片（含所有修圖）開範本編輯
function tabTpl(box) {
  hideSlider();
  TPL_CATS.forEach(cat => box.append(item({ label: cat, icon: cat, cls: 'wide', onclick: async () => {
    busy('準備中…'); let c; try { c = await compose(); } finally { busy(); render(); }
    openCollage('tpl', [c], cat);
  } })));
  $('#note').textContent = '選一個分類，用這張照片套範本（雜誌封面、拍立得、海報、拍貼機…），進去後可以換範本、改文字。';
}

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
// 醒圖風格濾鏡的參數先在背景載入；載入前選到的（例如復原回來的）載好後重畫
loadXT().then(d => { if (d && base && xtItem(P.filter)) { gradeLutKey = ''; render(); } });
['#file', '#cam'].forEach(s => $(s).onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });
addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });

// ---------- 快捷鍵（照醒圖電腦版） ----------
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const KEYS = [
  ['空白鍵（按住）', '對比原圖'], [MOD + 'Z', '復原'], ['⇧' + MOD + 'Z', '重做'],
  [MOD + '＋ ／ ' + MOD + '−', '放大、縮小'], [MOD + '0', '回到全覽'], ['觸控板捏合、' + MOD + '＋滾輪', '縮放'], ['放大後拖曳照片外面、滑鼠中鍵', '移動畫面'],
  [MOD + 'S', '儲存'], [MOD + 'O', '換照片'],
  ...GROUPS.map(([, name, key]) => [key, name]), ['⌥' + MOD + '↑ ／ ↓', '上一個、下一個主選單'],
  ['↑ ／ ↓', '微調滑桿（加 ⇧ 一次 10）'], ['連點滑桿兩下', '歸零'], ['?', '這個說明'],
];
$('#keysList').innerHTML = KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
const keysPanel = on => $('#keys').classList.toggle('on', on);
$('#bKeys').onclick = () => keysPanel(true);
$('#keys').onclick = () => keysPanel(false);
const typing = e => e.target.closest?.('textarea,select,[contenteditable]') || (e.target.matches?.('input') && !e.target.matches('[type=range],[type=button],[type=checkbox]'));
let spaceCmp = false;
addEventListener('keydown', e => {
  if (typing(e)) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key;
  if (k === 'Escape') { keysPanel(false); return; }
  if (k === '?' && !mod) { keysPanel(!$('#keys').classList.contains('on')); e.preventDefault(); return; }
  if (mod && (k === 's' || k === 'S')) { e.preventDefault(); save(); return; }
  if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); $('#file').click(); return; }
  if (!base) return;
  if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? $('#bRedo').click() : $('#bUndo').click(); return; }
  if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); $('#bRedo').click(); return; }
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); view.zoomStep(1); return; }
  if (mod && (k === '-' || k === '_')) { e.preventDefault(); view.zoomStep(-1); return; }
  if (mod && k === '0') { e.preventDefault(); view.reset(); return; }
  if (mod && e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
    e.preventDefault();
    const i = GROUPS.indexOf(groupOf(tab)), n = GROUPS.length;
    openGroup(GROUPS[(i + (k === 'ArrowUp' ? n - 1 : 1)) % n][0]); return;
  }
  if (mod || e.altKey) return;
  if (k === ' ') { e.preventDefault(); if (!e.repeat) { spaceCmp = true; cmp(true); } return; }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    if (e.target.matches?.('input[type=range]')) return; // 已經點在滑桿上就交給瀏覽器
    if (nudge(k === 'ArrowUp' ? 1 : -1, e.shiftKey)) e.preventDefault();
    return;
  }
  const g = GROUPS.find(x => x[2] === k.toUpperCase());
  if (g && k.length === 1) { openGroup(g[0]); e.preventDefault(); }
});
addEventListener('keyup', e => { if (e.key === ' ' && spaceCmp) { spaceCmp = false; cmp(false); } });
addEventListener('blur', () => { if (spaceCmp) { spaceCmp = false; cmp(false); } });

// 給自動測試用
window.__editor = { loadFile, get P() { return P; }, get base() { return base; }, get stickers() { return stickers; }, get texts() { return texts; }, redraw: () => { drawTexts(); drawStickers(); }, showTab, save, render };
