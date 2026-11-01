// Exercise the production CLI's real exit results in small synthetic Git histories.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const guard=path.resolve(__dirname,'../.github/scripts/check-cache-version.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-cache-guard-')),results=[];
const one="const C = 'rft-test-1';\nconst CORE = ['./'];\n",two="const C = 'rft-test-2';\nconst CORE = ['./'];\n";let repositories=0;
const git=(dir,args)=>execFileSync('git',['-c','core.hooksPath='+path.join(root,'no-hooks'),'-c','commit.gpgsign=false','-c','user.name=Guard test','-c','user.email=guard@example.invalid',...args],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function commit(dir,index,sw){fs.writeFileSync(path.join(dir,'index.html'),index);fs.writeFileSync(path.join(dir,'sw.js'),sw);git(dir,['add','-Af','--','.']);git(dir,['commit','-qm','Synthetic guard fixture']);return git(dir,['rev-parse','HEAD'])}
function repository(sw=one){const dir=path.join(root,String(++repositories));fs.mkdirSync(dir);git(dir,['init','-q']);fs.writeFileSync(path.join(dir,'README.md'),'Fixture\n');return{dir,base:commit(dir,'old shell\n',sw)}}
function check(name,dir,base,expected,reason){
 const env={...process.env,UV_THREADPOOL_SIZE:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'};if(base===undefined)delete env.BASE_SHA;else env.BASE_SHA=base;
 const run=spawnSync(process.execPath,['--max-old-space-size=128','--single-threaded',guard],{cwd:dir,env,encoding:'utf8'}),output=run.stdout+run.stderr;
 assert.ifError(run.error);assert.equal(run.signal,null,name);assert.equal(run.status,expected,name+'\n'+output);assert.match(output,reason,name);
 const result={case:name,expected,status:run.status,base:base??null,output:output.trim()};results.push(result);console.log(JSON.stringify(result));
}
function scenario(name,oldSw,newSw,status,reason,docsOnly=false){const{dir,base}=repository(oldSw);if(docsOnly)fs.writeFileSync(path.join(dir,'README.md'),'Changed documentation\n');commit(dir,docsOnly?'old shell\n':'changed shell\n',newSw);check(name,dir,base,status,reason)}
try{
 for(const[name,sw]of [
  ['unchanged',one],['whitespace',"  const\tC  =  'rft-test-1' ;\nconst CORE = ['./'];\n"],
  ['comment',one.replace("'rft-test-1';","'rft-test-1'; // comment only")],['quotes',one.replace("'rft-test-1'",'"rft-test-1"')],
  ['CORE only',one.replace("['./']","['./', './index.html']")]
 ])scenario('equal identity: '+name,one,sw,1,/unchanged cache identity/);
 scenario('distinct literal',one,two,0,/Cache identity changed/);
 scenario('distinct CRLF and closed comment header',one,'/* Header */\r\n'+two.replace(/\n/g,'\r\n'),0,/Cache identity changed/);
 scenario('docs only',one,one,0,/index.html unchanged/,true);
 const actualSW=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');scenario('repository SW declaration is recognized',actualSW,actualSW,1,/unchanged cache identity/);
 for(const[name,sw]of [['missing',"const CORE = ['./'];\n"],['duplicate',one+two],['expression',"const C = 'rft-test-' + '2';\n"]]){
  scenario('current declaration '+name,one,sw,1,/cache declaration/);scenario('base declaration '+name,sw,two,1,/cache declaration/);
 }
 scenario('block-comment fake declaration',one,"/*\nconst C = 'rft-test-2';\n*/\n",1,/cache declaration/);
 scenario('template-contained fake declaration',one,"const note = `\nconst C = 'rft-test-2';\n`;\n",1,/cache declaration/);
 const{dir,base:a}=repository(),b=commit(dir,'second shell\n',two);commit(dir,'third shell\n',one);
 check('explicit PR base differs from parent',dir,a,1,/unchanged cache identity/);check('normal push base',dir,b,0,/Cache identity changed/);
 for(const[name,ref]of [['missing',undefined],['zero','0'.repeat(40)],['unknown','f'.repeat(40)]])check('HEAD~1 fallback: '+name,dir,ref,0,/Cache identity changed/);
 commit(dir,'fourth shell\n',one);check('fallback still rejects equal identity',dir,'0'.repeat(40),1,/unchanged cache identity/);
 const initial=repository();check('unavailable base and parent',initial.dir,'0'.repeat(40),1,/verification unavailable/);
 console.log(JSON.stringify({guardSHA256:crypto.createHash('sha256').update(fs.readFileSync(guard)).digest('hex'),cases:results.length,zeroExit:results.filter(r=>r.status===0).length,nonzeroExit:results.filter(r=>r.status!==0).length}));
 console.log(results.length+' cache guard exit-result cases passed');
}finally{
 const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('tracker-cache-guard-'))throw Error('Unsafe temporary cleanup target');
 fs.rmSync(resolved,{recursive:true,force:true});
}
