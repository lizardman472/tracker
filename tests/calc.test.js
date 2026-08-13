// Calculation-engine tests for the Rack-Free Tracker.
//
// The app is a single index.html with no build step, so this harness extracts the
// pure-logic portion of the inline <script> (everything before the TIMER/render
// layer, which needs a DOM) and evaluates it in Node with localStorage stubbed.
// Run with:  node tests/calc.test.js
//
// Function declarations leak out of a sloppy-mode eval; const/let bindings do not,
// so we append an export line that captures the few const-bound values we need.

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
// Cut before the INIT block, which is the only top-level code that actually runs
// the app (load/render/service-worker). Everything above is pure declarations and
// function definitions — including the render-layer helpers (recentPRs, getPRs…)
// whose bodies only touch the DOM when called, which the tests never do.
const code = script.slice(0, script.indexOf('// ═══════════════ INIT')) +
  '\n;global.__X={ALL_EX,SEED,PHASE_ADJ_IDS,AW_KEY,SK,VW,DBW_PAIR,DBW_SINGLE,MG,MG_INFO,BODY_REGIONS_F,BODY_REGIONS_B,HEAT_PAL,setD:d=>{D=d},getD:()=>D,getDropped:()=>LOAD_DROPPED,setADAY:v=>{ADAY=v}};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// `global.navigator = {...}` is a SILENT NO-OP on Node 18+ — navigator is a getter-only
// accessor on globalThis, so the assignment neither takes nor throws. Every harness in this
// repo used it, which meant the stub was inert and any code reading navigator got Node's
// real one. Nothing depended on it yet, so nothing failed; it was a trap set for the first
// test that did. defineProperty is what actually replaces it.
function setNavigator(v) {
  Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
  if (globalThis.navigator !== v) throw new Error('navigator stub did not take');
  return v;
}
setNavigator({});
global.window = {}; // satisfies top-level `window.saveCardio = …` style handler assignments
eval(code);
const { ALL_EX, SEED, VW, MG_INFO, BODY_REGIONS_F, BODY_REGIONS_B, HEAT_PAL, setD, getD, getDropped, setADAY, SK } = global.__X;

let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };

// ── ALL_EX integrity ──
const ids = ALL_EX.map(e => e.id);
T('ALL_EX ids unique', new Set(ids).size === ids.length);
// lm_lateral appears on both Day A and Day B (same 4 sets, different cue); dedup must keep
// the first (Day A) def — identified by its distinct coaching cue.
T('dedup keeps first active def over later dupes', ALL_EX.find(e => e.id === 'lm_lateral').rl.startsWith('Hold the bar end'));
// Swapped-out straight-bar lifts survive as legacy stubs so pre-swap history resolves.
T('swapped lifts kept as legacy stubs', ['deadlift','zercher_b','suitcase_march'].every(id => ALL_EX.find(e => e.id === id)));
// Coach notes (📌) surface manual-progression reminders + band tips on the lifts the user is stuck on.
T('coach notes present on the flagged lifts', ['hex_dl','bb_rear_row','pullup_a','pullup_c','dips'].every(id => { const e = ALL_EX.find(x => x.id === id); return e && typeof e.note === 'string' && e.note.length > 10; }));

// ── tonnage (calcExVol) ──
T('carry excluded from tonnage', calcExVol('suitcase_march', 32, [40, 40, 40]) === 0);
T('legacy carry excluded', calcExVol('carry', 32, [1, 1, 1]) === 0);
T('bilateral barbell 46×15', calcExVol('deadlift', 46, [5, 5, 5]) === 690);
T('per_db doubles', calcExVol('db_ohp', 10, [10, 10, 10]) === 600);
T('perSide doubles', calcExVol('cossack_squat', 21, [8, 8, 8]) === 21 * 2 * 24);
T('per_db+perSide ×4 (two-DB single-leg RDL)', calcExVol('db_sl_rdl', 10, [8, 8, 8]) === 10 * 4 * 24);
T('single-arm press not per_db', calcExVol('db_1arm_press', 8, [10, 10, 10]) === 8 * 2 * 30);
// Goblet / single-DB holds are perSide-only (×2), NOT per_db (×4) — fixed after the audit.
T('db_bss goblet = perSide only, not per_db', calcExVol('db_bss', 10, [8, 8, 8, 8]) === 10 * 2 * 32);
T('db_dead_bug single-DB = perSide only, not per_db', calcExVol('db_dead_bug', 5, [8, 8, 8]) === 5 * 2 * 24);

// ── effectiveReps: per-side convention (no halving) ──
T('no halving for perSide', JSON.stringify(effectiveReps({ perSide: true }, [8, 8, 8])) === '[8,8,8]');

// ── e1RM ──
T('e1rm at 1 rep = weight', e1rm(100, 1) === 100);
T('e1rm Epley 5 reps', e1rm(60, 5) === Math.round(60 * (1 + 5 / 30) * 10) / 10);
T('e1rm 0 reps = 0', e1rm(100, 0) === 0);

// ── rep-range parsing ──
T('repmin 8-10', getRepMin({ rp: '8-10', tg: 10 }) === 8);
T('repmin 8/side', getRepMin({ rp: '8/side', tg: 8 }) === 8);
T('repmin steps/side', getRepMin({ rp: '30-40 steps/side', tg: 40 }) === 30);

// ── progression engine ──
function freshD(over) { setD(structuredClone(SEED)); const d = getD(); d.discomfort = []; d.location = 'home'; d.phase = 1; Object.assign(d, over || {}); return d; }

let d = freshD();
d.sessions = [{ id: 'x1', date: '2026-06-08', day: 'C', loc: 'home', ex: [{ id: 'lm_lateral_squat', wt: 21, reps: [8, 8, 8], band: '' }] }];
let sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_lateral_squat'));
T('per-side hit-target → up', sg.type === 'up', JSON.stringify(sg));

d.sessions = [{ id: 'x2', date: '2026-06-08', day: 'C', loc: 'home', ex: [{ id: 'band_er', wt: null, reps: [15, 15], band: 'Purple' }] }];
sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'band_er'));
T('per-side band hit-target → up', sg.type === 'up', sg.text);

const ohp = getProgram(1, 'home').B.find(e => e.id === 'ohp'); // OHP is 4 sets
// 85kg = the straight bar + all plates (37/side). One rung below (84.5) must still climb.
d.sessions = [{ id: 'x3', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 85, reps: [7, 7, 7, 7], band: '' }] }];
sg = getSmartSugg(ohp);
T('at plate ceiling (85kg) → maxed', sg.maxed === true && sg.type === 'st', JSON.stringify(sg));
d.sessions = [{ id: 'x3b', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 80, reps: [7, 7, 7, 7], band: '' }] }];
sg = getSmartSugg(ohp);
T('80kg is no longer the ceiling — still climbs toward 85', sg.type === 'up' && sg.wt > 80 && sg.wt <= 85, JSON.stringify(sg));

d.sessions = [{ id: 'x4', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 21, reps: [7, 7, 7, 7], band: '' }] }];
sg = getSmartSugg(ohp);
T('normal hit-target → up', sg.type === 'up' && sg.wt > 21, JSON.stringify(sg));

const dl = getProgram(1, 'home').A.find(e => e.id === 'hex_dl');
d.sessions = [{ id: 'x5', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] }];
T('confirm lift needs 2 hits', getSmartSugg(dl).type === 'cf');
d.sessions.push({ id: 'x6', date: '2026-06-10', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] });
T('confirmed → up', getSmartSugg(dl).type === 'up');

// stall ladder
d.sessions = [1, 2].map(i => ({ id: 'z' + i, date: '2026-06-0' + i, day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [4, 3, 3], band: '' }] }));
sg = getSmartSugg(ohp);
T('2 stalls → cluster hold', sg.type === 'stay' && /cluster/i.test(sg.text), sg.text);
d.sessions.push({ id: 'z3', date: '2026-06-03', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [4, 3, 3], band: '' }] });
sg = getSmartSugg(ohp);
T('3 stalls → drop weight', sg.type === 'dn' && sg.wt < 31, JSON.stringify(sg));
T('3 stalls → deload is a real ~10% cut (not one micro-rung)', sg.wt <= 31 * 0.9 + 0.001, JSON.stringify(sg));

// ── KB progression (was a bare "Continue" fallback) — legacy kb_curl is the remaining kb specimen ──
d = freshD();
d.sessions = [{ id: 'k1', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'kb_curl', wt: 8, reps: [12, 12, 12], band: '' }] }];
sg = getSmartSugg(ALL_EX.find(e => e.id === 'kb_curl'));
T('kb hit-target → up (not fallback Continue)', sg.type === 'up' && sg.wt === 9, JSON.stringify(sg));

// ── dead bugs kb→bb conversion (v26): plate-loaded barbell like the other bar lifts ──
const dbug = getProgram(1, 'home').A.find(e => e.id === 'dead_bugs_a'); // v19 moved it to the core block, v20 put it back on Day A
T('dead_bugs_a is barbell on the 11kg straight-bar ladder', dbug.tp === 'bb' && dbug.bar === undefined && vwOf(dbug) === VW);
d.sessions = [{ id: 'k2', date: '2026-06-08', day: 'X', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 8, reps: [8, 8, 8], band: '' }] }];
sg = getSmartSugg(dbug);
T('legacy sub-bar KB load re-anchors to the empty bar', sg.type === 'new' && sg.wt === 11, JSON.stringify(sg));
d.sessions.push({ id: 'k3', date: '2026-06-10', day: 'X', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 11, reps: [8, 8, 8], band: '' }] });
sg = getSmartSugg(dbug);
T('dead bugs progress on the plate ladder once on the bar', sg.type === 'up' && sg.wt > 11 && VW.includes(sg.wt), JSON.stringify(sg));

// ── big rep-target overshoot re-anchors the load (not a +1kg crawl) ──
// b_stance_rdl target is 8/side; logging 20/side means the load is ~2x too light. The old
// engine added one micro-rung (+1kg); now it jumps proportionally (capped ~12%).
d = freshD({ phase: 1, phaseStart: '2026-01-01' });
d.sessions = [{ id: 'bo1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'b_stance_rdl', wt: 32, reps: [20, 20, 20], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'b_stance_rdl'));
T('big overshoot jumps proportionally, not one micro-rung', sg.type === 'up' && sg.wt >= 35 && sg.wt <= 36, JSON.stringify(sg));
T('big-overshoot jump is capped (≤ +12%)', sg.wt <= 32 * 1.12 + 0.5, JSON.stringify(sg));
// modest overshoot (1 over) is unchanged — still the small confirmed step.
d.sessions = [{ id: 'bo2', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'b_stance_rdl', wt: 32, reps: [9, 9, 9], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'b_stance_rdl'));
T('modest overshoot keeps the small step (no over-jump)', sg.type === 'up' && sg.wt <= 34, JSON.stringify(sg));

// ── PERSISTENT overshoot: a small overshoot that never stops is its own signal ──
// The single-session trigger asks how FAR over one session went; this asks how LONG the lift
// has been over. hex_dl (target 5, a CONFIRM lift) logged at 6 reps every session is +1 over —
// below overTrig(5)=2 — so on the old engine it alternated ↑0.5kg / Confirm forever. That is
// the real 13 Aug export shape: 55 → 56kg over 51 days, the slowest lift in the program.
const hexA = () => getProgram(1, 'home').A.find(e => e.id === 'hex_dl');
const overRun = (n, reps) => Array.from({ length: n }, (_, i) => ({
  id: 'ps' + i, date: `2026-06-0${i + 1}`, day: 'A', loc: 'home',
  ex: [{ id: 'hex_dl', wt: 56, reps, band: '' }] }));
d = freshD({ phase: 1, phaseStart: '2026-01-01' });

// The discriminator is the PERSISTENT path firing, not type — two sessions at one load
// already satisfy the confirm brake, so an ordinary +0.5 plate step there is correct.
const isPersist = s => /sessions running over/.test(s.detail || '');

d.sessions = overRun(2, [6, 6, 6]);
sg = getSmartSugg(hexA());
T('2 sessions over target is NOT yet persistent (single plate step only)', !isPersist(sg) && sg.wt === 56.5, JSON.stringify(sg));

d.sessions = overRun(3, [6, 6, 6]);
sg = getSmartSugg(hexA());
T('3 sessions over target escalates to a proportional jump', isPersist(sg) && sg.type === 'up' && sg.wt > 56.5, JSON.stringify(sg));
// Persistence opens the gate; it must not inflate the jump. +1 rep over = 2.5%, and the
// confirm-lift cap is 8% — so the step stays proportional to the reps, never beyond them.
T('persistent jump stays proportional to the overshoot (≤ +2.5%)', sg.wt <= 56 * 1.025 + 0.5, JSON.stringify(sg));

// SAFETY INVARIANT: persistence changes the SIZE of the step, never the confirm brake.
// The single-session re-anchor runs ahead of that brake on purpose, but only because a load
// beaten by 4+ reps every set is plainly too light. At +1 rep that argument does not hold,
// and CONFIRM_LIFTS are the heavy spinal movements. Without this gate a forward replay had
// hex_dl escalating on EVERY session, 56 → 68kg in eight.
d.sessions = [...overRun(3, [6, 6, 6]),
  { id: 'psNew', date: '2026-06-06', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 58, reps: [6, 6, 6], band: '' }] }];
sg = getSmartSugg(hexA());
T('a confirm lift on a fresh load still confirms, however long the run', sg.type === 'cf' && sg.wt === 58, JSON.stringify(sg));
// …and once the load IS confirmed, persistence pays out the bigger step.
d.sessions.push({ id: 'psNew2', date: '2026-06-07', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 58, reps: [6, 6, 6], band: '' }] });
sg = getSmartSugg(hexA());
T('after the confirm session, persistence gives the proportional step', isPersist(sg) && sg.wt > 58.5, JSON.stringify(sg));

// A session merely AT target breaks the run — otherwise "over" would accumulate across
// sessions that gave no evidence of being over.
d.sessions = [...overRun(2, [6, 6, 6]),
  { id: 'psAt', date: '2026-06-04', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 56, reps: [5, 5, 5], band: '' }] },
  { id: 'psB', date: '2026-06-05', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 56, reps: [6, 6, 6], band: '' }] }];
sg = getSmartSugg(hexA());
T('an at-target session resets the persistence run', !isPersist(sg) && sg.wt === 56.5, JSON.stringify(sg));

// A short session cannot extend the run — hitTarget requires the prescription be covered,
// so 1 good set out of 3 must not count toward three "sessions over target".
d.sessions = [...overRun(2, [6, 6, 6]),
  { id: 'psShort', date: '2026-06-04', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 56, reps: [6], band: '' }] }];
sg = getSmartSugg(hexA());
T('a short session does not extend the persistence run', !isPersist(sg), JSON.stringify(sg));

// Landing IN range must stay quiet — this is the guard that keeps the change targeted.
// ohp target is 7; three sessions at exactly 7 is compliance, not evidence of a light load.
d.sessions = Array.from({ length: 3 }, (_, i) => ({
  id: 'psO' + i, date: `2026-06-0${i + 1}`, day: 'B', loc: 'home',
  ex: [{ id: 'ohp', wt: 27.5, reps: [7, 7, 7, 7], band: '' }] }));
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('3 sessions AT target does not trigger persistence', !/sessions running over/.test(sg.detail || ''), JSON.stringify(sg));

// ── stall branch: a lift CLIMBING toward its rep floor is not stalled ──
// `stalls` counts consecutive below-minimum sessions with no regard for trajectory, so a lift
// reading 10, 10, 14 against a 3×15 floor scored identically to 10, 10, 10 and earned the same
// ~10% cut — one session before it would have landed. That is the live db_rear_fly case in the
// 13 Aug export.
const rearFly = () => getProgram(1, 'partner').A.find(e => e.id === 'db_rear_fly');
const flyRun = rr => rr.map((r, i) => ({
  id: 'cl' + i, date: `2026-07-0${i + 1}`, day: 'A', loc: 'partner',
  ex: [{ id: 'db_rear_fly', wt: 5, reps: r, band: '' }] }));
d = freshD({ phase: 1, phaseStart: '2026-01-01' });
d.location = 'partner';

d.sessions = flyRun([[10, 10, 10], [10, 10, 10], [14, 14, 14]]);
sg = getSmartSugg(rearFly());
T('climbing reps near the floor hold the load instead of cutting',
  sg.type === 'stay' && sg.wt === 5 && /climbing 10→14/.test(sg.detail), JSON.stringify(sg));

d.sessions = flyRun([[10, 10, 10], [10, 10, 10], [10, 10, 10]]);
sg = getSmartSugg(rearFly());
T('a flat run at the same load still cuts', sg.type === 'dn', JSON.stringify(sg));

// TERMINATION: the guard compares the last TWO sessions, not first-to-last. Were it
// first-to-last, 10, 14, 14 would still read "10 → 14" and hold the load indefinitely.
d.sessions = flyRun([[10, 10, 10], [14, 14, 14], [14, 14, 14]]);
sg = getSmartSugg(rearFly());
T('once reps stop rising the cut proceeds (guard terminates)', sg.type === 'dn', JSON.stringify(sg));

// Climbing but far from the floor is a wrong load, not a near miss — still cut.
d.sessions = flyRun([[6, 6, 6], [8, 8, 8], [10, 10, 10]]);
sg = getSmartSugg(rearFly());
T('climbing from far below the floor still cuts', sg.type === 'dn', JSON.stringify(sg));

// ── EXPRESS DAY: keep every loaded compound, drop the accessory tail ──
// The trade is coverage-and-load kept, accessory volume spent. These pin the trade so a
// future program edit cannot quietly turn express into "half a workout".
d = freshD({ phase: 1, phaseStart: '2026-01-01' });
d.location = 'home';
for (const day of ['A', 'B', 'C']) {
  const full = dayExs(day, {}, false), xp = dayExs(day, {}, true);
  T(`express Day ${day} is strictly shorter than the full day`, xp.length < full.length, `${full.length} -> ${xp.length}`);
  const keep = new Set(xp.map(e => e.id));
  // Every loaded compound survives — nothing carrying a primary muscle at full weight is cut.
  const lostCompound = full.filter(e => !keep.has(e.id))
    .filter(e => ['chest', 'back', 'quads', 'hams', 'glutes', 'fdelt'].some(k => (global.__X.MG[e.id] || {})[k] >= 1));
  T(`express Day ${day} drops no primary compound`, lostCompound.length === 0, lostCompound.map(e => e.id).join(','));
  // Sets and reps are untouched — express cuts exercises, never the prescription on what stays.
  const changed = xp.filter(e => { const f = full.find(x => x.id === e.id); return f && (f.s !== e.s || f.tg !== e.tg); });
  T(`express Day ${day} does not water down what it keeps`, changed.length === 0, changed.map(e => e.id).join(','));
}
// A swapped-in isolation lift must still be dropped — otherwise a swap smuggles the tail back.
{
  const slot = dayExs('A', {}, false).find(e => e.id === 'floor_press');
  T('express reads the RESOLVED movement, so a swap cannot smuggle the tail back in',
    slot && !dayExs('A', { floor_press: 'bb_curl' }, true).some(e => e.id === 'bb_curl'));
}
// Partner venue is already one collapsed short session — express must not apply there.
d.location = 'partner';
T('express is unavailable at the partner venue', expressAvailable() === false);
d.location = 'home';
T('express is available at home', expressAvailable() === true);

// ── Express MEV guard: BOTH halves required ──
// Under-MEV alone is not an express problem (a missed week or a deload does it), and heavy
// express use with the volume still landing is exactly what the feature is for. Only the
// conjunction is actionable.
const xpSess = (n, express) => Array.from({ length: n }, (_, i) => ({
  id: 'xm' + i + (express ? 'e' : 'f'), date: ymd(new Date(Date.now() - (i + 1) * 864e5)),
  day: 'A', loc: 'home', express, ex: [{ id: 'hex_dl', wt: 56, reps: [6, 6, 6], band: '' }] }));
d = freshD(); d.location = 'home';
d.sessions = xpSess(3, false);
T('under MEV but no express sessions → silent', expressMEVRisk(7) === null);
d.sessions = xpSess(1, true);
T('a single express session → silent (that is the feature working)', expressMEVRisk(7) === null);
d.sessions = xpSess(3, true);
{
  const r = expressMEVRisk(7);
  T('2+ express sessions AND a muscle under MEV → warns', r !== null && r.xp === 3, JSON.stringify(r && { xp: r.xp, n: r.short.length }));
  T('the warning names which muscles fell short', r && r.short.length > 0 && r.short.every(m => m.have < m.mev && m.nm));
}

