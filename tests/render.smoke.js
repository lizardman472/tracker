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
  '\n;global.__R={SEED,AW_KEY,dayExs,setD:d=>{D=d},getD:()=>D,go,beginW,render,stepWt,finishW,saveSumm,setSDIFF:v=>{SDIFF=v},setCIDX:i=>{CIDX=i},getLOG:()=>LOG,setEXP:v=>{EXP=v},setSTAT:v=>{STAT_EX=v},setPICK:v=>{PICK_DAY=v},setSEG:v=>{STAT_SEG=v},setPRALL:v=>{STAT_PRS_ALL=v},getA:()=>document.getElementById("app").innerHTML};';

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
// Bodyweight log unlocks the Strength Level card (relStrength needs a recent bodyweight).
D.bodyLog = [{ date: '2026-06-12', weight: 80 }];
R.setD(D);

// ── Home (home location) ──
tryRender('home (home)', () => R.go('home'));
T('home produced non-empty markup', R.getA().length > 200);

// ── Home (partner location) ──
R.getD().location = 'partner';
tryRender('home (partner)', () => R.go('home'));
T('partner home produced non-empty markup', R.getA().length > 200);

// ── Repeat-day override hint (ultra audit C11) ──
// The fixture's last logged session is 'hxs' (Day A). With the rotation suggesting B,
// manually re-picking A must warn about stacking the same patterns; the suggested day
// and a non-repeat override must not.
{
  R.getD().location = 'home';
  R.getD().nextDay = 'B';
  R.setPICK('A');
  tryRender('home (manual repeat-day pick)', () => R.render());
  T('re-picking the last-logged day shows the stacking hint', /was your last session/.test(R.getA()));
  R.setPICK('C');
  R.render();
  T('a non-repeat override shows no stacking hint', !/was your last session/.test(R.getA()));
  R.setPICK(null);
  R.render();
  T('suggested day shows no stacking hint', !/was your last session/.test(R.getA()));
  R.getD().nextDay = 'A';
}

// ── Workout screen showing a hex lift ──
R.getD().location = 'home';
tryRender('workout (Day A, hex_dl current)', () => R.beginW('A'));
const work = R.getA();
// Prefill padding: SEED's floor_press history has 3 sets, the current prescription is 4
// (v21 bump). The unpadded prefill rendered value="undefined" in the 4th set input.
const fpLog = R.getLOG()['floor_press'];
T('prefilled reps padded to the current set count', fpLog && fpLog.reps.length === 4 && fpLog.reps[3] === '', JSON.stringify(fpLog && fpLog.reps));
R.setCIDX(R.dayExs('A').findIndex(e => e.id === 'floor_press'));
tryRender('workout (floor_press current, padded prefill)', () => R.render());
T('no literal "undefined" leaks into set inputs', !/value="undefined"/.test(R.getA()));
R.setCIDX(0);
R.render();
T('workout shows the hex lift name', /Hex Bar Deadlift/.test(work), work.slice(0, 120));
T('stepper labels the 7kg hex bar', /Hex bar 7kg/.test(work));
T('stepper hero shows the seeded 40kg', /40<sub>kg<\/sub>/.test(work));
T('plate math is correct for 40kg on 7kg bar (1×10 + 1×5 + 1×1 + 1×0.5/side)', /1×10kg \+ 1×5kg \+ 1×1kg \+ 1×0\.5kg/.test(work));
T('plate visual shows one 10kg plate per side', (work.match(/pl pl-10/g) || []).length === 1);

