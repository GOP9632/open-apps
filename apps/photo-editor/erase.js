// 消除筆：塗抹、框選、橡皮擦選出要消除的地方，或自動圈出路人，再用 MI-GAN 修補模型補上背景
// MI-GAN（Picsart，MIT 授權）在瀏覽器裡跑，照片不會上傳。模型第一次用時下載約 28MB，之後瀏覽器會快取
import { pinch, stageZoom } from './ui.js';
import { segment } from './ai.js';
import { LOW_MEM } from './matte.js';
import { fillErase, miganErase, ortSession } from './erasemix.js';

const MASK_SIDE = 2048;  // 選區畫布最長邊
const RUN_SIDE = 1024;   // 送進模型的範圍最長邊，太大手機記憶體不夠
const PATCH_SIDE = 640;  // iPhone、iPad 改用方塊補洞時的範圍最長邊
// iPhone、iPad：MI-GAN 跑一次要多 500MB 以上記憶體，Safari 會直接重新載入頁面，
// 所以改用 patchfill.js（從周圍找相似的小方塊補），不下載模型
export const ERASE_LITE = LOW_MEM;
const MASK_RGB = '255,64,110';

// 消除自己一條背景執行緒（erasework.js，評審 M51）：補洞、外擴、羽化都在那裡算，按「立即消除」畫面不停。
// 以前 iPhone 跟找臉、膚質、頭髮共用一條，開照片後那幾件還在算，消除要排在後面等 3～5 秒；電腦的 MI-GAN 在這裡跑，畫面停 1 秒。
// 開不了（很舊的瀏覽器）、出錯或太久沒回應，就在這裡算
let ew, eN = 0, modelOn = false;
const eWait = new Map();
function eraseWorker() {
  if (ew !== undefined) return ew;
  ew = false;
  try {
    const w = new Worker(new URL('./erasework.js', import.meta.url), { type: 'module' });
    w.onmessage = e => { const r = eWait.get(e.data.id); eWait.delete(e.data.id); r?.(e.data); };
    w.onerror = e => { console.warn('erasework', e.message); ew = false; eWait.forEach(r => r({ err: 'worker' })); eWait.clear(); };
    ew = w;
  } catch (e) { console.warn(e); }
  return ew;
}
function work(op, a, ms) {
  const w = eraseWorker();
  if (!w) return Promise.resolve({ err: 'worker' });
  return new Promise(res => {
    const id = ++eN; eWait.set(id, res); setTimeout(() => eWait.delete(id) && res({ err: 'timeout' }), ms);
    w.postMessage({ id, op, a });
  });
}
// 進消除分頁先暖機：iPhone 用小圖補一次（頭一次跑特別慢）；電腦下載過模型的話先在背景建好（從瀏覽器快取讀，不用等網路）
const MODEL_KEY = 'pe-migan';
function warm() {
  if (eN) return;
  let had = false;
  try { had = !ERASE_LITE && localStorage.getItem(MODEL_KEY) === '1'; } catch {}
  if (had) modelOn = true;
  if (ERASE_LITE || had) work('warm', { model: had }, 60000).then(r => { if (r.err) console.warn('erase warm', r.err); });
}

const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
// 選區（和下筆前的備份）放記憶體：按「立即消除」、橡皮擦放開時要讀回來，放 GPU 的話每讀一次都要等 GPU 把畫面畫完（評審 M51）。
// 畫面上看到的選區是另一張（ov），塗的時候兩張一起畫
const memCanvas = (w, h) => { const c = newCanvas(w, h); c.getContext('2d', { willReadFrequently: true }); return c; };

