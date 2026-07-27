// Mutation check for the service-worker battery.
//
// A brand-new test file that passes on its first run has proved nothing yet — it might be
// asserting on stubs rather than on behaviour. This deliberately breaks sw.js in each of the
// ways it has actually broken (or could), runs tests/sw.test.js against the broken copy, and
// requires that every mutation is CAUGHT.
//
// The first entry is not hypothetical: the navigation-timeout fix shipped without waitUntil,
// and no test noticed because there were none. That mutation now has to fail loudly.
//
// Run with:  node tests/sw.mutate.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SW = path.join(__dirname, '..', 'sw.js');
const src = fs.readFileSync(SW, 'utf8');

// Each mutation: a description, and a transform that must make the battery fail.
const MUTATIONS = [
  ['drops waitUntil, so a hung refresh can be killed mid-flight',
    s => s.replace('e.waitUntil(net.catch(() => {}));', '')],

  ['reverts the navigation to plain network-first with no deadline',
    s => s.replace(/e\.respondWith\(\s*new Promise\(resolve => \{[\s\S]*?\}\)\s*\);/,
      'e.respondWith(net.catch(() => fromCache()));')],

  ['caches an unsuccessful shell, poisoning the offline load',
    s => s.replace('if (r && r.ok && r.type === \'basic\')', 'if (r)')],

  ['caches a cross-origin navigation response as the shell',
    s => s.replace('r.ok && r.type === \'basic\'', 'r.ok')],

  ['loses the ./index.html fallback, so offline navigations resolve to nothing',
    s => s.replace("caches.match(req).then(r => r || caches.match('./index.html'))", 'caches.match(req)')],

  // Both branches race a timer now, so these anchors carry their own setTimeout line — a bare
  // `net.then(r => { clearTimeout(timer)…` string patches whichever branch comes first in the
  // file and silently stops testing the other one.
  ['leaves the NAVIGATION deadline timer pending after the network wins',
    s => s.replace('const timer = setTimeout(() => done(fromCache()), NAV_TIMEOUT);\n        net.then(r => { clearTimeout(timer); done(r); })',
      'const timer = setTimeout(() => done(fromCache()), NAV_TIMEOUT);\n        net.then(r => { done(r); })')],

  ['leaves the FONT deadline timer pending after the network wins',
    s => s.replace("const timer = setTimeout(() => done(new Response('', { status: 504 })), FONT_TIMEOUT);\n          net.then(r => { clearTimeout(timer); done(r); })",
      "const timer = setTimeout(() => done(new Response('', { status: 504 })), FONT_TIMEOUT);\n          net.then(r => { done(r); })")],

  // The regression this branch exists to prevent: without a deadline a HANGING font host (a
  // captive portal, not an offline one) never settles, and the render-blocking stylesheet keeps
  // the app from booting at all. Reverts to the pre-audit-6 cache-first-then-network shape.
  ['reverts the font branch to no deadline, so a hung font host blocks the boot',
    s => s.replace(/const FONT_TIMEOUT[\s\S]*?\n    return;\n  \}/,
      `e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const clone = resp.clone();
          caches.open(C).then(c => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => new Response('', { status: 504 })))
    );
    return;
  }`)],

  ['stops caching opaque font responses, breaking offline typography',
    s => s.replace("resp && (resp.ok || resp.type === 'opaque')", 'resp && resp.ok')],

  ['makes the asset branch network-first, losing instant cached loads',
    s => s.replace(/e\.respondWith\(\s*caches\.match\(req\)\.then\(r => r \|\| fetch\(req\)\.then\(resp => \{\s*\/\/ Same-origin/,
      'e.respondWith(\n    fetch(req).then(resp => {\n      // Same-origin')],

  // The pre-v77 behaviour: a failed asset fetch resolved as a 200 whose body was the word
  // "Offline", so a dead stylesheet was indistinguishable from a live one.
  ['returns the offline asset fallback as a 200 instead of a 504',
    s => s.replace("new Response('', { status: 504, statusText: 'Offline' })", "new Response('Offline')")],

  ['caches a 404 asset',
    s => s.replace("resp && resp.status === 200 && resp.type === 'basic'", 'resp')],

  ['skips precaching the app shell on install',
    s => s.replace('c.addAll(CORE)', 'Promise.resolve()')],

  ['never calls skipWaiting, stranding users on the old worker',
    s => s.replace('.then(() => self.skipWaiting())', '')],

  ['stops evicting caches from previous releases',
    s => s.replace('ks.filter(k => k !== C)', 'ks.filter(() => false)')],

  ['never claims open clients on activate',
    s => s.replace('.then(() => self.clients.claim())', '')],

  ['opens a duplicate window instead of focusing the existing tab',
    s => s.replace("for (const c of cs) { if ('focus' in c) return c.focus(); }", '')],

  ['intercepts non-GET requests',
    s => s.replace("if (req.method !== 'GET') return;", '')],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swmut-'));
let caught = 0, escaped = 0;

for (const [desc, mutate] of MUTATIONS) {
  const broken = mutate(src);
  if (broken === src) {
    escaped++;
    console.log('NOT APPLIED:', desc, '(the pattern no longer matches sw.js — update this mutation)');
    continue;
  }
  const file = path.join(tmp, 'sw.js');
  fs.writeFileSync(file, broken);
  let failed = false;
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'sw.test.js')],
      { env: { ...process.env, SW_PATH: file }, stdio: 'pipe' });
  } catch (_) { failed = true; }   // non-zero exit = the battery caught it
  if (failed) { caught++; }
  else { escaped++; console.log('ESCAPED:', desc); }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${caught}/${MUTATIONS.length} mutations caught, ${escaped} escaped`);
if (escaped) process.exit(1);
