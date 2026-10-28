// 遮臉：分類和項目名稱照 Hypic「修飾 › 遮臉」（日常生活 13、酷炫 8、表情符號 3、可愛 4）。
//   Hypic 是在手機上找臉、把素材貼到臉上，支援多張臉，沒有滑桿。
//   這裡的圖案全部自己畫（SVG）；高斯模糊、模糊、敏感內容、馬賽克是把那張臉的位置模糊或打格子。
//   點一下會貼到每一張臉上，之後跟一般貼紙一樣可以拖曳、縮放、旋轉、刪除。
import { blurred } from './cblur.js';
const sv = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const TXT = 'font-family="-apple-system,PingFang TC,Noto Sans TC,Arial Black,sans-serif" font-weight="900" text-anchor="middle"';
// 蓋住整張臉的圖：100×120；蓋眼睛的：寬 300
const face = (id, cat, name, body) => ({ id, cat, name, at: 'cover', ar: 100 / 120, svg: sv(100, 120, body) });
const eyes = (id, cat, name, h, body) => ({ id, cat, name, at: 'eyes', ar: 300 / h, svg: sv(300, h, body) });
const pix = (id, cat, name, kind) => ({ id, cat, name, at: 'cover', pix: kind });
const OVAL = 'M50 4C78 4 96 28 96 62s-20 54-46 54S4 96 4 62 22 4 50 4z';
const scribble = (col, w) => `<path d="M14 30c20-14 56-18 74-6M10 48c26-16 64-20 82-4M12 66c24-14 62-18 78-2M14 84c24-12 58-14 74 0M22 100c18-8 42-10 58 0" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
// 來回亂塗的一筆（綠色塗鴉用；以前是幾條平行的弧線，綠色看起來像 Spotify 的標誌，評審 #145 小 K）
const zigzag = (col, w) => `<path d="M16 26C40 20 66 18 86 22C60 30 36 36 12 44C40 40 66 36 90 38C64 46 38 52 10 60C38 58 64 54 88 56C62 64 38 70 12 78C38 76 62 72 86 74C62 82 40 88 18 96C40 94 60 92 80 94" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pixHeart = () => {
  const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  return rows.flatMap((r, y) => [...r].map((c, x) => c === '1' ? `<rect x="${8 + x * 12}" y="${24 + y * 12}" width="12" height="12" fill="${(x + y) % 3 ? '#ff4d8d' : '#ff86b3'}"/>` : '')).join('');
};

