// Independent synthetic literals: no production helpers/threshold lookup.
const now='2026-11-01T12:00:00',base='40944f0fb2432aee6c5c697d0d0cb68a142edf24',tiers=['Beginner','Novice','Intermediate','Advanced','Elite'];
const boundaries=[['hex_dl',[[109.9,110,110.1],[159.9,160,160.1],[209.9,210,210.1],[259.9,260,260.1]]],['hex_squat_b',[[99.9,100,100.1],[149.9,150,150.1],[199.9,200,200.1],[249.9,250,250.1]]],['ohp',[[49.9,50,50.1],[69.9,70,70.1],[89.9,90,90.1],[109.9,110,110.1]]],['floor_press',[[74.9,75,75.1],[99.9,100,100.1],[124.9,125,125.1],[149.9,150,150.1]]]];
function ex(id,wt,reps=[1],band=''){return{id,wt,reps,band,notes:'Invented R9 practice',form:reps.map(()=>5),rir:3}}
function state(){return{sessions:[],bodyLog:[],cardioLog:[],discomfort:[],cues:{},phase:2,phaseStart:'2026-10-01',nextDay:'A',location:'home',programVersion:21,gen:1,theme:'light',notify:{enabled:false,rest:true},trainingPlan:null,originalResume:null,comeback:null}}
function row(id,day,exs){return{id,date:'2026-10-28',day,loc:'home',phase:2,duration:20,difficulty:3,warmup:2,volume:0,notes:'Synthetic R9 history',ex:exs}}
function metrics(){const d=state();d.sessions=[row('r9-metric','A',[ex('hex_dl',75.5,[5])])];d.sessions[0].volume=377.5;d.bodyLog=[{date:'2026-10-30',weight:80.1}];return d}
function rotation(day='B'){const d=state();d.nextDay=day;d.sessions=[row('r9-rotation-'+day,day==='C'?'B':day==='A'?'C':'A',day==='C'?[ex('hex_squat_b',60,[8,8]),ex('ohp',30,[8,8]),ex('band_leg_curl',null,[15,15],'Green')]:[ex('hex_dl',80,[5,5]),ex('floor_press',50,[8,8]),ex('pullup_a',null,[8,8],'Green')])];return d}
module.exports={now,base,tiers,boundaries,ex,state,row,metrics,rotation};
