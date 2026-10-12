// 主題範本：照 Hypic 首頁熱門主題的方向（80 年代、千禧、底片褪色、藍色時刻、Photo Booth、通緝海報、校園日記…）
// 自己設計的「風格配方」。Hypic 的範本大多是一張照片加上濾鏡、調整、特效、文字（看它快取的範本清單得知），
// 所以這裡每個範本 = 版面 + look（整組調色）+ fx（顆粒、暗角、光效、掃描線、柔光、色差）+ 文字裝飾。
// pop：把照片裡的人摳出來疊在文字上面（人在字前）；out: true 時人可以超出照片框。
// 全部用程式畫，沒有用 Hypic 的範本、素材或濾鏡。

const T = (t, x, y, s, o = {}) => ({ t, x, y, s, f: 'sans', c: '#111111', ...o });
const D = (k, o) => ({ k, ...o });
const FULL = [{ r: [0, 0, 1, 1] }];
const PF = { kind: 'polaroid', pad: [0.06, 0.06, 0.06, 0.24], shadow: true };
const W = '#ffffff';

// 常用調色
const LK = {
  film80: { filter: 'retro', filterAmt: 70, contrast: 8, saturation: 10, temp: 18, fade: 25 },
  y2k: { filter: 'coolwhite', filterAmt: 50, exposure: 10, contrast: 12, saturation: 15, tint: 10 },
  faded: { filter: 'film', filterAmt: 70, contrast: -12, fade: 45, saturation: -15, temp: 6 },
  blue: { filter: 'coolwhite', filterAmt: 60, temp: -35, tint: 8, shadows: 15, contrast: 6 },
  sunset: { filter: 'sunny', filterAmt: 75, temp: 35, saturation: 15, highlights: -15 },
  gold: { filter: 'sunny', filterAmt: 60, temp: 25, exposure: 6, highlights: -10, shadows: 10 },
  dark: { filter: 'mono', filterAmt: 60, exposure: -12, contrast: 30, saturation: -40, shadows: -15 },
  bw: { filter: 'bw', filterAmt: 100, contrast: 25 },
  soft: { filter: 'cream', filterAmt: 65, exposure: 6, contrast: -12, highlights: -10 },
  pink: { filter: 'pink', filterAmt: 70, exposure: 8, contrast: -6 },
  green: { filter: 'forest', filterAmt: 70, saturation: 10, shadows: 10 },
  food: { filter: 'sunny', filterAmt: 55, saturation: 22, temp: 10, contrast: 10, shadows: 10 },
  hk: { filter: 'hk', filterAmt: 80, contrast: 12, temp: 8 },
  teal: { filter: 'teal', filterAmt: 80, contrast: 14 },
  ccd: { filter: 'coolwhite', filterAmt: 40, exposure: 12, contrast: 18, saturation: 8, highlights: 10 },
  clear: { filter: 'clear', filterAmt: 60, contrast: 8, saturation: 8, shadows: 12 },
  sepia: { filter: 'retro', filterAmt: 90, saturation: -55, temp: 30, contrast: 10, fade: 20 },
  anime: { filter: 'clear', filterAmt: 70, saturation: 35, contrast: 15, exposure: 8, shadows: 20, temp: -8 },
};
const GRAIN = a => ({ k: 'grain', a }), VIG = a => ({ k: 'vignette', a }), LIGHT = (id, a) => ({ k: 'light', id, a });
const SCAN = a => ({ k: 'scan', a }), GLOW = a => ({ k: 'glow', a }), CHROMA = a => ({ k: 'chroma', a });

