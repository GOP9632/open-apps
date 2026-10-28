import { Renderer, MAX_WARPS } from './gl.js';
import { FILTERS, bakeLUT, thumb, filterFn, skinFilterFn, hairFilterFn } from './filters.js';
import { loadXT, xtData, xtItem } from './xt.js';
import { detectFaces, segment, skinMask, faceWarps, featureMask, faceGeom, blurCanvas, faceAnchor, beardSize } from './ai.js';
import { COVERS, COVER_CATS, coverPixels } from './coverface.js';
import { STICKERS, STICKER_CATS, EMOJIS, EMOJI_FONT, BLENDS, blendById, stickerAR, stickerURL, thumbURL, renderSticker, putCanvas, getCanvas, canvasURL, touchCanvas, ownImages, NET_PACKS, netURL, loadNetSticker, restoreCanvas } from './stickers.js';
import { FX, OVERLAYS, BG_PHOTOS, FRAMES, frameById, drawFrame, paint, fitSize } from './creative.js';
import { matte, LOW_MEM } from './matte.js';
import { GRADE_P0, gradeOn, gradeFn, gradeKey, tabGrade, gradeHide } from './grade.js';
import { HAIR, HAIR_P0, DYES, HairFx, prepHair, hairWarps, hairNeedsSeg, hairColorOn } from './hair.js';
import { tabErase, eraseLeave } from './erase.js';
import { makeupLayer, makeupTab, SCULPT, SC_COLOR, SC_P0 } from './makeup.js';
import { SKIN, TONE, WRINKLE, AI_FACE, AI_BODY, SKIN_P0, skinOn, skinKey, prepSkin, SkinFx, skinNote } from './skin.js';
import { BODY, BODY_P0, BODY_MAN, REG_OF, bodyOn, detectBody, measureBody, bodyWarps, manualWarps, manualRegion, bodyNote } from './body.js';
import { SHAPE_CATS, setShape, getShape, shapeIsSet, shapeMoves, resetShape, evalField } from './faceshape.js';
import { WarpField } from './warpfield.js';
import { RESHAPE, liqDab, liqRadius } from './reshape.js';
import { tabDoodle, doodleInput } from './doodle.js';
import { tabBeautyBrush, beautyBrushInput, bbRelease, bbWait } from './beautybrush.js';
import { FONTS, T0, TEXT_COLORS, TEXT_FX, TEMPLATES, applyTemplate, upgradeText, loadFont, layout as textLayout, pad, drawText } from './text.js';
import { initCollage, openCollage } from './collage.js';
import { CATS as TPL_CATS } from './templates.js';
import { buildDepth, LIGHT_CATS, LIGHTS, FLASHES, litParams, lightPosOf, lightGrad, flashStats } from './relight.js';
import { enhanceRanges, paintRange, setGrad, nudge, canvasZoom, pinch } from './ui.js';
import { tabLooks } from './looks.js';
import { perfReq, perfDrawn, perfBase, perfSkip } from './perf.js';
import { STROKES, STROKE_COLORS, STROKE0, strokeLayer, alphaFromMatte, alphaBox } from './outline.js';
import { SHAPES, MASK0, LAYER_LIMIT, shapePath, photoLayer, cutLayer, layerInfo, restoreLayer, cloneAlpha, compose as composeLayer, brush } from './layers.js';
import { listDrafts, readDraft, writeDraft, deleteDraft, encode, encodeSmall } from './draft.js';
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
  fresh: '<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0C6 10.4 8.5 7.2 12 3z"/><path d="M9.5 14a2.6 2.6 0 0 0 2.5 2.5"/></svg>',
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
};

const ADJUST = [
  ['flashFill', '閃光燈', I.flashA, 0, 60, 100], ['brightness', '亮度', I.sun], ['lightSense', '光感', I.lsense], ['exposure', '曝光', I.exposure], ['contrast', '對比', I.contrast], ['saturation', '飽和', I.drop],
  ['vibrance', '自然飽和', I.vib], ['texture', '質感', I.texture, 0], ['sharpen', '銳化', I.sharp, 0], ['structure', '結構', I.struct],
  ['highlights', '高光', I.high], ['shadows', '陰影', I.shadow], ['backlight', '背光校正', I.backlit, 0], ['temp', '色溫', I.temp], ['tint', '色調', I.tint],
  ['grain', '顆粒', I.grain, 0], ['fade', '褪色', I.fade, 0], ['vignette', '暗角', I.vig],
];
// 美顏只放皮膚類（照醒圖：美顏、臉部分開）。瘦臉、大眼以前在這裡另有一套滑桿，跟「臉型」的互不知道，
// 兩邊都調會瘦兩次（評審 M14）。現在美顏裡的瘦臉、大眼是捷徑，點了跳到臉型的同一個滑桿
const BEAUTY = [
  ['smooth', '磨皮', I.skin, 0], ['white', '美白', I.white, 0], ['dark', '黑眼圈', I.dark, 0], ['fold', '法令紋', I.fold, 0],
  ['eyeb', '亮眼', I.eyeb, 0], ['teeth', '白牙', I.teeth, 0],
];
// 舊版美顏的臉型滑桿：舊草稿裡可能有值，照樣畫、美顏的重設照樣清掉，只是不再出現滑桿
const BEAUTY_OLD = [['slim'], ['vface'], ['chin'], ['eyes'], ['nose'], ['mouth']];
// 美顏裡跳到臉型的捷徑：[名稱, 圖示, 臉型分類, 臉型項目]
const BEAUTY_JUMP = [['瘦臉', I.slim, 'face', 'face_thin'], ['大眼', I.eye, 'eye', 'eye_size']];
// 第一次點開時的起始強度，照醒圖點開滑桿時的預設值
const BEAUTY_DEF = { white: 60 };
// 可以左右分開調的項目（舊版美顏的瘦臉、大眼）
const SIDED = ['slim', 'eyes'];
// 兩種一鍵美顏
//   美圖俊俊：照美圖「智能美化」，膚質加一點臉型（瘦臉、大眼寫進臉型的滑桿，在臉型看得到、能再調）
//   醒俊：照醒圖「一鍵美顏」，只修膚質不動臉型，整體上限 60%
// 臉型的量照舊版美顏瘦臉 15、大眼 10 換算（兩邊位移量差 0.06／0.055、0.28／0.26）
const ONE_TAPS = [
  { name: '美圖俊俊', icon: I.magic, set: { smooth: 70, white: 40 }, shape: { face_thin: 16, eye_size: 11 }, note: '美圖俊俊：磨皮、美白，加一點瘦臉、大眼（在「臉型」可以再調）' },
  { name: '醒俊', icon: I.fresh, set: { smooth: 30, white: 18 }, shape: {}, note: '醒俊：只修皮膚，不動臉型' },
];
const RATIOS = [['free', '自由'], ['orig', '原比例'], [1, '1:1'], [3 / 4, '3:4'], [4 / 3, '4:3'], [9 / 16, '9:16'], [16 / 9, '16:9']];
const BG_COLORS = ['#ffffff', '#f1f3f5', '#ffe3ec', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#212529'];

// ---------- 狀態 ----------
let R;               // Renderer
let base = null;     // { canvas, faces, seg, mask, thumbs }
let P = { ...P0 };
let texts = [];
let stickers = [];   // { kind: 'svg' | 'emoji' | 'img', v, x, y, size, rot, flip, flipv, op, blend, mask }
let selSt = -1;
let hist = [], hi = -1, resetFrom = null;  // resetFrom：全部重設前在第幾步
let tab = 'beauty', cur = 'brightness', selText = -1;
let cropState = null;
let rsHinted = false;  // 這次進推臉已經提示過背景保護
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
let exOwn = null, exN = 0, exOwnFile = null; // 雙重曝光自己選的第二張照片
let frameK = 1;
const lutCache = new Map();

let WF;              // 臉型位移場
try { R = new Renderer($('#gl')); WF = new WarpField(R.gl); }
catch (e) { $('#empty p').textContent = '這個瀏覽器不支援 WebGL2，請改用新版 Safari、Chrome 或 Edge。'; }
// iPhone 記憶體吃緊、切到別的 app 太久回來，Safari 會把 WebGL 收回：畫布整個變透明，只剩黑底，而且不會自己回來
// （Anthony 2026-10-27：修一修照片直接不見，整個畫面黑的）。照 WebGL 規範：擋下預設，還回來就整套重建、照片重新上傳；
// 等一下還是沒還回來，就換一張新的畫布重開。照片本身在另一張 2D 畫布上，不會掉
let glLost = false;
function watchGl(c) {
  c.addEventListener('webglcontextlost', e => { e.preventDefault(); lostGl(); });
  c.addEventListener('webglcontextrestored', () => { if (glLost) rebuildGl(); });
}
function lostGl() {
  if (glLost) return;
  glLost = true; cancelAnimationFrame(raf); raf = 0;
  if (base) toast('畫面重新整理中…', 1500);
  setTimeout(() => {
    if (!glLost) return;
    const old = $('#gl'), c = old.cloneNode(false);
    old.replaceWith(c); watchGl(c); rebuildGl();
  }, 1500);
}
function rebuildGl() {
  glLost = false;
  try { R = new Renderer($('#gl')); WF = new WarpField(R.gl); if (R.gl.isContextLost()) throw 0; }
  catch { lostGl(); return; }  // 還拿不到：再等一下
  for (const k of Object.keys(texKey)) delete texKey[k];
  hairFor = null; hairFx = skinFx = null;
  if (base?.canvas) { applyBase(); syncView(); }
}
if (R) watchGl($('#gl'));

// ---------- 小工具 ----------
let toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function busy(msg) { $('#busyText').textContent = msg || '處理中…'; $('#busy').classList.toggle('on', !!msg); }
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- 載入照片 ----------
// 照片檔解開、縮到能修的大小（bmp 是原尺寸，用完要 close）
async function decodePhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
  });
  let w = bmp.width, h = bmp.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)));
  w = Math.round(w * k); h = Math.round(h * k);
  const c = photoCanvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return { bmp, c };
}
// m：草稿（接著修上次的照片）
async function loadFile(file, m) {
  if (!file || !R) return;
  if (base) saveDraft(true);  // 換照片前，修到一半的這張先存成草稿
  busy(m ? '打開上次的照片…' : '讀取照片…');
  try {
    const { bmp, c } = await decodePhoto(file), w = c.width, h = c.height, saved = m?.origBlob && m.om;
    // 看原圖用的最初照片：草稿有存就用存的，沒有就是這張（疊上之後的筆畫之前）
    if (saved) bmp.close?.();
    const orig = saved ? { blob: m.origBlob, ready: Promise.resolve(m.origBlob) } : makeOrig(bmp, bmp.width, bmp.height);
    const om = saved ? m.om : [1 / w, 0, 0, 1 / h, 0, 0];
    m?.patches?.forEach(q => c.getContext('2d').putImageData(q.img, q.x, q.y));  // 草稿：照片疊上之後畫的每一筆
    P = { ...P0, ...m?.P }; texts = m?.texts || []; selText = -1; stickers = m?.stickers || []; selSt = -1;
    hist = []; hi = -1;
    perfSkip(); setBase(c, { orig, om });
    if (!m) srcFile.set(c, file);
    newDraft(c, m, file);
    $('#empty').style.display = 'none'; $('#empty').classList.remove('over');
    $('#wrap').classList.add('on'); $('#panel').classList.remove('off');
    ['#bSave', '#bCmp', '#bResetAll', '#bMerge'].forEach(s => $(s).disabled = false);
    view.reset(); $('#zoom').classList.add('on'); $('#hist').classList.add('on');
    commit(); hist[0].first = !m;
    if (m) {
      hist[0].resumed = true;
      // 草稿裡有原檔：最前面多一步「剛打開的照片」（用到才解開），全部重設、一直按復原才回得到真正的原圖。
      // 以前只回到這次接著修的那一刻，還常常說「還沒有修改」；按住看原圖卻看得到原圖（評審 #144 中 1）
      const f0 = draft.src;
      if (f0 && (m.patches?.length || !m.p0 || hist[0].sP !== JSON.stringify(P0) || texts.length || stickers.length)) {
        hist.unshift(snap({ canvas: null, blob: f0, file: true, orig: base.orig }, P0, [], []));
        hist[0].first = true; hi = 1;
      }
      syncHist();
      tab = ''; showTab(TABS_OK(m.tab) ? m.tab : 'beauty'); drawTexts(); drawStickers();
    } else {
      // 照 Hypic：人像照進來先停在「人像」；找不到臉就改停在濾鏡
      landing = true; tab = ''; showTab('beauty');
    }
  } catch (e) {
    console.error(e); toast('這張照片打不開');
  } finally { busy(); }
}

const BASE0 = { faces: null, geoms: [], seg: null, segB: null, mask: null, mask2: null, thumbs: null, facesP: null };
// 換成另一張 canvas：最初的照片（orig）和對到它的位置（om）沿用，裁切、旋轉另外給新的 om
function setBase(canvas, keep) {
  const old = base;
  base = { canvas, ...BASE0, orig: old?.orig, om: old?.om, ...keep };
  // 換成另一張 canvas（消除、合併…）就不是同一串美顏筆、塗鴉了
  if (base.surf && base.surf.canvas !== canvas) { delete base.surf; delete base.ver; }
  applyBase(); perfBase();
  if (old) shelveLater(old);
}
// 看原圖（評審 H2）：以前畫的是目前的照片，美顏筆、塗鴉、消除、合併、裁切的結果都還在，卻標著「原圖」。
// 現在開照片時另外留一份縮小的最初照片（長邊 1600，壓成 JPEG），按住比較鈕才解開來畫。
// base.om：目前照片的像素 (x, y) 在最初照片上的位置（0～1）：u = a·x + c·y + e、v = b·x + d·y + f；
// 裁切、旋轉、翻轉跟著換，消除、合併、美顏筆不變
const ORIG_SIDE = 1600;
// 縮圖、壓縮都在背景執行緒（src 交出去就不能再用）；還沒好之前比較鈕畫目前的照片（剛開的照片兩張一樣）
function makeOrig(src, w, h) {
  const k = Math.min(1, ORIG_SIDE / Math.max(w, h)), o = { c: null, blob: null, bmp: null };
  o.ready = encodeSmall(src, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), 'image/jpeg', 0.9)
    .then(b => { if (b) o.blob = b; else o.bad = true; if (cmpOn) render(); return b; }, () => { o.bad = true; return null; });
  return o;
}
// 照目前照片的大小、位置畫一張最初的照片；還在解開就回傳 null（這一格先不畫，解好再畫）
let origView = null, origT = 0;
function origFrame() {
  const o = base.orig, om = base.om;
  if (!o || !om) return base.canvas;
  const src = o.c || o.bmp;
  if (!src) {
    if (o.blob && !o.dec) o.dec = createImageBitmap(o.blob).then(b => { o.bmp = b; }, () => { o.bad = true; }).finally(() => { o.dec = null; if (cmpOn) render(); });
    return o.bad || !o.blob && !o.c ? base.canvas : null;
  }
  const W = base.canvas.width, H = base.canvas.height, key = [W, H, ...om].join();
  if (origView?.o === o && origView.key === key) return origView.c;
  const s = Math.min(1, ORIG_SIDE / Math.max(W, H)), c = newCanvas(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)));
  // 這張的 (X, Y) 在最初照片上是 (A·X + C·Y + E, B·X + D·Y + F)；畫的時候反過來，最初照片的像素放到這張的哪裡
  const [a, b, cc, d, e, f] = om, sw = src.width, sh = src.height;
  const A = a * sw / s, B = b * sh / s, C = cc * sw / s, D = d * sh / s, E = e * sw, F = f * sh, det = A * D - B * C;
  const x = c.getContext('2d');
  x.setTransform(D / det, -B / det, -C / det, A / det, (C * F - D * E) / det, (B * E - A * F) / det);
  x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0);
  dropOrigView();
  origView = { o, key, c };
  return c;
}
function dropOrigView() {
  if (origView) { origView.c.width = 0; origView = null; }
}
// 放開比較鈕 10 秒：解開的那張、畫好的那張都放掉
function origIdle() {
  clearTimeout(origT);
  origT = setTimeout(() => { if (cmpOn) return; dropOrigView(); for (const h of [base, ...hist.map(h => h.base)]) { const o = h?.orig; if (o?.bmp) { o.bmp.close?.(); o.bmp = null; } } }, 10000);
}
const later = f => setTimeout(f, 1200);
// 壓縮舊照片要讀整張圖，放到畫完、畫面更新以後再做，手指放開才不會卡。
// 但最多只等一張：連續換照片時前一張馬上壓，不然好幾張原尺寸照片同時留著，iPhone 記憶體不夠會整頁重開
let shelveT = 0, shelveB = null;
function shelveLater(b) {
  if (shelveB) { clearTimeout(shelveT); shelve(shelveB); }
  shelveB = b; shelveT = later(() => { shelveB = null; shelve(b); });
}

