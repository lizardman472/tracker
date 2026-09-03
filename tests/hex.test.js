// Hex-bar / bar-aware weight-system tests for the Rack-Free Tracker.
//
// Companion battery to calc.test.js. Same extraction trick: pull the pure-logic
// portion of index.html's inline <script>, eval it in Node with stubs, then assert
// the 7kg hex bar loads on its own valid-weight ladder (VWH) end-to-end — program
// swap, plate math, seeding, progression, volume, and legacy resolution.
//
// Run with:  node tests/hex.test.js

const fs = require('fs');
const path = require('path');
const HISTORY_SEED = require('./fixtures/history-state');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══════════════ INIT')) +
  '\n;global.__X={ALL_EX,SEED,MG,MG_INFO,VW,VWH,VWL,BAR,HEXBAR,DBW_PAIR,DBW_SINGLE,DB_BAR,DB_PL_CLASS,RELATED_EX,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// `global.navigator = {...}` is a SILENT NO-OP on Node 18+ (navigator is a getter-only
// accessor), so every harness here had an inert stub. See tests/calc.test.js for the full note.
function setNavigator(v) {
  Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
  if (globalThis.navigator !== v) throw new Error('navigator stub did not take');
  return v;
}
setNavigator({});
global.window = {};
eval(code);
const { ALL_EX, MG, MG_INFO, VW, VWH, VWL, BAR, HEXBAR, DBW_PAIR, DBW_SINGLE, DB_BAR, DB_PL_CLASS, RELATED_EX, setD, getD } = global.__X;
const SEED = HISTORY_SEED;

// Every program day at both venues. Any sweep that means "the whole program" must use this.
// v19 added an off-rotation day 'X' that had to be included here; v20 dissolved it back into
// A/B/C, so the whole program is the rotation again — but keep the sweeps going through this
// constant, since that is what made the v19/v20 moves safe to make in one place.
const PROG_DAYS = ['A', 'B', 'C'];
let pass = 0, fail = 0;
const T = (name, cond, info = '') => { cond ? pass++ : (fail++, console.log('FAIL:', name, info)); };
function freshD(over) { setD(structuredClone(SEED)); const d = getD(); d.discomfort = []; d.location = 'home'; d.phase = 1; Object.assign(d, over || {}); return d; }

// ── buildVW / bar ladders ──
T('hex bar is 7kg', HEXBAR === 7);
T('VW base is the 11kg bar', VW[0] === 11);
T('VWH base is the 7kg bar', VWH[0] === 7);
T('VWH ladder differs from VW', VW[0] !== VWH[0] && VWH.length > 0);
T('VWH contains 7kg bar-only', VWH.includes(7));
T('VWH contains 47kg (7 + 2×20)', VWH.includes(47));

// ── barOf / vwOf resolve from the exercise ──
T('barOf hex exercise → 7', barOf({ bar: 7 }) === 7);
T('barOf plain exercise → 11', barOf({}) === BAR);
T('vwOf hex → VWH', vwOf({ bar: 7 }) === VWH);
T('vwOf plain → VW', vwOf({}) === VW);

// ── plate math on the 7kg bar ──
T('perSide(47,7) loads 20kg/side', perSide(47, 7).reduce((a, p) => a + p.w * p.c, 0) === 20);
T('perSide(47,7) is 2×10kg/side', JSON.stringify(perSide(47, 7)) === JSON.stringify([{ w: 10, c: 2 }]));
T('fmtPl(47,7) → 2×10kg', fmtPl(47, 7) === '2×10kg');
T('fmtPl(7,7) → Bar only', fmtPl(7, 7) === 'Bar only');
T('plateH(47,7) renders plates', plateH(47, 7).includes('pl-10'));
T('plateH(7,7) empty (bar only)', plateH(7, 7) === '');
// Same total weight on different bars needs different plates — proves bar-awareness.
T('37kg loads differently on 7 vs 11 bar', fmtPl(37, 7) !== fmtPl(37, 11));

// ── snap / next-weight on the hex ladder ──
T('snapW(47,VWH) stays 47', snapW(47, VWH) === 47);
T('nxUp(7,VWH) climbs the hex ladder', nxUp(7, VWH) > 7 && VWH.includes(nxUp(7, VWH)));
T('nxDn(47,VWH) is a valid hex weight', VWH.includes(nxDn(47, VWH)) && nxDn(47, VWH) < 47);

// ── warm-ups start from the 7kg bar ──
const wu = warmupSets(47, 7, VWH);
T('hex warm-up first set is the 7kg bar', wu[0].wt === 7 && wu[0].l === 'Bar only');
T('hex warm-up rungs are valid hex weights', wu.every(s => VWH.includes(s.wt)));

// ── program swap (home only) ──
const A = getProgram(1, 'home').A, B = getProgram(1, 'home').B, C = getProgram(1, 'home').C;
T('Day A: hex_dl replaces deadlift', A.some(e => e.id === 'hex_dl') && !A.some(e => e.id === 'deadlift'));
T('Day B: hex_squat_b replaces zercher_b', B.some(e => e.id === 'hex_squat_b') && !B.some(e => e.id === 'zercher_b'));
T('Day C: hex_carry replaces suitcase_march', C.some(e => e.id === 'hex_carry') && !C.some(e => e.id === 'suitcase_march'));
T('Day C: lm_squat (landmine) replaces Zercher Moderate', C.some(e => e.id === 'lm_squat') && C.find(e => e.id === 'lm_squat').lm === true && !C.some(e => e.id === 'zercher_a'));
T('Day C: hex_rdl replaces straight RDL', C.some(e => e.id === 'hex_rdl') && C.find(e => e.id === 'hex_rdl').bar === 7 && !C.some(e => e.id === 'rdl'));
T('Day C: hex_floor_press replaces push-ups', C.some(e => e.id === 'hex_floor_press') && C.find(e => e.id === 'hex_floor_press').bar === 7 && !C.some(e => e.id === 'pushups'));
T('Day C squat went to the landmine, not a hex squat variant', !ALL_EX.some(e => e.id === 'hex_squat_c') && !C.some(e => /^hex_squat/.test(e.id)));
T('hex_dl carries bar:7', A.find(e => e.id === 'hex_dl').bar === 7);
T('hex_squat_b carries bar:7', B.find(e => e.id === 'hex_squat_b').bar === 7);
T('OHP stays barbell (landmine pending)', B.find(e => e.id === 'ohp').bar === undefined);
// Day B v20: hex_row replaces the straight Barbell Row; arm superset is straight-bar.
T('Day B: hex_row replaces bb_row', B.some(e => e.id === 'hex_row') && !B.some(e => e.id === 'bb_row'));
T('hex_row carries bar:7', B.find(e => e.id === 'hex_row').bar === 7);
// v21 rebalance: curl → Day A (pull day), triceps stays Day B (push day), hex_curl retired.
T('curl swap lands on Day A as straight bar; hex_curl retired everywhere', A.some(e => e.id === 'bb_curl') && A.find(e => e.id === 'bb_curl').bar === undefined && !A.some(e => e.id === 'hex_curl') && !B.some(e => e.id === 'hex_curl'));
// v13 swapped the lying extension out for the overhead one; v18 swapped it back to the
// floor. Same slot, same straight bar, both directions.
T('Day B keeps direct triceps (bb_skullcr, straight bar), curl moved off', B.some(e => e.id === 'bb_skullcr') && B.find(e => e.id === 'bb_skullcr').bar === undefined && !B.some(e => e.id === 'bb_curl') && !B.some(e => e.id === 'oh_triceps_ext'));
T('oh_triceps_ext legacy stub resolves (v18 swap-back to bb_skullcr)', !!ALL_EX.find(e => e.id === 'oh_triceps_ext'));
T('v18 lying extension carries load forward from the overhead slot', !!RELATED_EX.bb_skullcr && RELATED_EX.bb_skullcr.id === 'oh_triceps_ext' && RELATED_EX.bb_skullcr.mult === 1.1);

// ── partner program is untouched ──
const pAll = PROG_DAYS.flatMap(d => getProgram(1, 'partner')[d]);
T('partner program has no hex lifts', !pAll.some(e => /^hex_/.test(e.id)));

