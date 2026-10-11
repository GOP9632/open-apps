// 消除筆：塗抹、框選、橡皮擦選出要消除的地方，或自動圈出路人，再用 MI-GAN 修補模型補上背景
// MI-GAN（Picsart，MIT 授權）在瀏覽器裡跑，照片不會上傳。模型第一次用時下載約 28MB，之後瀏覽器會快取
import { segment } from './ai.js';

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODEL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const MASK_SIDE = 2048;  // 選區畫布最長邊
const RUN_SIDE = 1024;   // 送進模型的範圍最長邊，太大手機記憶體不夠
const MASK_RGB = '255,64,110';

let sessP;
function session() {
  sessP ||= import(ORT + 'ort.wasm.min.mjs').then(async ort => {
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = 1; // GitHub Pages 沒有跨來源隔離，不能開多執行緒
    return { ort, s: await ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'] }) };
  }).catch(e => { sessP = null; throw e; });
  return sessP;
}

const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// 選區的外框（用 alpha 判斷），沒有選區回傳 null
function maskBox(mask) {
  const w = mask.width, h = mask.height, d = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
}

// 把選區描邊變粗再暈開：補的範圍稍微蓋過物體邊緣，接縫也看不出來
function grow(mask, w, h, px, blur) {
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  if (blur) ctx.filter = `blur(${blur}px)`;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2;
    ctx.drawImage(mask, Math.cos(a) * px, Math.sin(a) * px, w, h);
  }
  ctx.drawImage(mask, 0, 0, w, h);
  return c;
}

// src：照片 canvas；mask：任意大小、跟照片同比例的選區（alpha > 0 的地方要消除）
// 回傳一張新的 canvas，只有選區附近被換掉
export async function inpaint(src, mask) {
  const box = maskBox(mask);
  if (!box) return null;
  const { ort, s } = await session();
  const W = src.width, H = src.height;
  // 取選區周圍一圈當參考，模型才知道背景長什麼樣
  const bw = box.w * W, bh = box.h * H, pad = Math.max(64, 0.6 * Math.max(bw, bh));
  const x0 = Math.max(0, Math.floor(box.x * W - pad)), y0 = Math.max(0, Math.floor(box.y * H - pad));
  const x1 = Math.min(W, Math.ceil((box.x + box.w) * W + pad)), y1 = Math.min(H, Math.ceil((box.y + box.h) * H + pad));
  const cw = x1 - x0, ch = y1 - y0, k = Math.min(1, RUN_SIDE / Math.max(cw, ch));
  const w = Math.max(8, Math.round(cw * k)), h = Math.max(8, Math.round(ch * k)), n = w * h;

  const ic = newCanvas(w, h), ictx = ic.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(src, x0, y0, cw, ch, 0, 0, w, h);
  const id = ictx.getImageData(0, 0, w, h).data;
  // 選區對到這塊範圍
  const mk = mask.width / W, mc = newCanvas(w, h), mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(mask, x0 * mk, y0 * mk, cw * mk, ch * mk, 0, 0, w, h);
  const hole = grow(mc, w, h, Math.max(2, Math.round(Math.max(w, h) / 200)), 0);
  const md = hole.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

  const img = new Uint8Array(3 * n), m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    img[i] = id[i * 4]; img[n + i] = id[i * 4 + 1]; img[2 * n + i] = id[i * 4 + 2];
    m[i] = md[i * 4 + 3] > 10 ? 0 : 255; // MI-GAN：0 = 要補的洞，255 = 保留
  }
  const r = (await s.run({ image: new ort.Tensor('uint8', img, [1, 3, h, w]), mask: new ort.Tensor('uint8', m, [1, 1, h, w]) })).result.data;
  const oc = newCanvas(w, h), octx = oc.getContext('2d'), od = octx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    od.data[i * 4] = r[i]; od.data[i * 4 + 1] = r[n + i]; od.data[i * 4 + 2] = r[2 * n + i]; od.data[i * 4 + 3] = 255;
  }
  octx.putImageData(od, 0, 0);

  // 只把選區（邊緣羽化）貼回原圖，其他地方保持原本的清晰度
  const feather = Math.max(1.5, Math.max(cw, ch) / 400);
  const soft = grow(hole, cw, ch, 0, feather), sctx = soft.getContext('2d');
  sctx.globalCompositeOperation = 'source-in';
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(oc, 0, 0, cw, ch);
  const out = newCanvas(W, H), ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.drawImage(soft, x0, y0);
  return out;
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
  return grow(c, w, h, Math.max(2, Math.round(Math.max(w, h) / 150)), 0);
}

// ---------- 面板 ----------
const ICON = {
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/></svg>',
  box: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M8 20h12"/><path d="M4.5 14.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5z"/><path d="M9 10l5 5"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/></svg>',
};

let st = null; // { b: 對應的照片, mask, ppl, pplOn, tool, size, ui }
function state(b) {
  if (st?.b === b) return st;
  const W = b.canvas.width, H = b.canvas.height, k = Math.min(1, MASK_SIDE / Math.max(W, H));
  // 換照片或消除完，工具和畫筆大小沿用
  st = { b, mask: newCanvas(W * k, H * k), ppl: null, pplOn: false, pplP: null, tool: st?.tool || 'brush', size: st?.size ?? 30 };
  return st;
}
const hasMask = () => !!(st && maskBox(st.mask));