// ── deload trigger uses objective COMPOUND stalls, not just self-rated RPE ──
// Timer met (10 wks since deload) + low RPE (2/5), so the old RPE-only gate would only
// call it "optional". With 2+ COMPOUND lifts stalling it should now be RECOMMENDED.
d = freshD();
d.lastDeload = ymd(new Date(Date.now() - 70 * 864e5));
d.sessions = [{ id: 'dl1', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', difficulty: 2, ex: [{ id: 'hex_dl', wt: 55, reps: [6, 6, 6], band: '' }] }];
T('timer + 2 compound stalls → deload DUE despite low RPE', getDeload(2).due === true, JSON.stringify(getDeload(2)));
T('deload reason names the stall signal', /stalling/.test(getDeload(2).reason), getDeload(2).reason);
T('timer + no stalls + low RPE → optional only (not due)', getDeload(0).due === false && getDeload(0).consider === true);
T('one stalling lift is not enough to force a deload', getDeload(1).due === false);

// ── stall classification: isolation dips don't count; compound stalls do ──
// (this is the #1-audit tightening — only compound, repeated stalls feed the deload)
const stall3 = (id, wt, reps) => [22, 19, 16].map((off, i) => ({ id: 'st_' + id + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', ex: [{ id, wt, reps, band: '' }] }));
d = freshD(); d.sessions = stall3('lm_lateral', 11.25, [8, 8, 8, 8]); // isolation (side delt only), stalled 3x
let dlpi = getPhaseInfo();
// lm_lateral is on BOTH Day A and Day B — dedupe must count the stall ONCE, not twice.
T('multi-day lift stall counted once (dedup)', dlpi.stalledEx === 1, JSON.stringify({ ex: dlpi.stalledEx, major: dlpi.stalledMajor }));
T('isolation stall does NOT feed the compound/deload signal', dlpi.stalledMajor === 0, JSON.stringify({ ex: dlpi.stalledEx, major: dlpi.stalledMajor }));
d = freshD(); d.sessions = stall3('floor_press', 30, [6, 6, 6]); // compound (chest+triceps), stalled 3x
dlpi = getPhaseInfo();
T('compound stall feeds the major-stall deload signal', dlpi.stalledMajor >= 1, JSON.stringify({ ex: dlpi.stalledEx, major: dlpi.stalledMajor }));

// ── phase week is DERIVED from phaseStart (no stored counter to drift) ──
d = freshD({ phaseStart: ymd(new Date(Date.now() - 28 * 864e5)) });
T('phase week derives from phaseStart (~wk5 at 28 days)', getPhaseInfo().wk === 5, getPhaseInfo().wk);
T('trainingWeek removed from fresh state (derived, not stored)', d.trainingWeek === undefined);

// ── v27: cadence-aware phase clock — timerDue fires on 24 sessions even inside the 8-wk window ──
// Only 3 calendar weeks elapsed (well under the 8-wk timer) but 24 sessions logged in-phase.
d = freshD({ phase: 1, phaseStart: ymd(new Date(Date.now() - 21 * 864e5)) });
d.sessions = Array.from({ length: 24 }, (_, i) => ({ id: 'ph' + i, date: ymd(new Date(Date.now() - (20 - Math.floor(i * 20 / 24)) * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] }));
T('phase timer fires on 24 in-phase sessions before the 8-week mark', getPhaseInfo().timerDue === true && getPhaseInfo().wk < 8, JSON.stringify({ due: getPhaseInfo().timerDue, wk: getPhaseInfo().wk }));
// Few sessions, early in the window → not due (regression guard on the OR).
d = freshD({ phase: 1, phaseStart: ymd(new Date(Date.now() - 7 * 864e5)) });
d.sessions = [{ id: 'ph_a', date: today(), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] }];
T('phase timer not due at 1 session / 2 weeks', getPhaseInfo().timerDue === false);

// ── v27: cadence-aware deload clock — fires on session count even under the week timer ──
// Non-beginner (>30 total sessions → 6-wk / 18-session threshold): only 3 weeks since the
// last deload but 18 sessions logged in that window → timer met; with 2 compound stalls, due.
d = freshD();
d.lastDeload = ymd(new Date(Date.now() - 20 * 864e5));
const oldS = Array.from({ length: 16 }, (_, i) => ({ id: 'old' + i, date: ymd(new Date(Date.now() - (120 - i * 4) * 864e5)), day: 'A', loc: 'home', difficulty: 3, ex: [{ id: 'hex_dl', wt: 55, reps: [6, 6, 6], band: '' }] }));
const recentS = Array.from({ length: 18 }, (_, i) => ({ id: 'rec' + i, date: ymd(new Date(Date.now() - (19 - i) * 864e5)), day: 'A', loc: 'home', difficulty: 2, ex: [{ id: 'hex_dl', wt: 55, reps: [6, 6, 6], band: '' }] }));
d.sessions = [...oldS, ...recentS]; // 34 total → non-beginner; 18 after lastDeload
T('deload timer met on 18 sessions since last deload (< 6 weeks, non-beginner)', getDeload(2).due === true, JSON.stringify(getDeload(2)));
T('deload not met at few sessions / few weeks', (() => { const dd = freshD(); dd.lastDeload = ymd(new Date(Date.now() - 7 * 864e5)); dd.sessions = [{ id: 'x', date: today(), day: 'A', loc: 'home', difficulty: 5, ex: [{ id: 'hex_dl', wt: 55, reps: [6, 6, 6], band: '' }] }]; return getDeload(2).due === false; })());

// ── audit fix: a skipped trailing set must NOT read as a stall/phantom deload ──
// ohp is s:4, tg:7, rp '5-7'. Three sessions of [10,10,10,0] (4th set blank) crush target on
// every PERFORMED set; before the fix the set-count gate misread them as 3 stalls → ~11% deload.
d = freshD({ phase: 1, phaseStart: '2026-01-01' });
d.sessions = [40, 35, 30].map((off, i) => ({ id: 'sk' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [10, 10, 10, 0], band: '' }] }));
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('skipped trailing set is not a phantom deload', sg.type !== 'dn', JSON.stringify(sg));
T('strong-but-incomplete sessions raise no stall signal', getPhaseInfo().stalledEx === 0 && getPhaseInfo().stalledMajor === 0, JSON.stringify({ e: getPhaseInfo().stalledEx, m: getPhaseInfo().stalledMajor }));
// a genuine all-sets-below-min stall still deloads (regression guard)
d = freshD({ phase: 1, phaseStart: '2026-01-01' });
d.sessions = [40, 35, 30].map((off, i) => ({ id: 'st' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [4, 4, 4, 4], band: '' }] }));
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('genuine below-min stall still deloads', sg.type === 'dn', JSON.stringify(sg));

// ── audit fix: a row logged with a weight but NO reps is not a failed session ──
// savePast commits a row as soon as a weight or band is entered (`if(wt)hasData=true`), so
// "I trained this at 32kg" with the rep boxes blank produced a session the engine read as
// below-range. Three of them forced a full ~10% deload and raised the stalled-lift count that
// drives the deload banner — a phantom failure built entirely from rows containing no reps.
{
  const fpR = getProgram(1, 'home').A.find(e => e.id === 'floor_press');
  const repless = n => { d = freshD({ phase: 1, phaseStart: '2026-01-01' });
    d.sessions = Array.from({ length: n }, (_, i) => ({ id: 'wo' + i, date: ymd(new Date(Date.now() - (30 - i * 4) * 864e5)), day: 'A', loc: 'home', retro: true, ex: [{ id: 'floor_press', wt: 32, reps: [0, 0, 0, 0], band: '', notes: '' }] }));
    return getSmartSugg(fpR) };
  T('three weight-only rows no longer force a deload', repless(3).type !== 'dn', JSON.stringify(repless(3)));
  T('...and raise no stall signal for the deload banner', (repless(3), getPhaseInfo().stalledMajor === 0), String(getPhaseInfo().stalledMajor));
  // The load IS known even though the reps aren't — don't fall back to the first-session seed
  // as though nothing were on record. (This branch throws if it references discWarn, which is
  // declared further down the function; that is exactly how the TDZ bug here was caught.)
  T('a weight-only history holds at the recorded weight, not the seed', repless(3).wt === 32 && /no reps recorded/.test(repless(3).detail), JSON.stringify(repless(3)));
  T('the weight-only branch does not throw', (() => { try { repless(1); return true } catch (e) { return false } })());
  // A real session alongside repless rows must still drive progression normally.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [
    { id: 'real', date: ymd(new Date(Date.now() - 10 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [10, 10, 10, 10], band: '' }] },
    { id: 'wo', date: ymd(new Date(Date.now() - 4 * 864e5)), day: 'A', loc: 'home', retro: true, ex: [{ id: 'floor_press', wt: 32, reps: [0, 0, 0, 0], band: '' }] }];
  T('a repless row does not mask a real session behind it', getSmartSugg(fpR).type === 'up', JSON.stringify(getSmartSugg(fpR)));
}

// ── audit fix: the prescribed cluster session is judged against ITS OWN prescription ──
// At 2 stalls the engine says "Try clusters: (s+1)×(mn-2) this session before any load cut" —
// reps deliberately UNDER the range minimum. Scoring that against the base range made the
// intervention itself strike three, so a lifter who did exactly what the app told them was
// deloaded by the very next render.
{
  const fpC = getProgram(1, 'home').A.find(e => e.id === 'floor_press'); // s:4 tg:10 mn:8 → cluster 5×6
  const twoStalls = () => [40, 35].map((off, i) => ({ id: 'cl' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [7, 7, 6, 6], band: '' }] }));
  const third = reps => ({ id: 'cl3', date: ymd(new Date(Date.now() - 30 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps, band: '' }] });
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = twoStalls();
  T('two stalls still prescribe the cluster', /cluster/i.test(getSmartSugg(fpC).text), getSmartSugg(fpC).text);
  // Hitting the prescription holds the load and re-runs the base scheme.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [...twoStalls(), third([6, 6, 6, 6, 6])];
  sg = getSmartSugg(fpC);
  T('a clean cluster holds the load instead of deloading', sg.type === 'stay' && sg.wt === 32, JSON.stringify(sg));
  T('...and tells the lifter to retry the base scheme', /Cluster hit/.test(sg.detail) && /Retry 4×8/.test(sg.detail), sg.detail);
  T('a clean cluster raises no stall signal for the deload gate', getPhaseInfo().stalledMajor === 0, JSON.stringify(getPhaseInfo().stalledMajor));
  // Missing the cluster floor (mn-2 = 6) still deloads — the escalation ladder is intact.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [...twoStalls(), third([4, 4, 4, 4, 4])];
  T('a missed cluster still deloads', getSmartSugg(fpC).type === 'dn', JSON.stringify(getSmartSugg(fpC)));
  // Same reps but no extra set = not the prescription, so it is an ordinary third stall.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [...twoStalls(), third([6, 6, 6, 6])];
  T('a plain below-min session at the base set count still deloads', getSmartSugg(fpC).type === 'dn', JSON.stringify(getSmartSugg(fpC)));
  // Guard: without two prior stalls the cluster card was never shown, so the shape earns nothing.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [third([6, 6, 6, 6, 6])];
  sg = getSmartSugg(fpC);
  T('an extra-set low-rep session without prior stalls is not a free pass', sg.type === 'stay' && /1\/3 stalls/.test(sg.detail), JSON.stringify(sg));

  // ── the reprieve is SINGLE-USE: the ladder must always terminate ──
  // Forgiving every cluster let a lifter hold the same load indefinitely on 5×6 — the
  // escalation ladder simply never ended. Exactly one cluster is forgiven; the next one
  // scores as the ordinary below-range session it is.
  const fourth = reps => ({ id: 'cl4', date: ymd(new Date(Date.now() - 25 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps, band: '' }] });
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [...twoStalls(), third([6, 6, 6, 6, 6]), fourth([6, 6, 6, 6, 6])];
  sg = getSmartSugg(fpC);
  T('a SECOND cluster is not a second reprieve — the ladder terminates', sg.type === 'dn', JSON.stringify(sg));
  // ...and the deload count must not bill the lifter for the session the app prescribed.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' }); d.sessions = [...twoStalls(), third([6, 6, 6, 6, 6]), fourth([6, 6, 6, 6])];
  sg = getSmartSugg(fpC);
  T('a failed retry after a cluster deloads at 3, not 4', sg.type === 'dn' && /3 sessions below/.test(sg.detail), sg.detail);
  // A cluster that lands mid-run still cannot be conjured without the advice being earned.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [twoStalls()[0], third([6, 6, 6, 6, 6])];
  T('one stall + a cluster shape is still only 2 stalls, not a hold', getSmartSugg(fpC).type === 'stay' && /2\/3 stalls/.test(getSmartSugg(fpC).detail), getSmartSugg(fpC).detail);
}

// ── audit fix: ACCESSORY sets past the prescription are not judged as working sets ──
// The first ex.s counted sets are the working sets; a back-off/drop set logged after them
// is extra volume. Capping the COUNT wasn't enough — the every() scan still saw the extra
// set, so 4×10 (target hit) + a lighter 6 read as "below min", and three such sessions
// forced an ~11% deload on a lifter who hit target every time. The engine's own plateau
// advice ("Add a set") and its "+ Add set" button both walked users straight into it.
{
  const fpDef = getProgram(1, 'home').A.find(e => e.id === 'floor_press'); // s:4 tg:10 rp '8-10'
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [{ id: 'bo_1', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [10, 10, 10, 10, 6], band: '' }] }];
  sg = getSmartSugg(fpDef);
  T('4×10 + a lighter back-off set reads as a hit, not a stall', sg.type === 'up' && sg.wt > 32, JSON.stringify(sg));
  // The CRITICAL repro: three target-hitting sessions with a back-off set each.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [40, 35, 30].map((off, i) => ({ id: 'bo' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [10, 10, 10, 10, 6], band: '' }] }));
  sg = getSmartSugg(fpDef);
  T('three back-off sessions do not force a deload', sg.type === 'up' && !sg.stalled, JSON.stringify(sg));
  T('back-off sessions raise no stall signal for the deload gate', getPhaseInfo().stalledMajor === 0 && getPhaseInfo().stalledEx === 0,
    JSON.stringify({ e: getPhaseInfo().stalledEx, m: getPhaseInfo().stalledMajor }));
  // A short set INSIDE the working window is still a genuine miss (guard against over-slicing).
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [{ id: 'bo_in', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [10, 10, 6, 10, 10], band: '' }] }];
  T('a short set inside the working window still blocks the increase', getSmartSugg(fpDef).type !== 'up', JSON.stringify(getSmartSugg(fpDef)));
  // Cross-day, the OTHER direction from the existing 3-set→4-set test: a 4-set session whose
  // first 3 sets met the prescription must satisfy a 3-set slot for the same lift.
  // NOTE (v21): this used to read the real 4-set Day-A / 3-set Day-B db_lateral asymmetry,
  // but the partner split collapsed to one shared base and no lift now differs in set count
  // across days at either venue. The property under test is the ENGINE's set-count
  // tolerance, not the program's shape, so the prescriptions are built explicitly — which
  // also stops the test breaking again the next time a day is re-sorted.
  d = freshD({ location: 'partner', phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [{ id: 'xd2', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'partner', ex: [{ id: 'db_lateral', wt: 5, reps: [15, 15, 15, 13], band: '' }] }];
  const latBase = getProgram(1, 'partner').A.find(e => e.id === 'db_lateral');
  const lat3 = { ...latBase, s: 3 }, lat4 = { ...latBase, s: 4 };
  T('4-set session satisfies a 3-set prescription', getSmartSugg(lat3).type === 'up', JSON.stringify(getSmartSugg(lat3)));
  T('the same session does NOT satisfy a 4-set prescription (last set short)', getSmartSugg(lat4).type !== 'up');
  // The AMRAP overshoot re-anchor reads the working sets too — a back-off set used to drag
  // minRep under target and silently suppress the proportional jump.
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [{ id: 'ov_bo', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'b_stance_rdl', wt: 32, reps: [20, 20, 20, 5], band: '' }] }];
  sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'b_stance_rdl'));
  T('a back-off set does not suppress the big-overshoot jump', sg.type === 'up' && sg.wt >= 35, JSON.stringify(sg));

  // ── the set-count window needs a FLOOR as well as a cap ──
  // nS takes its count from the session so a 3-set Day-B session can satisfy a 4-set Day-A
  // slot — but it had no lower bound, so a single set at target read as a full hit, moved the
  // weight up, and captioned itself "Hit 4×10". Floor is ex.s-1: verified against the real
  // program, only db_lateral and db_rear_fly differ across days and both are 4→3.
  const shortSess = reps => { d = freshD({ phase: 1, phaseStart: '2026-01-01' });
    d.sessions = [{ id: 'sh', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps, band: '' }] }];
    return getSmartSugg(fpDef) };
  T('4 of 4 at target still earns the increase', shortSess([10, 10, 10, 10]).type === 'up');
  T('3 of 4 at target still earns it (the cross-day case)', shortSess([10, 10, 10]).type === 'up', JSON.stringify(shortSess([10, 10, 10])));
  T('2 of 4 at target does NOT earn a load increase', shortSess([10, 10]).type === 'stay', JSON.stringify(shortSess([10, 10])));
  T('1 of 4 at target does NOT earn a load increase', shortSess([10]).type === 'stay', JSON.stringify(shortSess([10])));
  T('...and the hold says the set count is what is short', /Only 2 of 4 sets logged/.test(shortSess([10, 10]).detail), shortSess([10, 10]).detail);
  // The caption must report what was covered, not always the full prescription.
  T('a 3-of-4 hit is captioned 3×10, not 4×10', /Hit 3×10/.test(shortSess([10, 10, 10]).detail), shortSess([10, 10, 10]).detail);
  T('a full session is still captioned 4×10', /Hit 4×10/.test(shortSess([10, 10, 10, 10]).detail), shortSess([10, 10, 10, 10]).detail);
}

// ── audit fix: a successful (in-range) deload is not flagged as a "Weight dropped" regression ──
d = freshD();
d.sessions = [
  { id: 're1', date: ymd(new Date(Date.now() - 10 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 33, reps: [6, 6, 6], band: '' }] },
  { id: 're2', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 30, reps: [10, 10, 10], band: '' }] },
];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'floor_press'));
T('successful deload not flagged as a regression', !/Weight dropped/.test(sg.regress || ''), JSON.stringify(sg.regress));

// ── audit fix: validSession normalizes a missing/invalid day (render-crash chokepoint) ──
T('validSession defaults a missing day to A', validSession({ id: 'x', date: '2026-06-01', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5] }] }).day === 'A');
T('validSession keeps a valid day', validSession({ id: 'x', date: '2026-06-01', day: 'B', ex: [] }).day === 'B');
T('validSession coerces a junk day to A', validSession({ id: 'x', date: '2026-06-01', day: 'Z', ex: [] }).day === 'A');

// ── audit fix: Reset writes an already-migrated state (no phase revert on next load) ──
T('freshState carries programVersion 21 (no migrate re-fire)', freshState().programVersion === 21);
T('freshState drops the dead v12 confirmed field', freshState().confirmed === undefined);

