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
// 底片類濾鏡醒圖還有顆粒，參數在 filters.json 的 grain（濾鏡編號 → [亮度顆粒, 彩色顆粒, p, q, N]：p、q 是顆粒照亮度 L^p·(1−L)^q 分布，偏亮部或偏暗部；
// N 是照片短邊幾格，顆粒粗細。照醒圖答案原尺寸、不縮放量平坦處的細紋擬合：整體強度、四段亮度、細粗紋比例都對）。
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
    // 柔焦光暈跟著濾鏡本身（p），不是跟著清單位置：同一款放在好幾個分類（柔光白在閃光、人像、精選都有）都要有（評審 L65）
    const glowP = new Map(Object.entries(meta.glow || {}).map(([i, g]) => [meta.items[i][2], g]));
    const grainP = new Map(Object.entries(meta.grain || {}).map(([i, g]) => [meta.items[i][2], g]));
    data = {
      cats: meta.cats,
      items: [...meta.items.map(([name, cat, p, def, skin, hair], i) => ({ id: 'xt' + i, name, cat, p, def, skin, hair, hide: hide.has(i), glow: glowP.get(p) || null, grain: grainP.get(p) || null })),
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

// 給 GPU 烘色表用（gl.js bakeXt，跟 xtFn 同一個模型）：這個濾鏡那一套的權重、特徵數、有沒有格子；沒有就回傳 null
export function xtWeights(id, part) {
  const it = xtItem(id), k = part ? it?.[part] : 0; if (!it || (part && !(k >= 0))) return null;
  const nf = it.sp ? data.nfx : NF, W = it.sp ? data.wx : part ? data.ws : data.w, o = (part ? k : it.p) * nf * 3;
  return { w: W.subarray(o, o + nf * 3), nf, sp: !!it.sp, grid: data.grid || [0, 0, 0] };
}
// 一個濾鏡的顏色函式 (r,g,b) → [r,g,b]，數值 0～1；part 是 'skin' 或 'hair' 時是皮膚、頭髮那套（沒有就回傳 null）
export function xtFn(id, part) {
  const it = xtItem(id), k = part ? it?.[part] : 0; if (!it || (part && !(k >= 0))) return null;
  const W = it.sp ? data.wx : part ? data.ws : data.w, base = (part ? k : it.p) * (it.sp ? data.nfx : NF) * 3;
  const [NH, NL, NC] = data.grid || [0, 0, 0];
  // 濾鏡縮圖、GPU 不能用時烘色表（64³ 要叫 26 萬次）都用這個：裡面不新建陣列、函式（以前每次十幾個），快三成；加的順序跟以前一樣，結果一模一樣
  const acc = new Float64Array(3);
  const add = (k, v) => { if (!v) return; const o = base + k * 3; acc[0] += W[o] * v; acc[1] += W[o + 1] * v; acc[2] += W[o + 2] * v; };
  const hat = (off, z) => {
    z = (z < 0 ? 0 : z > 1 ? 1 : z) * (K - 1);
    const i = Math.min(Math.floor(z), K - 2), f = z - i;
    add(off + i, 1 - f); add(off + i + 1, f);
  };
  // 色相（繞一圈）× 亮度 × 鮮豔度的格子，八個角線性內插
  const cell = (hh, hw, li, lw, ci, cf) => { add(NF + (hh * NL + li) * NC + ci, hw * lw * (1 - cf)); add(NF + (hh * NL + li) * NC + ci + 1, hw * lw * cf); };
  return (r, g, b) => {
    acc[0] = acc[1] = acc[2] = 0;
    hat(0, r); hat(K, g); hat(2 * K, b);
    const L = LR * r + LG * g + LB * b, c0 = r - L, c1 = g - L, c2 = b - L, m = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
    let a = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) / (2 * Math.PI);
    a -= Math.floor(a);
    const t = a * H, h0 = Math.floor(t) % H, hf = t - Math.floor(t), h1 = (h0 + 1) % H;
    for (let j = 0; j < 3; j++) {
      const tj = j === 0 ? Math.max(0, Math.min(1, 1 - 2 * L)) : j === 1 ? 1 - Math.abs(2 * L - 1) : Math.max(0, Math.min(1, 2 * L - 1));
      if (!tj) continue;
      const o = 3 * K + j * 4 * H;
      let k = (1 - hf) * tj;
      add(o + h0, c0 * k); add(o + H + h0, c1 * k); add(o + 2 * H + h0, c2 * k); add(o + 3 * H + h0, m * k);
      k = hf * tj;
      add(o + h1, c0 * k); add(o + H + h1, c1 * k); add(o + 2 * H + h1, c2 * k); add(o + 3 * H + h1, m * k);
    }
    {
      let z = (L < 0 ? 0 : L > 1 ? 1 : L) * (K - 1);
      const i = Math.min(Math.floor(z), K - 2), f = z - i, o = 3 * K + 12 * H;
      add(o + i, c0 * (1 - f)); add(o + i + 1, c0 * f);
      add(o + K + i, c1 * (1 - f)); add(o + K + i + 1, c1 * f);
      add(o + 2 * K + i, c2 * (1 - f)); add(o + 2 * K + i + 1, c2 * f);
    }
    if (it.sp) {
      const th = a * NH, g0 = Math.floor(th) % NH, gf = th - Math.floor(th), g1 = (g0 + 1) % NH;
      let zl = (L < 0 ? 0 : L > 1 ? 1 : L) * (NL - 1); const li = Math.min(Math.floor(zl), NL - 2), lf = zl - li;
      let zc = m / 0.5; zc = (zc < 0 ? 0 : zc > 1 ? 1 : zc) * (NC - 1); const ci = Math.min(Math.floor(zc), NC - 2), cf = zc - ci;
      cell(g0, 1 - gf, li, 1 - lf, ci, cf); cell(g0, 1 - gf, li + 1, lf, ci, cf);
      cell(g1, gf, li, 1 - lf, ci, cf); cell(g1, gf, li + 1, lf, ci, cf);
    }
    const o0 = acc[0], o1 = acc[1], o2 = acc[2];
    return [o0 < 0 ? 0 : o0 > 1 ? 1 : o0, o1 < 0 ? 0 : o1 > 1 ? 1 : o1, o2 < 0 ? 0 : o2 > 1 ? 1 : o2];
  };
}
