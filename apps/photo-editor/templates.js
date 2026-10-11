// 範本：全部自己設計、用程式畫，沒有用醒圖的範本素材。
// 醒圖的範本是多圖層專案（照片格、濾鏡、遮罩、摳圖、彎曲文字，見研究筆記）；這裡用同樣的分層：
//   背景 bg → 墊底裝飾（under） → 照片格 slots → 裝飾 deco → 文字 texts
// 座標：x、y 是畫布寬、高的比例；大小（s、w、字級）一律是畫布寬的比例，換解析度不會跑版。
// 照片格 slot：r=[x,y,w,h]、rot 角度、rad 圓角（短邊的比例，0.5 是圓形）、frame 外框、p 指定第幾張照片（預設依序）。
// 文字 text：可以點兩下改字；slot 有給時座標是那一格的局部座標（中心是 0，-0.5~0.5），會跟著那格一起轉。

export const FONTS = {
  sans: '-apple-system,"PingFang TC","Noto Sans TC",sans-serif',
  serif: '"Songti TC","Noto Serif TC",serif',
  display: 'Didot,"Bodoni 72","Bodoni MT","Playfair Display",Georgia,serif',
  hand: '"Bradley Hand","Segoe Print","Comic Sans MS",cursive',
  mono: 'ui-monospace,Menlo,Consolas,monospace',
  impact: 'Impact,Haettenschweiler,"Arial Black",sans-serif',
  round: '"Arial Rounded MT Bold","PingFang TC","Noto Sans TC",sans-serif',
  kai: '"Kaiti TC",BiauKai,"DFKai-SB",serif',
};
export const FONT_LIST = [['sans', '黑體'], ['serif', '明體'], ['display', '雜誌'], ['hand', '手寫'], ['round', '圓體'], ['impact', '粗體'], ['mono', '打字機'], ['kai', '楷書']];

export const CATS = ['熱門', '經典', '創意', 'IG', '今日穿搭', '拍貼機', '拍立得', '海報', '雜誌', '底片', '復古', '旅行', '情侶', '生日', '簡約', '節日'];

// 文字的簡寫：T('字', x, y, 字級, {其他})
const T = (t, x, y, s, o = {}) => ({ t, x, y, s, f: 'sans', c: '#111111', ...o });
const D = (k, o) => ({ k, ...o });
const PF = { kind: 'polaroid', pad: [0.06, 0.06, 0.06, 0.24], shadow: true };
const WB = w => ({ kind: 'border', w, c: '#ffffff', shadow: true });
const TAPE = (x, y, rot, c = 'rgba(255,196,206,.8)', w = 0.16) => D('tape', { x, y, w, rot, c });

