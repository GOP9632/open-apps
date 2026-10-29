// 美顏筆的背景執行緒（評審 #163）：點開美顏筆、換筆時，各筆在小圖上的大範圍模糊、參考膚色（bbhel.js 的 helSteps）
// 跟打包給 GPU 的那張都在這裡算，主執行緒只收結果、傳上 GPU（以前分步在主執行緒算，電腦上還有一步 54～67ms，iPhone 兩三倍）。
// 收：{ id, op: 'oh', a: { sid, Oh, hw, hh } }（這串美顏筆的小圖，換一串才再傳）、{ id, op: 'hel', a: { sid, t, R0, S, k } }、
// { id, op: 'drop', a: { sid } }；回：{ id, out } 或 { id, err }
import { helCalc, packHel } from './bbhel.js';

let cur = null;
onmessage = e => {
  const { id, op, a } = e.data;
  try {
    if (op === 'oh') cur = a;
    else if (op === 'drop') { if (cur?.sid === a.sid) cur = null; }
    else if (op === 'hel') {
      if (cur?.sid !== a.sid) throw new Error('沒有這串的小圖');
      const o = helCalc(a.t, cur.Oh, cur.hw, cur.hh, a.R0, a.S, a.k), d = packHel(a.t, o, cur.hw, [0, 0, cur.hw, cur.hh]);
      const bufs = new Set([d, ...Object.values(o).flat()].filter(Boolean).map(x => x.buffer));
      postMessage({ id, out: { o, d } }, [...bufs]);
      return;
    } else throw new Error('不認得 ' + op);
    postMessage({ id, out: true });
  } catch (err) {
    postMessage({ id, err: String(err?.stack || err) });
  }
};
