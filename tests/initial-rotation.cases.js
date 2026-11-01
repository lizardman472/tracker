module.exports=function({harness,test,plain,SK,AW,code}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),F=require('./fixtures/tier-and-rotation'),evidence=[],NativeDate=Date;
 class FixedDate extends NativeDate{constructor(...a){super(...(a.length?a:[F.now]))}static now(){return new NativeDate(F.now).getTime()}}
 const open=(d,options={})=>harness(d,{Date:FixedDate,...options});
 for(const day of ['A','B','C'])for(const start of ['2026-11-01','2026-11-02'])test('R9 initial deload retains '+day+' on '+start,()=>{
  const h=open(F.rotation(day)),before=plain(h.api.getD());h.ctx.confirm=()=>{throw Error('Initial start has no confirmation')};assert(h.ctx.startTrainingPlan(start));let d=h.api.getD();assert.equal(d.nextDay,day);assert.equal(d.phase,2);assert.deepEqual(plain(d.sessions),before.sessions);assert.equal(d.trainingPlan.start,start);assert.equal(d.trainingPlan.stageStart,start);assert.equal(d.trainingPlan.stage,'deload');assert.equal(d.originalResume,null);
  assert.deepEqual(plain(d.trainingPlan.loads),day==='C'?{hex_squat_b:60,ohp:30}:{hex_dl:80,floor_press:50});assert.deepEqual(plain(d.trainingPlan.bands),day==='C'?{band_leg_curl:'Green'}:{pullup_a:'Green'});
  h.ctx.load();assert.equal(h.api.getD().nextDay,day);const value=plain(h.ctx.completeBackupData()),restored=h.ctx.mergeImport(h.ctx.freshState(),value).W;assert.equal(restored.nextDay,day);assert.deepEqual(plain(restored.sessions),before.sessions);assert.deepEqual(plain(restored.trainingPlan),plain(h.api.getD().trainingPlan));evidence.push({case:'initial rotation',day,start,plan:plain(d.trainingPlan),exported:value,restored:plain(restored)});
 });
 for(const day of ['B','C'])test('R9 initial failed save keeps committed '+day+' and pending proposal '+day,()=>{
  const h=open(F.rotation(day)),before=plain(h.api.getD()),raw=h.values.get(SK);h.fail(true);assert.equal(h.ctx.startTrainingPlan(),false);assert.deepEqual(plain(h.api.getD()),before);assert.equal(h.values.get(SK),raw);assert.equal(h.api.getPending().nextDay,day);assert.equal(h.api.getPending().trainingPlan.stage,'deload');h.fail(false);assert(h.ctx.retrySave());h.ctx.load();assert.equal(h.api.getD().nextDay,day);assert.deepEqual(plain(h.api.getD().sessions),before.sessions);evidence.push({case:'failed start',day,rawPreserved:true,pendingDay:day,retryDay:h.api.getD().nextDay});
 });
 for(const block of ['reader','active','pending import','import busy','saved unreadable','past date','comeback'])test('R9 blocked initial start retains existing guards '+block,()=>{
  const input=F.rotation('C');if(block==='comeback')input.comeback={start:'2026-11-01',end:'2026-11-05',gap:20};const h=open(input);if(block==='reader')h.api.owner(false);if(block==='active')vm.runInContext("ADAY='C'",h.ctx);if(block==='pending import')vm.runInContext('PENDING_ACTIVE={id:"pending"}',h.ctx);if(block==='import busy')vm.runInContext('IMPORT_BUSY=true',h.ctx);if(block==='saved unreadable')h.values.set(AW,'{broken');const before=plain(h.api.getD()),raw=h.values.get(SK),active=h.values.get(AW);assert.equal(h.ctx.startTrainingPlan(block==='past date'?'2026-10-31':undefined),false);assert.deepEqual(plain(h.api.getD()),before);assert.equal(h.values.get(SK),raw);assert.equal(h.values.get(AW),active);
 });
 test('R9 existing mode cancellation and acceptance keep rotation',()=>{
  const h=open(F.rotation('B')),before=plain(h.api.getD()),raw=h.values.get(SK);h.ctx.confirm=()=>false;assert.equal(h.ctx.setRecoveryMode('deload'),false);assert.deepEqual(plain(h.api.getD()),before);assert.equal(h.values.get(SK),raw);h.ctx.confirm=()=>true;assert(h.ctx.setRecoveryMode('deload'));assert.equal(h.api.getD().nextDay,'B');assert.deepEqual(plain(h.api.getD().sessions),before.sessions);
 });
 test('R9 restoring forcedA is rejected by established B/C controls',()=>{
  const anchor='W.originalResume=null;\n return save(W,{after:renderTrainingPlanChange});',source=code.replace(/\r\n/g,'\n');assert(source.includes(anchor));const fault=source.replace(anchor,"W.originalResume=null;W.nextDay='A';\n return save(W,{after:renderTrainingPlanChange});");
  for(const day of ['B','C']){const h=open(F.rotation(day),{source:fault});assert(h.ctx.startTrainingPlan());assert.throws(()=>assert.equal(h.api.getD().nextDay,day),assert.AssertionError)}evidence.push({case:'forcedA fault',rejected:true});
 });
 const output=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'initial-rotation-unit-evidence.json'),JSON.stringify(evidence,null,2));
};