export const COVER_CATS = [['daily', '日常生活'], ['cool', '酷炫'], ['emoji', '表情符號'], ['cute', '可愛']];
export const COVERS = [
  pix('cvGauss', 'daily', '高斯模糊', 'gauss'),
  pix('cvBlur', 'daily', '模糊', 'blur'),
  pix('cvSens', 'daily', '敏感內容', 'sensitive'),
  face('cvLoveMe', 'daily', '我愛老己', `<path d="${OVAL}" fill="#ffd6e4"/><path d="M50 50c-8-14-30-8-26 8 3 12 26 26 26 26s23-14 26-26c4-16-18-22-26-8z" fill="#ff4d7a"/><text x="50" y="108" ${TXT} font-size="15" fill="#d6245a">我愛老己</text>`),
  face('cvGreenDoodle', 'daily', '綠色塗鴉', zigzag('#39d353', 10)),
  // 黑線底下墊一層白邊：縮圖的深色底、深色照片上才看得到（評審 L53）
  face('cvHandDoodle', 'daily', '手繪塗鴉', scribble('#fff', 13) + '<path d="M18 22l66 80M82 22l-66 80" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none"/>' + scribble('#222', 9) + '<path d="M18 22l66 80M82 22l-66 80" stroke="#222" stroke-width="6" stroke-linecap="round" fill="none"/>'),
  face('cvSwirl', 'daily', '淡藍漩渦', `<path d="${OVAL}" fill="#d8f0ff"/><path d="M50 62c0-4 6-4 6 0 0 8-12 9-14 0-3-12 13-18 22-8 11 12 2 32-14 32-20 0-30-22-20-40 12-20 42-20 52 2" fill="none" stroke="#6ec3f5" stroke-width="7" stroke-linecap="round"/>`),
  face('cvBear', 'daily', '小熊臉', '<circle cx="20" cy="22" r="15" fill="#a86b3c"/><circle cx="80" cy="22" r="15" fill="#a86b3c"/><circle cx="20" cy="22" r="7" fill="#e7b48a"/><circle cx="80" cy="22" r="7" fill="#e7b48a"/><ellipse cx="50" cy="66" rx="44" ry="50" fill="#b97a47"/><ellipse cx="50" cy="82" rx="20" ry="15" fill="#efc9a3"/><ellipse cx="50" cy="75" rx="7" ry="5" fill="#3a2516"/><circle cx="33" cy="56" r="5" fill="#3a2516"/><circle cx="67" cy="56" r="5" fill="#3a2516"/><path d="M44 88c3 4 9 4 12 0" fill="none" stroke="#3a2516" stroke-width="3" stroke-linecap="round"/>'),
  face('cvKao', 'daily', '白色顏文字', `<path d="${OVAL}" fill="#fff" stroke="#ddd" stroke-width="2"/><text x="50" y="72" ${TXT} font-size="24" fill="#333">(・ω・)</text>`),
  eyes('cvBar', 'daily', '經典黑條', 70, '<rect x="0" y="8" width="300" height="54" fill="#000"/>'),
  pix('cvMosaic', 'daily', '馬賽克', 'mosaic'),
  eyes('cvBrowMask', 'daily', '挑眉面具', 130, '<path d="M8 40c30-34 100-30 132 14 6 8 14 8 20 0 32-44 102-48 132-14-6 46-38 76-80 74-34-2-50-24-62-40-12 16-28 38-62 40-42 2-74-28-80-74z" fill="#1d1d1f"/><path d="M8 40c30-34 100-30 132 14" fill="none" stroke="#d4af37" stroke-width="5"/><path d="M292 40c-30-34-100-30-132 14" fill="none" stroke="#d4af37" stroke-width="5"/><ellipse cx="80" cy="70" rx="30" ry="16" fill="#fff" opacity=".12"/><ellipse cx="220" cy="70" rx="30" ry="16" fill="#fff" opacity=".12"/><path d="M40 18l40-14M260 18l-40-14" stroke="#d4af37" stroke-width="6" stroke-linecap="round"/>'),
  face('cvGreenTape', 'daily', '綠色膠帶', '<g opacity=".95"><rect x="-10" y="48" width="130" height="26" fill="#3ccf6e" transform="rotate(-28 50 60)"/><rect x="-10" y="48" width="130" height="26" fill="#2fbf61" transform="rotate(28 50 60)"/></g>'),

  face('cvNeon', 'cool', '霓虹色光', `<defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2bd6"/><stop offset=".5" stop-color="#7a5cff"/><stop offset="1" stop-color="#00e5ff"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="3"/></filter></defs><path d="${OVAL}" fill="url(#ng)" opacity=".85"/><path d="${OVAL}" fill="none" stroke="#fff" stroke-width="3" filter="url(#gl)"/>`),
  face('cvJellyX', 'cool', 'X 軟糖', '<defs><linearGradient id="jx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ab6"/><stop offset=".5" stop-color="#ffd166"/><stop offset="1" stop-color="#6ee7ff"/></linearGradient></defs><path d="M14 18l36 30 36-30 10 12-30 30 30 30-10 12-36-30-36 30-10-12 30-30-30-30z" fill="url(#jx)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M22 24l20 16" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>'),
  face('cvMetal', 'cool', '輕金屬', `<defs><linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".35" stop-color="#9aa3ad"/><stop offset=".55" stop-color="#eef1f4"/><stop offset="1" stop-color="#6c7580"/></linearGradient></defs><path d="${OVAL}" fill="url(#mt)"/><path d="M26 30c10-12 30-16 40-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`),
  eyes('cvDiva', 'cool', 'DIVA', 110, `<path d="M10 20h280l-10 30c-6 30-40 46-74 40-28-5-40-24-46-40-6 16-18 35-46 40-34 6-68-10-74-40z" fill="#111"/><text x="150" y="70" ${TXT} font-size="44" fill="#ff3ea5" letter-spacing="6">DIVA</text>`),
  face('cvMatrix', 'cool', '駭客帝國', `<rect x="4" y="4" width="92" height="112" rx="10" fill="#031a06"/>` + Array.from({ length: 7 }, (_, i) => `<text x="${12 + i * 13}" y="${20 + (i * 17) % 30}" font-family="monospace" font-size="11" fill="#39ff6a" writing-mode="tb">${'01ｱｲｳ10ｴ1ｶ0'.slice(i % 4, i % 4 + 7)}</text>`).join('')),
  eyes('cvAttitude', 'cool', '有態度', 90, `<rect x="0" y="8" width="300" height="74" fill="#000"/><text x="150" y="62" ${TXT} font-size="40" fill="#fff">有態度</text>`),
  face('cvHud', 'cool', '電子介面', '<g fill="none" stroke="#00e5ff" stroke-width="4"><path d="M8 28V8h20M72 8h20v20M92 92v20H72M28 112H8V92"/><circle cx="50" cy="58" r="22" stroke-dasharray="6 5"/><path d="M50 26v12M50 78v12M18 58h12M70 58h12"/></g><text x="50" y="104" font-family="monospace" font-size="9" fill="#00e5ff" text-anchor="middle">FACE ID ✕</text><rect x="4" y="4" width="92" height="112" fill="#00e5ff" opacity=".08"/>'),
  face('cvFilm', 'cool', '相機底片', '<rect x="4" y="2" width="92" height="116" rx="4" fill="#1a1208"/>' + Array.from({ length: 9 }, (_, i) => `<rect x="9" y="${6 + i * 12.5}" width="7" height="7" rx="1.5" fill="#f2e6cc"/><rect x="84" y="${6 + i * 12.5}" width="7" height="7" rx="1.5" fill="#f2e6cc"/>`).join('') + '<rect x="22" y="12" width="56" height="96" fill="#c8732a" opacity=".85"/><text x="50" y="66" font-family="monospace" font-size="9" fill="#ffe2b0" text-anchor="middle">KODAK 400</text>'),

  face('cvHotdog', 'emoji', '搞怪熱狗', '<rect x="20" y="8" width="60" height="104" rx="30" fill="#e8a55a"/><rect x="30" y="4" width="40" height="112" rx="20" fill="#c94f3a"/><path d="M34 30c10 6 22-6 32 0M34 50c10 6 22-6 32 0M34 70c10 6 22-6 32 0" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="88" r="5" fill="#fff"/><circle cx="60" cy="88" r="5" fill="#fff"/><circle cx="41" cy="89" r="2.5" fill="#000"/><circle cx="59" cy="89" r="2.5" fill="#000"/><path d="M42 100c4 6 12 6 16 0" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>'),
  face('cvApple', 'emoji', '萌物蘋果', '<path d="M50 30c-14-14-46-8-44 26 2 36 28 60 44 52 16 8 42-16 44-52 2-34-30-40-44-26z" fill="#ff4b4b"/><path d="M50 30c0-10 4-18 10-24" stroke="#6b3b1a" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M56 16c10-10 24-8 26-2-10 8-20 8-26 2z" fill="#4cc75a"/><circle cx="36" cy="64" r="6" fill="#222"/><circle cx="64" cy="64" r="6" fill="#222"/><circle cx="38" cy="62" r="2" fill="#fff"/><circle cx="66" cy="62" r="2" fill="#fff"/><ellipse cx="28" cy="78" rx="7" ry="4" fill="#ff9aa8"/><ellipse cx="72" cy="78" rx="7" ry="4" fill="#ff9aa8"/><path d="M44 80c3 4 9 4 12 0" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/>'),
  face('cvCool', 'emoji', '潮流墨鏡', '<circle cx="50" cy="62" r="46" fill="#ffcc33"/><path d="M8 50h84v6c-2 14-14 20-26 18-10-2-12-10-14-16h-4c-2 6-4 14-14 16-12 2-24-4-26-18z" fill="#111"/><path d="M20 54l10-2M60 54l10-2" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/><path d="M34 84c8 8 24 8 32 0" fill="none" stroke="#7a4a00" stroke-width="4" stroke-linecap="round"/>'),

  eyes('cvFluffy', 'cute', '毛絨眼罩', 120, '<path d="M14 54c0-30 40-42 70-34 30 8 46 26 66 26s36-18 66-26c30-8 70 4 70 34 0 34-36 56-70 52-30-4-46-26-66-26s-36 22-66 26c-34 4-70-18-70-52z" fill="#ffc6dd" stroke="#fff" stroke-width="8" stroke-dasharray="2 6" stroke-linecap="round"/><path d="M60 64c10 8 30 8 40 0M200 64c10 8 30 8 40 0" fill="none" stroke="#7a3b55" stroke-width="5" stroke-linecap="round"/>'),
  face('cvRound', 'cute', '軟萌圓臉', '<circle cx="50" cy="62" r="46" fill="#ffe3ec"/><ellipse cx="26" cy="74" rx="9" ry="6" fill="#ff9ab8"/><ellipse cx="74" cy="74" rx="9" ry="6" fill="#ff9ab8"/><path d="M30 56c4-6 10-6 14 0M56 56c4-6 10-6 14 0" fill="none" stroke="#4a2a3a" stroke-width="4" stroke-linecap="round"/><path d="M44 80c2 4 10 4 12 0" fill="none" stroke="#4a2a3a" stroke-width="3" stroke-linecap="round"/>'),
  face('cvPixHeart', 'cute', '像素愛心', pixHeart()),
  face('cvSilverTape', 'cute', '銀色膠帶', '<defs><linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9edf1"/><stop offset=".5" stop-color="#b7bfc8"/><stop offset="1" stop-color="#dfe4e9"/></linearGradient></defs><rect x="-10" y="34" width="120" height="24" fill="url(#st)" transform="rotate(-12 50 46)"/><rect x="-10" y="64" width="120" height="24" fill="url(#st)" transform="rotate(10 50 76)"/>'),
];
export const coverById = id => COVERS.find(c => c.id === id);

