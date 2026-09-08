// Synthetic behavioral checks for normalized state, single-writer commits and recovery.
// Browser-owned locking/handover itself is exercised by storage.browser.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══════════════ INIT'));
const SK = 'rft-v12', AW = 'rft-active';
let passed = 0;
function test(name, fn) { try { fn(); passed++; } catch (e) { console.error('FAIL:', name); throw e; } }
function fixture() {
  return { sessions: [{ id: 'old', date: '2020-01-02', day: 'A', loc: 'home', phase: 1, difficulty: 3,
    duration: 45, volume: 400, warmup: 2, notes: '', ex: [{ id: 'hex_dl', wt: 40, reps: [5,5], form: [5,5], notes: '', band: '' }] }],
    nextDay: 'B', phase: 1, phaseStart: '2020-01-01', programVersion: 21, location: 'home',
    cues: { hex_dl: 'Brace' }, bodyLog: [{ date: '2020-01-02', weight: 80 }],
    cardioLog: [{ id: 'cardio', date: '2020-01-02', type: 'Walking', duration: 20, intensity: 'easy' }],
    discomfort: [{ date: '2020-01-02', exId: 'hex_dl', level: 'mild', joint: 'Knee' }], theme: 'light', gen: 1 };
}
function harness(initial = fixture()) {
  const values = new Map([[SK, JSON.stringify(initial)]]), elements = new Map(), alerts = [], downloads = [];
  let failMain = false, failActive = false, failRemove = false;
  const storage = { getItem: k => values.get(k) ?? null, setItem(k,v) {
    if ((failMain && k === SK) || (failActive && k === AW)) throw new Error('Synthetic quota failure');
    values.set(k, String(v));
  }, removeItem(k) { if (failRemove && k === AW) throw new Error('Synthetic remove failure'); values.delete(k); } };
  const ctx = { localStorage: storage, structuredClone, console, Date, Math, Blob, navigator: {},
    setTimeout: () => 0, clearTimeout() {}, clearInterval() {}, confirm: () => true, alert: x => alerts.push(x),
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    FileReader: class { readAsText(file) { this.onload({ target: { result: file.content } }); } },
    document: { getElementById: id => elements.get(id) || null,
      createElement: () => ({ click() {}, setAttribute() {}, style: {} }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code + `\n;globalThis.API={
    getD:()=>D,setD:x=>{D=x;rememberCommitted(localStorage.getItem(SK));PENDING_SAVE=null;PENDING_AFTER=null;SAVE_ERROR=''},
    owner:x=>{WRITER=x;WRITER_READY=true},getPending:()=>PENDING_SAVE,getError:()=>SAVE_ERROR,getAWError:()=>AW_ERROR,
    getIssues:()=>({dropped:LOAD_DROPPED,repaired:LOAD_REPAIRED}),
    setSummary:(s,log)=>{window._S=s;LOG=log;ADAY=s.day;SS=Date.now();ACTIVE_ID=s.id;SDIFF=3},
    setActive:r=>{ADAY=r.day;LOG=r.log;SS=r.start;ACTIVE_ID=r.id;CIDX=0;SWAP={};SNOTES='';WU_CHECKS=[false,false,false]},
    setLP:x=>{LP=x},getView:()=>VIEW,
    getSummary:()=>window._S,getActiveId:()=>ACTIVE_ID};
    render=()=>{};applyTheme=()=>{};clearTimer=()=>{};releaseWake=()=>{};acquireWake=()=>{};
    go=v=>{VIEW=v};`, ctx);
  ctx.API.owner(true); ctx.load();
  return { ctx, api: ctx.API, values, storage, elements, alerts, downloads,
    fail: (main, active = false, remove = false) => { failMain=main; failActive=active; failRemove=remove; } };
}
const plain = x => JSON.parse(JSON.stringify(x));

test('calendar validation rejects impossible dates and keeps leap days', () => {
  const { ctx } = harness();
  assert.equal(ctx.validISODate('2024-02-29'), true);
  for (const d of ['2025-02-29','2026-99-99','2026-04-31','2026-01-01<script>']) assert.equal(ctx.validISODate(d), false);
});
test('history/import/merge preserve legacy Core without moving rotation', () => {
  const s=fixture(); s.sessions[0].day='X'; s.nextDay='C'; const { ctx, api }=harness(s);
  assert.equal(api.getD().sessions[0].day,'X'); assert.equal(api.getD().nextDay,'C');
  const back=ctx.mergeImport(ctx.freshState(),plain(api.getD())).W;
  assert.equal(back.sessions[0].day,'X'); assert.equal(back.nextDay,'C');
  assert.equal(ctx.mergeStores(back,ctx.freshState()).sessions[0].day,'X');
  assert.equal(ctx.validSession({...s.sessions[0],day:'Z'}),null);
});
test('session metadata and exercise fields cannot retain arbitrary executable markup', () => {
  const { ctx }=harness(); const s=fixture().sessions[0]; const marker='<img src=x onerror=marker()>';
  Object.assign(s,{duration:marker,difficulty:marker,warmup:marker,volume:marker,notes:{html:marker},loc:marker,phase:marker,noProg:marker,custom:marker});
  s.ex[0].band={html:marker}; s.ex[0].notes=42; s.ex[0].form=[true,-1,99,5]; s.ex[0].custom=marker;
  const v=ctx.validSession(s); assert.ok(v); assert.equal(JSON.stringify(v).includes(marker),false);
  assert.equal(v.difficulty,null); assert.equal(v.noProg,undefined); assert.deepEqual(plain(v.ex[0].form),[0,0,0,5]);
  assert.equal(ctx.validSession({...s,id:"x');marker();//"}),null);
});
test('shared normalizer salvages good rows from malformed auxiliary logs and rescues bytes', () => {
  const s=fixture(); s.cardioLog={unexpected:true}; s.bodyLog.push({date:'2026-02-30',weight:80}); s.discomfort.push({date:'2020-01-03',exId:'hex_dl',level:'bad',joint:'Knee'});
  const h=harness(s), d=h.api.getD(); assert.ok(Array.isArray(d.cardioLog)); assert.equal(d.cardioLog.length,0);
  assert.equal(d.sessions.length,1); assert.equal(d.bodyLog.length,1); assert.equal(d.discomfort.length,1);
  assert.ok(h.api.getIssues().repaired>=3); assert.equal(h.values.get(SK+'-corrupt'),JSON.stringify(s));
  const imported=h.ctx.mergeImport(h.ctx.freshState(),s); assert.equal(imported.W.cardioLog.length,0); assert.ok(imported.skipped>=3);
  assert.equal(h.ctx.mergeStores(h.ctx.freshState(),s).cardioLog.length,0);
});
test('explicit save proposal leaves live and stored state unchanged on quota failure', () => {
  const h=harness(), before=JSON.stringify(h.api.getD()), raw=h.values.get(SK), proposal=plain(h.api.getD());
  proposal.theme='dark'; h.fail(true); assert.equal(h.ctx.save(proposal),false);
  assert.equal(JSON.stringify(h.api.getD()),before); assert.equal(h.values.get(SK),raw);
  assert.equal(h.api.getPending().theme,'dark'); assert.match(h.api.getError(),/Not saved/);
  h.fail(false); assert.equal(h.ctx.retrySave(),true); assert.equal(h.api.getD().theme,'dark'); assert.equal(h.api.getPending(),null);
});
test('reader save refuses mutation and cannot resurrect reset or deleted records', () => {
  const h=harness(); h.api.owner(false); const before=JSON.stringify(h.api.getD()); h.api.getD().bodyLog=[];
  assert.equal(h.ctx.save(),false); assert.equal(JSON.stringify(h.api.getD()),before); assert.equal(h.api.getPending(),null);
  h.api.owner(true); h.ctx.resetAll(); const reset=plain(h.api.getD()); assert.equal(reset.sessions.length,0); assert.notEqual(reset.resetEpoch,'0');
  h.api.owner(false); h.api.getD().sessions=fixture().sessions; assert.equal(h.ctx.save(),false); assert.equal(h.api.getD().sessions.length,0);
});
test('unexpected external main-store writes are not overwritten or silently unioned', () => {
  const h=harness(), remote=fixture(); remote.sessions[0].id='other-tab'; h.values.set(SK,JSON.stringify(remote));
  const proposed=plain(h.api.getD()); proposed.theme='dark'; assert.equal(h.ctx.save(proposed),false);
  assert.equal(JSON.parse(h.values.get(SK)).sessions[0].id,'other-tab'); assert.match(h.api.getError(),/outside this tab/);
});
function summary(h) {
  const s={id:'stable-workout',date:'2020-01-02',day:'A',dur:50,tv:500,warmup:2,notes:'',exs:[{id:'hex_dl',wt:50,reps:[5],notes:'',band:''}]};
  h.api.setSummary(s,{hex_dl:{wt:50,reps:[5],setDone:[true],disc:'mild',discJoints:['Hip']}}); return s;
}
test('same-day summary quota failure and retry preserve every existing row exactly once', () => {
  const h=harness(), d=h.api.getD(); d.sessions.push({...plain(d.sessions[0]),id:'other-tab'}); h.api.setD(d); h.ctx.save();
  const before=plain(h.api.getD()); summary(h); h.fail(true); h.ctx.saveSumm();
  assert.deepEqual(plain(h.api.getD()),before); assert.equal(h.api.getPending().sessions.filter(s=>s.id==='stable-workout').length,1);
  assert.ok(h.api.getSummary()); assert.ok(h.values.get(AW)); h.fail(false); assert.equal(h.ctx.retrySave(),true);
  assert.deepEqual(plain(h.api.getD().sessions.map(s=>s.id)),['old','other-tab','stable-workout']);
  assert.equal(h.api.getD().discomfort.length,2); assert.equal(h.api.getD().nextDay,'B'); assert.equal(h.api.getSummary(),null);
  h.ctx.load(); assert.equal(h.api.getD().sessions.filter(s=>s.id==='stable-workout').length,1);
});
test('summary double tap cannot create another id or duplicate session', () => {
  const h=harness(); summary(h); h.fail(true); h.ctx.saveSumm(); h.ctx.saveSumm(); h.fail(false); h.ctx.saveSumm(); h.ctx.saveSumm();
  assert.equal(h.api.getD().sessions.filter(s=>s.id==='stable-workout').length,1);
});
test('active backup write failures are visible and independently exportable', () => {
  const h=harness(); summary(h); h.fail(false,true); assert.equal(h.ctx.saveAW(),false); assert.match(h.api.getAWError(),/not saved/);
  h.ctx.exportActiveWorkout(); assert.equal(h.downloads.length,1); h.fail(false); assert.equal(h.ctx.retrySave(),true); assert.equal(h.api.getAWError(),'');
});
test('active records reject unsafe structure and sanitize resumed log values', () => {
  const h=harness(); summary(h); h.ctx.saveAW(); const raw=JSON.parse(h.values.get(AW));
  raw.log.hex_dl.wt='<svg onload=marker()>'; raw.log.hex_dl.band={bad:true}; raw.log.hex_dl.form=[99]; raw.notes={bad:true}; raw.swaps={"x');bad()":"hex_dl"};
  h.values.set(AW,JSON.stringify(raw)); const r=h.ctx.checkResume(); assert.ok(r); assert.equal(r.log.hex_dl.wt,null); assert.equal(r.log.hex_dl.band,''); assert.equal(r.notes,''); assert.deepEqual(plain(r.swaps),{});
  raw.log=[]; h.values.set(AW,JSON.stringify(raw)); assert.equal(h.ctx.checkResume(),null);
});
test('reset invalidates a backup even when deletion fails; retry removes it', () => {
  const h=harness(); summary(h); h.ctx.saveAW(); h.fail(false,false,true); assert.equal(h.ctx.resetAll(),true);
  assert.ok(h.values.get(AW)); assert.equal(h.ctx.checkResume(),null); assert.match(h.api.getAWError(),/remove/);
  h.fail(false); assert.equal(h.ctx.retrySave(),true); assert.equal(h.values.has(AW),false);
});
test('committed summary id hides stale backup if cleanup fails', () => {
  const h=harness(); summary(h); h.ctx.saveAW(); h.fail(false,false,true); h.ctx.saveSumm();
  assert.ok(h.values.get(AW)); assert.equal(h.ctx.checkResume(),null);
});
test('cardio rejects negative, infinite, zero durations and retains a failed form', () => {
  const h=harness(); h.elements.set('c-int',{value:'easy'});
  for(const value of ['-30','Infinity','0']) { h.elements.set('c-dur',{value}); h.ctx.saveCardio(); }
  assert.equal(h.api.getD().cardioLog.length,1); assert.equal(h.alerts.length,3);
  h.elements.set('c-dur',{value:'30'}); h.fail(true); h.ctx.saveCardio(); assert.equal(h.api.getD().cardioLog.length,1); assert.equal(h.elements.get('c-dur').value,'30');
  h.fail(false); h.ctx.retrySave(); assert.equal(h.api.getD().cardioLog.length,2); assert.equal(h.api.getView(),'home');
});
test('body input rejects negative and nonfinite values without losing form data', () => {
  const h=harness(); h.elements.set('bm_weight',{value:'-80'}); h.ctx.saveBod(); assert.equal(h.api.getPending(),null);
  h.elements.set('bm_weight',{value:'85'}); h.fail(true); h.ctx.saveBod(); assert.equal(h.elements.get('bm_weight').value,'85'); assert.equal(h.api.getD().bodyLog.length,1);
  h.fail(false); h.ctx.retrySave(); assert.equal(h.api.getD().bodyLog.length,2);
});
test('failed delete retains committed records and pending retry performs deletion', () => {
  const h=harness(); h.fail(true); h.ctx.delCardio('cardio'); assert.equal(h.api.getD().cardioLog.length,1);
  h.fail(false); h.ctx.retrySave(); assert.equal(h.api.getD().cardioLog.length,0);
});
test('failed reset retains every committed field and draft until retry succeeds', () => {
  const h=harness(); summary(h); h.ctx.saveAW(); const before=JSON.stringify(h.api.getD()); h.fail(true); assert.equal(h.ctx.resetAll(),false);
  assert.equal(JSON.stringify(h.api.getD()),before); assert.ok(h.values.get(AW)); h.fail(false); h.ctx.retrySave(); assert.equal(h.api.getD().sessions.length,0); assert.equal(h.values.has(AW),false);
});
test('failed import is pending, truthfully reported and retryable without replacing saved history', () => {
  const h=harness(), backup=fixture(); backup.sessions[0].id='imported'; h.fail(true); h.ctx.impD({target:{files:[{content:JSON.stringify(backup)}],value:'x'}});
  assert.equal(h.api.getD().sessions.length,1); assert.ok(h.api.getPending()); assert.match(h.alerts.at(-1),/could not be saved/);
  h.fail(false); h.ctx.retrySave(); assert.equal(h.api.getD().sessions.length,2); assert.match(h.alerts.at(-1),/Import saved/);
});
test('active-workout recovery import restores a typed resumable workout', () => {
  const h=harness(); summary(h); const active=plain(h.ctx.activeRecord()); const backup=fixture(); backup.activeWorkout=active;
  h.ctx.impD({target:{files:[{content:JSON.stringify(backup)}],value:'x'}}); const resume=h.ctx.checkResume(); assert.ok(resume); assert.equal(resume.id,'stable-workout'); assert.equal(resume.log.hex_dl.reps[0],5);
});
test('read-only export never tries to update backup metadata', () => {
  const h=harness(); h.api.owner(false); const before=h.values.get(SK); h.ctx.expD(); assert.equal(h.values.get(SK),before); assert.equal(h.downloads.length,1); assert.equal(h.api.getPending(),null);
});
test('failed-summary recovery export imports as one completed session, without redundant draft', () => {
  const h=harness(); summary(h); h.fail(true); h.ctx.saveSumm(); const backup=plain(h.ctx.recoveryExportData());
  assert.equal(backup.activeWorkout,undefined); const restored=harness();
  restored.ctx.impD({target:{files:[{content:JSON.stringify(backup)}],value:'x'}});
  assert.equal(restored.api.getD().sessions.filter(s=>s.id==='stable-workout').length,1);
  assert.match(restored.alerts.at(-1),/Import saved/);
});
test('failed history import retains imported unfinished workout in recovery export and retry', () => {
  const source=harness(); summary(source); const backup=fixture(); backup.activeWorkout=plain(source.ctx.activeRecord());
  const h=harness(); h.fail(true); h.ctx.impD({target:{files:[{content:JSON.stringify(backup)}],value:'x'}});
  assert.equal(h.ctx.recoveryExportData().activeWorkout.id,'stable-workout');
  h.fail(false); h.ctx.retrySave(); assert.equal(h.ctx.checkResume().id,'stable-workout');
});
test('imported active write failure has a working retry and downloadable pending payload', () => {
  const source=harness(); summary(source); const backup=fixture(); backup.activeWorkout=plain(source.ctx.activeRecord());
  const h=harness(); h.fail(false,true); h.ctx.impD({target:{files:[{content:JSON.stringify(backup)}],value:'x'}});
  assert.equal(h.api.getPending(),null); assert.equal(h.ctx.checkResume(),null); assert.match(h.api.getAWError(),/unfinished workout is not saved/);
  assert.equal(h.ctx.recoveryExportData().activeWorkout.id,'stable-workout');
  assert.match(h.alerts.at(-1),/NOT saved/); h.fail(false); assert.equal(h.ctx.retrySave(),true); assert.equal(h.ctx.checkResume().id,'stable-workout');
});
test('unparseable legacy source bytes survive fallback and first successful save', () => {
  const h=harness(); h.values.delete(SK); const raw='{bad legacy json'; h.values.set('rft-v11',raw);
  h.ctx.load(); assert.equal(h.api.getD().sessions.length,0); assert.equal(h.values.get(SK+'-corrupt'),raw);
  h.ctx.save(); assert.equal(h.values.get(SK+'-corrupt'),raw); assert.equal(h.values.has('rft-v11'),false);
});
test('past-session input validates numbers and retains a failed save for exact retry', () => {
  const h=harness(); h.api.setLP({date:'2020-01-03',day:'A',loc:'home'});
  h.elements.set('lp_hex_dl_wt',{value:'40'}); h.elements.set('lp_hex_dl_r0',{value:'-5'});
  h.ctx.savePast(); assert.equal(h.api.getPending(),null); assert.match(h.alerts.at(-1),/whole numbers/);
  h.elements.get('lp_hex_dl_r0').value='5'; h.fail(true); h.ctx.savePast();
  assert.equal(h.api.getD().sessions.length,1); assert.equal(h.elements.get('lp_hex_dl_r0').value,'5');
  const id=h.api.getPending().sessions.at(-1).id; h.fail(false); h.ctx.retrySave();
  assert.equal(h.api.getD().sessions.filter(s=>s.id===id).length,1); assert.equal(h.api.getView(),'history');
});
test('post-commit view errors cannot turn a durable write into a pending retry', () => {
  const h=harness(), proposal=plain(h.api.getD()); proposal.theme='dark';
  assert.equal(h.ctx.save(proposal,{after:()=>{throw Error('Synthetic render failure')}}),true);
  assert.equal(JSON.parse(h.values.get(SK)).theme,'dark'); assert.equal(h.api.getPending(),null); assert.match(h.alerts.at(-1),/Data was saved/);
  h.values.set(AW,'draft'); assert.equal(h.ctx.clearAW(()=>{throw Error('Synthetic render failure')}),true); assert.equal(h.values.has(AW),false);
});
console.log(`${passed} storage scenarios passed`);
