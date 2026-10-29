// 背景執行緒：皮膚遮罩、閃光燈統計、膚質、頭髮的準備資料（評審 M7、M8），還有消除的補洞。
// 這些都是在分割圖大小（約 80 萬像素）上逐像素算、模糊十幾次，以前在主執行緒做，
// 開照片、第一次開膚質、頭髮各卡 0.5～1 秒，那時拖滑桿、縮放照片都不動。
// 收：{ id, op, a }；回：{ id, out } 或 { id, err }。畫布換成 ImageBitmap 傳回去（不用複製）
import { skinMask } from './ai.js';
import { flashStats } from './relight.js';
import { prepSkin } from './skin.js';
import { prepHair } from './hair.js';
import { flashGrid } from './flashnet.js';
import { fillErase } from './erasemix.js';

const bitmap = c => c && typeof c.transferToImageBitmap === 'function' ? c.transferToImageBitmap() : c;

onmessage = async e => {
  const { id, op, a } = e.data;
  try {
    // a.img：縮成分割圖大小的照片；照片原尺寸是 a.W × a.H
    const photo = { width: a.W, height: a.H, img: a.img };
    let out, tr = [];
    if (op === 'face') {
      const m = skinMask(a.faces, a.W, a.H, a.seg, a.bimg);  // bimg：鬍子圖大小的照片（ai.js beardSize）
      const flashSt = a.seg && m ? flashStats(photo, a.seg, m, a.geom) : null;
      const cls = bitmap(m.cls), mask = bitmap(m);
      out = { mask, cls, flashSt }; tr = [mask, cls];
    } else if (op === 'skin') {
      out = prepSkin(photo, a.seg, a.faces);
      tr = [out.T1.buffer, out.T2.buffer, out.T3.buffer];
    } else if (op === 'hair') {
      out = prepHair(photo, a.seg, a.faces);
      for (const k of ['M', 'F', 'HF', 'BF']) tr.push(out[k] = bitmap(out[k]));
    } else if (op === 'flashnet') {
      // 相機閃光燈 AI 模型的調色表（flashnet.js）：千萬像素的照片也要將近一秒，所以在這裡算
      out = await flashGrid(a);
      tr = [out.grid.buffer];
      a.person?.close?.(); a.mask?.close?.();
    } else if (op === 'erase') {
      // 消除（iPhone、iPad：選區外擴、方塊補洞、羽化，erasemix.js）：以前在主執行緒算，按「立即消除」整個畫面停 0.6 秒以上（評審 M51）
      out = fillErase(a); tr = [out.buffer];
    } else throw new Error('不認得 ' + op);
    a.img?.close?.(); a.bimg?.close?.();
    postMessage({ id, out }, tr.filter(Boolean));
  } catch (err) {
    postMessage({ id, err: String(err?.stack || err) });
  }
};
