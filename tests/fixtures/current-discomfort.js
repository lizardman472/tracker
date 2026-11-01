// Invented MATH-05 oracles, pinned before changing the shared selector.
const now='2026-11-01T12:00:00';
const current={date:'2026-10-31',exId:'hex_dl',joint:'Knee',level:'moderate'};
const futureNone=['2026-11-02','2026-11-03','2026-11-04'].map(date=>({date,exId:'hex_dl',joint:'Knee',level:'none'}));
const futureModerate=['2026-11-02','2026-11-03'].map(date=>({date,exId:'pullup_a',joint:'Shoulder',level:'moderate'}));
// Original resistance advice asks for more resistance without auto-selecting a band.
const assistance=['Purple+Red','Green','Green','Green'],resistance=['Green','Green','Green','Green'];
// Independent amendment oracles: future-only exact joint => {count:0,recent3:0};
// these two current positives followed by three future none => {count:2,recent3:2}.
const trendCurrent=[{date:'2026-10-30',exId:'pullup_a',joint:'Shoulder',level:'mild'},{date:'2026-10-31',exId:'pullup_a',joint:'Shoulder',level:'moderate'}];
function fixture(kind='weighted'){
 const weighted=kind==='weighted',resist=kind==='resistance',id=weighted?'hex_dl':resist?'rear_delt':'pullup_a',day=resist?'B':'A';
 return{phase:1,phaseStart:'2026-10-01',nextDay:day,location:'home',lastDeload:null,comeback:null,originalResume:null,
  trainingPlan:weighted?{stage:'progress',start:'2026-10-01',stageStart:'2026-10-10',phase:1,phaseStart:'2026-10-10',loads:{hex_dl:40},bands:{}}:null,
  sessions:['2026-10-27','2026-10-31'].map((date,i)=>({id:'current-discomfort-'+kind+'-'+i,date,day,loc:'home',phase:1,difficulty:3,
   ...(weighted?{trainingPlanStart:'2026-10-01',trainingStage:'progress',trainingComplete:true,finishReason:'complete'}:{}),
   notes:'Invented current-discomfort fixture',ex:[{id,wt:weighted?40:null,band:weighted?'':'Green',reps:weighted?[5,5]:resist?[20,20,20,20]:[8,8,8,8],form:weighted?[5,5]:[5,5,5,5],rir:3,notes:''}]})),
  discomfort:weighted?[{...current},...futureNone.map(r=>({...r}))]:futureModerate.map(r=>({...r,exId:id}))};
}
// Phone Start obeys the shorter plan's two-day rest gate; the unit oracle stays27/31.
function phoneFixture(kind){const d=fixture(kind);if(kind==='weighted')d.sessions[1].date='2026-10-29';return d}
module.exports={now,current,futureNone,futureModerate,assistance,resistance,trendCurrent,fixture,phoneFixture};
