// 背景執行緒跑 MediaPipe（評審 M7）：找臉、人像分割、找人以前在主執行緒，開大照片後主執行緒停 0.2～0.5 秒
// （建模型、推論、讀回遮罩），第一次進身體分頁更久。這時拖滑桿、縮放照片都不動。
// 要用一般 worker（不是 module）：MediaPipe 用 importScripts 載 wasm 的 js，module worker 不能用 importScripts；
// MediaPipe 本身用 import() 載（CDN 上的 .cjs 不是 JavaScript 的檔案類型，importScripts 不收）。
// 收：{ id, cdn, task: MediaPipe 類別名稱, opts, bm: ImageBitmap }；回：{ id, ready }（模型好了）、{ id, out } 或 { id, err }
let lib = null;
const tasks = {};
async function create(cdn, Cls, opts) {
  lib ||= import(`${cdn}/vision_bundle.mjs`).then(async m => ({ m, f: await m.FilesetResolver.forVisionTasks(`${cdn}/wasm`) }));
  const { m, f } = await lib;
  try { return await m[Cls].createFromOptions(f, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } }); }
  catch { return await m[Cls].createFromOptions(f, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } }); }
}

onmessage = async e => {
  const { id, cdn, task, opts, bm } = e.data;
  try {
    const t = await (tasks[task] ||= create(cdn, task, opts));
    postMessage({ id, ready: true });
    let out, tr = [];
    if (task === 'ImageSegmenter') {
      // 每一類的機率圖抄出來傳回去（不用再複製）。讀回時 MediaPipe 用 self.document 判斷是不是 iPad（要不要改用 RGBA 讀），
      // worker 裡沒有 document：讀回這一下給它一個只說有沒有觸控螢幕的替身
      const res = t.segment(bm), ms = res.confidenceMasks;
      self.document = navigator.maxTouchPoints > 1 ? { ontouchend: null } : {};
      try { out = { w: ms[0].width, h: ms[0].height, ms: ms.map(m => Float32Array.from(m.getAsFloat32Array())) }; }
      finally { delete self.document; res.close?.(); }
      tr = out.ms.map(a => a.buffer);
    } else {
      const res = t.detect(bm);
      out = { faceLandmarks: res.faceLandmarks, landmarks: res.landmarks };
    }
    bm.close();
    postMessage({ id, out }, tr);
  } catch (err) {
    bm?.close?.();
    postMessage({ id, err: String(err?.stack || err) });
  }
};
