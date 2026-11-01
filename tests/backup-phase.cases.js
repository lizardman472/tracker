// Explicit matching-phase decision: no automatic context or completed-tag eligibility change.
module.exports=function({harness,test,plain,SK,AW}){
 const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),F=require('./fixtures/backup-state');
 const now=new Date('2026-11-01T12:00:00').getTime();class PhaseDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const evidence=[],output=path.join(__dirname,'..','test-results','recovery-layout','backup-phase-unit-evidence.json');let contexts=[];
 const originalTest=test;test=(name,fn)=>originalTest(name,()=>{contexts=[];try{fn();evidence.push({name,passed:true,contexts:contexts.map(h=>({bytes:[...h.values],state:JSON.parse(vm.runInContext('JSON.stringify({phase:D.phase,phaseStart:D.phaseStart,originalResume:D.originalResume,pending:PENDING_SAVE,mainError:SAVE_ERROR,activeError:AW_ERROR,raw:RECOVERY_RAW,rawError:RECOVERY_ERROR})',h.ctx)),operations:h.operations,alerts:h.alerts}))})}catch(e){fs.writeFileSync(output,JSON.stringify([...evidence,{name,passed:false,error:e.message}],null,2));throw e}});
 function start(options={}){const m=plain(F.MAIN);m.phase=2;m.phaseStart='2026-10-20';m.originalResume={id:'original-main-phase2',date:'2026-10-01',phase:2,loads:{hex_dl:40},bands:{pullup_a:'Green'}};
  if(options.partner)m.location='partner';if(options.plan)m.trainingPlan={stage:options.plan,phase:2,start:'2026-10-01',stageStart:'2026-10-20',loads:{},bands:{}};
  const h=harness(undefined,{values:[[SK,JSON.stringify(m)],[AW,F.DRAFT_RAW]],Date:PhaseDate});contexts.push(h);return h;
 }
 test('phase matching cancel names existing clock/return effects and preserves exact state',()=>{
  const h=start(),bytes=[...h.values],state=plain(h.api.getD());let question='';h.ctx.confirm=s=>{question=s;return false};assert.equal(h.ctx.setPhase(1),false);assert.match(question,/phase review clock restarts today/);assert.match(question,/current original-return plan clears/);assert.match(question,/matches the saved unfinished/);assert.deepEqual([...h.values],bytes);assert.deepEqual(plain(h.api.getD()),state);
 });
 test('explicit matching phase preserves draft/tag through Resume and retains existing final eligibility',()=>{
  const h=start(),raw=h.values.get(AW);assert.equal(h.ctx.checkResume(),null);assert(h.ctx.setPhase(1));assert.equal(h.api.getD().phase,1);assert.equal(h.api.getD().phaseStart,'2026-11-01');assert.equal(h.api.getD().originalResume,null);assert.equal(h.values.get(AW),raw);assert(h.ctx.checkResume());
  h.ctx.resumeW();assert.equal(h.api.getActiveId(),'backup-active-1');assert.equal(h.ctx.recoveryExportData().activeWorkout.originalResumeId,'original-backup-oracle');
  h.api.setSummary({id:'backup-active-1',originalResumeId:'original-backup-oracle',day:'A',date:'2026-11-01',exs:[{id:'hex_dl',wt:40,reps:[5],form:[5],notes:'Hex keep'}],tv:200,ts:1,tr:5,dur:20,warmup:2,notes:'Phase restore keep'}, {hex_dl:{reps:['5'],setDone:[true],form:[5],disc:'none',discJoints:[]}});assert.equal(h.api.getSummary().originalResumeId,'original-backup-oracle');
  h.ctx.saveSumm();const saved=h.api.getD().sessions.find(s=>s.id==='backup-active-1');assert.equal(saved.phase,1);assert.equal(saved.notes,'Phase restore keep');assert.equal(saved.originalResumeId,undefined,'Cleared current anchor must not manufacture completed-tag eligibility');assert.equal(h.values.has(AW),false);h.ctx.load();assert.equal(h.api.getD().sessions.filter(s=>s.id==='backup-active-1').length,1);
 });
 test('unrelated target and different venue never use matching-phase exception',()=>{
  for(const options of [{},{partner:true}]){const h=start(options),before=[...h.values];let prompts=0;h.ctx.confirm=()=>{prompts++;return true};assert.equal(h.ctx.setPhase(options.partner?1:3),false);assert.deepEqual([...h.values],before);assert.equal(prompts,0)}
 });
 for(const plan of ['deload','return','original1','progress'])test('existing training plan '+plan+' guard is not bypassed',()=>{
  const h=start({plan}),before=[...h.values];assert.equal(h.ctx.setPhase(1),false);assert.deepEqual([...h.values],before);
 });
 const guards=[['reader','WRITER=false'],['not ready','WRITER_READY=false'],['live workout',"ADAY='A'"],['pending main','PENDING_SAVE=structuredClone(D)'],['pending active',"PENDING_ACTIVE={id:'pending'}"],['import busy','IMPORT_BUSY=true'],['main error',"SAVE_ERROR='Earlier main failure'"],['active error',"AW_ERROR='Earlier active failure'"],['active cleanup','AW_CLEANUP=true'],['raw unresolved',"RECOVERY_RAW='earlier raw'"],['raw error',"RECOVERY_ERROR='Earlier raw failure'"],['raw cleanup','RECOVERY_CLEANUP=true']];
 for(const[label,source]of guards)test('matching phase refuses '+label+' without clearing state',()=>{
  const h=start();vm.runInContext(source,h.ctx);const bytes=[...h.values],state=plain(h.api.getD()),error=h.api.getAWError();assert.equal(h.ctx.setPhase(1),false);assert.deepEqual([...h.values],bytes);assert.deepEqual(plain(h.api.getD()),state);assert.equal(h.api.getAWError(),error);
 });
 const races=[['main bytes',h=>h.values.set(SK,'external main')],['active bytes',h=>h.values.set(AW,'external active')],['ownership',h=>h.api.owner(false)],['ready',h=>vm.runInContext('WRITER_READY=false',h.ctx)],['pending main',h=>vm.runInContext('PENDING_SAVE=structuredClone(D)',h.ctx)],['pending active',h=>vm.runInContext("PENDING_ACTIVE={id:'other'}",h.ctx)],['import',h=>vm.runInContext('IMPORT_BUSY=true',h.ctx)],['active error',h=>vm.runInContext("AW_ERROR='New active failure'",h.ctx)],['raw error',h=>vm.runInContext("RECOVERY_ERROR='New raw failure'",h.ctx)],['cleanup',h=>vm.runInContext('RECOVERY_CLEANUP=true',h.ctx)],['location',h=>vm.runInContext("D.location='partner'",h.ctx)],['phase',h=>vm.runInContext('D.phase=3',h.ctx)],['training plan',h=>vm.runInContext("D.trainingPlan={stage:'return'}",h.ctx)],['main readback',h=>h.faults.get.add(SK)],['active readback',h=>h.faults.get.add(AW)]];
 for(const[label,change]of races)test('phase confirmation rechecks '+label+' before proposing any save',()=>{
  const h=start(),writes=h.operations.length;let changedBytes;h.ctx.confirm=()=>{change(h);changedBytes=[...h.values];return true};assert.equal(h.ctx.setPhase(1),false);assert.deepEqual([...h.values],changedBytes);assert.equal(h.operations.length,writes);
 });
 for(const key of [SK,AW])test('phase capture read failure '+key+' leaves exact originals',()=>{
  const h=start(),before=[...h.values];h.faults.get.add(key);assert.equal(h.ctx.setPhase(1),false);assert.deepEqual([...h.values],before);assert.equal(h.api.getPending(),null);
 });
 test('phase main quota failure retains exact draft and retryable explicit proposal',()=>{
  const h=start(),main=h.values.get(SK),active=h.values.get(AW);h.fail(true);assert.equal(h.ctx.setPhase(1),false);assert.equal(h.values.get(SK),main);assert.equal(h.values.get(AW),active);assert.equal(h.api.getD().phase,2);assert.equal(h.api.getPending().phase,1);assert.equal(h.api.getPending().originalResume,null);h.fail(false);assert(h.ctx.retrySave());assert.equal(h.api.getD().phase,1);assert.equal(h.values.get(AW),active);assert.equal(h.api.getPending(),null);
 });
 fs.writeFileSync(output,JSON.stringify(evidence,null,2));
};
