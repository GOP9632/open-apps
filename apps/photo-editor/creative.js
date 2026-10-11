// 創意玩法、光效、背景、邊框：全部用程式畫出來，不用別家的素材

// 固定種子的亂數，同一張圖每次畫出來都一樣
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
// 跟照片同比例，長邊最多 max
export function fitSize(w, h, max = 1280) { const k = Math.min(1, max / Math.max(w, h)); return [Math.round(w * k), Math.round(h * k)]; }
function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  ctx.fill();
}
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.38);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
  ctx.fill();
}

// ---------- 特效（在 shader 裡算，這裡只放名稱和預設強度） ----------
export const FX = [
  { id: 'comic', name: '漫畫', mode: 1, def: 100 },
  { id: 'pop', name: '波普', mode: 2, def: 100 },
  { id: 'sketch', name: '素描', mode: 3, def: 100 },
  { id: 'pencil', name: '彩鉛', mode: 4, def: 100 },
  { id: 'mosaic', name: '馬賽克', mode: 5, def: 40 },
  { id: 'glitch', name: '故障', mode: 6, def: 60 },
  { id: 'mirror', name: '鏡像', mode: 7, def: 100 },
  { id: 'ghost', name: '分身', mode: 8, def: 70, seg: true },
  { id: 'double', name: '雙重曝光', mode: 9, def: 85, seg: true },
];

