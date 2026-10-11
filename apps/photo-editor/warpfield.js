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
  update(w, h, faces, moves, pins) {
    if (!moves.length && !pins.length) { this.key = ''; return { tex: this.tex, step: 0 }; }
    const key = w + 'x' + h + JSON.stringify(moves) + JSON.stringify(pins);
    if (key === this.key) return { tex: this.tex, step: this.step };
    this.key = key;

    const pos = [], off = [], idx = [], tmp = [0, 0];
    let maxD = 0;
    const grid = (x0, y0, x1, y1, nx, ny) => {
      const base = pos.length / 2;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny;
        evalField(moves, pins, x, y, tmp);
        pos.push(x + tmp[0], y + tmp[1]); off.push(-tmp[0], -tmp[1]);
        maxD = Math.max(maxD, Math.abs(tmp[0]), Math.abs(tmp[1]));
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    };
    const n = 96, k = n / Math.max(w, h);
    grid(0, 0, w, h, Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
    for (const b of faceBoxes(faces)) {
      const x0 = Math.max(0, b.cx - b.half), x1 = Math.min(w, b.cx + b.half), y0 = Math.max(0, b.cy - b.half), y1 = Math.min(h, b.cy + b.half);
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      const cell = Math.max(b.cell, (x1 - x0) / 220, (y1 - y0) / 220);
      grid(x0, y0, x1, y1, Math.max(2, Math.round((x1 - x0) / cell)), Math.max(2, Math.round((y1 - y0) / cell)));
    }
    this.step = Math.max(maxD / 30000, 1e-4);

    const gl = this.gl;
    const s = Math.min(1, MAX_TEX / Math.max(w, h)), tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
    if (tw !== this.tw || th !== this.th) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      this.tw = tw; this.th = th;
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bOff); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(off), gl.DYNAMIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.DYNAMIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, tw, th);
    gl.clearColor(128 / 255, 128 / 255, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.p);
    gl.uniform2f(this.uSize, w, h); gl.uniform1f(this.uStep, this.step);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { tex: this.tex, step: this.step };
  }
}