// ---------- 美顏筆、塗鴉：直接改在同一張照片上，復原只存改到的那一塊 ----------
// 以前每畫一筆就複製一整張原尺寸照片（iPhone 一張約 50MB），同一處連畫幾十筆 Safari 會把整頁重開
// （Anthony 女友 2026-10-27 用美顏筆磨皮時回報）。現在跟一般修圖 app 一樣，每一筆只存改到的那一塊。
// 同一張 canvas 畫出來的每一步各是一個 base，共用 surf = { canvas, ver, edits }：
// ver 是 canvas 現在畫到第幾筆；edits[k] 是第 k 筆改到的那一塊「另一邊」的像素
// （canvas 在第 k 筆之後時存畫之前的，在之前時存畫之後的），復原、重做就是把那一塊對調。
// aux：美顏筆那一步另外改到的遮罩、原圖，復原、重做時跟著對調（aux.swap）
function ensureSurf() {
  if (!base.surf) {
    // 消除這類從別處來的照片可能是 GPU canvas：開始畫之前先換成記憶體裡的（內容一樣）
    if (!cpuCanvas.has(base.canvas)) {
      const o = base.canvas, c = photoCanvas(o.width, o.height); c.getContext('2d').drawImage(o, 0, 0); base.canvas = c;
      // 內容一樣：草稿當成同一張，不用重壓
      if (draft.pc === o) draft.pc = c;
      if (draft.ph?.c === o) draft.ph.c = c;
    }
    base.surf = { canvas: base.canvas, ver: 0, edits: [] }; base.ver = 0;
  }
  return base.surf;
}
function paintPatch({ x, y, before, after, aux }) {
  const old = base, S = ensureSurf();
  S.edits.length = S.ver;  // 復原後再畫：後面那些重做不到了
  S.edits.push({ x, y, img: before, aux, ses: aux?.ses });
  S.canvas.getContext('2d').putImageData(after, x, y); draftPatch(S.canvas, S.ver, x, y, after); S.ver++;
  // 臉、人像這些偵測結果還是同一張照片，留著不用重算；照片的貼圖只傳改到的那一塊
  const keep = { ...old }; delete keep.canvas; delete keep.thumbs;
  base = { canvas: S.canvas, ...BASE0, ...keep, ver: S.ver };
  pixelsChanged(S.canvas, [{ x, y, img: after }]);
  render(); perfBase();
}
// 把 canvas 換到第 v 筆（復原、重做同一串裡的一步）
function seekSurf(S, v) {
  if (S.ver === v) return;
  const ctx = S.canvas.getContext('2d'), done = [];
  const swap = e => { const cur = ctx.getImageData(e.x, e.y, e.img.width, e.img.height); ctx.putImageData(e.img, e.x, e.y); done.push({ x: e.x, y: e.y, img: e.img }); e.img = cur; e.aux?.swap(); };
  while (S.ver > v) swap(S.edits[--S.ver]);
  while (S.ver < v) swap(S.edits[S.ver++]);
  pixelsChanged(S.canvas, S === base.surf ? done : null);
}
// 同一張 canvas 的內容變了：照 canvas 記住的預覽、皮膚、頭髮圖要重算。
// rects：改到的那幾塊，照片的貼圖只傳這幾塊（整張重傳又慢又吃記憶體）
function pixelsChanged(c, rects) {
  const v = pvCache.get(c);
  // 頭髮、膚質用的那份照片貼圖（R.srcTex）是這張或它的預覽：只補改到的那幾塊，不然下次整張重傳
  const keep = rects && R?.srcOf && (R.srcOf === c || R.srcOf === v?.p);
  if (R && !keep) R.srcOf = null;
  alphaOf.delete(c);
  if (!rects) { pvCache.delete(c); return; }
  // 預覽縮圖只重畫改到的那幾塊（以前整張 1200 萬像素重縮）
  if (v) {
    const x = v.p.getContext('2d'), k = v.p.width / c.width;
    for (const r of rects) {
      const x0 = Math.floor(r.x * k), y0 = Math.floor(r.y * k), x1 = Math.min(v.p.width, Math.ceil((r.x + r.img.width) * k)), y1 = Math.min(v.p.height, Math.ceil((r.y + r.img.height) * k));
      if (x1 <= x0 || y1 <= y0) continue;
      // 多縮外面一圈再只留裡面：邊上的像素才跟整張縮的一樣，不會有接縫
      const m = 3, a0 = Math.max(0, x0 - m), b0 = Math.max(0, y0 - m), a1 = Math.min(v.p.width, x1 + m), b1 = Math.min(v.p.height, y1 + m);
      x.save(); x.beginPath(); x.rect(x0, y0, x1 - x0, y1 - y0); x.clip();
      x.drawImage(c, a0 / k, b0 / k, (a1 - a0) / k, (b1 - b0) / k, a0, b0, a1 - a0, b1 - b0);
      x.restore();
      if (keep && R.srcOf === v.p) R.patchSrc(x.getImageData(x0, y0, x1 - x0, y1 - y0), x0, y0);
    }
  }
  if (keep && R.srcOf === c) rects.forEach(r => R.patchSrc(r.img, r.x, r.y));
  if (rects.every(r => R.patchImage(r.img, r.x, r.y))) R.derive();
  // 貼圖是膚質、頭髮處理過的預覽：不用整張原尺寸重傳，接著的 render 會用新的預覽重算再傳（評審 2026-10-27）
  else if (R.tImg === R.tOwn && R.imgW === c.width && R.imgH === c.height) R.setImage(c);
  else hairFor = null;
}
// 每一筆存的那一塊加起來的上限，超過就丟掉最舊的復原步驟
const EDIT_BUDGET = LOW_MEM ? 96e6 : 400e6;
function pruneEdits() {
  for (;;) {
    let bytes = 0;
    for (const S of new Set(hist.map(h => h.base.surf).filter(Boolean))) {
      // 復原紀錄用得到的範圍：最舊、最新的那一步，還有 canvas（或壓起來的檔案）現在在第幾筆
      const vs = hist.filter(h => h.base.surf === S).map(h => h.base.ver);
      if (S.canvas) vs.push(S.ver); else vs.push(S.blobVer);
      const lo = Math.min(...vs), hi = Math.max(...vs);
      // 丟掉的步驟留個空殼（記得是哪一串美顏筆畫的），美顏筆才知道能不能接著那串塗
      S.edits.forEach((e, k) => { if (!e?.img) return; if (k < lo || k >= hi) { e.img = null; e.aux = null; } else bytes += e.img.data.length + (e.aux?.bytes || 0); });
    }
    if (bytes <= EDIT_BUDGET || hist.length <= 2) return;
    hist.shift();
  }
}
// 復原紀錄裡的舊照片：一張原尺寸照片在 iPhone 要 50MB 左右，塗鴉、消除、美顏筆每畫一筆就多一張，
// 存太多 Safari 會把整頁重新載入（修到一半跳回選照片）。不在畫面上的舊照片壓成檔案，復原時再解開
const shelving = new WeakSet();
function shelve(b) {
  if (b.surf) { shelveSurf(b.surf); return; }
  const c = b.canvas;
  if (!c || shelving.has(b) || !hist.some(h => h.base === b)) return;
  // 原檔解開的那張（剛打開的照片）：不用重壓，放掉畫布、留著原檔就好，復原時照原檔重解（一樣的像素）
  const f = srcFile.get(c);
  if (f) {
    if (b === base) return;
    Object.assign(b, { canvas: null, blob: f, file: true, w: c.width, h: c.height });
    new Set(hist.map(h => h.base)).forEach(strip);
    return;
  }
  shelving.add(b);
  c.toBlob(blob => {
    shelving.delete(b);
    if (!blob || b === base || b.canvas !== c) return;
    Object.assign(b, { canvas: null, blob, w: c.width, h: c.height });
    new Set(hist.map(h => h.base)).forEach(strip);
  }, hasAlpha(c) ? 'image/png' : 'image/jpeg', 0.95);
}
// 美顏筆、塗鴉那串：整串共用一張 canvas，一起壓成一個檔案（記住壓的時候在第幾筆）
function shelveSurf(S) {
  const c = S.canvas;
  if (!c || S === base.surf || shelving.has(S) || !hist.some(h => h.base.surf === S)) return;
  shelving.add(S);
  c.toBlob(blob => {
    shelving.delete(S);
    if (!blob || S === base.surf || S.canvas !== c) return;
    Object.assign(S, { canvas: null, blob, blobVer: S.ver, w: c.width, h: c.height });
    bbRelease(S); S.ddSes = null;
    hist.forEach(h => { if (h.base.surf === S) h.base.canvas = null; });
  }, hasAlpha(c) ? 'image/png' : 'image/jpeg', 0.95);
}
// 壓起來的舊照片：跟現在這張共用的偵測結果（臉、人像）留著；不共用的放掉，復原時再重算
function strip(b) {
  if (!b.blob || !('facesP' in b) || b.facesP === base.facesP) return;
  const { blob, w, h, orig, om, file } = b;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, { canvas: null, blob, w, h, orig, om, file });
}
async function unshelve(b) {
  if (b.canvas) return;
  const S = b.surf;
  if (S) {
    if (!S.canvas) {
      const bmp = await createImageBitmap(S.blob), c = photoCanvas(S.w, S.h);
      c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
      Object.assign(S, { canvas: c, ver: S.blobVer, blob: null });
    }
    hist.forEach(h => { if (h.base.surf === S) h.base.canvas = S.canvas; });
    b.canvas = S.canvas;
    return;
  }
  if (!('facesP' in b)) Object.assign(b, BASE0);
  if (b.file) {
    // 草稿裡的原檔（評審 #144 中 1）：跟剛打開時一樣解開、縮小；之後存草稿直接存這個原檔
    const f = b.blob, { bmp, c } = await decodePhoto(f); bmp.close?.();
    b.om ||= [1 / c.width, 0, 0, 1 / c.height, 0, 0];
    srcFile.set(c, f);
    Object.assign(b, { canvas: c, blob: null, file: false });
    return;
  }
  const bmp = await createImageBitmap(b.blob), c = photoCanvas(b.w, b.h);
  c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
  b.canvas = c; b.blob = null;
}
// 結果記在 canvas 上（存草稿、壓舊照片都要問，12MP 縮一次在 iPhone 要幾十 ms，評審 L9）；畫過就重問（pixelsChanged）
const alphaOf = new WeakMap();
function hasAlpha(c) {
  let a = alphaOf.get(c);
  if (a === undefined) alphaOf.set(c, a = alphaNow(c));
  return a;
}
function alphaNow(c) {
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
      if (share(b, 'matteP', ['matte', 'segB', 'harm'])) { R.setSeg(m); R.setSegB(b.segB); render(); if (tab === 'fun' && cSec === 'pop') showTab('fun'); }
      return m;
    }).catch(e => { clearTimeout(t); console.warn(e); b.matteP = null; if (b === base) toast('精細摳圖載入失敗，先用一般去背'); return null; });
  }
  return b.matteP;
}

// 偵測結果寫回每一個共用同一個 promise 的 base：美顏筆、塗鴉每畫一筆就換一個新的 base 物件（帶著 promise），
// 還在找臉時先畫一筆的話，結果只寫進舊的那個，之後美顏、臉型、美妝都沒作用（評審 2026-10-27）。回傳現在的 base 有沒有拿到
function share(b, pk, keys) {
  let live = b === base;
  for (const o of new Set([base, ...hist.map(h => h.base)])) {
    if (!o || o === b || !b[pk] || o[pk] !== b[pk]) continue;
    for (const k of keys) o[k] = b[k];
    if (o === base) live = true;
  }
  return live;
}
// 背景先找臉和皮膚，美顏打開時就準備好了
function getSeg(b) {
  b.segP ||= segment(b.canvas).then(s => {
    b.seg = s; share(b, 'segP', ['seg']);
    if (!b.matte) { b.segB = blurCanvas(s.person); if (share(b, 'segP', ['segB'])) { R.setSeg(s.person); R.setSegB(b.segB); render(); } }
    return s;
  })
    .catch(e => { console.warn(e); b.segP = null; return null; });
  return b.segP;
}
// 背景執行緒（評審 M7、M8）：皮膚遮罩、閃光燈統計、膚質、頭髮的準備資料在 prepwork.js 算。
// 以前在這裡算，開照片、第一次開膚質、頭髮時主執行緒各卡 0.5～1 秒，那時拖滑桿、縮放照片都不動。
// 瀏覽器不支援（舊的 Safari 沒有 OffscreenCanvas）、執行緒出錯或 20 秒沒回應，就照舊在這裡算（local）
let prepW, prepN = 0;
const prepWait = new Map();
function prepWorker() {
  if (prepW !== undefined) return prepW;
  prepW = false;
  try {
    if (typeof OffscreenCanvas === 'undefined' || !new OffscreenCanvas(1, 1).getContext('2d')) return prepW;
    const w = new Worker(new URL('./prepwork.js', import.meta.url), { type: 'module' });
    w.onmessage = e => { const r = prepWait.get(e.data.id); prepWait.delete(e.data.id); r?.(e.data); };
    w.onerror = e => { console.warn('prepwork', e.message); prepW = false; prepWait.forEach(r => r({ err: 'worker' })); prepWait.clear(); };
    prepW = w;
  } catch (e) { console.warn(e); }
  return prepW;
}
async function prep(op, args, local) {
  const w = prepWorker();
  if (!w) return local();
  let r;
  try {
    const a = await args(), id = ++prepN;
    r = await new Promise(res => {
      prepWait.set(id, res); setTimeout(() => prepWait.delete(id) && res({ err: 'timeout' }), 20000);
      w.postMessage({ id, op, a }, [a.img, a.bimg].filter(Boolean));
    });
  } catch (e) { r = { err: e }; }
  if (r.err) { console.warn(op, r.err); return local(); }
  return r.out;
}
// 分割結果只傳要用的（每個 Float32Array 約 4MB，傳過去要複製）；人像 canvas 傳不過去
const segPart = (s, ...ks) => Object.fromEntries([['w', s.w], ['h', s.h], ...ks.map(k => [k, s[k]])]);
// 照片縮成分割圖（或鬍子圖）大小給背景執行緒，縮法跟以前在這裡算時一樣，結果才會一模一樣。
// 同一張、沒再畫過就不重縮（找臉、膚質接連要用）；5 秒後放掉，不然會一直抓著舊照片
let segImg = null, segImgT = 0;
async function segPhoto(b, w, h) {
  const v = b.surf?.ver;
  if (segImg?.src !== b.canvas || segImg.v !== v) segImg = { src: b.canvas, v, cs: {} };
  const c = segImg.cs[w + 'x' + h] ||= newCanvas(w, h);
  if (!c.done) { c.getContext('2d', { willReadFrequently: true }).drawImage(b.canvas, 0, 0, w, h); c.done = true; }
  clearTimeout(segImgT); segImgT = setTimeout(() => { segImg = null; }, 5000);
  return createImageBitmap(c);
}
const idle = f => (window.requestIdleCallback || (g => setTimeout(g, 300)))(f, { timeout: 3000 });
// 使用者最後一次碰畫面（手指按著、滾輪、鍵盤）的時間。可以晚點做的事（暖機）等停手 1 秒才做：
// iPhone Safari 沒有 requestIdleCallback，idle 只是晚 0.3 秒，手指還在拖也照做（評審 #150）
let lastInput = 0;
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, e => { if (ev !== 'pointermove' || e.buttons) lastInput = performance.now(); }, { capture: true, passive: true });
const whenStill = f => { const w = 1000 - (performance.now() - lastInput); if (w > 0) setTimeout(() => whenStill(f), w + 50); else idle(f); };
function findFaces() {
  const b = base;
  if (b.facesP) return b.facesP;
  b.facesP = detectFaces(b.canvas).then(async f => {
    b.faces = f; b.geoms = f.map(faceGeom);
    b.mask2 = f.length ? featureMask(f, b.canvas.width, b.canvas.height) : null;
    const live = share(b, 'facesP', ['faces', 'geoms', 'mask2']);
    if (live) { R.setMask2(b.mask2); render(); }
    if (live && !f.length && landing && tab === 'beauty') { landing = false; showTab('filter'); }
    const seg = f.length ? await getSeg(b) : null, W = b.canvas.width, H = b.canvas.height, g = b.geoms[0];
    const r = !f.length ? null : await prep('face', async () => ({ faces: f, W, H, geom: g, ...seg && { seg: segPart(seg, 'skin', 'hair', 'bg'), img: await segPhoto(b, seg.w, seg.h), bimg: await segPhoto(b, ...beardSize(seg.w, seg.h)) } }), () => {
      const mask = skinMask(f, W, H, seg, b.canvas);
      return { mask, cls: mask.cls, flashSt: seg ? flashStats(b.canvas, seg, mask, g) : null };
    });
    b.mask = r?.mask || null; b.flashSt = r?.flashSt || null;
    if (r?.cls) b.mask.cls = r.cls;
    if (share(b, 'facesP', ['mask', 'flashSt'])) { R.setMask(b.mask); render(); if (tab === 'beauty' || tab === 'sticker' || tab === 'makeup' || tab === 'looks') showTab(tab); }
    // 評審 M8：膚質的準備資料、膚質和頭髮的 GPU 程式趁閒置先做好，第一次拉膚質、頭髮滑桿就不用等
    // 頭髮資料也趁閒置先算（背景執行緒），點開頭髮分頁就有
    if (f.length) whenStill(() => { if (base?.facesP !== b.facesP) return; getSkin(base); getHair(base); fxWarm(); });
    return f;
  }).catch(e => { console.warn(e); b.faces = []; b.faceErr = true; if (share(b, 'facesP', ['faces', 'faceErr']) && (tab === 'beauty' || tab === 'makeup')) showTab(tab); return []; });
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
  if (hold?.b === base) { layoutLater = true; return; }
  const st = $('#stage').getBoundingClientRect();
  // 裁切時照片往上讓出底下一排（復原、重做），按鈕不會壓在裁切框的把手上（評審 M25；#stage.crop 底下留 52px）
  const pad = 12, w = base.canvas.width, h = base.canvas.height, low = cropState ? 52 : 0;
  const f = curFrame(), g = f ? f.geom(w, h) : { W: w, H: h, x: 0, y: 0 };
  const k = Math.min((st.width - pad * 2) / g.W, (st.height - pad * 2 - low) / g.H);
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
  // 手機上一指是筆刷，兩指捏合縮放（筆刷工具看到 pinchstart 會取消這一筆）；裁切和移動燈的時候不接兩指
  canPan: (e, touch) => !!base && !e.target.closest('.st,.tx') && !bmHit(e) && (!touch || !(tab === 'crop' || (tab === 'light' && P.light))),
  // 手機上平常不顯示縮放按鈕，放大了才出現（點百分比回到全覽）
  unit: () => frameK,
  onChange: z => { zoomZ = z; syncView(); if (tab === 'reshape') rsRing(); bmBox(); if (z > 1.15) pickCenterFace(); $('#zPct').textContent = Math.round(frameK * z * 100) + '%'; $('#zoom').classList.toggle('zoomed', z !== 1); },
});
$('#zIn').onclick = () => view.zoomStep(1);
$('#zOut').onclick = () => view.zoomStep(-1);
$('#zPct').onclick = () => view.reset();
new ResizeObserver(layout).observe($('#stage'));

