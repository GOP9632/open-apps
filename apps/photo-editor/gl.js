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
// 推臉的位移場自己做雙線性內插（texelFetch 四個點、解碼後再混）：手機 GPU 內插 8 位元貼圖的精度不夠，
// 高位通道一內插就會差好幾格，推過的地方會有細小的鋸齒
const LIQ_GLSL = `
vec2 liqAt(sampler2D t, ivec2 c, ivec2 n, float s){ vec4 e = floor(texelFetch(t, clamp(c, ivec2(0), n - 1), 0) * 255.0 + 0.5); return (vec2(e.r * 256.0 + e.b, e.g * 256.0 + e.a) - 32768.0) * s; }
vec2 liq(sampler2D t, vec2 uv, float s){
  ivec2 n = textureSize(t, 0); vec2 g = uv * vec2(n) - 0.5, f = fract(g); ivec2 c = ivec2(floor(g));
  return mix(mix(liqAt(t, c, n, s), liqAt(t, c + ivec2(1, 0), n, s), f.x), mix(liqAt(t, c + ivec2(0, 1), n, s), liqAt(t, c + ivec2(1, 1), n, s), f.x), f.y);
}`;
// 濾鏡的紋理（評審 M52；參數見 setGlow 的 tx、filters.json 的 tex）：醒圖不少底片、復古濾鏡疊了灰塵刮痕、漏光、網點、斑駁的素材，
// 我們不拿它的素材，全部在這裡用程式產生：位置用照片座標（照片短邊 = 1）、種子固定，預覽、存檔一樣，拉強度不會閃
const TEX_GLSL = `uniform float uTon;
uniform vec4 uTd, uTf, uTx;      // 灰塵點：密度、大小、最亮、分布；纖維：密度、大小、最亮、粗細；x：種子、刮痕條數、刮痕粗細、刮痕最亮
uniform vec4 uTs[4];             // 刮痕兩端（短邊單位）
uniform vec4 uTl[3], uTc[3];     // 漏光：中心（照片 0～1）、半徑（短邊）；顏色、w 0 照片座標／1 照片邊
uniform vec4 uTh;                // 網點：週期（短邊）、角度、強度
uniform vec4 uTm, uTn, uTo;      // 斑駁：中心 xy（照片 0～1）、範圍半徑 xy（短邊）；顏色 rgb、多少；飽和度門檻（從、到），斑點的大小、門檻（短邊）
vec4 th4(ivec2 c, uint s){ uvec2 v = uvec2(c) * 1664525u + 1013904223u + s * 2654435761u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; uint h = v.x ^ v.y, k = v.x * 2246822519u + v.y; return vec4(uvec4(h & 65535u, h >> 16u, k & 65535u, k >> 16u)) / 65535.0; }
// 半徑 r 的圓點蓋住這個像素多少（fw 一個像素多寬）：比像素小的點照面積變淡，不會一閃一閃
// 邊緣軟一點（至少 0.7 倍半徑寬）：醒圖的灰塵是放大過的素材，邊不銳利
float dotCov(float d, float r, float fw){ float e = max(fw, 0.7 * r); return r >= 0.5 * fw ? clamp((r + 0.5 * e - d) / e, 0.0, 1.0) : min(1.0, 3.2 * r * r / (fw * fw)) * clamp(1.0 - d / (0.5 * fw + r), 0.0, 1.0); }
// 到圓弧的距離：圓心 c、半徑 R、從角度 a 轉 s（弧度）；w = 半徑起伏（幅度、沿弧長每單位幾圈、相位），毛屑歪歪扭扭
float arcD(vec2 g, vec2 c, float R, float a, float s, vec3 w){ vec2 q = g - c; float t = mod(atan(q.y, q.x) - a, 6.2831853); if (t <= s) return abs(length(q) - R - w.x * sin(w.y * R * t + w.z)); float r0 = R + w.x * sin(w.z), r1 = R + w.x * sin(w.y * R * s + w.z); vec2 e0 = c + r0 * vec2(cos(a), sin(a)), e1 = c + r1 * vec2(cos(a + s), sin(a + s)); return min(length(g - e0), length(g - e1)); }
// 數值雜訊（格點隨機值、平滑內插），0～1
float vnoise(vec2 q, uint s){ ivec2 c = ivec2(floor(q)); vec2 f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th4(c, s).x, th4(c + ivec2(1, 0), s).x, f.x), mix(th4(c + ivec2(0, 1), s).x, th4(c + ivec2(1, 1), s).x, f.x), f.y); }
float segD(vec2 g, vec2 a, vec2 b){ vec2 ab = b - a; float t = clamp(dot(g - a, ab) / dot(ab, ab), 0.0, 1.0); return length(g - a - ab * t); }
vec3 texLayer(vec3 o, vec2 g, vec2 E, float fw){
  uint sd = uint(uTx.x);
  float a = 0.0;
  if (uTd.x > 0.0) {
    // 灰塵點：每格（平均一格一顆）擲一次，有就放在格子裡隨機位置；兩層格子錯開，看不出格線
    for (int L = 0; L < 2; L++) {
      float cell = inversesqrt(uTd.x) * (L == 0 ? 1.0 : 1.4142); vec2 q = g / cell + float(L) * 0.5; ivec2 c = ivec2(floor(q));
      vec4 h = th4(c, sd + uint(L) * 7u);
      if (h.x < (L == 0 ? 0.67 : 0.66)) {
        // 大小、長短（有些是短短一撇）、方向、亮度都隨機；亮度 u^w：w 越大暗的越多、亮的少
        vec4 k = th4(c, sd + 99u + uint(L));
        float r = uTd.y * (0.35 + 1.3 * h.y * h.y), el = 1.0 + 1.5 * k.y * k.y, rc = min(0.45, r * el / cell);
        vec2 pp = rc + (1.0 - 2.0 * rc) * h.zw, v = (fract(q) - pp) * cell;
        float an = 6.2831853 * k.z, cs = cos(an), sn = sin(an);
        float d = length(vec2((cs * v.x + sn * v.y) / el, -sn * v.x + cs * v.y)), al = uTd.z * pow(k.x, uTd.w);
        a = max(a, al * dotCov(d, r, fw));
      }
    }
  }
  if (uTf.x > 0.0) {
    // 纖維、毛屑：一格最多一條，一段或兩段反彎的圓弧（S 形）；看周圍 3×3 格
    float cell = inversesqrt(uTf.x); vec2 q = g / cell; ivec2 c0 = ivec2(floor(q));
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = c0 + ivec2(i, j); vec4 h = th4(c, sd + 31u), k = th4(c, sd + 57u);
      if (h.x > 0.8) continue;
      // 長度 ℓ 固定在 0.3～1 倍大小，彎曲（圓心角）隨機：捲的、彎的、幾乎直的都有
      float len = uTf.y * (0.3 + 0.7 * h.y), s = 0.15 + 3.6 * k.x * k.x, R = len / s, a0 = 6.2831853 * k.y;
      vec2 ct = (vec2(c) + h.zw) * cell - R * vec2(cos(a0 + 0.5 * s), sin(a0 + 0.5 * s));
      vec3 wv = vec3(len * 0.07 * h.y, 6.2831853 * (1.5 + 3.0 * k.w) / len, 6.2831853 * k.z);
      float d = arcD(g, ct, R, a0, s, wv);
      if (k.z < 0.45) { // 第二段：接在第一段尾巴，反方向彎（S 形）
        float a1 = a0 + s, s2 = 0.3 + 2.2 * k.w, R2 = len * (0.4 + 0.6 * k.w) / s2; vec2 e = ct + R * vec2(cos(a1), sin(a1));
        vec2 c2 = e + R2 * vec2(cos(a1), sin(a1));
        d = min(d, arcD(g, c2, R2, a1 + 3.14159265 - s2, s2, wv));
      }
      float al = uTf.z * (0.35 + 0.65 * th4(c, sd + 77u).x);
      a = max(a, al * dotCov(d, uTf.w, fw));
    }
  }
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uTx.y) break;
    // 刮痕：細長直線，兩端淡掉
    vec2 A = uTs[i].xy, B = uTs[i].zw, ab = B - A; float t = clamp(dot(g - A, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(g - A - ab * t), al = uTx.w * smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.75, t);
    a = max(a, al * dotCov(d, uTx.z, fw));
  }
  o = min(o + (1.0 - dot(o, vec3(0.299, 0.587, 0.114))) * a, 1.0);  // 灰塵、刮痕是白的：照醒圖只在亮度上濾色，三個通道加一樣多（不會染色）
  for (int i = 0; i < 3; i++) {
    if (uTc[i].w <= 0.0) break;
    // 漏光：一團顏色（高斯）用濾色疊上，中心可以在照片外
    vec2 d = (g - uTl[i].xy * E) / uTl[i].zw; vec3 l = uTc[i].rgb * exp(-0.5 * dot(d, d));
    o = 1.0 - (1.0 - o) * (1.0 - l);
  }
  if (uTh.z != 0.0) {
    // 網點：轉 θ 的兩組直角條紋（醒圖復古雜誌：週期 896 寬上 4.8 像素、54°），起伏照 x(1−x)，中間調最明顯（像柔光疊上去）
    float cs = cos(uTh.y), sn = sin(uTh.y); vec2 r = mat2(cs, sn, -sn, cs) * g * (6.2831853 / uTh.x);
    o += uTh.z * o * (1.0 - o) * (cos(r.x) + cos(r.y));
  }
  if (uTn.w > 0.0) {
    // 斑駁（醒圖暖調膠片）：一塊平頂的橢圓範圍裡撒小斑點（雜訊過門檻），往一個顏色推；只出現在鮮豔的地方
    // （醒圖的只在紅毛衣上，旁邊的脖子、背景沒有：照飽和度 max−min 開關）
    vec2 d = (g - uTm.xy * E) / uTm.zw; float r2 = dot(d, d), m = exp(-0.5 * r2 * r2);
    float hi = 0.6 * vnoise(g / uTo.z, sd + 8u) + 0.4 * vnoise(g / uTo.z * 2.1, sd + 9u);
    float v = smoothstep(uTo.x, uTo.y, max(o.r, max(o.g, o.b)) - min(o.r, min(o.g, o.b))) * smoothstep(uTo.w, uTo.w + 0.25, hi) * m * uTn.w;
    o = mix(o, uTn.rgb, v);
  }
  return clamp(o, 0.0, 1.0);
}`;