// 選區的外框（用 alpha 判斷），沒有選區回傳 null。r：[x0, y0, x1, y1] 只看這一塊（選區畫布的像素）。
// 整張 2048 像素的遮罩從 GPU 讀回來要幾十毫秒，塗完一筆放開時會頓一下，所以盡量只讀畫過的那一塊
function maskBox(mask, r) {
  const w = mask.width, h = mask.height, rx = r ? Math.max(0, Math.floor(r[0])) : 0, ry = r ? Math.max(0, Math.floor(r[1])) : 0;
  const rw = (r ? Math.min(w, Math.ceil(r[2])) : w) - rx, rh = (r ? Math.min(h, Math.ceil(r[3])) : h) - ry;
  if (rw <= 0 || rh <= 0) return null;
  const d = new Uint32Array(mask.getContext('2d', { willReadFrequently: true }).getImageData(rx, ry, rw, rh).data.buffer);
  let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
  for (let y = 0; y < rh; y++) for (let x = 0, o = y * rw; x < rw; x++) {
    if ((d[o + x] >>> 24) > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? null : { x: (rx + x0) / w, y: (ry + y0) / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
}

// 瘦臉、臉型、推臉、身體這些變形開著時，畫面上的點不在原圖同一個位置（評審 2026-10-27）。
// 選區照畫面塗，消除前換回原圖座標；路人遮罩反過來從原圖換到畫面。
// 畫面切成 8 像素的小格，只有格點用 map（app.js srcMapper：畫面 → 原圖）換算，格子裡面照格點內插
const CELL = 8;
// 格點換到原圖後的位置（選區畫布的像素）。x0..x1、y0..y1 是要算的格子範圍（第幾格），cell 是一格幾像素
function meshOf(map, w, h, k, x0, y0, x1, y1, cell = CELL) {
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, g = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = map({ x: Math.min(w, (x0 + i) * cell) / k, y: Math.min(h, (y0 + j) * cell) / k }), o = (j * nx + i) * 2;
    g[o] = p.x * k; g[o + 1] = p.y * k;
  }
  return { x0, y0, nx, ny, g };
}
// 畫面座標的選區 → 原圖座標：每一格拆兩個三角形，在原圖那邊一點一點填，回頭看畫面上那一點有沒有選。
// 只讀、只寫選區附近那一塊（整張 2048 像素的遮罩讀寫一次就要幾十毫秒）。回傳 [新選區, 有選的範圍]
function maskToSrc(mask, map, W, r) {
  const box = maskBox(mask, r);
  if (!box) return [mask, r];
  const w = mask.width, h = mask.height, k = w / W;
  const m = meshOf(map, w, h, k, Math.floor(box.x * w / CELL), Math.floor(box.y * h / CELL), Math.ceil((box.x + box.w) * w / CELL), Math.ceil((box.y + box.h) * h / CELL));
  // 畫面這邊要讀的範圍（格子範圍）、原圖那邊要寫的範圍（格點換過去之後的外框）
  const rx = m.x0 * CELL, ry = m.y0 * CELL, rw = Math.min(w, (m.x0 + m.nx - 1) * CELL) - rx, rh = Math.min(h, (m.y0 + m.ny - 1) * CELL) - ry;
  const d = mask.getContext('2d', { willReadFrequently: true }).getImageData(rx, ry, rw, rh).data;
  let ox0 = w, oy0 = h, ox1 = 0, oy1 = 0;
  for (let i = 0; i < m.g.length; i += 2) { ox0 = Math.min(ox0, m.g[i]); ox1 = Math.max(ox1, m.g[i]); oy0 = Math.min(oy0, m.g[i + 1]); oy1 = Math.max(oy1, m.g[i + 1]); }
  ox0 = Math.max(0, Math.floor(ox0)); oy0 = Math.max(0, Math.floor(oy0)); ox1 = Math.min(w, Math.ceil(ox1) + 1); oy1 = Math.min(h, Math.ceil(oy1) + 1);
  const c = newCanvas(w, h);
  if (ox1 <= ox0 || oy1 <= oy0) return [c, null];
  const ow = ox1 - ox0, oh = oy1 - oy0, od = new ImageData(ow, oh), o = od.data;
  const tri = (ax, ay, bx, by, cx, cy, pa, pb, pc) => {
    // a、b、c 是原圖上的三個角，pa、pb、pc 是同一個角在畫面上的位置
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-6) return;
    const X0 = Math.max(ox0, Math.floor(Math.min(ax, bx, cx))), X1 = Math.min(ox1 - 1, Math.ceil(Math.max(ax, bx, cx)));
    const Y0 = Math.max(oy0, Math.floor(Math.min(ay, by, cy))), Y1 = Math.min(oy1 - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, u = (px * (cy - ay) - py * (cx - ax)) / det, v = ((bx - ax) * py - (by - ay) * px) / det;
      if (u < -1e-3 || v < -1e-3 || u + v > 1.001) continue;
      const sx = Math.min(rw - 1, Math.max(0, Math.floor(pa[0] + (pb[0] - pa[0]) * u + (pc[0] - pa[0]) * v - rx)));
      const sy = Math.min(rh - 1, Math.max(0, Math.floor(pa[1] + (pb[1] - pa[1]) * u + (pc[1] - pa[1]) * v - ry)));
      const a = d[(sy * rw + sx) * 4 + 3], i = ((y - oy0) * ow + x - ox0) * 4;
      if (a > o[i + 3]) { o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = a; }
    }
  };
  for (let j = 0; j < m.ny - 1; j++) for (let i = 0; i < m.nx - 1; i++) {
    const v = (a, b) => [m.g[((j + b) * m.nx + i + a) * 2], m.g[((j + b) * m.nx + i + a) * 2 + 1]];
    const X = (m.x0 + i) * CELL, Y = (m.y0 + j) * CELL, s = (a, b) => [Math.min(w, X + a * CELL), Math.min(h, Y + b * CELL)];
    const A = v(0, 0), B = v(1, 0), C = v(0, 1), D = v(1, 1);
    tri(A[0], A[1], B[0], B[1], C[0], C[1], s(0, 0), s(1, 0), s(0, 1));
    tri(B[0], B[1], D[0], D[1], C[0], C[1], s(1, 0), s(1, 1), s(0, 1));
  }
  c.getContext('2d', { willReadFrequently: true }).putImageData(od, ox0, oy0);
  return [c, [ox0, oy0, ox1, oy1]];
}
// 原圖座標的遮罩（跟選區畫布一樣大、只有全有全無，r 是它的範圍）→ 畫面座標。回傳 [新遮罩, 有選的範圍]。
// 畫面上每一點照格點內插出原圖的點去讀。整張都算要 50000 個格點，太慢（點一下要頓 0.2 秒）：
// 先用粗格子量變形最多推多遠，只算遮罩附近那一塊；格子放大成 16 像素，格子裡一列一列直線走
function maskToView(src, r, map, W) {
  const w = src.width, h = src.height, k = w / W, C4 = CELL * 8, cg = meshOf(map, w, h, k, 0, 0, Math.ceil(w / C4), Math.ceil(h / C4), C4);
  let D = 0;
  for (let j = 0; j < cg.ny; j++) for (let i = 0; i < cg.nx; i++) { const o = (j * cg.nx + i) * 2; D = Math.max(D, Math.abs(cg.g[o] - Math.min(w, i * C4)), Math.abs(cg.g[o + 1] - Math.min(h, j * C4))); }
  D += 2 * C4;  // 粗格子中間可能推得更遠，多留一點
  const VC = CELL * 2, [sx0, sy0] = r, sw = r[2] - sx0, sh = r[3] - sy0;
  const sd = new Uint32Array(src.getContext('2d', { willReadFrequently: true }).getImageData(sx0, sy0, sw, sh).data.buffer);
  const m = meshOf(map, w, h, k, Math.max(0, Math.floor((sx0 - D) / VC)), Math.max(0, Math.floor((sy0 - D) / VC)), Math.min(Math.ceil(w / VC), Math.ceil((sx0 + sw + D) / VC)), Math.min(Math.ceil(h / VC), Math.ceil((sy0 + sh + D) / VC)), VC);
  const X0 = m.x0 * VC, Y0 = m.y0 * VC, ow = Math.min(w, (m.x0 + m.nx - 1) * VC) - X0, oh = Math.min(h, (m.y0 + m.ny - 1) * VC) - Y0;
  const od = new ImageData(ow, oh), o = new Uint32Array(od.data.buffer), g = m.g, nx = m.nx;
  let bx0 = ow, by0 = oh, bx1 = -1, by1 = -1;
  for (let j = 0; j < m.ny - 1; j++) {
    const cy = j * VC, ch = Math.min(oh, cy + VC) - cy;
    for (let yy = 0; yy < ch; yy++) {
      const fy = (yy + 0.5) / ch, f1 = 1 - fy, row = (cy + yy) * ow;
      for (let i = 0; i < nx - 1; i++) {
        const cx = i * VC, cw = Math.min(ow, cx + VC) - cx, p = (j * nx + i) * 2, q = p + nx * 2;
        // 這一列在這一格的左右兩端換到原圖哪裡，中間照直線走
        const lx = g[p] * f1 + g[q] * fy - sx0, ly = g[p + 1] * f1 + g[q + 1] * fy - sy0;
        const dx = (g[p + 2] * f1 + g[q + 2] * fy - sx0 - lx) / cw, dy = (g[p + 3] * f1 + g[q + 3] * fy - sy0 - ly) / cw;
        let px = lx + dx * 0.5, py = ly + dy * 0.5;
        for (let xx = 0; xx < cw; xx++, px += dx, py += dy) {
          if (px < 0 || py < 0 || px >= sw || py >= sh || (sd[(py | 0) * sw + (px | 0)] >>> 24) <= 127) continue;
          const x = cx + xx, y = cy + yy;
          o[row + x] = 0xffffffff;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }
    }
  }
  const c = newCanvas(w, h);
  c.getContext('2d', { willReadFrequently: true }).putImageData(od, X0, Y0);
  return [c, bx1 < 0 ? null : [X0 + bx0, Y0 + by0, X0 + bx1 + 1, Y0 + by1 + 1]];
}

// 把選區描邊變粗（路人遮罩往外長一點）
function grow(mask, w, h, px) {
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2;
    ctx.drawImage(mask, Math.cos(a) * px, Math.sin(a) * px, w, h);
  }
  ctx.drawImage(mask, 0, 0, w, h);
  return c;
}

// src：照片 canvas；mask：任意大小、跟照片同比例的選區（alpha > 0 的地方要消除）；box：選區的外框（maskBox 算的）
// 回傳 { x, y, w, h, soft }：照片 (x, y) 開始 w×h 那塊要疊上去的 RGBA（選區以外透明、邊緣羽化，不預乘），
// app 只換那一塊（評審 M51：以前在這裡用 canvas 外擴、模糊、疊回，再新建一整張照片重畫，按下去畫面停 0.6 秒以上）
export async function inpaint(src, mask, box) {
  if (!box) return null;
  const W = src.width, H = src.height;
  // 取選區周圍一圈當參考，模型才知道背景長什麼樣
  const bw = box.w * W, bh = box.h * H, pad = Math.max(64, 0.6 * Math.max(bw, bh));
  const x0 = Math.max(0, Math.floor(box.x * W - pad)), y0 = Math.max(0, Math.floor(box.y * H - pad));
  const x1 = Math.min(W, Math.ceil((box.x + box.w) * W + pad)), y1 = Math.min(H, Math.ceil((box.y + box.h) * H + pad));
  const cw = x1 - x0, ch = y1 - y0, k = Math.min(1, (ERASE_LITE ? PATCH_SIDE : RUN_SIDE) / Math.max(cw, ch));
  const w = Math.max(8, Math.round(cw * k)), h = Math.max(8, Math.round(ch * k)), n = w * h;

  const ic = newCanvas(w, h), ictx = ic.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(src, x0, y0, cw, ch, 0, 0, w, h);
  const id = ictx.getImageData(0, 0, w, h).data;
  // 選區對到這塊範圍
  const mk = mask.width / W, mc = newCanvas(w, h), mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(mask, x0 * mk, y0 * mk, cw * mk, ch * mk, 0, 0, w, h);
  const md = mctx.getImageData(0, 0, w, h).data, ma = new Uint8Array(n);
  for (let i = 0; i < n; i++) ma[i] = md[i * 4 + 3];
  // 補的範圍稍微蓋過物體邊緣（外擴），疊回去時邊緣羽化，接縫才看不出來
  const a = { d: id, m: ma, w, h, cw, ch, px: Math.max(2, Math.round(Math.max(w, h) / 200)), feather: Math.max(1.5, Math.max(cw, ch) / 400) };
  await new Promise(r => setTimeout(r, 30)); // 讓「消除中」先畫出來
  // 補洞、外擴、羽化在背景執行緒（MI-GAN 第一次要下載 28MB，給久一點）
  const r = await work(ERASE_LITE ? 'fill' : 'migan', a, ERASE_LITE ? 20000 : 180000);
  if (r.err) console.warn('erase', r.err);
  else if (!ERASE_LITE) { modelOn = true; try { localStorage.setItem(MODEL_KEY, '1'); } catch {} }
  return { x: x0, y: y0, w: cw, h: ch, soft: r.err ? (ERASE_LITE ? fillErase(a) : await miganErase(a, ortSession)) : r.out };
}

// 識別路人：人像分割切成一塊一塊，最大的一塊當主角，其他夠大的就是路人
export async function passersby(src) {
  const seg = await segment(src);
  const w = seg.w, h = seg.h, d = seg.person.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const lab = new Int32Array(w * h).fill(-1), sizes = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0 || d[i * 4] < 128) continue;
    const id = sizes.length; let cnt = 0;
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const p = stack.pop(); cnt++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && lab[q] < 0 && d[q * 4] >= 128) { lab[q] = id; stack.push(q); }
      }
    }
    sizes.push(cnt);
  }
  if (sizes.length < 2) return null;
  const main = sizes.indexOf(Math.max(...sizes)), min = w * h * 0.002;
  const c = newCanvas(w, h), ctx = c.getContext('2d'), o = ctx.createImageData(w, h);
  let any = false;
  for (let i = 0; i < w * h; i++) {
    const l = lab[i];
    if (l >= 0 && l !== main && sizes[l] >= min) { o.data[i * 4] = o.data[i * 4 + 1] = o.data[i * 4 + 2] = 255; o.data[i * 4 + 3] = 255; any = true; }
  }
  if (!any) return null;
  ctx.putImageData(o, 0, 0);
  // 往外長一點，把頭髮、衣服邊緣也包進來
  return grow(c, w, h, Math.max(2, Math.round(Math.max(w, h) / 150)));
}

