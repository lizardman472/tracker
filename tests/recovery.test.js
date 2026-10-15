// Synthetic fixtures only. The user's export must never enter the repository.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const values=new Map(),alerts=[];
const context={console,Date,Math,structuredClone,Blob,confirm:()=>true,alert:x=>alerts.push(x),navigator:{},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},scrollTo(){},
 localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
 document:{getElementById:()=>null,createElement:()=>({style:{},textContent:'',get innerHTML(){return String(this.textContent).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},setAttribute(){},click(){}})}};
context.window=context;vm.createContext(context);
vm.runInContext(script.slice(0,script.indexOf('// ═══════════════ INIT'))+`\nrender=()=>{};
globalThis.R={freshState,validTrainingPlan,normalizeState,mergeImport,mergeStores,validSession,
 trainingPlanStatus,shortProgram,shortSuggestion,getSmartSugg,shortDeloadStatus,getDeload,dayAfter,today,dayExs,startTrainingPlan,
 advanceTrainingPlan,restTrainingPlan,stopTrainingPlan,keepShorterRoutine,setShorterPhase,setRecoveryMode,trainingLoadContext,setPhase,getPhaseInfo,trainingPhaseContext,originalEssentials,trainingPlanCard,ensureLog,beginW,AW_KEY,
 getD:()=>D,getADAY:()=>ADAY,getLOG:()=>LOG,
 setD:d=>{D=normalizeState(d).W;WRITER=true;WRITER_READY=true;PENDING_SAVE=null;ADAY=null;LOG={};
 localStorage.removeItem(AW_KEY);localStorage.setItem(SK,JSON.stringify(D));rememberCommitted(localStorage.getItem(SK));},
 setActive:v=>{ADAY=v},setConfirm:v=>{confirm=()=>v}};`,context);
