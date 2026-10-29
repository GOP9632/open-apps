// 消除自己的背景執行緒（評審 M51）：補洞（iPhone、iPad 的方塊補洞，電腦、Android 的 MI-GAN）、外擴、羽化都在這裡算。
// 以前 iPhone 跟找臉、膚質、頭髮共用 prepwork.js，開照片後那幾件還在算，消除排在後面要等 3～5 秒；
// 電腦的 MI-GAN 在主執行緒跑，按下去畫面停 1 秒。進消除分頁就先開好、先用小圖算一次（第一次跑特別慢）。
// 收：{ id, op: 'warm' | 'fill' | 'migan', a }；回：{ id, out } 或 { id, err }
import { fillErase, miganErase, ortSession } from './erasemix.js';

onmessage = async e => {
  const { id, op, a } = e.data;
  try {
    let out = null;
    if (op === 'warm') {
      if (a.model) await ortSession();
      else {
        // 小圖補一次：中間挖一塊洞，周圍是斜的條紋（補洞要找得到相似的方塊）
        const w = 96, h = 96, d = new Uint8ClampedArray(w * h * 4), m = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, v = (x + y) % 16 < 8 ? 60 : 200;
          d[i * 4] = v; d[i * 4 + 1] = 255 - v; d[i * 4 + 2] = 128; d[i * 4 + 3] = 255;
          m[i] = Math.abs(x - 48) < 14 && Math.abs(y - 48) < 14 ? 255 : 0;
        }
        fillErase({ d, m, w, h, cw: 2 * w, ch: 2 * h, px: 2, feather: 1.5 });
      }
    } else if (op === 'fill') out = fillErase(a);
    else if (op === 'migan') out = await miganErase(a, ortSession);
    else throw new Error('不認得 ' + op);
    postMessage({ id, out }, out ? [out.buffer] : []);
  } catch (err) {
    postMessage({ id, err: String(err?.stack || err) });
  }
};
