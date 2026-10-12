// 貼紙：全部自己畫的 SVG，加上系統內建的 emoji（不用別家的素材）
// face：臉部貼紙放在哪裡（頭頂、眼睛、兩頰、鼻子），按下去會自動貼到每一張臉
// cat：貼紙庫的分類（照醒圖貼圖中心的分類方式，內容全部自己畫）
export const STICKERS = [
  { id: 'cat', cat: 'face', name: '貓耳', face: 'top', ar: 2.2, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100">
    <path d="M18 96 L38 8 L92 70 Z" fill="#2b2b2b" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M40 80 L46 34 L76 68 Z" fill="#ff9fb8"/>
    <path d="M202 96 L182 8 L128 70 Z" fill="#2b2b2b" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M180 80 L174 34 L144 68 Z" fill="#ff9fb8"/></svg>` },
  { id: 'bunny', cat: 'face', name: '兔耳', face: 'top', ar: 1.5, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100">
    <ellipse cx="45" cy="50" rx="17" ry="48" transform="rotate(-12 45 50)" fill="#fff" stroke="#ddd" stroke-width="3"/>
    <ellipse cx="45" cy="54" rx="8" ry="34" transform="rotate(-12 45 54)" fill="#ffb3c7"/>
    <ellipse cx="105" cy="50" rx="17" ry="48" transform="rotate(12 105 50)" fill="#fff" stroke="#ddd" stroke-width="3"/>
    <ellipse cx="105" cy="54" rx="8" ry="34" transform="rotate(12 105 54)" fill="#ffb3c7"/></svg>` },
  { id: 'crown', cat: 'face', name: '皇冠', face: 'crown', ar: 1.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <path d="M10 90 L18 24 L52 58 L80 10 L108 58 L142 24 L150 90 Z" fill="#ffd43b" stroke="#e8a800" stroke-width="5" stroke-linejoin="round"/>
    <rect x="10" y="80" width="140" height="14" rx="4" fill="#fab005"/>
    <circle cx="80" cy="56" r="9" fill="#ff5c8a"/><circle cx="40" cy="70" r="6" fill="#4dabf7"/><circle cx="120" cy="70" r="6" fill="#4dabf7"/>
    <circle cx="18" cy="22" r="7" fill="#fff3bf"/><circle cx="80" cy="9" r="7" fill="#fff3bf"/><circle cx="142" cy="22" r="7" fill="#fff3bf"/></svg>` },
  { id: 'shades', cat: 'face', name: '墨鏡', face: 'eyes', ar: 2.8, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100">
    <path d="M8 22 H272" stroke="#111" stroke-width="10" stroke-linecap="round"/>
    <path d="M20 22 H124 Q126 86 74 88 Q22 86 20 22 Z" fill="#1d1d1f" stroke="#111" stroke-width="6"/>
    <path d="M156 22 H260 Q258 86 206 88 Q154 86 156 22 Z" fill="#1d1d1f" stroke="#111" stroke-width="6"/>
    <path d="M40 34 L70 34 L46 60 Z" fill="#fff" opacity=".35"/><path d="M176 34 L206 34 L182 60 Z" fill="#fff" opacity=".35"/></svg>` },
  { id: 'heartglass', cat: 'face', name: '愛心眼鏡', face: 'eyes', ar: 2.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100">
    <path d="M118 40 Q130 30 142 40" stroke="#ff2e6a" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M70 92 C20 60 6 40 14 24 C24 4 56 6 70 28 C84 6 116 4 126 24 C134 40 120 60 70 92 Z" fill="#ff5c8a" stroke="#ff2e6a" stroke-width="5"/>
    <path d="M190 92 C140 60 126 40 134 24 C144 4 176 6 190 28 C204 6 236 4 246 24 C254 40 240 60 190 92 Z" fill="#ff5c8a" stroke="#ff2e6a" stroke-width="5"/>
    <ellipse cx="44" cy="30" rx="12" ry="7" fill="#fff" opacity=".45"/><ellipse cx="164" cy="30" rx="12" ry="7" fill="#fff" opacity=".45"/></svg>` },
  { id: 'blush', cat: 'face', name: '腮紅', face: 'cheeks', ar: 1.4, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100">
    <defs><radialGradient id="blushg"><stop offset="0" stop-color="#ff6b8b" stop-opacity=".75"/><stop offset="1" stop-color="#ff6b8b" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="70" cy="50" rx="68" ry="46" fill="url(#blushg)"/>
    <path d="M40 44 L52 60 M62 40 L74 56 M84 44 L96 60" stroke="#ff3d6e" stroke-width="5" stroke-linecap="round" opacity=".7"/></svg>` },
  { id: 'dognose', cat: 'face', name: '狗鼻子', face: 'nose', ar: 1.3, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 100">
    <path d="M65 90 C30 90 8 64 12 38 C16 14 44 8 65 12 C86 8 114 14 118 38 C122 64 100 90 65 90 Z" fill="#2b1d16"/>
    <ellipse cx="45" cy="34" rx="16" ry="9" fill="#fff" opacity=".35"/>
    <ellipse cx="44" cy="56" rx="10" ry="7" fill="#000"/><ellipse cx="86" cy="56" rx="10" ry="7" fill="#000"/></svg>` },
  { id: 'heart', cat: 'cute', name: '愛心', ar: 1.1, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 100">
    <path d="M55 94 C14 66 2 44 6 26 C12 4 42 0 55 24 C68 0 98 4 104 26 C108 44 96 66 55 94 Z" fill="#ff4d7e" stroke="#e6194f" stroke-width="5"/>
    <ellipse cx="32" cy="28" rx="12" ry="8" fill="#fff" opacity=".5" transform="rotate(-25 32 28)"/></svg>` },
  { id: 'sparkle', cat: 'cute', name: '閃光', ar: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50 4 C54 38 62 46 96 50 C62 54 54 62 50 96 C46 62 38 54 4 50 C38 46 46 38 50 4 Z" fill="#fff6c2" stroke="#ffd43b" stroke-width="4"/>
    <path d="M82 8 C83 16 85 18 92 19 C85 20 83 22 82 30 C81 22 79 20 72 19 C79 18 81 16 82 8 Z" fill="#fff"/></svg>` },
  { id: 'cloud', cat: 'cute', name: '雲朵', ar: 1.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <path d="M36 88 C14 88 4 72 10 58 C14 46 28 42 36 46 C38 24 58 12 78 18 C92 8 118 12 124 34 C144 32 158 48 152 66 C148 80 136 88 120 88 Z" fill="#fff" stroke="#d0ebff" stroke-width="5"/>
    <circle cx="62" cy="60" r="5" fill="#495057"/><circle cx="98" cy="60" r="5" fill="#495057"/>
    <path d="M72 70 Q80 78 88 70" stroke="#495057" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="52" cy="70" rx="8" ry="5" fill="#ffc9d6"/><ellipse cx="108" cy="70" rx="8" ry="5" fill="#ffc9d6"/></svg>` },
  { id: 'bow', cat: 'cute', name: '蝴蝶結', ar: 1.7, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 100">
    <path d="M85 50 L14 10 Q2 50 14 90 Z" fill="#ff8fab" stroke="#e64980" stroke-width="5" stroke-linejoin="round"/>
    <path d="M85 50 L156 10 Q168 50 156 90 Z" fill="#ff8fab" stroke="#e64980" stroke-width="5" stroke-linejoin="round"/>
    <rect x="70" y="34" width="30" height="32" rx="10" fill="#f06595" stroke="#e64980" stroke-width="5"/></svg>` },
];
// ---------- 貼紙庫：第二批，全部自己畫 ----------
const sv = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const TXT = 'font-family="-apple-system,PingFang TC,Noto Sans TC,Arial Black,sans-serif" font-weight="900" text-anchor="middle"';
const label = (id, name, text, w, fill, edge, col = '#fff', fs = 54, rot = -6) => ({ id, cat: 'label', name, ar: w / 100, svg: sv(w, 100,
  `<g transform="rotate(${rot} ${w / 2} 50)"><rect x="8" y="16" width="${w - 16}" height="68" rx="34" fill="${fill}" stroke="${edge}" stroke-width="6"/>
  <text x="${w / 2}" y="${50 + fs * 0.36}" font-size="${fs}" fill="${col}" ${TXT}>${text}</text></g>`) });
const star5 = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI / 5 * i - Math.PI / 2, d = i % 2 ? r : R;
  return `${(cx + Math.cos(a) * d).toFixed(1)},${(cy + Math.sin(a) * d).toFixed(1)}`;
}).join(' ');
const petals = (cx, cy, n, R, rx, ry, fill) => Array.from({ length: n }, (_, i) =>
  `<ellipse cx="${cx}" cy="${cy - R}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${360 / n * i} ${cx} ${cy})"/>`).join('');