const R=context.R,json=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
function state(stage='deload',start='2020-02-01'){
 const d=json(R.freshState());d.trainingPlan={stage,start,stageStart:start,loads:{hex_dl:80,lm_squat:40,floor_press:50},bands:{pullup_a:'Green'}};return d;
}
test('seven calendar days and a review on the following day',()=>{
 R.setD(state());const s=R.trainingPlanStatus('2020-02-07');assert.equal(s.end,'2020-02-07');assert.equal(s.review,'2020-02-08');assert.equal(s.due,false);
 assert.equal(R.trainingPlanStatus('2020-02-08').due,true);assert.equal(R.getD().trainingPlan.stage,'deload');
 assert.equal(R.dayAfter('2020-02-28',2),'2020-03-01');
});
test('recovery can be started again from shorter training using recent actual loads',()=>{
 const d=state('progress','2020-02-01');d.phase=2;d.trainingPlan.phase=2;d.nextDay='C';
 d.sessions=[{id:'old',date:'2020-01-01',day:'A',loc:'home',phase:1,ex:[{id:'hex_dl',wt:80,reps:[5,5]}]},
  {id:'recent',date:R.today(),day:'A',loc:'home',phase:2,trainingPlanStart:'2020-02-01',trainingStage:'progress',ex:[{id:'hex_dl',wt:60,reps:[8,8]}]}];
 R.setD(d);const history=json(R.getD().sessions);assert(R.setRecoveryMode('deload'));
 assert.equal(R.getD().trainingPlan.stage,'deload');assert.equal(R.getD().trainingPlan.loads.hex_dl,60);
 assert.equal(R.getD().trainingPlan.phase,undefined);assert.equal(R.getD().nextDay,'C');assert.equal(R.getD().phase,2);
 assert.deepEqual(json(R.getD().sessions),history);assert(R.getSmartSugg(R.dayExs('A')[0]).wt<=60*.82);
});
test('recovery mode changes preserve anchors and restart only the stage review',()=>{
 R.setD(state());assert(R.setRecoveryMode('return'));const p=R.getD().trainingPlan;
 assert.equal(p.start,'2020-02-01');assert.equal(p.stageStart,R.today());assert.equal(p.loads.hex_dl,80);
 assert.equal(R.trainingPlanStatus().review,R.dayAfter(R.today(),7));assert.equal(R.trainingPlanStatus().due,false);
 assert.equal(R.setRecoveryMode('return'),false);assert.equal(R.getD().trainingPlan.stageStart,p.stageStart);
 assert(R.setRecoveryMode('deload'));assert.equal(R.getD().trainingPlan.loads.hex_dl,80);
});
test('turning recovery off early needs a phase and confirmation and keeps shorter training',()=>{
 R.setD(state('deload',R.today()));assert.equal(R.setRecoveryMode('off'),false);assert.equal(R.getD().trainingPlan.stage,'deload');
 R.setConfirm(false);assert.equal(R.setRecoveryMode('off',2),false);assert.equal(R.getD().trainingPlan.stage,'deload');R.setConfirm(true);
 assert(R.setRecoveryMode('off',2));assert.equal(R.getD().trainingPlan.stage,'progress');assert.equal(R.getD().trainingPlan.phase,2);
 assert.equal(R.getD().phase,2);assert.equal(R.getD().trainingPlan.stageStart,R.today());
 assert.equal(R.dayExs('A').reduce((n,e)=>n+e.s,0),11);assert.equal(R.dayExs('A')[0].tg,8);
 assert(R.getSmartSugg(R.dayExs('A')[0]).wt<=80*.90);assert.equal(R.setRecoveryMode('off',1),false);
});
test('recovery mode is transactional and blocks unfinished workouts and incompatible ramps',()=>{
 R.setD(state('progress'));const before=json(R.getD());R.setConfirm(false);assert.equal(R.setRecoveryMode('deload'),false);assert.deepEqual(json(R.getD()),before);R.setConfirm(true);
 R.setActive('A');assert.equal(R.setRecoveryMode('deload'),false);R.setActive(null);
 context.localStorage.setItem(R.AW_KEY,JSON.stringify({id:'draft',day:'A',loc:'home',phase:1,resetEpoch:'0',start:Date.now(),ts:Date.now(),log:{hex_dl:{reps:[5],wt:40}}}));
 assert.equal(R.setRecoveryMode('return'),false);assert.deepEqual(json(R.getD()),before);
 R.setD(state('progress'));assert.equal(R.setRecoveryMode('invalid'),false);
 const ramp=state('progress');ramp.comeback={start:R.today(),end:R.dayAfter(R.today(),3),gap:21};R.setD(ramp);
 assert.equal(R.setRecoveryMode('deload'),false);assert.equal(R.getD().trainingPlan.stage,'progress');
});
test('status separates held recovery loads from regular progression and controls exist at every stage',()=>{
 for(const stage of ['deload','return','progress','original1','original2','original3']){
  R.setD(state(stage));const h=R.trainingPlanCard();assert(h.includes('Recovery mode'));assert(h.includes('Apply recovery mode'));
  assert(h.includes(stage==='deload'||stage==='return'?'Recovery: On':'Recovery: Off'));
  assert(h.includes(stage==='progress'?'Load: Progression on':'Load: Held'));
  const w=R.trainingPlanCard('workout');assert(w.includes('Load:'));assert(!w.includes('Apply recovery mode'));
 }
 R.setD(json(R.freshState()));assert(R.trainingPlanCard().includes('Recovery: Off'));
 assert(R.setRecoveryMode('return'));assert.equal(R.getD().trainingPlan.stage,'return');
});
test('scheduled starts remain pending and cannot advance early',()=>{
 const d=state('deload',R.dayAfter(R.today(),3));R.setD(d);assert(R.trainingPlanStatus().pending);assert.equal(R.advanceTrainingPlan(),false);R.beginW('A');assert.equal(R.getADAY(),null);
});
test('readiness can be declined and dates never auto-advance',()=>{
 R.setD(state());R.setConfirm(false);assert.equal(R.advanceTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'deload');R.setConfirm(true);
 assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.stage,'return');assert.equal(R.getD().trainingPlan.stageStart,R.today());
});
test('extra rest postpones review and prevents starting',()=>{
 R.setD(state());assert(R.restTrainingPlan());assert(R.trainingPlanStatus().resting);assert.equal(R.trainingPlanStatus().review,R.dayAfter(R.today(),2));R.beginW('A');assert.equal(R.getADAY(),null);
});
test('deload is six working sets; return ten; ongoing eleven per day',()=>{
 for(const[stage,count]of [['deload',6],['return',10],['progress',11]]){
  R.setD(state(stage));for(const rows of Object.values(R.shortProgram()))assert.equal(rows.reduce((n,e)=>n+e.s,0),count);
 }
});
test('shorter plan applies only at home and Full cannot add a tail',()=>{
 R.setD(state('progress'));assert.deepEqual(json(R.dayExs('A',{},true)),json(R.dayExs('A',{},false)));
 const d=state();d.location='partner';R.setD(d);assert(!R.dayExs('A').some(e=>e._short));
});
test('original return needs confirmation and starts light without losing history or phase',()=>{
 const d=state('progress');d.phase=2;d.nextDay='C';
 d.sessions=[{id:'easy',date:'2020-02-02',day:'A',trainingStage:'deload',trainingPlanStart:'2020-02-01',ex:[{id:'hex_dl',wt:60,reps:[5,5]}]}];
 R.setD(d);const history=json(R.getD().sessions);
 assert(R.trainingPlanCard().includes('Return to original routine'));
 R.setConfirm(false);assert.equal(R.stopTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'progress');
 R.setConfirm(true);assert(R.stopTrainingPlan());assert.equal(R.getD().trainingPlan.stage,'original1');
 assert.deepEqual(json(R.getD().sessions),history);assert.equal(R.getD().phase,2);assert.equal(R.getD().nextDay,'C');
 for(const day of ['A','B','C'])assert(R.dayExs(day).every(e=>e.s<=2));
 assert.equal(R.getSmartSugg(R.dayExs('A')[0]).type,'stay');assert(R.getSmartSugg(R.dayExs('A')[0]).wt<=72);
});
test('return to normal cannot replace an active workout',()=>{
 R.setD(state());R.setActive('A');assert.equal(R.stopTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'deload');R.setActive(null);
});
test('capturing loads preserves history and excludes deliberately light records',()=>{
 const d=json(R.freshState());d.sessions=[{id:'old',date:'2020-01-01',day:'A',loc:'home',ex:[{id:'hex_dl',wt:80,reps:[5,5],band:''}]},
 {id:'easy',date:'2020-01-03',day:'A',loc:'home',noProg:true,ex:[{id:'hex_dl',wt:60,reps:[5,5],band:''}]}];R.setD(d);const before=json(R.getD().sessions);
 assert(R.startTrainingPlan());assert.equal(R.getD().trainingPlan.loads.hex_dl,80);assert.deepEqual(json(R.getD().sessions),before);
});
test('unfinished workouts prevent plan changes',()=>{
 R.setD(json(R.freshState()));R.setActive('A');assert.equal(R.startTrainingPlan(),false);assert.equal(R.getD().trainingPlan,null);
 R.setActive(null);context.localStorage.setItem(R.AW_KEY,JSON.stringify({id:'draft',day:'A',loc:'home',phase:1,resetEpoch:'0',start:Date.now(),ts:Date.now(),log:{hex_dl:{reps:[5],wt:40}}}));
 assert.equal(R.startTrainingPlan(),false);
});
test('malformed plan data is bounded and cannot inject source fields',()=>{
 assert.equal(R.validTrainingPlan({stage:'mystery',start:'2020-01-01',stageStart:'2020-01-01'}),null);
 assert.equal(R.validTrainingPlan({stage:'return',start:'2020-02-01',stageStart:'2020-01-01'}),null);
 const p=state().trainingPlan;p.loads={hex_dl:80,ohp:Infinity,unknown:50};p.bands={pullup_a:'invalid'};
 assert.deepEqual(json(R.validTrainingPlan(p).loads),{hex_dl:80});assert.deepEqual(json(R.validTrainingPlan(p).bands),{});
});
test('plan and self-reported RIR survive validation and fresh restore',()=>{
 const d=state();d.sessions=[{id:'easy',date:'2020-02-02',day:'A',trainingStage:'deload',trainingPlanStart:'2020-02-01',ex:[{id:'hex_dl',wt:60,reps:[5,5],rir:4,form:[5,5]}]}];
 const restored=R.mergeImport(R.freshState(),d).W;assert.equal(restored.trainingPlan.stage,'deload');assert.equal(restored.sessions[0].ex[0].rir,4);assert.equal(restored.sessions[0].noProg,true);
 const busy=json(R.freshState());busy.sessions=[{id:'own',date:'2020-01-01',day:'A',ex:[]}];assert.equal(R.mergeImport(busy,d).W.trainingPlan,null);
 assert.equal(R.mergeStores(state('return'),state('progress')).trainingPlan.stage,'return');
});
test('easy-stage suggestions hold lighter loads without old rep prefill',()=>{
 R.setD(state('deload',R.today()));const ex=R.dayExs('A')[0],s=R.shortSuggestion(ex);assert(s.wt<=80*.82);assert.equal(s.type,'stay');R.ensureLog(ex);
 assert(R.getLOG().hex_dl.reps.every(r=>r===''));assert.equal(Number(R.getLOG().hex_dl.wt),s.wt);
});
function progressRows(over={}){return ['2020-02-10','2020-02-13'].map((date,i)=>({id:'p'+i,date,day:'A',loc:'home',difficulty:2,trainingStage:'progress',trainingPlanStart:'2020-02-01',trainingComplete:true,finishReason:'complete',
 ex:[{id:'hex_dl',wt:72,reps:[8,8],form:[5,5],rir:2,band:'',...over}]}));}
