// 介面共用的小元件：滑桿的雙擊歸零、數值泡泡、漸層軌道，還有畫布縮放
// 跟修圖演算法無關，只管操作手感

// ---------- 滑桿 ----------
// 依滑桿名稱決定要不要用漸層軌道（色溫、色調一看就知道往哪邊拉會變什麼）
const GRADS = [
  [/色溫/, 'linear-gradient(90deg,#3f86ff,#d9d9de 50%,#ffb02e)'],
  [/色調/, 'linear-gradient(90deg,#34c36b,#d9d9de 50%,#e05fd0)'],
  [/色相/, 'linear-gradient(90deg,#ff4d4d,#ffd60a 17%,#4cd964 33%,#2ad4ff 50%,#4b6bff 67%,#d64dff 83%,#ff4d4d)'],
];
export function gradFor(label) {
  const g = GRADS.find(([re]) => re.test(label || ''));
  return g ? g[1] : '';
}
export function setGrad(input, label) {
  const g = gradFor(label);
  input.classList.toggle('grad', !!g);
  if (g) input.style.setProperty('--trk', g); else input.style.removeProperty('--trk');
}

// 雙向填色：從 0 填到目前的值
export function paintRange(input, out) {
  const min = +input.min, max = +input.max, v = +input.value;
  const z = Math.min(max, Math.max(min, 0));
  const pos = (v - min) / (max - min) * 100, zero = (z - min) / (max - min) * 100;
  input.style.setProperty('--fill-a', Math.min(pos, zero) + '%');
  input.style.setProperty('--fill-b', Math.max(pos, zero) + '%');
  if (out) out.textContent = v;
}

// 預設值：data-def，沒有的話 0；範圍不含 0（像畫筆大小）就不歸零
const defOf = r => r.dataset.def !== undefined ? +r.dataset.def : +r.min <= 0 && +r.max >= 0 ? 0 : null;
function setRange(r, v, done) {
  r.value = v;
  r.dispatchEvent(new Event('input', { bubbles: true }));
  if (done) r.dispatchEvent(new Event('change', { bubbles: true }));
}

let active = null;     // 最近一次碰過的滑桿，給方向鍵微調用
let dragging = null;
let lastTap = { r: null, t: 0 };
const bubble = () => document.getElementById('bubble');
function showBubble(r) {
  const b = bubble(); if (!b) return;
  const rc = r.getBoundingClientRect(), th = 22;
  const k = (+r.value - +r.min) / (+r.max - +r.min || 1);
  b.textContent = r.value;
  b.style.left = rc.left + th / 2 + k * (rc.width - th) + 'px';
  b.style.top = rc.top + rc.height / 2 - th / 2 + 'px';
  b.classList.add('on');
}
const hideBubble = () => bubble()?.classList.remove('on');

export function enhanceRanges() {
  document.addEventListener('pointerdown', e => {
    const r = e.target.closest?.('input[type=range]');
    if (!r) return;
    active = r;
    // 連點兩下（300ms 內）歸零，照醒圖的滑桿
    const now = performance.now();
    if (lastTap.r === r && now - lastTap.t < 300 && defOf(r) !== null) {
      lastTap = { r: null, t: 0 };
      e.preventDefault();
      setTimeout(() => { setRange(r, defOf(r), true); hideBubble(); }, 0);
      return;
    }
    lastTap = { r, t: now };
    dragging = r;
    requestAnimationFrame(() => dragging === r && showBubble(r));
  }, true);
  document.addEventListener('input', e => {
    const r = e.target;
    if (r.matches?.('input[type=range]')) { active = r; if (dragging === r) showBubble(r); }
  }, true);
  const end = () => { dragging = null; hideBubble(); };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  document.addEventListener('focusin', e => { if (e.target.matches?.('input[type=range]')) active = e.target; });
}

// 方向鍵微調目前的滑桿（沒碰過就用畫面上第一條看得到的）
let nudgeT = 0;
export function nudge(dir, big) {
  const vis = r => r && r.isConnected && r.offsetParent !== null && !r.closest('.hide');
  let r = vis(active) ? active : [...document.querySelectorAll('#panel input[type=range]')].find(vis);
  if (!r) return false;
  active = r;
  const step = (+r.step || 1) * (big ? 10 : 1);
  setRange(r, Math.min(+r.max, Math.max(+r.min, +r.value + dir * step)), false);
  showBubble(r);
  clearTimeout(nudgeT);
  nudgeT = setTimeout(() => { r.dispatchEvent(new Event('change', { bubbles: true })); hideBubble(); }, 500);
  return true;
}

