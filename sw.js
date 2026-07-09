// Service worker for Rack-Free Tracker (PWA offline support).
// Must be a real same-origin file — browsers reject service workers registered
// from blob: URLs, which is why the previous inline-blob registration silently
// failed and offline never worked.
const C = 'rft-v51';
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
  // Web fonts (Google Fonts CSS + woff2) are cross-origin ('cors'/'opaque'), so the
  // same-origin type==='basic' guard below never cached them — offline, the entire
  // display typography silently fell back to system fonts. Cache-first, runtime-filled.
  let host = '';
  try { host = new URL(req.url).hostname; } catch (_) {}
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const clone = resp.clone();
          caches.open(C).then(c => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => new Response('', { status: 504 })))
    );
    return;
  }
  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    e.respondWith(
      fetch(req)
        // Only cache a SUCCESSFUL same-origin shell. Caching an error (503 during a deploy,
        // edge 5xx/404) would overwrite the good cached shell and break the next offline load
        // — the exact failure this SW exists to prevent. Mirrors the asset branch's guard.
        .then(r => { if (r && r.ok && r.type === 'basic') { const c = r.clone(); caches.open(C).then(ch => ch.put(req, c)).catch(() => {}); } return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      // Same-origin assets only — fonts are handled by their dedicated branch above.
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(C).then(c => c.put(req, clone));
      }
      return resp;
    }).catch(() => new Response('Offline')))
  );
});
