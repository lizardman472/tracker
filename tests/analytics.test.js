// Focused analytics regressions. All data are synthetic; the clock is fixed.
// Run: node tests/analytics.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const declarations = script.slice(0, script.indexOf('// ═══════════════ INIT'));
const NativeDate = Date;
let assertions = 0;
function equal(actual, expected, message) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message); assertions++; }
function ok(value, message) { assert.ok(value, message); assertions++; }
function harness(clock = '2026-09-07T12:00:00') {
  const fixed = new NativeDate(clock).getTime();
  class TestDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  }
  const sandbox = { Date: TestDate, console, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, window: {}, navigator: {},
    document: { createElement() { return { textContent: '', get innerHTML() {
      return String(this.textContent).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    } }; } } };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(declarations, sandbox);
  const run = source => vm.runInContext(source, sandbox);
  run('D=freshState()');
  return { run, state(sessions, extras = {}) { sandbox.fixture = { sessions, ...extras }; run('D={...freshState(),...fixture}'); } };
}
function session(date, ex, extra = {}) {
  return { id: 's' + date, date, day: 'B', loc: 'home', phase: 1, difficulty: 3, ex, ...extra };
}
const ohp = (wt = 40, reps = [5, 5, 5], extra = {}) => ({ id: 'ohp', wt, reps, band: '', ...extra });
const band = (name, reps = [8, 8, 8]) => ({ id: 'pullup_a', wt: null, reps, band: name });

