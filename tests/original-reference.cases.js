// Invented histories only. No supplied export or private fixture is distributed.
const assert=require('node:assert/strict');
module.exports=function({R,context,test,json}){
 const ago=n=>R.dayAfter(R.today(),-n),ex=id=>['A','B','C'].flatMap(d=>R.dayExs(d,{},true)).find(e=>e.id===id);
 function legacy(){
  const d=json(R.freshState());Object.assign(d,{phase:1,phaseStart:ago(40),nextDay:'A',lastDeload:ago(9)});
  d.originalResume={id:'original-synthetic',date:ago(2),phase:1,loads:{hex_dl:60,floor_press:40},bands:{pullup_a:'Blue (heaviest)',rear_delt:'Red'}};
  d.sessions=[{id:'normal-source',date:ago(12),day:'A',loc:'home',phase:1,ex:[
   {id:'hex_dl',wt:100,wts:[100,80,82],reps:[0,5,5]}, {id:'floor_press',wt:50,reps:[10,10,10,10]},
   {id:'pullup_a',band:'None',bands:['None','Green','Green'],reps:[0,8,8]}, {id:'rear_delt',band:'Purple',reps:[15,15,15]},
   {id:'hex_squat_b',wt:60,reps:[6,6,6,6],form:[5,5,5,5]}]},
   {id:'actual-deload',date:ago(9),day:'A',loc:'home',phase:1,trainingStage:'deload',trainingPlanStart:ago(9),ex:[
    {id:'hex_dl',wt:60,reps:[5,5]}, {id:'floor_press',wt:40,reps:[8]},
    {id:'pullup_a',band:'Blue (heaviest)',reps:[6]}, {id:'rear_delt',band:'Red',reps:[12]}]}];return d;
 }
 function tagged(d,id,{kg=35,band='',noProg=false,date=R.today(),reps=null,...extra}={}){
  const def=ex(id);d.sessions.push({id:'actual-'+id,date,day:'B',loc:'home',phase:1,originalResumeId:d.originalResume.id,noProg,
   ex:[{id,wt:kg,band,reps:reps||Array(def.s).fill(def.tg),form:Array(def.s).fill(5)}],...extra});return d;
 }
 test('legacy normalize/import are inert; explicit correction restores regular sources with zero old credit',()=>{
  R.setD(legacy());const before=json(R.getD());assert.equal(R.getSmartSugg(ex('hex_dl')).wt,60);
  assert.deepEqual(json(R.mergeImport(R.freshState(),before).W.originalResume),before.originalResume);
  const proposal=R.originalReferenceProposal('repair');assert.equal(proposal.p.loads.hex_dl,80);assert.equal(proposal.p.bands.pullup_a,'Green');
  assert.deepEqual(json(R.getD()),before);R.setConfirm(false);assert.equal(R.applyOriginalReferenceCorrection(),false);assert.deepEqual(json(R.getD()),before);R.setConfirm(true);
  assert(R.applyOriginalReferenceCorrection());const d=R.getD();
  assert.equal(d.originalResume.id,before.originalResume.id);assert.equal(d.originalResume.date,before.originalResume.date);
  for(const k of ['sessions','phase','phaseStart','nextDay','lastDeload','dismissed'])assert.deepEqual(json(d[k]),before[k]);
  assert.equal(d.originalResume.referenceVersion,1);assert.equal(d.originalResume.recoveryStart,ago(9));
  assert.equal(d.originalResume.sources.hex_dl.id,'normal-source');assert.equal(R.getSmartSugg(ex('hex_dl')).wt,80);assert.equal(R.getSmartSugg(ex('hex_dl')).type,'stay');
  assert.equal(R.getSmartSugg(ex('pullup_a')).band,'Green');assert.equal(R.getSmartSugg(ex('rear_delt')).band,'Purple');
  const restored=R.mergeImport(R.freshState(),json(d)).W;assert.deepEqual(json(restored.originalResume),json(d.originalResume));R.setD(restored);
  R.beginW('A',true);assert.equal(R.getLOG().hex_dl.wt,80);assert.equal(R.getLOG().pullup_a.band,'Green');assert(R.getLOG().pullup_a.bands.every(b=>b===''));
 });
 test('new direct return uses regular history before plan start and discloses unknown sources',()=>{
  const d=legacy();d.trainingPlan={stage:'deload',start:ago(9),stageStart:ago(9),loads:{hex_dl:80,floor_press:50},bands:{pullup_a:'Green'}};d.originalResume=null;R.setD(d);
  R.reviewOriginalReferences('return');const preview=R.trainingPlanCard();assert.match(preview,/Review starting loads/);assert.match(preview,/normal-source|Regular practice reference/);assert.match(preview,/No eligible regular reference found/);
  assert(R.resumeOriginalAfterRest());assert.equal(R.getD().originalResume.loads.hex_dl,80);assert.equal(R.getSmartSugg(ex('floor_press')).wt,50);
  assert.equal(R.getSmartSugg(ex('pullup_a')).band,'Green');assert.match(R.getSmartSugg(ex('ohp')).detail,/No eligible regular reference/);assert.equal(R.getSmartSugg(ex('ohp')).wt,null);
 });
 test('held, ignored, foreign, other-phase, future and zero rows cannot be regular sources',()=>{
  const d=legacy();for(const [i,fields]of [{trainingStage:'original3',trainingPlanStart:ago(14),trainingComplete:true}, {noProg:true}, {loc:'partner'}, {phase:2}, {date:R.dayAfter(R.today())}, {ex:[{id:'hex_dl',wt:200,reps:[0]}]}].entries())
   d.sessions.push({id:'ineligible-'+i,date:ago(10),day:'A',loc:'home',phase:1,ex:[{id:'hex_dl',wt:200,reps:[5,5,5]}],...fields});
  R.setD(d);assert.equal(R.originalReferenceProposal('repair').p.loads.hex_dl,80);
 });
 test('regular shorter practice is eligible but labelled as shorter, not completed original volume',()=>{
  const d=legacy();d.sessions[0].trainingStage='progress';d.sessions[0].trainingPlanStart=ago(20);R.setD(d);
  R.reviewOriginalReferences('repair');assert.match(R.trainingPlanCard(),/shorter regular routine \(not proof of original sets\)/);assert(R.applyOriginalReferenceCorrection());assert.equal(R.getD().originalResume.sources.hex_dl.kind,'shorter');
 });
 test('fresh B trajectory stays intact while unpractised A is repaired',()=>{
  R.setD(legacy());const d=tagged(legacy(),'hex_squat_b',{kg:60});R.setD(d);const before=R.getSmartSugg(ex('hex_squat_b')),rows=json(R.getD().sessions);
  assert(R.applyOriginalReferenceCorrection());assert.deepEqual(json(R.getSmartSugg(ex('hex_squat_b'))),json(before));assert.deepEqual(json(R.getD().sessions),rows);assert.equal(R.getSmartSugg(ex('hex_dl')).wt,80);
 });
 test('actual lower noncredit practice and sparse overrides remain authoritative after repair',()=>{
  R.setD(legacy());const d=tagged(legacy(),'hex_dl',{noProg:true,ex:[{id:'hex_dl',wt:90,wts:[90,35,37],reps:[0,5,5]}]});
  tagged(d,'pullup_a',{noProg:true,kg:null,band:'None',ex:[{id:'pullup_a',band:'None',bands:['None','Blue (heaviest)','Green'],reps:[0,8,8]}]});
  tagged(d,'rear_delt',{noProg:true,kg:null,band:'Red'});R.setD(d);assert(R.applyOriginalReferenceCorrection());
  assert.equal(R.getSmartSugg(ex('hex_dl')).wt,35);assert.equal(R.getSmartSugg(ex('pullup_a')).band,'Blue (heaviest)');assert.equal(R.getSmartSugg(ex('rear_delt')).band,'Red');
  R.beginW('A',true);assert.equal(R.getLOG().hex_dl.wt,35);assert.equal(R.getLOG().pullup_a.band,'Blue (heaviest)');
 });
 test('a later ignored lower attempt protects an already earned progression anchor',()=>{
  R.setD(legacy());const d=tagged(legacy(),'floor_press',{kg:45,date:ago(1)});tagged(d,'floor_press',{kg:35,noProg:true,id:'lower-attempt'});R.setD(d);
  assert(R.applyOriginalReferenceCorrection());const s=R.getSmartSugg(ex('floor_press'));assert.equal(s.type,'stay');assert.equal(s.wt,35);
 });
 test('same-date recovery and retro imports cannot become protective post-return practice',()=>{
  const d=legacy();d.sessions[1].date=d.originalResume.date;d.sessions.push({id:'retro',date:R.today(),day:'A',loc:'home',phase:1,retro:true,ex:[{id:'hex_dl',wt:10,reps:[5]}]});R.setD(d);
  assert(R.applyOriginalReferenceCorrection());assert.equal(R.getSmartSugg(ex('hex_dl')).wt,80);
 });
 test('custom references are kept unverified; missing and conflicting recovery boundaries cannot raise loads',()=>{
  const d=legacy();d.originalResume.loads.hex_dl=25;R.setD(d);assert(R.applyOriginalReferenceCorrection());assert.equal(R.getSmartSugg(ex('hex_dl')).wt,25);assert(R.getD().originalResume.unresolved.includes('hex_dl'));
  const missing=legacy();missing.sessions=missing.sessions.slice(0,1);R.setD(missing);assert.match(R.originalReferenceProposal('repair').error,/boundary needs review/);assert.equal(R.applyOriginalReferenceCorrection(),false);
  const conflict=legacy();conflict.sessions.push({...conflict.sessions[1],id:'conflicting-cycle',trainingPlanStart:ago(10)});R.setD(conflict);assert.equal(R.applyOriginalReferenceCorrection(),false);
 });
 test('malformed provenance and future marker stay held without a repair bypass',()=>{
  R.setD(legacy());assert(R.applyOriginalReferenceCorrection());const d=json(R.getD());d.originalResume.sources.hex_dl.date=d.originalResume.recoveryStart;
  R.setD(d);assert(R.getD().originalResume.invalid);assert.equal(R.applyOriginalReferenceCorrection(),false);
  const future=legacy();future.originalResume.date=R.dayAfter(R.today());R.setD(future);assert.equal(R.applyOriginalReferenceCorrection(),false);assert.equal(R.getSmartSugg(ex('hex_dl')).type,'stay');
 });
 test('live 49.6 entries and stored draft bytes are never changed by review or blocked Apply',()=>{
  R.setD(legacy());R.beginW('A',true);Object.assign(R.getLOG().hex_dl,{wt:49.6,wts:[49.6,48,47],reps:['5','',''],setDone:[true,false,false],form:[4,0,0],notes:'Synthetic manual entry'});
  const raw=JSON.stringify(R.activeRecord());context.localStorage.setItem(R.AW_KEY,raw);const log=json(R.getLOG());R.reviewOriginalReferences('repair');assert.equal(R.applyOriginalReferenceCorrection(),false);
  assert.deepEqual(json(R.getLOG()),log);assert.equal(context.localStorage.getItem(R.AW_KEY),raw);
 });
 test('any stored draft blocks repair and Today probes preserve stale notes-only work',()=>{
  for(const raw of ['', '{malformed', JSON.stringify({id:'notes-only',day:'A',loc:'home',phase:1,resetEpoch:'0',start:Date.now()-9000000,ts:Date.now()-9000000,notes:'Keep these notes',log:{hex_dl:{wt:49.6,reps:[0]}}})]){
   R.setD(legacy());context.localStorage.setItem(R.AW_KEY,raw);const before=json(R.getD());R.checkResume();R.reviewOriginalReferences('repair');assert.equal(R.applyOriginalReferenceCorrection(),false);
   assert.equal(context.localStorage.getItem(R.AW_KEY),raw);assert.deepEqual(json(R.getD()),before);
  }
 });
 test('draft read errors block repair rather than establishing an idle state',()=>{
  R.setD(legacy());const get=context.localStorage.getItem;context.localStorage.getItem=k=>{if(k===R.AW_KEY)throw Error('Synthetic read failure');return get(k)};
  try{assert.match(R.originalReferenceBlock(),/Cannot check/);assert.equal(R.applyOriginalReferenceCorrection(),false)}finally{context.localStorage.getItem=get}
 });
 test('a retained earned mixed-band trajectory is described per set in the repair preview',()=>{
  R.setD(legacy());const d=tagged(legacy(),'pullup_a',{kg:null,band:'Green',ex:[{id:'pullup_a',band:'Green',reps:[8,8,8,8],form:[5,5,5,5]}]});R.setD(d);
  const value=R.getSmartSugg(ex('pullup_a'));assert.equal(value.type,'up');assert(value.bands.some(b=>b!==value.band));
  const label=R.referenceSetup(ex('pullup_a'),value);assert.match(label,/Set 1: Purple\+Red assistance/);assert.match(label,/Set 2: Green assistance/);
  R.reviewOriginalReferences('repair');assert(R.trainingPlanCard().includes(label));
 });
 for(const mode of ['repair','return'])test(mode+' rechecks a draft that appears during confirmation',()=>{
  const d=legacy();if(mode==='return'){d.originalResume=null;d.trainingPlan={stage:'deload',start:ago(9),stageStart:ago(9),loads:{hex_dl:80},bands:{}}}R.setD(d);
  const before=json(R.getD()),raw=JSON.stringify({id:'arrived-during-confirm',log:{hex_dl:{wt:49.6,wts:[49.6,48],reps:[5,0]}},notes:'Preserve exact bytes'});
  context.confirm=()=>{context.localStorage.setItem(R.AW_KEY,raw);return true};
  try{assert.equal(mode==='repair'?R.applyOriginalReferenceCorrection():R.resumeOriginalAfterRest(),false)}finally{R.setConfirm(true)}
  assert.deepEqual(json(R.getD()),before);assert.equal(context.localStorage.getItem(R.AW_KEY),raw);
 });
};
