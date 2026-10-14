// Real UI coverage, called by browser.test.js. No user data or local browser installs.
module.exports=async function({browser,origin,T,baseStore}){
 const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 async function open(store){
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
  await page.addInitScript(s=>{localStorage.setItem('rft-v12',JSON.stringify(s));localStorage.setItem('rft-v12-gen',String(s.gen||0))},store);
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>WRITER_READY&&WRITER);return{ctx,page,errors};
 }
 {
  const store=baseStore(),{ctx,page,errors}=await open(store);
  await page.getByRole('button',{name:'Start deload today',exact:true}).click();
  T('deload setup preserves existing training history',await page.evaluate(n=>D.sessions.length===n,store.sessions.length));
  T('deload setup shows dates, effort, six sets and manual return',await page.locator('#training-plan').evaluate(e=>
   /seven planned days/.test(e.textContent)&&/Six working sets/.test(e.textContent)&&/4–5/.test(e.textContent)&&/does not automatically/.test(e.textContent)));
  T('deload previews exactly the shortened A day',await page.evaluate(()=>dayExs('A').length===4&&dayExs('A').reduce((n,e)=>n+e.s,0)===6));
  await page.getByRole('button',{name:'Start Deload week · Day A',exact:true}).click();
  T('workout shows the deload pacing target',/40-minute pacing target/.test(await page.locator('#app').innerText()));
  const rir=page.getByLabel('Clean reps left after your hardest set (estimate)',{exact:true});
  await rir.selectOption('4');
  T('reported reps-left value is stored in the recoverable draft',await page.evaluate(()=>JSON.parse(localStorage.getItem(AW_KEY)).log.hex_dl.rir==='4'));
  T('short routine does not prefill old hard-workout rep targets',await page.evaluate(()=>LOG.hex_dl.reps.every(r=>r==='')));
  await page.evaluate(()=>{LOG.hex_dl.reps=['5','5'];LOG.hex_dl.setDone=[true,true];finishW()});
  T('an unfinished deload has a clear early-ending summary',/Workout ended early/.test(await page.locator('#app').innerText()));
  await page.getByLabel('Why did you finish?',{exact:true}).selectOption('fatigue');
  await page.getByRole('button',{name:'Save ✓',exact:true}).click();
  T('fatigue reason, RIR and light-stage exclusion survive the real save path',await page.evaluate(()=>{
   const s=D.sessions.at(-1);return s.trainingStage==='deload'&&s.noProg&&s.trainingComplete===false&&s.finishReason==='fatigue'&&s.ex[0].rir===4;}));
  T('deload workout has no browser errors',errors.length===0,errors.join('\n'));await ctx.close();
 }
 {
  const store=baseStore();store.trainingPlan={stage:'deload',start:ago(7),stageStart:ago(7),loads:{hex_dl:60},bands:{pullup_a:'Green'}};
  const {ctx,page,errors}=await open(store);
  T('expired deload remains light until readiness is confirmed',await page.evaluate(()=>D.trainingPlan.stage==='deload'&&trainingPlanStatus().due));
  await page.getByRole('button',{name:'Still tired — take two more rest days',exact:true}).click();
  T('extra rest is visible and cannot advance the stage',await page.evaluate(()=>trainingPlanStatus().resting&&D.trainingPlan.stage==='deload'));
  await page.evaluate(()=>{D.trainingPlan.reviewAfter=today();save();render()});
  await page.getByRole('button',{name:'I feel ready — start easy return week',exact:true}).click();
  T('ready check activates a held-load two-set return week',await page.evaluate(()=>D.trainingPlan.stage==='return'&&dayExs('A').reduce((n,e)=>n+e.s,0)===10));
  await page.evaluate(()=>{D.trainingPlan.stageStart=dayAfter(today(),-7);delete D.trainingPlan.reviewAfter;save();render()});
  await page.getByRole('button',{name:'I feel ready — use shorter routine',exact:true}).click();
  T('second ready check activates eleven-set ongoing days',await page.evaluate(()=>D.trainingPlan.stage==='progress'&&['A','B','C'].every(d=>dayExs(d).reduce((n,e)=>n+e.s,0)===11)));
  const before=await page.evaluate(()=>({history:JSON.stringify(D.sessions),phase:D.phase,nextDay:D.nextDay}));
  await page.getByRole('button',{name:'Return to normal routine',exact:true}).click();
  T('return button restores original A/B/C and preserves history and schedule',await page.evaluate(b=>
   D.trainingPlan===null&&JSON.stringify(D.sessions)===b.history&&D.phase===b.phase&&D.nextDay===b.nextDay&&
   ['A','B','C'].every(d=>!dayExs(d).some(e=>e._short)),before));
  T('return button disappears once the normal routine is restored',await page.getByRole('button',{name:'Return to normal routine',exact:true}).count()===0);
  T('readiness flow has no browser errors',errors.length===0,errors.join('\n'));await ctx.close();
 }
};
