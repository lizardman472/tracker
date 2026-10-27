// Phone-control direct return. Invoked by recovery.browser; no parallel browser jobs.
module.exports=async function({T,baseStore,open,keyActivate,screenshot,ago}){
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 async function openExercise(page,ex){
  const current=page.locator('#ex-cur');
  // The selected exercise is a group, not an exercise-selection button.
  if(await current.count()!==1||await current.getAttribute('data-exercise')!==ex.id)
   await keyActivate(page,page.getByRole('button',{name:new RegExp(esc(ex.nm))}).first());
  const card=page.getByRole('group',{name:ex.nm+' exercise',exact:true});await card.waitFor({state:'visible'});
  const selected=await card.getAttribute('data-exercise');
  T('phone helper opens the requested exercise through its actual card: '+ex.id,selected===ex.id);
  if(selected!==ex.id)throw Error('Requested '+ex.id+' but opened '+selected);
  return card;
 }
 async function enterExercise(page,id,{wt,band,rir='3'}={}){
  const ex=await page.evaluate(id=>{const e=dayExs(ADAY).find(e=>e.id===id);return{...e,inputLabel:repInputLabel(e)}},id);
  const card=await openExercise(page,ex);
  if(band)await card.getByLabel('Band for '+ex.nm,{exact:true}).selectOption(band);
  for(let i=1;i<=ex.s;i++){
   if(wt)await card.getByLabel(`Set ${i} weight, kilograms`,{exact:true}).fill(String(wt));
   await card.getByLabel(`Set ${i} ${ex.inputLabel}`,{exact:true}).fill(String(ex.tg*(ex.perSide?2:1)));
   await keyActivate(page,card.getByRole('button',{name:`Set ${i} done`,exact:true}));
  }
  await keyActivate(page,card.locator('.form-row1').getByRole('button',{name:'4',exact:true}));
  const effort=card.getByLabel('Clean reps left after your hardest set (estimate)',{exact:true});
  T('reps-left input matches the actual routine: '+id,(await effort.count())===(ex._short?1:0));
  if(ex._short)await effort.selectOption(rir);
 }
 async function finishAndSave(page){
  await openExercise(page,await page.evaluate(()=>dayExs(ADAY).at(-1)));
  await keyActivate(page,page.getByRole('button',{name:'Finish ✓',exact:true}));
  await keyActivate(page,page.locator('.diff-pick').nth(2));
  await keyActivate(page,page.getByRole('button',{name:'Save ✓',exact:true}));
  await page.waitForFunction(()=>VIEW==='home'&&!PENDING_SAVE);
 }
 async function setDay(page,date,offset){const time=new Date(date+'T12:00:00');time.setDate(time.getDate()+offset);await page.clock.setFixedTime(time);await page.evaluate(()=>render())}
 for(const theme of ['light','dark']){
  const store=baseStore();Object.assign(store,{theme,phase:1,phaseStart:ago(35),nextDay:'A',lastDeload:null,trainingPlan:null,comeback:null});
  store.sessions=[2,4].map((days,i)=>({id:'pre-rest-b-'+i,date:ago(days),day:'B',loc:'home',phase:1,difficulty:3,
   ex:[{id:'hex_squat_b',wt:40,reps:[8,8,8],form:[4,4,4],band:''}]}));
  const {ctx,page,errors}=await open(store),start=await page.evaluate(()=>today());
  await page.getByText('Recovery plan and routine choices',{exact:true}).click();
  await keyActivate(page,page.getByRole('button',{name:'Start deload today',exact:true}));
  await keyActivate(page,page.getByRole('button',{name:'Start Deload week · Day A',exact:true}));
  for(const id of ['hex_dl','lm_squat','floor_press'])await enterExercise(page,id,{wt:30,rir:'4'});
  await enterExercise(page,'pullup_a',{band:'Green',rir:'4'});await finishAndSave(page);
  const afterDeload=await page.evaluate(()=>({history:JSON.stringify(normalizeState(D).W.sessions),phase:D.phase,clock:D.phaseStart,next:D.nextDay,lastDeload:D.lastDeload}));
  T('direct-return fixture saves one actual six-set deload A '+theme,await page.evaluate(()=>{
   const s=D.sessions.at(-1);return s.day==='A'&&s.trainingStage==='deload'&&s.trainingComplete===true&&s.noProg&&s.ex.reduce((n,e)=>n+e.reps.filter(r=>r>0).length,0)===6&&D.nextDay==='B';
  }));
  await setDay(page,start,7);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>canWriteStore());
  T('seven days off alone do not create workouts or switch the routine '+theme,await page.evaluate(b=>JSON.stringify(normalizeState(D).W.sessions)===b.history&&D.trainingPlan.stage==='deload'&&D.nextDay==='B',afterDeload));
  await page.getByText('Plan details and routine choices',{exact:true}).click();
  await page.getByRole('button',{name:'Resume original A/B/C after rest',exact:true}).scrollIntoViewIfNeeded();
  await screenshot(page,'direct-original-choice-'+theme,{target:'button[onclick="resumeOriginalAfterRest()"]',text:'Resume original A/B/C after rest',top:false});
  page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());
  await keyActivate(page,page.getByRole('button',{name:'Resume original A/B/C after rest',exact:true}));
  T('declining direct return preserves the recovery stage and history '+theme,await page.evaluate(b=>D.trainingPlan.stage==='deload'&&!D.originalResume&&JSON.stringify(normalizeState(D).W.sessions)===b.history,afterDeload));
  page.on('dialog',d=>d.accept());await keyActivate(page,page.getByRole('button',{name:'Resume original A/B/C after rest',exact:true}));
  const marker=await page.evaluate(()=>structuredClone(D.originalResume));
  T('direct return restores original B, normal lists and existing phase clock without history edits '+theme,await page.evaluate(b=>{
   const rows=dayExs('B',{},true),normal=originalEssentials(D.phase).B;
   return !D.trainingPlan&&D.originalResume&&D.phase===b.phase&&D.phaseStart===b.clock&&D.lastDeload===b.lastDeload&&D.nextDay===b.next&&
    JSON.stringify(normalizeState(D).W.sessions)===b.history&&JSON.stringify(rows.map(e=>[e.id,e.s,e.tg]))===JSON.stringify(normal.map(e=>[e.id,e.s,e.tg]))&&
    rows.length>=8&&rows.reduce((n,e)=>n+e.s,0)>=24&&getSmartSugg(rows.find(e=>e.id==='hex_squat_b')).type==='stay';
  },afterDeload));
  await screenshot(page,'direct-original-return-'+theme,{target:'#training-plan',text:'Original A/B/C Essentials',top:false,nav:true});
  await keyActivate(page,page.getByRole('button',{name:/^Start Essentials/}));
  T('original B entry starts with the captured context and held weight '+theme,await page.evaluate(id=>ADAY==='B'&&dayExs('B').length>=8&&activeRecord().originalResumeId===id&&LOG.hex_squat_b.wt===40,marker.id));
  await enterExercise(page,'hex_squat_b',{wt:40});
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem(AW_KEY)));
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>canWriteStore());
  await keyActivate(page,page.getByRole('button',{name:'Resume',exact:true}));
  T('original draft reload retains actual entries and original context '+theme,await page.evaluate(d=>activeRecord().originalResumeId===d.originalResumeId&&ACTIVE_ID===d.id&&LOG.hex_squat_b.setDone.every(Boolean),draft));
  await openExercise(page,await page.evaluate(()=>dayExs(ADAY).find(e=>e.id==='hex_squat_b')));
  await page.locator('#ex-cur').scrollIntoViewIfNeeded();
  await screenshot(page,'direct-original-entry-'+theme,{target:'#ex-cur',text:'Hex Bar Squat',top:false});
  // Exercise the existing recovery-file UI with the actual unfinished record.
  await page.evaluate(()=>{window.originalResumeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===AW_KEY)throw Error('Synthetic active-write failure');return window.originalResumeSetItem.call(this,k,v)}});
  await page.getByLabel('Set 1 reps',{exact:true}).fill(String(draft.log.hex_squat_b.reps[0]));
  await page.getByRole('button',{name:'Download current workout',exact:true}).waitFor();
  const activeDownload=page.waitForEvent('download');await keyActivate(page,page.getByRole('button',{name:'Download current workout',exact:true}));
  const activeFile=await activeDownload,activeStream=await activeFile.createReadStream();let activeRaw='';for await(const chunk of activeStream)activeRaw+=chunk;
  const activeBackup=JSON.parse(activeRaw);T('unfinished recovery download retains captured context and real draft identity '+theme,
   activeBackup.activeWorkout.id===draft.id&&activeBackup.activeWorkout.originalResumeId===marker.id);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalResumeSetItem});
  await keyActivate(page,page.getByRole('button',{name:'Retry save',exact:true}));
  const empty=baseStore();Object.assign(empty,{sessions:[],trainingPlan:null,comeback:null});
  const activeRestore=await open(empty);await setDay(activeRestore.page,start,7);
  await keyActivate(activeRestore.page,activeRestore.page.getByRole('button',{name:'Settings',exact:true}));
  await activeRestore.page.locator('#import-backup').setInputFiles({name:activeFile.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(activeRaw)});
  await activeRestore.page.waitForFunction(id=>D.originalResume?.id===id&&!PENDING_ACTIVE,marker.id);
  await keyActivate(activeRestore.page,activeRestore.page.getByRole('button',{name:'Today',exact:true}));
  await keyActivate(activeRestore.page,activeRestore.page.getByRole('button',{name:'Resume',exact:true}));
  await finishAndSave(activeRestore.page);await activeRestore.page.reload({waitUntil:'domcontentloaded'});await activeRestore.page.waitForFunction(()=>canWriteStore());
  T('actual unfinished file import, Resume, finish, save and reload retain one tagged session '+theme,await activeRestore.page.evaluate(({id,context})=>
   D.sessions.filter(s=>s.id===id).length===1&&D.sessions.find(s=>s.id===id).originalResumeId===context&&D.nextDay==='C',{id:draft.id,context:marker.id}));
  T('unfinished recovery-file route has no browser errors '+theme,activeRestore.errors.length===0,activeRestore.errors.join('\n'));await activeRestore.ctx.close();
  await finishAndSave(page);const first=await page.evaluate(()=>structuredClone(D.sessions.at(-1)));
  T('actual original save advances B to C and cannot combine with old successes '+theme,await page.evaluate(({id,sessionId})=>{
   const s=D.sessions.find(s=>s.id===sessionId),ex=dayExs('B',{},true).find(e=>e.id==='hex_squat_b');
   return s.originalResumeId===id&&s.day==='B'&&s.ex.find(e=>e.id===ex.id).reps.every(r=>r===ex.tg)&&D.nextDay==='C'&&getSmartSugg(ex).type==='cf';
  },{id:marker.id,sessionId:first.id}));
  await keyActivate(page,page.getByRole('button',{name:'History',exact:true}));
  await keyActivate(page,page.locator('#history-'+first.id));
  await screenshot(page,'direct-original-history-'+theme,{target:'#app .sec',text:'History'});
  await keyActivate(page,page.getByRole('button',{name:'Settings',exact:true}));
  const downloaded=page.waitForEvent('download');await keyActivate(page,page.getByRole('button',{name:'↓ Export',exact:true}));
  const download=await downloaded,stream=await download.createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;
  const backup=JSON.parse(raw);T('actual exported file retains marker and real session tag '+theme,backup.originalResume.id===marker.id&&backup.sessions.find(s=>s.id===first.id).originalResumeId===marker.id);
  const fresh=baseStore();Object.assign(fresh,{sessions:[],phase:1,phaseStart:ago(0),nextDay:'A',trainingPlan:null,comeback:null});
  const restored=await open(fresh);await setDay(restored.page,start,7);
  await keyActivate(restored.page,restored.page.getByRole('button',{name:'Settings',exact:true}));
  await restored.page.locator('#import-backup').setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(raw)});
  await restored.page.waitForFunction(id=>D.originalResume?.id===id,marker.id);
  await restored.page.reload({waitUntil:'domcontentloaded'});await restored.page.waitForFunction(()=>canWriteStore());
  T('fresh file restore and reload preserve clock, next C, history and fresh-only confirm '+theme,await restored.page.evaluate(({backup,id})=>{
   const ex=dayExs('B',{},true).find(e=>e.id==='hex_squat_b');return D.originalResume.id===id&&D.nextDay==='C'&&D.phaseStart===backup.phaseStart&&
    JSON.stringify(normalizeState(D).W.sessions)===JSON.stringify(normalizeState(backup).W.sessions)&&getSmartSugg(ex).type==='cf';
  },{backup,id:marker.id}));
  await setDay(restored.page,start,9);
  await keyActivate(restored.page,restored.page.locator('.dpick').getByRole('button',{name:'B',exact:true}));
  await keyActivate(restored.page,restored.page.getByRole('button',{name:/^Start Essentials/}));
  await enterExercise(restored.page,'hex_squat_b',{wt:40});await finishAndSave(restored.page);
  T('a second actual post-return target earns the original confirm-lift increase '+theme,await restored.page.evaluate(id=>{
   const ex=dayExs('B',{},true).find(e=>e.id==='hex_squat_b'),s=getSmartSugg(ex);
   return D.sessions.filter(s=>s.originalResumeId===id).length===2&&s.type==='up'&&s.wt>40&&D.nextDay==='C';
  },marker.id));
  await screenshot(restored.page,'direct-original-earned-'+theme,{target:'#training-plan',text:'Original A/B/C Essentials'});
  for(const damage of ['future','corrupt']){
   const bad=structuredClone(backup);if(damage==='future'){const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+8);bad.originalResume.date=d.toISOString().slice(0,10)}else bad.originalResume.id='broken';
   const check=await open({...fresh,theme});await setDay(check.page,start,7);
   await keyActivate(check.page,check.page.getByRole('button',{name:'Settings',exact:true}));
   await check.page.locator('#import-backup').setInputFiles({name:'unusable-boundary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
   await check.page.waitForFunction(()=>!!D.originalResume);await check.page.reload({waitUntil:'domcontentloaded'});await check.page.waitForFunction(()=>canWriteStore());
   T(damage+' imported boundary stays visibly held after real reload '+theme,await check.page.locator('#training-plan').innerText().then(t=>t.includes('Starting loads and progression stay held'))&&
    await check.page.evaluate(()=>getSmartSugg(dayExs('B',{},true).find(e=>e.id==='hex_squat_b')).type==='stay'));
   await keyActivate(check.page,check.page.locator('.dpick').getByRole('button',{name:'B',exact:true}));
   await keyActivate(check.page,check.page.getByRole('button',{name:/^Start Essentials/}));
   T(damage+' imported boundary cannot initialize an old earned increase '+theme,await check.page.evaluate(()=>Number(LOG.hex_squat_b.wt)<=40&&LOG.rear_delt.bands.every(b=>b==='')));
   T(damage+' boundary route has no browser errors '+theme,check.errors.length===0,check.errors.join('\n'));await check.ctx.close();
  }
  T('direct original route has no browser errors or phone overflow '+theme,errors.length===0&&restored.errors.length===0&&await restored.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),[...errors,...restored.errors].join('\n'));
  await restored.ctx.close();await ctx.close();
 }
};
