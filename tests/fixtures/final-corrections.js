// Final closeout: invented dates/ratings and a deliberately preserved user cue.
const F=require('./current-session-evidence'),now=F.now,userCue='4×8 strict → less assistance. Superset with Landmine Lateral.';
const cardio=(id,date,duration)=>({id,date,duration,type:'Walking',intensity:'easy'});
function calendar(nextDay='B'){const d=F.state();d.nextDay=nextDay;d.sessions=[F.row('final-current','2026-10-31','A',3),F.row('final-future','2026-11-02','C',5)];d.cardioLog=[cardio('old','2026-10-25',11),cardio('first','2026-10-26',13),cardio('today','2026-11-01',17),cardio('future','2026-11-02',19)];d.cues.pullup_a=userCue;return d}
function effort(){const d=F.state();d.sessions=[F.row('prior','2026-10-01','A',3),F.row('effort2','2026-10-30','B',2),F.row('effort4','2026-10-31','A',4)];return d}
function cue(stage='progress'){const d=F.state();d.nextDay='A';d.sessions=[F.row('cue-history','2026-10-28','C',3)];d.cues.pullup_a=userCue;if(stage)d.trainingPlan={stage,start:'2026-10-01',stageStart:'2026-10-26',phase:2,loads:{hex_dl:50},bands:{pullup_a:'Green',pullup_c:'Green',rear_delt:'Purple'}};return d}
module.exports={now,userCue,calendar,effort,cue,cardio,row:F.row,state:F.state};