// ---------- 面板 ----------
const ICON = {
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/></svg>',
  box: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M8 20h12"/><path d="M4.5 14.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5z"/><path d="M9 10l5 5"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/></svg>',
};

let st = null; // { b: 對應的照片, mask, bb: 畫過的範圍, ppl, pplS: 路人（選區大小、原圖座標）, pplSB: 它的範圍, pplV: 疊上去的路人（畫面座標）, pplOn, tool, size, ui }
function state(b) {
  if (st?.b === b) return st;
  const W = b.canvas.width, H = b.canvas.height, k = Math.min(1, MASK_SIDE / Math.max(W, H));
  // 換照片或消除完，工具和畫筆大小沿用
  st = { b, mask: memCanvas(W * k, H * k), bb: null, ppl: null, pplOn: false, pplP: null, tool: st?.tool || 'brush', size: st?.size ?? 20 };
  return st;
}
// 畫過的範圍（選區畫布的像素）：塗抹、框選、路人加進來，橡皮擦不縮（按「立即消除」時才在這一塊裡面算真正的外框）
const addBB = (x0, y0, x1, y1) => { const b = st.bb; st.bb = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1]; };
const hasMask = () => !!st?.bb;
// 路人遮罩只留全有、全無：邊緣半透明的話，關掉時扣不乾淨，會剩一圈淡淡的選區被拿去消除。回傳有選的範圍
function binarize(c) {
  const w = c.width, h = c.height, ctx = c.getContext('2d', { willReadFrequently: true }), id = ctx.getImageData(0, 0, w, h), d = new Uint32Array(id.data.buffer);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0, o = y * w; x < w; x++) {
    if ((d[o + x] >>> 24) > 127) { d[o + x] = 0xffffffff; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } else d[o + x] = 0;
  }
  ctx.putImageData(id, 0, 0);
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

