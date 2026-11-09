const V = 'gallery-v2';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;
  // רשת קודם (עדכונים), מטמון כגיבוי לעבודה בלי אינטרנט
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
