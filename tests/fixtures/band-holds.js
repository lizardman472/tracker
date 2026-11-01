// Invented, valid-date MATH-01/02 inputs and independently specified band patterns.
const actual=['Purple+Red','Green','Green','Green'];
const advance=['Purple+Red','Purple+Red','Green','Green'];
function fixture({resume=false,effort=3,discomfort=true,id='pullup_a',day='A'}={}){
 const d={phase:1,phaseStart:'2026-10-01',nextDay:day,location:'home',lastDeload:null,trainingPlan:null,comeback:null,originalResume:null,
  sessions:['2026-10-27','2026-10-31'].map((date,i)=>({id:'band-hold-'+i,date,day,loc:'home',phase:1,difficulty:i?effort:3,
   notes:'Invented band-hold fixture',ex:[{id,wt:null,band:'Green',reps:[8,8,8,8],bands:[...actual],form:[5,5,5,5],rir:3,notes:''}]})),
  discomfort:discomfort?['2026-10-29','2026-10-30'].map(date=>({date,exId:id,joint:'Shoulder',level:'moderate'})):[]};
 if(resume){d.originalResume={id:'original-band-hold',date:'2026-10-20',phase:1,loads:{},bands:{[id]:'Green'}};
  d.sessions.forEach(s=>s.originalResumeId=d.originalResume.id)}
 return d;
}
module.exports={actual,advance,fixture,now:'2026-11-01T12:00:00'};
