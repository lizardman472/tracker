// R7 seeded reported history, actual supported files/chooser, two phone themes.
module.exports=async function({T,open,keyActivate,screenshot}){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),F=require('./fixtures/duration-preservation');
 const output=path.join(__dirname,'..','test-results','recovery-layout'),evidence=[],equal=require('node:util').isDeepStrictEqual,key=keyActivate;
 const nav=(p,name)=>key(p,p.locator('#nav').getByRole('button',{name,exact:true}));
 const write=()=>fs.writeFileSync(path.join(output,'duration-preservation-browser-evidence.json'),JSON.stringify(evidence,null,2));
 async function snapshot(p){return p.evaluate(()=>({sessions:structuredClone(D.sessions),cues:structuredClone(D.cues),phase:D.phase,phaseStart:D.phaseStart,location:D.location,nextDay:D.nextDay,
  raw:localStorage.getItem(SK),active:localStorage.getItem(AW_KEY),writer:WRITER,pending:structuredClone(PENDING_SAVE)}))}
 async function history(p,label){await nav(p,'History');const row=p.locator('#history-data05-eight');await row.waitFor({state:'visible'});T('R7 scoped History row shows8m '+label,(await row.innerText()).includes('8m'));if(await row.getAttribute('aria-expanded')!=='true')await key(p,row);
  const text=await row.locator('..').innerText();T('R7 expanded target retains three exercise identities '+label,await row.getAttribute('aria-expanded')==='true'&&['Hex Bar Deadlift','Barbell OHP','Barbell Curl'].every(n=>text.includes(n)),text);return text}
 async function download(p,control,label){const before=await snapshot(p),event=p.waitForEvent('download');await key(p,control);const file=await event,stream=await file.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);const bytes=Buffer.concat(chunks),value=JSON.parse(bytes),name='duration-file-'+label+'.json';fs.writeFileSync(path.join(output,name),bytes);
  T('R7 actual '+label+' file retains full independent session',equal(value.sessions,[F.expected()])&&equal(value.cues,F.state().cues),JSON.stringify(value));return{bytes,value,record:{name,suggestedName:file.suggestedFilename(),byteLength:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),before,after:await snapshot(p)}}}
 async function importFile(p,file){await nav(p,'Settings');const event=p.waitForEvent('filechooser');await key(p,p.getByRole('button',{name:'↑ Import',exact:true}));await(await event).setFiles({name:file.record.name,mimeType:'application/json',buffer:file.bytes});await p.waitForFunction(()=>!IMPORT_BUSY&&!PENDING_SAVE&&!PENDING_ACTIVE);await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>canWriteStore())}
 async function restore(file,theme,populated=false){const input=F.state();input.theme=theme;input.sessions=populated?[{...F.expected(),id:'duration-unrelated',date:'2026-09-01',duration:45,notes:'Seeded occupied destination'}]:[];input.cues={};const h=await open(input,new Date(F.now)),p=h.page;
  try{const old=await p.evaluate(()=>structuredClone(D.sessions));for(let i=0;i<(populated?2:1);i++){await importFile(p,file);const actual=await snapshot(p);T('R7 actual chooser/reload retains full row '+file.record.name+' occupied='+populated+' repeat='+i,equal(actual.sessions.find(s=>s.id==='data05-eight'),F.expected())&&actual.sessions.filter(s=>s.id==='data05-eight').length===1&&old.every(s=>equal(actual.sessions.find(x=>x.id===s.id),s))&&equal(actual.cues,F.state().cues)&&actual.phase===1&&actual.phaseStart==='2026-10-01'&&actual.location==='home'&&actual.nextDay==='B'&&actual.active===null&&actual.pending===null,JSON.stringify(actual))}
   const text=await history(p,file.record.name+' restored'),actual=await snapshot(p);T('R7 restored file has no page errors '+file.record.name,h.errors.length===0,h.errors.join('\n'));return{occupiedSetup:populated?input.sessions:null,actual,history:text,errors:h.errors};
  }finally{await h.ctx.close()}}
 for(const theme of ['light','dark']){
  console.log('DURATION_CASE_START',theme);const input=F.state();input.theme=theme;const h=await open(input,new Date(F.now)),p=h.page;
  try{
   const initial=await snapshot(p);T('R7 real load retains literal8/home/310 '+theme,equal(initial.sessions,[F.expected()]),JSON.stringify(initial));
   await history(p,theme+' initial');const afterNavigation=await snapshot(p);T('R7 History navigation leaves saved main/active bytes unchanged '+theme,initial.raw===afterNavigation.raw&&initial.active===afterNavigation.active);
   await nav(p,'Settings');await key(p,p.locator('button[onclick="D.theme=\''+theme+'\';save();applyTheme();render()"]'));await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>canWriteStore());const committed=await snapshot(p);
   T('R7 explicit visible settings save/reload commits8/home/310 '+theme,equal(committed.sessions,[F.expected()])&&equal(JSON.parse(committed.raw).sessions,[F.expected()]),JSON.stringify(committed));
   const text=await history(p,theme+' committed');await screenshot(p,'duration-history-'+theme,{target:'#history-data05-eight',text:'8m'});
   const analytics=await p.evaluate(()=>({weekly:weeklySeries(10).find(w=>w.sessions===1).dur,monthly:monthlyReport('2026-10').avgDur,average:consistency().avgDur}));T('R7 existing duration readers agree on8 '+theme,equal(analytics,{weekly:8,monthly:8,average:8}),JSON.stringify(analytics));
   await nav(p,'Settings');const complete=await download(p,p.getByRole('button',{name:'↓ Export',exact:true}),'complete-'+theme);
   // Genuine same-origin reader, while the existing source page retains its writer lock.
   const reader=await h.ctx.newPage();reader.on('pageerror',e=>h.errors.push('Reader '+e));await reader.clock.install({time:new Date(F.now)});await reader.goto(p.url(),{waitUntil:'domcontentloaded'});await reader.waitForFunction(()=>WRITER_READY&&!WRITER);
   const readerBefore=await snapshot(reader),readerFile=await download(reader,reader.locator('#save-status').getByRole('button',{name:'Export saved data',exact:true}),'reader-'+theme),readerAfter=await snapshot(reader);
   T('R7 reader actual export takes no ownership and changes no SK/AW bytes '+theme,!readerBefore.writer&&!readerAfter.writer&&readerBefore.raw===readerAfter.raw&&readerBefore.active===readerAfter.active&&await p.evaluate(()=>canWriteStore()),JSON.stringify({before:readerBefore,after:readerAfter}));await reader.close();
   // Explicit synthetic save-failure setup exposes the existing saved-history-only action.
   await p.evaluate(()=>{window.__durationRealSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='rft-v12')throw new DOMException('R7 declared save-failure setup','QuotaExceededError');return window.__durationRealSet.call(this,k,v)}});
   await key(p,p.locator('button[onclick="D.theme=\''+(theme==='light'?'dark':'light')+'\';save();applyTheme();render()"]'));await p.locator('#save-status').getByRole('button',{name:'Download saved history only',exact:true}).waitFor({state:'visible'});
   const faultBefore=await snapshot(p),saved=await download(p,p.locator('#save-status').getByRole('button',{name:'Download saved history only',exact:true}),'saved-'+theme),faultAfter=await snapshot(p);
   T('R7 actual saved-history-only export preserves pending/main/active '+theme,!!faultBefore.pending&&equal(faultAfter.pending,faultBefore.pending)&&faultBefore.raw===faultAfter.raw&&faultBefore.active===faultAfter.active,JSON.stringify({before:faultBefore,after:faultAfter}));
   await p.evaluate(()=>{Storage.prototype.setItem=window.__durationRealSet});await key(p,p.locator('#save-status').getByRole('button',{name:'Retry save',exact:true}));T('R7 declared failure retry retains8 '+theme,await p.evaluate(()=>!PENDING_SAVE&&D.sessions[0].duration===8));
   const files=[];for(const file of [complete,readerFile,saved])files.push({...file.record,restored:await restore(file,theme)});const occupied=await restore(complete,theme,true);
   T('R7 source phone has no errors/overflow '+theme,h.errors.length===0&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),h.errors.join('\n'));
   evidence.push({theme,input,expected:F.expected(),initial,committed,history:text,analytics,files,reader:{setup:'Sibling source page holds the actual browser writer lock; no Use this tab',before:readerBefore,after:readerAfter},savedScope:{setup:'Declared synthetic main-key setItem failure followed by real theme button, visible Download saved history only and Retry save',before:faultBefore,after:faultAfter},occupied,errors:h.errors});write();
  }finally{await h.ctx.close()}
 }
};
