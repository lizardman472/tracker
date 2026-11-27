// Exercise the actual mobile UI, storage, unfinished-work protections and optional tail.
const fs=require('fs'),path=require('path');
module.exports=async({browser,origin,T,errors,baseStore})=>{
 const dir=path.join(__dirname,'..','test-results','hotel-mode');fs.mkdirSync(dir,{recursive:true});
 async function open(width=414){
  const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('HOTEL '+e.message));
  const s=baseStore();s.nextDay='C';s.phase=3;s.trainingPlan=null;
  // Seed once, so reload tests exercise real persisted state rather than re-seeding it.
  await page.addInitScript(s=>{if(!localStorage.getItem('rft-v12')){localStorage.setItem('rft-v12',s);localStorage.setItem('rft-v12-gen','5')}},JSON.stringify(s));
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>WRITER_READY&&WRITER);
  return{ctx,page};
 }
 for(const width of [320,414]){
  const{ctx,page}=await open(width);
  const normal=await page.evaluate(()=>({phase:D.phase,start:D.phaseStart,day:D.nextDay,plan:D.trainingPlan,history:JSON.stringify(D.sessions)}));
  await page.getByRole('button',{name:'🏨 Hotel',exact:true}).click();
  T(`${width}px hotel button exposes the revised main routine and optional finisher`,await page.locator('#hotel-mode').count()===1&&await page.getByRole('button',{name:'Start Hotel Workout · 6 main + 1 optional',exact:true}).count()===1);
  T(`${width}px hotel mode keeps normal phase and rotation`,await page.evaluate(n=>D.phase===n.phase&&D.phaseStart===n.start&&D.nextDay===n.day&&JSON.stringify(D.sessions)===n.history,normal));
  const optional=await page.locator('.prev2').allTextContents();
  T(`${width}px preview puts core before the optional arm finisher`,optional.length===7&&/Fallout/.test(optional[5])&&/Biceps Curl/.test(optional[6]));
  T(`${width}px hotel UI does not overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(dir,`today-${width}.png`),fullPage:true});
  await page.reload();await page.waitForFunction(()=>WRITER_READY&&WRITER);
  T(`${width}px reload retains hotel mode and selected button`,await page.getByRole('button',{name:'🏨 Hotel',exact:true}).getAttribute('aria-pressed')==='true');
  const anchor=page.getByLabel('I have a secure Nordic ankle anchor - use assisted Nordics on A');
  await anchor.check();
  await page.reload();await page.waitForFunction(()=>WRITER_READY&&WRITER);
  T(`${width}px secure-anchor choice persists and replaces only A curls`,await anchor.isChecked()&&await page.evaluate(()=>dayExs('A',{},true)[3].id==='hotel_nordic'&&dayExs('B',{},false)[0].id==='hotel_ham_curl'));
  await anchor.uncheck();
  await page.evaluate(()=>{D.hotelNextDay='C';save();render()});
  T(`${width}px C preview prioritises three sissy sets and keeps optional curls last`,/Hamstring Curl/.test((await page.locator('.prev2').allTextContents()).at(-1))&&await page.evaluate(()=>dayExs('C',{},false)[3].id==='hotel_sissy_squat'&&dayExs('C',{},false)[3].s===3&&dayExs('C',{},true).length===4));
  await page.evaluate(()=>{D.hotelNextDay='A';save();render()});
  await page.getByLabel('I have a long band - include lateral raises').check();
  T(`${width}px packed-band option replaces fly without adding a third extra`,await page.evaluate(()=>dayExs('A',{},false).length===7&&dayExs('A',{},false)[4].id==='hotel_lateral'));
  await page.getByRole('button',{name:'Start Hotel Workout · 6 main + 1 optional',exact:true}).click();
  T(`${width}px workout has all seven exercises and 17 working sets`,await page.evaluate(()=>dayExs(ADAY).length===7&&dayExs(ADAY).reduce((a,e)=>a+e.s,0)===17));
  const perSide=page.getByRole('spinbutton',{name:'Set 1 reps per side',exact:true});
  await perSide.fill('12');
  T(`${width}px split squat records literal reps per leg`,await page.evaluate(()=>LOG.hotel_split_squat.reps[0]==='12'&&repUnit(dayExs(ADAY)[0])==='Reps/side'));
  await page.evaluate(()=>{LOG.hotel_split_squat.notes='light assistance, same floor tile';LOG.hotel_split_squat.setDone[0]=true;saveAW()});
  await page.reload();await page.waitForFunction(()=>WRITER_READY&&WRITER);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  T(`${width}px unfinished workout retains identity reps and setup notes`,await page.evaluate(()=>ADAY==='A'&&LOG.hotel_split_squat.reps[0]==12&&LOG.hotel_split_squat.notes.includes('floor tile')));
  await page.screenshot({path:path.join(dir,`workout-${width}.png`),fullPage:true});
  await page.evaluate(()=>{go('home')});
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'🏠 Home',exact:true}).click();
  T(`${width}px exiting mode cannot replace unfinished work`,await page.evaluate(()=>D.location==='hotel'&&LOG.hotel_split_squat.notes.includes('floor tile')));
  // Save only the performed set. Unperformed optional work must not be invented.
  await page.evaluate(()=>{go('workout');finishW()});
  await page.getByRole('button',{name:'Save ✓',exact:true}).click();
  T(`${width}px saving partial work advances only hotel day and preserves literal history`,await page.evaluate(()=>D.nextDay==='C'&&D.hotelNextDay==='B'&&D.sessions.at(-1).loc==='hotel'&&D.sessions.at(-1).ex.length===1&&D.sessions.at(-1).ex[0].reps.filter(r=>r>0).length===1));
  await page.getByRole('button',{name:'Back to Home routine',exact:true}).click();
  T(`${width}px switching back restores normal state`,await page.evaluate(n=>D.location==='home'&&D.phase===n.phase&&D.phaseStart===n.start&&D.nextDay===n.day&&D.trainingPlan===null,normal));
  await page.getByRole('button',{name:'🏨 Hotel',exact:true}).click();
  await page.evaluate(()=>{beginW('B',true)});
  T(`${width}px short hotel session has only eight main sets`,await page.evaluate(()=>dayExs(ADAY).length===4&&dayExs(ADAY).every(e=>e.s===2)));
  await ctx.close();
 }
 const{ctx,page}=await open();
 await page.getByRole('button',{name:'🏨 Hotel',exact:true}).click();
 await page.getByLabel('I have a secure Nordic ankle anchor - use assisted Nordics on A').check();
 await page.evaluate(()=>beginW('A',true));
 T('short A includes Nordic introduction and records separate assisted reps',await page.evaluate(()=>{
  const ex=dayExs(ADAY)[3];CIDX=3;render();LOG.hotel_nordic.reps[0]=5;LOG.hotel_nordic.setDone[0]=true;LOG.hotel_nordic.notes='short range, assisted return';saveAW();
  return ex.id==='hotel_nordic'&&ex.s===2&&ex.note.includes('only 1 set');
 }));
 await page.reload();await page.waitForFunction(()=>WRITER_READY&&WRITER);
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 T('Nordic reps and setup survive reload without becoming TRX curl records',await page.evaluate(()=>LOG.hotel_nordic.reps[0]===5&&LOG.hotel_nordic.notes==='short range, assisted return'&&!LOG.hotel_ham_curl));
 await page.evaluate(()=>finishW());await page.getByRole('button',{name:'Save ✓',exact:true}).click();
 T('saving Nordic work preserves exercise identity and notes',await page.evaluate(()=>D.sessions.at(-1).ex[0].id==='hotel_nordic'&&D.sessions.at(-1).ex[0].notes==='short range, assisted return'));
 await page.evaluate(()=>beginW('C'));
 T('C sissy instructions are visible in the main quad slot',await page.evaluate(()=>{CIDX=3;render();return dayExs(ADAY).length===7&&document.getElementById('ex-cur').textContent.includes('Supported Sissy Squat')&&document.getElementById('ex-cur').textContent.includes('comfortable controlled range')}));
 await ctx.close();
 // A genuine old-format unfinished workout must resume the previous prescription.
 const old=await open(320);
 await old.page.evaluate(()=>{
  D.location='hotel';D.hotelBand=true;D.hotelNordic=true;save();
  const exs=hotelProgramLegacy().C;
  localStorage.setItem(AW_KEY,JSON.stringify({id:'old-hotel-browser',day:'C',loc:'hotel',phase:D.phase,start:Date.now(),ts:Date.now(),xp:false,exIds:exs.map(e=>e.id),log:{hotel_sissy_squat:{reps:[9,8],setDone:[true,true],notes:'keep original two sets'}}}));
 });
 await old.page.reload();await old.page.waitForFunction(()=>WRITER_READY&&WRITER);
 await old.page.getByRole('button',{name:'Resume',exact:true}).click();
 T('old hotel draft resumes the original order and two optional sissy sets',await old.page.evaluate(()=>{
  const rows=dayExs(ADAY);return rows.at(-1).id==='hotel_sissy_squat'&&rows.at(-1).s===2&&rows.at(-1).optional&&LOG.hotel_sissy_squat.notes==='keep original two sets';
 }));
 await old.page.evaluate(()=>{CIDX=6;render();saveAW()});
 T('old hotel card exposes both original completed sets',await old.page.getByRole('spinbutton',{name:'Set 2 reps',exact:true}).inputValue()==='8');
 await old.page.evaluate(()=>finishW());await old.page.getByRole('button',{name:'Save ✓',exact:true}).click();
 T('saving an old hotel draft retains literal historical reps',await old.page.evaluate(()=>D.sessions.at(-1).ex.find(e=>e.id==='hotel_sissy_squat').reps.join(',')==='9,8'));
 await old.page.evaluate(()=>beginW('B'));
 T('the next workout uses revised B with shoulder pressing and the band slot',await old.page.evaluate(()=>activeRecord().hotelVersion===3&&dayExs(ADAY).length===8&&dayExs(ADAY)[1].id==='hotel_pike_press'&&dayExs(ADAY)[0].s===3));
 await old.ctx.close();
 const bare=await open(320);await bare.page.getByRole('button',{name:'🏨 Hotel',exact:true}).click();
 await bare.page.evaluate(()=>{D.hotelNextDay='C';save();render();beginW('C');CIDX=4;render()});
 T('no-band C presents pike presses and offers a bottle-raise alternative',await bare.page.getByRole('button',{name:'Swap Floor Pike Push-up',exact:true}).count()===1);
 await bare.page.getByRole('button',{name:'Swap Floor Pike Push-up',exact:true}).click();
 T('bottle raise is visibly available without requiring a band',await bare.page.getByText('Filled-Bottle Lateral Raise',{exact:true}).count()>0);
 await bare.page.evaluate(()=>doSwap('hotel_pike_press','hotel_bottle_lateral'));
 T('bottle swap keeps two main sets and manual setup notes',await bare.page.evaluate(()=>dayExs(ADAY)[4].id==='hotel_bottle_lateral'&&dayExs(ADAY)[4].s===2&&!dayExs(ADAY)[4].optional&&getSmartSugg(dayExs(ADAY)[4]).type==='stay'));
 await bare.ctx.close();
};