let raf = 0;
function render() {
  // 上排的「合併」：有選濾鏡才亮
  $('#bMerge').classList.toggle('dim', P.filter === 'none');
  if (!base) return;
  perfReq();
  if (raf) return;
  if (needMatte() && !base.matteP) getMatte(base);
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (cmpOn) { const o = origFrame(); if (o) R.drawOrig(o); perfDrawn(); return; }
    if (held()) return;
    const f = liveFilter(), lut = gradeOn(P) ? getGradeLut() : f === 'none' ? null : getLut(f);
    // 皮膚、頭髮另外一套顏色要用皮膚遮罩和分類圖，還沒找過臉就先找
    if ((lut?.skin || lut?.hair) && !base.facesP) findFaces();
    R.setLut(lut?.c, lut?.skin, lut?.hair);
    draw();
    paintPop();
    if (curFrame()?.live) paintFrame();
    perfDrawn();
  });
}
// 復原、重做跳到另一張照片（裁切、消除、合併的前後）：那張的臉、膚質、頭髮資料重算好之前，畫面先停在上一格，
// 不然會先閃一下沒修過的臉（評審 #144 小 2）。最多等 3 秒；超過 0.3 秒就蓋上「復原中」。版面也等到換畫面時才換
let hold = null, layoutLater = false;
const DATA_TABS = ['beauty', 'shape', 'makeup', 'skin', 'aiskin', 'hair', 'light'];
// t0：按下復原的時間（解壓照片已經等了一段，「復原中」不要先收再蓋）
function holdFrame(t0) {
  if (hold) { clearTimeout(hold.bt); clearTimeout(hold.tt); }
  const h = hold = { b: base, t: performance.now() + 3000, tt: setTimeout(render, 3020) }, show = () => { if (hold === h) { h.shown = true; busy('復原中…'); } };
  const wait = 300 - (performance.now() - t0);
  if (wait > 0) h.bt = setTimeout(show, wait); else show();
}
// 這張還缺資料（順便開始算膚質、頭髮：平常是畫的時候才開始）
function needsData(b) {
  if (!DATA_TABS.some(t => TAB_RESET[t]?.on())) return false;
  const sk = skinOn(P) && !b.skin, hr = hairNeedsSeg(P) && !b.hair;
  if (sk) getSkin(b); if (hr) getHair(b);
  return !b.faces || (b.faces.length > 0 && !b.mask) || sk || hr;
}
function held() {
  if (!hold) return false;
  if (hold.b === base && performance.now() < hold.t && needsData(base)) return true;
  clearTimeout(hold.bt); clearTimeout(hold.tt);
  if (hold.shown) busy();
  hold = null;
  if (layoutLater) { layoutLater = false; layout(); }
  return false;
}
// 存檔、合併、摳圖要原尺寸；其他時候畫預覽大小
let holdFull = false;
function draw(full) {
  syncTex(); syncHair(full || holdFull); syncShape();
  if (bodyOn(P) && !base.body) getBody(base);
  // 身體的變形要排在最前面（長腿會改到整張照片的上下位置）
  // 手動增高也會改整張照片的上下位置，排第一個
  const pf = perFace();
  const fw = !base.faces ? [] : pf ? base.faces.flatMap((f, i) => faceWarps([f], PF(i))) : faceWarps(base.faces, P);
  const man = manualWarps(base.body, P, base.canvas.width, base.canvas.height);
  const warps = [...man, ...(base.body ? bodyWarps(base.body, base.faces, P) : []), ...(base.faces ? [...fw, ...hairWarps(base.faces, P, base.hair)] : [])];
  warps.manual = man.length;  // 手動塑身不受背景保護（gl.js uWm）
  // 背景保護要知道人在哪；有臉的照片開圖時就算好了，沒有臉的照片推的時候才算
  if (P.bgProtect && (warps.length || P.liq.length) && !base.segP) getSeg(base);
  let p = gradeOn(P) ? { ...P, filterAmt: 100 } : P;
  // 多張臉分開修：磨皮、美白這些顏色效果每張臉各一組數字，shader 照像素離哪張臉近決定用哪組
  if (pf) p = { ...p, faceAmts: base.faces.map((f, i) => { const g = base.geoms[i], q = PF(i); return { cx: g.cx, cy: g.cy, W: g.W, smooth: q.smooth, white: q.white, dark: q.dark, fold: q.fold, eyeb: q.eyeb, teeth: q.teeth }; }) };
  R.render(p, warps, effects(), full || holdFull); lastWarps = warps;
}
// 畫面上看到的點 → 原圖上的點。瘦臉、臉型、推臉、身體、頭髮的變形開著時，畫面上的點不在原圖同一個位置，
// 美顏筆、塗鴉放開時把筆跡換回原圖座標，才會畫在手指下面（評審 2026-10-27）。
// 照 gl.js 一步步反著走：FS_DISP（推臉位移場 → 臉型位移 → 背景保護），再主 shader（身體、臉、頭髮的變形 → 背景保護）
let shapeSM = null, lastWarps = [];
const segData = new WeakMap();
function srcMapper() {
  if (!base?.canvas || !R) return null;
  const W = base.canvas.width, H = base.canvas.height, L = P.liq.length ? R.liqRead() : null;
  const sm = shapeSM?.moves.length || shapeSM?.pins.length ? shapeSM : null, ws = lastWarps.slice(0, MAX_WARPS);
  if (!L && !sm && !ws.length) return null;
  let prot = () => 1;
  if (P.bgProtect !== 0 && base.segB) {
    const c = base.segB;
    if (!segData.has(c)) segData.set(c, c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height));
    const s = segData.get(c);
    prot = (x, y) => {
      const i = Math.min(s.width - 1, Math.max(0, Math.floor(x / W * s.width))), j = Math.min(s.height - 1, Math.max(0, Math.floor(y / H * s.height)));
      const t = Math.min(1, Math.max(0, (s.data[(j * s.width + i) * 4] / 255 - 0.02) / 0.28));
      return t * t * (3 - 2 * t);
    };
  }
  const o = [0, 0];
  return ({ x, y }) => {
    let qx = x, qy = y;
    if (L) { liqSample(L, x, y, o); qx += o[0]; qy += o[1]; }
    // 臉型：位移圖是「原圖的點往前推到哪」反過來的，這裡用疊代找原圖上推到 q 的那一點
    let ux = qx, uy = qy;
    if (sm) for (let k = 0; k < 8; k++) { evalField(sm.moves, sm.pins, ux, uy, o); ux = qx - o[0]; uy = qy - o[1]; }
    const pv = prot(x, y), mx = x + (ux - x) * pv, my = y + (uy - y) * pv;
    if (!ws.length) return { x: mx, y: my };
    const [px, py] = warpBack(mx, my, ws), pm = prot(mx, my);
    return { x: mx + (px - mx) * pm, y: my + (py - my) * pm };
  };
}
// 推臉位移場在 (x, y) 的位移（跟 gl.js 的 liq() 一樣：四個格點解碼後雙線性內插）
function liqSample(L, x, y, o) {
  const gx = x / L.W * L.fw - 0.5, gy = y / L.H * L.fh - 0.5, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
  let sx = 0, sy = 0;
  for (const [di, dj, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const a = Math.min(L.fw - 1, Math.max(0, i + di)), b = Math.min(L.fh - 1, Math.max(0, j + dj)), k = (b * L.fw + a) * 4, d = L.d;
    sx += (d[k] * 256 + d[k + 2] - 32768) * w; sy += (d[k + 1] * 256 + d[k + 3] - 32768) * w;
  }
  o[0] = sx * L.step; o[1] = sy * L.step;
}
// 主 shader 的變形迴圈（gl.js main()）原樣搬過來：輸出的點往回找原圖的點
function warpBack(x, y, warps) {
  for (const w of warps) {
    if (w.type === 'stretch' || w.type === 'band') {
      const { y0, y1, s, H } = w, y1o = y0 + (y1 - y0) * (1 + s);
      if (y > y0) {
        if (y >= y1o) y = y1 + (y - y1o) * (H - y1) / Math.max(H - y1o, 1);
        else if (w.type === 'band') y = y0 + (y - y0) / (1 + s);
        else { const u = (y - y0) / (y1o - y0); y = y0 + (y1 - y0) * (u + s * u * (1 - u) * (1 - u)); }
      }
      continue;
    }
    if (w.type === 'seg') {
      const abx = w.bx - w.ax, aby = w.by - w.ay, t = Math.min(1, Math.max(0, ((x - w.ax) * abx + (y - w.ay) * aby) / Math.max(abx * abx + aby * aby, 1)));
      const fx = w.ax + abx * t, fy = w.ay + aby * t, dx = x - fx, dy = y - fy, q = Math.hypot(dx, dy) / w.r;
      if (q < 1) {
        const g = (t - w.tc) / w.ts; let f = (1 - q * q) * (1 - q * q) * Math.exp(-g * g);
        if ((w.inner || 0) !== 0 && (abx * dy - aby * dx) * w.inner > 0) f *= 0.3;
        x = fx + dx * (1 + w.k * f); y = fy + dy * (1 + w.k * f);
      }
      continue;
    }
    const cs = Math.cos(w.rot || 0), sn = Math.sin(w.rot || 0), d0x = x - w.cx, d0y = y - w.cy;
    const t = Math.hypot(d0x * cs + d0y * sn, (-d0x * sn + d0y * cs) * (w.ey || 1)) / w.r;
    if (t < 1) {
      const f = 1 - t * t;
      if (w.type !== 'scale') { x -= (w.dx || 0) * f * f; y -= (w.dy || 0) * f * f; }
      else { x = w.cx + (x - w.cx) * (1 - (w.s || 0) * f * f); y = w.cy + (y - w.cy) * (1 - (w.s || 0) * f * f); }
    }
  }
  return [x, y];
}
// 預覽解析度：螢幕上實際有幾個像素就畫幾個（放大時跟著變細），一次跳 √2 倍，縮放時不會每一格都重畫
let zoomZ = 1, dragging = false;
// 預覽最多幾像素：iPhone 放大兩倍以上時，預覽原本會變成整張 1200 萬像素，光畫布就吃掉幾百 MB，
// Safari 記憶體不夠就把 WebGL 收回、照片整個變黑（Anthony 2026-10-27）
const FAST_PX = 1.5e6, VIEW_PX = LOW_MEM ? 6e6 : 16e6;
function syncView() {
  if (!R || !base) return;
  const s = frameK * zoomZ * Math.min(3, devicePixelRatio || 1), px = base.canvas.width * base.canvas.height;
  const q = Math.min(1, 2 ** (Math.ceil(Math.log2(Math.max(s, 1e-3)) * 2) / 2), Math.sqrt(VIEW_PX / px));
  // 拖滑桿、推臉、拖燈的時候先畫小一點（最多約 150 萬像素），放開再畫回清楚的。
  // iPhone 螢幕 3 倍密度，放大看時每秒只畫得出 2～8 格（Anthony 2026-10-27 實測）。
  // 畫布大小不變，只是先畫進一張小圖再放大（以前是改畫布大小，按下、放開各頓一次）
  const f = dragging ? Math.min(1, Math.sqrt(FAST_PX / (px * q * q))) : 1;
  if (q !== R.view || f !== R.fast) { R.view = q; R.fast = f; render(); }
}
function setDragging(on) { if (dragging !== on) { dragging = on; syncView(); if (!on && (gradeLutKey.endsWith('|33') || skinFx?.stale)) render(); } }
// 開始拖：任何滑桿；推臉、打光（拖燈）時在照片上按下。放開手指就畫回清楚的
addEventListener('rangestart', () => setDragging(true));
addEventListener('pointerdown', e => {
  if (e.target.closest?.('#wrap') && !pinch.on && (tab === 'reshape' || (tab === 'light' && P.light))) setDragging(true);
}, true);
addEventListener('pointerup', () => setDragging(false), true);
addEventListener('pointercancel', () => setDragging(false), true);
addEventListener('pinchstart', () => setDragging(false));
// 身體塑形：找人體關節，再用人像分割量身體寬度
function getBody(b) {
  b.bodyP ||= Promise.all([detectBody(b.canvas), getSeg(b), findFaces()]).then(([body, s]) => {
    measureBody(body, s);
    b.body = body;
    if (share(b, 'bodyP', ['body'])) { render(); if (tab === 'body') showTab('body'); }
    return body;
  }).catch(e => { console.warn(e); b.body = { ok: false }; if (share(b, 'bodyP', ['body']) && tab === 'body') showTab('body'); return b.body; });
  return b.bodyP;
}
// 頭髮：先把頭髮改好的照片交給主管線，參數沒變就不重算
let hairFx = null, hairKey = '', hairFor = null, hairSrc = null;
// 用到膚質效果的分頁（膚質、AI 美肌、塑臉的顏色、臉型的豐臉拉皮）：在這些分頁裡效果關掉也先不放掉暫存，來回拉不用重配
const SKIN_TABS = ['skin', 'aiskin', 'sculpt', 'shape'];
function syncHair(full) {
  const want = hairColorOn(P) && base.hair;
  const key = want ? HAIR_P0_KEYS.map(k => P[k]).join('|') : '';
  const sWant = skinOn(P) && base.skin;
  const sKey = sWant ? skinKey(P) : '';
  if (hairNeedsSeg(P) && !base.hair) getHair(base);
  if (skinOn(P) && !base.skin) getSkin(base);
  fxTrim(want, sWant);
  // 預覽時用螢幕大小的照片算，存檔才用原尺寸
  const src = (want || sWant) && !full ? previewOf(base.canvas) : base.canvas;
  // 拖頭髮時膚質的模糊圖先用舊的，放開手指這一格補算
  const restale = sWant && !dragging && skinFx?.stale;
  if (hairFor === base && hairSrc === src && key === hairKey && sKey === skinKeyNow && !restale) return;
  const first = hairFor !== base;
  hairFor = base; hairSrc = src; hairKey = key; skinKeyNow = sKey;
  // 先改頭髮，再改膚質，最後交給主管線：三個都在主畫面同一個 WebGL 上，中間結果是貼圖，不用複製
  if (want || sWant) R.useTex(fxTex(src, want, sWant, key), src.width, src.height, base.canvas.width, base.canvas.height);
  else if (!first) R.setImage(src, base.canvas.width, base.canvas.height);
  fxTrim(want, sWant);  // 剛換下來的那張
}
function fxTex(src, hair, skin, key) {
  if (hairFx && hairFx.gl !== R.gl) hairFx = null;  // 主畫面重建過（WebGL 被收回）
  if (skinFx && skinFx.gl !== R.gl) skinFx = null;
  let t = R.srcTex(src);
  const k = key + '|' + R.srcVer, w = src.width, h = src.height;
  if (hair) { hairFx ||= new HairFx(R.gl); t = hairFx.apply(t, w, h, base.hair, P, k); }
  if (skin) { skinFx ||= new SkinFx(R.gl); t = skinFx.apply(t, w, h, base.skin, P, k, w / base.canvas.width, dragging); }
  return t;
}
// 沒在用、也不在那個分頁：放掉跟照片一樣大的暫存（評審 M1：放大、存檔時會跟著長到 600 萬、1200 萬像素，一直留著）
function fxTrim(want = hairColorOn(P) && base?.hair, sWant = skinOn(P) && base?.skin) {
  if (!R) return;
  if (hairFx && !want && tab !== 'hair' && R.tImg !== hairFx.out.t) hairFx.release();
  if (skinFx && !sWant && !SKIN_TABS.includes(tab) && R.tImg !== skinFx.out.t) skinFx.release();
  if (!(hairFx?.out.w > 1) && !skinFx?.src) R.dropSrc();
}
// 先建好頭髮、膚質的 GPU 程式、各畫一次，資料好了就傳上去（評審 M8）。
// 拆成四段，每段都等使用者停手 1 秒才做（評審 #150：以前開照片後 3～5 秒一口氣做完，iPhone 停 0.5～0.9 秒）。
// 還沒做完就拉頭髮、膚質滑桿：那時候才建，跟以前一樣
let warmQ = null;
function fxWarm() {
  if (warmQ) { warmQ.again = true; return; }
  const q = warmQ = { again: false };
  const steps = [() => { hairFx ||= new HairFx(R.gl); }, () => hairFx?.warm(base.hair), () => { skinFx ||= new SkinFx(R.gl); }, () => skinFx?.warm(base.skin)];
  const next = () => {
    if (!R || glLost || !base) { warmQ = null; return; }
    const st = steps.shift();
    if (!st) { warmQ = null; if (q.again) fxWarm(); return; }
    try { st(); } catch (e) { console.warn(e); }
    whenStill(next);
  };
  whenStill(next);
}
// 進頭髮、膚質分頁：趁閒置把預覽照片傳上去、照現在的參數跑一次，第一次拉滑桿只要畫一次（評審 M8：第一下頭髮 387ms、膚質 127ms）。
// 只跑現在沒顯示出來的那一個，畫面上的貼圖不動
function fxPrime() {
  if (!R || glLost || !base?.canvas || hold) return;
  const want = hairColorOn(P) && base.hair, sWant = skinOn(P) && base.skin, src = previewOf(base.canvas);
  const key = want ? HAIR_P0_KEYS.map(k => P[k]).join('|') : '';
  try {
    if (tab === 'hair' && base.hair && !want && R.tImg !== hairFx?.out.t) fxTex(src, true, false, HAIR_P0_KEYS.map(k => P[k]).join('|'));
    if (SKIN_TABS.includes(tab) && tab !== 'shape' && base.skin && !sWant && R.tImg !== skinFx?.out.t) {
      // 頭髮開著的話它的結果要是現在這一張（同一個 key，不會重畫）
      if (!want || (hairFor === base && hairSrc === src)) fxTex(src, want, true, key);
    }
  } catch (e) { console.warn(e); }
}
// 照片縮成預覽大小（跟著 R.view），每張照片、每種大小只縮一次
const pvCache = new WeakMap();
function previewOf(c) {
  const s = R.view;
  if (s >= 1) return c;
  let v = pvCache.get(c);
  if (v?.s !== s) {
    const p = newCanvas(Math.max(1, Math.round(c.width * s)), Math.max(1, Math.round(c.height * s)));
    const x = p.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, p.width, p.height);
    pvCache.set(c, v = { s, p });
  }
  return v.p;
}
// 膚質、祛皺：要皮膚分割和臉，同一張照片只準備一次
let skinFx = null, skinKeyNow = '';
function getSkin(b) {
  b.skinP ||= Promise.all([getSeg(b), findFaces()]).then(async ([s, f]) => {
    if (!s) { b.skinP = null; return null; }
    b.skin = await prep('skin', async () => ({ W: b.canvas.width, H: b.canvas.height, faces: f || [], seg: segPart(s, 'skin'), img: await segPhoto(b, s.w, s.h) }), () => prepSkin(b.canvas, s, f || []));
    if (share(b, 'skinP', ['skin'])) { hairFor = null; fxWarm(); render(); if (tab === 'skin') showTab('skin'); }
    return b.skin;
  }).catch(e => { console.warn(e); b.skinP = null; return null; });
  return b.skinP;
}
const HAIR_P0_KEYS = Object.keys(HAIR_P0);
function getHair(b) {
  b.hairP ||= Promise.all([getSeg(b), findFaces()]).then(async ([s, f]) => {
    if (!s) { b.hairP = null; return null; }
    b.hair = await prep('hair', async () => ({ W: b.canvas.width, H: b.canvas.height, faces: f || [], seg: segPart(s, 'hair', 'bg'), img: await segPhoto(b, s.w, s.h) }), () => prepHair(b.canvas, s, f || []));
    if (share(b, 'hairP', ['hair'])) { hairFor = null; fxWarm(); render(); if (tab === 'hair') showTab('hair'); }
    return b.hair;
  }).catch(e => { console.warn(e); b.hairP = null; return null; });
  return b.hairP;
}
// 臉型：所有滑桿換成位移圖
function syncShape() {
  let sm = { moves: [], pins: [] };
  if (perFace()) base.faces.forEach((f, i) => { const m = shapeMoves([f], PF(i)); sm.moves.push(...m.moves); sm.pins.push(...m.pins); });
  else if (base.faces?.length) sm = shapeMoves(base.faces, P);
  R.setDisp(WF.update(base.canvas.width, base.canvas.height, base.faces || [], sm.moves, sm.pins)); shapeSM = sm;
  // 推臉（重新塑形）另外一張位移場，GPU 上一下一下畫（gl.js liqSync）
  R.liqSync(P.liq, base.canvas.width, base.canvas.height);
}
// 光效、背景、雙重曝光的圖：要用的時候才畫，照片比例變了就重畫
const texKey = {};
let bgStat = null, bgOwn = null, bgN = 0, bgOwnFile = null;
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
  // 拖滑桿時先烘 33³ 格點再內插（評審 2026-10-27：每格 26 萬次太慢），放開再烘完整的。
  // 顏色沒變就沿用（推臉、拖燈時不用換成粗的）
  const f = liveFilter(), k0 = gradeKey(P) + '|' + f + '|' + P.filterAmt + '|', n = dragging ? 33 : 64;
  if (!gradeLutKey.startsWith(k0) || !(dragging || gradeLutKey.endsWith('|64'))) {
    gradeLutKey = k0 + n; const sk = skinFilterFn(f), hr = hairFilterFn(f);
    gradeLut = lutPair(bakeLUT(gradeFn(P, filterFn(f)), n), sk && bakeLUT(gradeFn(P, sk), n), hr && bakeLUT(gradeFn(P, hr), n));
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
// 復原紀錄的一步：參數、文字、貼紙另外留 JSON 字串，比對用
function snap(b, p, t, s) {
  const sP = JSON.stringify(p), sT = JSON.stringify(t), sS = JSON.stringify(s);
  return { base: b, P: JSON.parse(sP), texts: JSON.parse(sT), stickers: JSON.parse(sS), sP, sT, sS };
}
function commit() {
  // 評審 M24、M26：跟現在這一步一模一樣就不記（調筆刷大小、強度只改筆，推臉輕點一下沒推動）：
  // 以前會多一步，第一下復原沒反應，還把可以重做的步驟砍掉、吃掉 50 步上限
  const cur = hist[hi], e = snap(base, P, texts, stickers);
  if (cur && cur.base === base && cur.sP === e.sP && cur.sT === e.sT && cur.sS === e.sS) return;
  resetFrom = null;
  hist = hist.slice(0, hi + 1);
  hist.push(e);
  if (hist.length > 50) hist.shift();  // 醒圖：最多復原 50 步
  // 消除、合併每一步都是一張新的整張照片：舊的會壓成檔案（見 shelve），最多留 15 張不同的照片
  // （美顏筆、塗鴉畫在同一張上，整串算一張）
  while (new Set(hist.map(h => h.base.surf || h.base)).size > 15) hist.shift();
  pruneEdits();
  hi = hist.length - 1;
  syncHist();
  if (hi > 0) draft.on = true;
  draftSoon(!!draft.pc && base.canvas !== draft.pc);
}
let restoring = false;
async function restore(i) {
  if (restoring) return;
  resetFrom = null;
  const s = hist[i], t0 = performance.now();
  const changed = s.base !== base;
  if (changed && !s.base.canvas) {
    // 解壓通常很快：0.3 秒內好就不蓋「復原中」（評審 #144 小 1：一閃一閃的）
    restoring = true; const bt = setTimeout(() => busy('復原中…'), 300);
    try { await unshelve(s.base); } catch (e) { console.error(e); toast('這一步復原不了'); return; } finally { restoring = false; clearTimeout(bt); busy(); }
  }
  hi = i;
  const fr = P.frame;
  P = clone(s.P); texts = clone(s.texts); stickers = clone(s.stickers); selText = -1; selSt = -1;
  if (changed && s.base.surf && s.base.surf === base.surf) { seekSurf(s.base.surf, s.base.ver); base = s.base; render(); }
  else if (changed) { if (s.base.surf) seekSurf(s.base.surf, s.base.ver); const old = base; base = s.base; holdFrame(t0); applyBase(); shelveLater(old); } else render();
  // 只差在邊框的兩步：照片的位置、大小跟著邊框變（評審 #144 中 2）
  if (P.frame !== fr) layout();
  showTab(tab); drawTexts(); drawStickers(); syncHist();
  draftSoon();  // 復原、重做也要進草稿（不然被收掉，重開會回到復原前）
}
function syncHist() { $('#bUndo').disabled = hi <= 0 && resetFrom == null; $('#bRedo').disabled = hi >= hist.length - 1; }
// 美顏筆放開的那幾筆還在算：先等它們畫進照片、記進復原，再往回一步（連點兩下就退兩步）
$('#bUndo').onclick = async () => { await bbWait(); if (resetFrom != null && hi === 0) restore(Math.min(resetFrom, hist.length - 1)); else if (hi > 0) restore(hi - 1); };
$('#bRedo').onclick = async () => { await bbWait(); hi < hist.length - 1 && restore(hi + 1); };

// 按住看原圖
// 看原圖：畫在同一張 WebGL 畫布上（以前疊一張 2D 畫布，iPhone 放大時會糊、位置也會跳）
let cmpOn = false;
const cmp = on => { if (cmpOn === on) return; cmpOn = on; $('#wrap').classList.toggle('cmp', on); if (!on) { R?.dropOrig(); origIdle(); } render(); };
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
  // 推臉、美顏筆往前放：最常用，以前排第 7、第 11，手機上要往右滑才看得到（評審 2026-10-27）。推臉照醒圖的叫法
  ['portrait', '人像', 'P', ['beauty', 'shape', 'reshape', 'bbrush', 'makeup', 'skin', 'sculpt', 'aiskin', 'light', 'hair', 'body', 'cover']],
  // 點「濾鏡」先停在濾鏡，一鍵出片排第二（醒圖的一鍵出片也是濾鏡清單裡的一類；以前先停在一鍵出片，評審 M15）
  ['filter', '濾鏡', 'F', ['filter', 'looks']],
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
// 膚質裡的「磨皮」跟美顏的磨皮是同一個值，算在美顏：改美顏磨皮時膚質分頁不亮點、膚質的重設也不動它
const tabKeys = {
  adjust: keysOf(ADJUST), beauty: [...keysOf(BEAUTY), ...keysOf(BEAUTY_OLD), 'oneTap', 'oneAmt'], skin: keysOf([...SKIN, ...TONE, ...WRINKLE]).filter(k => k !== 'smooth'), aiskin: keysOf([...AI_FACE, ...AI_BODY]), sculpt: Object.keys(SC_P0), reshape: ['liq'],
  body: Object.keys(BODY_P0), hair: Object.keys(HAIR_P0), makeup: ['mk', 'mkLook', 'mkLookAmt'], filter: ['filter', 'filterAmt'],
  light: ['light', 'lightAmt', 'lightBri', 'lightCol', 'lightDist', 'lightSpec', 'lightGloss', 'lightBlur', 'lightFg', 'lightBg', 'lightX', 'lightY', 'lightSeed', 'flash', 'flashAmt'],
  fun: ['blur', 'blurStyle', 'blurSize', 'fx', 'fxAmt', 'ov', 'ovAmt', 'ex', ...Object.keys(POP_P0)], frame: ['frame'], cutout: ['bg', 'bgColor', 'bgImg', 'bgBlur'],
};
const TAB_RESET = Object.fromEntries(Object.entries(tabKeys).map(([t, keys]) => [t, { on: keysOn(keys), reset: () => toP0(keys) }]));
TAB_RESET.grade = {
  on: () => gradeOn(P),
  reset: () => { Object.keys(P).forEach(k => { if (/^(hsl_|cg_)/.test(k)) delete P[k]; }); Object.assign(P, clone(GRADE_P0)); },
};
TAB_RESET.shape = { on: () => SHAPE_CATS.some(c => c.items.some(x => shapeIsSet(P, x.id))) || pfHas(isShapeKey), reset: () => { SHAPE_CATS.forEach(c => resetShape(P, c.id)); pfClear(isShapeKey); } };
// 美顏、臉型的重設：每張臉自己改過的也一起清掉
{
  const b = TAB_RESET.beauty, keys = tabKeys.beauty;
  TAB_RESET.beauty = { on: () => b.on() || pfHas(k => keys.includes(k)), reset: () => { b.reset(); pfClear(k => keys.includes(k)); } };
}
$('#bTabReset').onclick = () => {
  const r = TAB_RESET[tab]; if (!r) return;
  r.reset(); layout(); render(); commit(); showTab(tab);
};
// 全部重設：回到剛打開的樣子（評審 H2：以前只清參數，美顏筆、塗鴉、消除、裁切、文字、貼紙都還在）。
// 跟一直按復原到第一步一樣，所以不會弄亂復原紀錄；重設後按一次復原就跳回重設前（resetFrom），重做也能一步步找回來
$('#bResetAll').onclick = async () => {
  if (!base) return;
  await bbWait();
  if (hi <= 0) return toast('還沒有修改');
  const from = hi;
  await restore(0);
  if (hi !== 0) return;
  resetFrom = from; syncHist();
  // 復原只記得最近 50 步：更早的步驟丟掉了就回不到剛打開的樣子，照實說
  toast(hist[0].first ? '已回到剛打開的照片，按復原可以找回來' : hist[0].resumed ? '已回到這次接著修時的樣子，按復原可以找回來' : '已回到最早還記得的那一步，按復原可以找回來');
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
  // 同一個分頁重畫（點選項）時，兩排選項留在原來捲到的位置
  const same = t === tab, sl = same ? [$('#items').scrollLeft, $('#cats').scrollLeft] : [0, 0];
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#hist').classList.toggle('crop', t === 'crop');
  const box = $('#items'); box.innerHTML = ''; $('#rows').innerHTML = ''; $('#items').hidden = false;
  $('#note').textContent = ''; $('#textedit').hidden = true; $('#stsearch').hidden = true; $('#cats').hidden = true; $('#sideSeg').hidden = true; $('#modeSeg').hidden = true; $('#protSw').hidden = true;
  if (!same && t === 'reshape') rsHinted = false;
  gradeHide(); hideSlider();
  if (!base) return;
  ({ looks: tabLooksHere, grade: tabGrade2, adjust: tabAdjust, filter: tabFilter, beauty: tabBeauty, shape: tabShape, makeup: tabMakeup, body: tabBody, cover: tabCover, hair: tabHair, skin: tabSkin, aiskin: tabAiSkin, sculpt: tabSculpt, reshape: tabReshape, doodle: box => tabDoodle(box, { item, setSlider, showTab }), bbrush: box => tabBeautyBrush(box, { item, sliderRow, showTab, surf: ensureSurf, tab: () => tab }), light: tabLight, sticker: tabSticker, cut: tabCut, fun: tabFun, frame: tabFrame, crop: tabCrop, tpl: tabTpl, cutout: tabCutout, text: tabText, erase: tabEraseHere })[t](box);
  drawTexts(); drawStickers();
  $('#wrap').classList.toggle('lightdrag', t === 'light' && !!P.light);
  lightDot(); bmBox(); rsRing(); faceBoxes();
  syncNav();
  fxTrim();
  if (t === 'hair' || SKIN_TABS.includes(t)) idle(fxPrime);
  // 換分頁：選中的那個捲到看得到的地方（以前留在上一個分頁捲到的位置，預設選中的磨皮、彎曲會在畫面外）；
  // 同一個分頁重畫：回到原本捲到的位置。peekRow 順便調間距，讓邊上那顆露一半
  peekRow(box, box.querySelector('.it.on'), same ? sl[0] : null); peekRow($('#cats'), $('#cats .it.on'), same ? sl[1] : null);
  peekRow($('#tabs'), $(`#tabs .tab[data-tab="${t}"]`), same ? $('#tabs').scrollLeft : null);
  FADE_ROWS.forEach(edgeFade);
}
// 橫著捲的列：還能往左、往右滑就在那一邊淡出（評審 M13）。電腦版不捲，不會淡出
const FADE_ROWS = ['#tabs', '#cats', '#items'].map(s => $(s));
// 換分頁時一排捲到哪：選中的那顆在右邊兩成以內就不捲，不然捲到中間
const rowScroll = (l, w, W) => l + w / 2 < W * 0.8 ? 0 : l - (W - w) / 2;
// 一排捲到 sel（選中的那顆，rowScroll）或 at（要回到的捲動位置），順便讓畫面邊上那顆露出一半左右，一看就知道還能滑
// （評審 #145 小 F、#147、#149）：間距在原本的 −4～+8px 之間挑；捲到 sel 時位置也可以差一點（最多一成五，選中那顆還整顆看得到）。
// 看右邊被切到的那顆；最後一顆整顆看得到（捲到底）就看左邊那顆。擠 1～2px 就整排放得下（連右邊留白）就不用滑。
// 同一排（一樣寬、一樣幾顆）回到原本位置重畫時沿用上次的間距，點選項時那排才不會晃
function peekRow(row, sel = null, at = null) {
  if (!row || row.hidden) return;
  row.style.gap = '';
  if (wide.matches) return;
  const its = [...row.children].filter(e => !e.hidden && e.offsetWidth > 0), n = its.length, W = row.clientWidth;
  const L = row.getBoundingClientRect().left - row.scrollLeft, xOf = e => e.getBoundingClientRect().left - L;
  const go = S => { if (S != null) row.scrollLeft = S; };
  // 回到原本位置時，選中的那顆被邊切到（剛點了邊上露一半那顆）：捲到整顆看得到，旁邊那顆露一半（評審 #150）
  const keep = S => {
    const i = its.indexOf(sel);
    if (i < 0) return S;
    const l = xOf(sel), r = l + sel.offsetWidth, nx = its[i + 1], pv = its[i - 1];
    if (r > S + W) return Math.min(row.scrollWidth - W, nx ? xOf(nx) + nx.offsetWidth / 2 - W : r - W);
    if (l < S) return Math.max(0, pv ? xOf(pv) + pv.offsetWidth / 2 : l);
    return S;
  };
  if (n < 3) { go(at != null ? keep(at) : sel ? rowScroll(xOf(sel), sel.offsetWidth, W) : null); return; }
  const cs = getComputedStyle(row), g0 = parseFloat(cs.columnGap) || 0, pr = parseFloat(cs.paddingRight) || 0;
  const x0 = xOf(its[0]), ws = its.map(e => e.offsetWidth), key = W + ':' + ws.join(','), si = its.indexOf(sel);
  if (at != null && row._peek?.key === key) { if (row._peek.g !== g0) row.style.gap = row._peek.g + 'px'; go(keep(at)); return; }
  let best = null, fit = null;
  for (let g = Math.max(2, g0 - 4); g <= g0 + 8; g++) {
    const xs = [];
    let x = x0;
    for (const w of ws) { xs.push(x); x += w + g; }
    const max = x - g + pr - W;  // 最多能捲多少
    if (max <= 0) { fit = g; continue; }
    const peek = S => {
      const end = xs[n - 1] - S + ws[n - 1] <= W;
      for (let i = 0; i < n; i++) { const a = xs[i] - S; if (end ? a < 0 && a + ws[i] > 0 : a < W && a + ws[i] > W) return end ? (a + ws[i]) / ws[i] : (W - a) / ws[i]; }
      return 0;  // 邊剛好落在兩顆中間：下一顆完全看不到
    };
    const S0 = Math.min(max, Math.max(0, at ?? (si < 0 ? 0 : rowScroll(xs[si], ws[si], W)))), cand = [S0];
    if (at == null && S0 > 0) for (let i = 0; i < n; i++) cand.push(xs[i] + ws[i] / 2 - W, xs[i] + ws[i] / 2);
    for (const S of cand) {
      if (S < 0 || S > max || Math.abs(S - S0) > W * 0.15) continue;
      if (si >= 0 && S !== S0 && (xs[si] < S + 8 || xs[si] + ws[si] > S + W - 8)) continue;
      const d = Math.abs(peek(S) - 0.5) + Math.abs(g - g0) / 100 + Math.abs(S - S0) / W * 0.3;
      if (!best || d < best.d) best = { g, S, d };
    }
  }
  if (!best || (fit != null && fit >= g0 - 2)) best = { g: Math.min(g0, fit ?? g0), S: 0 };
  row._peek = { key, g: best.g };
  if (best.g !== g0) row.style.gap = best.g + 'px';
  go(at ?? (si >= 0 ? best.S : null));
}
function edgeFade(el) {
  const l = el.scrollLeft > 2, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  el.classList.toggle('fadeL', l); el.classList.toggle('fadeR', r);
}
FADE_ROWS.forEach(el => el.addEventListener('scroll', () => edgeFade(el), { passive: true }));
addEventListener('resize', () => { FADE_ROWS.forEach(r => { peekRow(r, r.querySelector('.on'), r.scrollLeft); edgeFade(r); }); });

const isSet = (k, T = P) => T[k] !== 0 || (SIDED.includes(k) && (T[k + 'L'] !== 0 || T[k + 'R'] !== 0));
// 兩邊／左／右：固定放在說明那一列右邊。以前插在項目列最前面，點到瘦臉整排被推走 178px、剛點的那顆跑出畫面（評審 H3）。
// keep：這個分頁有能分左右的項目，點到不能分的也留著位置（看不到），說明文字才不會一下換行一下不換
function sideSeg(on, val, set, keep) {
  const s = $('#sideSeg');
  s.hidden = !on && !keep; s.classList.toggle('off', !on);
  s.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.sd === val); b.tabIndex = on ? 0 : -1; b.onclick = () => set(b.dataset.sd); });
}
function paramItems(box, list, def, itemsOnly) {
  if (!itemsOnly && wide.matches) return paramRows(box, list);
  if (!itemsOnly && !list.some(x => x[0] === cur)) cur = def;
  // 美顏有多張臉時，改的是選中的那張臉（faceP）
  const T = list === BEAUTY ? faceP() : P;
  const els = {};
  for (const [k, label, icon] of list) {
    box.append(els[k] = item({ label, icon, on: k === cur && !itemsOnly, set: isSet(k, T), onclick: () => {
      cur = k;
      const d = list === BEAUTY ? BEAUTY_DEF[k] : list.find(x => x[0] === k)[4];
      if (d && T[k] === 0) { T[k] = d; if (list === BEAUTY) T.oneTap = -1; render(); commit(); }
      showTab(tab);
    } }));
  }
  if (itemsOnly) return;
  const it = list.find(x => x[0] === cur);
  setSlider(it[1], it[3] ?? -100, it[5] ?? 100, T[cur], v => {
    T[cur] = v; if (list === BEAUTY) T.oneTap = -1; render();
    els[cur].classList.toggle('set', isSet(cur, T));
  }, it[4]);
}

