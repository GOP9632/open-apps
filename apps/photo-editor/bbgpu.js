// 美顏筆放開手指那一筆改在 GPU 上算（評審 H1：放開後粉紅線要停 0.1～0.4 秒，下一筆的觸控在後面排隊）。
// Hypic 也是這樣：遮罩當貼圖，最後一個 shader 用遮罩把原圖和效果混起來。
// 公式跟 beautybrush.js 的 block()、pix()、blemishStroke() 一模一樣，只是照抄成 shader，幾十萬個像素一起算：
//   遮罩、小圖的雙線性取樣照 grid() 的算法，眼部亮白、調膚質、去油光的小模糊照 boxBlur（三次方框、邊緣用最邊上的值）。
// 自己開一個小的 WebGL2，不跟主畫面共用狀態。貼圖一律用 texelFetch、不翻轉：第 y 列就是照片的第 y 列。
// 不支援 WebGL2、浮點貼圖不能畫、或中途出錯，就回傳 null，照舊用 CPU 算。
// 算好的結果非同步讀回（評審驗 #141：同步 readPixels 等 GPU 算完，放開後主執行緒整段卡住，下一筆的開頭被吃掉）：
// 指令送出去就回傳 Promise，GPU 在算的時候主執行緒可以繼續處理手指。

const VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
out vec4 o;
`;
// 照 grid()：第 p 個像素落在 n 格的小圖哪兩格之間：u = clamp((p + 0.5)·s − 0.5, 0, n − 1)
const GRID = `
void gridAt(ivec2 p, vec2 s, ivec2 n, out ivec2 i0, out ivec2 i1, out vec2 f){
  vec2 u = clamp((vec2(p) + 0.5) * s - 0.5, vec2(0.0), vec2(n - 1)), a = floor(u);
  i0 = ivec2(a); i1 = min(n - 1, i0 + 1); f = u - a;
}`;

// 先準備要模糊的那層：rgb 是開始之前的照片；去油光的 a 是「比周圍亮很多的亮點」（同 block() 的 sh）
const FS_PREP = HEAD + GRID + `
uniform sampler2D uO, uH; uniform ivec2 uE, uHn; uniform vec2 uHs; uniform int uOil;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uO, q, 0).rgb;
  float sh = 0.0;
  if (uOil == 1) {
    ivec2 i0, i1; vec2 f; gridAt(uE + q, uHs, uHn, i0, i1, f);
    float Lb = texelFetch(uH, i0, 0).a * (1.0 - f.x) * (1.0 - f.y) + texelFetch(uH, ivec2(i1.x, i0.y), 0).a * f.x * (1.0 - f.y)
      + texelFetch(uH, ivec2(i0.x, i1.y), 0).a * (1.0 - f.x) * f.y + texelFetch(uH, i1, 0).a * f.x * f.y;
    float l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    sh = smoothstep(0.02, 0.1, l - Lb) * smoothstep(0.5, 0.8, l);
  }
  o = vec4(c, sh);
}`;
// 方框模糊一個方向（照 boxBlur：窗口 2r + 1、邊緣用最邊上的值）；四個通道各自的半徑 uR
const FS_BOX = HEAD + `
uniform sampler2D uT; uniform ivec2 uD, uN; uniform ivec4 uR; uniform int uRm;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 s = vec4(0.0);
  for (int i = -uRm; i <= uRm; i++) s += texelFetch(uT, clamp(q + uD * i, ivec2(0), uN - 1), 0) * vec4(lessThanEqual(ivec4(abs(i)), uR));
  o = s / vec4(uR * 2 + 1);
}`;
// 一支筆在一個像素的效果，同 pix()
const PIX = {
  smooth: `float f = (1.0 - h.x / (h.x + 0.002)) * smoothstep(0.2, 0.45, c.r) * a; return c + (h.yzw - c) * f;`,
  circle: `return c + h.rgb * min(1.0, 1.5 * a);`,
  fold: `return c + h.rgb * min(1.0, 1.12 * a);`,
  eye: `float lift = 0.12 * a * smoothstep(0.15, 0.6, l), mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
    float white = 0.4 * a * (1.0 - smoothstep(0.12, 0.3, mx - mn)) * smoothstep(0.4, 0.6, l);
    vec3 v = c + (c - k.rgb) * a; v += (l - v) * white; return v + (1.0 - v) * lift;`,
  oil: `float f = min(1.0, k.a * 1.3) * a; return c + (h.rgb + (c - k.rgb) * 0.5 - c) * f;`,
  texture: `float p = 1.0 - 0.7 * a, q = 1.0 + 0.5 * a; return h.rgb + (k.rgb - h.rgb) * p + (c - k.rgb) * q;`,
  teeth: `float yel = clamp(((c.r + c.g) / 2.0 - c.b) * 3.0, 0.0, 1.0), red = clamp((c.r - c.g - 0.08) * 5.0, 0.0, 1.0);
    float gate = smoothstep(0.25, 0.5, l) * (1.0 - red), dd = 0.8 * a * yel * gate, lift = 0.15 * a * gate;
    vec3 P = c + (l - c) * dd; return P + (1.0 - P) * lift;`,
};
// 混合：底圖 + 這支筆（舊遮罩值 → 新遮罩值）的變化，同 block()
//   一般一筆：底圖是現在的照片，舊遮罩是 uA 裡 uM 那塊換成 uMo（這一筆改到的那塊遮罩的舊值）
//   全部重算（除斑改過原圖）：底圖是開始之前的照片（或前一支筆算到一半的浮點圖），舊遮罩是 0（uZ）
//   uA：遮罩用到的那幾格（左上角 uAo、大小 uAn）；uBo：底圖跟這一塊差幾格
const fsMix = t => HEAD + GRID + `
uniform sampler2D uB, uO, uA, uMo, uH, uK;
uniform ivec2 uOrg, uE, uAo, uAn, uMn, uHn, uBo; uniform ivec4 uM; uniform vec2 uMs, uHs; uniform int uZ;
float cA(ivec2 c){ return texelFetch(uA, clamp(c - uAo, ivec2(0), uAn - 1), 0).r; }
float c0(ivec2 c){ ivec2 r = c - uM.xy; return r.x >= 0 && r.y >= 0 && r.x < uM.z && r.y < uM.w ? texelFetch(uMo, r, 0).r : cA(c); }
vec3 pix(float a, vec3 c, float l, vec4 h, vec4 k){
  if (a <= 0.0) return c;
  ${PIX[t]}
}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy), p = uOrg + q;
  vec4 bf = texelFetch(uB, q + uBo, 0);
  ivec2 i0, i1; vec2 f; gridAt(p, uMs, uMn, i0, i1, f);
  ivec2 j01 = ivec2(i1.x, i0.y), j10 = ivec2(i0.x, i1.y);
  float t = cA(i0) + (cA(j01) - cA(i0)) * f.x, b = cA(j10) + (cA(i1) - cA(j10)) * f.x, a1 = t + (b - t) * f.y, a0 = 0.0;
  if (uZ == 0) { t = c0(i0) + (c0(j01) - c0(i0)) * f.x; b = c0(j10) + (c0(i1) - c0(j10)) * f.x; a0 = t + (b - t) * f.y; }
  if (a1 == a0 || (a1 <= 0.002 && a0 <= 0.002)) { o = bf; return; }
  vec3 c = texelFetch(uO, p - uE, 0).rgb;
  float l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  gridAt(p, uHs, uHn, i0, i1, f);
  vec4 h = texelFetch(uH, i0, 0) * ((1.0 - f.x) * (1.0 - f.y)) + texelFetch(uH, ivec2(i1.x, i0.y), 0) * (f.x * (1.0 - f.y))
    + texelFetch(uH, ivec2(i0.x, i1.y), 0) * ((1.0 - f.x) * f.y) + texelFetch(uH, i1, 0) * (f.x * f.y);
  vec4 k = texelFetch(uK, p - uE, 0);
  o = vec4(bf.rgb + (pix(a1, c, l, h, k) - pix(a0, c, l, h, k)), bf.a);
}`;

// 除斑去痘原尺寸那段（同 blemishStroke()）：小圖上的補色 fill、筆刷遮罩 m（uL），周圍亮度 Lb、紅度 redB（uL2），
// 小圖第 0 格在照片的 uG、一格 n 個像素（uS = 1/n）
const LOW = `
uniform sampler2D uL, uL2; uniform ivec2 uG, uGn; uniform float uS;
vec4 lowAt(sampler2D t, ivec2 p){
  ivec2 i0, i1; vec2 f; gridAt(p - uG, vec2(uS), uGn, i0, i1, f);
  vec4 a = texelFetch(t, i0, 0), b = texelFetch(t, ivec2(i1.x, i0.y), 0), c = texelFetch(t, ivec2(i0.x, i1.y), 0), d = texelFetch(t, i1, 0);
  vec4 top = a + (b - a) * f.x, bot = c + (d - c) * f.x;
  return top + (bot - top) * f.y;
}
// 不比周圍暗、不比周圍紅的皮膚（拿來補的、拿來留紋理的）
float okOf(vec3 c, ivec2 p){
  float l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; vec4 e = lowAt(uL2, p);
  return smoothstep(-0.06, -0.02, l - e.x) * (1.0 - smoothstep(0.03, 0.07, c.r - c.g - e.y));
}`;
const FS_BPREP = HEAD + GRID + LOW + `
uniform sampler2D uO; uniform ivec2 uE;
void main(){ ivec2 q = ivec2(gl_FragCoord.xy); vec3 c = texelFetch(uO, q, 0).rgb; float w = okOf(c, uE + q) + 1e-3; o = vec4(c * w, w); }`;
const FS_BFIN = HEAD + GRID + LOW + `
uniform sampler2D uO, uK; uniform ivec2 uE, uF; uniform float uAmt;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy), p = uF + q;
  vec4 src = texelFetch(uO, p - uE, 0), lo = lowAt(uL, p);
  if (lo.a <= 0.002) { o = src; return; }
  vec3 v = src.rgb; vec4 cb = texelFetch(uK, p - uE, 0);
  o = vec4(v + (lo.rgb + (v - cb.rgb / cb.a) * okOf(v, p) - v) * uAmt * lo.a + 0.5 / 255.0, src.a);
}`;

// 一次最多算這麼大一塊（每張暫存貼圖最多幾 MB），大筆畫分幾塊算
const TILE = 512;
let G = null, off = /[?&]bbcpu\b/.test(location.search);
export function bbGpuOff(v) { off = v; if (v) gpuFree(); }

function init() {
  if (G || off) return G;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const gl = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl2');
    const f32 = !!gl.getExtension('EXT_color_buffer_float'), fl = f32 || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    G = { gl, c, fl, f32, par: gl.getExtension('KHR_parallel_shader_compile'), prog: {}, tex: {}, fb: {}, hk: {}, pbo: null };
    // 背景太久被系統收回：下次再開一個
    c.addEventListener('webglcontextlost', () => { G = null; });
  } catch (e) { off = true; G = null; }
  return G;
}
// 送去編譯就回來，不問結果（問了就得等編譯完）；第一次真的要用時才檢查（linked）
function program(fs) {
  const { gl } = G, p = gl.createProgram(), sh = [];
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); sh.push(s);
  }
  gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
  return { p, sh, u: null, t: performance.now() };
}
function linked(P) {
  if (P.u) return P;
  const { gl } = G, p = P.p;
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(P.sh.map(s => gl.getShaderInfoLog(s)).join(' ') + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  P.u = u;
  return P;
}
const FS = { prep: FS_PREP, box: FS_BOX, bprep: FS_BPREP, bfin: FS_BFIN };
const prog = k => linked(G.prog[k] ||= program(FS[k] || fsMix(k)));
function newTex() {
  const { gl } = G, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}
// 傳一塊進貼圖：data 是寬 rowLen 的整張，從 (sx, sy) 開始取 w × h（不用先複製出來）
function upload(name, fmt, w, h, data, rowLen = 0, sx = 0, sy = 0) {
  const { gl } = G, t = G.tex[name] ||= newTex(), [ifmt, f, type] = fmt === 'r8' ? [gl.R8, gl.RED, gl.UNSIGNED_BYTE] : fmt === 'f32' ? [gl.RGBA32F, gl.RGBA, gl.FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, rowLen); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sx); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sy);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, f, type, data);
  return t;
}
// 畫進去的貼圖：只會變大不會變小，用到的是左下角 w × h。half：浮點（能用 32 位元就用 32 位元）
function target(name, half, w, h) {
  const { gl } = G;
  let f = G.fb[name];
  if (!f || f.w < w || f.h < h) {
    const W = Math.max(w, f?.w || 0), H = Math.max(h, f?.h || 0);
    if (f) { gl.deleteTexture(f.t); gl.deleteFramebuffer(f.f); }
    f = G.fb[name] = { f: gl.createFramebuffer(), t: newTex(), w: W, h: H };
    const [ifmt, type] = !half ? [gl.RGBA8, gl.UNSIGNED_BYTE] : half === 32 && G.f32 ? [gl.RGBA32F, gl.FLOAT] : [gl.RGBA16F, gl.HALF_FLOAT];
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, W, H, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
  }
  return f;
}
function draw(k, f, w, h, set, texs) {
  const { gl } = G, P = prog(k);
  gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, f.f); gl.viewport(0, 0, w, h);
  texs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], i); });
  set(gl, P.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
// 停筆 10 秒、照片收起來、換一串美顏筆：放掉貼圖（程式留著），iPhone 記憶體才夠別的功能用；再塗時重傳只要幾毫秒
// 還有一筆在等 GPU（busy）：等它讀回來再放
let freeT = 0, busy = 0, freeLater = false;
const idle = () => { clearTimeout(freeT); freeT = setTimeout(gpuFree, 10000); };
export function gpuFree() {
  if (!G) return;
  if (busy) { freeLater = true; return; }
  const { gl } = G;
  for (const t of Object.values(G.tex)) gl.deleteTexture(t);
  for (const f of Object.values(G.fb)) { gl.deleteTexture(f.t); gl.deleteFramebuffer(f.f); }
  for (const k of Object.values(G.hk)) gl.deleteTexture(k.t);
  if (G.pbo) gl.deleteBuffer(G.pbo.b);
  G.tex = {}; G.fb = {}; G.hk = {}; G.pbo = null; freeLater = false;
}
function fail(e, what) {
  console.warn(what + ' GPU 失敗，改用 CPU', e);
  busy = 0; off = true; gpuFree(); G = null;
  return null;
}
// 讀回：每塊 readPixels 進 PIXEL_PACK_BUFFER（排在 GPU 指令後面，不用等），最後放一個 fence；
// 之後每幾毫秒問一次做完沒（不會卡），做完才一次拿回來。回傳 Promise：true 讀到了；false 畫布被系統收回（下次重開）
function pack(n) {
  const { gl } = G;
  if (!G.pbo || G.pbo.n < n) {
    if (G.pbo) gl.deleteBuffer(G.pbo.b);
    G.pbo = { b: gl.createBuffer(), n };
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, G.pbo.b); gl.bufferData(gl.PIXEL_PACK_BUFFER, n, gl.STREAM_READ);
  } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, G.pbo.b);
}
function readBack(o8) {
  const g = G, { gl } = g, sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.flush();
  busy++;
  return new Promise((ok, bad) => {
    const poll = () => {
      if (G !== g || gl.isContextLost()) { busy = 0; return ok(false); }
      const r = gl.clientWaitSync(sync, 0, 0);
      if (r === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 2); return; }
      gl.deleteSync(sync);
      if (r === gl.WAIT_FAILED) return bad(new Error('wait failed'));
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, g.pbo.b);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, o8, 0, o8.length);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      if (gl.getError() !== gl.NO_ERROR) return bad(new Error('gl error'));
      busy--; if (!busy && freeLater) gpuFree();
      idle(); ok(true);
    };
    setTimeout(poll, 1);
  });
}
// 先開好、編好這支筆的程式，再每支畫一個像素（GPU 第一次畫才建管線），第一筆放開才不會多等。
// 支援平行編譯就等它在背景編完再畫，不卡主執行緒
export function gpuWarm(tool, local) {
  if (!init()) return;
  const ks = tool === 'blemish' ? (G.fl ? [['bprep', 32], ['box', 32], ['bfin', 0]] : []) : [[tool, 0], ...(local && G.fl ? [['prep', 16], ['box', 16]] : [])];
  try { for (const [k] of ks) G.prog[k] ||= program(FS[k] || fsMix(k)); G.gl.flush(); } catch (e) { return fail(e, '預備'); }
  const g = G, go = () => {
    if (G !== g || busy) return;
    const { gl, par } = G;
    if (par && ks.some(([k]) => !gl.getProgramParameter(G.prog[k].p, par.COMPLETION_STATUS_KHR))) { setTimeout(go, 20); return; }
    // 不支援平行編譯：GPU 那邊一樣在背景編，只是問不到編好沒；送出後先等 150ms 再碰它，不然一問就得停在主執行緒等編完（換到去油光停約 35ms）
    const wait = par ? 0 : Math.max(0, ...ks.map(([k]) => G.prog[k].u ? 0 : G.prog[k].t + 150 - performance.now()));
    if (wait > 0) { setTimeout(go, wait); return; }
    try {
      // 每個貼圖單元都放一張 1×1 的空貼圖（取樣器不能指到正在畫的那張）
      const fs = ks.map(([, f]) => target('w' + f, f, 1, 1)), t = upload('w', 'rgba', 1, 1, new Uint8Array(4));
      for (let i = 0; i < 8; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); }
      ks.forEach(([k], i) => draw(k, fs[i], 1, 1, () => {}, []));
      // 等 GPU 畫完再清掉可能的錯誤：馬上問 getError 要等 GPU 把這幾個程式第一次畫完，換筆時主執行緒停 30～40ms（評審 #163）
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
      const poll = () => {
        if (G !== g || gl.isContextLost()) return;
        if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 10); return; }
        gl.deleteSync(sync); if (!busy) gl.getError();
      };
      setTimeout(poll, 10);
    } catch (e) { fail(e, '預備'); }
  };
  setTimeout(go, 0);
}
// 先把這支筆在小圖上的效果傳上去（j 同 gpuMix 的 jobs），第一筆放開才不用打包、上傳
export function gpuPrime(s, j) {
  if (!init() || busy) return;
  try { helper(j, s.hw, s.hh); } catch (e) { fail(e, '預備'); }
}
function helper(j, hw, hh) {
  const { gl } = G;
  let hk = G.hk[j.t];
  if (hk && hk.o === j.hel && hk.v === j.hel.v) return;
  // 除斑只改了小圖的一塊：只重傳那塊
  const r = j.hel.pr;
  if (hk && hk.o === j.hel && r) {
    gl.bindTexture(gl.TEXTURE_2D, hk.t);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, r[0], r[1], r[2] - r[0], r[3] - r[1], gl.RGBA, gl.FLOAT, j.pack(r));
    hk.v = j.hel.v; j.hel.pr = null;
    return;
  }
  const d = j.pack(); j.hel.pr = null;
  if (hk) gl.deleteTexture(hk.t);
  hk = G.hk[j.t] = { o: j.hel, v: j.hel.v, t: newTex() };
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, d ? hw : 1, d ? hh : 1, 0, gl.RGBA, gl.FLOAT, d || new Float32Array(4));
}
// 除斑去痘一筆在原尺寸的那段：F 是要算的範圍、G 是小圖的範圍（一格 n 個像素、gw × gh 格），
// low：[補色 R G B, 筆刷遮罩]、low2：[周圍亮度, 周圍紅度]（小圖上的 Float32Array）；k：強度。
// 回傳 Promise：F 那塊的 after；做不到回傳 null（不用 Promise）
export function gpuBlem(W, H, F, G0, n, gw, gh, low, low2, k, readO) {
  if (!init() || !G.fl || busy) return null;
  try {
    const { gl } = G, w = F[2] - F[0], h = F[3] - F[1], out = new Uint8ClampedArray(w * h * 4), N = gw * gh;
    pack(w * h * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const packLow = a => { const d = new Float32Array(N * 4); a.forEach((c, j) => { for (let i = 0; i < N; i++) d[i * 4 + j] = c[i]; }); return d; };
    const tL = upload('bl', 'f32', gw, gh, packLow(low)), tL2 = upload('bl2', 'f32', gw, gh, packLow(low2));
    const lowU = (gl, u) => { gl.uniform2i(u.uG, G0[0], G0[1]); gl.uniform2i(u.uGn, gw, gh); gl.uniform1f(u.uS, 1 / n); };
    for (let ty = F[1]; ty < F[3]; ty += TILE) for (let tx = F[0]; tx < F[2]; tx += TILE) {
      const tx1 = Math.min(F[2], tx + TILE), ty1 = Math.min(F[3], ty + TILE), tw = tx1 - tx, th = ty1 - ty;
      const ex0 = Math.max(0, tx - 6), ey0 = Math.max(0, ty - 6), ex1 = Math.min(W, tx1 + 6), ey1 = Math.min(H, ty1 + 6), ew = ex1 - ex0, eh = ey1 - ey0;
      const od = readO(ex0, ey0, ex1, ey1), tO = upload('o', 'rgba', ew, eh, new Uint8Array(od.buffer, od.byteOffset, od.length));
      const f0 = target('bk0', 32, ew, eh), f1 = target('bk1', 32, ew, eh);
      draw('bprep', f0, ew, eh, (gl, u) => { lowU(gl, u); gl.uniform2i(u.uE, ex0, ey0); }, [['uO', tO], ['uL', tL], ['uL2', tL2]]);
      for (let i = 0; i < 6; i++) {
        const [a, b] = i % 2 ? [f1, f0] : [f0, f1];
        draw('box', b, ew, eh, (gl, u) => { gl.uniform2i(u.uD, i % 2 ? 0 : 1, i % 2 ? 1 : 0); gl.uniform2i(u.uN, ew, eh); gl.uniform4i(u.uR, 2, 2, 2, 2); gl.uniform1i(u.uRm, 2); }, [['uT', a.t]]);
      }
      const fo = target('out', 0, tw, th);
      draw('bfin', fo, tw, th, (gl, u) => { lowU(gl, u); gl.uniform2i(u.uE, ex0, ey0); gl.uniform2i(u.uF, tx, ty); gl.uniform1f(u.uAmt, k); }, [['uO', tO], ['uK', f0.t], ['uL', tL], ['uL2', tL2]]);
      gl.pixelStorei(gl.PACK_ROW_LENGTH, w); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, G.pbo.b);
      gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, ((ty - F[1]) * w + tx - F[0]) * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    }
    return readBack(new Uint8Array(out.buffer)).then(r => r ? out : null, e => fail(e, '除斑'));
  } catch (e) { return fail(e, '除斑'); }
}

// 重算照片的 [x0,x1)×[y0,y1)，回傳算好的 after（RGBA）；做不到回傳 null。同 compose()：
//   before 有給：一般一筆，現在的照片 + jobs[0] 那支筆（舊遮罩 → 新遮罩）的變化
//   before 是 null：全部重算，開始之前的照片 + 每支筆（0 → 遮罩值）的變化，中間用浮點圖一支一支加上去
//   s：W H（照片）、mw mh（遮罩）、hw hh（小圖）
//   jobs：每支筆 { t, A（遮罩）, m（這一筆改到的那塊遮罩的舊值，全部重算時沒有）, box（遮罩塗過的範圍）,
//          hel、pack()（小圖上的效果打包成 RGBA 浮點，沒有就 null）, rad（小模糊每個通道的半徑，不用就 null） }
//   mg：小模糊要多讀的邊；readO：讀開始之前的照片
// 回傳 Promise：算好的 after；做不到回傳 null（不用 Promise）
export function gpuMix(s, jobs, mg, readO, x0, y0, x1, y1, before) {
  // 小模糊、好幾支筆疊加都要畫進浮點貼圖：這台不能畫浮點就整個交給 CPU
  if (!init() || busy || ((jobs.some(j => j.rad) || (!before && jobs.length > 1)) && !G.fl)) return null;
  try {
    const { gl } = G, { W, H, mw, mh, hw, hh } = s, w = x1 - x0, h = y1 - y0, out = new Uint8ClampedArray(w * h * 4), o8 = new Uint8Array(out.buffer);
    for (const j of jobs) helper(j, hw, hh);
    pack(w * h * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // 沒有筆塗到的那幾塊照抄開始之前的照片：讀回來之後再填（讀回會蓋過整塊）
    const keep = [];
    const bv = before && new Uint8Array(before.buffer, before.byteOffset, before.length), mx = mw / W, my = mh / H;
    // 遮罩用到的格子（照 grid() 算，前後多留一格，GPU 浮點算出來差一點也不會超出去）
    const cells = (p0, p1, k, n) => { const u = p => Math.min(n - 1, Math.max(0, (p + 0.5) * k - 0.5)); return [Math.max(0, Math.floor(u(p0)) - 1), Math.min(n - 1, Math.floor(u(p1 - 1)) + 2)]; };
    for (let ty = y0; ty < y1; ty += TILE) for (let tx = x0; tx < x1; tx += TILE) {
      const tx1 = Math.min(x1, tx + TILE), ty1 = Math.min(y1, ty + TILE), tw = tx1 - tx, th = ty1 - ty;
      // 這一塊有塗到的筆（同 block() 用遮罩範圍篩）
      const js = before ? jobs : jobs.filter(({ box: b }) => b && b[0] <= tx1 * mx + 1 && b[2] >= tx * mx - 1 && b[1] <= ty1 * my + 1 && b[3] >= ty * my - 1);
      const g = js.some(j => j.rad) ? mg : 0;
      const ex0 = Math.max(0, tx - g), ey0 = Math.max(0, ty - g), ex1 = Math.min(W, tx1 + g), ey1 = Math.min(H, ty1 + g), ew = ex1 - ex0, eh = ey1 - ey0;
      const od = readO(ex0, ey0, ex1, ey1);
      if (!js.length) {
        keep.push(() => { for (let y = 0; y < th; y++) out.set(od.subarray(((ty - ey0 + y) * ew + tx - ex0) * 4, ((ty - ey0 + y) * ew + tx1 - ex0) * 4), ((ty - y0 + y) * w + tx - x0) * 4); });
        continue;
      }
      const tO = upload('o', 'rgba', ew, eh, new Uint8Array(od.buffer, od.byteOffset, od.length));
      let tB = before ? upload('b', 'rgba', tw, th, bv, w, tx - x0, ty - y0) : tO, bo = before ? [0, 0] : [tx - ex0, ty - ey0];
      const [cx0, cx1] = cells(tx, tx1, mx, mw), [cy0, cy1] = cells(ty, ty1, my, mh);
      js.forEach((j, i) => {
        const tA = upload('a', 'r8', cx1 - cx0 + 1, cy1 - cy0 + 1, j.A, mw, cx0, cy0), m = j.m || { x: 0, y: 0, w: 0, h: 0 };
        const tMo = upload('mo', 'r8', Math.max(1, m.w), Math.max(1, m.h), j.m ? m.d : new Uint8Array(1)), hk = G.hk[j.t];
        let tK = tO;
        if (j.rad) {
          const f0 = target('k0', 16, ew, eh), f1 = target('k1', 16, ew, eh), rm = Math.max(...j.rad);
          draw('prep', f0, ew, eh, (gl, u) => { gl.uniform2i(u.uE, ex0, ey0); gl.uniform2i(u.uHn, hw, hh); gl.uniform2f(u.uHs, hw / W, hh / H); gl.uniform1i(u.uOil, j.t === 'oil' ? 1 : 0); }, [['uO', tO], ['uH', hk.t]]);
          for (let k = 0; k < 6; k++) {
            const [a, b] = k % 2 ? [f1, f0] : [f0, f1];
            draw('box', b, ew, eh, (gl, u) => { gl.uniform2i(u.uD, k % 2 ? 0 : 1, k % 2 ? 1 : 0); gl.uniform2i(u.uN, ew, eh); gl.uniform4i(u.uR, ...j.rad); gl.uniform1i(u.uRm, rm); }, [['uT', a.t]]);
          }
          tK = f0.t;
        }
        // 最後一支筆畫成 8 位元的結果；前面的先存在浮點圖，下一支筆接著加
        const fo = i === js.length - 1 ? target('out', 0, tw, th) : target(i % 2 ? 'acc1' : 'acc0', 32, tw, th);
        draw(j.t, fo, tw, th, (gl, u) => {
          gl.uniform2i(u.uOrg, tx, ty); gl.uniform2i(u.uE, ex0, ey0); gl.uniform2i(u.uAo, cx0, cy0); gl.uniform2i(u.uAn, cx1 - cx0 + 1, cy1 - cy0 + 1);
          gl.uniform2i(u.uMn, mw, mh); gl.uniform2i(u.uHn, hw, hh); gl.uniform4i(u.uM, m.x, m.y, m.w, m.h); gl.uniform2i(u.uBo, ...bo); gl.uniform1i(u.uZ, j.m ? 0 : 1);
          gl.uniform2f(u.uMs, mx, my); gl.uniform2f(u.uHs, hw / W, hh / H);
        }, [['uB', tB], ['uO', tO], ['uA', tA], ['uMo', tMo], ['uH', hk.t], ['uK', tK]]);
        tB = fo.t; bo = [0, 0];
      });
      gl.pixelStorei(gl.PACK_ROW_LENGTH, w); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, G.pbo.b);
      gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, ((ty - y0) * w + tx - x0) * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    }
    return readBack(o8).then(r => { if (!r) return null; keep.forEach(f => f()); return out; }, e => fail(e, '美顏筆'));
  } catch (e) { return fail(e, '美顏筆'); }
}
