// Independent exact-byte DATA03/07 cases; actual browser ownership/downloads are separate.
module.exports=function({harness,test,plain,SK,AW,code}){
 const assert=require('assert/strict'),vm=require('vm'),F=require('./fixtures/raw-recovery'),C=SK+'-corrupt';
 const fs=require('fs'),path=require('path'),evidence=[],output=path.join(__dirname,'..','test-results','recovery-layout','raw-recovery-unit-evidence.json');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 const originalHarness=harness,originalTest=test;let contexts=[];
 const snapshot=(h,point)=>({point,bytes:[...h.values],raw:h.api.getRaw(),rawError:h.api.getRawError(),rawNotice:h.api.getRawNotice(),pending:plain(h.api.getPending()),
  mainError:h.api.getError(),activeError:h.api.getAWError(),callbacks:h.callbackCount?h.callbackCount():null,faults:Object.fromEntries(Object.entries(h.faults).map(([k,v])=>[k,[...v]])),operations:plain(h.operations)});
 harness=(...args)=>{const h=originalHarness(...args);h.checkpoints=[snapshot(h,'after load')];h.snap=point=>h.checkpoints.push(snapshot(h,point));contexts.push(h);return h};
 test=(name,fn)=>originalTest(name,()=>{contexts=[];try{fn();evidence.push({name,passed:true,contexts:contexts.map(h=>({initialBytes:h.initialBytes,checkpoints:[...h.checkpoints,snapshot(h,'final')]}))})}
  catch(error){evidence.push({name,passed:false,error:{message:error.message,actual:error.actual,expected:error.expected},contexts:contexts.map(h=>({initialBytes:h.initialBytes,checkpoints:[...h.checkpoints,snapshot(h,'failed assertion')]}))});fs.writeFileSync(output,JSON.stringify(evidence,null,2));throw error}});
 const start=(extra={})=>harness(undefined,{values:[[SK,F.R],[AW,F.A0]],set:[C],...extra});
 const proposal=()=>plain(F.P),readMain=h=>h.values.get(SK)??null;
 function blocked(h,original=F.R){h.snap('blocked/preserved main');assert.equal(readMain(h),original);assert.equal(h.values.get(AW),F.A0);assert.equal(h.api.getPending().sessions.filter(s=>s.id==='recovery-save-1').length,1)}
 test('raw payload-only failure blocks main replacement, retains exact R/A0/P and stable callback',()=>{
  const h=start(),live=plain(h.api.getD());let calls=0;h.callbackCount=()=>calls;
  assert.equal(h.ctx.save(proposal(),{after:()=>calls++}),false);blocked(h);assert.deepEqual(plain(h.api.getD()),live);assert.equal(calls,0);assert.equal(h.api.getRaw(),F.R);
  assert.equal(h.operations.filter(o=>o.op==='set'&&o.key===SK).length,0);assert.match(h.api.getError(),/raw recovery/);
  h.faults.set.clear();assert(h.ctx.retrySave());assert.equal(h.values.get(C),F.R);assert.equal(calls,1);
  const saved=JSON.parse(readMain(h));assert.equal(saved.theme,'dark');assert.deepEqual(saved.sessions.map(s=>s.id),['raw-valid-1','recovery-save-1']);assert.deepEqual(saved.sessions[0].ex[0].wts,[null,80,35]);
  assert.equal(h.ctx.retrySave(),false);assert.equal(calls,1);h.ctx.load();assert.equal(h.api.getD().sessions.filter(s=>s.id==='recovery-save-1').length,1);
 });
 test('unreadable main and malformed legacy original are not replaced while parking fails',()=>{
  for(const legacy of [false,true]){
   const h=start({values:[...(legacy?[['rft-v11',F.L0]]:[[SK,F.L0]]),[AW,F.A0]]});let calls=0;
   assert.equal(h.ctx.save(proposal(),{after:()=>calls++}),false);assert.equal(readMain(h),legacy?null:F.L0);assert.equal(h.values.get(AW),F.A0);assert.equal(calls,0);
   if(legacy)assert.equal(h.values.get('rft-v11'),F.L0);
   h.faults.set.clear();assert(h.ctx.retrySave());assert.equal(h.values.get(C),F.L0);assert.equal(h.values.has('rft-v11'),false);assert.equal(calls,1);
  }
 });
 for(const suffix of ['-n','-repaired'])test('verified raw payload remains durable when optional count fails '+suffix,()=>{
  const h=start({set:[C+suffix]});assert.equal(h.values.get(C),F.R);assert.equal(h.api.getRaw(),null);assert.match(h.api.getRawNotice(),/raw original is preserved/);
  assert(h.ctx.save(proposal()));assert.equal(h.values.get(C),F.R);assert.equal(JSON.parse(readMain(h)).theme,'dark');
 });
 test('raw write without successful readback cannot permit main replacement',()=>{
  const h=start({set:[],afterSet:(key,faults)=>{if(key===C)faults.get.add(C)}});assert.equal(h.values.get(C),F.R);assert.equal(h.api.getRaw(),F.R);
  assert.equal(h.ctx.save(proposal()),false);blocked(h);h.faults.get.clear();assert(h.ctx.retrySave());assert.equal(h.values.get(C),F.R);
 });
 test('raw parking then failed main write retains R/P/A0 and runs callback only after retry',()=>{
  const h=start({set:[SK]});let calls=0;assert.equal(h.ctx.save(proposal(),{after:()=>calls++}),false);blocked(h);assert.equal(h.values.get(C),F.R);assert.equal(calls,0);
  h.faults.set.clear();assert(h.ctx.retrySave());assert.equal(calls,1);assert.equal(h.values.get(AW),F.A0);
 });
 test('different C0 survives load, blocked save and both scoped downloads byte-for-byte',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[]});assert.equal(h.values.get(C),F.C0);assert.equal(h.api.getRaw(),F.R);
  assert.equal(h.ctx.save(proposal()),false);blocked(h);assert.equal(h.values.get(C),F.C0);
  h.ctx.dlCorrupt('current');h.ctx.dlCorrupt('stored');assert.equal(h.downloads[0].parts.join(''),F.R);assert.equal(h.downloads[1].parts.join(''),F.C0);
  assert.equal(h.api.getRaw(),F.R);assert(h.api.getPending());assert.match(h.api.getRawError(),/different stored raw copy/);
  h.ctx.confirm=()=>true;assert(h.ctx.discardRecoveryCopy('stored'));assert.equal(h.values.has(C),false);assert.equal(h.api.getRaw(),F.R);blocked(h);
  assert(h.ctx.retrySave());assert.equal(h.values.get(C),F.R);
 });
 test('reader and cancelled writer cannot discard raw storage or resolve raw memory',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[C+'-n','7'],[C+'-repaired','2'],[AW,F.A0]],set:[],reader:true});const before=[...h.values];
  const storedResult=h.ctx.discardRecoveryCopy('stored'),currentResult=h.ctx.discardRecoveryCopy('current');assert.deepEqual([...h.values],before);assert.equal(h.api.getRaw(),F.R);assert.equal(storedResult,false);assert.equal(currentResult,false);
  h.api.owner(true);h.ctx.confirm=()=>false;assert.equal(h.ctx.discardRecoveryCopy('stored'),false);assert.equal(h.ctx.discardRecoveryCopy('current'),false);assert.deepEqual([...h.values],before);
 });
 for(const change of ['owner','raw','main','pending'])test('raw discard rechecks '+change+' after confirmation before any removal',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[]});const pending=proposal();assert.equal(h.ctx.save(pending),false);
  h.ctx.confirm=()=>{if(change==='owner')h.api.owner(false);if(change==='raw')h.values.set(C,'replacement raw');if(change==='main')h.values.set(SK,'remote main');if(change==='pending')vm.runInContext('PENDING_SAVE={sessions:[],theme:"light"}',h.ctx);return true};
  assert.equal(h.ctx.discardRecoveryCopy('stored'),false);assert.equal(h.values.get(C),change==='raw'?'replacement raw':F.C0);assert.equal(h.api.getRaw(),F.R);assert.equal(h.values.get(AW),F.A0);
 });
 test('payload removal failure is truthful and retry leaves unrelated pending/A0 intact',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[],remove:[C]});assert.equal(h.ctx.save(proposal()),false);
  assert.equal(h.ctx.discardRecoveryCopy('stored'),false);assert.equal(h.values.get(C),F.C0);assert.match(h.api.getRawError(),/could not be removed/);blocked(h);
  h.faults.remove.clear();assert(h.ctx.discardRecoveryCopy('stored'));assert.equal(h.api.getRaw(),F.R);blocked(h);
 });
 test('payload success with failed bookkeeping remains accurately retryable and cannot delete new-copy counts',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[C+'-n','7'],[C+'-repaired','2'],[AW,F.A0]],set:[],remove:[C+'-n']});
  assert(h.ctx.discardRecoveryCopy('stored'));assert.equal(h.values.has(C),false);assert.equal(h.api.getRawCleanup(),true);assert.match(h.api.getRawNotice(),/copy was discarded/);
  h.faults.remove.clear();assert(h.ctx.cleanupRecoveryCounts());assert.equal(h.values.has(C+'-n'),false);assert.equal(h.values.has(C+'-repaired'),false);
  vm.runInContext('RECOVERY_CLEANUP=true',h.ctx);h.values.set(C,'new raw');h.values.set(C+'-n','99');assert.equal(h.ctx.cleanupRecoveryCounts(),false);assert.equal(h.values.get(C+'-n'),'99');
 });
 test('current-original explicit resolution is separate from C0, pending P and independent active errors',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[]});assert.equal(h.ctx.save(proposal()),false);vm.runInContext('AW_ERROR="Earlier active failure"',h.ctx);
  assert(h.ctx.discardRecoveryCopy('current'));assert.equal(h.api.getRaw(),null);assert.equal(h.values.get(C),F.C0);blocked(h);assert.equal(h.api.getAWError(),'Earlier active failure');
  assert(h.ctx.retrySave());assert.equal(h.values.get(C),F.C0);assert.equal(h.api.getAWError(),'Earlier active failure');
 });
 test('raw-only retry/download never clears independent main or active warnings',()=>{
  const h=start();vm.runInContext('AW_ERROR="Earlier active failure";SAVE_ERROR="Earlier main failure"',h.ctx);
  h.ctx.dlCorrupt();assert.equal(h.api.getRaw(),F.R);assert.equal(h.api.getAWError(),'Earlier active failure');assert.equal(h.api.getError(),'Earlier main failure');
  h.faults.set.clear();assert(h.ctx.retrySave());assert.equal(h.api.getAWError(),'Earlier active failure');assert.equal(h.api.getError(),'Earlier main failure');
 });
 test('external main change before retry is preserved without raw overwrite or callback',()=>{
  const h=start();let calls=0;assert.equal(h.ctx.save(proposal(),{after:()=>calls++}),false);h.values.set(SK,'remote main');h.faults.set.clear();assert.equal(h.ctx.retrySave(),false);
  assert.equal(readMain(h),'remote main');assert.equal(h.values.has(C),false);assert.equal(h.api.getRaw(),F.R);assert.equal(calls,0);assert(h.api.getPending());
 });
 test('reload of an externally changed source cannot replace an unresolved in-memory original',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[]}),before=plain(h.api.getD());
  h.values.set(SK,'new malformed external main');h.ctx.load();assert.equal(h.api.getRaw(),F.R);assert.equal(h.values.get(C),F.C0);assert.equal(readMain(h),'new malformed external main');
  assert.deepEqual(plain(h.api.getD()),before);assert.match(h.api.getRawError(),/Saved data changed/);assert.equal(h.ctx.save(proposal()),false);
  h.ctx.dlCorrupt('current');assert.equal(h.downloads.at(-1).parts.join(''),F.R);
  const pending=plain(h.api.getPending());assert(h.ctx.discardRecoveryCopy('current'));assert.equal(h.api.getRaw(),null);assert.equal(readMain(h),'new malformed external main');assert.equal(h.values.get(C),F.C0);assert.equal(h.values.get(AW),F.A0);assert.deepEqual(plain(h.api.getPending()),pending);
  assert.equal(h.ctx.retrySave(),false);assert.equal(readMain(h),'new malformed external main');
  const reopened=harness(undefined,{values:[...h.values]});assert.equal(reopened.api.getRaw(),'new malformed external main');assert.equal(reopened.values.get(C),F.C0);
 });
 test('reader may adopt a changed main after exact current original is already durably parked',()=>{
  const h=start({values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[],reader:true});assert.equal(h.api.getRaw(),F.R);
  h.values.set(C,F.R);h.values.set(SK,JSON.stringify(F.P));const operationCount=h.operations.length;h.ctx.load();
  assert.equal(h.api.getRaw(),null);assert.equal(h.api.getD().sessions.filter(s=>s.id==='recovery-save-1').length,1);assert.equal(h.values.get(C),F.R);assert.equal(h.operations.length,operationCount);
 });
 test('combined raw/main/active import failures retain earlier A0 and pending imported identity',()=>{
  const h=start({set:[C,SK,AW]});vm.runInContext('AW_ERROR="Earlier active failure"',h.ctx);const incoming=JSON.parse(F.A0);incoming.id='incoming-active';
  h.ctx.impD({target:{files:[{content:JSON.stringify({...proposal(),activeWorkout:incoming})}],value:'x'}});blocked(h);assert.equal(h.ctx.recoveryExportData().activeWorkout.id,'incoming-active');
  h.faults.set.delete(C);assert.equal(h.ctx.retrySave(),false);blocked(h);assert.equal(h.values.get(C),F.R);
  h.faults.set.delete(SK);assert(h.ctx.retrySave());assert.equal(h.values.get(AW),F.A0);assert.equal(h.ctx.recoveryExportData().activeWorkout.id,'incoming-active');
  assert(h.ctx.discardPendingActive());assert.equal(h.api.getAWError(),'Earlier active failure');assert.equal(h.values.get(AW),F.A0);
 });
 const replace=(text,from,to)=>{assert(text.includes(from),'Fault target must exist');return text.replace(from,to)};
 const mutants=[
  ['main before raw preservation',()=>replace(replace(code,"if(RECOVERY_RAW&&!keepRecovery(RECOVERY_RAW))throw Error('recovery');",''),'localStorage.setItem(SK,encoded);',"localStorage.setItem(SK,encoded);if(RECOVERY_RAW&&!keepRecovery(RECOVERY_RAW))throw Error('recovery');"),h=>{h.ctx.save(proposal());assert.equal(readMain(h),F.R)},{}],
  ['missing direct writer guards',()=>{const a=code.indexOf('function discardRecoveryCopy('),b=code.indexOf('function load()',a),part=code.slice(a,b);assert.equal((part.match(/!canWriteStore\(\)\|\|/g)||[]).length,2);return code.slice(0,a)+part.replace(/!canWriteStore\(\)\|\|/g,'')+code.slice(b)},h=>{h.ctx.discardRecoveryCopy('stored');assert.equal(h.values.get(C),F.C0)},{values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[],reader:true}],
  ['download resolves raw without consent',()=>replace(code,"if(raw===null)return false;", "if(raw===null)return false;RECOVERY_RAW=null;"),h=>{h.ctx.dlCorrupt();assert.equal(h.api.getRaw(),F.R)},{}],
  ['overwrite a different prior raw copy',()=>{const a=code.indexOf(" if(previous!==null&&previous!==raw){"),b=code.indexOf('\n',a);assert(a>0&&b>a);return replace(code.slice(0,a)+code.slice(b),"if(previous===null){if(!WRITER)","if(previous===null||previous!==raw){if(!WRITER)")},h=>assert.equal(h.values.get(C),F.C0),{values:[[SK,F.R],[C,F.C0],[AW,F.A0]],set:[]}]
 ];
 for(const[name,mutate,oracle,options]of mutants)test('semantic fault is rejected: '+name,()=>{
  const h=start({...options,source:mutate()});let error;try{oracle(h)}catch(e){error=e}
  assert.equal(error?.code,'ERR_ASSERTION','The named preservation oracle must reject the semantic fault');
  h.snap('semantic fault rejected');evidence.push({mutation:name,rejected:true,actual:error.actual,expected:error.expected});
 });
 fs.writeFileSync(output,JSON.stringify(evidence,null,2));
};
