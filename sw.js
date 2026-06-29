// Service worker for Rack-Free Tracker (PWA offline support).
// Must be a real same-origin file — browsers reject service workers registered
// from blob: URLs, which is why the previous inline-blob registration silently
// failed and offline never worked.
const C = 'rft-v41';
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Navigations: network-first so a fresh deploy is picked up when online, falling
// back to the cached shell offline. Other GETs: cache-first for instant loads.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    e.respondWith(
      fetch(req)
        .then(r => { caches.open(C).then(c => c.put(req, r.clone())); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(C).then(c => c.put(req, clone));
      }
      return resp;
    }).catch(() => new Response('Offline')))
  );
});
