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
globalThis.R={freshState,normalizeState,mergeImport,validSession,normalizeActiveRecord,activeRecord,hotelProgram,hotelProgramLegacy,hotelDayExs,hotelStartLabel,resumeW,saveAW,workoutBudgetTarget,dayExs,getProgram,getCurPR,
 setLoc,setHotelBand,setHotelNordic,nextTrainingDay,hotelCard,trainingPlanCard,getSmartSugg,beginW,saveSumm,ensureLog,repInputLabel,repUnit,effectiveReps,dayBadge,
 lastRotSession,getPhaseInfo,getComeback,getBreak,getDeload,checkResume,AW_KEY,today,ALL_EX,MG,swapCandidates,retrySave,
 setD:d=>{D=normalizeState(d).W;WRITER=true;WRITER_READY=true;PENDING_SAVE=null;PENDING_ACTIVE=null;ADAY=null;ACTIVE_HOTEL_VERSION=null;EXPRESS=false;ACTIVE_ORIGINAL_RESUME=null;LOG={};SAVE_ERROR=AW_ERROR='';
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
test('revised days distribute the agreed movements and keep only finishers optional',()=>{
 R.setD({...state(),location:'hotel',hotelBand:true});
 const expected={A:['hotel_split_squat','hotel_chest_press','hotel_row','hotel_ham_curl','hotel_lateral','hotel_fallout','hotel_biceps'],
 B:['hotel_ham_curl','hotel_pike_press','hotel_row','hotel_split_squat','hotel_chest_press','hotel_lateral','hotel_glute_bridge','hotel_triceps'],
 C:['hotel_lateral_lunge','hotel_floor_pushup','hotel_high_row','hotel_sissy_squat','hotel_lateral','hotel_side_plank','hotel_ham_curl']};
 for(const day of ['A','B','C']){
  const full=R.dayExs(day,{},false),short=R.dayExs(day,{},true),n=day==='B'?2:1;
  assert.deepEqual(json(full.map(e=>e.id)),expected[day]);
  assert(full.slice(-n).every(e=>e.optional));assert(full.slice(0,-n).every(e=>!e.optional));
  assert.equal(full.reduce((a,e)=>a+e.s,0),day==='B'?18:17);
  assert.equal(short.length,4);assert.equal(short.reduce((n,e)=>n+e.s,0),8);
  assert(full.every(e=>R.ALL_EX.some(x=>x.id===e.id)&&R.MG[e.id]));
 }
 const week=['A','B','C'].flatMap(d=>R.dayExs(d,{},false));
 const sets=ids=>week.filter(e=>ids.includes(e.id)).reduce((n,e)=>n+e.s,0);
 assert.equal(sets(['hotel_chest_press','hotel_floor_pushup']),8);
 assert.equal(sets(['hotel_row']),6);assert.equal(sets(['hotel_high_row']),3);
 assert.equal(sets(['hotel_lateral']),6);assert.equal(sets(['hotel_fallout','hotel_side_plank']),4);
 assert.equal(sets(['hotel_split_squat']),5);assert.equal(sets(['hotel_sissy_squat']),3);
 assert.equal(sets(['hotel_ham_curl']),7);assert.equal(week.reduce((n,e)=>n+e.s,0),52);
 assert.deepEqual(json(R.getProgram(1,'hotel')),json(R.getProgram(3,'hotel')));
 assert(R.setHotelBand(false));assert.equal(R.dayExs('A',{},false)[4].id,'hotel_reverse_fly');
 assert.equal(R.dayExs('C',{},false)[4].id,'hotel_pike_press');
 assert.equal(R.dayExs('B',{},false).length,7);assert.equal(R.dayExs('B',{},false).reduce((n,e)=>n+e.s,0),16);
 assert(!R.dayExs('B',{},false).some(e=>e.id==='hotel_lateral'));
 assert.match(R.hotelStartLabel('A'),/6 main \+ 1 optional/);assert.match(R.hotelStartLabel('B'),/5 main \+ 2 optional/);
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
test('Nordic setup is opt-in and only replaces A curls, including short A',()=>{
 R.setD({...state(),location:'hotel',hotelBand:true});
 assert.equal(R.getD().hotelNordic,false);assert.equal(R.dayExs('A',{},true)[3].id,'hotel_ham_curl');
 assert(R.setHotelNordic(true));assert.equal(JSON.parse(values.get('rft-v12')).hotelNordic,true);
 assert.equal(R.dayExs('A',{},true)[3].id,'hotel_nordic');
 assert.equal(R.dayExs('B',{},false)[0].id,'hotel_ham_curl');assert.equal(R.dayExs('B',{},false)[0].s,3);
 assert.equal(R.dayExs('C',{},false).at(-1).id,'hotel_ham_curl');
 assert.equal(R.dayExs('C',{},true)[3].id,'hotel_sissy_squat');assert.equal(R.dayExs('C',{},true)[3].s,2);
 assert(!R.dayExs('C',{},false)[3].optional);assert.equal(R.dayExs('C',{},false)[3].s,3);
 assert(R.setHotelNordic(false));assert.equal(R.dayExs('A',{},false)[3].id,'hotel_ham_curl');
});
test('anchor changes cannot replace unfinished work and failed preference saves are atomic',()=>{
 R.setD({...state(),location:'hotel'});R.setActive('A');
 assert.equal(R.setHotelNordic(true),false);assert.equal(R.getD().hotelNordic,false);
 R.setActive(null);values.set(R.AW_KEY,JSON.stringify({id:'nordic-pending',day:'C',loc:'hotel',phase:3,start:Date.now(),ts:Date.now(),log:{},notes:'keep old bridge workout'}));
 assert.equal(R.setHotelNordic(true),false);assert(values.get(R.AW_KEY).includes('keep old bridge workout'));
 values.delete(R.AW_KEY);failWrite=true;
 assert.equal(R.setHotelNordic(true),false);assert.equal(R.getD().hotelNordic,false);
 assert.equal(JSON.parse(values.get('rft-v12')).hotelNordic,false);
 failWrite=false;assert(R.retrySave());assert.equal(R.getD().hotelNordic,true);
});
test('Nordic preference round-trips backups without overriding an occupied device',()=>{
 const d={...state(),location:'hotel',hotelNordic:true};
 d.sessions.push({id:'nordic-history',date:R.today(),day:'A',loc:'hotel',phase:3,ex:[{id:'hotel_nordic',reps:[5],notes:'short range; assisted return'}]});
 d.sessions.push({id:'bridge-history',date:R.today(),day:'C',loc:'hotel',phase:3,ex:[{id:'hotel_glute_bridge',reps:[12,12]}]});
 const restored=R.mergeImport(R.freshState(),d).W;
 assert.equal(restored.hotelNordic,true);assert(restored.sessions.some(s=>s.ex[0].id==='hotel_glute_bridge'));
 assert(restored.sessions.some(s=>s.ex[0].id==='hotel_nordic'));
 assert.equal(R.mergeImport(state(),d).W.hotelNordic,false);
 const draft=R.normalizeActiveRecord({id:'sissy-draft',loc:'hotel',phase:3,day:'C',start:Date.now(),ts:Date.now(),log:{hotel_sissy_squat:{reps:[9],notes:'light hand support'}},exIds:['hotel_sissy_squat']},restored);
 assert.equal(draft.log.hotel_sissy_squat.reps[0],9);assert.equal(draft.log.hotel_sissy_squat.notes,'light hand support');
});
test('new movements never earn automatic assistance or load changes and normal swaps resolve',()=>{
 const d={...state(),location:'hotel',hotelNordic:true};
 for(const id of ['hotel_nordic','hotel_sissy_squat','nordic_curl','sissy_squat'])d.sessions.push({id:'high-'+id,date:R.today(),day:'A',loc:id.startsWith('hotel_')?'hotel':'home',phase:3,ex:[{id,reps:[25,25,25],notes:'same range and assistance'}]});
 R.setD(d);
 for(const id of ['hotel_nordic','hotel_sissy_squat','nordic_curl','sissy_squat']){
  const ex=R.ALL_EX.find(e=>e.id===id),sg=R.getSmartSugg(ex);
  assert(ex&&R.MG[id]);assert.equal(sg.type,'stay');assert.equal(sg.wt,null);assert.match(sg.detail,/same range and assistance/);
 }
 R.setActive('A');assert(R.swapCandidates('hotel_nordic','hotel_nordic','all').some(e=>e.id==='hotel_ham_curl'));
 R.setD({...state(),location:'home'});R.setActive('B');
 assert(R.swapCandidates('band_leg_curl','band_leg_curl','all').some(e=>e.id==='nordic_curl'));
 R.setActive('C');assert(R.swapCandidates('lm_lateral_squat','lm_lateral_squat','all').some(e=>e.id==='sissy_squat'));
});
test('hotel swaps preserve the slot volume and optional status',()=>{
 R.setD({...state(),location:'hotel',hotelBand:true});R.setActive('B');
 const press=R.dayExs('B',{hotel_chest_press:'hotel_floor_pushup'},false).find(e=>e._slot==='hotel_chest_press');
 assert.equal(press.id,'hotel_floor_pushup');assert.equal(press.s,2);assert.equal(press.optional,false);
 const hinge=R.dayExs('B',{hotel_glute_bridge:'hotel_bstance_rdl'},false).find(e=>e._slot==='hotel_glute_bridge');
 assert.equal(hinge.s,2);assert.equal(hinge.optional,true);assert.equal(R.repInputLabel(hinge),'reps per side');
 R.setActive('C');
 const split=R.dayExs('C',{hotel_lateral_lunge:'hotel_split_squat'},false)[0];assert.equal(split.s,2);
 assert(R.swapCandidates('hotel_lateral_lunge','hotel_lateral_lunge','all').some(e=>e.id==='hotel_split_squat'));
 R.setActive('A');assert(R.swapCandidates('hotel_fallout','hotel_fallout','all').some(e=>e.id==='hotel_reverse_crunch'));
 for(const id of ['hotel_pike_press','hotel_high_row','hotel_lateral_lunge','hotel_fallout','hotel_reverse_crunch','hotel_y_fly','hotel_bstance_rdl']){
  const ex=R.ALL_EX.find(e=>e.id===id);assert(ex&&R.MG[id]);assert.equal(R.getSmartSugg(ex).type,'stay');assert.equal(R.getSmartSugg(ex).wt,null);
 }
});
test('unfinished earlier hotel workouts retain their exact prescription through resume and backup',()=>{
 R.setD({...state(),location:'hotel',hotelBand:true,hotelNordic:true});
 const ids=R.hotelProgramLegacy().C.map(e=>e.id);
 const draft={id:'before-revision',loc:'hotel',phase:3,day:'C',start:Date.now(),ts:Date.now(),xp:false,exIds:ids,
 log:{hotel_sissy_squat:{reps:[9,8],setDone:[true,true],notes:'original two sets'},hotel_chest_press:{reps:[12],setDone:[true]}},notes:'keep this workout'};
 values.set(R.AW_KEY,JSON.stringify(draft));
 const found=R.checkResume();assert(found);assert.equal(found.hotelVersion,1);assert(!found.drifted);
 R.resumeW();assert.deepEqual(json(R.dayExs('C').map(e=>e.id)),json(ids));
 assert.equal(R.dayExs('C').at(-1).s,2);assert(R.dayExs('C').at(-1).optional);
 assert.equal(R.getLOG().hotel_sissy_squat.reps[0],9);assert.equal(R.getLOG().hotel_sissy_squat.notes,'original two sets');
 const active=R.activeRecord();assert.equal(active.hotelVersion,1);assert(R.saveAW());
 assert.equal(R.normalizeActiveRecord(active,R.getD()).hotelVersion,1);
 R.setActive(null);R.setConfirm(true);R.beginW('C');
 assert.equal(R.activeRecord().hotelVersion,3);assert.equal(R.dayExs('C')[0].id,'hotel_lateral_lunge');
 assert.equal(R.dayExs('C')[3].s,3);assert(!R.dayExs('C')[3].optional);
 assert.equal(R.normalizeActiveRecord({...R.activeRecord(),hotelVersion:99},R.getD()),null);
});
test('revised workouts resume with their selected day and new prescriptions',()=>{
 const d={...state(),location:'hotel',hotelBand:false,hotelNordic:true};R.setD(d);R.beginW('B');
 assert.equal(R.workoutBudgetTarget(),65*60);
 R.getLOG().hotel_pike_press.reps[0]='8';R.getLOG().hotel_pike_press.setDone[0]=true;assert(R.saveAW());
 const active=JSON.parse(values.get(R.AW_KEY));assert.equal(active.hotelVersion,3);
 const restored=R.normalizeActiveRecord(active,R.getD());assert.equal(restored.hotelVersion,3);
 R.setActive(null);assert(!R.checkResume().drifted);R.resumeW();
 assert.equal(R.dayExs('B')[0].s,3);assert.equal(R.getLOG().hotel_pike_press.reps[0],8);
 assert.equal(R.dayExs('B').length,7);assert(R.dayExs('B').slice(-2).every(e=>e.optional));
});
test('no-band shoulders use T flyes and two pike exposures; bottles are optional swaps',()=>{
 R.setD({...state(),location:'hotel',hotelBand:false});
 const week=['A','B','C'].flatMap(day=>R.dayExs(day,{},false));
 assert(!week.some(e=>e.tp==='band'));assert.equal(week.filter(e=>e.id==='hotel_pike_press').reduce((n,e)=>n+e.s,0),4);
 assert.equal(week.reduce((n,e)=>n+e.s,0),50);
 R.setActive('C');assert(R.swapCandidates('hotel_pike_press','hotel_pike_press','all').some(e=>e.id==='hotel_bottle_lateral'));
 const alt=R.dayExs('C',{hotel_pike_press:'hotel_bottle_lateral'},false)[4];
 assert.equal(alt.s,2);assert.equal(alt.optional,false);assert.equal(R.getSmartSugg(alt).type,'stay');assert.equal(R.getSmartSugg(alt).wt,null);
 assert.match(alt.note,/not assumed equipment/);
});
test('an unfinished version-two C retains its Y fly and then new C uses pike presses',()=>{
 R.setD({...state(),location:'hotel',hotelBand:false});
 const exs=R.hotelProgram(false,false,2).C;
 assert.equal(exs[4].id,'hotel_y_fly');
 const draft={id:'before-no-band-update',loc:'hotel',hotelVersion:2,phase:3,day:'C',start:Date.now(),ts:Date.now(),exIds:exs.map(e=>e.id),log:{hotel_y_fly:{reps:[12,11],setDone:[true,true],notes:'old Y setup'}}};
 values.set(R.AW_KEY,JSON.stringify(draft));assert(!R.checkResume().drifted);R.resumeW();
 assert.equal(R.dayExs('C')[4].id,'hotel_y_fly');assert.equal(R.activeRecord().hotelVersion,2);
 assert.equal(R.getLOG().hotel_y_fly.notes,'old Y setup');assert.equal(R.normalizeActiveRecord(R.activeRecord(),R.getD()).hotelVersion,2);
 R.setActive(null);R.beginW('C');assert.equal(R.dayExs('C')[4].id,'hotel_pike_press');assert.equal(R.activeRecord().hotelVersion,3);
});
console.log(`\n${count} hotel mode tests passed`);
