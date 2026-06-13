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
  '\n;global.__X={ALL_EX,SEED,MG,VW,VWH,BAR,HEXBAR,setD:d=>{D=d},getD:()=>D};';

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = {};
global.window = {};
eval(code);
const { ALL_EX, SEED, MG, VW, VWH, BAR, HEXBAR, setD, getD } = global.__X;

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

console.log(`\n${pass} passed, ${fail} failed`);
