// Service-worker tests for the Rack-Free Tracker.
//
// sw.js was the one shipped file with no coverage, and that is exactly where a regression
// slipped through: the navigation-timeout fix landed without e.waitUntil, so the background
// refresh it promised could be killed mid-flight. Nothing caught it because nothing ran it.
//
// Same approach as the other batteries: no jsdom, no deps. sw.js is a plain script that only
// touches `self`, `caches`, `fetch`, `Response` and the timers, so it evals cleanly in a vm
// context with those stubbed, and the registered listeners are captured and invoked directly.
//
// A NOTE ON THE STUBS, learned the hard way. The render harness once escaped quotes in its
// textContent stub, making the double SAFER than a browser — which meant no test could ever
// catch the unescaped-attribute bug that shipped for months. These stubs are therefore written
// to mirror real behaviour, INCLUDING the awkward parts:
//   • Cache Storage keys on the request URL, so cache.addAll(['./index.html']) does NOT match
//     a navigation to /some/path. That mismatch is precisely why sw.js needs its explicit
//     './index.html' fallback, and the stub must reproduce it rather than paper over it.
//   • resp.clone() returns a body-consumable copy; caching a response the handler also returns
//     must not disturb what the page receives.
//   • A fake clock drives setTimeout so the 3s navigation deadline is exercised instantly and
//     deterministically. It is NOT a shortcut around the timeout — the timeout still has to
//     fire on its own schedule; the test just controls when "now" advances.
//
// Run with:  node tests/sw.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// SW_PATH lets the mutation check (see tests/sw.mutate.js) point this battery at a deliberately
// broken copy, to prove these assertions actually fail when the behaviour they describe breaks.
const SW_SRC = fs.readFileSync(process.env.SW_PATH || path.join(__dirname, '..', 'sw.js'), 'utf8');

let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };

// Hang guard. This battery awaits promises produced by respondWith, so a regression that makes
// the handler never respond leaves an await pending forever — Node then drains the event loop
// and exits 0 with no summary, which CI reads as a pass. That is not theoretical: removing the
// navigation deadline is exactly such a regression, and it escaped this file until the mutation
// check caught the silence. Any exit before the summary is now a failure.
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    console.log('\nFAIL: suite exited before finishing — a promise never settled.');
    console.log('      Most likely a fetch handler that never calls respondWith, or never resolves it.');
    process.exitCode = 1;
  }
});

// ── minimal Response/Request doubles ────────────────────────────────────────────────────────
// `type` mirrors the browser's response taint: 'basic' = same-origin, 'opaque' = no-cors
// cross-origin (unreadable, status 0), 'cors' = readable cross-origin.
class Res {
  constructor(body = '', { status = 200, type = 'basic', tag = null } = {}) {
    this.body = body; this.status = status; this.type = type; this.tag = tag;
    this._consumed = false;
  }
  get ok() { return this.status >= 200 && this.status < 300 }
  clone() { const c = new Res(this.body, { status: this.status, type: this.type, tag: this.tag }); return c }
}
const Req = (url, { method = 'GET', mode = 'same-origin', accept = '' } = {}) =>
  ({ url, method, mode, headers: { get: h => (h.toLowerCase() === 'accept' ? accept : null) } });

// ── Cache Storage double ────────────────────────────────────────────────────────────────────
// Keyed by URL string, like the real thing. Requests resolve via .url; bare strings (which
// sw.js uses for CORE and for the shell fallback) key on themselves.
const keyOf = r => (typeof r === 'string' ? r : r && r.url);

function makeCaches() {
  const store = new Map(); // cacheName -> Map(urlKey -> Res)
  const api = {
    open: name => Promise.resolve(cacheFor(name)),
    keys: () => Promise.resolve([...store.keys()]),
    delete: name => Promise.resolve(store.delete(name)),
    // caches.match() searches every cache, as the real API does.
    match: req => {
      for (const c of store.values()) { const hit = c.get(keyOf(req)); if (hit) return Promise.resolve(hit) }
      return Promise.resolve(undefined);
    },
    _dump: name => [...(store.get(name) || new Map()).keys()],
    _raw: store,
  };
  function cacheFor(name) {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      addAll: urls => { urls.forEach(u => m.set(keyOf(u), new Res('core:' + u))); return Promise.resolve() },
      put: (req, resp) => { m.set(keyOf(req), resp); return Promise.resolve() },
      match: req => Promise.resolve(m.get(keyOf(req))),
    };
  }
  return api;
}

