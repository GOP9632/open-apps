// app 本身：網路優先（改版馬上生效），網路太慢或斷線時用快取打開（資料在雲端或 localStorage）
// 地圖、登入用的函式庫網址有固定版本號，內容不會變，存一次之後直接從手機裡拿
const CACHE = 'food-map-v7';
const LIBS = 'food-map-libs-v1';
const FILES = ['./', './index.html', './app.js', './config.js', './manifest.json', './icon.svg', './apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('food-map') && k !== CACHE && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname)) {
    e.respondWith(caches.open(LIBS).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // cache: 'no-cache' 讓瀏覽器每次都問伺服器有沒有新版（GitHub Pages 會叫手機快取 10 分鐘，不然改版要等很久才看得到）
  const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; });
  const slow = new Promise(res => setTimeout(res, 2500)).then(() => caches.match(e.request, { ignoreSearch: true }));
  e.respondWith(Promise.race([net.catch(() => null), slow]).then(r => r || net).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
