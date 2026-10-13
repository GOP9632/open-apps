'use strict';
// 美食收藏：單頁 app。沒填雲端設定時資料存在這台裝置；填了 Supabase 就能多人登入、建群組、一起滑卡。

// ---------- 常數 ----------
// [名稱, emoji, 主色]
const CATS = {
  restaurant: ['餐廳', '🍴', '#ff7a45'], cafe: ['咖啡廳', '☕', '#a9744f'], bakery: ['麵包店', '🥐', '#e8a33d'], dessert: ['甜點', '🍰', '#f06595'],
  snack: ['小吃', '🥟', '#f59f00'], brunch: ['早午餐', '🥞', '#fab005'], bar: ['酒吧', '🍸', '#7950f2'], drink: ['飲料', '🧋', '#20c997'], other: ['其他', '📍', '#868e96'],
};
const MEALS = { breakfast: '早餐', lunch: '午餐', tea: '下午茶', dinner: '晚餐', night: '宵夜' };
const PRICES = { 1: '$200 內', 2: '$200–500', 3: '$500–1000', 4: '$1000 以上' };
const CITIES = ['台北', '新北', '基隆', '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '馬祖'];
const CITY_RE = /(台北|臺北|新北|基隆|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[市縣]?/;
// 地圖：OpenFreeMap 的向量圖資（免費、不用 key），淺色用 positron、深色用 dark
const MAP_STYLE = () => `https://tiles.openfreemap.org/styles/${matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'positron'}`;
const TAIPEI = [121.5436, 25.0418];
const AV_COLORS = ['#ff7a45', '#f06595', '#7950f2', '#228be6', '#12b886', '#fab005', '#e8590c', '#be4bdb'];
const GROUP_GRADS = ['linear-gradient(135deg,#ff8a3d,#ff3d6e)', 'linear-gradient(135deg,#7950f2,#f06595)', 'linear-gradient(135deg,#12b886,#228be6)', 'linear-gradient(135deg,#fab005,#ff6b6b)', 'linear-gradient(135deg,#4c6ef5,#15aabf)', 'linear-gradient(135deg,#e64980,#fd7e14)'];
const GROUP_EMO = ['🍜', '🍣', '🍕', '🥘', '🍰', '🧋', '🍔', '🥟'];

const PROMPT = `你是美食收藏助理。從使用者給的社群貼文、網頁文字或截圖，找出裡面介紹的「實體店家」（餐廳、咖啡廳、麵包店、甜點店、小吃、酒吧、飲料店等）。
只回 JSON：{"places":[{"name":"店名（不含分店）","branch":"分店名，沒有就空字串","address":"完整地址，沒寫就空字串","city":"縣市，用簡短寫法：台北、新北、桃園、台中、台南、高雄、新竹…；國外寫城市名；不知道就空字串","district":"行政區，例如大安區；不知道就空字串","category":"cafe|restaurant|bakery|dessert|snack|brunch|bar|drink|other 選一個","cuisine":"料理類型，例如日式拉麵、義式、韓式烤肉，可空白","price":每人預算 1(200元以下) 2(200-500) 3(500-1000) 4(1000以上)，看不出來填 null,"meals":["適合時段，從 breakfast lunch tea dinner night 選，可多選"],"hours":"營業時間原文，沒有就空字串","note":"一句話重點，例如招牌菜、特色","tags":["最多 4 個短標籤，例如 不限時、有插座、寵物友善、要訂位"]}]}
規則：
- 一篇貼文介紹多間店就列多間；完全沒有店家就回 {"places":[]}。
- 店名從 📍、🏠、店名：、@帳號、地點標記等線索判斷，不要把 hashtag 或網紅名字當店名。
- 地址照原文，臺改成台。
- 只用文字裡有的資訊，不要自己編地址。`;

// ---------- 圖示（線條風格，同 Lucide） ----------
const ICONS = {
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  map: 'M14.1 5.55a2 2 0 0 0 1.8 0l3.65-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.8 0L9.9 18.45a2 2 0 0 0-1.8 0l-3.65 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9L8.1 3.45a2 2 0 0 1 1.8 0z M15 5.76v15 M9 3.24v15',
  plus: 'M5 12h14 M12 5v14',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16z M21 21l-4.3-4.3',
  x: 'M18 6 6 18 M6 6l12 12',
  nav: 'M3 11l19-9-9 19-2-8-8-2z',
  locate: 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14z',
  edit: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  ext: 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  check: 'M20 6 9 17l-5-5',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4z M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21',
  clip: 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  spark: 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 7a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z M12 6v6l4 2',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  down: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  up: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  copy: 'M9 9h11v11H9z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  key: 'M15.5 7.5a3.5 3.5 0 1 0 0 .01z M13 10l-9 9 M7 16l2 2 M4 19l2 2',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  home: 'M3 11l9-7 9 7 M5 10v10h5v-6h4v6h5V10',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z M12 16v-4 M12 8h.01',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2 M13 17v2 M13 11v2',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24"><path d="${ICONS[n]}"/></svg>`;

// ---------- 小工具 ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normCity = c => (c || '').replace(/^臺/, '台').replace(/[市縣]$/, '').replace('連江', '馬祖').trim();
const cat = p => CATS[p.category] || CATS.other;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密模式或空間滿了 */ } };
// iPhone 開了「阻擋所有 Cookie」之類的設定時，網站存不了東西，登入每次都會不見
const canStore = (() => { try { localStorage.setItem('food.t', '1'); localStorage.removeItem('food.t'); return true; } catch { return false; } })();
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
const buzz = p => { try { navigator.vibrate?.(p); } catch { /* 不支援 */ } };
let toastTimer;
function toast(msg, ms = 2600, act) {
  const t = $('#toast'); t.textContent = msg;
  // 帶一個按鈕（例如「復原」）
  if (act) { const b = document.createElement('button'); b.className = 't-act'; b.textContent = act.label; b.onclick = () => { clearTimeout(toastTimer); t.classList.remove('show'); act.run(); }; t.append(b); }
  t.classList.toggle('has-act', !!act); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function parseAddr(addr) {
  const a = (addr || '').replace(/臺/g, '台');
  const m = a.match(CITY_RE);
  const city = m ? normCity(m[1]) : '';
  const d = m ? a.slice(m.index + m[0].length).match(/^([^\d\s路街段巷號]{1,3}?[區鄉鎮市])/) : null;
  return { city, district: d ? d[1] : '' };
}
function distKm(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// ---------- 重複店家 ----------
// 店名去掉空白、標點、「本店／總店」之類再比
const nkMemo = new Map();
const nk = s => nkMemo.get(s) ?? (nkMemo.size > 5000 && nkMemo.clear(), nkMemo.set(s, nk0(s)).get(s));
const nk0 = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[\s\-_.,，。、・·'’"「」『』()（）【】\[\]|｜/&＆!！?？~～:：#＃@]+/g, '').replace(/(本店|總店|旗艦店)$/, '');
const bigrams = s => { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; };
function nameSim(a, b) {
  const x = bigrams(a), y = bigrams(b); if (!x.length || !y.length) return a === b ? 1 : 0;
  let hit = 0; const pool = [...y]; for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return 2 * hit / (x.length + y.length);
}
// 判斷兩筆是不是同一間：同名同地區、或名字很像而且位置很近；連鎖店不同分店不算
function sameShop(a, b) {
  const na = nk(a.name), nb = nk(b.name); if (!na || !nb) return false;
  const ba = nk(a.branch), bb = nk(b.branch);
  if (ba && bb && ba !== bb) return false;
  const d = a.lat != null && b.lat != null ? distKm(a, b) : null;
  // 同一區常有好幾間分店：兩筆都有地址而且地址不同，除非幾乎在同一個點，就當作不同分店
  const aa = nk(a.address).replace(/\d+樓.*$|[bB]?\d+f.*$/, ''), ab = nk(b.address).replace(/\d+樓.*$|[bB]?\d+f.*$/, '');
  if (aa && ab && aa !== ab && !aa.includes(ab) && !ab.includes(aa) && !(d != null && d < 0.08)) return false;
  const sameName = na === nb || nk(a.name + (a.branch || '')) === nk(b.name + (b.branch || ''));
  if (sameName) return d != null ? d < 0.15 : (!a.city || !b.city || normCity(a.city) === normCity(b.city)) && (!a.district || !b.district || a.district === b.district);
  if (d == null) return false;
  const contain = Math.min(na.length, nb.length) >= 2 && (na.includes(nb) || nb.includes(na));
  return (contain && d < 0.25) || (d < 0.06 && nameSim(na, nb) >= 0.5);
}
const pairKey = (a, b) => [a, b].sort().join('|');
// 我的收藏裡可能重複的各組（按「不是重複」的會記住，不再提醒）
function dupGroups() {
  const mine = S.places.filter(isMine), ok = new Set(load('food.notDup', []));
  const parent = new Map(mine.map(p => [p.id, p.id]));
  const root = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
    const a = mine[i], b = mine[j];
    if (!ok.has(pairKey(a.id, b.id)) && sameShop(a, b)) parent.set(root(a.id), root(b.id));
  }
  const g = new Map(); for (const p of mine) { const r = root(p.id); g.set(r, [...(g.get(r) || []), p]); }
  return [...g.values()].filter(x => x.length > 1);
}
// 資料比較完整的那筆排前面，建議保留它
const richness = p => (p.photo ? 3 : 0) + (p.lat != null && !p.approx ? 2 : p.lat != null ? 1 : 0) + (p.dishes || []).length + (p.address ? 1 : 0) + (p.source_url ? 1 : 0) + (p.note ? 1 : 0) + (p.status === 'been' ? 1 : 0) + (p.rating ? 1 : 0);
// ---------- 分店：同一家店的多個地點，清單、抽籤、滑卡都算一間 ----------
// 店名去掉寫在後面的分店名（「鼎泰豐 信義店」→ 鼎泰豐）
const BRANCH_RE = /[\s・·\-–|｜(（]+([^\s・·\-–|｜(（]{1,12}?(?:分店|店|門市|館))[)）]?$/;
const brandOf = p => nk(String(p.name || '').replace(BRANCH_RE, '')) || nk(p.name);
const nearFirst = l => S.pos ? l.slice().sort((a, b) => (a.lat == null) - (b.lat == null) || (a.lat != null && distKm(S.pos, a) - distKm(S.pos, b))) : l;
// 依品牌分組，保留原本順序；每組最近的分店排第一
function brands(list) {
  const m = new Map();
  for (const p of list) { const k = brandOf(p); m.set(k, [...(m.get(k) || []), p]); }
  return [...m.values()].map(nearFirst);
}
const branchesOf = (p, list = visiblePlaces({ ...S.f, q: '', city: '', cat: '', status: '' })) => { const k = brandOf(p); return nearFirst(list.filter(x => brandOf(x) === k)); };
const branchLabel = p => p.branch || (String(p.name || '').match(BRANCH_RE) || [])[1] || p.district || normCity(p.city) || (p.address || '').slice(0, 10) || '分店';
const findDup = c => S.places.find(p => isMine(p) && p.id !== c.id && sameShop(p, c));

const fmtKm = d => d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`;
const mapsUrl = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.branch, p.address || normCity(p.city)].filter(Boolean).join(' '))}`;
const initial = n => (n || '?').trim().slice(0, 1).toUpperCase();
const area = p => [normCity(p.city), p.district].filter(Boolean).join(' · ');
const priceTag = n => n ? `<span class="price"><b>${'$'.repeat(n)}</b><span>${'$'.repeat(4 - n)}</span></span>` : '';
const avatar = (id, size) => `<span class="avatar" style="background:${AV_COLORS[hash(id) % AV_COLORS.length]}${size ? `;width:${size}px;height:${size}px;font-size:${size * .42}px` : ''}">${esc(initial(nameOf(id)))}</span>`;

// 照片：有照片就顯示照片，沒有就用分類顏色和 emoji 做一張封面
// 貼文推薦的菜色：去掉空白和重複，最多 8 個
const cleanDishes = a => [...new Set((Array.isArray(a) ? a : []).map(x => String(x || '').trim()).filter(x => x && x.length <= 30))].slice(0, 8);
const srcName = u => /instagram\.com/.test(u) ? 'Instagram 貼文' : /threads\.(net|com)/.test(u) ? 'Threads 貼文' : /tiktok\.com/.test(u) ? 'TikTok 影片' : /google\.|goo\.gl/.test(u) ? 'Google 地圖' : u ? (() => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '來源'; } })() : '貼文內容';
// IG 貼文／Reels：用 IG 官方嵌入在店家頁裡直接播（不下載影片）
const igEmbed = u => { const m = (u || '').match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/); return m ? `https://www.instagram.com/${m[1].startsWith('reel') ? 'reel' : 'p'}/${m[2]}/embed/` : ''; };
const isReel = u => /instagram\.com\/(?:[\w.]+\/)?(reels?|tv)\//.test(u || '');
const Reel = {
  // 影片框捲到附近才載入 IG 嵌入（店家頁打開不會變慢，也不會每間都吃流量）
  watch() {
    const sh = $('#sheet .sheet'); if (!sh) return;
    for (const el of sh.querySelectorAll('.reel:not(.on)')) {
      if (!window.IntersectionObserver) { Reel.load(el); continue; }
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); Reel.load(el); } }, { root: sh, rootMargin: '600px 0px' });
      io.observe(el);
    }
  },
  load(el) {
    if (el.classList.contains('on')) return; el.classList.add('on');
    const f = document.createElement('iframe');
    f.src = el.dataset.src; f.title = 'Instagram 影片';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
    f.setAttribute('scrolling', 'no');
    // IG 量好高度會傳訊息過來；萬一沒傳，載完 1.5 秒後也直接顯示
    f.onload = () => setTimeout(() => el.classList.add('ready'), 1500);
    clearTimeout(el._t); el._t = setTimeout(() => { if (!el.classList.contains('ready')) el.classList.add('fail'); }, 12000);
    el.append(f);
  },
  // 「看影片」按鈕：捲到影片
  show() {
    const el = $('#sheet .reel'); if (!el) return;
    buzz(8); Reel.load(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
};
addEventListener('message', e => {
  if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return;
  let d = e.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
  const f = [...document.querySelectorAll('.reel iframe')].find(f => f.contentWindow === e.source); if (!f) return;
  const el = f.parentNode;
  if (d?.type === 'MEASURE' && d.details?.height > 100) { el.style.height = Math.ceil(d.details.height) + 'px'; el.classList.add('ready'); el.classList.remove('fail'); }
});
// 有貼文連結、但缺照片或必點菜色的店，回原始貼文補一次（每個連結只補一次）
const needsEnrich = p => isMine(p) && /^https?:\/\//.test(p.source_url || '') && !/google\.|goo\.gl/.test(p.source_url) && (!p.photo || !(p.dishes || []).length) && !load('food.enriched', {})[p.id + '|' + p.source_url];

// 已經顯示過的照片：重畫時直接顯示，不再從透明淡入（不然每次重畫整頁照片都會閃一下）
const SHOWN = new Set();
function photo(p) {
  const [, e, c] = cat(p);
  if (p.photo) return `<img src="${esc(p.photo)}" alt="" loading="lazy" decoding="async" class="${SHOWN.has(p.photo) ? '' : 'loading'}" onload="this.classList.remove('loading');SHOWN.add(this.getAttribute('src'))" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',style:'background:linear-gradient(150deg,${c},${c}bb)',innerHTML:'<span class=pe>${e}</span>'}))">`;
  return `<div class="placeholder" style="background:linear-gradient(150deg,${c} 0%,${c}c0 100%)"><span class="pe">${e}</span></div>`;
}

// ---------- 狀態 ----------
const S = {
  cfg: { ...(window.FOOD_CONFIG || {}), ...load('food.cloud', {}) },
  settings: load('food.settings', { groqKey: '' }),
  sb: null, user: null, me: null,
  places: [], groups: [], members: [], groupPlaces: [], profiles: {}, rounds: [], swipes: [],
  tab: load('food.tab', 'list'),
  f: { q: '', city: '', cat: '', status: '', scope: 'all', sort: 'new' },
  pos: null, group: null, round: null,
  draw: load('food.draw', { cities: [], cats: [], meal: '', price: 0, status: '', scope: 'all', recent: [] }),
};
if (S.tab === 'me' || !['list', 'map', 'draw', 'groups', 'me'].includes(S.tab)) S.tab = 'list';
const cloud = () => !!S.sb;
const isMine = p => !cloud() || p.owner === S.user?.id;
const nameOf = id => S.profiles[id]?.name || '朋友';

// ---------- 資料層 ----------
const DB = {
  client() {
    if (!S.cfg.supabaseUrl || !S.cfg.supabaseKey || !window.supabase) return;
    S.sb = window.supabase.createClient(S.cfg.supabaseUrl, S.cfg.supabaseKey, { db: { schema: 'food' } });
  },
  // 上次讀到的資料先畫出來，不用等登入確認和資料庫（換發登入憑證要多一輪網路）
  peek() {
    if (!S.sb) return null;
    const c = load('food.cache', null);
    let ref = ''; try { ref = new URL(S.cfg.supabaseUrl).hostname.split('.')[0]; } catch { return null; }
    const user = load(`sb-${ref}-auth-token`, null)?.user;
    if (!c || !user || c.uid !== user.id) return null;
    S.user = user; DB.apply(c);
    return c;
  },
  apply(c) {
    for (const k of DB.KEYS) S[k] = c[k] || (k === 'profiles' ? {} : []);
    S.me = S.profiles[S.user.id] || S.me;
  },
  KEYS: ['places', 'groups', 'members', 'groupPlaces', 'rounds', 'profiles', 'swipes'],
  snap() {
    if (!cloud() || !S.user) return;
    const c = { uid: S.user.id }; for (const k of DB.KEYS) c[k] = S[k];
    save('food.cache', c);
    return JSON.stringify(c);
  },
  async init() {
    if (!S.sb) return;
    const { data } = await S.sb.auth.getSession();
    S.user = data.session?.user || null;
    S.sb.auth.onAuthStateChange((ev, session) => {
      const was = S.user?.id; S.user = session?.user || null;
      if ((S.user?.id || null) !== (was || null)) App.boot();
    });
  },
  async loadAll() {
    if (!cloud()) { S.places = load('food.places', []); return; }
    if (!S.user) return;
    const sb = S.sb;
    const [pl, gr, gm, gp, rd] = await Promise.all([
      // 每一個都要固定排序：順序不固定的話，資料沒變也會被當成有變，整頁重畫、照片閃一下
      sb.from('places').select('*').order('created_at', { ascending: false }).order('id'),
      sb.from('groups').select('*').order('created_at').order('id'),
      sb.from('group_members').select('*').order('group_id').order('user_id'),
      sb.from('group_places').select('*').order('group_id').order('place_id'),
      sb.from('swipe_rounds').select('*').order('created_at', { ascending: false }).order('id').limit(50),
    ]);
    for (const r of [pl, gr, gm, gp, rd]) if (r.error) throw r.error;
    S.places = pl.data; S.groups = gr.data; S.members = gm.data; S.groupPlaces = gp.data; S.rounds = rd.data;
    const ids = [...new Set([S.user.id, ...S.members.map(m => m.user_id), ...S.places.map(p => p.owner)])];
    const rids = S.rounds.map(r => r.id);
    // 名字和滑卡紀錄同時讀，少等一輪
    const [pr, sw] = await Promise.all([sb.from('profiles').select('*').in('id', ids).order('id'), rids.length ? sb.from('swipes').select('*').in('round_id', rids).order('round_id').order('user_id').order('place_id') : null]);
    S.profiles = Object.fromEntries((pr.data || []).map(p => [p.id, p]));
    if (!S.profiles[S.user.id]) {
      // 這個帳號在跑 schema.sql 之前就存在（和其他 app 共用的 Supabase）
      const me = { id: S.user.id, name: S.user.user_metadata?.name || (S.user.email || '').split('@')[0] };
      await sb.from('profiles').upsert(me); S.profiles[me.id] = me;
    }
    S.me = S.profiles[S.user.id];
    S.swipes = sw ? sw.data || [] : [];
    return DB.snap();
  },
  async savePlace(p) {
    p.updated_at = new Date().toISOString();
    if (!cloud()) {
      if (!p.id) { p.id = uid(); p.created_at = p.updated_at; S.places.unshift(p); }
      else S.places = S.places.map(x => x.id === p.id ? p : x);
      save('food.places', S.places); return p;
    }
    const row = { ...p }; delete row.owner; delete row.created_at;
    if (row.photo == null) delete row.photo;
    const q = p.id ? S.sb.from('places').update(row).eq('id', p.id) : S.sb.from('places').insert(row);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const i = S.places.findIndex(x => x.id === data.id);
    if (i >= 0) S.places[i] = data; else S.places.unshift(data);
    DB.snap();
    return data;
  },
  async deletePlace(id) { return DB.deletePlaces([id]); },
  async deletePlaces(ids) {
    if (cloud()) { const { error } = await S.sb.from('places').delete().in('id', ids); if (error) throw error; }
    S.places = S.places.filter(p => !ids.includes(p.id));
    S.groupPlaces = S.groupPlaces.filter(g => !ids.includes(g.place_id));
    if (!cloud()) save('food.places', S.places); else DB.snap();
  },
  // 復原刪除：原樣放回（同一個 id），群組分享也一起放回
  async restore(rows, shares) {
    if (cloud()) {
      const back = await DB.q(S.sb.from('places').insert(rows).select());
      if (shares.length) S.groupPlaces.push(...await DB.q(S.sb.from('group_places').insert(shares.map(({ group_id, place_id }) => ({ group_id, place_id }))).select()));
      S.places.push(...back);
    } else S.places.push(...rows);
    S.places.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!cloud()) save('food.places', S.places); else DB.snap();
  },
  async rpc(fn, args) { const { data, error } = await S.sb.rpc(fn, args); if (error) throw error; return data; },
  async q(promise) { const { data, error } = await promise; if (error) throw error; return data; },
};

