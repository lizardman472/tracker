// R4 independent invented oracle, declared before implementation. No app helper used.
const MAIN_RAW='{"sessions":[{"id":"backup-history-1","date":"2026-10-20","day":"A","loc":"home","phase":1,"duration":20,"difficulty":3,"warmup":2,"notes":"History keep","ex":[{"id":"hex_dl","wt":40,"reps":[5,5,5],"band":"","notes":"History lift keep"}]}],"nextDay":"B","phase":1,"phaseStart":"2026-10-01","location":"home","programVersion":21,"theme":"light","cues":{},"bodyLog":[],"cardioLog":[],"discomfort":[],"deleted":[],"resetEpoch":"backup-epoch-1","originalResume":{"id":"original-backup-oracle","date":"2026-10-01","phase":1,"loads":{"hex_dl":40},"bands":{"pullup_a":"Green"}},"trainingPlan":null,"comeback":null,"comebackLog":[],"notify":{"enabled":false,"rest":true},"dismissed":{},"lastBackup":null,"lastBackupCount":0,"gen":1}';
const DRAFT_RAW='{"id":"backup-active-1","owner":"fixture-owner-A","resetEpoch":"backup-epoch-1","day":"A","loc":"home","phase":1,"originalResumeId":"original-backup-oracle","start":1793491200000,"ts":1793491500000,"cidx":0,"exIds":["hex_dl","pullup_a"],"swaps":{},"notes":"Session notes keep","wu":[true,false,true],"xp":false,"log":{"hex_dl":{"wt":40,"reps":["5","","7"],"wts":[40,45,35],"bands":["","",""],"band":"","setDone":[true,false,false],"setTs":[1793491300000,0,0],"form":[5,0,4],"rir":2,"notes":"Hex notes keep","disc":"mild","discJoints":["Knee"],"touched":true,"pf":false},"pullup_a":{"wt":null,"reps":["8","","6"],"wts":["","",""],"band":"Green","bands":["Green","Blue (heaviest)","Purple"],"setDone":[true,false,true],"setTs":[1793491350000,0,1793491450000],"form":[4,0,5],"rir":3,"notes":"Band notes keep","disc":"none","discJoints":[],"touched":true,"pf":false}}}';
const EXPECTED={id:'backup-active-1',day:'A',loc:'home',phase:1,resetEpoch:'backup-epoch-1',originalResumeId:'original-backup-oracle',start:1793491200000,
 notes:'Session notes keep',wu:[true,false,true],xp:false,exIds:['hex_dl','pullup_a'],swaps:{},
 hex:{wt:40,reps:[5,0,7],wts:[40,45,35],bands:['','',''],setDone:[true,false,false],setTs:[1793491300000,0,0],form:[5,0,4],rir:2,notes:'Hex notes keep',disc:'mild',discJoints:['Knee']},
 pullup:{band:'Green',reps:[8,0,6],bands:['Green','Blue (heaviest)','Purple'],setDone:[true,false,true],form:[4,0,5],rir:3,notes:'Band notes keep'}};
// Existing Resume expands today's full original programme; stored-before-Resume stays two IDs.
const RESUMED_EX_IDS=['hex_dl','lm_squat','lm_lateral','b_stance_rdl','floor_press','pullup_a','bb_rear_row','bb_curl','dead_bugs_a'];
// Counted completed rows, specified literally rather than by replaying finish/normalization.
const COMPLETED_UI={date:'2026-11-01',day:'A',loc:'home',phase:1,difficulty:3,warmup:2,notes:'UI Session keep',volume:175,
 express:true,trainingStage:'progress',trainingPlanStart:'2026-10-01',trainingComplete:false,finishReason:'time',
 rows:{hex_dl:{wt:36,band:'',reps:[5,0],wts:[35,45],form:[4,4,4],rir:2,notes:'UI Hex keep'},pullup_a:{wt:null,band:'Green',reps:[8,6],bands:['Blue (heaviest)','Green'],form:[4,4,4,4],rir:3,notes:'UI Band keep'}}};
const COMPLETED_FIXTURE={date:'2026-11-01',day:'A',loc:'home',phase:1,difficulty:3,warmup:2,notes:'Session notes keep',
 rows:{hex_dl:{wt:40,band:'',form:[5,0,4],rir:2,notes:'Hex notes keep'},pullup_a:{wt:null,band:'Green',reps:[8,0,6],bands:['Green','','Purple'],form:[4,0,5],rir:3,notes:'Band notes keep'}}};
const COMPLETED_REPS={3:[3,0,0],5:[5,0,0],6:[6,0,0]},COMPLETED_VOLUME={3:120,5:200,6:240};
const COMPLETED_LEGACY={date:'2026-11-01',day:'A',loc:'home',phase:1,difficulty:3,warmup:0,notes:'',volume:35,
 rows:{hex_dl:{wt:7,band:'',reps:[5,0,0],form:[0,0,0],notes:''}}};
// Explicit variants are chosen by tests before executing each action, never normalizer-derived.
// Live5→6 is permitted only after an actual successful owner save or stable actual Resume
// establishes the exact older raw baseline. Imported same-ID3 is always a separate source.
module.exports={MAIN_RAW,DRAFT_RAW,MAIN:JSON.parse(MAIN_RAW),DRAFT:JSON.parse(DRAFT_RAW),EXPECTED,RESUMED_EX_IDS,COMPLETED_UI,COMPLETED_FIXTURE,COMPLETED_REPS,COMPLETED_VOLUME,COMPLETED_LEGACY};