test('two rated comparable sessions earn one small buildable increase',()=>{
 const d=state('progress');d.sessions=progressRows();R.setD(d);const s=R.shortSuggestion(R.dayExs('A')[0]);assert.equal(s.type,'up');assert(s.wt>72&&s.wt<=73);
});
test('unrated, near-failure, incomplete and different-load records do not earn increases',()=>{
 for(const over of [{rir:null},{rir:1},{form:[0,0]},{form:[5,3]},{reps:[8,0]}]){
  const d=state('progress');d.sessions=progressRows(over);R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
 }
 const d=state('progress');d.sessions=progressRows();d.sessions[0].ex[0].wt=71;R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
});
test('duplicate-date sessions, high effort and discomfort do not earn increases',()=>{
 const d=state('progress');d.sessions=progressRows();d.sessions[1].date=d.sessions[0].date;R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
 d.sessions=progressRows();d.sessions[1].difficulty=4;R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
});
test('readiness instructions explain missing sessions and manual return',()=>{
 R.setD(state());const h=R.trainingPlanCard();assert(h.includes('Missing a recovery session does not require catch-up'));assert(h.includes('does not automatically increase training'));assert(h.includes('Still tired'));
});
function originalRows(stage,start='2020-02-01',over={}){
 R.setD(state(stage,start));return ['A','B','C'].map((day,i)=>({id:stage+day,date:R.dayAfter(start,i*2),day,loc:'home',phase:1,difficulty:2,
  trainingStage:stage,trainingPlanStart:start,trainingComplete:true,finishReason:'complete',
  ex:R.dayExs(day).map(e=>({id:e.id,wt:R.getSmartSugg(e).wt,reps:Array(e.s).fill(e.tg),form:Array(e.s).fill(5),rir:3})),...over}));
}
test('original loads are held at 90, 95 and 100 percent despite old earned increases',()=>{
 for(const [stage,cap]of [['original1',72],['original2',76],['original3',80]]){
  const d=state(stage);d.sessions=[{id:'old',date:'2020-01-01',day:'A',loc:'home',phase:1,ex:[{id:'hex_dl',wt:80,reps:[12,12,12],form:[5,5,5]}]}];
  R.setD(d);const ex=R.dayExs('A')[0],s=R.getSmartSugg(ex);assert.equal(s.type,'stay');assert(s.wt<=cap&&s.wt>cap-1);
  R.ensureLog(ex);assert.equal(Number(R.getLOG().hex_dl.wt),s.wt);assert(R.getLOG().hex_dl.reps.every(r=>r===''));
 }
});
test('original steps need both elapsed days and completed A/B/C before manual advancement',()=>{
 const start=R.dayAfter(R.today(),-7),d=state('original1',start);R.setD(d);assert(!R.trainingPlanStatus().due);assert.equal(R.advanceTrainingPlan(),false);
 d.sessions=originalRows('original1',start);R.setD(d);assert(R.trainingPlanStatus().due);assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.stage,'original2');
 assert(!R.trainingPlanStatus().due);assert.equal(R.advanceTrainingPlan(),false);
 const bad=state('original2',start);bad.sessions=originalRows('original2',start,{finishReason:'fatigue'});R.setD(bad);assert(!R.trainingPlanStatus().due);
 bad.sessions=originalRows('original2',start).map(s=>({...s,date:start}));R.setD(bad);assert(!R.trainingPlanStatus().due);
});
test('missing original sessions remain trainable after review date rather than stranding the plan',()=>{
 R.setD(state('original1',R.dayAfter(R.today(),-8)));assert(!R.trainingPlanStatus().due);R.beginW('A');assert.equal(R.getADAY(),'A');R.setActive(null);
});
test('finishing original practice restores Essentials only after a fresh completed week',()=>{
 const start=R.dayAfter(R.today(),-7),d=state('original3',start);d.sessions=originalRows('original3',start);R.setD(d);
 const history=json(R.getD().sessions);assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan,null);assert.deepEqual(json(R.getD().sessions),history);
 for(const day of ['A','B','C'])assert(!R.dayExs(day).some(e=>e._short));
});
test('default shorter routine is preserved and optional original return can be abandoned safely',()=>{
 R.setD(state('return'));assert(R.advanceTrainingPlan(1));assert.equal(R.getD().trainingPlan.stage,'progress');
 assert(R.stopTrainingPlan());assert(R.keepShorterRoutine());assert.equal(R.getD().trainingPlan.stage,'progress');
 for(const day of ['A','B','C'])assert.equal(R.dayExs(day).reduce((n,e)=>n+e.s,0),11);
 R.setD(state('deload'));assert.equal(R.stopTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'deload');
 R.setD(state('return',R.today()));assert.equal(R.stopTrainingPlan(),false);
});
test('all original anchors and stages survive export and fresh import; failed practice stays excluded',()=>{
 for(const stage of ['original1','original2','original3']){
  const d=state(stage);d.trainingPlan.loads.bb_curl=25;d.sessions=originalRows(stage);
  const w=R.mergeImport(R.freshState(),d).W;assert.equal(w.trainingPlan.stage,stage);assert.equal(w.trainingPlan.loads.bb_curl,25);
  assert.equal(!!w.sessions[0].noProg,stage!=='original3');
 }
 const d=state('original3');d.sessions=originalRows('original3',d.trainingPlan.start,{trainingComplete:false});
 assert(R.normalizeState(d).W.sessions.every(s=>s.noProg));
});
test('recovery controls collapse guidance and workouts have no routine-switch buttons',()=>{
 R.setD(state('progress'));const h=R.trainingPlanCard();assert(h.includes('<details><summary>Plan details and routine choices'));
 assert(h.includes('default after recovery'));assert(h.includes('24–26'));assert(!R.trainingPlanCard('workout').includes('<button'));
});
test('a lower recent load stays lower through the return instead of jumping to the old anchor',()=>{
 const d=state('progress');d.sessions=progressRows({wt:50,reps:[5,5]});R.setD(d);assert(R.stopTrainingPlan());
 assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,50);assert(R.getSmartSugg(R.dayExs('A')[0]).wt<=50);
 const p=json(R.getD().trainingPlan);p.stageStart=R.dayAfter(R.today(),-7);
 const w=state('original1',p.start);w.trainingPlan=p;w.sessions=originalRows('original1',p.start);
 for(const s of w.sessions){s.date=R.dayAfter(R.today(),-6+['A','B','C'].indexOf(s.day)*2);const e=s.ex.find(e=>e.id==='hex_dl');if(e)e.wt=50}
 R.setD(w);assert(R.advanceTrainingPlan());assert.equal(R.getD().trainingPlan.returnLoads.hex_dl,54);
 const restored=R.mergeImport(R.freshState(),R.getD()).W;assert.equal(restored.trainingPlan.returnLoads.hex_dl,54);
});
test('completion flags without the original exercises cannot advance a return',()=>{
 const start=R.dayAfter(R.today(),-7),d=state('original1',start);d.sessions=originalRows('original1',start).map(s=>({...s,ex:s.ex.slice(0,1)}));
 R.setD(d);assert(!R.trainingPlanStatus().due);assert.equal(R.advanceTrainingPlan(),false);
});
test('original progression resumes from lower practice loads rather than the old heavy records',()=>{
 const start=R.dayAfter(R.today(),-7),d=state('original3',start);d.sessions=originalRows('original3',start);
 d.sessions.unshift({id:'heavy',date:R.dayAfter(start,-30),day:'A',loc:'home',phase:1,ex:[{id:'hex_dl',wt:80,reps:[5,5,5],form:[5,5,5]}]});
 for(const s of d.sessions.filter(s=>s.trainingStage==='original3')){const e=s.ex.find(e=>e.id==='hex_dl');if(e)e.wt=50}
 R.setD(d);assert(R.advanceTrainingPlan());assert(R.getSmartSugg(R.dayExs('A',{},true)[0]).wt<55);
});
test('choosing shorter again keeps lower practice weights and requires fresh confirmations',()=>{
 const d=state('original1');d.sessions=[...progressRows(),...originalRows('original1')];
 for(const s of d.sessions.filter(s=>s.trainingStage==='original1')){const e=s.ex.find(e=>e.id==='hex_dl');if(e)e.wt=50}
 R.setD(d);assert(R.keepShorterRoutine());const ex=R.dayExs('A')[0],s=R.getSmartSugg(ex);
 assert.equal(s.type,'stay');assert.equal(s.wt,50);
 const other=state('progress');other.location='partner';R.setD(other);assert(R.trainingPlanCard().includes('Home routine · Shorter A/B/C'));
});
test('recovery requires an explicit regular phase and keeps the shorter workload',()=>{
 R.setD(state('return'));assert.equal(R.advanceTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'return');
 for(const phase of [1,2]){
  R.setD(state('return'));assert(R.advanceTrainingPlan(phase));assert.equal(R.getD().phase,phase);assert.equal(R.getD().trainingPlan.phase,phase);
  assert.equal(R.getD().trainingPlan.phaseStart,R.today());assert.equal(R.dayExs('A')[0].tg,phase===1?5:8);
  for(const day of ['A','B','C'])assert.equal(R.dayExs(day).reduce((n,e)=>n+e.s,0),11);
 }
});
test('phase switches change rep targets without restoring old weights or old confirmations',()=>{
 const d=state('progress');d.trainingPlan.phase=1;d.sessions=progressRows({reps:[5,5]}).map(s=>({...s,phase:1}));R.setD(d);const history=json(R.getD().sessions);
 R.setConfirm(false);assert.equal(R.setShorterPhase(2),false);assert.equal(R.getD().phase,1);R.setConfirm(true);
 assert(R.setShorterPhase(2));assert.equal(R.dayExs('A')[0].tg,8);const s=R.getSmartSugg(R.dayExs('A')[0]);assert.equal(s.type,'stay');assert(s.wt<=72);
 assert.deepEqual(json(R.getD().sessions),history);assert.equal(R.getD().phase,2);
 assert.equal(R.setShorterPhase(2),false);R.setActive('A');assert.equal(R.setShorterPhase(1),false);R.setActive(null);
});
test('Linear and Hypertrophy original returns hold their chosen phase and reduce higher-rep loads',()=>{
 for(const phase of [1,2]){
  const d=state('progress');d.sessions=[{id:'old',date:'2020-01-01',day:'A',loc:'home',phase:1,ex:[{id:'hex_dl',wt:80,reps:[5,5,5],form:[5,5,5]}]}];
  R.setD(d);assert(R.stopTrainingPlan(phase));assert.equal(R.getD().phase,phase);assert.equal(R.dayExs('A')[0].tg,phase===1?5:8);
  assert(R.dayExs('A').every(e=>e.s<=2));assert(R.getSmartSugg(R.dayExs('A')[0]).wt<=72);
  if(phase===2)assert(R.getD().trainingPlan.phaseLoads.hex_dl<80);
  assert.equal(R.setPhase(phase===1?2:1),false);
 }
});
test('selected phases and adjusted loads survive fresh import; recovery discards active phase fields',()=>{
 R.setD(state('return'));assert(R.advanceTrainingPlan(2));const d=json(R.getD()),w=R.mergeImport(R.freshState(),d).W;
 assert.equal(w.phase,2);assert.equal(w.trainingPlan.phase,2);assert.deepEqual(json(w.trainingPlan.progressLoads),d.trainingPlan.progressLoads);
 const recovery=state();recovery.trainingPlan.phase=2;recovery.trainingPlan.progressLoads={hex_dl:999};
 const p=R.validTrainingPlan(recovery.trainingPlan);assert.equal(p.phase,undefined);assert.equal(p.progressLoads,undefined);
});
test('current phase context explains each stage and does not call recovery Linear',()=>{
 R.setD(state('deload'));const ctx=R.trainingPhaseContext();assert(ctx.label.includes('Recovery'));assert.equal(ctx.next,'Easy return week');
 R.setD(state('return'));assert(R.trainingPhaseContext().next.includes('choose Linear or Hypertrophy'));
 R.setD(state('progress'));assert(R.trainingPhaseContext().label.includes('Mixed reps'));
 assert(R.setShorterPhase(2));assert(R.trainingPhaseContext().label.includes('Hypertrophy'));assert(R.trainingPhaseContext().when.includes('Review from'));
});
test('unknown or different-phase records cannot confirm an increase in a chosen phase',()=>{
 for(const oldPhase of [1,undefined]){
  const d=state('progress');d.trainingPlan.phase=2;d.sessions=progressRows().map((s,i)=>({...s,phase:i===0?oldPhase:2}));R.setD(d);
  assert.equal(R.getSmartSugg(R.dayExs('A')[0]).type,'stay');
 }
});
test('future sessions do not trigger the original 24-session phase review',()=>{
 const d=json(R.freshState());d.phaseStart=R.dayAfter(R.today(),-20);
 d.sessions=Array.from({length:24},(_,i)=>({id:'future'+i,date:R.dayAfter(R.today(),10),day:'A',phase:1,ex:[]}));
 R.setD(d);assert.equal(R.getPhaseInfo().sess,0);assert.equal(R.getPhaseInfo().timerDue,false);
 d.sessions=d.sessions.map(s=>({...s,date:R.today()}));R.setD(d);assert.equal(R.getPhaseInfo().timerDue,true);
 R.setActive('A');assert.equal(R.setPhase(2),false);assert.equal(R.getD().phase,1);R.setActive(null);
});
test('mixed-band progression repeats the bridge and advances only one further set',()=>{
 const d=state('progress');d.sessions=progressRows();
 for(const s of d.sessions)s.ex=[{id:'pullup_a',wt:null,reps:[10,10],band:'Green',bands:['Purple+Red','Green'],form:[5,5],rir:2}];
 R.setD(d);const ex=R.dayExs('A').find(e=>e.id==='pullup_a');
 assert.deepEqual(json(R.shortSuggestion(ex).bands),['Purple+Red','Purple+Red']);
 d.sessions=d.sessions.slice(1);R.setD(d);assert.deepEqual(json(R.shortSuggestion(ex).bands),['Purple+Red','Green']);
});
test('different per-set loads cannot masquerade as two uniform-load confirmations',()=>{
 const d=state('progress');d.sessions=progressRows({wts:[74,72]});R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
});
test('unfinished and fatigue-ended sessions cannot confirm a load increase',()=>{
 for(const over of [{trainingComplete:false},{finishReason:'fatigue'},{finishReason:'discomfort'}]){
  const d=state('progress');d.sessions=progressRows().map(s=>({...s,...over}));R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).type,'stay');
 }
});
function recentState(){const d=state('progress',R.dayAfter(R.today(),-42));d.phase=2;d.trainingPlan.phase=2;return d}
function recentRows(over={}){return [6,3,0].map((days,i)=>({id:'recent-'+i,date:R.dayAfter(R.today(),-days),day:'A',loc:'home',phase:2,
 trainingPlanStart:R.dayAfter(R.today(),-42),trainingStage:'progress',trainingComplete:true,finishReason:'complete',difficulty:2,
 ex:[{id:'hex_dl',wt:60,reps:[8,8],form:[5,5],rir:2}],...over}));}
