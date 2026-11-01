module.exports=function({R,context,test,json}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),F=require('./fixtures/practice-continuity');
 const RealDate=context.Date,evidence=[];let clock=F.now;
 context.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return new RealDate(clock).getTime()}};
 const state=d=>Object.assign(json(R.freshState()),d);
 function advice(d,id='hex_dl',day=d.nextDay||'A'){
  R.setD(state(d));const history=json(R.getD().sessions),ex=R.dayExs(day).find(e=>e.id===id),suggestion=R.getSmartSugg(ex);R.ensureLog(ex);const log=json(R.getLOG()[id]);assert.deepEqual(json(R.getD().sessions),history);return{suggestion,log,effective:log.bands.map(b=>b||log.band)};
 }
 try{
  test('R6 held known same-step load uses counted raw slots30/35, not stored72',()=>{
   const d=F.lower(),result=advice(d);assert.equal(result.suggestion.wt,30);assert.equal(Number(result.log.wt),30);assert.equal(result.suggestion.type,'stay');evidence.push({case:'lower weighted',...result});
   const restored=R.mergeImport(R.freshState(),json(R.getD())).W;assert.equal(advice(restored).suggestion.wt,30);
  });
  for(const [stage,cap]of [['original1',72],['original2',76],['original3',80]])test('R6 retains stage cap and lower actual load '+stage,()=>{
   const d=F.lower();d.trainingPlan.stage=stage;d.sessions[0].trainingStage=stage;d.trainingPlan.returnLoads.hex_dl=cap;assert.equal(advice(d).suggestion.wt,30);d.sessions[0].ex[0].wts=[80,80,80];assert.equal(advice(d).suggestion.wt,cap);
  });
  test('R6 held phase isolation does not reinterpret missing-phase rows',()=>{
   const d=F.lower();delete d.sessions[0].phase;assert.equal(advice(d).suggestion.wt,72);d.sessions[0].phase=1;assert.equal(advice(d).suggestion.wt,72);
   delete d.trainingPlan.phase;delete d.trainingPlan.phaseLoads;assert.equal(advice(d).suggestion.wt,30);
  });
  for(const [key,value]of [['loc','partner'],['trainingPlanStart','2026-09-01'],['trainingStage','original2'],['date','2026-11-02']])test('R6 held lower bound excludes other context '+key,()=>{
   const d=F.lower();d.sessions[0][key]=value;assert.equal(advice(d).suggestion.wt,72);
  });
  test('R6 assistance counted positions and easiest padding survive advice/prefill',()=>{
   for(const [stage,expected]of [['original1',F.assistance],['original2',['Green','Blue (heaviest)','Blue (heaviest)','Blue (heaviest)']]]){
    const result=advice(F.bands('assist',stage),'pullup_a');assert.deepEqual(result.effective,expected);assert.equal(result.suggestion.type,'stay');evidence.push({case:'held assistance '+stage,...result});
   }
  });
  test('R6 resistance counted positions retain the easier direction',()=>{
   const result=advice(F.bands('resist'),'band_leg_curl','B');assert.deepEqual(result.effective,F.resistance);evidence.push({case:'held resistance',...result});
   const d=F.bands('resist','original2');d.sessions[0].ex[0].id='rear_delt';d.trainingPlan.bands.rear_delt='Green';d.trainingPlan.returnBands.rear_delt='Green';assert.deepEqual(advice(d,'rear_delt','B').effective,['Purple','Red','Red','Red']);
  });
  test('R6 opaque held bands remain labelled for manual choice',()=>{
   const d=F.bands('assist','original2');d.sessions[0].ex[0].band='Legacy band';d.sessions[0].ex[0].bands[0]='';const result=advice(d,'pullup_a');assert.equal(result.suggestion.type,'stay');assert.match(result.suggestion.text,/choose a band manually/);assert.deepEqual(result.effective,['Legacy band','Blue (heaviest)','Blue (heaviest)','Blue (heaviest)']);
  });
  test('R6 manual control load retains a counted lower setup without automatic increase',()=>{
   const d=F.lower();d.nextDay='C';d.trainingPlan.loads={lm_pallof:40};d.trainingPlan.phaseLoads={lm_pallof:40};d.trainingPlan.returnLoads={lm_pallof:36};d.sessions[0].day='C';d.sessions[0].ex=[{id:'lm_pallof',wt:31,reps:[24,0,24],wts:[21,31,15],form:[5,0,5],band:''}];const r=advice(d,'lm_pallof','C');assert.equal(r.suggestion.wt,15);assert.match(r.suggestion.text,/Choose load for control/);
  });
  for(const [stage,next,expected]of [['original1','original2',34],['original2','original3',38]])test('R6 known-phase stage transition retains literal lower anchor '+stage,()=>{
   R.setD(state(F.transition(stage)));const before=json(R.getD());assert(R.trainingPlanStatus().due);R.setConfirm(false);assert.equal(R.advanceTrainingPlan(),false);assert.deepEqual(json(R.getD()),before);R.setConfirm(true);assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.stage,next);assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,expected);assert.equal(R.getD().phase,2);assert.deepEqual(json(R.getD().sessions),before.sessions);evidence.push({case:'transition '+stage,expected,plan:json(R.getD().trainingPlan)});
  });
  test('R6 missing-phase transition rows retain legacy eligibility and relative order',()=>{
   const d=F.transition();delete d.sessions.at(-1).phase;R.setD(state(d));assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,76);
   d.sessions.at(-1).ex[0].wt=30;R.setD(state(d));assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,34);
   delete d.trainingPlan.phase;d.sessions.at(-1).phase=1;d.sessions.at(-1).ex[0].wt=80;R.setD(state(d));assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,76);
  });
  test('R6 restoring lost lower hold or phase mixing is rejected by literal oracles',()=>{
   const original=context.originalReturnSuggestion,body=original.toString();assert(body.includes('raw=load>0?Math.min(cap,load):cap'));
   try{vm.runInContext('originalReturnSuggestion='+body.replace('raw=load>0?Math.min(cap,load):cap','raw=cap'),context);assert.throws(()=>assert.equal(advice(F.lower()).suggestion.wt,30),assert.AssertionError)}finally{context.originalReturnSuggestion=original}
   const selected=context.originalStagePractice,selection=selected.toString(),predicate='(!p.phase||s.phase===p.phase||!knownPhaseOnly&&![1,2,3].includes(s.phase))';assert(selection.includes(predicate));
   try{vm.runInContext('originalStagePractice='+selection.replace(predicate,'true'),context);R.setD(state(F.transition()));assert(R.advanceTrainingPlan());assert.throws(()=>assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,34),assert.AssertionError)}finally{context.originalStagePractice=selected}
   evidence.push({case:'old lower hold/phase mixing faults',rejected:true});
  });
  for(const ending of ['time','unspecified'])for(const fresh of [0,1,2])test('R6 '+ending+' interruption requires two later weighted confirmations '+fresh,()=>{
   const result=advice(F.progress(fresh,ending));assert.equal(result.suggestion.wt,fresh===2?40.5:40);assert.equal(Number(result.log.wt),fresh===2?40.5:40);assert.equal(result.suggestion.type,fresh===2?'up':'stay');evidence.push({case:'fresh weighted',ending,fresh,...result});
  });
  for(const kind of ['assist','resist'])for(const fresh of [0,1,2])test('R6 shorter '+kind+' fresh confirmations use its own target '+fresh,()=>{
   const d=F.progress(fresh,'time',kind),id=kind==='assist'?'pullup_a':'band_leg_curl',result=advice(d,id);assert.deepEqual(result.effective,fresh===2?[kind==='assist'?'Purple+Red':'Blue (heaviest)','Green']:['Green','Green']);assert.equal(result.suggestion.type,fresh===2?'up':'stay');evidence.push({case:'fresh '+kind,fresh,...result});
  });
  test('R6 interruption retains established history anchor when progressLoads is absent',()=>{
   const d=F.progress();delete d.trainingPlan.progressLoads;assert.equal(advice(d).suggestion.wt,40);
  });
  for(const [key,value]of [['loc','partner'],['trainingPlanStart','2026-09-01'],['trainingStage','original1'],['phase',2],['date','2026-11-02']])test('R6 other-context noncredit partial is not a new barrier '+key,()=>{
   const d=F.progress();d.sessions[2][key]=value;assert.equal(advice(d).suggestion.wt,40.5);
  });
  for(const shape of ['zero','absent'])test('R6 '+shape+' exercise is not positive interruption evidence',()=>{
   const d=F.progress();if(shape==='zero')d.sessions[2].ex[0].reps=[0,0];else d.sessions[2].ex[0].id='ohp';assert.equal(advice(d).suggestion.wt,40.5);
  });
  test('R6 raw missing completion plus explicit ending follows canonical false, without provenance claim',()=>{
   const d=F.progress();delete d.sessions[2].trainingComplete;assert.equal(advice(d).suggestion.wt,40);assert.equal(R.getD().sessions.find(s=>s.id==='r6-interruption').trainingComplete,false);
  });
  for(const shape of ['both absent','ending absent','other ending','complete manual ignore','true plus time'])test('R6 ignored legacy/noninterruption metadata retains old credit '+shape,()=>{
   const d=F.progress(),partial=d.sessions[2];if(shape==='both absent'){delete partial.trainingComplete;delete partial.finishReason}if(shape==='ending absent')delete partial.finishReason;if(shape==='other ending')partial.finishReason='other';if(shape==='complete manual ignore'){partial.trainingComplete=true;partial.finishReason='complete'}if(shape==='true plus time')partial.trainingComplete=true;assert.equal(advice(d).suggestion.wt,40.5);
  });
  for(const flag of [false,undefined])test('R6 legacy eligible incomplete stays in its old blocking stream '+flag,()=>{
   const d=F.progress();if(flag===undefined)delete d.sessions[2].noProg;else d.sessions[2].noProg=flag;assert.equal(advice(d).suggestion.wt,40);delete d.sessions[2].finishReason;assert.equal(advice(d).suggestion.wt,40);
  });
  for(const reverse of [false,true])for(const ignored of [true,false])test('R6 same-date compatibility preserves old result ignored='+ignored+' reverse='+reverse,()=>{
   const d=F.progress();d.sessions[1].date='2026-10-28';d.sessions[2].noProg=ignored;if(reverse)d.sessions=[d.sessions[0],d.sessions[2],d.sessions[1]];assert.equal(advice(d).suggestion.wt,ignored?40.5:40);
  });
  test('R6 strictly later noncredit partial creates a barrier, manually ignored completion does not exempt it',()=>{
   const d=F.progress();d.sessions[1].date='2026-10-28';d.sessions[2].date='2026-10-29';assert.equal(advice(d).suggestion.wt,40);const ignored=json(d.sessions[1]);Object.assign(ignored,{id:'manual-tie',date:'2026-10-29',noProg:true});d.sessions.push(ignored);assert.equal(advice(d).suggestion.wt,40);
  });
  test('R6 two fresh successes still obey discomfort and high-effort holds',()=>{
   const d=F.progress(2);d.discomfort=[{date:'2026-10-31',exId:'hex_dl',joint:'Knee',level:'moderate'}];assert.equal(advice(d).suggestion.wt,40);d.discomfort=[];d.sessions.at(-1).difficulty=5;assert.equal(advice(d).suggestion.wt,40);
  });
  test('R6 legacy unphased progress keeps its mixed-target compatibility',()=>{
   const d=F.progress();delete d.trainingPlan.phase;d.sessions.forEach(s=>s.ex[0].reps=s.trainingComplete?[8,8]:[8,0]);assert.equal(advice(d).suggestion.wt,40);
  });
  test('R6 restoring old confirmation reuse is rejected by the literal40kg oracle',()=>{
   const original=context.shortSuggestion,body=original.toString(),cut='eligible.filter(e=>!interruption||e.date>interruption.date).slice(-2)';assert(body.includes(cut));
   try{vm.runInContext('shortSuggestion='+body.replace(cut,'eligible.slice(-2)'),context);assert.throws(()=>assert.equal(advice(F.progress()).suggestion.wt,40),assert.AssertionError)}finally{context.shortSuggestion=original}evidence.push({case:'old confirmation reuse fault',rejected:true});
  });
 }finally{context.Date=RealDate}
 const output=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'practice-continuity-unit-evidence.json'),JSON.stringify(evidence,null,2));
};
