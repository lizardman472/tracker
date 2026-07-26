// Service worker for Rack-Free Tracker (PWA offline support).
// Must be a real same-origin file — browsers reject service workers registered
// from blob: URLs, which is why the previous inline-blob registration silently
// failed and offline never worked.
const C = 'rft-v77';
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

// Tapping a rest-done notification (fired via reg.showNotification) should bring the app
// forward rather than open a duplicate tab — focus an existing client, else open one.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
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
    // Network-first, but with a deadline. The .catch below only fires on a FAILED fetch —
    // on a captive portal or dead-but-connected signal the request just hangs, for tens of
    // seconds, while a perfectly good cached shell sits unused. That is the exact situation
    // this SW exists for, and the one most likely to happen mid-gym. Race the network
    // against a short timer and serve the cache if it wins.
    const NAV_TIMEOUT = 3000;
    const fromCache = () => caches.match(req).then(r => r || caches.match('./index.html'));
    const net = fetch(req)
      // Only cache a SUCCESSFUL same-origin shell. Caching an error (503 during a deploy,
      // edge 5xx/404) would overwrite the good cached shell and break the next offline load
      // — the exact failure this SW exists to prevent. Mirrors the asset branch's guard.
      .then(r => { if (r && r.ok && r.type === 'basic') { const c = r.clone(); caches.open(C).then(ch => ch.put(req, c)).catch(() => {}); } return r; });
    // When the timer wins, respondWith settles from cache and the browser is then free to
    // kill this worker — taking the still-in-flight refresh with it. waitUntil keeps the
    // worker alive until the network settles, which is what actually makes "served from
    // cache now, fresh shell next launch" true. The rejection is swallowed: a failed
    // background refresh is expected offline and must not mark the fetch event as failed.
    e.waitUntil(net.catch(() => {}));
    e.respondWith(
      new Promise(resolve => {
        let settled = false;
        const done = v => { if (!settled) { settled = true; resolve(v); } };
        const timer = setTimeout(() => done(fromCache()), NAV_TIMEOUT);
        net.then(r => { clearTimeout(timer); done(r); })
           // A slow network that eventually succeeds still refreshes the cache above, even
           // though the user was already served from cache — next load gets the new shell.
           .catch(() => { clearTimeout(timer); done(fromCache()); });
      })
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