// ── Bar-loaded carry (hex_carry, Day C) logs like barbell lifts: +/− stepper + plates ──
tryRender('workout (Day C)', () => R.beginW('C'));
const dcIds = R.dayExs('C').map(e => e.id);
R.setCIDX(dcIds.indexOf('hex_carry'));
R.getLOG()['hex_carry'].wt = 30;
tryRender('Day C hex_carry current', () => R.render());
const carry = R.getA();
T('hex_carry workout shows a plate visual', /class="pl /.test(carry));
T('hex_carry workout labels the 7kg hex bar', /Hex bar 7kg/.test(carry));
T('hex_carry plate math for 30kg on the 7kg bar', /1×10kg \+ 1×1kg \+ 1×0\.5kg/.test(carry));
T('hex_carry shows the big stepper hero at 30kg', /stp-hero">30<sub>kg<\/sub>/.test(carry));
T('hex_carry has +/− stepper buttons wired to stepWt', /stepWt\('hex_carry',-1\)/.test(carry) && /stepWt\('hex_carry',1\)/.test(carry));
T('hex_carry has no free-typed weight input', !/aria-label="Total weight/.test(carry));
// Stepper walks the hex-bar (7kg) ladder: 30 → 30.5 with the 0.25kg micro pair.
R.stepWt('hex_carry', 1);
T('stepWt steps hex_carry up the 7kg-bar ladder (30 → 30.5)', R.getLOG()['hex_carry'].wt === 30.5, R.getLOG()['hex_carry'].wt);
// Off-ladder legacy weight (free-typed before the stepper) snaps to the nearest rung.
R.getLOG()['hex_carry'].wt = 31.3;
R.stepWt('hex_carry', -1);
T('stepWt snaps an off-ladder 31.3 down to 31', R.getLOG()['hex_carry'].wt === 31, R.getLOG()['hex_carry'].wt);
R.getLOG()['hex_carry'].wt = 31.3;
R.stepWt('hex_carry', 1);
T('stepWt snaps an off-ladder 31.3 up to 31.5', R.getLOG()['hex_carry'].wt === 31.5, R.getLOG()['hex_carry'].wt);
R.getLOG()['hex_carry'].wt = 30;

// ── Progress tab (segmented: Overview default, chips switch sub-views) ──
tryRender('Progress (stats, Overview)', () => R.go('stats'));
const stats = R.getA();
T('progress produced non-empty markup', stats.length > 200);
T('segment chip row renders with all five chips', ['Overview', 'Lifts', 'Balance', 'Consistency', 'Lifetime'].every(s => new RegExp(`seg-chip[^>]*>${s}<`).test(stats)));
T('Overview is the active default chip', /seg-chip on[^>]*aria-selected="true"[^>]*>Overview</.test(stats), stats.match(/seg-chip[^>]*Overview</) && stats.match(/seg-chip[^>]*Overview</)[0]);
T('status header renders on Overview', /status-hd/.test(stats));

// Each segment renders without error and with real content.
for (const seg of ['lifts', 'balance', 'consistency', 'lifetime']) {
  R.setSEG(seg);
  tryRender(`Progress (${seg} segment)`, () => R.render());
  T(`${seg} segment produced non-empty markup`, R.getA().length > 600);
}
// Strength-level card (Lifts segment) tracks the CURRENT main lifts, not retired ones.
R.setSEG('lifts');
R.render();
const liftsSeg = R.getA();
T('strength card renders the hex deadlift tier', /Hex Bar Deadlift/.test(liftsSeg));
T('strength card has no retired Zercher/straight-deadlift rows', !/std-lift">Zercher/.test(liftsSeg) && !/std-lift">Deadlift</.test(liftsSeg));
T('balance muscle card is NOT rendered on the Lifts segment', !/Weekly Volume by Muscle/.test(liftsSeg));

// ── Progress tab with a hex lift selected ──
R.setSTAT('hex_dl');
tryRender('Progress (stats, hex_dl selected)', () => R.go('stats'));

// ── Band lift detail: ladder + reps chart instead of dead weight charts ──
R.setSEG('lifts');
R.setSTAT('pullup_a');
tryRender('Progress (band lift selected)', () => R.render());
const bandSeg = R.getA();
T('band lift shows the band ladder', /Band Ladder/.test(bandSeg));
T('band ladder highlights the current band (Green in SEED)', /band-chip on">Green</.test(bandSeg), (bandSeg.match(/band-chip[^"]*">Green</) || [])[0]);
T('band lift shows a total-reps chart, not a dead weight chart', /Total Reps \/ Session/.test(bandSeg) && !/Need 2\+ data points/.test(bandSeg));
T('band estrip shows Best Reps + Reps · 8wk cells', /Best Reps/.test(bandSeg) && /Reps · 8wk/.test(bandSeg));
R.setSTAT('deadlift');
R.setSEG('overview');
R.render();
T('Overview shows the phase context line', /Phase \d · /.test(R.getA()), (R.getA().match(/Phase \d[^<]*/) || [])[0]);

// ── Momentum slopes render at uniform 1-decimal precision ──
{
  const wkAgo = n => { const d = new Date(Date.now() - n * 7 * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const added = [0, 1, 2, 3].map(n => ({ id: 'dm' + n, date: wkAgo(3 - n), day: 'B', loc: 'home',
    ex: [{ id: 'ohp', wt: 20 + n * 1.25, reps: [7, 7, 7, 7], band: '' }] })); // 1.25 steps → 2dp raw slope
  R.getD().sessions.push(...added);
  R.render();
  const ov = R.getA();
  T('momentum slopes show exactly one decimal', /[+↓→] ?\+?\d+\.\d kg\/wk/.test(ov), (ov.match(/kg\/wk[^<]*/) || [])[0]);
  T('no 2-decimal slope leaks into the card', !/\d\.\d{2} kg\/wk/.test(ov), (ov.match(/\d\.\d{2} kg\/wk/) || [])[0]);
  R.getD().sessions = R.getD().sessions.filter(s => !added.some(a => a.id === s.id));
}

// ── Form trend renders only when the selected lift has rated sets across ≥2 weeks ──
{
  const wkAgo = n => { const d = new Date(Date.now() - n * 7 * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const added = [
    { id: 'fm1', date: wkAgo(2), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '', form: [4, 4, 4] }] },
    { id: 'fm2', date: wkAgo(1), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 52, reps: [5, 5, 5], band: '', form: [5, 5, 5] }] }];
  R.getD().sessions.push(...added);
  R.setSEG('lifts'); R.setSTAT('hex_dl');
  tryRender('Progress (lifts w/ form data)', () => R.render());
  T('form trend chart renders for a rated lift', /Form \(5 = strict\)/.test(R.getA()));
  R.getD().sessions = R.getD().sessions.filter(s => !added.some(a => a.id === s.id));
  R.setSTAT('pullup_c'); R.render();
  T('form trend absent when the lift has no ratings', !/Form \(5 = strict\)/.test(R.getA()));
  R.setSTAT('deadlift'); R.setSEG('overview');
}

// ── Phase markers on the weekly tonnage chart (fixture spans two stamped phases) ──
{
  const wkAgo = n => { const d = new Date(Date.now() - n * 7 * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const added = [
    { id: 'ph1', date: wkAgo(4), day: 'A', loc: 'home', phase: 1, ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '' }] },
    { id: 'ph2', date: wkAgo(3), day: 'B', loc: 'home', phase: 2, ex: [{ id: 'ohp', wt: 25, reps: [6, 6, 6], band: '' }] },
    { id: 'ph3', date: wkAgo(2), day: 'C', loc: 'home', phase: 2, ex: [{ id: 'hex_rdl', wt: 45, reps: [8, 8, 8], band: '' }] }];
  R.getD().sessions.push(...added);
  R.setSEG('consistency');
  tryRender('Progress (consistency w/ phase-stamped history)', () => R.render());
  const consSeg = R.getA();
  T('tonnage chart draws a P2 phase marker', />P2</.test(consSeg));
  T('marker legend line renders', /P# = phase change/.test(consSeg));
  R.getD().sessions = R.getD().sessions.filter(s => !added.some(a => a.id === s.id));
  // Cardio weekly card renders with 2+ weeks of cardio history.
  R.getD().cardioLog = [
    { id: 'cq1', date: wkAgo(2), type: 'Row', duration: 30, intensity: 'easy' },
    { id: 'cq2', date: wkAgo(1), type: 'Row', duration: 20, intensity: 'hard' }];
  tryRender('Progress (consistency w/ cardio history)', () => R.render());
  T('cardio weekly chart renders with intensity split', /Cardio Minutes \/ Week/.test(R.getA()) && /easy 30/.test(R.getA()) && /hard 20/.test(R.getA()));
  R.getD().cardioLog = [];
  R.setSEG('overview');
}

// ── All-Time PRs: top 8 collapsed with Show-all toggle (needs >8 logged lifts) ──
{
  const added = [];
  const lifts = ['ohp', 'floor_press', 'hex_rdl', 'lm_squat', 'bb_curl', 'bb_skullcr', 'hex_row', 'b_stance_rdl', 'hex_squat_b'];
  lifts.forEach((id, i) => added.push({ id: 'pr' + i, date: '2026-05-0' + (i + 1), day: 'A', loc: 'home', ex: [{ id, wt: 20 + i, reps: [5, 5, 5], band: '' }] }));
  R.getD().sessions.push(...added);
  R.setSEG('lifetime');
  R.setPRALL(false);
  tryRender('Progress (lifetime, PRs collapsed)', () => R.render());
  const collapsed = R.getA();
  const rowCount = html => (html.match(/<tr><td style="font-weight:600"/g) || []).length;
  T('collapsed PR table shows exactly 8 rows', rowCount(collapsed) === 8, rowCount(collapsed));
  T('Show-all toggle present with total count', /Show all \(\d+\)/.test(collapsed));
  R.setPRALL(true);
  R.render();
  const expanded = R.getA();
  T('expanded PR table shows all lifts', rowCount(expanded) > 8, rowCount(expanded));
  T('expanded state offers Show top 8', /Show top 8/.test(expanded));
  R.setPRALL(false);
  R.getD().sessions = R.getD().sessions.filter(s => !added.some(a => a.id === s.id));
  R.setSEG('overview');
}

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

// ── History: plate breakdown gated to bar lifts ──
// A 12kg-per-DB entry exceeds barOf()'s 11kg fallback and used to render a bogus
// barbell plate strip on a dumbbell lift.
R.getD().sessions.push({ id: 'dbs', date: '2026-06-13', day: 'B', loc: 'partner',
  ex: [{ id: 'db_ohp', wt: 12, reps: [10, 10, 10], band: '' }] });
R.go('history'); // go() resets EXP, so navigate first…
R.setEXP('dbs'); // …then expand and re-render
tryRender('History (DB session expanded)', () => R.render());
const dbHist = R.getA();
T('expanded DB session shows the weight', /12kg/.test(dbHist));
T('no plate strip rendered for a dumbbell lift', !/class="pl /.test(dbHist));
R.setEXP(null);
R.getD().sessions = R.getD().sessions.filter(s => s.id !== 'dbs');

// ── finishW keeps the active-workout backup until saveSumm commits the session ──
// Killing the app on the summary screen used to lose the whole workout (AW cleared
// before the session reached D.sessions, so no resume was offered either).
{
  const store = {};
  const realLS = global.localStorage;
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } };
  const nBefore = R.getD().sessions.length;
  R.beginW('A');
  const log = R.getLOG()['hex_dl'];
  log.touched = true; log.wt = 40; log.reps = ['5', '5', '5'];
  tryRender('finishW → summary', () => R.finishW());
  T('AW backup survives finishW (summary not yet saved)', store[R.AW_KEY] != null);
  R.setSDIFF(3);
  tryRender('saveSumm commits the session', () => R.saveSumm());
  T('saveSumm clears the AW backup', store[R.AW_KEY] == null);
  const saved = R.getD().sessions[R.getD().sessions.length - 1];
  T('session committed with RPE', R.getD().sessions.length === nBefore + 1 && saved.difficulty === 3, JSON.stringify({ n: R.getD().sessions.length, diff: saved && saved.difficulty }));
  T('dead trainingWeek field no longer written to sessions', saved.trainingWeek === undefined);
  R.getD().sessions = R.getD().sessions.filter(s => s !== saved);
  global.localStorage = realLS;
}

// ── Settings + All-Valid-Weights reference screen ──
tryRender('Settings', () => R.go('settings'));
tryRender('All Valid Weights (plates)', () => R.go('plates'));
T('plates screen renders the ladder', /All Valid Weights/.test(R.getA()));
T('plates screen has both bar sections', /Straight Bar/.test(R.getA()) && /Landmine — load 1 end/.test(R.getA()));
T('plates screen lists the finer 11.25kg landmine rung', /11\.25/.test(R.getA()));

// ── Body tracking — empty, then with weight + circumference logs ──
tryRender('Body (empty)', () => R.go('body'));
T('empty body screen prompts to log', /Body Tracking/.test(R.getA()));
R.getD().bodyLog = [
  { date: '2026-05-01', weight: 80, waist: 86, hips: 98, arms: 36 },
  { date: '2026-06-01', weight: 78.5, waist: 84, hips: 97, arms: 36.5 },
];
tryRender('Body (with logs)', () => R.go('body'));
const body = R.getA();
T('body shows current bodyweight', /78\.5/.test(body));
T('body summary lists a tape-measure site', /Waist/.test(body));
T('body derives waist-to-hip ratio', /Waist-to-Hip Ratio/.test(body));

console.log(`\n${pass} passed, ${fail} failed`);
