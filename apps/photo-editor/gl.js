// WebGL2 修圖管線：
//   1. 縮小到短邊 360 做保邊磨皮（不管照片多大，磨皮質感都一樣）
//   2. 主 shader：變形（瘦臉、大眼、身體塑形）→ 銳化 → 磨皮、美白、祛黑眼圈、法令紋、亮眼、白牙
//      → 打光、閃光燈 → 調色 → 濾鏡 LUT → 創意特效、光效 → 暗角、顆粒 → 去背、換背景
//   3. 背景虛化、素描用的模糊圖，換照片或人像遮罩好了時算一次
export const MAX_WARPS = 64;
export const MAX_FACES = 5;
const SMOOTH_SHORT = 360;

const VS = `#version 300 es
in vec2 a;
uniform float uFbo;
out vec2 vUV;
void main(){
  vUV = vec2((a.x + 1.0) * 0.5, uFbo > 0.5 ? (a.y + 1.0) * 0.5 : (1.0 - a.y) * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

// 臉型：主 shader 畫完後再照位移圖取樣一次（warpfield.js）。
// 位移圖 x、y 各用高低兩個通道存 16 位元，uStep 是一格代表幾個像素
const FS_DISP = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex, uDisp, uSeg; uniform vec2 uSize; uniform float uStep, uProtect; out vec4 o;
void main(){
  vec4 e = texture(uDisp, vUV) * 255.0;
  vec2 d = (vec2(e.r * 256.0 + e.b, e.g * 256.0 + e.a) - 32768.0) * uStep;
  vec2 uv = vUV + d / uSize;
  o = texture(uTex, uv);
  if (uProtect > 0.5) {
    // 背景保護（同主 shader）：背景留在原位，空隙取反方向的背景
    float mv = clamp(length(d) * 1.5, 0.0, 1.0);
    if (mv > 0.0) {
      vec2 uvm = vUV - d * 2.0 / uSize;
      float s0 = texture(uSeg, vUV).r, s1 = texture(uSeg, uv).r;
      vec4 bg = mix(texture(uTex, vUV), texture(uTex, uvm), smoothstep(0.15, 0.6, s0));
      o = mix(o, mix(bg, o, smoothstep(0.2, 0.7, s1)), mv);
    }
  }
}`;

const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main(){ o = texture(uTex, vUV); }`;

// 保邊模糊（雙邊濾波）：顏色差太多的鄰居權重變小，所以五官邊緣不會糊掉
const FS_BILATERAL = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uSigR; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
    vec2 off = vec2(float(x), float(y));
    vec3 s = texture(uTex, vUV + off * uTexel * 1.5).rgb;
    vec3 dc = s - c;
    float w = exp(-dot(off, off) / 18.0 - dot(dc, dc) / (2.0 * uSigR * uSigR));
    sum += s * w; wsum += w;
  }
  o = vec4(sum / wsum, 1.0);
}`;

