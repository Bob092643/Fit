const CACHE = 'fitworden-v6';
const SDK = 'fitworden-sdk';
const ASSETS = ['./', 'index.html', 'styles.css', 'data.js', 'app.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const INDEX = new URL('index.html', self.registration.scope).href;
const TIMEOUT = 3500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SDK).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNetwork(url, key, cache) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), TIMEOUT);
    fetch(url, { cache: 'no-cache' }).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { cache.put(key, res.clone()); resolve(res); } else resolve(null);
    }).catch(() => { clearTimeout(timer); resolve(null); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.open(SDK).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.hostname === 'firestore.googleapis.com' || url.origin !== location.origin) return;
  const isNav = req.mode === 'navigate';
  const fresh = isNav || /\.(html|js|css|webmanifest)$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async cache => {
    const key = isNav ? INDEX : url.href.split('?')[0];
    if (fresh) {
      const net = await fromNetwork(isNav ? INDEX : req.url, key, cache);
      return net || (await cache.match(key)) || (await cache.match(INDEX)) || Response.error();
    }
    const cached = await cache.match(key);
    if (cached) return cached;
    const net = await fromNetwork(req.url, key, cache);
    return net || Response.error();
  }));
});