export const TEMPLATES = [
  // ---------- 拍貼機 ----------
  { id: 'booth4', name: '四格拍貼', cat: ['拍貼機', '熱門'], ratio: 1 / 3, bg: '#ffffff',
    slots: [0.025, 0.225, 0.425, 0.625].map(y => ({ r: [0.07, y, 0.86, 0.19] })),
    texts: [T('SAY CHEESE', 0.5, 0.87, 0.11, { f: 'hand', c: '#222' }), T('', 0.5, 0.935, 0.05, { f: 'mono', c: '#888', date: 'dot' })] },
  { id: 'fourcut', name: '人生四格', cat: ['拍貼機', '熱門'], ratio: 2 / 3, bg: '#111111',
    slots: [0.04, 0.54].flatMap(x => [0.03, 0.215, 0.4, 0.585].map((y, i) => ({ r: [x, y, 0.42, 0.17], p: i }))),
    deco: [D('line', { x1: 0.5, y1: 0, x2: 0.5, y2: 1, c: 'rgba(255,255,255,.35)', lw: 0.004, dash: [0.012, 0.012] })],
    texts: [T('life4cuts', 0.25, 0.83, 0.075, { f: 'hand', c: '#fff' }), T('life4cuts', 0.75, 0.83, 0.075, { f: 'hand', c: '#fff' }),
      T('', 0.25, 0.9, 0.032, { f: 'mono', c: '#bbb', date: 'dot' }), T('', 0.75, 0.9, 0.032, { f: 'mono', c: '#bbb', date: 'dot' })] },
  { id: 'boothpink', name: '粉色拍貼', cat: ['拍貼機', '創意'], ratio: 3 / 4, bg: { type: 'dots', c: '#ffd6e5', dot: '#ffffff' },
    slots: [[0.06, 0.06], [0.52, 0.06], [0.06, 0.4], [0.52, 0.4]].map(([x, y]) => ({ r: [x, y, 0.42, 0.32], rad: 0.06 })),
    deco: [D('heart', { x: 0.12, y: 0.8, s: 0.06, c: '#ff8fb1' }), D('heart', { x: 0.88, y: 0.84, s: 0.05, c: '#ff5c8a' }), D('star', { x: 0.2, y: 0.92, s: 0.035, c: '#fff' }), D('star', { x: 0.82, y: 0.76, s: 0.03, c: '#fff' })],
    texts: [T('LOVE MOMENT', 0.5, 0.82, 0.085, { f: 'round', c: '#ff5c8a' }), T('', 0.5, 0.9, 0.035, { f: 'mono', c: '#c45a7d', date: 'dot' })] },
  { id: 'boothblack', name: '黑色三格', cat: ['拍貼機', '底片'], ratio: 1 / 2.4, bg: '#141414',
    slots: [0.04, 0.31, 0.58].map(y => ({ r: [0.08, y, 0.84, 0.25] })),
    texts: [T('FILM BOOTH', 0.5, 0.89, 0.1, { f: 'mono', c: '#f2f2f2', w: 700 }), T('', 0.5, 0.945, 0.055, { f: 'mono', c: '#ff9b3d', date: 'film' })] },

  // ---------- 拍立得 ----------
  { id: 'polaroid1', name: '拍立得', cat: ['拍立得', '熱門'], ratio: 4 / 5, bg: { type: 'grid', c: '#f7f5ef', line: '#e3ddd0' },
    slots: [{ r: [0.18, 0.12, 0.64, 0.6], rot: -4, frame: PF }],
    deco: [TAPE(0.5, 0.1, 3)],
    texts: [T('今天也很可愛', 0, 0.62, 0.06, { slot: 0, f: 'hand', c: '#555' })] },
  { id: 'polaroid3', name: '三張拍立得', cat: ['拍立得', '創意'], ratio: 3 / 4, bg: { type: 'kraft' },
    slots: [{ r: [0.06, 0.05, 0.5, 0.31], rot: -6, frame: PF }, { r: [0.45, 0.33, 0.5, 0.31], rot: 5, frame: PF }, { r: [0.1, 0.6, 0.5, 0.31], rot: -2, frame: PF }],
    deco: [TAPE(0.3, 0.05, 8), TAPE(0.7, 0.33, -6, 'rgba(180,220,255,.8)'), TAPE(0.36, 0.6, 4, 'rgba(255,230,150,.85)')],
    texts: [T('summer', 0, 0.63, 0.05, { slot: 0, f: 'hand', c: '#555' }), T('with you', 0, 0.63, 0.05, { slot: 1, f: 'hand', c: '#555' }), T('♡', 0, 0.63, 0.05, { slot: 2, f: 'hand', c: '#e55' })] },
  { id: 'polaroid2', name: '疊疊拍立得', cat: ['拍立得', '情侶'], ratio: 4 / 5, bg: '#e9e4f5',
    slots: [{ r: [0.08, 0.1, 0.52, 0.48], rot: -8, frame: PF }, { r: [0.4, 0.34, 0.52, 0.48], rot: 6, frame: PF }],
    deco: [D('heart', { x: 0.82, y: 0.17, s: 0.07, c: '#ff7aa2' }), D('star', { x: 0.15, y: 0.85, s: 0.04, c: '#fff' })],
    texts: [T('us.', 0, 0.62, 0.06, { slot: 0, f: 'hand', c: '#555' }), T('', 0, 0.62, 0.045, { slot: 1, f: 'hand', c: '#777', date: 'dot' })] },

  // ---------- 海報、雜誌 ----------
  { id: 'magazine', name: '雜誌封面', cat: ['雜誌', '海報', '熱門'], ratio: 3 / 4, bg: '#222',
    slots: [{ r: [0, 0, 1, 1] }],
    deco: [D('barcode', { x: 0.8, y: 0.88, w: 0.14, h: 0.07 })],
    texts: [T('MUSE', 0.5, 0.13, 0.28, { f: 'display', c: '#ffffff', w: 700, ls: 0.06, sh: true }),
      T('NO.12 · 2026', 0.94, 0.03, 0.03, { f: 'mono', c: '#fff', a: 'right', sh: true }),
      T('THE NEW YOU', 0.06, 0.6, 0.065, { f: 'display', c: '#fff', a: 'left', w: 700, sh: true }),
      T('春日穿搭特輯', 0.06, 0.66, 0.045, { c: '#fff', a: 'left', w: 600, sh: true }),
      T('30 個讓自己\n更喜歡自己的方法', 0.06, 0.75, 0.035, { c: '#fff', a: 'left', sh: true })] },
  { id: 'daily', name: 'DAILY', cat: ['雜誌', '海報', '簡約'], ratio: 4 / 5, bg: '#f4f1ea',
    slots: [{ r: [0.08, 0.16, 0.84, 0.7] }],
    deco: [D('line', { x1: 0.08, y1: 0.885, x2: 0.92, y2: 0.885, c: '#111', lw: 0.003 })],
    texts: [T('daily', 0.08, 0.085, 0.14, { f: 'display', c: '#111', a: 'left', it: true }), T('VOL.07', 0.92, 0.085, 0.035, { f: 'mono', c: '#111', a: 'right' }),
      T('慢慢生活，好好吃飯', 0.08, 0.93, 0.035, { f: 'serif', c: '#333', a: 'left' }), T('', 0.92, 0.93, 0.03, { f: 'mono', c: '#666', a: 'right', date: 'dot' })] },
  { id: 'movie', name: '電影海報', cat: ['海報'], ratio: 2 / 3, bg: '#0b0b0d',
    slots: [{ r: [0, 0, 1, 0.8] }],
    deco: [D('fade', { y1: 0.5, y2: 0.8, c: '#0b0b0d' })],
    texts: [T('夏日未完', 0.5, 0.79, 0.15, { f: 'serif', c: '#fff', w: 700, ls: 0.1 }),
      T('A FILM ABOUT US', 0.5, 0.865, 0.03, { f: 'mono', c: '#ccc', ls: 0.3 }),
      T('主演 你　導演 我　攝影 手機', 0.5, 0.91, 0.026, { c: '#999' }),
      T('即將上映', 0.5, 0.955, 0.04, { c: '#e9c46a', w: 700, ls: 0.2 })] },
  { id: 'poster3', name: '三張海報', cat: ['海報', '經典'], ratio: 3 / 4, bg: '#f3efe6',
    slots: [{ r: [0.06, 0.24, 0.42, 0.56] }, { r: [0.52, 0.24, 0.42, 0.27] }, { r: [0.52, 0.53, 0.42, 0.27] }],
    texts: [T('SUMMER', 0.5, 0.12, 0.22, { f: 'impact', c: '#ff6b3d' }),
      T('我的夏天紀錄', 0.06, 0.86, 0.045, { a: 'left', w: 700 }), T('', 0.06, 0.915, 0.03, { f: 'mono', c: '#777', a: 'left', date: 'dot' }),
      T('VOL.01', 0.94, 0.88, 0.04, { f: 'impact', c: '#ff6b3d', a: 'right' })] },
  { id: 'swag', name: '潮酷海報', cat: ['海報', '創意'], ratio: 3 / 4, bg: { type: 'grad', c: ['#c6ff3d', '#3dffc6'], a: 90 },
    slots: [{ r: [0.1, 0.17, 0.8, 0.66] }],
    deco: [D('star', { x: 0.13, y: 0.2, s: 0.08, c: '#111' }), D('star', { x: 0.88, y: 0.8, s: 0.06, c: '#111' }), D('star', { x: 0.85, y: 0.17, s: 0.035, c: '#fff' })],
    texts: [T('HYPE', 0.5, 0.1, 0.3, { f: 'impact', c: '#111' }), T('HYPE', 0.5, 0.92, 0.3, { f: 'impact', c: '#111', outline: true }),
      T('NO RULES', 0.5, 0.79, 0.04, { f: 'mono', c: '#fff', w: 700, bgc: '#111' })] },
  { id: 'mvp', name: 'MVP 海報', cat: ['海報'], ratio: 3 / 4, bg: '#121a2b',
    slots: [{ r: [0, 0, 1, 0.74] }],
    deco: [D('poly', { pts: [[0, 0.66], [1, 0.58], [1, 0.7], [0, 0.78]], c: '#ffb000' }), D('fade', { y1: 0.5, y2: 0.74, c: 'rgba(18,26,43,.0)' })],
    texts: [T('23', 0.86, 0.86, 0.3, { f: 'impact', c: '#ffb000' }), T('MVP', 0.07, 0.85, 0.15, { f: 'impact', c: '#fff', a: 'left' }),
      T('SEASON 2026 · 年度最佳', 0.07, 0.93, 0.032, { f: 'mono', c: '#9fb3d1', a: 'left' })] },
  { id: 'news', name: '號外報紙', cat: ['復古', '海報'], ratio: 3 / 4, bg: { type: 'paper', c: '#efe8d8' }, filter: 'bw',
    slots: [{ r: [0.06, 0.25, 0.88, 0.5] }],
    deco: [D('line', { x1: 0.05, y1: 0.12, x2: 0.95, y2: 0.12, c: '#222', lw: 0.006 }), D('line', { x1: 0.05, y1: 0.136, x2: 0.95, y2: 0.136, c: '#222', lw: 0.002 }),
      D('textlines', { x: 0.06, y: 0.79, w: 0.42, h: 0.17 }), D('textlines', { x: 0.52, y: 0.79, w: 0.42, h: 0.17 })],
    texts: [T('隨手日報', 0.5, 0.065, 0.12, { f: 'serif', w: 900, c: '#1a1a1a' }), T('', 0.5, 0.158, 0.024, { f: 'serif', c: '#333', date: 'news' }),
      T('號外！今天也很好看', 0.5, 0.21, 0.065, { f: 'serif', w: 900, c: '#1a1a1a' })] },

  // ---------- 底片、復古 ----------
  { id: 'filmstrip', name: '底片三格', cat: ['底片', '復古'], ratio: 3 / 2, bg: '#161616', filter: 'film',
    slots: [0.03, 0.355, 0.68].map(x => ({ r: [x, 0.2, 0.29, 0.6] })),
    deco: [D('holes', { y: 0.05, h: 0.07 }), D('holes', { y: 0.88, h: 0.07 })],
    texts: [T('', 0.97, 0.84, 0.022, { f: 'mono', c: '#ff9b3d', a: 'right', date: 'film' }), T('▸ 12A', 0.03, 0.155, 0.02, { f: 'mono', c: '#ff9b3d', a: 'left' })] },
  { id: 'film1', name: '負片', cat: ['底片'], ratio: 3 / 4, bg: '#1b1b1b', filter: 'film',
    slots: [{ r: [0.14, 0.06, 0.72, 0.88] }],
    deco: [D('holesV', { x: 0.025, w: 0.06 }), D('holesV', { x: 0.915, w: 0.06 })],
    texts: [T('SAFETY FILM 400', 0.105, 0.5, 0.028, { f: 'mono', c: '#ff9b3d', rot: -90, w: 700 }), T('', 0.895, 0.5, 0.028, { f: 'mono', c: '#ff9b3d', rot: 90, date: 'film' })] },
  { id: 'retro4', name: '復古相簿', cat: ['復古', '經典'], ratio: 1, bg: '#f1e3c8', filter: 'retro',
    slots: [[0.05, 0.05], [0.52, 0.05], [0.05, 0.52], [0.52, 0.52]].map(([x, y]) => ({ r: [x, y, 0.43, 0.43], rad: 0.05 })),
    deco: [D('circle', { x: 0.5, y: 0.5, r: 0.12, c: '#f1e3c8' }), D('circle', { x: 0.5, y: 0.5, r: 0.105, c: 'none', st: '#8a5a2b', lw: 0.004 })],
    texts: [T('1998', 0.5, 0.48, 0.065, { f: 'serif', w: 700, c: '#8a5a2b' }), T('MEMORIES', 0.5, 0.535, 0.022, { f: 'mono', c: '#8a5a2b', ls: 0.2 })] },
  { id: 'y2k', name: 'Y2K 閃閃', cat: ['創意', 'IG'], ratio: 4 / 5, bg: { type: 'chrome' },
    slots: [{ r: [0.12, 0.15, 0.76, 0.62], rad: 0.08, frame: { kind: 'border', w: 0.015, c: '#ffffff', shadow: true } }],
    deco: [D('star', { x: 0.1, y: 0.16, s: 0.06, c: '#fff' }), D('star', { x: 0.9, y: 0.72, s: 0.07, c: '#fff' }), D('star', { x: 0.84, y: 0.12, s: 0.03, c: '#fff' }), D('star', { x: 0.16, y: 0.8, s: 0.035, c: '#fff' })],
    texts: [T('✦ Y2K ✦', 0.5, 0.085, 0.09, { f: 'round', c: '#ffffff', st: '#7b5cff' }), T('*:･ﾟ 閃閃發光 ･ﾟ:*', 0.5, 0.87, 0.05, { f: 'round', c: '#5b3cc4' })] },

  // ---------- IG ----------
  { id: 'post', name: '貼文樣式', cat: ['IG'], ratio: 4 / 5, bg: '#ffffff',
    slots: [{ r: [0, 0.11, 1, 0.72] }],
    deco: [D('avatar', { x: 0.075, y: 0.055, r: 0.035 }), D('icon', { k2: 'heart', x: 0.06, y: 0.875, s: 0.05 }), D('icon', { k2: 'comment', x: 0.15, y: 0.875, s: 0.05 }),
      D('icon', { k2: 'send', x: 0.24, y: 0.875, s: 0.05 }), D('icon', { k2: 'save', x: 0.94, y: 0.875, s: 0.05 })],
    texts: [T('your.name', 0.13, 0.055, 0.035, { a: 'left', w: 700 }), T('···', 0.95, 0.05, 0.04, { a: 'right', w: 700 }),
      T('1,024 個讚', 0.04, 0.925, 0.032, { a: 'left', w: 700 }), T('今天的心情 ☁️', 0.04, 0.965, 0.032, { a: 'left' })] },
  { id: 'story', name: '限動', cat: ['IG', '熱門'], ratio: 9 / 16, bg: { type: 'blur' },
    slots: [{ r: [0.08, 0.17, 0.84, 0.6], rad: 0.06, frame: { kind: 'none', shadow: true } }],
    deco: [D('star', { x: 0.86, y: 0.15, s: 0.07, c: '#fff' }), D('star', { x: 0.14, y: 0.79, s: 0.05, c: '#fff' })],
    texts: [T('今天的我', 0.5, 0.11, 0.07, { w: 800, bgc: '#ffffff' }), T('📍 某個好地方', 0.5, 0.83, 0.045, { w: 600, bgc: 'rgba(255,255,255,.85)' })] },
  { id: 'dump', name: '照片大雜燴', cat: ['IG', '創意', '熱門'], ratio: 4 / 5, bg: '#f3eee6',
    slots: [{ r: [0.05, 0.04, 0.45, 0.3], rot: -4 }, { r: [0.5, 0.07, 0.45, 0.33], rot: 3 }, { r: [0.07, 0.37, 0.42, 0.3], rot: 2 }, { r: [0.52, 0.44, 0.42, 0.27], rot: -3 }, { r: [0.12, 0.69, 0.5, 0.27], rot: 2 }]
      .map(s => ({ ...s, frame: WB(0.02) })),
    deco: [D('star', { x: 0.88, y: 0.78, s: 0.05, c: '#f4a261' }), D('heart', { x: 0.75, y: 0.93, s: 0.04, c: '#e76f51' })],
    texts: [T('photo dump ✿', 0.8, 0.86, 0.06, { f: 'hand', c: '#333', rot: -5 })] },

  // ---------- 今日穿搭 ----------
  { id: 'ootd', name: 'OOTD', cat: ['今日穿搭', '熱門'], ratio: 3 / 4, bg: '#f6f3ee',
    slots: [{ r: [0.05, 0.12, 0.52, 0.82] }, { r: [0.62, 0.12, 0.33, 0.26] }, { r: [0.62, 0.4, 0.33, 0.26] }, { r: [0.62, 0.68, 0.33, 0.26] }],
    texts: [T('OOTD', 0.05, 0.065, 0.1, { f: 'display', a: 'left', w: 700 }), T('', 0.95, 0.07, 0.03, { f: 'mono', c: '#666', a: 'right', date: 'dot' }),
      T('TOP', 0.64, 0.36, 0.026, { f: 'mono', a: 'left', bgc: '#fff' }), T('BOTTOM', 0.64, 0.64, 0.026, { f: 'mono', a: 'left', bgc: '#fff' }), T('SHOES', 0.64, 0.92, 0.026, { f: 'mono', a: 'left', bgc: '#fff' })] },
  { id: 'week', name: '一週穿搭', cat: ['今日穿搭'], ratio: 3 / 4, bg: '#ffffff',
    slots: [0, 1, 2, 3, 4, 5].map(i => ({ r: [0.04 + (i % 3) * 0.32, 0.12 + Math.floor(i / 3) * 0.42, 0.28, 0.36], rad: 0.04 })),
    texts: [T('本週穿搭', 0.5, 0.06, 0.07, { w: 800 }),
      ...['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d, i) => T(d, 0.18 + (i % 3) * 0.32, 0.505 + Math.floor(i / 3) * 0.42, 0.03, { f: 'mono', c: '#888' }))] },

  // ---------- 創意 ----------
  { id: 'scrapbook', name: '手帳', cat: ['創意', '熱門'], ratio: 3 / 4, bg: { type: 'grid', c: '#fbfaf5', line: '#e6e2d6' },
    slots: [{ r: [0.07, 0.09, 0.5, 0.36], rot: -5, frame: WB(0.025) }, { r: [0.43, 0.46, 0.5, 0.36], rot: 4, frame: WB(0.025) }],
    deco: [TAPE(0.3, 0.09, -10, 'rgba(255,214,102,.8)'), TAPE(0.68, 0.46, 8, 'rgba(160,210,255,.8)'), D('star', { x: 0.82, y: 0.32, s: 0.05, c: '#f4a261' }),
      D('heart', { x: 0.18, y: 0.6, s: 0.05, c: '#e76f51' }), D('squiggle', { x: 0.62, y: 0.25, w: 0.28, c: '#2a9d8f' })],
    texts: [T('weekend ♡', 0.76, 0.18, 0.065, { f: 'hand', c: '#e76f51', rot: 6 }), T('好想再去一次', 0.27, 0.9, 0.055, { f: 'hand', c: '#333', rot: -3 })] },
  { id: 'summer', name: '夏日', cat: ['創意', '節日'], ratio: 4 / 5, bg: { type: 'grad', c: ['#8fd3ff', '#e0f7ff'], a: 180 },
    slots: [{ r: [0.06, 0.2, 0.53, 0.46], rot: -3, frame: WB(0.02) }, { r: [0.43, 0.42, 0.5, 0.42], rot: 4, frame: WB(0.02) }],
    deco: [D('circle', { x: 0.86, y: 0.1, r: 0.07, c: '#ffd166' }), D('wave', { y: 0.93, c: 'rgba(255,255,255,.7)' })],
    under: true,
    texts: [T('Summer', 0.4, 0.1, 0.14, { f: 'hand', c: '#ffffff', st: '#2a9df4' })] },

  // ---------- 經典、簡約 ----------
  { id: 'classic3', name: '三聯', cat: ['經典'], ratio: 3 / 4, bg: '#ffffff',
    slots: [{ r: [0.06, 0.06, 0.88, 0.42] }, { r: [0.06, 0.51, 0.43, 0.32] }, { r: [0.51, 0.51, 0.43, 0.32] }],
    texts: [T('a little moment', 0.06, 0.89, 0.05, { f: 'display', it: true, a: 'left' }), T('', 0.94, 0.89, 0.028, { f: 'mono', c: '#888', a: 'right', date: 'dot' })] },
  { id: 'classic9', name: '九宮格', cat: ['經典'], ratio: 1, bg: '#ffffff',
    slots: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ r: [0.03 + (i % 3) * 0.32, 0.03 + Math.floor(i / 3) * 0.32, 0.30, 0.30] })) },
  { id: 'minimal1', name: '留白', cat: ['簡約', '經典'], ratio: 4 / 5, bg: '#ffffff',
    slots: [{ r: [0.12, 0.1, 0.76, 0.68] }],
    texts: [T('untitled, 2026', 0.5, 0.86, 0.04, { f: 'serif', it: true, c: '#444' }), T('—', 0.5, 0.9, 0.04, { f: 'serif', c: '#bbb' })] },
  { id: 'minimal2', name: '錯位', cat: ['簡約'], ratio: 3 / 4, bg: '#efeeea',
    slots: [{ r: [0.08, 0.07, 0.55, 0.5], frame: { kind: 'none', shadow: true } }, { r: [0.37, 0.44, 0.55, 0.46], frame: { kind: 'none', shadow: true } }],
    texts: [T('01 / 02', 0.08, 0.95, 0.03, { f: 'mono', a: 'left', c: '#555' }), T('still life', 0.08, 0.66, 0.05, { f: 'display', it: true, a: 'left', c: '#333' })] },

  // ---------- 旅行、情侶、生日、節日 ----------
  { id: 'postcard', name: '明信片', cat: ['旅行'], ratio: 4 / 3, bg: '#f8f4ea',
    slots: [{ r: [0.04, 0.07, 0.55, 0.86] }],
    deco: [D('stamp', { x: 0.84, y: 0.07, w: 0.12, h: 0.21 }), D('postmark', { x: 0.77, y: 0.24, r: 0.07 }),
      ...[0.58, 0.68, 0.78, 0.88].map(y => D('line', { x1: 0.64, y1: y, x2: 0.96, y2: y, c: '#c9bfa8', lw: 0.002 }))],
    texts: [T('GREETINGS FROM', 0.64, 0.38, 0.03, { f: 'display', a: 'left', w: 700, ls: 0.1 }), T('某個好地方', 0.64, 0.46, 0.05, { f: 'hand', a: 'left', c: '#c0392b' })] },
  { id: 'travel3', name: '旅行路線', cat: ['旅行', '創意'], ratio: 3 / 4, bg: '#eaf4f4',
    slots: [{ r: [0.06, 0.06, 0.52, 0.27], rad: 0.05 }, { r: [0.42, 0.37, 0.52, 0.27], rad: 0.05 }, { r: [0.06, 0.68, 0.52, 0.27], rad: 0.05 }],
    under: true,
    deco: [D('path', { pts: [[0.32, 0.2], [0.8, 0.22], [0.68, 0.5], [0.2, 0.55], [0.32, 0.82]], c: '#e76f51', lw: 0.006, dash: [0.015, 0.012] })],
    texts: [T('DAY 1', 0.78, 0.13, 0.05, { f: 'hand', c: '#264653' }), T('DAY 2', 0.22, 0.45, 0.05, { f: 'hand', c: '#264653' }), T('DAY 3', 0.78, 0.78, 0.05, { f: 'hand', c: '#264653' })] },
  { id: 'couple', name: '我們', cat: ['情侶'], ratio: 4 / 5, bg: '#ffe9ef',
    slots: [{ r: [0.06, 0.18, 0.42, 0.5], rad: 0.05 }, { r: [0.52, 0.18, 0.42, 0.5], rad: 0.05 }],
    deco: [D('heart', { x: 0.5, y: 0.43, s: 0.1, c: '#ff4d6d' })],
    texts: [T('you & me', 0.5, 0.1, 0.08, { f: 'hand', c: '#d6336c' }), T('我們的第 100 天', 0.5, 0.79, 0.06, { f: 'serif', c: '#d6336c', w: 700 }), T('', 0.5, 0.86, 0.03, { f: 'mono', c: '#c46a86', date: 'dot' })] },
  { id: 'birthday', name: '生日', cat: ['生日'], ratio: 4 / 5, bg: { type: 'confetti', c: '#fff4e6' },
    slots: [{ r: [0.2, 0.2, 0.6, 0.48], rad: 0.5, frame: { kind: 'border', w: 0.025, c: '#ffffff', shadow: true } }],
    texts: [T('HAPPY', 0.5, 0.11, 0.12, { f: 'round', c: '#ff7aa2' }), T('BIRTHDAY', 0.5, 0.78, 0.12, { f: 'round', c: '#ff7aa2' }), T('生日快樂 🎂', 0.5, 0.87, 0.05, { w: 700, c: '#e76f51' }), T('', 0.5, 0.93, 0.03, { f: 'mono', c: '#999', date: 'dot' })] },
  { id: 'newyear', name: '新年', cat: ['節日'], ratio: 3 / 4, bg: '#b3121f',
    slots: [{ r: [0.1, 0.19, 0.8, 0.58], frame: { kind: 'border', w: 0.012, c: '#ffd166', shadow: true } }],
    deco: [D('circle', { x: 0.06, y: 0.05, r: 0.1, c: 'none', st: '#ffd166', lw: 0.004 }), D('circle', { x: 0.94, y: 0.95, r: 0.12, c: 'none', st: '#ffd166', lw: 0.004 })],
    texts: [T('新年快樂', 0.5, 0.1, 0.13, { f: 'kai', c: '#ffd166', w: 700 }), T('萬事如意 · 平安喜樂', 0.5, 0.86, 0.045, { f: 'kai', c: '#ffe8a3' })] },
];
export const tplById = id => TEMPLATES.find(t => t.id === id);