// 電腦版：每個項目一條滑桿，全部列出來
function paramRows(box, list) {
  hideSlider();
  $('#items').hidden = !box.children.length;
  const rows = $('#rows'), T = list === BEAUTY ? faceP() : P;
  for (const [k, label, , min, d, max] of list) {
    rows.append(sliderRow({
      label, min: min ?? -100, max: max ?? 100, val: T[k], def: d,
      onInput: v => { T[k] = v; cur = k; if (list === BEAUTY) T.oneTap = -1; render(); bmBox(); },
    }));
  }
}

// 消除筆在 erase.js，這裡把它要用的東西傳過去
const eraseApp = { get base() { return base; }, setBase, commit, item, hideSlider, showTab, toast, busy, toSrc: srcMapper };
doodleInput($('#wrap'), { get base() { return base; }, tab: () => tab, surf: ensureSurf, paint: paintPatch, commit, toSrc: srcMapper });
// queued：放開了一筆、還在算：復原先亮起來（按下去會等它算完再退回）；settled：都算完了，照實際的復原步數
beautyBrushInput($('#wrap'), { get base() { return base; }, tab: () => tab, surf: ensureSurf, paint: paintPatch, commit, toSrc: srcMapper, queued: () => { $('#bUndo').disabled = false; }, settled: syncHist });
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

