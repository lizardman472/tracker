// Synthetic state only: hotel mode must never rewrite the normal routine or history.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const values=new Map(),alerts=[];let failWrite=false;
const context={console,Date,Math,structuredClone,Blob,confirm:()=>true,alert:m=>alerts.push(m),navigator:{},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},scrollTo(){},
 localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(failWrite&&k==='rft-v12')throw Error('quota');values.set(k,String(v))},removeItem:k=>values.delete(k)},
 document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({style:{},textContent:'',get innerHTML(){return String(this.textContent).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},setAttribute(){},click(){}})}};
context.window=context;vm.createContext(context);
vm.runInContext(script.slice(0,script.indexOf('// ═══════════════ INIT'))+`\nrender=()=>{};
globalThis.R={freshState,normalizeState,mergeImport,validSession,normalizeActiveRecord,activeRecord,hotelProgram,dayExs,getProgram,getCurPR,
 setLoc,setHotelBand,nextTrainingDay,hotelCard,trainingPlanCard,getSmartSugg,beginW,saveSumm,ensureLog,repInputLabel,repUnit,effectiveReps,dayBadge,
 lastRotSession,getPhaseInfo,getComeback,getBreak,getDeload,checkResume,AW_KEY,today,ALL_EX,MG,swapCandidates,retrySave,
 setD:d=>{D=normalizeState(d).W;WRITER=true;WRITER_READY=true;PENDING_SAVE=null;PENDING_ACTIVE=null;ADAY=null;ACTIVE_ORIGINAL_RESUME=null;LOG={};SAVE_ERROR=AW_ERROR='';
 localStorage.removeItem(AW_KEY);localStorage.setItem(SK,JSON.stringify(D));rememberCommitted(localStorage.getItem(SK));},
 getD:()=>D,getLOG:()=>LOG,getPending:()=>PENDING_SAVE,setActive:v=>ADAY=v,setWriter:v=>WRITER=v,
 setSummary:s=>{window._S=s},setConfirm:v=>confirm=()=>v,
 saveForTest:()=>{finishSavedSummary=()=>{ADAY=null;LOG={};clearAW()};saveSumm()}};`,context);
const R=context.R,json=v=>JSON.parse(JSON.stringify(v));let count=0;
const test=(name,fn)=>{failWrite=false;fn();count++;console.log('PASS '+name)};
const state=()=>({...json(R.freshState()),nextDay:'C',phase:3,phaseStart:'2026-01-01',sessions:[{id:'normal',date:'2026-01-02',day:'B',loc:'home',phase:3,ex:[{id:'floor_press',wt:40,reps:[8,8,8]}]}]});

