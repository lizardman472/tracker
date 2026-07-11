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

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══════════════ INIT')) +
  '\n;global.__X={ALL_EX,SEED,MG,MG_INFO,VW,VWH,VWL,BAR,HEXBAR,DBW_PAIR,DBW_SINGLE,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = {};
global.window = {};
eval(code);
const { ALL_EX, SEED, MG, MG_INFO, VW, VWH, VWL, BAR, HEXBAR, DBW_PAIR, DBW_SINGLE, setD, getD } = global.__X;

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
T('Day B keeps direct triceps (bb_skullcr, straight bar), curl moved off', B.some(e => e.id === 'bb_skullcr') && B.find(e => e.id === 'bb_skullcr').bar === undefined && !B.some(e => e.id === 'bb_curl'));

// ── partner program is untouched ──
const pAll = ['A', 'B', 'C'].flatMap(d => getProgram(1, 'partner')[d]);
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
const lmLifts = ['lm_lateral', 'lm_pallof', 'lm_squat']; // active landmine lifts (lm_180, lm_row retired)
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
// Progression: hit target at bar-only 11kg → up ONE fine VWL rung (11.25), a real loadable weight.
const dlm = freshD();
dlm.sessions = [{ id: 'l1', date: '2026-06-10', day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 11, reps: [10, 10, 10], band: '', form: [5, 5, 5] }] }];
lsg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('lm_pallof hit-target at 11 → ↑ to next VWL rung (11.25)', lsg.type === 'up' && lsg.wt === 11.25 && VWL.includes(lsg.wt), JSON.stringify(lsg));
// Volume: landmine lifts have MG maps and count on the bb tonnage path (perSide doubles).
T('landmine lifts + bb_rear_row have MG maps (incl. retired lm_180 for history)', lmLifts.every(id => !!MG[id]) && !!MG.bb_rear_row && !!MG.lm_180);
T('lm_pallof counts toward tonnage (bb, perSide ×2)', calcExVol('lm_pallof', 13, [10, 10, 10]) === 13 * 2 * 30);

// ── AUDIT FIX C1: deload at the bar-only floor is a rebuild hold, not a phantom 0% cut ──
let cd = freshD();
cd.sessions = [1, 2, 3].map(i => ({ id: 'cd' + i, date: '2026-06-0' + i, day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 11, reps: [3, 3, 3], band: '', form: [5, 5, 5] }] }));
let cdSg = getSmartSugg(getProgram(1, 'home').C.find(e => e.id === 'lm_pallof'));
T('stall at bar-only floor → rebuild hold (not a fake deload)', cdSg.type === 'stay' && cdSg.wt === 11 && !/%/.test(cdSg.detail), JSON.stringify(cdSg));
// Above the floor, the deload reports the ACTUAL percent cut, not a hardcoded ~10%.
cd.sessions = [1, 2, 3].map(i => ({ id: 'ce' + i, date: '2026-06-0' + i, day: 'C', loc: 'home', ex: [{ id: 'lm_pallof', wt: 12, reps: [3, 3, 3], band: '', form: [5, 5, 5] }] }));
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
// inv_rows_a retired to a legacy stub (v25 → neutral-grip pull-ups), but keeps its MG map
// and ALL_EX def so pre-swap partner history still resolves.
T('inv_rows_a kept as legacy stub with MG map', !!MG.inv_rows_a && !!ALL_EX.find(e => e.id === 'inv_rows_a'));
T('inv_rows_a no longer in the active partner program', !getProgram(1, 'partner').A.some(e => e.id === 'inv_rows_a'));
// The active replacement — band-assisted neutral-grip pull-up — seeds cleanly off its band.
const irD = freshD({ location: 'partner' });
irD.sessions = [];
const irSg = getSmartSugg(getProgram(1, 'partner').A.find(e => e.id === 'pb_pullup_a'));
T('pb_pullup_a seeds cleanly with no dangling peer (no undefined)', irSg.type === 'new' && !/undefined/.test(JSON.stringify(irSg)), JSON.stringify(irSg));

