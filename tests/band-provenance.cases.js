// R2-TRAIN-04: reachable duplicate entries and labelled selected-provenance faults.
module.exports=function({R,context,test,json}){
 const assert=require('assert/strict'),vm=require('vm'),F=require('./fixtures/band-holds'),RealDate=context.Date;
 context.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[F.now]))}static now(){return new RealDate(F.now).getTime()}};
 try{
  for(const discomfort of [true,false])for(const reference of [true,false])for(const shape of ['mixed','unknown'])for(const fault of ['duplicate-exercise','duplicate-session','missing-id','missing-session','missing-exercise'])test('manual band choice survives '+fault+' '+shape+' reference='+reference+' moderate='+discomfort,()=>{
   const d=Object.assign(json(R.freshState()),F.fixture({resume:true,discomfort,effort:5}));d.originalResume.bands=reference?{pullup_a:'Green'}:{};
   const e=d.sessions[1].ex[0];e.band='Legacy band';if(shape==='mixed')e.bands=['','Purple+Red','Green','Green'];else delete e.bands;
   if(fault==='duplicate-exercise')d.sessions[1].ex.push(json(e)); // Supported input survives validation.
   let projectedId;
   if(fault==='missing-id')projectedId=null;
   if(fault==='missing-session')projectedId='absent-selected-session';
   if(fault==='missing-exercise'){
    const other=json(d.sessions[1]);other.id='selected-without-exercise';other.ex=[{id:'hex_dl',wt:20,reps:[5,5,5],band:''}];d.sessions.push(other);projectedId=other.id;
   }
   R.setD(d);const data=R.getD();
   if(fault==='duplicate-exercise')assert.equal(data.sessions.find(s=>s.id==='band-hold-1').ex.length,2);
   if(fault==='duplicate-session')data.sessions.push(json(data.sessions.find(s=>s.id==='band-hold-1'))); // Post-validation corruption fault.
   const before=json(data.sessions),ex=R.dayExs('A').find(e=>e.id==='pullup_a'),original=vm.runInContext('originalProgressionHist',context);
   // A synchronous real selector cannot lose its own identity. Missing-reference
   // cases inject only that selected output metadata, not new eligibility rules.
   if(projectedId!==undefined){context.__bandOriginal=original;context.__bandFault=rows=>rows.map((r,i)=>i===rows.length-1?{...r,_sessionId:projectedId===null?undefined:projectedId}:r);
    vm.runInContext('originalProgressionHist=(ex,p)=>__bandFault(__bandOriginal(ex,p))',context)}
   try{
    const core=R.getSmartSuggCore(ex),sg=R.getSmartSugg(ex);
    if(discomfort){assert.equal(core.requiresBandChoice,true);assert.equal(core.type,'stay')}
    assert.equal(sg.requiresBandChoice,true);assert.equal(sg.type,'stay');assert.match(sg.text,/manually/);
    assert.equal(sg.band,'');assert.deepEqual(json(sg.bands),['','','','']);
    R.ensureLog(ex);const l=R.getLOG().pullup_a;assert.equal(l.band,'');assert.deepEqual(json(l.bands),['','','','']);
    assert.deepEqual(json(l.bands.map(b=>b||l.band)),['','','','']);assert.equal(Object.hasOwn(l,'requiresBandChoice'),false);
    assert.deepEqual(json(data.sessions),before);
   }finally{if(projectedId!==undefined){vm.runInContext('originalProgressionHist=__bandOriginal',context);delete context.__bandOriginal;delete context.__bandFault}}
  });
  for(const discomfort of [true,false])test('real tagged selector excludes validated ineligible decoys before opaque lookup '+discomfort,()=>{
   const d=Object.assign(json(R.freshState()),F.fixture({resume:true,discomfort,effort:5}));d.sessions[1].ex[0].band='Legacy band';d.sessions[1].ex[0].bands=['','Purple+Red','Green','Green'];
   const decoys=['phase','venue','tag','date','ignored','retro','stage'];
   for(const kind of decoys){const s=json(d.sessions[1]);s.id='decoy-'+kind;s.ex[0].band='Decoy band';
    if(kind==='phase')s.phase=2;if(kind==='venue')s.loc='partner';if(kind==='tag')s.originalResumeId='original-other-context';
    if(kind==='date')s.date='2026-10-19';if(kind==='ignored')s.noProg=true;if(kind==='retro')s.retro=true;
    if(kind==='stage'){s.trainingStage='deload';s.trainingPlanStart='2026-10-01'}d.sessions.push(s)}
   R.setD(d);const before=json(R.getD().sessions),ex=R.dayExs('A').find(e=>e.id==='pullup_a');
   assert.equal(R.getD().sessions.find(s=>s.id==='decoy-stage').trainingStage,'deload');
   assert.deepEqual(json(R.originalProgressionHist(ex,R.getD().originalResume).map(r=>r._sessionId)),['band-hold-0','band-hold-1']);
   const sg=R.getSmartSugg(ex);assert.equal(sg.type,'stay');assert.equal(sg.band,'Legacy band');assert.match(sg.text,/manually/);assert(!sg.requiresBandChoice);
   R.ensureLog(ex);assert.deepEqual(json(R.getLOG().pullup_a.bands),['Legacy band','Purple+Red','Green','Green']);assert.deepEqual(json(R.getD().sessions),before);
  });
 }finally{context.Date=RealDate}
};