const FS_DISP = `#version 300 es
precision highp float; precision highp int;
in vec2 vUV; uniform sampler2D uTex, uDisp, uSegB, uLiq, uGS, uGB; uniform vec2 uSize, uOut; uniform float uStep, uProtect, uLiqStep; out vec4 o;
uniform vec4 uG1, uG2;  // 濾鏡的柔焦、光暈（見 glowBufs）：uG1 = 柔焦多少、光暈門檻、開關；uG2 = 光暈的顏色（RGB 各多少）
uniform vec3 uGr;  // 濾鏡的底片顆粒（見 setGlow）：x 亮度顆粒、y 彩色顆粒（照片值）、z 照片短邊幾格（每個濾鏡不同）
uniform vec3 uGs;  // 顆粒跟亮度的關係：L^x·(1−L)^y·z（z 讓最強的地方是 1；x = y = 1 就是 4L(1−L)，中間調最強）
${TEX_GLSL}
// 四份獨立的格點雜訊（-0.5～0.5），格子之間雙線性內插：格子跟著照片走，預覽、存檔看起來一樣粗
vec4 gn(ivec2 c){ uvec2 v = uvec2(c) * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; uint h = v.x ^ v.y; return vec4(uvec4(h, h >> 8u, h >> 16u, h >> 24u) & 255u) / 255.0 - 0.5; }
// 格點之間雙線性內插，再除以內插讓雜訊變弱的倍數 √(((1−fx)²+fx²)((1−fy)²+fy²))：格子中間跟格點上一樣強，
// 不會一格一格看得到網格（評審 M48）
vec4 grain(vec2 g){ ivec2 c = ivec2(floor(g)); vec2 f = fract(g), e = (1.0 - f) * (1.0 - f) + f * f; return mix(mix(gn(c), gn(c + ivec2(1, 0)), f.x), mix(gn(c + ivec2(0, 1)), gn(c + ivec2(1, 1)), f.x), f.y) * inversesqrt(e.x * e.y); }
vec2 dec(vec4 e, float s){ e *= 255.0; return (vec2(e.r * 256.0 + e.b, e.g * 256.0 + e.a) - 32768.0) * s; }${LIQ_GLSL}
void main(){
  // 推臉（重新塑形）在最上層：先照推臉的位移找到「臉型變形後的圖」上的哪一點，再照臉型的位移回原圖。
  // v：這一點在照片上的位置（增高拉的時候畫面比照片高，uOut 是畫面大小；平常兩個一樣）
  vec2 v = vUV * uOut / uSize, q = v;
  if (uLiqStep > 0.0) q += liq(uLiq, v, uLiqStep) / uSize;
  vec2 d = (q - v) * uSize;
  if (uStep > 0.0) d += dec(texture(uDisp, q), uStep);
  // 背景保護（同主 shader）：位移乘上擴張羽化過的人像遮罩
  if (uProtect > 0.5) d *= smoothstep(0.02, 0.3, texture(uSegB, v).r);
  vec2 p = vUV + d / uOut;
  o = texture(uTex, p);
  if (uG1.z > 0.0) {
    // 柔焦：跟模糊過的混；光暈：比門檻亮的地方（大模糊那份）帶顏色暈開，濾色疊上去
    vec3 c = o.rgb, h = texture(uGB, p).rgb;
    c += (texture(uGS, p).rgb - c) * uG1.x;
    float L = dot(h, vec3(0.299, 0.587, 0.114));
    vec3 g = clamp(clamp((L - uG1.y) / max(1e-3, 1.0 - uG1.y), 0.0, 1.0) * h * uG2.rgb, 0.0, 1.0);
    o.rgb = 1.0 - (1.0 - c) * (1.0 - g);
  }
  if (uTon > 0.5) {
    // 紋理疊在顆粒下面（顆粒最後才加）；fw：這裡一個像素是照片短邊的多少（比像素小的灰塵照面積變淡）
    vec2 g = p * uOut / min(uSize.x, uSize.y), E = uOut / min(uSize.x, uSize.y);
    o.rgb = texLayer(o.rgb, g, E, max(fwidth(g.x), fwidth(g.y)));
  }
  if (uGr.x + uGr.y > 0.0) {
    // 顆粒：亮度一份、RGB 各一份扣掉平均當彩色的部分，乘上照亮度的曲線（多半中間調最明顯，很亮、很暗的地方幾乎沒有；
    // 民國古褐、松下 Lx5 這類暗部最粗）
    vec4 n = grain(p * uOut / min(uSize.x, uSize.y) * uGr.z);
    float L = clamp((o.r + o.g + o.b) / 3.0, 0.0, 1.0), wL = pow(max(L, 1e-4), uGs.x) * pow(max(1.0 - L, 1e-4), uGs.y) * uGs.z;
    o.rgb = clamp(o.rgb + wL * (uGr.x * n.x + uGr.y * (n.yzw - (n.y + n.z + n.w) / 3.0)), 0.0, 1.0);
  }
}`;

// 濾鏡顆粒的格子：照片短邊幾格。每個濾鏡顆粒粗細不同，照醒圖答案的細、粗紋比例擬合在 filters.json 的 grain 第 5 個數
// （300～1000，醒圖預覽 896 寬上約 1～3 像素一顆）；沒給的用 450
const GRAIN_N = 450;