// 上排的「合併」：把目前的濾鏡畫進照片，就能再疊下一個濾鏡（醒圖、美圖秀秀的「合併」）
$('#bMerge').onclick = () => P.filter === 'none' ? toast('先在「濾鏡」選一個濾鏡，再按合併') : mergeFilter();
// 只套濾鏡、其他調整先不算，畫成原尺寸的新照片；其他調整、美顏照舊留著可以再改
// shader 裡排在濾鏡 LUT 前面的整張調整和打光、閃光燈：合併時跟濾鏡一起畫進照片再歸零。以前只畫濾鏡、這些留著，
// 合併後變成先濾鏡再調整，LUT 不是線性的，按下去整張亮一點（評審 L47：日系空氣 +3～4 階；現在平均差 0.03 階）
const PRE_LUT = ['backlight', 'exposure', 'brightness', 'lightSense', 'shadows', 'highlights', 'contrast', 'temp', 'tint', 'saturation', 'vibrance', 'fade'];
async function mergeFilter() {
  if (P.filter === 'none') return;
  busy('合併中…');
  try {
    await bbWait();
    // 濾鏡裡皮膚、頭髮另外一套顏色要等臉找完
    await findFaces();
    const now = P, f = liveFilter(), lut = getLut(f), pre = k => Object.fromEntries([...PRE_LUT, ...tabKeys.light].map(x => [x, clone(k[x] ?? null)]));
    P = { ...clone(P0), filter: now.filter, filterAmt: now.filterAmt, ...pre(now) };
    let out;
    try {
      R.setLut(lut?.c, lut?.skin, lut?.hair);
      draw(true);
      out = photoCanvas(base.canvas.width, base.canvas.height);
      out.getContext('2d').drawImage($('#gl'), 0, 0);
    } finally { P = now; }
    P = { ...now, filter: 'none', filterAmt: P0.filterAmt, ...pre(P0) };
    // 臉、人像這些偵測結果還是同一張照片，留著不用重算；濾鏡縮圖要照新照片重算
    const keep = { ...base };
    for (const k of ['canvas', 'thumbs', 'thumbSrc', 'harm', 'small', 'lookThumbs', 'autoSet']) delete keep[k];
    setBase(out, keep); commit(); showTab(tab);
    const parts = ['濾鏡', PRE_LUT.some(k => now[k]) && '調整', (now.light || now.flash) && '打光'].filter(Boolean);
    toast(parts.length > 1 ? `已合併（${parts.join('、')}都畫進照片了），可以再選一個濾鏡疊上去` : '已合併，可以再選一個濾鏡疊上去');
  } catch (e) { console.error(e); toast('合併失敗，再試一次'); }
  finally { busy(); }
}

// ---------- 多張臉分開修 ----------
// 照醒圖：照片有兩張以上的臉時，每張臉畫一個框，綠框是選中的那張，美顏、臉型的滑桿只改那張；
// 點白框換一張，放大照片時自動選畫面中間那張。
// P.pf：{ 臉的編號: { 這張臉自己改過的值 } }，沒改過的值照 P（一鍵出片這些整體套用的也照 P）
let selFace = 0, selFor = null, pickT = 0;
const FACE_TABS = ['beauty', 'shape'];
const isShapeKey = k => k.startsWith('fs_');
const multiFace = () => (base?.faces?.length || 0) > 1;
// 有沒有哪張臉自己改過
const perFace = () => multiFace() && !!P.pf && Object.values(P.pf).some(o => Object.keys(o).length);
// 第 i 張臉實際用的值
const PF = i => P.pf?.[i] ? { ...P, ...P.pf[i] } : P;
const pfHas = test => !!P.pf && Object.values(P.pf).some(o => Object.keys(o).some(test));
function pfClear(test) {
  if (!P.pf) return;
  for (const o of Object.values(P.pf)) for (const k of Object.keys(o)) if (test(k)) delete o[k];
}
// 預設選最大的那張臉；換照片、重新找臉後重選
function syncSel() {
  if (selFor === base?.faces) return;
  selFor = base?.faces;
  const g = base?.geoms || [];
  selFace = g.reduce((bi, x, i) => x.W > g[bi].W ? i : bi, 0);
}
// 美顏、臉型滑桿要讀寫的對象：一張臉就是 P；多張臉是選中那張臉的值（沒改過的讀 P，改了只記在這張臉）
function faceP() {
  if (!multiFace()) return P;
  syncSel();
  // 只是看看數字不建立，真的改了才記到 P.pf，復原紀錄才不會多一筆
  const t = P.pf?.[selFace] || {}, keep = o => { (P.pf ||= {})[selFace] = o; };
  return new Proxy(t, {
    get: (o, k) => k in o ? o[k] : P[k],
    set: (o, k, v) => { o[k] = v; keep(o); return true; },
    // 臉型的重置是刪掉值；這張臉要變回 0，不是變回 P 的值
    deleteProperty: (o, k) => { o[k] = 0; keep(o); return true; },
    has: (o, k) => k in o || k in P,
    ownKeys: () => [...new Set([...Object.keys(P), ...Object.keys(t)])],
    getOwnPropertyDescriptor: (o, k) => ({ value: k in o ? o[k] : P[k], enumerable: true, configurable: true, writable: true }),
  });
}
const faceNote = faces => faces.length > 1 ? `找到 ${faces.length} 張臉，綠框是正在修的那張，點白框可以換` : `找到 ${faces.length} 張臉`;
function faceBoxes() {
  let el = $('#faceboxes');
  if (!el) { el = document.createElement('div'); el.id = 'faceboxes'; $('#wrap').append(el); }
  el.hidden = !(base && multiFace() && FACE_TABS.includes(tab));
  el.innerHTML = '';
  if (el.hidden) return;
  syncSel();
  const W = base.canvas.width, H = base.canvas.height;
  base.faces.forEach((pts, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const pad = (x1 - x0) * 0.08, d = document.createElement('div');
    d.className = 'fbx' + (i === selFace ? ' on' : '');
    Object.assign(d.style, { left: (x0 - pad) / W * 100 + '%', top: (y0 - pad) / H * 100 + '%', width: (x1 - x0 + pad * 2) / W * 100 + '%', height: (y1 - y0 + pad * 2) / H * 100 + '%' });
    d.onclick = e => { e.stopPropagation(); if (selFace !== i) { selFace = i; showTab(tab); } };
    el.append(d);
  });
}
// 放大照片時：畫面中間離哪張臉最近就選哪張
function pickCenterFace() {
  if (!base || !multiFace() || !FACE_TABS.includes(tab)) return;
  syncSel();
  const s = $('#stage').getBoundingClientRect(), w = $('#wrap').getBoundingClientRect();
  const x = (s.left + s.width / 2 - w.left) / w.width * base.canvas.width, y = (s.top + s.height / 2 - w.top) / w.height * base.canvas.height;
  let bi = selFace, bd = Infinity;
  base.geoms.forEach((g, i) => { const d = Math.hypot(g.cx - x, g.cy - y) / g.W; if (d < bd) { bd = d; bi = i; } });
  if (bi === selFace) return;
  selFace = bi; faceBoxes();
  clearTimeout(pickT); pickT = setTimeout(() => { if (FACE_TABS.includes(tab)) showTab(tab); }, 120);
}

