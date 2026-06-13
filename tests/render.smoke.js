// Headless render smoke test — confirms the home (home + partner), workout, and
// Progress screens build without throwing, and that a hex lift's stepper shows the
// 7kg bar with correct plate math. No jsdom: we slice the script before INIT (so the
// app never auto-boots) and call the render functions directly against a DOM stub
// that captures innerHTML.
//
// Run with:  node tests/render.smoke.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══════════════ INIT')) +
  '\n;global.__R={SEED,setD:d=>{D=d},getD:()=>D,go,beginW,render,setEXP:v=>{EXP=v},setSTAT:v=>{STAT_EX=v},getA:()=>document.getElementById("app").innerHTML};';

// ── DOM / browser stubs ──
const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const els = {};
function makeEl() {
  // _h backs innerHTML; setting textContent escapes into _h so esc() (createElement→
  // textContent→innerHTML) returns properly-escaped HTML, while render's direct
  // innerHTML= assignment stores raw markup.
  const base = { _h: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { return c },
    removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null },
    focus() {}, blur() {}, click() {}, querySelector() { return null }, querySelectorAll() { return [] },
    getContext() { return { fillRect() {}, clearRect() {} } }, getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 } } };
  Object.defineProperty(base, 'innerHTML', { get() { return this._h }, set(v) { this._h = v } });
  Object.defineProperty(base, 'textContent', { get() { return this._h }, set(v) { this._h = escHtml(v) } });
  return new Proxy(base, { get(t, p) { return p in t ? t[p] : () => {}; } });
}
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl()); },
  createElement() { return makeEl(); },
  querySelector() { return null }, querySelectorAll() { return [] },
  addEventListener() {}, body: makeEl(), documentElement: makeEl(),
};
global.window = { scrollTo() {}, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} } }, location: { href: '', hash: '' } };
global.navigator = { serviceWorker: { register() { return Promise.resolve(); } } };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.setInterval = () => 0; global.clearInterval = () => {};
global.Blob = class { constructor(a) { this.size = (a && a[0] && a[0].length) || 0 } };

eval(code);
const R = global.__R;

let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };
function tryRender(label, fn) {
  try { fn(); T(label + ' renders without error', true); return true; }
  catch (e) { T(label + ' renders without error', false, e && e.stack || String(e)); return false; }
}

// Seed state: SEED history (straight-bar legacy) + a logged hex session so Progress has hex data.
const D = structuredClone(R.SEED);
D.location = 'home';
D.sessions.push({ id: 'hxs', date: '2026-06-12', day: 'A', loc: 'home',
  ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '', form: [5, 5, 5] }] });
R.setD(D);

// ── Home (home location) ──
tryRender('home (home)', () => R.go('home'));
T('home produced non-empty markup', R.getA().length > 200);

// ── Home (partner location) ──
R.getD().location = 'partner';
tryRender('home (partner)', () => R.go('home'));
T('partner home produced non-empty markup', R.getA().length > 200);

// ── Workout screen showing a hex lift ──
R.getD().location = 'home';
tryRender('workout (Day A, hex_dl current)', () => R.beginW('A'));
const work = R.getA();
T('workout shows the hex lift name', /Hex Bar Deadlift/.test(work), work.slice(0, 120));
T('stepper labels the 7kg hex bar', /Hex bar 7kg/.test(work));
T('stepper hero shows the seeded 40kg', /40<sub>kg<\/sub>/.test(work));
T('plate math is correct for 40kg on 7kg bar (1×10 + 1×5 + 1×1 + 1×0.5/side)', /1×10kg \+ 1×5kg \+ 1×1kg \+ 1×0\.5kg/.test(work));
T('plate visual shows one 10kg plate per side', (work.match(/pl pl-10/g) || []).length === 1);

// ── Progress tab (default exercise) ──
tryRender('Progress (stats)', () => R.go('stats'));
T('progress produced non-empty markup', R.getA().length > 200);

// ── Progress tab with a hex lift selected ──
R.setSTAT('hex_dl');
tryRender('Progress (stats, hex_dl selected)', () => R.go('stats'));
R.setSTAT('deadlift');

// ── History with the stored hex session expanded — exercises session-detail plate breakdown ──
let histOk = tryRender('History (list)', () => R.go('history'));
if (histOk) {
  R.setEXP('hxs');
  tryRender('History (hex session expanded)', () => R.render());
  const hist = R.getA();
  T('expanded hex session shows 40kg', /40kg/.test(hist));
  // 40kg on the 7kg bar breaks down to 10+5+1+0.5/side — the 5kg plate ONLY appears
  // if the detail used the hex bar; the 11kg-bar misread (10+2.5+1+1) would have no 5kg.
  T('hex session detail uses the 7kg bar (has a 5kg plate)', /pl pl-5/.test(hist));
  T('hex session detail has exactly one 10kg plate/side', (hist.match(/pl pl-10/g) || []).length === 1);
}

// ── Settings + All-Valid-Weights reference screen ──
tryRender('Settings', () => R.go('settings'));
tryRender('All Valid Weights (plates)', () => R.go('plates'));
T('plates screen renders the ladder', /All Valid Weights/.test(R.getA()));

console.log(`\n${pass} passed, ${fail} failed`);
