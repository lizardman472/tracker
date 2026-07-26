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
  '\n;global.__R={SEED,AW_KEY,dayExs,setD:d=>{D=d},getD:()=>D,go,beginW,render,stepWt,finishW,saveSumm,setSDIFF:v=>{SDIFF=v},setCIDX:i=>{CIDX=i},getLOG:()=>LOG,setEXP:v=>{EXP=v},setSTAT:v=>{STAT_EX=v},setPICK:v=>{PICK_DAY=v},setSEG:v=>{STAT_SEG=v},setPRALL:v=>{STAT_PRS_ALL=v},setMONTH:v=>{STAT_MONTH=v},getPal:()=>({grid:CH_GRID,cyan:HEAT_CYAN,bm0:BODY_METRICS[0].c}),load,SK,getA:()=>document.getElementById("app").innerHTML};';

// ── DOM / browser stubs ──
// Mirrors what a browser ACTUALLY does when you set textContent and read innerHTML back:
// it escapes &, < and > only — quotes are left alone, because in text position they are
// harmless. Escaping them here too made the stub SAFER than the real DOM, which meant a
// test could never catch an unescaped quote breaking out of an attribute. Do not "harden"
// this: its job is to be faithful, and esc() is where the hardening belongs.
const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// ── Hevy-style set rows: sticky live header, per-set overrides, Add Set ──
{
  tryRender('workout (Day A, set-row table)', () => R.beginW('A'));
  const w2 = R.getA();
  T('sticky live header renders duration/volume/sets ids', /work-sticky/.test(w2) && /id="lv-vol"/.test(w2) && /id="lv-sets"/.test(w2));
  T('set table renders header + Previous column', /class="set-gr set-hd"/.test(w2) && /set-prev/.test(w2));
  T('per-set weight inputs render for the bar lift', /setSetWt\('hex_dl',0,/.test(w2));
  T('Previous column shows last session sets as a tappable 40×5', /usePrev\('hex_dl',0\)/.test(w2) && />40×5</.test(w2));
  T('Add Set button renders', /addSet\('hex_dl'\)/.test(w2));
  T('remove button hidden at the programmed set count', !/removeSet\('hex_dl'\)/.test(w2));
  const log = R.getLOG()['hex_dl'];
  // Tick two sets, one with a typed override — liveStats counts CHECKED sets only.
  log.reps[0] = '5'; log.reps[1] = '5'; log.reps[2] = '5';
  toggleSetDone('hex_dl', 0);
  setSetWt('hex_dl', 1, '45');
  toggleSetDone('hex_dl', 1);
  const lv = liveStats(R.getLOG());
  T('liveStats counts checked sets only', lv.sets === 2, lv.sets);
  T('liveStats prices the override set at its own weight', lv.vol === 40 * 5 + 45 * 5, lv.vol);
  T('checked rows tint green', /set-row done/.test(R.getA()));
  // Add Set grows every parallel array; removeSet only ever pops extras.
  const n0 = log.reps.length;
  addSet('hex_dl');
  T('addSet grows reps/wts/setDone/form together',
    log.reps.length === n0 + 1 && log.wts.length === n0 + 1 && log.setDone.length === n0 + 1 && log.form.length === n0 + 1);
  T('remove button appears once an extra set exists', /removeSet\('hex_dl'\)/.test(R.getA()));
  removeSet('hex_dl');
  T('removeSet pops back to the programmed count', log.reps.length === n0);
  removeSet('hex_dl');
  T('removeSet never drops below the programmed count', log.reps.length === n0);
  // Ticks-required finish: cancel path first — unchecked typed sets trigger the
  // confirm, and declining returns to the workout with nothing lost.
  global.confirm = () => false;
  R.finishW();
  T('declining the discard-confirm stays on the workout', /set-gr set-hd/.test(R.getA()));
  // Accept path: set 3 gets ticked; other exercises' prefilled reps stay unticked
  // and are dropped from the save (the old phantom-session guard, now via ticks).
  let confirmMsg = null;
  global.confirm = m => { confirmMsg = m; return true; };
  toggleSetDone('hex_dl', 2);
  R.finishW();
  delete global.confirm;
  T('finish confirms before discarding unchecked sets', /checked off/.test(confirmMsg || ''), confirmMsg);
  const S = global.window._S;
  T('only ticked exercises reach the save', S.exs.length === 1 && S.exs[0].id === 'hex_dl', JSON.stringify(S.exs.map(e => e.id)));
  const hx = S.exs.find(e => e.id === 'hex_dl');
  T('finishW resolves wts fully when a set differs', JSON.stringify(hx.wts) === '[40,45,40]', JSON.stringify(hx.wts));
  T('summary totals equal the live header (checked sets only)', S.ts === 3 && S.tv === 40 * 5 + 45 * 5 + 40 * 5, JSON.stringify([S.ts, S.tv]));
  T('summary shows the per-workout muscle split', /Muscle Split/.test(R.getA()) && /msp-row/.test(R.getA()));
  // resumed old-build blobs get wts crash-proofed
  R.setCIDX(0);
}

// ── Progress tab (segmented: Overview default, chips switch sub-views) ──
tryRender('Progress (stats, Overview)', () => R.go('stats'));
const stats = R.getA();
T('progress produced non-empty markup', stats.length > 200);
T('segment chip row renders with all five chips', ['Overview', 'Lifts', 'Balance', 'Consistency', 'Lifetime'].every(s => new RegExp(`seg-chip[^>]*>${s}<`).test(stats)));
T('Overview is the active default chip', /seg-chip on[^>]*aria-selected="true"[^>]*>Overview</.test(stats), stats.match(/seg-chip[^>]*Overview</) && stats.match(/seg-chip[^>]*Overview</)[0]);
T('status header renders on Overview', /status-hd/.test(stats));
T('consistency verdict discloses its rolling window', /\/wk \(8wk\)/.test(stats));

// Each segment renders without error and with real content.
for (const seg of ['lifts', 'balance', 'consistency', 'lifetime']) {
  R.setSEG(seg);
  tryRender(`Progress (${seg} segment)`, () => R.render());
  T(`${seg} segment produced non-empty markup`, R.getA().length > 600);
}
// Balance segment: muscle-trend comparison + per-muscle weekly set-count chart.
R.setSEG('balance');
R.render();
const bal = R.getA();
T('Balance shows the Muscle Trend comparison card', /Muscle Trend/.test(bal) && /mt-cur/.test(bal));
T('Balance shows Set Count per Muscle with a muscle picker', /Set Count per Muscle/.test(bal) && /STAT_MG=this.value/.test(bal));
T('Balance leads with the front/back body heat map', /Muscle Heat Map/.test(bal) && (bal.match(/muscle heat map"/g) || []).length === 2);
T('heat-map regions tap through to the muscle chart', /STAT_MG='chest'/.test(bal));

// Monthly segment: empty current month falls back gracefully; a month with data
// shows the recap tiles, main-exercises list, and working ‹ › nav.
R.setSEG('monthly');
tryRender('Progress (monthly, current month)', () => R.render());
T('Monthly renders month nav or empty state', /aria-label="Previous month"/.test(R.getA()));
R.setMONTH('2026-06');
tryRender('Progress (monthly, June 2026)', () => R.render());
const mon = R.getA();
T('Monthly June shows recap tiles + main exercises', /Workouts/.test(mon) && /Main Exercises/.test(mon) && /Hex Bar Deadlift/.test(mon));
T('Monthly nav buttons target adjacent months', /STAT_MONTH='2026-05'/.test(mon) && /STAT_MONTH='2026-07'/.test(mon));
T('Monthly has no undefined/NaN leaks', !/undefined|NaN/.test(mon));
R.setMONTH(null);

// Strength-level card (Lifts segment) tracks the CURRENT main lifts, not retired ones.
R.setSEG('lifts');
R.render();
const liftsSeg = R.getA();
T('strength card renders the hex deadlift tier', /Hex Bar Deadlift/.test(liftsSeg));
T('strength bars share one ladder scale (ticks at fixed 20/40/60/80)', /std-tick" style="left:20%"/.test(liftsSeg) && /std-tick" style="left:80%"/.test(liftsSeg));
T('strength rows show current e1RM and next-tier target', /· e1RM [\d.]+kg/.test(liftsSeg) && / at [\d.]+kg e1RM/.test(liftsSeg));
// svgLine pads micro-ranges: a 55.3→55.5 series must not span the full chart height.
{
  const line = svgLine([{ v: 55.3, l: 'a' }, { v: 55.5, l: 'b' }, { v: 55.5, l: 'c' }], 360, 170, '#000', 't');
  const ticks = (line.match(/>([\d.]+)<\/text>/g) || []).map(s => parseFloat(s.slice(1)));
  T('svgLine pads a micro-range above the data max', ticks.some(t => t > 55.6), JSON.stringify(ticks));
  T('svgLine pads a micro-range below the data min', ticks.some(t => t < 55.2 && t > 50), JSON.stringify(ticks));
}
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

// ── D6: per-lift Recent Sessions log (band + weighted; PR + phase-gated hit markers) ──
{
  R.setSEG('lifts'); R.setSTAT('hex_dl');
  R.render();
  const log = R.getA();
  T('lifts detail renders the Recent Sessions log', /Recent Sessions/.test(log));
  T('session log rows show the load', /<td style="font-weight:600;white-space:nowrap">40kg<\/td>/.test(log));
  T('a PR marker appears in the log (hxs session is hex_dl best)', /▲PR/.test(log));
  R.setSTAT('pullup_a'); R.render();
  T('band lift log shows the band as load', /Recent Sessions/.test(R.getA()) && /<td style="font-weight:600;white-space:nowrap">(Blue|Green|Purple)/.test(R.getA()));
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
  const lifts = ['ohp', 'floor_press', 'hex_rdl', 'lm_squat', 'bb_curl', 'oh_triceps_ext', 'hex_row', 'b_stance_rdl', 'hex_squat_b'];
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
  T('expanded session shows its muscle split', /Muscle Split/.test(hist) && /msp-row/.test(hist));
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
// DB rows now get their own CHROME chips — the guard is against the old bug of
// rendering BARBELL plates (pl-10/pl-5/…) on a dumbbell lift.
T('no BARBELL plate strip rendered for a dumbbell lift', !/pl pl-(10|5|2|1)"/.test(dbHist));
T('dumbbell lift renders its own chrome chips instead', /pl pl-db/.test(dbHist));
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
  log.setDone = [true, true, true]; // ticks-required finish: only checked sets save
  tryRender('finishW → summary', () => R.finishW());
  T('AW backup survives finishW (summary not yet saved)', store[R.AW_KEY] != null);
  R.setSDIFF(3);
  tryRender('saveSumm commits the session', () => R.saveSumm());
  T('saveSumm clears the AW backup', store[R.AW_KEY] == null);
  const saved = R.getD().sessions[R.getD().sessions.length - 1];
  T('session committed with RPE', R.getD().sessions.length === nBefore + 1 && saved.difficulty === 3, JSON.stringify({ n: R.getD().sessions.length, diff: saved && saved.difficulty }));
  T('dead trainingWeek field no longer written to sessions', saved.trainingWeek === undefined);
  R.getD().sessions = R.getD().sessions.filter(s => s !== saved);

  // ── audit fix: switching venue must not turn Start into a silent shredder ──
  // checkResume hides a venue-mismatched blob but keeps it in storage, and beginW's guard
  // used to ask checkResume — so it saw null and let Start overwrite the workout with no
  // prompt, exactly when no Resume card was on screen to tell the user it existed.
  R.beginW('A');
  const lg = R.getLOG()['hex_dl'];
  lg.touched = true; lg.wt = 40; lg.reps = ['5', '5', '5'];
  R.getD().location = 'home';
  saveAW(); // stamp the blob at the home venue with real logged reps
  R.getD().location = 'partner'; // user switches venue — blob is now hidden, not deleted
  T('venue switch hides the blob from checkResume but keeps it', checkResume() === null && store[R.AW_KEY] != null);
  let msg = null;
  global.confirm = m => { msg = m; return false };
  R.beginW('B');
  T('Start prompts before discarding a venue-hidden workout', /different venue \(home\)/.test(msg || ''), String(msg));
  T('declining leaves the hidden workout intact', JSON.parse(store[R.AW_KEY]).log.hex_dl.reps.join() === '5,5,5', store[R.AW_KEY]);
  global.confirm = () => true;
  R.beginW('B');
  T('accepting proceeds and starts the new workout', R.getD().location === 'partner' && JSON.parse(store[R.AW_KEY]).day === 'B');
  delete global.confirm;
  R.getD().location = 'home';
  global.localStorage = realLS;
}

// ── Partner first-run (E2/E4): computed seed + DB stepper + per-end readout ──
{
  R.getD().location = 'partner';
  tryRender('workout (partner Day B, first run)', () => R.beginW('B'));
  const dbIdx = R.dayExs('B').findIndex(e => e.id === 'db_ohp');
  R.setCIDX(dbIdx);
  R.render();
  const pw = R.getA();
  // SEED's last home OHP is 23kg → db_ohp computes 23×0.32 = 7.36 → snapped to 7.5/DB.
  T('db_ohp seeds from home barbell OHP history (7.5/DB)', R.getLOG()['db_ohp'] && Number(R.getLOG()['db_ohp'].wt) === 7.5, JSON.stringify(R.getLOG()['db_ohp'] && R.getLOG()['db_ohp'].wt));
  T('db lift renders ladder stepper buttons', /stepWt\('db_ohp',-1\)/.test(pw) && /stepWt\('db_ohp',1\)/.test(pw));
  T('per-end spinlock readout renders', /Spinlock per end:/.test(pw) && /two matched bells/.test(pw));
  // Stepper walks the matched ladder: 7.5 → 8.
  R.stepWt('db_ohp', 1);
  T('stepWt walks db up the spinlock ladder (7.5 → 8)', R.getLOG()['db_ohp'].wt === 8, R.getLOG()['db_ohp'].wt);
  // DB plate chips render (8/DB = 3/end = 2.5+0.5 → two chrome chips).
  R.render();
  T('db lift renders chrome plate chips', (R.getA().match(/pl pl-db/g) || []).length === 2, (R.getA().match(/pl pl-db/g) || []).length);
  T('per-end readout resolves (no dash)', !/Spinlock per end: —/.test(R.getA()));
  R.getD().location = 'home';
}

// ── DB plate chips in History + DB ladders on the reference screen ──
{
  R.getD().sessions.push({ id: 'dbv', date: '2026-06-14', day: 'B', loc: 'partner',
    ex: [{ id: 'db_ohp', wt: 16.5, reps: [10, 10, 10], band: '' }] });
  R.go('history');
  R.setEXP('dbv');
  tryRender('History (db session expanded, plate chips)', () => R.render());
  T('history db row shows chrome plate chips', (R.getA().match(/pl pl-db/g) || []).length === 4);
  R.setEXP(null);
  R.getD().sessions = R.getD().sessions.filter(s => s.id !== 'dbv');
  tryRender('All Valid Weights incl. DB ladders', () => R.go('plates'));
  T('plates screen lists the matched-pair DB ladder', /Dumbbells — matched pair/.test(R.getA()));
  T('plates screen lists the single-bell DB ladder', /Dumbbell — single bell/.test(R.getA()));
  T('DB ladder rows carry per-end breakdowns', /\/end/.test(R.getA()));
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

// ── Dark mode: applyTheme swaps the string-built palette both ways ──
{
  const before = R.getPal();
  R.getD().theme = 'dark';
  applyTheme();
  const dk = R.getPal();
  T('applyTheme(dark) swaps the chart grid color', dk.grid === '#2a3450', dk.grid);
  T('applyTheme(dark) swaps the heat-map channels', dk.cyan === '47,179,232', dk.cyan);
  T('heatColor emits the dark cyan at ≥MAV', heatColor(22, 8, 20, 10) === 'rgba(47,179,232,0.95)', heatColor(22, 8, 20, 10));
  T('body-metric line colors switch too', dk.bm0 === '#2fb3e8', dk.bm0);
  R.setSEG('balance');
  tryRender('Balance renders under the dark palette', () => R.go('stats'));
  tryRender('Body renders under the dark palette', () => R.go('body'));
  R.getD().theme = 'auto';
  applyTheme(); // matchMedia stub reports light → auto restores the light palette
  const lt = R.getPal();
  T('applyTheme(auto) restores the light palette', lt.grid === before.grid && lt.cyan === before.cyan);
}
// Settings: title + Appearance chips + carded cue empty state.
R.go('settings');
const setScr = R.getA();
T('Settings has a screen title', /pg-title">Settings</.test(setScr));
T('Settings shows the Appearance theme chips', /Appearance/.test(setScr) && /D.theme='dark'/.test(setScr) && /aria-pressed/.test(setScr));
T('empty cues state uses the shared card', /No cues yet/.test(setScr) && /💡/.test(setScr));

// ── Corrupt-store rescue banner: partial-drop wording vs total-loss wording ──
// load() now counts sessions it had to discard and parks the raw store; the banner must say
// which happened. The old copy always claimed "what you see now is a fresh/demo state",
// which is wrong (and alarming) when most of the history loaded fine.
{
  const store = {};
  const realLS = global.localStorage;
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } };
  const good = { id: 'ok1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] };
  store[R.SK] = JSON.stringify({ sessions: [good, { id: 'bad', date: '2026-06-03', day: 'B' }], phase: 1, phaseStart: '2026-06-01', location: 'home', programVersion: 17 });
  R.load();
  tryRender('home renders after a partial-drop load', () => R.go('home'));
  const partial = R.getA();
  T('partial drop names the count, not a demo reset', /1 session couldn.{0,6}t be read/.test(partial) && !/fresh\/demo state/.test(partial), partial.slice(partial.indexOf('⚠'), partial.indexOf('⚠') + 200));
  T('partial-drop banner still offers the raw-copy download', /dlCorrupt\(\)/.test(partial));
  // Unparseable store → the original total-loss wording.
  store[R.SK] = '{not json';
  R.load();
  tryRender('home renders after an unparseable load', () => R.go('home'));
  const total = R.getA();
  T('total loss keeps the fresh/demo wording', /Stored data was corrupted/.test(total) && /fresh\/demo state/.test(total));
  // ...and a total loss must clear any partial count left by an earlier rescue, or the
  // banner would under-report a wiped store as "1 session couldn't be read".
  T('total loss clears a stale partial-drop count', store[R.SK + '-corrupt-n'] == null);
  // The rescue copy outlives the boot that made it, so the COUNT has to as well: keying the
  // wording off this boot's LOAD_DROPPED alone made every later boot claim a fresh/demo reset
  // to a user whose history had actually loaded fine.
  store[R.SK] = JSON.stringify({ sessions: [good, { id: 'bad', date: '2026-06-03', day: 'B' }], phase: 1, phaseStart: '2026-06-01', location: 'home', programVersion: 17 });
  R.load();
  R.go('home');
  T('boot 1 reports the partial drop', /1 session couldn.{0,6}t be read/.test(R.getA()));
  R.load();          // reboot: data is clean now, but the rescue copy is still parked
  R.go('home');
  const boot2 = R.getA();
  T('boot 2 still reports the partial drop, not a demo reset',
    /1 session couldn.{0,6}t be read/.test(boot2) && !/fresh\/demo state/.test(boot2),
    boot2.slice(boot2.indexOf('\u26a0'), boot2.indexOf('\u26a0') + 150));
  global.localStorage = realLS;
  R.setD(D);
}
// ── audit fix: esc() must be safe in ATTRIBUTE position, not just text position ──
// esc() is createElement→textContent→innerHTML, which escapes & < > but NOT quotes. The
// per-exercise notes input interpolates it into value="...", so a double quote in a note
// terminated the attribute early: the note came back truncated on reload, and everything
// after the quote was parsed as markup. It survived because the stub above used to escape
// quotes too — the test double was safer than the browser.
{
  R.getD().location = 'home';
  R.beginW('A');
  R.setCIDX(0);
  const noteLog = R.getLOG()['hex_dl'];
  noteLog.notes = 'felt 6" off the floor';
  R.render();
  const withNote = R.getA();
  const m = withNote.match(/class="ni"[^>]*value="([^"]*)"/);
  T('a double quote in a note does not terminate the value attribute',
    m && m[1] === 'felt 6&quot; off the floor', m ? m[1] : 'NO MATCH');
  noteLog.notes = 'x" onfocus="alert(1)" data-y="';
  R.render();
  T('a note cannot inject an attribute into the notes input', !/onfocus="alert\(1\)"/.test(R.getA()));
  // Text position is unchanged — a quote there was always harmless and must stay readable.
  T('esc still leaves markup-significant chars escaped', esc('<b>&</b>') === '&lt;b&gt;&amp;&lt;/b&gt;', esc('<b>&</b>'));
  T('the textContent stub matches browser semantics (quotes untouched)', escHtml('a"b\'c') === 'a"b\'c', escHtml('a"b\'c'));
  noteLog.notes = '';
  R.render();
}

// ── audit fix: steppers are real buttons, and "disabled" actually disables ──
// The barbell and bar-carry steppers were <div onclick>, while the DB stepper beside them
// was already a <button> — same class, same look, no keyboard access and no accessible name
// on two of the three. Separately, the .dis class was purely cosmetic on ALL of them: a
// greyed-out control still fired stepWt (harmless only because nxUp/nxDn clamp).
{
  R.getD().location = 'home';
  R.beginW('A');
  R.setCIDX(0);
  R.render();
  const bb = R.getA();
  T('barbell stepper controls are buttons, not divs',
    /<button[^>]*class="stp-b[^"]*"[^>]*aria-label="Step weight down"[^>]*onclick="stepWt\('hex_dl',-1\)"/.test(bb) &&
    /<button[^>]*aria-label="Step weight up"[^>]*onclick="stepWt\('hex_dl',1\)"/.test(bb), bb.match(/stp-b[^>]{0,90}/g));
  // Note the char class: `stp-big` is the legitimate flex container, not a stepper control.
  T('no stepper control is left as a bare div', !/<div class="stp-b["\s$]/.test(bb));
  // Drive the ladder to its floor: bar-only must really disable the down control.
  R.getLOG()['hex_dl'].wt = 7; // HEXBAR — nothing below it
  R.render();
  const atFloor = R.getA();
  const downBtn = atFloor.match(/<button[^>]*aria-label="Step weight down"[^>]*>/);
  T('a stepper at the bottom of the ladder is genuinely disabled',
    downBtn && /\bdisabled\b/.test(downBtn[0]) && /\bdis\b/.test(downBtn[0]), downBtn && downBtn[0]);
  const upBtn = atFloor.match(/<button[^>]*aria-label="Step weight up"[^>]*>/);
  T('...while the usable direction stays enabled', upBtn && !/\bdisabled\b/.test(upBtn[0]), upBtn && upBtn[0]);
  // The bar-loaded carry stepper got the same treatment.
  R.beginW('C');
  R.setCIDX(R.dayExs('C').findIndex(e => e.id === 'hex_carry'));
  R.getLOG()['hex_carry'].wt = 30;
  R.render();
  T('bar-carry stepper is a button with an accessible name',
    /<button[^>]*aria-label="Step weight (up|down)"[^>]*onclick="stepWt\('hex_carry'/.test(R.getA()));
  R.getD().location = 'home';
}


// The document title had been stuck at v12 for many releases; it is the PWA's install name
// and the browser-tab label, so a stale version number is user-visible.
{
  const fsx = require('fs'), pathx = require('path');
  const raw = fsx.readFileSync(pathx.join(__dirname, '..', 'index.html'), 'utf8');
  const t = raw.match(/<title>([^<]*)<\/title>/);
  T('document title carries no stale version number', t && !/v\d+/i.test(t[1]), t && t[1]);
}

// ── audit fix: the Balance "Priority" nudge must not fire on an empty account ──
// It has no history guard, so with zero sessions every MEV-gated muscle has gap == mev and
// the largest MEV wins: a user who has logged nothing was told to add sets to Back/Lats. The
// Overview screen two lines above it already handles its own empty state; this follows suit.
{
  const realD = R.getD();
  R.setD({ ...structuredClone(R.SEED), sessions: [], cardioLog: [], bodyLog: [], discomfort: [], cues: {}, location: 'home' });
  R.setSEG('overview');
  tryRender('Progress renders on a completely empty account', () => R.go('stats'));
  T('no Priority nudge with zero logged sessions', !/Priority:/.test(R.getA()), (R.getA().match(/Priority:[^<]{0,60}/) || [''])[0]);
  // ...but the nudge must still appear once there is real history sitting below MEV.
  R.setD(realD);
  R.setSEG('overview');
  R.go('stats');
  T('the Priority nudge still fires when there IS history below MEV', /Priority:/.test(R.getA()), 'nudge missing on a populated account');
}

// ── audit fix: every screen has a heading outline ──
// The app had two heading tags total across five screens, so a screen-reader user had nothing
// to navigate by. The persistent header <h1> is the app; each screen is an <h2> (the visible
// pg-title where one exists, an sr-only one where the design has no title text); sections
// below that are <h3>. Nothing moves visually — sr-only is clipped, not hidden from AT.
{
  const headings = markup => [...markup.matchAll(/<(h[1-6])\b/g)].map(m => m[1]);
  // NOTE the view keys. render() dispatches via `fn[VIEW]||rHome`, so a typo'd key silently
  // renders Home — an earlier draft of this test asked for 'hist', got the Home screen, and
  // passed. Any screen added here must be spot-checked against that fallback.
  const screens = [
    ['home', () => R.go('home')],
    ['progress', () => { R.setSEG('overview'); R.go('stats') }],
    ['body', () => R.go('body')],
    ['history', () => R.go('history')],
    ['settings', () => R.go('settings')],
    ['cardio', () => R.go('cardio')],
    ['logpast', () => R.go('logpast')],
    ['plates', () => R.go('plates')],
  ];
  for (const [name, nav] of screens) {
    nav();
    const hs = headings(R.getA());
    T(`${name}: renders exactly one h2 screen title`, hs.filter(h => h === 'h2').length === 1, JSON.stringify(hs));
    // #app never contains the app-level h1 — that lives in the persistent header.
    T(`${name}: does not add a second h1`, !hs.includes('h1'), JSON.stringify(hs));
    // No level skips: the first heading must be the h2, and no h4+ before an h3.
    const firstBad = hs.findIndex((h, i) => i > 0 && Number(h[1]) > Number(hs[i - 1][1]) + 1);
    T(`${name}: no heading level is skipped`, firstBad === -1, JSON.stringify(hs));
  }
  // The workout screen is reached differently (beginW, not go).
  R.getD().location = 'home';
  R.beginW('A');
  const wh = headings(R.getA());
  T('workout: renders exactly one h2 screen title', wh.filter(h => h === 'h2').length === 1, JSON.stringify(wh));
  // sr-only must be clipped, not display:none — display:none is invisible to screen readers too.
  T('the sr-only utility clips rather than hides', /\.sr-only\{[^}]*clip:rect/.test(html) && !/\.sr-only\{[^}]*display:none/.test(html));
}

// ── audit fix: the Progress tab pattern actually connects ──
// The seg-chips carried role="tab" inside a role="tablist", but nothing was a tabpanel and no
// chip had aria-controls. A control that announces itself as a tab and controls nothing is
// worse than a plain button: it promises a relationship the DOM does not have.
{
  const idsIn = m => new Set([...m.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
  for (const seg of ['overview', 'lifts', 'balance', 'consistency', 'monthly']) {
    R.setSEG(seg);
    R.go('stats');
    const m = R.getA(), ids = idsIn(m);
    const controls = [...m.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"|aria-controls="([^"]+)"[^>]*role="tab"/g)]
      .map(x => x[1] || x[2]);
    // Derived, not hardcoded: SEGS has six entries and an earlier draft asserted five, which
    // would have started failing the day a segment was added or removed for reasons unrelated
    // to the tab wiring. Every element with role="tab" must declare aria-controls.
    const tabCount = (m.match(/role="tab"/g) || []).length;
    T(`${seg}: every tab declares aria-controls`, tabCount > 0 && controls.length === tabCount, JSON.stringify({ tabCount, controls: controls.length }));
    T(`${seg}: every aria-controls target exists`, controls.every(c => ids.has(c)), JSON.stringify({ controls: [...new Set(controls)], present: [...ids].slice(0, 8) }));
    const panel = m.match(/role="tabpanel"[^>]*aria-labelledby="([^"]+)"|aria-labelledby="([^"]+)"[^>]*role="tabpanel"/);
    T(`${seg}: a tabpanel exists and names its tab`, !!panel, 'no tabpanel');
    if (panel) {
      const labelledBy = panel[1] || panel[2];
      T(`${seg}: the panel points back at a real tab`, ids.has(labelledBy), labelledBy);
      // ...and specifically at the SELECTED tab, so the label tracks the switch.
      const selected = m.match(/id="([^"]+)"[^>]*role="tab"[^>]*aria-selected="true"|role="tab"[^>]*aria-selected="true"[^>]*id="([^"]+)"/);
      const selId = selected && (selected[1] || selected[2]);
      T(`${seg}: the panel is labelled by the SELECTED tab`, selId === labelledBy, JSON.stringify({ selId, labelledBy }));
    }
  }
  R.setSEG('overview');
}

console.log(`\n${pass} passed, ${fail} failed`);