// ---------- 光效：黑底上畫光，用「濾色」疊上去，黑色的地方不影響照片 ----------
export const OVERLAYS = [
  { id: 'leakWarm', name: '暖漏光', draw(ctx, w, h) {
    const m = Math.max(w, h);
    radial(ctx, 0, h * 0.15, m * 0.8, [[0, 'rgba(255,140,50,1)'], [0.3, 'rgba(255,80,30,.7)'], [1, 'rgba(0,0,0,0)']]);
    radial(ctx, w, h * 0.85, m * 0.55, [[0, 'rgba(255,200,90,.9)'], [1, 'rgba(0,0,0,0)']]);
  } },
  { id: 'leakPink', name: '粉漏光', draw(ctx, w, h) {
    const m = Math.max(w, h);
    radial(ctx, w, 0, m * 0.85, [[0, 'rgba(255,100,180,1)'], [0.35, 'rgba(190,70,255,.6)'], [1, 'rgba(0,0,0,0)']]);
    radial(ctx, 0, h, m * 0.5, [[0, 'rgba(255,140,120,.8)'], [1, 'rgba(0,0,0,0)']]);
  } },
  { id: 'rainbow', name: '彩虹光', draw(ctx, w, h) {
    const m = Math.max(w, h);
    ctx.save(); ctx.translate(w * 0.15, h * 0.05); ctx.rotate(0.55);
    const g = ctx.createLinearGradient(0, -m * 0.09, 0, m * 0.09);
    ['rgba(0,0,0,0)', 'rgba(255,40,40,.55)', 'rgba(255,160,0,.55)', 'rgba(255,240,0,.5)', 'rgba(0,220,90,.5)', 'rgba(0,140,255,.55)', 'rgba(150,40,255,.55)', 'rgba(0,0,0,0)']
      .forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(-m * 0.2, -m * 0.09, m * 1.6, m * 0.18);
    ctx.restore();
    const f = ctx.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,.7)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = f; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  } },
  { id: 'bokeh', name: '光斑', draw(ctx, w, h) {
    const r = rng(7), m = Math.max(w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, s = m * (0.015 + r() * 0.05), hue = 20 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, `hsla(${hue},100%,70%,${0.25 + r() * 0.35})`); g.addColorStop(0.8, `hsla(${hue},100%,60%,${0.2 + r() * 0.2})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    }
  } },
  { id: 'flare', name: '逆光', draw(ctx, w, h) {
    const m = Math.max(w, h), sx = w * 0.82, sy = h * 0.12;
    radial(ctx, sx, sy, m * 0.7, [[0, 'rgba(255,252,230,1)'], [0.12, 'rgba(255,225,160,.95)'], [0.4, 'rgba(255,150,60,.4)'], [1, 'rgba(0,0,0,0)']]);
    const r = rng(3);
    [0.35, 0.55, 0.7, 0.95, 1.2].forEach((t, i) => {
      const x = sx + (w * 0.5 - sx) * t * 2, y = sy + (h * 0.5 - sy) * t * 2, s = m * (0.02 + r() * 0.05);
      ctx.fillStyle = `hsla(${[40, 190, 280, 30, 160][i]},90%,65%,.4)`; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    });
  } },
  { id: 'sparkle', name: '星光', draw(ctx, w, h) {
    const r = rng(11), m = Math.max(w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, s = m * (0.004 + Math.pow(r(), 3) * 0.03);
      ctx.fillStyle = `rgba(255,${235 + r() * 20 | 0},${200 + r() * 55 | 0},${0.5 + r() * 0.5})`;
      if (s > m * 0.01) star(ctx, x, y, s); else { ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, 7); ctx.fill(); }
    }
  } },
  { id: 'snow', name: '飄雪', draw(ctx, w, h) {
    const r = rng(5), m = Math.max(w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, s = m * (0.002 + Math.pow(r(), 2) * 0.009);
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    }
  } },
  { id: 'hearts', name: '愛心', draw(ctx, w, h) {
    const r = rng(9), m = Math.max(w, h);
    for (let i = 0; i < 34; i++) {
      const x = r() * w, y = r() * h, s = m * (0.012 + r() * 0.035);
      ctx.fillStyle = `hsla(${330 + r() * 30},100%,${65 + r() * 15}%,${0.35 + r() * 0.45})`;
      heart(ctx, x, y, s);
    }
  } },
];

// ---------- 換背景：CC0 授權的實拍照片（來源見 README），放在 bg/ ----------
export const BG_PHOTOS = [
  ['beach', '海邊'], ['sunset', '夕陽海'], ['sakura', '櫻花道'], ['blossom', '櫻花'], ['lavender', '薰衣草'], ['meadow', '草原'],
  ['lake', '湖光山色'], ['sky', '藍天'], ['snow', '雪林'], ['autumn', '秋天'], ['paris', '巴黎'], ['cafe', '咖啡廳'],
  ['whitecafe', '白色咖啡廳'], ['tokyo', '東京夜街'], ['rain', '雨夜街頭'], ['citylights', '城市光斑'],
].map(([id, name]) => ({ id, name, src: `bg/${id}.jpg` }));

// ---------- 雙重曝光用的第二張圖（使用者也可以自己選照片） ----------
export const EXPOSURES = [
  { id: 'forest', name: '山林', draw(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6efe4'); g.addColorStop(1, '#d8e3e6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const r = rng(21);
    [['#9bb3b8', 0.45], ['#5f7f86', 0.58], ['#2f4a52', 0.72], ['#15262c', 0.86]].forEach(([c, base], k) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h);
      let y = h * base;
      for (let x = 0; x <= w; x += w / 60) { y += (r() - 0.5) * h * 0.03; y = Math.min(h * (base + 0.06), Math.max(h * (base - 0.12), y)); ctx.lineTo(x, y); }
      ctx.lineTo(w, h); ctx.fill();
      if (k >= 2) for (let i = 0; i < 26; i++) { // 松樹
        const x = r() * w, s = h * (0.06 + r() * 0.08) * (k - 1) * 0.6, yb = h * (base + 0.04);
        ctx.beginPath(); ctx.moveTo(x, yb - s); ctx.lineTo(x + s * 0.28, yb); ctx.lineTo(x - s * 0.28, yb); ctx.fill();
      }
    });
  } },
  { id: 'stars', name: '星空', draw(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0a0f2c'); g.addColorStop(1, '#3a1d5c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.6);
    const m = Math.max(w, h), mw = ctx.createLinearGradient(0, -m * 0.12, 0, m * 0.12);
    mw.addColorStop(0, 'rgba(0,0,0,0)'); mw.addColorStop(0.5, 'rgba(190,170,255,.35)'); mw.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mw; ctx.fillRect(-m, -m * 0.12, m * 2, m * 0.24); ctx.restore();
    const r = rng(17);
    for (let i = 0; i < 600; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; ctx.beginPath(); ctx.arc(r() * w, r() * h, m * 0.0012 * (1 + r() * 2), 0, 7); ctx.fill(); }
  } },
  { id: 'flowers', name: '花海', draw(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe9f1'); g.addColorStop(1, '#ffd0de');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const r = rng(31), m = Math.max(w, h);
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, s = m * (0.01 + r() * 0.03), hue = [340, 10, 290, 45][i % 4];
      ctx.fillStyle = `hsla(${hue},80%,${55 + r() * 20}%,.9)`;
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.55, s * 0.32, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(x, y, s * 0.25, 0, 7); ctx.fill();
    }
  } },
];

export function paint(list, id, w, h) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  list.find(x => x.id === id).draw(ctx, c.width, c.height);
  return c;
}

// ---------- 邊框 ----------
// geom：照片 w×h 加上邊框後的整張大小 W×H，照片放在 (x, y)
// back：畫在照片底下；front：畫在照片上面（底片的字、拍立得的日期）
const pad = (l, t, r, b) => (w, h) => { const u = Math.min(w, h); return { W: w + (l + r) * u, H: h + (t + b) * u, x: l * u, y: t * u }; };
const fill = c => (ctx, g) => { ctx.fillStyle = c; ctx.fillRect(0, 0, g.W, g.H); };
function canvasFit(A) {
  return (w, h) => {
    const m = 0.07;
    const W = Math.max(w / (1 - 2 * m), A * h / (1 - 2 * m)), H = W / A;
    return { W, H, x: (W - w) / 2, y: (H - h) / 2 };
  };
}
// 把照片放大鋪滿再糊掉：先縮很小再放大，iPhone 也能跑
function blurBack(ctx, g, src) {
  const s = Math.min(1, 28 / Math.max(g.W, g.H));
  let t = canvas(g.W * s, g.H * s);
  const k = Math.max(g.W / src.width, g.H / src.height), dw = src.width * k * s, dh = src.height * k * s;
  const mid = canvas(Math.min(src.width, 128), Math.min(src.width, 128) * src.height / src.width);
  mid.getContext('2d').drawImage(src, 0, 0, mid.width, mid.height);
  t.getContext('2d').drawImage(mid, (t.width - dw) / 2, (t.height - dh) / 2, dw, dh);
  // 一次放大兩倍，放到夠大，邊緣才不會一格一格的
  while (t.width < 400 && t.width < g.W) {
    const n = canvas(t.width * 2, t.height * 2), nc = n.getContext('2d');
    nc.imageSmoothingQuality = 'high'; nc.drawImage(t, 0, 0, n.width, n.height); t = n;
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(t, 0, 0, g.W, g.H);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, g.W, g.H);
  ctx.restore();
}
const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

export const FRAMES = [
  { id: 'white', name: '白邊', geom: pad(0.05, 0.05, 0.05, 0.05), back: fill('#ffffff') },
  { id: 'black', name: '黑邊', geom: pad(0.05, 0.05, 0.05, 0.05), back: fill('#111111') },
  { id: 'polaroid', name: '拍立得', geom: pad(0.06, 0.06, 0.06, 0.28), back: fill('#fbfaf6'),
    front(ctx, g, w, h) {
      const u = Math.min(w, h);
      ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(g.x, g.y, w, Math.max(1, u * 0.004));
      ctx.font = `${u * 0.075}px "Bradley Hand","Segoe Print","Comic Sans MS",cursive`;
      ctx.fillStyle = '#6b6b6b'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(today(), g.x + w, g.y + h + u * 0.14);
    } },
  { id: 'film', name: '底片', geom: pad(0.04, 0.15, 0.04, 0.15), back: fill('#121212'),
    front(ctx, g, w, h) {
      const u = Math.min(w, h), hw = u * 0.045, hh = u * 0.06, gap = u * 0.11;
      ctx.fillStyle = '#e8e2d4';
      for (let x = gap / 2; x < g.W; x += gap) for (const y of [u * 0.035, g.H - u * 0.035 - hh]) {
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, hw, hh, hw * 0.25) : ctx.rect(x, y, hw, hh); ctx.fill();
      }
      ctx.fillStyle = '#ff9b3d'; ctx.font = `600 ${u * 0.038}px ui-monospace,Menlo,monospace`; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText('隨手修 400', g.x, g.y - u * 0.035);
      ctx.textAlign = 'right'; ctx.fillText('▸ 12A', g.x + w, g.y + h + u * 0.035);
    } },
  { id: 'canvas11', name: '模糊 1:1', geom: canvasFit(1), back: blurBack, shadow: true, live: true },
  { id: 'canvas45', name: '模糊 4:5', geom: canvasFit(4 / 5), back: blurBack, shadow: true, live: true },
  { id: 'canvas916', name: '模糊 9:16', geom: canvasFit(9 / 16), back: blurBack, shadow: true, live: true },
  { id: 'gallery', name: '畫廊', geom: pad(0.14, 0.14, 0.14, 0.14), shadow: true, back(ctx, g) {
    const gr = ctx.createLinearGradient(0, 0, 0, g.H); gr.addColorStop(0, '#f1ece4'); gr.addColorStop(1, '#e3dbcf');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, g.W, g.H);
  } },
  { id: 'vintage', name: '復古相紙', geom: pad(0.07, 0.07, 0.07, 0.07), back(ctx, g) {
    ctx.fillStyle = '#efe4cc'; ctx.fillRect(0, 0, g.W, g.H);
    const r = rng(8);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(120,90,40,${r() * 0.08})`; ctx.fillRect(r() * g.W, r() * g.H, g.W * 0.004, g.W * 0.004); }
  }, front(ctx, g, w, h) {
    const u = Math.min(w, h);
    ctx.strokeStyle = 'rgba(110,80,40,.45)'; ctx.lineWidth = u * 0.004;
    ctx.strokeRect(g.x - u * 0.025, g.y - u * 0.025, w + u * 0.05, h + u * 0.05);
  } },
];
export const frameById = id => FRAMES.find(f => f.id === id);

// 畫整張邊框；photo 有給就把照片也畫進去（存檔、縮圖用），沒給就留空（畫面上照片是另一層）
export function drawFrame(ctx, f, w, h, src, photo) {
  const g = f.geom(w, h);
  f.back(ctx, g, src);
  if (f.shadow) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.min(w, h) * 0.05; ctx.shadowOffsetY = Math.min(w, h) * 0.015;
    ctx.fillStyle = '#000'; ctx.fillRect(g.x, g.y, w, h); ctx.restore();
  }
  if (photo) photo(ctx, g);
  f.front?.(ctx, g, w, h);
  return g;
}