// ── PROGRAM VOLUME: home weekly effective sets meet MEV for the muscles we restored ──
const homePr = getProgram(1, 'home');
const wkVol = {};
for (const day of ['A', 'B', 'C']) for (const ex of homePr[day]) { const m = MG[ex.id] || {}; for (const k in m) wkVol[k] = (wkVol[k] || 0) + ex.s * m[k]; }
const mevOf = key => (MG_INFO.find(r => r[0] === key) || [])[2];
T('chest weekly volume ≥ MEV', wkVol.chest >= mevOf('chest'), `${wkVol.chest} vs ${mevOf('chest')}`);
T('rear delts weekly volume ≥ MEV (restored on Day B)', wkVol.reardelt >= mevOf('reardelt'), `${wkVol.reardelt} vs ${mevOf('reardelt')}`);
T('biceps weekly volume ≥ MEV (direct curl restored)', wkVol.biceps >= mevOf('biceps'), `${wkVol.biceps} vs ${mevOf('biceps')}`);
T('triceps weekly volume ≥ MEV (direct extension added Day B)', wkVol.triceps >= mevOf('triceps'), `${wkVol.triceps} vs ${mevOf('triceps')}`);
T('no home muscle sits under MEV', MG_INFO.every(([k, , mev]) => mev == null || (wkVol[k] || 0) >= mev), JSON.stringify(wkVol));
T('home days A=8, B=7, C=9 (v27 added a Day-C calf raise)', homePr.A.length === 8 && homePr.B.length === 7 && homePr.C.length === 9);

const partPr = getProgram(1, 'partner');
// ── v27 open-issues pass: calves, partner dips, MEV-floor buffer sets, Phase-3 quality slots ──
// Calves: first direct calf work, one slot per venue on Day C, tracked but not MEV-gated.
T('home Day C has a single-leg calf raise (kb, per-side)', (() => { const e = homePr.C.find(x => x.id === 'calf_raise'); return e && e.tp === 'kb' && e.perSide === true; })());
T('partner Day C has a single-leg calf raise (db, per-side)', (() => { const e = partPr.C.find(x => x.id === 'db_calf_raise'); return e && e.tp === 'db' && e.perSide === true; })());
T('calf raises have a calves MG map', (MG.calf_raise || {}).calves === 1 && (MG.db_calf_raise || {}).calves === 1);
T('calves is a tracked-but-not-gated dashboard row (null MEV)', (() => { const r = MG_INFO.find(x => x[0] === 'calves'); return r && r[2] == null && r[3] == null; })());
T('calf raises seed cleanly (no dangling peer → no undefined)', (() => { freshD(); const a = getSmartSugg(homePr.C.find(e => e.id === 'calf_raise')); const b = getSmartSugg(partPr.C.find(e => e.id === 'db_calf_raise')); return a.type === 'new' && a.wt === 8 && b.type === 'new' && b.wt === 8; })());
T('calf raises count toward tonnage (perSide ×2, not carry-excluded)', calcExVol('calf_raise', 8, [20, 20, 20]) === 8 * 2 * 60 && calcExVol('db_calf_raise', 8, [20, 20, 20]) === 8 * 2 * 60);
// Partner dips: 2nd weekly dip exposure on Day B (band-assisted, mirrors home).
T('partner Day B has band-assisted dips (pb_dips)', (() => { const e = partPr.B.find(x => x.id === 'pb_dips'); return e && e.tp === 'band' && e.bandMode === 'assist'; })());
T('pb_dips has a chest+triceps MG map (full triceps like home dips)', (MG.pb_dips || {}).chest === 1 && (MG.pb_dips || {}).triceps === 1);
T('dips now train at both venues (home Day B + partner Day B)', homePr.B.some(e => e.id === 'dips') && partPr.B.some(e => e.id === 'pb_dips'));
T('pb_dips seeds off the heaviest assist band, no dangling peer', (() => { freshD(); const sg = getSmartSugg(partPr.B.find(e => e.id === 'pb_dips')); return sg.type === 'new' && !/undefined/.test(JSON.stringify(sg)); })());
// MEV-floor buffer: db_rear_fly Day A and db_sl_rdl Day C went 3→4 for margin.
T('buffer set: partner db_rear_fly Day A is 4 sets', partPr.A.find(e => e.id === 'db_rear_fly').s === 4);
T('buffer set: partner db_sl_rdl is 4 sets', partPr.C.find(e => e.id === 'db_sl_rdl').s === 4);
T('Day C carries a chest exposure (hex floor press)', homePr.C.some(e => e.id === 'hex_floor_press') && (MG.hex_floor_press || {}).chest > 0);
const chestFreq = ['A', 'B', 'C'].filter(d => homePr[d].some(e => (MG[e.id] || {}).chest > 0)).length;
T('chest now above MEV with 3× frequency', wkVol.chest > mevOf('chest') && chestFreq === 3, `${wkVol.chest} sets, ${chestFreq}×`);