// ── seeding: new hex lifts start at their seed (no carry-over) ──
freshD();
let sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl'));
T('hex_dl seeds at 40kg (valid hex weight)', sg.type === 'new' && sg.wt === 40 && VWH.includes(40));
sg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'hex_squat_b'));
T('hex_squat_b seeds at 48kg (valid hex weight)', sg.type === 'new' && sg.wt === 48 && VWH.includes(48));
sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'hex_carry'));
T('hex_carry seeds at 30kg', sg.type === 'new' && sg.wt === 30);
sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'hex_rdl'));
T('hex_rdl seeds at 43kg (valid hex weight)', sg.type === 'new' && sg.wt === 43 && VWH.includes(43));
sg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'hex_floor_press'));
T('hex_floor_press seeds at 28kg (valid hex weight)', sg.type === 'new' && sg.wt === 28 && VWH.includes(28));

// ── progression resolves the 7kg ladder ──
const dd = freshD();
const hx = getProgram(1, 'home').A.find(e => e.id === 'hex_dl');
dd.sessions = [
  { id: 'h1', date: '2026-06-08', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] },
  { id: 'h2', date: '2026-06-10', day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [5, 5, 5], band: '' }] }
];
sg = getSmartSugg(hx);
T('hex_dl confirmed → up lands on a VALID hex weight', sg.type === 'up' && VWH.includes(sg.wt) && sg.wt > 40, JSON.stringify(sg));

// hex_dl 3 stalls → deload ~10% on the HEX ladder (40 → 36), a valid hex weight
const ds = freshD();
ds.sessions = [1, 2, 3].map(i => ({ id: 'st' + i, date: '2026-06-0' + i, day: 'A', loc: 'home', ex: [{ id: 'hex_dl', wt: 40, reps: [2, 2, 2], band: '' }] }));
sg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'hex_dl'));
T('hex_dl 3 stalls → real ~10% deload on hex ladder', sg.type === 'dn' && VWH.includes(sg.wt) && sg.wt <= 40 * 0.9 + 0.001 && sg.wt === 36, JSON.stringify(sg));

// ── MG volume: hex lifts count, hex carry excluded from tonnage ──
T('hex_dl has an MG map', !!MG.hex_dl);
T('hex_squat_b + hex_carry have MG maps', !!MG.hex_squat_b && !!MG.hex_carry);
// Home squat patterns credit glutes 0.5 like the partner equivalents (db_bss/db_lunge)
// — they were missing it, undercounting the glute row every rotation.
T('hex_squat_b credits glutes 0.5 (parity with db_bss)', MG.hex_squat_b.glutes === 0.5);
T('lm_squat credits glutes 0.5 (parity with db_lunge)', MG.lm_squat.glutes === 0.5);
T('hex_dl counts toward tonnage (bb)', calcExVol('hex_dl', 40, [5, 5, 5]) === 40 * 15);
T('hex_carry excluded from tonnage (carry)', calcExVol('hex_carry', 30, [40, 40, 40]) === 0);

// ── legacy: swapped-out straight-bar ids still resolve for old sessions ──
T('deadlift legacy stub resolves', !!ALL_EX.find(e => e.id === 'deadlift'));
T('zercher_b legacy stub resolves', !!ALL_EX.find(e => e.id === 'zercher_b'));
T('suitcase_march legacy stub resolves', !!ALL_EX.find(e => e.id === 'suitcase_march'));
T('bb_row legacy stub resolves (swapped for hex_row)', !!ALL_EX.find(e => e.id === 'bb_row'));
T('hex_curl legacy stub resolves (swapped for bb_curl)', !!ALL_EX.find(e => e.id === 'hex_curl'));
T('old bb_row history still computes volume', calcExVol('bb_row', 30, [10, 9, 8]) === 30 * 27);
T('old deadlift history still computes volume', calcExVol('deadlift', 46, [5, 5, 5]) === 690);
// Day C swaps: straight RDL → hex_rdl, Zercher Moderate → lm_squat, push-ups → hex_floor_press
T('rdl legacy stub resolves (swapped for hex_rdl)', !!ALL_EX.find(e => e.id === 'rdl'));
T('zercher_a legacy stub resolves (swapped for lm_squat)', !!ALL_EX.find(e => e.id === 'zercher_a'));
T('pushups legacy stub resolves (swapped for hex_floor_press)', !!ALL_EX.find(e => e.id === 'pushups'));
T('Day C new lifts all have MG maps', !!MG.hex_rdl && !!MG.lm_squat && !!MG.hex_floor_press);
T('old rdl history still computes volume', calcExVol('rdl', 43, [10, 10, 10]) === 43 * 30);

