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
  T(`${width}px hotel button exposes fixed routine and two optional exercises`,await page.locator('#hotel-mode').count()===1&&await page.getByRole('button',{name:'Start Hotel Workout · 5 main + 2 optional',exact:true}).count()===1);
  T(`${width}px hotel mode keeps normal phase and rotation`,await page.evaluate(n=>D.phase===n.phase&&D.phaseStart===n.start&&D.nextDay===n.day&&JSON.stringify(D.sessions)===n.history,normal));
  const optional=await page.locator('.prev2').allTextContents();
  T(`${width}px preview puts bridge and shoulder extras last`,optional.length===7&&/Reverse Fly/.test(optional[5])&&/Glute Bridge/.test(optional[6]));
  T(`${width}px hotel UI does not overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(dir,`today-${width}.png`),fullPage:true});
  await page.reload();await page.waitForFunction(()=>WRITER_READY&&WRITER);
  T(`${width}px reload retains hotel mode and selected button`,await page.getByRole('button',{name:'🏨 Hotel',exact:true}).getAttribute('aria-pressed')==='true');
  await page.getByLabel('I have a long band - include lateral raises').check();
  T(`${width}px packed-band option replaces fly without adding a third extra`,await page.evaluate(()=>dayExs('A',{},false).length===7&&dayExs('A',{},false)[5].id==='hotel_lateral'));
  await page.getByRole('button',{name:'Start Hotel Workout · 5 main + 2 optional',exact:true}).click();
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
};
