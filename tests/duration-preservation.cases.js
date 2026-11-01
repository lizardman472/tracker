module.exports=function({harness,test,plain,SK,AW,code}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),F=require('./fixtures/duration-preservation'),evidence=[];
 const NativeDate=Date;class FixedDate extends NativeDate{constructor(...a){super(...(a.length?a:[F.now]))}static now(){return new NativeDate(F.now).getTime()}}
 const open=(state=F.state(),options={})=>harness(state,{Date:FixedDate,...options});
 test('R7 literal reported8 survives load/save/reload with home and310 volume',()=>{
  const input=F.state(),h=open(input),raw=h.values.get(SK);assert.deepEqual(plain(h.api.getD().sessions),[F.expected()]);assert.equal(h.values.get(SK),raw);
  for(let i=0;i<2;i++){assert(h.ctx.save());h.ctx.load();assert.deepEqual(plain(h.api.getD().sessions),[F.expected()]);assert.equal(h.api.getD().cues.hex_dl,input.cues.hex_dl)}
  evidence.push({case:'literal load/save/reload',input,actual:plain(h.api.getD())});
 });
 for(const [label,value,expected]of [['zero',0,0],['eight',8,8],['nine',9,9],['ten',10,10],['numeric string','8',8],['space',' ',0],['null',null,null],['missing',undefined,null]])
  for(const count of [2,3])test('R7 duration boundary '+label+' with '+count+' exercises',()=>{
   const input=F.state();input.sessions[0].ex=input.sessions[0].ex.slice(0,count);if(value===undefined)delete input.sessions[0].duration;else input.sessions[0].duration=value;
   const h=open(input);assert.equal(h.api.getD().sessions[0].duration,expected);assert.equal(h.api.getD().sessions[0].volume,count===2?255:310);
   assert.equal(h.ctx.captureStoredBackup().state.sessions[0].duration,expected);assert.equal(h.ctx.mergeImport(h.ctx.freshState(),input).W.sessions[0].duration,expected);
  });
 for(const [label,value]of [['negative',-1],['empty',''],['nonnumeric','eight'],['true',true],['false',false],['object',{}],['array',[]]])test('R7 invalid duration keeps existing repair/raw policy '+label,()=>{
  const input=F.state();input.sessions[0].duration=value;const h=open(input);assert.equal(h.api.getD().sessions[0].duration,null);assert(h.api.getIssues().repaired>0);assert.equal(h.values.get(SK+'-corrupt'),JSON.stringify(input));
  assert.equal(h.ctx.validSession(input.sessions[0]).duration,null);assert.equal(h.ctx.mergeImport(h.ctx.freshState(),input).W.sessions[0].duration,null);
 });
 for(const flag of [true,false,undefined])test('R7 existing durationSuspicious flag is preserved without invention '+flag,()=>{
  const input=F.state();if(flag!==undefined)input.sessions[0].durationSuspicious=flag;const h=open(input),row=h.api.getD().sessions[0];assert.equal(row.duration,8);assert.equal(row.durationSuspicious,flag);assert.equal(Object.hasOwn(row,'durationSuspicious'),flag!==undefined);
 });
 test('R7 finite validator keeps nonfinite and negative policy without reconstructing null',()=>{
  const h=open();for(const value of [NaN,Infinity,-Infinity])assert.equal(h.ctx.validSession({...F.row(),duration:value}).duration,null);
  const input=F.state();input.sessions[0].duration=null;assert.equal(open(input).api.getD().sessions[0].duration,null);
 });
 test('R7 legacy key load retains8 and explicit save performs existing key cleanup',()=>{
  const input=F.state(),raw=JSON.stringify(input),h=open(input,{values:[["rft-v11",raw]]});assert.equal(h.api.getD().sessions[0].duration,8);assert.equal(h.values.get('rft-v11'),raw);assert.equal(h.values.has(SK),false);
  assert(h.ctx.save());assert.equal(h.values.has('rft-v11'),false);h.ctx.load();assert.deepEqual(plain(h.api.getD().sessions),[F.expected()]);
 });
 test('R7 fresh/populated/repeated imports retain full row and unrelated history',()=>{
  const h=open(),incoming=F.state(),other=F.expected();Object.assign(other,{id:'unrelated',date:'2026-09-01',duration:45});let current=h.ctx.freshState();current.sessions=[other];
  for(let i=0;i<2;i++){const merged=h.ctx.mergeImport(current,incoming);assert.equal(merged.added,i===0?1:0);assert.equal(merged.replaced,i===0?0:1);current=merged.W;assert.deepEqual(plain(current.sessions.find(s=>s.id==='data05-eight')),F.expected());assert.deepEqual(plain(current.sessions.find(s=>s.id==='unrelated')),other)}
  assert.deepEqual(plain(h.ctx.mergeImport(h.ctx.freshState(),incoming).W.sessions),[F.expected()]);evidence.push({case:'repeated populated import',actual:plain(current.sessions)});
 });
 test('R7 location inference and volume repair remain independent of reported duration',()=>{
  for(const loc of ['home','partner',undefined])for(const volume of [0,null,undefined]){const input=F.state();if(loc)input.sessions[0].loc=loc;if(volume===undefined)delete input.sessions[0].volume;else input.sessions[0].volume=volume;const row=open(input).api.getD().sessions[0];assert.equal(row.duration,8);assert.equal(row.volume,310);assert.equal(row.loc,loc||'home')}
  const input=F.state();input.sessions[0].ex[1]={id:'db_ohp',wt:5,reps:[5],band:'',notes:''};const row=open(input).api.getD().sessions[0];assert.equal(row.loc,'partner');assert.equal(row.volume,305);assert.equal(row.duration,8);
 });
 test('R7 repeated migration remains idempotent and reader exports retain8 without writes',()=>{
  const h=open(F.state(),{reader:true}),before=[...h.values];for(let i=0;i<2;i++){h.ctx.load();assert.equal(h.api.getD().sessions[0].duration,8);const captured=h.ctx.captureStoredBackup().state;assert.deepEqual(plain(captured.sessions),[F.expected()]);assert.deepEqual(plain(h.ctx.migrateStoredState(captured).sessions),[F.expected()]);assert(h.ctx.expD());assert(h.ctx.exportSavedHistory())}
  for(const blob of h.downloads)assert.deepEqual(JSON.parse(blob.parts.join('')).sessions,[F.expected()]);assert.deepEqual([...h.values],before);assert.equal(h.ctx.canWriteStore(),false);assert.equal(h.values.has(AW),false);evidence.push({case:'reader files',files:h.downloads.length,actual:JSON.parse(h.downloads[0].parts.join('')).sessions,bytesUnchanged:true,writer:false});
 });
 test('R7 duration readers expose8 and keep zero display semantics',()=>{
  const h=open();assert.equal(h.ctx.weeklySeries(10).find(w=>w.sessions===1).dur,8);assert.equal(h.ctx.monthlyReport('2026-10').avgDur,8);assert.equal(h.ctx.consistency().avgDur,8);const el={innerHTML:''};h.ctx.rHist(el);assert(el.innerHTML.includes('8m'));
  const input=F.state();input.sessions[0].duration=0;const z=open(input);assert.equal(z.ctx.monthlyReport('2026-10').avgDur,null);assert.equal(z.ctx.consistency().avgDur,null);evidence.push({case:'duration readers',weekly:8,monthlyAverage:8,consistencyAverage:8,zeroAverage:null});
 });
 test('R7 literal oracle rejects restored short-duration erasure',()=>{
  const source=code.replace(/\r\n/g,'\n');
  const fault=source.replace('if(tv>0||s.volume!=null)s.volume=tv}\n}', 'if(tv>0||s.volume!=null)s.volume=tv}\n  if(s.duration!=null&&s.duration<10&&s.ex.length>=3)s.duration=null}\n');assert.notEqual(fault,source);
  const h=open(F.state(),{source:fault});assert.throws(()=>assert.equal(h.api.getD().sessions[0].duration,8),assert.AssertionError);assert.equal(h.api.getD().sessions[0].duration,null);evidence.push({case:'historical erasure fault',rejected:true});
 });
 const output=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'duration-preservation-unit-evidence.json'),JSON.stringify(evidence,null,2));
};
