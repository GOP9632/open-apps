// 文字：排版和繪製都在這裡，畫面預覽和存檔用同一支程式畫，所以看到的就是存下來的
// 選項照醒圖（Hypic）文字面板：範本、字型、樣式（粗體、斜體、底線）、顏色、描邊、字體效果（花字）、
// 陰影（不透明度、模糊、角度、位移）、背景、字距、行距、對齊、彎曲（曲線、位移）、不透明度
// 範本和字型都是自己設計或開源授權（SIL OFL）的，沒有用醒圖的素材

// 字型：前三個是系統內建，其餘從 Google Fonts 載入（全部是 SIL Open Font License）
export const FONTS = [
  { name: '黑體', css: '-apple-system,"PingFang TC","Noto Sans TC",sans-serif' },
  { name: '明體', css: '"Songti TC","Noto Serif TC",serif' },
  { name: '楷書', css: '"Kaiti TC","BiauKai","LXGW WenKai TC",cursive' },
  { name: '粉圓', css: '"Huninn",sans-serif', gf: 'Huninn' },
  { name: '文楷', css: '"LXGW WenKai TC",cursive', gf: 'LXGW+WenKai+TC:wght@400;700' },
  { name: '芫荽', css: '"Iansui",cursive', gf: 'Iansui' },
  { name: '粗黑', css: '"Noto Sans TC",sans-serif', gf: 'Noto+Sans+TC:wght@400;900', w: 900 },
  { name: '宋體', css: '"Noto Serif TC",serif', gf: 'Noto+Serif+TC:wght@400;900', w: 900 },
  { name: '朱古力', css: '"Chocolate Classical Sans",sans-serif', gf: 'Chocolate+Classical+Sans' },
  { name: 'Bebas', css: '"Bebas Neue",sans-serif', gf: 'Bebas+Neue' },
  { name: 'Pacifico', css: '"Pacifico",cursive', gf: 'Pacifico' },
  { name: 'Lobster', css: '"Lobster",cursive', gf: 'Lobster' },
  { name: 'Marker', css: '"Permanent Marker",cursive', gf: 'Permanent+Marker' },
  { name: 'Dancing', css: '"Dancing Script",cursive', gf: 'Dancing+Script:wght@400;700' },
];

// 每段文字的預設值。數值都是 0~100 的滑桿刻度，畫的時候再換成像素
export const T0 = {
  text: '輸入文字', x: 0.5, y: 0.5, size: 0.08, rot: 0, op: 100,
  font: 0, bold: true, italic: false, under: false, align: 'center',
  color: '#ffffff', color2: null,            // color2：漸層的第二個顏色
  stroke: 30, strokeColor: null,             // null 表示自動配黑或白
  shadow: 0, shadowColor: '#000000', shadowBlur: 30, shadowAngle: -45, shadowDist: 20,
  bg: 0, bgColor: '#000000',
  ls: 0, lh: 0, vert: false,                 // 字距、行距、直書
  curve: 0, curveOff: 0,                     // 彎曲：曲線 -100~100、位移 -100~100
  fx: '', fxColor: '#ff5c8a', fxAmt: 50,     // 字體效果（花字）：種類、顏色、強度
  tpl: null,
};

// 字體效果（花字）：雙層描邊、立體、鏤空、故障、外框光
export const TEXT_FX = [
  ['double', '雙層描邊'], ['3d', '立體'], ['hollow', '鏤空'], ['glitch', '故障'], ['halo', '外框光'],
];
// 舊版存的文字（stroke 是 true/false、op 是 0~1）補成新格式
export function upgradeText(t) {
  const o = { ...T0, ...t };
  if (typeof t.stroke === 'boolean') o.stroke = t.stroke ? 30 : 0;
  return o;
}