// ── Phase re-anchor magnitude uses the Epley TRANSLATION curve, not the display blend ──
// 40kg×7 (P1 target) into P2 (target 10): %1RM tables put the drop at ≈8-9%. Epley gives
// 40×(1.2333/1.3333)=37.0; the old min(Epley,Lombardi) blend gave only −3.5% (38.5+),
// leaving hypertrophy sets far too heavy for the new rep target.
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [{ id: 'tf1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 40, reps: [7, 7, 7, 7], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('re-anchor drop matches %1RM tables (40kg 7→10 reps ≈ 37kg)', sg.type === 'new' && sg.wt >= 36 && sg.wt <= 37.5, JSON.stringify(sg));

// ── Phase-transition re-anchor ──
// OHP at 80kg×5 in Phase 1 (target 7), advance to Phase 2 (target 10) → lighter.
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [{ id: 'p1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [5, 5, 5], band: '' }] }];
const ohp2 = getProgram(2, 'home').B.find(e => e.id === 'ohp');
sg = getSmartSugg(ohp2);
T('phase 2 re-anchors lighter', sg.type === 'new' && sg.wt < 41, JSON.stringify(sg));
// Once a session is logged under the new phase, normal logic resumes.
d.sessions.push({ id: 'p2', date: '2026-06-10', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 36, reps: [8, 8, 8], band: '' }] });
sg = getSmartSugg(ohp2);
T('after logging in-phase, no re-anchor', sg.type !== 'new', JSON.stringify(sg));
// v23: partner DB lifts now periodize like home — db_ohp IS in PHASE_ADJ and re-anchors.
T('db_ohp in PHASE_ADJ_IDS (partner periodizes now)', global.__X.PHASE_ADJ_IDS.has('db_ohp'));
d = freshD({ phase: 2, phaseStart: '2026-06-09', location: 'partner' });
d.sessions = [{ id: 'p3', date: '2026-06-01', day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 12, reps: [6, 6, 6], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'partner').B.find(e => e.id === 'db_ohp'));
T('db lift re-anchors lighter into Hypertrophy', sg.type === 'new' && sg.wt < 12, JSON.stringify(sg));
// Bodyweight/clubbell/carry partner moves stay static (like home pull-ups/dips).
T('inv_rows_a not in PHASE_ADJ_IDS (bodyweight stays static)', !global.__X.PHASE_ADJ_IDS.has('inv_rows_a'));

// ── v21: the partner split is collapsed into one shared full-body base ──
{
  const pA = getProgram(1, 'partner').A, pB = getProgram(1, 'partner').B, pC = getProgram(1, 'partner').C;
  const BASE = ['db_rdl', 'db_bss', 'db_floor_press', 'inv_rows_a', 'db_ohp', 'db_lateral', 'side_plank'];
  const ids = day => day.map(e => e.id);
  T('every partner day opens with the same 7-movement base',
    BASE.every((id, i) => ids(pA)[i] === id && ids(pB)[i] === id && ids(pC)[i] === id),
    JSON.stringify([ids(pA).slice(0, 7), ids(pB).slice(0, 7), ids(pC).slice(0, 7)]));
  // The whole point of the collapse: at ~3 visits/month a lift must accumulate the 2-3
  // exposures getSmartSugg's re-anchor needs. A base lift appearing on only 2 of 3 days
  // would silently drop back toward the old one-exposure-per-quarter behaviour.
  T('base lifts appear on ALL three partner days (re-anchor needs repeat exposure)',
    BASE.every(id => [pA, pB, pC].every(day => ids(day).includes(id))));
  // Days differ ONLY past the base — finishers rotate so nothing goes stale.
  T('partner days differ only in their finishers',
    ids(pA).slice(7).join() !== ids(pB).slice(7).join() && ids(pB).slice(7).join() !== ids(pC).slice(7).join());
  // v25 reverted: the bars are too low to hang under, so no vertical-pull slot claims to exist.
  T('retired pull-up slots are gone from the active partner program',
    ![pA, pB, pC].some(day => ids(day).some(id => id === 'pb_pullup_a' || id === 'pb_pullup_c')));
  T('pb_dips is eccentric-only bodyweight, not band-assisted',
    (() => { const dp = pB.find(e => e.id === 'pb_dips'); return dp && dp.tp === 'bw' && dp.bandMode === undefined })());
  T('inv_rows_a is ACTIVE again and is the partner horizontal pull',
    pA.find(e => e.id === 'inv_rows_a') && !/Legacy/.test(pA.find(e => e.id === 'inv_rows_a').rl));
  // Retiring a lift must never strand its logged history.
  const allIds = new Set(global.__X.ALL_EX.map(e => e.id));
  T('v21-retired partner lifts keep ALL_EX stubs (history still resolves)',
    ['db_row_b', 'db_lunge', 'db_floor_press_v', 'db_sl_rdl', 'db_1arm_press', 'db_dead_bug', 'pb_pullup_a', 'pb_pullup_c']
      .every(id => allIds.has(id)));
  // Partner rests differentiate again (v20 had flattened everything everywhere to 1:00).
  T('partner compounds rest 0:45 and isolation 0:30',
    pA.find(e => e.id === 'db_rdl').rstS === 45 && pA.find(e => e.id === 'db_lateral').rstS === 30);
  T('home rests are untouched by the partner rest change',
    getProgram(1, 'home').A.find(e => e.id === 'hex_dl').rstS === 60);
}

// ── v21.3: the DB farmer's carry loads on the MATCHED spinlock ladder ──
// v21 prescribed "22kg/bell, top of the single-bell rack" for a TWO-bell carry. 22kg is only
// reachable when ONE bell gets the whole pool (that is db_bss): it needs 4×2.5kg per end, so
// two matched bells would want sixteen 2.5kg plates against the eight owned. The buildable
// matched ceiling is 18.5kg/bell — these pin that the app can no longer propose otherwise.
{
  const carry = global.__X.ALL_EX.find(e => e.id === 'db_carry');
  T('db_carry declares itself spinlock-loaded and per-hand', isDbLoaded(carry) && carry.loadUnit === 'per_db');
  T('db_carry resolves to the matched ladder (ceiling 18.5), not the single-bell one',
    dbwOf(carry) === global.__X.DBW_PAIR && dbwOf(carry)[dbwOf(carry).length - 1] === 18.5);
  T('22kg/bell is genuinely unbuildable as a matched pair', dbEnd(22, true) === null && dbEnd(22, false) !== null);
  // The cue is the line shown as prescription, so it must name the real ceiling and nothing
  // else. The note may still MENTION 22 — it explains why the old number was wrong — but it
  // must not tell you to go there ("type 22kg in", "top of the rack").
  T('the carry cue names the real 18.5kg/bell ceiling and no 22',
    /18\.5kg\/bell/.test(carry.rl) && !/22/.test(carry.rl), carry.rl);
  T('the carry note no longer instructs a 22kg load',
    !/[Tt]ype 22kg/.test(carry.note || '') && /18\.5kg\/bell/.test(carry.note || ''), carry.note);
  // Its seed used to round to 0.5kg on the barbell path, which can propose rungs the matched
  // pair cannot build (17.5/bell, say). It must now snap onto DBW_PAIR for ANY home carry load.
  const hex = global.__X.ALL_EX.find(e => e.id === 'hex_carry');
  T('db_carry seed snaps to a real matched rung for every plausible hex-carry load',
    [20, 32, 40, 46, 50, 53, 60, 70, 81].every(w => {
      const d = freshD({ location: 'partner' });
      d.sessions = [{ id: 'h', date: '2026-07-01', day: 'C', loc: 'home', phase: 1,
        ex: [{ id: 'hex_carry', wt: w, reps: [40, 40, 40], band: '' }] }];
      const r = getRelatedSuggestion(carry);
      return r && global.__X.DBW_PAIR.includes(r.wt);
    }));
  T('hex_carry is untouched — it still loads on the 7kg bar, not the DB ladder', !isDbLoaded(hex) && hex.bar === 7);
}

// ── v21.3: the fixed 8kg clubbell stops being offered a heavier club ──
// All three clubbell finishers run on the same 8kg club and each one's coach note says
// progression is reps and control, "never load". The engine used to answer a clean session
// with "8kg — smooth? → try 10kg" and fall back to a 6kg default matching nothing owned.
{
  const cb = ['cb_mills', 'cb_shield', 'cb_arm_cast'].map(id => global.__X.ALL_EX.find(e => e.id === id));
  T('every clubbell declares its fixed load', cb.every(e => e.fixedKg === 8));
  const armCast = cb[2];
  let d = freshD({ location: 'partner' });
  d.sessions = [{ id: 'c1', date: '2026-07-01', day: 'C', loc: 'partner', phase: 1,
    ex: [{ id: 'cb_arm_cast', wt: 8, reps: [10, 10, 10], band: '' }] }];
  let sgc = getSmartSugg(armCast);
  T('clean clubbell session still reads as progress', sgc.type === 'up');
  T('clubbell progress is reps/control, never a heavier club',
    sgc.wt === 8 && !/10kg/.test(sgc.text + sgc.detail) && /reps/.test(sgc.text + sgc.detail), JSON.stringify(sgc));
  // Below target: hold, and quote the club's real weight.
  d.sessions = [{ id: 'c2', date: '2026-07-01', day: 'C', loc: 'partner', phase: 1,
    ex: [{ id: 'cb_arm_cast', wt: 8, reps: [7, 6, 6], band: '' }] }];
  sgc = getSmartSugg(armCast);
  T('under-target clubbell holds at the real 8kg, not a phantom 6kg', sgc.wt === 8 && /8kg/.test(sgc.text), JSON.stringify(sgc));
  // No history at all — the seed, not a 6kg default nobody owns.
  d = freshD({ location: 'partner' }); d.sessions = [];
  sgc = getSmartSugg(cb[0]);
  T('first clubbell session seeds 8kg', sgc.wt === 8 && !/6kg/.test(sgc.text + sgc.detail), JSON.stringify(sgc));
  // A non-fixed club (none today, but the branch must stay usable) keeps the +2kg ladder.
  T('the +2kg club ladder survives for a hypothetical non-fixed club', (() => {
    const fake = { ...armCast, fixedKg: undefined, id: 'cb_arm_cast' };
    d.sessions = [{ id: 'c3', date: '2026-07-01', day: 'C', loc: 'partner', phase: 1,
      ex: [{ id: 'cb_arm_cast', wt: 8, reps: [10, 10, 10], band: '' }] }];
    return /10kg/.test(getSmartSugg(fake).text);
  })());
}

// ── v21.3: no coach note may prescribe a load the equipment cannot build ──
// The class of bug this guards: v21 told you to "Type 3.5kg/DB in once" on the rear-delt fly,
// but 3.5/bell needs 0.75kg per end and the smallest plate owned is 0.5 — so the instruction
// was impossible to follow, and the ladder would silently snap you elsewhere. A "Type Xkg"
// note is a literal prescription, so X must be a real rung on that lift's own ladder.
{
  const bad = [];
  for (const e of global.__X.ALL_EX) {
    const txt = (e.rl || '') + ' ' + (e.note || '');
    for (const m of txt.matchAll(/[Tt]ype\s+(\d+(?:\.\d+)?)\s*kg/g)) {
      const n = parseFloat(m[1]);
      const ladder = isDbLoaded(e) ? dbwOf(e) : e.tp === 'bb' ? vwOf(e) : null;
      if (ladder && !ladder.includes(n)) bad.push(`${e.id}: "${m[0]}" is not a rung`);
      if (e.fixedKg != null && n !== e.fixedKg) bad.push(`${e.id}: "${m[0]}" != fixed ${e.fixedKg}kg`);
    }
  }
  T('every "Type Xkg" instruction names a load the rack can actually build', bad.length === 0, bad.join(' · '));
  // And the corrected figure specifically. This used to pin the literal string "Type 3kg/DB".
  // That instruction has since been retired as SPENT (the reps rebuilt at 5kg on their own),
  // so pinning the phrase would force a stale instruction to stay on the card forever. What
  // must hold is the durable property: the note may EXPLAIN that 3.5 is unbuildable, but it
  // must never PRESCRIBE it — and 3 must remain a real rung while 3.5 is not.
  const fly = global.__X.ALL_EX.find(e => e.id === 'db_rear_fly');
  T('rear-delt fly never prescribes the unbuildable 3.5kg/DB',
    !/[Tt]ype\s+3\.5\s*kg/.test(fly.note) && global.__X.DBW_PAIR.includes(3) && !global.__X.DBW_PAIR.includes(3.5));

  // ── expired hand-entry instructions must be retired, not left to mislead ──
  // Both of these told the lifter to type a load in once, because at the pre-v21 partner
  // cadence the engine could never re-anchor. v21 collapsed the split, the exposures arrived,
  // and the engine overtook both — db_curl now proposes 15kg/DB unaided and db_rear_fly is
  // rebuilding reps at 5kg. A note that still says "type X in" now fights the card beside it.
  const curl = global.__X.ALL_EX.find(e => e.id === 'db_curl');
  T('db_curl hand-entry instruction is retired and marked spent',
    !/Type 15kg\/DB in once/.test(curl.note) && /SPENT/.test(curl.note), curl.note.slice(0, 90));
  T('db_rear_fly hand-entry instruction is retired and marked spent',
    !/Type 3kg\/DB in once/.test(fly.note) && /SPENT/.test(fly.note), fly.note.slice(0, 90));
  T('3.5kg/bell really is unbuildable either way', dbEnd(3.5, true) === null && dbEnd(3.5, false) === null);
  // Its seed already used 3 — note and seed must agree, or the note fights the engine.
  T('rear-delt fly note and seed agree on 3kg', (() => {
    const d = freshD({ location: 'partner' }); d.sessions = [];
    const sg = getSmartSugg(getProgram(1, 'partner').A.find(e => e.id === 'db_rear_fly'));
    return sg.wt === 3;
  })());
}

// ── Every partner starting load must be a buildable rung ──
// Blanket version of the above: whatever a partner lift seeds to (computed from a home peer
// or from its static fallback), the number the card shows has to exist on its ladder.
{
  const bad = [];
  for (const day of ['A', 'B', 'C']) for (const e of getProgram(1, 'partner')[day]) {
    if (!isDbLoaded(e)) continue;
    const d = freshD({ location: 'partner' });   // SEED history present → exercises the computed path
    const sg = getSmartSugg(e);
    if (sg.wt != null && !dbwOf(e).includes(sg.wt)) bad.push(`${e.id}→${sg.wt}`);
  }
  T('every partner DB suggestion lands on a real spinlock rung', bad.length === 0, bad.join(','));
}

// ── v21.3: the rep column names the unit the slot actually logs ──
// It hardcoded "Steps" for every carry and "Reps" for everything else, so the DB carry's
// header asked for steps while its own cue asked for metres, and the side plank's header
// contradicted "log SECONDS" too. Driven off the prescription string now.
{
  T('metre carries say Metres', repUnit({ rp: '40m' }) === 'Metres');
  T('step carries say Steps', repUnit({ rp: '30-40 steps' }) === 'Steps');
  T('timed holds say Secs', repUnit({ rp: '20-40s/side' }) === 'Secs');
  T('ordinary rep ranges stay Reps',
    ['5', '8-10', '8/side', '8/leg', '12-15', '4-8', '15-20', '10/side', '3-5'].every(rp => repUnit({ rp }) === 'Reps'));
  T('repUnit is total on every ACTIVE slot at both venues', (() => {
    const want = { hex_carry: 'Steps', db_carry: 'Metres', side_plank: 'Secs' };
    for (const loc of ['home', 'partner']) for (const day of ['A', 'B', 'C'])
      for (const e of getProgram(1, loc)[day]) if (repUnit(e) !== (want[e.id] || 'Reps')) return e.id + '=' + repUnit(e);
    return true;
  })() === true);
  T('repUnit degrades safely on a missing prescription', repUnit({}) === 'Reps' && repUnit(null) === 'Reps');
}

// ── v21.2: the big-overshoot trigger is rep-RELATIVE, not a flat >=4 ──
{
  // A flat count ignores what a rep is worth in load. By Epley, 2 reps over a 5-rep target
  // is ~5.7% underloaded; 2 reps over a 20-rep target is ~1.7%. The old flat 4 therefore
  // demanded 9 reps on a 5-rep slot (80% over) but 24 on a 20-rep slot (20% over) —
  // strictest exactly where each rep implies the most weight.
  const trig = tg => Math.min(4, Math.max(2, Math.ceil(tg * 0.4)));
  T('trigger loosens only for low-rep targets', trig(5) === 2 && trig(6) === 3 && trig(7) === 3);
  T('trigger is unchanged (4) for every target of 8+', [8, 10, 12, 15, 20, 25].every(tg => trig(tg) === 4));
  T('trigger never drops below 2 — one rep over is never a re-anchor', [1, 2, 3, 4, 5].every(tg => trig(tg) >= 2));

  // End-to-end on a 5-rep confirm lift: 2 reps over now re-anchors instead of creeping +0.5.
  const fp = getProgram(1, 'home').A.find(e => e.id === 'hex_dl'); // tg 5, CONFIRM lift
  d = freshD({ phase: 1, phaseStart: '2026-01-01' });
  d.sessions = [{ id: 'ot1', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home',
    ex: [{ id: 'hex_dl', wt: 55.5, reps: [7, 7, 7], band: '' }] }];
  const s2 = getSmartSugg(fp);
  T('5-rep lift 2 reps over now re-anchors (was a +0.5 creep behind a confirm brake)',
    s2.type === 'up' && s2.wt > 56, JSON.stringify(s2));
  // The confirm cap still binds: a confirm lift may not jump more than 8% in one session.
  T('confirm-lift jump stays capped at 8%', s2.wt <= 55.5 * 1.08 + 0.001, `${s2.wt}`);

  // And 1 rep over must still NOT fire — that is the ordinary top-of-range step, and it is
  // the exact shape of the real hex_dl history that prompted this change.
  d.sessions = [{ id: 'ot2', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home',
    ex: [{ id: 'hex_dl', wt: 55.5, reps: [6, 6, 6], band: '' }] }];
  const s1 = getSmartSugg(fp);
  T('5-rep lift 1 rep over does NOT re-anchor (normal step or confirm)', s1.type !== 'up' || s1.wt <= 56.5, JSON.stringify(s1));

  // A high-rep lift 3 over is below its threshold of 4 and must be unaffected by this change.
  const rf = getProgram(1, 'home').A.find(e => e.id === 'bb_rear_row'); // tg 15, Day A
  d.sessions = [{ id: 'ot3', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home',
    ex: [{ id: 'bb_rear_row', wt: 20, reps: [18, 18, 18], band: '' }] }];
  const s3 = getSmartSugg(rf);
  T('15-rep lift 3 reps over still takes the ordinary step, not a re-anchor',
    !/well over target/.test(s3.detail || ''), JSON.stringify(s3.detail));
}

// ── v21.2: the soft phase banner is dismissible for the PHASE, not the week ──
{
  // Keying dismissal to phase+week regenerated a new key every 7 days, so dismissing it
  // bought a week. Safe to silence for the whole phase: this is only the 'timer_only'
  // verdict, and the 'due' branch (timer AND stalls) is deliberately not dismissible.
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  T('phase-timer banner reads its dismissal key from the phase alone',
    /bannerDismissed\('phasetimer',String\(phi\.phase\)\)/.test(html));
  T('phase-timer dismiss button writes the same phase-only key',
    /dismissBanner\('phasetimer','\$\{phi\.phase\}'\)/.test(html));
  T("the 'due' phase banner remains non-dismissible", (() => {
    const i = html.indexOf("phi.recommend==='due'");
    const seg = html.slice(i, i + 600);
    return /Switch Phases/.test(seg) && !/dismissBanner\('phase/.test(seg);
  })());
}

// ── v21.1: the phase verdict must not depend on the location toggle ──
{
  // Same store, same history — only D.location differs. Before the fix this changed both
  // the lift pool (7 partner vs 23 home) and therefore the stall/progress counts, so a
  // block-level decision silently depended on which venue button was last tapped.
  const base = { ...structuredClone(SEED), sessions: [], phase: 1, phaseStart: '2026-06-01' };
  setD({ ...base, location: 'home' });
  const atHome = getPhaseInfo();
  setD({ ...base, location: 'partner' });
  const atPartner = getPhaseInfo();
  T('phase assessment is identical at both venues (totalEx)', atHome.totalEx === atPartner.totalEx, `${atHome.totalEx} vs ${atPartner.totalEx}`);
  T('phase assessment is identical at both venues (verdict)', atHome.recommend === atPartner.recommend, `${atHome.recommend} vs ${atPartner.recommend}`);
  T('phase assessment is identical at both venues (stalls)', atHome.stalledEx === atPartner.stalledEx);
  // It must pool BOTH programs, not just pick one — the union is strictly larger than either.
  const homeOnly = new Set(); for (const day of ['A','B','C']) for (const ex of getProgram(1,'home')[day]) homeOnly.add(ex.id);
  T('the pool spans both venues, not just the active one', atHome.totalEx > 0 && atHome.totalEx >= [...homeOnly].filter(id => {
    const e = getProgram(1,'home').A.concat(getProgram(1,'home').B, getProgram(1,'home').C).find(x => x.id === id);
    return e && !['bw','carry','club','mace'].includes(e.tp);
  }).length, `${atHome.totalEx}`);
}

// ── v24: home periodization realigned with the program ──
const PA = global.__X.PHASE_ADJ_IDS;
// Regression guard: every phase-adjust id must belong to an ACTIVE program at some
// location. A "dead" entry (pointing at a swapped-out lift) silently never fires and
// is how lm_lateral/lm_pallof lost their periodization in the landmine swap.
const activeProgIds = new Set();
// A/B/C is the whole program again since v20 — the off-rotation day X is gone and its
// movements (lm_pallof included) are back on the lifting days.
for (const loc of ['home', 'partner']) for (const day of ['A', 'B', 'C']) for (const ex of getProgram(1, loc)[day]) activeProgIds.add(ex.id);
T('no dead PHASE_ADJ entries (all map to an active lift)', [...PA].every(id => activeProgIds.has(id)), [...PA].filter(id => !activeProgIds.has(id)).join(','));
// Landmine swap periodization restored on the current ids.
T('lm_lateral periodizes (restored from lateral_raise)', PA.has('lm_lateral'));
T('lm_pallof periodizes (restored from pallof_press, back on Day C since v20)', PA.has('lm_pallof'));
// Swapped-out ids are gone from the adj map.
T('dead adj ids removed', !PA.has('deadlift') && !PA.has('lateral_raise') && !PA.has('pallof_press') && !PA.has('bb_row') && !PA.has('zercher_b'));
// Loaded accessories now periodize like their partner counterparts.
T('bb_curl periodizes (accessory parity with db_curl)', PA.has('bb_curl') && PA.has('bb_rear_row') && PA.has('bb_skullcr') && PA.has('hex_floor_press') && PA.has('lm_lateral_squat'));
T('oh_triceps_ext adj entry retired with the v18 swap-back', !PA.has('oh_triceps_ext'));
// lm_lateral actually re-anchors lighter into Hypertrophy (proves the swap-id wiring works).
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [{ id: 'll1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'lm_lateral', wt: 16, reps: [8, 8, 8, 8], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').A.find(e => e.id === 'lm_lateral'));
T('lm_lateral re-anchors on phase change', sg.type === 'new' && sg.wt < 16, JSON.stringify(sg));

// ── weekly muscle volume: location-agnostic ──
d = freshD();
const t = today();
d.sessions = [{ id: 'y1', date: t, day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 26, reps: [10, 10, 10], band: '' }] },
              { id: 'y2', date: t, day: 'A', loc: 'partner', ex: [{ id: 'db_floor_press', wt: 10, reps: [10, 10, 10], band: '' }] }];
T('muscle volume counts both locations', getWeeklyVolume(10).chest === 6);

// ── recentPRs: first session is a baseline, not a PR ──
d = freshD();
d.sessions = [{ id: 'r1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] }];
T('debut session is not a PR', recentPRs(null).filter(p => p.nm === 'Deadlift').length === 0);
d.sessions.push({ id: 'r2', date: '2026-06-03', day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 65, reps: [5, 5, 5], band: '' }] });
T('genuine increase is a PR', recentPRs(null).some(p => p.nm === 'Deadlift' && p.type === 'weight' && p.val === 65));

// ── getPRs uses e1rm() consistently (no inflated single) ──
d = freshD();
d.sessions = [{ id: 'g1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 100, reps: [1], band: '' }] }];
T('getPRs e1rm single = weight (not ×1.033)', getPRs('deadlift').bestE1RM === 100);

// ── checkPR awards an e1RM PR for more reps at the same load (not just weight/volume) ──
d = freshD();
d.sessions = [{ id: 'pr1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 50, reps: [5, 5, 5], band: '' }] }];
T('more reps at same load → e1RM PR badge', checkPR('ohp', 50, [8, 8, 8]).includes('E1RM'));
T('heavier load → WT badge, not double-counted as e1RM', checkPR('ohp', 55, [5, 5, 5]).includes('WT') && !checkPR('ohp', 55, [5, 5, 5]).includes('E1RM'));

// ── migrateData recomputes stored volume ──
let dd = { sessions: [{ id: 'm1', date: '2026-06-01', day: 'C', loc: 'home', volume: 99999, ex: [{ id: 'cossack_squat', wt: 21, reps: [8, 8, 8], band: '' }, { id: 'suitcase_march', wt: 32, reps: [40, 40, 40], band: '' }] }] };
migrateData(dd);
T('migrate recomputes volume (perSide×2, carry excluded)', dd.sessions[0].volume === 21 * 2 * 24, dd.sessions[0].volume);

// ── week bucketing: zero-fill gaps + partial-week flag ──
const wk = off => ymd(new Date(Date.now() - off * 864e5));
d = freshD();
d.sessions = [
  { id: 'w1', date: wk(28), day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] },
  { id: 'w2', date: wk(0), day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] }];
const series = weeklySeries(10);
T('weekly series is continuous (4-week gap present)', series.length >= 4, series.length);
T('gap weeks appear as zeros, not skipped', series.some(w => w.vol === 0));
T('current week flagged partial', series[series.length - 1].partial === true);
T('muscleWeekly zero-fills too', muscleWeekly('hams', 8).some(w => w.v === 0));

// ── e1RM slope + momentum ──
d = freshD();
d.sessions = [[21, 40], [14, 42], [7, 44], [0, 46]].map(([off, w], i) =>
  ({ id: 'e' + i, date: wk(off), day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: w, reps: [5, 5, 5], band: '' }] }));
const sl = e1rmSlope('ohp', 56);
// +2kg/wk on the bar ≈ +2.33kg/wk e1RM at 5 reps (×7/6)
T('e1rmSlope fits rising loads', sl && sl.slope > 2 && sl.slope < 2.7, JSON.stringify(sl));
T('e1rmSlope null with no data', e1rmSlope('deadlift', 56) === null);
T('momentum board ranks ohp as rising', strengthMomentum().some(m => m.id === 'ohp' && m.slope > 0));
T('exStats trend is e1RM-based and positive', exStats('ohp').trend > 15, exStats('ohp').trend);

// ── relative strength (needs bodyweight) ──
T('relStrength null without bodyweight', relStrength() === null);
d.bodyLog = [{ date: wk(3), weight: 80 }];
const rs = relStrength();
T('relStrength = best 60d e1RM ÷ BW', rs && rs.bw === 80 && rs.lifts.some(l => l.lbl === 'OHP' && l.ratio > 0.6 && l.ratio < 0.72), JSON.stringify(rs));
// Tier-ladder bar: fill = (band + within-band progress)/5 — one shared scale.
T('relStrength ladderPct well-formed', rs.lifts.every(l =>
  l.ladderPct >= 2 && l.ladderPct <= 100), JSON.stringify(rs.lifts));
{ // OHP at ratio ~0.66 with thresholds [0.5,0.7,0.9,1.1] → Novice band, ~80% through:
  // ladderPct = (1 + (r-0.5)/0.2)/5 — e.g. r=0.66 → 36%.
  const o = rs.lifts.find(l => l.lbl === 'OHP');
  const expect = Math.round((o.tierIdx + Math.min(1, (o.ratio - 0.5) / 0.2)) / 5 * 100);
  T('relStrength ladderPct = band index + within-band progress', o && o.ladderPct === expect, JSON.stringify(o));
  T('relStrength ladder band matches the tier chip', o && o.tier === 'Novice' && o.ladderPct > 20 && o.ladderPct <= 40, JSON.stringify(o));
}

// ── core muscle group now tracked ──
d = freshD();
d.sessions = [{ id: 'c1', date: today(), day: 'X', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 8, reps: [8, 8, 8], band: '' }] }];
T('core volume visible to balance dashboard', getWeeklyVolume(10).core === 3, JSON.stringify(getWeeklyVolume(10)));

