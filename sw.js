// Service worker for Rack-Free Tracker (PWA offline support).
// Must be a real same-origin file — browsers reject service workers registered
// from blob: URLs, which is why the previous inline-blob registration silently
// failed and offline never worked.
// v82 merges two independently-audited shells: v77 (accessible names, one notification
// path, 504 on a failed asset) and v81 (F1–F5). Neither version was ever served with the
// other's changes, so the merged shell needs its own cache key rather than either input's.
// v83: program v18 (Day B's triceps extension back on the floor) changed index.html.
// v84: program v19 (the off-rotation core block) changed index.html again.
// v85: program v20 (core block dissolved back into A/B/C, days re-sorted by implement,
// every rest cut to 1:00) changed index.html again. A stale v84 shell would keep serving
// the old day order and the old rest times, so the key has to move with the program.
const C = 'rft-v87';
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
    // The font STYLESHEET is render- and script-blocking: it sits in <head> above the inline
    // app script, so until it settles the app does not boot at all. The .catch below only
    // fires on a FAILED fetch — on a captive portal or a dead-but-connected signal the request
    // simply HANGS, and the page stays blank indefinitely. Measured with the font host hanging:
    // the SW served the cached shell in 43ms and the app screen had still not rendered after
    // 20s. That is the same hazard the navigation branch races a timer against, and it bites
    // more often than "first load only" — activate() evicts the previous release's cache, so
    // the launch right after every update re-fetches the fonts from the network.
    // Cache-first is unchanged; only a MISS is put on a deadline, and losing the race costs
    // nothing but a fallback typeface for one load.
    const FONT_TIMEOUT = 2500;
    // Claimed synchronously (waitUntil is only legal while the event is active) so a font
    // fetch that outlives the response still finishes writing to the cache.
    let keepAlive;
    e.waitUntil(new Promise(res => { keepAlive = res }));
    e.respondWith(
      caches.match(req).then(hit => {
        if (hit) { keepAlive(); return hit; }
        const net = fetch(req).then(resp => {
          if (resp && (resp.ok || resp.type === 'opaque')) {
            const clone = resp.clone();
            caches.open(C).then(c => c.put(req, clone)).catch(() => {});
          }
          return resp;
        });
        net.then(keepAlive, keepAlive);
        return new Promise(resolve => {
          let settled = false;
          const done = v => { if (!settled) { settled = true; resolve(v); } };
          const timer = setTimeout(() => done(new Response('', { status: 504 })), FONT_TIMEOUT);
          net.then(r => { clearTimeout(timer); done(r); })
             .catch(() => { clearTimeout(timer); done(new Response('', { status: 504 })); });
        });
      })
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
      // A failed asset fetch must NOT look like a successful one. `new Response('Offline')`
      // defaults to status 200, so a stylesheet or script that never loaded was handed back
      // as a 200 whose body is the word "Offline" — CSS silently no-ops and JS throws a
      // syntax error, neither of which reads as "you are offline". 504 matches the fonts
      // branch above and lets the page tell the two apart.
    }).catch(() => new Response('', { status: 504, statusText: 'Offline' })))
  );
});
