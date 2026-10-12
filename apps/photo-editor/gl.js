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
in vec2 vUV; uniform sampler2D uTex, uDisp, uSegB; uniform vec2 uSize; uniform float uStep, uProtect; out vec4 o;
void main(){
  vec4 e = texture(uDisp, vUV) * 255.0;
  vec2 d = (vec2(e.r * 256.0 + e.b, e.g * 256.0 + e.a) - 32768.0) * uStep;
  // 背景保護（同主 shader）：位移乘上擴張羽化過的人像遮罩
  if (uProtect > 0.5) d *= smoothstep(0.02, 0.3, texture(uSegB, vUV).r);
  o = texture(uTex, vUV + d / uSize);
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
// 散景（景深的光斑）：每個點往四周取 96 個樣本平均，樣本落在「光斑形狀」裡才算，
// 亮的樣本權重大，所以背景的亮點會變成一顆顆圓、愛心、星星形狀的光斑；人身上的樣本不算，人不會暈到背景上
// 樣式：0 經典（圓）1 愛心 2 貓眼（越往邊緣越像被切掉一角的橄欖形）3 漩渦（繞著中心轉的拉長光斑）4 動態（水平拖影）5 銀河（十字星芒）
const FS_BOKEH = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex, uSeg; uniform vec2 uR, uAsp; uniform int uStyle; uniform float uHi; out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float heart(vec2 p){ p *= 1.25; p.y = -p.y + 0.25; float a = p.x * p.x + p.y * p.y - 1.0; return step(a * a * a - p.x * p.x * p.y * p.y * p.y, 0.0); }
void main(){
  vec2 d = (vUV - 0.5) * uAsp; float e = clamp(length(d) * 1.6, 0.0, 1.0);
  vec2 n = length(d) > 1e-4 ? normalize(d) : vec2(1.0, 0.0), t = vec2(-n.y, n.x);
  vec3 sum = vec3(0.0); float ws = 0.0;
  // 每個像素把取樣的螺旋轉一個不同的角度，光斑裡面才不會看到一格一格的取樣點
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  for (int i = 0; i < 96; i++) {
    float fi = float(i), r = sqrt((fi + 0.5) / 96.0), th = fi * 2.39996323 + j;
    vec2 q = r * vec2(cos(th), sin(th)), off = q; float w = 1.0;
    if (uStyle == 1) w = heart(q);
    else if (uStyle == 2) w = step(length(q + n * e * 0.75), 1.0);
    else if (uStyle == 3) off = t * q.x * (1.0 + 1.6 * e) + n * q.y * (1.0 - 0.55 * e);
    else if (uStyle == 4) off = vec2(q.x * 1.8, q.y * 0.06);
    else if (uStyle == 5) { float s = min(abs(q.x), abs(q.y)), s2 = min(abs(q.x + q.y), abs(q.x - q.y)) * 0.7071; w = 0.25 + smoothstep(0.07, 0.0, s) * 1.5 * (1.0 - r * 0.6) + smoothstep(0.05, 0.0, s2) * 0.7 * (1.0 - r); }
    if (w <= 0.0) continue;
    vec2 uv = vUV + off * uR;
    vec3 c = texture(uTex, uv).rgb;
    w *= (1.0 + uHi * pow(luma(c), 4.0) * 14.0) * (1.0 - 0.98 * texture(uSeg, uv).r);
    sum += c * w; ws += w;
  }
  o = vec4(ws > 1e-3 ? sum / ws : texture(uTex, vUV).rgb, 1.0);
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uImg, uSmooth, uMask, uSeg, uLut, uMask2, uSegB, uBlurS, uBgA, uBgB, uOver, uEx, uBgImg, uBgMid, uBgFar, uMakeup;
uniform vec2 uSize;
uniform int uWn;
uniform vec4 uW1[${MAX_WARPS}]; // 中心 xy、位移 xy（像素）；骨架收窄是 A、B 兩端；拉長是 y0、y1、強度、照片高
uniform vec4 uW2[${MAX_WARPS}]; // 半徑、種類(0 推移 1 放大 2 骨架收窄 3 往下拉長 4 整段拉長)、強度、橢圓比（收窄：只收一點的那側）
uniform vec2 uW3[${MAX_WARPS}]; // 頭的傾斜 cos、sin（收窄：最強的位置、範圍）
uniform float uExposure, uBright, uContrast, uSat, uTemp, uTint, uHigh, uShadow, uSharp, uVig, uGrain, uFade;
uniform float uVib, uStruct, uTexture, uLSense, uBack;
uniform vec4 uFlashF;
uniform vec2 uFlashR, uLCap, uFlashG;
uniform vec4 uFlashC;
uniform float uSmoothAmt, uWhite, uLutAmt, uHasLut, uLutSkin;
uniform float uDark, uFold, uEyeB, uTeeth;
// 打光、閃光燈：最多 8 盞燈（閃光燈也算一盞）
//   uLPos：位置 xy（照片 0~1）、高度 z（深度圖像素，負的是在人後面）、燈到臉中間的距離 w
//   uLCol：顏色 × 強度；uLPar：包覆（光繞到暗面）、反光、影子柔和度、衰減次方
uniform int uLn;
uniform vec4 uLPos[8], uLPar[8], uLExt[8], uLDir[8];
// 打光樣式（uLExt.w > 0.5）的燈換一套意思（relight.js 照 Hypic 成品擬合的數字）：
//   uLPos：位置 xy（照片 0~1）、高度 z、範圍 w（都是深度圖像素）；uLPar：乘的強度（人、背景）、加的強度（人、背景）
//   uLDir：方向性（0 整片一樣亮、1 只照朝燈的面）、高光、長寬比、角度；uLCol：顏色
uniform vec3 uLCol[8];
uniform float uLAmbS, uLAmbB, uBgDepth, uThick, uHasGeo, uGeoMax;
uniform vec2 uGeoTex;
uniform vec4 uHaze; uniform vec3 uHazeCol;
uniform float uFAmt, uFRetro;
uniform float uBgMode; uniform vec3 uBgColor;
// 創意特效：1 漫畫 2 波普 3 素描 4 彩鉛 5 馬賽克 6 故障 7 鏡像 8 分身 9 雙重曝光
uniform float uProtect;
uniform int uFx; uniform float uFxAmt; uniform vec2 uExFit;
uniform float uOAmt, uBlur, uBokeh;
uniform float uBgBlurAmt, uHarmAmt; uniform vec3 uHarm;
out vec4 o;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// 深度圖（uSegB 的 G、B 是 16 位元高度）
float geoH(vec2 q){ vec3 g = texture(uSegB, q).rgb; return (g.g * 65280.0 + g.b * 255.0) / 65535.0 * uGeoMax; }
// 從 P 往燈走，路上有比光線還高的東西就是在影子裡；離得越遠影子邊越糊
float shadow1(vec3 P, vec3 dir, float len, float soft, float j){
  float res = 1.0, t = 1.0 + j * 1.5;
  for (int s = 0; s < 28; s++) {
    if (t > len) break;
    vec3 q = P + dir * t;
    vec2 qu = q.xy * uGeoTex;
    if (qu.x < 0.0 || qu.y < 0.0 || qu.x > 1.0 || qu.y > 1.0) break;
    float pq = texture(uSeg, qu).r;
    float hq = geoH(qu) * pq - (1.0 - pq) * uBgDepth;
    // 東西有厚度：光線從人的後面穿過去不算擋到（背光、輪廓光）
    float pen = soft * t * 0.12 + 1.0;
    float blk = clamp(0.5 + (hq - q.z - 1.5) / pen, 0.0, 1.0) * clamp(0.5 + (q.z - (hq - uThick)) / pen, 0.0, 1.0);
    res = min(res, 1.0 - blk);
    t = t * 1.22 + 1.0 + j * 0.5;
  }
  return res;
}
// 走兩次、起點錯開再平均：固定步距會在背景的影子上畫出一圈一圈的等高線
float shadow(vec3 P, vec3 L, float soft){
  vec3 dv = L - P; float len = length(dv.xy);
  if (len < 1.0) return 1.0;
  vec3 dir = dv / len;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return 0.5 * (shadow1(P, dir, len, soft, j * 0.5) + shadow1(P, dir, len, soft, j * 0.5 + 0.5));
}

// LUT 圖是 1024×512：左半一般顏色，右半皮膚那套（side 0 或 1）
vec3 lut(vec3 c, float side){
  float b = c.b * 63.0;
  float b0 = floor(b), b1 = min(b0 + 1.0, 63.0);
  vec2 off = (c.rg * 63.0 + 0.5) / 512.0;
  vec2 q0 = vec2(mod(b0, 8.0), floor(b0 / 8.0)) / 8.0;
  vec2 q1 = vec2(mod(b1, 8.0), floor(b1 / 8.0)) / 8.0;
  vec2 h = vec2(0.5, 1.0), s = vec2(side * 0.5, 0.0);
  return mix(texture(uLut, (q0 + off) * h + s).rgb, texture(uLut, (q1 + off) * h + s).rgb, b - b0);
}

void main(){
  // 變形：輸出的每個像素往回找要取原圖哪一點
  vec2 p = vUV * uSize, pS = p;
  for (int i = 0; i < ${MAX_WARPS}; i++) {
    if (i >= uWn) break;
    float kind = uW2[i].y;
    if (kind > 3.5) {
      // 手動增高：y0~y1 這一段整段拉長 1+s 倍（s 負的是縮短），下面的部分壓回照片裡
      float y0 = uW1[i].x, y1 = uW1[i].y, s = uW1[i].z, H = uW1[i].w, y1o = y0 + (y1 - y0) * (1.0 + s);
      if (p.y > y0) {
        if (p.y < y1o) p.y = y0 + (p.y - y0) / (1.0 + s);
        else p.y = y1 + (p.y - y1o) * (H - y1) / max(H - y1o, 1.0);
      }
      continue;
    }
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
  if (uProtect > 0.5) {
    // 背景保護：位移量乘上「人像往外擴一點、邊緣羽化」的遮罩，背景的位移壓到 0，背景根本不動
    p = pS + (p - pS) * smoothstep(0.02, 0.3, texture(uSegB, pS / uSize).r);
  }
  vec2 uv = p / uSize;
  vec2 popT = floor(clamp(uv, 0.0, 0.999) * 2.0); // 波普四格：在哪一格
  if (uFx == 2) uv = fract(uv * 2.0);
  if (uFx == 7) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  if (uFx == 5) {
    float n = mix(140.0, 14.0, uFxAmt) / max(uSize.x, uSize.y);
    vec2 cell = uSize * n;
    uv = (floor(uv * cell) + 0.5) / cell;
  }
  vec3 col = texture(uImg, uv).rgb;
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
    vec3 bg = uBokeh > 0.5 ? b.rgb : uBlur < 0.4 ? mix(col, ba, uBlur / 0.4) : mix(ba, bb, (uBlur - 0.4) / 0.6);
    bg += pow(luma(bg), 3.0) * 0.25 * uBlur;
    col = mix(bg, col, smoothstep(0.3, 0.7, pw0));
  }
  if (uFx == 8) {
    // 分身：人複製兩份放在左右兩邊，清楚、不透明，站在本人後面（強度 = 拉開的距離）
    float dx = mix(0.14, 0.34, uFxAmt);
    for (int k = 0; k < 2; k++) {
      vec2 q = uv - vec2(k == 0 ? dx : -dx, 0.0);
      float pk = smoothstep(0.25, 0.75, texture(uSeg, q).r) * (1.0 - smoothstep(0.25, 0.75, pw0));
      if (q.x > 0.0 && q.x < 1.0) col = mix(col, texture(uImg, q).rgb * 0.95, pk);
    }
  }

  if (uSharp > 0.0) {
    vec2 px = 1.0 / uSize;
    vec3 n = (texture(uImg, uv + vec2(px.x, 0.0)).rgb + texture(uImg, uv - vec2(px.x, 0.0)).rgb
            + texture(uImg, uv + vec2(0.0, px.y)).rgb + texture(uImg, uv - vec2(0.0, px.y)).rgb) * 0.25;
    col += (col - n) * uSharp * 2.0;
  }
  if (uTexture > 0.0) {
    // 質感：放大 3 像素尺度的細節（皮膚紋理、布料、葉子），只動亮度，不碰顏色
    vec2 px = 3.0 / uSize;
    float n = luma((texture(uImg, uv + vec2(px.x, 0.0)).rgb + texture(uImg, uv - vec2(px.x, 0.0)).rgb
                  + texture(uImg, uv + vec2(0.0, px.y)).rgb + texture(uImg, uv - vec2(0.0, px.y)).rgb) * 0.25);
    float d = clamp(luma(col) - n, -0.15, 0.15);
    col += d * uTexture * 1.6;
  }
  if (uStruct != 0.0) {
    // 結構：局部對比（照片跟大範圍模糊的差），正的讓輪廓立體，負的變柔
    vec3 b = texture(uBlurS, uv).rgb;
    if (uStruct > 0.0) {
      float L0 = luma(col), d = L0 - luma(b);
      float mid = 1.0 - abs(L0 - 0.5) * 1.2; // 很亮、很暗的地方少加，避免爆白死黑
      col += d * uStruct * 1.4 * max(mid, 0.2);
    } else col = mix(col, b, -uStruct * 0.3);
    col = clamp(col, 0.0, 1.0);
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

  // 打光、閃光燈：照深度圖（relight.js）算每個像素的立體方向，再用點光源照
  //   深度圖座標：x、y 是深度圖的像素，z 是高度（朝鏡頭）；背景往後推 uBgDepth，
  //   所以燈離背景比較遠、比較暗，人的影子也會投在背景上
  if (uLn > 0) {
    float pw = texture(uSeg, uv).r, skin = texture(uMask, uv).r;
    vec2 gt = uGeoTex;
    float h0 = geoH(uv);
    vec3 N = vec3(0.0, 0.0, 1.0);
    if (uHasGeo > 0.5) {
      float hx = geoH(uv + vec2(gt.x, 0.0)) - geoH(uv - vec2(gt.x, 0.0));
      float hy = geoH(uv + vec2(0.0, gt.y)) - geoH(uv - vec2(0.0, gt.y));
      N = normalize(mix(vec3(0.0, 0.0, 1.0), normalize(vec3(-hx, -hy, 2.0)), smoothstep(0.1, 0.6, pw)));
    }
    vec3 Pw = vec3(uv / gt, h0 * pw - (1.0 - pw) * uBgDepth);
    vec3 light = vec3(0.0), spec = vec3(0.0), rim = vec3(0.0), mul = vec3(0.0), add = vec3(0.0), orb = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      if (i >= uLn) break;
      if (uLExt[i].w > 0.5) {
        // Hypic 的打光：先整張壓暗，每盞燈是一團有範圍的光（高斯），照在人身上時朝燈的面亮、背對的面暗；
        // 乘的部分照亮原本的顏色，加的部分讓藍光、綠光在偏紅的皮膚上也看得到
        // 光的形狀是橢圓：uLDir.z 長寬比、uLDir.w 角度
        vec2 dg = (uv - uLPos[i].xy) / gt;
        float ca = cos(uLDir[i].w), sa = sin(uLDir[i].w);
        dg = vec2(dg.x * ca + dg.y * sa, (-dg.x * sa + dg.y * ca) / max(uLDir[i].z, 0.05));
        // uLExt.y：光斑邊緣硬度（1 是高斯，越大中間越平、邊越清楚）
        float G = exp(-pow(dot(dg, dg) / (2.0 * uLPos[i].w * uLPos[i].w), max(uLExt[i].y, 1.0)));
        vec3 Pf = vec3(uv / gt, h0 * pw), Lf = vec3(uLPos[i].xy / gt, uLPos[i].z), Lf2 = normalize(Lf - Pf);
        float kd = 1.0 - uLDir[i].x + uLDir[i].x * clamp(dot(N, Lf2), 0.0, 1.0);
        vec3 c = uLCol[i];
        mul += c * G * (uLPar[i].x * pw * kd + uLPar[i].y * (1.0 - pw));
        add += c * G * (uLPar[i].z * pw * kd + uLPar[i].w * (1.0 - pw));
        vec3 Hv = normalize(Lf2 + vec3(0.0, 0.0, 1.0));
        spec += c * uLDir[i].y * pow(max(dot(N, Hv), 0.0), uLExt[i].x) * G * pw;
        // 光點（彩虹光點）：背景上看得到的發光小球
        if (uLExt[i].z > 1.5) {
          vec2 dv = (vUV - uLPos[i].xy) * vec2(uSize.x / uSize.y, 1.0);
          orb += normalize(c + 1e-4) * exp(-dot(dv, dv) / 0.0012) * (1.0 - pw);
        }
        continue;
      }
      vec3 Lp = vec3(uLPos[i].xy / gt, uLPos[i].z);
      vec3 Lv = Lp - Pw; float dist = max(length(Lv), 1.0); vec3 Ld = Lv / dist;
      float wr = uLPar[i].x + 0.3 * skin;
      float diff = max((dot(N, Ld) + wr) / (1.0 + wr), 0.0);
      // 衰減：在臉中間是 1，離燈越近越亮、越遠越暗（燈越近，明暗差越大）
      float att = min(pow(uLPos[i].w * uLPos[i].w / (dist * dist), uLPar[i].w), 1.6);
      float sh = uHasGeo > 0.5 && uLExt[i].y > 0.5 ? shadow(Pw, Lp, uLPar[i].z) : 1.0;
      // 燈在人後面（輪廓光、逆光）只照人，不照背景；邊緣直接亮起來，暗的頭髮也看得到一圈光
      // 後面的燈只照到側面朝燈的地方，越邊緣越亮，所以是細細一圈
      float back = uLPos[i].z < 0.0 ? smoothstep(0.45, 0.95, pw) : 1.0;
      if (uLPos[i].z < 0.0) diff = pow(diff, 3.0);
      vec3 li = uLCol[i] * diff * att * sh * back;
      light += li;
      if (uLPos[i].z < 0.0) rim += li * 0.45;
      // 彩色的燈：皮膚的紅色很多，只用乘的話藍光、綠光幾乎看不到，所以再直接加一點燈的顏色
      float cs = max(uLCol[i].r, max(uLCol[i].g, uLCol[i].b)) - min(uLCol[i].r, min(uLCol[i].g, uLCol[i].b));
      rim += li * cs * 0.22 * pw;
      vec3 Hv = normalize(Ld + vec3(0.0, 0.0, 1.0));
      spec += uLCol[i] * pow(max(dot(N, Hv), 0.0), uLExt[i].x) * uLPar[i].y * att * sh * max(skin, 0.5 * pw);
    }
    float L0 = luma(col);
    vec3 lit = col * (mix(uLAmbB, uLAmbS, pw) + mul + light) + add + spec * smoothstep(0.1, 0.45, L0) + rim;
    lit = 1.0 - (1.0 - lit) * (1.0 - min(orb, vec3(1.0)) * 0.9);
    // 逆光光暈：燈後面一團暖光，人的輪廓邊緣透光
    if (uHaze.w > 0.0) {
      vec2 dh = (vUV - uHaze.xy) * vec2(uSize.x / uSize.y, 1.0);
      float g = exp(-dot(dh, dh) / (uHaze.z * uHaze.z));
      float edge = clamp(1.0 - abs(pw - 0.5) * 2.0, 0.0, 1.0);
      lit = 1.0 - (1.0 - lit) * (1.0 - uHazeCol * uHaze.w * (g * (1.0 - 0.6 * pw) + edge * g * 0.8));
    }
    // 亮部柔和壓縮（照亮度壓，顏色不會變白變灰）
    float Ll = luma(lit);
    float kn = max(0.72, L0);
    if (Ll > kn) { float e = Ll - kn; lit *= (kn + e / (1.0 + e * 3.0)) / Ll; }
    // 光斑亮度上限（陽光碎片）：每個通道最多加到 uLCap.y，超過 uLCap.x 開始慢慢收
    if (uLCap.y > 0.0) {
      vec3 d = max(lit - col, 0.0), e = max(d - uLCap.x, 0.0);
      vec3 dc = min(d, uLCap.x) + e / (1.0 + e / (uLCap.y - uLCap.x)), hr = max(0.96 - col, 1e-3);
      // 本來就亮的地方剩下的空間少，加的量跟著變少，永遠不會到 255
      lit += hr * (1.0 - exp(-dc / hr)) - d;
    }
    if (uFlashF.x > 0.0) {
      // 調整 › 閃光燈：臉上的皮膚看附近皮膚的平均亮度補平，暗的那側補多、本來就亮的那側收一點，
      // 像從相機打一盞平光。用附近的平均而不是單一像素，鬍子、眉毛這種本來就深的地方不會被洗白
      float sw = 0.0, sl = 0.0;
      for (int j = 0; j < 17; j++) {
        float ring = j == 0 ? 0.0 : (j < 9 ? 1.0 : 2.0), an = float(j) * 0.785398 + (j < 9 ? 0.0 : 0.3927);
        vec2 q = uv + ring * uFlashR * vec2(cos(an), sin(an));
        float w = texture(uMask, q).r + 0.01;
        sl += luma(texture(uBlurS, q).rgb) * w; sw += w;
      }
      // 皮膚的亮度改成「原本 × g」，燈只決定顏色
      float g = clamp(1.0 + uFlashF.y * (uFlashF.z / max(sl / sw, 0.02) - 1.0), 0.6, uFlashG.y);
      // 本身就很亮的像素（受光面的亮點）不再加亮
      g = mix(g, min(g, 1.0), smoothstep(0.5, 0.75, L0));
      vec2 fc = (uv - uFlashC.xy) / uFlashC.zw;
      float face = 1.0 - smoothstep(0.7, 1.0, length(fc));   // 只在臉上（肩膀、身體照燈的結果）
      lit = mix(lit, lit * (L0 * g / max(luma(lit), 0.01)), skin * pw * face);
      // 亮的地方保留原本的顏色，不洗成奶油白
      lit = mix(lit, col * (luma(lit) / max(L0, 0.02)), smoothstep(0.5, 0.8, L0) * uFlashF.w * pw);
      // 超過 214 的部分慢慢收到 237 以下（存 JPEG 時顏色還會再往外衝一點），紅色通道不會被推到 255（本來就比較亮的不動）
      { vec3 e = max(lit - 0.84, 0.0), sc = 0.84 + 0.09 * (1.0 - exp(-e / 0.09));
        lit = mix(lit, min(lit, max(sc, col)), pw); }
      // 背景只會變暗
      lit = mix(min(lit, col), lit, pw);
      // 燈是照全強度算的，這裡照滑桿跟原圖混合
      lit = mix(col, lit, uFlashF.x);
    }
    col = clamp(lit, 0.0, 1.0);
  }

  if (uFAmt > 0.0) {
    float k = uFAmt;
    // 閃光燈：偏冷白，亮的地方微微暈開
    col.b += 0.02 * k * (1.0 - uFRetro); col.r -= 0.01 * k * (1.0 - uFRetro);
    vec3 bl = texture(uBlurS, uv).rgb;
    col = 1.0 - (1.0 - col) * (1.0 - max(bl - 0.62, 0.0) * k * (0.5 + 0.8 * uFRetro));
    if (uFRetro > 0.0) {
      // CCD：對比高一點、顏色淡一點、偏暖黃、雜訊、暗角
      float r = uFRetro * k;
      col = (col - 0.5) * (1.0 + 0.18 * r) + 0.5;
      col = mix(vec3(luma(col)), col, 1.0 - 0.12 * r);
      col.r += 0.02 * r; col.g += 0.012 * r;
      col += (hash(vUV * uSize + 7.0) - 0.5) * 0.06 * r;
      vec2 dd = (vUV - 0.5) * 2.0;
      col *= 1.0 - smoothstep(0.6, 1.5, length(dd)) * 0.3 * r;
    }
    col = clamp(col, 0.0, 1.0);
  }

  if (uBack > 0.0) {
    // 背光校正：周圍（大範圍模糊）越暗的地方提亮越多，用 1-(1-c)^g 提亮，亮部不會爆
    float Lb = luma(texture(uBlurS, uv).rgb);
    float g = 1.0 + uBack * 1.6 * pow(1.0 - smoothstep(0.05, 0.65, Lb), 1.5);
    col = 1.0 - pow(max(1.0 - col, 0.0), vec3(g));
  }
  col *= exp2(uExposure);
  col = pow(max(col, 0.0), vec3(1.0 - uBright * 0.45));
  if (uLSense != 0.0) {
    // 光感：中間調提亮或壓暗，黑白兩端不動，按比例縮放 RGB 保留顏色
    float L0 = max(luma(col), 1e-4);
    float L1 = clamp(L0 + uLSense * (uLSense > 0.0 ? 0.9 : 0.5) * L0 * (1.0 - L0), 0.0, 1.0);
    col = clamp(col * (L1 / L0), 0.0, 1.0);
  }
  float L = luma(col);
  float sh = 1.0 - smoothstep(0.0, 0.55, L), hl = smoothstep(0.45, 1.0, L);
  col += uShadow * 0.35 * sh * (uShadow > 0.0 ? (1.0 - col) : col);
  col += uHigh * 0.35 * hl * (uHigh > 0.0 ? (1.0 - col) : col);
  col = (col - 0.5) * (1.0 + uContrast * 0.55) + 0.5;
  col.r += uTemp * 0.07; col.b -= uTemp * 0.07;
  col.g -= uTint * 0.05; col.rb += uTint * 0.02;
  L = luma(col);
  col = mix(vec3(L), col, 1.0 + uSat);
  if (uVib != 0.0) {
    // 自然飽和：越不飽和的顏色加越多，已經很鮮豔的和膚色少加
    float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
    float s = mx - mn;
    float skin = smoothstep(0.06, 0.0, abs(col.r - col.g - 0.12)) * step(col.b, col.g) * 0.5;
    float k = uVib > 0.0 ? uVib * 0.8 * (1.0 - s) * (1.0 - skin) : uVib * 0.7; // 往左只褪到七成，不會變黑白
    col = mix(vec3(luma(col)), col, 1.0 + k);
  }
  col = mix(col, col * 0.84 + 0.1, uFade);
  col = clamp(col, 0.0, 1.0);

  if (uHasLut > 0.5) {
    vec3 lc = lut(col, 0.0);
    float sk = uLutSkin > 0.5 ? texture(uMask, uv).r : 0.0;
    if (sk > 0.0) lc = mix(lc, lut(col, 1.0), sk);
    col = mix(col, lc, uLutAmt);
  }

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
      // 波普四格：同一張照片切成四格，每格一組撞色，亮度只分三階，背景整片換色
      int ti = int(popT.x) + int(popT.y) * 2;
      vec3 bgc = ti == 0 ? vec3(1.0, 0.83, 0.0) : ti == 1 ? vec3(0.0, 0.72, 1.0) : ti == 2 ? vec3(1.0, 0.23, 0.42) : vec3(0.48, 0.24, 1.0);
      vec3 d0 = ti == 0 ? vec3(0.11, 0.08, 0.39) : ti == 1 ? vec3(0.16, 0.04, 0.0) : ti == 2 ? vec3(0.04, 0.24, 0.18) : vec3(0.02);
      vec3 m0 = ti == 0 ? vec3(1.0, 0.18, 0.53) : ti == 1 ? vec3(1.0, 0.42, 0.0) : ti == 2 ? vec3(0.13, 0.79, 0.59) : vec3(1.0, 0.8, 0.0);
      vec3 l0 = ti == 0 ? vec3(1.0, 0.82, 0.89) : ti == 1 ? vec3(1.0, 0.91, 0.64) : ti == 2 ? vec3(0.9, 1.0, 0.96) : vec3(1.0);
      float L = luma(mix(col, texture(uSmooth, uv).rgb, 0.6));
      vec3 pc = mix(mix(d0, m0, smoothstep(0.26, 0.32, L)), l0, smoothstep(0.58, 0.64, L));
      float pm = smoothstep(0.3, 0.7, pw0);
      c1 = mix(bgc, mix(pc, d0, edge * 0.85), pm);
      vec2 gb = min(uv, 1.0 - uv) * uSize * 0.5 / min(uSize.x, uSize.y);
      c1 = mix(vec3(1.0), c1, smoothstep(0.004, 0.006, min(gb.x, gb.y)));
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
    // 人轉成高對比黑白，再用「濾色」疊風景：頭髮、衣服這些暗的地方透出風景，臉留著
    float Lp = pow(smoothstep(0.3, 0.95, L), 1.6);
    vec3 inside = 1.0 - (1.0 - e) * (1.0 - vec3(Lp));
    inside = mix(inside, inside * (0.8 + 0.4 * col), 0.15);
    vec3 outside = mix(vec3(0.97, 0.96, 0.94), e, 0.12);
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
    this.pGauss = program(gl, FS_GAUSS); this.pW = program(gl, FS_WCOPY); this.pBokeh = program(gl, FS_BOKEH); this.fbK = this.fbo(); this.bkKey = '';
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
    this.upload(this.tImg, src); this.bkKey = '';
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
  setSeg(src) { src ? this.upload(this.tSeg, src) : this.blank(this.tSeg, 255); this.blurs(); this.bkKey = ''; }
  // 散景：短邊最多 720 像素算一次，參數沒變就不重算。bk：{ style 0~5, r 光斑半徑（佔短邊的比例）}
  bokeh(bk) {
    const key = [bk.style, bk.r.toFixed(4), this.w, this.h].join('|');
    if (key === this.bkKey) return;
    this.bkKey = key;
    const gl = this.gl;
    this.size([this.fbK], 720);
    const { w, h } = this.fbK, sh = Math.min(w, h);
    // 來源用稍微模糊過的小圖（fbS），小亮點先暈開一點，光斑才會是一整片，不是一顆顆的點
    this.pass(this.pBokeh, this.fbK, w, h, this.fbS[0].t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tSeg); gl.uniform1i(this.pBokeh.u.uSeg, 1);
    gl.uniform2f(this.pBokeh.u.uR, bk.r * sh / w, bk.r * sh / h);
    gl.uniform2f(this.pBokeh.u.uAsp, w / sh, h / sh);
    gl.uniform1i(this.pBokeh.u.uStyle, bk.style); gl.uniform1f(this.pBokeh.u.uHi, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
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
  setSegB(src) { src ? this.upload(this.tSegB, src) : this.blank(this.tSegB, 255); this.geo = null; }
  // 深度圖（relight.js）：R 還是模糊的人像遮罩，所以直接取代 segB
  setGeo(d) { this.upload(this.tSegB, d.canvas); this.geo = d; }
  // 美妝層：沒有妝的時候放一個全透明的點
  setMakeup(src) {
    if (src) { this.upload(this.tMakeup, src); return; }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tMakeup);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  }
  setLut(src, skin) { this.hasLut = !!src; this.lutSkin = !!skin; if (src) this.upload(this.tLut, src); }

  // fx：{ lit: { lights: [{ pos, col, par }], ambS, ambB, bgDepth, haze, hazeCol }, flash: { amt, retro } }
  render(p, warps, fx = {}) {
    const gl = this.gl, u = this.pMain.u;
    if (fx.bokeh) this.bokeh(fx.bokeh);
    // 有臉型變形時先畫到暫存，最後再變形一次畫到畫面
    const post = this.disp?.step > 0;
    if (post) this.sizeFbo(this.fbPost, this.w, this.h);
    this.pass(this.pMain, post ? this.fbPost : null, this.w, this.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const texs = [[this.tImg, 'uImg'], [this.tSmooth, 'uSmooth'], [this.tMask, 'uMask'], [this.tSeg, 'uSeg'], [this.tLut, 'uLut'], [this.tMask2, 'uMask2'], [this.tSegB, 'uSegB'],
      [this.fbS[0].t, 'uBlurS'], [this.fbM[0].t, 'uBgA'], [fx.bokeh ? this.fbK.t : this.fbL[0].t, 'uBgB'], [this.tOver, 'uOver'], [this.tEx, 'uEx'], [this.tBgImg, 'uBgImg'],
      [this.fbBm[0].t, 'uBgMid'], [this.fbBf[0].t, 'uBgFar'], [this.tMakeup, 'uMakeup']];
    texs.forEach(([t, name], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], i); });
    gl.uniform2f(u.uSize, this.w, this.h);
    const n = Math.min(warps.length, MAX_WARPS), w1 = new Float32Array(MAX_WARPS * 4), w2 = new Float32Array(MAX_WARPS * 4), w3 = new Float32Array(MAX_WARPS * 2);
    for (let i = 0; i < n; i++) {
      const w = warps[i];
      if (w.type === 'stretch' || w.type === 'band') { w1.set([w.y0, w.y1, w.s, w.H], i * 4); w2.set([1, w.type === 'band' ? 4 : 3, 0, 0], i * 4); continue; }
      if (w.type === 'seg') { w1.set([w.ax, w.ay, w.bx, w.by], i * 4); w2.set([w.r, 2, w.k, w.inner || 0], i * 4); w3.set([w.tc, w.ts], i * 2); continue; }
      w1.set([w.cx, w.cy, w.dx || 0, w.dy || 0], i * 4);
      w2.set([w.r, w.type === 'scale' ? 1 : 0, w.s || 0, w.ey || 1], i * 4);
      w3.set([Math.cos(w.rot || 0), Math.sin(w.rot || 0)], i * 2);
    }
    gl.uniform1i(u.uWn, n);
    gl.uniform4fv(u.uW1, w1); gl.uniform4fv(u.uW2, w2); gl.uniform2fv(u.uW3, w3);
    const L = fx.lit, ls = (L?.lights || []).slice(0, 8);
    const lp = new Float32Array(32), lr = new Float32Array(32), le = new Float32Array(32), ld = new Float32Array(32), lc = new Float32Array(24);
    ls.forEach((l, i) => { lp.set(l.pos, i * 4); lr.set(l.par, i * 4); le.set(l.ext || [36, 1, 0, 0], i * 4); ld.set(l.dir || [0, 0, 0, 0], i * 4); lc.set(l.col, i * 3); });
    gl.uniform1i(u.uLn, ls.length); gl.uniform4fv(u.uLPos, lp); gl.uniform4fv(u.uLPar, lr); gl.uniform4fv(u.uLExt, le); gl.uniform4fv(u.uLDir, ld); gl.uniform3fv(u.uLCol, lc);
    gl.uniform1f(u.uLAmbS, L?.ambS ?? 1); gl.uniform1f(u.uLAmbB, L?.ambB ?? 1); gl.uniform1f(u.uBgDepth, L?.bgDepth ?? 0); gl.uniform1f(u.uThick, L?.thick ?? 1e4); gl.uniform4fv(u.uFlashF, L?.flashF || [0, 0, 0, 0]); gl.uniform2fv(u.uFlashR, L?.flashR || [0, 0]); gl.uniform2fv(u.uFlashG, L?.flashG || [0, 1]); gl.uniform4fv(u.uFlashC, L?.flashC || [0, 0, 1, 1]); gl.uniform2fv(u.uLCap, L?.cap || [0, 0]);
    const g = this.geo;
    gl.uniform1f(u.uHasGeo, g ? 1 : 0); gl.uniform1f(u.uGeoMax, g ? g.max : 0); gl.uniform2f(u.uGeoTex, 1 / (g?.w || 1), 1 / (g?.h || 1));
    gl.uniform4fv(u.uHaze, L?.haze || [0, 0, 1, 0]); gl.uniform3fv(u.uHazeCol, L?.hazeCol || [1, 1, 1]);
    const F = fx.flash;
    gl.uniform1f(u.uFAmt, F ? F.amt : 0); gl.uniform1f(u.uFRetro, F?.retro ?? 0);
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
    gl.uniform1f(u.uVib, f(p.vibrance || 0)); gl.uniform1f(u.uStruct, f(p.structure || 0)); gl.uniform1f(u.uTexture, f(p.texture || 0)); gl.uniform1f(u.uLSense, f(p.lightSense || 0)); gl.uniform1f(u.uBack, f(p.backlight || 0));
    gl.uniform1f(u.uSmoothAmt, f(p.smooth));
    gl.uniform1f(u.uWhite, f(p.white));
    gl.uniform1f(u.uDark, f(p.dark)); gl.uniform1f(u.uFold, f(p.fold));
    gl.uniform1f(u.uEyeB, f(p.eyeb)); gl.uniform1f(u.uTeeth, f(p.teeth));
    gl.uniform1f(u.uHasLut, this.hasLut ? 1 : 0); gl.uniform1f(u.uLutSkin, this.lutSkin ? 1 : 0);
    gl.uniform1f(u.uLutAmt, f(p.filterAmt));
    gl.uniform1i(u.uFx, fx.fxMode || 0); gl.uniform1f(u.uFxAmt, fx.fxAmt || 0);
    const ra = this.w / this.h, re = this.exAr || 1;
    gl.uniform2f(u.uExFit, re > ra ? ra / re : 1, re > ra ? 1 : re / ra);
    gl.uniform1f(u.uOAmt, fx.over || 0); gl.uniform1f(u.uBlur, fx.blur || 0); gl.uniform1f(u.uBokeh, fx.bokeh ? 1 : 0);
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
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tSegB); gl.uniform1i(d.u.uSegB, 2);
      gl.uniform1f(d.u.uProtect, p.bgProtect === 0 ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  // 臉型位移圖：{ tex, step }，step = 0 表示沒有
  setDisp(d) { this.disp = d; }
}