// ── e1RM blend: Epley low reps, Lombardi cap past the ≈7-rep crossover ──
T('e1rm 12 reps uses Lombardi (conservative)', e1rm(60, 12) === Math.round(60 * Math.pow(12, 0.1) * 10) / 10, e1rm(60, 12));
T('e1rm 12 reps below old Epley value', e1rm(60, 12) < 84);
T('e1rmF continuous at 1 rep', e1rmF(1) === 1);
T('e1rmF monotonic', e1rmF(5) < e1rmF(8) && e1rmF(8) < e1rmF(12) && e1rmF(12) < e1rmF(20));

// ── calendar-week streak ──
d = freshD();
d.sessions = [21, 14, 7].map((off, i) => ({ id: 'st' + i, date: wk(off), day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] }));
T('streak counts calendar weeks with current-week grace', statSnapshot().streak === 3, statSnapshot().streak);
d.sessions.push({ id: 'st3', date: today(), day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] });
T('current-week session extends streak', statSnapshot().streak === 4, statSnapshot().streak);
d.sessions = [{ id: 'st4', date: wk(21), day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 60, reps: [5, 5, 5], band: '' }] }];
T('gap breaks streak', statSnapshot().streak === 0, statSnapshot().streak);

// ── import schema guard ──
T('rejects non-object session', validSession('junk') === null);
T('rejects bad date', validSession({ id: 'x', date: 'tuesday', ex: [] }) === null);
T('rejects missing ex array', validSession({ id: 'x', date: '2026-06-01' }) === null);
const vs = validSession({ id: 7, date: '2026-06-01', ex: [{ id: 'deadlift', wt: '60', reps: ['5', 'x', 5] }, { bad: true }, null] });
T('coerces id/wt/reps and drops bad ex entries', vs && vs.id === '7' && vs.ex.length === 1 && vs.ex[0].wt === 60 && JSON.stringify(vs.ex[0].reps) === '[5,0,5]', JSON.stringify(vs));
// band is interpolated into markup at several render sites — must be coerced to a string.
const vb = validSession({ id: 'b', date: '2026-06-01', ex: [{ id: 'pullup_a', wt: null, reps: [5], band: { evil: '<img onerror=x>' } }, { id: 'dips', wt: null, reps: [5], band: 'Green' }] });
T('non-string band coerced to empty, string band kept', vb.ex[0].band === '' && vb.ex[1].band === 'Green', JSON.stringify(vb.ex.map(e => e.band)));

// ── reset gives a clean empty slate, not the bundled demo SEED ──
const empty = freshState();
T('reset (freshState) yields an empty program, not demo data', empty.sessions.length === 0 && empty.phase === 1 && empty.location === 'home' && Array.isArray(empty.bodyLog) && empty.bodyLog.length === 0 && !!empty.notify);

// ── resume program-drift guard ──
d = freshD();
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } };
const dayAIds = getProgram(1, 'home').A.map(e => e.id);
const aw = { day: 'A', log: {}, start: Date.now(), cidx: 0, ts: Date.now(), loc: 'home', phase: 1, exIds: dayAIds };
store[global.__X.AW_KEY] = JSON.stringify(aw);
T('resume accepted when program matches', checkResume() !== null);
store[global.__X.AW_KEY] = JSON.stringify({ ...aw, exIds: ['ghost_exercise', ...dayAIds.slice(1)] });
T('resume rejected when program drifted', checkResume() === null);

// ── fatigue: moderate cardio sits between easy and hard ──
d = freshD();
d.sessions = []; d.cardioLog = [{ id: 'cf1', date: today(), type: 'Rowing', duration: 40, intensity: 'moderate' }];
const fMod = getFatigue().score;
d.cardioLog[0].intensity = 'easy'; const fEasy = getFatigue().score;
d.cardioLog[0].intensity = 'hard'; const fHard = getFatigue().score;
T('moderate cardio between easy and hard', fEasy < fMod && fMod < fHard, JSON.stringify({ fEasy, fMod, fHard }));

// ── fatigue calibration: the app's own target cadence must read mid-scale, not red ──
// 3 sessions/wk at RPE 3 with ~2.9t each is exactly the dashed 3×/week chart target;
// the old weights scored it 8.7/10 "Fatigued" — permanently red for normal training.
const fatSess = (off, diff, wt, reps) => ({ id: 'fg' + off, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', difficulty: diff, ex: [{ id: 'deadlift', wt, reps, band: '' }] });
d = freshD();
d.sessions = [fatSess(1, 3, 64, [15, 15, 15]), fatSess(3, 3, 64, [15, 15, 15]), fatSess(5, 3, 64, [15, 15, 15])]; d.cardioLog = [];
let fat = getFatigue();
T('target cadence (3×/wk RPE3) reads mid-scale, not Fatigued', fat.label !== 'Fatigued' && fat.score >= 3.5 && fat.score <= 6.5, JSON.stringify(fat));
d.sessions = [0, 1, 2, 3, 4].map(off => fatSess(off, off % 2 ? 4 : 5, 70, [17, 17, 16]));
fat = getFatigue();
T('a genuinely heavy week (5 hard sessions) still reads Fatigued', fat.label === 'Fatigued' && fat.score >= 7, JSON.stringify(fat));
d.sessions = [fatSess(5, 2, 40, [10, 10, 10])];
fat = getFatigue();
T('one light session reads Fresh/Ready', fat.score <= 5, JSON.stringify(fat));

// ── audit fix: cardio must not count as a full lifting session ──
// getFatigue pushed cardio entries into the same `scores` array as lifts, so each one added a
// whole session to the frequency term — and easy cardio (diff 2) simultaneously dragged the
// effort term DOWN. A walking week with no lifting at all read as "Ready", and four walks
// pushed a normal lifting week from Ready into Building.
{
  const walk = (off, intensity = 'easy', duration = 30) => ({ id: 'cw' + off + intensity, date: ymd(new Date(Date.now() - off * 864e5)), type: 'Walking', duration, intensity });
  const liftWk = () => [fatSess(1, 3, 64, [15, 15, 15]), fatSess(3, 3, 64, [15, 15, 15]), fatSess(5, 3, 64, [15, 15, 15])];

  // Anchor first: the calibration the comment in getFatigue documents must not drift.
  d = freshD(); d.sessions = liftWk(); d.cardioLog = [];
  const anchor = getFatigue();
  T('calibration anchor: 3 lifts @RPE3 reads Ready', anchor.label === 'Ready' && anchor.score >= 3.5 && anchor.score <= 5, JSON.stringify(anchor));

  // Walking only, no lifting: this is not a fatigued athlete.
  d = freshD(); d.sessions = []; d.cardioLog = [1, 2, 3, 4, 5, 6, 7].map(o => walk(o));
  const walkOnly = getFatigue();
  T('a week of easy walks with no lifting reads Fresh', walkOnly.label === 'Fresh', JSON.stringify(walkOnly));

  // Easy cardio alongside normal lifting must not change the verdict.
  d = freshD(); d.sessions = liftWk(); d.cardioLog = [2, 4, 6, 7].map(o => walk(o));
  const withWalks = getFatigue();
  // Bounded increase, deliberately NOT label-equality: 4 easy walks moving 4.9 → 5.1 crosses
  // the Ready/Building line, but that is a threshold artifact of a 4% change, not cardio
  // dominating the score. Asserting the label would over-fit this test to where the boundary
  // happens to sit. What matters is that walks nudge the meter instead of driving it — before
  // this fix the same four walks added a full 1.6.
  T('easy walks nudge the score rather than driving it', withWalks.score - anchor.score <= 0.5, JSON.stringify({ a: anchor.score, w: withWalks.score }));
  // Monotonicity: logging MORE activity must never make the meter read less fatigued. Both
  // non-frequency terms broke this — a plain effort mean let easy walks pull the average from
  // 3.0 toward 2.0, and dividing volume by the raw entry count let four walks shrink the
  // per-session volume term. Either alone made the identical lifting week score LOWER.
  T('adding activity never lowers the fatigue score', withWalks.score >= anchor.score, JSON.stringify({ a: anchor.score, w: withWalks.score }));

  // Guard the other direction: hard conditioning IS real systemic fatigue.
  d = freshD(); d.sessions = liftWk(); d.cardioLog = [0, 2, 4].map(o => walk(o, 'hard', 45));
  const withHard = getFatigue();
  T('hard cardio still registers as added fatigue', withHard.score > anchor.score, JSON.stringify({ a: anchor.score, h: withHard.score }));
  d.cardioLog = [0, 2, 4].map(o => walk(o, 'easy', 45));
  const withEasy = getFatigue();
  T('hard cardio outweighs the same count of easy sessions', withHard.score > withEasy.score, JSON.stringify({ hard: withHard.score, easy: withEasy.score }));

  // ── Audit 6 / F2: monotonicity, tested as a PROPERTY rather than at one point ──
  // The single "adding activity never lowers the fatigue score" case above happened to be a
  // state where the old load-weighted means held. They did not hold in general — any mean is
  // non-monotone, because the added entry lands in the numerator AND the denominator. The
  // worst measured case was a whole extra LIFTING session: one brutal session read 8.6
  // Fatigued and adding an easy light one dropped it to 4.9 Ready.
  {
    const one = (rpe, vol) => ({ rpe, vol });
    const mkState = (sess, card) => {
      const s = freshD(); s.sessions = []; s.cardioLog = [];
      sess.forEach((x, i) => s.sessions.push({ id: 'mf' + i, date: ymd(new Date(Date.now() - (i % 7) * 864e5)), day: 'A', loc: 'home', difficulty: x.rpe, ex: [{ id: 'deadlift', wt: x.vol / 15, reps: [5, 5, 5], band: '' }] }));
      card.forEach((c, i) => s.cardioLog.push({ id: 'mc' + i, date: ymd(new Date(Date.now() - (i % 7) * 864e5)), type: 'Walking', duration: c.min, intensity: c.int }));
      return getFatigue().score;
    };
    // The headline regression, pinned exactly.
    const brutal = [one(5, 10000)];
    T('one brutal session reads Fatigued', mkState(brutal, []) >= 8, mkState(brutal, []));
    T('adding an easy LIFTING session cannot lower the meter', mkState([...brutal, one(1, 1000)], []) >= mkState(brutal, []),
      JSON.stringify({ before: mkState(brutal, []), after: mkState([...brutal, one(1, 1000)], []) }));
    // Deterministic sweep: every week shape × every added entry. 0 violations required.
    const SESS = [[], [one(5, 8000)], [one(3, 3000), one(5, 9000)], [one(4, 5000), one(2, 1500), one(5, 7000)],
      [one(3, 2500), one(3, 2500), one(3, 2500), one(4, 6000)]];
    const CARD = [[], [{ min: 30, int: 'easy' }], [{ min: 45, int: 'hard' }, { min: 20, int: 'easy' }]];
    const ADD_S = [one(1, 500), one(2, 1500), one(3, 3000), one(5, 12000)];
    const ADD_C = [{ min: 10, int: 'easy' }, { min: 30, int: 'moderate' }, { min: 60, int: 'hard' }];
    let drops = 0, checked = 0;
    for (const s of SESS) for (const c of CARD) {
      const base = mkState(s, c);
      for (const a of ADD_S) { checked++; if (mkState([...s, a], c) < base) drops++; }
      for (const a of ADD_C) { checked++; if (mkState(s, [...c, a]) < base) drops++; }
    }
    T('fatigue score is monotone: no addition of work ever lowers it', drops === 0, `${drops}/${checked} additions lowered the score`);
    T('the monotonicity sweep actually ran', checked === 105, checked);

    // Calibration must survive the reformulation — these are the three anchors the source
    // comment names, and a uniform week is exactly where peak == mean.
    T('anchor holds: 3×RPE3 ~2.9t reads Ready ≈5', (() => { const v = mkState([one(3, 2880), one(3, 2880), one(3, 2880)], []); return v >= 4.5 && v <= 5.2 })(), mkState([one(3, 2880), one(3, 2880), one(3, 2880)], []));
    T('anchor holds: 5 hard sessions read Fatigued ≥8', mkState([one(5, 4000), one(4, 4000), one(5, 4000), one(4, 4000), one(5, 4000)], []) >= 8);
    T('anchor holds: one light session reads Fresh ≈2', mkState([one(2, 2000)], []) <= 2.5, mkState([one(2, 2000)], []));
    T('a week of easy walks alone still reads Fresh', mkState([], [1, 2, 3, 4, 5, 6, 7].map(() => ({ min: 30, int: 'easy' }))) <= 3);
  }
}

// ── AUDIT FIX M2: phase re-anchor never inflates heavier than the proven load ──
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
// A strong over-target AMRAP in the old phase must NOT re-anchor heavier into the new phase.
d.sessions = [{ id: 'ra1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 40, reps: [15, 15, 15], band: '' }] }];
let raSg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('strong AMRAP does not re-anchor heavier on phase change', raSg.type !== 'new' || raSg.wt <= 40, JSON.stringify(raSg));
// A sub-target prior session still re-anchors lighter (documented intent intact).
d.sessions = [{ id: 'ra2', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 40, reps: [5, 5, 5], band: '' }] }];
raSg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('sub-target prior session still re-anchors lighter', raSg.type === 'new' && raSg.wt < 40, JSON.stringify(raSg));

// ── AUDIT FIX M3: confirm brake re-arms on re-approach after a deload ──
d = freshD();
d.sessions = [
  { id: 'cf1', date: '2026-05-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] },
  { id: 'cf2', date: '2026-05-03', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] },
  { id: 'cf3', date: '2026-05-10', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] },
  { id: 'cf4', date: '2026-05-20', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] }];