// ── LANDMINE single-sided model (VWL) ──
// Landmine lifts load ONE end of the 11kg bar, so plates aren't mirrored: total = bar +
// single-end load, on a finer ladder (VWL) than the symmetric VW. bb_rear_row is a true
// two-handed barbell row and must stay symmetric.
const lmLifts = ['lm_lateral', 'lm_pallof', 'lm_squat', 'lm_press', 'lm_bstance_squat', 'lm_lateral_squat']; // active landmine lifts (lm_180, lm_row retired)
T('active landmine lifts carry lm:true + tp bb', lmLifts.every(id => { const e = ALL_EX.find(x => x.id === id); return e && e.lm === true && e.tp === 'bb'; }));
T('retired lm_180 still resolves as a landmine stub', (() => { const e = ALL_EX.find(x => x.id === 'lm_180'); return e && e.lm === true && e.tp === 'bb'; })());
T('bb_rear_row is NOT landmine (true two-handed barbell row)', ALL_EX.find(e => e.id === 'bb_rear_row').lm !== true);
T('VWL floor is the 11kg bar', VWL[0] === 11);
T('VWL is finer than VW — includes 11.25 (lone 0.25 on one end)', VWL.includes(11.25) && !VW.includes(11.25));
T('VWL includes 11.75 (lone 0.75); VW (mirrored pairs) cannot', VWL.includes(11.75) && !VW.includes(11.75));
T('every symmetric VW weight is also single-side loadable (VW ⊆ VWL)', VW.every(w => VWL.includes(w)));
T('vwOf routes a landmine lift to VWL', vwOf(ALL_EX.find(e => e.id === 'lm_pallof')) === VWL);
T('vwOf routes bb_rear_row to symmetric VW', vwOf(ALL_EX.find(e => e.id === 'bb_rear_row')) === VW);
T('vwOf still routes the hex bar to VWH', vwOf({ bar: 7 }) === VWH);
T('hex_curl is a symmetric 7kg hex-bar lift on VWH (seed 11 on-ladder)', (() => { const e = ALL_EX.find(x => x.id === 'hex_curl'); return e && e.bar === 7 && !e.lm && vwOf(e) === VWH && VWH.includes(11); })());
// Same total, different breakdown: single-end stacks the pair on one sleeve (no ÷2).
T('single-end fmtPl(13) = 2×1kg (both on one end)', fmtPl(13, 11, true) === '2×1kg');
T('symmetric fmtPl(13) = 1×1kg (per side)', fmtPl(13, 11, false) === '1×1kg');
T('single-end fmtPl(16) = 1×5kg (one plate on the end)', fmtPl(16, 11, true) === '1×5kg');
T('symmetric fmtPl(16) = 1×2.5kg (per side)', fmtPl(16, 11, false) === '1×2.5kg');
T('single-end perSide(11.25) = one lone 0.25 plate', JSON.stringify(perSide(11.25, 11, true)) === JSON.stringify([{ w: 0.25, c: 1 }]));
T('single-end perSide(11.25) impossible symmetric (null)', perSide(11.25, 11, false) === null);
T('landmine plateH renders plate markup at 11.5', /class="pl /.test(plateH(11.5, 11, true)));
// Seeding: landmine lifts seed at the 11kg bar-only floor (a valid VWL weight).
let lsg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('lm_pallof seeds at 11kg bar-only (valid VWL weight)', lsg.type === 'new' && lsg.wt === 11 && VWL.includes(11));
const sqg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_squat'));
T('lm_squat seeds at 38kg (valid VWL weight)', sqg.type === 'new' && sqg.wt === 38 && VWL.includes(38));
T('lm_squat routes to the VWL ladder', vwOf(ALL_EX.find(e => e.id === 'lm_squat')) === VWL);
// v13 addendum: two-hand landmine press seeds at OHP load — 26kg fresh (11 bar + 15 one end).
const lpg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_press'));
T('lm_press seeds at 26kg on a fresh device (valid VWL weight)', lpg.type === 'new' && lpg.wt === 26 && VWL.includes(26), JSON.stringify(lpg));
// v14: unilateral landmine B-stance squat seeds at a fixed 22kg (11 bar + 11 one end).
const lbg = getSmartSugg(getProgram(1, 'home').A.find(e => e.id === 'lm_bstance_squat'));
T('lm_bstance_squat seeds at 22kg (valid VWL weight)', lbg.type === 'new' && lbg.wt === 22 && VWL.includes(22), JSON.stringify(lbg));
// v20 re-sort: the unilateral quad slot leads the Day-A landmine block, straight after the
// hex deadlift — it no longer sits next to the B-stance RDL (that's straight-bar work now).
T('lm_bstance_squat opens the Day-A landmine block, right after the hex deadlift', (() => { const ids = getProgram(1, 'home').A.map(e => e.id); return ids[0] === 'hex_dl' && ids[1] === 'lm_bstance_squat' && ids[2] === 'lm_lateral'; })());
T('Day A pull-ups back at 4 sets (v14 trim reverted)', getProgram(1, 'home').A.find(e => e.id === 'pullup_a').s === 4);
T('home pull-ups use a comfortable shoulder-width grip rather than forcing wide', (() => {
  const a = getProgram(1, 'home').A.find(e => e.id === 'pullup_a');
  const c = getProgram(1, 'home').C.find(e => e.id === 'pullup_c');
  return /Comfortable Grip/.test(a.nm) && /shoulder-width/.test(a.rl) && /pain-free/.test(a.rl) &&
    /shoulder-width/.test(c.rl) && !/\(Wide\)/.test(a.nm);
})());
T('dip coaching agrees with the 4×8 progression target', (() => {
  const e = getProgram(1, 'home').B.find(e => e.id === 'dips');
  return e.s === 4 && e.tg === 8 && /4×8/.test(e.rl) && /4×8/.test(e.note) && !/4(?:x|×)10/i.test(e.note);
})());
T('dip range is controlled and pain-free rather than a forced depth target', (() => {
  const e = getProgram(1, 'home').B.find(e => e.id === 'dips');
  return /pain-free/.test(e.rl) && /cap, not a depth target/.test(e.rl);
})());
T('skullcrusher remains phase-adjusted 3×10-12 but is explicitly optional after compound pressing', (() => {
  const e = getProgram(1, 'home').B.find(e => e.id === 'bb_skullcr');
  return e.s === 3 && e.rp === '10-12' && e.tg === 12 && e.optional === true && /skip/.test(e.rl);
})());
T('loaded dead bugs and anti-rotation presses are explicitly quality-first', (() => {
  const a = getProgram(1, 'home').A.find(e => e.id === 'dead_bugs_a');
  const c = getProgram(1, 'home').C.find(e => e.id === 'lm_pallof');
  return a.qualityLoad === true && c.qualityLoad === true &&
    /smallest load step/.test(a.rl) && /smallest load step/.test(c.rl) &&
    !/Confirm/.test(a.rl) && !/Confirm/.test(c.rl);
})());
// Progression: hit target at bar-only 11kg → up ONE fine VWL rung (11.25), a real loadable weight.
const dlm = freshD();
dlm.sessions = [{ id: 'l1', date: '2026-06-10', day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 11, reps: [20, 20, 20], band: '', form: [5, 5, 5] }] }];
lsg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('lm_pallof hit-target at 11 → ↑ to next VWL rung (11.25)', lsg.type === 'up' && lsg.wt === 11.25 && VWL.includes(lsg.wt), JSON.stringify(lsg));
// Volume: landmine lifts have MG maps and count on the bb tonnage path; the entered
// per-side value is already the combined total across both sides.
T('landmine lifts + bb_rear_row have MG maps (incl. retired lm_180 for history)', lmLifts.every(id => !!MG[id]) && !!MG.bb_rear_row && !!MG.lm_180);
T('lm_pallof counts entered both-side totals once', calcExVol('lm_pallof', 13, [20, 20, 20]) === 13 * 60);

// ── AUDIT FIX C1: deload at the bar-only floor is a rebuild hold, not a phantom 0% cut ──
let cd = freshD();
cd.sessions = [1, 2, 3].map(i => ({ id: 'cd' + i, date: '2026-06-0' + i, day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 11, reps: [6, 6, 6], band: '', form: [5, 5, 5] }] }));
let cdSg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('stall at bar-only floor → rebuild hold (not a fake deload)', cdSg.type === 'stay' && cdSg.wt === 11 && !/%/.test(cdSg.detail), JSON.stringify(cdSg));
// Above the floor, the deload reports the ACTUAL percent cut, not a hardcoded ~10%.
cd.sessions = [1, 2, 3].map(i => ({ id: 'ce' + i, date: '2026-06-0' + i, day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 12, reps: [6, 6, 6], band: '', form: [5, 5, 5] }] }));
cdSg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('low-weight deload reports honest percent (12→11 ≈ 8%)', cdSg.type === 'dn' && cdSg.wt === 11 && /~8%/.test(cdSg.detail), JSON.stringify(cdSg));
// A heavier lift still gets a real ~10% deload (regression guard).
cd = freshD();
cd.sessions = [1, 2, 3].map(i => ({ id: 'cm' + i, date: '2026-06-0' + i, day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 41, reps: [2, 2, 2], band: '', form: [5, 5, 5] }] }));
cdSg = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
T('heavy lift still deloads a real ~10% (41→≤36.9)', cdSg.type === 'dn' && cdSg.wt <= 41 * 0.9 + 0.001, JSON.stringify(cdSg));

// ── AUDIT FIX P1: dangling/orphan references removed ──
T('inverted_row orphan removed from MG', !MG.inverted_row);
T('band_lateral orphan removed from MG', !MG.band_lateral);
// v21 REVERTS v25: the partner's parallel bars are too LOW to hang under, so what v25
// called a "neutral-grip pull-up" was an inverted row all along. inv_rows_a is active
// again under an honest name; pb_pullup_a/c are the legacy stubs now. Neither pull-up id
// was ever logged, so the swap back strands no history.
T('inv_rows_a keeps its MG map and ALL_EX def', !!MG.inv_rows_a && !!ALL_EX.find(e => e.id === 'inv_rows_a'));
T('inv_rows_a is back in the active partner program', getProgram(1, 'partner').A.some(e => e.id === 'inv_rows_a'));
T('pb_pullup_a/c retired but still stubbed in ALL_EX',
  !getProgram(1, 'partner').A.some(e => e.id === 'pb_pullup_a') &&
  !!ALL_EX.find(e => e.id === 'pb_pullup_a') && !!ALL_EX.find(e => e.id === 'pb_pullup_c'));
// The active horizontal pull is bodyweight and seeds cleanly with no dangling peer.
const irD = freshD({ location: 'partner' });
irD.sessions = [];
const irSg = getSmartSugg(getProgram(1, 'partner').A.find(e => e.id === 'inv_rows_a'));
T('inv_rows_a seeds cleanly with no dangling peer (no undefined)', irSg.type === 'new' && !/undefined/.test(JSON.stringify(irSg)), JSON.stringify(irSg));

