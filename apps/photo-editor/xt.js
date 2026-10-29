// 醒圖風格濾鏡：我們自己的顏色模型，參數是對著醒圖濾鏡的實際輸出量出來的（不含醒圖的 LUT 檔）。
//
// 模型（150 個特徵，每個輸出通道各一組權重，線性組合）：
//   1. R、G、B 各一條 9 點曲線（分段線性）
//   2. 暗、中、亮三段 × 8 個色相：色度（偏離灰色的量）怎麼變、亮度怎麼變
//   3. 依亮度（9 點）的色度變化
// 權重存在 xt/filters.bin（int16，每個濾鏡一個縮放值），名稱、分類、預設強度在 xt/filters.json。
// filters.json 的 hide 是暫時不列出的濾鏡：擬合時拿錯醒圖共用的輔助 LUT、跟別的濾鏡顏色一模一樣，或是同一個濾鏡換名字的重複項。
// 醒圖很多濾鏡對皮膚另外調一套顏色，那套的權重在 xt/skin.bin（同樣的模型）；一鍵出片的風格頭髮也另外一套，同樣放在 skin.bin。
// 柔光類濾鏡（燭光晚餐、失樂園…）醒圖還加了柔焦和光暈，參數在 filters.json 的 glow（濾鏡編號 → 7 個數，見 gl.js setGlow）。
// 少數像熱感應、只留膚色那種顏色會突然跳的濾鏡（像素黃、數字彩虹、鎏金…），上面的模型跟不上，
// 另外加一張「色相 × 亮度 × 鮮豔度」的格子（12×9×5，格子之間線性內插），權重在 xt/special.bin。

const K = 9, H = 8, NF = 150;
const LR = 0.2126, LG = 0.7152, LB = 0.0722;
let data = null, loading = null;

export function loadXT() {
  loading ||= Promise.all([
    fetch(new URL('xt/filters.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('xt/filters.bin', import.meta.url)).then(r => r.arrayBuffer()),
    fetch(new URL('xt/skin.bin', import.meta.url)).then(r => r.arrayBuffer()),
    fetch(new URL('xt/special.bin', import.meta.url)).then(r => r.arrayBuffer()),
  ]).then(([meta, buf, sbuf, xbuf]) => {
    const deq = (buf, scale, nf = NF) => {
      const q = new Int16Array(buf), w = new Float32Array(q.length);
      scale.forEach((s, f) => { const o = f * nf * 3; for (let k = 0; k < nf * 3; k++) w[o + k] = q[o + k] * s; });
      return w;
    };
    const sp = meta.sp, n = meta.items.length, hide = new Set(meta.hide || []);
    data = {
      cats: meta.cats,
      items: [...meta.items.map(([name, cat, p, def, skin, hair], i) => ({ id: 'xt' + i, name, cat, p, def, skin, hair, hide: hide.has(i), glow: meta.glow?.[i] || null })),
        ...(sp?.items || []).map(([name, cat, p, def, skin], i) => ({ id: 'xt' + (n + i), name, cat, p, def, skin, sp: true }))],
      w: deq(buf, meta.scale), ws: deq(sbuf, meta.skinScale),
      wx: sp ? deq(xbuf, sp.scale, sp.feat) : null, nfx: sp?.feat, grid: sp?.grid,
    };
    return data;
  }).catch(e => { console.warn(e); loading = null; return null; });
  return loading;
}
export const xtData = () => data;
export const xtItem = id => data && id?.startsWith('xt') ? data.items[+id.slice(2)] : null;

// 一個濾鏡的顏色函式 (r,g,b) → [r,g,b]，數值 0～1；part 是 'skin' 或 'hair' 時是皮膚、頭髮那套（沒有就回傳 null）
export function xtFn(id, part) {
  const it = xtItem(id), k = part ? it?.[part] : 0; if (!it || (part && !(k >= 0))) return null;
  const W = it.sp ? data.wx : part ? data.ws : data.w, base = (part ? k : it.p) * (it.sp ? data.nfx : NF) * 3;
  const [NH, NL, NC] = data.grid || [0, 0, 0];
  const out = [0, 0, 0];
  return (r, g, b) => {
    out[0] = out[1] = out[2] = 0;
    const add = (k, v) => { if (!v) return; const o = base + k * 3; out[0] += W[o] * v; out[1] += W[o + 1] * v; out[2] += W[o + 2] * v; };
    const hat = (off, z) => {
      z = (z < 0 ? 0 : z > 1 ? 1 : z) * (K - 1);
      const i = Math.min(Math.floor(z), K - 2), f = z - i;
      add(off + i, 1 - f); add(off + i + 1, f);
    };
    hat(0, r); hat(K, g); hat(2 * K, b);
    const L = LR * r + LG * g + LB * b, c0 = r - L, c1 = g - L, c2 = b - L, m = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
    let a = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) / (2 * Math.PI);
    a -= Math.floor(a);
    const t = a * H, h0 = Math.floor(t) % H, hf = t - Math.floor(t), h1 = (h0 + 1) % H;
    const ts = [Math.max(0, Math.min(1, 1 - 2 * L)), 1 - Math.abs(2 * L - 1), Math.max(0, Math.min(1, 2 * L - 1))];
    for (let j = 0; j < 3; j++) {
      const tj = ts[j]; if (!tj) continue;
      const o = 3 * K + j * 4 * H;
      for (const [h, hw] of [[h0, 1 - hf], [h1, hf]]) {
        const k = hw * tj;
        add(o + h, c0 * k); add(o + H + h, c1 * k); add(o + 2 * H + h, c2 * k); add(o + 3 * H + h, m * k);
      }
    }
    {
      let z = (L < 0 ? 0 : L > 1 ? 1 : L) * (K - 1);
      const i = Math.min(Math.floor(z), K - 2), f = z - i, o = 3 * K + 12 * H;
      add(o + i, c0 * (1 - f)); add(o + i + 1, c0 * f);
      add(o + K + i, c1 * (1 - f)); add(o + K + i + 1, c1 * f);
      add(o + 2 * K + i, c2 * (1 - f)); add(o + 2 * K + i + 1, c2 * f);
    }
    if (it.sp) {
      // 色相（繞一圈）× 亮度 × 鮮豔度的格子，八個角線性內插
      const lin = (z, N) => { z = (z < 0 ? 0 : z > 1 ? 1 : z) * (N - 1); const i = Math.min(Math.floor(z), N - 2); return [i, z - i]; };
      const th = a * NH, g0 = Math.floor(th) % NH, gf = th - Math.floor(th), g1 = (g0 + 1) % NH;
      const [li, lf] = lin(L, NL), [ci, cf] = lin(m / 0.5, NC);
      for (const [hh, hw] of [[g0, 1 - gf], [g1, gf]])
        for (const [dl, lw] of [[0, 1 - lf], [1, lf]])
          for (const [dc, cw] of [[0, 1 - cf], [1, cf]]) add(NF + (hh * NL + li + dl) * NC + ci + dc, hw * lw * cw);
    }
    return [out[0] < 0 ? 0 : out[0] > 1 ? 1 : out[0], out[1] < 0 ? 0 : out[1] > 1 ? 1 : out[1], out[2] < 0 ? 0 : out[2] > 1 ? 1 : out[2]];
  };
}
