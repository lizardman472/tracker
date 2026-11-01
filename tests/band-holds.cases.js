// Reuses the recovery suite's exact-source VM. Expectations never call band helpers.
module.exports=function({R,context,test,json}){
 const assert=require('assert/strict'),F=require('./fixtures/band-holds'),RealDate=context.Date;
 context.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[F.now]))}static now(){return new RealDate(F.now).getTime()}};
 const state=options=>Object.assign(json(R.freshState()),F.fixture(options));
 function check(d,{core='stay',final='stay',expected=F.actual,id='pullup_a',day='A'}={}){
  R.setD(d);const before=json(R.getD().sessions),ex=R.dayExs(day).find(e=>e.id===id);
  const c=R.getSmartSuggCore(ex),s=R.getSmartSugg(ex);assert.equal(c.type,core);assert.equal(s.type,final);
  if(c.bands&&core==='stay')assert.deepEqual(json(c.bands),expected);
  if(s.bands)assert.deepEqual(json(s.bands),expected);
  R.ensureLog(ex);const l=R.getLOG()[id],resolved=l.bands.map(b=>b||l.band);
  assert.deepEqual(json(resolved),expected);assert.deepEqual(json(R.getD().sessions),before);return {ex,c,s,l};
 }
 try{
  for(const resume of [false,true]){
   test('mixed discomfort veto reaches core/final/LOG '+(resume?'fresh tagged':'ordinary'),()=>check(state({resume})));
   for(const count of [0,1])test('mixed bridge keeps earned single-set advance with '+count+' moderate dates '+resume,()=>{
    const d=state({resume});d.discomfort=d.discomfort.slice(0,count);check(d,{core:'up',final:'up',expected:F.advance});
   });
   test('same-date joint flags count once '+resume,()=>{
    const d=state({resume});d.discomfort[1]={...d.discomfort[0],joint:'Elbow'};check(d,{core:'up',final:'up',expected:F.advance});
   });
   test('upper family flags hold but lower family and expired dates do not '+resume,()=>{
    const d=state({resume});d.discomfort.forEach(r=>r.exId='floor_press');check(d);
    d.discomfort.forEach(r=>{r.exId='hex_dl';r.joint='Knee'});check(d,{core:'up',final:'up',expected:F.advance});
    d.discomfort.forEach((r,i)=>{r.exId='pullup_a';r.joint='Shoulder';r.date=i?'2026-09-30':'2026-09-29'});check(d,{core:'up',final:'up',expected:F.advance});
   });
   for(const reason of ['effort','rep drop'])test('final '+reason+' veto replaces harder bridge '+resume,()=>{
    const d=state({resume,discomfort:false,effort:reason==='effort'?5:3});
    if(reason==='rep drop')d.sessions[0].ex[0].reps=[10,10,10,10];
    const {s}=check(d,{core:'up',expected:resume?['Green','Green','Green','Green']:F.actual});
    assert.match(s.text,/recovery hold/);assert.match(s.detail,/No harder bridge|no harder bridge/);assert(!s.detail.includes('Move one more'));
   });
   test('failed targets repeat actual bridge without extra credit '+resume,()=>{
    const d=state({resume,discomfort:false});d.sessions[1].ex[0].reps=[7,7,7,7];check(d);
   });
   test('missing form keeps existing mixed-session opt-in semantics '+resume,()=>{
    const d=state({resume,discomfort:false});d.sessions.forEach(s=>delete s.ex[0].form);check(d,{core:'up',final:'up',expected:F.advance});
   });
  }
  for(const discomfort of [false,true])test('raw skipped/extra slots resolve before conservative hold padding '+discomfort,()=>{
   const d=state({discomfort,effort:5}),e=d.sessions[1].ex[0];
   e.band='None';e.reps=[8,0,8,8,8,8];e.bands=['Purple+Red','None','Green','Green','Green','Green'];e.form=[5,0,5,5,5,5];
   // The unused None at raw index1 and unused harder default must never enter a hold.
   check(d,{core:discomfort?'stay':'up'});
  });
  for(const discomfort of [false,true])test('non-opening actual hard set retains order under hold '+discomfort,()=>{
   const d=state({discomfort,effort:5});d.sessions[1].ex[0].bands=['Green','Purple+Red','Green','Green'];
   check(d,{core:discomfort?'stay':'up',expected:['Green','Purple+Red','Green','Green']});
  });
  test('leading skipped harder override never becomes a counted prescription',()=>{
   const d=state();d.sessions[1].ex[0].reps=[0,8,8,8,8];d.sessions[1].ex[0].bands=['Red',...F.actual];d.sessions[1].ex[0].form=[0,5,5,5,5];check(d);
  });
  for(const resume of [false,true])for(const first of ['','Legacy band'])test('counted '+(first?'unknown':'blank')+' label cannot shift the known second-slot band '+resume,()=>{
   const d=state({resume}),e=d.sessions[1].ex[0];e.band=first;e.bands=['','Purple+Red','Green','Green'];
   // Supported legacy scalars can be unknown; validation rejects unknown overrides.
   const {s}=check(d,{expected:[first||'Green','Purple+Red','Green','Green']});
   if(first)assert.match(s.text,/manually/);
  });
  for(const resume of [false,true])for(const discomfort of [false,true])test('recognized Blue alias stays canonical and conservative in a hold '+resume+' '+discomfort,()=>{
   const d=state({resume,discomfort,effort:5});d.sessions.forEach(s=>{s.ex[0].band='Blue';s.ex[0].bands=['','','Green','Green']});
   const expected=resume&&!discomfort?['Blue (heaviest)','Blue (heaviest)','Blue (heaviest)','Blue (heaviest)']:['Blue (heaviest)','Blue (heaviest)','Green','Green'];
   // Tagged core sees the historical scalar projection; ordinary core sees the mix.
   check(d,{core:discomfort?'stay':'up',expected});
  });
  for(const resume of [false,true])for(const discomfort of [false,true])test('all-unknown counted bands stay held for manual review '+resume+' '+discomfort,()=>{
   const d=state({resume,discomfort,effort:5});d.sessions.forEach(s=>{s.ex[0].band='Legacy band';delete s.ex[0].bands});
   R.setD(d);const before=json(R.getD().sessions),ex=R.dayExs('A').find(e=>e.id==='pullup_a'),s=R.getSmartSugg(ex);
   assert.equal(s.type,'stay');assert.match(s.text,/manually/);assert.match(s.detail,/could not be identified/);assert.equal(s.band,'Legacy band');assert.deepEqual(json(s.bands),['Legacy band','Legacy band','Legacy band','Legacy band']);
   R.ensureLog(ex);const l=R.getLOG().pullup_a;assert(!l.bands.includes('None'));assert(!l.bands.some(b=>b&&b!=='Legacy band'));assert.deepEqual(json(R.getD().sessions),before);
  });
  test('fewer counted sets pad with easiest actual band, not unused default',()=>{
   const d=state({discomfort:false,effort:5}),e=d.sessions[1].ex[0];e.band='None';e.reps=[8,0,8,8];e.bands=['Purple+Red','None','Green','Green'];
   // Current core cannot earn an increase with only three counted sets.
   check(d,{expected:F.actual});
  });
  for(const resume of [false,true])test('eligible partner pressing veto preserves actual dip setup '+resume,()=>{
   const d=state({resume,discomfort:false,id:'dips',day:'B'});d.sessions.push({id:'partner-press',date:'2026-11-01',day:'A',loc:'partner',phase:1,
    ex:[{id:'db_floor_press',wt:10,reps:[8,8,8],form:[5,5,5]}]});
   check(d,{id:'dips',day:'B',core:'up',expected:resume?['Green','Green','Green','Green']:F.actual});
  });
  test('resistance-band discomfort hold keeps actual counted order',()=>{
   const d=state({id:'rear_delt',day:'B'});d.sessions.forEach(s=>{s.ex[0].band='Blue (heaviest)';s.ex[0].bands=['Red','Purple','Purple','Purple'];s.ex[0].reps=[20,20,20,20]});
   check(d,{id:'rear_delt',day:'B',expected:['Red','Purple','Purple','Purple']});
  });
  test('resistance-band effort veto restores actual mixed inputs',()=>{
   const d=state({id:'rear_delt',day:'B',discomfort:false,effort:5});d.sessions.forEach(s=>{s.ex[0].band='Red';s.ex[0].bands=['Purple','Red','Red','Red'];s.ex[0].reps=[20,20,20,20]});
   check(d,{id:'rear_delt',day:'B',core:'up',expected:['Purple','Red','Red','Red']});
  });
  test('resistance blank counted slot uses the easiest actual resistance without moving Purple',()=>{
   const d=state({id:'rear_delt',day:'B'});d.sessions.forEach(s=>{s.ex[0].band='';s.ex[0].bands=['','Purple','Red','Red'];s.ex[0].reps=[20,20,20,20]});
   check(d,{id:'rear_delt',day:'B',expected:['Red','Purple','Red','Red']});
  });
  test('unrated uniform assistance still requires explicit form to unlock a bridge',()=>{
   const d=state({discomfort:false});d.sessions.forEach(s=>{delete s.ex[0].bands;delete s.ex[0].form});
   check(d,{expected:['Green','Green','Green','Green']});
  });
  test('failed form repeats the mixed pattern without advancement',()=>{
   const d=state({discomfort:false});d.sessions[1].ex[0].form=[3,5,5,5];check(d);
  });
  test('unrelated partner lower-body work cannot veto an earned dip bridge',()=>{
   const d=state({discomfort:false,id:'dips',day:'B'});d.sessions.push({id:'partner-lower',date:'2026-11-01',day:'A',loc:'partner',phase:1,ex:[{id:'db_bss',wt:10,reps:[16,16,16]}]});
   check(d,{id:'dips',day:'B',core:'up',final:'up',expected:F.advance});
  });
 }finally{context.Date=RealDate}
};
