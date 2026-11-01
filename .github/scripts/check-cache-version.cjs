// Release guard for this repository's leading, standalone cache-name literal.
// Unsupported declaration syntax fails closed; never execute service-worker code.
const fs=require('node:fs'),{execFileSync,spawnSync}=require('node:child_process');
const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function resolve(ref){if(!ref)return null;try{return git(['rev-parse','--verify','--quiet',ref+'^{commit}'])}catch{return null}}
function cacheName(source,label){
 source=source.replace(/\r\n/g,'\n');
 const declarations=[...source.matchAll(/^[ \t]*(?:const|let|var)[ \t]+C\b[^\r\n]*$/gm)];
 if(declarations.length!==1)throw Error(label+' cache declaration is missing or ambiguous');
 const declaration=declarations[0],prefix=source.slice(0,declaration.index);
 if(!/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*$/.test(prefix))throw Error(label+' cache declaration must be the leading standalone literal');
 const value=declaration[0].match(/^[ \t]*const[ \t]+C[ \t]*=[ \t]*(['"])([A-Za-z0-9._-]+)\1[ \t]*;[ \t]*(?:\/\/[^\r\n]*)?$/);
 if(!value)throw Error(label+' cache declaration is malformed or unsupported');
 return value[2];
}
function main(){
 // Preserve PR/push BASE_SHA selection in the workflow and its HEAD~1 fallback.
 const base=resolve(process.env.BASE_SHA)||resolve('HEAD~1');
 if(!base)throw Error('Cache verification unavailable: no usable comparison base');
 console.log('Comparison base: '+base);
 const diff=spawnSync('git',['diff','--quiet',base,'--','index.html'],{encoding:'utf8'});
 if(diff.error||![0,1].includes(diff.status))throw Error('Cache verification unavailable: index.html diff failed');
 if(diff.status===0){console.log('index.html unchanged; no cache bump required');return}
 const before=cacheName(git(['show',base+':sw.js']),'Base'),after=cacheName(fs.readFileSync('sw.js','utf8'),'Current');
 if(before===after)throw Error('index.html changed with unchanged cache identity '+after);
 console.log('Cache identity changed: '+before+' → '+after);
}
try{main()}catch(error){console.error('::error::'+error.message);process.exitCode=1}