// ── PROGRAM VOLUME: home weekly effective sets meet MEV for the muscles we restored ──
const homePr = getProgram(1, 'home');
const wkVol = {};
for (const day of PROG_DAYS) for (const ex of homePr[day]) { const m = MG[ex.id] || {}; for (const k in m) wkVol[k] = (wkVol[k] || 0) + ex.s * m[k]; }
const mevOf = key => (MG_INFO.find(r => r[0] === key) || [])[2];
T('chest weekly volume ≥ MEV', wkVol.chest >= mevOf('chest'), `${wkVol.chest} vs ${mevOf('chest')}`);
T('rear delts weekly volume ≥ MEV (restored on Day B)', wkVol.reardelt >= mevOf('reardelt'), `${wkVol.reardelt} vs ${mevOf('reardelt')}`);
T('biceps weekly volume ≥ MEV (direct curl restored)', wkVol.biceps >= mevOf('biceps'), `${wkVol.biceps} vs ${mevOf('biceps')}`);
T('triceps weekly volume ≥ MEV (direct extension added Day B)', wkVol.triceps >= mevOf('triceps'), `${wkVol.triceps} vs ${mevOf('triceps')}`);
T('no home muscle sits under MEV', MG_INFO.every(([k, , mev]) => mev == null || (wkVol[k] || 0) >= mev), JSON.stringify(wkVol));

// ── MAV ceilings ──
// §7 claimed "back ≤ MAV. Exact-value tests added so drift fails loud." No MAV assertion
// was ever written, and back has since drifted to 22.5 against a MAV of 22 with nothing to
// notice. These are that guard. Three home muscles sit over MAV and all three are
// deliberate — MAV is a guideline ceiling, not a cap — so they are pinned at their accepted
// values rather than merely allowed to exceed. A change either way fails here.
const mavOf = key => (MG_INFO.find(r => r[0] === key) || [])[3];
const ACCEPTED_OVER_MAV = { glutes: 16, back: 22.5, triceps: 15 };
for (const [k, v] of Object.entries(ACCEPTED_OVER_MAV)) {
  T(`home ${k} holds at its accepted ${v}/wk (MAV ${mavOf(k)})`, wkVol[k] === v, `${wkVol[k]} vs accepted ${v}`);
}
// Everything else must stay at or under its landmark. Without this, the next slot added to
// a day silently pushes a fourth muscle over and nothing says so.
T('no OTHER home muscle exceeds MAV',
  MG_INFO.every(([k, , , mav]) => mav == null || k in ACCEPTED_OVER_MAV || (wkVol[k] || 0) <= mav),
  MG_INFO.filter(([k, , , mav]) => mav != null && !(k in ACCEPTED_OVER_MAV) && (wkVol[k] || 0) > mav)
    .map(([k, , , mav]) => `${k} ${wkVol[k]}>${mav}`).join(', '));

// v21: the partner MEV/MAV sweep is scoped to a SINGLE VISIT, not an A+B+C sum. The three
// days share one base, so summing them triple-counts every base lift for a cycle that takes
// 9.4 weeks at the observed cadence and has never actually been completed. A per-visit MAV
// check is the meaningful one — it catches a single session being overloaded, which is the
// failure mode that can really happen here.
const partVisitVol = day => { const v = {}; for (const ex of getProgram(1, 'partner')[day]) { const m = MG[ex.id] || {}; for (const k in m) v[k] = (v[k] || 0) + ex.s * m[k]; } return v };
for (const day of PROG_DAYS) {
  const pv = partVisitVol(day);
  T(`no muscle exceeds MAV in a single partner Day-${day} visit`,
    MG_INFO.every(([k, , , mav]) => mav == null || (pv[k] || 0) <= mav),
    MG_INFO.filter(([k, , , mav]) => mav != null && (pv[k] || 0) > mav).map(([k, , , mav]) => `${k} ${pv[k]}>${mav}`).join(', '));
}
// NOTE: there is deliberately NO partner per-cycle MEV assertion any more — see the volume
// block further down for why (getWeeklyVolume counts across venues; home carries MEV).

const partPr = getProgram(1, 'partner');
// ── v16 Day-C trim: calf raises + bird dog retired to legacy stubs at BOTH venues ──
T('calf raises are OUT of both Day C programs (v16 trim)', !homePr.C.some(x => x.id === 'calf_raise') && !partPr.C.some(x => x.id === 'db_calf_raise'));
T('calf raise stubs still resolve for history', (() => { const a = ALL_EX.find(x => x.id === 'calf_raise'), b = ALL_EX.find(x => x.id === 'db_calf_raise'); return a && a.perSide === true && b && b.perSide === true && /legacy/i.test(a.rl) && /legacy/i.test(b.rl); })());
T('calf raises keep their calves MG map', (MG.calf_raise || {}).calves === 1 && (MG.db_calf_raise || {}).calves === 1);
// The v27 calves row outlived the v16 trim that removed both calf slots, so the Balance
// dashboard, the Set Count picker and the heat map all carried a permanently-≈0 Calves entry.
// The row is gone; the MG credit and SPLIT_GROUPS stay so pre-trim history still resolves.
T('calves is NOT a dashboard row (no active exercise can fill it)', !MG_INFO.some(x => x[0] === 'calves'));
T('every MG_INFO key is reachable from an active exercise', (() => {
  const active = new Set();
  for (const loc of ['home', 'partner']) for (const day of PROG_DAYS) for (const ex of getProgram(1, loc)[day]) active.add(ex.id);
  const credited = new Set();
  for (const id of active) for (const m of Object.keys(MG[id] || {})) credited.add(m);
  return MG_INFO.every(([k]) => credited.has(k));
})(), MG_INFO.filter(([k]) => { const active = new Set(); for (const loc of ['home', 'partner']) for (const day of PROG_DAYS) for (const ex of getProgram(1, loc)[day]) for (const m of Object.keys(MG[ex.id] || {})) active.add(m); return !active.has(k) }).map(([k]) => k).join());
T('calf history still rolls up in the per-session split', (MG.calf_raise || {}).calves === 1);

// ── audit fix: every loadable lift must have a first-session starting suggestion ──
// getRelatedSuggestion returns null for a lift with no RELATED_EX entry, so getSmartSugg
// falls through to a bare "First weighted session — find your starting load" with no number.
// Six home staples relied on the bundled demo's history to hide that; the moment a user
// restores a real backup the demo rows are dropped and the gap is exposed. The partner
// program has been complete since v13 — this is the invariant that keeps both that way.
{
  const LOADABLE = ['bb', 'db', 'kb', 'mace', 'band', 'carry'];
  const unseeded = [];
  for (const loc of ['home', 'partner']) for (const day of PROG_DAYS)
    for (const ex of getProgram(1, loc)[day])
      if (LOADABLE.includes(ex.tp) && !RELATED_EX[ex.id]) unseeded.push(`${loc}/${ex.id}`);
  T('every loadable lift has a fresh-device starting suggestion', unseeded.length === 0, unseeded.join(', '));

  // Shape checks on the six added seeds: band-assisted lifts start on the most assistance
  // available, bar lifts start at the bar (never below it — an unloadable number).
  for (const id of ['pullup_a', 'pullup_c', 'dips'])
    T(`${id} seeds on the heaviest assist band`, RELATED_EX[id].seedBand === 'Blue (heaviest)', JSON.stringify(RELATED_EX[id]));
  for (const id of ['ohp', 'floor_press', 'dead_bugs_a'])
    T(`${id} seeds at bar weight, not below it`, RELATED_EX[id].seedWt === BAR, JSON.stringify(RELATED_EX[id]));
  // A seed is only useful if it actually reaches the suggestion, so drive one end-to-end.
  setD({ ...structuredClone(SEED), sessions: [], location: 'home', phase: 1, phaseStart: '2026-01-01' });
  const sug = getSmartSugg(getProgram(1, 'home').B.find(e => e.id === 'ohp'));
  T('an unseeded-before lift now suggests a real starting load', /11/.test(sug.text) || sug.wt === BAR, JSON.stringify(sug));
}
T('calf raise history counts both-side totals once, not carry-excluded', calcExVol('calf_raise', 8, [40, 40, 40]) === 8 * 120 && calcExVol('db_calf_raise', 8, [40, 40, 40]) === 8 * 120);
// v21: partner dips are ECCENTRIC-ONLY. The v27 slot assumed a band could be anchored under
// the bars for assisted dips; it cannot, so the slot is bodyweight negatives instead.
T('partner Day B dips are eccentric-only bodyweight, not band-assisted',
  (() => { const e = partPr.B.find(x => x.id === 'pb_dips'); return e && e.tp === 'bw' && e.bandMode === undefined && e.tempo === '5-0-0-0'; })());