const originalTZ = process.env.TZ;
try {
  // Both DST directions, non-DST UTC, and NZ midnight must produce exactly the
  // requested number of local dates and equal adjacent comparison windows.
  for (const [zone, clock, expectedStart] of [
    ['UTC', '2026-09-07T00:00:00', '2026-09-01'],
    ['Pacific/Auckland', '2026-09-28T00:30:00', '2026-09-22'],
    ['Pacific/Auckland', '2026-04-06T23:30:00', '2026-03-31'],
    ['America/New_York', '2026-03-09T00:30:00', '2026-03-03'],
    ['America/New_York', '2026-11-02T23:30:00', '2026-10-27']
  ]) {
    process.env.TZ = zone;
    const h = harness(clock), win = h.run('calendarWindow(7)'), prev = h.run('calendarWindow(7,7)');
    equal(win, { start: expectedStart, end: clock.slice(0, 10), days: 7 }, zone + ' local calendar boundaries');
    equal(h.run(`calendarDayNumber('${win.end}')-calendarDayNumber('${win.start}')`), 6, zone + ' exactly seven dates');
    equal(h.run(`calendarDayNumber('${win.start}')-calendarDayNumber('${prev.end}')`), 1, zone + ' adjacent windows');
    equal(h.run(`calendarDayNumber('${prev.end}')-calendarDayNumber('${prev.start}')`), 6, zone + ' equal prior exposure');
    const dates = h.run(`Array.from({length:16},(_,i)=>{const d=new Date('${clock}');d.setDate(d.getDate()-14+i);return ymd(d)})`);
    h.state(dates.map(date => session(date, [ohp()])));
    equal(h.run('periodCompare(7).cur.sessions'), 7, zone + ' current exact membership');
    equal(h.run('periodCompare(7).prev.sessions'), 7, zone + ' previous exact membership');
    equal(h.run('getWeeklyVolume(7).fdelt'), 21, zone + ' volume uses exact window');
    equal(h.run('statSnapshot().last7'), 7, zone + ' snapshot uses exact window');
    equal(h.run("musclePeriodCompare(7).find(m=>m.k==='fdelt')"), { k: 'fdelt', l: 'Front Delts', cur: 21, prev: 21 }, zone + ' muscle comparison agrees');
    const scoreWithOutside = h.run('getFatigue().score');
    h.state(dates.filter(date => date >= win.start && date <= win.end).map(date => session(date, [ohp()])));
    equal(h.run('getFatigue().score'), scoreWithOutside, zone + ' fatigue ignores future and earlier dates');
    h.state([dates[0], dates[7], dates[14]].map((date, i) => session(date, [ohp(40 + i * 2)])));
    equal(h.run("e1rmSlope('ohp',56).spanDays"), 14, zone + ' two-week trend uses calendar days across DST');
    equal(h.run("e1rmSlope('ohp',56).n"), 3, zone + ' DST cannot drop a qualifying trend');
  }
  process.env.TZ = 'UTC';
  const h = harness();
  equal(h.run('calendarWindow(10)'), { start: '2026-08-29', end: '2026-09-07', days: 10 }, 'ten inclusive dates');
  h.state(['2026-08-28', '2026-08-29', '2026-09-07', '2026-09-08'].map(date => session(date, [ohp()])));
  equal(h.run('getWeeklyVolume(10).fdelt'), 6, 'excluded extra date and future cannot inflate volume');
  equal(h.run('periodCompare(10).cur.sessions'), 2, 'current boundaries included once');
  equal(h.run('periodCompare(10).prev.sessions'), 1, 'extra date belongs to previous interval');
  equal(h.run("calendarWindow(7,0,new Date('2026-01-01T23:59:59'))"), { start: '2025-12-26', end: '2026-01-01', days: 7 }, 'explicit clock crosses year correctly');

  // Canonical per-set values must agree in the total, trend and exercise detail.
  h.state([session('2026-09-07', ['hex_dl', 'hex_squat_b', 'ohp', 'floor_press'].map(id => ({ id, wt: 40, reps: [5, 5], wts: [40, 60] })))]);
  equal(h.run('big4Weekly(12).at(-1).v'), 280, 'Big-4 uses heavier per-set override');
  h.state([session('2026-09-07', ['hex_dl', 'hex_squat_b', 'ohp', 'floor_press'].map(id => ({ id, wt: 0, reps: [0, 5], wts: [0, 60] })))]);
  equal(h.run('big4Weekly(12).at(-1).v'), 280, 'override-only load remains valid');
  equal(h.run("exSetE1RMMax(ALL_EX.find(e=>e.id==='ohp'),{wt:40,reps:[8,0,6],wts:[40,40,50]})"), 59.8, 'interior zero does not shift load index');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [ohp(0, [0, 5], { wts: [0, 40 + i * 10] })])));
  const fit = h.run("e1rmSlope('ohp',56)");
  equal(fit.values, [46.7, 58.3, 70], 'spark values reuse per-set scoring from fitted cohort');
  equal(fit.n, 3, 'trend returns sample count');
  equal([fit.start, fit.end, fit.spanDays, fit.ageDays], ['2026-08-24', '2026-09-07', 14, 0], 'trend returns dates and age');
  equal(fit.change, 23.3, 'actual endpoint change is not eight-week extrapolation');
  equal(h.run("exStats('ohp').trend"), 23.3, 'detail uses observed change');
  equal(h.run('strengthMomentum()[0].values'), [46.7, 58.3, 70], 'momentum and detail share values');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date,
    ['ohp', 'dead_bugs_a', 'db_dead_bug', 'lm_pallof', 'lm_180', 'kb_swing', 'cb_mills', 'suitcase_march'].map(id => ({ id, wt: 20 + i, reps: [8, 8, 8] })))));
  equal(h.run('strengthMomentum().map(m=>m.id)'), ['ohp'], 'quality, club and carry work do not rank as strength momentum');
  h.state(['2026-07-20', '2026-07-27', '2026-08-10'].map((date, i) => session(date, [ohp(40 + i)])));
  equal(h.run('strengthMomentum()'), [], 'stale fitted series cannot drive current strength verdict');
  equal(h.run("e1rmProjection('ohp')"), null, 'stale series does not produce milestone scenario');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-08'].map((date, i) => session(date, [ohp(i === 3 ? 200 : 40 + i)])));
  equal(h.run("e1rmSlope('ohp',56).n"), 3, 'future observation cannot change trend');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-07'].map((date, i) => session(date, [ohp(40 + i)], { id: 'duplicate-date-' + i })));
  equal(h.run("e1rmSlope('ohp',56).values"), [46.7, 47.8, 49, 50.2], 'same-day observations retain logged order');

  const adjacent = harness();
  adjacent.state(['2026-08-01', '2026-08-28', '2026-08-29', '2026-09-07', '2026-09-08'].map((date, i) => session(date, [ohp(40 + i)])));
  equal(adjacent.run('recentPRs(10).map(p=>p.date)'), ['2026-09-07', '2026-08-29'], 'PR feed uses exact current window');
  adjacent.run('recentPRs(null)');
  equal(adjacent.run('recentPRs(10).map(p=>p.date)'), ['2026-09-07', '2026-08-29'], 'cached PR feed uses identical boundaries');
  adjacent.state(['2026-07-09', '2026-07-10', '2026-09-07', '2026-09-08'].map((date, i) => session(date, [ohp([100, 40, 41, 200][i])])), { bodyLog: [{ date: '2026-09-07', weight: 80 }] });
  equal(adjacent.run('relStrength().lifts[0].e1rm'), 47.8, 'relative strength excludes extra date and future load');
  adjacent.state(['2026-07-13', '2026-07-14', '2026-09-07', '2026-09-08'].map(date => session(date, [ohp()])));
  equal(adjacent.run('consistency().perWk8'), 0.3, 'eight-week recent numerator includes 56 dates and excludes future');

  // Band and set-count transitions must not be called strength loss or gain.
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band(['Green', 'Purple', 'Red'][i], Array(3).fill(8 - i * 2))])));
  equal(h.run("repsSlope('pullup_a',56)"), null, 'decreasing assistance resets rep comparison');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band('Green', Array(i + 2).fill(8))])));
  equal(h.run("repsSlope('pullup_a',56)"), null, 'added sets cannot masquerade as repetition capacity');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band('None', Array(3).fill(6 + i))])));
  equal(h.run("repsSlope('pullup_a',56).change"), 6, 'explicit unaided None remains comparable');
  equal(h.run("repsSlope('pullup_a',56).sets"), 3, 'trend names completed set count');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map(date => session(date, [band('', [8, 8, 8])])));
  equal(h.run("repsSlope('pullup_a',56)"), null, 'missing assistance is unknown, not automatically unaided');
  h.state(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band(i === 2 ? 'Red' : 'Green')])));
  equal(h.run("comparableBandHistory('pullup_a',56).length"), 1, 'returning to an older band starts a fresh run');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band('Green', i === 2 ? [8, 8, 0] : [8, 8, 8])])));
  equal(h.run("repsSlope('pullup_a',56)"), null, 'changed completed-set count resets comparison');
  h.state(['2026-08-24', '2026-08-31', '2026-09-07'].map((date, i) => session(date, [band(i === 0 ? 'Blue' : 'Blue (heaviest)', Array(3).fill(6 + i))])));
  equal(h.run("repsSlope('pullup_a',56).n"), 3, 'equivalent legacy band names remain comparable');

  // Rendered advice is descriptive even during a planned return to training.
  h.state([session('2026-09-07', [ohp()])], { comeback: { start: '2026-09-06', gap: 20 } });
  const renderSegment = segment => h.run(`STAT_SEG='${segment}';(()=>{const el={innerHTML:''};rStats(el);return el.innerHTML})()`);
  const overview = renderSegment('overview'), balance = renderSegment('balance');
  ok(!/consider a set|Priority:|not progressing/.test(overview), 'Overview does not prescribe from a reference gap');
  ok(!/consider a set|productive|aim ~1:1/.test(balance), 'Balance avoids prescriptions and productivity/ratio claims');
  ok(/reference gap alone does not call for more sets/.test(balance), 'Balance explains uncertainty');
  ok(/29 Aug/.test(balance) && /7 Sep/.test(balance), 'Balance displays actual inclusive dates');
} finally {
  if (originalTZ == null) delete process.env.TZ; else process.env.TZ = originalTZ;
}
console.log(`${assertions} analytics assertions passed`);