// ---------- 畫布縮放、拖曳 ----------
// box 用 CSS transform 放大移動，原本的座標換算都用 getBoundingClientRect，所以不用改
// unit()：z=1 時照片實際顯示的倍率（照片一個像素佔幾個螢幕像素），
// 照醒圖：實際倍率 5%～1200%，按鈕一格一格跳 STEPS
const STEPS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 12];
// 手機兩指捏合中：塗抹、推臉這些工具看到就先停筆（第二指放下時會發 pinchstart）
export const pinch = { on: false };
export function canvasZoom({ stage, box, onChange, canPan, unit = () => 1 }) {
  let z = 1, x = 0, y = 0;
  const lim = nz => { const k = unit() || 1; return Math.max(Math.min(1, STEPS[0] / k), Math.min(Math.max(1, STEPS.at(-1) / k), nz)); };
  const apply = () => {
    // 不讓照片整張跑出畫面外
    const sw = stage.clientWidth, sh = stage.clientHeight, bw = box.offsetWidth * z, bh = box.offsetHeight * z;
    const lx = Math.max(0, (bw - sw) / 2 + sw * 0.25), ly = Math.max(0, (bh - sh) / 2 + sh * 0.25);
    if (z <= 1) { x = 0; y = 0; }
    x = Math.max(-lx, Math.min(lx, x)); y = Math.max(-ly, Math.min(ly, y));
    box.style.transform = z === 1 && !x && !y ? '' : `translate(${x}px,${y}px) scale(${z})`;
    stage.classList.toggle('pan', z > 1);
    onChange?.(z);
  };
  // 以畫面上某一點為中心縮放（滑鼠位置、雙指中心）
  const zoomAt = (nz, px, py) => {
    nz = lim(nz);
    const r = stage.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (px === undefined) { px = cx; py = cy; }
    const qx = (px - cx - x) / z, qy = (py - cy - y) / z;
    x = px - cx - nz * qx; y = py - cy - nz * qy; z = nz;
    apply();
  };
  stage.addEventListener('wheel', e => {
    if (!box.offsetWidth) return;
    if (e.ctrlKey || e.metaKey) {           // 觸控板雙指捏合、⌘＋滾輪
      e.preventDefault();
      zoomAt(z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    } else if (z > 1) {                      // 放大後雙指滑動、滾輪移動畫面
      e.preventDefault();
      x -= e.deltaX; y -= e.deltaY; apply();
    }
  }, { passive: false });

  // 拖曳移動：滑鼠中鍵、或在照片以外的地方拖；手機上雙指捏合
  const pts = new Map();
  let g = null;
  const start = () => {
    const [a, b] = [...pts.values()];
    g = { x, y, z, a: { ...a }, d: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0, m: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a };
  };
  stage.addEventListener('pointerdown', e => {
    const touch = e.pointerType === 'touch';
    if (touch) {
      if (!canPan?.(e, true)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { start(); pinch.on = true; window.dispatchEvent(new Event('pinchstart')); }
      return;
    }
    const outside = !e.target.closest('#wrap,#zoom,#crop');
    if (!(e.button === 1 || (z > 1 && e.button === 0 && outside && canPan?.(e, false)))) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start();
    stage.classList.add('panning');
  }, true);
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    const [a, b] = [...pts.values()];
    if (b && g.d) {
      // 兩指一開始中心點底下的那個位置，要一直跟著兩指中心走
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = stage.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const nz = lim(g.z * Math.hypot(b.x - a.x, b.y - a.y) / g.d);
      const qx = (g.m.x - cx - g.x) / g.z, qy = (g.m.y - cy - g.y) / g.z;
      z = nz; x = m.x - cx - nz * qx; y = m.y - cy - nz * qy;
      apply();
    } else if (!b && e.pointerType !== 'touch') {
      x = g.x + a.x - g.a.x; y = g.y + a.y - g.a.y; apply();
    }
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (!pts.size) pinch.on = false;
    stage.classList.remove('panning');
    g = pts.size === 2 ? (start(), g) : null;
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

  return {
    get z() { return z; },
    pinching: () => pts.size >= 2,
    zoomBy: f => zoomAt(z * f),
    // 跳到下一格（dir=1 放大、-1 縮小），以實際倍率算
    zoomStep: dir => {
      const k = unit() || 1, a = z * k;
      const s = dir > 0 ? STEPS.find(v => v > a * 1.001) : [...STEPS].reverse().find(v => v < a * 0.999);
      if (s) zoomAt(s / k);
    },
    reset: () => { z = 1; x = 0; y = 0; apply(); },
    apply,
  };
}
