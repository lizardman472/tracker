// Real UI coverage, called by browser.test.js. No user data or local browser installs.
module.exports=async function({browser,origin,T,baseStore}){
 const fs=require('fs'),path=require('path'),shots=path.join(__dirname,'..','test-results','recovery-layout');
 fs.mkdirSync(shots,{recursive:true});
 const screenshot=async(page,name)=>{await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(shots,name+'.png')});};
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
  await page.getByText('Recovery plan and routine choices',{exact:true}).click();
  await page.getByRole('button',{name:'Start deload today',exact:true}).click();
  T('deload setup preserves existing training history',await page.evaluate(n=>D.sessions.length===n,store.sessions.length));
  T('deload setup shows dates, effort, six sets and manual return',await page.locator('#training-plan').evaluate(e=>
   /seven planned days/.test(e.textContent)&&/6 working sets/.test(e.textContent)&&/4–5/.test(e.textContent)&&/does not automatically/.test(e.textContent)));
  T('recovery controls are collapsed and compact at phone width',await page.locator('#training-plan').evaluate(e=>
   !e.querySelector('details').open&&e.getBoundingClientRect().height<210));
  T('routine controls share the existing workout-start panel',await page.locator('#training-plan').evaluate(e=>!!e.closest('.start-hero')));
  await screenshot(page,'deload-phone');
  T('deload previews exactly the shortened A day',await page.evaluate(()=>dayExs('A').length===4&&dayExs('A').reduce((n,e)=>n+e.s,0)===6));
  await page.getByRole('button',{name:'Start Deload week · Day A',exact:true}).click();
  T('workout shows the deload pacing target',/40-minute pacing target/.test(await page.locator('#app').innerText()));
  T('workout recovery strip contains no routine controls',await page.locator('#training-plan button').count()===0);
  T('deload is visibly recovery rather than Linear or Hypertrophy',await page.locator('#training-plan').evaluate(e=>
   /Current phase:.*Recovery · Deload/.test(e.textContent)));
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
  await page.evaluate(()=>go('settings'));
  T('regular phase buttons are visibly held and unselected during deload',await page.locator('#phase-control button').evaluateAll(es=>
   es.length===2&&es.every(e=>e.disabled&&e.getAttribute('aria-pressed')==='false')));
  await page.evaluate(()=>go('stats'));
  T('Progress labels the recovery stage rather than a regular phase',await page.getByText('Recovery · Deload',{exact:true}).count()===1);
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
  await page.getByLabel('Training phase after recovery',{exact:true}).selectOption('2');
  await screenshot(page,'phase-choice-after-recovery-phone');
  await page.getByRole('button',{name:'I feel ready — use shorter routine',exact:true}).click();
  T('second ready check activates eleven-set ongoing days',await page.evaluate(()=>D.trainingPlan.stage==='progress'&&['A','B','C'].every(d=>dayExs(d).reduce((n,e)=>n+e.s,0)===11)));
  T('shorter default panel stays compact with no horizontal overflow',await page.locator('#training-plan').evaluate(e=>
   e.textContent.includes('Shorter A/B/C · default')&&!e.querySelector('details').open&&e.getBoundingClientRect().height<200&&document.documentElement.scrollWidth<=innerWidth));
  T('Hypertrophy choice applies actual targets while keeping shorter sets',await page.evaluate(()=>
   D.phase===2&&D.trainingPlan.phase===2&&dayExs('A')[0].tg===8&&dayExs('A').reduce((n,e)=>n+e.s,0)===11));
  T('active phase and next step are visible without expanding details',await page.locator('#training-plan').evaluate(e=>
   /Current phase:.*Phase 2 · Hypertrophy/.test(e.innerText)&&/Next:.*Optional phase review/.test(e.innerText)));
  await screenshot(page,'shorter-phone-light');
  await page.evaluate(()=>{D.theme='dark';save();applyTheme();render()});
  await screenshot(page,'shorter-phone-dark');
  await page.setViewportSize({width:1280,height:900});
  await screenshot(page,'shorter-desktop-dark');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{D.theme='light';save();applyTheme();render()});
  const before=await page.evaluate(()=>({history:JSON.stringify(D.sessions),phase:D.phase,nextDay:D.nextDay}));
  await page.getByText('Plan details and routine choices',{exact:true}).click();
  T('routine choices explain original volume and separate it from phase',await page.locator('#training-plan').evaluate(e=>
   /24–26 working sets/.test(e.textContent)&&/phase means the rep emphasis/.test(e.textContent)&&/default after recovery/.test(e.textContent)));
  await page.getByLabel('Phase for return to original routine',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'Return to original routine',exact:true}).click();
  T('original return starts with lighter loads and capped sets while preserving history',await page.evaluate(b=>
   D.trainingPlan.stage==='original1'&&JSON.stringify(D.sessions)===b.history&&D.phase===1&&D.trainingPlan.phase===1&&D.nextDay===b.nextDay&&
   ['A','B','C'].every(d=>dayExs(d).every(e=>e.s<=2))&&getSmartSugg(dayExs('A')[0]).wt<=54,before));
  T('routine changes bring the new status into view',await page.locator('#training-plan .routine-title').evaluate(e=>
   e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<=innerHeight));
  await screenshot(page,'original-return-phone');
  await page.getByText('Plan details and routine choices',{exact:true}).click();
  await page.getByRole('button',{name:'Keep shorter routine (default)',exact:true}).click();
  T('longer return can be abandoned for the shorter default',await page.evaluate(()=>D.trainingPlan.stage==='progress'&&dayExs('A').reduce((n,e)=>n+e.s,0)===11));
  // Exercise the real buttons through all three optional original-return steps.
  await page.getByText('Plan details and routine choices',{exact:true}).click();
  await page.getByLabel('Phase for return to original routine',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'Return to original routine',exact:true}).click();
  for(const stage of ['original1','original2','original3']){
   await page.evaluate(stage=>{
    D.trainingPlan.stage=stage;D.trainingPlan.stageStart=dayAfter(today(),-7);
    for(const [i,day]of ['A','B','C'].entries())D.sessions.push({id:'return-'+stage+day,date:dayAfter(today(),-6+i*2),day,loc:'home',phase:D.phase,difficulty:2,
     trainingStage:stage,trainingPlanStart:D.trainingPlan.start,trainingComplete:true,finishReason:'complete',noProg:stage!=='original3',
     ex:dayExs(day).map(e=>({id:e.id,wt:getSmartSugg(e).wt,band:getSmartSugg(e).band||'',reps:Array(e.s).fill(e.tg),form:Array(e.s).fill(5),rir:3}))});
    save();render();
   },stage);
   await page.getByRole('button',{name:stage==='original3'?'I feel ready — resume original progression':'I feel ready — next return step',exact:true}).click();
   T('original return advances only on confirmed step '+stage,await page.evaluate(stage=>
    stage==='original3'?D.trainingPlan===null:D.trainingPlan.stage===(stage==='original1'?'original2':'original3'),stage));
  }
  T('original progression resumes with original Essentials prescription',await page.evaluate(()=>
   D.trainingPlan===null&&['A','B','C'].every(d=>dayExs(d,{},true).reduce((n,e)=>n+e.s,0)>=24)));
  T('readiness flow has no browser errors',errors.length===0,errors.join('\n'));await ctx.close();
 }
 {
  const store=baseStore();store.trainingPlan={stage:'progress',start:ago(14),stageStart:ago(3),loads:{hex_dl:80},bands:{}};
  const {ctx,page,errors}=await open(store),history=await page.evaluate(()=>JSON.stringify(D.sessions));
  T('existing shorter plans remain mixed until an explicit phase choice',await page.evaluate(()=>!D.trainingPlan.phase&&dayExs('A')[0].tg===8));
  await page.evaluate(()=>go('settings'));
  await page.locator('#phase-control').getByRole('button',{name:'P1: Linear',exact:true}).click();
  T('Settings Linear choice binds lower reps without expanding the routine',await page.evaluate(()=>
   D.phase===1&&D.trainingPlan.phase===1&&dayExs('A')[0].tg===5&&dayExs('A').reduce((n,e)=>n+e.s,0)===11));
  const load=await page.evaluate(()=>getSmartSugg(dayExs('A')[0]).wt);
  await page.locator('#phase-control').getByRole('button',{name:'P2: Hypertrophy',exact:true}).click();
  T('Settings Hypertrophy choice updates reps and starts no heavier',await page.evaluate(w=>
   D.phase===2&&D.trainingPlan.phase===2&&dayExs('A')[0].tg===8&&getSmartSugg(dayExs('A')[0]).wt<=w,load));
  T('phase choice preserves history and updates its selected state',await page.evaluate(h=>JSON.stringify(D.sessions)===h,history)&&
   await page.locator('#phase-control').getByRole('button',{name:'P2: Hypertrophy',exact:true}).getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>go('stats'));
  T('Progress shows the selected Hypertrophy phase and optional review',await page.getByText('Phase 2 · Hypertrophy',{exact:true}).count()===1&&
   /Optional phase review/.test(await page.locator('#app').innerText()));
  T('phase control has no browser errors',errors.length===0,errors.join('\n'));await ctx.close();
 }
};