// ---------- 照片 ----------
const Photo = {
  // 縮小成 JPEG；雲端版存到 Supabase Storage，只存在裝置時存成小張的 data URL
  async shrink(src, max, q = 0.82) {
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
    const img = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', q));
  },
  async store(src) {
    if (!src) return '';
    try {
      if (!cloud()) {
        const b = await Photo.shrink(src, 480, 0.75);
        return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
      }
      const b = await Photo.shrink(src, 1000);
      const path = `${S.user.id}/${uid()}.jpg`;
      const { error } = await S.sb.storage.from('food-photos').upload(path, b, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      return S.sb.storage.from('food-photos').getPublicUrl(path).data.publicUrl;
    } catch (e) { console.warn('photo store failed', e); return ''; }
  },
};

// ---------- 抓店家（連結、文字、截圖） ----------
const Extract = {
  async run({ url, text, image }) {
    // 有雲端函式就交給它（能抓 IG、TikTok、Google 地圖短網址，大家共用一把 Groq key）
    if (cloud() && S.user) {
      try {
        const { data, error } = await S.sb.functions.invoke('extract', { body: { url, text, image } });
        if (error) {
          let msg = error.message;
          try { msg = (await error.context.json()).error || msg; } catch { /* 不是 JSON */ }
          throw new Error(msg);
        }
        return data;
      } catch (e) {
        if (!S.settings.groqKey) throw new Error(`雲端抓取失敗：${e.message}\n可以改成直接貼上貼文文字，或在「我的」填自己的 Groq key。`);
        console.warn('extract function failed, falling back', e);
      }
    }
    // 本機：Google 地圖網址自己解析，其他連結抓不到內容，只能請使用者貼文字
    const out = { source: { url: url || '', caption: text || '' }, places: [] };
    if (url) {
      const g = Extract.fromMapsUrl(url);
      if (g) out.places = [g];
      else if (!text && !image) throw new Error('這個連結要接上雲端才抓得到內容。\n先在 IG 點「…」→「複製」貼文文字，貼到這裡就可以。');
    }
    if (text || image) {
      if (!S.settings.groqKey) throw new Error('要先到「我的」填 Groq API key（免費），才能從文字或截圖找出店家。');
      out.places = await Extract.groq(text, image);
    }
    return out;
  },
  fromMapsUrl(url) {
    if (!/google\.[a-z.]+\/maps|maps\.google\./.test(url)) return null;
    const name = decodeURIComponent((url.match(/\/place\/([^/@?]+)/) || [])[1] || '').replace(/\+/g, ' ');
    const c = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!name) return null;
    return { name, lat: c ? +c[1] : null, lng: c ? +c[2] : null, category: 'restaurant' };
  },
  async groq(text, image) {
    const vision = !!image;
    const body = {
      model: vision ? 'qwen/qwen3.8-27b' : 'openai/gpt-oss-120b', temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: vision
        ? [{ role: 'user', content: [{ type: 'text', text: PROMPT + (text ? `\n\n補充文字：\n${text}` : '') }, { type: 'image_url', image_url: { url: image } }] }]
        : [{ role: 'system', content: PROMPT }, { role: 'user', content: text.slice(0, 12000) }],
    };
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${S.settings.groqKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}：${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return JSON.parse(j.choices[0].message.content).places || [];
  },
  // 截圖縮小成 1280px 的 JPEG，避免超過大小限制
  async shrink(file) {
    const b = await Photo.shrink(file, 1280, 0.85);
    return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  },
};

// ---------- 地址轉座標（OpenStreetMap Nominatim，免費，一秒一次） ----------
const Geo = {
  last: 0,
  async search(q, tw = true) {
    const wait = 1100 - (Date.now() - Geo.last); if (wait > 0) await sleep(wait);
    Geo.last = Date.now();
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=zh-TW${tw ? '&countrycodes=tw' : ''}&q=${encodeURIComponent(q)}`;
    const r = await fetch(u); if (!r.ok) return null;
    return (await r.json())[0] || null;
  },
  // 台灣地址常寫到巷弄號樓，OSM 不一定有門牌，所以一路簡化到路名、行政區
  candidates(p) {
    const a = (p.address || '').replace(/臺/g, '台').replace(/\(.*?\)|（.*?）/g, '').replace(/\s+/g, '')
      // 地址裡的「○○里／村」OSM 找不到，拿掉
      .replace(/([區鄉鎮市])[\u4e00-\u9fff]{1,3}[村里](?![路街大])/, '$1');
    const out = [];
    if (a) {
      const base = a.replace(/(\d+|[一二三四五六七八九十]+)(樓|F|f).*$/, '').replace(/之\d+/, '');
      out.push([base, false]);
      const lane = base.match(/^.*?\d+[巷弄]/); if (lane) out.push([lane[0], true]);
      const road = base.match(/^.*?(路|街|大道)(.{1,2}段)?/); if (road) out.push([road[0], true]);
    }
    const tw = !p.city || CITIES.includes(normCity(p.city));
    if (p.name) out.push([`${p.name} ${p.branch || ''} ${p.city || ''}`.trim(), false]);
    if (p.district || p.city) out.push([`${p.district || ''} ${p.city || ''}`.trim(), true]);
    return { list: out, tw };
  },
  async locate(p) {
    const { list, tw } = Geo.candidates(p);
    for (const [q, approx] of list) {
      const hit = await Geo.search(q, tw).catch(() => null);
      if (!hit) continue;
      const ad = hit.address || {};
      const city = normCity(ad.city || ad.county || ad.state || '');
      return {
        lat: +hit.lat, lng: +hit.lon, approx: approx || !/\d+號/.test(q) && !q.includes(p.name),
        city: p.city || city, district: p.district || ad.suburb || ad.city_district || ad.town || '',
      };
    }
    return null;
  },
};

// ---------- 我的位置（持續更新） ----------
const Me = {
  watching: false,
  start(ask) {
    if (Me.watching || !navigator.geolocation) return;
    if (!ask && !load('food.geoOk', false)) return;
    Me.watching = true;
    navigator.geolocation.watchPosition(p => {
      const first = !S.pos;
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      save('food.geoOk', true);
      MapView.updateMe(first);
      if (first && S.tab !== 'map') { S.keepScroll = true; if (!$('.sheet-bg')) App.render(); }
    }, () => { Me.watching = false; if (ask) toast('沒有拿到位置權限，可以到瀏覽器設定打開'); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  },
  async once() {
    if (S.pos) return S.pos;
    Me.start(true);
    for (let i = 0; i < 40 && !S.pos; i++) await sleep(250);
    return S.pos;
  },
};

// ---------- 篩選 ----------
function visiblePlaces(f = S.f) {
  let list = S.places.slice();
  if (f.scope === 'mine') list = list.filter(isMine);
  else if (f.scope && f.scope !== 'all') {
    const ids = new Set(S.groupPlaces.filter(g => g.group_id === f.scope).map(g => g.place_id));
    list = list.filter(p => ids.has(p.id));
  } else if (cloud()) {
    // 「全部」= 我的 + 群組裡分享的；同一間店不重複（以我的那筆為主）
    const mine = new Set(list.filter(isMine).map(p => (p.name + p.city).toLowerCase()));
    list = list.filter(p => isMine(p) || !mine.has((p.name + p.city).toLowerCase()));
  }
  if (f.city) list = list.filter(p => normCity(p.city) === f.city || (f.city === '其他' && !CITIES.includes(normCity(p.city))));
  if (f.cat) list = list.filter(p => p.category === f.cat);
  if (f.status) list = list.filter(p => p.status === f.status);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(p => [p.name, p.branch, p.address, p.city, p.district, p.cuisine, p.note, ...(p.tags || [])].join(' ').toLowerCase().includes(q));
  }
  if (f.sort === 'near' && S.pos) list.sort((a, b) => (a.lat == null) - (b.lat == null) || (a.lat != null && distKm(S.pos, a) - distKm(S.pos, b)));
  return list;
}
const citiesInUse = () => {
  const set = new Set(S.places.map(p => normCity(p.city)).filter(Boolean));
  const known = CITIES.filter(c => set.has(c));
  return set.size > known.length ? [...known, '其他'] : known;
};
const scopes = () => cloud() ? [['all', '全部'], ['mine', '只看我的'], ...S.groups.map(g => [g.id, g.name])] : [];

function filterChips({ map = false } = {}) {
  const f = S.f, sc = scopes();
  const scopeName = (sc.find(([v]) => v === f.scope) || sc[0] || [])[1];
  const selChip = (label, on, opts, key) => `<label class="chip ${on ? 'on' : ''}">${label} ▾<select onchange="App.setF('${key}', this.value)">${opts}</select></label>`;
  return `<div class="chips">
    ${sc.length ? selChip(`${ic('users')} ${esc(scopeName)}`, f.scope !== 'all', sc.map(([v, t]) => `<option value="${esc(v)}" ${f.scope === v ? 'selected' : ''}>${esc(t)}</option>`).join(''), 'scope') : ''}
    ${selChip(`${ic('pin')} ${esc(f.city || '地區')}`, !!f.city, `<option value="">所有地區</option>${citiesInUse().map(c => `<option ${f.city === c ? 'selected' : ''}>${c}</option>`).join('')}`, 'city')}
    <span class="chip ${f.status === 'want' ? 'on' : ''}" onclick="App.setF('status', '${f.status === 'want' ? '' : 'want'}')">想去</span>
    <span class="chip ${f.status === 'been' ? 'on' : ''}" onclick="App.setF('status', '${f.status === 'been' ? '' : 'been'}')">去過</span>
    ${map ? '' : `<span class="chip ${f.sort === 'near' ? 'on' : ''}" onclick="App.sortNear()">${ic('locate')} 離我最近</span>`}
  </div>
  <div class="chips">
    <span class="chip ${!f.cat ? 'on' : ''}" onclick="App.setF('cat', '')">全部</span>
    ${Object.entries(CATS).map(([k, [t, e]]) => `<span class="chip ${f.cat === k ? 'on' : ''}" onclick="App.setF('cat', '${f.cat === k ? '' : k}')"><span class="e">${e}</span>${t}</span>`).join('')}
  </div>`;
}

function placeCard(p, i = 0, nBranch = 1) {
  const d = S.pos && p.lat != null ? fmtKm(distKm(S.pos, p)) : '';
  const [t, e] = cat(p);
  const pick = S.sel && S.tab === 'list';
  return `<div class="pcard ${pick ? (isMine(p) ? S.sel.has(p.id) ? 'picked' : '' : 'nopick') : ''}" style="--i:${i}" data-id="${p.id}" onclick="App.cardTap('${p.id}', this)">
    <div class="ph">${photo(p)}${pick && isMine(p) ? `<span class="pick-dot">${ic('check')}</span>` : ''}
      <span class="badge ${p.status}">${p.status === 'been' ? `去過${p.rating ? ' ★' + p.rating : ''}` : '想去'}</span>
      ${d ? `<span class="dist">${d}</span>` : ''}
      ${!isMine(p) ? `<span class="who">${avatar(p.owner, 26)}</span>` : ''}
      ${nBranch > 1 ? `<span class="nopos branches">${ic('pin')}${nBranch} 間分店</span>` : p.lat == null ? `<span class="nopos">沒有位置</span>` : ''}
    </div>
    <div class="pc-body">
      <div class="pc-name">${esc(p.name)}${p.branch ? ` <span class="muted" style="font-weight:600">${esc(p.branch)}</span>` : ''}</div>
      <div class="pc-meta">${e} ${esc(p.cuisine || t)}${area(p) ? ' · ' + esc(area(p)) : ''}${p.price ? ' · ' : ''}${priceTag(p.price)}</div>
      ${(p.dishes || []).length ? `<div class="pc-dish">必點 ${esc(p.dishes.slice(0, 3).join('・'))}</div>` : p.note ? `<div class="pc-dish muted">${esc(p.note)}</div>` : ''}
    </div>
  </div>`;
}

// ---------- 畫面 ----------
const TABS = [['list', 'heart', '收藏'], ['map', 'map', '地圖'], ['draw', 'dice', '抽一間'], ['groups', 'users', '群組']];

const Views = {
  header() {
    const t = S.tab;
    const n = S.places.filter(isMine).length;
    const title = { list: ['美食收藏', n ? `${n} 間收藏・${S.places.filter(p => isMine(p) && p.status === 'been').length} 間去過` : '把想吃的店都存在這裡'], draw: ['今天吃什麼？', '選條件，交給運氣'], groups: ['美食群組', '跟朋友一起收藏、一起決定'], me: ['我的', ''] }[t] || ['', ''];
    if (t === 'groups' && S.group) return '';
    return `<div class="grow"><h1>${title[0]}</h1>${title[1] ? `<div class="sub">${title[1]}</div>` : ''}</div>
      ${Views.home()}${t === 'me' ? '' : `<button class="me-btn" onclick="App.tab('me')" aria-label="我的">${cloud() && S.me ? esc(initial(S.me.name)) : ic('user')}</button>`}`;
  },
  // 回入口網站（只有從入口打開時才看得到，見 ../portal-home.js）
  home: () => `<a class="icon-btn portal-home" href="https://anthony-apps.netlify.app/" aria-label="回入口">${ic('home')}</a>`,
  list() {
    const list = visiblePlaces();
    if (!S.places.length) return `<div class="empty">
        <div class="art">🍜</div><h2>收藏第一間想吃的店</h2>
        <p>在 IG、Threads、TikTok 看到想吃的，複製連結貼過來，AI 會幫你找出店名、地址和分類。</p>
        <div class="steps"><div><b>1</b>在貼文按「分享」→「複製連結」</div><div><b>2</b>回來按下方的 ＋</div><div><b>3</b>確認店家，收藏完成 🎉</div></div>
        <button class="btn primary big" onclick="App.openAdd()">${ic('plus')} 新增第一間</button></div>`;
    return `<div class="search">${ic('search')}<input id="q" placeholder="搜尋店名、地區、料理、標籤" value="${esc(S.f.q)}" oninput="if(!event.isComposing)App.setF('q', this.value, true)" enterkeyhint="search"></div>
      ${filterChips()}
      ${!S.sel && (S.dups = dupGroups()).length ? `<button class="dup-banner" onclick="App.dups()"><span class="ic">${ic('layers')}</span><span class="grow"><b>有 ${S.dups.length} 組可能重複的店</b><small>點這裡比對，合併成一間或刪掉多的</small></span>${ic('next')}</button>` : ''}
      <div class="count-line"><span>${S.sel ? '點卡片選要刪掉的店' : `${brands(list).length} 間${brands(list).length < list.length ? `・${list.length} 個地點` : ''}${S.f.sort === 'near' ? '・由近到遠' : ''}`}</span>${S.sel ? `<button class="link-btn" onclick="App.pickAll()">${list.filter(isMine).every(p => S.sel.has(p.id)) ? '全部取消' : '全選'}</button>` : list.some(isMine) ? `<button class="link-btn" onclick="App.pick()">選取</button>` : ''}</div>
      ${list.length ? `<div class="grid ${S.sel ? 'picking' : ''}">${(S.sel ? list.map(p => [p]) : brands(list)).map((g, i) => placeCard(g[0], i, g.length)).join('')}</div>` : `<div class="empty"><div class="art">🔍</div><h2>沒有符合的店</h2><p>換個條件試試看</p><button class="btn" onclick="App.clearF()">清除篩選</button></div>`}`;
  },
  draw() {
    const d = S.draw;
    const chips = (key, items, multi) => items.map(([v, t]) => {
      const on = multi ? d[key].includes(v) : d[key] === v;
      return `<span class="chip ${on ? 'on' : ''}" onclick="App.drawSet('${key}', ${JSON.stringify(v).replace(/"/g, '&quot;')}, ${multi})">${t}</span>`;
    }).join('');
    const sc = scopes();
    const pool = Draw.pool();
    return `<div class="draw-stage"><div class="slot idle" id="slot">
        <div class="dice"><div class="big">🎲</div><b>${pool.length ? `${pool.length} 間候選` : '沒有符合條件的店'}</b><div style="opacity:.9;font-size:14px">${pool.length ? '按下去，今天就吃它' : '放寬一點條件試試'}</div></div>
      </div></div>
      <div class="draw-cta" id="drawcta"><button class="btn primary big" style="min-width:220px" ${pool.length ? '' : 'disabled'} onclick="App.doDraw()">${ic('dice')} 抽一間</button></div>
      <div class="card" style="margin-top:18px">
        ${sc.length ? `<div class="fgroup" style="margin-top:0"><div class="t">從哪裡抽</div><div class="chips wrap">${chips('scope', sc, false)}</div></div>` : ''}
        <div class="fgroup" ${sc.length ? '' : 'style="margin-top:0"'}><div class="t">地區</div><div class="chips wrap">${chips('cities', citiesInUse().map(c => [c, c]), true)}<span class="chip hot ${d.near ? 'on' : ''}" onclick="App.drawNear()">${ic('locate')} 附近 3 公里</span></div></div>
        <div class="fgroup"><div class="t">分類</div><div class="chips wrap">${chips('cats', Object.entries(CATS).map(([k, [t, e]]) => [k, `<span class="e">${e}</span>${t}`]), true)}</div></div>
        <div class="fgroup"><div class="t">時段</div><div class="chips wrap">${chips('meal', [['', '不限'], ['now', '⏰ 現在'], ...Object.entries(MEALS)], false)}</div></div>
        <div class="fgroup"><div class="t">每人預算</div><div class="chips wrap">${chips('price', [[0, '不限'], [1, '200 內'], [2, '500 內'], [3, '1000 內']], false)}</div></div>
        <div class="fgroup"><div class="t">狀態</div><div class="chips wrap">${chips('status', [['', '都可以'], ['want', '想去的'], ['been', '去過的']], false)}</div></div>
        <p class="muted" style="margin:14px 0 0">沒填時段或價位的店也會一起抽，最近抽到的 5 間會先跳過。</p>
      </div>`;
  },
  groups() {
    if (!cloud()) return Views.needCloud('群組和滑卡配對');
    if (S.group) return Views.groupDetail(S.groups.find(g => g.id === S.group));
    return `<div class="row" style="margin:4px 0 16px"><button class="btn primary grow" onclick="App.createGroup()">${ic('plus')} 建立群組</button><button class="btn grow" onclick="App.joinPrompt()">${ic('ticket')} 輸入邀請碼</button></div>
      ${S.groups.length ? S.groups.map((g, i) => {
        const mem = S.members.filter(m => m.group_id === g.id);
        const n = S.groupPlaces.filter(x => x.group_id === g.id).length;
        const live = S.rounds.filter(r => r.group_id === g.id && S.swipes.filter(s => s.round_id === r.id && s.user_id === S.user.id).length < r.place_ids.length).length;
        return `<div class="gcard" style="animation-delay:${i * 50}ms" onclick="App.openGroup('${g.id}')">
          <div class="gbanner" style="background:${GROUP_GRADS[hash(g.id) % GROUP_GRADS.length]}"><span class="em">${GROUP_EMO[hash(g.id) % GROUP_EMO.length]}</span><h3>${esc(g.name)}</h3></div>
          <div class="gbody"><div class="avatars">${mem.slice(0, 5).map(m => avatar(m.user_id)).join('')}</div><div class="grow muted" style="font-weight:600">${mem.length} 人・${n} 間店</div>${live ? `<span class="tag hot">💘 ${live} 輪待滑</span>` : ''}${ic('next')}</div>
        </div>`;
      }).join('') : `<div class="empty"><div class="art">👯</div><h2>揪朋友一起吃</h2><p>建一個群組，把邀請連結傳到 LINE。大家的口袋名單放在一起，還能一起滑卡配對。</p></div>`}`;
  },
  groupDetail(g) {
    if (!g) { S.group = null; return Views.groups(); }
    const mem = S.members.filter(m => m.group_id === g.id);
    const ids = new Set(S.groupPlaces.filter(x => x.group_id === g.id).map(x => x.place_id));
    const places = S.places.filter(p => ids.has(p.id));
    const rounds = S.rounds.filter(r => r.group_id === g.id);
    return `<div class="round-top" style="padding-top:calc(6px + env(safe-area-inset-top))"><button class="icon-btn" onclick="App.openGroup(null)" aria-label="返回">${ic('back')}</button><span class="grow"></span><button class="btn sm soft" onclick="App.invite('${g.id}')">${ic('users')} 邀請好友</button></div>
      <div class="ghero"><div class="gbanner" style="background:${GROUP_GRADS[hash(g.id) % GROUP_GRADS.length]}"><span class="em" style="font-size:120px">${GROUP_EMO[hash(g.id) % GROUP_EMO.length]}</span><div style="position:relative"><h3>${esc(g.name)}</h3><div style="opacity:.92;font-size:14px;margin-top:2px">${mem.length} 位成員・${places.length} 間店</div></div></div></div>
      <div class="row wrap" style="gap:8px;margin-bottom:16px">${mem.map(m => `<span class="member">${avatar(m.user_id, 26)}${esc(nameOf(m.user_id))}${m.user_id === g.owner ? ' 👑' : ''}</span>`).join('')}</div>
      <div class="match-card">
        <h3>滑卡配對</h3><p>每個人各自左滑右滑，大家都想吃的店會立刻配對成功。</p>
        <button class="btn" ${places.length ? '' : 'disabled'} onclick="App.newRound('${g.id}')">${ic('heart')} 開始新一輪</button>
        ${places.length ? '' : '<p style="margin:10px 0 0;font-size:13px">先把店分享到群組，才能開始滑。</p>'}
        ${rounds.slice(0, 6).map(r => Views.roundRow(r, mem)).join('')}
      </div>
      <div class="section-t"><span class="grow">群組裡的店 <span class="muted" style="font-size:15px">${places.length}</span></span><button class="btn sm" onclick="App.setF('scope','${g.id}');App.tab('map')">${ic('map')}</button><button class="btn sm soft" onclick="App.shareMany('${g.id}')">${ic('plus')} 加店</button></div>
      ${places.length ? `<div class="grid">${places.map(placeCard).join('')}</div>` : '<div class="empty" style="padding:20px"><p>還沒有店，按「加店」從你的收藏挑。</p></div>'}
      <div style="margin-top:30px;text-align:center"><button class="btn ghost danger" onclick="App.leaveGroup('${g.id}')">${g.owner === S.user.id ? '刪除群組' : '退出群組'}</button></div>`;
  },
  roundRow(r, mem) {
    const sw = S.swipes.filter(s => s.round_id === r.id);
    const done = mem.filter(m => sw.filter(s => s.user_id === m.user_id).length >= r.place_ids.length).length;
    const matches = Swipe.matches(r).filter(x => x.all).length;
    const mine = sw.filter(s => s.user_id === S.user.id).length;
    return `<div class="rrow" onclick="App.openRound('${r.id}')">
      <div class="grow"><div class="t">${esc(r.title || '一起決定吃什麼')}</div><div class="s">${done}/${mem.length} 人滑完・${mine < r.place_ids.length ? `<b>你還有 ${r.place_ids.length - mine} 張</b>` : '你滑完了'}</div></div>
      ${matches ? `<span class="pill">💘 ${matches}</span>` : ''}${ic('next')}
    </div>`;
  },
  round() {
    const r = S.rounds.find(x => x.id === S.round);
    if (!r) { S.round = null; return Views.groups(); }
    const mine = new Set(S.swipes.filter(s => s.round_id === r.id && s.user_id === S.user.id).map(s => s.place_id));
    const left = r.place_ids.filter(id => !mine.has(id) && S.places.some(p => p.id === id));
    const total = r.place_ids.length;
    const head = `<div class="round-top"><button class="icon-btn" onclick="App.openRound(null)" aria-label="返回">${ic('back')}</button><div class="t">${esc(r.title || '一起決定吃什麼')}</div><button class="icon-btn" onclick="S.showResult=${!S.showResult};S.animate=true;App.render()" aria-label="結果">${ic(S.showResult ? 'x' : 'list')}</button></div>
      <div class="prog"><i style="width:${(total - left.length) / total * 100}%"></i></div>`;
    if (left.length && !S.showResult) {
      const cards = left.slice(0, 3).map(id => S.places.find(x => x.id === id));
      return `${head}
        <div class="deck">${cards.map((p, i) => Views.swipeCard(p, i)).reverse().join('')}</div>
        <div class="sbtns"><button class="sbtn no" onclick="App.swipe(false)" aria-label="跳過">${ic('x')}</button><button class="sbtn info" onclick="App.openPlace('${cards[0].id}', false, $('#scard .ph'))" aria-label="詳細">${ic('info')}</button><button class="sbtn yes" onclick="App.swipe(true)" aria-label="想吃">${ic('heart')}</button></div>
        <p class="muted" style="text-align:center;margin:8px 0 0">還有 ${left.length} 張・右滑想吃，左滑跳過，點照片看詳細</p>`;
    }
    const mem = S.members.filter(m => m.group_id === r.group_id);
    const res = Swipe.matches(r);
    const waiting = mem.filter(m => S.swipes.filter(s => s.round_id === r.id && s.user_id === m.user_id).length < r.place_ids.length);
    return `${head}
      <div class="card" style="margin-top:16px;text-align:center">${waiting.length ? `<div style="font-size:30px">⏳</div><b>還在等 ${waiting.map(m => m.user_id === S.user.id ? '你' : esc(nameOf(m.user_id))).join('、')}</b><div class="muted">滑完結果會自動更新</div>` : `<div style="font-size:30px">🎉</div><b>大家都滑完了！</b>`}
        ${left.length ? `<div style="margin-top:12px"><button class="btn primary" onclick="S.showResult=false;S.animate=true;App.render()">繼續滑（還有 ${left.length} 張）</button></div>` : ''}</div>
      <div class="section-t">結果</div>
      ${res.filter(x => x.likes).map((x, i) => `<div class="res ${x.all ? 'all' : ''}" style="--i:${i}" onclick="App.openPlace('${x.p.id}', false, this.querySelector('.ph'))">
        <div class="ph">${photo(x.p)}</div>
        <div class="grow"><div style="font-weight:800">${x.all ? '💘 ' : ''}${esc(x.p.name)}</div><div class="muted">${x.likes}/${mem.length} 人想吃・${esc(x.who.map(nameOf).join('、'))}</div>
          <div class="bar"><i style="width:${x.likes / mem.length * 100}%"></i></div></div>
        <a class="icon-btn" href="${mapsUrl(x.p)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="導航">${ic('nav')}</a>
      </div>`).join('') || '<div class="empty" style="padding:20px"><p>還沒有人按想吃。</p></div>'}`;
  },
  swipeCard(p, i) {
    const [t, e] = cat(p);
    return `<div class="scard ${i === 0 ? 'top' : 'back' + i}" ${i === 0 ? 'id="scard"' : ''} data-id="${p.id}">
      ${i === 0 ? '<div class="tint like"></div><div class="tint nope"></div><div class="stamp like">想吃</div><div class="stamp nope">跳過</div>' : ''}
      <div class="ph">${photo(p)}</div>
      <div class="cap">
        <div class="n">${esc(p.name)}${p.branch ? ` <span style="font-size:17px;opacity:.8">${esc(p.branch)}</span>` : ''}</div>
        <div class="m">${e} ${esc(p.cuisine || t)}${area(p) ? '・' + esc(area(p)) : ''}${S.pos && p.lat != null ? '・' + fmtKm(distKm(S.pos, p)) : ''}${(n => n > 1 ? `・${n} 間分店` : '')(branchesOf(p, S.places.filter(x => S.groupPlaces.some(g => g.place_id === x.id && g.group_id === S.rounds.find(r => r.id === S.round)?.group_id))).length)}</div>
        <div class="tags">${p.price ? `<span class="tag">${PRICES[p.price]}</span>` : ''}${(p.meals || []).map(m => `<span class="tag">${MEALS[m]}</span>`).join('')}${(p.tags || []).slice(0, 3).map(x => `<span class="tag">#${esc(x)}</span>`).join('')}</div>
        ${(p.dishes || []).length ? `<div class="dish-line">${ic('star')}<span>必點 ${esc(p.dishes.slice(0, 3).join('・'))}</span></div>` : ''}
        ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        <div class="by">${avatar(p.owner, 20)} ${esc(nameOf(p.owner))} 收藏${p.source_url ? `・<a href="${esc(p.source_url)}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline" onpointerdown="event.stopPropagation()">原始貼文</a>` : ''}</div>
      </div>
    </div>`;
  },
  me() {
    const c = S.cfg;
    const mine = S.places.filter(isMine);
    return `${cloud() ? `<div class="profile"><div class="av">${esc(initial(S.me?.name))}</div><div class="grow"><div class="n">${esc(S.me?.name || '')}</div><div class="e">${esc(S.user?.email)}</div></div><button class="icon-btn" style="background:rgba(255,255,255,.25);box-shadow:none;color:#fff" onclick="App.renameMe()" aria-label="改名">${ic('edit')}</button></div>`
        : `<div class="profile"><div class="av">🍜</div><div class="grow"><div class="n">只存在這台裝置</div><div class="e">收藏、地圖、抽籤都能用；群組和滑卡要接上雲端</div></div></div>`}
      <div class="stats"><div><b>${mine.length}</b><span>收藏</span></div><div><b>${mine.filter(p => p.status === 'been').length}</b><span>去過</span></div><div><b>${new Set(mine.map(p => normCity(p.city)).filter(Boolean)).size}</b><span>個城市</span></div></div>
      <div class="list">
        <details class="list" style="margin:0;box-shadow:none;border-radius:0"><summary><span class="ic">${ic('key')}</span><span class="grow">AI 抓店家</span><span class="muted">${S.settings.groqKey ? '已設定' : cloud() ? '用雲端' : '未設定'}</span></summary><div class="inner">
          <p class="muted">${cloud() ? '接上雲端後，大家共用伺服器的 Groq key，不用自己填。這裡的 key 只在雲端失敗時備用。' : '從貼文文字或截圖找店名，用 Groq 的免費模型。'}到 <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> 免費申請（gsk_ 開頭），只存在這台裝置。</p>
          <div class="row"><input id="groqKey" class="input grow" type="password" value="${esc(S.settings.groqKey)}" placeholder="gsk_…"><button class="btn" onclick="App.saveSettings()">儲存</button></div></div></details>
        <button onclick="App.shareSetup()"><span class="ic">${ic('share')}</span><span class="grow">從 IG 一鍵分享進來</span><span class="muted">設定</span>${ic('next')}</button>
        <button onclick="App.exportJson()"><span class="ic">${ic('down')}</span><span class="grow">匯出我的收藏</span>${ic('next')}</button>
        <label style="cursor:pointer"><span class="ic">${ic('up')}</span><span class="grow">匯入備份</span>${ic('next')}<input type="file" accept=".json,application/json" class="hidden" onchange="App.importJson(this.files[0])"></label>
        ${cloud() && load('food.places', []).length ? `<button onclick="App.migrateLocal()"><span class="ic">${ic('cloud')}</span><span class="grow">上傳登入前的 ${load('food.places', []).length} 間收藏</span>${ic('next')}</button>` : ''}
        <details class="list" style="margin:0;box-shadow:none;border-radius:0"><summary><span class="ic">${ic('cloud')}</span><span class="grow">進階：雲端設定</span></summary><div class="inner">
          <p class="muted">通常改 config.js 就好。這裡填的只對這台裝置有效。</p>
          <label class="field"><span>Supabase Project URL</span><input id="sbUrl" value="${esc(c.supabaseUrl || '')}" placeholder="https://xxxx.supabase.co"></label>
          <label class="field"><span>Publishable key</span><input id="sbKey" value="${esc(c.supabaseKey || '')}" placeholder="sb_publishable_…"></label>
          <div class="row" style="margin-top:12px"><button class="btn" onclick="App.saveCloud()">儲存並重新載入</button><button class="btn ghost" onclick="App.saveCloud(true)">清除</button></div></div></details>
      </div>
      ${cloud() ? `<div class="list"><button onclick="App.signOut()" style="color:var(--danger)"><span class="ic" style="background:#ffe3e3;color:var(--danger)">${ic('out')}</span><span class="grow">登出</span></button></div>` : ''}
      <p class="muted" style="text-align:center;margin-top:20px">開源：<a href="https://github.com/GOP9632/open-apps/tree/main/apps/food-map" target="_blank" rel="noopener">GitHub</a>・地圖 © OpenFreeMap、OpenStreetMap</p>`;
  },
  needCloud(what) {
    return `<div class="empty"><div class="art">☁️</div><h2>${what}要先接上雲端</h2><p>好友群組需要一個共用的資料庫。用 Supabase 免費方案，設定一次，大家打開同一個網址就能用。</p><a class="btn" href="https://github.com/GOP9632/open-apps/tree/main/apps/food-map#接上雲端" target="_blank" rel="noopener">設定步驟</a></div>`;
  },
  auth() {
    const m = S.authMode || 'in';
    const fl = [['🍜', 8, 12], ['🍰', 82, 9], ['☕', 12, 78], ['🥐', 86, 70], ['🍣', 70, 88], ['🧋', 22, 45]];
    return `<div class="auth">
      ${fl.map(([e, x, y], i) => `<span class="fl" style="left:${x}%;top:${y}%;animation-delay:${i * .6}s">${e}</span>`).join('')}
      <img class="logo" src="icon.svg" alt="">
      <h1>美食收藏</h1>
      <p class="tag-line">IG 看到就收藏，地圖幫你整理，跟朋友滑卡決定吃什麼。</p>
      <div class="box">
        <div class="seg" style="margin:14px 0 4px"><button class="${m === 'in' ? 'on' : ''}" onclick="S.authMode='in';App.render()">登入</button><button class="${m === 'up' ? 'on' : ''}" onclick="S.authMode='up';App.render()">建立帳號</button></div>
        ${canStore ? '' : '<div class="tag hot" style="margin-top:12px;height:auto;padding:8px 12px;line-height:1.5">這支手機擋住了網站儲存，登入沒辦法記住。到「設定 → App → Safari」把「阻擋所有 Cookie」關掉就好。</div>'}
        ${load('food.pendingJoin', '') ? '<div class="tag hot" style="margin-top:12px;height:auto;padding:8px 12px">登入後會自動加入朋友的群組 🎉</div>' : ''}
        ${m === 'up' ? '<label class="field"><span>名字（朋友看到的）</span><input id="au-name" autocomplete="nickname"></label>' : ''}
        <label class="field"><span>Email</span><input id="au-email" type="email" autocomplete="email" inputmode="email"></label>
        <label class="field"><span>密碼${m === 'up' ? '（至少 6 個字）' : ''}</span><input id="au-pw" type="password" autocomplete="${m === 'in' ? 'current-password' : 'new-password'}" onkeydown="if(event.key==='Enter')App.auth()"></label>
        <div id="au-err" class="err" style="margin-top:10px"></div>
        <button class="btn primary big block" style="margin-top:12px" id="au-go" onclick="App.auth()">${m === 'in' ? '登入' : '建立帳號'}</button>
      </div>
    </div>`;
  },
};

// ---------- 地圖（MapLibre 向量地圖） ----------
const MapView = {
  map: null, markers: new Map(), meMarker: null, sel: null, style: null,
  // 地圖函式庫很大（800 KB），開 app 時先不載，畫面出來後在背景預先載好
  lib() {
    if (window.maplibregl) return Promise.resolve(true);
    return MapView._lib ||= new Promise(res => {
      const v = 'maplibre-gl@5.6.0', css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = `https://cdn.jsdelivr.net/npm/${v}/dist/maplibre-gl.css`;
      document.head.insertBefore(css, document.querySelector('style'));
      const js = document.createElement('script');
      js.src = `https://cdn.jsdelivr.net/npm/${v}/dist/maplibre-gl.js`;
      js.onload = () => res(true);
      js.onerror = () => { MapView._lib = null; res(false); };
      document.head.appendChild(js);
    });
  },
  prefetch() {
    const go = () => { MapView.lib(); MapView.getStyle(); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
  },
  async getStyle() {
    if (MapView.style) return MapView.style;
    return MapView._style ||= MapView.fetchStyle();
  },
  async fetchStyle() {
    try {
      const j = await (await fetch(MAP_STYLE())).json();
      // 地名優先用中文
      for (const l of j.layers) if (l.layout?.['text-field']) l.layout['text-field'] = ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name']];
      return (MapView.style = j);
    } catch { MapView._style = null; return MAP_STYLE(); }
  },
  async ensure() {
    if (MapView.map) return;
    const [ok, style] = await Promise.all([MapView.lib(), MapView.getStyle()]);
    if (MapView.map || !ok) return;
    const map = MapView.map = new maplibregl.Map({ container: 'bigmap', style, center: S.pos ? [S.pos.lng, S.pos.lat] : TAIPEI, zoom: 12, attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false });
    map.touchZoomRotate.disableRotation();
    map.on('zoom', () => $('#bigmap').classList.toggle('zoomed-out', map.getZoom() < 11.5));
    map.on('click', e => { if (!e.originalEvent.target.closest('.pin')) MapView.select(null); });
    // 地圖版權說明預設收成一個 ⓘ，不要一打開就蓋住下面的店家卡片
    map.once('load', () => { const a = document.querySelector('#bigmap .maplibregl-ctrl-attrib'); a?.classList.remove('maplibregl-compact-show'); a?.removeAttribute('open'); });
    // 標籤不用等地圖圖磚全部載完才放
  },
  pinEl(p) {
    const el = document.createElement('div');
    el.className = `pin ${p.status === 'been' ? 'been' : ''}`;
    el.style.setProperty('--c', cat(p)[2]);
    el.innerHTML = `<div class="pi"><div class="b">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : `<span>${cat(p)[1]}</span>`}</div></div>`;
    el.onclick = ev => { ev.stopPropagation(); MapView.select(p.id, true); };
    return el;
  },
  async sync(fit) {
    await MapView.ensure();
    const map = MapView.map; if (!map) return;
    map.resize();
    const list = visiblePlaces().filter(p => p.lat != null);
    const want = new Set(list.map(p => p.id));
    for (const [id, m] of MapView.markers) if (!want.has(id)) { m.remove(); MapView.markers.delete(id); }
    for (const p of list) {
      const key = p.id, old = MapView.markers.get(key);
      if (old && old._sig === p.updated_at) continue;
      old?.remove();
      const m = new maplibregl.Marker({ element: MapView.pinEl(p), anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
      m._sig = p.updated_at; MapView.markers.set(key, m);
    }
    MapView.cards(list);
    if (fit) {
      // 先看我附近的店（30 公里內），附近沒有才看全部
      const near = S.pos ? list.filter(p => distKm(S.pos, p) < 30) : [];
      const show = near.length ? near : list;
      if (show.length) {
        const b = new maplibregl.LngLatBounds(); show.forEach(p => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: { top: 150, bottom: 260, left: 50, right: 50 }, maxZoom: 15, duration: fit === 'jump' ? 0 : 900 });
      } else if (S.pos) map.jumpTo({ center: [S.pos.lng, S.pos.lat], zoom: 14 });
    }
    MapView.updateMe();
  },
  cards(list) {
    const box = $('#mapcards');
    const sorted = S.pos ? list.slice().sort((a, b) => distKm(S.pos, a) - distKm(S.pos, b)) : list;
    document.body.classList.toggle('no-cards', !sorted.length);
    const html = sorted.map(p => {
      const d = S.pos ? fmtKm(distKm(S.pos, p)) : '';
      return `<div class="mcard ${MapView.sel === p.id ? 'sel' : ''}" data-id="${p.id}" onclick="App.openPlace('${p.id}', false, this.querySelector('.ph'))">
        <div class="ph">${photo(p)}</div>
        <div class="b"><div class="n">${esc(p.name)}</div><div class="m">${cat(p)[1]} ${esc(p.cuisine || cat(p)[0])}${p.price ? '・' + priceTag(p.price) : ''}</div><div class="m">${esc(area(p))}${d ? '・' + d : ''}</div>
          <div class="acts"><a class="btn primary" href="${mapsUrl(p)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${ic('nav')} 導航</a><span class="tag ${p.status === 'been' ? '' : 'hot'}" style="align-self:center">${p.status === 'been' ? '去過' : '想去'}</span></div></div>
      </div>`;
    }).join('');
    // 內容一樣就不重建，不然卡片照片會閃、滑到一半的位置會跳回去
    const key = html.replace(/class="loading"/g, 'class=""');
    if (key !== MapView._cardsKey || !box.children.length) { box.innerHTML = html; MapView._cardsKey = key; }
    // 卡片滑到哪一張，地圖就跟到那間
    clearTimeout(MapView._st);
    box.onscroll = () => {
      clearTimeout(MapView._st);
      MapView._st = setTimeout(() => {
        const mid = box.scrollLeft + box.clientWidth / 2;
        let best = null, bd = 1e9;
        for (const c of box.children) { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = c; } }
        if (best && best.dataset.id !== MapView.sel) MapView.select(best.dataset.id, false, true);
      }, 140);
    };
  },
  select(id, fromPin, fromCards) {
    MapView.sel = id;
    for (const [k, m] of MapView.markers) m.getElement().classList.toggle('sel', k === id);
    for (const c of $('#mapcards').children) c.classList.toggle('sel', c.dataset.id === id);
    if (!id) return;
    buzz(8);
    const p = S.places.find(x => x.id === id);
    if (p?.lat != null) MapView.map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(MapView.map.getZoom(), 14), offset: [0, -60], duration: 600 });
    if (!fromCards) $(`.mcard[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  },
  updateMe(first) {
    const map = MapView.map; if (!map || !S.pos) return;
    if (!MapView.meMarker) {
      const el = document.createElement('div'); el.className = 'me-dot';
      MapView.meMarker = new maplibregl.Marker({ element: el }).setLngLat([S.pos.lng, S.pos.lat]).addTo(map);
    } else MapView.meMarker.setLngLat([S.pos.lng, S.pos.lat]);
    $('#locbtn')?.classList.add('on');
    if (first && S.tab === 'map' && !visiblePlaces().some(p => p.lat != null)) map.easeTo({ center: [S.pos.lng, S.pos.lat], zoom: 14 });
  },
  async locate() {
    buzz(8);
    const pos = await Me.once();
    if (pos && MapView.map) MapView.map.flyTo({ center: [pos.lng, pos.lat], zoom: 15, speed: 1.6 });
  },
  chrome() {
    $('#maptop').innerHTML = `<div class="search">${ic('search')}<input id="q" class="grow" placeholder="搜尋地圖上的店" value="${esc(S.f.q)}" oninput="if(!event.isComposing)App.setF('q', this.value, true)" enterkeyhint="search">${Views.home().replace('icon-btn', 'icon-btn glass')}<button class="me-btn" onclick="App.tab('me')" aria-label="我的">${cloud() && S.me ? esc(initial(S.me.name)) : ic('user')}</button></div>${filterChips({ map: true })}`;
    $('#mapside').innerHTML = `<button class="icon-btn glass ${S.pos ? 'on' : ''}" id="locbtn" onclick="MapView.locate()" aria-label="我的位置">${ic('locate')}</button><button class="icon-btn glass" onclick="MapView.sync(true)" aria-label="看全部">${ic('refresh')}</button>`;
  },
  // 店家詳細、編輯用的小地圖
  async mini(el, p, editable, onPick) {
    if (!el || !await MapView.lib() || !el.isConnected) return null;
    const center = p.lat != null ? [p.lng, p.lat] : S.pos ? [S.pos.lng, S.pos.lat] : TAIPEI;
    const m = new maplibregl.Map({ container: el, style: await MapView.getStyle(), center, zoom: p.lat != null ? 15.5 : 12, attributionControl: false, interactive: editable, dragRotate: false });
    let mk = p.lat != null ? new maplibregl.Marker({ element: MapView.pinEl(p), anchor: 'bottom' }).setLngLat(center).addTo(m) : null;
    if (mk) mk.getElement().onclick = null;
    if (editable) m.on('click', e => {
      if (mk) mk.setLngLat(e.lngLat); else { mk = new maplibregl.Marker({ element: MapView.pinEl(p), anchor: 'bottom' }).setLngLat(e.lngLat).addTo(m); mk.getElement().onclick = null; }
      buzz(8); onPick?.(e.lngLat);
    });
    return m;
  },
};

// ---------- 抽籤 ----------
const Draw = {
  pool() {
    const d = S.draw;
    let list = visiblePlaces({ q: '', city: '', cat: '', status: d.status, scope: d.scope });
    if (d.cities.length) list = list.filter(p => d.cities.includes(normCity(p.city)) || (d.cities.includes('其他') && !CITIES.includes(normCity(p.city))));
    if (d.near && S.pos) list = list.filter(p => p.lat != null && distKm(S.pos, p) <= d.near);
    if (d.cats.length) list = list.filter(p => d.cats.includes(p.category));
    const meal = d.meal === 'now' ? Draw.nowMeal() : d.meal;
    if (meal) list = list.filter(p => !(p.meals || []).length || p.meals.includes(meal));
    if (d.price) list = list.filter(p => !p.price || p.price <= d.price);
    // 同一家的分店只算一次（抽中的是離我最近的那間），不然分店多的店比較容易被抽到
    return brands(list).map(g => g[0]);
  },
  nowMeal() {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h < 17 ? 'tea' : h < 21 ? 'dinner' : 'night';
  },
};

// ---------- 特效 ----------
const FX = {
  confetti(n = 70) {
    const colors = ['#ff6a2b', '#ff3d6e', '#fab005', '#20c997', '#7950f2', '#228be6'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % colors.length]};--dx:${(Math.random() - .5) * 160}px;--r:${Math.random() * 900 - 450}deg;--t:${1.4 + Math.random() * 1.4}s;animation-delay:${Math.random() * .25}s;${Math.random() > .5 ? 'border-radius:50%;width:9px;height:9px' : ''}`;
      document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
    }
  },
  hearts(n = 16) {
    for (let i = 0; i < n; i++) {
      const h = document.createElement('span'); h.className = 'heart-f'; h.textContent = ['💖', '💘', '❤️', '🧡'][i % 4];
      h.style.cssText = `left:${Math.random() * 100}vw;--dx:${(Math.random() - .5) * 120}px;--r:${(Math.random() - .5) * 60}deg;animation-delay:${Math.random() * .8}s;font-size:${22 + Math.random() * 18}px`;
      document.body.appendChild(h); setTimeout(() => h.remove(), 4000);
    }
  },
};

