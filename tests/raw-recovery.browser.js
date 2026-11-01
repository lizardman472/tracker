// DATA03/07: actual storage/Web Locks, file bytes and narrow light/dark controls.
module.exports=async function({browser,origin,T,errors}){
 const fs=require('fs'),path=require('path'),F=require('./fixtures/raw-recovery'),SK='rft-v12',AW='rft-active',C=SK+'-corrupt';
 const directory=path.join(__dirname,'..','test-results','recovery-layout'),evidence=[];fs.mkdirSync(directory,{recursive:true});
 const write=()=>fs.writeFileSync(path.join(directory,'raw-recovery-browser-evidence.json'),JSON.stringify(evidence,null,2));
 const key=async(page,control)=>{await control.focus();await page.keyboard.press('Enter')};
 async function create({main=F.R,legacy=null,stored=null,active=F.A0,fault={set:[C]},label='raw',theme='light'}={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme}),dialogs=[];
  ctx.setDefaultTimeout(20000);ctx.setDefaultNavigationTimeout(20000);
  console.log('RAW_CASE_START',label);
  await ctx.addInitScript(({origin,main,legacy,stored,active,fault})=>{
   if(location.origin!==origin)return;
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,control='raw-test-controls';
   if(!get.call(localStorage,'raw-test-seeded')){
    if(main===null)remove.call(localStorage,'rft-v12');else set.call(localStorage,'rft-v12',main);
    if(legacy!==null)set.call(localStorage,'rft-v11',legacy);if(stored!==null)set.call(localStorage,'rft-v12-corrupt',stored);if(active!==null)set.call(localStorage,'rft-active',active);
    set.call(localStorage,control,JSON.stringify(fault));set.call(localStorage,'raw-test-seeded','1');
   }
   window.__rawOps=[];window.__rawGet=k=>get.call(localStorage,k);window.__rawSet=(k,v)=>{if(k!==control)window.__rawOps.push({op:'external-set',key:k,value:v});set.call(localStorage,k,v)};
   const mode=()=>JSON.parse(get.call(localStorage,control)||'{}');
   Storage.prototype.getItem=function(k){const failed=(mode().get||[]).includes(k);window.__rawOps.push({op:'get',key:k,accepted:!failed});if(failed)throw new DOMException('Synthetic key read','SecurityError');return get.call(this,k)};
   Storage.prototype.setItem=function(k,v){const m=mode(),failed=(m.set||[]).includes(k);window.__rawOps.push({op:'set',key:k,value:String(v),accepted:!failed});if(failed)throw new DOMException('Synthetic key quota','QuotaExceededError');set.call(this,k,v);
    if(k==='rft-v12-corrupt'&&m.failRawReadAfterWrite){m.get=[...(m.get||[]),'rft-v12-corrupt'];set.call(localStorage,control,JSON.stringify(m))}};
   Storage.prototype.removeItem=function(k){const failed=(mode().remove||[]).includes(k);window.__rawOps.push({op:'remove',key:k,accepted:!failed});if(failed)throw new DOMException('Synthetic key removal','SecurityError');remove.call(this,k)};
  },{origin,main,legacy,stored,active,fault});
  function accept(dialog){dialogs.push({type:dialog.type(),message:dialog.message(),action:'accept'});return dialog.accept()}
  ctx.on('page',page=>{page.on('pageerror',e=>errors.push('RAW '+label+': '+e.message));page.on('dialog',accept)});
  async function tab(writer=true){const page=await ctx.newPage();await page.clock.install({time:new Date('2026-11-01T12:00:00')});await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>WRITER_READY);if(writer)await page.waitForFunction(()=>canWriteStore());return page}
  const page=await tab();return{ctx,page,tab,dialogs,accept};
 }
 const mode=(page,value)=>page.evaluate(value=>__rawSet('raw-test-controls',JSON.stringify(value)),value);
 async function snapshot(page){return page.evaluate(()=>({main:__rawGet('rft-v12'),legacy:__rawGet('rft-v11'),stored:__rawGet('rft-v12-corrupt'),active:__rawGet('rft-active'),
  raw:RECOVERY_RAW,rawError:RECOVERY_ERROR,rawNotice:RECOVERY_NOTICE,pending:PENDING_SAVE?structuredClone(PENDING_SAVE):null,pendingActive:PENDING_ACTIVE?structuredClone(PENDING_ACTIVE):null,
  mainError:SAVE_ERROR,activeError:AW_ERROR,callbacks:window.__rawCallbacks||0,writer:canWriteStore(),inert:document.getElementById('app').inert,
  status:document.getElementById('save-status')?.innerText,operations:structuredClone(window.__rawOps)}))}
 async function download(page,name){const pending=page.waitForEvent('download');await key(page,page.locator('#save-status').getByRole('button',{name,exact:true}));const file=await pending,stream=await file.createReadStream();let bytes='';for await(const chunk of stream)bytes+=chunk;return{name:file.suggestedFilename(),bytes}}
 async function capture(page,name,text,target='#save-status'){
  await page.evaluate(async()=>{scrollTo({top:0,behavior:'instant'});for(const a of document.getAnimations())if(a.effect?.getComputedTiming().iterations!==Infinity)a.finish();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  const subject=page.locator(target).first();T('raw capture contains visible meaningful content '+name,await subject.isVisible()&&(await subject.innerText()).includes(text));
  await page.screenshot({path:path.join(directory,name+'.png'),animations:'disabled'});
 }
 async function past(page){
  await page.evaluate(()=>{recordId=()=> 'recovery-save-1';window.__rawCallbacks=0;const run=runSavedCallback;runSavedCallback=fn=>{if(fn)window.__rawCallbacks++;return run(fn)}});
  await key(page,page.getByRole('button',{name:'History',exact:true}));await key(page,page.getByRole('button',{name:'+ Log Past',exact:true}));
  await page.getByLabel('Session date',{exact:true}).fill('2026-11-01');await page.getByLabel('Session date',{exact:true}).press('Tab');
  await page.getByLabel('Weight for Hex Bar Deadlift, kilograms',{exact:true}).fill('40');await page.getByLabel('Hex Bar Deadlift set 1 reps',{exact:true}).fill('5');
  await key(page,page.getByRole('button',{name:'Save Session',exact:true}));
 }
 const pendingId=s=>s.pending?.sessions.filter(x=>x.id==='recovery-save-1').length===1;
 const statusButton=(page,name)=>page.locator('#save-status').getByRole('button',{name,exact:true});
 async function restoreActiveFile(file,id,reps,theme){
  const h=await create({main:JSON.stringify({...F.P,sessions:[],theme}),active:null,fault:{},label:'restore-'+id,theme}),{page}=h;
  try{
   await key(page,page.getByRole('button',{name:'Settings',exact:true}));
   const chooser=page.waitForEvent('filechooser');await key(page,page.getByRole('button',{name:'↑ Import',exact:true}));
   await(await chooser).setFiles({name:file.name,mimeType:'application/json',buffer:Buffer.from(file.bytes)});
   await page.waitForFunction(()=>!IMPORT_BUSY&&!PENDING_SAVE&&!PENDING_ACTIVE);
   const imported=await snapshot(page);await key(page,page.getByRole('button',{name:'Today',exact:true}));
   await key(page,page.getByRole('button',{name:'Resume',exact:true}));const resumed=await snapshot(page);
   const values=await page.evaluate(()=>({id:ACTIVE_ID,reps:LOG.hex_dl.reps[0],checked:LOG.hex_dl.setDone[0],rowNotes:LOG.hex_dl.notes,notes:SNOTES}));
   T('actual downloaded active file imports and Resumes its promised identity/values '+id+' '+theme,values.id===id&&Number(values.reps)===Number(reps)&&values.checked===true&&values.rowNotes==='A0 keep'&&values.notes==='A0 session keep',JSON.stringify(values));
   return{imported,resumed,values};
  }finally{await h.ctx.close()}
 }
 for(const theme of ['light','dark']){
  const original=theme==='dark'?F.R_DARK:F.R;
  // Cases1/6/12/13: selective payload failure, actual stable save, bytes and retry.
  {
   const h=await create({main:original,label:'selective-'+theme}),{page}=h;
   try{
    const loaded=await snapshot(page);T('raw-only failure is visible before an edit '+theme,loaded.main===original&&loaded.raw===original&&loaded.active===F.A0&&loaded.status.includes('raw original'));
    T('raw-only unresolved state requests exit protection '+theme,await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented}));
    const rawReader=await h.tab(false);await key(rawReader,statusButton(rawReader,'Use this tab'));
    await rawReader.waitForFunction(()=>SAVE_ERROR.includes('other tab has an unfinished workout'));
    const rawOnlyHandover=await snapshot(rawReader),ownerBeforeEdit=await snapshot(page);
    T('real reader handover is refused when owner has only unresolved raw recovery '+theme,!rawOnlyHandover.writer&&ownerBeforeEdit.writer&&ownerBeforeEdit.raw===original&&ownerBeforeEdit.pending===null&&ownerBeforeEdit.main===original&&ownerBeforeEdit.active===F.A0);
    await rawReader.close();
    await past(page);const blocked=await snapshot(page);
    T('actual past save is pending/inert with exact original and stable identity '+theme,blocked.main===original&&blocked.active===F.A0&&blocked.inert&&pendingId(blocked)&&blocked.callbacks===0&&blocked.stored===null);
    T('warning controls remain outside inert app '+theme,await statusButton(page,'Retry save').evaluate(el=>!el.closest('#app')&&!el.closest('[inert]')));
    await capture(page,'raw-blocked-'+theme,'Pending changes are not saved');
    const rawFile=await download(page,'Download current raw original'),pendingFile=await download(page,'Download pending changes');
    T('actual raw download retains every original UTF-8 byte '+theme,rawFile.bytes===original&&rawFile.name.startsWith('raw-current-original-'));
    const exported=JSON.parse(pendingFile.bytes);T('pending download has its named proposal without false raw resolution '+theme,exported.sessions.filter(x=>x.id==='recovery-save-1').length===1&&await page.evaluate(()=>!!RECOVERY_RAW&&!!PENDING_SAVE));
    // Inspect/restore a supported pending file while the originating page stays open.
    const fresh=await create({main:JSON.stringify({...F.P,sessions:[]}),active:null,fault:{},label:'pending-restore'});
    try{await key(fresh.page,fresh.page.getByRole('button',{name:'Settings',exact:true}));await fresh.page.locator('#import-backup').setInputFiles({name:pendingFile.name,mimeType:'application/json',buffer:Buffer.from(pendingFile.bytes)});
     await fresh.page.waitForFunction(()=>!IMPORT_BUSY&&!PENDING_SAVE);T('pending JSON restores its promised identity on a fresh context '+theme,await fresh.page.evaluate(()=>D.sessions.filter(s=>s.id==='recovery-save-1').length===1));
    }finally{await fresh.ctx.close()}
    await mode(page,{});await key(page,statusButton(page,'Retry save'));const retried=await snapshot(page);
    const saved=JSON.parse(retried.main).sessions.find(s=>s.id==='recovery-save-1');
    T('retry parks exact R and commits one explicit past-session/callback '+theme,retried.stored===original&&retried.pending===null&&retried.active===F.A0&&retried.callbacks===1&&saved.ex[0].wt===40&&JSON.stringify(saved.ex[0].reps)==='[5,0,0]'&&saved.retro===true);
    T('repeated retry cannot duplicate stable save or callback '+theme,await page.evaluate(()=>retrySave()===false&&window.__rawCallbacks===1));
    await capture(page,'raw-retried-'+theme,'History','#app');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>canWriteStore());
    const reopened=await snapshot(page);T('successful raw/main commit survives real reload '+theme,reopened.stored===original&&reopened.active===F.A0&&JSON.parse(reopened.main).sessions.filter(s=>s.id==='recovery-save-1').length===1);
    evidence.push({case:'1/6/12/13',theme,loaded,rawOnlyHandover,ownerBeforeEdit,blocked,rawFile,pendingFile,retried,reopened,dialogs:h.dialogs});write();
   }finally{await h.ctx.close()}
  }
  // Cases8/9/10/11: actual owner/reader, separate C0, cancel and removal faults.
  {
   const h=await create({main:original,stored:F.C0,fault:{},label:'conflict-'+theme}),{page}=h;
   try{
    const loaded=await snapshot(page);T('load never replaces different C0 '+theme,loaded.main===original&&loaded.stored===F.C0&&loaded.raw===original);
    await past(page);const blocked=await snapshot(page);await capture(page,'raw-conflict-'+theme,'different stored raw copy');
    const currentFile=await download(page,'Download current raw original'),storedFile=await download(page,'Download stored raw copy');
    T('both separately named raw files have exact distinct bytes '+theme,currentFile.bytes===original&&storedFile.bytes===F.C0&&storedFile.name.startsWith('raw-stored-copy-'));
    const reader=await h.tab(false);const readerBefore=await snapshot(reader);
    await key(reader,reader.locator('#app').getByRole('button',{name:'Discard stored raw copy',exact:true}));
    const direct=await reader.evaluate(()=>({stored:discardRecoveryCopy('stored'),current:discardRecoveryCopy('current')})),readerAfter=await snapshot(reader);
    T('real reader click and direct handler cannot remove bytes or resolve memory '+theme,!direct.stored&&!direct.current&&!readerAfter.writer&&readerAfter.main===original&&readerAfter.stored===F.C0&&readerAfter.active===F.A0&&readerAfter.raw===readerBefore.raw);
    const dialogCount=h.dialogs.length;page.removeAllListeners('dialog');page.once('dialog',async dialog=>{h.dialogs.push({type:dialog.type(),message:dialog.message(),action:'cancel'});await dialog.dismiss()});
    await key(page,statusButton(page,'Discard stored raw copy'));page.on('dialog',h.accept);const cancelled=await snapshot(page);
    T('writer native confirmation cancellation names only stored scope and keeps P/C0/A0 '+theme,h.dialogs.length===dialogCount+1&&h.dialogs.at(-1).message.includes('only the stored raw')&&cancelled.stored===F.C0&&pendingId(cancelled)&&cancelled.active===F.A0);
    await capture(page,'raw-cancelled-'+theme,'different stored raw copy');
    await mode(page,{remove:[C]});await key(page,statusButton(page,'Discard stored raw copy'));const removalFailed=await snapshot(page);
    T('actual raw removal failure remains visible and preserves C0/P/A0 '+theme,removalFailed.stored===F.C0&&pendingId(removalFailed)&&removalFailed.active===F.A0&&removalFailed.rawError.includes('could not be removed'));
    await capture(page,'raw-remove-failed-'+theme,'could not be removed');
    await mode(page,{remove:[C+'-n']});await key(page,statusButton(page,'Discard stored raw copy'));const cleanupFailed=await snapshot(page);
    T('payload removal and optional cleanup failure have separate truthful status '+theme,cleanupFailed.stored===null&&cleanupFailed.raw===original&&pendingId(cleanupFailed)&&cleanupFailed.rawNotice.includes('stored raw copy was discarded, but recovery counts'));
    await capture(page,'raw-cleanup-failed-'+theme,'Retry recovery cleanup');
    await mode(page,{});await key(page,statusButton(page,'Retry recovery cleanup'));const resolved=await snapshot(page);
    T('confirmed writer resolves only stored scope and retains current original/P '+theme,resolved.stored===null&&resolved.raw===original&&pendingId(resolved)&&resolved.active===F.A0);
    await key(page,statusButton(page,'Retry save'));await reader.waitForFunction(()=>D.sessions.some(s=>s.id==='recovery-save-1'));
    const committed=await snapshot(page);T('after scoped resolution original R parks before P commits '+theme,committed.stored===original&&committed.pending===null&&committed.callbacks===1&&committed.active===F.A0);
    await key(reader,statusButton(reader,'Use this tab'));await reader.waitForFunction(()=>canWriteStore());
    T('real lock transfer reloads committed identity without losing raw/A0 '+theme,await reader.evaluate(({raw,active})=>D.sessions.filter(s=>s.id==='recovery-save-1').length===1&&__rawGet('rft-v12-corrupt')===raw&&__rawGet('rft-active')===active,{raw:original,active:F.A0}));
    evidence.push({case:'8/9/10/11',theme,loaded,blocked,currentFile,storedFile,readerBefore,readerAfter,cancelled,removalFailed,cleanupFailed,resolved,committed,dialogs:h.dialogs});write();
   }finally{await h.ctx.close()}
  }
 }
 // Cases2/5/12: unreadable main, real active failure and imported copy remain distinct.
 for(const theme of ['light','dark']){
  const h=await create({main:F.L0,fault:{set:[C,SK]},label:'combined-import-'+theme,theme}),{page}=h;
  try{
   await key(page,page.getByRole('button',{name:'Resume',exact:true}));const earlierStored=await snapshot(page);
   T('actual resumed draft is captured before introducing its write fault',JSON.parse(earlierStored.active).id==='active-oracle-1'&&JSON.parse(earlierStored.active).notes==='A0 session keep');
   await mode(page,{set:[C,SK,AW]});await page.getByLabel('Set 1 reps',{exact:true}).fill('6');
   const earlier=await snapshot(page);T('actual active failure retains exact captured earlier bytes before import',earlier.active===earlierStored.active&&earlier.activeError.includes('Current workout is not saved'));
   const incoming=JSON.parse(F.A0);incoming.id='incoming-active-oracle';
   // Test-only view setup: workout hides the main navigation. The Resume/edit and
   // following actual import chooser/failure controls are exercised independently.
   await page.evaluate(()=>go('settings'));const chooser=page.waitForEvent('filechooser');await key(page,page.getByRole('button',{name:'↑ Import',exact:true}));
   await(await chooser).setFiles({name:'synthetic-raw-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...F.P,theme,activeWorkout:incoming}))});
   await page.waitForFunction(()=>!IMPORT_BUSY&&!!PENDING_SAVE);const rawBlocked=await snapshot(page);
   T('unreadable main/raw barrier retains imported main and active proposals plus earlier A0',rawBlocked.main===F.L0&&rawBlocked.active===earlierStored.active&&pendingId(rawBlocked)&&rawBlocked.pendingActive.id==='incoming-active-oracle'&&rawBlocked.activeError===earlier.activeError);
   await capture(page,'raw-import-blocked-'+theme,'Pending changes are not saved');
   const currentRaw=await download(page,'Download current raw original'),importFile=await download(page,'Download imported workout');
   T('combined files retain exact unreadable original and named imported active identity',currentRaw.bytes===F.L0&&JSON.parse(importFile.bytes).activeWorkout.id==='incoming-active-oracle');
   const importedRestore=await restoreActiveFile(importFile,'incoming-active-oracle','5',theme);
   await mode(page,{set:[SK,AW]});await key(page,statusButton(page,'Retry save'));const mainBlocked=await snapshot(page);
   T('raw success cannot clear independent main or active failure',mainBlocked.stored===F.L0&&mainBlocked.main===F.L0&&pendingId(mainBlocked)&&mainBlocked.active===earlierStored.active&&mainBlocked.activeError===earlier.activeError);
   await capture(page,'raw-import-main-failed-'+theme,'Not saved on this device');
   await mode(page,{set:[AW]});await key(page,statusButton(page,'Retry save'));const activeBlocked=await snapshot(page);
   T('main commit runs imported-active callback only after durable main, preserving A0 on active failure',activeBlocked.pending===null&&activeBlocked.pendingActive.id==='incoming-active-oracle'&&activeBlocked.active===earlierStored.active&&JSON.parse(activeBlocked.main).sessions.filter(s=>s.id==='recovery-save-1').length===1);
   await capture(page,'raw-import-active-failed-'+theme,'imported unfinished workout');
   const storedRaw=await download(page,'Download stored raw copy');T('committed malformed original is still downloaded literally',storedRaw.bytes===F.L0);
   await key(page,statusButton(page,'Discard stored raw copy'));const rawResolved=await snapshot(page);
   T('explicit raw resolution does not resolve imported-active warning or earlier draft',rawResolved.stored===null&&rawResolved.pendingActive.id==='incoming-active-oracle'&&rawResolved.activeError===activeBlocked.activeError&&rawResolved.active===earlierStored.active);
   await key(page,statusButton(page,'Discard imported workout'));const restored=await snapshot(page);
   T('discard imported copy restores the independent earlier six-rep warning',restored.pendingActive===null&&restored.activeError===earlier.activeError&&restored.active===earlierStored.active&&await page.evaluate(()=>LOG.hex_dl.reps[0]==='6'));
   const currentFile=await download(page,'Download current workout');const current=JSON.parse(currentFile.bytes).activeWorkout;
   T('current-workout file still has original identity and actual unsaved six reps',current.id==='active-oracle-1'&&current.log.hex_dl.reps[0]==='6');
   const currentRestore=await restoreActiveFile(currentFile,'active-oracle-1','6',theme);
   await mode(page,{});await key(page,statusButton(page,'Retry save'));const activeRetried=await snapshot(page);
   T('explicit active retry finally updates that same earlier identity',JSON.parse(activeRetried.active).id==='active-oracle-1'&&JSON.parse(activeRetried.active).log.hex_dl.reps[0]==='6'&&!activeRetried.activeError);
   evidence.push({case:'2/5/12 combined import',theme,setupLimit:'Settings view selected directly after real Resume/edit; active-screen navigation does not expose Settings. Import chooser and all failure/retry/download/discard controls are real.',earlierStored,earlier,rawBlocked,currentRaw,importFile,importedRestore,mainBlocked,activeBlocked,storedRaw,rawResolved,restored,currentFile,currentRestore,activeRetried,dialogs:h.dialogs});write();
  }finally{await h.ctx.close()}
 }
 // Case7: a second real tab acts as an external writer; original app must not replay P.
 {
  const h=await create({stored:F.C0,fault:{},label:'external-source'}),{page}=h,S='externally changed source S';
  try{
   await past(page);const actor=await h.tab(false);await actor.evaluate(value=>__rawSet('rft-v12',value),S);
   await key(page,statusButton(page,'Retry save'));const conflicted=await snapshot(page);
   T('external main actor is not overwritten on pending retry',conflicted.main===S&&conflicted.stored===F.C0&&conflicted.active===F.A0&&pendingId(conflicted)&&conflicted.callbacks===0&&conflicted.raw===F.R&&conflicted.mainError.includes('outside this tab'));
   const rawFile=await download(page,'Download current raw original'),pendingFile=await download(page,'Download pending changes');
   await key(page,statusButton(page,'Discard current raw original'));const released=await snapshot(page);
   T('current original can be explicitly resolved without deadlock or implicit P/S/C0/A0 deletion',released.raw===null&&released.main===S&&released.stored===F.C0&&released.active===F.A0&&pendingId(released)&&rawFile.bytes===F.R);
   await key(page,statusButton(page,'Retry save'));const stillConflicted=await snapshot(page);T('resolution never acknowledges external main or automatically replays P',stillConflicted.main===S&&pendingId(stillConflicted)&&stillConflicted.callbacks===0);
   const freshReader=await h.tab(false),review=await snapshot(freshReader);
   T('fresh-source review remains reachable while pending proposal stays in owner tab',review.main===S&&review.raw===S&&review.stored===F.C0&&review.active===F.A0&&pendingId(await snapshot(page))&&JSON.parse(pendingFile.bytes).sessions.some(s=>s.id==='recovery-save-1'));
   evidence.push({case:'7 external source',external:S,conflicted,rawFile,pendingFile,released,stillConflicted,review,dialogs:h.dialogs});write();
  }finally{await h.ctx.close()}
 }
 // Case3: unreadable legacy bytes survive until verified parking plus main retry.
 {
  const h=await create({main:null,legacy:F.L0,label:'legacy'}),{page}=h;
  try{await past(page);const blocked=await snapshot(page);T('legacy failure retains absent main and exact L0/A0',blocked.main===null&&blocked.legacy===F.L0&&blocked.active===F.A0&&pendingId(blocked));
   const rawFile=await download(page,'Download current raw original');T('malformed legacy download is exact, not promised parsed import',rawFile.bytes===F.L0);
   await mode(page,{});await key(page,statusButton(page,'Retry save'));const retried=await snapshot(page);
   T('legacy is cleaned only after original preservation and main commit',retried.stored===F.L0&&retried.legacy===null&&JSON.parse(retried.main).sessions.filter(s=>s.id==='recovery-save-1').length===1&&retried.callbacks===1);
   evidence.push({case:'3',blocked,rawFile,retried});write();
  }finally{await h.ctx.close()}
 }
 // Case4: payload success is separate from each optional counter and readback.
 for(const suffix of ['-n','-repaired']){
  const h=await create({fault:{set:[C+suffix]},label:'metadata'+suffix}),{page}=h;
  try{const loaded=await snapshot(page);T('optional '+suffix+' failure does not pretend durable payload was lost',loaded.stored===F.R&&loaded.raw===null&&loaded.rawNotice.includes('raw original is preserved'));
   await past(page);const committed=await snapshot(page);T('verified payload permits actual main save despite optional '+suffix+' failure',committed.pending===null&&committed.callbacks===1&&committed.stored===F.R);
   evidence.push({case:'4 optional '+suffix,loaded,committed});write();
  }finally{await h.ctx.close()}
 }
 {
  const h=await create({fault:{failRawReadAfterWrite:true},label:'readback'}),{page}=h;
  try{await past(page);const blocked=await snapshot(page);T('real raw write with failed readback does not permit main replacement',blocked.stored===F.R&&blocked.main===F.R&&blocked.raw===F.R&&pendingId(blocked)&&blocked.callbacks===0);
   await mode(page,{});await key(page,statusButton(page,'Retry save'));const retried=await snapshot(page);T('restored readback verifies same raw and retries exact proposal',retried.raw===null&&retried.stored===F.R&&retried.pending===null&&retried.callbacks===1);
   evidence.push({case:'4 readback',blocked,retried});write();
  }finally{await h.ctx.close()}
 }
 // Case11: inspect/download P while alive, then honestly show RAM P does not survive reload.
 {
  const h=await create({label:'forced-reload'}),{page}=h;
  try{await past(page);const file=await download(page,'Download pending changes');const before=await snapshot(page);
   T('download leaves original/proposal and exit obligation unresolved',before.raw===F.R&&pendingId(before)&&await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented}));
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>canWriteStore());const reloaded=await snapshot(page);
   T('forced reload recovers durable original but does not claim RAM proposal persisted',reloaded.main===F.R&&reloaded.raw===F.R&&reloaded.pending===null&&JSON.parse(file.bytes).sessions.filter(s=>s.id==='recovery-save-1').length===1);
   evidence.push({case:'11 forced reload',file,before,reloaded,dialogs:h.dialogs});write();
  }finally{await h.ctx.close()}
 }
};
