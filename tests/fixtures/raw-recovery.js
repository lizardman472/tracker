// Independent DATA03/07 oracle, declared before app edits. Raw strings have no trailing newline.
const R=`{ "sessions": [ {"id":"raw-valid-1","date":"2026-10-01","day":"A","loc":"home","phase":1,"duration":20,"difficulty":3,"ex":[{"id":"hex_dl","wt":40,"reps":[5,0,6],"wts":[null,80,35],"band":"","notes":"R keep"}]}, {"id":"raw-invalid-1","date":"bad-date","day":"A","ex":[]} ], "nextDay":"B","phase":1,"phaseStart":"2026-10-01","location":"home","programVersion":21,"theme":"light","opaqueRaw":"R-only" }`;
const C0=`{ "rawCopy": "C0 distinct older original", "sessions": "unreadable" }`;
const L0=`{broken legacy L0`;
const A0=`{"id":"active-oracle-1","day":"A","loc":"home","phase":1,"resetEpoch":"0","owner":"oracle-owner","start":1793502000000,"ts":1793502001000,"log":{"hex_dl":{"wt":40,"reps":["5",""],"wts":["",""],"bands":["",""],"band":"","setDone":[true,false],"form":[5,0],"notes":"A0 keep"}},"notes":"A0 session keep","exIds":["hex_dl"],"swaps":{},"wu":[true,false,false],"xp":false,"cidx":0}`;
// P is specified independently; normal save metadata/normalization stays existing policy.
const P={sessions:[
 {id:'raw-valid-1',date:'2026-10-01',day:'A',loc:'home',phase:1,duration:20,difficulty:3,ex:[{id:'hex_dl',wt:40,reps:[5,0,6],wts:[null,80,35],band:'',notes:'R keep'}]},
 {id:'recovery-save-1',date:'2026-11-01',day:'A',loc:'home',phase:1,duration:20,difficulty:3,notes:'P keep',ex:[{id:'hex_dl',wt:40,reps:[5],form:[5],band:'',notes:''}]}
],nextDay:'B',phase:1,phaseStart:'2026-10-01',location:'home',programVersion:21,theme:'dark',cues:{},bodyLog:[],cardioLog:[],discomfort:[],
 lastDeload:null,lastBackup:null,lastBackupCount:0,dismissed:{},deleted:[],comeback:null,comebackLog:[],trainingPlan:null,originalResume:null,resetEpoch:'0',notify:{enabled:false,rest:true}};
// UI variants are also declared before execution, independently of app helpers.
const R_DARK=R.replace('"theme":"light"','"theme":"dark"');
const P_PAST={id:'recovery-save-1',date:'2026-11-01',day:'A',loc:'home',phase:1,volume:200,duration:null,difficulty:null,warmup:null,retro:true,
 ex:[{id:'hex_dl',wt:40,reps:[5,0,0],band:'',notes:''}]};
module.exports={R,M0:R,C0,L0,A0,P,R_DARK,P_PAST};
