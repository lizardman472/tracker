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
  '\n;global.__X={ALL_EX,SEED,PHASE_ADJ_IDS,AW_KEY,VW,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = {};
global.window = {}; // satisfies top-level `window.saveCardio = …` style handler assignments
eval(code);
const { ALL_EX, SEED, VW, setD, getD } = global.__X;

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
d.sessions = [{ id: 'x1', date: '2026-06-08', day: 'C', loc: 'home', ex: [{ id: 'cossack_squat', wt: 21, reps: [8, 8, 8], band: '' }] }];
let sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'cossack_squat'));
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
const dbug = getProgram(1, 'home').A.find(e => e.id === 'dead_bugs_a');
T('dead_bugs_a is barbell on the 11kg straight-bar ladder', dbug.tp === 'bb' && dbug.bar === undefined && vwOf(dbug) === VW);
d.sessions = [{ id: 'k2', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 8, reps: [8, 8, 8], band: '' }] }];
sg = getSmartSugg(dbug);
T('legacy sub-bar KB load re-anchors to the empty bar', sg.type === 'new' && sg.wt === 11, JSON.stringify(sg));
d.sessions.push({ id: 'k3', date: '2026-06-10', day: 'A', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 11, reps: [8, 8, 8], band: '' }] });
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
T('freshState carries programVersion 12 (no migrate re-fire)', freshState().programVersion === 12);
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

// ── v24: home periodization realigned with the program ──
const PA = global.__X.PHASE_ADJ_IDS;
// Regression guard: every phase-adjust id must belong to an ACTIVE program at some
// location. A "dead" entry (pointing at a swapped-out lift) silently never fires and
// is how lm_lateral/lm_pallof lost their periodization in the landmine swap.
const activeProgIds = new Set();
for (const loc of ['home', 'partner']) for (const day of ['A', 'B', 'C']) for (const ex of getProgram(1, loc)[day]) activeProgIds.add(ex.id);
T('no dead PHASE_ADJ entries (all map to an active lift)', [...PA].every(id => activeProgIds.has(id)), [...PA].filter(id => !activeProgIds.has(id)).join(','));
// Landmine swap periodization restored on the current ids.
T('lm_lateral periodizes (restored from lateral_raise)', PA.has('lm_lateral'));
T('lm_pallof periodizes (restored from pallof_press)', PA.has('lm_pallof'));
// Swapped-out ids are gone from the adj map.
T('dead adj ids removed', !PA.has('deadlift') && !PA.has('lateral_raise') && !PA.has('pallof_press') && !PA.has('bb_row') && !PA.has('zercher_b'));
// Loaded accessories now periodize like their partner counterparts.
T('bb_curl periodizes (accessory parity with db_curl)', PA.has('bb_curl') && PA.has('bb_rear_row') && PA.has('bb_skullcr') && PA.has('hex_floor_press') && PA.has('cossack_squat'));
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

// ── core muscle group now tracked ──
d = freshD();
d.sessions = [{ id: 'c1', date: today(), day: 'A', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 8, reps: [8, 8, 8], band: '' }] }];
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
// db_lateral is 4 sets on partner Day A but 3 sets on Day B.
d = freshD({ location: 'partner' });
d.sessions = [{ id: 'xd1', date: '2026-06-08', day: 'B', loc: 'partner', ex: [{ id: 'db_lateral', wt: 5, reps: [15, 15, 15], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'partner').A.find(e => e.id === 'db_lateral'));
T('clean 3-set B session counts as a hit on the 4-set A day', sg.type === 'up', JSON.stringify(sg));

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

  // Lock in two behaviors the fix depends on (source checks, same style as the saveAW guard):
  T('finishW stamps session date from workout START, not save time', /date:ymd\(new Date\(SS\|\|Date\.now\(\)\)\)/.test(String(finishW)), String(finishW).slice(0, 80));
  T('resumeW clamps CIDX to the current day length', /CIDX=Math\.min\(CIDX/.test(String(resumeW)));
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
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
  T('weeklyMarks flags the deload week with the target color', dMark && series[dMark.i].wk === weekKey(wkAgo(2)) && dMark.color === '#fb7185', JSON.stringify(dMark));
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

// ── Ultra audit C8: SEED hygiene — demo bootstrap no longer trips the v12 migration ──
{
  T('SEED carries programVersion 12', SEED.programVersion === 12);
  T('SEED has no dead confirmed field', SEED.confirmed === undefined);
  const sClone = structuredClone(SEED);
  migrateToV12(sClone);
  T('migrateToV12 is a no-op on the SEED (phaseStart preserved)', sClone.phaseStart === SEED.phaseStart && sClone.phase === 1);
  const v11 = { sessions: [], phase: 3, phaseStart: '2025-01-01', confirmed: { x: 1 }, dayCFocus: 'y' };
  migrateToV12(v11);
  T('a real pre-v12 store still gets the migration reset', v11.programVersion === 12 && v11.phase === 1 && v11.phaseStart !== '2025-01-01' && v11.confirmed === undefined && v11.dayCFocus === undefined);
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

  // resetAll adopts the sidecar gen so the wipe cannot be un-done by the conflict merge.
  T('resetAll adopts the sidecar gen (source check)', /D=freshState\(\);try\{D\.gen=Number\(localStorage\.getItem\(SK\+'-gen'\)\)/.test(String(resetAll)), String(resetAll));
  store4['rft-v12-gen'] = '7';
  setD(Object.assign(freshState(), { gen: 7 })); // what resetAll produces before its save()
  T('reset-state save succeeds', save() === true);
  const wiped = JSON.parse(store4['rft-v12']);
  T('a wipe with adopted gen does not resurrect the old sessions', wiped.sessions.length === 0 && wiped.gen === 8, JSON.stringify({ n: wiped.sessions.length, gen: wiped.gen }));
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
