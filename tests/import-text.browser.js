// DATA-01: real downloaded-file import, fmtSets sinks and Previous text/aria.
// Entirely invented records; expected text is independent of production helpers.
module.exports=async function({T,baseStore,open,keyActivate,tabActivate,screenshot}){
 const fs=require('fs'),path=require('path'),evidence=[];
 const marker='<span data-audit-marker="band-text">Audit & "quoted"</span>';
 const expected='Green×6, '+marker+'×6';
 const fixture={id:'import-text-boundary',date:'2020-01-02',day:'A',loc:'home',phase:1,duration:20,difficulty:3,
  ex:[{id:'pullup_a',wt:null,reps:[6,6],band:marker,bands:['Green',''],notes:''},
   {id:'rear_delt',wt:null,reps:[12,11],band:'Red',notes:''},
   {id:'pullup_c',wt:null,reps:[8,7],band:'Green',bands:['Purple+Red','Green'],notes:''},
   {id:'hex_dl',wt:40,reps:[5,0,6],wts:['',80,35],band:'',notes:''},
   {id:'floor_press',wt:30,reps:[8,8],band:'',notes:''}]};
 const empty=theme=>Object.assign(baseStore(),{sessions:[],theme,phase:1,phaseStart:'2020-01-01',nextDay:'A',location:'home',trainingPlan:null,originalResume:null,comeback:null});
 for(const theme of ['light','dark']){
  const source=empty(theme);source.sessions=[structuredClone(fixture)];
  const original=await open(source);await keyActivate(original.page,original.page.getByRole('button',{name:'Settings',exact:true}));
  const pending=original.page.waitForEvent('download');await keyActivate(original.page,original.page.getByRole('button',{name:'↓ Export',exact:true}));
  const file=await pending,stream=await file.createReadStream();let bytes='';for await(const chunk of stream)bytes+=chunk;
  const downloaded=JSON.parse(bytes).sessions.find(s=>s.id===fixture.id).ex[0];
  T('download retains literal scalar and partial band order '+theme,downloaded.band===marker&&JSON.stringify(downloaded.bands)==='["Green",""]');
  await original.ctx.close();
  const {ctx,page,errors}=await open(empty(theme));await keyActivate(page,page.getByRole('button',{name:'Settings',exact:true}));
  const picker=page.waitForEvent('filechooser');await tabActivate(page,page.getByRole('button',{name:'↑ Import',exact:true}));
  await(await picker).setFiles({name:file.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(bytes)});
  await page.waitForFunction(id=>!IMPORT_BUSY&&!PENDING_SAVE&&D.sessions.some(s=>s.id===id),fixture.id);
  const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(SK)).sessions.find(s=>s.id===id),fixture.id);
  T('file import and normalization preserve the original literal band and counted order '+theme,
   stored.ex[0].band===marker&&JSON.stringify(stored.ex[0].bands)==='["Green",""]'&&JSON.stringify(stored.ex[0].reps)==='[6,6]');
  T('normalization preserves raw weight/repetition positions '+theme,JSON.stringify(stored.ex[3].reps)==='[5,0,6]'&&JSON.stringify(stored.ex[3].wts)==='[null,80,35]'&&stored.ex[4].wt===30);
  await keyActivate(page,page.getByRole('button',{name:'History',exact:true}));
  const details=page.locator('#history-'+fixture.id);await tabActivate(page,details);
  const history=details.locator('..'),historyText=await history.innerText(),historyHtml=await history.innerHTML();
  T('expanded History is keyboard operable and retains focus '+theme,await details.getAttribute('aria-expanded')==='true'&&await details.evaluate(el=>el===document.activeElement));
  T('History shows the entire imported marker literally, escaped exactly once '+theme,historyText.includes(expected)&&!historyText.includes('&lt;span')&&!historyHtml.includes('&amp;lt;span'));
  T('History contains no imported marker element '+theme,await page.locator('[data-audit-marker="band-text"]').count()===0);
  T('uniform/mixed normal bands and weight formats retain independent expected text '+theme,
   historyText.includes('[12,11] Red')&&historyText.includes('Purple+Red×8, Green×7')&&historyText.includes('40×5, 35×6')&&historyText.includes('30kg [8,8]'));
  await history.getByText(expected,{exact:true}).scrollIntoViewIfNeeded();
  await screenshot(page,'import-text-history-'+theme,{target:'#app .sec',text:'History',top:false});
  await keyActivate(page,page.getByRole('button',{name:'Today',exact:true}));
  await keyActivate(page,page.locator('.dpick').getByRole('button',{name:'A1',exact:true}));
  await keyActivate(page,page.getByRole('button',{name:/^Start Essentials/}));
  await keyActivate(page,page.getByRole('button',{name:/Pull-ups \(Comfortable Grip\)/}).first());
  const card=page.getByRole('group',{name:'Pull-ups (Comfortable Grip) exercise',exact:true});
  const lastText=await card.getByText(/^Last: /).innerText();
  const lastMarkerElements=await page.locator('[data-audit-marker="band-text"]').count();
  T('workout Last displays the same literal text without imported elements '+theme,lastText.includes(expected)&&!lastText.includes('&lt;span')&&lastMarkerElements===0,JSON.stringify({lastText,lastMarkerElements}));
  const previous=card.locator('button.set-prev').nth(1),previousText=await previous.innerText(),previousName=await previous.getAttribute('aria-label');
  T('previous-set button retains literal marker and quotes in text and accessible name '+theme,
   previousText===marker+' ×6'&&previousName==='Use previous set 2: '+marker+' ×6'&&await card.getByRole('button',{name:'Use previous set 2: '+marker+' ×6',exact:true}).count()===1&&lastMarkerElements===0,
   JSON.stringify({previousText,previousName,lastMarkerElements}));
  await previous.scrollIntoViewIfNeeded();await screenshot(page,'import-text-previous-'+theme,{target:'.set-tbl .set-row:nth-child(3) button.set-prev',text:marker+' ×6',top:false});
  // Explicit entry exercises the completed-row sink without assuming prefill policy.
  for(let i=1;i<=4;i++)await card.getByLabel(`Set ${i} band`,{exact:true}).selectOption(i===1?'Green':'');
  for(let i=1;i<=4;i++){
   await card.getByLabel(`Set ${i} reps`,{exact:true}).fill('6');await keyActivate(page,card.getByRole('button',{name:`Set ${i} done`,exact:true}));
  }
  const draft=await page.evaluate(()=>({band:LOG.pullup_a.band,bands:LOG.pullup_a.bands,reps:LOG.pullup_a.reps}));
  T('entered draft retains explicit opening band and scalar fallback slots '+theme,draft.band===marker&&JSON.stringify(draft.bands)==='["Green","","",""]'&&JSON.stringify(draft.reps)==='["6","6","6","6"]',JSON.stringify(draft));
  await keyActivate(page,page.getByRole('button',{name:/Hex Bar Deadlift/}).first());
  const done=page.locator('button.done-row').filter({hasText:'Pull-ups (Comfortable Grip)'}),doneText=await done.innerText();
  // Current LOG entries have no id: fmtSets cannot resolve a band definition here.
  // Preserve the existing scalar-prefix + reps summary; History/Last cover mixed text.
  const doneExpected=marker+' [6,6,6,6]';
  const doneMarkerElements=await page.locator('[data-audit-marker="band-text"]').count();
  T('completed workout row preserves the literal scalar and current reps summary '+theme,doneText.includes(doneExpected)&&!doneText.includes('&lt;span')&&doneMarkerElements===0,JSON.stringify({doneExpected,doneText,doneMarkerElements}));
  await done.scrollIntoViewIfNeeded();await screenshot(page,'import-text-done-'+theme,{target:'button.done-row',text:'Pull-ups (Comfortable Grip)',top:false});
  T('reading History/Last and completing draft sets do not rewrite imported history '+theme,await page.evaluate(saved=>JSON.stringify(D.sessions.find(s=>s.id===saved.id))===JSON.stringify(saved),stored));
  T('import-text phone route has no page errors or horizontal overflow '+theme,errors.length===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),errors.join('\n'));
  evidence.push({theme,marker,expected,stored,historyText,lastText,lastMarkerElements,previousText,previousName,draft,doneExpected,doneText,doneMarkerElements,errors});
  fs.writeFileSync(path.join(__dirname,'..','test-results','recovery-layout','import-text-evidence.json'),JSON.stringify(evidence,null,2));
  await ctx.close();
 }
};