STICKERS.push(
  // 可愛
  { id: 'star', cat: 'cute', name: '星星', ar: 1, svg: sv(100, 100, `<polygon points="${star5(50, 53, 46, 20)}" fill="#ffd43b" stroke="#f59f00" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="40" cy="55" r="4" fill="#5c3d00"/><circle cx="60" cy="55" r="4" fill="#5c3d00"/><path d="M44 64 Q50 70 56 64" stroke="#5c3d00" stroke-width="3.5" fill="none" stroke-linecap="round"/>`) },
  { id: 'flower', cat: 'cute', name: '小花', ar: 1, svg: sv(100, 100, `${petals(50, 50, 6, 24, 17, 22, '#ffa8c5')}<circle cx="50" cy="50" r="16" fill="#ffe066" stroke="#fab005" stroke-width="4"/>`) },
  { id: 'daisy', cat: 'cute', name: '雛菊', ar: 1, svg: sv(100, 100, `${petals(50, 50, 12, 26, 8, 20, '#fff')}<circle cx="50" cy="50" r="15" fill="#fcc419"/>`) },
  { id: 'paw', cat: 'cute', name: '肉球', ar: 1, svg: sv(100, 100, `<ellipse cx="50" cy="66" rx="24" ry="20" fill="#ff8fab"/>
    <ellipse cx="22" cy="42" rx="10" ry="13" fill="#ff8fab"/><ellipse cx="40" cy="26" rx="10" ry="13" fill="#ff8fab"/><ellipse cx="60" cy="26" rx="10" ry="13" fill="#ff8fab"/><ellipse cx="78" cy="42" rx="10" ry="13" fill="#ff8fab"/>`) },
  { id: 'cherry', cat: 'cute', name: '櫻桃', ar: 1, svg: sv(100, 100, `<path d="M30 70 Q40 30 66 10 M70 66 Q66 36 66 10" stroke="#2f9e44" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M66 10 Q84 6 90 20 Q76 24 66 10 Z" fill="#51cf66"/><circle cx="30" cy="72" r="20" fill="#e03131"/><circle cx="70" cy="68" r="20" fill="#f03e3e"/>
    <ellipse cx="23" cy="65" rx="6" ry="4" fill="#fff" opacity=".6"/><ellipse cx="63" cy="61" rx="6" ry="4" fill="#fff" opacity=".6"/>`) },
  { id: 'ghost', cat: 'cute', name: '小幽靈', ar: 0.85, svg: sv(85, 100, `<path d="M8 92 V44 C8 18 26 6 42 6 C58 6 77 18 77 44 V92 L64 82 L52 94 L42 82 L32 94 L20 82 Z" fill="#fff" stroke="#ced4da" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="30" cy="44" rx="5" ry="7" fill="#212529"/><ellipse cx="55" cy="44" rx="5" ry="7" fill="#212529"/><ellipse cx="24" cy="58" rx="6" ry="4" fill="#ffc9d6"/><ellipse cx="61" cy="58" rx="6" ry="4" fill="#ffc9d6"/>`) },
  { id: 'bear', cat: 'cute', name: '小熊', ar: 1.1, svg: sv(110, 100, `<circle cx="24" cy="24" r="16" fill="#a9744f"/><circle cx="86" cy="24" r="16" fill="#a9744f"/><circle cx="24" cy="24" r="8" fill="#e0a77d"/><circle cx="86" cy="24" r="8" fill="#e0a77d"/>
    <ellipse cx="55" cy="58" rx="42" ry="38" fill="#a9744f"/><ellipse cx="55" cy="70" rx="18" ry="13" fill="#e0a77d"/><circle cx="40" cy="52" r="5" fill="#2b1d16"/><circle cx="70" cy="52" r="5" fill="#2b1d16"/><ellipse cx="55" cy="64" rx="6" ry="4" fill="#2b1d16"/>`) },
  { id: 'hearts3', cat: 'cute', name: '愛心串', ar: 1.4, svg: sv(140, 100, `
    <path d="M30 70 C10 56 4 44 8 34 C12 24 26 22 30 34 C34 22 48 24 52 34 C56 44 50 56 30 70 Z" fill="#ff8fab" transform="rotate(-15 30 46)"/>
    <path d="M70 86 C40 64 30 46 36 32 C42 18 62 16 70 34 C78 16 98 18 104 32 C110 46 100 64 70 86 Z" fill="#ff4d7e"/>
    <path d="M114 50 C100 40 96 32 99 25 C102 18 111 17 114 25 C117 17 126 18 129 25 C132 32 128 40 114 50 Z" fill="#ffc9d6" transform="rotate(15 114 34)"/>`) },
  // 裝飾
  { id: 'sparkles', cat: 'deco', name: '閃閃', ar: 1, svg: sv(100, 100, `<path d="M38 10 C41 34 46 39 70 42 C46 45 41 50 38 74 C35 50 30 45 6 42 C30 39 35 34 38 10 Z" fill="#fff"/>
    <path d="M76 52 C78 66 80 68 94 70 C80 72 78 74 76 88 C74 74 72 72 58 70 C72 68 74 66 76 52 Z" fill="#fff3bf"/><circle cx="80" cy="20" r="5" fill="#fff"/>`) },
  { id: 'music', cat: 'deco', name: '音符', ar: 1, svg: sv(100, 100, `<path d="M36 76 V22 L84 12 V64" stroke="#212529" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="M36 22 L84 12 V26 L36 36 Z" fill="#212529"/>
    <ellipse cx="26" cy="78" rx="13" ry="10" fill="#212529" transform="rotate(-20 26 78)"/><ellipse cx="74" cy="66" rx="13" ry="10" fill="#212529" transform="rotate(-20 74 66)"/>`) },
  { id: 'bolt', cat: 'deco', name: '閃電', ar: 0.7, svg: sv(70, 100, `<path d="M42 4 L8 58 H32 L24 96 L62 38 H38 Z" fill="#ffe066" stroke="#f59f00" stroke-width="5" stroke-linejoin="round"/>`) },
  { id: 'flame', cat: 'deco', name: '火焰', ar: 0.8, svg: sv(80, 100, `<path d="M40 96 C14 96 4 76 8 58 C12 40 26 34 26 14 C40 24 44 34 44 44 C50 38 52 30 52 22 C68 36 76 54 72 72 C68 88 56 96 40 96 Z" fill="#ff6b3d"/>
    <path d="M40 94 C26 94 20 84 22 74 C24 64 32 60 34 50 C42 58 46 64 46 70 C50 66 52 62 52 58 C60 66 62 76 58 84 C55 90 48 94 40 94 Z" fill="#ffd43b"/>`) },
  { id: 'arrow', cat: 'deco', name: '箭頭', ar: 1.6, svg: sv(160, 100, `<path d="M10 70 C40 30 90 26 130 44" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M108 24 L138 46 L106 62" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`) },
  { id: 'circle', cat: 'deco', name: '圈起來', ar: 1.4, svg: sv(140, 100, `<path d="M96 14 C60 4 14 16 10 46 C6 76 50 92 88 88 C124 84 136 60 126 38 C118 22 96 12 70 12" stroke="#ff3b5c" stroke-width="6" fill="none" stroke-linecap="round"/>`) },
  { id: 'scribble', cat: 'deco', name: '底線', ar: 3, svg: sv(300, 100, `<path d="M14 54 C60 40 120 38 180 44 C220 48 260 46 288 40 M30 70 C90 60 170 58 270 62" stroke="#ffe066" stroke-width="10" fill="none" stroke-linecap="round"/>`) },
  { id: 'banner', cat: 'deco', name: '緞帶', ar: 2.6, svg: sv(260, 100, `<path d="M4 34 H44 L30 56 L44 78 H4 Z" fill="#c2255c"/><path d="M256 34 H216 L230 56 L216 78 H256 Z" fill="#c2255c"/>
    <path d="M30 22 H230 V70 H30 Z" fill="#f06595"/><path d="M30 70 L44 78 V70 Z M230 70 L216 78 V70 Z" fill="#a61e4d"/>`) },
  { id: 'tape', cat: 'deco', name: '紙膠帶', ar: 3, svg: sv(300, 100, `<path d="M10 28 L18 36 L10 44 L18 52 L10 60 L18 68 L10 76 H290 L282 68 L290 60 L282 52 L290 44 L282 36 L290 28 Z" fill="#a5d8ff" opacity=".85"/>
    <g fill="#fff" opacity=".7"><circle cx="60" cy="52" r="8"/><circle cx="120" cy="52" r="8"/><circle cx="180" cy="52" r="8"/><circle cx="240" cy="52" r="8"/></g>`) },
  { id: 'frame', cat: 'deco', name: '方框', ar: 1, svg: sv(100, 100, `<path d="M6 30 V6 H30 M70 6 H94 V30 M94 70 V94 H70 M30 94 H6 V70" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`) },
  // 天氣
  { id: 'sun', cat: 'weather', name: '太陽', ar: 1, svg: sv(100, 100, `<g stroke="#fab005" stroke-width="7" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => `<path d="M50 8 V20" transform="rotate(${i * 45} 50 50)"/>`).join('')}</g>
    <circle cx="50" cy="50" r="24" fill="#ffd43b"/><path d="M40 52 Q50 62 60 52" stroke="#e8590c" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="41" cy="45" r="3" fill="#e8590c"/><circle cx="59" cy="45" r="3" fill="#e8590c"/>`) },
  { id: 'moon', cat: 'weather', name: '月亮', ar: 1, svg: sv(100, 100, `<path d="M66 8 C40 12 24 36 28 60 C32 82 56 96 80 88 C60 84 46 66 48 46 C50 28 58 16 66 8 Z" fill="#fff3bf" stroke="#ffd43b" stroke-width="4"/>
    <polygon points="${star5(80, 30, 9, 4)}" fill="#fff"/>`) },
  { id: 'snow', cat: 'weather', name: '雪花', ar: 1, svg: sv(100, 100, `<g stroke="#e7f5ff" stroke-width="6" stroke-linecap="round" fill="none">${Array.from({ length: 6 }, (_, i) => `<path d="M50 50 V8 M50 22 L40 14 M50 22 L60 14" transform="rotate(${i * 60} 50 50)"/>`).join('')}</g>`) },
  { id: 'rain', cat: 'weather', name: '下雨', ar: 1.2, svg: sv(120, 100, `<path d="M30 60 C14 60 8 48 12 40 C16 32 26 30 32 32 C34 16 50 8 64 12 C74 6 92 10 96 26 C110 26 118 38 112 50 C108 58 100 60 92 60 Z" fill="#dee2e6"/>
    <g stroke="#4dabf7" stroke-width="6" stroke-linecap="round"><path d="M36 72 L30 88"/><path d="M62 72 L56 88"/><path d="M88 72 L82 88"/></g>`) },
  { id: 'rainbow', cat: 'weather', name: '彩虹', ar: 1.8, svg: sv(180, 100, `<g fill="none" stroke-width="12">
    <path d="M18 94 A72 72 0 0 1 162 94" stroke="#ff6b6b"/><path d="M30 94 A60 60 0 0 1 150 94" stroke="#ffa94d"/><path d="M42 94 A48 48 0 0 1 138 94" stroke="#ffe066"/><path d="M54 94 A36 36 0 0 1 126 94" stroke="#69db7c"/><path d="M66 94 A24 24 0 0 1 114 94" stroke="#74c0fc"/></g>`) },
  // 食物
  { id: 'boba', cat: 'food', name: '珍奶', ar: 0.7, svg: sv(70, 100, `<path d="M42 4 L36 30" stroke="#ff8fab" stroke-width="6" stroke-linecap="round"/><path d="M8 28 H62 L54 94 H16 Z" fill="#e9c9a4" stroke="#8d6346" stroke-width="4" stroke-linejoin="round"/>
    <rect x="4" y="24" width="62" height="8" rx="4" fill="#fff" stroke="#8d6346" stroke-width="3"/><g fill="#3b2516"><circle cx="24" cy="84" r="5"/><circle cx="36" cy="86" r="5"/><circle cx="47" cy="83" r="5"/><circle cx="30" cy="76" r="5"/><circle cx="42" cy="75" r="5"/></g>`) },
  { id: 'icecream', cat: 'food', name: '冰淇淋', ar: 0.7, svg: sv(70, 100, `<path d="M14 46 L35 96 L56 46 Z" fill="#f4b97b" stroke="#c9844a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="35" cy="32" r="22" fill="#ffc9d6"/><circle cx="22" cy="44" r="12" fill="#ffc9d6"/><circle cx="48" cy="44" r="12" fill="#ffc9d6"/><circle cx="35" cy="10" r="6" fill="#e03131"/>`) },
  { id: 'donut', cat: 'food', name: '甜甜圈', ar: 1, svg: sv(100, 100, `<defs><mask id="hole"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="50" r="13" fill="#000"/></mask></defs>
    <g mask="url(#hole)"><circle cx="50" cy="50" r="44" fill="#e0a76b"/><path d="M10 46 C12 20 34 8 50 8 C70 8 90 22 90 46 C86 54 80 50 74 56 C66 62 60 54 52 60 C44 66 36 56 28 60 C20 64 14 56 10 46 Z" fill="#f783ac"/></g>
    <g stroke-width="4" stroke-linecap="round"><path d="M30 26 l6 3" stroke="#fff"/><path d="M62 22 l5 -4" stroke="#ffe066"/><path d="M74 36 l6 2" stroke="#74c0fc"/><path d="M22 40 l4 -5" stroke="#69db7c"/></g>`) },
  { id: 'strawberry', cat: 'food', name: '草莓', ar: 0.9, svg: sv(90, 100, `<path d="M45 96 C20 86 6 60 8 42 C10 28 26 24 45 28 C64 24 80 28 82 42 C84 60 70 86 45 96 Z" fill="#fa5252"/>
    <path d="M22 26 L32 12 L45 22 L58 12 L68 26 Q45 36 22 26 Z" fill="#51cf66"/><g fill="#ffe066">${[[28, 46], [45, 44], [62, 46], [36, 60], [54, 60], [45, 76], [30, 72], [60, 72]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.5" ry="4"/>`).join('')}</g>`) },
  { id: 'cake', cat: 'food', name: '蛋糕', ar: 1, svg: sv(100, 100, `<path d="M10 52 L90 36 V86 H10 Z" fill="#fff4e6" stroke="#e8590c" stroke-width="3"/><path d="M10 52 L90 36 V50 L10 66 Z" fill="#ffc9d6"/><path d="M10 72 H90" stroke="#ffa8c5" stroke-width="6"/>
    <circle cx="70" cy="34" r="9" fill="#e03131"/><path d="M70 25 Q74 18 78 20" stroke="#2f9e44" stroke-width="3" fill="none"/>`) },
  // 文字標籤
  label('omg', 'OMG', 'OMG', 200, '#ff5c8a', '#fff'),
  label('love', 'LOVE', 'LOVE', 220, '#fff', '#ff5c8a', '#ff5c8a'),
  label('cute', 'CUTE', 'CUTE', 210, '#ffe066', '#212529', '#212529'),
  label('wow', 'WOW', 'WOW', 200, '#4dabf7', '#fff'),
  label('haha', '哈哈', '哈哈哈', 230, '#fff', '#212529', '#212529', 50, 4),
  label('yum', '好吃', '好好吃', 230, '#ff922b', '#fff', '#fff', 50),
  label('like', '讚', '讚啦！', 210, '#7048e8', '#fff', '#fff', 50, 5),
  label('today', '今日份', '今日份可愛', 300, '#fff', '#ff8fab', '#ff5c8a', 48, -4),
  { id: 'bubble', cat: 'label', name: '對話框', ar: 1.4, svg: sv(140, 100, `<path d="M20 8 H120 Q134 8 134 22 V60 Q134 74 120 74 H58 L34 94 L38 74 H20 Q6 74 6 60 V22 Q6 8 20 8 Z" fill="#fff" stroke="#212529" stroke-width="5" stroke-linejoin="round"/>
    <g fill="#212529"><circle cx="46" cy="41" r="6"/><circle cx="70" cy="41" r="6"/><circle cx="94" cy="41" r="6"/></g>`) },
  { id: 'think', cat: 'label', name: '想法', ar: 1.4, svg: sv(140, 100, `<path d="M36 64 C18 64 10 52 14 42 C10 28 24 18 38 22 C44 8 64 4 76 14 C88 4 110 8 114 24 C130 26 136 42 128 52 C130 64 116 72 104 66 C96 76 76 76 68 68 C58 74 44 72 36 64 Z" fill="#fff" stroke="#adb5bd" stroke-width="4"/>
    <circle cx="30" cy="80" r="7" fill="#fff" stroke="#adb5bd" stroke-width="3"/><circle cx="16" cy="92" r="4" fill="#fff" stroke="#adb5bd" stroke-width="3"/>`) },
);
// 貼紙庫的分類，順序就是面板上的順序
export const STICKER_CATS = [['face', '臉部'], ['cute', '可愛'], ['label', '標籤'], ['deco', '裝飾'], ['weather', '天氣'], ['food', '美食'], ['emoji', '表情'], ['mine', '我的']];

export const EMOJIS = ['❤️', '💖', '✨', '⭐', '🌸', '🎀', '🔥', '💯', '😎', '🥰', '😂', '🥺', '🐱', '🐶', '🍓', '🌈', '☁️', '👑', '🎉', '💋'];

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
export const stickerById = id => STICKERS.find(s => s.id === id);

// 混合模式：照 Hypic 貼紙的 10 種，名稱和順序照 Hypic
// [id, 名稱, canvas 的 globalCompositeOperation, CSS 的 mix-blend-mode]
export const BLENDS = [
  ['normal', '正常', 'source-over', 'normal'],
  ['multiply', '疊加', 'multiply', 'multiply'],
  ['screen', '濾色', 'screen', 'screen'],
  ['overlay', '覆疊', 'overlay', 'overlay'],
  ['soft', '柔光', 'soft-light', 'soft-light'],
  ['darken', '暗化', 'darken', 'darken'],
  ['lighten', '亮化', 'lighten', 'lighten'],
  ['burn', '色彩加深', 'color-burn', 'color-burn'],
  ['dodge', '線性柔和', 'lighter', 'plus-lighter'],
  ['diff', '差別', 'difference', 'difference'],
];
export const blendById = id => BLENDS.find(b => b[0] === id) || BLENDS[0];

// 自己匯入的圖片和擦除遮罩都放在這裡，貼紙只記 id，復原紀錄才不會塞滿大字串
// 遮罩每擦一筆就換一個新 id，舊的復原紀錄還指得到舊遮罩
const store = new Map();
let seq = 0;
export function putCanvas(c, kind) {
  const id = `${kind}${++seq}`;
  store.set(id, { c, url: null });
  return id;
}
export const getCanvas = id => store.get(id)?.c;
export function canvasURL(id) {
  const e = store.get(id);
  if (!e) return '';
  e.url ||= e.c.toDataURL();
  return e.url;
}
export const touchCanvas = id => { const e = store.get(id); if (e) e.url = null; };
export const ownImages = () => [...store.keys()].filter(k => k.startsWith('img'));

// 貼紙的寬高比
export function stickerAR(s) {
  if (s.kind === 'svg') return stickerById(s.v).ar;
  if (s.kind === 'img') { const c = getCanvas(s.v); return c ? c.width / c.height : 1; }
  return 1;
}
// 貼紙在畫面上顯示用的圖片網址
export const svgURL = id => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stickerById(id).svg);
export function stickerURL(s) {
  return s.kind === 'svg' ? svgURL(s.v) : s.kind === 'img' ? canvasURL(s.v) : '';
}

const imgCache = new Map();
export function stickerImage(id) {
  if (!imgCache.has(id)) {
    const img = new Image();
    img.src = svgURL(id);
    imgCache.set(id, img.decode().then(() => img));
  }
  return imgCache.get(id);
}

// 存檔用：把一張貼紙畫成 w × h 的 canvas（還沒翻轉、旋轉），有擦除遮罩就套上去
export async function renderSticker(s, w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (s.kind === 'emoji') {
    ctx.font = `${c.width * 0.82}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.v, c.width / 2, c.height / 2);
  } else {
    const src = s.kind === 'svg' ? await stickerImage(s.v) : getCanvas(s.v);
    if (src) ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  const m = s.mask && getCanvas(s.mask);
  if (m) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0, c.width, c.height); }
  return c;
}
