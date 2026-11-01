// Four real phone frames: current weighted hold and future-only assistance, both themes.
module.exports=async function({T,baseStore,open,keyActivate,screenshot}){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),F=require('./fixtures/current-discomfort');
 const output=path.join(__dirname,'..','test-results','recovery-layout'),evidence=[];
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const theme of ['light','dark'])for(const kind of ['weighted','assistance']){
  const store=Object.assign(baseStore(),F.phoneFixture(kind),{theme}),{ctx,page,errors}=await open(store,new Date(F.now)),tag=kind+'-'+theme,id=kind==='weighted'?'hex_dl':'pullup_a';
  console.log('CURRENT_DISCOMFORT_CASE',tag);
  try{
   const before=await page.evaluate(id=>({rows:structuredClone(D.discomfort),history:structuredClone(D.sessions),selected:getDiscomfortRecent(id),trend:getDiscomfortTrend(id,id==='hex_dl'?'Knee':'Shoulder'),
    final:getSmartSugg(dayExs('A',{},true).find(e=>e.id===id))}),id);
   T('MATH05 phone has frozen local date '+tag,await page.evaluate(()=>today()==='2026-11-01'));
   T('MATH05 literal advice before actual Start '+tag,kind==='weighted'?before.final.wt===40&&before.final.type==='stay':before.final.type==='up'&&equal(before.final.bands,F.assistance),JSON.stringify(before));
   if(kind==='weighted')await keyActivate(page,page.getByRole('button',{name:'Start Shorter A/B/C · Day A',exact:true}));
   else{await keyActivate(page,page.locator('.dpick').getByRole('button',{name:'A1',exact:true}));await keyActivate(page,page.getByRole('button',{name:'Day A1 Essentials anyway',exact:true}))}
   await page.waitForFunction(()=>VIEW==='workout'&&ADAY==='A');
   const name=await page.evaluate(id=>dayExs(ADAY).find(e=>e.id===id).nm,id);
   if(await page.locator('#ex-cur').getAttribute('data-exercise')!==id)await keyActivate(page,page.locator('button.ex-row').filter({hasText:name}).first());
   const card=page.getByRole('group',{name:name+' exercise',exact:true});await card.waitFor({state:'visible'});
   const log=await page.evaluate(id=>structuredClone(LOG[id]),id),text=await card.innerText(),visible=[];
   if(kind==='weighted'){
    for(let i=1;i<=2;i++)visible.push(await card.getByLabel('Set '+i+' weight, kilograms',{exact:true}).getAttribute('placeholder'));
    T('MATH05 actual weighted advice and prefill retain current40kg hold '+tag,Number(log.wt)===40&&equal(visible,['40','40'])&&text.includes('Hold progression'),JSON.stringify({log,visible,text}));
   }else{
    for(let i=1;i<=4;i++)visible.push(await card.getByLabel('Set '+i+' band',{exact:true}).evaluate(el=>el.value||el.selectedOptions[0].textContent.trim()));
    T('MATH05 actual assistance advice and effective inputs keep earned first-set bridge '+tag,equal(visible,F.assistance)&&equal(log.bands,F.assistance)&&text.includes('Bridge: 1×'),JSON.stringify({log,visible,text}));
    T('MATH05 exact-exercise future-only flags produce no current trend warning '+tag,before.trend.count===0&&before.trend.recent3===0&&!text.includes('Shoulder 2/3')&&!/moderate discomfort/.test(before.final.regress||''),text);
   }
   await card.evaluate(el=>{el.style.scrollMarginTop='130px';el.scrollIntoView({block:'start',behavior:'instant'})});
   await screenshot(page,'current-discomfort-'+tag,{target:'#ex-cur',text:kind==='weighted'?'Hold progression':'Bridge: 1×',top:false});
   const event=page.waitForEvent('download');await keyActivate(page,page.getByRole('button',{name:'Export complete backup',exact:true}));const download=await event,stream=await download.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);const bytes=Buffer.concat(chunks),value=JSON.parse(bytes),file='current-discomfort-file-'+tag+'.json';fs.writeFileSync(path.join(output,file),bytes);
   T('MATH05 actual download and source keep every past/future row '+tag,equal(value.discomfort,before.rows)&&await page.evaluate(rows=>JSON.stringify(D.discomfort)===JSON.stringify(rows),before.rows));
   const destination=Object.assign(baseStore(),{sessions:[],discomfort:[],trainingPlan:null,originalResume:null}),restored=await open(destination,new Date(F.now));let restoredRows;
   try{await keyActivate(restored.page,restored.page.locator('#nav').getByRole('button',{name:'Settings',exact:true}));const chooser=restored.page.waitForEvent('filechooser');await keyActivate(restored.page,restored.page.getByRole('button',{name:'↑ Import',exact:true}));await(await chooser).setFiles({name:file,mimeType:'application/json',buffer:bytes});await restored.page.waitForFunction(()=>!IMPORT_BUSY&&!PENDING_SAVE&&!PENDING_ACTIVE);await restored.page.reload({waitUntil:'domcontentloaded'});await restored.page.waitForFunction(()=>canWriteStore());restoredRows=await restored.page.evaluate(()=>structuredClone(D.discomfort));T('MATH05 actual downloaded-file import/reload preserves future rows '+tag,equal(restoredRows,before.rows));T('MATH05 restored page has no errors '+tag,restored.errors.length===0,restored.errors.join('\n'))}finally{await restored.ctx.close()}
   let positiveWarning=null;if(kind==='assistance'){
    const rows=[...F.trendCurrent,...F.futureNone.map(r=>({...r,exId:'pullup_a',joint:'Shoulder'}))];await page.evaluate(rows=>{D.discomfort=rows;save();render()},rows);positiveWarning=await page.locator('#ex-cur').innerText();T('MATH05 controlled two-current-positive trend remains visible despite future none '+tag,positiveWarning.includes('Shoulder 2/3'),positiveWarning);
   }
   T('MATH05 source history unchanged and no browser errors/overflow '+tag,await page.evaluate(history=>JSON.stringify(D.sessions)===JSON.stringify(history)&&document.documentElement.scrollWidth<=innerWidth,before.history)&&errors.length===0,errors.join('\n'));
   evidence.push({tag,kind,theme,fixture:store,phoneDateVariation:kind==='weighted'?'Second confirmation Oct29 for ordinary two-day rest gate; unit remains Oct31':null,before,log,visible,text,positiveWarning,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,restoredRows,errors});
   fs.writeFileSync(path.join(output,'current-discomfort-browser-evidence.json'),JSON.stringify(evidence,null,2));
  }finally{await ctx.close()}
 }
};