T('confirm brake re-arms when re-approaching a previously-confirmed weight', getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl')).type === 'cf');
d.sessions.push({ id: 'cf5', date: '2026-05-22', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] });
T('two consecutive confirms then advance', getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl')).type === 'up');

// ── AUDIT FIX M4: float-dust weights bucket as the same load ──
d = freshD();
d.sessions = [
  { id: 'fd1', date: '2026-05-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47.0000001, reps: [5, 5, 5], band: '' }] },
  { id: 'fd2', date: '2026-05-03', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] }];
T('float-dust weights bucket together (47.0000001 ≡ 47 → confirmed, advances)', getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl')).type === 'up');
// Float-dust must NOT fire a phantom "weight dropped" advisory (regress uses wEq now).
d = freshD();
d.sessions = [
  { id: 'rg1', date: '2026-05-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47.0000001, reps: [5, 5, 5], band: '' }] },
  { id: 'rg2', date: '2026-05-03', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [5, 5, 5], band: '' }] }];
T('float-dust does not trigger a phantom "weight dropped" advisory', !/Weight dropped/.test(getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl')).regress || ''));

// ── AUDIT FIX C1 follow-up: a floor-stall still registers for phase reassessment ──
// The new 'stay' rebuild carries stalled:true, so getPhaseInfo's stall counter is unchanged.
d = freshD({ phaseStart: '2026-01-01' });
d.sessions = [];
// lm_pallof (Day C) and lm_lateral (Day A/B) both seed at the 11kg bar-only floor.
for (const id of ['lm_pallof', 'lm_lateral']) for (let i = 1; i <= 3; i++)
  d.sessions.push({ id: id + i, date: '2026-06-0' + i, day: 'C', loc: 'home', ex: [{ id, wt: 11, reps: [3, 3, 3], band: '', form: [5, 5, 5] }] });
const pi = getPhaseInfo();
T('two floor-stalled lifts still count toward phase reassessment', pi.stalledEx >= 2 && pi.stallDue === true, JSON.stringify({ stalledEx: pi.stalledEx, stallDue: pi.stallDue }));

// ═══════════ AUDIT ROUND 2 — regression tests for the comprehensive-audit fixes ═══════════

// ── R2: phase re-anchor uses PURE Epley on both sides (no curve mixing) ──
// ohp 41kg×5 (phase-1 tg 7) → phase-2 tg 10: 41 × (1+5/30)/(1+10/30) = 35.875 → snaps to 36.
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [{ id: 'ep1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [5, 5, 5], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('re-anchor drop matches pure Epley (~12.5%, not ~3%)', sg.type === 'new' && sg.wt === 36, JSON.stringify(sg));

// ── R2: re-anchor gate reads the session phase STAMP when present ──
// Same-day phase switch: session dated ON phaseStart but stamped phase 2 = already in-phase.
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [{ id: 'ps1', date: '2026-06-09', day: 'B', loc: 'home', phase: 2, ex: [{ id: 'ohp', wt: 36, reps: [8, 8, 8], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('phase-stamped in-phase session does not re-anchor', sg.type !== 'new', JSON.stringify(sg));
d.sessions = [{ id: 'ps2', date: '2026-06-09', day: 'B', loc: 'home', phase: 1, ex: [{ id: 'ohp', wt: 41, reps: [5, 5, 5], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('phase-stamped OLD-phase session re-anchors even dated on phaseStart', sg.type === 'new' && sg.wt < 41, JSON.stringify(sg));

// ── R2: re-anchor uses the BEST recent session at the weight, not one bad final day ──
d = freshD({ phase: 2, phaseStart: '2026-06-09' });
d.sessions = [
  { id: 'ba1', date: '2026-05-28', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [5, 5, 5], band: '' }] },
  { id: 'ba2', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [2, 2, 2], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'home').B.find(e => e.id === 'ohp'));
T('re-anchor anchors off the proven 5s, not the bad 2s (36, not 31)', sg.type === 'new' && sg.wt === 36, JSON.stringify(sg));

// ── R2: stall counter is CONSECUTIVE — an old failure followed by clean sessions is history ──
d = freshD();
d.sessions = [
  { id: 'cs1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [3, 3, 3], band: '' }] },
  { id: 'cs2', date: '2026-06-03', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [6, 6, 6], band: '' }] },
  { id: 'cs3', date: '2026-06-05', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [3, 3, 3], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('non-consecutive failures do not accumulate to a deload', sg.type === 'stay' && !/cluster/i.test(sg.text), JSON.stringify(sg.text));

// ── R2: cross-day set counts — a clean 3/3 session reads as a hit on a 4-set day ──
// v21: db_lateral is 3 sets on every partner day now (the split collapsed to one shared
// base), so the 4-set prescription is built explicitly rather than read off a Day-A slot.
d = freshD({ location: 'partner' });
d.sessions = [{ id: 'xd1', date: '2026-06-08', day: 'B', loc: 'partner', ex: [{ id: 'db_lateral', wt: 5, reps: [15, 15, 15], band: '' }] }];
sg = getSmartSugg({ ...getProgram(1, 'partner').A.find(e => e.id === 'db_lateral'), s: 4 });
T('clean 3-set session counts as a hit on a 4-set prescription', sg.type === 'up', JSON.stringify(sg));

// ── R2: big overshoot beats the confirm brake (hex_dl note behaviour) ──
d = freshD();
d.sessions = [{ id: 'ov1', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 47, reps: [10, 10, 10], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl'));
T('4+ rep overshoot on a confirm lift jumps instead of confirming', sg.type === 'up' && sg.wt > 47, JSON.stringify(sg));
T('confirm-lift overshoot jump capped at ~+8% (± one ladder rung)', sg.wt <= 47 * 1.08 + 0.5, JSON.stringify(sg));

// ── R2: band branch — 'None' band is already unassisted; stalls now flagged ──
d = freshD();
d.sessions = [{ id: 'bn1', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'pullup_a', wt: null, reps: [8, 8, 8, 8], band: 'None' }] }];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'pullup_a'));
T("hitting target at band 'None' suggests load/reps, not 'try unassisted'", sg.type === 'up' && /Unassisted/.test(sg.text), sg.text);
d.sessions = [1, 2, 3].map(i => ({ id: 'bs' + i, date: '2026-06-0' + i, day: 'A', loc: 'home', ex: [{ id: 'pullup_a', wt: null, reps: [2, 2, 2, 2], band: 'Green' }] }));
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'pullup_a'));
T('3 below-min band sessions set the stalled flag (visible to phase/deload)', sg.stalled === true, JSON.stringify(sg));

// ── R2: discomfort gate — one session flagging TWO joints is ONE session, not two ──
d = freshD();
d.sessions = [
  { id: 'dj0', date: '2026-06-06', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [7, 7, 7, 7], band: '' }] },
  { id: 'dj1', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [7, 7, 7, 7], band: '' }] }];
const t8 = ymd(new Date());
d.discomfort = [{ date: t8, exId: 'ohp', level: 'moderate', joint: 'Shoulder' }, { date: t8, exId: 'ohp', level: 'moderate', joint: 'Elbow' }];
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('two joints in one session do not trip the repeated-discomfort hold', !/hold\)/.test(sg.text), JSON.stringify(sg.text));
// A months-old flag is outside the 30-day window entirely.
d.discomfort = [{ date: '2026-01-05', exId: 'ohp', level: 'moderate', joint: 'Shoulder' }, { date: '2026-01-08', exId: 'ohp', level: 'moderate', joint: 'Shoulder' }];
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('months-old discomfort no longer warns or holds', !sg.regress && sg.type === 'up', JSON.stringify(sg));

// ── R2: carries mint no e1RM PRs (steps are not reps) ──
d = freshD();
d.sessions = [{ id: 'ce1', date: '2026-06-08', day: 'C', loc: 'home', ex: [{ id: 'hex_carry', wt: 40, reps: [40, 40, 40], band: '' }] }];
T('carry bestE1RM is zero', getPRs('hex_carry').bestE1RM === 0, JSON.stringify(getPRs('hex_carry')));
T('carry checkPR never includes E1RM', !checkPR('hex_carry', 45, [40, 40, 40]).includes('E1RM'));
T('carry produces no e1RM rows in recentPRs', !recentPRs(null).some(p => p.nm === "Hex Bar Farmer's Carry" && p.type === 'e1rm'));

// ── R2: fatigue calibration — a normal training week is NOT red-lined ──
d = freshD();
d.sessions = [0, 2, 4].map((off, i) => ({ id: 'fc' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'ABC'[i], loc: 'home', difficulty: 3, ex: [{ id: 'ohp', wt: 31, reps: [7, 7, 7, 7], band: '' }] }));
d.sessions.forEach(s => s.volume = 3000);
const fN = getFatigue();
T('3 sessions @RPE3 reads mid-scale, not Fatigued', fN.score <= 7 && fN.label !== 'Fatigued', JSON.stringify(fN));

// ── R2: warm-up rungs use no micro plates (coarse ladder) ──
const wuC = warmupSets(43, 7); // bar=7 routes to the coarse hex ladder internally
T('hex warm-up rungs need no micro plates', wuC.every(s => { const ps = perSide(s.wt, 7) || []; return ps.every(p => p.w >= 1); }), JSON.stringify(wuC));

// ── R2: deload-week sessions are excluded from progression memory ──
d = freshD();
const dlToday = ymd(new Date());
d.lastDeload = dlToday;
d.sessions = [
  { id: 'dw1', date: ymd(new Date(Date.now() - 10 * 864e5)), day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [7, 7, 7, 7], band: '' }] },
  { id: 'dw2', date: dlToday, day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 36, reps: [7, 7, 7, 7], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('suggestion anchors on the pre-deload 41kg, not the deload 36kg', sg.wt == null || sg.wt >= 41, JSON.stringify(sg));
T('deload-week advisory is surfaced', /Deload week/i.test(sg.regress || ''), JSON.stringify(sg.regress));

// ── R2: getPhaseInfo timer fires AFTER the phase length, not a week early ──
d = freshD({ phaseStart: ymd(new Date(Date.now() - 50 * 864e5)) }); // day 50 → week 8 of 8
d.sessions = [];
T('week 8 of an 8-week phase is not yet timer-due', getPhaseInfo().timerDue === false, getPhaseInfo().wk);
d.phaseStart = ymd(new Date(Date.now() - 57 * 864e5)); // day 57 → week 9
T('week 9 is timer-due', getPhaseInfo().timerDue === true, getPhaseInfo().wk);

// ── R2: resume blob now carries session notes + warm-up checks ──
{
  const store2 = {};
  global.localStorage = { getItem: k => store2[k] ?? null, setItem: (k, v) => { store2[k] = v }, removeItem: k => { delete store2[k] } };
  d = freshD();
  global.__X.setAW && global.__X.setAW(); // no-op guard if helper absent
  // saveAW reads module globals — drive it via the exported hooks instead:
  T('saveAW payload includes notes+wu fields (source check)', /notes:SNOTES,wu:WU_CHECKS/.test(String(saveAW)), String(saveAW).slice(0, 200));
}

// ── Ultra audit C1: export→clear→import ROUND-TRIP PROOF ──
// Build a rich state exactly as the app holds it, stringify it exactly as expD
// exports it, merge into a fresh (post-reset) state exactly as impD imports it,
// and assert every training-data field survives identically. Device-local fields
// (notify, dismissed, lastBackup*) are deliberately not adopted — see mergeImport.
{
  const deepEq = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b || a == null || b == null) return false;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEq(v, b[i]));
    if (typeof a === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => deepEq(a[k], b[k])); }
    return false;
  };
  const mk = (id, date, day, loc, ex, extra) => {
    const s = { id, date, day, loc, ex, ...extra };
    s.volume = ex.reduce((t, e) => t + calcExVol(e.id, e.wt, e.reps), 0);
    return s;
  };
  const fix = freshState();
  fix.sessions = [
    mk('rt1', '2026-05-01', 'A', 'home', [
      { id: 'hex_dl', wt: 61, reps: [5, 5, 5], band: '', notes: 'strap cue', form: [5, 5, 4] },
      { id: 'b_stance_rdl', wt: 31, reps: [8, 8, 8], band: '', notes: '' },
      { id: 'pullup_a', wt: null, reps: [6, 5, 5, 4], band: 'Green', notes: '' }],
      { difficulty: 3, duration: 75, warmup: true, notes: 'good session', phase: 1 }),
    mk('rt2', '2026-05-03', 'B', 'home', [
      { id: 'ohp', wt: 26, reps: [7, 6, 6, 5], band: '', notes: '' },
      { id: 'lm_lateral', wt: 12.25, reps: [14, 13, 12, 12], band: '', notes: '' }],
      { difficulty: 4, duration: 80, warmup: false, phase: 1, customFlag: 'survives-roundtrip' }),
    mk('rt3', '2026-05-05', 'C', 'partner', [
      { id: 'db_sl_rdl', wt: 12, reps: [8, 8, 8, 8], band: '', notes: '' },
      { id: 'db_calf_raise', wt: 14, reps: [18, 16, 15], band: '', notes: '' }],
      { difficulty: 2, duration: 60, warmup: true, phase: 2, noProg: true })];
  fix.bodyLog = [{ date: '2026-05-01', weight: 82.5, waist: 88 }, { date: '2026-05-08', weight: 82.1 }];
  fix.cardioLog = [{ id: 'c2026-05-02', date: '2026-05-02', type: 'Walk', duration: 30, intensity: 'easy' }];
  fix.discomfort = [{ date: '2026-05-03', exId: 'ohp', level: 'mild', joint: 'Shoulder' }];
  fix.cues = { hex_dl: 'push the floor away' };
  fix.lastDeload = '2026-04-20';
  fix.phase = 2; fix.phaseStart = '2026-04-28'; fix.location = 'partner';
  fix.nextDay = 'B'; // manual rotation override — differs from the C→A re-derive on purpose
  const exported = JSON.stringify(fix, null, 2); // byte-for-byte what expD writes
  const rt = mergeImport(freshState(), JSON.parse(exported));
  T('round-trip: all sessions restored, none skipped', rt.added === 3 && rt.replaced === 0 && rt.skipped === 0, `a${rt.added} r${rt.replaced} s${rt.skipped}`);
  T('round-trip: sessions field-for-field identical', deepEq(rt.W.sessions, fix.sessions), JSON.stringify(rt.W.sessions).slice(0, 300));
  T('round-trip: bodyLog identical', deepEq(rt.W.bodyLog, fix.bodyLog));
  T('round-trip: cardioLog identical', deepEq(rt.W.cardioLog, fix.cardioLog));
  T('round-trip: discomfort identical', deepEq(rt.W.discomfort, fix.discomfort));
  T('round-trip: cues identical', deepEq(rt.W.cues, fix.cues));
  T('round-trip: lastDeload restored', rt.W.lastDeload === '2026-04-20');
  T('round-trip: phase/phaseStart/location adopted on fresh device', rt.W.phase === 2 && rt.W.phaseStart === '2026-04-28' && rt.W.location === 'partner');
  T('round-trip: backup nextDay override adopted on fresh device', rt.W.nextDay === 'B');
  T('round-trip: unknown session fields survive the import guard', rt.W.sessions[1].customFlag === 'survives-roundtrip');
  T('round-trip: merged state carries no seeded flag', rt.W.seeded === undefined);

  // Merge into an EXISTING store: id collisions replace, logs are additive, metadata kept.
  const cur = freshState();
  cur.sessions = [mk('rt1', '2026-05-01', 'A', 'home', [{ id: 'hex_dl', wt: 56, reps: [5, 5, 4], band: '', notes: '' }], { phase: 1 })];
  cur.phase = 1; cur.location = 'home'; cur.bodyLog = [{ date: '2026-04-01', weight: 83 }];
  const m2 = mergeImport(cur, JSON.parse(exported));
  T('merge-existing: collision replaces, rest added', m2.replaced === 1 && m2.added === 2, `a${m2.added} r${m2.replaced}`);
  T('merge-existing: replaced session takes the imported version', m2.W.sessions.find(s => s.id === 'rt1').ex[0].wt === 61);
  T('merge-existing: bodyLog additive by date', m2.W.bodyLog.length === 3);
  T('merge-existing: phase/location NOT adopted onto a non-fresh device', m2.W.phase === 1 && m2.W.location === 'home');
  T('merge-existing: nextDay re-derived, backup override ignored on non-fresh device', m2.W.nextDay === 'A');
  // lastDeload is global metadata like the phase clock, so it follows the same wasFresh rule.
  // It used to be adopted unconditionally, which broke two ways on a device with history.
  T('merge-existing: lastDeload NOT adopted onto a non-fresh device', m2.W.lastDeload === null, String(m2.W.lastDeload));
  {
    // ── Audit 6 / F4: an explicit import may LIFT a tombstone ──
    // mergeStores treats D.deleted as authoritative, so a restored session would be re-deleted
    // by the next cross-tab merge unless the import clears its tombstone. An import is an
    // explicit, reported act — unlike the silent union — so restoring is the right outcome.
    const back = JSON.parse(exported);
    const withTomb = { ...freshState(), sessions: [mk('keep', '2026-05-02', 'A', 'home', [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '', notes: '' }])], deleted: [back.sessions[0].id, 'unrelated'] };
    const lifted = mergeImport(withTomb, back).W;
    T('import: a restored session is not left tombstoned', !lifted.deleted.includes(back.sessions[0].id), JSON.stringify(lifted.deleted));
    T('import: the restored session actually lands', lifted.sessions.some(s => s.id === back.sessions[0].id));
    T('import: tombstones for sessions NOT in the backup are kept', lifted.deleted.includes('unrelated'), JSON.stringify(lifted.deleted));
    T('import: the restored session survives a later two-tab merge', mergeStores(lifted, { ...freshState() }).sessions.some(s => s.id === back.sessions[0].id));
  }
  {
    // A local deload date must survive an import that carries a different one...
    const local = freshState();
    local.sessions = [mk('L1', '2026-05-01', 'A', 'home', [{ id: 'hex_dl', wt: 56, reps: [5, 5, 4], band: '', notes: '' }], { phase: 1 })];
    local.lastDeload = '2026-06-15';
    T('merge-existing: a local lastDeload survives the import', mergeImport(local, JSON.parse(exported)).W.lastDeload === '2026-06-15');
    // ...and a MALFORMED imported value must not null it (the old `: null` fallback did).
    const bad = JSON.parse(exported); bad.lastDeload = 'banana';
    T('merge-existing: a malformed imported lastDeload cannot null the local one', mergeImport(local, bad).W.lastDeload === '2026-06-15');
    T('fresh import: a malformed lastDeload still normalises to null', mergeImport(freshState(), bad).W.lastDeload === null);

    // The bite: getSmartSugg drops sessions falling inside the deload week, so an adopted
    // date landing on top of real training used to remove those sessions from the engine's
    // view entirely — silently changing the suggestion for every lift trained that week.
    const eng = freshState();
    eng.sessions = [12, 8, 4].map((off, i) => ({ id: 'dl' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', phase: 1, ex: [{ id: 'floor_press', wt: 32, reps: [10, 10, 10, 10], band: '' }] }));
    const fpDef = getProgram(1, 'home').A.find(e => e.id === 'floor_press');
    setD(eng); const before = JSON.stringify(getSmartSugg(fpDef));
    const covering = JSON.parse(exported);
    covering.lastDeload = ymd(new Date(Date.now() - 10 * 864e5)); // week covers 2 of the 3 sessions
    const merged = mergeImport(eng, covering);
    setD(merged.W); const after = JSON.stringify(getSmartSugg(fpDef));
    T('an imported deload week cannot hide existing sessions from the engine', before === after, `${before}\n${after}`);
    setD(freshD());
  }
  {
    const invalid = JSON.parse(exported); invalid.nextDay = 'Z';
    T('fresh import: invalid nextDay falls back to re-derive', mergeImport(freshState(), invalid).W.nextDay === 'A');
  }

  // Seeded (demo) store: demo rows dropped, backup metadata adopted.
  const seededCur = { ...freshState(), sessions: structuredClone(SEED.sessions), seeded: true };
  const m3 = mergeImport(seededCur, JSON.parse(exported));
  T('seeded store: demo rows dropped on restore', m3.W.sessions.length === 3 && m3.W.sessions.every(s => s.id.startsWith('rt')));
  T('seeded store: backup metadata adopted', m3.W.phase === 2 && m3.W.location === 'partner');

  // Unsalvageable input throws; caller state is untouched (merge works on a clone).
  let threw = false;
  const before = JSON.stringify(cur);
  try { mergeImport(cur, { sessions: 'garbage' }); } catch (e) { threw = true; }
  T('garbage import throws', threw);
  T('failed import leaves current state untouched', JSON.stringify(cur) === before);
  try { threw = false; mergeImport(cur, { sessions: [{ bad: true }, null] }); } catch (e) { threw = true; }
  T('all-malformed sessions rejected outright', threw);
}

// ── Ultra audit C3: resume blobs with logged work are never silently purged ──
{
  const store3 = {};
  global.localStorage = { getItem: k => store3[k] ?? null, setItem: (k, v) => { store3[k] = v }, removeItem: k => { delete store3[k] } };
  const d3 = freshD();
  const curIds = dayExs('A', {}).map(e => e.id);
  const mkBlob = (over) => JSON.stringify({
    day: 'A', log: { hex_dl: { reps: ['5', '5', ''], wt: 61, setDone: [], form: [], discJoints: [], disc: 'none', notes: '' } },
    start: Date.now() - 3 * 3600e3, cidx: 0, ts: Date.now() - 3 * 3600e3, loc: 'home', phase: 1, exIds: curIds, swaps: {}, notes: '', wu: [false, false, false], ...over });

  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3 });
  let r = checkResume();
  T('fresh blob with reps resumes, unflagged', r && r.day === 'A' && !r.stale && !r.drifted, JSON.stringify(r));

  store3['rft-active'] = mkBlob(); // 3h old, has logged reps
  r = checkResume();
  T('3h-old blob WITH reps survives, flagged stale', r && r.stale === true, JSON.stringify(r));
  T('3h-old blob WITH reps not deleted from storage', store3['rft-active'] != null);

  store3['rft-active'] = mkBlob({ log: { hex_dl: { reps: ['', '', ''], wt: 61 } } }); // 3h old, zero reps
  r = checkResume();
  T('3h-old blob with NO reps is purged', r === null && store3['rft-active'] == null);

  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3, exIds: ['some_removed_ex'] }); // drifted, has reps
  r = checkResume();
  T('drifted blob WITH reps survives, flagged drifted', r && r.drifted === true, JSON.stringify(r));
  T('drifted blob WITH reps not deleted from storage', store3['rft-active'] != null);

  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3, exIds: ['some_removed_ex'], log: {} }); // drifted, no work
  r = checkResume();
  T('drifted blob with NO reps is purged', r === null && store3['rft-active'] == null);

  // Location/phase mismatch stays hidden-not-deleted (unchanged behavior).
  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3, loc: 'partner' });
  r = checkResume();
  T('location-mismatched blob hidden but kept', r === null && store3['rft-active'] != null);

  // ── audit fix: Start must not silently overwrite a HIDDEN blob ──
  // checkResume hides a venue/phase-mismatched blob (above) but leaves it in storage.
  // beginW's data-loss guard used to ask checkResume, so it saw null in exactly that case
  // and let Start run — saveAW then overwrote 45 minutes of logging with no prompt, at the
  // moment the user had no Resume card telling them the workout existed.
  T('pendingAW sees a venue-mismatched blob that checkResume hides',
    (() => { const p = pendingAW(); return p && p.hasReps === true && p.why === 'venue' && p.loc === 'partner' })(), JSON.stringify(pendingAW()));
  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3, phase: 3 });
  T('pendingAW flags a phase-mismatched blob', (pendingAW() || {}).why === 'phase', JSON.stringify(pendingAW()));
  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3 });
  T('pendingAW reports a matching blob with no mismatch reason', (() => { const p = pendingAW(); return p && p.hasReps === true && p.why === null })(), JSON.stringify(pendingAW()));
  // An untouched blob must never nag — starting fresh costs the user nothing.
  store3['rft-active'] = mkBlob({ ts: Date.now() - 10 * 60e3, log: { hex_dl: { reps: ['', '', ''], wt: 61 } } });
  T('pendingAW ignores a blob with no logged reps', pendingAW() === null);
  delete store3['rft-active'];
  T('pendingAW is null with no blob at all', pendingAW() === null);
  // Lock in that beginW actually asks pendingAW — guarding on checkResume is the bug.
  T('beginW guards on pendingAW, not checkResume', /pendingAW\(\)/.test(String(beginW)) && !/checkResume\(\)/.test(String(beginW)), String(beginW).slice(0, 200));

  // Lock in two behaviors the fix depends on (source checks, same style as the saveAW guard):
  T('finishW stamps session date from workout START, not save time', /date:ymd\(new Date\(SS\|\|Date\.now\(\)\)\)/.test(String(finishW)), String(finishW).slice(0, 80));
  T('resumeW clamps CIDX to the current day length', /CIDX=Math\.min\(CIDX/.test(String(resumeW)));
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// ── audit fix: load() never discards sessions silently ──
// The load path drops sessions validSession rejects. That used to be invisible — the raw
// rescue copy was written only from the catch (which a parseable-but-malformed store never
// reaches), so the loss vanished and the next save() made it permanent with nothing to
// recover from. Import has always reported "N malformed sessions skipped"; load now matches.
{
  const store = {};
  const realLS = global.localStorage;
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } };
  const good = { id: 'ok1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] };

  // One good + one malformed (no ex array → validSession returns null).
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good, { id: 'bad1', date: '2026-06-03', day: 'B' }] });
  const rawBefore = store[SK];
  load();
  T('load keeps the salvageable session', getD().sessions.length === 1 && getD().sessions[0].id === 'ok1', JSON.stringify(getD().sessions));
  T('load counts what it dropped', getDropped() === 1, String(getDropped()));
  T('load parks the raw store for recovery', store[SK + '-corrupt'] === rawBefore);

  // Clean store: no loss, no rescue copy, no false alarm.
  delete store[SK + '-corrupt'];
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good] });
  load();
  T('a clean store drops nothing', getDropped() === 0 && getD().sessions.length === 1);
  T('a clean store writes no corrupt copy', store[SK + '-corrupt'] == null);

  // sessions not an array at all → total loss, flagged, not a silently-empty log.
  store[SK] = JSON.stringify({ ...freshState(), sessions: { nope: true } });
  load();
  T('a non-array sessions field is flagged as total loss', getDropped() === -1 && getD().sessions.length === 0, String(getDropped()));
  T('total loss still parks a raw copy', store[SK + '-corrupt'] != null);

  // ── saveAW reports whether the backup actually landed ──
  // saveSumm's quota-failure path promised "still safe in the resume backup"; a full
  // localStorage is exactly when that write fails too.
  setD(structuredClone(SEED)); getD().location = 'home';
  setADAY('A');
  T('saveAW returns true on a successful write', saveAW() === true);
  global.localStorage.setItem = () => { throw new Error('QuotaExceededError') };
  T('saveAW returns false when the write throws', saveAW() === false);
  global.localStorage.setItem = (k, v) => { store[k] = v };
  setADAY(null);
  T('saveAW returns false with no active workout', saveAW() === false);
  // Lock in that the caller actually branches on it (source check, same style as the
  // finishW/resumeW guards above) — a true-ish call whose result is ignored is the bug.
  T('saveSumm branches its warning on the saveAW result', /const backed=saveAW\(\)/.test(String(saveSumm)) && /backed\s*\n?\s*\?/.test(String(saveSumm)), String(saveSumm).slice(0, 60));

  // ── cue keys are constrained on BOTH entrances, not just import ──
  // Keys are interpolated into the delete-button onclick. mergeImport has always filtered
  // them; load() accepted anything, so the stored store was an unguarded path to the same
  // sink for anyone who edited it (or any code that wrote it badly).
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good], cues: { hex_dl: 'push the floor away', "ohp');alert(1);//": 'evil', ok_key: 'fine' } });
  load();
  T('load keeps well-formed cue keys', getD().cues.hex_dl === 'push the floor away' && getD().cues.ok_key === 'fine', JSON.stringify(getD().cues));
  T('load drops a cue key that would break out of the onclick', Object.keys(getD().cues).every(k => /^[\w-]{1,60}$/.test(k)), JSON.stringify(Object.keys(getD().cues)));
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good], cues: 'not-an-object' });
  load();
  T('load survives a non-object cues field', typeof getD().cues === 'object' && !Array.isArray(getD().cues));
  // resetAll must repaint: freshState() sets theme 'auto' but the applied palette lingers.
  T('resetAll re-applies the theme', /applyTheme\(\)/.test(String(resetAll)), String(resetAll).slice(0, 120));

  // ── Audit 6 / F4: the tombstone list is normalised on load ──
  // Every store written before this release has no `deleted` field at all, and a hand-edited
  // one could carry anything. mergeStores filters ids into an onclick-safe charset already,
  // but the load path guards the same shape so nothing downstream has to re-check it.
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good], deleted: undefined });
  load();
  T('a pre-v79 store without a deleted field loads to an empty list', Array.isArray(getD().deleted) && getD().deleted.length === 0, JSON.stringify(getD().deleted));
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good], deleted: ['s123', "x');alert(1);//", 42, null, 'ok-1.2'] });
  load();
  T('load keeps well-formed tombstones', getD().deleted.includes('s123') && getD().deleted.includes('ok-1.2'), JSON.stringify(getD().deleted));
  T('load drops malformed tombstones', getD().deleted.length === 2, JSON.stringify(getD().deleted));
  store[SK] = JSON.stringify({ ...freshState(), sessions: [good], deleted: 'nope' });
  load();
  T('load survives a non-array deleted field', Array.isArray(getD().deleted) && getD().deleted.length === 0);
  T('freshState ships an empty tombstone list', Array.isArray(freshState().deleted) && freshState().deleted.length === 0);

  global.localStorage = realLS;
  setD(freshD());
}