function tabBeauty(box) {
  const faces = base.faces;
  if (!faces) { $('#note').textContent = '正在找臉…'; findFaces(); }
  else if (!faces.length) $('#note').textContent = base.faceErr ? '臉部偵測模型載入失敗，檢查一下網路再換一次照片。' : '這張照片沒找到臉，美顏只對人臉有效。';
  else $('#note').textContent = faceNote(faces);
  const T = faceP();
  // 一鍵美顏的量（v：0～100）寫進美顏、臉型的滑桿。臉型是加在套用前的值上（T.oneShapeB），強度只控制加的那一段；
  // 套用後在臉型自己改過的（跟 T.oneShapeW 記的不一樣）就不再動（評審 #145 中 C：以前會蓋掉自己調的瘦臉、大眼）
  const oneSet = (t, v) => {
    Object.keys(t.set).forEach(k => T[k] = Math.round(t.set[k] * v / 100));
    const B = T.oneShapeB ||= {}, W = T.oneShapeW ||= {};
    Object.entries(t.shape).forEach(([id, x]) => {
      const now = getShape(T, id, 'both');
      if (id in W && now !== W[id]) return;
      if (!(id in B)) B[id] = now;
      setShape(T, id, 'both', W[id] = Math.min(100, B[id] + Math.round(x * v / 100)));
    });
  };
  // 換成另一種或關掉：前一種加的臉型退回套用前（之後在臉型改過的就留著）
  const oneUndo = t => {
    const B = T.oneShapeB, W = T.oneShapeW;
    Object.entries(t.shape).forEach(([id, x]) => {
      const now = getShape(T, id, 'both');
      if (W ? id in W && now === W[id] : now === Math.round(x * T.oneAmt / 100)) setShape(T, id, 'both', B?.[id] || 0);
    });
    delete T.oneShapeB; delete T.oneShapeW;
  };
  ONE_TAPS.forEach((t, i) => box.append(item({
    label: t.name, icon: t.icon, on: T.oneTap === i, onclick: () => {
      const off = T.oneTap === i, was = ONE_TAPS[T.oneTap];
      if (was) oneUndo(was); else { delete T.oneShapeB; delete T.oneShapeW; }  // 重設過美顏：舊的紀錄不算數
      T.oneTap = off ? -1 : i; T.oneAmt = 100;
      if (off) Object.keys(t.set).forEach(k => T[k] = 0); else oneSet(t, 100);
      cur = off ? 'smooth' : 'oneTap';
      render(); commit(); showTab('beauty');
    },
  })));
  const one = cur === 'oneTap' && T.oneTap >= 0;
  paramItems(box, BEAUTY, 'smooth', one);
  // 瘦臉、大眼：排在磨皮、美白後面，點了跳到臉型的同一個滑桿（第一次點跟臉型一樣套點開時的預設）
  const at = box.children[ONE_TAPS.length + 2] || null;
  BEAUTY_JUMP.forEach(([label, icon, c, id]) => box.insertBefore(item({
    label, icon, cls: 'jump', set: shapeIsSet(T, id), onclick: () => {
      shapeCat = c; shapeCur = id;
      const C = SHAPE_CATS.find(x => x.id === c), it = C.items.find(x => x.id === id), d = it.def;
      if (d && !shapeIsSet(T, id)) { setShape(T, id, 'both', d); render(); commit(); }
      showTab('shape');
      // 臉型裡叫「眼睛 › 大小」（醒圖的名字），跟美顏的「大眼」對不上：跳過去時說一聲（評審 #145 小 H）
      if (it.name !== label) toast(`${label}在「臉型 › ${C.name} › ${it.name}」`, 2500);
    },
  }), at));
  if (one) {
    const t = ONE_TAPS[T.oneTap];
    $('#note').textContent = t.note + (base.faces?.length > 1 ? '。' + faceNote(base.faces) : '');
    setSlider('強度', 0, 100, T.oneAmt, v => { T.oneAmt = v; oneSet(t, v); render(); });
  }
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
    // 手動塑身沒有背景保護（跟 Hypic 一樣，保護只在自動塑身）
    paramItems(box, BODY_MAN, 'bmHeight');
    $('#note').textContent = { bmHeight: '拖兩條線選要拉長的那一段。', bmSlim: '拖中間移動，上下兩端調長短、左右調寬窄，右下角旋轉。', bmZoom: '拖圓圈移動，右下角調大小。' }[manKey()];
    return;
  }
  protSw();
  paramItems(box, BODY, 'bodyHead');
  $('#note').textContent = bodyNote(base.body, cur);
}
// 手動塑身的控制（照 Hypic）：增高是兩條橫線（右邊有把手），瘦身是兩條腰身弧線加中軸
// （中間移動、上下兩端調長短、左右對稱調寬窄、右下角旋轉和縮放），重塑是圓（中間移動、右下角調大小）
const manKey = () => base && tab === 'body' && bodySec === 'man' ? (BODY_MAN.some(x => x[0] === cur) ? cur : 'bmHeight') : null;
// 控制在照片上的樣子（照片像素）：線、把手（id、位置、圖示、轉幾度）
function bmGeom(k) {
  const W = base.canvas.width, H = base.canvas.height, r = manualRegion(k, base.body, P, W, H);
  if (k === 'bmHeight') {
    // 跟 Hypic 一樣兩條線橫過整個畫面，把手在畫面右邊（不擋照片）
    const wr = $('#wrap').getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), u = W / Math.max(1, wr.width);
    const xl = (sr.left - wr.left) * u, xr = (sr.right - wr.left) * u, hx = xr - 22 * u, y0 = r.y0 * H, y1 = r.y1 * H;
    return { r, lines: [`M${xl} ${y0}H${xr}`, `M${xl} ${y1}H${xr}`], hs: [{ id: 'y0', x: hx, y: y0, ic: 'ud' }, { id: 'y1', x: hx, y: y1, ic: 'ud' }] };
  }
  const c = { x: r.cx * W, y: r.cy * H };
  if (k === 'bmZoom') {
    const R = r.r * W, q = R * Math.SQRT1_2;
    return { r, c, R, lines: [`M${c.x - R} ${c.y}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`], hs: [{ id: 'size', x: c.x + q, y: c.y + q, ic: 'size' }] };
  }
  const a = r.a || 0, ax = { x: -Math.sin(a), y: Math.cos(a) }, n = { x: ax.y, y: -ax.x }, hw = r.hw * W, hh = r.hh * W;
  const at = (u, v) => ({ x: c.x + n.x * u + ax.x * v, y: c.y + n.y * u + ax.y * v }), P2 = (u, v) => { const q = at(u, v); return `${q.x} ${q.y}`; };
  // 弧線：兩端比中間寬一點（腰身），中間經過左右把手
  const arc = sd => `M${P2(sd * 1.064 * hw, -hh)}Q${P2(sd * 0.936 * hw, 0)} ${P2(sd * 1.064 * hw, hh)}`;
  const deg = a * 180 / Math.PI, h = (id, u, v, ic) => ({ id, ...at(u, v), ic, deg });
  return { r, c, ax, n, hw, hh, lines: [arc(-1), arc(1), `M${P2(0, -hh)}L${P2(0, hh)}`],
    hs: [h('top', 0, -hh, 'up'), h('bottom', 0, hh, 'down'), h('left', -hw, 0, 'left'), h('right', hw, 0, 'right'), h('move', 0, 0, 'move'), h('rot', 1.064 * hw, hh, 'rot')] };
}
const BM_IC = {
  up: 'M-4 2l4-4 4 4', down: 'M-4-2l4 4 4-4', left: 'M2-4l-4 4 4 4', right: 'M-2-4l4 4-4 4', ud: 'M-3-2l3-3 3 3M-3 2l3 3 3-3',
  move: 'M0-6v12M-6 0h12M-2-4l2-2 2 2M-2 4l2 2 2-2M-4-2l-2 2 2 2M4-2l2 2-2 2', size: 'M-4-4l8 8M-4 0v-4h4M4 0v4h-4',
  rot: 'M4.5-1A4.5 4.5 0 1 0 3 3.3M4.5-4v3h-3',
};
function bmBox() {
  let s = $('#bmctl');
  if (!s) { $('#wrap').insertAdjacentHTML('beforeend', '<svg id="bmctl"></svg>'); s = $('#bmctl'); }
  const k = manKey();
  s.style.display = k ? '' : 'none';
  if (!k) return;
  const W = base.canvas.width, H = base.canvas.height, g = bmGeom(k), u = W / Math.max(1, $('#wrap').getBoundingClientRect().width);
  s.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const line = g.lines.map(d => `<path d="${d}" class="sh"/><path d="${d}"/>`).join('');
  const hs = g.hs.map(h => `<g transform="translate(${h.x} ${h.y}) scale(${u}) rotate(${h.deg || 0})"><circle r="12"/><path d="${BM_IC[h.ic]}"/></g>`).join('');
  s.innerHTML = line + hs;
}
// 手指在照片上的哪一點（照片像素）；u：螢幕 1px 是照片幾像素
const bmPos = e => { const r = $('#wrap').getBoundingClientRect(), W = base.canvas.width, H = base.canvas.height; return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, u: W / r.width }; };
// 點到手動塑身控制的哪裡：最近的把手，沒點到把手、在範圍裡面就是整個移動
function bmHit(e) {
  const k = manKey();
  if (!k || e.target.closest('.st,.tx,button')) return null;
  const q = bmPos(e), g = bmGeom(k);
  let id = null, best = 26 * q.u;
  for (const h of g.hs) { const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < best) { best = d; id = h.id; } }
  if (!id && k === 'bmHeight') for (const y of ['y0', 'y1']) { const d = Math.abs(q.y - g.r[y] * base.canvas.height); if (d < best) { best = d; id = y; } }
  if (!id && k === 'bmSlim') { const d = { x: q.x - g.c.x, y: q.y - g.c.y }; if (Math.abs(d.x * g.n.x + d.y * g.n.y) < g.hw * 1.1 && Math.abs(d.x * g.ax.x + d.y * g.ax.y) < g.hh) id = 'move'; }
  if (!id && k === 'bmZoom' && Math.hypot(q.x - g.c.x, q.y - g.c.y) < g.R) id = 'move';
  return id && { k, q, g, id, h: g.hs.find(h => h.id === id) };
}
(() => {
  let drag = null;
  // 聽整個畫面（不只照片）：增高的把手在照片外面
  $('#stage').addEventListener('pointerdown', e => {
    if (e.button > 0 || pinch.on) return;
    const hit = bmHit(e);
    if (!hit) return;
    e.preventDefault(); $('#stage').setPointerCapture(e.pointerId);
    drag = hit;
  });
  $('#stage').addEventListener('pointermove', e => {
    if (!drag || pinch.on) return;
    // m：範圍最小多大（螢幕上 28px，把手才不會疊在一起）
    const W = base.canvas.width, H = base.canvas.height, q = bmPos(e), { k, g, id } = drag, r = { ...g.r }, m = 28 * q.u;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    if (k === 'bmHeight') {
      if (id === 'y0') r.y0 = cl(q.y, 0, r.y1 * H - m) / H;
      else r.y1 = cl(q.y, r.y0 * H + m, H) / H;
    } else if (id === 'move') {
      r.cx = cl(g.c.x + q.x - drag.q.x, 0, W) / W; r.cy = cl(g.c.y + q.y - drag.q.y, 0, H) / H;
    } else if (k === 'bmZoom') {
      r.r = Math.max(m, Math.hypot(q.x - g.c.x, q.y - g.c.y)) / W;
    } else {
      const d = { x: q.x - g.c.x, y: q.y - g.c.y }, u = d.x * g.n.x + d.y * g.n.y, v = d.x * g.ax.x + d.y * g.ax.y;
      if (id === 'left' || id === 'right') r.hw = Math.max(m, Math.abs(u)) / W;
      else if (id === 'top' || id === 'bottom') {
        // 拖一端，另一端不動
        const t = id === 'top' ? Math.min(v, g.hh - 2 * m) : -g.hh, b = id === 'bottom' ? Math.max(v, -g.hh + 2 * m) : g.hh;
        r.cx = (g.c.x + g.ax.x * (t + b) / 2) / W; r.cy = (g.c.y + g.ax.y * (t + b) / 2) / H; r.hh = (b - t) / 2 / W;
      } else {
        // 旋轉：跟著手指轉，離中心遠近一起縮放
        const h0 = { x: drag.h.x - g.c.x, y: drag.h.y - g.c.y }, sc = Math.max(0.2, Math.hypot(d.x, d.y) / Math.max(1, Math.hypot(h0.x, h0.y)));
        r.a = (g.r.a || 0) + Math.atan2(d.y, d.x) - Math.atan2(h0.y, h0.x);
        r.hw = Math.max(m / W, g.r.hw * sc); r.hh = Math.max(m / W, g.r.hh * sc);
      }
    }
    P[REG_OF[k]] = r; render(); bmBox();
  });
  const up = () => { if (drag) { drag = null; commit(); } };
  $('#stage').addEventListener('pointerup', up); $('#stage').addEventListener('pointercancel', up);
  // 第二根手指放下來是要縮放照片：這一下拖曳不算，範圍放回去
  addEventListener('pinchstart', () => { if (!drag) return; P[REG_OF[drag.k]] = drag.g.r; drag = null; render(); bmBox(); });
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
  protSw();
}
// ---------- 重新塑形（液化，reshape.js） ----------
// 照 Hypic 修飾 › 重新塑形：彎曲、順時針旋轉、逆時針旋轉、脹大、縮小、還原，每個工具各自記大小、強度
let rsTool = 'push';
const rsVal = Object.fromEntries(RESHAPE.map(t => [t.id, { size: t.size, str: t.str }]));
function tabReshape(box) {
  RESHAPE.forEach(t => box.append(item({ label: t.name, icon: t.icon, on: rsTool === t.id, onclick: () => { rsTool = t.id; showTab('reshape'); } })));
  protSw();
  // 大小、強度兩條一起顯示，不用再點膠囊切換（評審 2026-10-27）
  const v = rsVal[rsTool], t = RESHAPE.find(t => t.id === rsTool);
  $('#rows').append(
    sliderRow({ label: '大小', min: 1, max: 100, val: v.size, def: t.size, onInput: x => { v.size = x; rsRing(); } }),
    sliderRow({ label: '強度', min: 1, max: 100, val: v.str, def: t.str, onInput: x => { v.str = x; } }));
  $('#note').textContent = rsTool === 'push' ? '手指推到哪，照片就跟著走；兩指縮放照片。' : rsTool === 'restore' ? '塗抹推壞的地方，每畫一筆就變回原樣一點，只有塗到的地方會變。' : '在要改的地方按住或來回塗抹。';
  rsRing();
}
// 筆刷大小的圓圈（調大小時顯示在照片中間，畫的時候跟著手指）
// 圓圈放在不跟著照片縮放的那層（#stage），用螢幕座標畫：放在照片那層的話，放大時是把圓圈的圖跟著放大，會變糊
function rsRing(p) {
  let d = $('#rsring');
  if (!d) { d = document.createElement('div'); d.id = 'rsring'; $('#stage').append(d); }
  d.hidden = !(base && tab === 'reshape');
  if (d.hidden) return;
  const W = base.canvas.width, H = base.canvas.height, s = $('#stage').getBoundingClientRect(), w = $('#wrap').getBoundingClientRect();
  const k = w.width / W, rr = liqRadius(rsVal[rsTool].size, W, H) * k;
  // 沒在畫的時候放在看得到的那塊照片中間
  const x = p ? w.left + p.x * k : (Math.max(w.left, s.left) + Math.min(w.right, s.right)) / 2;
  const y = p ? w.top + p.y * k : (Math.max(w.top, s.top) + Math.min(w.bottom, s.bottom)) / 2;
  Object.assign(d.style, { width: rr * 2 + 'px', height: rr * 2 + 'px', left: x - s.left + 'px', top: y - s.top + 'px' });
  d.classList.toggle('idle', !p);
}
(() => {
  let last = null, timer = 0, liq0 = null, p0 = null;
  // 背景保護開著、推的地方是背景：畫面不會動，使用者會以為推臉壞了。每次進推臉說一次，開關閃一下（評審 M16）
  const protHint = () => {
    const m = base.matte || base.seg?.person;
    if (!P.bgProtect || !m || !p0 || rsHinted) return;
    const x = Math.min(m.width - 1, Math.floor(p0.x / base.canvas.width * m.width)), y = Math.min(m.height - 1, Math.floor(p0.y / base.canvas.height * m.height));
    const c = m.getContext?.('2d');
    if (!c || c.getImageData(x, y, 1, 1).data[0] > 40) return;
    rsHinted = true;
    toast('這裡是背景，背景保護開著所以不會動，要推背景先把它關掉', 4000);
    const b = $('#protSw'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  };
  const at = e => { const r = $('#wrap').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * base.canvas.width, y: (e.clientY - r.top) / r.height * base.canvas.height }; };
  // 這一筆整個在背景上（背景保護開著）：畫面沒動，這筆不算，不亮點、不多一步復原（評審 #145 小 I）。
  // 看筆刷中心和一圈 8 個點，碰到人就算有推到
  const mData = new WeakMap();
  let allBg = false;
  const onBg = p => {
    const m = base.matte || base.seg?.person, c = P.bgProtect && m?.getContext?.('2d');
    if (!c) return false;
    let d = mData.get(m);
    if (!d) mData.set(m, d = c.getImageData(0, 0, m.width, m.height).data);
    const r = liqRadius(rsVal[rsTool].size, base.canvas.width, base.canvas.height) * 0.8;
    for (let k = 0; k < 9; k++) {
      const a = k * Math.PI / 4, q = k === 8 ? p : { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      const x = Math.min(m.width - 1, Math.max(0, Math.floor(q.x / base.canvas.width * m.width))), y = Math.min(m.height - 1, Math.max(0, Math.floor(q.y / base.canvas.height * m.height)));
      if (d[(y * m.width + x) * 4] > 40) return false;
    }
    return true;
  };
  const dab = (a, b) => { const v = rsVal[rsTool]; P.liq = liqDab(P.liq, rsTool, a, b, v.size, v.str, base.canvas.width, base.canvas.height); render(); };
  $('#wrap').addEventListener('pointerdown', e => {
    if (tab !== 'reshape' || !base || e.target.closest('.st,.tx') || e.button > 0 || pinch.on) return;
    e.preventDefault(); $('#wrap').setPointerCapture(e.pointerId);
    last = p0 = at(e); liq0 = P.liq; rsRing(last); allBg = rsTool !== 'restore' && onBg(last);
    // 旋轉、脹大、縮小：按住不動也會一直作用；還原是畫一筆還原一點，按住不會一直還原
    if (rsTool !== 'push') { dab(last, last); if (rsTool !== 'restore') timer = setInterval(() => last && dab(last, last), 90); }
  });
  $('#wrap').addEventListener('pointermove', e => {
    if (!last) return;
    const p = at(e), r = liqRadius(rsVal[rsTool].size, base.canvas.width, base.canvas.height);
    rsRing(p);
    if (Math.hypot(p.x - last.x, p.y - last.y) < r * 0.12) return;
    if (rsTool === 'push' || rsTool === 'restore') dab(last, p); else dab(p, p);
    if (allBg && !onBg(p)) allBg = false;
    last = p;
  });
  const up = () => {
    if (!last) return; last = null; clearInterval(timer); rsRing();
    if (allBg) { P.liq = liq0; render(); } else commit();
    if (rsTool !== 'restore') protHint();
  };
  $('#wrap').addEventListener('pointerup', up); $('#wrap').addEventListener('pointercancel', up);
  // 第二指放下是要縮放：這一筆不算
  addEventListener('pinchstart', () => { if (!last) return; last = null; clearInterval(timer); P.liq = liq0; rsRing(); render(); });
})();

// 塗抹的時候先把復原、看原圖按鈕藏起來，不擋到照片角落（評審 2026-10-27）
{
  const PAINT = ['bbrush', 'reshape', 'doodle', 'erase'];
  $('#wrap').addEventListener('pointerdown', e => { if (PAINT.includes(tab) && e.button <= 0) $('#hist').classList.add('painting'); }, true);
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, () => $('#hist').classList.remove('painting'), true));
}

