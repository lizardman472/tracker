// R6 literal oracles transcribed before app edits; invented values only.
const now='2026-11-01T12:00:00',cycle='2026-10-01',stageStart='2026-10-20';
const assistance=['Green','Blue (heaviest)'],resistance=['Purple','Red'];
// Phase2 original Essentials counts/targets inspected in the protected manifest.
const days={
 A:[['hex_dl',3,8],['lm_squat',3,10],['lm_lateral',2,20],['b_stance_rdl',3,20],['floor_press',4,12],['pullup_a',4,8],['bb_curl',2,15],['dead_bugs_a',3,16]],
 B:[['hex_squat_b',4,8],['hex_row',4,12],['ohp',4,10],['dips',4,8],['lm_lateral',2,20],['rear_delt',4,20],['band_leg_curl',2,15],['bird_dog',2,8]],
 C:[['hex_rdl',3,12],['hex_floor_press',3,15],['pullup_c',3,10],['lm_squat',4,10],['lm_press',3,12],['lm_pallof',3,24],['band_er',2,20],['floor_glute_bridge',2,20],['bb_skullcr',2,15]]};
function state(stage='original1',phase=2){return{phase:phase||2,phaseStart:stageStart,nextDay:'A',location:'home',comeback:null,originalResume:null,lastDeload:null,discomfort:[],sessions:[],
 trainingPlan:{stage,start:cycle,stageStart,...(phase?{phase,phaseStart:stageStart}:{}),loads:{hex_dl:80},phaseLoads:phase?{hex_dl:80}:{},returnLoads:{hex_dl:stage==='original1'?72:stage==='original2'?76:80},bands:{pullup_a:'Purple',band_leg_curl:'Green'},returnBands:{pullup_a:'Purple',band_leg_curl:'Green'}}}}
function row(id,date,stage,ex,over={}){return{id,date,day:'A',loc:'home',phase:2,difficulty:3,trainingStage:stage,trainingPlanStart:cycle,trainingComplete:false,finishReason:'time',noProg:true,notes:'Invented practice continuity',ex,...over}}
function lower(){const d=state();d.sessions=[row('r6-lower','2026-10-27','original1',[{id:'hex_dl',wt:72,reps:[8,0,8],wts:[35,72,30],form:[5,0,5],rir:3,band:'',notes:'Counted lower weights'}])];return d}
function bands(kind='assist',stage='original1'){
 const d=state(stage),id=kind==='assist'?'pullup_a':'band_leg_curl';d.nextDay=kind==='assist'?'A':'B';d.sessions=[row('r6-'+kind,'2026-10-27',stage,[{id,wt:null,band:kind==='assist'?'None':'Blue (heaviest)',reps:[8,0,8],bands:kind==='assist'?['Green','None','Blue (heaviest)']:['Purple','Blue (heaviest)','Red'],form:[5,0,5],rir:3,notes:'Counted band positions'}],{day:d.nextDay})];return d;
}
function readiness(stage='original1',start=stageStart){return ['A','B','C'].map((day,i)=>row('r6-ready-'+stage+'-'+day,['2026-10-21','2026-10-23','2026-10-25'][i],stage,days[day].map(([id,n,target])=>({id,wt:['pullup_a','dips','rear_delt','band_leg_curl','pullup_c','band_er','bird_dog'].includes(id)?null:id==='hex_dl'?30:20,band:['pullup_a','dips','rear_delt','band_leg_curl','pullup_c','band_er'].includes(id)?'Green':'',reps:Array(stage==='original1'?Math.min(2,n):n).fill(target),form:Array(stage==='original1'?Math.min(2,n):n).fill(5),rir:3,notes:''})),{day,trainingComplete:true,finishReason:'complete',trainingPlanStart:cycle}))}
function transition(stage='original1'){
 const d=state(stage);d.sessions=readiness(stage);if(stage==='original2')d.sessions[0].ex.find(e=>e.id==='hex_dl').wt=34;
 d.sessions.push(row('r6-matching-'+stage,'2026-10-27',stage,[{id:'hex_dl',wt:stage==='original1'?30:34,reps:[8,8],band:'',form:[5,5],rir:3}]));
 d.sessions.push(row('r6-other-phase-'+stage,'2026-10-28',stage,[{id:'hex_dl',wt:80,reps:[8,8],band:'',form:[5,5],rir:3}],{phase:1}));return d;
}
function progress(fresh=0,ending='time',kind='weighted'){
 const d=state('progress',1);d.trainingPlan={stage:'progress',phase:1,start:cycle,stageStart,phaseStart:stageStart,loads:{hex_dl:40},phaseLoads:{hex_dl:40},progressLoads:{hex_dl:40},bands:{pullup_a:'Green',band_leg_curl:'Green'}};
 const id=kind==='weighted'?'hex_dl':kind==='assist'?'pullup_a':'band_leg_curl',target=kind==='weighted'?5:kind==='assist'?10:15,day=kind==='resist'?'B':'A';d.nextDay=day;
 const ex=(partial=false)=>[{id,wt:kind==='weighted'?40:null,reps:partial?[target,0]:[target,target],band:kind==='weighted'?'':'Green',form:[5,5],rir:3}];
 d.sessions=['2026-10-24','2026-10-26'].map((date,i)=>row('r6-success-'+i,date,'progress',ex(),{phase:1,day,trainingComplete:true,finishReason:'complete',noProg:false}));
 d.sessions.push(row('r6-interruption','2026-10-28','progress',ex(true),{phase:1,day,finishReason:ending}));
 for(let i=0;i<fresh;i++)d.sessions.push(row('r6-fresh-'+i,['2026-10-30','2026-11-01'][i],'progress',ex(),{phase:1,day,trainingComplete:true,finishReason:'complete',noProg:false}));return d;
}
module.exports={now,cycle,stageStart,assistance,resistance,state,row,lower,bands,readiness,transition,progress};