// ── fake clock ──────────────────────────────────────────────────────────────────────────────
function makeClock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + (ms || 0) }); return id },
    clearTimeout: id => { timers.delete(id) },
    // Advance time and run anything due, then let microtasks drain.
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...timers.entries()]) if (t.at <= now) { timers.delete(id); t.fn() }
      await flush();
    },
    pending: () => timers.size,
  };
}
// Let queued promise callbacks run. setImmediate drains the microtask queue between macrotasks.
const flush = () => new Promise(r => setImmediate(r));

// ── load sw.js into a fresh sandbox ─────────────────────────────────────────────────────────
function loadSW({ fetchImpl = () => Promise.reject(new Error('no network')), clients = [] } = {}) {
  const handlers = {};
  const clock = makeClock();
  const caches = makeCaches();
  const opened = [];      // windows opened via clients.openWindow
  const focused = [];     // clients focused
  let claimed = false, skipped = false;
  const ctx = {
    self: {
      addEventListener: (k, f) => { handlers[k] = f },
      skipWaiting: () => { skipped = true },
      clients: {
        claim: () => { claimed = true; return Promise.resolve() },
        matchAll: () => Promise.resolve(clients),
        openWindow: u => { opened.push(u); return Promise.resolve({}) },
      },
    },
    caches,
    fetch: (...a) => fetchImpl(...a),
    Response: Res,
    URL,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    Promise, console,
  };
  vm.createContext(ctx);
  vm.runInContext(SW_SRC, ctx);
  return {
    handlers, caches, clock, ctx,
    state: () => ({ claimed, skipped, opened, focused }),
    // Drive a fetch event and return { response, waitUntil[] }.
    fetchEvent(req) {
      let response, called = false;
      const waits = [];
      handlers.fetch({
        request: req,
        respondWith: p => { called = true; response = p },
        waitUntil: p => { waits.push(p) },
      });
      return { responded: called, response, waits };
    },
    async lifecycle(name, extra = {}) {
      const waits = [];
      handlers[name]({ waitUntil: p => waits.push(p), ...extra });
      await Promise.all(waits.map(p => Promise.resolve(p).catch(() => {})));
      await flush();
      return waits;
    },
  };
}

const CACHE = SW_SRC.match(/const C = '([^']+)'/)[1];

