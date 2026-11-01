// R4 matrix A–O: independent supported-field and byte oracles. Browser files are separate.
module.exports=function({harness,test,plain,SK,AW,code}){
 const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),F=require('./fixtures/backup-state');
 const output=path.join(__dirname,'..','test-results','recovery-layout','backup-unit-evidence.json'),evidence=[];
 fs.mkdirSync(path.dirname(output),{recursive:true});
 const originalTest=test,originalHarness=harness;let contexts=[];
 const snapshot=h=>({bytes:[...h.values],pending:plain(h.api.getPending()),mainError:h.api.getError(),activeError:h.api.getAWError(),raw:h.api.getRaw(),operations:plain(h.operations),reads:[...h.reads],downloads:h.downloads.map(b=>b.parts.join('')),state:vm.runInContext('({backupError:BACKUP_ERROR,baseRaw:ACTIVE_BASE_RAW,pendingActive:PENDING_ACTIVE,activeId:ACTIVE_ID})',h.ctx)});
 harness=(...args)=>{const h=originalHarness(...args);contexts.push(h);return h};
 test=(name,fn)=>originalTest(name,()=>{contexts=[];try{fn();evidence.push({name,passed:true,contexts:contexts.map(snapshot)})}catch(error){evidence.push({name,passed:false,error:{message:error.message,actual:error.actual,expected:error.expected},contexts:contexts.map(snapshot)});fs.writeFileSync(output,JSON.stringify(evidence,null,2));throw error}});
 const start=(extra={})=>harness(undefined,{values:[[SK,F.MAIN_RAW],[AW,F.DRAFT_RAW]],...extra});
 const draft=()=>plain(F.DRAFT),main=()=>plain(F.MAIN),current=h=>vm.runInContext('LOG.hex_dl.reps[0]',h.ctx);
 const downloaded=h=>JSON.parse(h.downloads.at(-1).parts.join(''));
 function fields(record){assert.equal(record.id,F.EXPECTED.id);assert.equal(record.start,F.EXPECTED.start);assert.equal(record.originalResumeId,F.EXPECTED.originalResumeId);
  for(const key of ['day','loc','phase','resetEpoch','notes','wu','xp'])assert.deepEqual(plain(record[key]),F.EXPECTED[key]);
  for(const[key,expected]of [['hex_dl',F.EXPECTED.hex],['pullup_a',F.EXPECTED.pullup]])for(const[field,value]of Object.entries(expected))assert.deepEqual(plain(record.log[key][field]),value);
 }
 test('B persisted before Resume and D hidden venue retain all independently specified draft fields',()=>{
  const h=start();fields(plain(h.ctx.completeBackupData()).activeWorkout);assert.equal(h.api.getActiveId(),null);assert.equal(h.values.get(AW),F.DRAFT_RAW);
  h.api.getD().location='partner';const hidden=plain(h.ctx.completeBackupData());assert.equal(hidden.location,'partner');fields(hidden.activeWorkout);assert.equal(h.values.get(AW),F.DRAFT_RAW);
 });
 test('A complete export contains current supported fields and keeps source raw bytes intact',()=>{
  const h=start();h.ctx.resumeW();assert(h.ctx.expD());fields(downloaded(h).activeWorkout);assert.equal(h.values.get(AW),F.DRAFT_RAW);assert.equal(h.api.getAWError(),'');
 });
 test('C reader exports fresh saved pair rather than stale D without any write',()=>{
  const h=start({reader:true}),fresh=main();fresh.bodyLog=[{date:'2026-11-01',weight:82}];h.values.set(SK,JSON.stringify(fresh));const count=h.operations.length;
  assert.equal(h.api.getD().bodyLog.length,0);assert(h.ctx.expD());const value=downloaded(h);assert.equal(value.bodyLog[0].weight,82);fields(value.activeWorkout);assert.equal(h.operations.length,count);assert.equal(h.api.getD().bodyLog.length,0);
 });
 test('E/I known own five then unsaved six supersedes only its exact persisted baseline',()=>{
  const h=start();h.ctx.resumeW();assert(h.ctx.saveAW());const before=h.values.get(AW),owner=JSON.parse(before).owner;assert.equal(owner,vm.runInContext('WRITER_ID',h.ctx));
  h.fail(false,true);vm.runInContext("LOG.hex_dl.reps[0]='6'",h.ctx);assert.equal(h.ctx.saveAW(),false);const error=h.api.getAWError();assert(h.ctx.expD());
  assert.equal(downloaded(h).activeWorkout.log.hex_dl.reps[0],6);assert.equal(h.values.get(AW),before);assert.equal(h.api.getAWError(),error);assert.equal(current(h),'6');assert.equal(h.api.getPending(),null);
 });
 test('I stable actual Resume proves a prior-owner baseline; arbitrary equal IDs do not',()=>{
  const h=start();h.ctx.resumeW();vm.runInContext("LOG.hex_dl.reps[0]='6'",h.ctx);assert.equal(plain(h.ctx.completeBackupData()).activeWorkout.log.hex_dl.reps[0],6);
  const unknown=start();unknown.api.setActive(draft());vm.runInContext("LOG.hex_dl.reps[0]='6'",unknown.ctx);assert.throws(()=>unknown.ctx.completeBackupData(),/Different unfinished/);assert.equal(unknown.values.get(AW),F.DRAFT_RAW);
 });
 test('J external same-ID raw change breaks the known baseline instead of choosing live',()=>{
  const h=start();h.ctx.resumeW();vm.runInContext("LOG.hex_dl.reps[0]='6'",h.ctx);const external=draft();external.log.hex_dl.reps[0]='3';external.owner='independent-import-owner';h.values.set(AW,JSON.stringify(external));
  assert.throws(()=>h.ctx.completeBackupData(),/Different unfinished/);assert.equal(h.values.get(AW),JSON.stringify(external));assert.equal(current(h),'6');
 });
 for(const sameId of [false,true])test('G/H/J imported conflict retains named copies; sameID='+sameId,()=>{
  const h=start();h.ctx.resumeW();h.fail(false,true);vm.runInContext("LOG.hex_dl.reps[0]='6'",h.ctx);h.ctx.saveAW();const earlier=h.values.get(AW),error=h.api.getAWError(),incoming=draft();incoming.id=sameId?'backup-active-1':'backup-imported-1';incoming.log.hex_dl.reps[0]='3';incoming.notes='Imported notes keep';
  h.ctx.impD({target:{files:[{content:JSON.stringify({...main(),activeWorkout:incoming})}],value:'x'}});
  assert.equal(h.ctx.expD(),false);assert.equal(h.downloads.length,0);assert.match(h.alerts.at(-1),/Different unfinished/);assert.equal(h.values.get(AW),earlier);
  assert(h.ctx.exportActiveWorkout('imported'));assert.equal(downloaded(h).activeWorkout.id,incoming.id);assert.equal(Number(downloaded(h).activeWorkout.log.hex_dl.reps[0]),3);
  assert(h.ctx.exportActiveWorkout('current'));assert.equal(downloaded(h).activeWorkout.id,'backup-active-1');assert.equal(Number(downloaded(h).activeWorkout.log.hex_dl.reps[0]),6);
  assert(h.ctx.exportActiveWorkout('saved'));assert.equal(downloaded(h).activeWorkout.id,'backup-active-1');assert.equal(Number(downloaded(h).activeWorkout.log.hex_dl.reps[0]),5);
  assert.equal(h.values.get(AW),earlier);assert(h.ctx.discardPendingActive());assert.equal(h.api.getAWError(),error);
 });
 test('F completed pending main is exported once without resurrecting same-ID active',()=>{
  const h=start();h.ctx.resumeW();const proposal=main();proposal.sessions.push({id:'backup-active-1',date:'2026-11-01',day:'A',loc:'home',phase:1,duration:20,difficulty:3,warmup:2,notes:'Completed keep',ex:[{id:'hex_dl',wt:40,reps:[5],form:[5]}]});h.fail(true);let calls=0;
  assert.equal(h.ctx.save(proposal,{after:()=>calls++}),false);const pending=plain(h.api.getPending());assert(h.ctx.expD());const value=downloaded(h);assert.equal(value.activeWorkout,undefined);assert.equal(value.sessions.filter(s=>s.id==='backup-active-1').length,1);assert.deepEqual(plain(h.api.getPending()),pending);assert.equal(calls,0);assert.equal(h.values.get(AW),F.DRAFT_RAW);
 });
 test('G failed main import keeps explicit proposal and all separate draft scopes',()=>{
  const h=start(),incoming=draft();incoming.id='backup-imported-1';h.ctx.resumeW();h.fail(true,true);
  h.ctx.impD({target:{files:[{content:JSON.stringify({...main(),activeWorkout:incoming})}],value:'x'}});const pending=plain(h.api.getPending()),raw=h.values.get(SK);
  assert.equal(h.ctx.expD(),false);assert.deepEqual(plain(h.api.getPending()),pending);assert.equal(h.values.get(SK),raw);assert.equal(h.values.get(AW),F.DRAFT_RAW);
  assert(h.ctx.exportActiveWorkout('imported'));assert.equal(downloaded(h).activeWorkout.id,'backup-imported-1');assert(h.ctx.exportSavedHistory());assert.equal(downloaded(h).activeWorkout,undefined);
 });
 for(const leftover of ['completed','old epoch'])test('K excludes '+leftover+' active leftovers',()=>{
  const m=main();if(leftover==='completed')m.sessions.push({id:'backup-active-1',date:'2026-11-01',day:'A',ex:[{id:'hex_dl',wt:40,reps:[5]}]});else m.resetEpoch='new-reset-epoch';
  const h=start({values:[[SK,JSON.stringify(m)],[AW,F.DRAFT_RAW]]});assert.equal(h.ctx.completeBackupData().activeWorkout,undefined);assert.equal(h.values.get(AW),F.DRAFT_RAW);
 });
 for(const key of [SK,AW])test('L read failure cannot produce complete metadata or a file '+key,()=>{
  const h=start();h.ctx.resumeW();h.faults.get.add(key);const before=h.values.get(SK),error=h.api.getAWError();assert.equal(h.ctx.expD(),false);assert.equal(h.downloads.length,0);assert.equal(h.values.get(SK),before);assert.equal(h.api.getAWError(),error);assert(h.ctx.exportActiveWorkout('current'));assert.equal(downloaded(h).activeWorkout.id,'backup-active-1');
 });
 for(const raw of ['', '{bad active','null'])test('M malformed/empty active is not absence '+JSON.stringify(raw),()=>{
  const h=start({values:[[SK,F.MAIN_RAW],[AW,raw]]});assert.equal(h.ctx.expD(),false);assert.equal(h.downloads.length,0);assert.equal(h.ctx.pendingAW().unreadable,true);h.ctx.beginW('B');assert.equal(h.values.get(AW),raw);assert(h.ctx.exportRawWorkout());assert.equal(h.downloads.at(-1).parts.join(''),raw);
 });
 for(const kind of ['notes','rating','warmup','setup','legacy setup'])test('M/DATA04 meaningful '+kind+' survives stale/hidden Start and import cancellation',()=>{
  const d=draft();d.notes='';d.wu=[false,false,false];d.swaps={};d.log={hex_dl:{wt:7,reps:['','',''],wts:['','',''],bands:['','',''],band:'',setDone:[false,false,false],setTs:[0,0,0],form:[0,0,0],notes:'',disc:'none',discJoints:[],touched:false,pf:false}};
  if(kind==='notes')d.notes='Notes only keep';if(kind==='rating')d.log.hex_dl.form=[4,0,0];if(kind==='warmup')d.wu=[false,true,false];if(kind==='setup'){d.log.hex_dl.wts[1]=35;d.log.hex_dl.touched=true}if(kind==='legacy setup')delete d.log.hex_dl.touched;
  const raw=JSON.stringify(d),h=start({values:[[SK,F.MAIN_RAW],[AW,raw]]});assert(h.ctx.checkResume());assert(h.ctx.pendingAW());h.ctx.confirm=()=>false;h.ctx.beginW('B');assert.equal(h.values.get(AW),raw);
  const incoming=draft();incoming.id='backup-imported-1';h.ctx.impD({target:{files:[{content:JSON.stringify({...main(),activeWorkout:incoming})}],value:'x'}});assert.equal(h.values.get(AW),raw);assert.equal(h.values.get(SK),F.MAIN_RAW);assert.equal(h.api.getPending(),null);assert.equal(h.ctx.completeBackupData().activeWorkout.id,'backup-active-1');
 });
 test('M explicit untouched zero-rep template is distinct from meaningful legacy setup',()=>{
  const d=draft();d.notes='';d.wu=[];d.log={hex_dl:{wt:7,reps:[''],form:[0],setDone:[false],notes:'',touched:false,pf:false}};const h=start({values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]});assert.equal(h.ctx.awHasWork(d),false);assert.equal(h.ctx.pendingAW(),null);
 });
 for(const[field,value]of [['form',99],['form',1.5],['rir',99],['rir',1.5]])test('malformed known '+field+'='+value+' cannot claim complete capture after repair',()=>{
  const d=draft();if(field==='form')d.log.hex_dl.form=[value,0,4];else d.log.hex_dl.rir=value;const raw=JSON.stringify(d),h=start({values:[[SK,F.MAIN_RAW],[AW,raw]]});
  assert.equal(h.ctx.expD(),false);assert.equal(h.downloads.length,0);assert.equal(h.values.get(SK),F.MAIN_RAW);assert.equal(h.values.get(AW),raw);assert.match(h.alerts.at(-1),/without repairs/);assert(h.ctx.exportRawWorkout());assert.equal(h.downloads.at(-1).parts.join(''),raw);
 });
 for(const rating of [0,'4'])test('valid integer zero/numeric-string rating is retained '+JSON.stringify(rating),()=>{
  const d=draft();d.log.hex_dl.form=[rating,0,4];d.log.hex_dl.rir=rating;const h=start({values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]}),value=h.ctx.completeBackupData();assert.equal(value.activeWorkout.log.hex_dl.form[0],Number(rating));assert.equal(value.activeWorkout.log.hex_dl.rir,Number(rating));
 });
 test('zero-rep per-slot band setup survives supported export and actual envelope import independently',()=>{
  const d=draft();d.notes='';d.wu=[];d.log={pullup_a:{wt:null,band:'Green',bands:['Green','Blue (heaviest)','Purple'],reps:['','',''],form:[0,0,0],setDone:[false,false,false],notes:'',touched:true}};
  const h=start({values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]}),value=plain(h.ctx.completeBackupData());assert.deepEqual(value.activeWorkout.log.pullup_a.bands,['Green','Blue (heaviest)','Purple']);
  const destination=start({values:[[SK,JSON.stringify({...main(),sessions:[],originalResume:null})]]});destination.ctx.impD({target:{files:[{content:JSON.stringify(value)}],value:'x'}});const restored=destination.ctx.checkResume();assert.deepEqual(plain(restored.log.pullup_a.bands),['Green','Blue (heaviest)','Purple']);assert(destination.ctx.pendingAW());
 });
 test('DATA04 legacy absent touched marker survives actual envelope export/import and Start cancellation',()=>{
  const d=draft();d.notes='';d.wu=[];d.swaps={};d.ts=1;d.log={hex_dl:{wt:7,reps:['','',''],notes:''}};
  const source=start({values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]});assert(source.ctx.pendingAW());const value=plain(source.ctx.completeBackupData());assert.equal(Object.hasOwn(value.activeWorkout.log.hex_dl,'touched'),false);
  const destination=start({values:[[SK,JSON.stringify({...main(),sessions:[],originalResume:null})]]});destination.ctx.impD({target:{files:[{content:JSON.stringify(value)}],value:'x'}});
  const raw=destination.values.get(AW);assert(destination.ctx.pendingAW(),'Restored legacy setup remains meaningful before Resume');assert(destination.ctx.checkResume(),'Stale legacy setup is not deleted or hidden as empty');
  let prompted=false;destination.ctx.confirm=()=>{prompted=true;return false};destination.ctx.beginW('B');assert(prompted);assert.equal(destination.values.get(AW),raw);
 });
 test('N occupied destination cancel and main/active quota retry keep one intended identity',()=>{
  const h=start(),incoming=draft();incoming.id='backup-imported-1';const file={target:{files:[{content:JSON.stringify({...main(),activeWorkout:incoming})}],value:'x'}};
  h.ctx.confirm=()=>false;h.ctx.impD(file);assert.equal(h.values.get(SK),F.MAIN_RAW);assert.equal(h.values.get(AW),F.DRAFT_RAW);
  h.ctx.confirm=()=>true;h.fail(true,true);h.ctx.impD(file);assert(h.api.getPending());assert.equal(h.values.get(AW),F.DRAFT_RAW);h.fail(false,true);assert(h.ctx.retrySave());assert.equal(h.values.get(AW),F.DRAFT_RAW);h.fail(false);assert(h.ctx.retrySave());assert.equal(JSON.parse(h.values.get(AW)).id,'backup-imported-1');assert.equal(h.api.getPending(),null);
 });
 test('O changing pairs fail after two attempts with no export or metadata write',()=>{
  let armed=false,changes=0;const h=start({reader:true,afterGet:(key,values)=>{if(armed&&key===AW){const m=JSON.parse(values.get(SK));m.gen=++changes+1;values.set(SK,JSON.stringify(m))}}});armed=true;
  assert.equal(h.ctx.expD(),false);assert.equal(changes,4);assert.equal(h.downloads.length,0);assert.equal(h.operations.length,0);assert.match(h.alerts.at(-1),/changed during capture/);
 });
 test('O one changed pair retries to fresh completed main without stale active resurrection',()=>{
  let armed=false,changed=false;const h=start({reader:true,afterGet:(key,values)=>{if(armed&&!changed&&key===AW){const m=main();m.sessions.push({id:'backup-active-1',date:'2026-11-01',day:'A',ex:[{id:'hex_dl',wt:40,reps:[5]}]});values.set(SK,JSON.stringify(m));changed=true}}});armed=true;
  const value=h.ctx.completeBackupData();assert.equal(value.sessions.filter(s=>s.id==='backup-active-1').length,1);assert.equal(value.activeWorkout,undefined);assert.equal(h.operations.length,0);
 });
 const replace=(from,to)=>{assert(code.includes(from),'Semantic fault target must exist');return code.replace(from,to)};
 const faults=[
  ['omit persisted draft',()=>replace('function completeBackupData(){const stored=captureStoredBackup();','function completeBackupData(){return structuredClone(D);const stored=captureStoredBackup();'),()=>{const h=start({source:replace('function completeBackupData(){const stored=captureStoredBackup();','function completeBackupData(){return structuredClone(D);const stored=captureStoredBackup();')});assert.equal(h.ctx.completeBackupData().activeWorkout?.id,'backup-active-1')}],
  ['trust equal ID without raw baseline',()=>replace('ACTIVE_BASE_RAW!==null&&s.raw===ACTIVE_BASE_RAW&&',''),source=>{const h=start({source});h.api.setActive(draft());vm.runInContext("LOG.hex_dl.reps[0]='6'",h.ctx);assert.throws(()=>h.ctx.completeBackupData(),/Different unfinished/)}],
  ['accept changing reader pair',()=>replace('if(first.some((raw,i)=>raw!==second[i]))continue;','if(false)continue;'),source=>{let armed=false,n=0;const h=start({reader:true,source,afterGet:(key,values)=>{if(armed&&key===AW){const m=main();m.gen=++n;values.set(SK,JSON.stringify(m))}}});armed=true;assert.throws(()=>h.ctx.completeBackupData(),/changed during capture/)}],
  ['lose notes-only work',()=>replace('function awHasWork(d){if(!d)return false;','function awHasWork(d){return awHasReps(d);if(!d)return false;'),source=>{const d=draft();d.log={};d.notes='Notes only keep';d.ts=1;const h=start({source,values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]});assert(h.ctx.checkResume())}],
  ['erase absent legacy touched evidence',()=>replace("...(Object.prototype.hasOwnProperty.call(v,'touched')?{touched:v.touched===true}:{}),",'touched:v.touched===true,'),source=>{const d=draft();d.notes='';d.wu=[];d.ts=1;d.log={hex_dl:{wt:7,reps:['','',''],notes:''}};const h=start({source,values:[[SK,F.MAIN_RAW],[AW,JSON.stringify(d)]]}),value=plain(h.ctx.completeBackupData());const destination=start({source,values:[[SK,JSON.stringify({...main(),sessions:[],originalResume:null})]]});destination.ctx.impD({target:{files:[{content:JSON.stringify(value)}],value:'x'}});assert(destination.ctx.pendingAW())}]
 ];
 for(const[name,mutate,oracle]of faults)test('R4 semantic fault rejected: '+name,()=>{const source=mutate();let error;try{oracle(source)}catch(e){error=e}assert.equal(error?.code,'ERR_ASSERTION','The named preservation oracle must reject the fault');evidence.push({mutation:name,rejected:true,actual:error.actual,expected:error.expected})});
 fs.writeFileSync(output,JSON.stringify(evidence,null,2));
};
