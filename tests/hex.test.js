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
  '\n;global.__X={ALL_EX,SEED,MG,MG_INFO,VW,VWH,VWL,BAR,HEXBAR,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = {};
global.window = {};
eval(code);
const { ALL_EX, SEED, MG, MG_INFO, VW, VWH, VWL, BAR, HEXBAR, setD, getD } = global.__X;

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
T('Day C: Zercher Moderate KEPT straight-bar', C.some(e => e.id === 'zercher_a') && C.find(e => e.id === 'zercher_a').bar === undefined && !C.some(e => /^hex_squat/.test(e.id)));
T('Day C: RDL KEPT straight-bar', C.find(e => e.id === 'rdl').bar === undefined);
T('no hex_squat_c exists (Day C squat not swapped)', !ALL_EX.some(e => e.id === 'hex_squat_c'));
T('hex_dl carries bar:7', A.find(e => e.id === 'hex_dl').bar === 7);
T('hex_squat_b carries bar:7', B.find(e => e.id === 'hex_squat_b').bar === 7);
T('OHP stays barbell (landmine pending)', B.find(e => e.id === 'ohp').bar === undefined);
T('Barbell Row KEPT straight-bar', B.find(e => e.id === 'bb_row').bar === undefined);

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
T('hex_dl counts toward tonnage (bb)', calcExVol('hex_dl', 40, [5, 5, 5]) === 40 * 15);
T('hex_carry excluded from tonnage (carry)', calcExVol('hex_carry', 30, [40, 40, 40]) === 0);

// ── legacy: swapped-out straight-bar ids still resolve for old sessions ──
T('deadlift legacy stub resolves', !!ALL_EX.find(e => e.id === 'deadlift'));
T('zercher_b legacy stub resolves', !!ALL_EX.find(e => e.id === 'zercher_b'));
T('suitcase_march legacy stub resolves', !!ALL_EX.find(e => e.id === 'suitcase_march'));
T('old deadlift history still computes volume', calcExVol('deadlift', 46, [5, 5, 5]) === 690);

// ── LANDMINE single-sided model (VWL) ──
// Landmine lifts load ONE end of the 11kg bar, so plates aren't mirrored: total = bar +
// single-end load, on a finer ladder (VWL) than the symmetric VW. bb_rear_row is a true
// two-handed barbell row and must stay symmetric.
const lmLifts = ['lm_lateral', 'lm_pallof']; // active landmine lifts (lm_180 retired in Day-C trim)
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
T('inv_rows_a (active partner lift) keeps its MG map', !!MG.inv_rows_a);
const irD = freshD({ location: 'partner' });
irD.sessions = [];
const irSg = getSmartSugg(getProgram(1, 'partner').A.find(e => e.id === 'inv_rows_a'));
T('inv_rows_a seeds cleanly with no dangling peer (no undefined)', irSg.type === 'new' && !/undefined/.test(JSON.stringify(irSg)), JSON.stringify(irSg));

// ── PROGRAM VOLUME: home weekly effective sets meet MEV for the muscles we restored ──
const homePr = getProgram(1, 'home');
const wkVol = {};
for (const day of ['A', 'B', 'C']) for (const ex of homePr[day]) { const m = MG[ex.id] || {}; for (const k in m) wkVol[k] = (wkVol[k] || 0) + ex.s * m[k]; }
const mevOf = key => (MG_INFO.find(r => r[0] === key) || [])[2];
T('chest weekly volume ≥ MEV', wkVol.chest >= mevOf('chest'), `${wkVol.chest} vs ${mevOf('chest')}`);
T('rear delts weekly volume ≥ MEV (restored on Day B)', wkVol.reardelt >= mevOf('reardelt'), `${wkVol.reardelt} vs ${mevOf('reardelt')}`);
T('biceps weekly volume ≥ MEV (direct curl restored)', wkVol.biceps >= mevOf('biceps'), `${wkVol.biceps} vs ${mevOf('biceps')}`);
T('no home muscle sits under MEV', MG_INFO.every(([k, , mev]) => mev == null || (wkVol[k] || 0) >= mev), JSON.stringify(wkVol));
T('home days balanced at 7 exercises each', homePr.A.length === 7 && homePr.B.length === 7 && homePr.C.length === 7);

console.log(`\n${pass} passed, ${fail} failed`);