let ov = null, ring = null;
function overlay() {
  if (ov) return ov;
  ov = document.createElement('canvas');
  ov.id = 'eraseOv';
  ov.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:3;touch-action:none;cursor:none;opacity:.55;display:none`;
  ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;z-index:4;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none;display:none;transform:translate(-50%,-50%)';
  document.querySelector('#wrap').append(ov, ring);
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
// 畫筆直徑：照片短邊的 2%～20%
const brushPx = () => Math.min(st.mask.width, st.mask.height) * (0.02 + 0.18 * st.size / 100);

function bindDraw() {
  let drag = null;
  const pos = e => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * ov.width, y: (e.clientY - r.top) / r.height * ov.height, cx: e.clientX - r.left, cy: e.clientY - r.top, k: r.width / ov.width }; };
  const showRing = p => {
    if (!st || st.tool === 'box') { ring.style.display = 'none'; return; }
    const d = brushPx() * p.k;
    Object.assign(ring.style, { display: 'block', left: p.cx + 'px', top: p.cy + 'px', width: d + 'px', height: d + 'px' });
  };
  const stroke = (a, b) => {
    const ctx = st.mask.getContext('2d');
    ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff'; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = brushPx();
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };
  ov.addEventListener('pointerdown', e => {
    if (!st) return;
    e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch {}
    const p = pos(e); drag = { a: p, last: p };
    if (st.tool !== 'box') { stroke(p, p); paintOverlay(); }
    showRing(p);
  });
  ov.addEventListener('pointermove', e => {
    const p = pos(e);
    if (e.pointerType !== 'touch' || drag) showRing(p);
    if (!drag) return;
    if (st.tool === 'box') {
      const a = drag.a;
      paintOverlay({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
    } else { stroke(drag.last, p); paintOverlay(); }
    drag.last = p;
  });
  const up = e => {
    if (!drag) return;
    if (st.tool === 'box') {
      const a = drag.a, p = pos(e), ctx = st.mask.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.min(a.x, p.x), Math.min(a.y, p.y), Math.abs(p.x - a.x), Math.abs(p.y - a.y));
    }
    drag = null; paintOverlay(); st.ui?.();
    if (e.pointerType === 'touch') ring.style.display = 'none';
  };
  ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  ov.addEventListener('pointerleave', () => { if (!drag) ring.style.display = 'none'; });
}

// 離開消除分頁：收起選區畫布（選區留著，回來還在）
export function eraseLeave() {
  if (ov) { ov.style.display = 'none'; ring.style.display = 'none'; }
  document.querySelector('#eraseSize')?.remove();
  document.querySelector('#srow').style.display = '';
}

// app：{ base, setBase(canvas), commit(), item(opts), hideSlider(), showTab(t), toast(msg), busy(msg) }
export function tabErase(box, app) {
  app.hideSlider();
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
    const ctx = s.mask.getContext('2d');
    ctx.globalCompositeOperation = s.pplOn ? 'destination-out' : 'source-over';
    ctx.drawImage(s.ppl, 0, 0, s.mask.width, s.mask.height);
    ctx.globalCompositeOperation = 'source-over';
    s.pplOn = !s.pplOn; paintOverlay(); redraw();
  } }));
  [['brush', '塗抹', ICON.brush], ['box', '框選', ICON.box], ['eraser', '橡皮擦', ICON.eraser]].forEach(([k, label, icon]) => box.append(app.item({
    label, icon, on: s.tool === k, onclick: () => { s.tool = k; ov.style.cursor = k === 'box' ? 'crosshair' : 'none'; redraw(); },
  })));
  box.append(app.item({ label: '清除選區', icon: ICON.clear, onclick: () => {
    s.mask.getContext('2d').clearRect(0, 0, s.mask.width, s.mask.height); s.pplOn = false; paintOverlay(); redraw();
  } }));
  // 醒圖把「立即消除」做成面板上最顯眼的按鈕，手機上放第一個，不用往右滑才找得到
  const go = app.item({ label: '立即消除', icon: '立即消除', cls: 'wide', style: 'background:var(--accent);color:#fff;font-weight:600', onclick: async () => {
    if (!hasMask()) return app.toast('先塗抹或框選要消除的地方');
    app.busy(sessP ? '消除中…' : '下載消除模型（約 28MB，只有第一次）…');
    try {
      const t = setTimeout(() => app.busy('消除中…'), 4000);
      const out = await inpaint(s.b.canvas, s.mask);
      clearTimeout(t);
      if (!out) return;
      app.setBase(out); app.commit();
      state(app.base);
      redraw();
    } catch (e) { console.error(e); app.toast('消除失敗，檢查一下網路再試一次'); }
    finally { app.busy(); }
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
      const r = ov.getBoundingClientRect(), d = brushPx() * r.width / ov.width;
      Object.assign(ring.style, { display: 'block', left: r.width / 2 + 'px', top: r.height / 2 + 'px', width: d + 'px', height: d + 'px' });
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
