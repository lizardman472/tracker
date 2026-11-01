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
// Match the same mutation anchors in Windows CRLF and CI's LF checkouts.
const src = fs.readFileSync(SW, 'utf8').replace(/\r\n/g, '\n');

// Each mutation: a description, and a transform that must make the battery fail.
const MUTATIONS = [
  ['drops waitUntil, so a hung refresh can be killed mid-flight',
    s => s.replace('e.waitUntil(net.then(() => write).catch(() => {}));', '')],

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
    s => s.replace('const timer = setTimeout(() => done(fromCache()), NAV_TIMEOUT);\n        net.then(r => { clearTimeout(timer);',
      'const timer = setTimeout(() => done(fromCache()), NAV_TIMEOUT);\n        net.then(r => {')],

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
    s => s.replace('const response = caches.match(req).then(r => r || fetch(req).then(resp => {',
      'const response = Promise.resolve().then(() => fetch(req).then(resp => {')],

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
    s => s.replace("ks.filter(k => k.startsWith('rft-') && k !== C)", 'ks.filter(() => false)')],

  ['evicts unrelated app caches on the same origin',
    s => s.replace("k.startsWith('rft-') && k !== C", 'k !== C')],

  ['never claims open clients on activate',
    s => s.replace('.then(() => self.clients.claim())', '')],

  ['opens a duplicate window instead of focusing the existing tab',
    s => s.replace("for (const c of cs) { if ('focus' in c) return c.focus(); }", '')],

  ['intercepts non-GET requests',
    s => s.replace("if (req.method !== 'GET') return;", '')],
  ['restores direct 5xx passthrough despite a good cached shell',
    s => s.replace("r && r.status >= 500 && r.status <= 599 && r.type === 'basic' && new URL(req.url).origin === self.location.origin",'false'),/FAIL: R12 5xx uses good cached shell/],
  ['detaches only navigation put while retaining network lifetime',
    s => s.replace('write = caches.open(C).then(ch => ch.put(req, c)).catch(() => {});','caches.open(C).then(ch => ch.put(req, c)).catch(() => {});'),/FAIL: R12 retains complete write navigation put/],
  ['detaches font put while retaining network lifetime',
    s => s.replace('write = caches.open(C).then(c => c.put(req, clone)).catch(() => {});','caches.open(C).then(c => c.put(req, clone)).catch(() => {});'),/FAIL: R12 retains complete write font put/],
  ['detaches asset put while retaining response lifetime',
    s => {const i=s.indexOf('  let write = Promise.resolve();\n  const response =');return s.slice(0,i)+s.slice(i).replace('write = caches.open(C).then(c => c.put(req, clone)).catch(() => {});','caches.open(C).then(c => c.put(req, clone)).catch(() => {});')},/FAIL: R12 retains complete write asset put/],
  ['waits for cache put before returning the navigation foreground',
    s => s.replace('} return r; });','} return write.then(() => r); });'),/FAIL: R12 foreground prompt while navigation/],
];

// Retain each original fault's intent. A syntax error or an unrelated failure is not a catch.
const TARGETS=[/FAIL: the navigation keeps the worker alive/,/FAIL: suite exited before finishing/,/FAIL: \.\.\.but never overwrites the cached shell/,/FAIL: a non-basic navigation response is not cached/,/FAIL: offline navigation falls back/,/FAIL: \.\.\.and its timer is cleared/,/FAIL: \.\.\.and the font deadline timer is cleared/,/FAIL: suite exited before finishing/,/FAIL: an OPAQUE font response is still cached/,/FAIL: a cached asset is served without a network call/,/FAIL: \.\.\.and does not masquerade/,/FAIL: a 404 asset is not cached/,/FAIL: install precaches the app shell/,/FAIL: install calls skipWaiting/,/FAIL: activate deletes caches from previous releases/,/FAIL: activate preserves unrelated caches/,/FAIL: activate claims open clients/,/FAIL: a rest-done tap focuses/,/FAIL: a POST is passed straight through/];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swmut-'));
let caught = 0, escaped = 0;
const evidence=[];

for (const [index, [desc, mutate, target]] of MUTATIONS.entries()) {
  const broken = mutate(src);
  if (broken === src) {
    escaped++;
    console.log('NOT APPLIED:', desc, '(the pattern no longer matches sw.js — update this mutation)');
    continue;
  }
  try{new (require('vm').Script)(broken)}catch(error){escaped++;console.log('INVALID:',desc,error.message);evidence.push({desc,applied:true,compiled:false,caught:false});continue}
  const file = path.join(tmp, 'sw.js');
  fs.writeFileSync(file, broken);
  let failed = false, output = '';
  try {
    execFileSync(process.execPath, [...process.execArgv,path.join(__dirname, 'sw.test.js')],
      { env: { ...process.env, SW_PATH: file, SW_MUTATION:'1' }, stdio: 'pipe' });
  } catch (error) { failed = true; output=String(error.stdout||'')+'\n'+String(error.stderr||''); }
  const intended=failed&&(target||TARGETS[index]).test(output);
  if (intended) { caught++; }
  else { escaped++; console.log('ESCAPED OR UNRELATED:', desc,output.slice(-700)); }
  evidence.push({desc,applied:true,compiled:true,caught:intended,intendedFailure:String(target||TARGETS[index]),failures:output.split('\n').filter(l=>l.startsWith('FAIL:'))});
}

if(path.dirname(path.resolve(tmp))!==path.resolve(os.tmpdir())||!path.basename(tmp).startsWith('swmut-'))throw Error('Unsafe mutation temporary directory');
fs.rmSync(tmp, { recursive: true, force: true });
const artifact=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(artifact,{recursive:true});fs.writeFileSync(path.join(artifact,'sw-mutation-evidence.json'),JSON.stringify(evidence,null,2));
console.log(`\n${caught}/${MUTATIONS.length} mutations caught, ${escaped} escaped`);
if (escaped) process.exit(1);
