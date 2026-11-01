// Sequential synthetic phone cases; reuses the established browser and capture helpers.
module.exports=async function({T,baseStore,open,keyActivate,tabActivate,settleLayout,screenshot,ago,enterExercise,finishAndSave,setDay}){
 const copy=x=>JSON.parse(JSON.stringify(x));
 async function exportFile(page){
  await keyActivate(page,page.getByRole('button',{name:'Settings',exact:true}));const event=page.waitForEvent('download');
  await keyActivate(page,page.getByRole('button',{name:'↓ Export',exact:true}));const file=await event,stream=await file.createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;
  return{raw,name:file.suggestedFilename(),value:JSON.parse(raw)};
 }
 async function freshImport(file,theme,start){
  const s=baseStore();Object.assign(s,{theme,sessions:[],trainingPlan:null,comeback:null});const result=await open(s);await setDay(result.page,start,7);
  await keyActivate(result.page,result.page.getByRole('button',{name:'Settings',exact:true}));
  await result.page.locator('#import-backup').setInputFiles({name:file.name,mimeType:'application/json',buffer:Buffer.from(file.raw)});
  await result.page.waitForFunction(()=>!!D.originalResume);await result.page.reload({waitUntil:'domcontentloaded'});await result.page.waitForFunction(()=>canWriteStore());return result;
 }
 async function review(page){await tabActivate(page,page.getByRole('button',{name:'Review starting loads',exact:true}));await page.locator('#reference-review-title').waitFor({state:'visible'})}
 async function chooseA(page){await keyActivate(page,page.locator('.dpick').getByRole('button',{name:'A1',exact:true}));
  const start=page.getByRole('button',{name:/^Start Essentials/});if(await start.count())await keyActivate(page,start);else await keyActivate(page,page.getByRole('button',{name:'Day A1 Essentials anyway',exact:true}));}
 for(const theme of ['light','dark']){
  const seed=baseStore(),start=ago(0);Object.assign(seed,{theme,phase:1,phaseStart:ago(35),nextDay:'A',comeback:null,originalResume:null});
  seed.sessions=[{id:'synthetic-regular',date:ago(12),day:'A',loc:'home',phase:1,ex:[
   {id:'hex_dl',wt:80,reps:[5,5,5]}, {id:'lm_squat',wt:40,reps:[8,8,8]}, {id:'floor_press',wt:50,reps:[10,10,10,10]},
   {id:'pullup_a',band:'Green',reps:[8,8,8,8]}, {id:'rear_delt',band:'Purple',reps:[15,15,15]}, {id:'hex_squat_b',wt:60,reps:[6,6,6,6]}]}];
  seed.trainingPlan={stage:'deload',start,stageStart:start,loads:{hex_dl:80,lm_squat:40,floor_press:50,hex_squat_b:60},bands:{pullup_a:'Green',rear_delt:'Purple'}};
  const deload=await open(seed);await setDay(deload.page,start,0);
  await keyActivate(deload.page,deload.page.getByRole('button',{name:'Start Deload week · Day A',exact:true}));
  for(const [id,wt]of [['hex_dl',40],['lm_squat',30],['floor_press',25]])await enterExercise(deload.page,id,{wt,rir:'4'});
  await enterExercise(deload.page,'pullup_a',{band:'Blue (heaviest)',rir:'4'});await finishAndSave(deload.page);
  const legacy=await deload.page.evaluate(()=>{const value=structuredClone(D);value.trainingPlan=null;value.originalResume={id:'original-legacy-phone',date:dayAfter(today(),7),phase:1,
   loads:{hex_dl:40,lm_squat:30,floor_press:25,hex_squat_b:60,ohp:20},bands:{pullup_a:'Blue (heaviest)',rear_delt:'Red'}};return value});
  await deload.ctx.close();
  // This represents an old installed release's return marker, with the actual
  // UI-saved deload preserved. New code must not repair it merely on import.
  const file={name:'synthetic-legacy-return.json',raw:JSON.stringify(legacy)},main=await freshImport(file,theme,start),page=main.page;
  T('legacy file import leaves old references unchanged '+theme,await page.evaluate(()=>D.originalResume.referenceVersion===undefined&&getSmartSugg(dayExs('A',{},true).find(e=>e.id==='hex_dl')).wt===40));
  await keyActivate(page,page.getByRole('button',{name:/^Start Essentials/}));
  await enterExercise(page,'hex_squat_b',{wt:60});await enterExercise(page,'rear_delt',{band:'Red'});await finishAndSave(page,5);
  const before=await page.evaluate(()=>({marker:structuredClone(D.originalResume),history:JSON.stringify(normalizeState(D).W.sessions),phase:D.phase,clock:D.phaseStart,next:D.nextDay,b:getSmartSugg(dayExs('B',{},true).find(e=>e.id==='hex_squat_b'))}));
  const legacyDownload=await exportFile(page);await keyActivate(page,page.getByRole('button',{name:'Today',exact:true}));
  await review(page);
  T('legacy preview separates saved recovery, regular source and effective protected setups '+theme,await page.locator('#reference-review').innerText().then(t=>
   t.includes('Saved starting setup: 40 kg')&&t.includes('Regular practice reference: 80 kg')&&t.includes('Starting setup after Apply: 80 kg')&&t.includes('Fresh practice and its progression are retained')&&t.includes('No eligible regular reference found')));
  await screenshot(page,'normal-reference-preview-'+theme,{target:'#reference-review',text:'Review starting loads',top:false});
  await tabActivate(page,page.getByRole('button',{name:'Cancel',exact:true}));
  T('review Cancel preserves marker/history and returns focus '+theme,await page.evaluate(b=>JSON.stringify(D.originalResume)===JSON.stringify(b.marker)&&JSON.stringify(normalizeState(D).W.sessions)===b.history&&document.activeElement.id==='review-original-references',before));
  await review(page);
  const reader=await main.ctx.newPage(),readerTime=new Date(start+'T12:00:00');readerTime.setDate(readerTime.getDate()+7);await reader.clock.install({time:readerTime});
  await reader.goto(page.url(),{waitUntil:'domcontentloaded'});await reader.waitForFunction(()=>WRITER_READY&&!WRITER);await review(reader);
  T('reader tab cannot apply reviewed references '+theme,await reader.getByRole('button',{name:'Apply starting loads',exact:true}).isDisabled()&&await reader.locator('#reference-review').innerText().then(t=>t.includes('read-only')));await reader.close();
  const committed=await page.evaluate(()=>localStorage.getItem(SK));
  await page.evaluate(()=>{window.referenceSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===SK)throw Error('Synthetic reference-save failure');return window.referenceSetItem.call(this,k,v)}});
  await tabActivate(page,page.getByRole('button',{name:'Apply starting loads',exact:true}));await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
  T('actual failed main save keeps legacy references/history and the atomic reviewed proposal '+theme,await page.evaluate(({raw,b})=>
   localStorage.getItem(SK)===raw&&D.originalResume.referenceVersion===undefined&&JSON.stringify(normalizeState(D).W.sessions)===b.history&&PENDING_SAVE.originalResume.loads.hex_dl===80&&PENDING_SAVE.originalResume.id===b.marker.id,{raw:committed,b:before}));
  await screenshot(page,'normal-reference-save-failure-'+theme,{target:'#save-status',text:'Not saved',top:false});
  await page.evaluate(()=>{Storage.prototype.setItem=window.referenceSetItem});await keyActivate(page,page.getByRole('button',{name:'Retry save',exact:true}));
  await page.waitForFunction(()=>D.originalResume.referenceVersion===1&&!PENDING_SAVE);await settleLayout(page);
  T('successful retry keeps marker boundary, real history, phase, next day and B trajectory '+theme,await page.evaluate(b=>
   D.originalResume.id===b.marker.id&&D.originalResume.date===b.marker.date&&D.phase===b.phase&&D.phaseStart===b.clock&&D.nextDay===b.next&&JSON.stringify(normalizeState(D).W.sessions)===b.history&&JSON.stringify(getSmartSugg(dayExs('B',{},true).find(e=>e.id==='hex_squat_b')))===JSON.stringify(b.b)&&document.activeElement.id==='original-reference-status',before));
  await screenshot(page,'normal-reference-applied-'+theme,{target:'#original-reference-status',text:'Starting references updated',top:false});
  const corrected=await exportFile(page),restored=await freshImport(corrected,theme,start);
  T('actual exported-file fresh restore retains policy, sources and corrected starters '+theme,await restored.page.evaluate(value=>
   JSON.stringify(D.originalResume)===JSON.stringify(value.originalResume)&&getSmartSugg(dayExs('A',{},true).find(e=>e.id==='hex_dl')).wt===80&&D.theme===value.theme,corrected.value));await restored.ctx.close();
  await keyActivate(page,page.getByRole('button',{name:'Today',exact:true}));await chooseA(page);
  T('subsequent A initializes regular weights and assistance, without old success credit '+theme,await page.evaluate(()=>
   LOG.hex_dl.wt===80&&LOG.lm_squat.wt===40&&LOG.floor_press.wt===50&&LOG.pullup_a.band==='Green'&&LOG.pullup_a.bands.every(b=>b==='')&&getSmartSugg(dayExs('A').find(e=>e.id==='hex_dl')).type==='stay'));
  await screenshot(page,'normal-reference-new-entry-top-'+theme,{target:'#ex-cur',text:'Hex Bar Deadlift',top:false});
  await page.locator('#ex-cur').scrollIntoViewIfNeeded();await screenshot(page,'normal-reference-new-entry-sets-'+theme,{target:'#ex-cur',text:'80',top:false});
  // Separate legacy context: entered work must never be rewritten by a review.
  const active=await freshImport(legacyDownload,theme,start);await chooseA(active.page);
  await active.page.getByLabel('Set 1 weight, kilograms',{exact:true}).fill('49.6');await active.page.getByLabel('Set 1 reps',{exact:true}).fill('5');
  await keyActivate(active.page,active.page.getByRole('button',{name:'Set 1 done',exact:true}));
  await active.page.getByLabel('Session Notes',{exact:true}).fill('Synthetic draft — preserve exact values');await active.page.keyboard.press('Tab');
  const draft=await active.page.evaluate(()=>localStorage.getItem(AW_KEY));await active.page.reload({waitUntil:'domcontentloaded'});await active.page.waitForFunction(()=>canWriteStore());
  await keyActivate(active.page,active.page.getByRole('button',{name:'Resume',exact:true}));
  T('49.6 per-set input, notes and checked work survive reload without reference repair '+theme,await active.page.evaluate(raw=>
   localStorage.getItem(AW_KEY)===raw&&Number(LOG.hex_dl.wts[0])===49.6&&LOG.hex_dl.setDone[0]&&SNOTES==='Synthetic draft — preserve exact values',draft));
  await screenshot(active.page,'normal-reference-active-manual-route-'+theme,{target:'#ex-cur',text:'Your current workout keeps its entered loads',top:false});
  await keyActivate(active.page,active.page.getByRole('button',{name:'Today',exact:true}));const beforeReview=await active.page.evaluate(()=>localStorage.getItem(AW_KEY));await review(active.page);
  T('active review disables Apply and preserves raw stored entries '+theme,await active.page.getByRole('button',{name:'Apply starting loads',exact:true}).isDisabled()&&await active.page.evaluate(raw=>localStorage.getItem(AW_KEY)===raw&&Number(LOG.hex_dl.wts[0])===49.6,beforeReview));
  await screenshot(active.page,'normal-reference-active-block-'+theme,{target:'#reference-review',text:'Your current workout keeps its entered loads',top:false});
  await keyActivate(active.page,active.page.getByRole('button',{name:'Cancel',exact:true}));await keyActivate(active.page,active.page.getByRole('button',{name:'Resume',exact:true}));await finishAndSave(active.page);
  await review(active.page);await tabActivate(active.page,active.page.getByRole('button',{name:'Apply starting loads',exact:true}));await active.page.waitForFunction(()=>D.originalResume.referenceVersion===1);
  T('finishing before repair preserves actual 49.6 history and the lower resolved setup '+theme,await active.page.evaluate(()=>{
   const e=D.sessions.at(-1).ex.find(e=>e.id==='hex_dl');return e.wts[0]===49.6&&getSmartSugg(dayExs('A',{},true).find(e=>e.id==='hex_dl')).wt<=49.6;
  }));
  await active.ctx.close();
  for(const raw of ['', '{malformed', JSON.stringify({id:'stale-notes',resetEpoch:'0',day:'A',loc:'home',phase:1,start:1,ts:1,notes:'Keep notes',log:{hex_dl:{wt:49.6,reps:[0]}}})]){
   const blocked=await freshImport(legacyDownload,theme,start);await blocked.page.evaluate(raw=>localStorage.setItem(AW_KEY,raw),raw);
   await blocked.page.reload({waitUntil:'domcontentloaded'});await blocked.page.waitForFunction(()=>canWriteStore());await review(blocked.page);
   T('hidden/malformed/stale notes-only draft blocks Apply without cleanup '+theme,await blocked.page.getByRole('button',{name:'Apply starting loads',exact:true}).isDisabled()&&await blocked.page.evaluate(raw=>localStorage.getItem(AW_KEY)===raw,raw));await blocked.ctx.close();
  }
  T('normal-reference phone routes have no page errors '+theme,main.errors.length===0&&active.errors.length===0,[...main.errors,...active.errors].join('\n'));await main.ctx.close();
 }
};
