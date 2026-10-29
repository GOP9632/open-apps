// 臉型變形的位移場：把 faceshape.js 算出的往前位移，用網格在 GPU 上換成「每個像素要取原圖哪裡」
//
// 為什麼用網格：往前位移（原圖的點移到哪）不能直接拿來查表，要反過來算。
// 這裡把一張網格的每個頂點移到新位置，頂點上記住「回原圖要往回走多少」，
// 畫出來就是準確的反向位移圖，再交給主 shader 取樣。整張圖一張粗網格，每張臉另外一張細網格。
//
// 位移圖存在一般的 RGBA8 貼圖：x、y 各用兩個通道（高位、低位）存 16 位元，
// 兩個通道各自線性內插再組合，結果還是正確的線性內插，所以不需要浮點貼圖。
import { evalField, faceBoxes } from './faceshape.js';

const MAX_TEX = 2048;

const VS = `#version 300 es
in vec2 aPos; in vec2 aOff;
uniform vec2 uSize;
out vec2 vOff;
void main(){ vOff = aOff; gl_Position = vec4(aPos / uSize * 2.0 - 1.0, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vOff; uniform float uStep; out vec4 o;
void main(){
  vec2 c = clamp(floor(vOff / uStep + 0.5) + 32768.0, 0.0, 65535.0);
  vec2 hi = floor(c / 256.0), lo = c - hi * 256.0;
  o = vec4(hi.x, hi.y, lo.x, lo.y) / 255.0;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// 每個頂點只看蓋得到它的變形點：照片切成 48×48 格，每個變形點登記在它範圍碰到的格子裡。
// 位移是各點相加（evalField），跳過碰不到的點結果完全一樣；推臉推久了點很多時，每一筆不會越推越慢
function bucket(moves, w, h) {
  const cs = Math.max(w, h) / 48, nx = Math.ceil(w / cs) + 1, ny = Math.ceil(h / cs) + 1, cells = new Array(nx * ny), none = [];
  for (const m of moves) {
    const i0 = Math.max(0, Math.floor((m.cx - m.r) / cs)), i1 = Math.min(nx - 1, Math.floor((m.cx + m.r) / cs));
    const j0 = Math.max(0, Math.floor((m.cy - m.r) / cs)), j1 = Math.min(ny - 1, Math.floor((m.cy + m.r) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * nx + i] ||= []).push(m);
  }
  return (x, y) => cells[Math.min(ny - 1, Math.max(0, Math.floor(y / cs))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x / cs)))] || none;
}

export class WarpField {
  constructor(gl) {
    this.gl = gl;
    const p = this.p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aOff');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.uSize = gl.getUniformLocation(p, 'uSize'); this.uStep = gl.getUniformLocation(p, 'uStep');
    // 用自己的 VAO，不動到主管線的頂點設定
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bPos = gl.createBuffer(); this.bOff = gl.createBuffer(); this.bIdx = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bOff); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx);
    gl.bindVertexArray(null);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]
      .forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
    this.fb = gl.createFramebuffer(); this.tw = 0; this.th = 0;
    this.key = '';
  }

  // 回傳 { tex, step }；沒有任何變形時 step = 0（主 shader 會跳過）
  update(w, h, faces, moves, pins, boxes = []) {
    if (!moves.length && !pins.length) { this.key = ''; return { tex: this.tex, step: 0 }; }
    const key = w + 'x' + h + JSON.stringify(moves) + JSON.stringify(pins) + JSON.stringify(boxes);
    if (key === this.key) return { tex: this.tex, step: this.step };
    this.key = key;

    // 網格：整張一張粗的，每張臉、推臉畫過的範圍各一張細的（[x0, y0, x1, y1, 橫幾格, 直幾格]）
    const grids = [], n = 96, k = n / Math.max(w, h);
    grids.push([0, 0, w, h, Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))]);
    for (const b of faceBoxes(faces)) {
      const x0 = Math.max(0, b.cx - b.half), x1 = Math.min(w, b.cx + b.half), y0 = Math.max(0, b.cy - b.half), y1 = Math.min(h, b.cy + b.half);
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      const cell = Math.max(b.cell, (x1 - x0) / 220, (y1 - y0) / 220);
      grids.push([x0, y0, x1, y1, Math.max(2, Math.round((x1 - x0) / cell)), Math.max(2, Math.round((y1 - y0) / cell))]);
    }
    // 重新塑形（液化）畫過的範圍也用細網格
    for (const b of boxes) {
      const x0 = Math.max(0, b.x0), x1 = Math.min(w, b.x1), y0 = Math.max(0, b.y0), y1 = Math.min(h, b.y1);
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      const cell = Math.max(b.cell, (x1 - x0) / 200, (y1 - y0) / 200);
      grids.push([x0, y0, x1, y1, Math.max(2, Math.round((x1 - x0) / cell)), Math.max(2, Math.round((y1 - y0) / cell))]);
    }
    // 網格形狀沒變（拖臉型滑桿時每一格都一樣）：三角形索引沿用、頂點陣列重複用，只重算位移。
    // 評審 L10：以前每一格用一般陣列 push 十幾萬個頂點、六十幾萬個索引，兩張臉每格約 26ms
    const gk = grids.map(g => g.join(',')).join(';'), gl = this.gl;
    if (gk !== this.gk) {
      let nv = 0, ni = 0;
      for (const g of grids) { nv += (g[4] + 1) * (g[5] + 1); ni += g[4] * g[5] * 6; }
      const idx = new Uint32Array(ni);
      let v0 = 0, q = 0;
      for (const [, , , , nx, ny] of grids) {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = v0 + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
          idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
        }
        v0 += (nx + 1) * (ny + 1);
      }
      this.gk = gk; this.ni = ni; this.pos = new Float32Array(nv * 2); this.off = new Float32Array(nv * 2);
      gl.bindVertexArray(this.vao);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }
    const pos = this.pos, off = this.off, tmp = [0, 0], near = bucket(moves, w, h);
    let maxD = 0, q = 0;
    for (const [x0, y0, x1, y1, nx, ny] of grids) {
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny;
        evalField(near(x, y), pins, x, y, tmp);
        pos[q] = x + tmp[0]; pos[q + 1] = y + tmp[1]; off[q] = -tmp[0]; off[q + 1] = -tmp[1]; q += 2;
        maxD = Math.max(maxD, Math.abs(tmp[0]), Math.abs(tmp[1]));
      }
    }
    this.step = Math.max(maxD / 30000, 1e-4);

    const s = Math.min(1, MAX_TEX / Math.max(w, h)), tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
    if (tw !== this.tw || th !== this.th) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      this.tw = tw; this.th = th;
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bOff); gl.bufferData(gl.ARRAY_BUFFER, off, gl.DYNAMIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, tw, th);
    gl.clearColor(128 / 255, 128 / 255, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.p);
    gl.uniform2f(this.uSize, w, h); gl.uniform1f(this.uStep, this.step);
    gl.drawElements(gl.TRIANGLES, this.ni, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { tex: this.tex, step: this.step };
  }
}
