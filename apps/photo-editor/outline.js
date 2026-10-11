// 描邊：先從透明度算出「每個點離主體多遠」（距離場），再依距離畫出各種邊
// 實線、雙層、發光這類直接看距離上色；虛線、圓點、星光、愛心沿著輪廓線一個一個擺
// 全部自己算，不用別家的素材或 shader

// 醒圖把描邊分成「基本」和「進階」兩組
export const STROKES = [
  { id: 'solid', name: '實線', g: 'basic' },
  { id: 'double', name: '雙層', g: 'basic' },
  { id: 'dash', name: '虛線', g: 'basic' },
  { id: 'dot', name: '圓點', g: 'basic' },
  { id: 'glow', name: '發光', g: 'basic' },
  { id: 'shadow', name: '投影', g: 'basic' },
  { id: 'sticker', name: '貼紙', g: 'fx' },
  { id: 'neon', name: '霓虹', g: 'fx' },
  { id: 'rainbow', name: '彩虹', g: 'fx' },
  { id: 'sparkle', name: '星光', g: 'fx' },
  { id: 'hearts', name: '愛心', g: 'fx' },
  { id: 'gradient', name: '漸層', g: 'fx' },
];
export const STROKE_COLORS = ['#ffffff', '#111111', '#ff5c8a', '#ffb36b', '#ffe066', '#69db7c', '#4dabf7', '#b197fc', '#ff3b30', '#ff9ec7'];
// 預設：白色實線，粗細 40（約主體長邊的 2%）
export const STROKE0 = { t: '', c: '#ffffff', w: 40, o: 100 };

const GRID = 1024; // 距離場最多算到 1024 邊長，再放大貼回去，邊緣用平滑放大

// 粗細 0~100 對到像素：主體長邊的 0~5%
export const strokePx = (st, W, H) => Math.max(1, st.w / 100 * 0.05 * Math.max(W, H));
// 描邊會往外長多少，外框要留這麼多空間
export function strokePad(st, W, H) {
  if (!st?.t) return 0;
  const w = strokePx(st, W, H);
  const k = { glow: 2.6, neon: 2.6, shadow: 1.8, sticker: 2.2, sparkle: 2, hearts: 2 }[st.t] || 1.2;
  return Math.ceil(w * k + 4);
}

// 一維平方距離轉換（Felzenszwalb & Huttenlocher）
function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s;
    while ((s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// 每個點到最近「主體」點的距離（像素），inside[i] 為真代表是主體
export function edt(inside, w, h) {
  const INF = 1e20, n = Math.max(w, h), g = new Float32Array(w * h);
  const f = new Float32Array(n), d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    dt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    dt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]);
  }
  return g;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 輪廓線：在距離場上用 marching squares 找出「距離 = off」的等高線，接成一條條封閉曲線
function contours(D, w, h, off) {
  const val = (x, y) => off - D[y * w + x]; // 正的是輪廓裡面
  const segs = [], ends = new Map();
  const pt = (x, y, e) => { // e：0 上邊、1 右邊、2 下邊、3 左邊
    const [ax, ay, bx, by] = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]][e];
    const va = val(ax, ay), vb = val(bx, by), t = va / (va - vb);
    const id = e === 0 ? (y * w + x) * 2 : e === 2 ? ((y + 1) * w + x) * 2 : e === 3 ? (y * w + x) * 2 + 1 : (y * w + x + 1) * 2 + 1;
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, id };
  };
  const TABLE = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[3, 0]], [[3, 0]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const c = (val(x, y) > 0 ? 8 : 0) | (val(x + 1, y) > 0 ? 4 : 0) | (val(x + 1, y + 1) > 0 ? 2 : 0) | (val(x, y + 1) > 0 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    let pairs = TABLE[c];
    if (!pairs) { // 馬鞍點：看格子中心在裡面還是外面
      const mid = (val(x, y) + val(x + 1, y) + val(x + 1, y + 1) + val(x, y + 1)) / 4 > 0;
      pairs = c === 5 ? (mid ? [[3, 0], [2, 1]] : [[3, 2], [0, 1]]) : (mid ? [[0, 1], [3, 2]] : [[3, 0], [2, 1]]);
    }
    for (const [a, b] of pairs) {
      const s = [pt(x, y, a), pt(x, y, b)], i = segs.length;
      segs.push(s);
      for (const p of s) { const l = ends.get(p.id); if (l) l.push(i); else ends.set(p.id, [i]); }
    }
  }
  const used = new Uint8Array(segs.length), lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    let tail = segs[i][1];
    for (;;) {
      const nx = (ends.get(tail.id) || []).find(j => !used[j]);
      if (nx === undefined) break;
      used[nx] = 1;
      const s = segs[nx], q = s[0].id === tail.id ? s[1] : s[0];
      line.push(q); tail = q;
    }
    if (line.length > 6) lines.push(line);
  }
  return lines;
}
// 去掉太密的點，再做一次 Chaikin 平滑，線條不會有鋸齒
function tidy(line, step) {
  const out = [line[0]];
  for (const p of line) { const q = out[out.length - 1]; if (Math.hypot(p.x - q.x, p.y - q.y) >= step) out.push(p); }
  const sm = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    sm.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return sm;
}
// 沿著線每隔 gap 放一個點
function along(line, gap, cb) {
  let left = gap * 0.5, n = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[i], b = line[(i + 1) % line.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = 0;
    while (left <= L - t) { t += left; left = gap; const k = t / L; cb(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, Math.atan2(b.y - a.y, b.x - a.x), n++); }
    left -= L - t;
  }
}
function heartPath(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.38);
  ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
  ctx.fill(); ctx.restore();
}
function sparklePath(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y); ctx.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y); ctx.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r);
  ctx.fill();
}

