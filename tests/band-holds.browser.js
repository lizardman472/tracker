// Actual controls, interrupted draft, save/reload and independent band expectations.
module.exports=async function({T,baseStore,open,keyActivate,screenshot}){
 const fs=require('fs'),path=require('path'),F=require('./fixtures/band-holds'),evidence=[];
 const scenarios=[['moderate',{}],['moderate-tagged',{resume:true}],['effort',{discomfort:false,effort:5}],
  ['effort-tagged',{resume:true,discomfort:false,effort:5}],['rep-drop',{discomfort:false}],
  ['partner-press',{discomfort:false,id:'dips',day:'B'}],['earned-advance',{discomfort:false}]];
 const regex=s=>new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 async function exercise(page,id){
  const name=await page.evaluate(id=>dayExs(ADAY).find(e=>e.id===id).nm,id);
  if(await page.locator('#ex-cur').getAttribute('data-exercise')!==id)await keyActivate(page,page.getByRole('button',{name:regex(name)}).first());
  return page.getByRole('group',{name:name+' exercise',exact:true});
 }
 for(const theme of ['light','dark'])for(const [label,options]of scenarios){
  const store=Object.assign(baseStore(),F.fixture(options),{theme});
  if(label==='rep-drop')store.sessions[0].ex[0].reps=[10,10,10,10];
  if(label==='partner-press')store.sessions.push({id:'partner-press',date:'2026-11-01',day:'A',loc:'partner',phase:1,
   ex:[{id:'db_floor_press',wt:10,reps:[8,8,8],form:[5,5,5]}]});
  const id=options.id||'pullup_a',day=options.day||'A',tag=label+'-'+theme;
  const expected=label==='earned-advance'?F.advance:options.resume&&label==='effort-tagged'?['Green','Green','Green','Green']:F.actual;
  const {ctx,page,errors}=await open(store,new Date(F.now));
  const previous=await page.evaluate(()=>structuredClone(D.sessions));
  const advice=await page.evaluate(({id,day})=>{const e=dayExs(day,{},true).find(e=>e.id===id);return{core:getSmartSuggCore(e),final:getSmartSugg(e)}},{id,day});
  T('band-hold final advice has the independently expected array '+tag,JSON.stringify(advice.final.bands)===JSON.stringify(expected)&&advice.final.type===(label==='earned-advance'?'up':'stay'),JSON.stringify(advice));
  await keyActivate(page,page.locator('.dpick').getByRole('button',{name:day+'1',exact:true}));
  // The frozen latest practice is yesterday (or today for partner work).
  T('frozen fixture exposes the explicit rest-day override '+tag,(await page.locator('#app').innerText()).includes('Rest Day'));
  await keyActivate(page,page.getByRole('button',{name:`Day ${day}1 Essentials anyway`,exact:true}));
  let card=await exercise(page,id);
  async function visiblePattern(){
   const values=[];for(let i=1;i<=4;i++)values.push(await card.getByLabel(`Set ${i} band`,{exact:true}).inputValue());return values;
  }
  const visible=await visiblePattern(),prefill=await page.evaluate(id=>structuredClone(LOG[id]),id),cardText=await card.innerText();
  T('actual initialized band inputs agree with advice '+tag,JSON.stringify(visible)===JSON.stringify(expected)&&JSON.stringify(prefill.bands)===JSON.stringify(expected),JSON.stringify({visible,prefill}));
  T('hold guidance and actual bands agree '+tag,label==='earned-advance'?cardText.includes('Bridge: 2×'):cardText.includes('hold')&&!advice.final.detail.includes('Move one more'),cardText);
  await card.scrollIntoViewIfNeeded();await screenshot(page,'band-hold-'+tag,{target:'#ex-cur',text:label==='earned-advance'?'Bridge:':'hold',top:false});
  // Interrupt and resume the actual persisted draft before making any input changes.
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>WRITER_READY&&WRITER);
  await keyActivate(page,page.getByRole('button',{name:/^Resume/}).first());card=await exercise(page,id);
  T('reload and Resume retain every initialized band '+tag,JSON.stringify(await visiblePattern())===JSON.stringify(expected));
  for(let i=1;i<=4;i++){
   await card.getByLabel(`Set ${i} reps`,{exact:true}).fill('8');await keyActivate(page,card.getByRole('button',{name:`Set ${i} done`,exact:true}));
  }
  await keyActivate(page,card.locator('.form-row1').getByRole('button',{name:'5',exact:true}));
  const last=await page.evaluate(()=>dayExs(ADAY).at(-1).id);await exercise(page,last);
  await page.clock.setFixedTime(new Date(new Date(F.now).getTime()+12*60000));
  await keyActivate(page,page.getByRole('button',{name:'Finish ✓',exact:true}));
  await keyActivate(page,page.locator('.diff-pick').nth(2));await keyActivate(page,page.getByRole('button',{name:'Save ✓',exact:true}));
  await page.waitForFunction(()=>VIEW==='home'&&!PENDING_SAVE);
  const saved=await page.evaluate(previous=>D.sessions.find(s=>!previous.some(p=>p.id===s.id)),previous);
  T('real save adds exactly one counted band record '+tag,!!saved&&saved.ex.length===1&&saved.ex[0].id===id&&JSON.stringify(saved.ex[0].reps)==='[8,8,8,8]'&&
   JSON.stringify(saved.ex[0].bands||Array(4).fill(saved.ex[0].band))===JSON.stringify(expected),JSON.stringify(saved));
  T('real save preserves the captured return identity '+tag,options.resume?saved.originalResumeId===store.originalResume.id:!saved.originalResumeId);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>WRITER_READY&&WRITER);
  const after=await page.evaluate(()=>structuredClone(D.sessions));
  T('save/reload preserves all existing session records and one new identity '+tag,after.length===previous.length+1&&previous.every(p=>JSON.stringify(after.find(s=>s.id===p.id))===JSON.stringify(p))&&JSON.stringify(after.find(s=>s.id===saved.id))===JSON.stringify(saved));
  await keyActivate(page,page.getByRole('button',{name:'History',exact:true}));
  await keyActivate(page,page.locator('#history-'+saved.id));
  const history=await page.locator('#history-'+saved.id).locator('..').innerText();
  const historyExpected=expected[1]==='Purple+Red'?'Purple+Red×8, Purple+Red×8, Green×8, Green×8':expected[0]==='Green'?'[8,8,8,8] Green':'Purple+Red×8, Green×8, Green×8, Green×8';
  T('saved History displays the independently expected counted pattern '+tag,history.includes(historyExpected),history);
  T('band-hold route has no page errors or horizontal overflow '+tag,errors.length===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),errors.join('\n'));
  evidence.push({theme,label,expected,advice,visible,prefill,cardText,saved,history,oldHistoryUnchanged:previous.every(p=>JSON.stringify(after.find(s=>s.id===p.id))===JSON.stringify(p)),errors});
  fs.writeFileSync(path.join(__dirname,'..','test-results','recovery-layout','band-hold-evidence.json'),JSON.stringify(evidence,null,2));
  await ctx.close();
 }
};