// ── Progress rebuild A2: band-lift progression helpers ──
{
  T('bandRank maps exact ladder strings', bandRank('Blue (heaviest)') === 0 && bandRank('None') === 5);
  T('bandRank treats the combo band as its own rung', bandRank('Purple+Red') === 2);
  T('bandRank returns -1 for unknown/legacy strings', bandRank('Orange') === -1 && bandRank('') === -1);

  const d2 = freshD();
  const mkB = (id, daysAgo, reps) => ({ id: 'b' + id, date: ymd(new Date(Date.now() - daysAgo * 864e5)), day: 'A', loc: 'home',
    ex: [{ id: 'pullup_a', wt: null, reps, band: 'Green' }] });
  d2.sessions = [mkB(1, 28, [4, 4, 3, 3]), mkB(2, 21, [5, 4, 4, 3]), mkB(3, 14, [5, 5, 4, 4]), mkB(4, 7, [6, 5, 5, 4]), mkB(5, 0, [6, 6, 5, 5])];
  const rs = repsSlope('pullup_a', 56);
  T('repsSlope fits rising band-lift reps (positive reps/week)', rs && rs.slope > 0 && rs.n === 5, JSON.stringify(rs));
  T('repsSlope latest = most recent session total', rs.latest === 22);
  d2.sessions = [mkB(1, 3, [5, 5, 5, 5]), mkB(2, 0, [5, 5, 5, 5])];
  T('repsSlope null under 3 sessions / 2 weeks span', repsSlope('pullup_a', 56) === null);
}

// ── Progress rebuild A3: weeklyMarks — phase changes + deload week on weekly charts ──
{
  const d3 = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  d3.sessions = [
    { id: 'pm1', date: wkAgo(5), day: 'A', loc: 'home', phase: 1, ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '' }] },
    { id: 'pm2', date: wkAgo(4), day: 'B', loc: 'home', phase: 1, ex: [{ id: 'ohp', wt: 25, reps: [6, 6, 6], band: '' }] },
    { id: 'pm3', date: wkAgo(3), day: 'C', loc: 'home', phase: 2, ex: [{ id: 'hex_rdl', wt: 45, reps: [8, 8, 8], band: '' }] },
    { id: 'pm4', date: wkAgo(2), day: 'A', loc: 'home', phase: 2, ex: [{ id: 'hex_dl', wt: 46, reps: [8, 8, 8], band: '' }] }];
  d3.lastDeload = wkAgo(2);
  const series = weeklySeries(10).filter(w => !w.partial);
  const marks = weeklyMarks(series);
  const pMark = marks.find(m => m.label === 'P2');
  const dMark = marks.find(m => m.label === 'DL');
  T('weeklyMarks flags the week the phase change landed', pMark && series[pMark.i] && series[pMark.i].wk === weekKey(wkAgo(3)), JSON.stringify(marks));
  // Light reskin: CH_TARGET is the light-mode rose #d61f5e.
  T('weeklyMarks flags the deload week with the target color', dMark && series[dMark.i].wk === weekKey(wkAgo(2)) && dMark.color === '#d61f5e', JSON.stringify(dMark));
  d3.sessions.forEach(s => delete s.phase);
  T('unstamped history produces no phase marks', weeklyMarks(series).filter(m => m.label.startsWith('P')).length === 0);
  T('empty series → no marks, no throw', weeklyMarks([]).length === 0);
}

// ── Progress rebuild A4: formWeekly — weekly mean of worst-rated working set ──
{
  const d4 = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  d4.sessions = [
    { id: 'fw1', date: wkAgo(2), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '', form: [3, 4, 5] }] },
    { id: 'fw2', date: wkAgo(2), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '', form: [5, 5, 5] }] },
    { id: 'fw3', date: wkAgo(1), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 52, reps: [5, 5, 5], band: '', form: [] }] },
    { id: 'fw4', date: wkAgo(0), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 52, reps: [5, 5, 5], band: '', form: [4, 4, 0] }] }];
  const fw = formWeekly('hex_dl', 8);
  const wk2 = fw.find(w => w.wk === weekKey(wkAgo(2)));
  const wk1 = fw.find(w => w.wk === weekKey(wkAgo(1)));
  const wk0 = fw.find(w => w.wk === weekKey(wkAgo(0)));
  T('formWeekly averages sessForm per week (worst-set 3 + 5 → 4)', wk2 && wk2.v === 4, JSON.stringify(fw));
  T('unrated sessions leave a null week, not a zero', wk1 && wk1.v === null);
  T('zero form entries (unrated sets) are ignored within a session', wk0 && wk0.v === 4);
  d4.sessions.forEach(s => { s.ex[0].form = []; });
  T('a lift with no ratings at all returns []', formWeekly('hex_dl', 8).length === 0);
}

// ── Progress rebuild A5: cardioWeekly — minutes by intensity, zero-filled weeks ──
{
  const d5 = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  d5.cardioLog = [
    { id: 'cw1', date: wkAgo(3), type: 'Row', duration: 30, intensity: 'easy' },
    { id: 'cw2', date: wkAgo(3), type: 'Row', duration: 20, intensity: 'hard' },
    { id: 'cw3', date: wkAgo(1), type: 'Walk', duration: 40, intensity: 'moderate' },
    { id: 'cw4', date: wkAgo(0), type: 'Row', duration: 25, intensity: 'bogus' }];
  const cw = cardioWeekly(8);
  const w3 = cw.find(w => w.wk === weekKey(wkAgo(3)));
  const w2 = cw.find(w => w.wk === weekKey(wkAgo(2)));
  const w0 = cw.find(w => w.wk === weekKey(wkAgo(0)));
  T('cardioWeekly sums minutes and splits by intensity', w3 && w3.total === 50 && w3.easy === 30 && w3.hard === 20, JSON.stringify(w3));
  T('cardio-free week zero-filled, not skipped', w2 && w2.total === 0);
  T('unknown intensity counted as easy, not dropped', w0 && w0.total === 25 && w0.easy === 25);
  T('intensity split sums to total across the window', cw.reduce((a, w) => a + w.easy + w.moderate + w.hard, 0) === cw.reduce((a, w) => a + w.total, 0));
  d5.cardioLog = [];
  T('no cardio history → empty series', cardioWeekly(8).length === 0);
}

// ── Partner DB ladder (E3): db progression walks real spinlock rungs ──
{
  const dl = freshD({ location: 'partner' });
  const pr3 = getProgram(1, 'partner');
  const ohpEx = pr3.B.find(e => e.id === 'db_ohp'); // per_db, tg 10
  // Hit target at 8.5/DB → next PAIR rung is 9.
  dl.sessions = [{ id: 'l1', date: '2026-07-05', day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 8.5, reps: [10, 10, 10], band: '' }] }];
  let sgl = getSmartSugg(ohpEx);
  T('db step-up lands on the next spinlock rung', sgl.type === 'up' && sgl.wt === 9, JSON.stringify(sgl));
  // Ladder gap: 17 → 18 for matched pairs (17.5 needs plates the pool can't match ×4).
  dl.sessions = [{ id: 'l2', date: '2026-07-05', day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 17, reps: [10, 10, 10], band: '' }] }];
  sgl = getSmartSugg(ohpEx);
  T('db step-up honors ladder gaps (17 → 18, no phantom 17.5)', sgl.wt === 18, JSON.stringify(sgl));
  // Top of the rack → MAX, not an unloadable +0.5.
  dl.sessions = [{ id: 'l3', date: '2026-07-05', day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 18.5, reps: [10, 10, 10], band: '' }] }];
  sgl = getSmartSugg(ohpEx);
  T('top of the DB rack reports MAX', sgl.maxed === true && /MAX/.test(sgl.text), JSON.stringify(sgl));
  // Deload after 3 stalls lands on a rung ≤ 90%.
  dl.sessions = [1, 2, 3].map(i => ({ id: 'l4' + i, date: '2026-07-0' + i, day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 10, reps: [4, 4, 4], band: '' }] }));
  sgl = getSmartSugg(ohpEx);
  T('db deload lands on a real rung ≤90%', sgl.type === 'dn' && sgl.wt === 9 && dbwOf(ohpEx).includes(sgl.wt), JSON.stringify(sgl));
}

// ── Deeper stats D3: periodCompare — last-4wk vs prior-4wk windows ──
{
  const dp = freshD();
  const mkS = (id, daysAgo, wt, rpe) => ({ id, date: ymd(new Date(Date.now() - daysAgo * 864e5)), day: 'A', loc: 'home', difficulty: rpe,
    ex: [{ id: 'hex_dl', wt, reps: [5, 5, 5], band: '' }] });
  dp.sessions = [mkS('pc1', 5, 60, 3), mkS('pc2', 20, 58, 3), mkS('pc3', 35, 50, 4), mkS('pc4', 50, 48, 4), mkS('pc5', 70, 40, 2)];
  const pc = periodCompare(28);
  T('periodCompare: current window holds the two recent sessions', pc.cur.sessions === 2 && pc.cur.vol === (60 + 58) * 15, JSON.stringify(pc.cur));
  T('periodCompare: prior window holds the two mid sessions', pc.prev.sessions === 2 && pc.prev.vol === (50 + 48) * 15, JSON.stringify(pc.prev));
  T('periodCompare: 70-day-old session outside both windows', pc.cur.sessions + pc.prev.sessions === 4);
  T('periodCompare: per-window avg RPE', pc.cur.rpe === 3 && pc.prev.rpe === 4);
  dp.sessions = [mkS('pc6', 5, 60, 3)];
  T('periodCompare: empty prior window reports zero sessions (render hides strip)', periodCompare(28).prev.sessions === 0);
}

// ── Deeper stats D4: big4Weekly — summed best e1RM with carry-forward ──
{
  const db4 = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  const mk = (id, exId, n, wt) => ({ id, date: wkAgo(n), day: 'A', loc: 'home', ex: [{ id: exId, wt, reps: [5, 5, 5], band: '' }] });
  // All four big lifts seen in week -3; hex_dl trains again in week -1 only.
  db4.sessions = [
    mk('b1', 'hex_dl', 3, 60), mk('b2', 'hex_squat_b', 3, 55), mk('b3', 'ohp', 3, 25), mk('b4', 'floor_press', 3, 30),
    mk('b5', 'hex_dl', 1, 64)];
  const b4 = big4Weekly(12);
  const wk3 = b4.find(w => w.wk === weekKey(wkAgo(3)));
  const wk2 = b4.find(w => w.wk === weekKey(wkAgo(2)));
  const wk1 = b4.find(w => w.wk === weekKey(wkAgo(1)));
  const sum3 = [60, 55, 25, 30].reduce((a, w) => a + e1rm(w, 5), 0);
  T('big4: series starts once all four lifts are known', b4.length && b4[0].wk === weekKey(wkAgo(3)), JSON.stringify(b4.map(w => w.wk)));
  T('big4: baseline week sums the four best e1RMs', wk3 && Math.abs(wk3.v - sum3) < 0.11, `${wk3 && wk3.v} vs ${sum3}`);
  T('big4: untrained week carries every value forward', wk2 && wk2.v === wk3.v);
  T('big4: retrained lift raises the sum, others carried', wk1 && Math.abs(wk1.v - (sum3 - e1rm(60, 5) + e1rm(64, 5))) < 0.11, wk1 && wk1.v);
  // Only three of four lifts ever trained → no series at all.
  db4.sessions = db4.sessions.filter(s => s.id !== 'b4');
  T('big4: incomplete lift coverage yields an empty series', big4Weekly(12).length === 0);
}

// ── Deeper stats D5: e1rmProjection + recentPRs.id ──
{
  const de = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  const mk = (id, n, wt) => ({ id, date: wkAgo(n), day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt, reps: [5, 5, 5], band: '' }] });
  de.sessions = [mk('e1', 4, 56), mk('e2', 3, 58), mk('e3', 2, 60), mk('e4', 1, 62), mk('e5', 0, 64)];
  const pj = e1rmProjection('hex_dl');
  const latest = e1rm(64, 5); // 74.7
  T('projection targets the next 5kg milestone', pj && pj.kg === Math.floor(latest / 5) * 5 + 5, JSON.stringify(pj));
  T('projection ETA within the 12-week cap', pj.wks > 0 && pj.wks <= 12 && typeof pj.date === 'string');
  de.sessions = [mk('f1', 4, 60), mk('f2', 3, 60), mk('f3', 2, 60), mk('f4', 1, 60)];
  T('flat trend → no projection', e1rmProjection('hex_dl') === null);
  de.sessions = [mk('g1', 4, 60.5), mk('g2', 2, 60.25), mk('g3', 0, 60.75)]; // ~0.05kg/wk → decades to +5kg
  T('too-slow trend (ETA >12wk) → no projection', e1rmProjection('hex_dl') === null);
  de.sessions = [mk('h1', 2, 56), mk('h2', 1, 60), mk('h3', 0, 64)];
  const pr = recentPRs(null).find(p => p.id === 'hex_dl');
  T('recentPRs entries carry the exercise id', pr && pr.date === wkAgo(0), JSON.stringify(pr));
}

// ── Progress rebuild A7: quirk fixes ──
{
  // Club lifts mint e1RM PRs (E1RM_TYPES includes club) — the momentum board now
  // uses the same gate instead of a hardcoded list that silently excluded them.
  const d7 = freshD();
  const wkAgo = n => ymd(new Date(Date.now() - n * 7 * 864e5));
  d7.sessions = [0, 1, 2, 3].map(n => ({ id: 'cm' + n, date: wkAgo(3 - n), day: 'A', loc: 'partner',
    ex: [{ id: 'cb_mills', wt: 4 + n, reps: [8, 8], band: '' }] }));
  T('club lift appears on the momentum board', strengthMomentum().some(m => m.id === 'cb_mills'), JSON.stringify(strengthMomentum().map(m => m.id)));

  // consistency().perWk denominator now runs to TODAY — a layoff after the last
  // session lowers sessions/week instead of freezing it at the old cadence.
  const d7b = freshD();
  d7b.sessions = [0, 2, 4, 7].map(n => ({ id: 'pw' + n, date: ymd(new Date(Date.now() - (60 + n) * 864e5)), day: 'A', loc: 'home',
    ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '' }] }));
  const pw = consistency().perWk;
  T('perWk sees a current 2-month layoff (well under 1/wk)', pw < 1, pw);
}

