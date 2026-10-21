import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {zipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync,existsSync,symlinkSync,renameSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {parse} from 'yaml';
import {readReleaseArchive} from '../scripts/release-archive.mjs';
import {releaseSnapshot,releaseDocuments} from '../scripts/release-snapshot.mjs';
import {distributionFeed,FEED_REF,RELEASE_REPO,releaseJson} from '../scripts/publish-release-core.mjs';
import {readPublishedCanary} from '../scripts/published-canary.mjs';
import {currentObserver,bindSmokeCandidate,readSmokeCandidate} from '../scripts/candidate-smoke-input.mjs';
import {candidateWorkflowContext,prepareCandidateSmoke} from '../scripts/prepare-candidate-smoke.mjs';
import {exportCandidateObservation} from '../scripts/export-candidate-observation.mjs';
import {candidateIdentity,verifyCandidateObservation} from '../scripts/promotion-policy.mjs';
import {runGatewaySmoke} from '../scripts/gateway-smoke-core.mjs';

const source='1'.repeat(40),observer='3'.repeat(40),timestamp=1700000000,upstream={version:'0.2.1-rc.2',commit:'2'.repeat(40)},sha=b=>createHash('sha256').update(b).digest('hex');
const productionPatch=readFileSync(new URL('../packages/dsh-zhen/cordis.patch.yml',import.meta.url));
const required=['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','lib/index.js','lib/client.js','lib/remote.js','lib/typert.js','lib/canvas-server.js','lib/mcp-server.js','lib/pdf-text-worker.js','lib/docx-text-worker.js','catalog/skills.json'];
function bundle(version='0.1.0',patch=productionPatch){
 const manifest={name:'dsh-zhen',version,description:'EXAMPLE_ONLY',main:'./lib/index.js',engines:{dsh:upstream.version},peerDependencies:{'@deepseek-ai/dsh-llm':upstream.version,'@deepseek-ai/dsh-llm-pi-ai':upstream.version},dsh:{bundle:{patch:'./cordis.patch.yml'}}};
 const entries=[['package.json',releaseJson(manifest)],['cordis.patch.yml',patch],['catalog/runtime.json',releaseJson({dsh:upstream.version})],...required.map(name=>[name,Buffer.from('EXAMPLE_ONLY '+name)])],parts=[];
 for(const[name,bytes]of entries){const h=Buffer.alloc(512);h.write('package/'+name,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);parts.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));}
 const bytes=gzipSync(Buffer.concat([...parts,Buffer.alloc(1024)]));return{bytes,archive:readReleaseArchive(bytes)};
}
function candidate(patch=productionPatch){
 const p=bundle('0.1.0-canary.1',patch),snapshot=releaseSnapshot(p.archive,{sourceCommit:source,timestamp}),runtimeEvidence={workflow:'release.yml',runId:42,attempt:1,sourceCommit:source,jobIds:[51,52,53],contractsRunId:60};
 const record={version:p.archive.manifest.version,tag:'v'+p.archive.manifest.version,sourceCommit:source,snapshotCommit:snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream,publishTimestamp:Date.parse('2026-01-01T00:00:00Z')/1000,releaseId:70,runtimeEvidence};
 return{...p,snapshot,record,identity:candidateIdentity(record)};
}
function server(p=candidate()){
 const calls=[],blobs=new Map(),feedCommit='4'.repeat(40),files=distributionFeed(null,p.record),tree=[...files].map(([path,bytes])=>{const id=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');blobs.set(id,bytes);return{path,type:'blob',mode:'100644',sha:id};});
 const run={id:42,run_attempt:1,head_sha:source,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/release.yml',repository:{full_name:RELEASE_REPO},head_repository:{full_name:RELEASE_REPO}};
 const release={id:70,tag_name:p.identity.tag,target_commitish:source,draft:false,prerelease:true,published_at:'2026-01-01T00:00:00Z'};
 const doc=releaseDocuments(p.archive,p.snapshot,{channel:'canary',tag:p.identity.tag,upstream,publishTimestamp:timestamp}),name=`dsh-zhen-${p.identity.version}-${p.archive.sha256.slice(0,16)}.tgz`;
 const payload=new Map([[name,p.bytes],['compat.json',releaseJson({...doc.compat,state:'verified-canary',runtimeEvidence:p.record.runtimeEvidence})],['provenance.json',releaseJson(p.snapshot.provenance)]]);payload.set('SHA256SUMS',Buffer.from([...payload].map(([n,b])=>sha(b)+'  '+n).join('\n')+'\n'));
 const assets=[...payload].map(([name,bytes],i)=>({id:80+i,name,size:bytes.length,state:'uploaded',bytes}));
 const api={asset:async id=>Buffer.from(assets.find(a=>a.id===id).bytes),request:async(path,options={})=>{assert.equal(options.method??'GET','GET');calls.push(path);
  if(path==='/git/ref/'+FEED_REF)return{object:{type:'commit',sha:feedCommit}};
  if(path==='/git/trees/'+feedCommit+'?recursive=1')return{truncated:false,tree};
  if(path.startsWith('/git/blobs/')){const bytes=blobs.get(path.split('/').at(-1));return{encoding:'base64',size:bytes.length,content:bytes.toString('base64')};}
  if(path==='/releases/tags/'+p.identity.tag)return structuredClone(release);
  if(path==='/releases/70/assets?per_page=100')return assets.map(({bytes,...a})=>({...a}));
  if(path==='/git/ref/tags/'+p.identity.tag)return{object:{type:'commit',sha:source}};
  if(path==='/git/ref/heads/codex/distribution-snapshots/'+p.identity.tag)return{object:{type:'commit',sha:p.snapshot.commit}};
  if(path==='/actions/runs/42/attempts/1')return structuredClone(run);
  if(path==='/actions/runs/42/attempts/1/jobs?per_page=100')return{total_count:3,jobs:['build','snapshot','verify'].map((name,i)=>({id:51+i,run_id:42,run_attempt:1,name,status:'completed',conclusion:'success'}))};
  if(path.startsWith('/actions/workflows/check.yml/runs?'))return{workflow_runs:[{...run,id:60,event:'push',path:'.github/workflows/check.yml',status:'completed',conclusion:'success'}]};
  throw Error('Unexpected EXAMPLE endpoint '+path);
 }};
 const lookup={head:()=>observer,dirty:()=>false,sourceTimestamp:commit=>{assert.equal(commit,source);return timestamp;},readSource:(commit,path)=>{if(commit===source&&path==='packages/dsh-zhen/package.json')return releaseJson(p.archive.manifest);if(commit===source&&path==='UPSTREAM.lock.json')return releaseJson({dsh:upstream});assert.equal(commit,observer);return readFileSync(new URL('../'+path,import.meta.url));}};
 return{api,calls,release,assets,lookup,p};
}
function workspace(t,patch=productionPatch){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-candidate-smoke-EXAMPLE-'))),p=bundle('0.1.0',patch);t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-candidate-smoke-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 for(const dir of['.runtime/packages','packages/dsh-zhen','node_modules/@deepseek-ai/dsh-llm-pi-ai'])mkdirSync(join(root,dir),{recursive:true});
 const name=`dsh-zhen-${p.archive.manifest.version}-${p.archive.sha256.slice(0,16)}.tgz`;writeFileSync(join(root,'.runtime/packages',name),p.bytes);writeFileSync(join(root,'.runtime/package-artifact.json'),releaseJson({file:name,sha256:p.archive.sha256}));writeFileSync(join(root,'packages/dsh-zhen/package.json'),releaseJson(p.archive.manifest));writeFileSync(join(root,'UPSTREAM.lock.json'),releaseJson({dsh:upstream}));writeFileSync(join(root,'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json'),readFileSync(new URL('../node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json',import.meta.url)));return root;
}
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:RELEASE_REPO,GITHUB_REF:'refs/heads/main',GITHUB_SHA:observer,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'workflow_dispatch',DSH_SMOKE_CONFIRM:'true',DSH_SMOKE_CANARY:'v0.1.0-canary.1'});
const context=root=>({workspace:root,mode:'ci',runId:'123-1',commit:observer,tag:'v0.1.0-canary.1'});
function sse(){return new Response(['data: '+JSON.stringify({choices:[{index:0,delta:{content:'OK'},finish_reason:null}]}),'data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:2,total_tokens:9}}),'data: [DONE]'].join('\n\n')+'\n\n',{headers:{'content-type':'text/event-stream'}});}

test('C79: fixed public canary is re-read from canonical feed, deterministic source, all assets and original server jobs',async()=>{
 const s=server(),p=await readPublishedCanary(s.api,s.p.identity.tag,s.lookup);assert.deepEqual(p.identity,s.p.identity);assert.equal(p.bytes.equals(s.p.bytes),true);assert.ok(s.calls.some(p=>p.includes('/attempts/1/jobs')));assert.ok(s.calls.some(p=>p.includes('/check.yml/')));
});
test('C79: unpublished, draft, wrong release identity and changed assets cannot become paid candidate input',async()=>{
 for(const change of[s=>s.release.draft=true,s=>s.release.prerelease=false,s=>s.release.target_commitish=observer,s=>s.release.id=71,s=>s.release.published_at='2026-01-02T00:00:00Z',s=>s.assets.pop(),s=>s.assets[1].bytes[0]^=1,s=>s.assets[0].bytes[0]^=1]){const s=server();change(s);await assert.rejects(readPublishedCanary(s.api,s.p.identity.tag,s.lookup));}
 const s=server();await assert.rejects(readPublishedCanary({request:async()=>null},s.p.identity.tag,s.lookup));await assert.rejects(readPublishedCanary(s.api,'v0.1.0',s.lookup));
});
test('C79: original source pin, snapshot, ref and green runtime evidence must still match',async()=>{
 for(const change of[s=>s.lookup.sourceTimestamp=()=>timestamp+1,s=>s.lookup.readSource=()=>releaseJson({dsh:{...upstream,commit:observer}}),s=>{const original=s.api.request;s.api.request=async(path,o)=>path.startsWith('/git/ref/tags/')?{object:{type:'commit',sha:observer}}:original(path,o);},s=>{const original=s.api.request;s.api.request=async(path,o)=>path.includes('/attempts/1/jobs')?{total_count:0,jobs:[]}:original(path,o);}]){const s=server();change(s);await assert.rejects(readPublishedCanary(s.api,s.p.identity.tag,s.lookup));}
});
test('C79: first authorized main attempt prepares an immutable non-executable binding before any paid step',async t=>{
 const root=workspace(t),s=server(),options={workspace:root,env:env(),api:s.api,source:s.lookup};assert.equal((await prepareCandidateSmoke(options)).paidRequests,0);const before=readFileSync(join(root,'.runtime/smoke-candidate.json'));assert.equal((await prepareCandidateSmoke(options)).state,'bound');assert.equal(readFileSync(join(root,'.runtime/smoke-candidate.json')).equals(before),true);assert.deepEqual(readSmokeCandidate(context(root)).binding.identity,s.p.identity);
 for(const patch of[{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_REPOSITORY:'EXAMPLE/FORK'},{GITHUB_EVENT_NAME:'pull_request'},{DSH_SMOKE_CONFIRM:'false'},{DSH_SMOKE_CANARY:''}])assert.throws(()=>candidateWorkflowContext({...env(),...patch}));
 await assert.rejects(prepareCandidateSmoke({...options,source:{...s.lookup,dirty:()=>true}}));
});
test('C79: complete archive, source manifest, adapter and upstream drift invalidate a prepared binding',t=>{
 const root=workspace(t),p=candidate();bindSmokeCandidate(root,p.identity,observer);const files=['.runtime/package-artifact.json','packages/dsh-zhen/package.json','node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json','UPSTREAM.lock.json'];
 for(const name of files){const path=join(root,name),before=readFileSync(path),json=JSON.parse(before);if(name.includes('package-artifact'))json.sha256='0'.repeat(64);else if(name==='UPSTREAM.lock.json')json.dsh.commit=observer;else json.version='0.2.0';writeFileSync(path,releaseJson(json));assert.throws(()=>readSmokeCandidate(context(root)));writeFileSync(path,before);}
 assert.throws(()=>readSmokeCandidate({...context(root),commit:source}));assert.throws(()=>readSmokeCandidate({...context(root),runId:'123-2'}));assert.throws(()=>readSmokeCandidate({...context(root),mode:'local'}));assert.throws(()=>readSmokeCandidate({...context(root),tag:'v0.1.0-canary.2'}));
 const metadata=JSON.parse(readFileSync(join(root,'.runtime/package-artifact.json'))),path=join(root,'.runtime/packages',metadata.file),before=readFileSync(path);writeFileSync(path,Buffer.concat([before,Buffer.from('EXAMPLE_EXTRA')]));assert.throws(()=>currentObserver(root));writeFileSync(path,before);
});
test('C79: symlink inputs and replacing an existing candidate binding are refused',t=>{
 const root=workspace(t),p=candidate();bindSmokeCandidate(root,p.identity,observer);assert.throws(()=>bindSmokeCandidate(root,{...p.identity,releaseId:71},observer));
 const directory=join(root,'.runtime/packages'),savedDirectory=join(root,'EXAMPLE_PACKAGES');assert.equal(relative(root,directory),join('.runtime','packages'));assert.equal(relative(root,savedDirectory),'EXAMPLE_PACKAGES');renameSync(directory,savedDirectory);symlinkSync(savedDirectory,directory,'junction');assert.throws(()=>currentObserver(root));rmSync(directory);renameSync(savedDirectory,directory);
 const path=join(root,'.runtime/smoke-candidate.json'),saved=readFileSync(path),target=join(root,'EXAMPLE_BINDING.json');writeFileSync(target,saved);rmSync(path);try{symlinkSync(target,path,'file');}catch(error){if(error.code==='EPERM'){t.diagnostic('Windows file-symlink privilege unavailable; directory junction refusal remains covered.');return;}throw error;}assert.throws(()=>readSmokeCandidate(context(root)));
});
test('C79: real published adapter executes fixed candidate config once and exports bytes accepted by server observation policy',async t=>{
 const root=workspace(t),s=server();await prepareCandidateSmoke({workspace:root,env:env(),api:s.api,source:s.lookup});let calls=0;
 const report=await runGatewaySmoke({...context(root),candidateTag:s.p.identity.tag,credentialValue:'EXAMPLE_ONLY_CI_CREDENTIAL',fetcher:async()=>{calls++;return sse();}});assert.equal(report.outcome,'passed');assert.equal(calls,1);assert.deepEqual(report.candidate.identity,s.p.identity);
 const result=exportCandidateObservation({workspace:root,env:env(),source:s.lookup});assert.equal(result.files,2);assert.equal(result.paidRequests,0);assert.equal(exportCandidateObservation({workspace:root,env:env(),source:s.lookup}).state,'exported');
 const directory=join(root,'.runtime/candidate-observation'),bytes=Buffer.from(zipSync({'report.json':readFileSync(join(directory,'report.json')),'bundle.tgz':readFileSync(join(directory,'bundle.tgz'))}));
 const start=new Date(Date.parse(report.at)-1000).toISOString(),end=new Date(Date.parse(report.finishedAt)+1000).toISOString(),run={id:123,run_attempt:1,head_sha:observer,head_branch:'main',repository:{full_name:RELEASE_REPO},head_repository:{full_name:RELEASE_REPO},path:'.github/workflows/real-gateway-smoke.yml',event:'workflow_dispatch',display_title:'Flash observation · '+s.p.identity.tag,status:'completed',conclusion:'success',created_at:start,updated_at:end};
 const job={id:400,name:'smoke',run_id:123,run_attempt:1,status:'completed',conclusion:'success',started_at:start,completed_at:end,steps:['Bind fixed published canary','One fixed real Flash request','Export candidate observation'].map(name=>({name,status:'completed',conclusion:'success',started_at:start,completed_at:end}))},artifact={id:500,name:'candidate-observation-123-1',expired:false,workflow_run:{id:123,head_sha:observer,head_branch:'main'},created_at:end,size_in_bytes:bytes.length,digest:'sha256:'+sha(bytes)};
 assert.equal(verifyCandidateObservation({run,jobs:{total_count:1,jobs:[job]},artifact,bytes},s.p.identity,end,s.lookup.readSource).runId,123);
 assert.equal(readFileSync(join(directory,'bundle.tgz')).equals(currentObserver(root).bytes),true);
});
test('C79: invalid candidate or repeat attempts are stopped before credential setup, request or spent-intent creation',async t=>{
 const root=workspace(t),p=candidate();bindSmokeCandidate(root,p.identity,observer);let calls=0;for(const patch of[{runId:'123-2'},{commit:source},{sourceDirty:true},{candidateTag:'v0.1.0-canary.2'}])await assert.rejects(runGatewaySmoke({...context(root),candidateTag:p.identity.tag,...patch,credentialValue:'EXAMPLE_ONLY_CI_CREDENTIAL',fetcher:async()=>{calls++;return sse();}}));assert.equal(calls,0);assert.equal(existsSync(join(root,'.runtime/evidence')),false);
});
test('C79: candidate archive configuration is actually read and cannot silently use the current source default',async t=>{
 const patch=Buffer.from(productionPatch.toString().replace("apiKeyEnv: SEEDANCE_API_KEY","apiKeyEnv: EXAMPLE_DIFFERENT_REFERENCE"));assert.notEqual(patch.toString(),productionPatch.toString());const root=workspace(t,patch),p=candidate(patch);bindSmokeCandidate(root,p.identity,observer);let calls=0;
 const report=await runGatewaySmoke({...context(root),candidateTag:p.identity.tag,credentialValue:'EXAMPLE_ONLY_CI_CREDENTIAL',fetcher:async()=>{calls++;return sse();}});assert.equal(report.outcome,'not-run');assert.equal(report.code,'ROUTE_REFUSED');assert.equal(calls,0);assert.throws(()=>exportCandidateObservation({workspace:root,env:env(),source:server(p).lookup}));
});
test('C79: safe receipt export rejects unexpected fields, swapped identity or changed output without overwriting files',async t=>{
 const root=workspace(t),s=server();bindSmokeCandidate(root,s.p.identity,observer);await runGatewaySmoke({...context(root),candidateTag:s.p.identity.tag,credentialValue:'EXAMPLE_ONLY_CI_CREDENTIAL',fetcher:async()=>sse()});const path=join(root,'.runtime/evidence/real-gateway-smoke-123-1.json'),before=readFileSync(path),options={workspace:root,env:env(),source:s.lookup};
 for(const change of[r=>r.extra='EXAMPLE_PRIVATE_VALUE',r=>r.candidate.identity.releaseId++,r=>r.requests=2,r=>r.sourceSha256['gateway-smoke-core.mjs']='0'.repeat(64)]){const r=JSON.parse(before);change(r);writeFileSync(path,releaseJson(r));assert.throws(()=>exportCandidateObservation(options));assert.equal(existsSync(join(root,'.runtime/candidate-observation')),false);}writeFileSync(path,before);exportCandidateObservation(options);
 const target=join(root,'.runtime/candidate-observation/report.json');writeFileSync(target,'EXAMPLE_PREEXISTING');assert.throws(()=>exportCandidateObservation(options));assert.equal(readFileSync(target,'utf8'),'EXAMPLE_PREEXISTING');
});
test('C79: candidate workflow binds before payment, exports only safe files and isolates GitHub and gateway credentials',()=>{
 const w=parse(readFileSync(new URL('../.github/workflows/real-gateway-smoke.yml',import.meta.url),'utf8')),job=w.jobs.smoke,steps=job.steps;
 assert.equal(w.on.workflow_dispatch.inputs.canary_tag.default,'');assert.match(w['run-name'],/^Flash observation · /);for(const value of[w['run-name'],job.env.DSH_SMOKE_CANARY]){assert.match(value,/github.event_name == 'workflow_dispatch' && inputs.canary_tag/);assert.match(value,/github.event_name == 'schedule' && vars.REAL_GATEWAY_SMOKE_CANARY/);}
 assert.ok(steps.findIndex(s=>s.name==='Bind fixed published canary')<steps.findIndex(s=>s.name==='One fixed real Flash request'));assert.equal(steps.find(s=>s.name==='Bind fixed published canary').env.GH_TOKEN,'${{ github.token }}');assert.equal(steps.find(s=>s.name==='One fixed real Flash request').env.GH_TOKEN,undefined);
 const upload=steps.find(s=>s.with?.name==='candidate-observation-${{ github.run_id }}-${{ github.run_attempt }}');assert.equal(upload.with.path,'.runtime/candidate-observation/*');assert.equal(upload.with['retention-days'],90);assert.equal(job.permissions.contents,'read');assert.equal(job.permissions.actions,'read');assert.equal(JSON.stringify(w).match(/secrets.SEEDANCE_API_KEY/g).length,1);
});
test('C79: real autocrlf checkout keeps the three actual observation script hashes equal to their Git source bytes',t=>{
 const root=workspace(t),sourceRoot=join(root,'EXAMPLE_SOURCE'),checkout=join(root,'EXAMPLE_CHECKOUT');mkdirSync(sourceRoot);mkdirSync(join(sourceRoot,'scripts'));
 writeFileSync(join(sourceRoot,'.gitattributes'),readFileSync(new URL('../.gitattributes',import.meta.url)));
 const names=['gateway-smoke-core.mjs','real-gateway-smoke.mjs','check-smoke-ci.mjs'];for(const name of names)writeFileSync(join(sourceRoot,'scripts',name),readFileSync(new URL('../scripts/'+name,import.meta.url)).toString('utf8').replaceAll('\r\n','\n'));
 const git=args=>execFileSync('git',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 git(['-C',sourceRoot,'init','.']);git(['-C',sourceRoot,'-c','core.autocrlf=true','-c','core.safecrlf=false','add','--','.gitattributes','scripts']);git(['-C',sourceRoot,'-c','user.name=EXAMPLE automation','-c','user.email=example@dsh-zhen.invalid','commit','-m','EXAMPLE_ONLY']);
 git(['-c','core.autocrlf=true','clone','--no-hardlinks',sourceRoot,checkout]);for(const name of names){const working=readFileSync(join(checkout,'scripts',name)),sourceBytes=git(['-C',checkout,'show','HEAD:scripts/'+name]);assert.equal(sha(working),sha(sourceBytes),'Receipt script hash must equal immutable source under real Windows checkout.');}
});