export const THEMES = [
  // ---------- 80 年代 ----------
  { id: 'th80vhs', name: 'VHS 錄影帶', cat: ['80年代', '復古', '熱門'], ratio: 3 / 4, bg: '#000', slots: FULL, look: LK.film80,
    fx: [CHROMA(0.6), SCAN(0.5), GRAIN(0.6), VIG(0.5)],
    texts: [T('▶ PLAY', 0.07, 0.06, 0.05, { f: 'mono', c: W, a: 'left', w: 700, sh: true }), T('SP', 0.93, 0.06, 0.05, { f: 'mono', c: W, a: 'right', w: 700, sh: true }),
      T('', 0.07, 0.93, 0.045, { f: 'mono', c: W, a: 'left', date: 'dot', sh: true }), T('AM 10:24', 0.93, 0.93, 0.045, { f: 'mono', c: W, a: 'right', sh: true })] },
  { id: 'th80neon', name: '霓虹 80s', cat: ['80年代', '創意'], ratio: 4 / 5, bg: { type: 'grad', c: ['#2b0a3d', '#0b1d4a'], a: 160 },
    slots: [{ r: [0.1, 0.16, 0.8, 0.62], rad: 0.03, frame: { kind: 'border', w: 0.012, c: '#ff4fd8', shadow: true } }], look: LK.film80,
    deco: [D('line', { x1: 0.1, y1: 0.85, x2: 0.9, y2: 0.85, c: '#29f0ff', lw: 0.004 })], fx: [GLOW(0.6), GRAIN(0.3)],
    texts: [T('RETRO NIGHT', 0.5, 0.09, 0.1, { f: 'impact', c: '#ff4fd8', ls: 0.05 }), T('since 1986', 0.5, 0.91, 0.05, { f: 'hand', c: '#29f0ff' })] },
  { id: 'th80disco', name: '迪斯可', cat: ['80年代', '創意'], ratio: 1, bg: '#ffcc00', slots: [{ r: [0.08, 0.08, 0.84, 0.7], rad: 0.04 }], look: LK.film80,
    deco: [D('star', { x: 0.12, y: 0.86, s: 0.04, c: '#ff3d7f' }), D('star', { x: 0.88, y: 0.9, s: 0.05, c: '#ff3d7f' })], fx: [GRAIN(0.3)],
    texts: [T('DISCO FEVER', 0.5, 0.88, 0.1, { f: 'impact', c: '#ff3d7f', ls: 0.04 })] },

  // ---------- 千禧 ----------
  { id: 'thy2kccd', name: 'CCD 千禧', cat: ['千禧', '自拍', '熱門'], ratio: 3 / 4, bg: '#000', slots: FULL, look: LK.ccd,
    fx: [GLOW(0.4), GRAIN(0.45)],
    texts: [T('', 0.93, 0.93, 0.055, { f: 'mono', c: '#ff9b3d', a: 'right', date: 'film', w: 700 })] },
  { id: 'thy2kchrome', name: '金屬千禧', cat: ['千禧', '創意'], ratio: 4 / 5, bg: { type: 'chrome' }, slots: [{ r: [0.12, 0.2, 0.76, 0.6], rad: 0.5 }], look: LK.y2k,
    deco: [D('star', { x: 0.15, y: 0.18, s: 0.05, c: W }), D('star', { x: 0.86, y: 0.82, s: 0.06, c: W }), D('star', { x: 0.82, y: 0.2, s: 0.03, c: W })], fx: [GLOW(0.4)],
    texts: [T('Y2K', 0.5, 0.1, 0.16, { f: 'round', c: W, w: 800, st: '#7b5cff' }), T('millennium girl', 0.5, 0.9, 0.05, { f: 'hand', c: '#3b2a7a' })] },
  { id: 'thy2kpixel', name: '像素對話框', cat: ['千禧', '數位'], ratio: 3 / 4, bg: '#c7d2fe', slots: [{ r: [0.08, 0.14, 0.84, 0.66], frame: { kind: 'border', w: 0.01, c: '#1f2a6b' } }], look: LK.y2k,
    deco: [D('poly', { pts: [[0.08, 0.06], [0.92, 0.06], [0.92, 0.12], [0.08, 0.12]], c: '#1f2a6b' })],
    texts: [T('MY_PHOTO.JPG', 0.11, 0.09, 0.035, { f: 'mono', c: W, a: 'left', w: 700 }), T('×', 0.89, 0.09, 0.045, { f: 'mono', c: W, a: 'right', w: 700 }),
      T('loading cuteness... 100%', 0.5, 0.88, 0.04, { f: 'mono', c: '#1f2a6b', w: 700 })] },

  // ---------- 底片、復古 ----------
  { id: 'thfaded', name: '底片褪色', cat: ['底片', '復古', '熱門'], ratio: 2 / 3, bg: '#f2ede2', slots: [{ r: [0.06, 0.05, 0.88, 0.8] }], look: LK.faded,
    fx: [GRAIN(0.5), LIGHT('leakWarm', 0.35)],
    texts: [T('', 0.94, 0.92, 0.04, { f: 'mono', c: '#c0392b', a: 'right', date: 'film', w: 700 }), T('Kodak moment', 0.06, 0.92, 0.04, { f: 'hand', c: '#555', a: 'left' })] },
  { id: 'thsepia', name: '老照片', cat: ['復古'], ratio: 4 / 5, bg: { type: 'paper', c: '#e9dcc0' }, slots: [{ r: [0.1, 0.08, 0.8, 0.72], frame: { kind: 'border', w: 0.02, c: '#f6efdf', shadow: true } }], look: LK.sepia,
    fx: [GRAIN(0.6), VIG(0.4)], texts: [T('一九八八年 · 夏', 0.5, 0.9, 0.05, { f: 'kai', c: '#5a4630' })] },
  { id: 'thhkmovie', name: '港片截圖', cat: ['復古', '桌布'], ratio: 9 / 16, bg: '#000', slots: [{ r: [0, 0.12, 1, 0.76] }], look: LK.hk,
    fx: [GRAIN(0.4)], texts: [T('如果記憶是一個罐頭', 0.5, 0.8, 0.05, { f: 'kai', c: '#ffe066' }), T('I hope it never expires.', 0.5, 0.84, 0.032, { c: '#ffe066' })] },
  { id: 'thcinema', name: '電影寬螢幕', cat: ['復古', '戶外'], ratio: 4 / 5, bg: '#000', slots: [{ r: [0, 0.14, 1, 0.72] }], look: LK.teal,
    fx: [GRAIN(0.3), VIG(0.4)], texts: [T('— 那年夏天，我們都還年輕 —', 0.5, 0.92, 0.035, { c: '#f1f1f1' })] },

  // ---------- 藍色時刻、夕陽、金色光暈 ----------
  { id: 'thblue', name: '藍色時刻', cat: ['戶外', '桌布', '熱門'], ratio: 9 / 16, bg: '#000', slots: FULL, look: LK.blue,
    fx: [GLOW(0.3), GRAIN(0.25)], texts: [T('blue hour', 0.5, 0.86, 0.09, { f: 'hand', c: W, sh: true }), T('19:42', 0.5, 0.91, 0.035, { f: 'mono', c: '#dbe7ff' })] },
  { id: 'thsunset', name: '夕陽餘暉', cat: ['戶外', '夏天'], ratio: 3 / 4, bg: '#000', slots: FULL, look: LK.sunset,
    fx: [LIGHT('flare', 0.5), GRAIN(0.25)], texts: [T('golden hour', 0.08, 0.9, 0.07, { f: 'display', c: W, a: 'left', it: true, sh: true })] },
  { id: 'thgold', name: '金色光暈', cat: ['自拍', '戶外'], ratio: 4 / 5, bg: '#000', slots: FULL, look: LK.gold,
    fx: [LIGHT('bokeh', 0.45), GLOW(0.5)], texts: [] },
  { id: 'thsparkle', name: '閃閃發光', cat: ['自拍', '創意'], ratio: 3 / 4, bg: '#000', slots: FULL, look: LK.soft,
    fx: [LIGHT('sparkle', 0.7), GLOW(0.4)], texts: [T('✦ shine ✦', 0.5, 0.92, 0.055, { f: 'hand', c: W, sh: true })] },
  { id: 'thgem', name: '寶石光暈', cat: ['自拍'], ratio: 4 / 5, bg: { type: 'grad', c: ['#ffd1e0', '#c6e6ff'], a: 135 }, slots: [{ r: [0.08, 0.08, 0.84, 0.84], rad: 0.06 }], look: LK.pink,
    fx: [LIGHT('rainbow', 0.4), GLOW(0.5)], texts: [] },
  { id: 'thmagic', name: '魔法之光', cat: ['創意', '自拍'], ratio: 9 / 16, bg: '#000', slots: FULL, look: { ...LK.blue, filterAmt: 40, temp: -15 },
    fx: [LIGHT('sparkle', 0.6), LIGHT('leakPink', 0.3), GLOW(0.5)], texts: [T('make a wish', 0.5, 0.88, 0.07, { f: 'hand', c: W, sh: true })] },

  // ---------- 雜誌、人在字前 ----------
  { id: 'thvogue', name: '時尚封面', cat: ['雜誌', '海報', '熱門'], ratio: 3 / 4, bg: '#222', slots: FULL, look: LK.clear, pop: { slot: 0 },
    texts: [T('BLOOM', 0.5, 0.13, 0.24, { f: 'display', c: W, w: 700, ls: 0.04 }), T('SPRING ISSUE', 0.5, 0.235, 0.032, { f: 'mono', c: W, ls: 0.3, front: true, sh: true }),
      T('做自己的\n主角', 0.07, 0.8, 0.065, { c: W, a: 'left', w: 800, sh: true, front: true }), T('', 0.93, 0.95, 0.03, { f: 'mono', c: W, a: 'right', date: 'dot', sh: true, front: true })] },
  { id: 'thbehind', name: '人在字前', cat: ['創意', '海報'], ratio: 4 / 5, bg: '#f4f1ea', slots: FULL, look: LK.soft, pop: { slot: 0 },
    texts: [T('HELLO', 0.5, 0.17, 0.3, { f: 'impact', c: '#ff5c8a', w: 800 }), T('it’s me', 0.5, 0.93, 0.06, { f: 'hand', c: W, sh: true, front: true })] },
  { id: 'thbigname', name: '大字標題', cat: ['今日穿搭', '海報'], ratio: 9 / 16, bg: '#111', slots: FULL, look: LK.hk, pop: { slot: 0 },
    texts: [T('OOTD', 0.5, 0.2, 0.4, { f: 'display', c: '#ffd166', w: 700 }), T('today’s look', 0.5, 0.92, 0.05, { f: 'hand', c: W, sh: true, front: true })] },
  { id: 'thpopframe', name: '出框拍立得', cat: ['拍立得', '創意'], ratio: 4 / 5, bg: { type: 'grid', c: '#f7f5ef', line: '#e3ddd0' },
    slots: [{ r: [0.13, 0.4, 0.74, 0.38], frame: PF }], look: LK.soft, pop: { slot: 0, out: true },
    texts: [T('out of frame', 0, 0.62, 0.06, { slot: 0, f: 'hand', c: '#555', front: true })] },

  // ---------- IG、故事 ----------
  { id: 'thig3', name: 'IG 三格', cat: ['IG'], ratio: 9 / 16, bg: '#ffffff',
    slots: [0.02, 0.345, 0.67].map(y => ({ r: [0.03, y, 0.94, 0.31] })), look: LK.clear, texts: [] },
  { id: 'thstory', name: '限動日記', cat: ['IG', '自拍'], ratio: 9 / 16, bg: '#fdf6ec', slots: [{ r: [0.08, 0.14, 0.84, 0.62], rad: 0.04 }], look: LK.soft,
    deco: [D('tape', { x: 0.5, y: 0.14, w: 0.22, rot: -3, c: 'rgba(255,196,206,.85)' }), D('squiggle', { x: 0.3, y: 0.86, w: 0.4, c: '#ffb3c6' })],
    texts: [T('today’s mood', 0.5, 0.07, 0.07, { f: 'hand', c: '#d6336c' }), T('喝了一杯很好喝的拿鐵 ☕', 0.5, 0.82, 0.04, { c: '#6b4f4f' })] },
  { id: 'thpost', name: '貼文截圖', cat: ['IG', '創意'], ratio: 4 / 5, bg: W, slots: [{ r: [0, 0.1, 1, 0.74] }], look: LK.clear,
    deco: [D('avatar', { x: 0.07, y: 0.05, r: 0.035 }), D('icon', { k2: 'heart', x: 0.06, y: 0.9, s: 0.06 }), D('icon', { k2: 'comment', x: 0.15, y: 0.9, s: 0.06 }), D('icon', { k2: 'send', x: 0.24, y: 0.9, s: 0.06 }), D('icon', { k2: 'save', x: 0.94, y: 0.9, s: 0.06 })],
    texts: [T('your.name', 0.13, 0.05, 0.04, { a: 'left', w: 700 }), T('1,024 個讚', 0.04, 0.96, 0.035, { a: 'left', w: 700 })] },

  // ---------- Photo Booth、派對 ----------
  { id: 'thbooth', name: 'Photo Booth', cat: ['拍貼機', '熱門'], ratio: 1 / 3, bg: '#ff5c8a',
    slots: [0.03, 0.235, 0.44, 0.645].map(y => ({ r: [0.08, y, 0.84, 0.19] })), look: LK.bw,
    texts: [T('PHOTO BOOTH', 0.5, 0.88, 0.1, { f: 'impact', c: W }), T('', 0.5, 0.94, 0.06, { f: 'mono', c: W, date: 'dot' })] },
  { id: 'thparty', name: '派對相簿', cat: ['生日', '創意'], ratio: 1, bg: { type: 'confetti', c: '#1d1b3a' },
    slots: [{ r: [0.06, 0.06, 0.42, 0.42], rot: -4, frame: { kind: 'border', w: 0.015, c: W, shadow: true } }, { r: [0.52, 0.1, 0.42, 0.42], rot: 5, frame: { kind: 'border', w: 0.015, c: W, shadow: true } },
      { r: [0.1, 0.52, 0.42, 0.42], rot: 3, frame: { kind: 'border', w: 0.015, c: W, shadow: true } }, { r: [0.54, 0.54, 0.4, 0.4], rot: -6, frame: { kind: 'border', w: 0.015, c: W, shadow: true } }],
    look: LK.ccd, fx: [GLOW(0.3)], texts: [T('PARTY!', 0.5, 0.5, 0.12, { f: 'impact', c: '#ffd166', rot: -8, st: '#1d1b3a' })] },

  // ---------- 通緝、報紙 ----------
  { id: 'thwanted', name: '通緝海報', cat: ['海報', '創意', '熱門'], ratio: 3 / 4, bg: { type: 'paper', c: '#e3cfa4' },
    slots: [{ r: [0.15, 0.22, 0.7, 0.5], frame: { kind: 'border', w: 0.008, c: '#3b2a1a' } }], look: LK.sepia, fx: [GRAIN(0.5), VIG(0.5)],
    texts: [T('WANTED', 0.5, 0.11, 0.2, { f: 'serif', c: '#3b2a1a', w: 800, ls: 0.04 }), T('DEAD OR ALIVE', 0.5, 0.78, 0.05, { f: 'serif', c: '#3b2a1a', w: 700, ls: 0.15 }),
      T('偷走了大家的心', 0.5, 0.85, 0.05, { f: 'kai', c: '#3b2a1a', w: 700 }), T('$ 1,000,000', 0.5, 0.92, 0.08, { f: 'serif', c: '#7a1f1f', w: 800 })] },
  { id: 'thnews', name: '號外號外', cat: ['海報', '雜誌'], ratio: 3 / 4, bg: '#f3efe4', slots: [{ r: [0.06, 0.22, 0.88, 0.5] }], look: LK.bw, fx: [GRAIN(0.4)],
    deco: [D('line', { x1: 0.06, y1: 0.17, x2: 0.94, y2: 0.17, c: '#111', lw: 0.004 }), D('textlines', { x: 0.06, y: 0.8, w: 0.88, h: 0.14 })],
    texts: [T('THE DAILY NEWS', 0.5, 0.08, 0.1, { f: 'serif', c: '#111', w: 800 }), T('', 0.5, 0.145, 0.025, { f: 'serif', c: '#333', date: 'news' }),
      T('本日最佳笑容出現了！', 0.06, 0.76, 0.05, { f: 'serif', c: '#111', a: 'left', w: 800 })] },

  // ---------- 暗黑 ----------
  { id: 'thdark', name: '暗黑美學', cat: ['暗黑', '桌布'], ratio: 9 / 16, bg: '#000', slots: FULL, look: LK.dark,
    fx: [VIG(0.8), GRAIN(0.5)], texts: [T('NO LIGHT', 0.5, 0.9, 0.06, { f: 'mono', c: '#bbb', ls: 0.4 })] },
  { id: 'thnoir', name: '黑色電影', cat: ['暗黑', '復古'], ratio: 4 / 5, bg: '#000', slots: [{ r: [0, 0, 1, 0.86] }], look: LK.bw,
    deco: [D('fade', { y1: 0.6, y2: 0.86, c: '#000' })], fx: [VIG(0.6), GRAIN(0.6)], texts: [T('N O I R', 0.5, 0.92, 0.07, { f: 'serif', c: '#eee', ls: 0.2 })] },
  { id: 'thredeye', name: '紅色警戒', cat: ['暗黑', '創意'], ratio: 3 / 4, bg: '#000', slots: FULL, look: { ...LK.dark, saturation: -100 },
    fx: [{ k: 'tint', c: '#ff1f3d', mode: 'multiply', a: 0.55 }, CHROMA(0.4), GRAIN(0.4)], texts: [T('DON’T LOOK BACK', 0.5, 0.92, 0.055, { f: 'impact', c: '#ff1f3d', ls: 0.06 })] },

  // ---------- 動漫 ----------
  { id: 'thanime', name: '動漫天空', cat: ['動漫', '夏天', '熱門'], ratio: 9 / 16, bg: '#000', slots: FULL, look: LK.anime,
    fx: [GLOW(0.5), LIGHT('flare', 0.3)], texts: [T('夏の終わり', 0.5, 0.86, 0.07, { f: 'serif', c: W, sh: true })] },
  { id: 'thmanga', name: '漫畫分鏡', cat: ['動漫', '創意'], ratio: 2 / 3, bg: W,
    slots: [{ r: [0.04, 0.03, 0.92, 0.42], frame: { kind: 'border', w: 0.008, c: '#111' } }, { r: [0.04, 0.48, 0.44, 0.49], frame: { kind: 'border', w: 0.008, c: '#111' } }, { r: [0.52, 0.48, 0.44, 0.49], frame: { kind: 'border', w: 0.008, c: '#111' } }],
    look: { ...LK.bw, contrast: 45 }, texts: [T('ドキッ！', 0.8, 0.08, 0.07, { f: 'impact', c: '#111', rot: 8, bgc: W }), T('？！', 0.3, 0.55, 0.08, { f: 'impact', c: '#111', bgc: W })] },

  // ---------- 夏天、戶外 ----------
  { id: 'thsummer', name: '夏日汽水', cat: ['夏天', '自拍'], ratio: 3 / 4, bg: '#bde9ff', slots: [{ r: [0.07, 0.07, 0.86, 0.72], rad: 0.05 }], look: LK.clear,
    deco: [D('wave', { y: 0.87, c: '#5ac8fa' })], fx: [LIGHT('flare', 0.3)], texts: [T('SUMMER', 0.5, 0.86, 0.11, { f: 'round', c: W, w: 800, st: '#2a9df4' })] },
  { id: 'thbeach', name: '海邊明信片', cat: ['夏天', '旅行', '戶外'], ratio: 4 / 3, bg: '#fdf8ee', slots: [{ r: [0.04, 0.06, 0.55, 0.88] }], look: LK.sunset,
    deco: [D('stamp', { x: 0.8, y: 0.08, w: 0.14, h: 0.2 }), D('postmark', { x: 0.73, y: 0.24, r: 0.06 }), D('line', { x1: 0.63, y1: 0.5, x2: 0.96, y2: 0.5, c: '#bbb', lw: 0.002 }), D('line', { x1: 0.63, y1: 0.62, x2: 0.96, y2: 0.62, c: '#bbb', lw: 0.002 })],
    texts: [T('Greetings from\nthe sea', 0.8, 0.4, 0.04, { f: 'hand', c: '#2a6f97' })] },
  { id: 'thcamp', name: '露營日', cat: ['戶外', '旅行'], ratio: 4 / 5, bg: '#2f3e2e', slots: [{ r: [0.06, 0.06, 0.88, 0.72], rad: 0.03 }], look: LK.green, fx: [GRAIN(0.3)],
    texts: [T('into the wild', 0.08, 0.86, 0.065, { f: 'hand', c: '#f1e9d2', a: 'left' }), T('', 0.92, 0.86, 0.035, { f: 'mono', c: '#c9d6b8', a: 'right', date: 'dot' })] },

  // ---------- 食物 ----------
  { id: 'thfood', name: '美食快拍', cat: ['食物', '熱門'], ratio: 4 / 5, bg: '#fff7ec', slots: [{ r: [0.06, 0.06, 0.88, 0.7], rad: 0.04 }], look: LK.food,
    texts: [T('今天吃這個', 0.06, 0.84, 0.07, { a: 'left', w: 800, c: '#c0582b' }), T('★★★★★ 必點', 0.06, 0.91, 0.04, { a: 'left', c: '#e09f3e' })] },
  { id: 'thmenu', name: '咖啡菜單', cat: ['食物', '簡約'], ratio: 3 / 4, bg: { type: 'kraft' }, slots: [{ r: [0.12, 0.1, 0.76, 0.56], frame: { kind: 'border', w: 0.015, c: W, shadow: true } }], look: LK.food,
    texts: [T('CAFÉ', 0.5, 0.74, 0.1, { f: 'display', c: '#3b2a1a', w: 700 }), T('latte · 120\ncroissant · 85', 0.5, 0.85, 0.04, { f: 'mono', c: '#3b2a1a' })] },

  // ---------- 寵物 ----------
  { id: 'thpet', name: '毛孩證件照', cat: ['寵物', '創意'], ratio: 4 / 3, bg: '#e8f1ff', slots: [{ r: [0.05, 0.12, 0.36, 0.72], rad: 0.03 }], look: LK.clear,
    deco: [D('poly', { pts: [[0, 0], [1, 0], [1, 0.08], [0, 0.08]], c: '#2a6fdb' })],
    texts: [T('PET ID CARD', 0.5, 0.04, 0.035, { f: 'mono', c: W, w: 700, ls: 0.2 }), T('姓名：', 0.46, 0.24, 0.04, { a: 'left', w: 700 }), T('職業：家裡的老大', 0.46, 0.38, 0.04, { a: 'left', w: 700 }),
      T('專長：睡覺、討零食', 0.46, 0.52, 0.04, { a: 'left', w: 700 }), T('', 0.46, 0.66, 0.035, { f: 'mono', c: '#555', a: 'left', date: 'dot' })] },
  { id: 'thpetlove', name: '我家寶貝', cat: ['寵物'], ratio: 1, bg: '#ffe8d6', slots: [{ r: [0.12, 0.1, 0.76, 0.7], rad: 0.5 }], look: LK.soft,
    deco: [D('heart', { x: 0.14, y: 0.14, s: 0.06, c: '#ff8fa3' }), D('heart', { x: 0.86, y: 0.76, s: 0.05, c: '#ff8fa3' })],
    texts: [T('my baby', 0.5, 0.89, 0.08, { f: 'hand', c: '#c9184a' })] },

  // ---------- 校園、畢業 ----------
  { id: 'thschool', name: '校園日記', cat: ['校園', '今日穿搭'], ratio: 3 / 4, bg: { type: 'grid', c: '#fbfaf5', line: '#cfe0f5' },
    slots: [{ r: [0.08, 0.12, 0.84, 0.58], rot: -2, frame: { kind: 'border', w: 0.012, c: W, shadow: true } }], look: LK.clear,
    deco: [D('tape', { x: 0.2, y: 0.12, w: 0.16, rot: -20, c: 'rgba(180,220,255,.85)' }), D('tape', { x: 0.82, y: 0.12, w: 0.16, rot: 18, c: 'rgba(255,230,150,.85)' })],
    texts: [T('school diary', 0.5, 0.06, 0.06, { f: 'hand', c: '#2a6fdb' }), T('第三節下課 · 天氣晴', 0.5, 0.8, 0.045, { f: 'hand', c: '#555' }), T('', 0.5, 0.87, 0.03, { f: 'mono', c: '#888', date: 'dot' })] },
  { id: 'thgrad', name: '畢業快樂', cat: ['畢業', '節日'], ratio: 4 / 5, bg: '#14213d', slots: [{ r: [0.1, 0.18, 0.8, 0.6], frame: { kind: 'border', w: 0.012, c: '#fca311', shadow: true } }], look: LK.clear,
    deco: [D('star', { x: 0.12, y: 0.86, s: 0.04, c: '#fca311' }), D('star', { x: 0.88, y: 0.1, s: 0.05, c: '#fca311' })], fx: [LIGHT('sparkle', 0.4)],
    texts: [T('CLASS OF 2026', 0.5, 0.09, 0.08, { f: 'display', c: '#fca311', w: 700, ls: 0.06 }), T('畢業快樂！', 0.5, 0.86, 0.07, { c: W, w: 800 })] },
  { id: 'thgradid', name: '畢業證件照', cat: ['畢業', '簡約'], ratio: 3 / 4, bg: '#dfe7ef', slots: [{ r: [0.22, 0.12, 0.56, 0.6], frame: { kind: 'border', w: 0.012, c: W } }], look: LK.clear,
    texts: [T('畢 業 紀 念', 0.5, 0.8, 0.06, { f: 'serif', c: '#1d3557', w: 700, ls: 0.1 }), T('', 0.5, 0.87, 0.035, { f: 'mono', c: '#457b9d', date: 'dot' })] },

  // ---------- 愛情 ----------
  { id: 'thlove', name: '心動瞬間', cat: ['情侶', '熱門'], ratio: 3 / 4, bg: '#000', slots: FULL, look: LK.pink,
    fx: [LIGHT('hearts', 0.5), GLOW(0.4)], texts: [T('you are my favorite', 0.5, 0.9, 0.055, { f: 'hand', c: W, sh: true })] },
  { id: 'thlovenote', name: '情書', cat: ['情侶', '簡約'], ratio: 4 / 5, bg: '#fff0f3', slots: [{ r: [0.1, 0.08, 0.8, 0.6], rad: 0.02, frame: { kind: 'border', w: 0.015, c: W, shadow: true } }], look: LK.soft,
    deco: [D('heart', { x: 0.5, y: 0.7, s: 0.06, c: '#ff4d6d' })],
    texts: [T('Dear you,', 0.12, 0.79, 0.05, { f: 'hand', c: '#c9184a', a: 'left' }), T('謝謝你出現在我的生活裡。', 0.12, 0.86, 0.04, { f: 'hand', c: '#6b4f4f', a: 'left' })] },

  // ---------- 數位、桌布 ----------
  { id: 'thdigicam', name: '數位相機', cat: ['數位', '千禧'], ratio: 4 / 3, bg: '#000', slots: FULL, look: LK.ccd, fx: [GRAIN(0.4)],
    deco: [D('line', { x1: 0.46, y1: 0.5, x2: 0.54, y2: 0.5, c: 'rgba(255,255,255,.8)', lw: 0.003 }), D('line', { x1: 0.5, y1: 0.44, x2: 0.5, y2: 0.56, c: 'rgba(255,255,255,.8)', lw: 0.003 })],
    texts: [T('● REC', 0.05, 0.07, 0.04, { f: 'mono', c: '#ff3b30', a: 'left', w: 700 }), T('▮▮▮▯', 0.95, 0.07, 0.04, { f: 'mono', c: W, a: 'right' }),
      T('ISO 400  F2.8  1/60', 0.05, 0.93, 0.035, { f: 'mono', c: W, a: 'left' }), T('', 0.95, 0.93, 0.035, { f: 'mono', c: W, a: 'right', date: 'dot' })] },
  { id: 'thglitch', name: '訊號干擾', cat: ['數位', '暗黑'], ratio: 9 / 16, bg: '#000', slots: FULL, look: LK.teal,
    fx: [CHROMA(0.9), SCAN(0.4), GRAIN(0.3)], texts: [T('ERROR 404: SLEEP NOT FOUND', 0.5, 0.92, 0.035, { f: 'mono', c: '#29f0ff' })] },
  { id: 'thwall', name: '簡約桌布', cat: ['桌布', '簡約'], ratio: 9 / 16, bg: '#000', slots: FULL, look: LK.soft, fx: [GLOW(0.3)],
    texts: [T('10:24', 0.5, 0.16, 0.2, { f: 'sans', c: W, w: 300, sh: true }), T('星期六 · 慢慢來', 0.5, 0.23, 0.04, { c: W, sh: true })] },
];