// ── Ultra audit C8: SEED hygiene — demo bootstrap no longer trips the v12 migration ──
{
  T('SEED carries programVersion 21', SEED.programVersion === 21);
  // The two must agree. freshState() is written straight to D by resetAll() WITHOUT going
  // through the migration chain (that runs in load()), so a drift leaves a factory-reset
  // device stamped one version behind until its next reload. Two separate literals pinned by
  // two separate assertions is exactly how v21 bumped one and missed the other — this
  // relative check fails on any future drift regardless of what the numbers are.
  T('freshState programVersion matches SEED', freshState().programVersion === SEED.programVersion,
    `${freshState().programVersion} vs ${SEED.programVersion}`);
  T('SEED has no dead confirmed field', SEED.confirmed === undefined);
  const sClone = structuredClone(SEED);
  migrateToV12(sClone);
  migrateToV13(sClone);
  migrateToV14(sClone);
  migrateToV15(sClone);
  migrateToV16(sClone);
  migrateToV17(sClone);
  migrateToV18(sClone);
  migrateToV19(sClone);
  migrateToV20(sClone);
  migrateToV21(sClone);
  T('migrateToV12..21 are no-ops on the SEED (phaseStart preserved)', sClone.phaseStart === SEED.phaseStart && sClone.phase === 1);
  const v11 = { sessions: [], phase: 3, phaseStart: '2025-01-01', confirmed: { x: 1 }, dayCFocus: 'y' };
  migrateToV12(v11);
  T('a real pre-v12 store still gets the migration reset', v11.programVersion === 12 && v11.phase === 1 && v11.phaseStart !== '2025-01-01' && v11.confirmed === undefined && v11.dayCFocus === undefined);
  const preV13Phase = v11.phase, preV13Start = v11.phaseStart;
  migrateToV13(v11);
  T('v13 migration stamps the version WITHOUT a phase reset (content-only tweaks)', v11.programVersion === 13 && v11.phase === preV13Phase && v11.phaseStart === preV13Start);
  migrateToV14(v11);
  T('v14 migration stamps the version WITHOUT a phase reset (content-only tweaks)', v11.programVersion === 14 && v11.phase === preV13Phase && v11.phaseStart === preV13Start);
  const st8 = {};
  global.localStorage = { getItem: k => st8[k] ?? null, setItem: (k, v) => { st8[k] = v }, removeItem: k => { delete st8[k] } };
  load();
  T('fresh install seeds demo with phaseStart = today (no overdue banners)', getD().seeded === true && getD().phaseStart === today(), getD().phaseStart);
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// ── Ultra audit C6: per-session "ignore for progression" (noProg) ──
{
  const d6 = freshD();
  d6.sessions = [
    { id: 'np1', date: '2026-06-01', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [7, 7, 7, 7], band: '' }] },
    { id: 'np2', date: '2026-06-05', day: 'B', loc: 'home', noProg: true, ex: [{ id: 'ohp', wt: 21, reps: [7, 7, 7, 7], band: '' }] }];
  let sg6 = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
  T('noProg session invisible to the engine — anchors on the prior 41kg', sg6.wt == null || sg6.wt >= 41, JSON.stringify(sg6));
  d6.sessions.forEach(s => s.noProg = true);
  sg6 = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
  T('all history noProg → engine treats the lift as new', sg6.type === 'new', JSON.stringify(sg6));
  // Rotation/analytics untouched: weekly volume still counts a noProg session's sets.
  d6.sessions = [{ id: 'np3', date: ymd(new Date()), day: 'B', loc: 'home', noProg: true, ex: [{ id: 'ohp', wt: 21, reps: [7, 7, 7, 7], band: '' }] }];
  T('noProg session still counts for weekly muscle volume', (getWeeklyVolume(7).fdelt || 0) === 4, JSON.stringify(getWeeklyVolume(7)));
  // The flag survives the import guard (validSession spreads unknown fields).
  const vs6 = validSession({ id: 'np4', date: '2026-06-06', day: 'A', noProg: true, ex: [] });
  T('noProg survives validSession', vs6 && vs6.noProg === true);
}

// ── Ultra audit C4: two-tab clobber guard (gen counter + mergeStores) ──
{
  const store4 = {};
  let skReads = 0;
  global.localStorage = {
    getItem: k => { if (k === 'rft-v12') skReads++; return store4[k] ?? null; },
    setItem: (k, v) => { store4[k] = v; },
    removeItem: k => { delete store4[k]; }
  };
  const mkSess = (id, date, wt) => ({ id, date, day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt, reps: [5, 5, 5], band: '', notes: '' }] });

  // Tab A boots and saves.
  const dA = freshD();
  dA.sessions = [mkSess('tt1', '2026-06-01', 56)];
  dA.gen = 0;
  skReads = 0;
  T('clean save succeeds', save() === true);
  T('clean save never parses the stored blob (sidecar only)', skReads === 0, `reads=${skReads}`);
  T('clean save advances gen + sidecar', JSON.parse(store4['rft-v12']).gen === 1 && store4['rft-v12-gen'] === '1');

  // Tab B (simulated) writes a newer generation with an extra session + a body entry.
  const b = JSON.parse(store4['rft-v12']);
  b.sessions.push(mkSess('tt2', '2026-06-03', 58));
  b.bodyLog = [{ date: '2026-06-03', weight: 82 }];
  b.gen = 2;
  store4['rft-v12'] = JSON.stringify(b);
  store4['rft-v12-gen'] = '2';

  // Tab A (still holding gen 1 in memory) logs its own session and saves.
  getD().sessions.push(mkSess('tt3', '2026-06-05', 58));
  T('conflicted save succeeds', save() === true);
  const fin = JSON.parse(store4['rft-v12']);
  const finIds = fin.sessions.map(s => s.id);
  T('conflict merge keeps BOTH tabs’ sessions', ['tt1', 'tt2', 'tt3'].every(id => finIds.includes(id)), JSON.stringify(finIds));
  T('conflict merge unions the body log', fin.bodyLog.some(x => x.date === '2026-06-03'));
  T('conflict merge date-sorts sessions', finIds.join() === 'tt1,tt2,tt3');
  T('gen advances past both writers', fin.gen === 3 && store4['rft-v12-gen'] === '3');

  // mergeStores is scalar-conservative: the in-memory tab's phase/location/nextDay win.
  const mineS = { ...freshState(), phase: 2, location: 'partner', nextDay: 'C' };
  const theirsS = { ...freshState(), phase: 1, location: 'home', nextDay: 'A', sessions: [mkSess('tt9', '2026-06-07', 60)] };
  const ms = mergeStores(mineS, theirsS);
  T('mergeStores: scalars keep in-memory values', ms.phase === 2 && ms.location === 'partner' && ms.nextDay === 'C');
  T('mergeStores: their sessions still union in', ms.sessions.some(s => s.id === 'tt9'));
  T('mergeStores: malformed their-session dropped by validSession', mergeStores(mineS, { sessions: [{ junk: 1 }] }).sessions.length === 0);

  // ── audit fix: cues and noProg survive the two-tab conflict merge ──
  // mergeStores unions sessions, cardio, body log and discomfort — cues had no branch at all,
  // so a coaching cue typed in one tab was silently dropped the moment the other tab saved.
  {
    const mineC = { ...freshState(), cues: { hex_dl: 'mine wins', ohp: 'only in mine' } };
    const theirsC = { ...freshState(), cues: { hex_dl: 'theirs loses', floor_press: 'only in theirs' } };
    const mc = mergeStores(mineC, theirsC);
    T('mergeStores: a cue added in the other tab survives', mc.cues.floor_press === 'only in theirs', JSON.stringify(mc.cues));
    T('mergeStores: this tab keeps its own cues', mc.cues.ohp === 'only in mine');
    T('mergeStores: the local value wins a key conflict', mc.cues.hex_dl === 'mine wins', mc.cues.hex_dl);
    // Cue keys reach an onclick — this is the THIRD entrance to that sink, after load() and
    // mergeImport, and it needs the same charset guard the other two apply.
    const evil = mergeStores(mineC, { ...freshState(), cues: { "x');alert(1);//": 'evil', good_key: 'ok' } });
    T('mergeStores: a malformed cue key from the other tab is rejected', Object.keys(evil.cues).every(k => /^[\w-]{1,60}$/.test(k)), JSON.stringify(Object.keys(evil.cues)));
    T('mergeStores: well-formed keys still cross', evil.cues.good_key === 'ok');
    T('mergeStores: a non-object cues field is survivable', typeof mergeStores(mineC, { ...freshState(), cues: 'nope' }).cues === 'object');

    // noProg marks a session the user deliberately excluded from progression. On an id
    // collision the existing row wins, which silently re-admitted it to the engine.
    const sess = (id, over = {}) => ({ ...mkSess(id, '2026-06-09', 60), ...over });
    const npMine = { ...freshState(), sessions: [sess('np1')] };
    const npTheirs = { ...freshState(), sessions: [sess('np1', { noProg: true })] };
    T('mergeStores: noProg set in the other tab survives an id collision', mergeStores(npMine, npTheirs).sessions[0].noProg === true, JSON.stringify(mergeStores(npMine, npTheirs).sessions[0]));
    T('mergeStores: noProg set locally is not cleared by the other tab', mergeStores(npTheirs, npMine).sessions[0].noProg === true);

    // ── Audit 6 / F3: cardio ids now reach a delete-button onclick, so this branch needs
    // the same charset guard mergeImport already applies. It used to adopt the other tab's
    // rows verbatim — the third unguarded entrance to an inline-handler sink.
    const cMine = { ...freshState(), cardioLog: [{ id: 'c1', date: '2026-06-01', type: 'Rowing', duration: 20, intensity: 'easy' }] };
    const cEvil = { ...freshState(), cardioLog: [
      { id: "x');alert(1);//", date: '2026-06-02', type: 'Rowing', duration: 20, intensity: 'easy' },
      { id: 'c2', date: '2026-06-03', type: 'Walking', duration: 30, intensity: 'easy' }] };
    const cm = mergeStores(cMine, cEvil);
    T('mergeStores: cardio ids from the other tab are charset-guarded', cm.cardioLog.every(c => /^[\w.-]+$/.test(c.id)), JSON.stringify(cm.cardioLog.map(c => c.id)));
    T('mergeStores: well-formed cardio still crosses', cm.cardioLog.some(c => c.id === 'c2'), JSON.stringify(cm.cardioLog.map(c => c.id)));
    T('mergeStores: this tab keeps its own cardio', cm.cardioLog.some(c => c.id === 'c1'));
    // Duplicate ids WITHIN the incoming list must not both land — the seen-set was only
    // seeded from our own rows and never updated inside the loop.
    const cDup = { ...freshState(), cardioLog: [
      { id: 'cd', date: '2026-06-04', type: 'Rowing', duration: 10, intensity: 'easy' },
      { id: 'cd', date: '2026-06-05', type: 'Rowing', duration: 99, intensity: 'easy' }] };
    T('mergeStores: a duplicate cardio id inside the incoming list lands once',
      mergeStores({ ...freshState() }, cDup).cardioLog.length === 1, JSON.stringify(mergeStores({ ...freshState() }, cDup).cardioLog));

    // ── Audit 6 / F4: a deleted session must stay deleted across the two-tab merge ──
    // Deletion is the one thing a pure union cannot express, so deleting a session in one tab
    // and then saving ANYTHING in the other (a banner dismiss, a theme tap, a cardio entry)
    // unioned the still-present row straight back in.
    const dSess = id => ({ ...mkSess(id, '2026-06-11', 60) });
    const delMine = { ...freshState(), sessions: [dSess('k1')], deleted: ['k2'] };
    const delTheirs = { ...freshState(), sessions: [dSess('k1'), dSess('k2')] };
    const dm = mergeStores(delMine, delTheirs);
    T('mergeStores: a session deleted here is not resurrected from their store', !dm.sessions.some(s => s.id === 'k2'), JSON.stringify(dm.sessions.map(s => s.id)));
    T('mergeStores: undeleted sessions still merge normally', dm.sessions.some(s => s.id === 'k1'));
    T('mergeStores: the tombstone is carried forward', dm.deleted.includes('k2'), JSON.stringify(dm.deleted));
    // ...and the reverse direction: THEIR delete must reach OUR still-present row.
    const dr = mergeStores({ ...freshState(), sessions: [dSess('k1'), dSess('k2')] }, { ...freshState(), deleted: ['k2'] });
    T('mergeStores: a delete in the other tab removes our copy too', !dr.sessions.some(s => s.id === 'k2'), JSON.stringify(dr.sessions.map(s => s.id)));
    // Hostile / malformed tombstones are dropped, not adopted (same sink as session ids).
    const dh = mergeStores({ ...freshState(), sessions: [dSess('k1')] }, { ...freshState(), deleted: ["k1');alert(1);//", 42, null] });
    T('mergeStores: a malformed tombstone is rejected', dh.sessions.some(s => s.id === 'k1') && dh.deleted.length === 0, JSON.stringify(dh.deleted));
    // The tombstone list is bounded.
    const many = Array.from({ length: 400 }, (_, i) => 'z' + i);
    T('mergeStores: the tombstone list is capped', mergeStores({ ...freshState(), deleted: many }, { ...freshState() }).deleted.length === 300,
      mergeStores({ ...freshState(), deleted: many }, { ...freshState() }).deleted.length);
  }

  // resetAll adopts the sidecar gen so the wipe cannot be un-done by the conflict merge.
  T('resetAll adopts the sidecar gen (source check)', /D=freshState\(\);try\{D\.gen=Number\(localStorage\.getItem\(SK\+'-gen'\)\)/.test(String(resetAll)), String(resetAll));
  store4['rft-v12-gen'] = '7';
  setD(Object.assign(freshState(), { gen: 7 })); // what resetAll produces before its save()
  T('reset-state save succeeds', save() === true);
  const wiped = JSON.parse(store4['rft-v12']);
  T('a wipe with adopted gen does not resurrect the old sessions', wiped.sessions.length === 0 && wiped.gen === 8, JSON.stringify({ n: wiped.sessions.length, gen: wiped.gen }));
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// ── Audit 6 / F1: a quota-blocked save must NOT advance the write generation ──
// It used to bump D.gen before the setItem, so a failed write left the tab's gen ABOVE the
// sidecar. save()'s conflict guard (sg > D.gen) then read false and skipped the merge, and
// the next successful save — right after the user frees space, which is exactly what the
// quota alert instructs — silently destroyed the other tab's sessions.
{
  const store5 = {};
  let allow = true;
  global.localStorage = {
    getItem: k => store5[k] ?? null,
    setItem: (k, v) => { if (!allow && k === 'rft-v12') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store5[k] = v; },
    removeItem: k => { delete store5[k]; }
  };
  const mkSess = (id, date, wt) => ({ id, date, day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt, reps: [5, 5, 5], band: '', notes: '' }] });

  // Tab A boots, saves once cleanly → gen 1.
  const dA = freshD();
  dA.sessions = [mkSess('q1', '2026-06-01', 56)];
  dA.gen = 0;
  save();
  T('quota: baseline save lands at gen 1', getD().gen === 1 && store5['rft-v12-gen'] === '1');

  // Storage fills up. Two save attempts fail.
  allow = false;
  getD().sessions.push(mkSess('qA', '2026-06-02', 58));
  T('quota: a blocked save reports failure', save() === false);
  T('quota: a blocked save leaves gen where it was', getD().gen === 1, `gen=${getD().gen}`);
  T('quota: a second blocked save still leaves gen where it was', (save(), getD().gen) === 1, `gen=${getD().gen}`);
  T('quota: the stored blob is untouched by a blocked save', JSON.parse(store5['rft-v12']).sessions.map(s => s.id).join() === 'q1');

  // Meanwhile the OTHER tab writes a session of its own at gen 2.
  const other = JSON.parse(store5['rft-v12']);
  other.sessions.push(mkSess('qB', '2026-06-03', 60));
  other.gen = 2;
  store5['rft-v12'] = JSON.stringify(other);
  store5['rft-v12-gen'] = '2';

  // The user frees space and taps Save again — the conflict merge must still fire.
  allow = true;
  T('quota: the recovery save succeeds', save() === true);
  const after = JSON.parse(store5['rft-v12']).sessions.map(s => s.id);
  T('quota: the other tab’s session survives the recovery save', after.includes('qB'), JSON.stringify(after));
  T('quota: this tab’s own session is written too', after.includes('qA'), JSON.stringify(after));
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// ── Per-set weight overrides (v15: optional ex.wts[] alongside reps[]) ──
{
  // tonnage: overrides apply per set, null inherits wt, multipliers stay per-set
  T('wts tonnage per set', calcExVol('deadlift', 46, [5, 5, 5], [46, 50, 40]) === (46 + 50 + 40) * 5);
  T('wts null inherits wt', calcExVol('deadlift', 46, [5, 5], [null, 50]) === 46 * 5 + 50 * 5);
  T('wts all-null takes the single-weight path', calcExVol('deadlift', 46, [5, 5, 5], [null, null, null]) === 690);
  T('wts with per_db doubles each set', calcExVol('db_ohp', 10, [10, 10], [null, 12]) === 10 * 2 * 10 + 12 * 2 * 10);
  T('wts-only entry (wt null) still counts', calcExVol('deadlift', null, [5, 5], [40, 50]) === 40 * 5 + 50 * 5);
  T('carry stays excluded with wts', calcExVol('suitcase_march', 32, [40, 40], [32, 36]) === 0);
  T('wts zero-rep set contributes nothing', calcExVol('deadlift', 46, [5, 0], [null, 60]) === 230);

  // setWt / exMaxWt resolution
  T('setWt override wins', setWt({ wt: 46, wts: [null, 50], reps: [5, 5] }, 1) === 50);
  T('setWt falls back to wt', setWt({ wt: 46, wts: [null, 50], reps: [5, 5] }, 0) === 46);
  T('setWt no-wts entry = wt', setWt({ wt: 46, reps: [5, 5] }, 1) === 46);
  T('exMaxWt sees the heaviest override', exMaxWt({ wt: 46, reps: [5, 5], wts: [null, 50] }) === 50);
  T('exMaxWt ignores zero-rep overrides', exMaxWt({ wt: 46, reps: [5, 0], wts: [null, 60] }) === 46);
  T('exMaxWt plain entry = wt', exMaxWt({ wt: 46, reps: [5] }) === 46);

  // e1RM per set: with no overrides identical to e1rm(wt, max reps); with an
  // override, the heavier set scores at its own weight
  const dlDef = ALL_EX.find(e => e.id === 'hex_dl');
  T('exSetE1RMMax collapses to old formula without wts',
    exSetE1RMMax(dlDef, { wt: 50, reps: [5, 4, 3] }) === e1rm(50, 5));
  T('exSetE1RMMax scores override sets at their own weight',
    exSetE1RMMax(dlDef, { wt: 40, reps: [8, 5], wts: [null, 55] }) === Math.max(e1rm(40, 8), e1rm(55, 5)));
  // Regression: a zero-rep set BEFORE an override must not shift the wts index —
  // the compacted-effectiveReps walk priced the 6-rep set at 40 instead of 50.
  T('exSetE1RMMax keeps wts aligned across interior zero-rep sets',
    exSetE1RMMax(dlDef, { wt: 40, reps: [8, 0, 6], wts: [40, 40, 50] }) === Math.max(e1rm(40, 8), e1rm(50, 6)));
  // Regression: all sets overridden LIGHTER than the working weight — the best is
  // what was lifted (35), not the untouched stepper value (40).
  T('exMaxWt does not seed the unlifted working weight', exMaxWt({ wt: 40, reps: [5, 5], wts: [35, 35] }) === 35);

  // ── sessLoad: the load SUSTAINED across the working sets (the progression anchor) ──
  // The engine used to read the bare `wt` field, so a session logged at wt 32 with every set
  // overridden to 35 proposed "up 32.5kg" while minting a 35kg weight PR from the same row.
  T('sessLoad collapses to e.wt with no overrides', sessLoad({ wt: 32, reps: [10, 10, 10, 10] }, 4) === 32);
  T('sessLoad ignores an all-null wts array', sessLoad({ wt: 32, reps: [10, 10], wts: [null, null] }, 2) === 32);
  T('sessLoad = min across the working sets (partial ramp)', sessLoad({ wt: 32, reps: [10, 10, 10, 10], wts: [32, 35, 35, 35] }, 4) === 32);
  T('sessLoad rises when every working set is overridden', sessLoad({ wt: 32, reps: [10, 10, 10, 10], wts: [35, 35, 35, 35] }, 4) === 35);
  T('sessLoad is the MIN, so one hot top set cannot re-anchor', sessLoad({ wt: 32, reps: [10, 10, 10, 10], wts: [32, 32, 32, 40] }, 4) === 32);
  // Accessory sets past the window do not drag the anchor down (pairs with the workSets slice).
  T('sessLoad ignores a lighter back-off set beyond the window', sessLoad({ wt: 32, reps: [10, 10, 10, 10, 8], wts: [35, 35, 35, 35, 25] }, 4) === 35);
  // Interior zero-rep sets must not shift the wts index (the exSetE1RMMax trap).
  T('sessLoad keeps wts aligned across interior zero-rep sets', sessLoad({ wt: 40, reps: [5, 0, 5], wts: [45, 99, 45] }, 2) === 45);

  // ── the anchor drives the actual suggestion ──
  {
    const fp = getProgram(1, 'home').A.find(e => e.id === 'floor_press'); // s:4 tg:10 rp '8-10'
    const sugg = (wt, wts, reps) => { const dd = freshD({ phase: 1, phaseStart: '2026-01-01' });
      dd.sessions = [{ id: 'ov', date: ymd(new Date(Date.now() - 3 * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt, reps, wts, band: '' }] }];
      return getSmartSugg(fp) };
    const all35 = sugg(32, [35, 35, 35, 35], [10, 10, 10, 10]);
    T('all working sets overridden → progression anchors on 35, not the stored 32', all35.wt > 35, JSON.stringify(all35));
    const ramp = sugg(32, [32, 35, 35, 35], [10, 10, 10, 10]);
    T('a partial ramp holds the sustained load', ramp.wt > 32 && ramp.wt < 35, JSON.stringify(ramp));
    T('...and discloses the top set the user must match', /top set 35kg/.test(ramp.detail), ramp.detail);
    T('no-override control is unchanged', sugg(32, undefined, [10, 10, 10, 10]).wt === ramp.wt);
    // Stalls bucket by sustained load: three failing sessions all worked at 38, so the
    // deload must cut from 38 — cutting from the untouched stepper value would under-deload.
    const dd = freshD({ phase: 1, phaseStart: '2026-01-01' });
    dd.sessions = [40, 35, 30].map((off, i) => ({ id: 'ovs' + i, date: ymd(new Date(Date.now() - off * 864e5)), day: 'A', loc: 'home', ex: [{ id: 'floor_press', wt: 32, reps: [6, 6, 6, 6], wts: [38, 38, 38, 38], band: '' }] }));
    const st = getSmartSugg(fp);
    T('stalls bucket by sustained load, and the deload cuts from it', st.type === 'dn' && st.wt <= 38 * 0.9 + 0.001 && st.wt > 32 * 0.9, JSON.stringify(st));
  }

  // PRs from override sets
  let d = freshD();
  d.sessions = [{ id: 'w1', date: '2026-06-01', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '' }] }];
  T('checkPR WT from an override set', checkPR('hex_dl', 50, [5, 5, 5], [null, 55, null]).includes('WT'));
  T('checkPR no WT when overrides stay below best', !checkPR('hex_dl', 45, [5, 5], [null, 48]).includes('WT'));
  T('checkPR E1RM from an override set (weight below best)',
    checkPR('hex_dl', 40, [8], [48]).includes('E1RM'));
  // Strength PRs only: a pure volume PR (same weight, same best-set reps, more sets)
  // must mint nothing — the summary badge, PR feed and Monthly count all agree.
  T('checkPR never mints VOL', checkPR('hex_dl', 50, [5, 5, 5, 5, 5, 5]).length === 0);
  d.sessions.push({ id: 'w2', date: '2026-06-05', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5], wts: [null, 55], band: '' }] });
  T('getPRs bestWt sees stored overrides', getPRs('hex_dl').bestWt === 55);
  T('recentPRs mints the weight PR from the override set',
    recentPRs(null).some(p => p.id === 'hex_dl' && p.type === 'weight' && p.val === 55));
  // Memoization must invalidate when the session list changes (same D, new data).
  const before = recentPRs(null).length;
  d.sessions.push({ id: 'w3', date: '2026-06-09', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 60, reps: [3, 3], band: '' }] });
  T('recentPRs memo invalidates on new sessions', recentPRs(null).length === before + 1,
    JSON.stringify([before, recentPRs(null).length]));
  T('recentPRs(days) filters from the memoized full list', recentPRs(1).length <= recentPRs(null).length);

  // validSession sanitization
  const vs = validSession({ id: 'v1', date: '2026-06-01', day: 'A', ex: [{ id: 'hex_dl', wt: 46, reps: [5, 5], wts: ['junk', 50] }] });
  T('validSession coerces wts junk to null, keeps real overrides', JSON.stringify(vs.ex[0].wts) === '[null,50]');
  T('validSession drops non-array wts', validSession({ id: 'v2', date: '2026-06-01', day: 'A', ex: [{ id: 'hex_dl', wt: 46, reps: [5], wts: 'nope' }] }).ex[0].wts === undefined);
  T('validSession drops all-null wts', validSession({ id: 'v3', date: '2026-06-01', day: 'A', ex: [{ id: 'hex_dl', wt: 46, reps: [5], wts: [0, null] }] }).ex[0].wts === undefined);

  // migration is a stamp only
  const m = migrateToV15({ programVersion: 14, sessions: [{ marker: 1 }] });
  T('migrateToV15 stamps 15, touches nothing else', m.programVersion === 15 && m.sessions[0].marker === 1);
  T('migrateToV15 idempotent', migrateToV15({ programVersion: 15, x: 7 }).x === 7);
  // v17 (Cossack → Landmine Lateral Squat) is content-only — stamps the version, nothing else.
  const m17 = migrateToV17({ programVersion: 16, sessions: [{ marker: 1 }] });
  T('migrateToV17 stamps 17, touches nothing else', m17.programVersion === 17 && m17.sessions[0].marker === 1);
  T('migrateToV17 idempotent', migrateToV17({ programVersion: 17, x: 7 }).x === 7);
  // v18 (overhead extension → lying extension, back on the floor) is content-only too.
  const m18 = migrateToV18({ programVersion: 17, sessions: [{ marker: 1 }] });
  T('migrateToV18 stamps 18, touches nothing else', m18.programVersion === 18 && m18.sessions[0].marker === 1);
  T('migrateToV18 idempotent', migrateToV18({ programVersion: 18, x: 7 }).x === 7);
  // v19 (core block moves off the lifting days onto off-rotation day X) is content-only too.
  const m19 = migrateToV19({ programVersion: 18, sessions: [{ marker: 1 }] });
  T('migrateToV19 stamps 19, touches nothing else', m19.programVersion === 19 && m19.sessions[0].marker === 1);
  T('migrateToV19 idempotent', migrateToV19({ programVersion: 19, x: 7 }).x === 7);
  // v20 (core block dissolved back into A/B/C, every rest cut to 1:00) is content-only too —
  // day:'X' sessions already in the store are left exactly as they are.
  const m20 = migrateToV20({ programVersion: 19, sessions: [{ marker: 1, day: 'X' }] });
  T('migrateToV20 stamps 20, touches nothing else', m20.programVersion === 20 && m20.sessions[0].marker === 1 && m20.sessions[0].day === 'X');
  T('migrateToV20 idempotent', migrateToV20({ programVersion: 20, x: 7 }).x === 7);
  // Theme preference: additive field, defaulted on load, garbage coerced to auto.
  load();
  T('load defaults theme to auto', getD().theme === 'auto', getD().theme);
  getD().theme = 'purple'; // simulate a mangled store passing back through load()'s guard
  T('freshState carries the theme default', freshState().theme === 'auto');
}