let ov = null, ring = null;
function overlay() {
  if (ov) return ov;
  ov = document.createElement('canvas');
  ov.id = 'eraseOv';
  ov.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:3;touch-action:none;cursor:none;opacity:.55;display:none`;
  ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;z-index:4;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none;display:none;transform:translate(-50%,-50%)';
  // 圓圈放在不跟著照片縮放的那層，用螢幕座標畫（放大時才不會糊）
  document.querySelector('#wrap').append(ov); document.querySelector('#stage').append(ring);
  bindDraw();
  return ov;
}
function paintOverlay(rect) {
  if (!st) return;
  const m = st.mask;
  if (ov.width !== m.width || ov.height !== m.height) { ov.width = m.width; ov.height = m.height; }
  const ctx = ov.getContext('2d');
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.drawImage(m, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = `rgb(${MASK_RGB})`; ctx.fillRect(0, 0, ov.width, ov.height);
  ctx.globalCompositeOperation = 'source-over';
  if (rect) {
    ctx.fillStyle = `rgba(${MASK_RGB},.6)`; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([10, 8]); ctx.lineWidth = Math.max(2, ov.width / 300); ctx.strokeStyle = '#fff';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h); ctx.setLineDash([]);
  }
}
// 畫筆直徑：照片沒放大時是短邊的 0.6%～20%；照片放大幾倍筆刷就細幾倍
const brushPx = () => Math.min(st.mask.width, st.mask.height) * (0.006 + 0.194 * st.size / 100) / stageZoom.z;

function bindDraw() {
  let drag = null;
  // sx、sy 是在 #stage 裡的螢幕座標，k 是螢幕上一個照片像素多大（放大了也對）
  const pos = e => { const r = ov.getBoundingClientRect(), s = ring.parentNode.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * ov.width, y: (e.clientY - r.top) / r.height * ov.height, sx: e.clientX - s.left, sy: e.clientY - s.top, k: r.width / ov.width }; };
  const showRing = p => {
    if (!st || st.tool === 'box') { ring.style.display = 'none'; return; }
    const d = brushPx() * p.k;
    Object.assign(ring.style, { display: 'block', left: p.sx + 'px', top: p.sy + 'px', width: d + 'px', height: d + 'px' });
  };
  // 同一段同時畫進遮罩和畫面上的選區（顏色不同、疊法一樣），塗的時候不用每次把整張遮罩重新上色（評審 M33）；放開再整張對一次
  const stroke = (a, b) => {
    const w = brushPx();
    for (const [c, col] of [[st.mask, '#fff'], [ov, `rgb(${MASK_RGB})`]]) {
      const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = col; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (st.tool !== 'eraser') { const r = w / 2 + 2; addBB(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r); }
  };
  // 下筆前的遮罩（第二指放下要縮放時退回去）：一張畫布重複用，不用每一筆都配一張 2048 大的（評審 M33）
  let snap = null;
  ov.addEventListener('pointerdown', e => {
    if (!st || pinch.on) return;
    e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch {}
    const p = pos(e), m = st.mask;
    if (st.tool !== 'box') {
      if (snap?.width !== m.width || snap.height !== m.height) snap = memCanvas(m.width, m.height);
      const x = snap.getContext('2d'); x.clearRect(0, 0, m.width, m.height); x.drawImage(m, 0, 0);
    }
    if (ov.width !== m.width || ov.height !== m.height) paintOverlay();
    drag = { a: p, last: p, bb: st.bb };
    if (st.tool !== 'box') stroke(p, p);
    showRing(p);
  });
  // 框選的框一格畫面只畫一次（iPhone 一格畫面可能來兩三個移動事件）
  let pv = 0, pvRect;
  const paintSoon = rect => { pvRect = rect; if (!pv) pv = requestAnimationFrame(() => { pv = 0; if (drag) paintOverlay(pvRect); }); };
  ov.addEventListener('pointermove', e => {
    const p = pos(e);
    if (e.pointerType !== 'touch' || drag) showRing(p);
    if (!drag) return;
    if (st.tool === 'box') {
      const a = drag.a;
      paintSoon({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
    } else stroke(drag.last, p);
    drag.last = p;
  });
  const up = e => {
    if (!drag) return;
    if (st.tool === 'box') {
      const a = drag.a, p = pos(e), ctx = st.mask.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.min(a.x, p.x), Math.min(a.y, p.y), Math.abs(p.x - a.x), Math.abs(p.y - a.y));
      if (p.x !== a.x && p.y !== a.y) addBB(Math.min(a.x, p.x) - 1, Math.min(a.y, p.y) - 1, Math.max(a.x, p.x) + 1, Math.max(a.y, p.y) + 1);
    }
    drag = null; paintOverlay(); st.ui?.();
    // 橡皮擦可能把選區擦光了：畫面先更新，下一格再讀畫過的那一塊看還有沒有（「立即消除」要變灰）
    if (st.tool === 'eraser' && st.bb) { const s = st; requestAnimationFrame(() => setTimeout(() => { if (st === s && s.bb && !maskBox(s.mask, s.bb)) { s.bb = null; s.ui?.(); } })); }
    if (e.pointerType === 'touch') ring.style.display = 'none';
  };
  ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  ov.addEventListener('pointerleave', () => { if (!drag) ring.style.display = 'none'; });
  // 第二指放下是要縮放：這一筆不算，遮罩回到下筆之前
  addEventListener('pinchstart', () => {
    if (!drag) return;
    // 框選放開前還沒畫進遮罩，不用退
    if (st.tool !== 'box') { const ctx = st.mask.getContext('2d'); ctx.clearRect(0, 0, st.mask.width, st.mask.height); ctx.drawImage(snap, 0, 0); }
    st.bb = drag.bb; drag = null; ring.style.display = 'none'; paintOverlay();
  });
}

// 離開消除分頁：收起選區畫布（選區留著，回來還在）
export function eraseLeave() {
  if (ov) { ov.style.display = 'none'; ring.style.display = 'none'; }
  document.querySelector('#eraseSize')?.remove();
  document.querySelector('#srow').style.display = '';
}

// app：{ base, setBase(canvas), commit(), item(opts), hideSlider(), showTab(t), toast(msg), busy(msg), toSrc() }
export function tabErase(box, app) {
  app.hideSlider(); warm();
  const s = state(app.base);
  overlay().style.display = 'block';
  paintOverlay();
  const note = document.querySelector('#note');
  const redraw = () => app.showTab('erase');
  s.ui = () => { go.disabled = !hasMask(); go.style.opacity = go.disabled ? 0.4 : 1; };

  box.append(app.item({ label: '識別路人', icon: ICON.people, on: s.pplOn, onclick: async () => {
    if (!s.ppl) {
      app.busy('找出路人…');
      let err = false;
      try { s.ppl = await (s.pplP ||= passersby(s.b.canvas)); } catch (e) { console.warn(e); err = true; } finally { app.busy(); }
      if (!s.ppl) { s.pplP = null; return app.toast(err ? '人像模型載入失敗，檢查一下網路' : '沒有找到路人'); }
    }
    // 路人遮罩是原圖座標，變形開著時換成畫面座標再疊上去（關掉時用同一張扣掉）
    // 原圖座標那張只做一次（從 GPU 讀回來很慢），之後每次打開只重算換到畫面的那一步
    if (!s.pplOn) {
      if (!s.pplS) {
        s.pplS = newCanvas(s.mask.width, s.mask.height);
        s.pplS.getContext('2d', { willReadFrequently: true }).drawImage(s.ppl, 0, 0, s.mask.width, s.mask.height);
        s.pplSB = binarize(s.pplS);
      }
      const map = s.pplSB && app.toSrc?.();
      let b = s.pplSB;
      if (map) [s.pplV, b] = maskToView(s.pplS, s.pplSB, map, s.b.canvas.width); else s.pplV = s.pplS;
      if (b) addBB(...b);
    }
    const ctx = s.mask.getContext('2d');
    ctx.globalCompositeOperation = s.pplOn ? 'destination-out' : 'source-over';
    ctx.drawImage(s.pplV, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    s.pplOn = !s.pplOn; paintOverlay(); redraw();
  } }));
  [['brush', '塗抹', ICON.brush], ['box', '框選', ICON.box], ['eraser', '橡皮擦', ICON.eraser]].forEach(([k, label, icon]) => box.append(app.item({
    label, icon, on: s.tool === k, onclick: () => { s.tool = k; ov.style.cursor = k === 'box' ? 'crosshair' : 'none'; redraw(); },
  })));
  box.append(app.item({ label: '清除選區', icon: ICON.clear, onclick: () => {
    s.mask.getContext('2d').clearRect(0, 0, s.mask.width, s.mask.height); s.bb = null; s.pplOn = false; paintOverlay(); redraw();
  } }));
  // 醒圖把「立即消除」做成面板上最顯眼的按鈕，手機上放第一個，不用往右滑才找得到
  const go = app.item({ label: '立即消除', icon: '立即消除', cls: 'wide', style: 'background:var(--accent);color:#fff;font-weight:600', onclick: async () => {
    const none = () => { s.bb = null; s.ui(); app.toast('先塗抹或框選要消除的地方'); };
    if (!hasMask()) return none();
    app.busy(modelOn || ERASE_LITE ? '消除中…' : '下載消除模型（約 28MB，只有第一次）…');
    app.erasing?.(true);
    // 先讓「消除中…」畫出來再讀選區（讀選區要等 GPU，以前點下去畫面先停住、等一下才出現「消除中」，評審 M51）
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    let t;
    try {
      // 橡皮擦可能把選區整個擦掉了：在畫過的範圍裡算一次真正有沒有（算好的外框直接給 inpaint，不再讀一次）
      const map = app.toSrc?.(), [m, r] = map ? maskToSrc(s.mask, map, s.b.canvas.width, s.bb) : [s.mask, s.bb], box = r && maskBox(m, r);
      if (!box) return none();
      t = setTimeout(() => app.busy('消除中…'), 4000);
      const out = await inpaint(s.b.canvas, m, box);
      if (!out || app.base !== s.b) return;
      app.erasePatch(out); app.commit();
      state(app.base);
      redraw();
    } catch (e) { console.error(e); app.toast(ERASE_LITE ? '消除失敗，再試一次' : '消除失敗，檢查一下網路再試一次'); }
    finally { clearTimeout(t); app.busy(); app.erasing?.(false); }
  } });
  box.prepend(go); s.ui();

  // 畫筆大小（塗抹、橡皮擦用）
  document.querySelector('#eraseSize')?.remove();
  {
    const row = document.createElement('div');
    row.className = 'srow'; row.id = 'eraseSize';
    row.innerHTML = `<label>大小</label><input type="range" min="1" max="100" value="${s.size}" aria-label="畫筆大小"><output>${s.size}</output>`;
    const inp = row.querySelector('input'), outp = row.querySelector('output');
    const paint = () => { inp.style.setProperty('--fill-a', '0%'); inp.style.setProperty('--fill-b', (inp.value - 1) / 99 * 100 + '%'); };
    inp.oninput = () => {
      s.size = +inp.value; outp.textContent = inp.value; paint();
      // 放在看得到的那塊照片中間
      const r = ov.getBoundingClientRect(), sb = ring.parentNode.getBoundingClientRect(), d = brushPx() * r.width / ov.width;
      const x = (Math.max(r.left, sb.left) + Math.min(r.right, sb.right)) / 2 - sb.left, y = (Math.max(r.top, sb.top) + Math.min(r.bottom, sb.bottom)) / 2 - sb.top;
      Object.assign(ring.style, { display: 'block', left: x + 'px', top: y + 'px', width: d + 'px', height: d + 'px' });
    };
    inp.onchange = () => { ring.style.display = 'none'; };
    paint();
    // 框選用不到畫筆大小，但列留著，照片才不會跳動
    if (s.tool === 'box') row.style.visibility = 'hidden';
    document.querySelector('#srow').after(row);
  }
  document.querySelector('#srow').style.display = 'none';
  note.textContent = s.tool === 'box' ? '在照片上拖出一個框，框住要消除的東西。' : s.tool === 'eraser' ? '塗掉多選的地方。' : '塗抹要消除的東西，塗好按「立即消除」。';
}