// ---------- 日期 ----------
export function dateText(kind) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate(), p = n => String(n).padStart(2, '0');
  if (kind === 'film') return `'${String(y).slice(2)} ${p(m)} ${p(dd)}`;
  if (kind === 'news') return `第 ${Math.floor((d - new Date(y, 0, 0)) / 864e5)} 期 · ${y} 年 ${m} 月 ${dd} 日 · 星期${'日一二三四五六'[d.getDay()]}`;
  return `${y}.${p(m)}.${p(dd)}`;
}

// ---------- 背景 ----------
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function paintBg(ctx, bg, W, H, blurSrc) {
  if (typeof bg === 'string') { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); return; }
  const u = W, r = rng(7);
  switch (bg.type) {
    case 'grad': {
      const a = (bg.a ?? 90) * Math.PI / 180, cx = W / 2, cy = H / 2, L = (Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a))) / 2;
      const g = ctx.createLinearGradient(cx - Math.sin(a) * L, cy - Math.cos(a) * L, cx + Math.sin(a) * L, cy + Math.cos(a) * L);
      bg.c.forEach((c, i) => g.addColorStop(i / (bg.c.length - 1), c));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break;
    }
    case 'dots': {
      ctx.fillStyle = bg.c; ctx.fillRect(0, 0, W, H); ctx.fillStyle = bg.dot;
      const s = u * 0.05;
      for (let y = s / 2, row = 0; y < H + s; y += s, row++) for (let x = (row % 2) * s / 2; x < W + s; x += s) { ctx.beginPath(); ctx.arc(x, y, u * 0.006, 0, 7); ctx.fill(); }
      break;
    }
    case 'grid': {
      ctx.fillStyle = bg.c; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = bg.line; ctx.lineWidth = Math.max(1, u * 0.0018);
      const s = u * 0.045; ctx.beginPath();
      for (let x = s; x < W; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = s; y < H; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke(); break;
    }
    case 'kraft': case 'paper': {
      ctx.fillStyle = bg.c || '#c9a87c'; ctx.fillRect(0, 0, W, H);
      const dark = bg.type === 'kraft' ? 'rgba(90,60,30,' : 'rgba(110,90,60,';
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = dark + (r() * 0.09) + ')'; const s = u * (0.002 + r() * 0.004); ctx.fillRect(r() * W, r() * H, s, s); }
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,10,.18)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'confetti': {
      ctx.fillStyle = bg.c; ctx.fillRect(0, 0, W, H);
      const cs = ['#ff7aa2', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'];
      for (let i = 0; i < 90; i++) {
        ctx.save(); ctx.translate(r() * W, r() * H); ctx.rotate(r() * 6.28); ctx.fillStyle = cs[i % cs.length];
        if (i % 3) ctx.fillRect(-u * 0.01, -u * 0.004, u * 0.02, u * 0.008); else { ctx.beginPath(); ctx.arc(0, 0, u * 0.007, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      break;
    }
    case 'chrome': {
      const g = ctx.createLinearGradient(0, 0, W, H);
      ['#d9c8ff', '#ffd1f0', '#c8f1ff', '#e9e0ff', '#ffe3f4'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(r() * W, r() * H, u * (0.15 + r() * 0.2), u * (0.05 + r() * 0.06), r() * 3, 0, 7); ctx.fill(); }
      break;
    }
    case 'blur': {
      if (!blurSrc) { ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, W, H); break; }
      const k = Math.max(W / blurSrc.width, H / blurSrc.height);
      ctx.save(); ctx.filter = `blur(${Math.round(u * 0.04)}px) brightness(.9)`;
      ctx.drawImage(blurSrc, (W - blurSrc.width * k) / 2 - u * 0.05, (H - blurSrc.height * k) / 2 - u * 0.05, blurSrc.width * k + u * 0.1, blurSrc.height * k + u * 0.1);
      ctx.restore(); break;
    }
    default: ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 裝飾 ----------
function star4(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y); ctx.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y); ctx.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r); ctx.fill();
}
function heartPath(ctx, x, y, s) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.38);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
}
export function paintDeco(ctx, d, W, H) {
  const u = W, X = v => v * W, Y = v => v * H;
  ctx.save();
  switch (d.k) {
    case 'tape': {
      const w = d.w * u, h = w * 0.3;
      ctx.translate(X(d.x), Y(d.y)); ctx.rotate(d.rot * Math.PI / 180); ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2);
      for (let i = 0; i <= 6; i++) ctx.lineTo(w / 2 + (i % 2 ? -h * 0.08 : 0), -h / 2 + h * i / 6);
      for (let i = 6; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? h * 0.08 : 0), -h / 2 + h * i / 6);
      ctx.fill(); break;
    }
    case 'star': ctx.fillStyle = d.c; star4(ctx, X(d.x), Y(d.y), d.s * u); break;
    case 'heart': ctx.fillStyle = d.c; heartPath(ctx, X(d.x), Y(d.y), d.s * u); ctx.fill(); break;
    case 'circle':
      ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), d.r * u, 0, 7);
      if (d.c !== 'none') { ctx.fillStyle = d.c; ctx.fill(); }
      if (d.st) { ctx.strokeStyle = d.st; ctx.lineWidth = d.lw * u; ctx.stroke(); }
      break;
    case 'line':
      ctx.strokeStyle = d.c; ctx.lineWidth = Math.max(1, d.lw * u); if (d.dash) ctx.setLineDash(d.dash.map(v => v * u));
      ctx.beginPath(); ctx.moveTo(X(d.x1), Y(d.y1)); ctx.lineTo(X(d.x2), Y(d.y2)); ctx.stroke(); break;
    case 'path': {
      ctx.strokeStyle = d.c; ctx.lineWidth = d.lw * u; ctx.lineCap = 'round'; if (d.dash) ctx.setLineDash(d.dash.map(v => v * u));
      const p = d.pts.map(([x, y]) => [X(x), Y(y)]);
      ctx.beginPath(); ctx.moveTo(...p[0]);
      for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      ctx.lineTo(...p[p.length - 1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = d.c; for (const q of [p[0], p[p.length - 1]]) { ctx.beginPath(); ctx.arc(q[0], q[1], u * 0.014, 0, 7); ctx.fill(); }
      break;
    }
    case 'poly': ctx.fillStyle = d.c; ctx.beginPath(); d.pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.fill(); break;
    case 'fade': {
      const g = ctx.createLinearGradient(0, Y(d.y1), 0, Y(d.y2));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, d.c); ctx.fillStyle = g; ctx.fillRect(0, Y(d.y1), W, Y(d.y2) - Y(d.y1)); break;
    }
    case 'barcode': {
      const x = X(d.x), y = Y(d.y), w = d.w * u, h = d.h * u, r = rng(3);
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#111';
      for (let bx = x + w * 0.08; bx < x + w * 0.92;) { const bw = w * (0.01 + r() * 0.025); if (r() > 0.35) ctx.fillRect(bx, y + h * 0.1, bw, h * 0.8); bx += bw + w * 0.012; }
      break;
    }
    case 'holes': case 'holesV': {
      ctx.fillStyle = '#e8e2d4';
      if (d.k === 'holes') { const hh = d.h * H * 0.55, hw = hh * 0.75, gap = hh * 1.9; for (let x = gap / 3; x < W; x += gap) { ctx.beginPath(); ctx.roundRect(x, Y(d.y) + (d.h * H - hh) / 2, hw, hh, hw * 0.2); ctx.fill(); } }
      else { const hw = d.w * W * 0.55, hh = hw * 0.75, gap = hw * 1.9; for (let y = gap / 3; y < H; y += gap) { ctx.beginPath(); ctx.roundRect(X(d.x) + (d.w * W - hw) / 2, y, hw, hh, hh * 0.2); ctx.fill(); } }
      break;
    }
    case 'textlines': {
      ctx.fillStyle = 'rgba(40,40,40,.28)'; const lh = u * 0.018, r = rng(5);
      for (let y = Y(d.y); y < Y(d.y) + d.h * H - lh; y += lh * 1.7) ctx.fillRect(X(d.x), y, d.w * W * (0.75 + r() * 0.25), lh * 0.6);
      break;
    }
    case 'squiggle': {
      ctx.strokeStyle = d.c; ctx.lineWidth = u * 0.008; ctx.lineCap = 'round'; ctx.beginPath();
      const x0 = X(d.x), y0 = Y(d.y), w = d.w * u;
      for (let i = 0; i <= 40; i++) { const x = x0 + w * i / 40, y = y0 + Math.sin(i / 40 * Math.PI * 4) * u * 0.015; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); break;
    }
    case 'wave': {
      ctx.fillStyle = d.c; ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = 0; i <= 60; i++) { const x = W * i / 60; ctx.lineTo(x, Y(d.y) + Math.sin(i / 60 * Math.PI * 6) * u * 0.015); }
      ctx.lineTo(W, H); ctx.fill(); break;
    }
    case 'stamp': {
      const x = X(d.x), y = Y(d.y), w = d.w * u, h = d.h * H, r = u * 0.008;
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f8f4ea'; for (let i = 0; i <= 8; i++) for (const [px, py] of [[x + w * i / 8, y], [x + w * i / 8, y + h], [x, y + h * i / 8], [x + w, y + h * i / 8]]) { ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#e76f51'; ctx.fillRect(x + w * 0.15, y + h * 0.12, w * 0.7, h * 0.6);
      ctx.fillStyle = '#fff'; heartPath(ctx, x + w / 2, y + h * 0.43, w * 0.35); ctx.fill();
      ctx.fillStyle = '#333'; ctx.font = `700 ${w * 0.18}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POST', x + w / 2, y + h * 0.85);
      break;
    }
    case 'postmark': {
      const x = X(d.x), y = Y(d.y), r = d.r * u;
      ctx.strokeStyle = 'rgba(60,60,90,.55)'; ctx.lineWidth = u * 0.003;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 7); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.beginPath(); for (let k = 0; k <= 20; k++) { const xx = x + r * 1.1 + k * r * 0.08, yy = y - r * 0.45 + i * r * 0.3 + Math.sin(k / 20 * Math.PI * 2) * r * 0.06; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
      ctx.fillStyle = 'rgba(60,60,90,.6)'; ctx.font = `700 ${r * 0.28}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(dateText('dot'), x, y); break;
    }
    case 'avatar': {
      const x = X(d.x), y = Y(d.y), r = d.r * u, g = ctx.createLinearGradient(x - r, y + r, x + r, y - r);
      g.addColorStop(0, '#feda75'); g.addColorStop(0.5, '#d62976'); g.addColorStop(1, '#4f5bd5');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9d9de'; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 7); ctx.fill(); break;
    }
    case 'icon': {
      const x = X(d.x), y = Y(d.y), s = d.s * u;
      ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.08; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (d.k2 === 'heart') { heartPath(ctx, x, y + s * 0.08, s * 0.62); ctx.stroke(); }
      else if (d.k2 === 'comment') { ctx.beginPath(); ctx.arc(x, y, s * 0.38, Math.PI * 0.75, Math.PI * 2.6); ctx.lineTo(x - s * 0.42, y + s * 0.42); ctx.closePath(); ctx.stroke(); }
      else if (d.k2 === 'send') { ctx.beginPath(); ctx.moveTo(x - s * 0.42, y - s * 0.36); ctx.lineTo(x + s * 0.42, y - s * 0.36); ctx.lineTo(x - s * 0.05, y + s * 0.42); ctx.lineTo(x - s * 0.12, y - s * 0.02); ctx.closePath(); ctx.moveTo(x - s * 0.12, y - s * 0.02); ctx.lineTo(x + s * 0.42, y - s * 0.36); ctx.stroke(); }
      else if (d.k2 === 'save') { ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.42); ctx.lineTo(x + s * 0.3, y - s * 0.42); ctx.lineTo(x + s * 0.3, y + s * 0.42); ctx.lineTo(x, y + s * 0.16); ctx.lineTo(x - s * 0.3, y + s * 0.42); ctx.closePath(); ctx.stroke(); }
      break;
    }
  }
  ctx.restore();
}

// 一般拼貼可選的背景
export const BGS = [
  { id: 'white', bg: '#ffffff' }, { id: 'black', bg: '#111111' }, { id: 'cream', bg: '#f4eee2' }, { id: 'pink', bg: '#ffd9e4' },
  { id: 'blue', bg: '#d6ebff' }, { id: 'mint', bg: '#d8f3e6' }, { id: 'lilac', bg: '#e6dcff' }, { id: 'yellow', bg: '#fff3b8' },
  { id: 'gp', bg: { type: 'grad', c: ['#ffd1e0', '#ffe8cc'], a: 135 } }, { id: 'gb', bg: { type: 'grad', c: ['#c6e6ff', '#e8dcff'], a: 135 } },
  { id: 'grid', bg: { type: 'grid', c: '#fbfaf5', line: '#e6e2d6' } }, { id: 'dots', bg: { type: 'dots', c: '#ffd6e5', dot: '#ffffff' } },
  { id: 'kraft', bg: { type: 'kraft' } }, { id: 'blur', bg: { type: 'blur' } },
];
