// R4 actual downloaded bytes -> chooser -> context choice -> Resume/save/reload.
module.exports=async function({browser,origin,T,errors}){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),F=require('./fixtures/backup-state'),SK='rft-v12',AW='rft-active';
 const output=path.join(__dirname,'..','test-results','recovery-layout'),evidence=[],files=[];fs.mkdirSync(output,{recursive:true});
 const copy=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const write=()=>{fs.writeFileSync(path.join(output,'backup-browser-evidence.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(output,'backup-downloads.json'),JSON.stringify(files,null,2))};
 const key=async(page,locator)=>{await locator.focus();await page.keyboard.press('Enter')},nav=(page,name)=>key(page,page.locator('#nav').getByRole('button',{name,exact:true}));
 async function create({main=F.MAIN,active=null,theme='light',label='backup'}={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme});ctx.setDefaultTimeout(20000);ctx.setDefaultNavigationTimeout(20000);
  const dialogs=[];let downloads=0;console.log('BACKUP_CASE_START',label);
  await ctx.addInitScript(({origin,main,active,theme})=>{
   if(location.origin!==origin)return;const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   if(get.call(localStorage,'backup-test-seeded')===null){set.call(localStorage,'rft-v12',typeof main==='string'?main:JSON.stringify({...main,theme}));if(active!==null)set.call(localStorage,'rft-active',typeof active==='string'?active:JSON.stringify(active));set.call(localStorage,'backup-test-mode','{}');set.call(localStorage,'backup-test-seeded','1')}
   window.__backupOps=[];window.__backupGet=k=>get.call(localStorage,k);window.__backupSet=(k,v)=>set.call(localStorage,k,v);
   const mode=()=>JSON.parse(get.call(localStorage,'backup-test-mode')||'{}');
   Storage.prototype.getItem=function(k){const failed=(mode().get||[]).includes(k);window.__backupOps.push({op:'get',key:k,accepted:!failed});if(failed)throw new DOMException('Synthetic read','SecurityError');return get.call(this,k)};
   Storage.prototype.setItem=function(k,v){const failed=(mode().set||[]).includes(k);window.__backupOps.push({op:'set',key:k,value:String(v),accepted:!failed});if(failed)throw new DOMException('Synthetic quota','QuotaExceededError');return set.call(this,k,v)};
   Storage.prototype.removeItem=function(k){const failed=(mode().remove||[]).includes(k);window.__backupOps.push({op:'remove',key:k,accepted:!failed});if(failed)throw new DOMException('Synthetic remove','SecurityError');return remove.call(this,k)};
  },{origin,main,active,theme});
  function accept(d){dialogs.push({type:d.type(),message:d.message(),action:'accept'});return d.accept()}
  ctx.on('page',p=>{p.on('pageerror',e=>errors.push('BACKUP '+label+': '+e.message));p.on('dialog',accept);p.on('download',()=>downloads++)});
  async function tab(writer=true,stale=false){const page=await ctx.newPage();if(stale)await page.addInitScript(()=>window.addEventListener('storage',e=>e.stopImmediatePropagation(),true));await page.clock.install({time:new Date('2026-11-01T12:00:00')});await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>WRITER_READY);if(writer)await page.waitForFunction(()=>canWriteStore());return page}
  return{ctx,page:await tab(),tab,dialogs,accept,get downloads(){return downloads}};
 }
 const mode=(p,value)=>p.evaluate(value=>__backupSet('backup-test-mode',JSON.stringify(value)),value);
 const status=(p,name)=>p.locator('#save-status').getByRole('button',{name,exact:true});
 const snapshot=p=>p.evaluate(()=>({main:__backupGet('rft-v12'),active:__backupGet('rft-active'),writer:canWriteStore(),pending:structuredClone(PENDING_SAVE),pendingActive:structuredClone(PENDING_ACTIVE),
  mainError:SAVE_ERROR,activeError:AW_ERROR,backupError:BACKUP_ERROR,raw:RECOVERY_RAW,rawError:RECOVERY_ERROR,baseRaw:ACTIVE_BASE_RAW,activeId:ACTIVE_ID,log:structuredClone(LOG),notes:SNOTES,wu:[...WU_CHECKS],operations:structuredClone(__backupOps)}));
 async function download(p,control,label){const event=p.waitForEvent('download');await key(p,control);const file=await event,stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks),name='backup-file-'+label+'.json';fs.writeFileSync(path.join(output,name),bytes);const record={label,name,suggestedName:file.suggestedFilename(),sha256:hash(bytes),byteLength:bytes.length};files.push(record);write();return{...record,bytes:bytes.toString('utf8'),value:JSON.parse(bytes.toString('utf8'))}}
 async function capture(p,name,target,text){const element=p.locator(target).first();await element.evaluate(el=>{el.style.scrollMarginTop='350px';el.scrollIntoView({block:'center',behavior:'instant'})});await p.evaluate(async()=>{for(const a of document.getAnimations())if(a.effect?.getComputedTiming().iterations!==Infinity)a.finish();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});T('backup capture has meaningful visible target '+name,await element.isVisible()&&(await element.innerText()).toLowerCase().includes(text.toLowerCase()));await p.screenshot({path:path.join(output,name+'.png'),animations:'disabled'})}
 async function importFile(p,file){await nav(p,'Settings');const chooser=p.waitForEvent('filechooser');await key(p,p.getByRole('button',{name:'↑ Import',exact:true}));await(await chooser).setFiles({name:file.name,mimeType:'application/json',buffer:Buffer.from(file.bytes)});await p.waitForFunction(()=>!IMPORT_BUSY)}
 async function exercise(p,id){const current=p.locator('#ex-cur');if(await current.count()&&await current.getAttribute('data-exercise')===id)return;const name=await p.evaluate(id=>dayExs(ADAY).find(e=>e.id===id).nm,id);await key(p,p.locator('button.ex-row').filter({hasText:name}).first())}
 async function assertFields(p,expected,label){const actual=await p.evaluate(()=>({id:ACTIVE_ID,tag:ACTIVE_ORIGINAL_RESUME,start:SS,notes:SNOTES,wu:WU_CHECKS,log:structuredClone(LOG),loc:D.location,phase:D.phase,plan:structuredClone(D.trainingPlan),stored:JSON.parse(localStorage.getItem(AW_KEY))}));
  T('restored identity/start/notes/warmup '+label,actual.id===expected.id&&actual.start===expected.start&&actual.notes===expected.notes&&equal(actual.wu,expected.wu)&&(!expected.originalResumeId||actual.tag===expected.originalResumeId),JSON.stringify(actual));
  T('restored active context remains explicit Home/phase1 '+label,actual.loc==='home'&&actual.phase===1&&actual.stored.loc==='home'&&actual.stored.phase===1);
  if(expected.exIds)T('restored original prescription identifiers/swaps '+label,equal(actual.stored.exIds,expected.exIds)&&equal(actual.stored.swaps,expected.swaps||{}));
  if(expected.plan)T('restored shorter plan context '+label,actual.plan?.stage==='progress'&&actual.plan.phase===1&&actual.plan.loads.hex_dl===40&&actual.plan.bands.pullup_a==='Green');
  for(const[id,fields]of [['hex_dl',expected.hex],['pullup_a',expected.pullup]])if(fields)for(const[field,value]of Object.entries(fields)){const observed=actual.log[id]?.[field],numeric=['reps','wts','form','setTs'].includes(field);T('restored '+id+'.'+field+' '+label,numeric?equal(observed?.map(Number),value.map(Number)):equal(observed,value),JSON.stringify({observed,expected:value}))}
  return actual;
 }
 async function summary(p){const last=await p.evaluate(()=>dayExs(ADAY).at(-1).id);await exercise(p,last);await key(p,p.getByRole('button',{name:'Finish ✓',exact:true}));await key(p,p.locator('button[onclick="SDIFF=3;render()"]'));if(await p.locator('#finish-reason').count())await p.locator('#finish-reason').selectOption('time')}
 async function completedFields(p,expected,label,{legacy=false,phaseRecovery=false}={}){
  const observed=await p.evaluate(id=>({record:structuredClone(D.sessions.find(s=>s.id===id)),discomfort:structuredClone(D.discomfort)}),expected.id);
  const rule=copy(legacy?F.COMPLETED_LEGACY:expected.plan?F.COMPLETED_UI:F.COMPLETED_FIXTURE);
  if(!legacy&&!expected.plan){const first=Number(expected.hex.reps[0]);rule.rows.hex_dl.reps=F.COMPLETED_REPS[first];rule.volume=F.COMPLETED_VOLUME[first];rule.notes=expected.notes}
  T('completed exact identity/no phantom exercise '+label,observed.record?.id===expected.id&&equal(observed.record.ex.map(e=>e.id).sort(),Object.keys(rule.rows).sort()),JSON.stringify(observed));
  for(const[field,value]of Object.entries(rule))if(field!=='rows')T('completed '+field+' '+label,equal(observed.record?.[field],value),JSON.stringify({actual:observed.record?.[field],expected:value}));
  for(const[id,fields]of Object.entries(rule.rows)){const row=observed.record?.ex.find(e=>e.id===id);for(const[field,value]of Object.entries(fields))T('completed '+id+'.'+field+' '+label,equal(row?.[field],value),JSON.stringify({actual:row?.[field],expected:value}));if(!expected.plan)T('completed scalar weight has no unused override claim '+id+' '+label,row?.wts===undefined)}
  const tag=phaseRecovery||expected.plan?undefined:expected.originalResumeId;T('completed tag follows existing anchor eligibility '+label,observed.record?.originalResumeId===tag);
  if(!expected.plan)T('ordinary restored completion acquires no shorter-plan stage '+label,observed.record?.trainingStage===undefined&&observed.record?.express===undefined);
  if(!legacy)T('completed discomfort retains explicit Knee report '+label,observed.discomfort.some(d=>d.date==='2026-11-01'&&d.exId==='hex_dl'&&d.level==='mild'&&d.joint==='Knee'));
  return observed;
 }
 async function finish(p,id,label,phaseRecovery=false){await summary(p);const summaryBoundary=await p.evaluate(()=>({id:window._S.id,originalResumeId:window._S.originalResumeId,currentOriginalResume:structuredClone(D.originalResume)}));if(phaseRecovery)T('phase recovered tag is present at real summary boundary before existing final eligibility '+label,summaryBoundary.originalResumeId==='original-backup-oracle'&&summaryBoundary.currentOriginalResume===null);await key(p,p.getByRole('button',{name:'Save ✓',exact:true}));await p.waitForFunction(()=>!PENDING_SAVE&&VIEW==='home');await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>canWriteStore());
  T('restored workout finishes/saves/reloads once '+label,await p.evaluate(id=>D.sessions.filter(s=>s.id===id).length===1&&localStorage.getItem(AW_KEY)===null,id));return{...await snapshot(p),summaryBoundary}
 }
 async function restore(file,expected,label,{theme='light',finishIt=true,occupied=false,failures=false,setsShot=false,legacyGuard=false,addChecked=false,phaseRecovery=false}={}){
  const initial={...copy(F.MAIN),sessions:[],originalResume:null,trainingPlan:null,resetEpoch:'0'},destination=copy(F.DRAFT);destination.id='occupied-destination';destination.resetEpoch='0';destination.notes='Occupied destination notes only keep';destination.wu=[false,false,false];destination.log={hex_dl:{wt:7,reps:['','',''],form:[0,0,0],setDone:[false,false,false],notes:'',touched:false}};
  const h=await create({main:initial,active:occupied?destination:null,theme,label:'restore-'+label}),p=h.page;
  try{
   let cancelled=null,blockedMain=null,blockedActive=null;
   if(occupied){const before=await snapshot(p);p.removeAllListeners('dialog');p.once('dialog',async d=>{h.dialogs.push({message:d.message(),action:'cancel'});await d.dismiss()});await importFile(p,file);p.on('dialog',h.accept);cancelled=await snapshot(p);T('occupied actual chooser cancellation preserves exact main/active '+label,cancelled.main===before.main&&cancelled.active===before.active&&cancelled.pending===null)}
   if(failures)await mode(p,{set:[SK,AW]});await importFile(p,file);
   if(failures){await p.waitForFunction(()=>!!PENDING_SAVE);blockedMain=await snapshot(p);T('actual file import main failure retains exact notes-only occupied bytes/pending '+label,blockedMain.pending!==null&&blockedMain.active===cancelled.active&&blockedMain.main===cancelled.main);await mode(p,{set:[AW]});await key(p,status(p,'Retry save'));await p.waitForFunction(()=>!PENDING_SAVE&&!!PENDING_ACTIVE);blockedActive=await snapshot(p);T('actual file import active failure retains exact notes-only earlier draft '+label,blockedActive.active===cancelled.active&&blockedActive.pendingActive.id===expected.id);await mode(p,{});await key(p,status(p,'Retry save'))}
   await p.waitForFunction(()=>!PENDING_SAVE&&!PENDING_ACTIVE&&!IMPORT_BUSY);
   let phaseChoice=null;if(phaseRecovery){await nav(p,'Settings');const before=await snapshot(p);T('phase restore keeps declared incompatible contexts until explicit choice '+label,await p.evaluate(()=>D.phase===2&&D.originalResume.id==='original-main-phase2'&&JSON.parse(localStorage.getItem(AW_KEY)).phase===1));
    await key(p,p.locator('#phase-control button[onclick="setPhase(3)"]'));T('unrelated visible phase3 cannot bypass saved workout '+label,(await snapshot(p)).main===before.main&&(await snapshot(p)).active===before.active);
    p.removeAllListeners('dialog');p.once('dialog',async d=>{h.dialogs.push({message:d.message(),action:'cancel'});await d.dismiss()});await key(p,p.locator('#phase-control button[onclick="setPhase(1)"]'));p.on('dialog',h.accept);const cancelled=await snapshot(p);T('matching visible phase cancellation is byte exact '+label,cancelled.main===before.main&&cancelled.active===before.active);
    await key(p,p.locator('#phase-control button[onclick="setPhase(1)"]'));await p.waitForFunction(()=>D.phase===1);const selected=await snapshot(p);T('explicit phase choice retains draft and applies existing clock/return reset '+label,selected.active===before.active&&await p.evaluate(()=>D.phaseStart==='2026-11-01'&&D.originalResume===null));await capture(p,'backup-phase-choice-'+theme,'#phase-control','Current');phaseChoice={before,cancelled,selected};
   }
   await nav(p,'Today');
   const beforeChoice=await snapshot(p);if(await p.evaluate(()=>!checkResume()))await key(p,p.locator('button[onclick="setLoc(\'home\')"]').first());
   let startCancelled=null;if(legacyGuard){const beforeStart=await snapshot(p);p.removeAllListeners('dialog');p.once('dialog',async d=>{h.dialogs.push({message:d.message(),action:'cancel'});await d.dismiss()});await key(p,p.locator('button[onclick="beginW(\'B\',true)"]').first());p.on('dialog',h.accept);startCancelled=await snapshot(p);T('actual restored legacy Start cancellation retains raw bytes '+label,startCancelled.active===beforeStart.active&&await p.evaluate(()=>!!pendingAW()&&!!checkResume()))}
   T('context choice keeps imported raw record '+label,(await snapshot(p)).active===beforeChoice.active);await key(p,p.getByRole('button',{name:'Resume',exact:true}));const actual=await assertFields(p,expected,label);
   if(setsShot){await exercise(p,'hex_dl');await capture(p,'backup-restored-sets-'+theme,'#ex-cur .set-tbl','Set')}
   if(addChecked){await exercise(p,'hex_dl');await p.getByLabel('Set 1 reps',{exact:true}).fill('5');if(await p.getByRole('button',{name:'Set 1 done',exact:true}).getAttribute('aria-pressed')!=='true')await key(p,p.getByRole('button',{name:'Set 1 done',exact:true}))}
   let completed=null,completedOracle=null;if(finishIt){completed=await finish(p,expected.id,label,phaseRecovery);completedOracle=await completedFields(p,expected,label,{legacy:addChecked,phaseRecovery});await importFile(p,file);await nav(p,'Today');T('reimport actual file never resurrects completed identity '+label,await p.evaluate(id=>D.sessions.filter(s=>s.id===id).length===1&&!checkResume(),expected.id))}
   evidence.push({case:'restore '+label,theme,file:files.find(f=>f.name===file.name),occupiedScope:occupied?'Session-notes-only, zero reps/ratings/checks/warmup, touched:false':null,cancelled,blockedMain,blockedActive,phaseChoice,beforeChoice,startCancelled,actual,completed,completedOracle,dialogs:h.dialogs});write();
  }finally{await h.ctx.close()}
 }
 async function restoreHistory(file,id,label,expected=null){const h=await create({main:{...copy(F.MAIN),sessions:[],originalResume:null,trainingPlan:null},label:'history-'+label}),p=h.page;
  try{await importFile(p,file);await nav(p,'Today');T('actual pending/completed history file has one identity and no Resume '+label,await p.evaluate(id=>D.sessions.filter(s=>s.id===id).length===1&&!checkResume()&&localStorage.getItem(AW_KEY)===null,id));await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>canWriteStore());T('actual history restore survives reload '+label,await p.evaluate(id=>D.sessions.filter(s=>s.id===id).length===1&&!checkResume(),id));const completedOracle=expected?await completedFields(p,expected,label):null;evidence.push({case:'history restore '+label,file:file.name,completedOracle,after:await snapshot(p)});write()}finally{await h.ctx.close()}
 }
 // A/B/D: actual shorter-plan inputs. Literal expected values are independent of app helpers.
 for(const theme of ['light','dark']){
  const main={...copy(F.MAIN),originalResume:null,nextDay:'A',trainingPlan:{stage:'progress',phase:1,start:'2026-10-01',stageStart:'2026-10-20',phaseStart:'2026-10-20',loads:{hex_dl:40},bands:{pullup_a:'Green'}}};
  const h=await create({main,theme,label:'A-B-D-'+theme}),p=h.page;
  try{
   await p.evaluate(()=>{recordId=()=> 'backup-ui-active-1'});await key(p,p.locator('button[onclick="beginW(\'A\',true)"]').first());await p.waitForFunction(()=>ADAY==='A'&&VIEW==='workout');const start=await p.evaluate(()=>SS);
   await key(p,p.locator('#activation-toggle'));for(const i of [0,1])await key(p,p.locator('#wu-check-'+i));await exercise(p,'hex_dl');
   T('A starts hex bar at existing 90% practice load, 36kg '+theme,await p.evaluate(()=>Number(LOG.hex_dl.wt)===36));for(const[i,kg]of [35,45].entries())await p.getByLabel('Set '+(i+1)+' weight, kilograms',{exact:true}).fill(String(kg));
   for(const[i,reps]of [5,7].entries())await p.getByLabel('Set '+(i+1)+' reps',{exact:true}).fill(String(reps));await key(p,p.getByRole('button',{name:'Set 1 done',exact:true}));
   await key(p,p.locator('.form-row1').getByRole('button',{name:'4 Solid · Hex Bar Deadlift · all sets',exact:true}));await p.getByLabel('Clean reps left after your hardest set (estimate)',{exact:true}).selectOption('2');await p.getByLabel('Notes for Hex Bar Deadlift',{exact:true}).fill('UI Hex keep');await p.keyboard.press('Tab');
   await key(p,p.getByRole('button',{name:'Mild',exact:true}));await key(p,p.getByRole('button',{name:'Knee',exact:true}));await exercise(p,'pullup_a');
   const pullName=await p.evaluate(()=>dayExs(ADAY).find(e=>e.id==='pullup_a').nm);await p.getByLabel('Band for '+pullName,{exact:true}).selectOption('Green');
   for(const[i,band]of ['Blue (heaviest)','Green'].entries()){await p.getByLabel('Set '+(i+1)+' band',{exact:true}).selectOption({value:band});await p.getByLabel('Set '+(i+1)+' reps',{exact:true}).fill(String([8,6][i]));await key(p,p.getByRole('button',{name:'Set '+(i+1)+' done',exact:true}))}
   await key(p,p.locator('.form-row1').getByRole('button',{name:'4 Solid · '+pullName+' · all sets',exact:true}));await p.getByLabel('Clean reps left after your hardest set (estimate)',{exact:true}).selectOption('3');
   await p.getByLabel('Notes for '+pullName,{exact:true}).fill('UI Band keep');await p.keyboard.press('Tab');await p.getByLabel('Session Notes',{exact:true}).fill('UI Session keep');await p.keyboard.press('Tab');
   const expected={id:'backup-ui-active-1',start,notes:'UI Session keep',wu:[true,true,false],plan:true,exIds:['hex_dl','lm_squat','floor_press','pullup_a','lm_lateral'],swaps:{},hex:{wt:36,reps:[5,7],wts:[35,45],setDone:[true,false],form:[4,4,4],rir:2,notes:'UI Hex keep',disc:'mild',discJoints:['Knee']},pullup:{band:'Green',reps:[8,6],bands:['Blue (heaviest)','Green'],setDone:[true,true],form:[4,4,4,4],rir:3,notes:'UI Band keep'}};
   const source=await snapshot(p);await capture(p,'backup-live-'+theme,'button[onclick="expD()"]','Export complete backup');const a=await download(p,p.getByRole('button',{name:'Export complete backup',exact:true}),'A-current-'+theme);T('A complete file uses existing activeWorkout envelope and actual stable identity '+theme,a.value.activeWorkout.id==='backup-ui-active-1'&&!Object.hasOwn(a.value,'backupScope'));await restore(a,expected,'A-current-'+theme,{theme,setsShot:true});
   await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>canWriteStore());await nav(p,'Settings');T('B export runs before any Resume '+theme,await p.evaluate(()=>ADAY===null));await capture(p,'backup-before-resume-'+theme,'button[onclick="expD()"]','Export');const b=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'B-before-resume-'+theme);await restore(b,expected,'B-before-resume-'+theme,{theme});
   await key(p,p.locator('button[onclick="setLoc(\'partner\')"]').first());T('D source Home draft is hidden without deletion '+theme,await p.evaluate(()=>!checkResume()&&!!localStorage.getItem(AW_KEY)));await capture(p,'backup-hidden-'+theme,'button[onclick="expD()"]','Export');const d=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'D-hidden-'+theme);T('D file retains independent main/active venues '+theme,d.value.location==='partner'&&d.value.activeWorkout.loc==='home');await restore(d,expected,'D-hidden-'+theme,{theme});
   evidence.push({case:'A/B/D',theme,expected,source,files:[a.name,b.name,d.name],after:await snapshot(p)});write();
  }finally{await h.ctx.close()}
 }
 // B/C/E/I: tagged legacy field fixture, actual Resume/live6 and a stale real reader.
 {
  const h=await create({active:F.DRAFT_RAW,label:'C-E-I'}),p=h.page;
  try{
   await key(p,p.getByRole('button',{name:'Resume',exact:true}));const before=await snapshot(p);await mode(p,{set:[AW]});await p.getByLabel('Set 1 reps',{exact:true}).fill('6');const failed=await snapshot(p);
   const six=await download(p,status(p,'Export complete backup'),'E-I-current-six');const expected=copy(F.EXPECTED);expected.hex.reps[0]=6;expected.exIds=F.RESUMED_EX_IDS;await restore(six,expected,'E-I-current-six');T('E export keeps old bytes and independent unsaved warning',failed.active===before.active&&(await snapshot(p)).active===before.active&&(await snapshot(p)).activeError===failed.activeError);
   const reader=await h.tab(false,true);await nav(reader,'Settings');const changed={...copy(F.MAIN),bodyLog:[{date:'2026-11-01',weight:82}],gen:8};await p.evaluate(value=>__backupSet('rft-v12',JSON.stringify(value)),changed);const operationsBefore=(await snapshot(reader)).operations.length;
   const saved=await download(reader,reader.getByRole('button',{name:'↓ Export',exact:true}),'C-reader-five');T('C stale reader captures fresh saved main/five reps without a write',saved.value.bodyLog[0].weight===82&&saved.value.activeWorkout.log.hex_dl.reps[0]===5&&await reader.evaluate(()=>D.bodyLog.length===0&&!WRITER)&&!(await snapshot(reader)).operations.slice(operationsBefore).some(o=>o.op==='set'||o.op==='remove'));await restore(saved,F.EXPECTED,'C-reader-five');
   evidence.push({case:'C/E/I',before,failed,six:six.name,saved:saved.name,reader:await snapshot(reader),after:await snapshot(p)});write();
  }finally{await h.ctx.close()}
 }
 // G/H/J/N: controlled combined-state setup, real chooser/status/download/restore controls.
 for(const sameId of [false,true]){
  const theme=sameId?'dark':'light',h=await create({active:F.DRAFT_RAW,label:'G-H-J-'+sameId,theme}),p=h.page;
  try{
   await key(p,p.getByRole('button',{name:'Resume',exact:true}));await mode(p,{set:[AW]});await p.getByLabel('Set 1 reps',{exact:true}).fill('6');const earlier=await snapshot(p);
   // The active view intentionally hides Settings; this direct view setup is labelled.
   await p.evaluate(()=>go('settings'));await mode(p,{set:[SK,AW]});const incoming=copy(F.DRAFT);incoming.id=sameId?'backup-active-1':'backup-imported-1';incoming.log.hex_dl.reps[0]='3';incoming.notes='Imported Session keep';
   const incomingFile={name:'synthetic-incoming.json',bytes:JSON.stringify({...F.MAIN,theme,activeWorkout:incoming})};await importFile(p,incomingFile);await p.waitForFunction(()=>!!PENDING_SAVE&&!!PENDING_ACTIVE);const blocked=await snapshot(p),count=h.downloads;
   await key(p,status(p,'Export complete backup'));T('G/J refuses false complete file for distinct or same-ID imported variants '+sameId,h.downloads===count&&(await snapshot(p)).backupError.includes('Different unfinished'));
   await capture(p,'backup-conflicting-copies-'+theme,'#save-status','Different unfinished');
   const imported=await download(p,status(p,'Download imported workout'),'G-imported-'+sameId),current=await download(p,status(p,'Download current workout'),'G-current-'+sameId),saved=await download(p,status(p,'Download saved unfinished workout'),'G-saved-'+sameId);
   const importExpected=copy(F.EXPECTED);importExpected.id=incoming.id;importExpected.hex.reps[0]=3;importExpected.notes='Imported Session keep';const currentExpected=copy(F.EXPECTED);currentExpected.hex.reps[0]=6;currentExpected.exIds=F.RESUMED_EX_IDS;
   await restore(imported,importExpected,'G-imported-'+sameId,{theme,occupied:!sameId,failures:!sameId});await restore(current,currentExpected,'G-current-'+sameId,{theme});await restore(saved,F.EXPECTED,'G-saved-'+sameId,{theme});
   await mode(p,{set:[AW]});await key(p,status(p,'Retry save'));await p.waitForFunction(()=>!PENDING_SAVE&&!!PENDING_ACTIVE);const activeBlocked=await snapshot(p);await key(p,status(p,'Retry complete backup'));T('H still refuses conflicting complete claim after main commits '+sameId,(await snapshot(p)).backupError.includes('Different unfinished')&&(await snapshot(p)).active===earlier.active);
   await key(p,status(p,'Discard imported workout'));T('H imported discard restores earlier warning/six reps '+sameId,(await snapshot(p)).activeError===earlier.activeError&&Number((await snapshot(p)).log.hex_dl.reps[0])===6);
   await capture(p,'backup-unsaved-current-'+theme,'#save-status','Current workout is not saved');
   const resolved=await download(p,status(p,'Retry complete backup'),'H-resolved-six-'+sameId);await restore(resolved,currentExpected,'H-resolved-six-'+sameId,{theme});
   evidence.push({case:'G/H/J/N',sameId,theme,setupLimit:'Direct Settings view setup after real Resume/edit, followed by actual chooser and status controls.',earlier,blocked,activeBlocked,files:[imported.name,current.name,saved.name,resolved.name],after:await snapshot(p)});write();
  }finally{await h.ctx.close()}
 }
 // M: meaningful zero-rep notes/rating/warmup/setup file is truly resumable.
 for(const theme of ['light','dark']){
  const main=copy(F.MAIN);main.phase=2;main.phaseStart='2026-10-20';main.originalResume={id:'original-main-phase2',date:'2026-10-01',phase:2,loads:{hex_dl:40},bands:{pullup_a:'Green'}};
  const h=await create({main,active:F.DRAFT_RAW,theme,label:'matching-phase-'+theme}),p=h.page;
  try{await nav(p,'Settings');const before=await snapshot(p),file=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'matching-phase-'+theme);T('hidden phase file preserves source bytes/contexts before explicit recovery '+theme,file.value.phase===2&&file.value.activeWorkout.phase===1&&(await snapshot(p)).active===before.active);await restore(file,F.EXPECTED,'matching-phase-'+theme,{theme,phaseRecovery:true});evidence.push({case:'matching phase',theme,file:file.name,before,after:await snapshot(p)});write()}finally{await h.ctx.close()}
 }
 // M: meaningful zero-rep notes/rating/warmup/setup file is truly resumable.
 {
  const d=copy(F.DRAFT);d.notes='Zero-rep notes keep';d.log.hex_dl.rir=0;for(const row of Object.values(d.log)){row.reps=['','',''];row.setDone=[false,false,false];row.setTs=[0,0,0]}
  const h=await create({active:d,label:'M-zero-rep'}),p=h.page;
  try{await nav(p,'Settings');const file=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'M-zero-rep');const expected=copy(F.EXPECTED);expected.notes='Zero-rep notes keep';expected.hex.reps=[0,0,0];expected.hex.setDone=[false,false,false];expected.hex.setTs=[0,0,0];expected.hex.rir=0;expected.pullup.reps=[0,0,0];expected.pullup.setDone=[false,false,false];await restore(file,expected,'M-zero-rep',{finishIt:false});evidence.push({case:'M zero-rep',file:file.name,after:await snapshot(p)});write()}finally{await h.ctx.close()}
 }
 // R4-TRAIN-01: absent legacy touch evidence survives actual downloaded-file restore.
 {
  const d=copy(F.DRAFT);d.notes='';d.wu=[];d.swaps={};d.ts=1;d.log={pullup_a:{wt:null,band:'Green',bands:['Green','Blue (heaviest)','Purple'],reps:['','',''],form:[0,0,0],setDone:[false,false,false],notes:'',touched:true}};
  const h=await create({active:d,label:'M-band-setup-only'}),p=h.page;
  try{await nav(p,'Settings');const file=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'M-band-setup-only');const expected={id:'backup-active-1',originalResumeId:'original-backup-oracle',start:1793491200000,notes:'',wu:[false,false,false],pullup:{band:'Green',bands:['Green','Blue (heaviest)','Purple'],reps:[0,0,0],form:[0,0,0],setDone:[false,false,false],notes:''}};await restore(file,expected,'M-band-setup-only',{finishIt:false,legacyGuard:true});evidence.push({case:'M band-only setup',file:file.name,after:await snapshot(p)});write()}finally{await h.ctx.close()}
 }
 {
  const d=copy(F.DRAFT);d.notes='';d.wu=[];d.swaps={};d.ts=1;d.log={hex_dl:{wt:7,reps:['','',''],notes:''}};
  const h=await create({active:d,label:'M-legacy-absence'}),p=h.page;
  try{await nav(p,'Settings');const file=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'M-legacy-absence');T('legacy file preserves absent marker instead of inventing untouched false',!Object.hasOwn(file.value.activeWorkout.log.hex_dl,'touched'));
   const expected={id:'backup-active-1',originalResumeId:'original-backup-oracle',start:1793491200000,notes:'',wu:[false,false,false],hex:{wt:7,reps:[0,0,0],form:[0,0,0],notes:''}};await restore(file,expected,'M-legacy-absence',{legacyGuard:true,addChecked:true});evidence.push({case:'M legacy absence',file:file.name,after:await snapshot(p)});write()
  }finally{await h.ctx.close()}
 }
 // F: actual summary save fails, but the chosen pending completed proposal restores once.
 {
  const h=await create({active:F.DRAFT_RAW,label:'F-summary-failure'}),p=h.page;
  try{await key(p,p.getByRole('button',{name:'Resume',exact:true}));await summary(p);const before=await snapshot(p);await mode(p,{set:[SK]});await key(p,p.getByRole('button',{name:'Save ✓',exact:true}));await p.waitForFunction(()=>!!PENDING_SAVE);const blocked=await snapshot(p);
   const file=await download(p,status(p,'Export complete backup'),'F-pending-summary');const record=file.value.sessions.find(s=>s.id==='backup-active-1');T('F complete pending file contains one completed identity/effort/notes and no redundant active',!file.value.activeWorkout&&record?.difficulty===3&&record.notes==='Session notes keep'&&record.originalResumeId==='original-backup-oracle'&&equal(record.ex.find(e=>e.id==='hex_dl').reps,[5,0,0])&&(await snapshot(p)).active===blocked.active);await restoreHistory(file,'backup-active-1','F-pending-summary',F.EXPECTED);evidence.push({case:'F summary failure',before,blocked,file:file.name,after:await snapshot(p)});write()
  }finally{await h.ctx.close()}
 }
 // K: cleanup leftovers cannot be advertised or restored as a current draft.
 for(const kind of ['completed','old-epoch']){
  const main=copy(F.MAIN);if(kind==='completed')main.sessions.push({id:'backup-active-1',date:'2026-11-01',day:'A',loc:'home',phase:1,notes:'Completed keep',ex:[{id:'hex_dl',wt:40,reps:[5]}]});else main.resetEpoch='new-epoch';
  const h=await create({main,active:F.DRAFT_RAW,label:'K-'+kind}),p=h.page;
  try{await nav(p,'Settings');const before=await snapshot(p),file=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'K-'+kind);T('K excludes leftover without deleting original key '+kind,!file.value.activeWorkout&&(await snapshot(p)).active===before.active);await restoreHistory(file,kind==='completed'?'backup-active-1':'backup-history-1','K-'+kind);evidence.push({case:'K '+kind,file:file.name,before,after:await snapshot(p)});write()}finally{await h.ctx.close()}
 }
 // O: real reader with deterministic external writes during paired reads.
 {
  const h=await create({active:F.DRAFT_RAW,label:'O-changing-pair'});
  try{const p=await h.tab(false);await nav(p,'Settings');await p.evaluate(()=>{const get=Storage.prototype.getItem;window.__backupChanges=0;Storage.prototype.getItem=function(k){const value=get.call(this,k);if(k==='rft-active'&&window.__backupChanges<4){const m=JSON.parse(__backupGet('rft-v12'));m.gen=20+(++window.__backupChanges);__backupSet('rft-v12',JSON.stringify(m))}return value}});const before=await snapshot(p),count=h.downloads;await key(p,p.getByRole('button',{name:'↓ Export',exact:true}));const after=await snapshot(p);T('O changing real reader refuses file without ownership or metadata success',h.downloads===count&&!after.writer&&after.backupError.includes('changed during capture')&&await p.evaluate(()=>window.__backupChanges===4));evidence.push({case:'O changing reader',before,after});write()}finally{await h.ctx.close()}
 }
 // Actual complete control refuses raw/read failures without a download.
 for(const condition of ['read-active','read-main','malformed-active','invalid-form']){
  const invalid=copy(F.DRAFT);invalid.log.hex_dl.form=[99,0,4];const raw=condition==='malformed-active'?'{unreadable raw active':condition==='invalid-form'?JSON.stringify(invalid):F.DRAFT_RAW;
  const h=await create({active:raw,label:'L-M-'+condition}),p=h.page;
  try{await nav(p,'Settings');if(condition.startsWith('read'))await mode(p,{get:[condition==='read-active'?AW:SK]});const before=await snapshot(p),count=h.downloads;await key(p,p.getByRole('button',{name:'↓ Export',exact:true}));const after=await snapshot(p);T('L/M real complete control fails truthfully without file or metadata '+condition,h.downloads===count&&after.main===before.main&&after.active===raw&&!!after.backupError);
   let rawDownload=null;if(!condition.startsWith('read')){const event=p.waitForEvent('download');await key(p,status(p,'Download raw saved workout'));const file=await event,stream=await file.createReadStream();let bytes='';for await(const chunk of stream)bytes+=chunk;rawDownload={suggestedName:file.suggestedFilename(),bytes,sha256:hash(bytes),scope:'Raw original only; malformed bytes are for inspection, not direct import.'};T('actual separately named raw recovery keeps every original byte and warning '+condition,bytes===raw&&(await snapshot(p)).backupError===after.backupError)}
   evidence.push({case:'L/M '+condition,before,after,rawDownload,dialogs:h.dialogs});write()}finally{await h.ctx.close()}
 }
};
