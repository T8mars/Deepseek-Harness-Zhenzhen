import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const paths=['package.json','packages/dsh-zhen/package.json','UPSTREAM.lock.json','packages/dsh-zhen/src/compatibility.ts'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Preparation records checkout bytes. A clean Windows checkout can use CRLF,
// while the same reviewed Git blob uses LF; no other content change is allowed.
function matchesCheckout(text,expected){const lf=text.replace(/\r\n/g,'\n');return[hash(lf),hash(lf.replace(/\n/g,'\r\n'))].includes(expected);}

/** Read the exact prior project graph from the source reviewed by preparation.
 * This never installs, imports, fetches or executes that source's own code. */
export function previousRuntimeProject(plan,workspace=process.cwd()){
 assert.ok(plan?.from&&plan.baseFiles);for(const path of paths)assert.match(plan.baseFiles[path],/^[a-f0-9]{64}$/);
 const git=args=>execFileSync('git',['--no-replace-objects',...args],{cwd:workspace,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1024**2});
 const commits=git(['rev-list','--first-parent','--max-count=1000','HEAD']).trim().split(/\r?\n/);let sourceCommit,manifestText,upstreamText;
 for(const commit of commits){
  assert.match(commit,/^[a-f0-9]{40}$/);let matched=true;const observed={};
  for(const path of paths){let text;try{text=git(['show',commit+':'+path]);}catch{matched=false;break;}if(!matchesCheckout(text,plan.baseFiles[path])){matched=false;break;}observed[path]=text;}
  if(matched){sourceCommit=commit;manifestText=observed['package.json'];upstreamText=observed['UPSTREAM.lock.json'];break;}
 }
 assert.ok(sourceCommit,'Reviewed prior source is unavailable in this checkout history.');
 const manifest=JSON.parse(manifestText),upstream=JSON.parse(upstreamText),lockText=git(['show',sourceCommit+':package-lock.json']),lock=JSON.parse(lockText);
 assert.equal(manifest.name,'dsh-zhen-workspace');assert.equal(manifest.workspaces,undefined);assert.equal(manifest.dependencies?.['@deepseek-ai/dsh'],plan.from.version);
 assert.equal(upstream.dsh.version,plan.from.version);assert.equal(upstream.dsh.commit,plan.from.commit);assert.equal(upstream.dsh.registryIntegrity,plan.from.registryIntegrity);
 assert.equal(lock.lockfileVersion,3);assert.equal(lock.name,manifest.name);assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);assert.deepEqual(lock.packages[''].devDependencies,manifest.devDependencies);
 const sdk=lock.packages['node_modules/@deepseek-ai/dsh'];assert.equal(sdk.version,plan.from.version);assert.equal(sdk.integrity,plan.from.registryIntegrity);
 for(const[path,item]of Object.entries(lock.packages)){if(!path)continue;assert.equal(item.link,undefined,'Prior graph must not load workspace links.');if(item.resolved)assert.ok(item.resolved.startsWith('https://registry.npmjs.org/'),'Prior graph must retain registry sources only.');}
 return{sourceCommit,manifestText,lockText,lockSha256:hash(lockText),packages:Object.keys(lock.packages).length-1};
}
