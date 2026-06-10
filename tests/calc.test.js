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
  '\n;global.__X={ALL_EX,SEED,PHASE_ADJ_IDS,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = {};
global.window = {}; // satisfies top-level `window.saveCardio = …` style handler assignments
eval(code);
const { ALL_EX, SEED, setD, getD } = global.__X;

let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };

// ── ALL_EX integrity ──
const ids = ALL_EX.map(e => e.id);
T('ALL_EX ids unique', new Set(ids).size === ids.length);
T('active zercher_a kept (not legacy stub)', ALL_EX.find(e => e.id === 'zercher_a').nm === 'Zercher Squat (Moderate)');

// ── tonnage (calcExVol) ──
T('carry excluded from tonnage', calcExVol('suitcase_march', 32, [40, 40, 40]) === 0);
T('legacy carry excluded', calcExVol('carry', 32, [1, 1, 1]) === 0);
T('bilateral barbell 46×15', calcExVol('deadlift', 46, [5, 5, 5]) === 690);
T('per_db doubles', calcExVol('db_ohp', 10, [10, 10, 10]) === 600);
T('perSide doubles', calcExVol('cossack_squat', 21, [8, 8, 8]) === 21 * 2 * 24);
T('per_db+perSide ×4', calcExVol('db_bss', 10, [8, 8, 8, 8]) === 10 * 4 * 32);
T('single-arm press not per_db', calcExVol('db_1arm_press', 8, [10, 10, 10]) === 8 * 2 * 30);

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

d.sessions = [{ id: 'x2', date: '2026-06-08', day: 'C', loc: 'home', ex: [{ id: 'pallof_press', wt: null, reps: [10, 10, 10], band: 'Purple' }] }];
sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'pallof_press'));
T('per-side band hit-target → up', sg.type === 'up', sg.text);

const ohp = getProgram(1, 'home').B.find(e => e.id === 'ohp');
d.sessions = [{ id: 'x3', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 80, reps: [7, 7, 7], band: '' }] }];
sg = getSmartSugg(ohp);
T('at plate ceiling → maxed', sg.maxed === true && sg.type === 'st', JSON.stringify(sg));

d.sessions = [{ id: 'x4', date: '2026-06-08', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 21, reps: [7, 7, 7], band: '' }] }];
sg = getSmartSugg(ohp);
T('normal hit-target → up', sg.type === 'up' && sg.wt > 21, JSON.stringify(sg));

const dl = getProgram(1, 'home').A.find(e => e.id === 'deadlift');
d.sessions = [{ id: 'x5', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 46, reps: [5, 5, 5], band: '' }] }];
T('confirm lift needs 2 hits', getSmartSugg(dl).type === 'cf');
d.sessions.push({ id: 'x6', date: '2026-06-10', day: 'A', loc: 'home', ex: [{ id: 'deadlift', wt: 46, reps: [5, 5, 5], band: '' }] });
T('confirmed → up', getSmartSugg(dl).type === 'up');

// stall ladder
d.sessions = [1, 2].map(i => ({ id: 'z' + i, date: '2026-06-0' + i, day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [4, 3, 3], band: '' }] }));
sg = getSmartSugg(ohp);
T('2 stalls → cluster hold', sg.type === 'stay' && /cluster/i.test(sg.text), sg.text);
d.sessions.push({ id: 'z3', date: '2026-06-03', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 31, reps: [4, 3, 3], band: '' }] });
sg = getSmartSugg(ohp);
T('3 stalls → drop weight', sg.type === 'dn' && sg.wt < 31, JSON.stringify(sg));

// ── KB progression (was a bare "Continue" fallback) ──
d = freshD();
d.sessions = [{ id: 'k1', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'dead_bugs_a', wt: 8, reps: [8, 8, 8], band: '' }] }];
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'dead_bugs_a'));
T('kb hit-target → up (not fallback Continue)', sg.type === 'up' && sg.wt > 8, JSON.stringify(sg));

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
// DB partner exercise has no phase adj → must NOT re-anchor.
T('db_ohp not in PHASE_ADJ_IDS', !global.__X.PHASE_ADJ_IDS.has('db_ohp'));
d = freshD({ phase: 2, phaseStart: '2026-06-09', location: 'partner' });
d.sessions = [{ id: 'p3', date: '2026-06-01', day: 'B', loc: 'partner', ex: [{ id: 'db_ohp', wt: 12, reps: [10, 10, 10], band: '' }] }];
sg = getSmartSugg(getProgram(2, 'partner').B.find(e => e.id === 'db_ohp'));
T('db exercise does not re-anchor on phase change', sg.type !== 'new', JSON.stringify(sg));

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

// ── migrateData recomputes stored volume ──
let dd = { sessions: [{ id: 'm1', date: '2026-06-01', day: 'C', loc: 'home', volume: 99999, ex: [{ id: 'cossack_squat', wt: 21, reps: [8, 8, 8], band: '' }, { id: 'suitcase_march', wt: 32, reps: [40, 40, 40], band: '' }] }] };
migrateData(dd);
T('migrate recomputes volume (perSide×2, carry excluded)', dd.sessions[0].volume === 21 * 2 * 24, dd.sessions[0].volume);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