// 推臉的位移場：每個像素記「要回（臉型變形後的）圖上哪裡取」，跟 warpfield 一樣用 RGBA8 存 16 位元。
// 每推一下就改一次位移場：新位移(p) = 舊位移(q) + q − p，q 是這一下之前 p 的內容在哪。
// 所以每一下都是照「現在畫面上看到的樣子」推（跟醒圖、Photoshop 液化一樣），推多少次都不會疊出坑或摺起來
//   uT：0 推（uV = 位移）、1 脹大／縮小（uV.x = 比例）、2 旋轉（uV.x = 角度）、3 還原（uV.x = 還原多少）
const FS_LIQ = `#version 300 es
precision highp float; precision highp int;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uImg, uV; uniform vec3 uM; uniform float uStep; uniform int uT; uniform ivec2 uOff; out vec4 o;${LIQ_GLSL}
vec4 enc(vec2 d){ vec2 c = clamp(floor(d / uStep + 0.5) + 32768.0, 0.0, 65535.0), hi = floor(c / 256.0), lo = c - hi * 256.0; return vec4(hi.x, hi.y, lo.x, lo.y) / 255.0; }
void main(){
  // 畫在筆刷那一塊大小的暫存上（uOff：這塊在位移場的哪裡），畫完抄回位移場
  ivec2 px = ivec2(gl_FragCoord.xy) + uOff;
  vec4 cur = texelFetch(uTex, px, 0);
  vec2 p = (vec2(px) + 0.5) / vec2(textureSize(uTex, 0)) * uImg, rel = p - uM.xy;
  float t2 = dot(rel, rel) / (uM.z * uM.z);
  if (t2 >= 1.0) { o = cur; return; }
  float f = (1.0 - t2) * (1.0 - t2);
  if (uT == 3) { o = enc(liqAt(uTex, px, textureSize(uTex, 0), uStep) * (1.0 - uV.x * f)); return; }
  vec2 q;
  if (uT == 0) q = p - uV * f;
  else if (uT == 1) q = uM.xy + rel * (1.0 - uV.x * f);
  else { float th = -uV.x * f, c = cos(th), s = sin(th); q = uM.xy + vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y); }
  o = enc(liq(uTex, q / uImg, uStep) + q - p);
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
uniform sampler2D uImg, uSmooth, uMask, uSeg, uLut, uMask2, uSegB, uBlurS, uBgA, uBgB, uOver, uEx, uBgImg, uBgMF, uMakeup;
// 換背景照片的中等模糊、很糊兩份放在同一張貼圖（uBgMF）：中等的在左邊 uBgM.xy 大小、很糊的接在右邊 uBgM.zw 大小，uBgMT = 1 ÷ 貼圖大小。
// 貼圖單元用滿 16 個（iPhone 的上限），這樣才空得出一個給相機閃光燈的調色表（uFGrid）
uniform vec4 uBgM; uniform vec2 uBgMT;
// 相機閃光燈 AI 模型（flashnet.js）：uFGrid 調色表、uFG1／uFG2 引導值的小網路、uFlashM 跟原圖混合的比例（0 = 不用模型）
uniform highp sampler3D uFGrid; uniform vec4 uFG1[16], uFG2[3]; uniform float uFlashM;
uniform vec2 uSize, uOut;  // 照片大小、畫面大小（照片像素）。增高拉的時候畫面比照片高，平常一樣
uniform int uWn, uWm;  // uWm：最前面幾個是手動塑身（不受背景保護，照 Hypic）
uniform vec4 uW1[${MAX_WARPS}]; // 中心 xy、位移 xy（像素）；骨架收窄是 A、B 兩端；拉長是 y0、y1、強度、照片高
uniform vec4 uW2[${MAX_WARPS}]; // 半徑、種類(0 推移 1 放大 2 骨架收窄 3 往下拉長 4 整段拉長 5 手動瘦身)、強度、橢圓比（收窄：只收一點的那側）
uniform vec2 uW3[${MAX_WARPS}]; // 頭的傾斜 cos、sin（收窄：最強的位置、範圍）
uniform float uExposure, uBright, uContrast, uSat, uTemp, uTint, uHigh, uShadow, uSharp, uVig, uGrain, uFade;
uniform float uVib, uStruct, uTexture, uLSense, uBack;
uniform vec4 uFlashF, uFS, uFP[7], uFlashO, uFlashC, uFlashX;
uniform vec2 uFlashR, uLCap, uFlashG;
uniform vec3 uFlashT;
uniform vec3 uFCs, uFCast;
uniform float uSmoothAmt, uWhite, uLutAmt, uHasLut, uLutSkin, uLutHair;
uniform float uDark, uFold, uEyeB, uTeeth;
// 多張臉分開修：每張臉的中心和臉寬（uFC：x, y, 臉寬，照片像素）、磨皮美白黑眼圈法令紋（uFA）、亮眼白牙（uFB）
// uNF = 0 表示每張臉都一樣，用上面那組
uniform int uNF; uniform vec4 uFC[5], uFA[5]; uniform vec2 uFB[5];
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

// LUT 圖是 1536×512：左邊一般顏色，中間皮膚那套，右邊頭髮那套（side 0、1、2）
vec3 lut(vec3 c, float side){
  float b = c.b * 63.0;
  float b0 = floor(b), b1 = min(b0 + 1.0, 63.0);
  vec2 off = (c.rg * 63.0 + 0.5) / 512.0;
  vec2 q0 = vec2(mod(b0, 8.0), floor(b0 / 8.0)) / 8.0;
  vec2 q1 = vec2(mod(b1, 8.0), floor(b1 / 8.0)) / 8.0;
  vec2 h = vec2(1.0 / 3.0, 1.0), s = vec2(side / 3.0, 0.0);
  return mix(texture(uLut, (q0 + off) * h + s).rgb, texture(uLut, (q1 + off) * h + s).rgb, b - b0);
}

void main(){
  // 變形：輸出的每個像素往回找要取原圖哪一點
  vec2 p = vUV * uOut, pM = p, vP = p / uSize;  // vP：這一點在照片上的位置（打光、霧照照片的位置算）
  for (int i = 0; i < ${MAX_WARPS}; i++) {
    if (i >= uWn) break;
    if (i == uWm) pM = p;
    float kind = uW2[i].y;
    if (kind > 4.5) {
      // 手動瘦身（照 Hypic 量出來的）：中軸兩側往中軸收（強度負的是撐開）。
      // 離中軸 u、沿中軸 v：位移 = 強度 × u ×（1 − (u/寬)²)² ×（1 − (v/高)²)³，越靠中軸、越靠上下兩端動得越少
      vec2 ax = uW1[i].zw, n = vec2(ax.y, -ax.x), d = p - uW1[i].xy;
      float u = dot(d, n), x = u / uW2[i].x, y = dot(d, ax) / uW2[i].w;
      if (abs(x) < 1.0 && abs(y) < 1.0) { float fx = 1.0 - x * x, fy = 1.0 - y * y; p += n * u * uW2[i].z * fx * fx * fy * fy * fy; }
      continue;
    }
    if (kind > 3.5) {
      // 手動增高：y0~y1 這一段整段拉長 1+s 倍（s 負的是縮短），下面的部分往下移（畫面高 Ho 跟著變高；Ho = H 時壓回照片裡）
      float y0 = uW1[i].x, y1 = uW1[i].y, s = uW1[i].z, H = uW1[i].w, Ho = uW2[i].z, y1o = y0 + (y1 - y0) * (1.0 + s);
      if (p.y > y0) {
        if (p.y < y1o) p.y = y0 + (p.y - y0) / (1.0 + s);
        else p.y = y1 + (p.y - y1o) * (H - y1) / max(Ho - y1o, 1.0);
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
  if (uWm >= uWn) pM = p;
  if (uProtect > 0.5) {
    // 背景保護：位移量乘上「人像往外擴一點、邊緣羽化」的遮罩，背景的位移壓到 0，背景根本不動。手動塑身（到 pM 為止）不保護
    p = pM + (p - pM) * smoothstep(0.02, 0.3, texture(uSegB, pM / uSize).r);
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

  // 這個像素屬於哪張臉：離哪張臉的中心最近（用臉寬算），就用那張臉的數字
  float aSm = uSmoothAmt, aWh = uWhite, aDk = uDark, aFd = uFold, aEb = uEyeB, aTt = uTeeth;
  if (uNF > 0) {
    vec2 px = uv * uSize; float best = 1e9; int bi = 0;
    for (int i = 0; i < 5; i++) {
      if (i >= uNF) break;
      float dd = length(px - uFC[i].xy) / uFC[i].z;
      if (dd < best) { best = dd; bi = i; }
    }
    aSm = uFA[bi].x; aWh = uFA[bi].y; aDk = uFA[bi].z; aFd = uFA[bi].w; aEb = uFB[bi].x; aTt = uFB[bi].y;
  }
  vec2 mk = texture(uMask, uv).rg;
  if (aSm > 0.0 && mk.r > 0.0) {
    vec3 s = texture(uSmooth, uv).rgb;
    // 跟醒圖一樣，暗部不磨，避免陰影和輪廓被抹平
    float dark = smoothstep(0.2, 0.45, col.r);
    col = mix(col, s, mk.r * dark * aSm * 0.9);
  }
  if (aWh > 0.0 && mk.g > 0.0) {
    float k = mk.g * aWh;
    col = mix(col, 1.0 - (1.0 - col) * (1.0 - col * 0.55), k * 0.6);
    col = mix(col, vec3(luma(col)), k * 0.12);
  }

  vec3 mk2 = texture(uMask2, uv).rgb;
  if ((aDk > 0.0 && mk2.r > 0.0) || (aFd > 0.0 && mk2.g > 0.0)) {
    // 黑眼圈、法令紋：跟周圍皮膚比，比周圍暗的地方提亮，顏色往周圍拉
    vec2 R = vec2(0.018) * vec2(uSize.y / uSize.x, 1.0);
    vec3 a = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float t = float(k) * 0.785398;
      a += texture(uSmooth, uv + vec2(cos(t), sin(t)) * R).rgb;
    }
    a /= 8.0;
    float m = clamp(mk2.r * aDk + mk2.g * aFd, 0.0, 1.0);
    float la = luma(a), lc = luma(col);
    col += max(la - lc, 0.0) * m * 1.1;
    col = mix(col, luma(col) * a / max(la, 0.01), m * 0.45);
    if (mk2.g > 0.0) col = mix(col, texture(uSmooth, uv).rgb + (col - texture(uSmooth, uv).rgb) * 0.4, mk2.g * aFd * 0.6);
  }
  if (aEb > 0.0 && mk2.b > 0.0) {
    // 亮眼：眼睛裡面加一點亮度和細節
    vec3 s = texture(uSmooth, uv).rgb;
    float m = mk2.b * aEb;
    col += (col - s) * m * 0.8;
    col = 1.0 - (1.0 - col) * (1.0 - m * 0.12);
  }
  if (aTt > 0.0 && mk.g >= 0.0) {
    // 白牙：只動嘴巴裡比較亮的地方，去黃再提亮
    float m = texture(uMask, uv).b * aTt * smoothstep(0.28, 0.55, luma(col));
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
  vec3 cPre = col;
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
          vec2 dv = (vP - uLPos[i].xy) * vec2(uSize.x / uSize.y, 1.0);
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
      vec2 dh = (vP - uHaze.xy) * vec2(uSize.x / uSize.y, 1.0);
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
    // 舊版閃光燈（臉本來就打得很平、很正面的照片用這套，見 relight.js 的 FLASH_EVEN）：燈照完再補平
    if (uFlashO.x > 0.0) {
      // 調整 › 閃光燈：臉上的皮膚看附近皮膚的平均亮度補平，暗的那側補多、本來就亮的那側收一點，
      // 像從相機打一盞平光。用附近的平均而不是單一像素，鬍子、眉毛這種本來就深的地方不會被洗白
      float sw = 0.0, sl = 0.0, sg = 0.0;
      for (int j = 0; j < 17; j++) {
        float ring = j == 0 ? 0.0 : (j < 9 ? 1.0 : 2.0), an = float(j) * 0.785398 + (j < 9 ? 0.0 : 0.3927);
        vec2 q = uv + ring * uFlashR * vec2(cos(an), sin(an));
        float w = texture(uMask, q).r + 0.15;
        sl += luma(texture(uBlurS, q).rgb) * w; sw += w; sg += texture(uMask, q).g;
      }
      // 臉：照附近皮膚的平均亮度（七成）和這一點周圍的亮度（三成）決定補多少（暗的那側補多、亮的那側幾乎不補），有上限（uFlashG.y）
      vec2 fc = (uv - uFlashC.xy) / uFlashC.zw;
      float Ls = max(mix(sl / sw, luma(texture(uBlurS, uv).rgb), 0.3), 0.02), dl = min(uFlashO.y * (uFlashO.z - Ls), uFlashG.y);
      // 相機閃光燈：下巴下面的脖子補少一點，脖子不會比下巴亮（Hypic 也是暗的）
      float neck = uFlashX.y * smoothstep(0.85, 0.97, fc.y) * (1.0 - smoothstep(0.35, 0.6, abs(fc.x))) * (1.0 - smoothstep(0.3, 0.4, Ls));   // 只有本來就在影子裡的暗脖子
      dl *= 1.0 - 0.4 * neck;
      // 閃光燈從鏡頭打過來：正對鏡頭的面補滿，下顎、臉頰外側、鼻翼這些斜的面補少，輪廓的陰影留著
      // 正對鏡頭的面補滿、斜的面補少；相機閃光燈差得更多（Hypic 的臉比原圖更立體）
      float nz = mix(mix(0.55, 0.3, uFlashX.y), 1.0, smoothstep(mix(0.3, 0.4, uFlashX.y), mix(0.8, 0.9, uFlashX.y), N.z));
      // 補光的顏色：亮的臉照 Hypic 偏冷一點（少一點紅）；暗的地方跟著膚色走，不會被稀釋成灰綠色
      vec3 sc0 = texture(uBlurS, uv).rgb, skinT = mix(vec3(1.0), clamp(sc0 / max(luma(sc0), 0.02), 0.4, 1.6), 0.3);   // 顏色比例有上下限：很暗又很飽和的地方（藍色陰影的頭髮）不會被放大成一片藍
      vec3 tint = mix(skinT, uFlashT, smoothstep(0.34, 0.44, Ls));
      // 嘴唇（美白遮罩 0.4、磨皮遮罩 0）：補的量跟皮膚一樣，一半用乘的，保留唇色
      vec2 mk = texture(uMask, uv).rg;
      float lipM = smoothstep(0.2, 0.35, mk.y) * (1.0 - smoothstep(mix(0.05, 0.3, uFlashX.y), mix(0.2, 0.6, uFlashX.y), mk.x)) * step(0.0, fc.y);   // 相機閃光燈連唇邊一起算，下唇不會蒙白
      // 眼睛（亮眼遮罩：眼眶裡的眼白、虹膜、瞳孔）完全不補，眼珠不會變灰；眼皮照常補，不會多一圈黑眼圈
      float eyeM = smoothstep(0.2, 0.6, texture(uMask2, uv).b), eye = 1.0 - mix(1.0, 0.45, uFlashX.y) * eyeM;   // 相機閃光燈補得多，眼睛也亮一點，眼下不會多一圈落差
      // 額頭上半、下巴補得比臉中間少一點（Hypic 也是）
      float k = nz * eye * (1.0 - 0.3 * smoothstep(0.3, 0.65, fc.y) - 0.3 * (1.0 - smoothstep(-0.65, -0.35, fc.y)));
      // 相機閃光燈：Hypic 的結果幾乎是原圖乘上一張平滑的倍率（額頭 G ×1.46、R ×1.28），亮的鼻子、嘴唇跟著亮，
      // 臉的明暗還在（不像補平那樣變成面具）。倍率正面高、側面低，光從左邊一點來：右半臉低一點
      float kC = mix(0.35, 1.0, smoothstep(0.3, 0.85, mix(N.z, sqrt(max(1.0 - N.x * N.x, 0.0)), smoothstep(0.84, 0.9, fc.y)))) * (1.0 - 0.15 * clamp(fc.x, -0.8, 0.8)) * (1.0 - 0.12 * smoothstep(0.3, 0.7, fc.y) - 0.2 * (1.0 - smoothstep(-0.65, -0.35, fc.y)));
      // 眼睛以上比附近皮膚暗很多的地方（眉毛、瀏海；看這一點周圍一小塊）是本來的顏色深，不是陰影：加的白光跟著變少，只用乘的稍微提亮，不會變灰。眼睛以下（暗側臉頰、鬍渣）照常補，補光才平均
      float wa = mix(1.0, smoothstep(0.6, 0.95, mix(L0, luma(texture(uBlurS, uv).rgb), 0.7) / Ls), max(1.0 - smoothstep(-0.3, -0.22, fc.y), uFlashX.y * smoothstep(0.1, 0.2, fc.y))) * (1.0 - mix(0.5, 0.6, uFlashX.y) * lipM);   // 嘴唇多用乘的，保持飽和
      float wm = mix(0.3, mix(1.0, 0.8, uFlashX.y), lipM) * (1.0 - wa) * (1.0 - smoothstep(0.75, 0.92, max(col.r, max(col.g, col.b))));   // 唇上的高光不再乘亮，不會爆白
      // 底：調整 › 閃光燈用原圖（臉的亮度全由補光決定）；光影的相機、富士閃光燈用燈照過的結果（uFlashX.w = 1）
      wm = mix(wm, 1.0, uFlashX.y * eyeM); wa *= 1.0 - uFlashX.y * eyeM;   // 眼睛用乘的：眼白亮、瞳孔還是黑的
      vec3 fb = mix(col, lit, uFlashX.w);
      wa *= mix(1.0, smoothstep(0.05, 0.3, max(mk.x, mk.y)), 1.0 - smoothstep(0.06, 0.15, luma(sc0)));   // 這一小塊很暗又不是皮膚（臉旁的深色頭髮）：是本來就深，不是陰影，少加光
      vec3 fill = dl > 0.0 ? fb * (1.0 + dl * k * wm / Ls) + tint * dl * k * wa : fb * (1.0 + max(dl, -0.03) * k / Ls);   // 本來就亮的地方最多暗一點點
      // 右邊太陽穴、右下顎這種朝右的面比原圖暗一點（Hypic ×0.85～0.9）；暗的地方（黑眼圈、上唇）倍率高一點
      float Sc = kC * (1.0 + 0.35 * lipM * smoothstep(0.45, 0.3, luma(sc0))) * clamp(pow(0.47 / max(luma(sc0), 0.1), 0.4), 0.85, 1.3) * (1.0 + 0.3 * smoothstep(-0.36, -0.22, fc.y) * (1.0 - smoothstep(-0.1, 0.15, fc.y)) * (1.0 - smoothstep(0.3, 0.5, abs(fc.x)))) * (1.0 - 0.5 * eyeM) * (1.0 - 0.4 * smoothstep(0.35, 0.6, abs(fc.x)) - 0.15 * smoothstep(0.2, 0.45, -fc.x) * smoothstep(0.35, 0.6, fc.y)) - 0.6 * smoothstep(0.3, 0.6, fc.x) * (1.0 - smoothstep(0.5, 0.8, N.z));
      // 顏色：臉中間加的光偏白（G、B 倍率高，去紅），越往兩側越只是變亮；嘴唇去紅少一半，保持飽和
      vec3 gC = vec3(0.3) * Sc + vec3(0.0, 0.1, 0.13) * (1.7 - 0.7 * smoothstep(0.1, 0.4, abs(fc.x))) * (1.0 - 0.6 * smoothstep(0.35, 0.6, fc.y)) * (1.0 - 0.6 * lipM * smoothstep(0.3, 0.45, luma(sc0))) * max(Sc, 0.0);
      fill = mix(fill, fb * (1.0 + gC * (uFlashG.y / 0.25)), uFlashX.y);
      fill = mix(fill, fb, mix(lipM, smoothstep(0.86, 0.96, max(col.r, max(col.g, col.b))), uFlashX.y) * smoothstep(0.78, 0.9, max(col.r, max(col.g, col.b))));   // 唇上本來就很亮的反光不補，不會到 255
      // 臉的範圍：上半臉只補皮膚（瀏海、頭髮不補；用附近的平均，額頭不會補得一塊一塊），鼻子到下巴連鬍子一起補，脖子補少一點；邊緣拉長，看不出一圈
      float face = (1.0 - smoothstep(0.75, 1.2, length(fc))) * mix(smoothstep(0.25, 0.7, sg / 17.0), 1.0, smoothstep(-0.05, 0.15, fc.y)) * (1.0 - 0.6 * (1.0 - uFlashX.y) * smoothstep(0.6, 1.0, fc.y));
      face *= mix(1.0, smoothstep(0.05, 0.3, max(max(mk.x, mk.y), eyeM)), uFlashX.y);   // 相機閃光燈補得多：臉旁邊的頭髮（不是皮膚）不補，不會蒙一層灰
      // 臉以外：露出的皮膚（脖子、肩膀）照燈的結果；衣服、頭髮只會跟著變暗，不加光、不褪色
      lit = mix(lit, col * (luma(lit) / max(L0, 0.02)), smoothstep(0.5, 0.8, L0) * uFlashO.w * pw);
      // 頭頂的頭髮跟 Hypic 一樣再壓暗一點
      float hairZ = (1.0 - smoothstep(1.2, 1.5, length(fc))) * (1.0 - smoothstep(-0.4, -0.1, fc.y));
      // 相機閃光燈（uFlashX.y = 1）：閃光燈在鏡頭上面一點，下顎在脖子上投一條細細的影子，沿著整條下顎（Hypic 157 → 76 → 137）。
      // 用臉的遮罩找下顎：上面一點是臉、這裡已經是脖子的皮膚，就是下顎正下方。遮罩本身是模糊過的，影子邊緣自然羽化
      vec2 dv = vec2(0.0, 0.055 * uFlashC.w);
      vec2 us = uv - 0.65 * dv;   // 遮罩的臉比下顎高一點：整個往下移，影子貼著下顎
      vec2 inw = vec2(-sign(fc.x) * 0.12 * uFlashC.z, 0.0) * smoothstep(0.25, 0.5, abs(fc.x));   // 下顎兩側是斜的：往臉中間也看一點
      float mkS = texture(uMask, us).r, faceUp = max(0.5 * (texture(uMask, us - dv).r + texture(uMask, us - 0.6 * dv).r), texture(uMask, us - 0.6 * dv + inw).r);
      float sk = uFlashX.y * uFlashX.z * smoothstep(0.62, 0.85, faceUp) * (1.0 - smoothstep(0.58, 0.78, mkS)) * smoothstep(0.05, 0.3, mkS) * smoothstep(0.03, 0.2, mk.x)
               * smoothstep(0.3, 0.5, fc.y) * (1.0 - smoothstep(0.8, 1.0, abs(fc.x)));
      // 影子照原圖的比例壓暗，最多到原本的五到七成（不會變成黑帶）；G、B 壓得多一點，保留膚色，不會變灰
      vec3 shd = fb * (1.0 - vec3(0.27, 0.42, 0.52));
      // 光從左上來：右下顎那一側比原圖再暗一點（Hypic 174 → 158）
      fill = mix(fill, shd, sk) * (1.0 - 0.2 * uFlashX.y * smoothstep(0.15, 0.5, fc.x) * smoothstep(0.42, 0.65, fc.y));
      float dB = min(uFlashO.y * (uFlashO.z + 0.08 - Ls), 0.85 * uFlashG.y) * (1.0 - 0.45 * neck);   // 身上不照臉的上下遞減；目標亮一點（Hypic 肩膀、胸口很亮），上限低一點（暗的脖子不會發光）
      vec3 fillB = mix(dB > 0.0 ? fb * (1.0 + dB * nz * wm / Ls) + tint * dB * nz * wa : fill, shd, sk);
      vec3 skin = mix(lit, fillB, uFlashX.y);
      // 衣服、頭髮：調整 › 閃光燈只會變暗；相機閃光燈照燈的結果，最多亮 1.25 倍（Hypic 頭髮有反光）
      // 皮膚的範圍用附近的平均收邊，脖子和衣服之間不會有一道硬邊
      vec3 body = mix(col * min(mix(1.0, 1.25, uFlashX.y), luma(lit) / max(L0, 0.02)) * (1.0 - uFlashX.x * hairZ), skin, mk.y * mix(1.0, smoothstep(0.2, 0.7, sg / 17.0), uFlashX.y));
      lit = mix(lit, mix(body, fill, face), pw);
      // 超過 214 的部分慢慢收到 237 以下（存 JPEG 時顏色還會再往外衝一點），紅色通道不會被推到 255（本來就比較亮的不動）
      { float mx = max(col.r, max(col.g, col.b)), kn = 0.84;
        vec3 e = max(lit - kn, 0.0), sc = kn + 0.09 * (1.0 - exp(-e / 0.09));
        // 相機閃光燈：三個通道一起等比例收，嘴唇不會因為只收紅色而變白、偏紫
        float m = max(lit.r, max(lit.g, lit.b)), mt = max(0.84 + 0.09 * (1.0 - exp(-max(m - 0.84, 0.0) / 0.09)), mx);
        lit = mix(lit, mix(min(lit, max(sc, col)), lit * min(1.0, mt / max(m, 1e-3)), uFlashX.y), pw); }
      // 背景只會變暗
      lit = mix(min(lit, col), lit, pw);
      // 調整 › 閃光燈、富士閃光燈加的光不會把某個顏色單獨推高：任何一個通道多出來的量，最多比亮度多出來的量再多 10（保持亮度、只收顏色）。
      // 相機閃光燈照 Hypic 會把衣服、頭髮按比例提亮（紅衣服 R 加得多是正常的），不套這條
      if (uFlashX.y < 0.5) { vec3 inc = lit - col; float li = luma(inc), ex = max(inc.r, max(inc.g, inc.b)) - li;
        if (li > 0.0) { if (ex > 0.04) lit = col + li + (inc - li) * (0.04 / ex); }
        else lit = col + min(inc, 0.04); }   // 整體變暗的地方（背景）不動它怎麼變暗，只是不讓哪個通道變亮
      // 燈是照全強度算的，這裡照滑桿跟原圖混合
      lit = mix(col, lit, uFlashO.x);
    }
    col = clamp(lit, 0.0, 1.0);
  }

  // 閃光燈（調整 › 閃光燈、光影 › 相機閃光燈）：照 Hypic 在 8 張公開測試照上的成品擬合（relight.js 的 FLASH_ADJ、FLASH_CAM）。
  // Hypic 是雲端 AI 整張重畫，這裡把皮膚、五官、頭髮、衣服、背景分開，各用一條公式近似它的成品，最後照滑桿跟原圖混合
  //   uSeg：R = 人像；有分類圖（uFlashF.z = 1）時 G = 0.5 + 0.5 ×（頭髮 − 五官）、B = 皮膚（挖掉五官）、A = 1 − 0.5 × 鬍子
  //   uFS：臉上皮膚亮度（第 90 百分位）、背景平均亮度、臉上皮膚亮度中位數、平光臉的程度；uFCs：臉上皮膚的顏色比例；uFCast：背景色偏
  //   uFlashF.w：舊版佔多少（臉的光介於平和不平之間）；公式從打光前的顏色算，最後跟舊版的成品照比例混合
  if (uFlashF.x > 0.0) {
    vec3 cOld = col;
    if (uFlashF.w > 0.0) col = cPre;
    bool cls = uFlashF.z > 0.5;
    vec4 sg = texture(uSeg, uv);
    float ps = sg.r, wsk = cls ? sg.b : texture(uMask, uv).r, wh = cls ? max(2.0 * sg.g - 1.0, 0.0) : 0.0, wf = cls ? max(1.0 - 2.0 * sg.g, 0.0) : 0.0;
    // 附近皮膚（含五官）的平均亮度：兩圈 17 點
    float sl = 0.0, sw = 0.0;
    for (int j = 0; j < 17; j++) {
      float ring = j == 0 ? 0.0 : (j < 9 ? 1.0 : 2.0), an = float(j) * 0.785398 + (j < 9 ? 0.0 : 0.3927);
      vec2 q = uv + ring * uFlashR * vec2(cos(an), sin(an));
      vec3 sq = texture(uSeg, q).rgb;
      float w = (cls ? sq.b + max(1.0 - 2.0 * sq.g, 0.0) : texture(uMask, q).r) + 0.02;
      vec3 bq = texture(uBlurS, q).rgb;
      sl += mix(luma(bq), (bq.r + bq.g + bq.b) / 3.0, uFP[5].z) * w; sw += w;
    }
    // 明暗用亮度和 RGB 平均照 uFP[5].z 混合：藍光、冷光照到的地方亮度權重低，只看亮度會被當成很暗的陰影
    float Lh = uFS.x, L = luma(col), Lv = mix(L, (col.r + col.g + col.b) / 3.0, uFP[5].z), Lbl = max(sl / sw, 1e-3);
    vec3 ch = col - L;
    float sh = clamp(Lbl / Lh, 1e-3, 1.5), det = clamp(Lv / Lbl, 1e-3, 3.0);
    // 很暗的陰影（脖子、背光那側的臉）Hypic 會提亮兩三倍：附近亮度比例有下限 uFP[4].w（平滑的取大）
    sh = pow(pow(sh, 4.0) + pow(uFP[4].w, 4.0), 0.25);
    // 細節分兩層：中等大小的起伏（g2）和毛孔、鬍渣那種很細的紋理（uFP[6].w，跟小模糊圖比）
    vec3 bs = texture(uBlurS, uv).rgb;
    float Lbs = max(mix(luma(bs), (bs.r + bs.g + bs.b) / 3.0, uFP[5].z), 1e-3), detM = clamp(Lbs / Lbl, 1e-3, 3.0), hf = clamp(Lv / Lbs, 0.2, 3.0);
    // 皮膚：附近的明暗壓平（g）、細節留一部分（g2）；顏色往標準膚色拉（k），保留一點原本的顏色變化（ss）
    // 平光臉（uFS.w）本來就沒什麼明暗，三個都往 1 拉：每一點照原本的亮度按比例提亮，臉才不會變成一片面具
    vec3 gk = mix(vec3(uFP[0].y, uFP[0].z, uFP[1].w), vec3(1.0), uFS.w);
    float Lb0 = uFP[0].x * pow(uFS.z / 0.45, uFP[0].w) * pow(Lh / 0.65, uFP[5].w) * pow(sh, gk.x);
    vec3 C = vec3(uFP[1].x, 1.0, uFP[1].y); C /= luma(C);
    vec3 cs = uFCs, Ct = cs * pow(C / cs, vec3(uFP[1].z)); Ct /= luma(Ct);
    vec3 cp = clamp(Ct + gk.z * (col / max(L, 1e-3) - cs), 0.05, 3.0);
    // 另一種膚色：原本的顏色比例乘上暖色倍率（深膚色 Hypic 比較像這樣，不會被拉成同一個膚色），跟上面的混合
    vec3 cm = col / max(L, 1e-3) * vec3(uFP[6].x, 1.0, uFP[6].y); cm /= max(luma(cm), 1e-3);
    cp = mix(cp, clamp(cm, 0.05, 3.0), uFP[6].z);
    vec3 skin = Lb0 * pow(detM, gk.y) * pow(hf, mix(uFP[6].w, 1.0, uFS.w)) * cp;
    // 五官（眼睛、眉毛、嘴唇、牙齒）：跟皮膚一樣變亮，但暗的地方照原本的明暗（瞳孔、嘴巴裡還是黑的），亮的（眼白、牙齒）收一點不爆白；
    // 顏色大部分跟皮膚一樣往自然膚色拉，留一點原本的（嘴唇淡淡的粉紅，不會變橘紅）
    vec3 feat = Lb0 * (det > 1.0 ? pow(det, 0.7) : det) * clamp(mix(cp, col / max(L, 1e-3), 0.25), 0.05, 3.0);
    vec3 hair, bg, cl;
    if (uFlashF.y > 0.5) {
      // 相機閃光燈：頭髮、衣服、背景只照比例稍微變亮
      hair = col * uFP[2].x; bg = col * uFP[3].x + uFP[3].y; cl = col * uFP[4].x + uFP[4].y;
    } else {
      // 調整 › 閃光燈：頭髮變暗去色，背景、衣服往中間亮度收、去色
      hair = uFP[2].x * (L + uFP[2].y * ch);
      bg = vec3(uFP[3].x + uFP[3].y * L + uFP[3].z * uFS.y + uFP[3].w * Lh) + uFP[2].z * (ch - uFP[2].w * uFCast);
      cl = vec3(uFP[4].x + uFP[4].y * L) + uFP[4].z * ch;
    }
    // 鬍子（分類圖的 A，見 ai.js beardMap）：照亮度另算，Hypic 不會把鬍子跟皮膚一起提亮
    float wb = cls ? min(wsk, (1.0 - sg.a) * 255.0 / 127.0) : 0.0;
    vec3 beard = col * clamp((uFP[5].x + uFP[5].y * L) / max(L, 1e-3), 0.3, 4.0);
    wsk -= wb;
    float wo = clamp(1.0 - wsk - wb - wf - wh, 0.0, 1.0);
    vec3 F = (wsk * skin + wb * beard + wf * feat + wh * hair + wo * mix(bg, cl, ps)) / max(wsk + wb + wf + wh + wo, 1e-3);
    col = clamp(mix(col, clamp(F, 0.0, 1.0), uFlashF.x), 0.0, 1.0);
    if (uFlashF.w > 0.0) col = mix(col, cOld, uFlashF.w);
  }

  // 光影 › 相機閃光燈的 AI 模型（flashnet.js，我們自己練的）：調色表 uFGrid 是照片切 32×32 格 × 8 層引導值，
  // 每格 R、G、B 三列，每列一個 RGBA = 三個乘數＋一個加數（新顏色 = A × 舊顏色 + b）。
  // 引導值：這一點的 RGB、皮膚、頭髮、人、臉遮罩 R 過一層 8 個的小網路（uFG1、uFG2）；查表時位置、引導值都內插（三線性）。
  // 皮膚、頭髮從分類圖還原（見下面 uSeg 的說明）：頭髮 = 2G − 1、五官 = 1 − 2G，皮膚 = 挖掉五官的皮膚 B ＋ 五官（人像分割把牙齒也算皮膚）
  if (uFlashM > 0.0) {
    vec4 sg = texture(uSeg, uv);
    float hr = max(2.0 * sg.g - 1.0, 0.0), sk = min(sg.b + max(1.0 - 2.0 * sg.g, 0.0), 1.0);
    vec4 ga = vec4(col, sk), gb = vec4(hr, sg.r, texture(uMask, uv).r, 1.0);
    float z = uFG2[2].x;
    for (int j = 0; j < 8; j++) z += max(dot(uFG1[j], ga) + dot(uFG1[j + 8], gb), 0.0) * uFG2[j / 4][j % 4];
    z = 1.0 / (1.0 + exp(-z));
    // 格子座標照 PyTorch 的 grid_sample（align_corners）：第一個、最後一個像素對到第一格、最後一格的中心
    vec2 gi = (uv * uSize - 0.5) / max(uSize - 1.0, vec2(1.0)) * 31.0 + 0.5;
    vec3 t = vec3(gi.x / 32.0, gi.y / 96.0, (z * 7.0 + 0.5) / 8.0);
    vec4 a0 = texture(uFGrid, t), a1 = texture(uFGrid, t + vec3(0.0, 1.0 / 3.0, 0.0)), a2 = texture(uFGrid, t + vec3(0.0, 2.0 / 3.0, 0.0));
    vec3 m = clamp(vec3(dot(a0.rgb, col) + a0.a, dot(a1.rgb, col) + a1.a, dot(a2.rgb, col) + a2.a), 0.0, 1.0);
    // 很暗的背景、衣服（不是皮膚、頭髮）模型會壓得更黑又偏棕（評審 L73），Hypic 在那裡幾乎照原圖：
    // 換成原圖顏色等比例縮到模型的亮度（色相照原圖），亮度至少留原圖的 85%（Hypic 在很暗處平均留這麼多；拿 140 張訓練照、28 張驗收照跟 Hypic 比過）
    float L0 = dot(col, vec3(0.299, 0.587, 0.114)), wd = (1.0 - sk) * (1.0 - hr) * (1.0 - smoothstep(0.06, 0.12, L0));
    if (wd > 0.0) m = mix(m, clamp(col * (max(dot(m, vec3(0.299, 0.587, 0.114)), 0.85 * L0) / max(L0, 1e-3)), 0.0, 1.0), wd);
    col = clamp(mix(col, m, uFlashM), 0.0, 1.0);
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
    // 頭髮：分類圖（uSeg 的 G）有的時候才分得出來
    float hr = uLutHair > 0.5 ? max(2.0 * texture(uSeg, uv).g - 1.0, 0.0) : 0.0;
    if (hr > 0.0) lc = mix(lc, lut(col, 2.0), hr);
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
    vec2 d = (vUV - 0.5) * vec2(uOut.x / max(uOut.x, uOut.y), uOut.y / max(uOut.x, uOut.y)) * 2.0;
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
      // 中等、很糊兩份在同一張貼圖：各自的範圍裡取樣，邊上一格以外夾住（跟分開兩張貼圖時 CLAMP_TO_EDGE 一樣）
      vec2 cm = uBgM.xy, cf = uBgM.zw;
      vec3 Bs = texture(uBgImg, vUV).rgb, Bm = texture(uBgMF, clamp(vUV * cm, vec2(0.5), cm - 0.5) * uBgMT).rgb, Bf = texture(uBgMF, (vec2(cm.x, 0.0) + clamp(vUV * cf, vec2(0.5), cf - 0.5)) * uBgMT).rgb;
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

// 醒圖風格濾鏡的色表在 GPU 上烘（xt.js 的模型照搬，權重放在浮點貼圖 uW，一列一套：一般、皮膚、頭髮）。
// 以前在 CPU 每套算 26 萬次：第一次點濾鏡、有濾鏡時拖調色或強度，每次停 0.1～0.3 秒（評審 M10、M11）。
// uG：先調色（HSL、曲線、分色）的結果，只算了 uGN³ 個格點（filters.js bakeGrid），這裡內插到 64³，跟 CPU 烘的內插一樣；uGN = 0 是沒調色。
// uRow < 0：只有調色、沒有濾鏡。寫出去的值照 CPU 烘的方式取整（v×255＋0.5 再四捨五入到偶數，見 main 最後），跟以前的色表一樣
const FS_XTLUT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uW, uG;
uniform int uRow, uSp, uGN, uSide, uQ;
uniform ivec3 uGrid;
uniform float uAmt;
out vec4 o;
vec3 acc;
void add(int k, float v) { if (v != 0.0) acc += texelFetch(uW, ivec2(k, uRow), 0).rgb * v; }
void hat(int off, float z) { z = clamp(z, 0.0, 1.0) * 8.0; int i = min(int(floor(z)), 7); float f = z - float(i); add(off + i, 1.0 - f); add(off + i + 1, f); }
void cell(int hh, float hw, int li, float lw, int ci, float cf) { int q = 150 + (hh * uGrid.y + li) * uGrid.z + ci; add(q, hw * lw * (1.0 - cf)); add(q + 1, hw * lw * cf); }
vec3 xt(vec3 c) {
  float r = c.r, g = c.g, b = c.b;
  acc = vec3(0.0);
  hat(0, r); hat(9, g); hat(18, b);
  float L = 0.2126 * r + 0.7152 * g + 0.0722 * b, c0 = r - L, c1 = g - L, c2 = b - L, m = sqrt(c0 * c0 + c1 * c1 + c2 * c2);
  float y = sqrt(3.0) * (g - b), x = 2.0 * r - g - b;
  float a = x == 0.0 && y == 0.0 ? 0.0 : atan(y, x) / 6.283185307179586;  // 灰色：JS 的 atan2(0, 0) 是 0，GLSL 沒定義
  a -= floor(a);
  float t = a * 8.0, hf = fract(t);
  int h0 = int(floor(t)) % 8, h1 = (h0 + 1) % 8;
  for (int j = 0; j < 3; j++) {
    float tj = j == 0 ? clamp(1.0 - 2.0 * L, 0.0, 1.0) : j == 1 ? 1.0 - abs(2.0 * L - 1.0) : clamp(2.0 * L - 1.0, 0.0, 1.0);
    if (tj == 0.0) continue;
    int q = 27 + j * 32;
    float k = (1.0 - hf) * tj;
    add(q + h0, c0 * k); add(q + 8 + h0, c1 * k); add(q + 16 + h0, c2 * k); add(q + 24 + h0, m * k);
    k = hf * tj;
    add(q + h1, c0 * k); add(q + 8 + h1, c1 * k); add(q + 16 + h1, c2 * k); add(q + 24 + h1, m * k);
  }
  float z = clamp(L, 0.0, 1.0) * 8.0; int i = min(int(floor(z)), 7); float f = z - float(i);
  add(123 + i, c0 * (1.0 - f)); add(124 + i, c0 * f);
  add(132 + i, c1 * (1.0 - f)); add(133 + i, c1 * f);
  add(141 + i, c2 * (1.0 - f)); add(142 + i, c2 * f);
  if (uSp == 1) {
    float th = a * float(uGrid.x), gf = fract(th);
    int g0 = int(floor(th)) % uGrid.x, g1 = (g0 + 1) % uGrid.x;
    float zl = clamp(L, 0.0, 1.0) * float(uGrid.y - 1); int li = min(int(floor(zl)), uGrid.y - 2); float lf = zl - float(li);
    float zc = clamp(m / 0.5, 0.0, 1.0) * float(uGrid.z - 1); int ci = min(int(floor(zc)), uGrid.z - 2); float cf = zc - float(ci);
    cell(g0, 1.0 - gf, li, 1.0 - lf, ci, cf); cell(g0, 1.0 - gf, li + 1, lf, ci, cf);
    cell(g1, gf, li, 1.0 - lf, ci, cf); cell(g1, gf, li + 1, lf, ci, cf);
  }
  return clamp(acc, 0.0, 1.0);
}
vec3 gAt(int r, int g, int b) { return texelFetch(uG, ivec2(r, g + b * uGN), 0).rgb; }
vec3 grade(ivec3 q) {
  if (uGN == 64) return gAt(q.x, q.y, q.z);
  vec3 u = vec3(q) / 63.0 * float(uGN - 1);
  ivec3 a = min(ivec3(floor(u)), ivec3(uGN - 2));
  vec3 w = u - vec3(a);
  vec3 c0 = gAt(a.x, a.y, a.z), c1 = gAt(a.x, a.y + 1, a.z), c2 = gAt(a.x, a.y, a.z + 1), c3 = gAt(a.x, a.y + 1, a.z + 1);
  c0 += (gAt(a.x + 1, a.y, a.z) - c0) * w.x; c1 += (gAt(a.x + 1, a.y + 1, a.z) - c1) * w.x;
  c2 += (gAt(a.x + 1, a.y, a.z + 1) - c2) * w.x; c3 += (gAt(a.x + 1, a.y + 1, a.z + 1) - c3) * w.x;
  vec3 e0 = c0 + (c1 - c0) * w.y, e1 = c2 + (c3 - c2) * w.y;
  return e0 + (e1 - e0) * w.z;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) - ivec2(uSide * 512, 0);
  ivec3 q = ivec3(p.x % 64, p.y % 64, (p.y / 64) * 8 + p.x / 64);
  vec3 c = uGN > 0 ? grade(q) : vec3(q) / 63.0;
  vec3 v = c;
  if (uRow >= 0) { vec3 f = xt(c); v = uGN > 0 ? c + (f - c) * uAmt : f; }
  // v×255 有小數就進位（＋0.5 再四捨五入），剛好是整數才取偶數。不能先加 0.5：0.000…01 這種很小的數在 float 會被吃掉
  // uQ：格點已經取整好了（只有調色、64³，filters.js bakeGrid）
  vec3 w = v * 255.0, fl = floor(w), k = uQ == 1 ? floor(w + 0.5) : fl + mix(mod(fl, 2.0), vec3(1.0), vec3(greaterThan(w, fl)));
  o = vec4(clamp(k, 0.0, 255.0) / 255.0, 1.0);
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
    // 不要反鋸齒、深度、模板：只畫一張全螢幕三角形用不到，iPhone 上光反鋸齒就要多好幾倍的畫布記憶體
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('這個瀏覽器不支援 WebGL2');
    this.gl = gl; this.canvas = canvas;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pCopy = program(gl, FS_COPY); this.pDisp = program(gl, FS_DISP); this.fbPost = this.fbo(); this.pLiq = program(gl, FS_LIQ); this.lq = null;
    this.pBil = program(gl, FS_BILATERAL);
    this.pMain = program(gl, FS_MAIN);
    this.pGauss = program(gl, FS_GAUSS); this.pW = program(gl, FS_WCOPY); this.pBokeh = program(gl, FS_BOKEH); this.fbK = this.fbo(); this.bkKey = '';
    this.tImg = this.tOwn = this.tex(); this.tMask = this.tex(); this.tSeg = this.tex(); this.tLut = this.tex();
    this.tMask2 = this.tex(); this.tSegB = this.tex();
    this.blank(this.tMask, 0); this.blank(this.tSeg, 255); this.blank(this.tLut, 0);
    this.blank(this.tMask2, 0); this.blank(this.tSegB, 255);
    this.tOver = this.tex(); this.tEx = this.tex(); this.tBgImg = this.tex();
    this.blank(this.tOver, 0); this.blank(this.tEx, 255); this.blank(this.tBgImg, 255);
    this.fbBm = [this.fbo(), this.fbo()]; this.fbBf = [this.fbo(), this.fbo()]; this.fbBmf = this.fbo();
    // 相機閃光燈的調色表（3D 貼圖，見 setFlashGrid）；還沒有的時候放一格 0
    this.tFGrid = gl.createTexture(); this.setFlashGrid(null);
    this.fbA = this.fbo(); this.fbB = this.fbo();
    this.fbS = [this.fbo(), this.fbo()]; this.fbM = [this.fbo(), this.fbo()]; this.fbL = [this.fbo(), this.fbo()];
    this.fbGs = [this.fbo(), this.fbo()]; this.fbGb = [this.fbo(), this.fbo()]; this.glow = null;
    this.tMakeup = this.tex(); this.setMakeup(null);
    this.hasLut = false;
    this.view = 1;  // 預覽的解析度（相對原圖），見 render
    this.ext = 0;  // 畫面比照片多出來的列數（照片像素）：手動增高拉的時候照片跟著變高（app.js bmBake）
    this.fast = 1;  // 拖的時候先畫小一點：小圖的解析度（相對預覽），畫完再放大到畫布
    this.fbFast = this.fbo();
    // 推臉那一頁：主 shader 一律先畫到 fbPost，推的時候只重畫推到的那一塊（liqFrame）。mainFb：fbPost 裡現在是哪一次的結果
    this.keepPost = false; this.mainFb = null; this.canvasOk = false;
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
  // w、h：照片的原尺寸（src 可能是縮小的預覽，座標一律照原尺寸算）
  setImage(src, w = src.width, h = src.height) {
    const pre = this.pre; this.pre = null;
    this.w = w; this.h = h;
    if (pre?.src === src) { this.gl.deleteTexture(this.tOwn); this.tOwn = pre.t; }
    else { if (pre) this.gl.deleteTexture(pre.t); this.upload(this.tOwn, src); }
    this.tImg = this.tOwn; this.imgW = src.width; this.imgH = src.height;
    this.derive();
  }
  // 開照片（評審 L71）：1200 萬像素整張 texImage2D 一次傳，iPhone 要停 0.2～0.3 秒。先分幾段（每段約 200 萬像素）
  // 傳進另一張貼圖，段跟段之間讓轉圈走一格；接著 setImage 同一張就直接換上，不用再傳。src 傳完到 setImage 之間不能再改
  async preload(src) {
    const gl = this.gl, w = src.width, h = src.height, k = Math.max(1, Math.ceil(2e6 / w)), t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (let y = 0; y < h; y += k) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, w, Math.min(k, h - y), gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      if (y + k < h) await new Promise(r => setTimeout(r));
    }
    if (this.pre) gl.deleteTexture(this.pre.t);
    this.pre = { src, t };
  }
  // 頭髮、膚質要先改的照片（hair.js、skin.js 在同一個 WebGL 上改）：同一張只傳一次，srcVer 跟著內容變
  srcTex(src) {
    if (this.srcOf !== src) { this.tSrc ||= this.tex(); this.upload(this.tSrc, src); this.srcOf = src; this.srcVer = (this.srcVer || 0) + 1; }
    return this.tSrc;
  }
  // 照片只改了一塊（美顏筆、塗鴉）：只補那一塊
  patchSrc(img, x, y) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tSrc);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.srcVer++;
  }
  dropSrc() { if (this.tSrc) { this.gl.deleteTexture(this.tSrc); this.tSrc = this.srcOf = null; } }
  // 照片貼圖直接換成 t（頭髮、膚質改好的暫存貼圖，同一個 WebGL）：不用讀回、不用從別張畫布整張複製（評審：拖頭髮每格 82–89ms）。
  // iw、ih：t 的大小；w、h：照片的原尺寸
  useTex(t, iw, ih, w, h) {
    if (this.tImg === this.tOwn) this.blank(this.tOwn, 0);  // 自己那張先放掉（可能跟照片一樣大），換回 setImage 時再傳
    this.tImg = t; this.w = w; this.h = h; this.imgW = iw; this.imgH = ih;
    this.derive();
  }
  // 照片只改了一塊（美顏筆、塗鴉一筆、復原一筆）：只傳那一塊，不用整張重傳。貼圖現在不是原尺寸的照片（開著膚質、頭髮效果）就回傳 false
  patchImage(img, x, y) {
    if (this.tImg !== this.tOwn || this.imgW !== this.w || this.imgH !== this.h) return false;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tImg);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return true;
  }
  // 照片換了以後要重算的：磨皮用的模糊圖、背景模糊
  derive() {
    this.bkKey = '';
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
  // f：每次模糊的寬度是平常（約 1.64 格）的幾倍
  gauss(pair, n, f = 1) {
    const gl = this.gl, [a, b] = pair;
    for (let i = 0; i < n; i++) {
      this.pass(this.pGauss, b, b.w, b.h, a.t); gl.uniform2f(this.pGauss.u.uDir, f / a.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.pass(this.pGauss, a, a.w, a.h, b.t); gl.uniform2f(this.pGauss.u.uDir, 0, f / a.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  size(pair, short, W = this.w, H = this.h) {
    const k = Math.min(1, short / Math.min(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    pair.forEach(f => this.sizeFbo(f, w, h));
  }
  // 濾鏡的柔焦、光暈（xt/filters.json 的 glow，照醒圖擬合）：q = [柔焦模糊, 柔焦多少, 光暈模糊, 光暈門檻, 光暈 R, G, B]，
  // 模糊是照片短邊的 %；k 是濾鏡強度（0～1），柔焦、光暈跟著變淡。q 為 null 就關掉
  // gr：底片顆粒 [亮度, 彩色, p, q, N]（filters.json 的 grain，照醒圖擬合；評審 M48），也跟著強度變淡。
  // p、q 是顆粒跟亮度的曲線 L^p·(1−L)^q（沒給是 1、1：4L(1−L)）；N 是照片短邊幾格（顆粒粗細，見 GRAIN_N）
  // tx：紋理（filters.json 的 tex，評審 M52，見 TEX_GLSL），灰塵、漏光這些的不透明度也跟著強度變
  setGlow(q, k, gr, tx) { this.glow = (q || gr || tx) && k > 0 ? { q, k, gr, tx } : null; }
  // 紋理的 uniform：seed 種子；d 灰塵點 [密度（短邊平方幾顆）, 大小, 最亮, 亮度分布指數]；f 纖維 [密度, 長度, 最亮, 粗細]；
  // s 刮痕 [條數, 粗細, 最亮]；l 漏光 [[中心 x, y（照片 0～1）, 半徑 x, y（短邊）, R, G, B]…]（最多 3 團，濾色）；
  // h 網點 [週期（短邊）, 角度, 強度]；m 斑駁 [中心 x, y, 範圍半徑 x, y, R, G, B, 多少, 雲大小, 雲門檻, 小點大小, 小點門檻]
  texUni(u, G) {
    const gl = this.gl, T = G?.tx, k = G?.k || 0;
    gl.uniform1f(u.uTon, T ? 1 : 0);
    if (!T) return;
    const s = Math.min(this.w, this.h), E = [this.w / s, (this.h + this.ext) / s], pad = (a, n) => a.concat(Array(n).fill(0)).slice(0, n);
    gl.uniform4f(u.uTd, ...(T.d ? [T.d[0], T.d[1], T.d[2] * k, T.d[3]] : [0, 0, 0, 1]));
    gl.uniform4f(u.uTf, ...(T.f ? [T.f[0], T.f[1], T.f[2] * k, T.f[3]] : [0, 0, 0, 0]));
    // 刮痕：照種子固定的位置、斜一點，長 0.3～0.6 個短邊
    let r = (T.seed || 1) * 7919 % 233280;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280, sc = [];
    for (let i = 0; i < Math.min(4, T.s?.[0] || 0); i++) {
      const x = (0.15 + 0.7 * rnd()) * E[0], y = (0.15 + 0.7 * rnd()) * E[1], a = (rnd() - 0.5) * 1.2, L = 0.3 + 0.3 * rnd();
      sc.push(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L);
    }
    gl.uniform4f(u.uTx, T.seed || 1, sc.length / 4, T.s?.[1] || 0, (T.s?.[2] || 0) * k);
    gl.uniform4fv(u.uTs, pad(sc, 16));
    const L = (T.l || []).slice(0, 3);
    gl.uniform4fv(u.uTl, pad(L.flatMap(l => l.slice(0, 4)), 12));
    gl.uniform4fv(u.uTc, pad(L.flatMap(l => [l[4] * k, l[5] * k, l[6] * k, 1]), 12));
    gl.uniform4f(u.uTh, ...(T.h ? [T.h[0], T.h[1], T.h[2] * k, 0] : [1, 0, 0, 0]));
    const m = T.m;
    gl.uniform4f(u.uTm, ...(m ? m.slice(0, 4) : [0, 0, 1, 1]));
    gl.uniform4f(u.uTn, ...(m ? [m[4], m[5], m[6], m[7] * k] : [0, 0, 0, 0]));
    gl.uniform4f(u.uTo, ...(m ? m.slice(8, 12) : [1, 1, 1, 1]));
  }
  // 主 shader 的結果（fb）模糊兩份：fbGs 柔焦、fbGb 光暈。先一半一半縮小（每次 2×2 平均，小亮點不會閃爍），
  // 縮到模糊大約 2.3 格，再九點高斯兩次（一次約 1.64 格）；模糊 2～4.6 格的只縮一半、高斯一次（加寬一點補到一樣寬），
  // 更小的照原尺寸做。小圖做，每格多花不到兩次全圖複製
  // （評審 M50：以前 2～4.6 格的照原尺寸高斯五次，燭光晚餐這類開著每格 GPU 時間是平常的 5 倍）
  glowBufs(fb) {
    const gl = this.gl, s = Math.min(fb.w, fb.h), q = this.glow.q;
    this.fbH ||= [];
    const blur = (pair, sig) => {
      const px = sig / 100 * s, k = px >= 4.64 ? 2.32 / px : px >= 2 ? 0.5 : 1, r = px * k;
      const n = Math.max(1, Math.round((r / 1.64) ** 2)), f = r / 1.64 / Math.sqrt(n);
      const tw = Math.max(1, Math.round(fb.w * k)), th = Math.max(1, Math.round(fb.h * k));
      let src = fb, i = 0;
      while (src.w > tw * 2 && src.h > th * 2) {
        const h = this.fbH[i] ||= this.fbo();
        this.sizeFbo(h, Math.ceil(src.w / 2), Math.ceil(src.h / 2));
        this.pass(this.pCopy, h, h.w, h.h, src.t); gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = h; i++;
      }
      pair.forEach(f => this.sizeFbo(f, tw, th));
      this.pass(this.pCopy, pair[0], tw, th, src.t); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.gauss(pair, n, f);
    };
    blur(this.fbGs, q[0]); blur(this.fbGb, q[2]);
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
  // 美顏遮罩（ai.js skinMask）；它帶的閃光燈分類圖（cls）跟人像一起放進 uSeg
  // segNext：接著就要 setSeg（applyDetect）：分類圖換了先不重組人像遮罩，等 setSeg 一起做
  // （開新照片時以前先把上一張的人像遮罩配新的分類圖整張重傳一次，主執行緒多停 0.1 秒，接著又換掉）
  setMask(src, segNext) {
    src ? this.upload(this.tMask, src) : this.blank(this.tMask, 0);
    const c = src?.cls || null;
    if (c !== this.cls) { this.cls = c; if (segNext) this.segUp = false; else if (this.segSrc) this.upSeg(); }
  }
  // 換照片但人像遮罩沒變（塗鴉、美顏筆每畫一筆都會換一張照片）就不用重傳：原尺寸遮罩重組一次要好幾百毫秒
  setSeg(src) { src ||= null; if (src !== this.segSrc || !this.segUp) { this.segSrc = src; this.upSeg(); this.segUp = true; } this.blurs(); this.bkKey = ''; }
  // uSeg：R = 人像；有分類圖時 G、B、A 放分類圖的 G、B、A（頭髮和五官、皮膚、鬍子，見 ai.js）。
  // 主畫面的貼圖單元已經用滿 16 個（iPhone 的上限），所以分類圖不另外佔一個
  upSeg() {
    const s = this.segSrc;
    this.hasCls = false;
    if (!s) return this.blank(this.tSeg, 255);
    if (!this.cls) return this.upload(this.tSeg, s);
    // 最近兩份組好的留著：復原、重做跨過消除時人像遮罩換來換去，不用每次重讀、重組（評審 M51：一次要停一兩百毫秒）
    const hit = (this.segIm ||= []).find(e => e.s === s && e.cls === this.cls);
    if (hit) { this.upload(this.tSeg, hit.im); this.hasCls = true; return; }
    const w = s.width, h = s.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(s, 0, 0); const im = x.getImageData(0, 0, w, h), d = im.data;
    x.clearRect(0, 0, w, h); x.drawImage(this.cls, 0, 0, w, h); const k = x.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4) { d[i + 1] = k[i + 1]; d[i + 2] = k[i + 2]; d[i + 3] = k[i + 3]; }
    // A 放鬍子（不是透明度），直接傳 ImageData，不經過 canvas 的預乘
    this.upload(this.tSeg, im); this.hasCls = true;
    this.segIm.unshift({ s, cls: this.cls, im }); this.segIm.length = Math.min(2, this.segIm.length);
  }
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
    // 兩份照原樣（一格對一格）抄進同一張貼圖：中等的在左、很糊的接在右邊（主 shader 的 uBgMF）
    const m = this.fbBm[0], f = this.fbBf[0];
    this.sizeFbo(this.fbBmf, m.w + f.w, Math.max(m.h, f.h));
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbBmf.f);
    for (const [s, x] of [[m, 0], [f, m.w]]) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.f); gl.blitFramebuffer(0, 0, s.w, s.h, x, 0, x + s.w, s.h, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
  // 相機閃光燈的調色表（flashnet.js forward 的結果：寬 32、高 96、深 8，每格 RGBA）。半精度浮點，硬體做三線性內插
  setFlashGrid(d) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.tFGrid);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, d ? 32 : 1, d ? 96 : 1, d ? 8 : 1, 0, gl.RGBA, gl.FLOAT, d || new Float32Array(4));
    this.fGrid = d || null;
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
  // lut：{ c: 1536×512 畫布 } 或 { xt: [一般, 皮膚, 頭髮] 的權重（xt.js xtWeights）, grade, amt }（GPU 烘，見 bakeXt），再加 skin、hair。
  // 跟上一次是同一個就不重傳、不重烘（評審 L8：以前每一格都整張 3MB 重傳）
  setLut(lut) {
    this.hasLut = !!lut; this.lutSkin = !!lut?.skin; this.lutHair = !!lut?.hair;
    if (!lut || lut === this.lutNow) return;
    this.lutNow = lut;
    if (lut.c) this.upload(this.tLut, lut.c); else this.bakeXt(lut);
  }
  // 這台能不能在 GPU 上烘醒圖濾鏡（第一次問才編 shader）
  get canXt() {
    if (this.xtOk === undefined) {
      try { this.pXt = program(this.gl, FS_XTLUT); this.xtOk = true; } catch (e) { console.warn(e); this.xtOk = false; }
    }
    return this.xtOk;
  }
  // L.xt：三套權重（沒有濾鏡就是 [null]，只套調色）；L.grade：{ n, d, q } 調色格點（filters.js bakeGrid）；L.amt：濾鏡強度（有調色時混在色表裡）
  bakeXt(L) {
    if (!this.canXt) return;
    const gl = this.gl, P = this.pXt, u = P.u, ft = t => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); };
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (!this.tW) { this.tW = this.tex(); ft(this.tW); this.tG = this.tex(); ft(this.tG); this.fbX = gl.createFramebuffer(); }
    // 權重：每個特徵一格 RGBA32F（A 不用），一列一套
    if (this.xtFor !== L.xt && L.xt[0]) {
      const nw = Math.max(...L.xt.map(x => x?.nf || 0)), d = new Float32Array(nw * 3 * 4);
      L.xt.forEach((x, r) => { if (x) for (let k = 0; k < x.nf; k++) d.set(x.w.subarray(k * 3, k * 3 + 3), (r * nw + k) * 4); });
      gl.bindTexture(gl.TEXTURE_2D, this.tW);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nw, 3, 0, gl.RGBA, gl.FLOAT, d);
      this.xtFor = L.xt;
    }
    if (L.grade && this.gFor !== L.grade) {
      const n = L.grade.n;
      gl.bindTexture(gl.TEXTURE_2D, this.tG);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, n * n, 0, gl.RGBA, gl.FLOAT, L.grade.d);
      this.gFor = L.grade;
    }
    if (!this.lutBig) {
      gl.bindTexture(gl.TEXTURE_2D, this.tLut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1536, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.lutBig = true;
    }
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbX);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tLut, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tW); gl.uniform1i(u.uW, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tG); gl.uniform1i(u.uG, 1);
    gl.uniform1i(u.uGN, L.grade ? L.grade.n : 0); gl.uniform1i(u.uQ, L.grade?.q && !L.xt[0] ? 1 : 0); gl.uniform1f(u.uAmt, L.amt ?? 1);
    // 沒有皮膚、頭髮那套：主 shader 不會讀那一塊，不用畫
    L.xt.forEach((x, side) => {
      if (!x && side) return;
      gl.viewport(side * 512, 0, 512, 512);
      gl.uniform1i(u.uRow, x ? side : -1); gl.uniform1i(u.uSide, side); gl.uniform1i(u.uSp, x?.sp ? 1 : 0); gl.uniform3i(u.uGrid, ...(x?.grid || [0, 0, 0]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }

  // fx：{ lit: { lights: [{ pos, col, par }], ambS, ambB, bgDepth, haze, hazeCol }, flash: { amt, retro } }
  // full：畫原尺寸（存檔用）；平常只畫到螢幕看得到的解析度（this.view），手機才不會每動一下就算整張千萬像素
  // toFbo：畫到 fbOut（不畫到畫面），儲存用，readOut() 讀回。以前把畫面的 canvas 放大到原尺寸畫、畫完再縮回來，
  // 縮回來那下要停 0.4 秒以上（評審 L71：儲存凍 311＋224ms），畫面上的也不用動
  render(p, warps, fx = {}, full = false, toFbo = false) {
    const gl = this.gl, u = this.pMain.u;
    const s = full ? 1 : this.view, ho = this.h + this.ext, ow = Math.max(1, Math.round(this.w * s)), oh = Math.max(1, Math.round(ho * s));
    const out = toFbo ? (this.fbOut ||= this.fbo()) : null;
    if (out) this.sizeFbo(out, ow, oh);
    else if (this.canvas.width !== ow || this.canvas.height !== oh) { this.canvas.width = ow; this.canvas.height = oh; }
    if (fx.bokeh) this.bokeh(fx.bokeh);
    // 有臉型變形時先畫到暫存，最後再變形一次畫到畫面
    const lq = this.lq?.n ? this.lq : null, fast = !full && this.fast < 1, post = this.disp?.step > 0 || !!lq || fast || (this.keepPost && !full) || !!this.glow;
    const iw = fast ? Math.max(1, Math.round(ow * this.fast)) : ow, ih = fast ? Math.max(1, Math.round(oh * this.fast)) : oh, fb = fast ? this.fbFast : this.fbPost;
    if (post) this.sizeFbo(fb, iw, ih);
    this.pass(this.pMain, post ? fb : out, iw, ih);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const texs = [[this.tImg, 'uImg'], [this.tSmooth, 'uSmooth'], [this.tMask, 'uMask'], [this.tSeg, 'uSeg'], [this.tLut, 'uLut'], [this.tMask2, 'uMask2'], [this.tSegB, 'uSegB'],
      [this.fbS[0].t, 'uBlurS'], [this.fbM[0].t, 'uBgA'], [fx.bokeh ? this.fbK.t : this.fbL[0].t, 'uBgB'], [this.tOver, 'uOver'], [this.tEx, 'uEx'], [this.tBgImg, 'uBgImg'],
      [this.fbBmf.t, 'uBgMF'], [this.tMakeup, 'uMakeup']];
    texs.forEach(([t, name], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], i); });
    gl.activeTexture(gl.TEXTURE0 + texs.length); gl.bindTexture(gl.TEXTURE_3D, this.tFGrid); gl.uniform1i(u.uFGrid, texs.length);
    { const m = this.fbBm[0], f = this.fbBf[0], b = this.fbBmf; gl.uniform4f(u.uBgM, m.w, m.h, f.w, f.h); gl.uniform2f(u.uBgMT, 1 / (b.w || 1), 1 / (b.h || 1)); }
    gl.uniform2f(u.uSize, this.w, this.h); gl.uniform2f(u.uOut, this.w, ho);
    const n = Math.min(warps.length, MAX_WARPS), w1 = new Float32Array(MAX_WARPS * 4), w2 = new Float32Array(MAX_WARPS * 4), w3 = new Float32Array(MAX_WARPS * 2);
    for (let i = 0; i < n; i++) {
      const w = warps[i];
      if (w.type === 'stretch' || w.type === 'band') { w1.set([w.y0, w.y1, w.s, w.H], i * 4); w2.set([1, w.type === 'band' ? 4 : 3, w.Ho ?? w.H, 0], i * 4); continue; }
      if (w.type === 'seg') { w1.set([w.ax, w.ay, w.bx, w.by], i * 4); w2.set([w.r, 2, w.k, w.inner || 0], i * 4); w3.set([w.tc, w.ts], i * 2); continue; }
      if (w.type === 'slim') { w1.set([w.cx, w.cy, -Math.sin(w.a), Math.cos(w.a)], i * 4); w2.set([w.R, 5, w.k, w.Hh], i * 4); continue; }
      w1.set([w.cx, w.cy, w.dx || 0, w.dy || 0], i * 4);
      w2.set([w.r, w.type === 'scale' ? 1 : 0, w.s || 0, w.ey || 1], i * 4);
      w3.set([Math.cos(w.rot || 0), Math.sin(w.rot || 0)], i * 2);
    }
    gl.uniform1i(u.uWn, n); gl.uniform1i(u.uWm, Math.min(n, warps.manual || 0));
    gl.uniform4fv(u.uW1, w1); gl.uniform4fv(u.uW2, w2); gl.uniform2fv(u.uW3, w3);
    const L = fx.lit, ls = (L?.lights || []).slice(0, 8);
    const lp = new Float32Array(32), lr = new Float32Array(32), le = new Float32Array(32), ld = new Float32Array(32), lc = new Float32Array(24);
    ls.forEach((l, i) => { lp.set(l.pos, i * 4); lr.set(l.par, i * 4); le.set(l.ext || [36, 1, 0, 0], i * 4); ld.set(l.dir || [0, 0, 0, 0], i * 4); lc.set(l.col, i * 3); });
    gl.uniform1i(u.uLn, ls.length); gl.uniform4fv(u.uLPos, lp); gl.uniform4fv(u.uLPar, lr); gl.uniform4fv(u.uLExt, le); gl.uniform4fv(u.uLDir, ld); gl.uniform3fv(u.uLCol, lc);
    gl.uniform1f(u.uLAmbS, L?.ambS ?? 1); gl.uniform1f(u.uLAmbB, L?.ambB ?? 1); gl.uniform1f(u.uBgDepth, L?.bgDepth ?? 0); gl.uniform1f(u.uThick, L?.thick ?? 1e4); const ff = L?.flashF;
    gl.uniform4fv(u.uFlashF, ff ? [ff[0], ff[1], this.hasCls ? 1 : 0, ff[3] || 0] : [0, 0, 0, 0]); gl.uniform2fv(u.uFlashR, L?.flashR || [0, 0]);
    // 相機閃光燈 AI 模型：fx.lit.flashM 是跟原圖混合的比例，引導值網路的權重（flashM.g）沒換就不重傳
    const fm = L?.flashM && this.fGrid ? L.flashM : null;
    gl.uniform1f(u.uFlashM, fm ? fm.amt : 0);
    if (fm && this.fgFor !== fm.g) { gl.uniform4fv(u.uFG1, fm.g.g1); gl.uniform4fv(u.uFG2, fm.g.g2); this.fgFor = fm.g; }
    gl.uniform4fv(u.uFlashO, L?.flashO || [0, 0, 0, 0]); gl.uniform2fv(u.uFlashG, L?.flashG || [0, 1]); gl.uniform4fv(u.uFlashC, L?.flashC || [0, 0, 1, 1]); gl.uniform3fv(u.uFlashT, L?.flashT || [1, 1, 1]); gl.uniform4fv(u.uFlashX, L?.flashX || [0, 0, 0, 0]);
    if (ff) { gl.uniform4fv(u.uFP, L.flashP); gl.uniform4fv(u.uFS, L.flashS); gl.uniform3fv(u.uFCs, L.flashCs); gl.uniform3fv(u.uFCast, L.flashCast); }
     gl.uniform2fv(u.uLCap, L?.cap || [0, 0]);
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
    // 多張臉分開修（app.js 的 faceAmts）：[{ cx, cy, W, smooth, white, dark, fold, eyeb, teeth }]
    const fa = (p.faceAmts || []).slice(0, 5);
    gl.uniform1i(u.uNF, fa.length);
    if (fa.length) {
      const c = new Float32Array(20), a = new Float32Array(20), b = new Float32Array(10);
      fa.forEach((x, i) => { c.set([x.cx, x.cy, x.W, 0], i * 4); a.set([f(x.smooth), f(x.white), f(x.dark), f(x.fold)], i * 4); b.set([f(x.eyeb), f(x.teeth)], i * 2); });
      gl.uniform4fv(u.uFC, c); gl.uniform4fv(u.uFA, a); gl.uniform2fv(u.uFB, b);
    }
    gl.uniform1f(u.uHasLut, this.hasLut ? 1 : 0); gl.uniform1f(u.uLutSkin, this.lutSkin ? 1 : 0); gl.uniform1f(u.uLutHair, this.lutHair && this.hasCls ? 1 : 0);
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
    this.mainFb = post && !out ? { fb, ow, oh, fast: fast ? this.fast : 1 } : null;
    if (this.glow?.q) this.glowBufs(fb);
    if (post) this.postPass(p, fb, ow, oh, lq, null, out);
    this.canvasOk = post && !out;
  }
  // 臉型位移、推臉位移場照 fb（主 shader 的結果）取樣畫到畫面上。sc：只畫這一塊（視窗座標 [x, y, w, h]）
  postPass(p, fb, ow, oh, lq, sc, out = null) {
    const gl = this.gl, d = this.pDisp;
    this.pass(d, out, ow, oh, fb.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.disp?.step > 0 ? this.disp.tex : null); gl.uniform1i(d.u.uDisp, 1);
    gl.uniform2f(d.u.uSize, this.w, this.h); gl.uniform2f(d.u.uOut, this.w, this.h + this.ext); gl.uniform1f(d.u.uStep, this.disp?.step > 0 ? this.disp.step : 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, lq ? lq.A.t : null); gl.uniform1i(d.u.uLiq, 3);
    gl.uniform1f(d.u.uLiqStep, lq ? lq.step : 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tSegB); gl.uniform1i(d.u.uSegB, 2);
    gl.uniform1f(d.u.uProtect, p.bgProtect === 0 ? 0 : 1);
    const G = this.glow;
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.fbGs[0].t); gl.uniform1i(d.u.uGS, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.fbGb[0].t); gl.uniform1i(d.u.uGB, 5);
    const Q = G?.q;
    gl.uniform4f(d.u.uG1, Q ? Q[1] * G.k : 0, Q ? Q[3] : 1, Q ? 1 : 0, 0);
    gl.uniform4f(d.u.uG2, ...(Q ? Q.slice(4, 7).map(v => v * G.k) : [0, 0, 0]), 0);
    gl.uniform3f(d.u.uGr, G?.gr ? G.gr[0] * G.k : 0, G?.gr ? G.gr[1] * G.k : 0, G?.gr?.[4] || GRAIN_N);
    const gp = G?.gr?.[2] ?? 1, gq = G?.gr?.[3] ?? 1, gm = gp / (gp + gq);
    gl.uniform3f(d.u.uGs, gp, gq, 1 / (gm ** gp * (1 - gm) ** gq));
    this.texUni(d.u, G);
    if (sc) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...sc); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (sc) gl.disable(gl.SCISSOR_TEST);
    if (lq) lq.dirty = null;
  }
  // 推臉拖動中、這一格只多了幾下推臉（app.js 確定別的都沒改才叫）：主 shader 那整套美顏、調色、濾鏡的結果還在 fbPost，
  // 不用重畫（以前每一格都重畫，佔一格九成以上的時間，女友說推臉很卡），只把位移場改到的那一塊重新取樣到畫面上。
  // 畫不了（還沒有主 shader 的結果、預覽大小變了）回傳 false，app.js 就整張照常畫
  liqFrame(p) {
    const m = this.mainFb, lq = this.lq, ow = Math.max(1, Math.round(this.w * this.view)), oh = Math.max(1, Math.round((this.h + this.ext) * this.view));
    if (!m || !lq?.n || m.ow !== ow || m.oh !== oh || this.canvas.width !== ow || this.canvas.height !== oh || m.fast !== (this.fast < 1 ? this.fast : 1)) return false;
    const d = lq.dirty;
    if (!d) return true;
    let sc = null;
    if (this.canvasOk) {
      // 位移場一格是畫面上幾格；雙線性內插會用到旁邊一格，多留兩格
      const kx = ow / lq.fw, ky = oh / lq.fh, mg = Math.ceil(2 * Math.max(kx, ky)) + 2;
      const x0 = Math.max(0, Math.floor(d.x0 * kx) - mg), x1 = Math.min(ow, Math.ceil(d.x1 * kx) + mg);
      const r0 = Math.max(0, Math.floor(d.y0 * ky) - mg), r1 = Math.min(oh, Math.ceil(d.y1 * ky) + mg);
      if (x1 <= x0 || r1 <= r0) { lq.dirty = null; return true; }
      sc = [x0, oh - r1, x1 - x0, r1 - r0];  // 畫面的視窗座標從下面算起
    }
    this.postPass(p, m.fb, ow, oh, lq, sc);
    this.canvasOk = true;
    return true;
  }
  // 臉型位移圖：{ tex, step }，step = 0 表示沒有
  setDisp(d) { this.disp = d; }
  // 推臉的位移場：list 是 P.liq（每一下，座標除以照片長邊）。只在後面加的時候只算新加的；
  // 復原、換照片時從頭重算（每一下只畫筆刷附近那一塊，幾百下也很快）
  liqSync(list, W, H) {
    const gl = this.gl, M = Math.max(W, H);
    if (!list?.length) { if (this.lq) this.lq.n = 0; return; }
    const k = Math.min(1, 1536 / M), fw = Math.max(1, Math.round(W * k)), fh = Math.max(1, Math.round(H * k));
    let L = this.lq;
    if (!L) L = this.lq = { A: this.fbo(), B: this.fbo(), n: 0, last: null };
    const fresh = L.W !== W || L.H !== H || list.length < L.n || (L.n && list[L.n - 1] !== L.last);
    if (fresh || !L.n) {
      this.sizeFbo(L.A, fw, fh);
      Object.assign(L, { W, H, fw, fh, n: 0, step: M / 60000, dirty: { x0: 0, y0: 0, x1: fw, y1: fh } });
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.A.f); gl.viewport(0, 0, fw, fh);
      gl.clearColor(128 / 255, 128 / 255, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (L.n === list.length) return;
    const u = this.pLiq.u, s = fw / W, D = L.dirty ||= { x0: fw, y0: fh, x1: 0, y1: 0 };
    for (let i = L.n; i < list.length; i++) {
      const m = list[i], cx = m.cx * M, cy = m.cy * M, r = m.r * M;
      const x0 = Math.max(0, Math.floor((cx - r) * s) - 1), y0 = Math.max(0, Math.floor((cy - r) * s) - 1);
      const x1 = Math.min(fw, Math.ceil((cx + r) * s) + 1), y1 = Math.min(fh, Math.ceil((cy + r) * s) + 1);
      if (x1 <= x0 || y1 <= y0) continue;
      // 只畫筆刷那一塊：暫存 B 跟那一塊一樣大，不是整張位移場。
      // 以前 B 跟位移場一樣大（最大 1536×2048），iPhone 的 GPU 每推一下都要把整張讀進來再寫回去，一格推好幾下就很吃力
      const bw = x1 - x0, bh = y1 - y0;
      if (L.B.w < bw || L.B.h < bh) this.sizeFbo(L.B, Math.max(L.B.w, bw, 64), Math.max(L.B.h, bh, 64));
      this.pass(this.pLiq, L.B, bw, bh, L.A.t);
      gl.uniform2i(u.uOff, x0, y0);
      gl.uniform2f(u.uImg, W, H); gl.uniform1f(u.uStep, L.step); gl.uniform3f(u.uM, cx, cy, r); gl.uniform1i(u.uT, m.t);
      gl.uniform2f(u.uV, m.t === 0 ? m.a * M : m.a, m.t === 0 ? m.b * M : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 改好的那一塊抄回 A
      gl.bindTexture(gl.TEXTURE_2D, L.A.t);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x0, y0, 0, 0, bw, bh);
      D.x0 = Math.min(D.x0, x0); D.y0 = Math.min(D.y0, y0); D.x1 = Math.max(D.x1, x1); D.y1 = Math.max(D.y1, y1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    L.n = list.length; L.last = list[list.length - 1];
  }
  // 推臉位移場讀回 CPU：美顏筆、塗鴉把畫面上的點換回原圖座標用（app.js srcMapper）。同一組推臉只讀一次
  liqRead() {
    const L = this.lq;
    if (!L?.n) return null;
    if (L.cpu?.n !== L.n || L.cpu.last !== L.last) {
      const gl = this.gl, d = new Uint8Array(L.fw * L.fh * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.A.f); gl.readPixels(0, 0, L.fw, L.fh, gl.RGBA, gl.UNSIGNED_BYTE, d); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      L.cpu = { n: L.n, last: L.last, fw: L.fw, fh: L.fh, W: L.W, H: L.H, step: L.step, d };
    }
    return L.cpu;
  }
  // 看原圖：在同一張畫布上直接畫原圖（跟修好的圖一樣大小、一樣位置，放大時一樣清楚）。原圖貼圖放開就丟掉，不多佔記憶體
  drawOrig(src) {
    // 增高拉著（ext）：畫面比照片高，原圖畫在上面照片那麼高，下面留空
    const gl = this.gl, ow = Math.max(1, Math.round(this.w * this.view)), oh = Math.max(1, Math.round((this.h + this.ext) * this.view)), ph = Math.max(1, Math.round(this.h * this.view));
    if (this.canvas.width !== ow || this.canvas.height !== oh) { this.canvas.width = ow; this.canvas.height = oh; }
    if (!this.tOrig) this.tOrig = this.tex();
    if (this.origSrc !== src) { this.upload(this.tOrig, src); this.origSrc = src; }
    this.pass(this.pCopy, null, ow, oh, this.tOrig); this.canvasOk = false;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, oh - ph, ow, ph);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 存草稿的縮圖（評審 L9）：畫面在 GPU 上先一半一半縮（每次 2×2 平均），最後縮到長邊 max，只讀回這一小張（回傳 Promise）。
  // 以前把整張畫面畫到 2D 畫布再縮，iPhone 要把一千多萬位元組從 GPU 讀回主執行緒，存草稿那一下會頓
  // 等 GPU 把排好的畫完，不卡主執行緒：放一個柵欄，每 8ms 看一次（最多等 limit 毫秒）。
  // 儲存時原尺寸畫完馬上讀回，主執行緒要停到 GPU 畫完（評審 L71：儲存凍 311＋224ms）
  gpuDone(limit = 15000) {
    const gl = this.gl, sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0 = performance.now(); gl.flush();
    return new Promise(res => {
      const poll = () => {
        if (!gl.isContextLost() && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < limit) return setTimeout(poll, 8);
        gl.deleteSync(sync); res();
      };
      poll();
    });
  }
  // 讀回 render(…, toFbo) 畫好的那張：先讀進 GPU 上的緩衝區、放柵欄，畫完才拿回來，不卡主執行緒。
  // fbOut 照 FBO 的方向畫（第一列是照片最上面），不用翻；透明的地方是預乘過的，換回一般的（跟以前從畫面讀一樣）。
  // 拿回來、換回一般的分幾段做（每段約 200 萬像素），中間讓轉圈走一格：1200 萬像素一次做完 iPhone 要停 0.1 秒多（評審 #159）
  async readOut() {
    const gl = this.gl, f = this.fbOut, w = f.w, h = f.h, buf = gl.createBuffer(), n = w * h * 4;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.f);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, n, gl.STREAM_READ);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    await this.gpuDone();
    const d = new Uint8ClampedArray(n), step = Math.max(1, Math.ceil(2e6 / w)) * w * 4;
    try {
      for (let s = 0; s < n; s += step) {
        const e = Math.min(n, s + step);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, s, d, s, e - s); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        for (let i = s + 3; i < e; i += 4) {
          const a = d[i];
          if (a === 255) continue;
          if (a) { const k = 255 / a; d[i - 3] *= k; d[i - 2] *= k; d[i - 1] *= k; }
        }
        if (e < n) await new Promise(r => setTimeout(r));
      }
    } finally {
      gl.deleteBuffer(buf);
      // 原尺寸的暫存很大（1200 萬像素 48MB），讀完就放掉
      this.sizeFbo(f, 1, 1);
    }
    return new ImageData(d, w, h);
  }
  thumb(max) {
    const gl = this.gl, c = this.canvas, k = Math.min(1, max / Math.max(c.width, c.height));
    const tw = Math.max(1, Math.round(c.width * k)), th = Math.max(1, Math.round(c.height * k));
    this.fbT ||= [];
    let src = null, w = c.width, h = c.height, i = 0;
    const blit = (dst, nw, nh) => {
      this.sizeFbo(dst, nw, nh);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src ? src.f : null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.f);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, nw, nh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      src = dst; w = nw; h = nh;
    };
    while (w > tw * 2 && h > th * 2) blit(this.fbT[i++] ||= this.fbo(), Math.ceil(w / 2), Math.ceil(h / 2));
    blit(this.fbT[i] ||= this.fbo(), tw, th);
    const d = new Uint8Array(tw * th * 4), row = tw * 4;
    // 讀回來是下面那列在前：上下翻過來；透明的地方跟以前一樣當成黑底（存成 JPEG）
    const flip = () => {
      const out = new ImageData(tw, th);
      for (let y = 0; y < th; y++) out.data.set(d.subarray((th - 1 - y) * row, (th - y) * row), y * row);
      for (let j = 3; j < out.data.length; j += 4) out.data[j] = 255;
      return out;
    };
    // 不在這裡等 GPU：先讀進 GPU 上的緩衝區、放一個柵欄，畫完了才拿回來（評審 M51：直接讀要等整個畫面畫完，存草稿那下會停）
    const buf = gl.createBuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, src.f);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, d.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0 = performance.now(); gl.flush();
    return new Promise((res, rej) => {
      const poll = () => {
        if (gl.isContextLost()) return rej(new Error('GPU 斷了'));
        const st = gl.clientWaitSync(sync, 0, 0);
        if (st === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 3000) return setTimeout(poll, 8);
        gl.deleteSync(sync);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, d); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.deleteBuffer(buf);
        res(flip());
      };
      setTimeout(poll, 0);
    });
  }
  dropOrig() { if (this.tOrig) { this.gl.deleteTexture(this.tOrig); this.tOrig = null; this.origSrc = null; } }
}