export const TEXT_COLORS = ['#ffffff', '#111111', '#ff5c8a', '#ff8a3d', '#ffe066', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#c5a46d'];

// 文字範本：自己配的樣式組合
export const TEMPLATES = [
  { id: 'classic', name: '經典', set: { color: '#ffffff', stroke: 30, strokeColor: '#111111' } },
  { id: 'ink', name: '黑白邊', set: { color: '#111111', stroke: 40, strokeColor: '#ffffff' } },
  { id: 'neonpink', name: '霓虹粉', set: { color: '#fff0f6', stroke: 12, strokeColor: '#ff4d9d', shadow: 100, shadowColor: '#ff2e8a', shadowBlur: 70, shadowDist: 0 } },
  { id: 'neonblue', name: '霓虹藍', set: { color: '#e7f5ff', stroke: 12, strokeColor: '#3bc9db', shadow: 100, shadowColor: '#15aabf', shadowBlur: 70, shadowDist: 0 } },
  { id: 'tag', name: '標籤', set: { color: '#ffffff', stroke: 0, bg: 100, bgColor: '#ff5c8a' } },
  { id: 'memo', name: '便利貼', set: { color: '#3b2f1e', stroke: 0, bg: 100, bgColor: '#ffe066', font: 3 } },
  { id: 'caption', name: '字幕', set: { color: '#ffffff', stroke: 0, bg: 55, bgColor: '#000000', bold: false } },
  { id: 'peach', name: '蜜桃', set: { color: '#ff8fab', color2: '#ffd6a5', stroke: 22, strokeColor: '#ffffff', font: 3 } },
  { id: 'sunset', name: '夕陽', set: { color: '#ffd43b', color2: '#ff6b6b', stroke: 18, strokeColor: '#5c1a1a' } },
  { id: 'gold', name: '金色', set: { color: '#fff3bf', color2: '#c99a2e', stroke: 10, strokeColor: '#5c3d00', shadow: 60, shadowBlur: 20, shadowDist: 12, font: 7 } },
  { id: 'retro', name: '復古', set: { color: '#ffd43b', stroke: 18, strokeColor: '#2b2b2b', shadow: 100, shadowColor: '#e8590c', shadowBlur: 0, shadowDist: 35, shadowAngle: -45, font: 6 } },
  { id: 'pop', name: '波普', set: { color: '#ffffff', stroke: 35, strokeColor: '#1c7ed6', shadow: 100, shadowColor: '#ffe066', shadowBlur: 0, shadowDist: 45, shadowAngle: -60, font: 9 } },
  { id: 'arch', name: '拱形', set: { color: '#ffffff', stroke: 30, strokeColor: '#e64980', curve: 45, font: 3 } },
  { id: 'smile', name: '微笑', set: { color: '#ffe066', stroke: 30, strokeColor: '#7048e8', curve: -45, font: 3 } },
  { id: 'hand', name: '手寫', set: { color: '#ffffff', stroke: 0, shadow: 70, shadowBlur: 25, shadowDist: 10, font: 4, bold: false } },
  { id: 'script', name: '花體', set: { color: '#ffffff', stroke: 0, shadow: 60, shadowBlur: 30, shadowDist: 8, font: 10, bold: false } },
  { id: 'soft', name: '柔光', set: { color: '#ffffff', stroke: 0, shadow: 90, shadowColor: '#ffffff', shadowBlur: 60, shadowDist: 0, bold: false, font: 1 } },
  { id: 'mint', name: '薄荷', set: { color: '#ffffff', stroke: 45, strokeColor: '#38d9a9', shadow: 50, shadowColor: '#087f5b', shadowBlur: 0, shadowDist: 25, font: 3 } },
  { id: 'candy', name: '糖果', set: { color: '#ffffff', color2: '#ffd6e7', stroke: 25, strokeColor: '#ff5c8a', fx: 'double', fxColor: '#ffffff', fxAmt: 45, font: 3 } },
  { id: 'block', name: '立體', set: { color: '#ffe066', stroke: 15, strokeColor: '#1c1c1c', fx: '3d', fxColor: '#e8590c', fxAmt: 55, font: 6 } },
  { id: 'comic', name: '漫畫', set: { color: '#ffffff', stroke: 25, strokeColor: '#1c1c1c', fx: '3d', fxColor: '#1c1c1c', fxAmt: 35, font: 9 } },
  { id: 'outline', name: '鏤空', set: { color: '#ffffff', stroke: 8, fx: 'hollow', font: 6 } },
  { id: 'glitch', name: '故障', set: { color: '#ffffff', stroke: 0, fx: 'glitch', fxAmt: 50, font: 6 } },
  { id: 'halo', name: '光圈', set: { color: '#ffffff', stroke: 0, fx: 'halo', fxColor: '#ffd43b', fxAmt: 60, font: 3 } },
];
// 套範本：先回到預設樣式再蓋上範本，保留文字內容、位置、大小、角度
export function applyTemplate(t, tp) {
  const keep = { text: t.text, x: t.x, y: t.y, size: t.size, rot: t.rot };
  Object.assign(t, T0, tp ? tp.set : {}, keep, { tpl: tp ? tp.id : null });
}

// ---------- 字型載入 ----------
const loaded = new Set();
// 回傳 Promise，字型（含這段文字用到的字）下載好之後 resolve
export function loadFont(i, text = '') {
  const f = FONTS[i];
  if (!f?.gf || typeof document === 'undefined') return Promise.resolve();
  if (!loaded.has(f.gf)) {
    loaded.add(f.gf);
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`;
    document.head.append(l);
    f.ready = new Promise(ok => { l.onload = ok; l.onerror = ok; });
  }
  const fam = f.css.split(',')[0];
  return f.ready.then(() => document.fonts.load(`${f.w || 700} 40px ${fam}`, text || 'Aa字')).catch(() => {});
}

// ---------- 排版 ----------
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }) : null;
const chars = s => seg ? [...seg.segment(s)].map(x => x.segment) : Array.from(s);
export const fontCss = (t, fs) => {
  const f = FONTS[t.font] || FONTS[0];
  return `${t.italic ? 'italic ' : ''}${t.bold ? (f.w || 700) : 400} ${fs}px ${f.css}`;
};
// 把文字拆成一個個字的位置和角度，座標以文字中心為原點，單位是像素（字級 fs）
// 回傳 { glyphs: [{ ch, x, y, a, w }], lines: [...], box: { x, y, w, h } }
export function layout(ctx, t, fs) {
  ctx.font = fontCss(t, fs);
  const sp = fs * t.ls / 100 * 0.5, lh = fs * (1.2 + t.lh / 100 * 0.8);
  const rows = (t.text || ' ').split('\n').map(ln => {
    const g = chars(ln).map(ch => ({ ch, w: ctx.measureText(ch).width }));
    const w = g.reduce((s, x) => s + x.w, 0) + sp * Math.max(0, g.length - 1);
    return { g, w };
  });
  const maxW = Math.max(fs * 0.5, ...rows.map(r => r.w)), n = rows.length;
  const glyphs = [], lines = [];
  const c = t.vert ? 0 : t.curve / 100;
  if (t.vert) {
    // 直書：一行變成一欄，由上往下，欄由右往左排；直書不彎曲、不畫底線
    const cols = rows.map(r => ({ g: r.g, h: r.g.length * fs + sp * Math.max(0, r.g.length - 1) }));
    const maxH = Math.max(fs, ...cols.map(c2 => c2.h));
    cols.forEach((col, i) => {
      const x = ((n - 1) / 2 - i) * lh;
      let y = t.align === 'left' ? -maxH / 2 : t.align === 'right' ? maxH / 2 - col.h : -col.h / 2;
      col.g.forEach(g => { glyphs.push({ ...g, x, y: y + fs / 2, a: 0, w: Math.max(g.w, fs) }); y += fs + sp; });
    });
  } else if (Math.abs(c) < 0.01) {
    rows.forEach((r, i) => {
      const y = (i - (n - 1) / 2) * lh;
      let x = t.align === 'left' ? -maxW / 2 : t.align === 'right' ? maxW / 2 - r.w : -r.w / 2;
      lines.push({ x0: x, x1: x + r.w, y });
      r.g.forEach(g => { glyphs.push({ ...g, x: x + g.w / 2, y, a: 0 }); x += g.w + sp; });
    });
  } else {
    // 彎曲：最長那一行在曲線 100 時繞成將近一整圈；正值往上拱，負值往下彎
    const span = Math.abs(c) * Math.PI * 1.9, R = maxW / span, dir = Math.sign(c);
    const off = t.curveOff / 100 * Math.PI;
    rows.forEach((r, i) => {
      // 多行時一行一個同心圓，第一行在外圈（往上拱時）
      const ri = Math.max(fs * 0.3, R - dir * (i - (n - 1) / 2) * lh);
      let s = t.align === 'left' ? -maxW / 2 : t.align === 'right' ? maxW / 2 - r.w : -r.w / 2;
      const a0 = s / ri + off;
      r.g.forEach(g => {
        const a = (s + g.w / 2) / ri + off;
        glyphs.push({ ...g, x: ri * Math.sin(a), y: dir * (R - ri * Math.cos(a)), a: dir * a });
        s += g.w + sp;
      });
      lines.push({ arc: true, r: ri, a0, a1: a0 + r.w / ri, dir, R });
    });
  }
  // 外框：每個字當成 w × fs 的旋轉矩形
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const cs = Math.abs(Math.cos(g.a)), sn = Math.abs(Math.sin(g.a));
    const hw = (g.w * cs + fs * sn) / 2, hh = (g.w * sn + fs * cs) / 2;
    x0 = Math.min(x0, g.x - hw); x1 = Math.max(x1, g.x + hw); y0 = Math.min(y0, g.y - hh); y1 = Math.max(y1, g.y + hh);
  }
  if (!glyphs.length) { x0 = -fs / 4; x1 = fs / 4; y0 = -fs / 2; y1 = fs / 2; }
  // 置中到外框中心，彎曲後才不會偏一邊
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  glyphs.forEach(g => { g.x -= cx; g.y -= cy; });
  lines.forEach(l => { if (l.arc) { l.cx = -cx; l.cy = l.dir * l.R - cy; } else { l.x0 -= cx; l.x1 -= cx; l.y -= cy; } });
  return { glyphs, lines, box: { x: x0 - cx, y: y0 - cy, w: x1 - x0, h: y1 - y0 }, fs };
}

// 描邊、陰影、背景會超出字的外框多少
export function pad(t, fs) {
  const st = t.stroke ? fs * t.stroke / 250 : 0;
  const sh = t.shadow ? fs * (t.shadowDist / 100 * 0.3 + t.shadowBlur / 100 * 0.6) : 0;
  const bg = t.bg ? fs * 0.35 : 0;
  const a = t.fxAmt / 100, fx = t.fx === 'double' ? st + fs * (0.02 + a * 0.12) : t.fx === '3d' ? st + fs * a * 0.2 : t.fx === 'glitch' ? fs * a * 0.08 : t.fx === 'halo' ? st + fs * (0.08 + a * 0.2) : 0;
  return Math.max(st, bg, fx) + sh + 2;
}

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export const autoStroke = c => (parseInt(c.slice(1, 3), 16) * 299 + parseInt(c.slice(3, 5), 16) * 587 + parseInt(c.slice(5, 7), 16) * 114) / 1000 > 140 ? '#111111' : '#ffffff';

// 在 ctx 目前的原點畫一段文字（文字中心在原點，還沒旋轉），fs 是字級像素
// 陰影的位移和模糊不會跟著 ctx 的縮放變，所以自己乘上目前的縮放倍率
export function drawText(ctx, t, fs, L = layout(ctx, t, fs)) {
  const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) || 1;
  ctx.save();
  ctx.globalAlpha *= t.op / 100;
  ctx.font = fontCss(t, fs);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  // 背景：圓角色塊
  if (t.bg) {
    const p = fs * 0.3, b = L.box;
    ctx.fillStyle = hexA(t.bgColor, t.bg / 100);
    ctx.beginPath(); ctx.roundRect(b.x - p, b.y - p * 0.6, b.w + p * 2, b.h + p * 1.2, fs * 0.25); ctx.fill();
  }
  // 鏤空：只畫描邊（沒有描邊就用細的字色描邊）
  const hollow = t.fx === 'hollow';
  const sw = t.stroke ? fs * t.stroke / 250 : hollow ? fs * 0.03 : 0, sc = t.strokeColor || (hollow ? t.color : autoStroke(t.color));
  const fill = () => {
    if (!t.color2) return t.color;
    const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    g.addColorStop(0, t.color); g.addColorStop(1, t.color2);
    return g;
  };
  const each = fn => L.glyphs.forEach(g => { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a); fn(g); ctx.restore(); });
  // 底線：直的畫線段，彎曲的畫圓弧
  const under = (lw) => {
    if (!t.under) return;
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    for (const l of L.lines) {
      ctx.beginPath();
      if (l.arc) {
        const r = l.r - l.dir * fs * 0.62;
        if (l.dir > 0) ctx.arc(l.cx, l.cy, r, -Math.PI / 2 + l.a0, -Math.PI / 2 + l.a1);
        else ctx.arc(l.cx, l.cy, r, Math.PI / 2 - l.a0, Math.PI / 2 - l.a1, true);
      } else { ctx.moveTo(l.x0, l.y + fs * 0.62); ctx.lineTo(l.x1, l.y + fs * 0.62); }
      ctx.stroke();
    }
  };
  const ulw = Math.max(1, fs * 0.07);
  const paint = (withStroke, withFill) => each(g => {
    if (withStroke) { ctx.lineWidth = hollow ? sw : sw * 2; ctx.strokeText(g.ch, 0, 0); }
    if (withFill) { ctx.fillStyle = withFill === true ? fill() : withFill; ctx.fillText(g.ch, 0, 0); }
  });
  // 第一遍：陰影（連描邊一起投影）。字本身畫到畫面外，只把投影移回來，
  // 半透明的字才不會被疊兩次。陰影位移是螢幕座標，所以用目前的變換矩陣換算
  if (t.shadow) {
    const a = t.shadowAngle * Math.PI / 180, d = fs * t.shadowDist / 100 * 0.3;
    const lx = Math.cos(a) * d, ly = -Math.sin(a) * d;
    const far = 4 * (ctx.canvas.width + ctx.canvas.height) / k;
    ctx.save();
    ctx.shadowColor = hexA(t.shadowColor, t.shadow / 100);
    ctx.shadowBlur = fs * t.shadowBlur / 100 * 0.6 * k;
    ctx.shadowOffsetX = m.a * (lx - far) + m.c * ly; ctx.shadowOffsetY = m.b * (lx - far) + m.d * ly;
    ctx.translate(far, 0);
    const c = sw ? sc : t.color;
    ctx.strokeStyle = c;
    paint(!!sw, c); under(ulw + sw * 2);
    ctx.restore();
  }
  // 字體效果：都畫在描邊下面
  const a = t.fxAmt / 100;
  if (t.fx === 'double') {
    // 雙層描邊：描邊外面再包一層
    const w2 = sw + fs * (0.02 + a * 0.12);
    ctx.strokeStyle = t.fxColor; ctx.lineWidth = w2 * 2;
    each(g => ctx.strokeText(g.ch, 0, 0)); under(ulw + w2 * 2);
  } else if (t.fx === '3d') {
    // 立體：往右下疊很多層，越後面的層越深一點，看起來像厚度
    const d = fs * a * 0.2, n = Math.max(1, Math.min(80, Math.ceil(d * k)));
    for (let i = n; i >= 1; i--) {
      const o = d * i / n / Math.SQRT2;
      ctx.save(); ctx.translate(o, o);
      ctx.strokeStyle = t.fxColor; ctx.fillStyle = t.fxColor;
      paint(!!sw, t.fxColor);
      ctx.restore();
    }
  } else if (t.fx === 'glitch') {
    // 故障：青、洋紅兩份往左右錯開
    const o = fs * a * 0.08;
    [[-o, '#00e5ff'], [o, '#ff2bd6']].forEach(([dx, c]) => {
      ctx.save(); ctx.translate(dx, 0); ctx.globalAlpha *= 0.85; ctx.strokeStyle = c;
      paint(!!sw, c); ctx.restore();
    });
  } else if (t.fx === 'halo') {
    // 外框光：描邊外面一圈柔和的光
    const w2 = sw + fs * (0.04 + a * 0.1);
    ctx.save(); ctx.strokeStyle = t.fxColor; ctx.lineWidth = w2 * 2;
    ctx.shadowColor = t.fxColor; ctx.shadowBlur = fs * (0.08 + a * 0.2) * k;
    each(g => ctx.strokeText(g.ch, 0, 0));
    ctx.restore();
  }
  // 第二遍：描邊在下、填色在上（鏤空不填色）
  if (sw) { ctx.strokeStyle = sc; paint(true, false); under(ulw + sw * 2); }
  if (!hollow) paint(false, true);
  ctx.strokeStyle = t.color; under(ulw);
  ctx.restore();
}
