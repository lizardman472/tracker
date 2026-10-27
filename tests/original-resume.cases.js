// Synthetic direct-return contract cases, run by recovery.test.js.
const assert=require('node:assert/strict');
module.exports=function({R,context,test,json}){
 const now=()=>R.today(),ago=n=>R.dayAfter(now(),-n);
 function interrupted(phase=1){
  const d=json(R.freshState());Object.assign(d,{phase,phaseStart:ago(35),nextDay:'B',lastDeload:ago(7)});
  d.trainingPlan={stage:'deload',start:ago(7),stageStart:ago(7),loads:{hex_dl:80,floor_press:50},bands:{pullup_a:'Purple',rear_delt:'Blue (heaviest)'}};
  d.sessions=[{id:'before-rest',date:ago(10),day:'A',loc:'home',phase,ex:[
   {id:'hex_dl',wt:80,reps:[5,5,5],form:[5,5,5]},
   {id:'floor_press',wt:50,reps:[10,10,10,10],form:[5,5,5,5]}]},
   {id:'one-real-deload',date:ago(7),day:'A',loc:'home',phase,trainingStage:'deload',trainingPlanStart:ago(7),ex:[
    {id:'hex_dl',wt:80,reps:[0,5,5],wts:[80,40,42]},
    {id:'floor_press',wt:40,reps:[8]},
    {id:'pullup_a',band:'Purple',bands:['Purple','Green','Blue (heaviest)'],reps:[0,6,0]},
    {id:'rear_delt',band:'Blue (heaviest)',bands:['Purple','Red','Blue (heaviest)'],reps:[12,12,0]}]}];
  return d;
 }
 function resumed(phase=1){R.setD(interrupted(phase));if(!R.resumeOriginalAfterRest())throw Error('Direct return failed');return json(R.getD())}
 const def=id=>['A','B','C'].flatMap(day=>R.dayExs(day,{},true)).find(e=>e.id===id);
 function practice(d,id,{sessionId='fresh',date=now(),extra=0,wt=40,...fields}={}){
  const ex=def(id),n=ex.s;
  d.sessions.push({id:sessionId,date,day:'A',loc:'home',phase:d.phase,originalResumeId:d.originalResume.id,
   difficulty:3,ex:[{id,wt,reps:Array(n).fill(ex.tg+extra),form:Array(n).fill(5),band:''}],...fields});
  return d;
 }
 for(const phase of [1,2,3])test('direct original return preserves phase '+phase+', clock, normal sets, next day and real history',()=>{
  const d=interrupted(phase);R.setD(d);const before=json(R.getD());
  assert(R.resumeOriginalAfterRest());const after=R.getD();assert.equal(after.trainingPlan,null);
  assert.equal(after.phase,phase);assert.equal(after.phaseStart,before.phaseStart);assert.equal(after.nextDay,'B');
  assert.equal(after.lastDeload,before.lastDeload);assert.deepEqual(json(after.sessions),before.sessions);
  assert.equal(after.sessions.length,2);assert.equal(after.originalResume.date,now());assert.equal(after.originalResume.phase,phase);
  for(const day of ['A','B','C']){
   const rows=R.dayExs(day,{},true);assert.deepEqual(json(rows.map(e=>[e.id,e.s,e.tg])),json(R.originalEssentials(phase)[day].map(e=>[e.id,e.s,e.tg])));
   assert(rows.length>=8&&rows.length<=9);assert(rows.reduce((n,e)=>n+e.s,0)>=24);
   assert(!rows.some(e=>e._short));
  }
  assert.match(R.trainingPlanCard(),/Fresh practice/);assert.equal(R.resumeOriginalAfterRest(),false);
 });
 test('direct original choice is separate from shorter and gradual return at any recovery review date',()=>{
  for(const stage of ['deload','return']){
   const d=interrupted();d.trainingPlan.stage=stage;d.trainingPlan.stageStart=now();R.setD(d);
   assert(R.trainingPlanCard().includes('Resume original A/B/C after rest'));
   assert(!R.trainingPlanCard('workout').includes('Resume original A/B/C after rest'));
   assert(R.resumeOriginalAfterRest());assert.equal(R.getD().trainingPlan,null);
  }
  R.setD(interrupted());assert(R.setRecoveryMode('off',2));assert.equal(R.getD().trainingPlan.stage,'progress');
  assert.equal(R.dayExs('A').reduce((n,e)=>n+e.s,0),11);assert.equal(R.getD().originalResume,null);
 });
 test('cancel and Partner leave the recovery plan intact',()=>{
  R.setD(interrupted());let before=json(R.getD());R.setConfirm(false);assert.equal(R.resumeOriginalAfterRest(),false);R.setConfirm(true);
  assert.deepEqual(json(R.getD()),before);
  const d=interrupted();d.location='partner';R.setD(d);before=json(R.getD());
  assert.equal(R.resumeOriginalAfterRest(),false);assert(!R.trainingPlanCard().includes('Resume original A/B/C after rest'));
  assert.deepEqual(json(R.getD()),before);
 });
 test('starting weights and bands use counted practice, including lower overrides and unused harder defaults',()=>{
  const d=resumed();assert.equal(d.originalResume.loads.hex_dl,40);
  assert.equal(R.getSmartSugg(def('hex_dl')).wt,40);assert.equal(R.getSmartSugg(def('hex_dl')).type,'stay');
  assert.equal(R.getSmartSugg(def('pullup_a')).band,'Green');assert.equal(R.getSmartSugg(def('rear_delt')).band,'Red');
  R.beginW('A',true);assert.equal(R.activeRecord().originalResumeId,d.originalResume.id);
  assert.equal(R.getLOG().hex_dl.wt,40);assert.equal(R.getLOG().pullup_a.band,'Green');
  assert(R.getLOG().pullup_a.bands.every(b=>b===''));assert(R.getLOG().hex_dl.setDone.every(v=>v===false));
 });
 test('resistance entry uses a visible uniform scalar without hidden mixed overrides',()=>{
  resumed();R.beginW('B',true);assert.equal(R.getLOG().rear_delt.band,'Red');assert(R.getLOG().rear_delt.bands.every(b=>b===''));
 });
 test('a fatigue veto replaces an earned harder bridge in both the suggestion and initialized inputs',()=>{
  const d=resumed(),ex=def('pullup_a'),bands=Array.from({length:ex.s},(_,i)=>i===0?'Purple':'Green');
  practice(d,'pullup_a',{difficulty:5,ex:[{id:'pullup_a',band:'None',bands,reps:Array(ex.s).fill(ex.tg),form:Array(ex.s).fill(5)}]});R.setD(d);
  assert.equal(R.getSmartSuggCore(ex).type,'up');const s=R.getSmartSugg(ex);
  assert.equal(s.type,'stay');assert.equal(s.band,'Green');assert(s.bands.every(b=>b==='Green'));
  assert.match(s.detail,/no harder bridge/);R.beginW('A',true);
  assert.equal(R.getLOG().pullup_a.band,'Green');assert(R.getLOG().pullup_a.bands.every(b=>b==='Green'));
 });
 test('an apparatus minimum above the held reference is explicitly disclosed',()=>{
  const d=resumed();d.originalResume.loads.hex_dl=1;d.sessions=[];R.setD(d);
  const s=R.getSmartSugg(def('hex_dl'));assert(s.wt>1);assert.equal(s.type,'stay');assert.match(s.detail,/lightest available setup.*above/);
 });
 test('old hits cannot combine with one fresh confirm-lift target',()=>{
  const d=resumed();practice(d,'hex_dl');R.setD(d);const s=R.getSmartSugg(def('hex_dl'));
  assert.equal(s.type,'cf');assert.equal(s.wt,40);assert.equal(R.originalProgressionHist(def('hex_dl'),R.getD().originalResume).length,1);
  assert.equal(R.getHist('hex_dl').length,3);
 });
 test('two real post-return targets retain original confirm progression',()=>{
  const d=resumed();d.originalResume.date=ago(2);practice(d,'hex_dl',{sessionId:'first',date:ago(2)});practice(d,'hex_dl',{sessionId:'second'});R.setD(d);
  const s=R.getSmartSugg(def('hex_dl'));assert.equal(s.type,'up');assert(s.wt>40);
 });
 test('ordinary lifts retain single-hit progression and confirm lifts retain the original overshoot exception',()=>{
  let d=resumed();practice(d,'floor_press');R.setD(d);let s=R.getSmartSugg(def('floor_press'));assert.equal(s.type,'up');assert(s.wt>40);
  d=resumed();practice(d,'hex_dl',{extra:4});R.setD(d);s=R.getSmartSugg(def('hex_dl'));assert.equal(s.type,'up');assert(s.wt>40);
 });
 for(const [label,fields]of [['no tag',{originalResumeId:undefined}],['foreign context',{originalResumeId:'original-other'}],
  ['future',{date: R.dayAfter(now(),1)}],['other venue',{loc:'partner'}],['other phase',{phase:2}],['retroactive',{retro:true}],['ignored',{noProg:true}],
  ['recovery',{trainingStage:'return',trainingPlanStart:ago(7)}]])test(label+' cannot earn post-return credit',()=>{
   const d=resumed();practice(d,'hex_dl',fields);R.setD(d);const s=R.getSmartSugg(def('hex_dl'));
   assert.notEqual(s.type,'up');assert.equal(R.originalProgressionHist(def('hex_dl'),R.getD().originalResume).length,0);
  });
 test('zero-rep rows do not earn credit; lower non-credit practice protects the starting load',()=>{
  let d=resumed();practice(d,'hex_dl',{ex:[{id:'hex_dl',wt:20,reps:[0,0,0]}]});R.setD(d);assert.equal(R.getSmartSugg(def('hex_dl')).wt,40);
  d=resumed();practice(d,'hex_dl',{noProg:true,wt:30});R.setD(d);assert.equal(R.getSmartSugg(def('hex_dl')).wt,30);
 });
 test('same-day untagged and additive imports cannot become fresh progression evidence',()=>{
  const d=resumed(),foreign=json(d);foreign.originalResume.id='original-foreign';foreign.sessions=[];practice(foreign,'hex_dl',{sessionId:'imported',originalResumeId:undefined});
  const merged=R.mergeImport(d,foreign).W;assert.equal(merged.originalResume.id,d.originalResume.id);R.setD(merged);
  assert.equal(R.originalProgressionHist(def('hex_dl'),R.getD().originalResume).length,0);assert.equal(R.getSmartSugg(def('hex_dl')).type,'stay');
 });
 test('fresh export/import and normalization retain the marker, real tags and original next day',()=>{
  const d=resumed();practice(d,'hex_dl');R.setD(d);const exported=json(R.recoveryExportData());
  const restored=R.mergeImport(R.freshState(),exported).W;assert.deepEqual(json(restored.originalResume),exported.originalResume);
  assert.equal(restored.sessions.at(-1).originalResumeId,d.originalResume.id);assert.equal(restored.nextDay,'B');
  R.setD(restored);assert.equal(R.getSmartSugg(def('hex_dl')).type,'cf');
 });
 test('invalid boundaries stay held, invalid tags are dropped and known references are bounded',()=>{
  for(const bad of [{id:'bad'}, {date:'2026-02-30'}, {phase:4}]){
   const d=resumed();Object.assign(d.originalResume,bad);assert.equal(R.normalizeState(d).W.originalResume.invalid,true);
  }
  const d=resumed();d.originalResume.loads={hex_dl:Infinity,foreign:30,floor_press:1001,lm_squat:30};
  d.originalResume.bands={pullup_a:'invalid',foreign:'Green'};const p=R.normalizeState(d).W.originalResume;
  assert.deepEqual(json(p.loads),{lm_squat:30});assert.deepEqual(json(p.bands),{});
  const row=R.validSession({id:'bad-tag',day:'A',date:now(),originalResumeId:'bad<script>',ex:[]});assert.equal(row.originalResumeId,undefined);
 });
 test('phase and new recovery changes clear the boundary, while reselecting the same phase keeps its clock',()=>{
  resumed();const p=json(R.getD().originalResume),clock=R.getD().phaseStart;
  assert.equal(R.setPhase(1),false);assert.deepEqual(json(R.getD().originalResume),p);assert.equal(R.getD().phaseStart,clock);
  assert(R.setPhase(2));assert.equal(R.getD().originalResume,null);
  resumed();assert(R.startTrainingPlan());assert.equal(R.getD().originalResume,null);
 });
 for(const [label,damage]of [['future',p=>{p.date=R.dayAfter(now(),1)}],['corrupt',p=>{p.id='broken'}]])test(label+' boundary stays held through normalize/reload and fresh import, including real inputs',()=>{
  const d=resumed();damage(d.originalResume);const normalized=R.normalizeState(d).W;R.setD(normalized);
  let s=R.getSmartSugg(def('floor_press'));assert.equal(s.type,'stay');assert.match(s.detail,/Progression is held/);
  assert.match(R.trainingPlanCard(),/Starting loads and progression stay held/);
  R.beginW('A',true);assert(Number(R.getLOG().floor_press.wt)<=40);assert(R.getLOG().pullup_a.bands.every(b=>b===''));
  const exported=json(R.getD()),restored=R.mergeImport(R.freshState(),exported).W;R.setD(restored);
  s=R.getSmartSugg(def('floor_press'));assert.equal(s.type,'stay');assert.match(s.detail,/Progression is held/);
  assert(R.startTrainingPlan());assert.equal(R.getD().originalResume,null);assert(R.resumeOriginalAfterRest());
  assert.equal(R.getD().originalResume.invalid,undefined);assert.equal(R.getD().originalResume.date,now());
 });
 test('empty history with an occupied return policy cannot be mistaken for a fresh import target',()=>{
  const d=resumed();d.sessions=[];const marker=json(d.originalResume),clock=d.phaseStart;
  const old=interrupted(2);old.trainingPlan=null;old.originalResume=null;old.phaseStart=ago(90);
  const merged=R.mergeImport(d,old).W;assert.deepEqual(json(merged.originalResume),marker);assert.equal(merged.phase,d.phase);assert.equal(merged.phaseStart,clock);
  R.setD(merged);assert.equal(R.getSmartSugg(def('floor_press')).type,'stay');R.beginW('A',true);assert(Number(R.getLOG().floor_press.wt)<=40);
 });
 for(const [id,day]of [['pullup_a','A'],['rear_delt','B']])for(const hit of [false,true])test(id+' initialized band remains actual and visible after fresh '+(hit?'target':'repeat')+' practice',()=>{
  const d=resumed(),ex=def(id),band=id==='pullup_a'?'Green':'Red',reps=Array(ex.s).fill(hit?ex.tg:1);
  practice(d,id,{ex:[{id,band:'Blue (heaviest)',bands:Array(ex.s).fill(band),reps,form:Array(ex.s).fill(5)}]});R.setD(d);
  R.beginW(day,true);assert.equal(R.getLOG()[id].band,band);assert(R.getLOG()[id].bands.every(b=>b===''||b===band||id==='pullup_a'&&b==='Purple+Red'));
 });
 test('begin, persisted resume, summary and save preserve the captured context exactly once',()=>{
  const d=resumed();R.beginW('A',true);const row=R.getLOG().hex_dl;
  Object.assign(row,{wt:40,reps:['5','5','5'],setDone:[true,true,true],form:[5,5,5]});
  const active=json(R.activeRecord());assert.equal(R.normalizeActiveRecord(active).originalResumeId,d.originalResume.id);
  R.setD(d);context.localStorage.setItem(R.AW_KEY,JSON.stringify(active));R.resumeW();R.finishW();R.saveSumm();
  const saved=R.getD().sessions.find(s=>s.id===active.id);assert(saved);assert.equal(saved.originalResumeId,d.originalResume.id);
  const count=R.getD().sessions.length;R.saveSumm();assert.equal(R.getD().sessions.length,count);
 });
 test('an older or imported draft without captured context never gets tagged merely by saving',()=>{
  const d=resumed(),draft={id:'pre-boundary-draft',resetEpoch:'0',day:'A',loc:'home',phase:1,start:Date.now(),ts:Date.now(),
   xp:true,log:{hex_dl:{wt:40,reps:[5,5,5],setDone:[true,true,true],form:[5,5,5]}}};
  R.setD(d);context.localStorage.setItem(R.AW_KEY,JSON.stringify(draft));R.resumeW();R.finishW();R.saveSumm();
  assert.equal(R.getD().sessions.find(s=>s.id===draft.id).originalResumeId,undefined);
 });
};