test('mode persists and returning restores normal prescription phase clock and rotation',()=>{
 const d=state();d.trainingPlan={stage:'deload',start:'2026-01-03',stageStart:'2026-01-03',loads:{floor_press:40},bands:{}};
 R.setD(d);const before=json(R.getD()),normal=json(R.getCurPR());
 assert(R.setLoc('hotel'));assert.equal(R.nextTrainingDay(),'A');
 const saved=JSON.parse(values.get('rft-v12'));assert.equal(saved.location,'hotel');
 R.setD(saved);assert.equal(R.nextTrainingDay(),'A');assert.equal(R.getCurPR().A[0].id,'hotel_split_squat');
 assert(R.setLoc('home'));assert.equal(R.nextTrainingDay(),'C');assert.equal(R.getD().phase,3);
 assert.equal(R.getD().phaseStart,before.phaseStart);assert.deepEqual(json(R.getD().sessions),before.sessions);
 assert.deepEqual(json(R.getD().trainingPlan),before.trainingPlan);assert.deepEqual(json(R.getCurPR()),normal);
});
test('partner entry remembers its return target without changing the shared normal rotation',()=>{
 const d=state();d.location='partner';R.setD(d);assert(R.setLoc('hotel'));assert.equal(R.getD().hotelReturnLoc,'partner');
 assert.match(R.hotelCard(),/Back to Partner's routine/);assert(R.setLoc('partner'));assert.equal(R.nextTrainingDay(),'C');
});
test('main exercises precede the two skippable extras on every day and short mode is eight sets',()=>{
 R.setD({...state(),location:'hotel'});
 for(const day of ['A','B','C']){
  const full=R.dayExs(day,{},false),short=R.dayExs(day,{},true);
  assert.equal(full.length,7);assert.deepEqual(json(full.slice(0,4).map(e=>e.id)),['hotel_split_squat','hotel_chest_press','hotel_row','hotel_ham_curl']);
  assert(full.slice(-2).every(e=>e.optional));assert(full.slice(0,5).every(e=>!e.optional));
  assert.equal(short.length,4);assert.equal(short.reduce((n,e)=>n+e.s,0),8);
  assert(full.every(e=>R.ALL_EX.some(x=>x.id===e.id)&&R.MG[e.id]));
 }
 assert.deepEqual(json(R.getProgram(1,'hotel')),json(R.getProgram(3,'hotel')));
 assert(R.setHotelBand(true));assert.equal(R.dayExs('A',{},false)[5].id,'hotel_lateral');
 assert(!R.dayExs('A',{},false).some(e=>e.id==='hotel_reverse_fly'));
});
test('hotel suggestions never award automatic leverage or band increases from a high rep count',()=>{
 const d=state();d.location='hotel';d.hotelBand=true;
 for(const id of ['hotel_row','hotel_lateral'])d.sessions.push({id:'high-'+id,date:R.today(),day:'A',loc:'hotel',phase:3,ex:[{id,reps:[30,30,30],band:'Red',notes:'straps short; feet at tile 2'}]});
 R.setD(d);
 for(const id of ['hotel_row','hotel_lateral']){const e=R.ALL_EX.find(e=>e.id===id),sg=R.getSmartSugg(e);assert.equal(sg.type,'stay');assert.equal(sg.wt,null);assert.equal(sg.band,'Red');assert.match(sg.detail,/tile 2/)}
 const split=R.ALL_EX.find(e=>e.id==='hotel_split_squat'),plank=R.ALL_EX.find(e=>e.id==='hotel_side_plank');
 assert.equal(R.repInputLabel(split),'reps per side');assert.deepEqual(json(R.effectiveReps(split,[12,12])),[12,12]);
 assert.equal(R.repInputLabel(plank),'seconds per side');assert.equal(R.repUnit(plank),'Secs/side');
});
test('saving only main work is allowed and advances hotel rotation without consuming normal days',()=>{
 R.setD({...state(),location:'hotel'});R.beginW('A');
 R.setSummary({id:'hotel-main-only',date:R.today(),day:'A',exs:[{id:'hotel_row',wt:null,reps:[12,12,12],notes:'feet at tile 2'}],dur:35,tv:0,warmup:1,notes:'Stopped before extras'});
 R.saveForTest();assert.equal(R.getD().nextDay,'C');assert.equal(R.getD().hotelNextDay,'B');
 const s=R.getD().sessions.at(-1);assert.equal(s.loc,'hotel');assert.equal(s.ex.length,1);assert.equal(s.ex[0].notes,'feet at tile 2');
 assert.equal(R.lastRotSession(R.getD().sessions).id,'normal');assert.equal(R.dayBadge(s),'Day AH');
 R.beginW('B');assert.equal(R.getLOG().hotel_row.notes,'feet at tile 2');
});
test('mode or band changes cannot replace active notes-only hidden or unreadable work',()=>{
 for(const loc of ['home','hotel']){
  R.setD({...state(),location:loc});R.setActive('A');assert.equal(R.setLoc(loc==='hotel'?'home':'hotel'),false);assert.equal(R.setHotelBand(true),false);
  R.setActive(null);values.set(R.AW_KEY,JSON.stringify({id:'unfinished',day:'A',loc:loc==='hotel'?'home':'partner',phase:3,start:Date.now(),ts:Date.now(),log:{},notes:'Keep these notes'}));
  assert.equal(R.setLoc(loc==='hotel'?'home':'hotel'),false);assert.equal(R.setHotelBand(true),false);assert(values.get(R.AW_KEY).includes('Keep these notes'));
  values.set(R.AW_KEY,'broken');assert.equal(R.setLoc(loc==='hotel'?'home':'hotel'),false);
 }
});
test('failed mode saves remain atomic and can be retried without losing the normal routine',()=>{
 R.setD(state());failWrite=true;assert.equal(R.setLoc('hotel'),false);assert.equal(R.getD().location,'home');
 assert.equal(JSON.parse(values.get('rft-v12')).location,'home');assert.equal(R.getPending().location,'hotel');
 failWrite=false;assert(R.retrySave());assert.equal(R.getD().location,'hotel');assert.equal(R.getD().nextDay,'C');
});
test('fresh backup restores hotel preferences sessions notes and unfinished identity; additive import keeps local mode',()=>{
 const d=state();d.location='hotel';d.hotelNextDay='C';d.hotelBand=true;d.hotelReturnLoc='partner';
 d.sessions.push({id:'hotel-import',date:R.today(),day:'B',loc:'hotel',phase:3,ex:[{id:'hotel_row',wt:null,reps:[10,10,10],notes:'setup 2'}]});
 const n=R.normalizeState(d);assert.equal(n.issues.dropped,0);assert.equal(n.issues.repaired,0);
 const restored=R.mergeImport(R.freshState(),d).W;assert.equal(restored.location,'hotel');assert.equal(restored.hotelNextDay,'C');assert.equal(restored.nextDay,'C');assert(restored.hotelBand);assert.equal(restored.hotelReturnLoc,'partner');
 assert.equal(restored.sessions.at(-1).ex[0].notes,'setup 2');
 const additive=R.mergeImport(state(),d).W;assert.equal(additive.location,'home');assert.equal(additive.hotelBand,false);assert.equal(additive.sessions.at(-1).loc,'hotel');
 const draft=R.normalizeActiveRecord({id:'hotel-draft',loc:'hotel',phase:3,day:'C',start:Date.now(),ts:Date.now(),log:{hotel_row:{reps:[12],notes:'keep'}},exIds:['hotel_row']},restored);
 assert.equal(draft.loc,'hotel');assert.equal(draft.id,'hotel-draft');assert.equal(draft.log.hotel_row.notes,'keep');
});
test('hotel days do not satisfy normal phase-session or comeback-session counts',()=>{
 R.setD(state());const before=R.getPhaseInfo().sess;
 const d=state();d.sessions.push({id:'hotel-count',date:R.today(),day:'A',loc:'hotel',phase:3,ex:[{id:'hotel_row',reps:[10]}]});R.setD(d);
 assert.equal(R.getPhaseInfo().sess,before);R.setLoc('hotel');assert.equal(R.getBreak(),null);assert.equal(R.getDeload(),null);assert.equal(R.getComeback(),null);
});
console.log(`\n${count} hotel mode tests passed`);