// src：有透明度的圖（主體不透明、背景透明）。回傳只有描邊的圖，四周各多 pad 像素
export function strokeLayer(src, st, pad = strokePad(st, src.width, src.height)) {
  const W = src.width, H = src.height, OW = W + pad * 2, OH = H + pad * 2;
  const out = canvas(OW, OH);
  if (!st?.t) return { canvas: out, pad };
  const wpx = strokePx(st, W, H);
  // 在縮小的格子上算距離場
  const k = Math.min(1, GRID / Math.max(OW, OH)), gw = Math.max(2, Math.round(OW * k)), gh = Math.max(2, Math.round(OH * k));
  const g = canvas(gw, gh), gc = g.getContext('2d', { willReadFrequently: true });
  gc.imageSmoothingQuality = 'high';
  gc.drawImage(src, pad * k, pad * k, W * k, H * k);
  const a = gc.getImageData(0, 0, gw, gh).data, N = gw * gh, inside = new Uint8Array(N), A = new Float32Array(N);
  for (let i = 0; i < N; i++) { A[i] = a[i * 4 + 3] / 255; inside[i] = A[i] >= 0.5; }
  const Dg = edt(inside, gw, gh), D = new Float32Array(N);
  // 換回原尺寸的像素，半透明邊緣補上次像素的距離，線條比較圓滑
  for (let i = 0; i < N; i++) D[i] = inside[i] ? (0.5 - A[i]) / k : Math.max(0, Dg[i] - 0.5 + A[i]) / k;
  const aa = 1 / k; // 反鋸齒寬度約一格
  const [r, gg, b] = hex(st.c || '#ffffff'), op = (st.o ?? 100) / 100;
  const img = gc.createImageData(gw, gh), o = img.data;
  const put = (i, R, G, B, al) => {
    // 疊在已經畫的顏色上面（一般混合）
    const a0 = o[i * 4 + 3] / 255, an = al + a0 * (1 - al);
    if (an <= 0) return;
    o[i * 4] = (R * al + o[i * 4] * a0 * (1 - al)) / an; o[i * 4 + 1] = (G * al + o[i * 4 + 1] * a0 * (1 - al)) / an;
    o[i * 4 + 2] = (B * al + o[i * 4 + 2] * a0 * (1 - al)) / an; o[i * 4 + 3] = an * 255;
  };
  const band = d => sat((wpx - d) / aa + 0.5);
  const t = st.t;
  if (t === 'solid' || t === 'double' || t === 'sticker' || t === 'rainbow' || t === 'gradient' || t === 'neon' || t === 'glow' || t === 'shadow') {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x, d = D[i];
      if (t === 'solid') put(i, r, gg, b, band(d));
      else if (t === 'double') { // 內圈白、外圈選的顏色
        put(i, r, gg, b, band(d));
        put(i, 255, 255, 255, sat((wpx * 0.45 - d) / aa + 0.5));
      } else if (t === 'sticker') { // 白色厚邊加一點陰影，像剪下來的貼紙
        const sd = D[Math.max(0, i - Math.round(wpx * 0.35 * k) * gw)];
        put(i, 0, 0, 0, 0.28 * (1 - smooth(wpx * 0.6, wpx * 2.1, sd)));
        put(i, 255, 255, 255, band(d));
      } else if (t === 'rainbow') {
        const h = ((x / gw) * 140 + (y / gh) * 300) % 360;
        const [R, G, B] = hsl(h, 0.9, 0.6);
        put(i, R, G, B, band(d));
      } else if (t === 'gradient') { // 上面選的顏色，往下漸變成白
        const m = y / gh;
        put(i, r + (255 - r) * m, gg + (255 - gg) * m, b + (255 - b) * m, band(d));
      } else if (t === 'glow') {
        const e = 1 - smooth(0, wpx * 2.4, d);
        put(i, r, gg, b, Math.pow(e, 1.6) * 0.95);
      } else if (t === 'neon') { // 外面一圈彩色光暈，貼著主體一條白色細線
        put(i, r, gg, b, Math.pow(1 - smooth(wpx * 0.2, wpx * 2.5, d), 1.8) * 0.9);
        put(i, r + (255 - r) * 0.6, gg + (255 - gg) * 0.6, b + (255 - b) * 0.6, sat((wpx * 0.55 - d) / aa + 0.5));
        put(i, 255, 255, 255, sat((wpx * 0.28 - d) / aa + 0.5));
      } else if (t === 'shadow') { // 往右下偏移的實心影子
        const off = Math.round(wpx * 0.9 * k), sx = x - off, sy = y - off;
        const sd = sx >= 0 && sy >= 0 ? D[sy * gw + sx] : 1e9;
        put(i, r, gg, b, sat((wpx * 0.25 - sd) / aa + 0.5));
      }
    }
    gc.putImageData(img, 0, 0);
  } else gc.clearRect(0, 0, gw, gh);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = op;
  ctx.drawImage(g, 0, 0, OW, OH);
  // 沿輪廓擺東西的樣式：直接畫在原尺寸上，才會清楚
  if (t === 'dash' || t === 'dot' || t === 'sparkle' || t === 'hearts') {
    const off = { dash: wpx * 0.75, dot: wpx * 0.8, sparkle: wpx * 0.9, hearts: wpx * 1.0 }[t] * k;
    const lines = contours(Dg.map((v, i) => inside[i] ? 0 : v), gw, gh, off).map(l => tidy(l, 1.2).map(p => ({ x: p.x / k, y: p.y / k })));
    ctx.fillStyle = ctx.strokeStyle = st.c;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const L of lines) {
      if (t === 'dash') {
        ctx.lineWidth = Math.max(1.5, wpx * 0.5); ctx.setLineDash([wpx * 1.3, wpx * 1.1]);
        ctx.beginPath(); L.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      } else if (t === 'dot') {
        along(L, wpx * 1.25, (x, y) => { ctx.beginPath(); ctx.arc(x, y, wpx * 0.42, 0, 7); ctx.fill(); });
      } else if (t === 'sparkle') { // 大小星星交錯，中間夾小圓點
        along(L, wpx * 1.4, (x, y, _, n) => {
          ctx.fillStyle = n % 3 === 1 ? '#ffffff' : st.c;
          if (n % 2) { ctx.beginPath(); ctx.arc(x, y, wpx * 0.18, 0, 7); ctx.fill(); }
          else sparklePath(ctx, x, y, wpx * (n % 4 ? 0.7 : 1.05));
        });
      } else if (t === 'hearts') {
        along(L, wpx * 1.7, (x, y, rot) => heartPath(ctx, x, y, wpx * 1.25, rot));
      }
    }
  }
  return { canvas: out, pad };
}

function hsl(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}

// 主體加上描邊：描邊在後、主體在前
export function outlined(src, st) {
  const { canvas: c, pad } = strokeLayer(src, st);
  c.getContext('2d').drawImage(src, pad, pad);
  return { canvas: c, pad };
}

// 灰階摳圖結果（R 通道是透明度）轉成真正的透明度
export function alphaFromMatte(m) {
  const c = canvas(m.width, m.height), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(m, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
// 透明度大於門檻的範圍（像素），沒有東西回傳 null
export function alphaBox(c, th = 10) {
  const k = Math.min(1, 512 / Math.max(c.width, c.height)), w = Math.max(1, Math.round(c.width * k)), h = Math.max(1, Math.round(c.height * k));
  const t = canvas(w, h), ctx = t.getContext('2d', { willReadFrequently: true }); ctx.drawImage(c, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const X0 = Math.max(0, Math.floor((x0 - 1) / k)), Y0 = Math.max(0, Math.floor((y0 - 1) / k));
  const X1 = Math.min(c.width, Math.ceil((x1 + 2) / k)), Y1 = Math.min(c.height, Math.ceil((y1 + 2) / k));
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}
