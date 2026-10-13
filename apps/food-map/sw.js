// app 本身：先用手機裡存好的版本直接打開（不用等網路，開 app 幾乎是瞬間），同時在背景問伺服器有沒有新版
// 有新版就存起來並通知畫面，畫面會在你切出去、或剛打開還沒碰的時候悄悄換成新版（見 app.js 的「換新版」）
// 地圖、登入用的函式庫網址有固定版本號，內容不會變，存一次之後直接從手機裡拿
const CACHE = 'food-map-v8';
const LIBS = 'food-map-libs-v1';
const FILES = ['./', './index.html', './app.js', './config.js', './manifest.json', './icon.svg', './apple-touch-icon.png', '../portal-home.js'];
// 會影響畫面的檔案：這幾個變了才算有新版
const CODE = /\/(index\.html|app\.js|config\.js|portal-home\.js)?$/;
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('food-map') && k !== CACHE && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const notify = () => self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'food-map-update' })));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname)) {
    e.respondWith(caches.open(LIBS).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  const key = url.pathname.endsWith('/') ? new Request(url.origin + url.pathname) : e.request;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: true }), prev = hit?.clone();
    // cache: 'no-cache' 讓瀏覽器每次都問伺服器有沒有新版（GitHub Pages 會叫手機快取 10 分鐘）
    const net = fetch(e.request.mode === 'navigate' ? url.href : e.request, { cache: 'no-cache' }).then(async r => {
      if (!r.ok || r.type === 'opaqueredirect') return r;
      if (hit && CODE.test(url.pathname)) {
        const [a, b] = await Promise.all([prev.text(), r.clone().text()]);
        if (a !== b) { await c.put(key, r.clone()); notify(); }
      } else await c.put(key, r.clone());
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => caches.match(e.request, { ignoreSearch: true }));
  }));
});
