// Synthetic fixtures only. The user's export must never enter the repository.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const values=new Map(),alerts=[];
const context={console,Date,Math,structuredClone,Blob,confirm:()=>true,alert:x=>alerts.push(x),navigator:{},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
 document:{getElementById:()=>null,createElement:()=>({style:{},setAttribute(){},click(){}})}};
context.window=context;vm.createContext(context);
vm.runInContext(script.slice(0,script.indexOf('// ═══════════════ INIT'))+`\nrender=()=>{};
globalThis.R={freshState,validTrainingPlan,normalizeState,mergeImport,mergeStores,validSession,
 trainingPlanStatus,shortProgram,shortSuggestion,getSmartSugg,dayAfter,today,dayExs,startTrainingPlan,
 advanceTrainingPlan,restTrainingPlan,stopTrainingPlan,trainingPlanCard,ensureLog,beginW,AW_KEY,
 getD:()=>D,getADAY:()=>ADAY,getLOG:()=>LOG,
 setD:d=>{D=normalizeState(d).W;WRITER=true;WRITER_READY=true;PENDING_SAVE=null;ADAY=null;
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
test('return to normal needs confirmation and restores every day without losing history',()=>{
 const d=state('progress');d.phase=2;d.nextDay='C';
 d.sessions=[{id:'easy',date:'2020-02-02',day:'A',trainingStage:'deload',trainingPlanStart:'2020-02-01',ex:[{id:'hex_dl',wt:60,reps:[5,5]}]}];
 const original={...d,trainingPlan:null};R.setD(original);
 const days=Object.fromEntries(['A','B','C'].map(day=>[day,json(R.dayExs(day))]));
 R.setD(d);const history=json(R.getD().sessions);
 assert(R.trainingPlanCard().includes('Return to normal routine'));
 R.setConfirm(false);assert.equal(R.stopTrainingPlan(),false);assert.equal(R.getD().trainingPlan.stage,'progress');
 R.setConfirm(true);assert(R.stopTrainingPlan());assert.equal(R.getD().trainingPlan,null);
 assert.deepEqual(json(R.getD().sessions),history);assert.equal(R.getD().phase,2);assert.equal(R.getD().nextDay,'C');
 for(const day of ['A','B','C'])assert.deepEqual(json(R.dayExs(day)),days[day]);
 assert(!R.trainingPlanCard().includes('Return to normal routine'));
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
 R.setD(state());const h=R.trainingPlanCard();assert(h.includes('Missing a session does not extend the week'));assert(h.includes('no automatic return'));assert(h.includes('Still tired'));
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
console.log(`\n${passed} recovery tests passed`);