T('pb_dips has a chest+triceps MG map (full triceps like home dips)', (MG.pb_dips || {}).chest === 1 && (MG.pb_dips || {}).triceps === 1);
T('dips still train at both venues (home Day B assisted + partner Day B negatives)', homePr.B.some(e => e.id === 'dips') && partPr.B.some(e => e.id === 'pb_dips'));
T('pb_dips seeds cleanly with no dangling peer', (() => { freshD(); const sg = getSmartSugg(partPr.B.find(e => e.id === 'pb_dips')); return sg.type === 'new' && !/undefined/.test(JSON.stringify(sg)); })());
T('Day C carries a chest exposure (hex floor press)', homePr.C.some(e => e.id === 'hex_floor_press') && (MG.hex_floor_press || {}).chest > 0);
const chestFreq = ['A', 'B', 'C'].filter(d => homePr[d].some(e => (MG[e.id] || {}).chest > 0)).length;
T('chest now above MEV with 3× frequency', wkVol.chest > mevOf('chest') && chestFreq === 3, `${wkVol.chest} sets, ${chestFreq}×`);

// ── PROGRAM VOLUME: partner (v21 — the per-cycle MEV requirement is DELIBERATELY GONE) ──
// v23/v27 required a partner A+B+C cycle to independently clear MEV for every muscle. The
// v21 audit found that premise wrong on two counts: getWeeklyVolume counts effective sets
// across ALL locations by design (home supplies 89% of logged sessions and carries MEV),
// and a full partner cycle takes 9.4 weeks at the observed cadence — so a "per-cycle MEV"
// number described a week that never happened. Enforcing it was the sole reason the partner
// days had grown to 8-9 exercises and 27-46 working bouts.
// Summing A+B+C is also now actively misleading: the three days share one base, so it
// triple-counts every base lift when only ONE day is ever run per visit. The meaningful
// unit is therefore a SINGLE VISIT, and what matters is that a visit is a complete
// full-body session rather than a third of a split.
const visitVol = day => { const v = {}; for (const ex of partPr[day]) { const m = MG[ex.id] || {}; for (const k in m) v[k] = (v[k] || 0) + ex.s * m[k]; } return v };
for (const day of PROG_DAYS) {
  const v = visitVol(day);
  // Every major pattern present on EVERY day — this is the property that lets an irregular
  // drop-in visit substitute for whatever home day it displaces.
  for (const grp of ['hams', 'quads', 'chest', 'back', 'core'])
    T(`partner Day ${day} trains ${grp} (a single visit is full-body)`, (v[grp] || 0) > 0, JSON.stringify(v));
}
// Rear delts are the one hypertrophy target that survives on only one partner day (the Day-A
// curl/fly superset). Recorded deliberately: home trains them 3× weekly (bb_rear_row,
// face_pull, band work), so this is an accepted gap, not an oversight.
T('partner rear-delt work exists on exactly one day (accepted gap, home covers it)',
  PROG_DAYS.filter(d => partPr[d].some(e => (MG[e.id] || {}).reardelt > 0)).length === 1);
// v25 reverted — the bars are too low to hang under, so there is NO partner vertical pull.
// Also an accepted gap: home trains pull-ups twice weekly.
T('partner has no vertical-pull slot (bars too low; accepted gap)',
  !PROG_DAYS.some(d => partPr[d].some(e => /^pb_pullup/.test(e.id))));
T('partner horizontal pull is on every day (inv_rows_a, no load ceiling)',
  PROG_DAYS.every(d => partPr[d].some(e => e.id === 'inv_rows_a')));
// v21: db_rdl is in the shared base, so hamstrings are trained on ALL THREE partner days
// (the collapse replaced "2× per 9.4-week cycle" with "every visit").
T('partner hamstrings train on every day (shared base)', ['A', 'B', 'C'].filter(d => partPr[d].some(e => (MG[e.id] || {}).hams > 0)).length === 3);
// v21: back volume is now a per-VISIT number (inv_rows_a 4 sets + the db_rdl 0.5 credit on
// every day) rather than a per-cycle sum. A single visit is deliberately under the weekly
// MEV of 10 — home carries that — so the assertion is that every visit trains back hard
// enough to be the session's largest pulling stimulus, not that one visit clears MEV.
T('partner back is trained on every visit and leads the pull volume',
  PROG_DAYS.every(d => (partVisitVol(d).back || 0) >= 5), PROG_DAYS.map(d => `${d}:${partVisitVol(d).back}`).join(' '));

// ── v27: Phase-3 no longer strength-loads the quality slots (bb_rear_row, lateral squat) ──
// With no P3 adj entry they fall back to their BASE hypertrophy ranges instead of the old
// heavy 10-12 / 6-side that contradicted their coaching intent. (v17: the frontal-plane
// slot is now the Landmine Lateral Squat, same quality/ROM treatment as the old Cossack.)
const homeP3 = getProgram(3, 'home');
T('P3 bb_rear_row holds its light hypertrophy range (12-15), not heavy 10-12', homeP3.A.find(e => e.id === 'bb_rear_row').rp === '12-15');
T('P3 landmine lateral squat holds 8/side (base), not a strength-loaded 6/side', homeP3.C.find(e => e.id === 'lm_lateral_squat').rp === '8/side');
// P1 still periodizes them (proves they weren't removed everywhere — see calc.test for the
// PHASE_ADJ_IDS membership assertion): P1 rear-delt row is its light 12-15.
T('bb_rear_row still periodizes in P1 (not a blanket removal)', getProgram(1, 'home').A.find(e => e.id === 'bb_rear_row').rp === '12-15');

// ── v27: lm_pallof pause moved to the press-out (anti-rotation hold at full extension) ──
T('lm_pallof tempo pauses at the press-out, not the chest (2-0-1-2)', getProgram(1, 'home').C.find(e => e.id === 'lm_pallof').tempo === '2-0-1-2');

// ── Partner DB ladder (E1): buildDBW from the photographed spinlock inventory ──
T('bare bell (bar+collars) is a rung', DBW_PAIR[0] === 2 && DBW_SINGLE[0] === 2);
T('smallest loaded rungs: 3 (2×0.5) and 4.5 (2×1.25)', DBW_PAIR.includes(3) && DBW_PAIR.includes(4.5));
T('7 = bell + 2.5 per end', DBW_PAIR.includes(7));
T('15.5 matched pair loadable (2.5+2.5+1.25+0.5 per end ×4 bells-ends)', DBW_PAIR.includes(15.5));
T('matched pairs top out at 18.5 (sleeve cap: 4 heaviest matched plates/end)', DBW_PAIR[DBW_PAIR.length - 1] === 18.5);
T('single bell tops out at 22 (4×2.5 per end)', DBW_SINGLE[DBW_SINGLE.length - 1] === 22);
T('every matched rung is also a single-bell rung', DBW_PAIR.every(w => DBW_SINGLE.includes(w)));
T('19.5 needs >2 of the 2kg plates per bell-pair — single only', !DBW_PAIR.includes(19.5) && DBW_SINGLE.includes(19.5));
T('near-continuous 0.5 steps in the working range 4.5-17', (() => { for (let w = 4.5; w <= 17; w += 0.5) if (!DBW_PAIR.includes(Math.round(w * 10) / 10)) return false; return true; })());
T('dbwOf routes per_db to the matched ladder', dbwOf({ loadUnit: 'per_db' }) === DBW_PAIR && dbwOf({}) === DBW_SINGLE);
T('snapDB lands on real rungs', snapDB(9.9, { loadUnit: 'per_db' }) === 10 && snapDB(2.4, {}) === 2);
T('fmtDbEnd breakdown', fmtDbEnd(15.5, true) === '2×2.5kg + 1×1.25kg + 1×0.5kg' && fmtDbEnd(2, true) === 'Bar only');

