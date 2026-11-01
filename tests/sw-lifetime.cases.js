module.exports=async function({loadSW,Res,Req,CACHE,T,flush}){
 const fs=require('node:fs'),path=require('node:path'),evidence=[],errors=[],unhandled=e=>errors.push(String(e)),deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}},record=(name,actual)=>evidence.push({case:name,actual});
 process.on('unhandledRejection',unhandled);
 try{
  const nav=()=>Req('https://app/workout',{mode:'navigate',accept:'text/html'});
  for(const status of [500,503,599])for(const exact of [false,true]){
   const sw=loadSW({fetchImpl:()=>Promise.resolve(new Res('server-'+status,{status}))});await sw.caches.open(CACHE).then(c=>c.put(exact?nav():'./index.html',new Res('good-shell')));const ev=sw.fetchEvent(nav()),r=await ev.response;await flush();
   T('R12 5xx uses good cached shell '+status+'/'+exact,r.status===200&&r.body==='good-shell');T('R12 5xx never poisons good bytes '+status+'/'+exact,(await sw.caches.match(exact?nav():'./index.html')).body==='good-shell');record('cached '+status+'/'+exact,{status:r.status,body:r.body});
  }
  for(const kind of ['missing','unusable','read failure','bad exact good index']){
   const controls={},sw=loadSW({controls,fetchImpl:()=>Promise.resolve(new Res('original-503',{status:503}))});if(kind==='unusable'||kind==='bad exact good index')await sw.caches.open(CACHE).then(c=>c.put(nav(),new Res('bad-cache',{status:404})));if(kind==='bad exact good index')await sw.caches.open(CACHE).then(c=>c.put('./index.html',new Res('index-good')));if(kind==='read failure')controls.match=()=>Promise.reject(Error('synthetic cache read'));
   const r=await sw.fetchEvent(nav()).response;T('R12 5xx preserves original unless good cache '+kind,kind==='bad exact good index'?r.status===200&&r.body==='index-good':r.status===503&&r.body==='original-503');record(kind,{status:r.status,body:r.body});
  }
  for(const [name,req,response]of [['404',nav(),new Res('not-found',{status:404})],['cross-origin response',nav(),new Res('remote',{status:503,type:'cors'})],['cross-origin HTML request',Req('https://elsewhere/page',{accept:'text/html'}),new Res('remote',{status:503})]]){
   const sw=loadSW({fetchImpl:()=>Promise.resolve(response)});await sw.caches.open(CACHE).then(c=>c.put('./index.html',new Res('shell')));const r=await sw.fetchEvent(req).response;T('R12 preserve non-target response '+name,r===response);record(name,{status:r.status,body:r.body});
  }
  for(const branch of ['font','opaque font','navigation','asset'])for(const phase of ['open','put'])for(const rejected of [false,true]){
   const hold=deferred(),controls={[phase]:()=>hold.promise},req=branch.includes('font')?Req('https://fonts.gstatic.com/test.woff2'):branch==='asset'?Req('https://app/icon.png'):nav(),response=new Res(branch+'-bytes',branch==='opaque font'?{status:0,type:'opaque'}:branch==='font'?{type:'cors'}:{}),sw=loadSW({controls,fetchImpl:()=>Promise.resolve(response)}),ev=sw.fetchEvent(req);let foreground=false;ev.response.then(()=>{foreground=true},()=>{});await flush();
   const pending=ev.active();T('R12 foreground prompt while '+branch+' '+phase+' held '+rejected,foreground);T('R12 retains complete write '+branch+' '+phase+' '+rejected,pending);
   if(rejected)hold.reject(Error('synthetic held '+phase+' rejection'));else hold.resolve();const r=await ev.response;await Promise.all(ev.waits);await flush();T('R12 valid response and settled write '+branch+' '+phase+' '+rejected,r===response&&!ev.active());record('held '+branch+'/'+phase+'/'+rejected,{foregroundBeforeRelease:foreground,pendingUntilRelease:pending,status:r.status,rejected,settled:!ev.active()});
  }
  for(const branch of ['font','asset']){
   const req=branch==='font'?Req('https://fonts.gstatic.com/hit.woff2'):Req('https://app/hit.png'),controls={},sw=loadSW({controls,fetchImpl:()=>{throw Error('cache hit must not fetch')}});await sw.caches.open(CACHE).then(c=>c.put(req,new Res('cached')));const ev=sw.fetchEvent(req);await ev.response;await Promise.all(ev.waits);await flush();T('R12 cache hit settles lifetime '+branch,!ev.active());
  }
  for(const branch of ['font','navigation','asset'])for(const rejected of [false,true]){
   const controls={},req=branch==='font'?Req('https://fonts.gstatic.com/no-write.woff2'):branch==='asset'?Req('https://app/no-write.png'):nav(),sw=loadSW({controls,fetchImpl:()=>rejected?Promise.reject(Error('offline')):Promise.resolve(new Res('404',{status:404}))}),ev=sw.fetchEvent(req);await ev.response;await Promise.all(ev.waits);await flush();T('R12 no-write settles lifetime '+branch+'/'+rejected,!ev.active());
  }
  for(const branch of ['font','navigation','asset']){
   const controls={match:()=>Promise.reject(Error('cache read'))},req=branch==='font'?Req('https://fonts.gstatic.com/read.woff2'):branch==='asset'?Req('https://app/read.png'):nav(),sw=loadSW({controls,fetchImpl:()=>Promise.resolve(new Res('ok'))}),ev=sw.fetchEvent(req);await ev.response.catch(()=>{});await Promise.all(ev.waits);await flush();T('R12 cache-read error releases lifetime '+branch,!ev.active());
  }
  for(const branch of ['font','navigation']){
   const network=deferred(),hold=deferred(),controls={},req=branch==='font'?Req('https://fonts.gstatic.com/late.woff2'):nav(),sw=loadSW({controls,fetchImpl:()=>network.promise});if(branch==='navigation')await sw.caches.open(CACHE).then(c=>c.put('./index.html',new Res('old-shell')));const ev=sw.fetchEvent(req);await flush();await sw.clock.advance(branch==='font'?2500:3000);const first=await ev.response;controls.put=()=>hold.promise;network.resolve(new Res('late-refresh',branch==='font'?{type:'cors'}:{}));await flush();T('R12 late write remains retained '+branch,ev.active());hold.resolve();await Promise.all(ev.waits);await flush();const cached=await sw.caches.match(req);T('R12 late refresh complete without changing foreground '+branch,cached.body==='late-refresh'&&!ev.active()&&(branch==='font'?first.status===504:first.body==='old-shell'));record('late '+branch,{foreground:branch==='font'?first.status:first.body,refreshed:cached.body,settled:!ev.active()});
  }
  // Native Response streams: the page consumes the foreground while put is held;
  // the later cache consumer must still read its independent clone in full.
  for(const branch of ['font','navigation','asset']){
   const hold=deferred();let stored='';const controls={put:async(req,r)=>{await hold.promise;stored=await r.text()}},req=branch==='font'?Req('https://fonts.gstatic.com/native.woff2'):branch==='asset'?Req('https://app/native.png'):nav(),response=new Response('native-'+branch);Object.defineProperty(response,'type',{value:branch==='font'?'cors':'basic'});const sw=loadSW({controls,ResponseImpl:Response,fetchImpl:()=>Promise.resolve(response)}),ev=sw.fetchEvent(req);let returned=false;ev.response.then(()=>{returned=true},()=>{});await flush();T('R12 native foreground prompt '+branch,returned);const earlyBody=returned?await(await ev.response).text():null;hold.resolve();const r=await ev.response,body=earlyBody??await r.text();await Promise.all(ev.waits);await flush();T('R12 native independent clone remains readable '+branch,body==='native-'+branch&&stored===body&&!ev.active());record('native '+branch,{foreground:body,cached:stored,bodyUsed:r.bodyUsed,consumedBeforePutRelease:earlyBody!==null});
  }
  // Model check: later additions are legal while a lifetime promise is pending;
  // once response and retained work settle, a new extension must be rejected.
  {const hold=deferred(),sw=loadSW({fetchImpl:()=>hold.promise}),ev=sw.fetchEvent(nav());let accepted=true;try{ev.extend(Promise.resolve())}catch(_){accepted=false}T('R12 active model permits later pending extension',accepted);hold.resolve(new Res('done'));await ev.response;await Promise.all(ev.waits);await flush();let inactive=false;try{ev.extend(Promise.resolve())}catch(e){inactive=/inactive/.test(e.message)}T('R12 active model rejects inactive extension',inactive)}
  await flush();T('R12 handled background failures produce no unhandled rejection',errors.length===0,errors.join('\n'));record('unhandled rejections',{count:errors.length});
 }finally{process.removeListener('unhandledRejection',unhandled)}
 if(!process.env.SW_MUTATION){const output=path.join(__dirname,'..','test-results','recovery-layout');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'sw-lifetime-unit-evidence.json'),JSON.stringify(evidence,null,2));}
};
