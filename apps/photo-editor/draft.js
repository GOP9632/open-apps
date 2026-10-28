// 草稿：修到一半的照片自動存在這台裝置（IndexedDB），Safari 重開、重新整理都能接著修。
// 照醒圖首頁的「草稿」：最多留 5 份，舊的自動刪掉。每份存：m:<id> 參數和縮圖（小）、p:<id> 照片、
// q:<id>:<第幾筆> 之後美顏筆、塗鴉每一筆改到的那一塊（原始像素，不用壓）。接著修時照片疊上前幾筆（m 裡的 ptr 記到第幾筆）。
// o:<id> 看原圖用的最初照片（縮小的 JPEG，只寫一次；m 裡的 om 記目前照片對到它的位置）。
// 每一筆只存改到的那一塊：不用每筆重壓整張 1200 萬像素照片，畫完不會頓一下（評審 2026-10-27）
const KEEP = 5;
let dbP = null;
function db() {
  dbP ||= new Promise(res => {
    try {
      const q = indexedDB.open('photo-editor', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('draft');
      q.onsuccess = () => res(q.result);
      q.onerror = q.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}
// f(store) 回傳一個或一串 request；交易完成後回傳結果
async function tx(mode, f) {
  const d = await db();
  if (!d) return null;
  return new Promise((res, rej) => {
    const t = d.transaction('draft', mode), r = f(t.objectStore('draft'));
    t.oncomplete = () => res(Array.isArray(r) ? r.map(x => x.result) : r?.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

// 草稿清單（新的在前），只有參數和縮圖，不讀照片
export async function listDrafts() {
  const all = await tx('readonly', s => s.getAll(IDBKeyRange.bound('m:', 'm:\uffff'))).catch(() => null);
  return (all || []).filter(m => m?.id).sort((a, b) => b.t - a.t);
}
const qKey = (id, i) => `q:${id}:${String(i).padStart(7, '0')}`;
const qRange = id => IDBKeyRange.bound(`q:${id}:`, `q:${id}:\uffff`);
// patches：照順序排好、只留 ptr 範圍內的那幾筆
export async function readDraft(id) {
  const r = await tx('readonly', s => [s.get('m:' + id), s.get('p:' + id), s.getAll(qRange(id)), s.getAllKeys(qRange(id)), s.get('o:' + id)]);
  if (!r || !r[0] || !r[1]) return null;
  const ptr = r[0].ptr || { i0: 0, pv: 0 };
  const patches = r[3].map((k, j) => [+k.slice(k.lastIndexOf(':') + 1), r[2][j]]).filter(([i]) => i >= ptr.i0 && i < ptr.pv).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  return { meta: r[0], photo: r[1], patches, orig: r[4]?.blob || null };
}
// photo：新的整張照片（之前的每一筆一起清掉）；puts：[[第幾筆, { x, y, img }]]；orig：最初照片（第一次存才給）
export async function writeDraft(meta, { photo = null, puts = [], orig = null } = {}) {
  const old = (await listDrafts()).filter(m => m.id !== meta.id).slice(KEEP - 1);
  await tx('readwrite', s => {
    if (photo) { s.put({ blob: photo }, 'p:' + meta.id); s.delete(qRange(meta.id)); }
    if (orig) s.put({ blob: orig }, 'o:' + meta.id);
    for (const [i, q] of puts) s.put(q, qKey(meta.id, i));
    s.put(meta, 'm:' + meta.id);
    old.forEach(m => drop(s, m.id));
  });
}
const drop = (s, id) => { s.delete('m:' + id); s.delete('p:' + id); s.delete('o:' + id); s.delete(qRange(id)); };
export const deleteDraft = id => tx('readwrite', s => drop(s, id));

// 照片壓成檔案：交給背景執行緒壓（1200 萬像素在主執行緒壓會卡一下，剛好碰到下一筆就不跟手）。
// 不支援的瀏覽器（舊 Safari）退回 canvas.toBlob
let worker = null, wId = 0;
const waiting = new Map();
function encWorker() {
  if (worker !== null) return worker;
  try {
    if (typeof OffscreenCanvas === 'undefined' || !OffscreenCanvas.prototype.convertToBlob) throw 0;
    const src = `onmessage = async e => {
      const { id, b, type, q } = e.data;
      try {
        const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('bitmaprenderer');
        if (x) x.transferFromImageBitmap(b); else { c.getContext('2d').drawImage(b, 0, 0); b.close(); }
        postMessage({ id, blob: await c.convertToBlob({ type, quality: q }) });
      } catch (err) { postMessage({ id, err: String(err) }); }
    };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = e => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); w?.(e.data); };
    worker.onerror = () => { worker = false; waiting.forEach(w => w({ err: 'worker' })); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}
const viaToBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
export async function encode(c, type, q = 0.95) {
  const w = encWorker();
  if (w) {
    try {
      const b = await createImageBitmap(c), id = ++wId;
      const r = await new Promise(res => { waiting.set(id, res); w.postMessage({ id, b, type, q }, [b]); });
      if (r.blob) return r.blob;
    } catch {}
    worker = false;  // 這台不行：之後都用 toBlob
  }
  return viaToBlob(c, type, q);
}