test('shorter regular training gets a check while held recovery stages remain muted',()=>{
 R.setD(recentState());assert(R.getDeload());assert.equal(R.getDeload().due,false);
 for(const stage of ['deload','return','original1','original2','original3']){R.setD(state(stage));assert.equal(R.getDeload(),null)}
});
test('two fatigue endings trigger a current shorter-routine reminder without a timer',()=>{
 const d=recentState();d.sessions=recentRows({trainingComplete:false,finishReason:'fatigue',noProg:true}).slice(-2);R.setD(d);
 const check=R.getDeload();assert(check.due);assert.equal(check.fatigueN,2);assert(check.reason.includes('Too tired'));
 assert.equal(R.getD().trainingPlan.stage,'progress');assert(R.trainingPlanCard().includes('Consider a deload'));
 assert(R.trainingPlanCard().includes('Start deload today'));assert(!R.trainingPlanCard('workout').includes('Start deload today'));
 assert.equal(R.trainingLoadContext(),'Held · recovery check');
});
test('one hard workout holds progression without recommending a whole deload',()=>{
 for(const over of [{difficulty:4},{finishReason:'fatigue',noProg:true},{finishReason:'discomfort',noProg:true}]){
  const d=recentState();d.sessions=recentRows(over).slice(-1);R.setD(d);assert.equal(R.getDeload().due,false);assert(R.getDeload().hold);
  assert.equal(R.shortSuggestion(R.dayExs('A')[0]).action,'Hold progression');
 }
});
test('repeated high effort needs two ratings on separate dates and expires with recent recovery',()=>{
 const d=recentState();d.sessions=recentRows({difficulty:4}).slice(-2);R.setD(d);assert(R.getDeload().due);
 d.sessions[0].date=d.sessions[1].date;R.setD(d);assert.equal(R.getDeload().due,false);
 d.sessions=recentRows({difficulty:4}).map(s=>({...s,date:R.dayAfter(s.date,-15)}));R.setD(d);assert.equal(R.getDeload().due,false);assert.equal(R.getDeload().ratedN,0);
 d.sessions=recentRows({difficulty:null});R.setD(d);assert.equal(R.getDeload().due,false);assert.equal(R.getDeload().ratedN,0);
 assert(!R.trainingPlanCard().includes('no repeated signal'));assert(R.trainingPlanCard().includes('Recovery check-in'));
});
test('other venues, recovery, future, ignored, old-cycle and empty rows cannot generate a deload',()=>{
 for(const over of [{loc:'partner'},{trainingStage:'return'},{date:R.dayAfter(R.today(),1)},{trainingPlanStart:'1999-01-01'},{noProg:true},{ex:[{id:'hex_dl',wt:60,reps:[0,0]}]}]){
  const d=recentState();d.sessions=recentRows({difficulty:5,...over});R.setD(d);assert.equal(R.getDeload().due,false,JSON.stringify(over));
 }
});
test('a phase change does not erase fatigue but a new recovery cycle clears the old reminder',()=>{
 const d=recentState();d.trainingPlan.stageStart=R.today();d.sessions=recentRows({phase:1,trainingComplete:false,finishReason:'fatigue',noProg:true}).slice(-2);R.setD(d);
 assert(R.getDeload().due);assert(R.setRecoveryMode('deload'));assert.equal(R.getDeload(),null);
 assert(R.setRecoveryMode('off',2));assert.equal(R.getDeload().due,false);assert.equal(R.getDeload().fatigueN,0);
});
function stalledRows(){return recentRows().map(s=>({...s,ex:[{id:'hex_dl',wt:60,reps:[6,6],form:[5,5],rir:2},{id:'floor_press',wt:40,reps:[8,8,8],form:[5,5,5],rir:2}]}))}
test('three comparable below-range exposures on two main lifts prompt a deload review',()=>{
 const d=recentState();d.sessions=stalledRows();R.setD(d);assert(R.getDeload().due);assert.equal(R.getDeload().stalledMajor,2);
});
test('missing sets, changing loads/phases and one struggling lift cannot create a two-lift signal',()=>{
 for(const change of [rows=>{rows[0].ex[0].reps=[6,0]},rows=>{rows[0].ex[0].wt=59},rows=>{rows[0].phase=1},rows=>{rows[0].trainingComplete=false},rows=>{rows[0].ex[0].wts=[59,60]},rows=>{rows.forEach(s=>s.ex=s.ex.slice(0,1))}]){
  const d=recentState();d.sessions=stalledRows();change(d.sessions);R.setD(d);assert.equal(R.getDeload().due,false);assert(R.getDeload().stalledMajor<2);
 }
});
test('calendar alone gives an optional check-in and never starts a deload',()=>{
 const d=recentState();d.sessions=recentRows();R.setD(d);assert.equal(R.getDeload().due,false);assert(R.getDeload().consider);
 assert(R.trainingPlanCard().includes('not a required deload'));assert.equal(R.getD().trainingPlan.stage,'progress');
});
test('fatigue window includes the last 14 local dates and never falls back to stale ratings',()=>{
 const d=recentState();d.sessions=recentRows({finishReason:'fatigue',noProg:true}).slice(-2);d.sessions[0].date=R.dayAfter(R.today(),-13);R.setD(d);assert(R.getDeload().due);
 d.sessions[0].date=R.dayAfter(R.today(),-14);R.setD(d);assert.equal(R.getDeload().due,false);assert.equal(R.getDeload().fatigueN,1);
});
test('a recovery warning also holds an earned band-ladder advance',()=>{
 const d=recentState();d.sessions=recentRows().slice(0,2).map(s=>({...s,ex:[{id:'pullup_a',band:'Green',wt:0,reps:[10,10],form:[5,5],rir:2}]}));R.setD(d);
 const ex=R.dayExs('A').find(e=>e.id==='pullup_a');assert.equal(R.shortSuggestion(ex).action,'Advance one band set');
 d.sessions.push(...recentRows({finishReason:'fatigue',noProg:true,trainingComplete:false}).slice(-2).map(s=>({...s,id:'tired-'+s.id})));R.setD(d);
 assert.equal(R.shortSuggestion(ex).type,'stay');assert.equal(R.shortSuggestion(ex).action,'Hold progression');
});
test('next lift action distinguishes reps, first confirmation, increased load and missing ratings',()=>{
 const d=recentState();R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).action,'Add reps when ready');
 d.sessions=recentRows().slice(-1);R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).action,'Repeat target (1/2)');
 d.sessions=recentRows().slice(-2);R.setD(d);let sg=R.shortSuggestion(R.dayExs('A')[0]);assert.equal(sg.action,'Increase weight');assert(sg.wt>60);assert(sg.detail.includes('build within'));
 d.sessions.push({...recentRows().at(-1),id:'higher',date:R.today(),ex:[{id:'hex_dl',wt:sg.wt,reps:[6,6],form:[5,5],rir:2}]});R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).action,'Add reps when ready');
 d.sessions=recentRows().slice(-1);d.sessions[0].ex[0].rir=null;R.setD(d);assert.equal(R.shortSuggestion(R.dayExs('A')[0]).action,'Hold weight · check ratings');
});
test('recovery warning overrides previously earned weight increases without changing saved history',()=>{
 const d=recentState();d.sessions=recentRows().slice(0,2);d.sessions.push(...recentRows({finishReason:'fatigue',noProg:true,trainingComplete:false}).slice(-2).map(s=>({...s,id:'tired-'+s.id})));R.setD(d);
 const before=json(R.getD());const sg=R.getSmartSugg(R.dayExs('A')[0]);assert.equal(sg.type,'stay');assert.equal(sg.action,'Hold progression');assert(sg.wt<=60);
 assert.deepEqual(json(R.getD()),before);
});
console.log(`\n${passed} recovery tests passed`);