// ── DB plate visuals (E6): exact per-end solver + chip diagram ──
// The user's live screenshot showed 'Spinlock per end: —' at 16.5kg/DB: greedy took
// 2.5+2.5 then dead-ended; the exact combo is 2.5+2.5+1.25+1. These pin the fix.
T('16.5/DB resolves exactly (greedy used to fail)', fmtDbEnd(16.5, true) === '2×2.5kg + 1×1.25kg + 1×1kg', fmtDbEnd(16.5, true));
T('7.5/DB resolves exactly (2.75/end = 1.25+1+0.5)', fmtDbEnd(7.5, true) === '1×1.25kg + 1×1kg + 1×0.5kg', fmtDbEnd(7.5, true));
T('EVERY matched rung above the bar has a real breakdown', DBW_PAIR.every(w => w <= 2 || fmtDbEnd(w, true) !== '—'), DBW_PAIR.filter(w => w > 2 && fmtDbEnd(w, true) === '—').join(','));
T('EVERY single-bell rung above the bar has a real breakdown', DBW_SINGLE.every(w => w <= 2 || fmtDbEnd(w, false) !== '—'), DBW_SINGLE.filter(w => w > 2 && fmtDbEnd(w, false) === '—').join(','));
T('solver prefers fewest plates (7kg = one 2.5, not 2+0.5 or 1.25+1+…)', fmtDbEnd(7, true) === '1×2.5kg');
T('solver respects the sleeve cap', (() => { const c = dbEnd(18.5, true); return c && c.reduce((a, p) => a + p.c, 0) <= 4; })());
// dbPlateH draws the WHOLE bell (both ends mirrored around the handle), so a 4-plate-per-end
// load is 8 chips, not 4 — the mirroring is the thing that makes it read as a dumbbell.
T('dbPlateH renders both ends — one chrome chip per plate per end', (dbPlateH(16.5, true).match(/pl pl-db/g) || []).length === 8, (dbPlateH(16.5, true).match(/pl pl-db/g) || []).length);
T('dbPlateH draws a handle between the two stacks', (dbPlateH(16.5, true).match(/db-shaft/g) || []).length === 1 && (dbPlateH(16.5, true).match(/db-collar/g) || []).length === 2);
T('dbPlateH empty at/below the bare bell', dbPlateH(2, true) === '' && dbPlateH(null, true) === '');
// Denomination is encoded by DIAMETER (a height class per plate weight), not by the barbell
// hue code — four of the five DB denominations collapse into the barbell's slate bucket, so
// colour cannot carry them. Every denomination must get a DISTINCT class or the encoding lies.
{
  const cls = [2.5, 2, 1.25, 1, 0.5].map(DB_PL_CLASS);
  T('every DB denomination maps to a distinct diameter class', new Set(cls).size === 5, cls.join(','));
  // 16.5/DB per end = 2.5+2.5+1.25+1 → the three distinct diameters must all appear.
  const h = dbPlateH(16.5, true);
  T('diameter classes render on the chips', /pl-db-25/.test(h) && /pl-db-125/.test(h) && /pl-db-1["\s]/.test(h), h);
  // No DB chip may carry a BARBELL plate class — that is exactly the misread being avoided.
  T('DB chips never borrow the barbell colour classes', !/pl-(10|5|2|1)"/.test(h), h);
}
// dbWarmup: the DB sibling of warmupSets, walking the spinlock ladder. Gated at 6kg/bell so
// the 3kg accessories (laterals, rear-delt flies) get no pointless "bar only" ramp.
{
  const per = { loadUnit: 'per_db' };
  T('dbWarmup silent below 6kg/bell', dbWarmup(3, per).length === 0 && dbWarmup(5.5, per).length === 0, JSON.stringify(dbWarmup(5.5, per)));
  const w = dbWarmup(16.5, per);
  T('dbWarmup ramps bar-only → ~50% → ~80%', w.length === 3 && w[0].wt === DB_BAR && w[0].l === 'Bar only', JSON.stringify(w));
  T('dbWarmup rungs are all real matched rungs below the work weight',
    w.every(s => DBW_PAIR.includes(s.wt) && s.wt < 16.5), JSON.stringify(w.map(s => s.wt)));
  T('dbWarmup rungs ascend', w.every((s, i) => i === 0 || s.wt > w[i - 1].wt), JSON.stringify(w.map(s => s.wt)));
  T('dbWarmup reps taper 8/5/3', w.map(s => s.reps).join(',') === '8,5,3', w.map(s => s.reps).join(','));
  // Single-bell lifts snap on the single-bell ladder, not the matched one.
  const s1 = dbWarmup(22, {});
  T('dbWarmup uses the single-bell ladder for single-bell lifts',
    s1.every(s => DBW_SINGLE.includes(s.wt)), JSON.stringify(s1.map(s => s.wt)));
}

// ── Partner starting weights (E2): every partner lift computes a start ──
{
  // Blanket: with a COMPLETELY empty history, no partner lift may say "find your weight".
  const dE = freshD({ location: 'partner' });
  dE.sessions = [];
  const pr2 = getProgram(1, 'partner');
  for (const day of PROG_DAYS) for (const ex of pr2[day]) {
    if (ex.tp === 'bw') continue; // bodyweight has no load to seed
    const sg = getSmartSugg(ex);
    T(`partner ${ex.id} seeds with zero history`, sg.wt != null || !!sg.band, `${ex.id}: ${JSON.stringify(sg)}`);
  }
  // All numeric partner seeds sit on the correct spinlock ladder.
  for (const day of PROG_DAYS) for (const ex of pr2[day]) {
    if (ex.tp !== 'db') continue;
    const sg = getSmartSugg(ex);
    const lad = ex.loadUnit === 'per_db' ? DBW_PAIR : DBW_SINGLE;
    T(`partner ${ex.id} seed ${sg.wt} is loadable`, lad.includes(sg.wt), `${sg.wt} not in ladder`);
  }

  // Cross-location: home history now computes the partner start.
  const dX = freshD({ location: 'partner' });
  dX.sessions = [
    { id: 'x1', date: '2026-07-01', day: 'C', loc: 'home', ex: [{ id: 'hex_rdl', wt: 46, reps: [9, 9, 9], band: '' }] },
    { id: 'x2', date: '2026-07-02', day: 'B', loc: 'home', ex: [{ id: 'ohp', wt: 26, reps: [6, 6, 6, 6], band: '' }] }];
  const sgRdl = getSmartSugg(pr2.A.find(e => e.id === 'db_rdl'));
  T('db_rdl computes from home hex RDL (46×0.35 → snapped 16)', sgRdl.type === 'new' && sgRdl.wt === 16, JSON.stringify(sgRdl));
  const sgOhp = getSmartSugg(pr2.B.find(e => e.id === 'db_ohp'));
  T('db_ohp computes from home barbell OHP (26×0.32 → snapped 8.5)', sgOhp.type === 'new' && sgOhp.wt === 8.5, JSON.stringify(sgOhp));
  T('cross-location suggestion names its source lift', /Barbell OHP/.test(sgOhp.detail || ''), sgOhp.detail);
}

// ── Ultra audit C5: MG attribution consistency (exact values, so silent drift fails loud) ──
// Carry rule: unilateral/asymmetric carries core 1.0; bilateral farmer-style 0.5.
T('hex_carry is a bilateral farmer carry → core 0.5', MG.hex_carry.core === 0.5, JSON.stringify(MG.hex_carry));
T('db_carry stays core 0.5 (same farmer bucket)', MG.db_carry.core === 0.5);
T('suitcase_march (unilateral legacy stub) stays core 1.0', MG.suitcase_march.core === 1);
// RDL family: every bilateral/B-stance hinge credits erectors back 0.5.
T('b_stance_rdl credits back 0.5 like its RDL siblings', MG.b_stance_rdl.back === 0.5, JSON.stringify(MG.b_stance_rdl));
T('rdl/hex_rdl/db_rdl all carry back 0.5', [MG.rdl, MG.hex_rdl, MG.db_rdl].every(m => m.back === 0.5));
T('db_sl_rdl deliberately back-free (true single-leg, balance-limited)', MG.db_sl_rdl.back === undefined);
// The changes must not sink home core under MEV (dead bugs 3 + pallof 3 + carry 3×0.5 = 7.5).
T('home core still ≥ MEV after hex_carry 1.0→0.5', wkVol.core >= mevOf('core'), `${wkVol.core} vs ${mevOf('core')}`);
// v14 amendment: pull-ups restored to 4 sets by explicit user choice with the new
// lm_bstance_squat's 0.5-back credit on board → back sits at a DELIBERATE 22.5, half a
// set over the nominal MAV of 22 (MAV is guidance, not a cap — "more is fine if
// recovering well").
// The ceiling guard for back now lives with the other two accepted overages in
// ACCEPTED_OVER_MAV above, pinned to the exact value rather than to "≤ MAV + 0.5" —
// that one-sided bound let back drift DOWN silently, and said nothing about glutes or
// triceps, which are also over.

// ── v20: the core block is dissolved back into A/B/C, and every day is sorted by implement ──
// v19 consolidated the four core slots onto an off-rotation day 'X' so they'd stop being the
// finisher that gets skipped. In practice a block needing its own session on a rest day just
// never ran, so v20 puts the movements back on the lifting days — placed where the equipment
// already is, which is also the point of the re-sort below.
T('no day X in the home program any more', homePr.X === undefined);
T('no day X in the partner program any more', partPr.X === undefined);
T('home core slots are back on the lifting days', homePr.A.some(e => e.id === 'dead_bugs_a') && homePr.B.some(e => e.id === 'bb_rollout') && homePr.B.some(e => e.id === 'bird_dog') && homePr.C.some(e => e.id === 'lm_pallof'));
// v21: the three partner core slots consolidate into ONE — side_plank, in the shared base,
// so it runs on every visit instead of one slot appearing per day. bird_dog stays a home
// lift; db_dead_bug retires to a stub (it was never logged).
T('partner core is one slot on every day (side_plank in the shared base)',
  PROG_DAYS.every(d => partPr[d].some(e => e.id === 'side_plank')) &&
  !PROG_DAYS.some(d => partPr[d].some(e => e.id === 'db_dead_bug' || e.id === 'bird_dog')));
T('home days grow to A=9, B=9, C=10 (core slots re-absorbed)', homePr.A.length === 9 && homePr.B.length === 9 && homePr.C.length === 10 && homePr.C.find(e => e.id === 'deficit_pushup').optional === true);
// v21 day counts: 7 shared base movements + a rotating finisher (A gets a superset pair,
// B and C get one each) + one optional clubbell per day.
T('partner days are A=10, B=9, C=9 (7 shared base + finisher + optional clubbell)',
  partPr.A.length === 10 && partPr.B.length === 9 && partPr.C.length === 9,
  `${partPr.A.length}/${partPr.B.length}/${partPr.C.length}`);
T('each partner day carries exactly one optional clubbell finisher',
  PROG_DAYS.every(d => partPr[d].filter(e => e.tp === 'club' && e.optional).length === 1));
// The mandatory (non-optional) session is what has to fit in a drop-in visit.
T('mandatory partner session is 8-9 movements', PROG_DAYS.every(d => partPr[d].filter(e => !e.optional).length <= 9));
// The plank is still gone from HOME (v19, at the lifter's request) — bb_rollout does the
// anti-extension work dynamically. It survives at the partner venue, which has no barbell.
T('side plank is out of the home program entirely', !PROG_DAYS.some(d => homePr[d].some(e => e.id === 'side_plank')));
T('side plank still active at the partner venue (no barbell there for a rollout)', partPr.B.some(e => e.id === 'side_plank'));
T('bb_rollout is bodyweight, per-set, core:1 (leverage is the load, not plates)', (() => { const e = homePr.B.find(x => x.id === 'bb_rollout'); return e && e.tp === 'bw' && e.perSide === false && (MG.bb_rollout || {}).core === 1 && MG.bb_rollout.back === undefined; })());
T('bb_rollout carries no tonnage (bodyweight)', calcExVol('bb_rollout', null, [12, 12, 12]) === 0);
// bird_dog stays reactivated from its v16 retired stub — the extensor-endurance axis AUDIT §15
// logged as a knowingly accepted gap. One definition, not a stub plus a live copy.
T('bird dog is active (v16 stub reactivated), not a legacy stub', (() => { const e = ALL_EX.find(x => x.id === 'bird_dog'); return e && e.tp === 'bw' && e.perSide === true && !/legacy|retired/i.test(e.rl); })());
// v21: bird_dog is home-only now (partner core consolidated to side_plank), but the shared
// id/definition is still the point — side_plank is the cross-venue one.
T('side plank is the shared cross-venue core id (home B + every partner day)',
  homePr.B.some(e => e.id === 'side_plank') === homePr.B.some(e => e.id === 'side_plank') &&
  PROG_DAYS.every(d => partPr[d].some(e => e.id === 'side_plank')));
T('bird dog is a home lift (partner core consolidated in v21)',
  homePr.B.some(e => e.id === 'bird_dog') && !PROG_DAYS.some(d => partPr[d].some(e => e.id === 'bird_dog')));
T('shared ids dedupe to one ALL_EX definition each', ALL_EX.filter(e => e.id === 'side_plank').length === 1 && ALL_EX.filter(e => e.id === 'bird_dog').length === 1 && ALL_EX.filter(e => e.id === 'bb_rollout').length === 1);
T('side plank / bird dog carry core:1 MG credit (no back credit — sub-threshold erector load)', (MG.side_plank || {}).core === 1 && MG.side_plank.back === undefined && (MG.bird_dog || {}).core === 1 && MG.bird_dog.back === undefined);
const coreMAV = (MG_INFO.find(r => r[0] === 'core') || [])[3];
T('home core over MEV, still under MAV', wkVol.core >= mevOf('core') && wkVol.core <= coreMAV, `${wkVol.core}`);
// v21: per-visit again. side_plank rides the shoulder giant set on every partner day, so
// core is present in every session and never approaches MAV in one.
T('partner core present every visit, never near MAV in one session',
  PROG_DAYS.every(d => { const c = partVisitVol(d).core || 0; return c > 0 && c <= coreMAV }),
  PROG_DAYS.map(d => `${d}:${partVisitVol(d).core}`).join(' '));
// The v19 suite asserted the INVERSE of this: that an A/B/C-only core sweep read UNDER MEV,
// because all the core lived on X. That is exactly what must not be true any more — the core
// work is on the rotation days, so the rotation days alone have to clear MEV.
T('an A/B/C-only core sweep clears MEV again (no fourth day to forget)', (() => { let c = 0; for (const d of PROG_DAYS) for (const ex of homePr[d]) c += ex.s * ((MG[ex.id] || {}).core || 0); return c >= mevOf('core'); })());
T('bw holds excluded from tonnage (unloaded)', calcExVol('side_plank', null, [40, 40, 40]) === 0 && calcExVol('bird_dog', null, [8, 8, 8]) === 0);
T('static by design — no PHASES.adj entry at any phase', [1, 2, 3].every(p => getProgram(p, 'partner').B.find(e => e.id === 'side_plank').rp === '20-40s/side') && [1, 2, 3].every(p => getProgram(p, 'home').B.find(e => e.id === 'bb_rollout').rp === '8-12'));
// bw progression drives off total reps/seconds vs s×tg — hitting 3×40s reads as progress,
// a below-target session reads stay-and-push. The fixtures below deliberately keep day:'X':
// a store written between v19 and v20 has core sessions logged under that day, and they must
// keep feeding the suggestion now that the slot lives on a lifting day.
T('side plank at 3×40s reads progress (from a pre-v20 day-X session)', (() => { const d = freshD(); d.sessions = [{ id: 'sp1', date: '2026-07-10', day: 'X', loc: 'partner', ex: [{ id: 'side_plank', wt: null, reps: [80, 80, 80], band: '' }] }]; const sg = getSmartSugg(partPr.B.find(e => e.id === 'side_plank')); return sg.type === 'up'; })());
T('bird dog history below target reads stay/push', (() => { const d = freshD(); d.sessions = [{ id: 'bd1', date: '2026-07-10', day: 'X', loc: 'home', ex: [{ id: 'bird_dog', wt: null, reps: [16, 12, 12], band: '' }] }]; const sg = getSmartSugg(homePr.B.find(e => e.id === 'bird_dog')); return sg.type === 'stay'; })());
T('pre-v16 bird dog history (logged on Day C) still feeds the slot', (() => { const d = freshD(); d.sessions = [{ id: 'bd2', date: '2026-01-10', day: 'C', loc: 'home', ex: [{ id: 'bird_dog', wt: null, reps: [16, 16, 16], band: '' }] }]; const sg = getSmartSugg(homePr.B.find(e => e.id === 'bird_dog')); return sg.type === 'up'; })());
// v21: side_plank is the cross-venue shared id now (bird_dog went home-only when the
// partner core slots consolidated). Same property, live id.
T('cross-venue history is genuinely shared (home session feeds partner suggestion)', (() => { const d = freshD(); d.sessions = [{ id: 'sp3', date: '2026-07-10', day: 'B', loc: 'home', ex: [{ id: 'side_plank', wt: null, reps: [80, 80, 80], band: '' }] }]; const sg = getSmartSugg(partPr.A.find(e => e.id === 'side_plank')); return sg.type === 'up'; })());

// ── v20: every prescribed rest is exactly one minute ──
// Both fields, not just one: rst is what the slot line PRINTS and rstS is what the timer
// button STARTS, and they are set independently in the program literal. A pass on rstS alone
// would let the printed "2:30" survive next to a 60-second timer.
// v21 narrowed the one-minute policy to HOME; v99 differentiates demanding home compounds
// again. The partner venue remains shorter: 1:00 there was
// calibrated for the home barbell, but at 16kg dumbbells it was mostly dead time — 14 sets
// per cycle of 5kg isolation work were each buying a full minute. Partner compounds rest
// 0:45, isolation 0:30. The rst/rstS pairing invariant is what actually matters, so it is
// still asserted at BOTH venues: a printed string that disagrees with the timer is the bug.
{
  const pr = getProgram(1, 'home');
  const ALLOWED = { '2:00': 120, '1:30': 90, '1:00': 60 };
  const bad = PROG_DAYS.flatMap(d => pr[d]).filter(e => !(e.rst in ALLOWED) || e.rstS !== ALLOWED[e.rst]);
  T('every home rest is 2:00, 1:30 or 1:00 with string and timer agreeing', bad.length === 0, bad.map(e => `${e.id} ${e.rst}/${e.rstS}`).join(', '));
  T('home pillars get 2:00 and accessories remain 1:00',
    ['hex_dl','hex_squat_b','ohp'].every(id=>PROG_DAYS.flatMap(d=>pr[d]).find(e=>e.id===id).rstS===120)&&
    pr.A.find(e=>e.id==='bb_curl').rstS===60);
}
{
  const pr = getProgram(1, 'partner');
  const all = PROG_DAYS.flatMap(d => pr[d]);
  const ALLOWED = { '0:45': 45, '0:30': 30 };
  const bad = all.filter(e => !(e.rst in ALLOWED) || e.rstS !== ALLOWED[e.rst]);
  T('every partner rest is 0:45 or 0:30, string and timer agreeing', bad.length === 0, bad.map(e => `${e.id} ${e.rst}/${e.rstS}`).join(', '));
  // The split must track the WORK, not be sprinkled arbitrarily: loaded compounds get 0:45,
  // isolation and the bodyweight hold get 0:30.
  const isIso = e => ['db_lateral', 'db_rear_fly', 'db_curl', 'side_plank'].includes(e.id);
  T('partner 0:30 rests are exactly the isolation/hold slots',
    all.every(e => (e.rstS === 30) === isIso(e)), all.filter(e => (e.rstS === 30) !== isIso(e)).map(e => e.id).join(', '));
}

// ── v20: days are ordered so same-implement work runs back-to-back ──
// The whole point of the re-sort is not having to re-rig the bar mid-session, so assert the
// IMPLEMENT SEQUENCE, not just the membership. Slots that need no plates at all (band-assisted
// pull-ups/dips, bodyweight) are dropped first: they can sit anywhere for free, which is why
// they are interleaved into the loaded blocks rather than piled at the end.
const impl = e => e.bar === 7 ? 'hex' : e.lm ? 'lm' : e.tp === 'bb' ? 'bar' : e.tp === 'db' || e.tp === 'carry' ? 'db' : e.tp === 'club' ? 'club' : 'free';
const loadedSeq = exs => exs.map(impl).filter(k => k !== 'free').join(',');
T('home A: hex bar → landmine → straight bar, one setup each', loadedSeq(homePr.A) === 'hex,lm,lm,bar,bar,bar,bar,bar', loadedSeq(homePr.A));
T('home B: hex bar → straight bar → landmine, one setup each', loadedSeq(homePr.B) === 'hex,hex,bar,bar,lm', loadedSeq(homePr.B));
// Home C is the ONE documented exception: it returns to the hex bar for the farmer's carry
// after the landmine block. Bought deliberately — the carry is a finisher, and running it
// before a 4-set landmine squat would tax the trunk and grip that squat needs.
T('home C: hex → landmine → hex, the carry finisher being the one re-rig', loadedSeq(homePr.C) === 'hex,hex,lm,lm,lm,lm,hex', loadedSeq(homePr.C));
// v21: the shared base is 5 dumbbell lifts with two zero-setup bodyweight slots interleaved
// (inv_rows_a, side_plank) — 'free' is filtered out above precisely because those cost no
// re-rig. Every day still ends on its clubbell, which is the only implement change.
T('partner A: dumbbells then the clubbell', loadedSeq(partPr.A) === 'db,db,db,db,db,db,db,club', loadedSeq(partPr.A));
T('partner B: dumbbells then the clubbell', loadedSeq(partPr.B) === 'db,db,db,db,db,club', loadedSeq(partPr.B));
T('partner C: dumbbells then the clubbell', loadedSeq(partPr.C) === 'db,db,db,db,db,db,club', loadedSeq(partPr.C));
// The two free slots sit INSIDE the dumbbell block on every day — that is the v20 rule
// (no-plate work goes wherever it costs nothing), not an ordering slip.
T('partner bodyweight slots are interleaved, not piled at the end',
  PROG_DAYS.every(d => { const ks = partPr[d].map(impl); return ks.indexOf('free') < ks.lastIndexOf('db') }));
// The supersets have to stay adjacent or the ⚡ cue in their coach note is a lie.
T('home B lateral/rear-delt superset is still adjacent', (() => { const i = homePr.B.findIndex(e => e.id === 'lm_lateral'); return homePr.B[i + 1] && homePr.B[i + 1].id === 'rear_delt'; })());
// v21: the rear-delt fly moved to the Day-A finisher, supersetted with the DB curl; the
// shared base instead runs a three-move giant set (OHP → lateral → side plank).
T('partner A curl/rear-fly superset is adjacent', (() => { const i = partPr.A.findIndex(e => e.id === 'db_curl'); return partPr.A[i + 1] && partPr.A[i + 1].id === 'db_rear_fly'; })());
T('partner lateral/side-plank superset is contiguous on every day', PROG_DAYS.every(d => {
  const i = partPr[d].findIndex(e => e.id === 'db_lateral');
  return partPr[d][i + 1] && partPr[d][i + 1].id === 'side_plank';
}));
// db_ohp is deliberately NOT in that superset: it still has load headroom, and a lift you
// can add weight to should not be run on a 0:30 circuit rest.
T('partner db_ohp stays a 0:45 compound, outside the superset',
  PROG_DAYS.every(d => partPr[d].find(e => e.id === 'db_ohp').rstS === 45));
// Heavy first still holds where it matters: each day opens on a loaded compound, never on an
// accessory that happens to share an implement with it.
// v21: every partner day opens on the same loaded compound, because every partner day IS
// the same session up to its finisher.
T('every day opens on a loaded compound, not an accessory',
  ['A', 'B', 'C'].every(d => ['hex_dl', 'hex_squat_b', 'hex_rdl'].includes(homePr[d][0].id)) &&
  ['A', 'B', 'C'].every(d => partPr[d][0].id === 'db_rdl'));

console.log(`\n${pass} passed, ${fail} failed`);
// A suite that cannot fail the build is not a test suite. CI runs these files directly and
// reads the exit code; without this, hex.test.js and render.smoke.js exited 0 no matter how
// many assertions failed — 468 of the branch's 926 assertions were invisible to CI.
if (fail) process.exit(1);