(async () => {

  // ── install ───────────────────────────────────────────────────────────────────────────────
  {
    const sw = loadSW();
    await sw.lifecycle('install');
    const cached = sw.caches._dump(CACHE);
    T('install precaches the app shell', cached.includes('./index.html') && cached.includes('./'), JSON.stringify(cached));
    T('install precaches the manifest', cached.includes('./manifest.webmanifest'), JSON.stringify(cached));
    T('install calls skipWaiting so a new SW takes over', sw.state().skipped);
  }

  // ── activate ──────────────────────────────────────────────────────────────────────────────
  {
    const sw = loadSW();
    // Two stale caches from earlier releases plus the current one.
    await sw.caches.open('rft-v1').then(c => c.put('./old', new Res('x')));
    await sw.caches.open('rft-v2').then(c => c.put('./old', new Res('x')));
    await sw.caches.open(CACHE).then(c => c.put('./index.html', new Res('shell')));
    await sw.lifecycle('activate');
    const names = await sw.caches.keys();
    T('activate deletes caches from previous releases', !names.includes('rft-v1') && !names.includes('rft-v2'), JSON.stringify(names));
    T('activate keeps the current cache', names.includes(CACHE), JSON.stringify(names));
    T('activate claims open clients', sw.state().claimed);
  }

  // ── notificationclick ─────────────────────────────────────────────────────────────────────
  {
    let closed = false;
    const existing = { focus: () => { existing._f = true; return Promise.resolve(existing) } };
    const sw = loadSW({ clients: [existing] });
    await sw.lifecycle('notificationclick', { notification: { close: () => { closed = true } } });
    T('notificationclick dismisses the notification', closed);
    T('a rest-done tap focuses the existing tab', existing._f === true);
    T('...and does not open a duplicate window', sw.state().opened.length === 0, JSON.stringify(sw.state().opened));

    const sw2 = loadSW({ clients: [] });
    await sw2.lifecycle('notificationclick', { notification: { close: () => {} } });
    T('with no open tab, the notification opens one', sw2.state().opened.includes('./'), JSON.stringify(sw2.state().opened));
  }

  // ── non-GET requests are not intercepted ──────────────────────────────────────────────────
  {
    const sw = loadSW();
    const { responded } = sw.fetchEvent(Req('https://app/x', { method: 'POST' }));
    T('a POST is passed straight through to the network', !responded);
  }

  // ── fonts branch (cross-origin, cache-first) ──────────────────────────────────────────────
  {
    // Cached hit: served without touching the network.
    let hits = 0;
    const sw = loadSW({ fetchImpl: () => { hits++; return Promise.resolve(new Res('net')) } });
    const fontReq = Req('https://fonts.gstatic.com/s/font.woff2');
    await sw.caches.open(CACHE).then(c => c.put(fontReq, new Res('cached-font')));
    let r = await sw.fetchEvent(fontReq).response;
    T('a cached font is served without a network call', r.body === 'cached-font' && hits === 0, `${r.body} hits=${hits}`);
  }
  {
    // Miss → network, and an ok response is cached for next time.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('woff', { type: 'cors' })) });
    const fontReq = Req('https://fonts.googleapis.com/css2?family=X');
    const r = await sw.fetchEvent(fontReq).response;
    await flush();
    T('a font miss falls through to the network', r.body === 'woff');
    T('...and is cached for offline use', sw.caches._dump(CACHE).includes(fontReq.url), JSON.stringify(sw.caches._dump(CACHE)));
  }
  {
    // Opaque (no-cors) font responses are deliberately cached even though they are unreadable —
    // that exception is the whole reason the font branch exists.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('', { status: 0, type: 'opaque' })) });
    const fontReq = Req('https://fonts.gstatic.com/s/opaque.woff2');
    await sw.fetchEvent(fontReq).response;
    await flush();
    T('an OPAQUE font response is still cached', sw.caches._dump(CACHE).includes(fontReq.url), JSON.stringify(sw.caches._dump(CACHE)));
  }
  {
    // Offline with nothing cached: a 504 placeholder, and nothing poisons the cache.
    const sw = loadSW({ fetchImpl: () => Promise.reject(new Error('offline')) });
    const fontReq = Req('https://fonts.gstatic.com/s/missing.woff2');
    const r = await sw.fetchEvent(fontReq).response;
    await flush();
    T('an unavailable font resolves to a 504 rather than rejecting', r.status === 504);
    T('...and caches nothing', sw.caches._dump(CACHE).length === 0, JSON.stringify(sw.caches._dump(CACHE)));
  }

  // ── navigation branch ─────────────────────────────────────────────────────────────────────
  const navReq = () => Req('https://app/workout', { mode: 'navigate', accept: 'text/html' });

  {
    // Fast network wins outright; the fresh shell replaces the cached one.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('fresh', { tag: 'NETWORK' })) });
    const ev = sw.fetchEvent(navReq());
    const r = await ev.response;
    await flush();
    T('a fast navigation is served from the network', r.tag === 'NETWORK');
    T('...and the fresh shell is cached', sw.caches._dump(CACHE).includes('https://app/workout'), JSON.stringify(sw.caches._dump(CACHE)));
    T('the navigation keeps the worker alive via waitUntil', ev.waits.length === 1, String(ev.waits.length));
  }
  {
    // The deploy guard: a 503 must be returned to the page but NEVER cached, or the next
    // offline load serves an error page instead of the app.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('down', { status: 503 })) });
    await sw.caches.open(CACHE).then(c => c.put('./index.html', new Res('good-shell')));
    const r = await sw.fetchEvent(navReq()).response;
    await flush();
    T('a 503 during a deploy is passed to the page', r.status === 503);
    T('...but never overwrites the cached shell', !sw.caches._dump(CACHE).includes('https://app/workout'), JSON.stringify(sw.caches._dump(CACHE)));
  }
  {
    // Cross-origin (redirected off-site) responses are not same-origin shells.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('x', { type: 'cors' })) });
    await sw.fetchEvent(navReq()).response;
    await flush();
    T('a non-basic navigation response is not cached', !sw.caches._dump(CACHE).includes('https://app/workout'));
  }
  {
    // Offline: the exact URL is not in the cache (Cache Storage keys on URL), so the handler
    // must fall back to the precached './index.html'. This is the case the stub is faithful
    // about on purpose — a lenient cache double would hide the need for that fallback.
    const sw = loadSW({ fetchImpl: () => Promise.reject(new Error('offline')) });
    await sw.caches.open(CACHE).then(c => c.put('./index.html', new Res('shell', { tag: 'SHELL' })));
    const r = await sw.fetchEvent(navReq()).response;
    T('offline navigation falls back to the precached shell', r && r.tag === 'SHELL', r && r.body);
  }
  {
    // THE REGRESSION THIS FILE EXISTS FOR. A hung network (captive portal, dead-but-connected
    // signal) must not stall the app: the cached shell is served at the 3s deadline, and the
    // in-flight request is kept alive by waitUntil so the cache still refreshes for next launch.
    let resolveNet;
    const sw = loadSW({ fetchImpl: () => new Promise(res => { resolveNet = res }) });
    await sw.caches.open(CACHE).then(c => c.put('./index.html', new Res('shell', { tag: 'SHELL' })));
    const ev = sw.fetchEvent(navReq());

    let settled = false;
    ev.response.then(() => { settled = true });
    await sw.clock.advance(2999);
    T('a hung navigation is still waiting just before the deadline', settled === false);

    await sw.clock.advance(1);
    const r = await ev.response;
    T('a hung navigation falls back to cache at the deadline', r.tag === 'SHELL', r && r.body);
    T('the hung request is held open by waitUntil', ev.waits.length === 1, String(ev.waits.length));

    // The worker is still alive, so the late response updates the cache for next launch.
    resolveNet(new Res('late-fresh', { tag: 'LATE' }));
    await flush(); await flush();
    T('a late network response still refreshes the cache', sw.caches._dump(CACHE).includes('https://app/workout'), JSON.stringify(sw.caches._dump(CACHE)));
    T('...and the page still got the cached shell, not the late one', r.tag === 'SHELL');
  }
  {
    // A slow-but-successful navigation inside the deadline still wins the race.
    let resolveNet;
    const sw = loadSW({ fetchImpl: () => new Promise(res => { resolveNet = res }) });
    await sw.caches.open(CACHE).then(c => c.put('./index.html', new Res('shell', { tag: 'SHELL' })));
    const ev = sw.fetchEvent(navReq());
    await sw.clock.advance(2000);
    resolveNet(new Res('slow', { tag: 'NETWORK' }));
    const r = await ev.response;
    T('a slow-but-in-time navigation still wins the race', r.tag === 'NETWORK');
    T('...and its timer is cleared rather than left pending', sw.clock.pending() === 0, String(sw.clock.pending()));
  }
  {
    // An HTML request that is not mode:navigate still takes the navigation path (the accept
    // header check), which is what makes a same-page reload behave like a navigation.
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('page', { tag: 'NETWORK' })) });
    const r = await sw.fetchEvent(Req('https://app/page', { accept: 'text/html,application/xhtml+xml' })).response;
    T('an Accept: text/html request is treated as a navigation', r.tag === 'NETWORK');
  }

  // ── asset branch (cache-first) ────────────────────────────────────────────────────────────
  {
    let hits = 0;
    const sw = loadSW({ fetchImpl: () => { hits++; return Promise.resolve(new Res('net')) } });
    const asset = Req('https://app/icon.png');
    await sw.caches.open(CACHE).then(c => c.put(asset, new Res('cached-icon')));
    const r = await sw.fetchEvent(asset).response;
    T('a cached asset is served without a network call', r.body === 'cached-icon' && hits === 0, `${r.body} hits=${hits}`);
  }
  {
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('png', { status: 200 })) });
    const asset = Req('https://app/new.png');
    const r = await sw.fetchEvent(asset).response;
    await flush();
    T('an asset miss falls through to the network', r.body === 'png');
    T('...and a 200 same-origin asset is cached', sw.caches._dump(CACHE).includes(asset.url), JSON.stringify(sw.caches._dump(CACHE)));
  }
  {
    const sw = loadSW({ fetchImpl: () => Promise.resolve(new Res('nope', { status: 404 })) });
    const asset = Req('https://app/missing.png');
    await sw.fetchEvent(asset).response;
    await flush();
    T('a 404 asset is not cached', !sw.caches._dump(CACHE).includes(asset.url));
  }
  {
    // Resolving is only half the requirement. This used to be `new Response('Offline')`,
    // whose status defaults to 200 — a stylesheet that never loaded came back as a
    // SUCCESSFUL response containing the word "Offline". The old assertion checked the
    // body and so passed on exactly that bug. Status is the part the page can act on.
    const sw = loadSW({ fetchImpl: () => Promise.reject(new Error('offline')) });
    const r = await sw.fetchEvent(Req('https://app/gone.png')).response;
    T('an uncached asset offline resolves rather than rejecting', !!r);
    T('...and does not masquerade as a successful response', r.status === 504, `status ${r.status}`);
    T('...and its status matches the fonts branch, which already did this', r.status === 504);
  }

  // ── cache version hygiene ─────────────────────────────────────────────────────────────────
  T('the cache name is versioned so activate can evict old releases', /^rft-v\d+$/.test(CACHE), CACHE);

  finished = true;
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