// ── PROGRAM VOLUME: partner weekly effective sets meet MEV (v23 partner audit) ──
const pVol = {};
for (const day of ['A', 'B', 'C']) for (const ex of partPr[day]) { const m = MG[ex.id] || {}; for (const k in m) pVol[k] = (pVol[k] || 0) + ex.s * m[k]; }
T('no partner muscle sits under MEV', MG_INFO.every(([k, , mev]) => mev == null || (pVol[k] || 0) >= mev), JSON.stringify(pVol));
T('partner rear delts ≥ MEV (2nd db_rear_fly exposure)', pVol.reardelt >= mevOf('reardelt'), `${pVol.reardelt} vs ${mevOf('reardelt')}`);
T('partner biceps ≥ MEV (direct db_curl restored)', pVol.biceps >= mevOf('biceps'), `${pVol.biceps} vs ${mevOf('biceps')}`);
T('partner core ≥ MEV (loaded db_dead_bug added)', pVol.core >= mevOf('core'), `${pVol.core} vs ${mevOf('core')}`);
T('partner rear delts hit 2× frequency', ['A', 'B', 'C'].filter(d => partPr[d].some(e => (MG[e.id] || {}).reardelt > 0)).length >= 2);
// v25: partner pull pattern mirrors home — vertical pull (pull-ups) on Day A + Day C.
const vertPullDays = ['A', 'B', 'C'].filter(d => partPr[d].some(e => /^pb_pullup/.test(e.id)));
T('partner has vertical pull on 2 days (A + C, mirrors home)', vertPullDays.join('') === 'AC', vertPullDays.join(','));
T('partner hamstrings hit 2× frequency (db_sl_rdl moved A→C)', ['A', 'B', 'C'].filter(d => partPr[d].some(e => (MG[e.id] || {}).hams > 0)).length === 2);
T('partner back still ≥ MEV after row→pull-up swap (volume-neutral)', pVol.back >= mevOf('back'), `${pVol.back} vs ${mevOf('back')}`);

// ── v27: Phase-3 no longer strength-loads the quality slots (bb_rear_row, cossack) ──
// With no P3 adj entry they fall back to their BASE hypertrophy ranges instead of the old
// heavy 10-12 / 6-side that contradicted their coaching intent.
const homeP3 = getProgram(3, 'home');
T('P3 bb_rear_row holds its light hypertrophy range (12-15), not heavy 10-12', homeP3.A.find(e => e.id === 'bb_rear_row').rp === '12-15');
T('P3 cossack holds 8/side (base), not a strength-loaded 6/side', homeP3.C.find(e => e.id === 'cossack_squat').rp === '8/side');
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
T('fmtDbEnd greedy breakdown', fmtDbEnd(15.5, true) === '2×2.5kg + 1×1.25kg + 1×0.5kg' && fmtDbEnd(2, true) === 'Bar only');

// ── Partner starting weights (E2): every partner lift computes a start ──
{
  // Blanket: with a COMPLETELY empty history, no partner lift may say "find your weight".
  const dE = freshD({ location: 'partner' });
  dE.sessions = [];
  const pr2 = getProgram(1, 'partner');
  for (const day of ['A', 'B', 'C']) for (const ex of pr2[day]) {
    if (ex.tp === 'bw') continue; // bodyweight has no load to seed
    const sg = getSmartSugg(ex);
    T(`partner ${ex.id} seeds with zero history`, sg.wt != null || !!sg.band, `${ex.id}: ${JSON.stringify(sg)}`);
  }
  // All numeric partner seeds sit on the correct spinlock ladder.
  for (const day of ['A', 'B', 'C']) for (const ex of pr2[day]) {
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
T('home back still ≤ MAV after b_stance_rdl +0.5', wkVol.back <= (MG_INFO.find(r => r[0] === 'back') || [])[3], `${wkVol.back}`);

console.log(`\n${pass} passed, ${fail} failed`);