// ── Per-session muscle split (Hevy-style % bars) ──
{
  const sp = muscleSplit([
    { id: 'ohp', reps: [6, 6, 6] },        // Shoulders 1.5×3, Arms 0.5×3
    { id: 'bb_row', reps: [10, 10] },      // Back 1×2, Arms 0.5×2
    { id: 'floor_press', reps: [8, 8, 8] } // Chest 1×3, Arms 0.5×3
  ]);
  T('muscleSplit sorts by contribution', sp.map(x => x.g).join() === 'Shoulders,Arms,Chest,Back', JSON.stringify(sp));
  T('muscleSplit rolls delts into Shoulders', sp.find(x => x.g === 'Shoulders').v === 4.5);
  const pctSum = sp.reduce((a, x) => a + x.pct, 0);
  T('muscleSplit pcts sum to exactly 100 (largest remainder)', pctSum === 100, pctSum);
  // A split that rounds badly under independent rounding (1/3,1/3,1/3 → 33+33+33=99)
  const thirds = muscleSplit([{ id: 'kb_curl', reps: [8] }, { id: 'dead_bugs_a', reps: [8] }, { id: 'calf_raise', reps: [8] }]);
  T('largest-remainder fixes the thirds case', thirds.reduce((a, x) => a + x.pct, 0) === 100, JSON.stringify(thirds));
  T('muscleSplit counts zero-rep sets out', muscleSplit([{ id: 'ohp', reps: [6, 0, 0] }])[0].v === 1.5);
  T('muscleSplit is set-based: carries still count', muscleSplit([{ id: 'carry', reps: [1, 1, 1] }])[0].g === 'Core');
  T('muscleSplit ignores unknown ids', muscleSplit([{ id: 'nope', reps: [5] }]).length === 0);
  T('muscleSplit empty session → []', muscleSplit([]).length === 0);
  T('muscleSplitH renders % bars', /msp-row/.test(muscleSplitH([{ id: 'ohp', reps: [6] }])));
  T('muscleSplitH empty split → empty string', muscleSplitH([]) === '');
}

// ── Muscle distribution comparison (28d vs prior 28d) ──
{
  const d = freshD();
  d.sessions = [
    { id: 'mp1', date: daysAgoStr(7), day: 'A', loc: 'home', ex: [{ id: 'ohp', wt: 20, reps: [6, 6], band: '' }] },
    { id: 'mp2', date: daysAgoStr(35), day: 'A', loc: 'home', ex: [{ id: 'ohp', wt: 20, reps: [6, 6, 6], band: '' }] },
    { id: 'mp3', date: daysAgoStr(70), day: 'A', loc: 'home', ex: [{ id: 'ohp', wt: 20, reps: [6], band: '' }] },
  ];
  const mpc = musclePeriodCompare(28);
  const fd = mpc.find(x => x.k === 'fdelt');
  T('musclePeriodCompare buckets −7d into cur', fd && fd.cur === 2, JSON.stringify(fd));
  T('musclePeriodCompare buckets −35d into prev', fd && fd.prev === 3, JSON.stringify(fd));
  const tri = mpc.find(x => x.k === 'triceps');
  T('indirect 0.5 credit carries through (−70d session excluded)', tri && tri.cur === 1 && tri.prev === 1.5, JSON.stringify(tri));
  T('untouched muscles drop out of the compare', !mpc.some(x => x.k === 'quads'));
  d.sessions = [];
  T('empty history → empty compare', musclePeriodCompare(28).length === 0);
}

// ── Monthly report ──
{
  T('monthKey slices the month', monthKey('2026-01-15') === '2026-01');
  T('prevMonth crosses the year boundary', prevMonth('2026-01') === '2025-12');
  T('nextMonth crosses the year boundary', nextMonth('2025-12') === '2026-01');
  const d = freshD();
  d.sessions = [
    { id: 'm1', date: '2026-05-05', day: 'A', loc: 'home', duration: 40, difficulty: 3, ex: [{ id: 'hex_dl', wt: 50, reps: [5, 5, 5], band: '' }] },
    { id: 'm2', date: '2026-05-20', day: 'A', loc: 'home', duration: 50, difficulty: 4, ex: [{ id: 'hex_dl', wt: 52, reps: [5, 5], band: '' }, { id: 'ohp', wt: 20, reps: [8, 8], band: '' }] },
    { id: 'm3', date: '2026-06-03', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 55, reps: [5, 5], wts: [55, 60], band: '' }] },
  ];
  const may = monthlyReport('2026-05');
  T('monthly sessions count', may.sessions === 2);
  T('monthly tonnage', may.tonnage === 50 * 15 + 52 * 10 + 20 * 16, may.tonnage);
  T('monthly sets + reps', may.sets === 7 && may.reps === 41, JSON.stringify([may.sets, may.reps]));
  T('monthly avgDur / avgRpe', may.avgDur === 45 && may.avgRpe === 3.5);
  T('monthly topEx ranks by frequency with top weight', may.topEx[0].id === 'hex_dl' && may.topEx[0].n === 2 && may.topEx[0].best === 52, JSON.stringify(may.topEx[0]));
  T('monthly muscleSets credit (hex_dl hams 1.0 × 5 sets)', may.muscleSets.hams === 5, may.muscleSets.hams);
  T('monthly PR replay: 52kg in May beat the 50kg baseline', may.prCount === 1, may.prCount);
  const jun = monthlyReport('2026-06');
  T('monthly tonnage prices per-set overrides', jun.tonnage === 55 * 5 + 60 * 5, jun.tonnage);
  T('monthly PR from a June override set (60 > 52)', jun.prCount === 1, jun.prCount);
  T('empty month reports zero sessions', monthlyReport('2026-01').sessions === 0);
}

// ── Body heat map ──
{
  T('heatColor 0 sets → empty (base fill)', heatColor(0, 8, 20) === '');
  T('heatColor under MEV → solid amber', heatColor(4, 8, 20) === '#b26102');
  T('heatColor MEV..MAV → solid green', heatColor(12, 8, 20) === '#0c8050');
  T('heatColor ≥MAV → solid cyan', heatColor(22, 8, 20) === '#007ba8');
  T('heatColor no-MEV-landmark muscle → muted, not a band it cannot be judged against',
    heatColor(3, null, null) === '#5a6478');
  T('heatColor mev=0 (front delts) never divides by zero', heatColor(3, 0, 12) === '#0c8050');
  // The band is a reserved STATE, so it must not vary with magnitude inside the band —
  // that precision lives in the bars below, which carry the exact number and the tag.
  T('heatColor is constant within a band', heatColor(2, 8, 20) === heatColor(7.9, 8, 20));
  T('heatColor changes state exactly at MEV', heatColor(7.9, 8, 20) !== heatColor(8, 8, 20));
  T('heatColor changes state exactly at MAV', heatColor(19.9, 8, 20) !== heatColor(20, 8, 20));

  // ── Contrast: the defect this replaced ──
  // The old alpha ramp put the under-MEV floor at 1.26:1 (light) / 1.45:1 (dark) against
  // the untrained fill — the one state that asks the user to act was the least visible.
  // Every band must now clear the 3:1 non-text floor in BOTH themes. Measured off
  // HEAT_PAL directly so a retune in one theme cannot silently skip the other.
  const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) };
  const hex2 = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const lum = h => { const [r, g, b] = hex2(h); return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b) };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
  for (const mode of ['light', 'dark']) {
    const p = HEAT_PAL[mode];
    for (const band of ['under', 'ok', 'high', 'notgt']) {
      const r = contrast(p[band], p.none);
      T(`heat ${band} band ≥3:1 vs untrained fill (${mode})`, r >= 3, `${r.toFixed(2)}:1`);
    }
    // The under-MEV outline has to read against its own fill, not just the surface.
    const f = contrast(p.flag, p.under);
    T(`heat under-MEV outline ≥3:1 vs the amber it outlines (${mode})`, f >= 3, `${f.toFixed(2)}:1`);
  }
  // The pair the sweep above does NOT cover, and the reason it is pinned rather than fixed:
  // an UNTRAINED region (`none`) against the silhouette it sits on (`base`) measures
  // 1.09:1 light / 1.14:1 dark. Zero sets is at least as actionable as under-MEV, and it is
  // currently the least visible thing on the map. It is not fixed here because `none` is the
  // reference every band above is measured against — moving it re-derives all eight of those
  // ratios, which is a palette pass, not a token tweak. Pinned to the measured values so the
  // number cannot drift silently in either direction while it stays open (§15).
  {
    const l = contrast(HEAT_PAL.light.none, HEAT_PAL.light.base);
    const d = contrast(HEAT_PAL.dark.none, HEAT_PAL.dark.base);
    T('untrained-vs-silhouette contrast is pinned at its known-bad light value', Math.abs(l - 1.09) < 0.01, `${l.toFixed(2)}:1`);
    T('untrained-vs-silhouette contrast is pinned at its known-bad dark value', Math.abs(d - 1.14) < 0.01, `${d.toFixed(2)}:1`);
  }
  T('heat palette defines the same bands in both themes',
    JSON.stringify(Object.keys(HEAT_PAL.light).sort()) === JSON.stringify(Object.keys(HEAT_PAL.dark).sort()));
  // Every tracked muscle appears in at least one view.
  const covered = new Set([...BODY_REGIONS_F, ...BODY_REGIONS_B].map(r => r.m));
  T('body regions cover every MG_INFO key', MG_INFO.every(([k]) => covered.has(k)),
    MG_INFO.filter(([k]) => !covered.has(k)).map(([k]) => k).join());
  const hm = bodyHeatH({ chest: 9, back: 12, quads: 3 });
  T('bodyHeatH renders front + back SVGs', (hm.match(/<svg /g) || []).length === 2);
  T('bodyHeatH titles carry sets/wk', /Chest — 9 sets\/wk/.test(hm));
  T('bodyHeatH regions are tappable muscle selectors', /STAT_MG='chest'/.test(hm));
  T('bodyHeatH renders the legend', /heat-legend/.test(hm) && /under MEV/.test(hm));
  // ── Under-MEV never rests on hue alone (quads 3 vs MEV 8; chest 9 is over its MEV 8) ──
  const quadFill = hm.slice(hm.indexOf('STAT_MG=\'quads\'') - 400, hm.indexOf('STAT_MG=\'quads\'') + 20);
  T('under-MEV region carries the dashed outline', /stroke-dasharray/.test(quadFill), quadFill.slice(-160));
  const chestFill = hm.slice(hm.indexOf('STAT_MG=\'chest\'') - 400, hm.indexOf('STAT_MG=\'chest\'') + 20);
  T('a productive region carries NO outline (the cue means one thing)', !/stroke-dasharray/.test(chestFill));
  T('under-MEV state is also in the title text, not just the shape', /Quads — 3 sets\/wk · under MEV/.test(hm));
  T('legend explains the outline cue', /heat-legend[\s\S]*dashed/.test(hm));
}

// ── Rolling 8-week consistency (the status verdict's input) ──
{
  const d = freshD();
  const mk = (id, ago) => ({ id, date: daysAgoStr(ago), day: 'A', loc: 'home', ex: [] });
  // One ancient session, then a clean 3/wk for the last 8 weeks: lifetime average is
  // dragged (~1.3/wk) but the rolling window reads the current cadence.
  d.sessions = [mk('old', 140)];
  for (let i = 0; i < 24; i++) d.sessions.push(mk('r' + i, Math.floor(i * 56 / 24)));
  d.sessions.sort((a, b) => a.date.localeCompare(b.date));
  const c = consistency();
  T('lifetime perWk carries the old layoff', c.perWk < 1.5, c.perWk);
  T('perWk8 reads the recent 3/wk cadence', c.perWk8 >= 2.9 && c.perWk8 <= 3.2, c.perWk8);
  // A current 9-week layoff empties the window immediately.
  d.sessions = [mk('a', 120), mk('b', 110), mk('c', 100), mk('d', 90), mk('e', 63)];
  d.sessions.sort((a, b) => a.date.localeCompare(b.date));
  T('perWk8 sees a current layoff (window empty)', consistency().perWk8 === 0, consistency().perWk8);
  // A history younger than 8 weeks uses its own span — a strong fortnight isn't diluted.
  d.sessions = [0, 2, 4, 7, 9, 12].map((ago, i) => mk('y' + i, ago));
  d.sessions.sort((a, b) => a.date.localeCompare(b.date));
  const cy = consistency();
  T('young history divides by its own span', cy.perWk8 >= 2.9 && cy.perWk8 <= 3.6, cy.perWk8);
}

// ── audit fix: one delivery path for every notification ──
// notifyRestDone routed through reg.showNotification and explained why: page-context
// `new Notification` is not honoured on most mobile browsers, and on Android Chrome the
// constructor throws inside an installed PWA. The two notifications the user meets FIRST —
// the permission confirmation and the "Send test ping" button — used that constructor
// anyway, each behind a bare catch, so on Android both did nothing and did it silently.
// These assert the routing, not the rendering: the whole defect was a call going somewhere
// other than where the working one went.
{
  const realNav = globalThis.navigator, realNotification = global.Notification;
  const calls = { sw: [], ctor: [] };
  global.Notification = function (title, opts) { calls.ctor.push([title, opts]) };
  global.Notification.permission = 'granted';
  const reg = { showNotification: (title, opts) => { calls.sw.push([title, opts]); return Promise.resolve() } };
  setNavigator({ serviceWorker: { ready: Promise.resolve(reg) } });

  showNotif('Rest complete 💪', { tag: 'rft-rest' });
  showNotif('Notifications on ✓', { tag: 'rft-test' });
  showNotif('Test ping 🔔', { tag: 'rft-test' });
  // showNotif returns the ready-promise chain; drain it before reading the tallies.
  globalThis.navigator.serviceWorker.ready.then(() => {
    T('every notification goes through the service worker when one is available', calls.sw.length === 3, JSON.stringify(calls.sw.map(c => c[0])));
    T('...and none falls back to the page-context constructor', calls.ctor.length === 0, JSON.stringify(calls.ctor.map(c => c[0])));
    T('the confirmation and the test ping use the SAME path as the real rest ping',
      calls.sw.some(c => c[0] === 'Rest complete 💪') && calls.sw.some(c => c[0] === 'Notifications on ✓') && calls.sw.some(c => c[0] === 'Test ping 🔔'));

    // Desktop with no worker: the constructor is the documented fallback, not the primary.
    calls.sw.length = 0; calls.ctor.length = 0;
    setNavigator({});
    showNotif('Rest complete 💪', { tag: 'rft-rest' });
    T('with no service worker it falls back to the constructor', calls.ctor.length === 1, JSON.stringify(calls.ctor.map(c => c[0])));

    // A throwing constructor (Android's behaviour) must not take the caller down with it.
    calls.ctor.length = 0;
    global.Notification = function () { throw new TypeError('Illegal constructor') };
    let threw = false;
    try { showNotif('Rest complete 💪', {}) } catch (_) { threw = true }
    T('a throwing Notification constructor is contained', !threw);

    // notifTest carries the real ping's icon/badge — if the icon is what breaks delivery,
    // the test ping must break with it rather than passing on a lighter payload.
    setNavigator({ serviceWorker: { ready: Promise.resolve(reg) } });
    global.Notification = function (title, opts) { calls.ctor.push([title, opts]) };
    calls.sw.length = 0;
    notifTest('Test ping 🔔', 'Notifications are working.');
    globalThis.navigator.serviceWorker.ready.then(() => {
      const real = {}; { const ic = notifIcon(); if (ic) { real.icon = ic; real.badge = ic } }
      const sent = (calls.sw[0] || [])[1] || {};
      T('the test ping carries the same icon/badge as the real rest ping',
        sent.icon === real.icon && sent.badge === real.badge, JSON.stringify({ sent: sent.icon && 'set', real: real.icon && 'set' }));
      T('the test ping is tagged as a test, not as a rest ping', sent.tag === 'rft-test', sent.tag);

      setNavigator(realNav); global.Notification = realNotification;
      finish();
    });
  });
}

// The notification assertions above resolve on the microtask queue, so the tally has to be
// printed from their continuation — printing it inline would report a total taken before
// they ran and, worse, exit 0 while they were still pending. This suite is synchronous
// everywhere else; this is the one block that is not.
let FINISHED = false;
function finish() {
FINISHED = true;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
// If the block above ever stops calling finish() — a rejected promise, a renamed global —
// the process would drain its queue and exit 0 having printed no total at all. That is the
// same class of defect as the two suites that exited 0 with failing assertions, so it gets
// an explicit guard rather than trust.
process.on('exit', code => {
  if (code === 0 && !FINISHED) {
    console.log('\nFAIL: the suite exited without reporting — the async notification block never completed');
    process.exitCode = 1;
  }
});
