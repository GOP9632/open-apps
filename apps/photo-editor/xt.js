// 醒圖風格濾鏡：我們自己的顏色模型，參數是對著醒圖濾鏡的實際輸出量出來的（不含醒圖的 LUT 檔）。
//
// 模型（150 個特徵，每個輸出通道各一組權重，線性組合）：
//   1. R、G、B 各一條 9 點曲線（分段線性）
//   2. 暗、中、亮三段 × 8 個色相：色度（偏離灰色的量）怎麼變、亮度怎麼變
//   3. 依亮度（9 點）的色度變化
// 權重存在 xt/filters.bin（int16，每個濾鏡一個縮放值），名稱、分類、預設強度在 xt/filters.json。

const K = 9, H = 8, NF = 150;
const LR = 0.2126, LG = 0.7152, LB = 0.0722;
let data = null, loading = null;

export function loadXT() {
  loading ||= Promise.all([
    fetch(new URL('xt/filters.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('xt/filters.bin', import.meta.url)).then(r => r.arrayBuffer()),
  ]).then(([meta, buf]) => {
    const q = new Int16Array(buf), n = meta.scale.length, w = new Float32Array(q.length);
    for (let f = 0; f < n; f++) { const s = meta.scale[f], o = f * NF * 3; for (let k = 0; k < NF * 3; k++) w[o + k] = q[o + k] * s; }
    data = { cats: meta.cats, items: meta.items.map(([name, cat, p, def], i) => ({ id: 'xt' + i, name, cat, p, def })), w };
    return data;
  }).catch(e => { console.warn(e); loading = null; return null; });
  return loading;
}
export const xtData = () => data;
export const xtItem = id => data && id?.startsWith('xt') ? data.items[+id.slice(2)] : null;

// 一個濾鏡的顏色函式 (r,g,b) → [r,g,b]，數值 0～1
export function xtFn(id) {
  const it = xtItem(id); if (!it) return null;
  const W = data.w, base = it.p * NF * 3;
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
    return [out[0] < 0 ? 0 : out[0] > 1 ? 1 : out[0], out[1] < 0 ? 0 : out[1] > 1 ? 1 : out[1], out[2] < 0 ? 0 : out[2] > 1 ? 1 : out[2]];
  };
}