// 模糊、馬賽克那幾種：把臉那一塊剪下來處理，邊緣是羽化的橢圓。回傳 canvas（寬：高 = 100：120）
export function coverPixels(src, kind, cx, cy, w, rot) {
  const h = w * 1.2, s = Math.min(1, 480 / w), cw = Math.round(w * s), ch = Math.round(h * s);
  const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
  const c = crop.getContext('2d');
  c.translate(cw / 2, ch / 2); c.rotate(-rot); c.scale(s, s);
  c.drawImage(src, -cx, -cy);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  const o = out.getContext('2d');
  if (kind === 'mosaic') {
    // 格子大小約臉寬的 1/9
    const n = 9, t = document.createElement('canvas'); t.width = n; t.height = Math.round(n * 1.2);
    t.getContext('2d').drawImage(crop, 0, 0, t.width, t.height);
    o.imageSmoothingEnabled = false; o.drawImage(t, 0, 0, cw, ch);
  } else {
    const bl = blurred(crop, Math.round(cw * (kind === 'gauss' ? 0.06 : 0.1)));
    o.drawImage(bl, 0, 0); o.drawImage(bl, 0, 0);
    if (kind === 'blur') { // 模糊：再加一層雜訊，比高斯模糊更看不出來
      const img = o.getImageData(0, 0, cw, ch), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 40; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      o.putImageData(img, 0, 0);
    }
    if (kind === 'sensitive') {
      o.fillStyle = 'rgba(0,0,0,.35)'; o.fillRect(0, 0, cw, ch);
      o.fillStyle = '#fff'; o.textAlign = 'center'; o.font = `900 ${Math.round(cw * 0.13)}px -apple-system,"PingFang TC","Noto Sans TC",sans-serif`;
      o.fillText('敏感內容', cw / 2, ch * 0.55);
    }
  }
  // 羽化的橢圓：外面透明
  o.globalCompositeOperation = 'destination-in';
  const g = o.createRadialGradient(cw / 2, ch / 2, cw * 0.3, cw / 2, ch / 2, cw * 0.5);
  g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.save(); o.translate(cw / 2, ch / 2); o.scale(1, 1.2); o.translate(-cw / 2, -ch / 2);
  o.fillStyle = g; o.fillRect(0, -ch, cw, ch * 3); o.restore();
  return out;
}
