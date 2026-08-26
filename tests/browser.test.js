// Real-browser tests for the Rack-Free Tracker.
//
// The other suites eval the script against a DOM stub. That stub is faithful enough to catch a
// lot, but it cannot catch "the markup builds and says nothing useful" — which is exactly how
// the return-ramp advisory shipped invisible on 8 of 9 lifts with calc.test.js and
// render.smoke.js both green (see AUDIT §26.6). This suite loads index.html in Chromium over
// real HTTP, seeds localStorage the way the app actually stores it, and asserts on what a
// person would SEE.
//
// Run with:  node tests/browser.test.js
// Needs playwright + a Chromium build. If neither is present the suite reports SKIPPED and
// exits 0 — it is an addition to the battery, not a gate the other suites already pass.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8931;

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p) } catch (_) {}
  }
  return null;
}
function findChromium(pw) {
  // Prefer whatever playwright resolves itself; fall back to a pinned image path.
  try { const e = pw.chromium.executablePath(); if (e && fs.existsSync(e)) return e } catch (_) {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /^chromium-/.test(x))) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(c)) return c;
    }
  } catch (_) {}
  return null;
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json' };
function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rq) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      // Never serve outside the repo — this is a test server, but it is still a server.
      if (!f.startsWith(ROOT)) { rq.writeHead(403).end(); return }
      fs.readFile(f, (e, b) => e ? rq.writeHead(404).end()
        : (rq.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }), rq.end(b)));
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) };
const ahead = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) };

// Six weeks of 3x/week, then twenty days of nothing — the shape this feature exists for.
function baseStore() {
  const plan = { A:[['hex_dl',47,[5,5,5]],['floor_press',28,[8,8,8]]], B:[['ohp',23,[6,5,5]],['bb_row',32,[10,9,8]]], C:[['rdl',43,[8,8,8]]] };
  const L = ['A','B','C']; const sessions = []; let k = 0;
  for (let d = 61; d >= 19; d -= 2.4) { const day = L[k % 3];
    sessions.push({ id:'s'+k, date:ago(Math.round(d)), day, loc:'home', phase:1, difficulty:3, duration:52,
      volume:2400, warmup:1, notes:'', ex: plan[day].map(([id,wt,reps]) => ({ id, wt, reps, band:'', notes:'' })) }); k++ }
  return { sessions, nextDay:'B', lastDeload:ago(52), cues:{}, bodyLog:[], cardioLog:[], phase:1, phaseStart:ago(61),
    discomfort:[], location:'home', programVersion:21, notify:{enabled:false,rest:true}, lastBackup:ago(3),
    lastBackupCount:sessions.length, dismissed:{}, theme:'light', deleted:[], gen:5, comeback:null, comebackLog:[] };
}
const rampSession = () => ({ id:'inramp', date:ago(1), day:'B', loc:'home', phase:1, difficulty:2, duration:34,
  volume:900, warmup:1, notes:'', ex:[{ id:'ohp', wt:21, reps:[4,4,3], band:'', notes:'' }] });

let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };

(async () => {
  const pw = loadPlaywright();
  const exe = pw && findChromium(pw);
  if (!pw || !exe) {
    console.log(`SKIPPED: browser tests need playwright + chromium (playwright:${!!pw} chromium:${!!exe})`);
    process.exit(0);
  }
  const server = await serve();
  const browser = await pw.chromium.launch({ executablePath: exe, args:['--no-sandbox'] });
  const errors = [];

  async function open(store) {
    const ctx = await browser.newContext({ viewport:{ width:414, height:900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await page.addInitScript(s => { localStorage.setItem('rft-v12', s); localStorage.setItem('rft-v12-gen','5') }, JSON.stringify(store));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(600);
    return { page, ctx };
  }
  const text = page => page.locator('#app').innerText();

  // ── the offer, and choosing when to start ──
  { const { page, ctx } = await open(baseStore());
    T('offer names the gap', /20 days since your last session/.test(await text(page)));
    await page.getByRole('button', { name:'Start tomorrow' }).click();
    await page.waitForTimeout(300);
    const t = await text(page);
    T('start tomorrow schedules rather than starts', /Return ramp · starts/.test(t) && /Starts in 1 day/.test(t), t.slice(0, 200));
    T('...and it reached storage, not just the view',
      await page.evaluate(d => JSON.parse(localStorage.getItem('rft-v12')).comeback.start === d, ahead(1)));
    await ctx.close() }

  // ── a running ramp, and the prescription on the screen where you lift ──
  { const s = baseStore();
    s.comeback = { start:ago(2), end:ahead(17), gap:20 };
    s.sessions = [...s.sessions, rampSession()];
    const { page, ctx } = await open(s);
    const t = await text(page);
    T('home shows the day counter and stage', /Return ramp · day 3 of 20/.test(t) && /Stage 1 · re-introduce/.test(t));
    T('the deload banner is suppressed, and says why',
      await page.evaluate(() => { const d = getDeload(getPhaseInfo().stalledMajor); return d.suppressed === 'comeback' && !d.due && !d.consider }));
    await page.evaluate(() => beginW(D.nextDay));
    await page.waitForTimeout(400);
    const w = await text(page);
    // The regression guard: this is the bug that shipped green. The strip must be present even
    // though the first lift on screen takes getSmartSugg's early `type:'new'` return, which
    // never reaches the per-lift advisory.
    T('the workout screen states the ramp at the top', /Return ramp · day 3\/20 · session 2 back/.test(w), (w.match(/Return ramp[^\n]*/) || ['MISSING'])[0]);
    T('...with the prescription, not just a day count', /stage 1: ~90% of pre-break loads/.test(w));
    T('...and the first lift really does take the no-history path (or this proves nothing)',
      await page.evaluate(() => getSmartSugg(dayExs(ADAY)[0]).type === 'new'));
    await ctx.close() }

  // ── the record: history, badge, chart marker ──
  { const s = baseStore();
    s.comebackLog = [{ start:ago(24), end:ago(18), gap:9, days:7, sessions:3, ended:'completed' }];
    const { page, ctx } = await open(s);
    await page.evaluate(() => go('history'));
    await page.waitForTimeout(300);
    const h = await text(page);
    T('history keeps the finished ramp', /return ramps/i.test(h) && /7d back after 9d off · 3 sessions/.test(h));
    T('sessions trained under it are badged', /↩ ramp/.test(h));
    await page.evaluate(() => { go('stats'); STAT_SEG = 'consistency'; render() });
    await page.waitForTimeout(500);
    T('the tonnage chart marks the comeback',
      await page.evaluate(() => document.getElementById('app').innerHTML.includes('>RTN<')));
    await ctx.close() }

  // ── the runway waits for you instead of burning calendar ──
  { const s = baseStore(); s.comeback = { start:ago(5), end:ahead(14), gap:20 };
    const { page, ctx } = await open(s);
    T('an untrained ramp rolls to today', /Return ramp · day 1 of/.test(await text(page)));
    T('...rewriting the store, not just the view',
      await page.evaluate(d => JSON.parse(localStorage.getItem('rft-v12')).comeback.start === d, ymd(new Date())));
    T('...and archiving nothing', await page.evaluate(() => JSON.parse(localStorage.getItem('rft-v12')).comebackLog.length === 0));
    await ctx.close() }

  // ── a hand-edited far-future ramp must not park the app in "scheduled" forever ──
  { const s = baseStore(); s.comeback = { start:ahead(400), end:ahead(420), gap:9 };
    const { page, ctx } = await open(s);
    const t = await text(page);
    T('a far-future ramp is rejected and the offer returns', /days since your last session/.test(t) && !/Return ramp · starts/.test(t));
    await ctx.close() }

  // ── the Express guard must not nag you for following the ramp ──
  { const s = baseStore();
    s.comeback = { start:ago(2), end:ahead(17), gap:20 };
    s.sessions = [...s.sessions, ...[0,1].map(i => ({ id:'xp'+i, date:ago(i), day:'A', loc:'home', phase:1, express:true,
      difficulty:2, duration:30, volume:800, warmup:1, notes:'', ex:[{ id:'hex_dl', wt:42, reps:[3,3,2], band:'', notes:'' }] }))];
    const { page, ctx } = await open(s);
    T('no Express/MEV nag while the ramp prescribes the cut', !/were Express/.test(await text(page)));
    T('...but the guard is still live once the ramp is gone',
      await page.evaluate(() => { D.comeback = null; return expressMEVRisk(7) !== null }));
    await ctx.close() }

  // ── it survives a reload, in dark theme ──
  { const s = baseStore(); s.theme = 'dark';
    s.comeback = { start:ago(2), end:ahead(17), gap:20 };
    s.sessions = [...s.sessions, rampSession()];
    const { page, ctx } = await open(s);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForTimeout(500);
    T('the ramp survives a reload in dark theme', /Return ramp · day 3 of 20/.test(await text(page)));
    await ctx.close() }

  await browser.close();
  server.close();
  for (const e of errors) T('no page error: ' + e, false);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('browser suite crashed:', e); process.exit(1) });
