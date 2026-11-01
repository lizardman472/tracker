// Reuse the storage harness; expectations are independent literals from the R11 contract.
module.exports=function({harness,test,plain,SK,AW,code}){
 const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),F=require('./fixtures/current-session-evidence'),evidence=[],NativeDate=Date;
 const dateAt=clock=>class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return new NativeDate(clock).getTime()}};
 const open=(d=F.state(),options={})=>harness(d,{Date:dateAt(F.now),...options}),run=(h,s)=>vm.runInContext(s,h.ctx);
 const decision=(d,source=code,stalls=0)=>{const h=open(d,{source});return plain(h.ctx.getDeload(stalls))};
 const start=(d,source=code)=>{const h=open(d,{source});h.ctx.beginW(h.api.getD().nextDay,true);return{h,day:run(h,'ADAY'),alerts:h.alerts}};
 const record=(name,actual)=>evidence.push({case:name,actual});
 test('R11 populated/fresh/repeated imports preserve explicit authority and future rows',()=>{
  const input=F.rotation(),h=open(input),before=plain(h.api.getD().sessions),merge=d=>h.ctx.mergeImport(d,F.state()).W;
  let d=merge(h.api.getD());assert.equal(d.nextDay,'B');assert.deepEqual(plain(d.sessions),before);d=merge(d);assert.equal(d.nextDay,'B');
  const manual=F.rotation();manual.nextDay='C';assert.equal(h.ctx.mergeImport(h.ctx.freshState(),manual).W.nextDay,'C');manual.sessions.pop();assert.equal(merge(manual).nextDay,'B');
  d.sessions.splice(1,0,F.row('r11-current-B','2026-10-30','B'));assert.equal(merge(d).nextDay,'C');
  const future=F.state();future.sessions=[F.row('future-only','2026-11-02','C')];future.nextDay='C';assert.equal(merge(future).nextDay,'C');
  record('import current A plus future C',{nextDay:'B',sessions:before,freshManualDay:'C',populatedManualDay:'B'});
 });
 test('R11 helper preserves dates, source ties, CoreX and shared venues without mutation',()=>{
  const h=open(),rows=[F.row('A','2026-10-28'),F.row('B','2026-11-01','B',3,{loc:'partner'}),F.row('X','2026-11-01','X'),F.row('C','2026-11-02','C')];h.ctx.rows=rows;const raw=JSON.stringify(rows);
  assert.equal(run(h,'lastRotSession(rows).id'),'B');assert.equal(run(h,"lastRotSession(rows,'2026-11-02').id"),'C');assert.equal(JSON.stringify(rows),raw);
  h.ctx.rows=[F.row('late-source','2026-10-01','C'),F.row('first-same','2026-10-28','A'),F.row('second-same','2026-10-28','B')];assert.equal(run(h,'lastRotSession(rows).id'),'second-same');
  h.ctx.rows=[F.row('X','2026-10-28','X')];assert.equal(run(h,'lastRotSession(rows)'),null);
 });
 test('R11 actual deletion and past-entry callers use current history and keep fallbacks',()=>{
  const d=F.rotation();d.sessions.push(F.row('remove-me','2026-10-30','B'));let h=open(d);h.ctx.delS('remove-me');h.ctx.delS('remove-me');assert.equal(h.api.getD().nextDay,'B');assert(h.api.getD().sessions.some(s=>s.id==='r11-future'));
  h=open(F.rotation());h.ctx.delS('r11-current');h.ctx.delS('r11-current');assert.equal(h.api.getD().nextDay,'A');
  h=open(F.rotation());h.api.setLP({date:'2026-10-30',day:'B',loc:'partner'});h.elements.set('lp_db_rdl_r0',{value:'5'});h.elements.set('lp_db_rdl_wt',{value:'12'});h.ctx.savePast();assert.equal(h.api.getD().nextDay,'C');assert.equal(h.api.getD().sessions.length,3);assert.equal(h.api.getD().sessions.find(s=>s.id==='r11-future').date,'2026-11-02');
 });
 for(const stage of ['deload','return'])for(const n of [0,1,2,3])test('R11 '+stage+' current-row allowance '+n+' ignores three future rows',()=>{
  const d=F.quota(stage,n),before=JSON.stringify(d.sessions),s=start(d);assert.equal(s.day,n===3?null:'B',JSON.stringify(s.alerts));assert.equal(JSON.stringify(d.sessions),before);if(n===3)assert.match(s.alerts[0],/three easy sessions/);record(stage+' quota '+n,{day:s.day,alerts:s.alerts});
 });
 test('R11 quota retains duplicate rows, partial/noProg/phase and Home defaults',()=>{
  for(const stage of ['deload','return']){const d=F.quota(stage,3,false);for(const s of d.sessions){s.date='2026-10-28';s.phase=1;s.ex=[];delete s.loc}assert.equal(start(d).day,null);}
  const d=F.quota('deload',0,false);d.sessions=[F.row('wrong-cycle','2026-10-28','A',3,{trainingPlanStart:'2026-10-19',trainingStage:'deload'}),F.row('wrong-stage','2026-10-28','A',3,{trainingPlanStart:'2026-10-26',trainingStage:'return'}),F.row('partner','2026-10-28','A',3,{loc:'partner',trainingPlanStart:'2026-10-26',trainingStage:'deload'})];assert.equal(start(d).day,'B');
  d.sessions.push(F.row('rest','2026-10-31','A',3,{trainingPlanStart:'wrong-cycle'}));const s=start(d);assert.equal(s.day,null);assert.match(s.alerts[0],/rest day/);
 });
 test('R11 Start retains reader, pending, scheduled and due guards',()=>{
  for(const setup of [h=>h.api.owner(false),h=>run(h,'PENDING_SAVE={sessions:[]}'),h=>run(h,'PENDING_ACTIVE={id:"pending"}'),h=>run(h,'IMPORT_BUSY=true')]){const h=open(F.quota());setup(h);const raw=h.values.get(SK);h.ctx.beginW('B');assert.equal(run(h,'ADAY'),null);assert.equal(h.values.get(SK),raw);assert(!h.values.has(AW))}
  for(const date of ['2026-11-02','2026-10-25']){const d=F.quota();d.trainingPlan.start=date;d.trainingPlan.stageStart=date;const s=start(d);assert.equal(s.day,null);assert.match(s.alerts[0],date==='2026-11-02'?/starts/:/Review/)}
 });
 for(const [label,d,mean,n,due]of [
  ['recent low',F.effort(3,5),3,1,false],['recent high',F.effort(5,1),5,1,true],
  ['stale low',F.effort(3,5,'2026-10-10'),3,1,false],['stale high',F.effort(5,1,'2026-10-10'),5,1,true]
 ])test('R11 original effort '+label+' ignores future ratings',()=>{const actual=decision(d);assert.equal(actual.avgDiff,mean);assert.equal(actual.ratedN,n);assert.equal(actual.due,due);assert.equal(actual.consider,!due);const noFuture=plain(d);noFuture.sessions.pop();assert.deepEqual(actual,decision(noFuture));record(label,actual)});
 test('R11 original missing, cutoff duplicates, stale last-five order and unrounded mean',()=>{
  let d=F.effort();d.sessions.shift();let x=decision(d);assert.equal(x.ratedN,0);assert.equal(x.avgDiff,0);assert.equal(x.due,false);
  d.sessions=[F.row('before','2026-10-17','A',5),F.row('cut1','2026-10-18','B',2),F.row('cut2','2026-10-18','C',4),F.row('today','2026-11-01','A',null)];x=decision(d);assert.equal(x.ratedN,2);assert.equal(x.avgDiff,3);
  d.sessions=[5,1,2,3,4,5].map((v,i)=>F.row('old'+i,'2026-10-'+(10+i),'A',v));d.sessions.push(F.row('future','2026-11-02','C',5));x=decision(d);assert.equal(x.ratedN,5);assert.equal(x.avgDiff,3);
  d.sessions=Array.from({length:20},(_,i)=>F.row('mean'+i,'2026-10-31','A',i===0?3:4));x=decision(d);assert.equal(x.avgDiff,4);assert.equal(x.due,false);d.sessions[0].difficulty=4;assert.equal(decision(d).due,true);
  record('cutoff and fallback',{cutoffMean:3,cutoffRatedN:2,lastFiveMean:3,lastFiveRatedN:5,rounded4BelowThresholdDue:false});
 });
 function counts(before,after,anchor){const d=F.state();d.lastDeload=anchor;d.sessions=[...Array.from({length:before},(_,i)=>F.row('before'+i,'2026-08-01','A',null)),...Array.from({length:after},(_,i)=>F.row('after'+i,'2026-10-31','A',i===0?5:null))];return d}
 for(const [label,before,after,anchor,beginner,sc,due]of [['29',28,1,'2026-09-16',true,1,false],['30',28,2,'2026-09-16',false,2,true],['17',13,17,'2026-10-25',false,17,false],['18',13,18,'2026-10-25',false,18,true],['23',0,23,'2026-10-25',true,23,false],['24',0,24,'2026-10-25',true,24,true]])test('R11 original literal dated count '+label,()=>{
  const d=counts(before,after,anchor),base=decision(d);assert.equal(base.isBeginner,beginner);assert.equal(base.sc,sc);assert.equal(base.due,due);for(const position of [0,Math.floor(d.sessions.length/2),d.sessions.length]){const plus=plain(d);plus.sessions.splice(position,0,F.row('future','2026-11-02','C',1));assert.deepEqual(decision(plus),base)}record('dated count '+label,base);
 });
 test('R11 original first remaining source row, strict anchor and legacy eligibility',()=>{
  let d=F.state();d.sessions=[F.row('future','2026-11-02','C',5)];assert.equal(decision(d),null);d.sessions.push(F.row('past','2026-08-23','A',5));let h=open(d);h.api.setD(d);assert.equal(h.ctx.getDeload().wk,11);assert.equal(h.ctx.getDeload().sc,1);assert.equal(h.ctx.getDeload().due,true);
  d.sessions=[F.row('first','2026-10-31','A',5),F.row('earlier','2026-08-23','B',5)];h=open();h.api.setD(d);assert.equal(h.ctx.getDeload().wk,1);
  d.lastDeload='2026-10-25';d.sessions=[F.row('anchor','2026-10-25','A',5),...Array.from({length:23},(_,i)=>F.row('legacy'+i,'2026-10-28','X',5,{loc:'partner',phase:1,noProg:true,trainingComplete:false,ex:[]}))];const x=decision(d);assert.equal(x.sc,23);assert.equal(x.isBeginner,true);assert.equal(x.due,false);
 });
 test('R11 original timers, supplied stalls, live ramp and shorter dispatch preserved',()=>{
  for(const [anchor,wk,due]of [['2026-09-13',8,false],['2026-09-06',9,true]]){const d=F.effort(5,1);d.lastDeload=anchor;const x=decision(d);assert.equal(x.wk,wk);assert.equal(x.due,due)}
  for(const [anchor,wk,due]of [['2026-09-20',7,true],['2026-09-27',6,false]]){const d=counts(29,1,anchor);const x=decision(d);assert.equal(x.wk,wk);assert.equal(x.due,due)}
  const d=F.effort(3,5);assert.equal(decision(d,code,1).due,false);assert.equal(decision(d,code,2).due,true);d.comeback={start:'2026-11-01',end:'2026-11-05',gap:21};const x=decision(d,code,2);assert.equal(x.due,false);assert.equal(x.consider,false);assert.equal(x.suppressed,'comeback');assert.equal(decision(F.quota()),null);
 });
 test('R11 selection never changes stored/exported future data; failed import retry keeps it',()=>{
  const input=F.rotation(),h=open(input),before=plain(h.api.getD().sessions),raw=h.values.get(SK);h.ctx.getDeload();run(h,'lastRotSession(D.sessions)');assert.equal(h.values.get(SK),raw);assert.deepEqual(plain(h.api.getD().sessions),before);const data=plain(h.ctx.completeBackupData());assert.deepEqual(data.sessions,before);const back=h.ctx.mergeImport(h.ctx.freshState(),data).W;assert.deepEqual(plain(back.sessions),before);assert.equal(back.nextDay,'B');
  h.fail(true);h.ctx.impD({target:{files:[{content:JSON.stringify({sessions:[F.row('added','2026-10-30','B')]})}],value:'chosen'}});assert.equal(h.values.get(SK),raw);assert(h.api.getPending());h.fail(false);assert(h.ctx.retrySave());assert.equal(h.api.getD().nextDay,'C');assert.deepEqual(plain(h.api.getD().sessions.find(s=>s.id==='r11-future')),before[1]);
 });
 test('R11 local midnight and Auckland DST helper date bounds',()=>{
  const previous=process.env.TZ;try{process.env.TZ='Pacific/Auckland';for(const [clock,past,future]of [['2026-11-01T00:00:01','2026-11-01','2026-11-02'],['2026-09-27T00:30:00','2026-09-27','2026-09-28'],['2026-04-05T23:59:59','2026-04-05','2026-04-06']]){const h=open(F.state(),{Date:dateAt(clock)});h.ctx.rows=[F.row('today',past),F.row('tomorrow',future,'C')];assert.equal(run(h,'lastRotSession(rows).id'),'today');assert.equal(h.ctx.today(),past)}}finally{process.env.TZ=previous}
 });
 test('R11 original inclusive calendar cutoff uses the captured local decision day across DST',()=>{
  const previous=process.env.TZ;try{process.env.TZ='Pacific/Auckland';for(const [clock,cut,earlier,future]of [['2026-11-01T00:00:01','2026-10-18','2026-10-17','2026-11-02'],['2026-09-28T00:30:00','2026-09-14','2026-09-13','2026-09-29'],['2026-04-06T23:59:59','2026-03-23','2026-03-22','2026-04-07']]){const d=F.state();d.lastDeload='2026-01-01';d.sessions=[F.row('earlier',earlier,'A',5),F.row('cut',cut,'B',2),F.row('future',future,'C',5)];const h=open(d,{Date:dateAt(clock)}),x=h.ctx.getDeload();assert.equal(x.ratedN,1);assert.equal(x.avgDiff,2)}}finally{process.env.TZ=previous}
 });
 const source=code.replace(/\r\n/g,'\n'),mutate=(from,to)=>{assert(source.includes(from),'fault anchor '+from);return source.replace(from,to)};
 for(const [label,fault,oracle]of [
  ['old rotation',()=>mutate('ss[i].date<=asOf&&isRotDay','isRotDay'),s=>assert.equal(open(F.rotation(),{source:s}).ctx.mergeImport(F.rotation(),F.state()).W.nextDay,'B')],
  ['old quota',()=>mutate('s.date>=tp.stageStart&&s.date<=asOf&&','s.date>=tp.stageStart&&'),s=>assert.equal(start(F.quota(),s).day,'B')],
  ['future recent effort',()=>mutate('let rated=sessions.filter','let rated=D.sessions.filter'),s=>assert.equal(decision(F.effort(),s).avgDiff,3)],
  ['future stale fallback',()=>mutate('rated=sessions.filter(s=>s.difficulty)','rated=D.sessions.filter(s=>s.difficulty)'),s=>assert.equal(decision(F.effort(3,5,'2026-10-10'),s).avgDiff,3)],
  ['future lifetime count',()=>mutate('const isBeginner=sessions.length<30','const isBeginner=D.sessions.length<30'),s=>{const d=counts(28,1,'2026-09-16');d.sessions.push(F.row('future','2026-11-02'));assert.equal(decision(d,s).isBeginner,true)}],
  ['future after-anchor count',()=>mutate('const sc=anchor?sessions.filter(s=>s.date>anchor).length:sessions.length','const sc=anchor?D.sessions.filter(s=>s.date>anchor).length:D.sessions.length'),s=>{const d=counts(13,17,'2026-10-25');d.sessions.push(F.row('future','2026-11-02'));assert.equal(decision(d,s).sc,17)}],
  ['future first row',()=>mutate('const st=anchor||sessions[0]?.date','const st=anchor||D.sessions[0]?.date'),s=>{const d=F.state();d.sessions=[F.row('future','2026-11-02')];assert.equal(decision(d,s),null)}]
 ])test('R11 independent literal oracle rejects '+label,()=>{assert.throws(()=>oracle(fault()),assert.AssertionError);record('fault '+label,{rejected:true})});
 const output=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'current-session-unit-evidence.json'),JSON.stringify(evidence,null,2));
};