// 背景保護開關：推臉、頭髮蓬鬆、身體這些變形都會用到（臉型只動臉，碰不到背景，不放）
function protSw() {
  const b = $('#protSw'), on = !!P.bgProtect;
  b.hidden = false; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
  b.onclick = () => { P.bgProtect = on ? 0 : 1; toast(on ? '背景保護關：背景也會跟著變形' : '背景保護開：變形時背景不會跟著彎'); render(); commit(); showTab(tab); };
}

// ---------- 一鍵出片（looks.js） ----------
function tabLooksHere(box) {
  tabLooks(box, {
    P: () => P, P0, base: () => base, item, setSlider, hideSlider, render, commit, needSeg, toast,
    findPerson: () => findPerson(true).then(() => render()),
    cats: () => $('#cats'), refresh: () => showTab('looks'), note: t => { $('#note').textContent = t; },
  });
}

// ---------- 美妝（makeup.js） ----------
function tabMakeup(box) {
  makeupTab(box, {
    P: () => P, base: () => base, item, setSlider, hideSlider, render, commit, findFaces, edgeFade, peekRow,
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
  else $('#note').textContent = faceNote(faces);
  const T = faceP();
  const cat = SHAPE_CATS.find(c => c.id === shapeCat);
  if (!cat.items.some(it => it.id === shapeCur)) shapeCur = cat.items[0].id;
  const it = cat.items.find(x => x.id === shapeCur);
  // 上面一排：分類，最後是重置這一類
  const cats = $('#cats'); cats.hidden = false; cats.innerHTML = '';
  SHAPE_CATS.forEach(c => cats.append(item({
    label: c.name, icon: c.name, cls: 'wide', on: c.id === shapeCat, set: c.items.some(x => shapeIsSet(T, x.id)),
    onclick: () => { shapeCat = c.id; showTab('shape'); },
  })));
  cats.append(item({ label: '重置', icon: '重置', cls: 'wide', onclick: () => { resetShape(T, shapeCat); render(); commit(); showTab('shape'); } }));
  sideSeg(!!it.sided, shapeSide, sd => { shapeSide = sd; showTab('shape'); }, cat.items.some(x => x.sided));
  const side = it.sided ? shapeSide : 'both';
  const els = {};
  cat.items.forEach(x => box.append(els[x.id] = item({
    label: x.name, icon: SHAPE_IC[cat.id], on: x.id === shapeCur, set: shapeIsSet(T, x.id),
    onclick: () => {
      shapeCur = x.id;
      // 第一次點開時套用醒圖的預設強度（風格類 30~60、臉部對稱 100 等）
      if (x.def && !shapeIsSet(T, x.id)) { setShape(T, x.id, 'both', x.def); render(); commit(); }
      showTab('shape');
    },
  })));
  setSlider(it.name + (side === 'L' ? '左' : side === 'R' ? '右' : ''), it.min, 100, getShape(T, it.id, side), v => {
    setShape(T, it.id, side, v); render();
    cat.items.forEach(x => els[x.id].classList.toggle('set', shapeIsSet(T, x.id)));
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
  list.forEach(sk => stkTone(box.appendChild(item({
    label: sk.name, cls: 'stk', icon: `<img src="${thumbURL(sk.id)}" alt="">`, onclick: () => addSticker({ kind: 'svg', v: sk.id }, sk.face),
  }))));
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
// 貼紙縮圖跟格子底色太像（黑墨鏡、音符、遮臉面具放在深灰格子上幾乎看不到）：那一格換成反過來的底色（評審 L55）。
// 縮圖載入後縮成 24×24 看一次：不透明的地方有一半以上跟底色亮度差不到 48 就換；每張貼紙只看一次。b 要已經放進畫面（才讀得到底色）
const stkSeen = new Map();
function stkTone(b) {
  const img = b.querySelector('img'), ic = b.querySelector('.ic'), bg = img && getComputedStyle(ic).backgroundColor.match(/[\d.]+/g);
  if (!bg) return b;
  const bl = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2], key = img.src + (bl < 128 ? 'd' : 'l');
  const set = v => { if (v) b.classList.add(bl < 128 ? 'lite' : 'dim'); };
  if (stkSeen.has(key)) { set(stkSeen.get(key)); return b; }
  const look = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let n = 0, near = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 96) { n++; if (Math.abs(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - bl) < 48) near++; }
      const v = n > 0 && near * 2 > n; stkSeen.set(key, v); set(v);
    } catch (e) { stkSeen.set(key, false); }
  };
  if (img.complete && img.naturalWidth) look(); else img.addEventListener('load', look, { once: true });
  return b;
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
  COVERS.filter(c => c.cat === cvCat).forEach(c => stkTone(box.appendChild(item({
    label: c.name, cls: 'stk', icon: c.svg ? `<img src="${thumbURL(c.id)}" alt="">` : c.name.slice(0, 2), onclick: () => addCover(c),
  }))));
  hideSlider();
  $('#note').textContent = !faces ? '正在找臉…' : !faces.length ? '這張照片沒找到臉。' : `點一下貼到 ${faces.length} 張臉上，貼上後可以到「文字」裡的「貼紙」移動或刪除。`;
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
    bgOwn = await createImageBitmap(file, { imageOrientation: 'from-image' }); bgN++; bgOwnFile = file;
    P.bg = 'img'; P.bgImg = 'own'; render(); commit(); showTab('cutout');
  } catch (err) { console.error(err); toast('這張照片打不開'); }
};
$('#file2').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    await setExOwn(file);
    P.ex = 'own'; render(); commit(); showTab('fun');
  } catch (err) { console.error(err); toast('這張照片打不開'); }
};
async function setExOwn(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const [w, h] = fitSize(bmp.width, bmp.height, 1600);
  exOwn = newCanvas(w, h); exOwn.getContext('2d').drawImage(bmp, 0, 0, w, h); exN++; exOwnFile = file;
}

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
  // 跟消除的「立即消除」一樣放第一個、最顯眼（以前排在最後，手機上要捲很遠，評審 2026-10-27）
  box.prepend(item({ label: '套用裁切', icon: '套用裁切', cls: 'wide', style: 'background:var(--accent);color:#fff;font-weight:600', onclick: applyCrop }));
  $('#note').textContent = '拖曳框框或四個角來裁切，按「套用裁切」完成。';
}
function startCrop() {
  cropState = { x: 0, y: 0, w: 1, h: 1, ratio: 'free' };
  $('#crop').classList.add('on'); $('#stage').classList.add('crop'); layout();
}
function endCrop() { cropState = null; $('#crop').classList.remove('on'); $('#stage').classList.remove('crop'); layout(); }
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
// 照片本身的 canvas：放在記憶體（不是 GPU）。美顏筆、塗鴉每筆都要讀寫一小塊，電腦版 Chrome 的 GPU canvas
// 每讀一次都要等 GPU，大筆刷放開要 1～2 秒（評審 2026-10-27）；放記憶體的讀寫是直接的
const cpuCanvas = new WeakSet();
function photoCanvas(w, h) { const c = newCanvas(w, h); c.getContext('2d', { willReadFrequently: true }); cpuCanvas.add(c); return c; }
function applyCrop() {
  const c = cropState, W = base.canvas.width, H = base.canvas.height;
  if (c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999) return toast('先拖曳框框選範圍');
  const sx = Math.round(c.x * W), sy = Math.round(c.y * H), sw = Math.max(1, Math.round(c.w * W)), sh = Math.max(1, Math.round(c.h * H));
  const out = photoCanvas(sw, sh);
  out.getContext('2d').drawImage(base.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  // 文字跟著新的範圍移動
  [...texts, ...stickers].forEach(t => { t.x = (t.x - c.x) / c.w; t.y = (t.y - c.y) / c.h; t.size = t.size / c.w; });
  movePositions(W, H, sw, sh, (x, y) => [x - sx, y - sy], (a, b) => [a, b], false);
  const om = base.om && (([a, b, cc, d, e, f]) => [a, b, cc, d, a * sx + cc * sy + e, b * sx + d * sy + f])(base.om);
  setBase(out, { om });
  cropState = { x: 0, y: 0, w: 1, h: 1, ratio: c.ratio };
  drawCrop(); commit();
}
// 裁切、旋轉、翻轉：推臉、身體的手動框、打光的位置跟著照片換（以前留在原地，推過的地方跑到別處，評審 2026-10-27）。
// f：舊照片上的點（像素）→ 新照片上的點；v：位移方向怎麼轉；mirror：翻轉時旋轉方向相反
// （瘦臉、臉型這些照臉算的會在新照片上重新找臉，不用換）
function movePositions(W, H, W2, H2, f, v, mirror) {
  const M = Math.max(W, H), M2 = Math.max(W2, H2);
  if (P.liq.length) P.liq = P.liq.map(m => {
    const [cx, cy] = f(m.cx * M, m.cy * M), o = { ...m, cx: cx / M2, cy: cy / M2, r: m.r * M / M2 };
    if (m.t === 0) { const [a, b] = v(m.a * M, m.b * M); o.a = a / M2; o.b = b / M2; }
    else if (m.t === 2 && mirror) o.a = -m.a;
    return o;
  });
  for (const [key, k] of Object.entries(REG_OF)) {
    if (!P[k]) continue;
    const r = manualRegion(key, null, P, W, H);
    if (key === 'bmHeight') {
      // 轉 90° 後兩條橫線變直的，放不回去：回到預設位置
      const a = f(W / 2, r.y0 * H)[1], b = f(W / 2, r.y1 * H)[1];
      P[k] = Math.abs(b - a) < 2 || Math.abs(f(0, r.y0 * H)[1] - a) > 1 ? null : { y0: Math.min(a, b) / H2, y1: Math.max(a, b) / H2 };
      continue;
    }
    const [cx, cy] = f(r.cx * W, r.cy * H);
    if (key === 'bmZoom') { P[k] = { cx: cx / W2, cy: cy / H2, r: r.r * W / W2 }; continue; }
    // 瘦身：中軸往下那一點跟著換，算出新的角度（上下翻過來的話轉半圈回來，範圍一樣、把手不會倒過來）
    const a = r.a || 0, [dx, dy] = f(r.cx * W - Math.sin(a) * 100, r.cy * H + Math.cos(a) * 100);
    let na = Math.atan2(-(dx - cx), dy - cy);
    if (Math.abs(na) > Math.PI / 2 + 1e-6) na -= Math.sign(na) * Math.PI;
    P[k] = { cx: cx / W2, cy: cy / H2, hw: r.hw * W / W2, hh: r.hh * W / W2, a: na };
  }
  if (P.lightX != null && P.lightY != null) { const [x, y] = f(P.lightX * W, P.lightY * H); P.lightX = x / W2; P.lightY = y / H2; }
}
function transform(kind) {
  const W = base.canvas.width, H = base.canvas.height;
  const out = kind === 'rot' ? photoCanvas(H, W) : photoCanvas(W, H), ctx = out.getContext('2d');
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
  if (kind === 'rot') movePositions(W, H, H, W, (x, y) => [H - y, x], (a, b) => [-b, a], false);
  if (kind === 'flipH') movePositions(W, H, W, H, (x, y) => [W - x, y], (a, b) => [-a, b], true);
  if (kind === 'flipV') movePositions(W, H, W, H, (x, y) => [x, H - y], (a, b) => [a, -b], true);
  // 看原圖對到最初照片的位置：新照片的 (X, Y) 是舊照片的哪一點，代進舊的 om
  const om = base.om && (([a, b, c, d, e, f]) => kind === 'rot' ? [-c, -d, a, b, c * H + e, d * H + f]
    : kind === 'flipH' ? [-a, -b, c, d, a * W + e, b * W + f] : [a, b, -c, -d, c * H + e, d * H + f])(base.om);
  setBase(out, { om });
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
  // 編輯文字時面板沒有說明列（擠不下），只在真的需要時跳一行提示
  TX_SECS.forEach(([k, lb]) => cats.append(item({ label: lb, icon: lb, cls: 'wide', on: txSec === k, set: isSet[k], onclick: () => { txSec = k; showTab('text'); if (k === 'curve' && t.vert) toast('直書文字不能彎曲，先到「排列」改回橫書。', 3000); } })));
  const sizeSlider = () => setSlider('大小', 2, 40, Math.round(t.size * 100), v => { t.size = v / 100; drawTexts(); });
  hideSlider();
  if (txSec === 'tpl') {
    sizeSlider();
    box.append(item({ label: '無', icon: I.off, on: !t.tpl, onclick: () => { applyTemplate(t, null); redo(); } }));
    TEMPLATES.forEach(tp => box.append(item({
      label: tp.name, cls: 'ft tt', on: t.tpl === tp.id, style: `background-image:url(${tplThumb(tp)});background-color:#3a3a42`,
      onclick: () => { applyTemplate(t, tp); loadFont(t.font, t.text).then(drawTexts); redo(); },
    })));
  } else if (txSec === 'font') {
    sizeSlider();
    FONTS.forEach((f, i) => box.append(item({
      label: f.name, icon: f.name.length > 3 ? f.name : '字', cls: 'wide', on: t.font === i, style: `font-family:${f.css.replace(/"/g, "'")};font-size:15px`,
      onclick: () => { t.font = i; redo(); if (f.gf) loadFont(i, t.text).then(drawTexts); },
    })));
    FONTS.forEach((f, i) => f.gf && loadFont(i, f.name));
  } else if (txSec === 'style') {
    box.append(item({ label: '粗體', icon: '<b>B</b>', on: t.bold, onclick: () => { t.bold = !t.bold; redo(); } }));
    box.append(item({ label: '斜體', icon: '<i>I</i>', on: t.italic, onclick: () => { t.italic = !t.italic; redo(); } }));
    box.append(item({ label: '底線', icon: '<u>U</u>', on: t.under, onclick: () => { t.under = !t.under; redo(); } }));
    box.append(item({ label: '漸層', icon: '漸', on: !!t.color2, onclick: () => { t.color2 = t.color2 ? null : TEXT_COLORS[(TEXT_COLORS.indexOf(t.color) + 3) % TEXT_COLORS.length]; redo(); if (t.color2) toast('現在選的是漸層下半部的顏色。'); } }));
    swatches(box, t.color2 || t.color, c => { if (t.color2) t.color2 = c; else t.color = c; });
    setSlider('透明', 0, 100, t.op, v => { t.op = v; drawTexts(); });
  } else if (txSec === 'stroke') {
    const auto = item({ label: '自動', icon: '自動', cls: 'wide', on: !t.strokeColor, onclick: () => { t.strokeColor = null; if (!t.stroke) t.stroke = 30; redo(); } });
    swatches(box, t.strokeColor, c => { t.strokeColor = c; if (!t.stroke) t.stroke = 30; }, [auto]);
    setSlider('寬度', 0, 100, t.stroke, v => { t.stroke = v; drawTexts(); });
  } else if (txSec === 'fx') {
    box.append(item({ label: '無', icon: I.off, on: !t.fx, onclick: () => { t.fx = ''; redo(); } }));
    TEXT_FX.forEach(([id, lb]) => box.append(item({ label: lb, icon: lb, cls: 'wide', on: t.fx === id, onclick: () => { t.fx = id; redo(); if (id === 'hollow') toast('鏤空只留描邊，描邊顏色、寬度到「描邊」調。', 3000); } })));
    if (t.fx && t.fx !== 'hollow' && t.fx !== 'glitch') swatches(box, t.fxColor, c => { t.fxColor = c; });
    if (t.fx && t.fx !== 'hollow') setSlider(t.fx === '3d' ? '厚度' : t.fx === 'glitch' ? '錯開' : '寬度', 0, 100, t.fxAmt, v => { t.fxAmt = v; drawTexts(); });
  } else if (txSec === 'shadow') {
    if (!t.shadow) { t.shadow = 60; drawTexts(); }
    subSliders(box, 'shadow', [['shadow', '不透明度', 0, 100], ['shadowBlur', '模糊', 0, 100], ['shadowAngle', '角度', -180, 180], ['shadowDist', '位移', 0, 100]], t);
    swatches(box, t.shadowColor, c => { t.shadowColor = c; if (!t.shadow) t.shadow = 60; });
  } else if (txSec === 'bg') {
    swatches(box, t.bg ? t.bgColor : null, c => { t.bgColor = c; if (!t.bg) t.bg = 100; }, [item({ label: '無', icon: I.off, on: !t.bg, onclick: () => { t.bg = 0; redo(); } })]);
    setSlider('透明', 0, 100, t.bg, v => { t.bg = v; drawTexts(); });
  } else if (txSec === 'curve') {
    subSliders(box, 'curve', [['curve', '曲線', -100, 100], ['curveOff', '位移', -100, 100]], t);
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
    await bbWait();
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
// 換照片：回到首頁（草稿、選照片、拍照、拼貼）。修到一半的這張已經存成草稿，不會不見
$('#bOpen').onclick = () => { saveDraft(true); showHome(true); };
$('#bHome').onclick = () => showHome(false);
$('#bCam').onclick = () => $('#cam').click();
// 拼貼、範本：一次選多張照片
let multiFor = 'grid';
$('#bCollage').onclick = () => { multiFor = 'grid'; showHome(false); $('#fileMulti').click(); };
$('#bTpl').onclick = () => { multiFor = 'tpl'; showHome(false); $('#fileMulti').click(); };

// ---------- 草稿：修到一半的自動存在這台裝置（照醒圖首頁的草稿） ----------
// 評審 2026-10-27：Safari 重開、重新整理，修到一半的整個不見。每一步改完 0.5 秒後存參數，切到別的 app 時馬上存。
// 照片：剛打開存原檔；之後美顏筆、塗鴉每一筆只存改到的那一塊（不用壓，畫完不會頓）。
// 消除、合併、裁切這種換了整張的，停手 6 秒後才在背景壓一次整張
// ph：草稿裡的照片是哪張 canvas、對到第幾筆：canvas 的第 v 筆（v ≥ vb）存在草稿的第 ib + (v − vb) 筆；
// 草稿裡整張照片是第 i0 筆，之後存了 n 筆。ptr：最後寫進去的「從第 i0 筆疊到第 pv 筆」
let draft = { id: 0, on: false }, draftT = 0, draftT2 = 0, draftQ = Promise.resolve(), downAt = 0;
const downs = new Set(), srcFile = new WeakMap(), blobOf = new WeakMap();
const TABS_OK = t => t && t !== 'crop' && t !== 'tpl' && GROUPS.some(g => g[3].includes(t));
const PATCH_CAP = 32e6;  // 一筆一筆的加起來超過就重壓一張整張的，草稿不會越存越大
addEventListener('pointerdown', e => { downs.add(e.pointerId); downAt = performance.now(); }, true);
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => downs.delete(e.pointerId), true));
// file：打開的檔案。src：使用者選的原檔（p0：草稿裡的照片就是原檔；不是的話另外存一份，fSaved：存過了）
function newDraft(c, m, file) {
  const p = m?.ptr || { i0: 0, pv: 0 };
  // pc：草稿裡的照片（加上那幾筆）是哪一張 canvas 的樣子
  draft = { id: m?.id || Date.now(), on: !!m, thumb: m?.thumb || '', pend: { c, m: new Map() }, ptr: m ? p : null, pc: m ? c : null, origSaved: !!m?.origBlob,
    src: !m ? file : m.p0 ? file : m.file0 || null, p0: !!m?.p0, fSaved: !!m?.file0,
    ph: m ? { c, i0: p.i0, n: p.pv - p.i0, ib: p.pv, vb: 0, bytes: (m.patches || []).reduce((s, q) => s + q.img.data.length, 0) } : null };
}
// 美顏筆、塗鴉畫了第 k 筆：先記在記憶體，下一次存草稿時寫進去
function draftPatch(c, k, x, y, img) {
  const d = draft, pd = d.pend;
  if (pd.c !== c) { pd.c = c; pd.m.clear(); }
  for (const j of pd.m.keys()) if (j >= k) pd.m.delete(j);
  pd.m.set(k, { x, y, img });
  // 一直沒機會寫進去（整張還沒壓）又一直畫：記憶體裡的放掉，停手時重壓整張
  let sum = 0; for (const q of pd.m.values()) sum += q.img.data.length;
  if (sum > PATCH_CAP) { pd.m.clear(); if (draft.ph?.c === c) draft.ph = null; }
  const ph = d.ph;
  if (ph?.c === c) {
    if (k < ph.vb) d.ph = null;  // 復原到草稿那張整張之前再畫：要重壓整張
    else ph.n = Math.min(ph.n, ph.ib + k - ph.vb - ph.i0);  // 草稿裡這一筆以後是復原前的另一條路，作廢
  }
}
// now：照片整張換掉了（合併、消除、裁切、旋轉）：馬上開始壓整張，趁「合併中…」還在畫面上，不等停手 0.5 秒才頓那一下
function draftSoon(now) {
  if (!draft.on) return;
  clearTimeout(draftT); clearTimeout(draftT2);
  if (now) saveDraft(); else draftT = setTimeout(saveDraft, 500);
  draftT2 = setTimeout(() => saveDraft('idle'), 6000);
}
// 現在這張照片能不能只補寫幾筆就跟草稿對上：回傳 { ph, base, puts }，不行回傳 null（要重壓整張）
function photoPlan(c, ver) {
  const d = draft;
  let ph = d.ph?.c === c && ver >= d.ph.vb ? { ...d.ph } : null, base = null;
  if (!ph && srcFile.has(c)) { ph = { c, i0: 0, n: 0, ib: 0, vb: 0, bytes: 0 }; base = srcFile.get(c); }  // 剛打開的那張就是原檔
  if (!ph) return null;
  const puts = [], top = ph.ib + ver - ph.vb;
  for (let i = ph.i0 + ph.n; i < top; i++) {
    const q = d.pend.c === c && d.pend.m.get(ph.vb + i - ph.ib);
    if (!q) return null;
    puts.push([i, q]); ph.bytes += q.img.data.length;
  }
  if (ph.bytes > PATCH_CAP) return null;
  ph.n = Math.max(ph.n, top - ph.i0);
  return { ph, base, puts, ptr: { i0: ph.i0, pv: top } };
}
// 狀態在呼叫的當下記下來（照片也是當下的樣子），寫入照順序排隊，最新的最後寫。
// mode：沒給 = 停手 0.5 秒（只存參數和這幾筆，照片整張換過才壓整張）；'idle' = 停手 6 秒（更新縮圖）；true = 切走、換照片，馬上全部存
function saveDraft(mode) {
  if (mode !== 'idle') clearTimeout(draftT);
  if (!draft.on || !base?.canvas) return draftQ;
  // 手指還按著（正在畫、正在拖）就晚點再存，不跟正在畫的搶時間
  if (mode !== true && (restoring || (downs.size && performance.now() - downAt < 15000))) {
    if (mode === 'idle') { clearTimeout(draftT2); draftT2 = setTimeout(() => saveDraft('idle'), 2000); } else draftT = setTimeout(saveDraft, 500);
    return draftQ;
  }
  const d = draft, c = base.canvas, ver = base.ver || 0, slow = mode !== undefined;
  let plan = photoPlan(c, ver), photo = null;
  // 整張重壓，從現在這一筆重新開始算。照片整張換掉了（合併、裁切、旋轉、消除…）就不能等停手 6 秒：
  // 只存參數的話，草稿會是新參數配舊照片，這幾秒被收掉，重開時剛合併的濾鏡不見、推臉錯位（評審 2026-10-27）。
  // 同一張照片只是一筆一筆的太多：參數照存（配草稿裡稍舊的照片也對得上），停手 6 秒再壓
  if (!plan && (slow || d.pc !== c)) {
    photo = encode(c, hasAlpha(c) ? 'image/png' : 'image/jpeg');
    plan = { ph: { c, i0: 0, n: 0, ib: 0, vb: ver, bytes: 0 }, base: null, puts: [], ptr: { i0: 0, pv: 0 } };
  }
  if (!plan && !d.ptr) { clearTimeout(draftT2); draftT2 = setTimeout(() => saveDraft('idle'), 6000); return draftQ; }  // 草稿裡還沒有照片：等停手再壓
  if (slow || photo || !d.thumb) d.thumb = draftThumb();
  // 草稿裡的照片是不是原檔；不是的話原檔另外存一次（評審 #144 中 1）
  const p0 = d.p0 = plan?.base ? true : photo ? false : d.p0, file = !p0 && !d.fSaved && d.src;
  const meta = { id: d.id, t: Date.now(), P: clone(P), texts: clone(texts), stickers: clone(stickers), tab, thumb: d.thumb, ptr: plan ? plan.ptr : d.ptr, om: base.om, p0 };
  const assets = draftAssets(meta.stickers, meta.P), orig = !d.origSaved && base.orig;
  if (plan) { d.ph = plan.ph; d.ptr = plan.ptr; d.pc = c; }
  const puts = plan?.puts || [], blob = photo || (plan?.base ? Promise.resolve(plan.base) : null);
  return draftQ = draftQ.then(async () => {
    const b = blob && await blob;
    if (blob && !b) throw new Error('照片壓不起來');
    meta.assets = await assets;
    const ob = orig && await orig.ready;
    await writeDraft(meta, { photo: b, puts, orig: ob, file });
    if (ob && d === draft) d.origSaved = true;
    if (file && d === draft) d.fSaved = true;
    // 寫進去了：記憶體裡那幾筆可以放掉
    for (const [i, q] of puts) { const k = plan.ph.vb + i - plan.ph.ib; if (d.pend.m.get(k) === q) d.pend.m.delete(k); }
    if (photo) for (const k of d.pend.m.keys()) if (k < ver) d.pend.m.delete(k);
  }).catch(e => { console.warn('草稿存不了', e); if (d === draft && plan && d.ph === plan.ph) { d.ph = null; d.ptr = null; d.pc = null; } });
}
function draftThumb() {
  try {
    const g = cmpOn ? base.canvas : $('#gl'), k = 160 / Math.max(g.width, g.height);
    const t = newCanvas(Math.max(1, Math.round(g.width * k)), Math.max(1, Math.round(g.height * k)));
    t.getContext('2d').drawImage(g, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.8);
  } catch { return ''; }
}
// 貼紙用到的圖（自己匯入的圖、擦除遮罩、摳圖圖層）、自己選的背景和雙重曝光照片
const canvasBlob = (c, type) => { let p = blobOf.get(c); if (!p) { p = encode(c, type); blobOf.set(c, p); } return p; };
async function draftAssets(sts, p) {
  const a = {}, jobs = [];
  for (const s of sts) {
    if (s.kind === 'img' && getCanvas(s.v)) a[s.v] = canvasURL(s.v);
    if (s.mask && getCanvas(s.mask)) a[s.mask] = canvasURL(s.mask);
    const L = s.kind === 'cut' && !a[s.v] && layerInfo(s.v);
    if (L) {
      const o = a[s.v] = { cut: L.cut };
      jobs.push(Promise.all([canvasBlob(L.rgb, 'image/jpeg'), canvasBlob(L.alpha, 'image/png')]).then(([rgb, alpha]) => Object.assign(o, { rgb, alpha })));
    }
  }
  if (p.bg === 'img' && p.bgImg === 'own' && bgOwnFile) a.$bg = bgOwnFile;
  if (p.ex === 'own' && exOwnFile) a.$ex = exOwnFile;
  await Promise.all(jobs);
  return a;
}
async function resumeDraft(id) {
  busy('打開上次的照片…');
  try {
    const d = await readDraft(id);
    if (!d) throw new Error('找不到草稿');
    const a = d.meta.assets || {};
    const toCanvas = async src => {
      const bmp = await createImageBitmap(typeof src === 'string' ? await (await fetch(src)).blob() : src);
      const c = newCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.(); return c;
    };
    for (const [k, v] of Object.entries(a)) {
      if (k === '$bg') { bgOwn = await createImageBitmap(v, { imageOrientation: 'from-image' }); bgN++; bgOwnFile = v; }
      else if (k === '$ex') await setExOwn(v);
      else if (typeof v === 'string') restoreCanvas(k, await toCanvas(v));
      else if (v.rgb && v.alpha) restoreLayer(k, { rgb: await toCanvas(v.rgb), alpha: await toCanvas(v.alpha), cut: v.cut });
    }
    busy();
    await loadFile(d.photo.blob, { ...d.meta, patches: d.patches, origBlob: d.orig, file0: d.file });
  } catch (e) { console.error(e); busy(); toast('這份草稿打不開'); }
}
// 首頁的草稿列（修圖中按「換照片」也會回到首頁，現在這張不列）
const when = t => { const d = new Date(t), n = new Date(), p = x => String(x).padStart(2, '0'); return d.toDateString() === n.toDateString() ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`; };
async function showDrafts() {
  const list = (await listDrafts()).filter(m => !base || m.id !== draft.id), box = $('#draftList');
  box.innerHTML = '';
  for (const m of list) {
    const e = document.createElement('div'); e.className = 'dr';
    e.innerHTML = `<button class="dt" aria-label="接著修 ${when(m.t)} 的草稿">${m.thumb ? `<img alt="" src="${m.thumb}">` : ''}</button><small>${when(m.t)}</small><button class="dx" aria-label="刪除這份草稿">×</button>`;
    e.querySelector('.dt').onclick = () => resumeDraft(m.id);
    e.querySelector('.dx').onclick = async () => { if (!confirm('刪除這份草稿？刪了就找不回來。')) return; await deleteDraft(m.id).catch(() => {}); showDrafts(); };
    box.append(e);
  }
  $('#drafts').hidden = !list.length;
}
function showHome(on) {
  const e = $('#empty');
  e.classList.toggle('over', on && !!base);
  e.style.display = on || !base ? '' : 'none';
  if (on) showDrafts();
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(true); });
addEventListener('pagehide', () => saveDraft(true));
if (R) showDrafts();
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
  if (k === 'Escape') { keysPanel(false); if ($('#empty').classList.contains('over')) showHome(false); return; }
  if (k === '?' && !mod) { keysPanel(!$('#keys').classList.contains('on')); e.preventDefault(); return; }
  if (mod && (k === 's' || k === 'S')) { e.preventDefault(); save(); return; }
  if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); saveDraft(true); $('#file').click(); return; }
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
window.__editor = { toSrc: () => srcMapper(), loadFile, get P() { return P; }, get base() { return base; }, get stickers() { return stickers; }, get texts() { return texts; }, redraw: () => { drawTexts(); drawStickers(); }, showTab, save, render };
