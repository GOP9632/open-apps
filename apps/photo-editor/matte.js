// 精細去背：MODNet 人像摳圖模型（Apache-2.0，開源），連頭髮絲都分得出來
// 模型和執行環境第一次用時從 CDN 下載（約 13MB + 11MB），之後瀏覽器會快取
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODEL = 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_fp16.onnx';
const REF = 512;

let sessP;
function session() {
  sessP ||= import(ORT + 'ort.wasm.min.mjs').then(async ort => {
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = 1; // GitHub Pages 沒有跨來源隔離，不能開多執行緒
    return { ort, s: await ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'] }) };
  }).catch(e => { sessP = null; throw e; });
  return sessP;
}

// 回傳跟照片一樣大的 canvas，R 通道（也複製到 G、B）是前景透明度
export async function matte(src) {
  const { ort, s } = await session();
  const W = src.width, H = src.height, k = REF / Math.min(W, H);
  const w = Math.max(32, Math.round(W * k / 32) * 32), h = Math.max(32, Math.round(H * k / 32) * 32);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, n = w * h, x = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    x[i] = d[i * 4] / 127.5 - 1; x[n + i] = d[i * 4 + 1] / 127.5 - 1; x[2 * n + i] = d[i * 4 + 2] / 127.5 - 1;
  }
  const out = await s.run({ input: new ort.Tensor('float32', x, [1, 3, h, w]) });
  const a = out.output.data, img = ctx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, a[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 模型的結果比較糊，放大到 1280 再用原圖當參考做「導向濾波」，邊緣貼齊照片裡真正的髮絲和輪廓
  const k2 = Math.min(1, 1280 / Math.max(W, H)), tw = Math.round(W * k2), th = Math.round(H * k2);
  const g = document.createElement('canvas'); g.width = tw; g.height = th;
  const gc = g.getContext('2d', { willReadFrequently: true }); gc.imageSmoothingQuality = 'high';
  gc.drawImage(src, 0, 0, tw, th);
  const gd = gc.getImageData(0, 0, tw, th).data;
  gc.drawImage(c, 0, 0, tw, th);
  const pd = gc.getImageData(0, 0, tw, th);
  const N = tw * th, I = new Float32Array(N), P = new Float32Array(N);
  for (let i = 0; i < N; i++) { I[i] = (gd[i * 4] * 0.299 + gd[i * 4 + 1] * 0.587 + gd[i * 4 + 2] * 0.114) / 255; P[i] = pd.data[i * 4] / 255; }
  const q = guided(I, P, tw, th, Math.max(2, Math.round(Math.max(tw, th) / 220)), 2e-3);
  for (let i = 0; i < N; i++) {
    // 把很淡的霧和接近全滿的地方收乾淨，頭髮的半透明保留
    const v = Math.max(0, Math.min(1, (q[i] - 0.04) / 0.9));
    pd.data[i * 4] = pd.data[i * 4 + 1] = pd.data[i * 4 + 2] = v * 255;
  }
  gc.putImageData(pd, 0, 0);
  const o = document.createElement('canvas'); o.width = W; o.height = H;
  const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(g, 0, 0, W, H);
  return o;
}

// 方框平均（用累加表，半徑多大都一樣快）
function boxMean(a, w, h, r) {
  const S = new Float64Array((w + 1) * (h + 1)), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += a[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      o[y * w + x] = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return o;
}
// He et al. 的導向濾波：輸出的邊緣跟著參考圖 I 走
function guided(I, P, w, h, r, eps) {
  const n = w * h, II = new Float32Array(n), IP = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; IP[i] = I[i] * P[i]; }
  const mI = boxMean(I, w, h, r), mP = boxMean(P, w, h, r), mII = boxMean(II, w, h, r), mIP = boxMean(IP, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mII[i] - mI[i] * mI[i], cv = mIP[i] - mI[i] * mP[i];
    A[i] = cv / (v + eps); B[i] = mP[i] - A[i] * mI[i];
  }
  const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
  return q;
}
