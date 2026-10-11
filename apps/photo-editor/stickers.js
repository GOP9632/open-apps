// 貼紙：全部自己畫的 SVG，加上系統內建的 emoji（不用別家的素材）
// face：臉部貼紙放在哪裡（頭頂、眼睛、兩頰、鼻子），按下去會自動貼到每一張臉
export const STICKERS = [
  { id: 'cat', name: '貓耳', face: 'top', ar: 2.2, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100">
    <path d="M18 96 L38 8 L92 70 Z" fill="#2b2b2b" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M40 80 L46 34 L76 68 Z" fill="#ff9fb8"/>
    <path d="M202 96 L182 8 L128 70 Z" fill="#2b2b2b" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M180 80 L174 34 L144 68 Z" fill="#ff9fb8"/></svg>` },
  { id: 'bunny', name: '兔耳', face: 'top', ar: 1.5, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100">
    <ellipse cx="45" cy="50" rx="17" ry="48" transform="rotate(-12 45 50)" fill="#fff" stroke="#ddd" stroke-width="3"/>
    <ellipse cx="45" cy="54" rx="8" ry="34" transform="rotate(-12 45 54)" fill="#ffb3c7"/>
    <ellipse cx="105" cy="50" rx="17" ry="48" transform="rotate(12 105 50)" fill="#fff" stroke="#ddd" stroke-width="3"/>
    <ellipse cx="105" cy="54" rx="8" ry="34" transform="rotate(12 105 54)" fill="#ffb3c7"/></svg>` },
  { id: 'crown', name: '皇冠', face: 'crown', ar: 1.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <path d="M10 90 L18 24 L52 58 L80 10 L108 58 L142 24 L150 90 Z" fill="#ffd43b" stroke="#e8a800" stroke-width="5" stroke-linejoin="round"/>
    <rect x="10" y="80" width="140" height="14" rx="4" fill="#fab005"/>
    <circle cx="80" cy="56" r="9" fill="#ff5c8a"/><circle cx="40" cy="70" r="6" fill="#4dabf7"/><circle cx="120" cy="70" r="6" fill="#4dabf7"/>
    <circle cx="18" cy="22" r="7" fill="#fff3bf"/><circle cx="80" cy="9" r="7" fill="#fff3bf"/><circle cx="142" cy="22" r="7" fill="#fff3bf"/></svg>` },
  { id: 'shades', name: '墨鏡', face: 'eyes', ar: 2.8, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100">
    <path d="M8 22 H272" stroke="#111" stroke-width="10" stroke-linecap="round"/>
    <path d="M20 22 H124 Q126 86 74 88 Q22 86 20 22 Z" fill="#1d1d1f" stroke="#111" stroke-width="6"/>
    <path d="M156 22 H260 Q258 86 206 88 Q154 86 156 22 Z" fill="#1d1d1f" stroke="#111" stroke-width="6"/>
    <path d="M40 34 L70 34 L46 60 Z" fill="#fff" opacity=".35"/><path d="M176 34 L206 34 L182 60 Z" fill="#fff" opacity=".35"/></svg>` },
  { id: 'heartglass', name: '愛心眼鏡', face: 'eyes', ar: 2.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100">
    <path d="M118 40 Q130 30 142 40" stroke="#ff2e6a" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M70 92 C20 60 6 40 14 24 C24 4 56 6 70 28 C84 6 116 4 126 24 C134 40 120 60 70 92 Z" fill="#ff5c8a" stroke="#ff2e6a" stroke-width="5"/>
    <path d="M190 92 C140 60 126 40 134 24 C144 4 176 6 190 28 C204 6 236 4 246 24 C254 40 240 60 190 92 Z" fill="#ff5c8a" stroke="#ff2e6a" stroke-width="5"/>
    <ellipse cx="44" cy="30" rx="12" ry="7" fill="#fff" opacity=".45"/><ellipse cx="164" cy="30" rx="12" ry="7" fill="#fff" opacity=".45"/></svg>` },
  { id: 'blush', name: '腮紅', face: 'cheeks', ar: 1.4, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100">
    <defs><radialGradient id="g"><stop offset="0" stop-color="#ff6b8b" stop-opacity=".75"/><stop offset="1" stop-color="#ff6b8b" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="70" cy="50" rx="68" ry="46" fill="url(#g)"/>
    <path d="M40 44 L52 60 M62 40 L74 56 M84 44 L96 60" stroke="#ff3d6e" stroke-width="5" stroke-linecap="round" opacity=".7"/></svg>` },
  { id: 'dognose', name: '狗鼻子', face: 'nose', ar: 1.3, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 100">
    <path d="M65 90 C30 90 8 64 12 38 C16 14 44 8 65 12 C86 8 114 14 118 38 C122 64 100 90 65 90 Z" fill="#2b1d16"/>
    <ellipse cx="45" cy="34" rx="16" ry="9" fill="#fff" opacity=".35"/>
    <ellipse cx="44" cy="56" rx="10" ry="7" fill="#000"/><ellipse cx="86" cy="56" rx="10" ry="7" fill="#000"/></svg>` },
  { id: 'heart', name: '愛心', ar: 1.1, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 100">
    <path d="M55 94 C14 66 2 44 6 26 C12 4 42 0 55 24 C68 0 98 4 104 26 C108 44 96 66 55 94 Z" fill="#ff4d7e" stroke="#e6194f" stroke-width="5"/>
    <ellipse cx="32" cy="28" rx="12" ry="8" fill="#fff" opacity=".5" transform="rotate(-25 32 28)"/></svg>` },
  { id: 'sparkle', name: '閃光', ar: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50 4 C54 38 62 46 96 50 C62 54 54 62 50 96 C46 62 38 54 4 50 C38 46 46 38 50 4 Z" fill="#fff6c2" stroke="#ffd43b" stroke-width="4"/>
    <path d="M82 8 C83 16 85 18 92 19 C85 20 83 22 82 30 C81 22 79 20 72 19 C79 18 81 16 82 8 Z" fill="#fff"/></svg>` },
  { id: 'cloud', name: '雲朵', ar: 1.6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <path d="M36 88 C14 88 4 72 10 58 C14 46 28 42 36 46 C38 24 58 12 78 18 C92 8 118 12 124 34 C144 32 158 48 152 66 C148 80 136 88 120 88 Z" fill="#fff" stroke="#d0ebff" stroke-width="5"/>
    <circle cx="62" cy="60" r="5" fill="#495057"/><circle cx="98" cy="60" r="5" fill="#495057"/>
    <path d="M72 70 Q80 78 88 70" stroke="#495057" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="52" cy="70" rx="8" ry="5" fill="#ffc9d6"/><ellipse cx="108" cy="70" rx="8" ry="5" fill="#ffc9d6"/></svg>` },
  { id: 'bow', name: '蝴蝶結', ar: 1.7, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 100">
    <path d="M85 50 L14 10 Q2 50 14 90 Z" fill="#ff8fab" stroke="#e64980" stroke-width="5" stroke-linejoin="round"/>
    <path d="M85 50 L156 10 Q168 50 156 90 Z" fill="#ff8fab" stroke="#e64980" stroke-width="5" stroke-linejoin="round"/>
    <rect x="70" y="34" width="30" height="32" rx="10" fill="#f06595" stroke="#e64980" stroke-width="5"/></svg>` },
];
export const EMOJIS = ['❤️', '💖', '✨', '⭐', '🌸', '🎀', '🔥', '💯', '😎', '🥰', '😂', '🥺', '🐱', '🐶', '🍓', '🌈', '☁️', '👑', '🎉', '💋'];

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
export const stickerById = id => STICKERS.find(s => s.id === id);

const imgCache = new Map();
export function stickerImage(id) {
  if (!imgCache.has(id)) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stickerById(id).svg);
    imgCache.set(id, img.decode().then(() => img));
  }
  return imgCache.get(id);
}
