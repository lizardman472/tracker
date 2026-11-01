// Synthetic reported duration; independent literal volume: 40*5 + 11*5 + 11*5 = 310.
const now='2026-11-01T12:00:00',base='14c1e8e969a2e6bd2134918f151c2f0a7f6dccd2';
function row(){return{id:'data05-eight',date:'2026-10-28',day:'A',duration:8,volume:999,difficulty:3,warmup:2,phase:1,notes:'Invented eight-minute record',
 ex:[['hex_dl',40],['ohp',11],['bb_curl',11]].map(([id,wt])=>({id,wt,reps:[5],form:[5],rir:3,band:'',notes:'Keep reported fields'}))}}
function state(){return{sessions:[row()],programVersion:21,phase:1,phaseStart:'2026-10-01',nextDay:'B',location:'home',theme:'light',gen:1,
 bodyLog:[],cardioLog:[],discomfort:[],cues:{hex_dl:'Invented preserved cue'},notify:{enabled:false,rest:true},trainingPlan:null,originalResume:null}}
function expected(){return{...row(),volume:310,loc:'home'}}
module.exports={now,base,row,state,expected};
