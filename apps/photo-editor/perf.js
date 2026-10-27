// 速度計：網址加 ?perf 就在照片左上角顯示，給手機上量跟不跟手用
//   反應：拉滑桿、手指推一下，到畫面真的更新（下一格畫面出來）花幾毫秒；最近 3 秒最慢的一次也列出來
//   每秒幾格：動的時候畫面每秒更新幾次（60 最順）
//   放開：塗鴉、美顏筆、消除這類放開手指後要算一下的，放開到新照片畫好花幾毫秒
export const perfOn = /[?&]perf\b/.test(location.search);
let tReq = 0, tUp = 0, upMs = 0, el = null;
const lat = [], frames = [];

// render() 要求重畫時記下時間（同一格裡多次要求只算第一次）
export function perfReq() { if (perfOn && !tReq) tReq = performance.now(); }
// 畫完這一格：等下一格畫面出來才算數（GPU 真的畫好了）
export function perfDrawn() {
  if (!perfOn || !tReq) return;
  const t = tReq; tReq = 0;
  requestAnimationFrame(() => { const n = performance.now(); lat.push([n, n - t]); frames.push(n); show(); });
}
if (perfOn) addEventListener('pointerup', () => { tUp = performance.now(); }, true);
// 開新照片不算（那是讀檔，不是放開手指）
export function perfSkip() { tUp = 0; }
// 換了一張新照片（筆刷畫進照片、消除…）
export function perfBase() {
  if (!perfOn || !tUp) return;
  const t = tUp; tUp = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => { upMs = performance.now() - t; show(); }));
}
function show() {
  const n = performance.now();
  while (lat.length && n - lat[0][0] > 3000) lat.shift();
  while (frames.length && n - frames[0] > 1000) frames.shift();
  if (!el) {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top) + 64px);z-index:60;background:rgba(0,0,0,.72);color:#9dff9d;font:12px/1.5 ui-monospace,Menlo,monospace;padding:4px 8px;border-radius:8px;pointer-events:none;white-space:pre';
    document.body.append(el);
  }
  const last = lat.at(-1)?.[1] || 0, worst = Math.max(0, ...lat.map(x => x[1])), gl = document.querySelector('#gl');
  el.textContent = `反應 ${Math.round(last)} ms（3 秒內最慢 ${Math.round(worst)}）\n每秒 ${frames.length} 格\n放開到畫好 ${upMs ? Math.round(upMs) + ' ms' : '—'}\n預覽 ${gl?.width}×${gl?.height}`;
}
