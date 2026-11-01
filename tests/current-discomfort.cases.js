// Exact recovery-suite source and literal MATH-05 expectations; no extra runtime.
module.exports=function({R,context,test,json}){
 const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),F=require('./fixtures/current-discomfort');
 const RealDate=context.Date,evidence=[];let time=F.now;
 context.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[time]))}static now(){return new RealDate(time).getTime()}};
 const state=kind=>Object.assign(json(R.freshState()),F.fixture(kind));
 const recent=(id='hex_dl',n=3)=>json(context.getDiscomfortRecent(id,n));
 function weighted(rows){const d=state('weighted');d.discomfort=rows;R.setD(d);const ex=R.dayExs('A').find(e=>e.id==='hex_dl'),suggestion=R.getSmartSugg(ex);R.ensureLog(ex);return{suggestion,log:json(R.getLOG().hex_dl)}}
 function band(kind='assistance',rows=F.futureModerate){const d=state(kind),id=kind==='resistance'?'rear_delt':'pullup_a';d.discomfort=rows.map(r=>({...r,exId:id}));R.setD(d);const ex=R.dayExs(d.nextDay).find(e=>e.id===id),core=R.getSmartSuggCore(ex),final=R.getSmartSugg(ex);R.ensureLog(ex);const l=R.getLOG()[id];return{core,final,effective:json(l.bands.map(b=>b||l.band))}}
 try{
  test('MATH05 future none cannot displace the literal current moderate date',()=>{
   const result=weighted([F.current,...F.futureNone]);assert.deepEqual(recent(),[F.current]);assert.equal(result.suggestion.wt,40);assert.equal(result.suggestion.type,'stay');assert.equal(Number(result.log.wt),40);evidence.push({case:'weighted displacement',selected:recent(),...result});
   assert.equal(weighted([F.current]).suggestion.wt,40);assert.equal(weighted(F.futureNone).suggestion.wt,40.5);assert.equal(weighted([]).suggestion.wt,40.5);
  });
  for(const kind of ['assistance','resistance'])test('MATH05 future-only flags cannot veto earned '+kind+' progression',()=>{
   const result=band(kind),expected=kind==='assistance'?F.assistance:F.resistance;assert.deepEqual(recent(kind==='assistance'?'pullup_a':'rear_delt'),[]);assert.equal(result.core.type,'up');assert.equal(result.final.type,'up');assert.deepEqual(result.effective,expected);assert(!/moderate discomfort/.test(result.core.regress||''));evidence.push({case:kind,...result});
   assert.deepEqual(band(kind,[]).effective,expected);
  });
  test('MATH05 preserves the inclusive31-date lower boundary and today',()=>{
   const d=state();d.discomfort=['2026-10-01','2026-10-02','2026-11-01','2026-11-02'].map(date=>({...F.current,date}));R.setD(d);assert.deepEqual(recent().map(r=>r.date),['2026-10-02','2026-11-01']);assert.deepEqual(recent('hex_dl',1).map(r=>r.date),['2026-11-01']);
  });
  test('MATH05 retains worst severity once per date and exact or related family scope',()=>{
   const d=state('assistance');d.discomfort=[
    {date:'2026-10-29',exId:'floor_press',joint:'Shoulder',level:'mild'},
    {date:'2026-10-29',exId:'floor_press',joint:'Elbow',level:'moderate'},
    {date:'2026-10-30',exId:'hex_dl',joint:'Knee',level:'moderate'},
    {date:'2026-10-31',exId:'pullup_a',joint:'Knee',level:'none'},
    {date:'2026-11-02',exId:'floor_press',joint:'Shoulder',level:'moderate'}];R.setD(d);
   assert.deepEqual(recent('pullup_a').map(r=>[r.date,r.level]),[['2026-10-29','moderate'],['2026-10-31','none']]);assert.deepEqual(recent('hex_dl').map(r=>r.date),['2026-10-30']);
  });
  test('MATH05 future exclusion is a local-calendar midnight boundary',()=>{
   const d=state();d.discomfort=[{...F.current,date:'2026-11-02'}];R.setD(d);time='2026-11-01T23:59:59';assert.deepEqual(recent(),[]);time='2026-11-02T00:00:00';assert.deepEqual(recent(),d.discomfort);time=F.now;
  });
  test('MATH05 exact-joint trend ignores future positives and retains displaced current positives',()=>{
   const d=state('assistance');R.setD(d);assert.deepEqual(json(context.getDiscomfortTrend('pullup_a','Shoulder')),{count:0,recent3:0});
   d.discomfort=[...F.trendCurrent,...F.futureNone.map(r=>({...r,exId:'pullup_a',joint:'Shoulder'}))];R.setD(d);assert.deepEqual(json(context.getDiscomfortTrend('pullup_a','Shoulder')),{count:2,recent3:2});assert.deepEqual(json(context.getDiscomfortTrend('pullup_a','Elbow')),{count:0,recent3:0});evidence.push({case:'exact-joint trend',rows:json(R.getD().discomfort),trend:json(context.getDiscomfortTrend('pullup_a','Shoulder'))});
   const original=context.getDiscomfortTrend,body=original.toString();assert(body.includes('&&d.date<=asOf'));
   try{vm.runInContext('getDiscomfortTrend='+body.replace('&&d.date<=asOf',''),context);assert.throws(()=>assert.deepEqual(json(context.getDiscomfortTrend('pullup_a','Shoulder')),{count:2,recent3:2}),assert.AssertionError)}finally{context.getDiscomfortTrend=original}
  });
  test('MATH05 trend keeps insertion order, five/three counts and no lower cutoff',()=>{
   const d=state();d.discomfort=['2026-10-31','2000-01-02','2000-01-03','2000-01-04','2000-01-05','2000-01-01'].map((date,i)=>({date,exId:'hex_dl',joint:'Knee',level:i===5?'mild':'none'}));R.setD(d);assert.deepEqual(json(context.getDiscomfortTrend('hex_dl','Knee')),{count:5,recent3:1});
  });
  test('MATH05 manual and staged decision warnings ignore future-only reports',()=>{
   const d=state('assistance');d.discomfort=F.futureModerate.map(r=>({...r,exId:'lm_pallof',joint:'Lower Back'}));R.setD(d);const manual=vm.runInContext("getSmartSuggCore(ALL_EX.find(e=>e.id==='lm_pallof'))",context);assert.equal(manual.regress,'');
   d.trainingPlan={stage:'original1',start:'2026-10-01',stageStart:'2026-10-20',phase:1,loads:{hex_dl:80},bands:{},returnLoads:{hex_dl:72}};d.discomfort=F.futureNone.map(r=>({...r,level:'moderate'}));R.setD(d);const staged=R.getSmartSugg(R.dayExs('A').find(e=>e.id==='hex_dl'));assert.equal(staged.regress,'');
  });
  test('MATH05 save and fresh supported import/export retain every dated row',()=>{
   const d=state();d.discomfort=[F.current,...F.futureNone];R.setD(d);const before=json(R.getD().discomfort);assert.equal(context.save(),true);assert.deepEqual(json(R.getD().discomfort),before);const exported=json(R.recoveryExportData());assert.deepEqual(exported.discomfort,before);R.setD(R.mergeImport(R.freshState(),exported).W);assert.deepEqual(json(R.getD().discomfort),before);assert.deepEqual(recent(),[F.current]);evidence.push({case:'stored/imported/exported rows',rows:before});
  });
  test('MATH05 removing the upper bound is rejected by both literal decision oracles',()=>{
   const original=context.getDiscomfortRecent,body=original.toString();assert(body.includes('||r.date>asOf'));
   try{vm.runInContext('getDiscomfortRecent='+body.replace('||r.date>asOf',''),context);
    assert.throws(()=>{weighted([F.current,...F.futureNone]);assert.deepEqual(recent(),[F.current])},assert.AssertionError);
    assert.throws(()=>assert.equal(weighted([F.current,...F.futureNone]).suggestion.wt,40),assert.AssertionError);
    assert.throws(()=>assert.deepEqual(band().effective,F.assistance),assert.AssertionError);evidence.push({case:'old upper-bound omission',literalOraclesRejected:true});
   }finally{context.getDiscomfortRecent=original}
  });
 }finally{context.Date=RealDate}
 const dir=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'current-discomfort-unit-evidence.json'),JSON.stringify(evidence,null,2));
};