// ---------- 滑卡 ----------
const Swipe = {
  matches(r) {
    const mem = S.members.filter(m => m.group_id === r.group_id);
    const sw = S.swipes.filter(s => s.round_id === r.id);
    return r.place_ids.map(id => {
      const p = S.places.find(x => x.id === id); if (!p) return null;
      const who = sw.filter(s => s.place_id === id && s.liked).map(s => s.user_id);
      return { p, likes: who.length, who, all: mem.length > 1 && who.length === mem.length };
    }).filter(Boolean).sort((a, b) => b.likes - a.likes);
  },
  bind() {
    const card = $('#scard'); if (!card) return;
    let x0 = null, y0 = 0, dx = 0, dy = 0, t0 = 0;
    const like = card.querySelector('.stamp.like'), nope = card.querySelector('.stamp.nope');
    const tl = card.querySelector('.tint.like'), tn = card.querySelector('.tint.nope');
    const back = document.querySelector('.scard.back1');
    card.onpointerdown = e => { x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); card.setPointerCapture(e.pointerId); card.style.transition = 'none'; card.style.animation = 'none'; };
    card.onpointermove = e => {
      if (x0 == null) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      card.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${dx / 16}deg)`;
      like.style.opacity = tl.style.opacity = Math.max(0, Math.min(1, dx / 80)); nope.style.opacity = tn.style.opacity = Math.max(0, Math.min(1, -dx / 80));
      if (back) { const k = Math.min(1, Math.abs(dx) / 140); back.style.transform = `translateY(${14 - 14 * k}px) scale(${.95 + .05 * k})`; }
    };
    card.onpointerup = () => {
      if (x0 == null) return; x0 = null;
      const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
      card.style.transition = 'transform .3s var(--spring)';
      // 沒怎麼動就放開 = 點一下：打開店家頁看詳細
      if (Math.hypot(dx, dy) < 8 && performance.now() - t0 < 400) { App.openPlace(card.dataset.id, false, card.querySelector('.ph')); }
      else if (Math.abs(dx) > 100 || (Math.abs(dx) > 40 && v > .6)) App.swipe(dx > 0);
      else { card.style.transform = ''; like.style.opacity = nope.style.opacity = tl.style.opacity = tn.style.opacity = 0; if (back) { back.style.transition = 'transform .3s'; back.style.transform = ''; } }
      dx = dy = 0;
    };
  },
};

// ---------- 動作 ----------
const App = {
  async boot() {
    const cached = S.painted; S.painted = false;
    if (cloud() && !S.user) localStorage.removeItem('food.cache');
    let sig = null;
    // 剛換發的登入憑證，資料庫的時鐘有時還沒追上（JWT issued at future），等一下再讀，不然會整個空白
    for (let i = 0; ; i++) {
      try { sig = await DB.loadAll(); break; } catch (e) {
        if (i < 4 && /JWT|PGRST30/.test(`${e.code} ${e.message}`)) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
        console.error(e); toast('讀取資料失敗：' + e.message, 5000); break;
      }
    }
    if (cloud() && S.user) {
      const code = load('food.pendingJoin', '');
      if (code) { save('food.pendingJoin', ''); await App.join(code); }
      App.realtime();
      // 分享捷徑在背景收藏的店：切回這個 app 時重新讀一次
      App._sig = sig; App._loadedAt = Date.now();
      if (!App._onShow) document.addEventListener('visibilitychange', App._onShow = async () => {
        if (document.hidden || !S.user || Date.now() - App._loadedAt < 10000) return;
        App._loadedAt = Date.now();
        const now = await DB.loadAll().catch(() => null);
        if (now && now !== App._sig) { App._sig = now; App.refresh(); App.fillCoords(); App.enrich(); }
      });
    }
    if (cached && S.user?.id === cached.uid) {
      // 已經用上次的資料畫好了：資料有變才安靜地更新，不重播動畫、不打斷正在打字或開著的抽屜
      if (sig !== cached.sig) App.refresh();
    } else { S.animate = true; App.render(); App.handleShare(); }
    Me.start(false);
    MapView.prefetch();
    setTimeout(() => { App.fillCoords(); App.enrich(); }, 2500);
  },
  paintCache() {
    const c = DB.peek(); if (!c) return;
    S.painted = { uid: c.uid, sig: JSON.stringify(c) };
    S.animate = true; App.render(); App.handleShare();
  },
  refresh() {
    S.keepScroll = true;
    if (S.tab === 'map' && !$('.sheet-bg')) { MapView.sync(false); return; }
    if ($('.sheet-bg') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || ($('#scard') && $('#scard').style.transform)) { S.stale = true; return; }
    App.render();
  },
  render() {
    const needAuth = cloud() && !S.user;
    const onMap = !needAuth && S.tab === 'map';
    const onRound = !needAuth && S.tab === 'groups' && !!S.round;
    document.body.classList.toggle('on-map', onMap);
    document.body.classList.toggle('on-round', onRound);
    const tabs = $('#tabs');
    tabs.classList.toggle('away', needAuth || onRound);
    const picking = !!S.sel && S.tab === 'list' && !needAuth;
    tabs.classList.toggle('selbar', picking);
    tabs.innerHTML = picking
      ? `<button class="btn ghost" onclick="App.pick(false)">取消</button><span class="grow sel-n">已選 ${S.sel.size} 間</span><button class="btn del" ${S.sel.size ? '' : 'disabled'} onclick="App.delPicked()">${ic('trash')} 刪除</button>`
      : [...TABS.slice(0, 2).map(App.tabBtn), `<button class="add" onclick="App.openAdd()" aria-label="新增店家">${ic('plus')}</button>`, ...TABS.slice(2).map(App.tabBtn)].join('');
    if (needAuth) { $('#top').innerHTML = ''; $('#top').classList.add('hidden'); $('#main').innerHTML = Views.auth(); return; }
    $('#top').classList.toggle('hidden', onRound || (S.tab === 'groups' && !!S.group));
    $('#top').innerHTML = Views.header();
    if (onMap) {
      MapView.chrome();
      const first = !MapView.map || S.animate;
      MapView.sync(first ? (MapView.map ? true : 'jump') : false);
      S.animate = false;
      return;
    }
    const y = window.scrollY;
    const main = $('#main');
    main.classList.toggle('enter', !!S.animate);
    // 不是換頁的重畫（同步、定位、補照片…）不重播卡片進場動畫，不然整頁會閃
    main.classList.toggle('still', !S.animate);
    // 正在搜尋框打字（注音、拼音選字中）時，搜尋框本身不能換掉，不然選字會被打斷、只剩注音：只更新下面的結果
    const q = document.activeElement?.id === 'q' && main.contains(document.activeElement) ? document.activeElement.closest('.search') : null;
    const html = onRound ? Views.round() : Views[S.tab]();
    if (q && q.parentNode === main && !S.animate) {
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      if (tmp.firstElementChild?.matches('.search')) {
        tmp.firstElementChild.remove();
        while (q.nextSibling) q.nextSibling.remove();
        main.append(...tmp.childNodes);
      } else main.innerHTML = html;
    } else main.innerHTML = html;
    S.animate = false;
    if (onRound) Swipe.bind();
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
  },
  tabBtn([k, i, t]) { return `<button class="tab ${S.tab === k ? 'on' : ''}" onclick="App.tab('${k}')">${ic(i)}<span>${t}</span></button>`; },
  tab(t) {
    if (t === S.tab && t === 'groups' && (S.group || S.round)) { S.group = null; S.round = null; }
    else if (t === S.tab && t !== 'me') { window.scrollTo({ top: 0, behavior: 'smooth' }); if (t !== 'map') return; }
    buzz(6); S.sel = null;
    S.tab = t; if (t !== 'me') save('food.tab', t); if (t !== 'groups') S.round = null;
    S.animate = true; App.render(); window.scrollTo(0, 0);
    if (t === 'map') Me.start(true);
  },
  setF(k, v, typing) {
    S.f[k] = v;
    if (typing) {
      clearTimeout(App._qt);
      App._qt = setTimeout(() => {
        if (S.tab === 'map') { MapView.sync(false); return; }
        S.keepScroll = true; App.render();
      }, 180);
    } else {
      buzz(5); S.keepScroll = true;
      if (S.tab === 'map') { MapView.chrome(); MapView.sync(true); } else App.render();
    }
  },
  clearF() { S.f = { ...S.f, q: '', city: '', cat: '', status: '' }; App.render(); },
  async sortNear() {
    if (S.f.sort === 'near') { S.f.sort = 'new'; return App.render(); }
    if (await Me.once()) { S.f.sort = 'near'; S.keepScroll = true; App.render(); }
  },

  // ----- 新增 -----
  openAdd(prefill = '') {
    S.cands = null; buzz(8);
    App.sheet(`<div class="sheet-h"><h2>新增店家</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <button class="btn primary paste-big" onclick="App.pasteClip()">${ic('clip')} 貼上剛剛複製的連結</button>
      <div class="sources"><span>Instagram</span><span>Threads</span><span>TikTok</span><span>Google 地圖</span><span>部落格</span></div>
      <div class="or">或</div>
      <textarea id="add-in" class="input" rows="3" placeholder="在這裡貼上連結，或直接貼貼文文字">${esc(prefill)}</textarea>
      <div class="row" style="margin-top:10px">
        <label class="btn" style="cursor:pointer">${ic('image')} 截圖<input type="file" accept="image/*" class="hidden" onchange="App.addImage(this.files[0])"></label>
        <button class="btn ghost" onclick="App.editPlace(null)">${ic('edit')} 自己填</button>
        <span class="grow"></span>
        <button class="btn dark" id="add-go" onclick="App.addGo()">${ic('spark')} 找店家</button>
      </div>
      <div id="add-out"></div>`);
    if (prefill) App.addGo();
  },
  async pasteClip() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) throw new Error('empty');
      $('#add-in').value = t; App.addGo();
    } catch { $('#add-in').focus(); toast('長按輸入框選「貼上」也可以'); }
  },
  async addImage(file) {
    if (!file) return;
    App.progress(1, '正在看截圖');
    try { App.addRun({ image: await Extract.shrink(file), text: $('#add-in').value.trim() }); }
    catch (e) { $('#add-out').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  },
  addGo() {
    const v = $('#add-in').value.trim();
    if (!v) return toast('先貼上連結或文字');
    const url = (v.match(/https?:\/\/\S+/) || [])[0];
    const rest = url ? v.replace(url, '').trim() : v;
    App.addRun({ url, text: rest.length > 15 ? rest : '' });
  },
  progress(step, label0) {
    const steps = [label0 || '讀取貼文', 'AI 找出店家', '找地圖位置'];
    const out = $('#add-out'); if (!out) return;
    out.innerHTML = `<div class="progress">${steps.map((s, i) => `<div class="${i < step - 1 ? 'done' : i === step - 1 ? 'on' : ''}"><i>${i < step - 1 ? ic('check') : ''}</i>${s}</div>`).join('')}</div>`;
  },
  async addRun(input) {
    const go = $('#add-go'); if (go) go.disabled = true;
    App.progress(1);
    const t = setTimeout(() => $('#add-out .progress') && App.progress(2), 1600);
    try {
      const r = await Extract.run(input);
      clearTimeout(t);
      const src = r.source || {};
      const photoData = src.thumbData || '';
      S.cands = (r.places || []).map(p => ({
        ...p, name: (p.name || '').trim(), city: normCity(p.city) || parseAddr(p.address).city, district: p.district || parseAddr(p.address).district,
        category: CATS[p.category] ? p.category : 'restaurant', meals: (p.meals || []).filter(m => MEALS[m]), price: [1, 2, 3, 4].includes(+p.price) ? +p.price : null,
        dishes: cleanDishes(p.dishes), source_url: src.url || input.url || '', source_text: (src.caption || input.text || '').slice(0, 2000), on: true, photoData,
      })).filter(p => p.name);
      if (!S.cands.length) {
        $('#add-out').innerHTML = `<div class="card" style="margin-top:14px;text-align:center"><div style="font-size:34px">🤔</div><b>沒找到店家</b>${src.caption ? `<p class="muted" style="text-align:left">讀到的文字：${esc(src.caption.slice(0, 240))}</p>` : ''}<p class="muted">可以改貼店名或地址，或自己填。</p><button class="btn" onclick="App.editPlace(null, {source_url: '${esc(input.url || '')}'})">${ic('edit')} 自己填</button></div>`;
        return;
      }
      buzz([10, 40, 10]);
      App.renderCands();
      // 背景補座標
      for (const c of S.cands) {
        if (c.lat != null) continue;
        c.locating = true; App.renderCands();
        const g = await Geo.locate(c);
        c.locating = false;
        if (g) Object.assign(c, { lat: g.lat, lng: g.lng, approx: g.approx, city: c.city || g.city, district: c.district || g.district });
        App.renderCands();
      }
    } catch (e) {
      clearTimeout(t);
      const out = $('#add-out'); if (out) out.innerHTML = `<div class="card" style="margin-top:14px"><p class="err" style="margin:0">${esc(e.message)}</p></div>`;
    } finally { if (go) go.disabled = false; }
  },
  renderCands() {
    const out = $('#add-out'); if (!out || !S.cands) return;
    const dup = c => findDup({ ...c, id: null });
    // 已經收藏過的，預設不勾（還是可以自己勾回來）
    for (const c of S.cands) if (c.dupSeen == null && dup(c)) { c.dupSeen = true; c.on = false; }
    const n = S.cands.filter(c => c.on).length;
    const first = !out.querySelector('.cand');
    out.innerHTML = `<div class="section-t" style="margin-top:18px">${ic('spark')} 找到 ${S.cands.length} 間<span class="muted" style="font-weight:500;font-size:13px">名稱、分類可以直接改</span></div>
      ${S.cands.map((c, i) => `<div class="cand ${c.on ? 'on' : 'off'}" style="${first ? `animation-delay:${i * 70}ms` : 'animation:none'}">
        <div class="ph" style="position:relative" onclick="S.cands[${i}].on=!S.cands[${i}].on;App.renderCands()">${photo({ ...c, photo: c.photoData })}<span class="tick">${ic('check')}</span></div>
        <div class="grow">
          <input class="nm" value="${esc(c.name)}" onchange="S.cands[${i}].name=this.value">
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc([c.district, c.address].filter(Boolean).join('・') || '沒有地址')}${c.price ? '・' + PRICES[c.price] : ''}</div>
          <div class="mini-sel">
            <label class="chip">${cat(c)[1]} ${cat(c)[0]} ▾<select onchange="S.cands[${i}].category=this.value;App.renderCands()">${Object.entries(CATS).map(([k, [t, e]]) => `<option value="${k}" ${c.category === k ? 'selected' : ''}>${e} ${t}</option>`).join('')}</select></label>
            <label class="chip">${esc(c.city || '地區？')} ▾<select onchange="S.cands[${i}].city=this.value;App.renderCands()"><option value="">地區？</option>${[...new Set([...CITIES, c.city].filter(Boolean))].map(x => `<option ${c.city === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          </div>
          <div class="loc ${c.lat != null ? 'ok' : ''}">${c.locating ? '<span class="spin" style="width:12px;height:12px;border-width:2px"></span> 找地圖位置…' : c.lat != null ? `${ic('pin')} ${c.approx ? '已找到大概位置' : '已找到位置'}` : `${ic('pin')} 找不到位置，存好後可以補`}</div>
          ${c.note ? `<div class="muted" style="margin-top:4px">💬 ${esc(c.note)}</div>` : ''}
          ${c.dishes.length ? `<div class="dish-line">${ic('star')} 必點：${esc(c.dishes.join('、'))}</div>` : ''}
          ${dup(c) ? `<div class="dup-note">${ic('layers')} 已經收藏過「${esc(dup(c).name)}」${c.on ? '，會再存一筆' : ''}</div>` : ''}
        </div>
      </div>`).join('')}
      ${cloud() && S.groups.length ? `<div class="fgroup"><div class="t">同時分享到群組</div><div class="chips wrap">${S.groups.map(g => `<span class="chip ${(S.addGroups || []).includes(g.id) ? 'on' : ''}" onclick="App.toggleAddGroup('${g.id}')">${ic('users')} ${esc(g.name)}</span>`).join('')}</div></div>` : ''}
      <div class="sticky-foot"><button class="btn primary big block" id="savec" ${n ? '' : 'disabled'} onclick="App.saveCands()">${ic('heart')} 收藏 ${n} 間</button></div>`;
  },
  toggleAddGroup(id) {
    const a = S.addGroups || []; S.addGroups = a.includes(id) ? a.filter(x => x !== id) : [...a, id];
    save('food.addGroups', S.addGroups); App.renderCands();
  },
  async saveCands() {
    const pick = S.cands.filter(c => c.on);
    const btn = $('#savec'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="border-top-color:#fff"></span> 收藏中…'; }
    try {
      const photos = new Map();
      const saved = [];
      for (const c of pick) {
        let ph = '';
        if (c.photoData) { if (!photos.has(c.photoData)) photos.set(c.photoData, await Photo.store(c.photoData)); ph = photos.get(c.photoData); }
        const p = { name: c.name, branch: c.branch || '', address: c.address || '', city: c.city || '', district: c.district || '', lat: c.lat ?? null, lng: c.lng ?? null, approx: !!c.approx,
          category: c.category, cuisine: c.cuisine || '', price: c.price, meals: c.meals || [], hours: c.hours || '', status: 'want', rating: null, note: c.note || '', tags: (c.tags || []).slice(0, 6), dishes: c.dishes || [],
          source_url: c.source_url || '', source_text: c.source_text || '', photo: ph };
        saved.push(await DB.savePlace(p));
      }
      if (cloud()) for (const g of (S.addGroups || []).filter(id => S.groups.some(x => x.id === id))) await App.share(g, saved.map(p => p.id), true);
      App.close(); buzz([12, 50, 12]); FX.confetti(40); toast(`收藏了 ${saved.length} 間 🎉`);
      if (S.tab !== 'map' && S.tab !== 'list') S.tab = 'list';
      S.animate = true; App.render();
    } catch (e) { toast('儲存失敗：' + e.message, 5000); if (btn) { btn.disabled = false; btn.textContent = '再試一次'; } }
  },

  // ----- 店家詳細／編輯 -----
  openPlace(id, keep, from) {
    const p = S.places.find(x => x.id === id); if (!p) return;
    const [t, e] = cat(p);
    const mine = isMine(p);
    const myGroups = S.groups.filter(g => S.groupPlaces.some(x => x.group_id === g.id && x.place_id === p.id));
    const shareText = `${p.name}${p.branch ? ' ' + p.branch : ''}\n${p.address || area(p)}\n${mapsUrl(p)}`;
    const dist = S.pos && p.lat != null ? fmtKm(distKm(S.pos, p)) : '';
    const badge = mine ? p.status === 'been' ? `<span class="badge been">${ic('check')} 去過${p.rating ? ' ★' + p.rating : ''}</span>` : '' : `<span class="badge">${avatar(p.owner, 18)} ${esc(nameOf(p.owner))} 的收藏</span>`;
    App.sheet(`<div class="d-bar"><div class="d-bar-in"><span class="t">${esc(p.name)}</span><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div></div>
      <div class="hero-ph">${photo(p)}<div class="hero-cap">${badge}
        <div class="d-name">${esc(p.name)}${p.branch ? `<small>${esc(p.branch)}</small>` : ''}</div>
        <div class="d-meta">${[`${e} ${esc(p.cuisine || t)}`, esc(area(p)), p.price ? PRICES[p.price] : '', dist].filter(Boolean).join('<span class="dot">・</span>')}</div>
      </div></div>
      <div class="acts">
        <a class="act primary" href="${mapsUrl(p)}" target="_blank" rel="noopener"><span class="ic">${ic('nav')}</span>導航</a>
        ${igEmbed(p.source_url) ? `<button class="act" onclick="Reel.show()"><span class="ic">${ic(isReel(p.source_url) ? 'play' : 'image')}</span>${isReel(p.source_url) ? '看影片' : '看貼文'}</button>` : p.source_url ? `<a class="act" href="${esc(p.source_url)}" target="_blank" rel="noopener"><span class="ic">${ic('ext')}</span>原始貼文</a>` : `<button class="act" onclick="App.copy(${esc(JSON.stringify(p.address || p.name))})"><span class="ic">${ic('copy')}</span>複製地址</button>`}
        <button class="act" onclick="App.shareOut(${esc(JSON.stringify(shareText))})"><span class="ic">${ic('share')}</span>分享</button>
        ${mine ? `<button class="act" onclick="App.editPlace('${p.id}')"><span class="ic">${ic('edit')}</span>編輯</button>` : `<button class="act" onclick="App.copyToMine('${p.id}')"><span class="ic">${ic('heart')}</span>收進我的</button>`}
      </div>
      ${mine ? `<div class="d-status"><div class="seg"><button class="${p.status === 'want' ? 'on' : ''}" onclick="App.quick('${p.id}', {status:'want'})">想去</button><button class="${p.status === 'been' ? 'on' : ''}" onclick="App.quick('${p.id}', {status:'been'})">去過了</button></div>
        ${p.status === 'been' ? `<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button class="${(p.rating || 0) >= n ? 'on' : ''}" onclick="App.quick('${p.id}', {rating:${n}})" aria-label="${n} 星">${ic('star')}</button>`).join('')}</div>` : ''}</div>` : ''}
      ${(br => br.length > 1 ? `<div class="branch-row"><div class="t">${ic('pin')} ${br.length} 間分店${S.pos ? '・由近到遠' : ''}</div><div class="chips">${br.map(b => `<span class="chip ${b.id === p.id ? 'on' : ''}" onclick="App.openPlace('${b.id}', true)">${esc(branchLabel(b))}${S.pos && b.lat != null ? ` <small>${fmtKm(distKm(S.pos, b))}</small>` : ''}</span>`).join('')}</div></div>` : '')(branchesOf(p))}
      ${(p.dishes || []).length ? `<div class="must"><div class="t">${ic('star')} 必點</div><div class="chips wrap">${p.dishes.map(x => `<span class="dish">${esc(x)}</span>`).join('')}</div></div>` : ''}
      ${(p.meals || []).length || (p.tags || []).length ? `<div class="tags">${(p.meals || []).map(m => `<span class="tag hot">${MEALS[m]}</span>`).join('')}${(p.tags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="info">
        <div>${ic('pin')}<div class="grow">${esc(p.address || area(p) || '沒有地址')}${dist ? `<div class="muted">距離你 ${dist}${p.approx ? '・位置是大概的' : ''}</div>` : p.approx ? '<div class="muted">位置是大概的，可以在編輯裡修正</div>' : ''}</div>${p.address ? `<button class="link-btn" onclick="App.copy(${esc(JSON.stringify(p.address))})">複製</button>` : ''}</div>
        ${p.hours ? `<div>${ic('clock')}<div class="grow" style="white-space:pre-wrap">${esc(p.hours)}</div></div>` : ''}
        ${p.note ? `<div>${ic('msg')}<div class="grow">${esc(p.note)}</div></div>` : ''}
      </div>
      ${p.lat != null ? `<a id="mini" class="minimap" href="${mapsUrl(p)}" target="_blank" rel="noopener" aria-label="在 Google 地圖打開"></a>` : mine ? '<p class="muted" style="margin-top:12px">還沒有地圖位置，到「編輯」裡點地圖就能補上。</p>' : ''}
      ${p.source_url || p.source_text ? `<div class="post"><div class="post-h"><span class="src">${esc(srcName(p.source_url))}</span>${p.source_url ? `<a class="btn sm" href="${esc(p.source_url)}" target="_blank" rel="noopener">${ic('ext')} ${igEmbed(p.source_url) ? '在 IG 打開' : '看原始貼文'}</a>` : ''}</div>${igEmbed(p.source_url) ? `<div class="reel" data-src="${igEmbed(p.source_url)}"><div class="reel-ph">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : ''}<span class="reel-play">${ic('play')}</span><span class="reel-msg">影片載入中…</span></div></div>` : ''}${p.source_text ? `<p class="post-t" onclick="this.classList.toggle('open')">${esc(p.source_text)}</p>` : ''}</div>` : ''}
      ${mine && cloud() && S.groups.length ? `<div class="fgroup"><div class="t">分享到群組</div><div class="chips wrap">${S.groups.map(g => { const on = myGroups.includes(g); return `<span class="chip ${on ? 'on' : ''}" onclick="App.${on ? 'unshare' : 'share'}('${g.id}', ['${p.id}']).then(() => App.openPlace('${p.id}', true))">${on ? ic('check') : ic('users')} ${esc(g.name)}</span>`; }).join('')}</div></div>` : ''}
      ${mine && findDup(p) ? `<button class="dup-hint" onclick="App.dups('${p.id}')">${ic('layers')}<span class="grow">好像和「${esc(findDup(p).name)}」是同一間</span><b>整理</b></button>` : ''}
      ${mine ? `<button class="btn ghost danger block del-row" onclick="App.delPlace('${p.id}')">${ic('trash')} 刪除這間收藏</button>` : ''}`, { cls: 'place', keep, zoom: !!from });
    // 往下捲過照片，頂部出現店名列
    const sh = $('#sheet .sheet');
    sh.onscroll = () => { const hero = sh.querySelector('.hero-ph'); const on = !!hero && sh.scrollTop > hero.offsetHeight - 64; sh.querySelector('.d-bar')?.classList.toggle('on', on); sh.classList.toggle('scrolled', on); };
    sh.onscroll();
    if (!keep) { S.flyFrom = from && from.isConnected ? from : null; S.flyId = id; if (from) App.flyIn(from); }
    // 等抽屜滑上來再建小地圖，不然 iPhone 上滑動會卡一下
    if (p.lat != null && !S.miniMap) setTimeout(async () => { const el = $('#mini'); if (el && !S.miniMap) S.miniMap = await MapView.mini(el, p, false); }, keep ? 0 : 480);
    setTimeout(() => Reel.watch(), keep ? 0 : 500);
  },
  // 卡片照片放大成店家頁的大照片（像 App Store 的卡片），關掉時再縮回卡片
  fly(fromRect, toRect, img, r0, r1, ms) {
    const g = document.createElement('div'); g.className = 'fly';
    g.append(img);
    const box = r => ({ top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    Object.assign(g.style, box(fromRect), { borderRadius: r0 });
    document.body.append(g);
    const a = g.animate([{ ...box(fromRect), borderRadius: r0 }, { ...box(toRect), borderRadius: r1 }], { duration: ms, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'forwards' });
    return new Promise(res => { a.onfinish = a.oncancel = () => res(g); });
  },
  // 照片框本身沒有圓角時（滑卡、抽籤），用外框的圓角
  radius(el) { const r = getComputedStyle(el).borderRadius; return parseFloat(r) ? r : getComputedStyle(el.parentNode).borderRadius; },
  photoClone(el) {
    const src = el.querySelector(':scope>img,:scope>.placeholder'); if (!src) return null;
    const c = src.cloneNode(true); c.classList.remove('loading'); c.removeAttribute('loading'); c.removeAttribute('onload');
    return c;
  },
  async flyIn(from) {
    const hero = $('#sheet .hero-ph'), sh = $('#sheet .sheet');
    const a = from.getBoundingClientRect(), img = App.photoClone(from), r0 = App.radius(from);
    if (!hero || !img || a.bottom < 0 || a.top > innerHeight || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 抽屜還沒滑到定位，用 offsetTop 算照片最後的位置（不受 transform 影響）
    const b = { top: hero.offsetTop + (sh.offsetParent === hero.offsetParent ? 0 : sh.offsetTop), left: hero.offsetLeft, width: hero.offsetWidth, height: hero.offsetHeight };
    hero.classList.add('flying'); from.classList.add('lifted');
    const g = await App.fly(a, b, img, r0, '28px 28px 0 0', 460);
    hero.classList.remove('flying'); from.classList.remove('lifted');
    requestAnimationFrame(() => g.remove());
  },
  flyOut(sh) {
    const hero = sh.querySelector('.hero-ph');
    let to = S.flyFrom;
    if (to && !to.isConnected) to = document.querySelector(`.pcard[data-id="${S.flyId}"] .ph`);
    S.flyFrom = null;
    if (!hero || !to || sh.scrollTop > hero.offsetHeight * .6 || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const a = hero.getBoundingClientRect(), b = to.getBoundingClientRect(), img = App.photoClone(hero);
    if (!img || b.bottom < 0 || b.top > innerHeight) return false;
    hero.classList.add('flying');
    to.classList.add('lifted');
    App.fly(a, b, img, '28px 28px 0 0', App.radius(to), 400).then(g => { to.classList.remove('lifted'); requestAnimationFrame(() => g.remove()); });
    return true;
  },
  async quick(id, patch) {
    const p = S.places.find(x => x.id === id); if (!p) return;
    buzz(8);
    if (patch.status === 'been' && p.status !== 'been') FX.confetti(30);
    // 先換畫面再存，按下去馬上有反應；存失敗再改回來
    const before = { ...p };
    const show = () => { S.keepScroll = true; App.render(); if ($('.sheet-bg')) App.openPlace(id, true); };
    Object.assign(p, patch); show();
    try { await DB.savePlace({ ...p }); }
    catch (e) { Object.assign(S.places.find(x => x.id === id) || {}, before); show(); toast('儲存失敗：' + e.message); }
  },
  editPlace(id, base = {}) {
    const p = id ? { ...S.places.find(x => x.id === id) } : { name: '', branch: '', address: '', city: '', district: '', lat: null, lng: null, approx: false, category: 'restaurant', cuisine: '', price: null, meals: [], hours: '', status: 'want', rating: null, note: '', tags: [], dishes: [], source_url: '', source_text: '', photo: '', ...base };
    S.edit = p;
    const f = (k, label, ph = '') => `<label class="field"><span>${label}</span><input value="${esc(p[k] || '')}" placeholder="${ph}" onchange="S.edit.${k}=this.value"></label>`;
    App.sheet(`<div class="sheet-h"><h2>${id ? '編輯店家' : '自己新增'}</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <div class="photo-edit" id="ed-photo">${photo(p)}<label class="btn sm" style="cursor:pointer">${ic('image')} ${p.photo ? '換照片' : '加照片'}<input type="file" accept="image/*" class="hidden" onchange="App.pickPhoto(this.files[0])"></label></div>
      <div class="two">${f('name', '店名 *')}${f('branch', '分店')}</div>
      <label class="field"><span>地址</span><div class="row"><input class="grow" id="ed-addr" value="${esc(p.address)}" onchange="S.edit.address=this.value;Object.assign(S.edit, Object.fromEntries(Object.entries(parseAddr(this.value)).filter(([k, v]) => v && !S.edit[k])))"><button class="btn" onclick="App.geoEdit()">${ic('locate')} 找位置</button></div></label>
      <div id="mini" class="minimap"></div><p class="muted" id="pinmsg" style="margin:6px 2px 0">點地圖可以放置或移動位置。</p>
      <div class="two">
        <label class="field"><span>縣市</span><select onchange="S.edit.city=this.value"><option value="">—</option>${[...new Set([...CITIES, p.city].filter(Boolean))].map(c => `<option ${normCity(p.city) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        ${f('district', '區', '大安區')}
        <label class="field"><span>分類</span><select onchange="S.edit.category=this.value">${Object.entries(CATS).map(([k, [t, e]]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${e} ${t}</option>`).join('')}</select></label>
        ${f('cuisine', '料理類型', '日式拉麵')}
        <label class="field"><span>每人預算</span><select onchange="S.edit.price=+this.value||null"><option value="">不知道</option>${Object.entries(PRICES).map(([k, t]) => `<option value="${k}" ${+p.price === +k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${f('hours', '營業時間')}
      </div>
      <div class="fgroup"><div class="t">適合時段</div><div class="chips wrap">${Object.entries(MEALS).map(([k, t]) => `<span class="chip ${p.meals.includes(k) ? 'on' : ''}" onclick="this.classList.toggle('on');S.edit.meals=S.edit.meals.includes('${k}')?S.edit.meals.filter(x=>x!=='${k}'):[...S.edit.meals,'${k}']">${t}</span>`).join('')}</div></div>
      <label class="field"><span>筆記</span><textarea rows="2" onchange="S.edit.note=this.value">${esc(p.note)}</textarea></label>
      <label class="field"><span>標籤（用空白或逗號分開）</span><input value="${esc((p.tags || []).join(' '))}" onchange="S.edit.tags=this.value.split(/[\\s,，、]+/).filter(Boolean)"></label>
      <label class="field"><span>必點菜色（用逗號或頓號分開）</span><input value="${esc((p.dishes || []).join('、'))}" onchange="S.edit.dishes=cleanDishes(this.value.split(/[,，、\n]+/))"></label>
      ${f('source_url', '來源連結', 'https://')}
      <div class="sticky-foot row">${id ? `<button class="btn danger" onclick="App.delPlace('${id}')">${ic('trash')}</button>` : ''}<button class="btn grow" onclick="App.close()">取消</button><button class="btn primary grow" id="ed-save" onclick="App.saveEdit()">儲存</button></div>`);
    setTimeout(async () => { S.miniMap = await MapView.mini($('#mini'), p, true, ll => { S.edit.lat = ll.lat; S.edit.lng = ll.lng; S.edit.approx = false; $('#pinmsg').textContent = '📍 位置已更新'; }); }, 430);
  },
  async pickPhoto(file) {
    if (!file) return;
    const box = $('#ed-photo'); box.style.opacity = .6;
    const url = await Photo.store(file);
    box.style.opacity = 1;
    if (!url) return toast('照片存不起來，請再試一次');
    S.edit.photo = url;
    box.querySelector('img,.placeholder').outerHTML = photo(S.edit);
  },
  async geoEdit() {
    const e = S.edit; e.address = $('#ed-addr').value;
    $('#pinmsg').innerHTML = '<span class="spin"></span> 找位置中…';
    const g = await Geo.locate(e);
    if (!g) { $('#pinmsg').textContent = '找不到，請直接點地圖。'; return; }
    Object.assign(e, { lat: g.lat, lng: g.lng, approx: g.approx, city: e.city || g.city, district: e.district || g.district });
    S.miniMap?.remove();
    S.miniMap = await MapView.mini($('#mini'), e, true, ll => { e.lat = ll.lat; e.lng = ll.lng; e.approx = false; $('#pinmsg').textContent = '📍 位置已更新'; });
    $('#pinmsg').textContent = g.approx ? '📍 找到大概位置，可以點地圖修正' : '📍 找到了';
  },
  async saveEdit() {
    const e = S.edit;
    if (!e.name?.trim()) return toast('店名要填');
    e.city = normCity(e.city);
    const d = !e.id && findDup({ ...e, id: null });
    if (d && !await App.confirm(`已經收藏過「${d.name}」`, `${d.address || area(d) || ''}\n還是要再存一筆嗎？`, '還是要存')) return;
    try {
      const saved = await DB.savePlace(e); App.close(); toast('已儲存'); buzz(10); S.keepScroll = true; App.render();
      if (needsEnrich(saved)) App.enrich([saved]);
      // 沒點地圖也沒按「找位置」，就在背景用地址補上位置
      if (saved.lat == null && (saved.address || saved.city)) {
        const g = await Geo.locate(saved);
        if (g) { await DB.savePlace({ ...S.places.find(x => x.id === saved.id), lat: g.lat, lng: g.lng, approx: g.approx, city: saved.city || g.city, district: saved.district || g.district }); S.keepScroll = true; if (!$('.sheet-bg')) App.render(); }
      }
    } catch (err) { toast('儲存失敗：' + err.message, 5000); }
  },
  // 刪掉後幾秒內可以按「復原」，所以單筆不用再問一次
  async delPlace(id) { App.close(); await App.removePlaces([id]); },
  async removePlaces(ids, msg) {
    const rows = S.places.filter(p => ids.includes(p.id) && isMine(p)).map(p => ({ ...p }));
    if (!rows.length) return false;
    const shares = S.groupPlaces.filter(g => ids.includes(g.place_id)).map(g => ({ ...g }));
    try { await DB.deletePlaces(rows.map(p => p.id)); }
    catch (e) { toast('刪除失敗：' + e.message); return false; }
    buzz(10); S.keepScroll = true;
    if (S.tab === 'map') MapView.sync(false); else App.render();
    toast(msg || (rows.length > 1 ? `刪除了 ${rows.length} 間` : `刪除了「${rows[0].name}」`), 6000, { label: '復原', run: async () => {
      try { await DB.restore(rows, shares); buzz(8); S.keepScroll = true; if (S.tab === 'map') MapView.sync(false); else App.render(); toast('已復原'); }
      catch (e) { toast('復原失敗：' + e.message, 5000); }
    } });
    return true;
  },

  // ----- 選取多間一起刪 -----
  cardTap(id, el) {
    if (App._lp) { App._lp = false; return; }
    if (!S.sel || S.tab !== 'list') return App.openPlace(id, false, el?.querySelector('.ph'));
    const p = S.places.find(x => x.id === id); if (!p || !isMine(p)) return toast('朋友分享的店不能刪');
    buzz(5); S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id);
    App.pickPaint();
  },
  // 只更新勾勾和底下的數字，不重畫整頁
  pickPaint() {
    for (const c of document.querySelectorAll('.grid.picking .pcard')) c.classList.toggle('picked', S.sel.has(c.dataset.id));
    const n = $('#tabs .sel-n'); if (n) n.textContent = `已選 ${S.sel.size} 間`;
    const d = $('#tabs .del'); if (d) d.disabled = !S.sel.size;
    const all = $('.count-line .link-btn'); if (all) all.textContent = visiblePlaces().filter(isMine).every(p => S.sel.has(p.id)) ? '全部取消' : '全選';
  },
  pick(on = true, first) {
    buzz(on ? [8, 30, 8] : 6);
    S.sel = on ? new Set(first ? [first] : []) : null;
    S.keepScroll = true; App.render();
  },
  pickAll() {
    const ids = visiblePlaces().filter(isMine).map(p => p.id);
    const all = ids.every(id => S.sel.has(id));
    S.sel = new Set(all ? [] : ids); buzz(6); App.pickPaint();
  },
  async delPicked() {
    const ids = [...S.sel]; if (!ids.length) return;
    const shared = S.groupPlaces.some(g => ids.includes(g.place_id));
    if (ids.length > 1 && !await App.confirm(`刪除 ${ids.length} 間收藏？`, shared ? '有些分享在群組裡，群組也會一起拿掉。刪掉後幾秒內可以復原。' : '刪掉後幾秒內可以復原。', '刪除', true)) return;
    S.sel = null;
    if (!await App.removePlaces(ids)) App.render();
  },

  // ----- 重複店家：比對、合併 -----
  dups(focus) {
    const groups = dupGroups();
    if (!groups.length) { App.close(); toast('沒有重複的店了 👍'); S.keepScroll = true; App.render(); return; }
    if (focus) groups.sort((a, b) => b.some(p => p.id === focus) - a.some(p => p.id === focus));
    S.dupKeep = S.dupKeep || {};
    const when = p => p.created_at ? new Date(p.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) + ' 收藏' : '';
    const info = p => [p.photo ? '有照片' : '', (p.dishes || []).length ? `必點 ${p.dishes.length} 道` : '', p.lat != null ? (p.approx ? '大概位置' : '有位置') : '沒有位置', p.status === 'been' ? `去過${p.rating ? ' ★' + p.rating : ''}` : '', S.groupPlaces.some(g => g.place_id === p.id) ? '分享在群組' : ''].filter(Boolean).join('・');
    const html = groups.map((g, gi) => {
      g.sort((a, b) => richness(b) - richness(a));
      const key = g.map(p => p.id).sort().join('|');
      const keep = g.some(p => p.id === S.dupKeep[key]) ? S.dupKeep[key] : g[0].id;
      const far = g.every(p => p.lat != null) ? Math.max(...g.flatMap(a => g.map(b => distKm(a, b)))) : null;
      return `<div class="dup-group" style="--i:${gi}" data-key="${key}">
        <div class="dup-why">${far != null ? far < 0.015 ? '同一個位置・' : `相距 ${fmtKm(far)}・` : ''}${new Set(g.map(p => nk(p.name))).size === 1 ? '店名相同' : '店名相近'}</div>
        ${g.map(p => `<label class="dup-row ${p.id === keep ? 'keep' : ''}">
          <input type="radio" name="k${gi}" ${p.id === keep ? 'checked' : ''} onchange="S.dupKeep['${key}']='${p.id}';App.dupPaint(this)" value="${p.id}">
          <div class="ph">${photo(p)}</div>
          <div class="grow"><div class="n">${esc(p.name)}${p.branch ? ` <span class="muted">${esc(p.branch)}</span>` : ''}</div>
            <div class="m">${esc(p.address || area(p) || '沒有地址')}</div>
            <div class="m m2">${esc([when(p), info(p)].filter(Boolean).join('・'))}</div></div>
          <span class="keep-tag">保留</span>
        </label>`).join('')}
        <div class="row dup-acts"><button class="btn" onclick="App.notDup('${key}')">不是同一間</button><button class="btn primary grow" onclick="App.merge('${key}')">${ic('layers')} 合併成一間</button></div>
      </div>`;
    }).join('');
    App.sheet(`<div class="sheet-h"><h2>可能重複的店</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <p class="muted" style="margin:-4px 2px 14px">選要保留哪一筆。合併時另一筆的照片、必點、筆記、位置、群組分享會補進來，再把它刪掉。</p>
      ${html}`, { keep: !!$('#sheet .dup-group') });
  },
  dupPaint(r) { for (const row of r.closest('.dup-group').querySelectorAll('.dup-row')) row.classList.toggle('keep', row.contains(r)); buzz(5); },
  notDup(key) {
    const ids = key.split('|'), ok = load('food.notDup', []);
    for (const a of ids) for (const b of ids) if (a < b) ok.push(pairKey(a, b));
    save('food.notDup', [...new Set(ok)]); buzz(6);
    App.dupOut(key, () => App.dups());
  },
  // 這組滑掉，再刷新清單
  dupOut(key, then) {
    const el = $(`.dup-group[data-key="${key}"]`);
    if (el) { el.style.height = el.offsetHeight + 'px'; el.offsetHeight; el.classList.add('out'); }
    setTimeout(then, el ? 320 : 0);
  },
  async merge(key) {
    const ids = key.split('|');
    const keepId = ids.includes(S.dupKeep?.[key]) ? S.dupKeep[key] : $(`.dup-group[data-key="${key}"] input:checked`)?.value || ids[0];
    const keep = { ...S.places.find(p => p.id === keepId) };
    const others = S.places.filter(p => ids.includes(p.id) && p.id !== keepId);
    for (const o of others) {
      for (const k of ['photo', 'branch', 'address', 'city', 'district', 'cuisine', 'hours', 'note', 'source_url', 'source_text']) if (!keep[k] && o[k]) keep[k] = o[k];
      if (!keep.price && o.price) keep.price = o.price;
      if (o.lat != null && (keep.lat == null || (keep.approx && !o.approx))) Object.assign(keep, { lat: o.lat, lng: o.lng, approx: o.approx });
      keep.dishes = cleanDishes([...(keep.dishes || []), ...(o.dishes || [])]);
      keep.tags = [...new Set([...(keep.tags || []), ...(o.tags || [])])].slice(0, 8);
      keep.meals = [...new Set([...(keep.meals || []), ...(o.meals || [])])];
      if (o.status === 'been') keep.status = 'been';
      if ((o.rating || 0) > (keep.rating || 0)) keep.rating = o.rating;
      if (o.note && keep.note && !keep.note.includes(o.note)) keep.note = `${keep.note}\n${o.note}`;
    }
    const btn = $(`.dup-group[data-key="${key}"] .btn.primary`); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="border-top-color:#fff"></span> 合併中…'; }
    try {
      await DB.savePlace(keep);
      // 另一筆分享過的群組，改成分享保留的這筆
      if (cloud()) for (const gid of new Set(S.groupPlaces.filter(g => others.some(o => o.id === g.place_id)).map(g => g.group_id))) await App.share(gid, [keepId], true);
      await DB.deletePlaces(others.map(o => o.id));
      buzz([10, 40, 10]); toast(`合併好了，留下「${keep.name}」`);
      S.keepScroll = true; App.render();
      App.dupOut(key, () => App.dups());
    } catch (e) { toast('合併失敗：' + e.message, 5000); if (btn) { btn.disabled = false; btn.textContent = '再試一次'; } }
  },
  async copyToMine(id) {
    const p = { ...S.places.find(x => x.id === id) };
    for (const k of ['id', 'owner', 'created_at', 'updated_at']) delete p[k];
    Object.assign(p, { status: 'want', rating: null });
    try { const n = await DB.savePlace(p); buzz(10); toast('已收進你的收藏 💛'); App.render(); App.openPlace(n.id); }
    catch (e) { toast('失敗：' + e.message); }
  },
  copy(t) { navigator.clipboard?.writeText(t).then(() => toast('已複製'), () => toast('複製失敗')); },
  shareOut(t) { if (navigator.share) navigator.share({ text: t }).catch(() => {}); else App.copy(t); },

  // ----- 抽籤 -----
  drawSet(k, v, multi) {
    const d = S.draw;
    if (multi) d[k] = d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v];
    else d[k] = v;
    buzz(5); save('food.draw', d); S.keepScroll = true; App.render();
  },
  async drawNear() {
    if (S.draw.near) return App.drawSet('near', 0, false);
    if (await Me.once()) App.drawSet('near', 3, false);
  },
  async doDraw(exclude) {
    const d = S.draw;
    let pool = Draw.pool();
    if (exclude) d.recent = [exclude, ...d.recent.filter(x => x !== exclude)];
    const recent = new Set(d.recent.slice(0, 5).map(id => S.places.find(p => p.id === id)).filter(Boolean).map(brandOf));
    const fresh = pool.filter(p => !recent.has(brandOf(p)));
    if (fresh.length) pool = fresh;
    if (!pool.length) return toast('沒有可以抽的店');
    const slot = $('#slot'), cta = $('#drawcta');
    slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cta.querySelectorAll('button,a').forEach(b => b.disabled = true);
    slot.classList.remove('idle', 'win');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const face = (p, final) => `<div class="ph">${photo(p)}</div><div class="cap"><div class="k">${final ? '今天就吃' : '・・・'}</div><div class="n">${esc(p.name)}</div><div class="m">${cat(p)[1]} ${esc(p.cuisine || cat(p)[0])}${final && branchesOf(p).length > 1 ? `・${esc(branchLabel(p))}（${branchesOf(p).length} 間分店${S.pos ? '裡最近的' : ''}）` : area(p) ? '・' + esc(area(p)) : ''}${p.price ? '・' + PRICES[p.price] : ''}${S.pos && p.lat != null ? '・' + fmtKm(distKm(S.pos, p)) : ''}</div></div>`;
    // 先快後慢地翻牌
    const n = Math.min(18, 8 + pool.length * 2);
    for (let i = 0, t = 60; i < n; i++, t *= 1.13) {
      const p = i === n - 1 ? pick : pool[Math.floor(Math.random() * pool.length)];
      slot.innerHTML = face(p, i === n - 1);
      slot.classList.remove('flip'); void slot.offsetWidth; slot.classList.add('flip');
      buzz(4);
      await sleep(t);
    }
    slot.classList.remove('flip'); slot.classList.add('win');
    buzz([15, 60, 25]); FX.confetti();
    d.recent = [pick.id, ...d.recent.filter(x => x !== pick.id)].slice(0, 10); save('food.draw', d);
    slot.onclick = () => App.openPlace(pick.id, false, slot.querySelector('.ph'));
    cta.innerHTML = `<a class="btn primary big" href="${mapsUrl(pick)}" target="_blank" rel="noopener">${ic('nav')} 就這間</a><button class="btn big" onclick="App.doDraw('${pick.id}')">${ic('refresh')} 換一間</button>`;
  },

  // ----- 帳號 -----
  async auth() {
    const email = $('#au-email').value.trim(), pw = $('#au-pw').value, err = $('#au-err'), go = $('#au-go');
    err.textContent = ''; go.disabled = true;
    try {
      if (S.authMode === 'up') {
        const name = $('#au-name').value.trim();
        if (!name) throw new Error('請填名字');
        const { data, error } = await S.sb.auth.signUp({ email, password: pw, options: { data: { name } } });
        if (error) throw error;
        if (!data.session) { err.textContent = '帳號建好了，請到信箱點確認信再回來登入。'; S.authMode = 'in'; }
      } else {
        const { error } = await S.sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e) {
      err.textContent = /Invalid login/.test(e.message) ? 'Email 或密碼不對' : /already registered/.test(e.message) ? '這個 Email 已經註冊過，請直接登入' : e.message;
      $('.auth .box')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    } finally { if (go) go.disabled = false; }
  },
  async signOut() { if (await App.confirm('要登出嗎？', '', '登出', true)) await S.sb.auth.signOut(); },
  async renameMe() {
    const name = (await App.ask('你的名字', '群組裡的朋友會看到這個名字', S.me?.name))?.trim(); if (!name) return;
    try { await DB.q(S.sb.from('profiles').update({ name }).eq('id', S.user.id)); S.me.name = name; toast('已更新'); App.render(); }
    catch (e) { toast(e.message); }
  },
  saveSettings() { S.settings.groqKey = $('#groqKey').value.trim(); save('food.settings', S.settings); toast('已儲存'); },
  saveCloud(clear) {
    save('food.cloud', clear ? {} : { supabaseUrl: $('#sbUrl').value.trim(), supabaseKey: $('#sbKey').value.trim() });
    location.reload();
  },

  // ----- 群組 -----
  openGroup(id) { S.group = id; S.round = null; S.animate = true; App.render(); window.scrollTo(0, 0); },
  async createGroup() {
    const name = (await App.ask('建立美食群組', '取個名字，例如：大學同學吃貨團'))?.trim(); if (!name) return;
    try { const g = await DB.q(S.sb.from('groups').insert({ name }).select().single()); await DB.loadAll(); FX.confetti(30); App.openGroup(g.id); App.invite(g.id); }
    catch (e) { toast('建立失敗：' + e.message); }
  },
  invite(gid) {
    const g = S.groups.find(x => x.id === gid);
    const link = `${location.origin}${location.pathname}?join=${g.invite_code}`;
    const text = `來加入我的美食群組「${g.name}」，一起收藏、一起滑卡決定吃什麼 🍜\n${link}`;
    App.sheet(`<div class="sheet-h"><h2>邀請好友</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <p style="margin:0 0 14px;color:var(--text2)">把連結傳給朋友，他們登入後就會加入「${esc(g.name)}」。</p>
      <div class="card" style="text-align:center"><div class="muted">邀請碼</div><div style="font-size:34px;font-weight:900;letter-spacing:6px;margin:4px 0">${esc(g.invite_code)}</div><div class="muted">朋友也可以在「群組 → 輸入邀請碼」輸入</div></div>
      <div style="display:grid;gap:10px">
        <a class="btn big block" style="background:#06c755;color:#fff;box-shadow:none" href="https://line.me/R/share?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">傳到 LINE</a>
        ${navigator.share ? `<button class="btn primary big block" onclick="navigator.share({text: ${esc(JSON.stringify(text))}}).catch(()=>{})">${ic('share')} 分享到其他 App</button>` : ''}
        <button class="btn big block" onclick="App.copy(${esc(JSON.stringify(text))})">${ic('copy')} 複製邀請連結</button>
      </div>`);
  },
  async joinPrompt() { const c = (await App.ask('輸入邀請碼', '朋友傳給你的 8 碼'))?.trim(); if (c) App.join(c); },
  async join(code) {
    try { const gid = await DB.rpc('join_group', { code }); await DB.loadAll(); S.tab = 'groups'; S.group = gid; FX.confetti(40); toast(`加入「${S.groups.find(g => g.id === gid)?.name || '群組'}」了 🎉`); S.animate = true; App.render(); }
    catch (e) { toast('加入失敗：' + e.message, 4000); }
  },
  async leaveGroup(gid) {
    const g = S.groups.find(x => x.id === gid), owner = g.owner === S.user.id;
    if (!await App.confirm(owner ? `刪除「${g.name}」？` : `退出「${g.name}」？`, owner ? '所有成員都會看不到這個群組。' : '', owner ? '刪除' : '退出', true)) return;
    try {
      if (owner) await DB.q(S.sb.from('groups').delete().eq('id', gid));
      else await DB.q(S.sb.from('group_members').delete().eq('group_id', gid).eq('user_id', S.user.id));
      S.group = null; await DB.loadAll(); App.render();
    } catch (e) { toast(e.message); }
  },
  async share(gid, ids, quiet) {
    const rows = ids.filter(id => !S.groupPlaces.some(x => x.group_id === gid && x.place_id === id)).map(place_id => ({ group_id: gid, place_id }));
    if (!rows.length) return;
    try { const d = await DB.q(S.sb.from('group_places').insert(rows).select()); S.groupPlaces.push(...d); buzz(8); if (!quiet) toast('已分享到群組'); S.keepScroll = true; App.render(); }
    catch (e) { toast('分享失敗：' + e.message); }
  },
  async unshare(gid, ids) {
    try { await DB.q(S.sb.from('group_places').delete().eq('group_id', gid).in('place_id', ids)); S.groupPlaces = S.groupPlaces.filter(x => !(x.group_id === gid && ids.includes(x.place_id))); S.keepScroll = true; App.render(); }
    catch (e) { toast('失敗：' + e.message); }
  },
  shareMany(gid) {
    const have = new Set(S.groupPlaces.filter(x => x.group_id === gid).map(x => x.place_id));
    const mine = S.places.filter(p => isMine(p) && !have.has(p.id));
    S.pick = new Set();
    const upd = () => { const b = $('#pk-go'); if (b) { b.disabled = !S.pick.size; b.textContent = S.pick.size ? `加入 ${S.pick.size} 間` : '選幾間店'; } };
    App._pkUpd = upd;
    App.sheet(`<div class="sheet-h"><h2>從我的收藏加入</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      ${mine.length ? `<div class="row" style="margin-bottom:6px"><span class="muted grow">${mine.length} 間還沒分享</span><button class="btn sm" onclick="document.querySelectorAll('.cand').forEach((c,i)=>{c.classList.add('on');c.classList.remove('off');S.pick.add(c.dataset.id)});App._pkUpd()">全選</button></div>
      ${mine.map((p, i) => `<div class="cand off" data-id="${p.id}" style="animation-delay:${Math.min(i, 10) * 40}ms;cursor:pointer;align-items:center" onclick="this.classList.toggle('on');this.classList.toggle('off');S.pick.has('${p.id}')?S.pick.delete('${p.id}'):S.pick.add('${p.id}');App._pkUpd()">
        <div class="ph" style="position:relative;width:58px;height:58px">${photo(p)}<span class="tick">${ic('check')}</span></div>
        <div class="grow"><b>${esc(p.name)}</b><div class="muted">${cat(p)[1]} ${esc(area(p))}</div></div></div>`).join('')}
      <div class="sticky-foot"><button class="btn primary big block" id="pk-go" disabled onclick="App.share('${gid}', [...S.pick]).then(App.close)">選幾間店</button></div>` : '<div class="empty"><p>你的收藏都已經在群組裡了。</p></div>'}`);
  },
  newRound(gid) {
    const ids = new Set(S.groupPlaces.filter(x => x.group_id === gid).map(x => x.place_id));
    const all = S.places.filter(p => ids.has(p.id));
    const cities = [...new Set(all.map(p => normCity(p.city)).filter(Boolean))];
    S.nr = { gid, cities: [], cats: [], meal: '', price: 0, max: 15 };
    const chips = (k, items) => items.map(([v, t]) => `<span class="chip" onclick="this.classList.toggle('on');const a=S.nr.${k};const i=a.indexOf('${v}');i<0?a.push('${v}'):a.splice(i,1);App.nrCount()">${t}</span>`).join('');
    const one = (k, items) => `<div class="chips wrap" data-k="${k}">${items.map(([v, t], i) => `<span class="chip ${i === 0 ? 'on' : ''}" onclick="this.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on');S.nr.${k}=${JSON.stringify(v).replace(/"/g, '&quot;')};App.nrCount()">${t}</span>`).join('')}</div>`;
    App.sheet(`<div class="sheet-h"><h2>開始滑卡</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <label class="field" style="margin-top:0"><span>這輪要決定什麼</span><input id="nr-title" placeholder="例如：週五晚餐吃什麼" value="一起決定吃什麼"></label>
      ${cities.length > 1 ? `<div class="fgroup"><div class="t">地區（不選＝全部）</div><div class="chips wrap">${chips('cities', cities.map(c => [c, c]))}</div></div>` : ''}
      <div class="fgroup"><div class="t">分類（不選＝全部）</div><div class="chips wrap">${chips('cats', Object.entries(CATS).filter(([k]) => all.some(p => p.category === k)).map(([k, [t, e]]) => [k, `<span class="e">${e}</span>${t}`]))}</div></div>
      <div class="fgroup"><div class="t">時段</div>${one('meal', [['', '不限'], ...Object.entries(MEALS)])}</div>
      <div class="fgroup"><div class="t">每人預算</div>${one('price', [[0, '不限'], [1, '200 內'], [2, '500 內'], [3, '1000 內']])}</div>
      <div class="fgroup"><div class="t">最多幾張</div>${one('max', [[15, '15'], [10, '10'], [20, '20'], [30, '30'], [50, '50']])}</div>
      <div class="sticky-foot"><button class="btn primary big block" id="nr-go" onclick="App.startRound()">開始</button></div>`);
    App.nrCount();
  },
  nrPool() {
    const n = S.nr, ids = new Set(S.groupPlaces.filter(x => x.group_id === n.gid).map(x => x.place_id));
    let l = S.places.filter(p => ids.has(p.id));
    if (n.cities.length) l = l.filter(p => n.cities.includes(normCity(p.city)));
    if (n.cats.length) l = l.filter(p => n.cats.includes(p.category));
    if (n.meal) l = l.filter(p => !(p.meals || []).length || p.meals.includes(n.meal));
    if (n.price) l = l.filter(p => !p.price || p.price <= n.price);
    // 同一家的分店只出一張卡（用離我最近的那間），配對才不會分散在不同分店
    return brands(l).map(g => g[0]).sort(() => Math.random() - 0.5).slice(0, n.max);
  },
  nrCount() { const c = App.nrPool().length, b = $('#nr-go'); if (b) { b.disabled = !c; b.innerHTML = c ? `${ic('heart')} 開始滑 ${c} 張` : '沒有符合條件的店'; } },
  async startRound() {
    const pool = App.nrPool(); if (!pool.length) return toast('沒有符合條件的店');
    const n = S.nr;
    try {
      const r = await DB.q(S.sb.from('swipe_rounds').insert({ group_id: n.gid, title: $('#nr-title').value.trim(), filters: { cities: n.cities, cats: n.cats, meal: n.meal, price: n.price }, place_ids: pool.map(p => p.id) }).select().single());
      S.rounds.unshift(r); App.close(); App.openRound(r.id);
    } catch (e) { toast('失敗：' + e.message); }
  },
  openRound(id) { S.round = id; S.showResult = false; S.animate = true; App.render(); window.scrollTo(0, 0); },
  async swipe(liked) {
    const card = $('#scard'); if (!card || card.dataset.busy) return;
    card.dataset.busy = 1;
    buzz(liked ? 12 : 6);
    const pid = card.dataset.id, r = S.rounds.find(x => x.id === S.round);
    card.style.transition = 'transform .35s ease-in, opacity .35s';
    card.style.transform = `translate(${liked ? 600 : -600}px, 40px) rotate(${liked ? 28 : -28}deg)`; card.style.opacity = 0;
    card.querySelector(`.stamp.${liked ? 'like' : 'nope'}`).style.opacity = card.querySelector(`.tint.${liked ? 'like' : 'nope'}`).style.opacity = 1;
    const back = document.querySelector('.scard.back1'); if (back) { back.style.transition = 'transform .3s var(--ease)'; back.style.transform = 'none'; }
    const row = { round_id: r.id, user_id: S.user.id, place_id: pid, liked };
    S.swipes.push(row);
    // 先換下一張，存檔在背景跑，滑起來才不會卡
    DB.q(S.sb.from('swipes').upsert(row)).catch(e => { toast('沒存到，請再滑一次：' + e.message); S.swipes = S.swipes.filter(s => s !== row); App.render(); });
    await sleep(260);
    // 最後一張滑完，結果頁用進場動畫出來
    if (document.querySelectorAll('.deck .scard').length === 1) S.animate = true;
    App.render();
    // 後面的卡往前遞補一格，新露出來的那張淡入，不要瞬間跳位
    const b1 = $('.scard.back1'), b2 = $('.scard.back2');
    b1?.animate([{ transform: 'translateY(28px) scale(.9)' }, { transform: 'translateY(14px) scale(.95)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    b2?.animate([{ opacity: 0, transform: 'translateY(40px) scale(.86)' }, { opacity: 1, transform: 'translateY(28px) scale(.9)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (liked) App.checkMatch(r, pid);
  },
  checkMatch(r, pid) {
    const m = Swipe.matches(r).find(x => x.p.id === pid);
    if (m?.all) App.matchShow(m);
  },
  matchShow(m) {
    buzz([20, 80, 20, 80, 40]);
    $('#overlay').innerHTML = `<div class="overlay" onclick="if(event.target===this)App.matchClose()">
      <div class="ring">${`<div class="ph">${photo(m.p)}</div>`}</div>
      <h2>配對成功！</h2>
      <p>大家都想吃 <b>${esc(m.p.name)}</b></p>
      <div class="avatars" style="margin-bottom:18px">${m.who.map(id => avatar(id, 36)).join('')}</div>
      <a class="btn big w" href="${mapsUrl(m.p)}" target="_blank" rel="noopener">${ic('nav')} 就去這間</a>
      <button class="btn big o" onclick="App.matchClose()">繼續滑</button>
    </div>`;
    FX.hearts(); FX.confetti(60);
  },
  matchClose() { $('#overlay').innerHTML = ''; },
  realtime() {
    if (App._ch) S.sb.removeChannel(App._ch);
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const before = new Set(S.rounds.flatMap(r => Swipe.matches(r).filter(x => x.all).map(x => r.id + x.p.id)));
        const now = await DB.loadAll().catch(() => null);
        if (!now || now === App._sig) return;
        App._sig = now; S.keepScroll = true;
        const swiping = $('#scard') && $('#scard').style.transform;
        if (!$('.sheet-bg') && !swiping && S.tab !== 'map') App.render();
        for (const r of S.rounds) for (const x of Swipe.matches(r)) if (x.all && !before.has(r.id + x.p.id) && !$('#overlay .overlay')) App.matchShow(x);
      }, 600);
    };
    App._ch = S.sb.channel('food').on('postgres_changes', { event: '*', schema: 'food', table: 'swipes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'food', table: 'group_places' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'food', table: 'swipe_rounds' }, refresh).subscribe();
  },

  // ----- 備份 -----
  exportJson() {
    const data = S.places.filter(isMine).map(p => { const c = { ...p }; delete c.owner; return c; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'food-map', version: 1, places: data }, null, 2)], { type: 'application/json' }));
    a.download = `美食收藏-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  },
  async importJson(file) {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const list = (j.places || j).filter(p => p.name);
      const have = new Set(S.places.filter(isMine).map(p => p.name + normCity(p.city)));
      let n = 0;
      for (const p of list) {
        if (have.has(p.name + normCity(p.city))) continue;
        const c = { ...p }; for (const k of ['id', 'owner', 'created_at', 'updated_at']) delete c[k];
        await DB.savePlace(c); n++;
      }
      toast(`匯入 ${n} 間（跳過重複 ${list.length - n} 間）`); App.render();
    } catch (e) { toast('匯入失敗：' + e.message, 5000); }
  },
  async migrateLocal() {
    const list = load('food.places', []);
    try {
      for (const p of list) { const c = { ...p }; for (const k of ['id', 'owner', 'created_at', 'updated_at']) delete c[k]; if (c.photo?.startsWith('data:')) c.photo = await Photo.store(c.photo); await DB.savePlace(c); }
      localStorage.removeItem('food.places'); toast(`上傳了 ${list.length} 間`); App.render();
    } catch (e) { toast('上傳失敗：' + e.message, 5000); }
  },

  // ----- 舊收藏回原始貼文補照片、必點菜色 -----
  async enrich(list) {
    if (S.enriching || (cloud() && !S.user)) return;
    const todo = (list || S.places).filter(needsEnrich);
    if (!todo.length) return;
    S.enriching = true;
    let changed = 0;
    for (const p0 of todo) {
      const done = load('food.enriched', {}); done[p0.id + '|' + p0.source_url] = 1; save('food.enriched', done);
      try {
        const r = await Extract.run({ url: p0.source_url });
        const key = x => String(x || '').replace(/\s/g, '').toLowerCase();
        const cands = r.places || [];
        const hit = cands.find(c => key(c.name) && (key(c.name).includes(key(p0.name)) || key(p0.name).includes(key(c.name)))) || (cands.length === 1 ? cands[0] : null);
        const p = S.places.find(x => x.id === p0.id); if (!p) continue;
        const patch = {};
        if (!p.photo && r.source?.thumbData) { const url = await Photo.store(r.source.thumbData); if (url) patch.photo = url; }
        if (!(p.dishes || []).length && hit && cleanDishes(hit.dishes).length) patch.dishes = cleanDishes(hit.dishes);
        if (!p.source_text && r.source?.caption) patch.source_text = r.source.caption.slice(0, 2000);
        if (!p.note && hit?.note) patch.note = hit.note;
        if (Object.keys(patch).length) { await DB.savePlace({ ...p, ...patch }); changed++; }
      } catch (e) { console.warn('enrich failed', p0.name, e); }
    }
    S.enriching = false;
    if (changed) {
      S.keepScroll = true;
      if (!$('.sheet-bg')) { if (S.tab === 'map') MapView.sync(); else App.render(); }
      toast(`幫 ${changed} 間店補上了照片和必點菜色`);
    }
  },

  // ----- 分享捷徑在背景收藏的店沒有座標：打開 app 時用地址補（每間只試一次） -----
  async fillCoords() {
    if (S.locating || (cloud() && !S.user)) return;
    const tried = load('food.geoTried', {});
    const todo = S.places.filter(p => isMine(p) && p.lat == null && (p.address || p.district || p.city) && !tried[p.id]);
    if (!todo.length) return;
    S.locating = true;
    let n = 0;
    for (const p0 of todo) {
      const t = load('food.geoTried', {}); t[p0.id] = 1; save('food.geoTried', t);
      const g = await Geo.locate(p0).catch(() => null);
      const p = S.places.find(x => x.id === p0.id);
      if (!g || !p || p.lat != null) continue;
      try { await DB.savePlace({ ...p, lat: g.lat, lng: g.lng, approx: g.approx, city: p.city || g.city, district: p.district || g.district }); n++; } catch (e) { console.warn('fillCoords', e); }
    }
    S.locating = false;
    if (n) { S.keepScroll = true; if (!$('.sheet-bg')) { if (S.tab === 'map') MapView.sync(); else App.render(); } }
  },

  // ----- 從 IG 一鍵分享進來的設定說明 -----
  shareSetup() {
    const base = `${location.origin}${location.pathname}?add=`;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // 背景收藏捷徑放在 iCloud：分享進來的連結連同收藏碼送到 quick-add，直接存好，不用打開這裡
    const scLink = 'https://www.icloud.com/shortcuts/c1a1d8be9af44862bff79bb2c6bd2891';
    const manual = `<ol class="howto" style="margin-top:8px">
        <li>打開「捷徑」App，按右上角 <b>＋</b>，名稱改成「收進美食收藏」，在設定裡打開「在分享表單中顯示」。</li>
        <li>加入「<b>URL</b>」動作，貼上下面這串，最後面接上變數「捷徑輸入」。
          <div class="copy-row"><code>${esc(base)}</code><button class="btn sm" onclick="App.copy(${esc(JSON.stringify(base))})">${ic('copy')} 複製</button></div></li>
        <li>再加入「<b>打開 URL</b>」動作，按完成。之後分享會打開這裡找店家。</li>
      </ol>`;
    const iosSteps = cloud() ? `<a class="btn primary big block" href="${scLink}" target="_blank" rel="noopener" onclick="App.copyQuickKey()">${ic('down')} 加入分享捷徑</a>
      <ol class="howto" style="margin-top:14px">
        <li>點上面的按鈕，你的收藏碼會自動拷貝好，捷徑 App 打開後按「<b>加入捷徑</b>」。</li>
        <li>它問「收藏碼」時，長按輸入框選「<b>貼上</b>」，按完成。</li>
        <li>之後在 IG 按 <b>分享</b> → 選「<b>收進美食收藏</b>」，上方會跳通知「已收藏：店名」，不用打開這裡。第一次會問能不能連線，選「<b>永遠允許</b>」。</li>
      </ol>
      <div class="copy-row"><span class="muted grow" style="font-size:13px">收藏碼：等於你的收藏權限，不要給別人</span><button class="btn sm" onclick="App.copyQuickKey(true)">${ic('copy')} 複製</button><button class="btn sm ghost" onclick="App.resetQuickKey()">換一組</button></div>
      <p class="muted">想讓它排在分享選單前面，可以在分享選單最右邊「編輯動作」把它加到最愛（可做可不做）。</p>` : `<p class="muted">先登入，就能用捷徑在背景直接收藏。沒登入的話可以自己做一個會打開這裡的捷徑：</p>${manual}`;
    const androidSteps = `<ol class="howto">
        <li>用 Chrome 打開這個網頁，選單裡按「<b>加到主畫面</b>」（安裝應用程式）。</li>
        <li>之後在 IG 按 <b>分享</b> → <b>分享到…</b>，選「<b>美食收藏</b>」就會自動找店家。</li>
      </ol>`;
    App.sheet(`<div class="sheet-h"><h2>從 IG 一鍵分享進來</h2><button class="icon-btn" onclick="App.close()" aria-label="關閉">${ic('x')}</button></div>
      <p class="muted" style="margin-top:0">設定一次，以後在 IG 看到喜歡的店，按分享就能收藏，不用複製貼上。</p>
      <div class="seg" style="margin:6px 0 12px"><button class="${ios ? 'on' : ''}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this));$('#ss-body').innerHTML=App._ssIos">iPhone</button><button class="${ios ? '' : 'on'}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this));$('#ss-body').innerHTML=App._ssAnd">Android</button></div>
      <div id="ss-body">${ios ? iosSteps : androidSteps}</div>`);
    App._ssIos = iosSteps; App._ssAnd = androidSteps;
    if (cloud() && S.user) App.quickKey().catch(() => {});
  },

  // 分享捷徑的收藏碼（先抓好，按按鈕時才能馬上拷貝）
  async quickKey(reset = false) {
    if (!reset && S.quickKey) return S.quickKey;
    S.quickKey = await DB.rpc('quick_key', { reset });
    return S.quickKey;
  },
  copyQuickKey(show) {
    if (!S.quickKey) { toast('收藏碼還沒準備好，請再按一次'); return; }
    navigator.clipboard?.writeText(S.quickKey).then(() => show && toast('已複製收藏碼'), () => toast('複製失敗，請按下面的「複製」'));
  },
  async resetQuickKey() {
    if (!confirm('換一組收藏碼後，舊的捷徑就不能用了，要重新加入。確定要換嗎？')) return;
    try { await App.quickKey(true); toast('已換新的收藏碼，請重新加入分享捷徑'); } catch (e) { toast('換收藏碼失敗：' + e.message, 4000); }
  },

  // ----- 外部分享進來（Android 把 IG 分享到這個 app）、邀請連結 -----
  handleShare() {
    const u = new URL(location.href), q = u.searchParams;
    // iPhone 捷徑會開 ?add=<連結>，連結本身可能帶 ? 和 &，所以整段照原樣拿
    const add = (location.search.match(/[?&]add=(.*)$/) || [])[1];
    let shared = [q.get('share_url'), q.get('share_text'), q.get('share_title')].filter(Boolean).join('\n');
    if (add) { try { shared = decodeURIComponent(add); } catch { shared = add; } }
    if (q.has('join') || shared) history.replaceState(null, '', location.pathname);
    if (shared && !(cloud() && !S.user)) App.openAdd(shared);
    else if (shared) save('food.pendingShare', shared);
    const ps = load('food.pendingShare', '');
    if (ps && !(cloud() && !S.user)) { save('food.pendingShare', ''); App.openAdd(ps); }
  },

  // ----- 抽屜、對話框 -----
  sheet(html, { cls = '', keep = false, zoom = false } = {}) {
    const old = $('#sheet .sheet');
    if (keep && old) {
      // 同一個抽屜更新內容（例如切換想去／去過），不要重播動畫，小地圖也直接搬過去不重建
      const mini = S.miniMap && old.querySelector('#mini');
      const reel = old.querySelector('.reel.on');
      const st = old.scrollTop; old.className = `sheet still ${cls}`; old.innerHTML = `<div class="grab"></div>${html}`;
      const slot = old.querySelector('#mini');
      if (mini && slot) slot.replaceWith(mini); else { S.miniMap?.remove(); S.miniMap = null; }
      // 影片框也搬過去，保留量好的高度，畫面不會跳（iframe 搬動會重新載入）
      const rs = old.querySelector('.reel');
      if (reel && rs && rs.dataset.src === reel.dataset.src) { reel.classList.remove('ready'); rs.replaceWith(reel); }
      old.scrollTop = st;
      App.dragSheet(); return;
    }
    S.miniMap?.remove(); S.miniMap = null;
    $('#sheet').innerHTML = `<div class="sheet-bg ${zoom ? 'zoom' : ''}" onclick="if(event.target===this)App.close()"><div class="sheet ${cls}" role="dialog"><div class="grab"></div>${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => $('.sheet-bg')?.classList.add('in')));
    App.dragSheet();
  },
  // 往下拖可以關掉抽屜
  dragSheet() {
    const sh = $('#sheet .sheet'), bg = $('.sheet-bg'); if (!sh) return;
    let y0 = null, dy = 0;
    const start = e => { if (sh.scrollTop > 0 || e.target.closest('input,textarea,select,.minimap,.chips')) return; y0 = e.touches ? e.touches[0].clientY : e.clientY; dy = 0; };
    const move = e => {
      if (y0 == null) return;
      dy = (e.touches ? e.touches[0].clientY : e.clientY) - y0;
      if (dy <= 0) { sh.style.transform = ''; return; }
      sh.classList.add('dragging'); sh.style.transform = `translateY(${dy}px)`; bg.style.opacity = Math.max(.3, 1 - dy / 500);
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (y0 == null) return; y0 = null;
      sh.classList.remove('dragging'); bg.style.opacity = '';
      if (dy > 110) App.close(); else sh.style.transform = '';
    };
    sh.ontouchstart = start; sh.ontouchmove = move; sh.ontouchend = end;
    sh.querySelector('.grab').onpointerdown = e => { start(e); const mv = ev => move(ev), up = () => { end(); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
  },
  close() {
    S.miniMap?.remove(); S.miniMap = null;
    const bg = $('.sheet-bg'); if (!bg) return;
    const sh = bg.querySelector('.sheet');
    // 店家頁：照片縮回原本的卡片，抽屜淡出
    const dragged = !!sh.style.transform, flew = !!S.flyFrom && App.flyOut(sh);
    // 往下拖關掉的就繼續往下滑走
    bg.classList.toggle('zoom', flew && !dragged);
    S.flyFrom = null;
    bg.classList.remove('in'); sh.style.transform = '';
    document.body.style.overflow = '';
    setTimeout(() => {
      if ($('.sheet-bg') !== bg) return;
      $('#sheet').innerHTML = '';
      // 抽屜開著時背景資料更新了，關掉後再補畫
      if (S.stale) { S.stale = false; App.refresh(); }
    }, 320);
  },
  dialog(html) {
    return new Promise(res => {
      App._dlg = v => { $('#dialog').innerHTML = ''; res(v); };
      $('#dialog').innerHTML = `<div class="dlg-bg" onclick="if(event.target===this)App._dlg(null)"><div class="dlg">${html}</div></div>`;
      setTimeout(() => $('#dlg-in')?.focus(), 80);
    });
  },
  ask(title, hint = '', value = '') {
    return App.dialog(`<h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}<input id="dlg-in" class="input" value="${esc(value)}" onkeydown="if(event.key==='Enter')App._dlg(this.value)">
      <div class="row"><button class="btn" onclick="App._dlg(null)">取消</button><button class="btn primary" onclick="App._dlg($('#dlg-in').value)">確定</button></div>`);
  },
  confirm(title, msg, ok = '確定', danger) {
    return App.dialog(`<h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}<div class="row"><button class="btn" onclick="App._dlg(false)">取消</button><button class="btn ${danger ? 'dark' : 'primary'}" style="${danger ? 'background:var(--danger);color:#fff' : ''}" onclick="App._dlg(true)">${esc(ok)}</button></div>`);
  },
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#dialog .dlg')) App._dlg(null); else if ($('#overlay .overlay')) App.matchClose(); else if ($('.sheet-bg')) App.close(); }
  if ($('#scard') && !$('.sheet-bg') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    if (e.key === 'ArrowRight') App.swipe(true);
    if (e.key === 'ArrowLeft') App.swipe(false);
  }
});
// 收藏清單長按卡片 → 進入選取模式
{
  let t = null, x0 = 0, y0 = 0;
  addEventListener('touchstart', e => {
    const c = e.target.closest?.('.pcard'); if (!c || S.tab !== 'list' || S.sel || $('.sheet-bg')) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    t = setTimeout(() => { t = null; const p = S.places.find(x => x.id === c.dataset.id); if (p && isMine(p)) { App._lp = true; App.pick(true, p.id); } }, 480);
  }, { passive: true });
  addEventListener('touchmove', e => { if (t && Math.hypot(e.touches[0].clientX - x0, e.touches[0].clientY - y0) > 8) { clearTimeout(t); t = null; } }, { passive: true });
  addEventListener('touchend', () => { clearTimeout(t); t = null; setTimeout(() => { App._lp = false; }, 400); }, { passive: true });
  addEventListener('contextmenu', e => { if (e.target.closest?.('.pcard') && S.tab === 'list') e.preventDefault(); });
}
// 注音、拼音選字中的 input 不搜尋（oninput 裡跳過），選好字才搜尋
addEventListener('compositionend', e => { if (e.target.id === 'q') App.setF('q', e.target.value, true); });
addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 8), { passive: true });

(async () => {
  S.addGroups = load('food.addGroups', []);
  const join = new URL(location.href).searchParams.get('join');
  if (join) save('food.pendingJoin', join);
  DB.client();
  App.paintCache();
  await DB.init();
  if (!cloud() && join) { save('food.pendingJoin', ''); toast('這個網址還沒接上雲端，加入不了群組', 5000); }
  await App.boot();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
