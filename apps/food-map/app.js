'use strict';
// 美食收藏：單頁 app。沒填雲端設定時資料存在這台裝置；填了 Supabase 就能多人登入、建群組、一起滑卡。

// ---------- 常數 ----------
const CATS = {
  restaurant: ['餐廳', '🍽️'], cafe: ['咖啡廳', '☕'], bakery: ['麵包店', '🥐'], dessert: ['甜點', '🍰'],
  snack: ['小吃', '🥟'], brunch: ['早午餐', '🥞'], bar: ['酒吧', '🍸'], drink: ['飲料', '🧋'], other: ['其他', '📍'],
};
const MEALS = { breakfast: '早餐', lunch: '午餐', tea: '下午茶', dinner: '晚餐', night: '宵夜' };
const PRICES = { 1: '$200 內', 2: '$200–500', 3: '$500–1000', 4: '$1000 以上' };
const CITIES = ['台北', '新北', '基隆', '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '馬祖'];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CITY_RE = /(台北|臺北|新北|基隆|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[市縣]?/;

const PROMPT = `你是美食收藏助理。從使用者給的社群貼文、網頁文字或截圖，找出裡面介紹的「實體店家」（餐廳、咖啡廳、麵包店、甜點店、小吃、酒吧、飲料店等）。
只回 JSON：{"places":[{"name":"店名（不含分店）","branch":"分店名，沒有就空字串","address":"完整地址，沒寫就空字串","city":"縣市，用簡短寫法：台北、新北、桃園、台中、台南、高雄、新竹…；國外寫城市名；不知道就空字串","district":"行政區，例如大安區；不知道就空字串","category":"cafe|restaurant|bakery|dessert|snack|brunch|bar|drink|other 選一個","cuisine":"料理類型，例如日式拉麵、義式、韓式烤肉，可空白","price":每人預算 1(200元以下) 2(200-500) 3(500-1000) 4(1000以上)，看不出來填 null,"meals":["適合時段，從 breakfast lunch tea dinner night 選，可多選"],"hours":"營業時間原文，沒有就空字串","note":"一句話重點，例如招牌菜、特色","tags":["最多 4 個短標籤，例如 不限時、有插座、寵物友善、要訂位"]}]}
規則：
- 一篇貼文介紹多間店就列多間；完全沒有店家就回 {"places":[]}。
- 店名從 📍、🏠、店名：、@帳號、地點標記等線索判斷，不要把 hashtag 或網紅名字當店名。
- 地址照原文，臺改成台。
- 只用文字裡有的資訊，不要自己編地址。`;

// ---------- 小工具 ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normCity = c => (c || '').replace(/^臺/, '台').replace(/[市縣]$/, '').replace('連江', '馬祖').trim();
const cat = p => CATS[p.category] || CATS.other;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密模式 */ } };
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
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
const fmtKm = d => d < 1 ? `${Math.round(d * 1000)} 公尺` : `${d.toFixed(1)} 公里`;
const mapsUrl = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.branch, p.address || normCity(p.city)].filter(Boolean).join(' '))}`;
const initial = n => (n || '?').trim().slice(0, 1).toUpperCase();

// ---------- 狀態 ----------
const S = {
  cfg: { ...(window.FOOD_CONFIG || {}), ...load('food.cloud', {}) },
  settings: load('food.settings', { groqKey: '' }),
  sb: null, user: null, me: null,
  places: [], groups: [], members: [], groupPlaces: [], profiles: {}, rounds: [], swipes: [],
  tab: load('food.tab', 'list'),
  f: { q: '', city: '', cat: '', status: '', scope: 'all', sort: 'new' },
  pos: null, group: null, round: null, map: null, cluster: null,
  draw: load('food.draw', { cities: [], cats: [], meal: '', price: 0, status: '', scope: 'all', recent: [] }),
};
const cloud = () => !!S.sb;
const isMine = p => !cloud() || p.owner === S.user?.id;
const nameOf = id => S.profiles[id]?.name || '朋友';

// ---------- 資料層 ----------
const DB = {
  async init() {
    if (!S.cfg.supabaseUrl || !S.cfg.supabaseKey || !window.supabase) return;
    S.sb = window.supabase.createClient(S.cfg.supabaseUrl, S.cfg.supabaseKey);
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
      sb.from('places').select('*').order('created_at', { ascending: false }),
      sb.from('groups').select('*').order('created_at'),
      sb.from('group_members').select('*'),
      sb.from('group_places').select('*'),
      sb.from('swipe_rounds').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    for (const r of [pl, gr, gm, gp, rd]) if (r.error) throw r.error;
    S.places = pl.data; S.groups = gr.data; S.members = gm.data; S.groupPlaces = gp.data; S.rounds = rd.data;
    const ids = [...new Set([S.user.id, ...S.members.map(m => m.user_id), ...S.places.map(p => p.owner)])];
    const pr = await sb.from('profiles').select('*').in('id', ids);
    S.profiles = Object.fromEntries((pr.data || []).map(p => [p.id, p]));
    S.me = S.profiles[S.user.id];
    const rids = S.rounds.map(r => r.id);
    S.swipes = rids.length ? ((await sb.from('swipes').select('*').in('round_id', rids)).data || []) : [];
  },
  async savePlace(p) {
    p.updated_at = new Date().toISOString();
    if (!cloud()) {
      if (!p.id) { p.id = uid(); p.created_at = p.updated_at; S.places.unshift(p); }
      else S.places = S.places.map(x => x.id === p.id ? p : x);
      save('food.places', S.places); return p;
    }
    const row = { ...p }; delete row.owner; delete row.created_at;
    const q = p.id ? S.sb.from('places').update(row).eq('id', p.id) : S.sb.from('places').insert(row);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const i = S.places.findIndex(x => x.id === data.id);
    if (i >= 0) S.places[i] = data; else S.places.unshift(data);
    return data;
  },
  async deletePlace(id) {
    if (cloud()) { const { error } = await S.sb.from('places').delete().eq('id', id); if (error) throw error; }
    S.places = S.places.filter(p => p.id !== id);
    S.groupPlaces = S.groupPlaces.filter(g => g.place_id !== id);
    if (!cloud()) save('food.places', S.places);
  },
  async rpc(fn, args) { const { data, error } = await S.sb.rpc(fn, args); if (error) throw error; return data; },
  async q(promise) { const { data, error } = await promise; if (error) throw error; return data; },
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
      model: vision ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'openai/gpt-oss-120b', temperature: 0.2,
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
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
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
    const a = (p.address || '').replace(/臺/g, '台').replace(/\(.*?\)|（.*?）/g, '').replace(/\s+/g, '');
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

function filterBar({ map = false } = {}) {
  const f = S.f;
  const scopes = cloud() ? [['all', '全部'], ['mine', '我的'], ...S.groups.map(g => [g.id, '👥 ' + g.name])] : [];
  return `
  <div class="row" style="margin-bottom:6px"><input class="search grow" id="q" placeholder="🔍 搜尋店名、地址、料理、標籤" value="${esc(f.q)}" oninput="App.setF('q', this.value, true)"></div>
  <div class="filters">
    ${scopes.length ? `<select class="chip" onchange="App.setF('scope', this.value)">${scopes.map(([v, t]) => `<option value="${esc(v)}" ${f.scope === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    <select class="chip ${f.city ? 'on' : ''}" onchange="App.setF('city', this.value)"><option value="">📍 所有地區</option>${citiesInUse().map(c => `<option ${f.city === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <span class="chip ${f.status === 'want' ? 'on' : ''}" onclick="App.setF('status', '${f.status === 'want' ? '' : 'want'}')">想去</span>
    <span class="chip ${f.status === 'been' ? 'on' : ''}" onclick="App.setF('status', '${f.status === 'been' ? '' : 'been'}')">去過</span>
    ${Object.entries(CATS).map(([k, [t, e]]) => `<span class="chip ${f.cat === k ? 'on' : ''}" onclick="App.setF('cat', '${f.cat === k ? '' : k}')">${e} ${t}</span>`).join('')}
    ${map ? '' : `<span class="chip ${f.sort === 'near' ? 'on' : ''}" onclick="App.sortNear()">🧭 離我最近</span>`}
  </div>`;
}

function placeCard(p) {
  const [t, e] = cat(p);
  const d = S.pos && p.lat != null ? fmtKm(distKm(S.pos, p)) : '';
  const shared = S.groupPlaces.filter(g => g.place_id === p.id).length;
  return `<div class="place" onclick="App.openPlace('${p.id}')">
    <div class="emo">${e}</div>
    <div class="grow" style="min-width:0">
      <div class="name">${esc(p.name)}${p.branch ? ` <span class="muted">${esc(p.branch)}</span>` : ''}</div>
      <div class="meta"><span>${esc([normCity(p.city), p.district].filter(Boolean).join(' · ') || '還沒填地區')}</span>${d ? `<span>· ${d}</span>` : ''}</div>
      <div class="meta" style="margin-top:5px">
        <span class="tag ${p.status}">${p.status === 'been' ? '去過' + (p.rating ? ' ' + '★'.repeat(p.rating) : '') : '想去'}</span>
        <span class="tag">${t}${p.cuisine ? '・' + esc(p.cuisine) : ''}</span>
        ${p.price ? `<span class="tag">${PRICES[p.price]}</span>` : ''}
        ${(p.meals || []).map(m => `<span class="tag">${MEALS[m] || m}</span>`).join('')}
        ${!isMine(p) ? `<span class="tag">👤 ${esc(nameOf(p.owner))}</span>` : shared ? `<span class="tag">👥 已分享</span>` : ''}
        ${p.lat == null ? '<span class="tag" title="還沒有地圖位置">📍?</span>' : ''}
      </div>
      ${p.note ? `<div class="muted" style="margin-top:5px">${esc(p.note)}</div>` : ''}
    </div>
  </div>`;
}

// ---------- 畫面 ----------
const TABS = [['list', '🍜', '收藏'], ['map', '🗺️', '地圖'], ['draw', '🎲', '抽一間'], ['groups', '👥', '群組'], ['me', '🙂', '我的']];

const Views = {
  list() {
    const list = visiblePlaces();
    if (!S.places.length) return `${filterBar()}<div class="empty"><div class="big">🍜</div><h2>還沒有收藏</h2><p>在 IG 看到想吃的店，按「分享」→「複製連結」，<br>回來點右下角的 ＋ 貼上就好。</p><button class="primary big" onclick="App.openAdd()">＋ 新增第一間</button></div>`;
    return `${filterBar()}<div class="muted" style="margin:2px 2px 8px">${list.length} 間</div>
      ${list.length ? `<div class="grid">${list.map(placeCard).join('')}</div>` : '<div class="empty">沒有符合條件的店</div>'}`;
  },
  map() { return `${filterBar({ map: true })}<div id="map"></div>`; },
  draw() {
    const d = S.draw;
    const chips = (key, items, multi) => items.map(([v, t]) => {
      const on = multi ? d[key].includes(v) : d[key] === v;
      return `<span class="chip ${on ? 'on' : ''}" onclick="App.drawSet('${key}', ${JSON.stringify(v).replace(/"/g, '&quot;')}, ${multi})">${t}</span>`;
    }).join('');
    const scopes = cloud() ? [['all', '全部'], ['mine', '我的'], ...S.groups.map(g => [g.id, '👥 ' + g.name])] : [];
    const pool = Draw.pool();
    return `<h2>不知道吃什麼？抽一間</h2>
      <div class="draw-box" id="drawbox">
        <div class="emo">🎲</div>
        <div class="draw-name">${pool.length ? `有 ${pool.length} 間可以抽` : '沒有符合條件的店'}</div>
        <div class="muted">${pool.length ? '選好條件，按下去就對了' : '放寬一點條件試試'}</div>
        <div style="margin-top:16px"><button class="primary big" ${pool.length ? '' : 'disabled'} onclick="App.doDraw()">🎲 抽！</button></div>
      </div>
      <div class="card">
        ${scopes.length ? `<div class="fgroup"><div class="t">從哪裡抽</div><div class="filters">${chips('scope', scopes, false)}</div></div>` : ''}
        <div class="fgroup"><div class="t">地區（可多選，不選＝全部）</div><div class="filters">${chips('cities', citiesInUse().map(c => [c, c]), true)}${S.pos ? `<span class="chip ${d.near ? 'on' : ''}" onclick="App.drawSet('near', ${d.near ? 0 : 3}, false)">🧭 附近 3 公里</span>` : `<span class="chip" onclick="App.locate().then(() => App.render())">🧭 用我的位置</span>`}</div></div>
        <div class="fgroup"><div class="t">分類（可多選）</div><div class="filters">${chips('cats', Object.entries(CATS).map(([k, [t, e]]) => [k, e + ' ' + t]), true)}</div></div>
        <div class="fgroup"><div class="t">時段</div><div class="filters">${chips('meal', [['', '不限'], ['now', '⏰ 現在'], ...Object.entries(MEALS)], false)}</div></div>
        <div class="fgroup"><div class="t">每人預算</div><div class="filters">${chips('price', [[0, '不限'], [1, '200 內'], [2, '500 內'], [3, '1000 內']], false)}</div></div>
        <div class="fgroup"><div class="t">狀態</div><div class="filters">${chips('status', [['', '都可以'], ['want', '只抽想去的'], ['been', '只抽去過的']], false)}</div></div>
        <p class="muted" style="margin:8px 0 0">沒填時段或價位的店也會一起抽。最近抽到的 5 間會先跳過。</p>
      </div>`;
  },
  groups() {
    if (!cloud()) return Views.needCloud('群組和滑卡配對');
    if (S.group) return Views.groupDetail(S.groups.find(g => g.id === S.group));
    return `<div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">我的美食群組</h2><button onclick="App.joinPrompt()">輸入邀請碼</button><button class="primary" onclick="App.createGroup()">＋ 建立群組</button></div>
      ${S.groups.length ? S.groups.map(g => {
        const mem = S.members.filter(m => m.group_id === g.id);
        const n = S.groupPlaces.filter(x => x.group_id === g.id).length;
        return `<div class="card" style="cursor:pointer" onclick="App.openGroup('${g.id}')"><div class="row"><div class="grow"><h3>👥 ${esc(g.name)}</h3><div class="muted">${mem.length} 人 · ${n} 間店</div></div>
          <div>${mem.slice(0, 5).map(m => `<span class="avatar" style="margin-left:-8px">${esc(initial(nameOf(m.user_id)))}</span>`).join('')}</div></div></div>`;
      }).join('') : `<div class="empty"><div class="big">👥</div><p>建一個群組，把邀請連結傳給朋友。<br>大家的收藏可以放在一起，還能一起滑卡決定吃什麼。</p></div>`}`;
  },
  groupDetail(g) {
    if (!g) { S.group = null; return Views.groups(); }
    const mem = S.members.filter(m => m.group_id === g.id);
    const ids = new Set(S.groupPlaces.filter(x => x.group_id === g.id).map(x => x.place_id));
    const places = S.places.filter(p => ids.has(p.id));
    const rounds = S.rounds.filter(r => r.group_id === g.id);
    return `<div class="row" style="margin-bottom:10px"><button class="ghost" onclick="App.openGroup(null)">← 群組</button><h2 class="grow" style="margin:0">👥 ${esc(g.name)}</h2></div>
      <div class="card">
        <div class="row"><div class="grow"><b>成員</b> <span class="muted">${mem.length} 人</span></div><button class="primary" onclick="App.invite('${g.id}')">邀請好友</button></div>
        <div class="row" style="margin-top:8px">${mem.map(m => `<span class="row" style="gap:4px"><span class="avatar">${esc(initial(nameOf(m.user_id)))}</span>${esc(nameOf(m.user_id))}${m.user_id === g.owner ? ' <span class="tag">建立者</span>' : ''}</span>`).join('')}</div>
      </div>
      <div class="card match">
        <div class="row"><div class="grow"><h3>💘 滑卡配對</h3><div style="font-size:13px">每個人各自左滑右滑，大家都喜歡的店就配對成功。</div></div><button class="primary" ${places.length ? '' : 'disabled'} onclick="App.newRound('${g.id}')">開始新一輪</button></div>
        ${places.length ? '' : '<p style="font-size:13px;margin:8px 0 0">先把店分享到群組，才能開始滑。</p>'}
        ${rounds.map(r => Views.roundRow(r, mem)).join('')}
      </div>
      <div class="row" style="margin:16px 0 8px"><h3 class="grow" style="margin:0">群組裡的店（${places.length}）</h3><button onclick="App.shareMany('${g.id}')">＋ 從我的收藏加入</button><button onclick="App.setF('scope','${g.id}');App.tab('map')">🗺️ 看地圖</button></div>
      <div class="grid">${places.map(placeCard).join('') || '<div class="muted">還沒有店。</div>'}</div>
      <div class="row" style="margin-top:24px"><button class="danger" onclick="App.leaveGroup('${g.id}')">${g.owner === S.user.id ? '刪除群組' : '退出群組'}</button></div>`;
  },
  roundRow(r, mem) {
    const sw = S.swipes.filter(s => s.round_id === r.id);
    const done = mem.filter(m => sw.filter(s => s.user_id === m.user_id).length >= r.place_ids.length).length;
    const matches = Swipe.matches(r).filter(x => x.all).length;
    const mine = sw.filter(s => s.user_id === S.user.id).length;
    return `<div style="background:rgba(255,255,255,.6);border-radius:12px;padding:10px 12px;margin-top:10px;cursor:pointer" onclick="App.openRound('${r.id}')">
      <div class="row"><b class="grow">${esc(r.title || '一起決定吃什麼')}</b>${matches ? `<span class="tag" style="background:#e64980;color:#fff;border:0">💘 ${matches} 間配對</span>` : ''}</div>
      <div style="font-size:12px">${r.place_ids.length} 間 · ${done}/${mem.length} 人滑完 · ${mine < r.place_ids.length ? `<b>你還有 ${r.place_ids.length - mine} 張</b>` : '你滑完了'} · ${new Date(r.created_at).toLocaleDateString('zh-TW')}</div>
    </div>`;
  },
  round() {
    const r = S.rounds.find(x => x.id === S.round);
    if (!r) { S.round = null; return Views.groups(); }
    const mine = new Set(S.swipes.filter(s => s.round_id === r.id && s.user_id === S.user.id).map(s => s.place_id));
    const left = r.place_ids.filter(id => !mine.has(id) && S.places.some(p => p.id === id));
    const head = `<div class="row" style="margin-bottom:6px"><button class="ghost" onclick="App.openRound(null)">← ${esc(S.groups.find(g => g.id === r.group_id)?.name || '群組')}</button><b class="grow">${esc(r.title || '一起決定吃什麼')}</b></div>`;
    if (left.length && !S.showResult) {
      const p = S.places.find(x => x.id === left[0]);
      const [t, e] = cat(p);
      return `${head}<div class="muted" style="text-align:center">還有 ${left.length} 張 · 右滑喜歡，左滑不要</div>
        <div class="deck"><div class="swipe-card" id="scard" data-id="${p.id}">
          <div class="stamp like">想吃</div><div class="stamp nope">跳過</div>
          <div class="hero">${e}</div>
          <div class="name">${esc(p.name)}${p.branch ? ` <span class="muted" style="font-size:16px">${esc(p.branch)}</span>` : ''}</div>
          <div class="meta" style="font-size:14px">${esc([normCity(p.city), p.district].filter(Boolean).join(' · '))}${S.pos && p.lat != null ? ' · ' + fmtKm(distKm(S.pos, p)) : ''}</div>
          <div class="meta" style="margin-top:8px"><span class="tag">${t}${p.cuisine ? '・' + esc(p.cuisine) : ''}</span>${p.price ? `<span class="tag">${PRICES[p.price]}</span>` : ''}${(p.meals || []).map(m => `<span class="tag">${MEALS[m]}</span>`).join('')}</div>
          ${p.note ? `<p style="margin:10px 0 0">${esc(p.note)}</p>` : ''}
          <div class="grow"></div>
          <div class="muted">👤 ${esc(nameOf(p.owner))} 收藏${p.source_url ? ` · <a href="${esc(p.source_url)}" target="_blank" rel="noopener" onpointerdown="event.stopPropagation()">看原始貼文</a>` : ''}</div>
        </div></div>
        <div class="swipe-btns"><button onclick="App.swipe(false)" title="跳過（←）">✕</button><button onclick="App.swipe(true)" style="color:var(--like)" title="想吃（→）">♥</button></div>
        <p style="text-align:center"><button class="ghost" onclick="S.showResult=true;App.render()">先看目前結果</button></p>`;
    }
    const mem = S.members.filter(m => m.group_id === r.group_id);
    const res = Swipe.matches(r);
    const waiting = mem.filter(m => S.swipes.filter(s => s.round_id === r.id && s.user_id === m.user_id).length < r.place_ids.length);
    return `${head}
      ${left.length ? `<p><button class="primary" onclick="S.showResult=false;App.render()">繼續滑（還有 ${left.length} 張）</button></p>` : ''}
      ${waiting.length ? `<div class="note">還在等 ${waiting.map(m => esc(nameOf(m.user_id))).join('、')} 滑完。結果會自動更新。</div>` : '<div class="note">🎉 大家都滑完了！</div>'}
      <h3 style="margin-top:16px">結果</h3>
      ${res.filter(x => x.likes).map(x => `<div class="place ${x.all ? 'match' : ''}" onclick="App.openPlace('${x.p.id}')" style="margin-bottom:8px">
        <div class="emo">${x.all ? '💘' : cat(x.p)[1]}</div>
        <div class="grow"><div class="name">${esc(x.p.name)}</div><div class="meta">${esc(normCity(x.p.city))} · ${x.likes}/${mem.length} 人想吃${x.all ? ' · <b>配對成功</b>' : ''}</div>
          <div class="bar" style="margin-top:6px"><i style="width:${x.likes / mem.length * 100}%"></i></div>
          <div class="meta">${x.who.map(id => esc(nameOf(id))).join('、')}</div></div>
        <a href="${mapsUrl(x.p)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">導航</a>
      </div>`).join('') || '<div class="muted">還沒有人按喜歡。</div>'}`;
  },
  me() {
    const c = S.cfg;
    return `<h2>我的</h2>
      ${cloud() ? `<div class="card"><h3>帳號</h3>
        <label>顯示名稱（群組裡朋友看到的名字）</label><div class="row"><input id="myname" class="grow" value="${esc(S.me?.name || '')}"><button onclick="App.saveName()">儲存</button></div>
        <p class="muted">${esc(S.user?.email)}</p><button onclick="App.signOut()">登出</button></div>`
        : `<div class="card"><h3>現在是「只存在這台裝置」模式</h3><p class="muted">收藏、地圖、抽籤都能用。要多人登入、好友群組、滑卡配對，需要先接上免費的 Supabase 雲端（照 README 的步驟做一次就好）。</p></div>`}
      <div class="card"><h3>AI 抓店家</h3>
        <p class="muted">${cloud() ? '接上雲端後，大家共用伺服器的 Groq key，不用自己填。下面的 key 只在雲端失敗時備用。' : '從貼文文字或截圖找店名，用 Groq 的免費模型。'}</p>
        <label>Groq API key（到 <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> 免費申請，gsk_ 開頭；只存在這台裝置）</label>
        <div class="row"><input id="groqKey" type="password" class="grow" value="${esc(S.settings.groqKey)}"><button onclick="App.saveSettings()">儲存</button></div></div>
      <div class="card"><h3>備份</h3>
        <div class="row"><button onclick="App.exportJson()">⬇️ 匯出我的收藏</button><label class="chip" style="margin:0;padding:7px 14px;border-radius:10px">⬆️ 匯入<input type="file" accept=".json,application/json" class="hidden" onchange="App.importJson(this.files[0])"></label></div>
        ${cloud() && load('food.places', []).length ? `<p class="note" style="margin-top:10px">這台裝置上還有 ${load('food.places', []).length} 間登入前的收藏。<button onclick="App.migrateLocal()">上傳到我的帳號</button></p>` : ''}</div>
      <details class="card"><summary><b>進階：雲端設定</b></summary>
        <p class="muted">通常改 config.js 就好。這裡填的只對這台裝置有效，適合先試試看。</p>
        <label>Supabase Project URL</label><input id="sbUrl" value="${esc(c.supabaseUrl || '')}" placeholder="https://xxxx.supabase.co">
        <label>Publishable key</label><input id="sbKey" value="${esc(c.supabaseKey || '')}" placeholder="sb_publishable_…">
        <div class="row" style="margin-top:10px"><button onclick="App.saveCloud()">儲存並重新載入</button><button class="ghost" onclick="App.saveCloud(true)">清除</button></div>
      </details>
      <p class="muted" style="text-align:center">開源：<a href="https://github.com/GOP9632/open-apps/tree/main/apps/food-map" target="_blank" rel="noopener">GitHub</a> · 地圖 © OpenStreetMap</p>`;
  },
  needCloud(what) {
    return `<div class="empty"><div class="big">☁️</div><h2>${what}要先接上雲端</h2><p>好友群組需要一個共用的資料庫。<br>用 Supabase 免費方案，設定一次，大家打開同一個網址就能用。</p><p><a href="https://github.com/GOP9632/open-apps/tree/main/apps/food-map#接上雲端" target="_blank" rel="noopener">設定步驟</a></p></div>`;
  },
  auth() {
    const m = S.authMode || 'in';
    return `<div style="max-width:380px;margin:30px auto" class="card">
      <div style="text-align:center;font-size:44px">🍜</div>
      <h2 style="text-align:center">${m === 'in' ? '登入' : '建立帳號'}</h2>
      ${load('food.pendingJoin', '') ? '<div class="note">登入後會自動加入朋友的群組。</div>' : ''}
      ${m === 'up' ? '<label>名字（朋友看到的）</label><input id="au-name" autocomplete="nickname">' : ''}
      <label>Email</label><input id="au-email" type="email" autocomplete="email">
      <label>密碼（至少 6 個字）</label><input id="au-pw" type="password" autocomplete="${m === 'in' ? 'current-password' : 'new-password'}" onkeydown="if(event.key==='Enter')App.auth()">
      <div id="au-err" class="err" style="margin-top:8px"></div>
      <button class="primary big" style="width:100%;margin-top:12px" onclick="App.auth()">${m === 'in' ? '登入' : '建立帳號'}</button>
      <p style="text-align:center" class="muted">${m === 'in' ? '還沒有帳號？<a href="#" onclick="S.authMode=\'up\';App.render();return false">建立一個</a>' : '已經有帳號？<a href="#" onclick="S.authMode=\'in\';App.render();return false">登入</a>'}</p>
    </div>`;
  },
};

// ---------- 地圖 ----------
const MapView = {
  draw() {
    const el = $('#map'); if (!el || !window.L) return;
    if (S.map) { S.map.remove(); S.map = null; }
    const map = S.map = L.map(el, { zoomControl: true }).setView([25.04, 121.53], 12);
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    const group = S.cluster = L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false }) : L.layerGroup();
    const list = visiblePlaces().filter(p => p.lat != null);
    for (const p of list) {
      const icon = L.divIcon({ className: '', html: `<div class="pin ${p.status === 'been' ? 'been' : ''} ${isMine(p) ? '' : 'other'}"><span>${cat(p)[1]}</span></div>`, iconSize: [36, 36], iconAnchor: [4, 34], popupAnchor: [14, -30] });
      L.marker([p.lat, p.lng], { icon, title: p.name }).bindPopup(`<b>${esc(p.name)}</b> ${p.branch ? esc(p.branch) : ''}<br><span style="color:#888">${cat(p)[0]}${p.cuisine ? '・' + esc(p.cuisine) : ''}${p.price ? ' · ' + PRICES[p.price] : ''}${p.approx ? ' · 位置是大概的' : ''}</span>${p.note ? '<br>' + esc(p.note) : ''}<br><a href="#" onclick="App.openPlace('${p.id}');return false">詳細</a> · <a href="${mapsUrl(p)}" target="_blank" rel="noopener">導航</a>`).addTo(group);
    }
    map.addLayer(group);
    if (list.length) map.fitBounds(L.latLngBounds(list.map(p => [p.lat, p.lng])).pad(0.15), { maxZoom: 15 });
    if (S.pos) L.circleMarker([S.pos.lat, S.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1c7ed6', fillOpacity: 1 }).addTo(map);
    const Locate = L.Control.extend({ onAdd: () => { const b = L.DomUtil.create('button'); b.textContent = '🧭'; b.title = '我的位置'; b.style.cssText = 'font-size:18px;padding:4px 8px'; b.onclick = e => { L.DomEvent.stop(e); App.locate().then(() => S.pos && map.setView([S.pos.lat, S.pos.lng], 15) && MapView.draw()); }; return b; } });
    new Locate({ position: 'topright' }).addTo(map);
    const missing = visiblePlaces().length - list.length;
    if (missing) {
      const Info = L.Control.extend({ onAdd: () => { const d = L.DomUtil.create('div'); d.style.cssText = 'background:var(--panel);padding:4px 10px;border-radius:8px;font-size:12px'; d.textContent = `${missing} 間還沒有位置，打開店家可以補`; return d; } });
      new Info({ position: 'bottomleft' }).addTo(map);
    }
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
    return list;
  },
  nowMeal() {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h < 17 ? 'tea' : h < 21 ? 'dinner' : 'night';
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
    let x0 = null, y0 = 0, dx = 0;
    const like = card.querySelector('.stamp.like'), nope = card.querySelector('.stamp.nope');
    card.onpointerdown = e => { x0 = e.clientX; y0 = e.clientY; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; };
    card.onpointermove = e => {
      if (x0 == null) return;
      dx = e.clientX - x0; const dy = e.clientY - y0;
      card.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
      like.style.opacity = Math.max(0, Math.min(1, dx / 90)); nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    };
    card.onpointerup = () => {
      if (x0 == null) return; x0 = null;
      card.style.transition = 'transform .25s';
      if (Math.abs(dx) > 90) App.swipe(dx > 0);
      else { card.style.transform = ''; like.style.opacity = nope.style.opacity = 0; }
      dx = 0;
    };
  },
};

// ---------- 動作 ----------
const App = {
  async boot() {
    try { await DB.loadAll(); } catch (e) { console.error(e); toast('讀取資料失敗：' + e.message, 5000); }
    if (cloud() && S.user) {
      const code = load('food.pendingJoin', '');
      if (code) { save('food.pendingJoin', ''); await App.join(code); }
      App.realtime();
    }
    App.render();
    App.handleShare();
  },
  render() {
    const needAuth = cloud() && !S.user;
    $('#tabs').innerHTML = needAuth ? '' : TABS.map(([k, i, t]) => `<button class="${S.tab === k ? 'on' : ''}" onclick="App.tab('${k}')"><span class="i">${i}</span>${t}</button>`).join('');
    $('#who').textContent = cloud() && S.user ? (S.me?.name || '') : cloud() ? '' : '只存在這台裝置';
    $('#fab').classList.toggle('hidden', needAuth || S.tab === 'me' || !!S.round);
    if (needAuth) { $('#main').innerHTML = Views.auth(); return; }
    const y = window.scrollY;
    $('#main').innerHTML = S.tab === 'groups' && S.round ? Views.round() : Views[S.tab]();
    if (S.tab === 'map') MapView.draw();
    if (S.round) Swipe.bind();
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
  },
  tab(t) { S.tab = t; save('food.tab', t); if (t !== 'groups') S.round = null; App.render(); window.scrollTo(0, 0); },
  setF(k, v, typing) {
    S.f[k] = v;
    if (typing) {
      clearTimeout(App._qt);
      App._qt = setTimeout(() => {
        const el = $('#q'), pos = el?.selectionStart;
        App.render(); const n = $('#q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      }, 200);
    } else App.render();
  },
  async locate() {
    if (!navigator.geolocation) return toast('這個瀏覽器拿不到位置');
    return new Promise(res => navigator.geolocation.getCurrentPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; res(); }, () => { toast('沒有拿到位置權限'); res(); }, { enableHighAccuracy: true, timeout: 10000 }));
  },
  async sortNear() {
    if (S.f.sort === 'near') { S.f.sort = 'new'; return App.render(); }
    if (!S.pos) await App.locate();
    if (S.pos) { S.f.sort = 'near'; App.render(); }
  },

  // ----- 新增 -----
  openAdd(prefill = '') {
    S.cands = null;
    App.sheet(`<div class="sheet-h"><h2>新增店家</h2><button class="ghost" onclick="App.close()">✕</button></div>
      <p class="muted" style="margin:0 0 8px">貼上 IG Reels／貼文、Threads、TikTok、Google 地圖連結，或直接貼貼文文字。</p>
      <textarea id="add-in" rows="4" placeholder="https://www.instagram.com/reel/…">${esc(prefill)}</textarea>
      <div class="row" style="margin-top:8px">
        <button onclick="App.pasteClip()">📋 貼上</button>
        <label class="chip" style="margin:0;padding:7px 14px;border-radius:10px;font-size:15px;color:var(--text)">🖼️ 截圖<input type="file" accept="image/*" class="hidden" onchange="App.addImage(this.files[0])"></label>
        <span class="grow"></span>
        <button class="primary" id="add-go" onclick="App.addGo()">找店家</button>
      </div>
      <div id="add-out"></div>
      <p style="margin-top:14px"><button class="ghost" onclick="App.editPlace(null)">✏️ 不用了，我自己填</button></p>`);
    setTimeout(() => $('#add-in')?.focus(), 50);
    if (prefill) App.addGo();
  },
  async pasteClip() {
    try { $('#add-in').value = await navigator.clipboard.readText(); App.addGo(); }
    catch { toast('瀏覽器不讓讀剪貼簿，請長按輸入框貼上'); }
  },
  async addImage(file) {
    if (!file) return;
    $('#add-out').innerHTML = '<p class="muted"><span class="spin"></span> 正在看截圖…</p>';
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
  async addRun(input) {
    const out = $('#add-out'), go = $('#add-go');
    out.innerHTML = '<p class="muted"><span class="spin"></span> 正在讀貼文、找店名…</p>'; go.disabled = true;
    try {
      const r = await Extract.run(input);
      const src = r.source || {};
      S.cands = (r.places || []).map(p => ({
        ...p, name: (p.name || '').trim(), city: normCity(p.city) || parseAddr(p.address).city, district: p.district || parseAddr(p.address).district,
        category: CATS[p.category] ? p.category : 'restaurant', meals: (p.meals || []).filter(m => MEALS[m]), price: [1, 2, 3, 4].includes(+p.price) ? +p.price : null,
        source_url: src.url || input.url || '', source_text: (src.caption || input.text || '').slice(0, 2000), on: true,
      })).filter(p => p.name);
      if (!S.cands.length) {
        out.innerHTML = `<div class="note" style="margin-top:12px">沒找到店家。${src.caption ? `<br>讀到的文字：<br><i>${esc(src.caption.slice(0, 300))}</i>` : ''}<br>可以改貼店名或地址，或<a href="#" onclick="App.editPlace(null, {source_url: '${esc(input.url || '')}'});return false">自己填</a>。</div>`;
        return;
      }
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
      out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    } finally { if (go) go.disabled = false; }
  },
  renderCands() {
    const out = $('#add-out'); if (!out || !S.cands) return;
    const dup = c => S.places.find(p => isMine(p) && p.name.replace(/\s/g, '') === c.name.replace(/\s/g, '') && (!c.city || !p.city || normCity(p.city) === c.city));
    const n = S.cands.filter(c => c.on).length;
    out.innerHTML = `<p style="margin:14px 0 0"><b>找到 ${S.cands.length} 間</b> <span class="muted">（名稱、分類可以直接改）</span></p>
      ${S.cands.map((c, i) => `<div class="cand ${c.on ? '' : 'off'}">
        <div class="row"><input type="checkbox" style="width:auto" ${c.on ? 'checked' : ''} onchange="S.cands[${i}].on=this.checked;App.renderCands()">
          <input class="grow" style="font-weight:600" value="${esc(c.name)}" onchange="S.cands[${i}].name=this.value"></div>
        <div class="two" style="margin-top:6px">
          <select onchange="S.cands[${i}].category=this.value">${Object.entries(CATS).map(([k, [t, e]]) => `<option value="${k}" ${c.category === k ? 'selected' : ''}>${e} ${t}</option>`).join('')}</select>
          <select onchange="S.cands[${i}].city=this.value"><option value="">地區？</option>${[...new Set([...CITIES, c.city].filter(Boolean))].map(x => `<option ${c.city === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        </div>
        <div class="muted" style="margin-top:6px">${esc([c.district, c.address].filter(Boolean).join(' · ') || '沒有地址')}${c.cuisine ? ' · ' + esc(c.cuisine) : ''}${c.price ? ' · ' + PRICES[c.price] : ''}</div>
        <div class="muted">${c.locating ? '<span class="spin"></span> 找地圖位置…' : c.lat != null ? (c.approx ? '📍 已找到大概位置' : '📍 已找到位置') : '📍 找不到位置，存好後可以在地圖上點'}</div>
        ${c.note ? `<div class="muted">💬 ${esc(c.note)}</div>` : ''}
        ${dup(c) ? '<div class="err">已經收藏過同名的店</div>' : ''}
      </div>`).join('')}
      ${cloud() && S.groups.length ? `<label>同時分享到群組</label><div class="filters" style="flex-wrap:wrap">${S.groups.map(g => `<span class="chip ${(S.addGroups || []).includes(g.id) ? 'on' : ''}" onclick="App.toggleAddGroup('${g.id}')">👥 ${esc(g.name)}</span>`).join('')}</div>` : ''}
      <button class="primary big" style="width:100%;margin-top:12px" ${n ? '' : 'disabled'} onclick="App.saveCands()">收藏 ${n} 間</button>`;
  },
  toggleAddGroup(id) {
    const a = S.addGroups || []; S.addGroups = a.includes(id) ? a.filter(x => x !== id) : [...a, id];
    save('food.addGroups', S.addGroups); App.renderCands();
  },
  async saveCands() {
    const pick = S.cands.filter(c => c.on);
    try {
      const saved = [];
      for (const c of pick) {
        const p = { name: c.name, branch: c.branch || '', address: c.address || '', city: c.city || '', district: c.district || '', lat: c.lat ?? null, lng: c.lng ?? null, approx: !!c.approx,
          category: c.category, cuisine: c.cuisine || '', price: c.price, meals: c.meals || [], hours: c.hours || '', status: 'want', rating: null, note: c.note || '', tags: (c.tags || []).slice(0, 6),
          source_url: c.source_url || '', source_text: c.source_text || '' };
        saved.push(await DB.savePlace(p));
      }
      if (cloud()) for (const g of (S.addGroups || []).filter(id => S.groups.some(x => x.id === id))) await App.share(g, saved.map(p => p.id), true);
      App.close(); toast(`收藏了 ${saved.length} 間 🎉`); App.render();
    } catch (e) { toast('儲存失敗：' + e.message, 5000); }
  },

  // ----- 店家詳細／編輯 -----
  openPlace(id) {
    const p = S.places.find(x => x.id === id); if (!p) return;
    const [t, e] = cat(p);
    const mine = isMine(p);
    const myGroups = S.groups.filter(g => S.groupPlaces.some(x => x.group_id === g.id && x.place_id === p.id));
    App.sheet(`<div class="sheet-h"><div class="emo">${e}</div><h2>${esc(p.name)} ${p.branch ? `<span class="muted">${esc(p.branch)}</span>` : ''}</h2><button class="ghost" onclick="App.close()">✕</button></div>
      <div class="meta"><span class="tag">${t}${p.cuisine ? '・' + esc(p.cuisine) : ''}</span>${p.price ? `<span class="tag">${PRICES[p.price]}</span>` : ''}${(p.meals || []).map(m => `<span class="tag">${MEALS[m]}</span>`).join('')}${(p.tags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join('')}</div>
      <p style="margin:10px 0 4px">📍 ${esc(p.address || [normCity(p.city), p.district].filter(Boolean).join(' ') || '沒有地址')}${S.pos && p.lat != null ? ` <span class="muted">（${fmtKm(distKm(S.pos, p))}）</span>` : ''}</p>
      ${p.hours ? `<p style="margin:4px 0">🕑 ${esc(p.hours)}</p>` : ''}
      ${p.note ? `<p style="margin:4px 0">💬 ${esc(p.note)}</p>` : ''}
      ${!mine ? `<p class="muted">👤 ${esc(nameOf(p.owner))} 的收藏</p>` : ''}
      ${mine ? `<div class="row" style="margin:12px 0"><div class="seg grow"><button class="${p.status === 'want' ? 'on' : ''}" onclick="App.quick('${p.id}', {status:'want'})">想去</button><button class="${p.status === 'been' ? 'on' : ''}" onclick="App.quick('${p.id}', {status:'been'})">去過了</button></div>
        ${p.status === 'been' ? `<div class="stars">${[1, 2, 3, 4, 5].map(n => `<span class="${(p.rating || 0) >= n ? 'on' : ''}" onclick="App.quick('${p.id}', {rating:${n}})">★</span>`).join('')}</div>` : ''}</div>` : ''}
      <div class="row" style="margin:12px 0">
        <a href="${mapsUrl(p)}" target="_blank" rel="noopener"><button class="primary">🧭 Google 地圖導航</button></a>
        ${p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener"><button>📱 原始貼文</button></a>` : ''}
        ${mine ? `<button onclick="App.editPlace('${p.id}')">✏️ 編輯</button>` : `<button onclick="App.copyToMine('${p.id}')">⭐ 收進我的</button>`}
      </div>
      ${p.lat != null ? `<div id="mini" class="minimap"></div>${p.approx ? '<p class="muted">位置是用地址大概找的，可以在「編輯」裡點地圖修正。</p>' : ''}` : mine ? '<p class="muted">還沒有地圖位置，到「編輯」裡點地圖就能補上。</p>' : ''}
      ${mine && cloud() && S.groups.length ? `<label>分享到群組</label><div class="filters" style="flex-wrap:wrap">${S.groups.map(g => { const on = myGroups.includes(g); return `<span class="chip ${on ? 'on' : ''}" onclick="App.${on ? 'unshare' : 'share'}('${g.id}', ['${p.id}']).then(() => App.openPlace('${p.id}'))">👥 ${esc(g.name)}</span>`; }).join('')}</div>` : ''}
      ${p.source_text ? `<details style="margin-top:12px"><summary class="muted">原始貼文文字</summary><p style="white-space:pre-wrap;font-size:13px">${esc(p.source_text)}</p></details>` : ''}`);
    if (p.lat != null) setTimeout(() => App.mini(p, false), 30);
  },
  mini(p, editable) {
    const el = $('#mini'); if (!el) return;
    const center = p.lat != null ? [p.lat, p.lng] : S.pos ? [S.pos.lat, S.pos.lng] : [25.04, 121.53];
    const m = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, p.lat != null ? 16 : 12);
    L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
    let mk = p.lat != null ? L.marker(center).addTo(m) : null;
    if (editable) m.on('click', e => {
      S.edit.lat = e.latlng.lat; S.edit.lng = e.latlng.lng; S.edit.approx = false;
      if (mk) mk.setLatLng(e.latlng); else mk = L.marker(e.latlng).addTo(m);
      $('#pinmsg').textContent = '📍 位置已更新';
    });
    S.miniMap = m;
  },
  async quick(id, patch) {
    const p = S.places.find(x => x.id === id);
    try { await DB.savePlace({ ...p, ...patch }); S.keepScroll = true; App.render(); App.openPlace(id); }
    catch (e) { toast('儲存失敗：' + e.message); }
  },
  editPlace(id, base = {}) {
    const p = id ? { ...S.places.find(x => x.id === id) } : { name: '', branch: '', address: '', city: '', district: '', lat: null, lng: null, approx: false, category: 'restaurant', cuisine: '', price: null, meals: [], hours: '', status: 'want', rating: null, note: '', tags: [], source_url: '', source_text: '', ...base };
    S.edit = p;
    const f = (k, label, ph = '') => `<label>${label}</label><input value="${esc(p[k] || '')}" placeholder="${ph}" onchange="S.edit.${k}=this.value">`;
    App.sheet(`<div class="sheet-h"><h2>${id ? '編輯' : '自己新增'}</h2><button class="ghost" onclick="App.close()">✕</button></div>
      <div class="two"><div>${f('name', '店名 *')}</div><div>${f('branch', '分店')}</div></div>
      <label>地址</label><div class="row"><input class="grow" id="ed-addr" value="${esc(p.address)}" onchange="S.edit.address=this.value;Object.assign(S.edit, Object.fromEntries(Object.entries(parseAddr(this.value)).filter(([k, v]) => v && !S.edit[k])))"><button onclick="App.geoEdit()">找位置</button></div>
      <div id="mini" class="minimap"></div><p class="muted" id="pinmsg">點地圖可以放置或移動位置。</p>
      <div class="two">
        <div><label>縣市</label><select onchange="S.edit.city=this.value"><option value="">—</option>${[...new Set([...CITIES, p.city].filter(Boolean))].map(c => `<option ${normCity(p.city) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div>${f('district', '區', '大安區')}</div>
        <div><label>分類</label><select onchange="S.edit.category=this.value">${Object.entries(CATS).map(([k, [t, e]]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${e} ${t}</option>`).join('')}</select></div>
        <div>${f('cuisine', '料理類型', '日式拉麵')}</div>
        <div><label>每人預算</label><select onchange="S.edit.price=+this.value||null"><option value="">不知道</option>${Object.entries(PRICES).map(([k, t]) => `<option value="${k}" ${+p.price === +k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div>${f('hours', '營業時間')}</div>
      </div>
      <label>適合時段</label><div class="filters" style="flex-wrap:wrap">${Object.entries(MEALS).map(([k, t]) => `<span class="chip ${p.meals.includes(k) ? 'on' : ''}" onclick="this.classList.toggle('on');S.edit.meals=S.edit.meals.includes('${k}')?S.edit.meals.filter(x=>x!=='${k}'):[...S.edit.meals,'${k}']">${t}</span>`).join('')}</div>
      <label>筆記</label><textarea rows="2" onchange="S.edit.note=this.value">${esc(p.note)}</textarea>
      <label>標籤（用空白或逗號分開）</label><input value="${esc((p.tags || []).join(' '))}" onchange="S.edit.tags=this.value.split(/[\\s,，、]+/).filter(Boolean)">
      ${f('source_url', '來源連結', 'https://')}
      <div class="row" style="margin-top:16px">${id ? `<button class="danger" onclick="App.delPlace('${id}')">刪除</button>` : ''}<span class="grow"></span><button onclick="App.close()">取消</button><button class="primary" onclick="App.saveEdit()">儲存</button></div>`);
    setTimeout(() => App.mini(p, true), 30);
  },
  async geoEdit() {
    const e = S.edit; e.address = $('#ed-addr').value;
    $('#pinmsg').innerHTML = '<span class="spin"></span> 找位置中…';
    const g = await Geo.locate(e);
    if (!g) { $('#pinmsg').textContent = '找不到，請直接點地圖。'; return; }
    Object.assign(e, { lat: g.lat, lng: g.lng, approx: g.approx, city: e.city || g.city, district: e.district || g.district });
    S.miniMap?.remove(); App.mini(e, true);
    $('#pinmsg').textContent = g.approx ? '📍 找到大概位置，可以點地圖修正' : '📍 找到了';
  },
  async saveEdit() {
    const e = S.edit;
    if (!e.name?.trim()) return toast('店名要填');
    e.city = normCity(e.city);
    try {
      const saved = await DB.savePlace(e); App.close(); toast('已儲存'); S.keepScroll = true; App.render();
      // 沒點地圖也沒按「找位置」，就在背景用地址補上位置
      if (saved.lat == null && (saved.address || saved.city)) {
        const g = await Geo.locate(saved);
        if (g) { await DB.savePlace({ ...S.places.find(x => x.id === saved.id), lat: g.lat, lng: g.lng, approx: g.approx, city: saved.city || g.city, district: saved.district || g.district }); S.keepScroll = true; if (!$('.sheet-bg')) App.render(); }
      }
    } catch (err) { toast('儲存失敗：' + err.message, 5000); }
  },
  async delPlace(id) {
    if (!confirm('確定刪除這間店？')) return;
    try { await DB.deletePlace(id); App.close(); S.keepScroll = true; App.render(); }
    catch (e) { toast('刪除失敗：' + e.message); }
  },
  async copyToMine(id) {
    const p = { ...S.places.find(x => x.id === id) };
    for (const k of ['id', 'owner', 'created_at', 'updated_at']) delete p[k];
    Object.assign(p, { status: 'want', rating: null });
    try { const n = await DB.savePlace(p); toast('已收進你的收藏'); App.openPlace(n.id); App.render(); }
    catch (e) { toast('失敗：' + e.message); }
  },

  // ----- 抽籤 -----
  drawSet(k, v, multi) {
    const d = S.draw;
    if (multi) d[k] = d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v];
    else d[k] = v;
    save('food.draw', d); S.keepScroll = true; App.render();
  },
  async doDraw(exclude) {
    const d = S.draw;
    let pool = Draw.pool();
    if (exclude) d.recent = [exclude, ...d.recent.filter(x => x !== exclude)];
    const fresh = pool.filter(p => !d.recent.slice(0, 5).includes(p.id));
    if (fresh.length) pool = fresh;
    if (!pool.length) return toast('沒有可以抽的店');
    const box = $('#drawbox'); box.classList.add('rolling');
    const nameEl = box.querySelector('.draw-name'), emo = box.querySelector('.emo');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    box.querySelector('button').disabled = true;
    // 先快後慢地跳名字
    for (let i = 0, t = 50; i < 16; i++, t *= 1.16) {
      const p = i === 15 ? pick : pool[Math.floor(Math.random() * pool.length)];
      nameEl.textContent = p.name; emo.textContent = cat(p)[1];
      await sleep(t);
    }
    box.classList.remove('rolling');
    d.recent = [pick.id, ...d.recent.filter(x => x !== pick.id)].slice(0, 10); save('food.draw', d);
    const [t] = cat(pick);
    box.innerHTML = `<div class="emo">${cat(pick)[1]}</div><div class="muted" style="margin-top:8px">今天就吃</div>
      <div class="draw-name">${esc(pick.name)}${pick.branch ? ` <span class="muted" style="font-size:16px">${esc(pick.branch)}</span>` : ''}</div>
      <div class="meta" style="justify-content:center">${esc([normCity(pick.city), pick.district].filter(Boolean).join(' · '))} · ${t}${pick.price ? ' · ' + PRICES[pick.price] : ''}${S.pos && pick.lat != null ? ' · ' + fmtKm(distKm(S.pos, pick)) : ''}</div>
      ${pick.note ? `<p>${esc(pick.note)}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:14px">
        <a href="${mapsUrl(pick)}" target="_blank" rel="noopener"><button class="primary">🧭 就這間，導航</button></a>
        <button onclick="App.doDraw('${pick.id}')">🎲 換一間</button>
        <button class="ghost" onclick="App.openPlace('${pick.id}')">詳細</button>
      </div>`;
  },

  // ----- 帳號 -----
  async auth() {
    const email = $('#au-email').value.trim(), pw = $('#au-pw').value, err = $('#au-err');
    err.textContent = '';
    try {
      if (S.authMode === 'up') {
        const name = $('#au-name').value.trim();
        if (!name) throw new Error('請填名字');
        const { data, error } = await S.sb.auth.signUp({ email, password: pw, options: { data: { name } } });
        if (error) throw error;
        if (!data.session) { err.textContent = '帳號建好了，請到信箱點確認信再回來登入。（想省掉這步，可以在 Supabase 關掉 Confirm email）'; S.authMode = 'in'; }
      } else {
        const { error } = await S.sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e) {
      err.textContent = /Invalid login/.test(e.message) ? 'Email 或密碼不對' : /already registered/.test(e.message) ? '這個 Email 已經註冊過，請直接登入' : e.message;
    }
  },
  async signOut() { await S.sb.auth.signOut(); },
  async saveName() {
    const name = $('#myname').value.trim(); if (!name) return;
    try { await DB.q(S.sb.from('profiles').update({ name }).eq('id', S.user.id)); S.me.name = name; toast('已更新'); App.render(); }
    catch (e) { toast(e.message); }
  },
  saveSettings() { S.settings.groqKey = $('#groqKey').value.trim(); save('food.settings', S.settings); toast('已儲存'); },
  saveCloud(clear) {
    save('food.cloud', clear ? {} : { supabaseUrl: $('#sbUrl').value.trim(), supabaseKey: $('#sbKey').value.trim() });
    location.reload();
  },

  // ----- 群組 -----
  openGroup(id) { S.group = id; S.round = null; App.render(); window.scrollTo(0, 0); },
  async createGroup() {
    const name = prompt('群組名稱（例如：大學同學吃貨團）'); if (!name?.trim()) return;
    try { const g = await DB.q(S.sb.from('groups').insert({ name: name.trim() }).select().single()); await DB.loadAll(); App.openGroup(g.id); App.invite(g.id); }
    catch (e) { toast('建立失敗：' + e.message); }
  },
  invite(gid) {
    const g = S.groups.find(x => x.id === gid);
    const link = `${location.origin}${location.pathname}?join=${g.invite_code}`;
    const text = `來加入我的美食群組「${g.name}」，一起收藏、一起滑卡決定吃什麼 🍜\n${link}`;
    App.sheet(`<div class="sheet-h"><h2>邀請好友</h2><button class="ghost" onclick="App.close()">✕</button></div>
      <p>把連結傳給朋友，他們登入後就會加入「${esc(g.name)}」。</p>
      <input readonly value="${esc(link)}" onclick="this.select()">
      <p class="muted">或請朋友在「群組 → 輸入邀請碼」輸入：<b style="font-size:18px;letter-spacing:2px">${esc(g.invite_code)}</b></p>
      <div class="row">${navigator.share ? `<button class="primary" onclick="navigator.share({text: ${esc(JSON.stringify(text))}}).catch(()=>{})">分享…</button>` : ''}
      <button onclick="navigator.clipboard.writeText(${esc(JSON.stringify(text))}).then(()=>toast('已複製'))">複製邀請</button>
      <a href="https://line.me/R/share?text=${encodeURIComponent(text)}" target="_blank" rel="noopener"><button>傳到 LINE</button></a></div>`);
  },
  joinPrompt() { const c = prompt('輸入朋友給你的邀請碼'); if (c?.trim()) App.join(c.trim()); },
  async join(code) {
    try { const gid = await DB.rpc('join_group', { code }); await DB.loadAll(); S.tab = 'groups'; S.group = gid; toast(`加入「${S.groups.find(g => g.id === gid)?.name || '群組'}」了 🎉`); App.render(); }
    catch (e) { toast('加入失敗：' + e.message, 4000); }
  },
  async leaveGroup(gid) {
    const g = S.groups.find(x => x.id === gid), owner = g.owner === S.user.id;
    if (!confirm(owner ? `刪除「${g.name}」？所有成員都會看不到這個群組。` : `退出「${g.name}」？`)) return;
    try {
      if (owner) await DB.q(S.sb.from('groups').delete().eq('id', gid));
      else await DB.q(S.sb.from('group_members').delete().eq('group_id', gid).eq('user_id', S.user.id));
      S.group = null; await DB.loadAll(); App.render();
    } catch (e) { toast(e.message); }
  },
  async share(gid, ids, quiet) {
    const rows = ids.filter(id => !S.groupPlaces.some(x => x.group_id === gid && x.place_id === id)).map(place_id => ({ group_id: gid, place_id }));
    if (!rows.length) return;
    try { const d = await DB.q(S.sb.from('group_places').insert(rows).select()); S.groupPlaces.push(...d); if (!quiet) toast('已分享到群組'); S.keepScroll = true; App.render(); }
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
    App.sheet(`<div class="sheet-h"><h2>從我的收藏加入</h2><button class="ghost" onclick="App.close()">✕</button></div>
      ${mine.length ? `<div class="row"><button onclick="document.querySelectorAll('.pk').forEach(c=>{c.checked=true;S.pick.add(c.value)})">全選</button><span class="muted">${mine.length} 間還沒分享</span></div>
      ${mine.map(p => `<label class="row" style="color:var(--text);font-size:15px;margin:6px 0"><input type="checkbox" class="pk" value="${p.id}" style="width:auto" onchange="this.checked?S.pick.add(this.value):S.pick.delete(this.value)"> ${cat(p)[1]} ${esc(p.name)} <span class="muted">${esc(normCity(p.city))}</span></label>`).join('')}
      <button class="primary big" style="width:100%;margin-top:10px" onclick="App.share('${gid}', [...S.pick]).then(App.close)">加入群組</button>` : '<p class="muted">你的收藏都已經在群組裡了。</p>'}`);
  },
  newRound(gid) {
    const ids = new Set(S.groupPlaces.filter(x => x.group_id === gid).map(x => x.place_id));
    const all = S.places.filter(p => ids.has(p.id));
    const cities = [...new Set(all.map(p => normCity(p.city)).filter(Boolean))];
    S.nr = { gid, cities: [], cats: [], meal: '', price: 0, max: 15 };
    const chips = (k, items) => items.map(([v, t]) => `<span class="chip" onclick="this.classList.toggle('on');const a=S.nr.${k};const i=a.indexOf('${v}');i<0?a.push('${v}'):a.splice(i,1);App.nrCount()">${t}</span>`).join('');
    App.sheet(`<div class="sheet-h"><h2>開始滑卡</h2><button class="ghost" onclick="App.close()">✕</button></div>
      <label>這輪要決定什麼</label><input id="nr-title" placeholder="例如：週五晚餐吃什麼" value="一起決定吃什麼">
      ${cities.length > 1 ? `<label>地區（不選＝全部）</label><div class="filters" style="flex-wrap:wrap">${chips('cities', cities.map(c => [c, c]))}</div>` : ''}
      <label>分類（不選＝全部）</label><div class="filters" style="flex-wrap:wrap">${chips('cats', Object.entries(CATS).filter(([k]) => all.some(p => p.category === k)).map(([k, [t, e]]) => [k, e + ' ' + t]))}</div>
      <label>時段</label><select onchange="S.nr.meal=this.value;App.nrCount()"><option value="">不限</option>${Object.entries(MEALS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <label>每人預算</label><select onchange="S.nr.price=+this.value;App.nrCount()"><option value="0">不限</option><option value="1">200 內</option><option value="2">500 內</option><option value="3">1000 內</option></select>
      <label>最多幾張</label><select onchange="S.nr.max=+this.value;App.nrCount()">${[10, 15, 20, 30, 50].map(n => `<option ${n === 15 ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <p id="nr-count" class="muted"></p>
      <button class="primary big" style="width:100%" onclick="App.startRound()">開始</button>`);
    App.nrCount();
  },
  nrPool() {
    const n = S.nr, ids = new Set(S.groupPlaces.filter(x => x.group_id === n.gid).map(x => x.place_id));
    let l = S.places.filter(p => ids.has(p.id));
    if (n.cities.length) l = l.filter(p => n.cities.includes(normCity(p.city)));
    if (n.cats.length) l = l.filter(p => n.cats.includes(p.category));
    if (n.meal) l = l.filter(p => !(p.meals || []).length || p.meals.includes(n.meal));
    if (n.price) l = l.filter(p => !p.price || p.price <= n.price);
    return l.sort(() => Math.random() - 0.5).slice(0, n.max);
  },
  nrCount() { const c = App.nrPool().length; $('#nr-count').textContent = c ? `會有 ${c} 張卡` : '沒有符合條件的店'; },
  async startRound() {
    const pool = App.nrPool(); if (!pool.length) return toast('沒有符合條件的店');
    const n = S.nr;
    try {
      const r = await DB.q(S.sb.from('swipe_rounds').insert({ group_id: n.gid, title: $('#nr-title').value.trim(), filters: { cities: n.cities, cats: n.cats, meal: n.meal, price: n.price }, place_ids: pool.map(p => p.id) }).select().single());
      S.rounds.unshift(r); App.close(); App.openRound(r.id);
    } catch (e) { toast('失敗：' + e.message); }
  },
  openRound(id) { S.round = id; S.showResult = false; App.render(); window.scrollTo(0, 0); },
  async swipe(liked) {
    const card = $('#scard'); if (!card || card.dataset.busy) return;
    card.dataset.busy = 1;
    const pid = card.dataset.id, r = S.rounds.find(x => x.id === S.round);
    card.style.transition = 'transform .3s, opacity .3s';
    card.style.transform = `translateX(${liked ? 500 : -500}px) rotate(${liked ? 25 : -25}deg)`; card.style.opacity = 0;
    const row = { round_id: r.id, user_id: S.user.id, place_id: pid, liked };
    S.swipes.push(row);
    try { await DB.q(S.sb.from('swipes').upsert(row)); }
    catch (e) { toast('沒存到：' + e.message); S.swipes = S.swipes.filter(s => s !== row); }
    if (liked) App.checkMatch(r, pid);
    await sleep(250); App.render();
  },
  checkMatch(r, pid) {
    const m = Swipe.matches(r).find(x => x.p.id === pid);
    if (m?.all) toast(`💘 配對成功：${m.p.name}！大家都想吃`, 4000);
  },
  realtime() {
    if (App._ch) S.sb.removeChannel(App._ch);
    let t;
    const refresh = () => { clearTimeout(t); t = setTimeout(async () => { const before = new Set(S.rounds.flatMap(r => Swipe.matches(r).filter(x => x.all).map(x => r.id + x.p.id))); await DB.loadAll(); S.keepScroll = true; if (!$('.sheet-bg') && !$('#scard')?.style.transform) App.render(); for (const r of S.rounds) for (const x of Swipe.matches(r)) if (x.all && !before.has(r.id + x.p.id)) toast(`💘 配對成功：${x.p.name}！`, 4000); }, 600); };
    App._ch = S.sb.channel('food').on('postgres_changes', { event: '*', schema: 'public', table: 'swipes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_places' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swipe_rounds' }, refresh).subscribe();
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
      for (const p of list) { const c = { ...p }; for (const k of ['id', 'owner', 'created_at', 'updated_at']) delete c[k]; await DB.savePlace(c); }
      localStorage.removeItem('food.places'); toast(`上傳了 ${list.length} 間`); App.render();
    } catch (e) { toast('上傳失敗：' + e.message, 5000); }
  },

  // ----- 外部分享進來（Android 把 IG 分享到這個 app）、邀請連結 -----
  handleShare() {
    const u = new URL(location.href), q = u.searchParams;
    const shared = [q.get('share_url'), q.get('share_text'), q.get('share_title')].filter(Boolean).join('\n');
    if (q.has('join') || shared) history.replaceState(null, '', location.pathname);
    if (shared && !(cloud() && !S.user)) App.openAdd(shared);
    else if (shared) save('food.pendingShare', shared);
    const ps = load('food.pendingShare', '');
    if (ps && !(cloud() && !S.user)) { save('food.pendingShare', ''); App.openAdd(ps); }
  },

  // ----- 抽屜 -----
  sheet(html) {
    S.miniMap?.remove(); S.miniMap = null;
    $('#sheet').innerHTML = `<div class="sheet-bg" onclick="if(event.target===this)App.close()"><div class="sheet">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
  },
  close() { S.miniMap?.remove(); S.miniMap = null; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; },
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('.sheet-bg')) App.close();
  if ($('#scard') && !$('.sheet-bg') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    if (e.key === 'ArrowRight') App.swipe(true);
    if (e.key === 'ArrowLeft') App.swipe(false);
  }
});

(async () => {
  S.addGroups = load('food.addGroups', []);
  const join = new URL(location.href).searchParams.get('join');
  if (join) save('food.pendingJoin', join);
  await DB.init();
  if (!cloud() && join) { save('food.pendingJoin', ''); toast('這個網址還沒接上雲端，加入不了群組', 5000); }
  await App.boot();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
