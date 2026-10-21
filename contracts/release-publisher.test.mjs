import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {parse} from 'yaml';
import {parseMarketIndex} from '@deepseek-ai/dsh-plugin-market-index';
import {readReleaseArchive} from '../scripts/release-archive.mjs';
import {releaseSnapshot} from '../scripts/release-snapshot.mjs';
import {validateReleaseInput} from '../scripts/release-input.mjs';
import {writeReleaseStage,INDEX_URL} from '../scripts/prepare-release.mjs';
import {RELEASE_REPO,FEED_REF,releaseApi,releaseJson,requireReleaseRun,checkReleaseEvidence,requireCanary,uploadReleaseSnapshot,publishedRecord,distributionFeed,readDistributionFeed,publishDistributionFeed,publishCanaryRelease} from '../scripts/publish-release-core.mjs';

const sourceCommit='1'.repeat(40),upstream={version:'0.2.1-rc.2',commit:'2'.repeat(40)},timestamp=1700000000;
const required=['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','lib/index.js','lib/client.js','lib/remote.js','lib/typert.js','lib/canvas-server.js','lib/mcp-server.js','lib/pdf-text-worker.js','lib/docx-text-worker.js','cordis.patch.yml','catalog/skills.json'];
function candidate(version='0.1.0-canary.1'){
  const manifest={name:'dsh-zhen',version,description:'EXAMPLE_ONLY',main:'./lib/index.js',engines:{dsh:upstream.version},dsh:{bundle:{patch:'./cordis.patch.yml'}}};
  const files=[['package.json',JSON.stringify(manifest)],...required.map(path=>[path,'EXAMPLE_ONLY '+path])],parts=[];
  for(const [name,text] of files){const bytes=Buffer.from(text),h=Buffer.alloc(512);h.write('package/'+name,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);parts.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));}
  const bytes=gzipSync(Buffer.concat([...parts,Buffer.alloc(1024)])),archive=readReleaseArchive(bytes),snapshot=releaseSnapshot(archive,{sourceCommit,timestamp});
  const meta={schemaVersion:1,channel:version.includes('canary')?'canary':'development',tag:'v'+version,sourceCommit,sourceDirty:false,timestamp,archiveFile:`dsh-zhen-${version}-${archive.sha256.slice(0,16)}.tgz`,archiveSha256:archive.sha256,snapshotCommit:snapshot.commit,upstream};
  return validateReleaseInput(meta,bytes,{sourceCommit,timestamp,upstream,manifest});
}
function serverEvidence(){
  const run={id:42,run_attempt:1,head_sha:sourceCommit,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/release.yml',repository:{full_name:RELEASE_REPO},head_repository:{full_name:RELEASE_REPO}};
  const jobs={total_count:3,jobs:['build','snapshot','verify'].map((name,n)=>({id:n+51,run_id:42,run_attempt:1,name,status:'completed',conclusion:'success'}))};
  const opts={sourceCommit,runId:42,attempt:1,requiredJobs:['build','snapshot','verify']};
  return {run,jobs,opts,evidence:{...requireReleaseRun(run,jobs,opts),contractsRunId:60}};
}
function record(p=candidate()){return publishedRecord(p,{id:70,tag_name:p.meta.tag,target_commitish:sourceCommit,draft:false,prerelease:true,published_at:'2026-10-21T00:00:00Z'},serverEvidence().evidence);}
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function fakeServer(p=candidate()){
  const {run,jobs,evidence}=serverEvidence(),calls=[],assets=[],blobs=new Map();let release=null,feed=null,tag=null;
  const api={asset:async id=>Buffer.from(assets.find(a=>a.id===id).bytes),request:async(path,options={})=>{
    calls.push({path,method:options.method??'GET',body:options.body,bytes:options.bytes});
    if(path==='/actions/runs/42/attempts/1')return structuredClone(run);
    if(path==='/actions/runs/42/attempts/1/jobs?per_page=100')return structuredClone(jobs);
    if(path.startsWith('/actions/workflows/check.yml/runs?'))return {workflow_runs:[{...run,id:60,event:'push',path:'.github/workflows/check.yml',status:'completed',conclusion:'success'}]};
    if(path.startsWith('/git/ref/heads/codex/distribution-snapshots/'))return {object:{type:'commit',sha:p.snapshot.commit}};
    if(path==='/git/ref/tags/'+p.meta.tag)return tag;
    if(path==='/git/refs'&&options.body?.ref==='refs/tags/'+p.meta.tag){tag={object:{type:'commit',sha:options.body.sha}};return tag;}
    if(path==='/releases/tags/'+p.meta.tag)return release&&structuredClone(release);
    if(path==='/releases'&&options.method==='POST'){release={id:70,...options.body,published_at:null};return structuredClone(release);}
    if(path==='/releases/70/assets?per_page=100')return assets.map(({bytes,...asset})=>({...asset}));
    if(path.startsWith('/releases/70/assets?name=')){const name=decodeURIComponent(path.split('name=')[1]),asset={id:80+assets.length,name,bytes:Buffer.from(options.bytes),size:options.bytes.length,state:'uploaded'};assets.push(asset);return {id:asset.id};}
    if(path==='/releases/70'&&options.method==='PATCH'){release={...release,...options.body,published_at:'2026-10-21T00:00:00Z'};return structuredClone(release);}
    if(path==='/releases/70')return structuredClone(release);
    if(path==='/git/ref/'+FEED_REF)return feed?{object:{type:'commit',sha:feed}}:null;
    if(path==='/git/blobs'&&options.method==='POST'){const bytes=Buffer.from(options.body.content,'base64'),id=gitBlob(bytes);blobs.set(id,bytes);return {sha:id};}
    throw Error('Unexpected EXAMPLE endpoint '+path);
  }};
  return {api,calls,assets,blobs,run,jobs,evidence,setRelease:x=>release=x,setTag:x=>tag=x};
}

test('C73: inert input is bound to exact source, time, upstream and package bytes',()=>{
  const p=candidate(),context={sourceCommit,timestamp,upstream,manifest:p.archive.manifest};
  for(const patch of [{sourceCommit:'3'.repeat(40)},{timestamp:timestamp+1},{upstream:{...upstream,version:'0.2.0'}},{archiveFile:'../EXAMPLE.tgz'},{archiveSha256:'0'.repeat(64)},{snapshotCommit:'4'.repeat(40)},{sourceDirty:true},{extra:'EXAMPLE'}])assert.throws(()=>validateReleaseInput({...p.meta,...patch},p.bytes,context));
  assert.throws(()=>requireCanary(candidate('0.1.0')));assert.doesNotThrow(()=>requireCanary(p));
});
test('C73: real hydrate CLI reuses the SDK-normalized candidate stage and independent archive',t=>{
  const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-release-hydrate-EXAMPLE-'))),p=candidate();
  t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-release-hydrate-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  git(['init','.']);git(['-c','user.name=EXAMPLE automation','-c','user.email=example@dsh-zhen.invalid','commit','--allow-empty','-m','EXAMPLE_ONLY']);
  const commit=git(['rev-parse','HEAD']),time=Number(git(['show','-s','--format=%ct','HEAD'])),snapshot=releaseSnapshot(p.archive,{sourceCommit:commit,timestamp:time});
  const meta={...p.meta,sourceCommit:commit,timestamp:time,snapshotCommit:snapshot.commit},documents={...p.documents,index:parseMarketIndex(p.documents.index,INDEX_URL),compat:{...p.documents.compat,sourceCommit:commit,snapshotCommit:snapshot.commit}};
  documents.index.plugins[0].versions[0].source.commit=snapshot.commit;documents.index.plugins[0].versions[0].publishTimestamp=time;
  const stage=writeReleaseStage(root,p.bytes,p.archive,snapshot,documents,meta);
  mkdirSync(join(root,'.runtime/release-input'));mkdirSync(join(root,'packages/dsh-zhen'),{recursive:true});
  writeFileSync(join(root,'.runtime/release-input/candidate.json'),releaseJson(meta));writeFileSync(join(root,'.runtime/release-input',meta.archiveFile),p.bytes);
  writeFileSync(join(root,'.runtime/package-artifact.json'),releaseJson({file:meta.archiveFile,sha256:p.archive.sha256}));writeFileSync(join(root,'packages/dsh-zhen/package.json'),releaseJson(p.archive.manifest));writeFileSync(join(root,'UPSTREAM.lock.json'),releaseJson({dsh:upstream}));
  const env={};for(const [key,value] of Object.entries(process.env))if(['path','systemroot','windir','temp','tmp'].includes(key.toLowerCase()))env[key]=value;
  const run=()=>JSON.parse(execFileSync(process.execPath,[resolve('scripts/release-input.mjs'),'hydrate'],{cwd:root,env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
  assert.equal(run().independentBuildMatched,true);assert.equal(run().snapshotCommit,snapshot.commit);assert.equal(JSON.parse(readFileSync(join(stage.root,'manifest.json'))).snapshot.commit,snapshot.commit);
});
test('C73: server job gates reject fork, stale attempt, missing, duplicated, failed and truncated proof',()=>{
  const {run,jobs,opts}=serverEvidence();assert.equal(requireReleaseRun(run,jobs,opts).jobIds.length,3);
  for(const patch of [{head_sha:'3'.repeat(40)},{run_attempt:2},{head_branch:'EXAMPLE'},{event:'pull_request'},{path:'.github/workflows/EXAMPLE.yml'},{head_repository:{full_name:'EXAMPLE/fork'}}])assert.throws(()=>requireReleaseRun({...run,...patch},jobs,opts));
  for(const mutate of [x=>x.jobs.pop(),x=>x.jobs.push(x.jobs[0]),x=>x.jobs[2].conclusion='failure',x=>x.jobs[2].run_attempt=2,x=>x.total_count=101]){const j=structuredClone(jobs);mutate(j);assert.throws(()=>requireReleaseRun(run,j,opts));}
});
test('C73: exact main push contracts are checked on server before publishing',async()=>{
  const s=fakeServer(),{opts}=serverEvidence();assert.deepEqual(await checkReleaseEvidence(s.api,opts),s.evidence);
  const api={request:async path=>path.startsWith('/actions/workflows/')?{workflow_runs:[{head_sha:sourceCommit,status:'completed',conclusion:'failure'}]}:s.api.request(path)};
  await assert.rejects(checkReleaseEvidence(api,opts));
});
test('C73: API refuses other endpoints, redirection and oversized bodies without logging credentials',async()=>{
  const seen=[],api=releaseApi('EXAMPLE_NON_SECRET',{fetchImpl:async(url,options)=>{seen.push({url,options});return new Response(JSON.stringify({id:1}),{status:200});}});
  assert.deepEqual(await api.request('/releases'),{id:1});assert.equal(seen[0].options.redirect,'error');assert.equal(seen[0].options.headers.Authorization,'Bearer EXAMPLE_NON_SECRET');
  for(const path of ['/settings/raw','/releases/../EXAMPLE','https://example.invalid/EXAMPLE','/git/refs\nEXAMPLE'])await assert.rejects(api.request(path));
  const big=releaseApi('EXAMPLE_NON_SECRET',{fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1))});await assert.rejects(big.request('/releases'));
  const denied=releaseApi('EXAMPLE_NON_SECRET',{fetchImpl:async()=>new Response('EXAMPLE_PRIVATE_BODY',{status:403})});await assert.rejects(denied.request('/releases'),error=>!error.message.includes('PRIVATE_BODY'));
});
test('C73: signed asset redirect strips credentials and rejects untrusted destinations',async()=>{
  const calls=[],api=releaseApi('EXAMPLE_NON_SECRET',{fetchImpl:async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/EXAMPLE'}}):new Response('EXAMPLE_BYTES');}});
  assert.equal((await api.asset(1)).toString(),'EXAMPLE_BYTES');assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Authorization,undefined);
  const bad=releaseApi('EXAMPLE_NON_SECRET',{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://example.invalid/EXAMPLE'}})});await assert.rejects(bad.asset(1));
});
test('C73: existing immutable snapshot is reused only with its exact commit',async()=>{
  const p=candidate(),s=fakeServer(p),result=await uploadReleaseSnapshot(p,s.api,'EXAMPLE_NON_SECRET');assert.equal(result.reused,true);assert.equal(s.calls.length,1);
  await assert.rejects(uploadReleaseSnapshot(p,{request:async()=>({object:{type:'commit',sha:'3'.repeat(40)}})},'EXAMPLE_NON_SECRET'));
});
test('C73: canary assets are checked before public release and never become stable latest',async()=>{
  const p=candidate(),s=fakeServer(p),result=await publishCanaryRelease(p,s.api,s.evidence);
  assert.equal(result.record.publishTimestamp,1792540800);assert.notEqual(result.record.publishTimestamp,timestamp);assert.equal(result.release.prerelease,true);assert.equal(s.assets.length,4);
  const publishAt=s.calls.findIndex(c=>c.method==='PATCH'&&c.path==='/releases/70'),uploads=s.calls.map((c,n)=>c.bytes?n:-1).filter(n=>n>=0);assert.ok(uploads.every(n=>n<publishAt));
  assert.ok(s.calls.filter(c=>c.path==='/releases'||c.method==='PATCH').every(c=>c.body.make_latest==='false'));
  const compat=JSON.parse(s.assets.find(a=>a.name==='compat.json').bytes);assert.equal(compat.state,'verified-canary');assert.deepEqual(compat.runtimeEvidence,s.evidence);
});
test('C73: release retries are idempotent, preserving original independently checked runtime proof',async()=>{
  const p=candidate(),s=fakeServer(p);await publishCanaryRelease(p,s.api,s.evidence);const mutations=s.calls.filter(c=>c.method!=='GET').length;
  const result=await publishCanaryRelease(p,s.api,s.evidence);assert.equal(result.release.draft,false);assert.equal(s.calls.filter(c=>c.method!=='GET').length,mutations);
});
test('C73: conflicting tags, assets and compatibility never get overwritten',async()=>{
  const p=candidate(),s=fakeServer(p);s.setTag({object:{type:'commit',sha:'4'.repeat(40)}});await assert.rejects(publishCanaryRelease(p,s.api,s.evidence));assert.equal(s.calls.some(c=>c.method==='POST'),false);
  const a=fakeServer(p);await publishCanaryRelease(p,a.api,a.evidence);a.assets[0].bytes[0]^=1;const count=a.calls.filter(c=>c.method!=='GET').length;await assert.rejects(publishCanaryRelease(p,a.api,a.evidence));assert.equal(a.calls.filter(c=>c.method!=='GET').length,count);
  const b=fakeServer(p);await publishCanaryRelease(p,b.api,b.evidence);b.assets.push({id:99,name:'EXAMPLE_UNEXPECTED',size:1,state:'uploaded',bytes:Buffer.from('x')});await assert.rejects(publishCanaryRelease(p,b.api,b.evidence));
  const c=fakeServer(p);await assert.rejects(publishCanaryRelease(p,c.api,{...c.evidence,sourceCommit:'9'.repeat(40)}));assert.equal(c.calls.length,0);
});
test('C73: initial feed and subsequent versions publish complete canonical files with retained ancestry',async()=>{
  const blobs=new Map(),trees=new Map(),commits=new Map(),writes=[];let ref=null,n=10;
  const id=()=>String(++n).padStart(40,'0');
  const api={request:async(path,o={})=>{
    if(o.method)writes.push({path,...o});
    if(path==='/git/ref/'+FEED_REF)return ref?{object:{type:'commit',sha:ref}}:null;
    if(path==='/git/blobs'){const bytes=Buffer.from(o.body.content,'base64'),sha=gitBlob(bytes);blobs.set(sha,bytes);return {sha};}
    if(path==='/git/trees'){const sha=id();trees.set(sha,o.body.tree);return {sha};}
    if(path==='/git/commits'){const sha=id();commits.set(sha,o.body);return {sha};}
    if(path==='/git/refs'){assert.equal(o.body.ref,'refs/'+FEED_REF);ref=o.body.sha;return {object:{sha:ref}};}
    if(path==='/git/refs/'+FEED_REF){assert.equal(o.body.force,false);ref=o.body.sha;return {object:{sha:ref}};}
    if(path.startsWith('/git/trees/')){const commit=path.split('/').at(-1).split('?')[0];return {truncated:false,tree:trees.get(commits.get(commit).tree)};}
    if(path.startsWith('/git/blobs/')){const bytes=blobs.get(path.split('/').at(-1));return {encoding:'base64',size:bytes.length,content:bytes.toString('base64')};}
    throw Error('Unexpected EXAMPLE endpoint');
  }};
  const first=await publishDistributionFeed(api,record());assert.deepEqual(commits.get(first.commit).parents,[]);assert.equal((await readDistributionFeed(api,first.commit)).files.size,5);
  const before=writes.length;assert.equal((await publishDistributionFeed(api,record())).reused,true);assert.equal(writes.length,before);
  const second=await publishDistributionFeed(api,record(candidate('0.1.0-canary.2')));assert.deepEqual(commits.get(second.commit).parents,[first.commit]);assert.equal((await readDistributionFeed(api,second.commit)).state.canary.length,2);
});
test('C73: channel feed uses official market format, preserves old versions and leaves stable empty',()=>{
  const r=record(),files=distributionFeed(null,r),state=JSON.parse(files.get('state.json')),again=distributionFeed(state,r);assert.equal(files.size,5);assert.deepEqual(again,files);
  const canary=parseMarketIndex(JSON.parse(files.get('channels/canary/market/index.json')),'https://example.invalid/EXAMPLE/index.json'),stable=parseMarketIndex(JSON.parse(files.get('market/index.json')),'https://example.invalid/EXAMPLE/index.json');assert.equal(canary.plugins[0].versions[0].source.commit,r.snapshotCommit);assert.deepEqual(stable.plugins,[]);
  const next=record(candidate('0.1.0-canary.2'));const more=distributionFeed(state,next);assert.equal(JSON.parse(more.get('state.json')).canary.length,2);
  assert.throws(()=>distributionFeed(state,{...r,snapshotCommit:'3'.repeat(40)}));assert.throws(()=>distributionFeed({...state,stable:[r]},null));assert.throws(()=>distributionFeed({...state,canary:[r,r]},null));assert.throws(()=>distributionFeed(null,{...r,runtimeEvidence:null}));
});
test('C73: feed readback checks ordinary allowlisted tree, blob hashes and canonical content',async()=>{
  const files=distributionFeed(null,record()),blobs=new Map([...files].map(([path,bytes])=>[gitBlob(bytes),{path,bytes}])),entries=[...blobs].map(([sha,x])=>({path:x.path,type:'blob',mode:'100644',sha}));
  const api={request:async path=>path.startsWith('/git/trees/')?{truncated:false,tree:entries}:((x)=>({encoding:'base64',size:x.bytes.length,content:x.bytes.toString('base64')}))(blobs.get(path.split('/').at(-1)))};
  assert.equal((await readDistributionFeed(api,'5'.repeat(40))).files.size,5);
  entries[0].mode='120000';await assert.rejects(readDistributionFeed(api,'5'.repeat(40)));entries[0].mode='100644';entries.push({...entries[0],path:'AGENTS.md'});await assert.rejects(readDistributionFeed(api,'5'.repeat(40)));
});
test('C73: feed publication preserves parent and uses non-force updates with exact readback',async()=>{
  const r=record(),files=distributionFeed(null,r),entries=[...files].map(([path,bytes])=>({path,type:'blob',mode:'100644',sha:gitBlob(bytes)})),blobs=new Map([...files].map(([,bytes])=>[gitBlob(bytes),bytes]));let ref='5'.repeat(40);const calls=[];
  const api={request:async(path,o={})=>{calls.push({path,...o});if(path==='/git/ref/'+FEED_REF)return {object:{type:'commit',sha:ref}};if(path.startsWith('/git/trees/'))return {truncated:false,tree:entries};if(path.startsWith('/git/blobs/')){const b=blobs.get(path.split('/').at(-1));return {encoding:'base64',size:b.length,content:b.toString('base64')};}throw Error('Unexpected EXAMPLE operation');}};
  assert.deepEqual(await publishDistributionFeed(api,r),{commit:ref,reused:true});assert.equal(calls.some(c=>c.method),false);
  // A concurrent writer fails the non-force ref update; there is no forced retry.
  const conflicting={request:async(path,o={})=>{if(!o.method)return api.request(path,o);calls.push({path,...o});if(path==='/git/blobs')return {sha:gitBlob(Buffer.from(o.body.content,'base64'))};if(path==='/git/trees')return {sha:'6'.repeat(40)};if(path==='/git/commits'){assert.deepEqual(o.body.parents,[ref]);return {sha:'7'.repeat(40)};}if(o.method==='PATCH'){assert.equal(o.body.force,false);throw Error('EXAMPLE_CONCURRENT_WRITER');}throw Error('Unexpected EXAMPLE mutation');}};
  await assert.rejects(publishDistributionFeed(conflicting,record(candidate('0.1.0-canary.2'))));assert.equal(calls.filter(c=>c.method==='PATCH').length,1);
});
test('C73: W4 isolates package execution, write tokens, Pages deployment and paid workflow',()=>{
  const workflow=parse(readFileSync('.github/workflows/release.yml','utf8')),jobs=workflow.jobs;assert.equal(workflow.on.workflow_dispatch.inputs.publish.default,false);assert.deepEqual(workflow.permissions,{contents:'read'});assert.equal(workflow.concurrency['cancel-in-progress'],false);
  for(const name of ['snapshot','finalize']){assert.deepEqual(jobs[name].permissions,{contents:'write',actions:'read'});assert.equal(jobs[name].steps.some(s=>/npm |smoke-install|release-input.*hydrate/.test(s.run??'')),false);assert.equal(jobs[name].steps.filter(s=>s.env?.GH_TOKEN).length,1);}
  assert.deepEqual(jobs.verify.permissions,{contents:'read'});assert.ok(jobs.verify.steps.some(s=>s.run?.includes('smoke-install.mjs --git-stage')));assert.deepEqual(jobs.finalize.needs,['build','snapshot','verify']);assert.ok(jobs.site.if.includes('DISTRIBUTION_PAGES_ENABLED'));assert.deepEqual(jobs.pages.permissions,{pages:'write','id-token':'write'});
  assert.equal(JSON.stringify(workflow).includes('SEEDANCE_API_KEY'),false);for(const job of Object.values(jobs))for(const step of job.steps)if(step.uses)assert.match(step.uses,/@[a-f0-9]{40}$/);
  // Publisher's complete static dependency closure stays builtin-only; SDK imports are confined to CLI export/hydrate.
  for(const file of ['publish-release-core.mjs','release-snapshot.mjs','release-archive.mjs','package-policy.mjs','check-private.mjs','upstream-policy.mjs'])assert.equal([...readFileSync('scripts/'+file,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].some(m=>!m[1].startsWith('node:')&&!m[1].startsWith('./')),false);
});