// 九點高斯模糊（分水平、垂直兩次）
const FS_GAUSS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec4 s = texture(uTex, vUV) * 0.227027;
  s += (texture(uTex, vUV + uDir * 1.3846) + texture(uTex, vUV - uDir * 1.3846)) * 0.3162162;
  s += (texture(uTex, vUV + uDir * 3.2308) + texture(uTex, vUV - uDir * 3.2308)) * 0.0702703;
  o = s;
}`;
// 背景虛化用：人像的部分權重變很小，模糊時人的顏色不會暈到背景上
const FS_WCOPY = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex, uSeg; out vec4 o;
void main(){
  float w = pow(1.0 - texture(uSeg, vUV).r, 2.0) + 0.002;
  o = vec4(texture(uTex, vUV).rgb * w, w);
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uImg, uSmooth, uMask, uSeg, uLut, uMask2, uSegB, uBlurS, uBgA, uBgB, uOver, uEx, uBgImg, uBgMid, uBgFar, uMakeup;
uniform vec2 uSize;
uniform int uWn;
uniform vec4 uW1[${MAX_WARPS}]; // 中心 xy、位移 xy（像素）；骨架收窄是 A、B 兩端；拉長是 y0、y1、強度、照片高
uniform vec4 uW2[${MAX_WARPS}]; // 半徑、種類(0 推移 1 放大 2 骨架收窄 3 往下拉長)、強度、橢圓比（收窄：只收一點的那側）
uniform vec2 uW3[${MAX_WARPS}]; // 頭的傾斜 cos、sin（收窄：最強的位置、範圍）
uniform float uExposure, uBright, uContrast, uSat, uTemp, uTint, uHigh, uShadow, uSharp, uVig, uGrain, uFade;
uniform float uSmoothAmt, uWhite, uLutAmt, uHasLut;
uniform float uDark, uFold, uEyeB, uTeeth;
// 臉的橢圓：中心 xy、半徑 xy；傾斜 cos、sin、左右轉頭 sin
uniform int uFn;
uniform vec4 uF1[${MAX_FACES}];
uniform vec3 uF2[${MAX_FACES}];
// 打光：最多兩盞燈
uniform int uLn;
uniform vec3 uLDir[2], uLCol[2];
uniform float uLAmt, uLAmb, uLBg, uLMode;
// 閃光燈
uniform float uFAmt, uFLift, uFSpec, uFBg, uFShadow, uFRetro;
uniform vec2 uFShOff;
uniform float uBgMode; uniform vec3 uBgColor;
// 創意特效：1 漫畫 2 波普 3 素描 4 彩鉛 5 馬賽克 6 故障 7 鏡像 8 分身 9 雙重曝光
uniform float uProtect;
uniform int uFx; uniform float uFxAmt; uniform vec2 uExFit;
uniform float uOAmt, uBlur;
uniform float uBgBlurAmt, uHarmAmt; uniform vec3 uHarm;
out vec4 o;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec3 lut(vec3 c){
  float b = c.b * 63.0;
  float b0 = floor(b), b1 = min(b0 + 1.0, 63.0);
  vec2 off = (c.rg * 63.0 + 0.5) / 512.0;
  vec2 q0 = vec2(mod(b0, 8.0), floor(b0 / 8.0)) / 8.0;
  vec2 q1 = vec2(mod(b1, 8.0), floor(b1 / 8.0)) / 8.0;
  return mix(texture(uLut, q0 + off).rgb, texture(uLut, q1 + off).rgb, b - b0);
}

void main(){
  // 變形：輸出的每個像素往回找要取原圖哪一點
  vec2 p = vUV * uSize, pS = p;
  for (int i = 0; i < ${MAX_WARPS}; i++) {
    if (i >= uWn) break;
    float kind = uW2[i].y;
    if (kind > 2.5) {
      // 往下拉長：y0 以下慢慢拉開（剛開始不拉，接得順），y1 以下壓回照片裡
      float y0 = uW1[i].x, y1 = uW1[i].y, s = uW1[i].z, H = uW1[i].w, y1o = y0 + (y1 - y0) * (1.0 + s);
      if (p.y > y0) {
        if (p.y < y1o) { float u = (p.y - y0) / (y1o - y0); p.y = y0 + (y1 - y0) * (u + s * u * (1.0 - u) * (1.0 - u)); }
        else p.y = y1 + (p.y - y1o) * (H - y1) / max(H - y1o, 1.0);
      }
      continue;
    }
    if (kind > 1.5) {
      // 骨架收窄：離骨架線越近、越接近最強的位置，往外取樣越多（看起來就是往中間收）
      vec2 A = uW1[i].xy, ab = uW1[i].zw - A;
      float t = clamp(dot(p - A, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
      vec2 foot = A + ab * t, d = p - foot;
      float x = length(d) / uW2[i].x;
      if (x < 1.0) {
        float g = (t - uW3[i].x) / uW3[i].y, f = (1.0 - x * x) * (1.0 - x * x) * exp(-g * g);
        float cr = ab.x * d.y - ab.y * d.x;
        if (uW2[i].w != 0.0 && cr * uW2[i].w > 0.0) f *= 0.3;
        p = foot + d * (1.0 + uW2[i].z * f);
      }
      continue;
    }
    vec2 c = uW1[i].xy; float r = uW2[i].x;
    vec2 d0 = p - c, cs = uW3[i];
    vec2 dv = vec2(d0.x * cs.x + d0.y * cs.y, -d0.x * cs.y + d0.y * cs.x); dv.y *= uW2[i].w;
    float t = length(dv) / r;
    if (t < 1.0) {
      float f = 1.0 - t * t;
      if (uW2[i].y < 0.5) { p -= uW1[i].zw * f * f; }
      else { p = c + (p - c) * (1.0 - uW2[i].z * f * f); }
    }
  }
  vec2 uv = p / uSize;
  if (uFx == 7) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  if (uFx == 5) {
    float n = mix(140.0, 14.0, uFxAmt) / max(uSize.x, uSize.y);
    vec2 cell = uSize * n;
    uv = (floor(uv * cell) + 0.5) / cell;
  }
  vec3 col = texture(uImg, uv).rgb;
  if (uProtect > 0.5 && uFx != 5 && uFx != 7) {
    // 背景保護：只有人（含頭髮）跟著變形，背景留在原位；人縮進去露出的空隙用去掉人像的模糊背景補
    float mv = clamp(length(p - pS) * 1.5, 0.0, 1.0);
    if (mv > 0.0) {
      vec2 uv0 = pS / uSize;
      float s0 = texture(uSeg, uv0).r, s1 = texture(uSeg, uv).r;
      // 空隙先找反方向的背景（清楚），找不到再用模糊背景
      vec2 uvm = (pS - (p - pS) * 2.0) / uSize;
      vec4 fa = texture(uBgA, uv0), fb = texture(uBgB, uv0);
      vec3 fill = fa.a > 0.02 ? fa.rgb / fa.a : fb.rgb / max(fb.a, 1e-4);
      fill = mix(texture(uImg, uvm).rgb, fill, smoothstep(0.2, 0.5, texture(uSeg, uvm).r));
      vec3 bg = mix(texture(uImg, uv0).rgb, fill, smoothstep(0.15, 0.6, s0));
      col = mix(col, mix(bg, col, smoothstep(0.2, 0.7, s1)), mv);
    }
  }
  if (uFx == 6) {
    // 故障：一條條橫向錯位，紅藍分開
    float row = floor(uv.y * 32.0), h = hash(vec2(row, 3.0));
    vec2 q = uv + vec2(h > 0.65 ? (hash(vec2(row, 9.0)) - 0.5) * 0.18 * uFxAmt : 0.0, 0.0);
    float sh = 0.014 * uFxAmt;
    col = vec3(texture(uImg, q + vec2(sh, 0.0)).r, texture(uImg, q).g, texture(uImg, q - vec2(sh, 0.0)).b);
  }
  float pw0 = texture(uSeg, uv).r;
  if (uBlur > 0.0) {
    // 背景虛化：只模糊人以外的地方，越模糊亮點越像光斑
    vec4 a = texture(uBgA, uv), b = texture(uBgB, uv);
    vec3 ba = a.rgb / max(a.a, 1e-4), bb = b.rgb / max(b.a, 1e-4);
    vec3 bg = uBlur < 0.4 ? mix(col, ba, uBlur / 0.4) : mix(ba, bb, (uBlur - 0.4) / 0.6);
    bg += pow(luma(bg), 3.0) * 0.25 * uBlur;
    col = mix(bg, col, smoothstep(0.3, 0.7, pw0));
  }
  if (uFx == 8) {
    // 分身：人往旁邊複製幾份，越遠越淡，疊在背景上
    for (int k = 3; k >= 1; k--) {
      vec2 q = uv - vec2(0.075 * float(k) * uSize.y / uSize.x * 0.75, 0.0);
      float pk = smoothstep(0.3, 0.7, texture(uSeg, q).r) * (1.0 - smoothstep(0.3, 0.7, pw0));
      col = mix(col, texture(uImg, q).rgb, pk * uFxAmt * (0.95 - 0.2 * float(k)));
    }
  }

  if (uSharp > 0.0) {
    vec2 px = 1.0 / uSize;
    vec3 n = (texture(uImg, uv + vec2(px.x, 0.0)).rgb + texture(uImg, uv - vec2(px.x, 0.0)).rgb
            + texture(uImg, uv + vec2(0.0, px.y)).rgb + texture(uImg, uv - vec2(0.0, px.y)).rgb) * 0.25;
    col += (col - n) * uSharp * 2.0;
  }

  vec2 mk = texture(uMask, uv).rg;
  if (uSmoothAmt > 0.0 && mk.r > 0.0) {
    vec3 s = texture(uSmooth, uv).rgb;
    // 跟醒圖一樣，暗部不磨，避免陰影和輪廓被抹平
    float dark = smoothstep(0.2, 0.45, col.r);
    col = mix(col, s, mk.r * dark * uSmoothAmt * 0.9);
  }
  if (uWhite > 0.0 && mk.g > 0.0) {
    float k = mk.g * uWhite;
    col = mix(col, 1.0 - (1.0 - col) * (1.0 - col * 0.55), k * 0.6);
    col = mix(col, vec3(luma(col)), k * 0.12);
  }

  vec3 mk2 = texture(uMask2, uv).rgb;
  if ((uDark > 0.0 && mk2.r > 0.0) || (uFold > 0.0 && mk2.g > 0.0)) {
    // 黑眼圈、法令紋：跟周圍皮膚比，比周圍暗的地方提亮，顏色往周圍拉
    vec2 R = vec2(0.018) * vec2(uSize.y / uSize.x, 1.0);
    vec3 a = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float t = float(k) * 0.785398;
      a += texture(uSmooth, uv + vec2(cos(t), sin(t)) * R).rgb;
    }
    a /= 8.0;
    float m = clamp(mk2.r * uDark + mk2.g * uFold, 0.0, 1.0);
    float la = luma(a), lc = luma(col);
    col += max(la - lc, 0.0) * m * 1.1;
    col = mix(col, luma(col) * a / max(la, 0.01), m * 0.45);
    if (mk2.g > 0.0) col = mix(col, texture(uSmooth, uv).rgb + (col - texture(uSmooth, uv).rgb) * 0.4, mk2.g * uFold * 0.6);
  }
  if (uEyeB > 0.0 && mk2.b > 0.0) {
    // 亮眼：眼睛裡面加一點亮度和細節
    vec3 s = texture(uSmooth, uv).rgb;
    float m = mk2.b * uEyeB;
    col += (col - s) * m * 0.8;
    col = 1.0 - (1.0 - col) * (1.0 - m * 0.12);
  }
  if (uTeeth > 0.0 && mk.g >= 0.0) {
    // 白牙：只動嘴巴裡比較亮的地方，去黃再提亮
    float m = texture(uMask, uv).b * uTeeth * smoothstep(0.28, 0.55, luma(col));
    col = mix(col, vec3(luma(col)), m * 0.65);
    col.b += 0.03 * m;
    col = 1.0 - (1.0 - col) * (1.0 - m * 0.3);
  }

  vec4 mu = texture(uMakeup, uv);
  if (mu.a > 0.002) {
    // 美妝（makeup.js 畫的彩妝層）：保留皮膚紋理上色，加一點相乘；很亮的白色（高光、眼神光）用濾色
    vec3 sm = texture(uSmooth, uv).rgb;
    vec3 det = clamp(col / max(sm, vec3(0.03)), 0.5, 1.6);
    vec3 paint = clamp(mu.rgb * mix(vec3(1.0), det, 0.85), 0.0, 1.0);
    float L = luma(col), Lm = luma(mu.rgb);
    vec3 shade = clamp(mu.rgb * clamp(L / max(Lm, 0.05), 0.55, 1.25), 0.0, 1.0);
    float chroma = max(max(mu.r, mu.g), mu.b) - min(min(mu.r, mu.g), mu.b);
    float wl = smoothstep(0.8, 0.95, Lm) * (1.0 - smoothstep(0.08, 0.25, chroma));
    vec3 tgt = mix(paint, shade, 0.25 * smoothstep(0.12, 0.3, Lm));
    // 再混一點色彩相乘，修容、眼影這種跟膚色差不多亮的顏色才看得出來
    tgt = mix(tgt, col * mu.rgb * 1.15, 0.4);
    tgt = mix(tgt, 1.0 - (1.0 - col) * (1.0 - mu.rgb * 0.55), wl);
    col = mix(col, tgt, mu.a);
  }

  // 臉和身體的立體方向：臉當成跟著頭轉的橢球，身體用人像輪廓推出邊緣朝外
  float pw = texture(uSeg, uv).r;
  vec3 N = vec3(0.0, 0.0, 1.0); float fw = 0.0;
  if (uLAmt > 0.0 || uFAmt > 0.0) {
    float e = 0.004;
    float gx = texture(uSegB, uv + vec2(e, 0.0)).r - texture(uSegB, uv - vec2(e, 0.0)).r;
    float gy = texture(uSegB, uv + vec2(0.0, e)).r - texture(uSegB, uv - vec2(0.0, e)).r;
    N = normalize(vec3(-gx * 8.0, -gy * 8.0, 1.0));
    for (int i = 0; i < ${MAX_FACES}; i++) {
      if (i >= uFn) break;
      vec2 d = p - uF1[i].xy; vec2 cs = uF2[i].xy;
      vec2 l = vec2(d.x * cs.x + d.y * cs.y, -d.x * cs.y + d.y * cs.x) / uF1[i].zw;
      float r2 = dot(l, l);
      if (r2 < 1.0) {
        vec3 nf = vec3(l, sqrt(1.0 - r2) * 1.1);
        nf.x += uF2[i].z * nf.z * 0.8;
        nf = normalize(nf);
        nf.xy = vec2(nf.x * cs.x - nf.y * cs.y, nf.x * cs.y + nf.y * cs.x);
        float w = smoothstep(1.0, 0.65, r2);
        N = normalize(mix(N, nf, w)); fw = max(fw, w);
      }
    }
  }

  if (uLAmt > 0.0) {
    // 每盞燈：照到的程度 d，亮度往上加，顏色往燈的顏色偏
    float I = 0.0; vec3 tint = vec3(1.0), glow = vec3(0.0), rim = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      if (i >= uLn) break;
      float d = max(dot(N, uLDir[i]), 0.0);
      vec3 c = uLCol[i] / max(uLCol[i].r, max(uLCol[i].g, uLCol[i].b));
      I += d; tint *= mix(vec3(1.0), c, d * 0.6); glow += c * d; rim += c * d;
    }
    vec3 lit = uLMode < 0.5
      ? col * (uLAmb + (1.0 - uLAmb) * 1.6 * I) * tint + glow * 0.1
      : 1.0 - (1.0 - col) * (1.0 - clamp(rim * 2.4, 0.0, 1.0));
    vec3 bgTint = uLn > 1 ? mix(uLCol[0], uLCol[1], vUV.x) : uLCol[0];
    vec3 bg = col * (1.0 - uLBg) + bgTint * uLBg * 0.15 * luma(col);
    col = clamp(mix(col, mix(bg, lit, pw), uLAmt), 0.0, 1.0);
  }

  if (uFAmt > 0.0) {
    float k = uFAmt;
    float L0 = luma(col);
    // 主體像被正面打亮：整體乘亮，亮部柔和壓縮不爆白，深色衣服還是深色；偏冷白
    vec3 c2 = col * (1.0 + 0.55 * uFLift * k * pw);
    vec3 ex = max(c2 - 0.82, 0.0);
    col = min(c2, 0.82) + ex / (1.0 + ex * 2.5);
    col.b += 0.025 * k * (1.0 - uFRetro); col.r -= 0.012 * k * (1.0 - uFRetro);
    // 額頭、鼻尖、顴骨的反光
    col += pow(max(N.z, 0.0), 22.0) * fw * uFSpec * k * 0.32 * smoothstep(0.25, 0.6, L0);
    // 背景很快變暗，主體後面一道硬影子
    float rad = length((vUV - 0.5) * 2.0);
    col *= 1.0 - uFBg * k * (1.0 - pw) * (0.5 + 0.5 * smoothstep(0.2, 1.3, rad));
    col *= 1.0 - uFShadow * k * texture(uSegB, uv - uFShOff).r * (1.0 - pw) * 0.55;
    if (uFRetro > 0.0) {
      float r = uFRetro * k;
      col = (col - 0.5) * (1.0 + 0.2 * r) + 0.5;
      col = mix(vec3(luma(col)), col, 1.0 - 0.15 * r);
      col.r += 0.025 * r; col.g += 0.012 * r;
      col += (hash(vUV * uSize + 7.0) - 0.5) * 0.07 * r;
      vec2 dd = (vUV - 0.5) * 2.0;
      col *= 1.0 - smoothstep(0.6, 1.5, length(dd)) * 0.35 * r;
    }
    col = clamp(col, 0.0, 1.0);
  }

  col *= exp2(uExposure);
  col = pow(max(col, 0.0), vec3(1.0 - uBright * 0.45));
  float L = luma(col);
  float sh = 1.0 - smoothstep(0.0, 0.55, L), hl = smoothstep(0.45, 1.0, L);
  col += uShadow * 0.35 * sh * (uShadow > 0.0 ? (1.0 - col) : col);
  col += uHigh * 0.35 * hl * (uHigh > 0.0 ? (1.0 - col) : col);
  col = (col - 0.5) * (1.0 + uContrast * 0.55) + 0.5;
  col.r += uTemp * 0.07; col.b -= uTemp * 0.07;
  col.g -= uTint * 0.05; col.rb += uTint * 0.02;
  L = luma(col);
  col = mix(vec3(L), col, 1.0 + uSat);
  col = mix(col, col * 0.84 + 0.1, uFade);
  col = clamp(col, 0.0, 1.0);

  if (uHasLut > 0.5) col = mix(col, lut(col), uLutAmt);

  if (uFx >= 1 && uFx <= 4) {
    // 邊緣：用保邊模糊過的圖算，比較乾淨
    vec2 t = 1.0 / vec2(textureSize(uSmooth, 0));
    float tl = luma(texture(uSmooth, uv + t * vec2(-1, -1)).rgb), tc = luma(texture(uSmooth, uv + t * vec2(0, -1)).rgb), tr = luma(texture(uSmooth, uv + t * vec2(1, -1)).rgb);
    float ml = luma(texture(uSmooth, uv + t * vec2(-1, 0)).rgb), mr = luma(texture(uSmooth, uv + t * vec2(1, 0)).rgb);
    float bl = luma(texture(uSmooth, uv + t * vec2(-1, 1)).rgb), bc = luma(texture(uSmooth, uv + t * vec2(0, 1)).rgb), br = luma(texture(uSmooth, uv + t * vec2(1, 1)).rgb);
    float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl, gy = bl + 2.0 * bc + br - tl - 2.0 * tc - tr;
    float edge = smoothstep(0.12, 0.35, length(vec2(gx, gy)));
    vec3 c1 = col;
    if (uFx == 1) {
      // 漫畫：顏色分成幾階、加飽和，描黑邊
      // 只把亮度分階，顏色保留，臉不會變成色塊
      vec3 sm = mix(col, texture(uSmooth, uv).rgb, 0.6);
      float L = luma(sm), f4 = L * 4.0;
      float Lq = (floor(f4) + smoothstep(0.35, 0.65, fract(f4))) / 4.0;
      vec3 q = sm * (max(Lq, 0.05) / max(L, 0.05));
      q = clamp(mix(vec3(luma(q)), q, 1.3), 0.0, 1.0);
      c1 = mix(q, vec3(0.07), edge);
    } else if (uFx == 2) {
      // 波普：網點，暗的地方點大
      float cs = max(uSize.x, uSize.y) / 110.0;
      vec2 r = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (vUV * uSize) / cs;
      float rad = sqrt(1.0 - luma(col)) * 0.62;
      float d = 1.0 - smoothstep(rad - 0.08, rad + 0.08, length(fract(r) - 0.5));
      vec3 ink = clamp(mix(vec3(luma(col)), floor(col * 3.0 + 0.5) / 3.0, 1.6), 0.0, 1.0) * 0.85;
      c1 = mix(mix(vec3(1.0, 0.97, 0.88), ink, 0.35), ink, d);
      c1 = mix(c1, vec3(0.05), edge);
    } else {
      // 素描：原圖除以模糊圖，平的地方變白，邊緣和紋理留下筆觸
      float L = luma(texture(uImg, uv).rgb), Lb = luma(texture(uBlurS, uv).rgb);
      float s = pow(clamp(L / max(Lb, 0.03), 0.0, 1.0), 4.0);
      s *= mix(1.0, smoothstep(-0.1, 0.8, L), 0.35);
      s *= 0.96 + 0.04 * hash(floor(vUV * uSize / 2.0));
      if (uFx == 3) c1 = vec3(s) * vec3(1.0, 0.99, 0.96);
      else {
        // 彩鉛：淡淡的顏色加斜線筆觸
        vec2 fp = vUV * uSize / max(uSize.x, uSize.y) * 700.0;
        float hatch = 0.9 + 0.1 * sin((fp.x + fp.y) * 2.2) * (1.0 - luma(col));
        c1 = mix(vec3(1.0, 0.99, 0.96), clamp(mix(vec3(luma(col)), col, 1.5), 0.0, 1.0), 0.4) * pow(s, 1.4) * hatch;
      }
    }
    col = mix(col, c1, uFxAmt);
  }
  if (uFx == 9) {
    // 雙重曝光：人的輪廓裡透出第二張圖，亮的地方是臉，暗的地方是風景；背景淡成第二張圖的亮色
    vec3 e = texture(uEx, (uv - 0.5) * uExFit + 0.5).rgb;
    float pm = smoothstep(0.25, 0.75, texture(uSeg, uv).r);
    float L = luma(col);
    vec3 inside = 1.0 - (1.0 - e) * (1.0 - smoothstep(0.15, 0.85, L) * vec3(1.0));
    vec3 outside = mix(vec3(0.97, 0.96, 0.94), e, 0.18);
    col = mix(col, mix(outside, inside, pm), uFxAmt);
  }
  if (uOAmt > 0.0) col = 1.0 - (1.0 - col) * (1.0 - texture(uOver, vUV).rgb * uOAmt);

  if (uVig != 0.0) {
    vec2 d = (vUV - 0.5) * vec2(uSize.x / max(uSize.x, uSize.y), uSize.y / max(uSize.x, uSize.y)) * 2.0;
    float v = smoothstep(0.35, 1.25, length(d));
    col = uVig > 0.0 ? col * (1.0 - uVig * v * 0.85) : mix(col, vec3(1.0), -uVig * v * 0.8);
  }
  if (uGrain > 0.0) col += (hash(vUV * uSize) - 0.5) * uGrain * 0.16;
  col = clamp(col, 0.0, 1.0);

  float a = 1.0;
  if (uBgMode > 0.5) {
    a = texture(uSeg, uv).r;
    // 邊緣去色邊：半透明的地方（頭髮）扣掉原本背景的顏色，換背景後不會留一圈舊背景
    if (a > 0.01 && a < 0.99) {
      vec4 ob = texture(uBgA, uv); vec3 O = ob.rgb / max(ob.a, 1e-4);
      vec3 I = texture(uImg, uv).rgb;
      // 半透明區域裡顏色跟原背景幾乎一樣的，其實就是背景，不留（不然換背景後會有一圈舊背景的暈）
      a *= mix(smoothstep(0.03, 0.14, length(I - O)), 1.0, a * a);
      vec3 Fr = clamp((I - (1.0 - a) * O) / max(a, 0.12), 0.0, 1.0);
      col = clamp(col + (Fr - I), 0.0, 1.0);
    }
    if (uBgMode < 1.5) { o = vec4(col * a, a); return; }
    vec3 B = uBgColor;
    if (uBgMode > 2.5) {
      vec3 Bs = texture(uBgImg, vUV).rgb, Bm = texture(uBgMid, vUV).rgb, Bf = texture(uBgFar, vUV).rgb;
      B = uBgBlurAmt < 0.5 ? mix(Bs, Bm, uBgBlurAmt * 2.0) : mix(Bm, Bf, uBgBlurAmt * 2.0 - 1.0);
      // 人的色調和亮度往新背景靠，看起來像在同一個光線下拍的
      col = clamp(col * mix(vec3(1.0), uHarm, uHarmAmt), 0.0, 1.0);
      // 光線包邊：背景的光從人的輪廓滲進來一點
      float ab = texture(uSegB, uv).r;
      float wrap = clamp(1.0 - ab / 0.7, 0.0, 1.0) * a;
      col = mix(col, 1.0 - (1.0 - col) * (1.0 - Bf), wrap * 0.35);
    }
    col = mix(B, col, a); a = 1.0;
  }
  o = vec4(col, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('這個瀏覽器不支援 WebGL2');
    this.gl = gl; this.canvas = canvas;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pCopy = program(gl, FS_COPY); this.pDisp = program(gl, FS_DISP); this.fbPost = this.fbo();
    this.pBil = program(gl, FS_BILATERAL);
    this.pMain = program(gl, FS_MAIN);
    this.pGauss = program(gl, FS_GAUSS); this.pW = program(gl, FS_WCOPY);
    this.tImg = this.tex(); this.tMask = this.tex(); this.tSeg = this.tex(); this.tLut = this.tex();
    this.tMask2 = this.tex(); this.tSegB = this.tex();
    this.blank(this.tMask, 0); this.blank(this.tSeg, 255); this.blank(this.tLut, 0);
    this.blank(this.tMask2, 0); this.blank(this.tSegB, 255);
    this.tOver = this.tex(); this.tEx = this.tex(); this.tBgImg = this.tex();
    this.blank(this.tOver, 0); this.blank(this.tEx, 255); this.blank(this.tBgImg, 255);
    this.fbBm = [this.fbo(), this.fbo()]; this.fbBf = [this.fbo(), this.fbo()];
    this.fbA = this.fbo(); this.fbB = this.fbo();
    this.fbS = [this.fbo(), this.fbo()]; this.fbM = [this.fbo(), this.fbo()]; this.fbL = [this.fbo(), this.fbo()];
    this.tMakeup = this.tex(); this.setMakeup(null);
    this.hasLut = false;
  }
  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  blank(t, v) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([v, v, v, 255]));
  }
  upload(t, src) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  fbo() { return { f: this.gl.createFramebuffer(), t: this.tex(), w: 0, h: 0 }; }
  sizeFbo(fb, w, h) {
    const gl = this.gl;
    if (fb.w === w && fb.h === h) return;
    gl.bindTexture(gl.TEXTURE_2D, fb.t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.t, 0);
    fb.w = w; fb.h = h;
  }
  pass(prog, target, w, h, tex) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, w, h);
    gl.uniform1f(prog.u.uFbo, target ? 1 : 0);
    if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(prog.u.uTex, 0); }
  }
  setImage(src) {
    this.w = src.width; this.h = src.height;
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.upload(this.tImg, src);
    // 磨皮用的低解析度保邊模糊圖
    const k = SMOOTH_SHORT / Math.min(this.w, this.h);
    const sw = Math.max(1, Math.round(this.w * Math.min(1, k))), sh = Math.max(1, Math.round(this.h * Math.min(1, k)));
    this.sizeFbo(this.fbA, sw, sh); this.sizeFbo(this.fbB, sw, sh);
    const gl = this.gl;
    this.pass(this.pCopy, this.fbA, sw, sh, this.tImg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    let src2 = this.fbA, dst = this.fbB;
    for (let i = 0; i < 3; i++) {
      this.pass(this.pBil, dst, sw, sh, src2.t);
      gl.uniform2f(this.pBil.u.uTexel, 1 / sw, 1 / sh);
      gl.uniform1f(this.pBil.u.uSigR, 0.15);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      [src2, dst] = [dst, src2];
    }
    this.tSmooth = src2.t;
    this.blurs();
  }
  // 模糊 pair[0] 裡的圖 n 次，結果還在 pair[0]
  gauss(pair, n) {
    const gl = this.gl, [a, b] = pair;
    for (let i = 0; i < n; i++) {
      this.pass(this.pGauss, b, b.w, b.h, a.t); gl.uniform2f(this.pGauss.u.uDir, 1 / a.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.pass(this.pGauss, a, a.w, a.h, b.t); gl.uniform2f(this.pGauss.u.uDir, 0, 1 / a.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  size(pair, short, W = this.w, H = this.h) {
    const k = Math.min(1, short / Math.min(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    pair.forEach(f => this.sizeFbo(f, w, h));
  }
  // 素描用的小模糊；背景虛化用的中、大模糊（扣掉人像）
  blurs() {
    if (!this.w) return;
    const gl = this.gl;
    this.size(this.fbS, 480);
    this.pass(this.pCopy, this.fbS[0], this.fbS[0].w, this.fbS[0].h, this.tImg); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gauss(this.fbS, 2);
    this.size(this.fbM, 200); this.size(this.fbL, 48);
    this.pass(this.pW, this.fbM[0], this.fbM[0].w, this.fbM[0].h, this.fbS[0].t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tSeg); gl.uniform1i(this.pW.u.uSeg, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gauss(this.fbM, 3);
    this.pass(this.pCopy, this.fbL[0], this.fbL[0].w, this.fbL[0].h, this.fbM[0].t); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gauss(this.fbL, 3);
  }
  setMask(src) { src ? this.upload(this.tMask, src) : this.blank(this.tMask, 0); }
  setSeg(src) { src ? this.upload(this.tSeg, src) : this.blank(this.tSeg, 255); this.blurs(); }
  setOver(src) { src ? this.upload(this.tOver, src) : this.blank(this.tOver, 0); }
  setEx(src) { src ? this.upload(this.tEx, src) : this.blank(this.tEx, 255); this.exAr = src ? src.width / src.height : 1; }
  // 換背景的照片，另外做一份輕微模糊、一份很糊（背景虛化和光線包邊用）
  setBgImg(src) {
    src ? this.upload(this.tBgImg, src) : this.blank(this.tBgImg, 255);
    if (!src) return;
    const gl = this.gl;
    this.size(this.fbBm, 320, src.width, src.height);
    this.pass(this.pCopy, this.fbBm[0], this.fbBm[0].w, this.fbBm[0].h, this.tBgImg); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gauss(this.fbBm, 2);
    this.size(this.fbBf, 64, src.width, src.height);
    this.pass(this.pCopy, this.fbBf[0], this.fbBf[0].w, this.fbBf[0].h, this.fbBm[0].t); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gauss(this.fbBf, 3);
  }
  setMask2(src) { src ? this.upload(this.tMask2, src) : this.blank(this.tMask2, 0); }
  setSegB(src) { src ? this.upload(this.tSegB, src) : this.blank(this.tSegB, 255); }
  // 美妝層：沒有妝的時候放一個全透明的點
  setMakeup(src) {
    if (src) { this.upload(this.tMakeup, src); return; }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tMakeup);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  }
  setLut(src) { this.hasLut = !!src; if (src) this.upload(this.tLut, src); }

  // fx：{ faces: [faceGeom], light: { lights, amt, amb, bg, mode }, flash: { amt, lift, spec, bg, shadow, retro } }
  render(p, warps, fx = {}) {
    const gl = this.gl, u = this.pMain.u;
    // 有臉型變形時先畫到暫存，最後再變形一次畫到畫面
    const post = this.disp?.step > 0;
    if (post) this.sizeFbo(this.fbPost, this.w, this.h);
    this.pass(this.pMain, post ? this.fbPost : null, this.w, this.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const texs = [[this.tImg, 'uImg'], [this.tSmooth, 'uSmooth'], [this.tMask, 'uMask'], [this.tSeg, 'uSeg'], [this.tLut, 'uLut'], [this.tMask2, 'uMask2'], [this.tSegB, 'uSegB'],
      [this.fbS[0].t, 'uBlurS'], [this.fbM[0].t, 'uBgA'], [this.fbL[0].t, 'uBgB'], [this.tOver, 'uOver'], [this.tEx, 'uEx'], [this.tBgImg, 'uBgImg'],
      [this.fbBm[0].t, 'uBgMid'], [this.fbBf[0].t, 'uBgFar'], [this.tMakeup, 'uMakeup']];
    texs.forEach(([t, name], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], i); });
    gl.uniform2f(u.uSize, this.w, this.h);
    const n = Math.min(warps.length, MAX_WARPS), w1 = new Float32Array(MAX_WARPS * 4), w2 = new Float32Array(MAX_WARPS * 4), w3 = new Float32Array(MAX_WARPS * 2);
    for (let i = 0; i < n; i++) {
      const w = warps[i];
      if (w.type === 'stretch') { w1.set([w.y0, w.y1, w.s, w.H], i * 4); w2.set([1, 3, 0, 0], i * 4); continue; }
      if (w.type === 'seg') { w1.set([w.ax, w.ay, w.bx, w.by], i * 4); w2.set([w.r, 2, w.k, w.inner || 0], i * 4); w3.set([w.tc, w.ts], i * 2); continue; }
      w1.set([w.cx, w.cy, w.dx || 0, w.dy || 0], i * 4);
      w2.set([w.r, w.type === 'scale' ? 1 : 0, w.s || 0, w.ey || 1], i * 4);
      w3.set([Math.cos(w.rot || 0), Math.sin(w.rot || 0)], i * 2);
    }
    gl.uniform1i(u.uWn, n);
    gl.uniform4fv(u.uW1, w1); gl.uniform4fv(u.uW2, w2); gl.uniform2fv(u.uW3, w3);
    const faces = (fx.faces || []).slice(0, MAX_FACES), f1 = new Float32Array(MAX_FACES * 4), f2 = new Float32Array(MAX_FACES * 3);
    faces.forEach((g, i) => { f1.set([g.cx, g.cy, g.rx, g.ry], i * 4); f2.set([Math.cos(g.roll), Math.sin(g.roll), Math.sin(g.yaw)], i * 3); });
    gl.uniform1i(u.uFn, faces.length); gl.uniform4fv(u.uF1, f1); gl.uniform3fv(u.uF2, f2);
    const L = fx.light, ls = L?.lights || [];
    const ld = new Float32Array(6), lc = new Float32Array(6);
    ls.slice(0, 2).forEach((l, i) => { ld.set(l.dir, i * 3); lc.set(l.col, i * 3); });
    gl.uniform1i(u.uLn, Math.min(2, ls.length)); gl.uniform3fv(u.uLDir, ld); gl.uniform3fv(u.uLCol, lc);
    gl.uniform1f(u.uLAmt, L ? L.amt : 0); gl.uniform1f(u.uLAmb, L?.amb ?? 0.6); gl.uniform1f(u.uLBg, L?.bg ?? 0.3); gl.uniform1f(u.uLMode, L?.mode ?? 0);
    const F = fx.flash;
    gl.uniform1f(u.uFAmt, F ? F.amt : 0); gl.uniform1f(u.uFLift, F?.lift ?? 1); gl.uniform1f(u.uFSpec, F?.spec ?? 1);
    gl.uniform1f(u.uFBg, F?.bg ?? 0.5); gl.uniform1f(u.uFShadow, F?.shadow ?? 0); gl.uniform1f(u.uFRetro, F?.retro ?? 0);
    gl.uniform2f(u.uFShOff, 0.012, 0.016);
    const f = v => (v || 0) / 100;
    gl.uniform1f(u.uProtect, p.bgProtect === 0 ? 0 : 1);
    gl.uniform1f(u.uExposure, f(p.exposure) * 1.2);
    gl.uniform1f(u.uBright, f(p.brightness));
    gl.uniform1f(u.uContrast, f(p.contrast));
    gl.uniform1f(u.uSat, f(p.saturation));
    gl.uniform1f(u.uTemp, f(p.temp));
    gl.uniform1f(u.uTint, f(p.tint));
    gl.uniform1f(u.uHigh, f(p.highlights));
    gl.uniform1f(u.uShadow, f(p.shadows));
    gl.uniform1f(u.uSharp, f(p.sharpen));
    gl.uniform1f(u.uVig, f(p.vignette));
    gl.uniform1f(u.uGrain, f(p.grain));
    gl.uniform1f(u.uFade, f(p.fade));
    gl.uniform1f(u.uSmoothAmt, f(p.smooth));
    gl.uniform1f(u.uWhite, f(p.white));
    gl.uniform1f(u.uDark, f(p.dark)); gl.uniform1f(u.uFold, f(p.fold));
    gl.uniform1f(u.uEyeB, f(p.eyeb)); gl.uniform1f(u.uTeeth, f(p.teeth));
    gl.uniform1f(u.uHasLut, this.hasLut ? 1 : 0);
    gl.uniform1f(u.uLutAmt, f(p.filterAmt));
    gl.uniform1i(u.uFx, fx.fxMode || 0); gl.uniform1f(u.uFxAmt, fx.fxAmt || 0);
    const ra = this.w / this.h, re = this.exAr || 1;
    gl.uniform2f(u.uExFit, re > ra ? ra / re : 1, re > ra ? 1 : re / ra);
    gl.uniform1f(u.uOAmt, fx.over || 0); gl.uniform1f(u.uBlur, fx.blur || 0);
    gl.uniform1f(u.uBgBlurAmt, fx.bgBlur || 0); gl.uniform1f(u.uHarmAmt, fx.harm ? 1 : 0);
    gl.uniform3fv(u.uHarm, fx.harm || [1, 1, 1]);
    const mode = { keep: 0, clear: 1, color: 2, img: 3 }[p.bg] || 0;
    gl.uniform1f(u.uBgMode, mode);
    const hex = p.bgColor || '#ffffff';
    gl.uniform3f(u.uBgColor, parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (post) {
      const d = this.pDisp;
      this.pass(d, null, this.w, this.h, this.fbPost.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.disp.tex); gl.uniform1i(d.u.uDisp, 1);
      gl.uniform2f(d.u.uSize, this.w, this.h); gl.uniform1f(d.u.uStep, this.disp.step);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tSeg); gl.uniform1i(d.u.uSeg, 2);
      gl.uniform1f(d.u.uProtect, p.bgProtect === 0 ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  // 臉型位移圖：{ tex, step }，step = 0 表示沒有
  setDisp(d) { this.disp = d; }
}
