import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir,devNull} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {releaseDocuments,DISTRIBUTION_REPOSITORY} from './release-snapshot.mjs';
import {canonicalVersion} from './upstream-policy.mjs';
import {downloadActionArtifact} from './actions-artifact.mjs';

export const RELEASE_REPO='T8mars/Deepseek-Harness-Zhenzhen';
export const FEED_REF='heads/codex/distribution';
const sha=x=>createHash('sha256').update(x).digest('hex');
export const releaseJson=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);

async function boundedBody(response,limit){
  const chunks=[];let size=0;
  if(!response.body)return Buffer.alloc(0);
  try{for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('GitHub response exceeded its bound.');chunks.push(chunk);}}catch{throw Error('GitHub response could not be read within its bound.');}
  return Buffer.concat(chunks);
}
/** Only fixed GitHub hosts, no redirects with credentials, no response-body logging or mutation retry. */
export function releaseApi(token,{fetchImpl=globalThis.fetch,readOnly=false}={}){
  if(!(readOnly&&token===undefined)&&(typeof token!=='string'||!token||/[\r\n]/.test(token)))throw Error('GitHub release credential is unavailable.');
  async function request(path,{method='GET',body,bytes,optional=false}={}){
    if(readOnly&&(method!=='GET'||body!==undefined||bytes!==undefined))throw Error('Read-only release client refused a mutation.');
    if(!/^\/(?:git\/|actions\/|releases(?:\/|\?|$))/.test(path)||path.includes('..')||/[\r\n#]/.test(path))throw Error('GitHub release endpoint refused.');
    const upload=bytes!==undefined;
    const url=(upload?'https://uploads.github.com/repos/':'https://api.github.com/repos/')+RELEASE_REPO+path;
    let response;try{response=await fetchImpl(url,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{...(token?{Authorization:'Bearer '+token}:{}),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':upload?'application/octet-stream':'application/json'},body:upload?bytes:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('GitHub release request failed; publication state must be inspected before retrying.');}
    if(optional&&response.status===404)return null;
    if(!response.ok)throw Error('GitHub release request refused (HTTP '+response.status+').');
    const raw=await boundedBody(response,2*1024*1024);try{return JSON.parse(raw);}catch{throw Error('GitHub release response was not valid JSON.');}
  }
  async function asset(id,limit=8*1024*1024){
    if(!Number.isSafeInteger(id)||id<=0)throw Error('Release asset identity refused.');
    let url='https://api.github.com/repos/'+RELEASE_REPO+'/releases/assets/'+id;
    for(let n=0;n<3;n++){
      const headers=n===0?{...(token?{Authorization:'Bearer '+token}:{}),Accept:'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'}:{};
      let response;try{response=await fetchImpl(url,{redirect:'manual',headers,signal:AbortSignal.timeout(45000)});}catch{throw Error('Release asset read failed.');}
      if([301,302,303,307,308].includes(response.status)){
        let next;try{next=new URL(response.headers.get('location'));}catch{throw Error('Release asset redirect refused.');}
        if(next.protocol!=='https:'||next.hostname!=='release-assets.githubusercontent.com'||next.username||next.password||next.port)throw Error('Release asset redirect refused.');url=next.href;continue;
      }
      if(!response.ok)throw Error('Release asset read refused.');return boundedBody(response,limit);
    }
    throw Error('Release asset redirect limit exceeded.');
  }
  return {request,asset,artifact:id=>downloadActionArtifact(token,id,fetchImpl)};
}

export function requireReleaseRun(run,jobs,{sourceCommit,runId,attempt,requiredJobs}){
  if(!run||run.id!==runId||run.run_attempt!==attempt||run.head_sha!==sourceCommit||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/release.yml'||run.repository?.full_name!==RELEASE_REPO||run.head_repository?.full_name!==RELEASE_REPO||!Array.isArray(jobs?.jobs)||jobs.total_count!==jobs.jobs.length||jobs.jobs.length>100)throw Error('Release workflow identity or complete job evidence refused.');
  for(const name of requiredJobs){const found=jobs.jobs.filter(job=>job.name===name&&job.run_id===runId&&job.run_attempt===attempt);if(found.length!==1||found[0].status!=='completed'||found[0].conclusion!=='success'||!Number.isSafeInteger(found[0].id)||found[0].id<=0)throw Error('Required release job has not succeeded.');}
  return {workflow:'release.yml',runId,attempt,sourceCommit,jobIds:requiredJobs.map(name=>jobs.jobs.find(j=>j.name===name).id)};
}
export async function checkReleaseEvidence(api,{sourceCommit,runId,attempt,requiredJobs}){
  if(!hex(sourceCommit,40)||!Number.isSafeInteger(runId)||runId<=0||!Number.isSafeInteger(attempt)||attempt<=0)throw Error('Release evidence identity refused.');
  const run=await api.request('/actions/runs/'+runId+'/attempts/'+attempt),jobs=await api.request('/actions/runs/'+runId+'/attempts/'+attempt+'/jobs?per_page=100');
  const result=requireReleaseRun(run,jobs,{sourceCommit,runId,attempt,requiredJobs});
  const check=await api.request('/actions/workflows/check.yml/runs?branch=main&event=push&head_sha='+sourceCommit+'&per_page=1'),latest=check?.workflow_runs?.[0];
  if(!latest||latest.head_sha!==sourceCommit||latest.event!=='push'||latest.head_branch!=='main'||latest.path!=='.github/workflows/check.yml'||latest.status!=='completed'||latest.conclusion!=='success'||latest.repository?.full_name!==RELEASE_REPO||latest.head_repository?.full_name!==RELEASE_REPO)throw Error('Exact source main contracts have not succeeded.');
  return {...result,contractsRunId:latest.id};
}
export function requireCanary(p){
  if(p.meta.channel!=='canary'||p.meta.sourceDirty||p.meta.tag!=='v'+p.archive.manifest.version||!/^\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(p.archive.manifest.version))throw Error('Only a clean, explicitly versioned canary can be published by W4.');
}
export function snapshotRef(p){requireCanary(p);return 'refs/heads/codex/distribution-snapshots/'+p.meta.tag;}

/** Uses only trusted Git plumbing and inert validated bytes in a new owned bare repository. */
export async function uploadReleaseSnapshot(p,api,token){
  const ref=snapshotRef(p),before=await api.request('/git/ref/'+ref.slice(5),{optional:true});
  if(before){if(before.object?.type!=='commit'||before.object.sha!==p.snapshot.commit)throw Error('Existing snapshot reference differs; refusing overwrite.');return {ref,commit:p.snapshot.commit,reused:true};}
  const parent=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(parent,'dsh-release-snapshot-'))),env={};
  for(const [key,value] of Object.entries(process.env))if(['path','systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))env[key]=value;
  Object.assign(env,{GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:'',GIT_CONFIG_KEY_1:'http.'+DISTRIBUTION_REPOSITORY+'.extraheader',GIT_CONFIG_VALUE_1:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')});
  const git=(args,input)=>{try{return execFileSync('git',['--no-replace-objects','-C',root,...args],{input,env,windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024}).toString().trim();}catch{throw Error('Snapshot Git operation failed; inspect remote state before retrying.');}};
  try{
    git(['init','--bare','--object-format=sha1','.']);
    for(const [id,object] of p.snapshot.objects)if(git(['hash-object','-w','--stdin','-t',object.type],object.data)!==id)throw Error('Snapshot Git object differs.');
    git(['update-ref','refs/heads/snapshot',p.snapshot.commit]);git(['fsck','--full','--no-reflogs']);
    git(['push',DISTRIBUTION_REPOSITORY,p.snapshot.commit+':'+ref]);
    const after=await api.request('/git/ref/'+ref.slice(5));if(after.object?.type!=='commit'||after.object.sha!==p.snapshot.commit)throw Error('Snapshot remote readback differs.');
    return {ref,commit:p.snapshot.commit,reused:false};
  }finally{
    const part=relative(parent,realpathSync.native(root));if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-release-snapshot-'))throw Error('Temporary snapshot cleanup boundary refused.');
    rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}

export function publishedRecord(p,release,evidence){
  requireCanary(p);
  const milliseconds=Date.parse(release?.published_at);
  if(!Number.isSafeInteger(release?.id)||release.id<=0||release.tag_name!==p.meta.tag||release.target_commitish!==p.meta.sourceCommit||release.draft!==false||release.prerelease!==true||!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Published release identity refused.');
  return {version:p.archive.manifest.version,tag:p.meta.tag,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream:p.meta.upstream,publishTimestamp:Math.floor(milliseconds/1000),releaseId:release.id,runtimeEvidence:evidence};
}
function validateRecord(r){
  const e=r?.runtimeEvidence;
  if(!r||Object.keys(r).sort().join(',')!=='archiveSha256,payloadSha256,publishTimestamp,releaseId,runtimeEvidence,snapshotCommit,sourceCommit,tag,upstream,version'||!/^\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(r.version??'')||r.tag!=='v'+r.version||!hex(r.sourceCommit,40)||!hex(r.snapshotCommit,40)||!hex(r.archiveSha256,64)||!hex(r.payloadSha256,64)||!canonicalVersion(r.upstream?.version)||!hex(r.upstream?.commit,40)||Object.keys(r.upstream).sort().join(',')!=='commit,version'||!Number.isSafeInteger(r.publishTimestamp)||r.publishTimestamp<0||!Number.isSafeInteger(r.releaseId)||r.releaseId<=0||!e||e.workflow!=='release.yml'||e.sourceCommit!==r.sourceCommit||!Number.isSafeInteger(e.runId)||e.runId<=0||!Number.isSafeInteger(e.attempt)||e.attempt<=0||!Number.isSafeInteger(e.contractsRunId)||e.contractsRunId<=0||!Array.isArray(e.jobIds)||e.jobIds.length!==3||e.jobIds.some(id=>!Number.isSafeInteger(id)||id<=0)||Object.keys(e).sort().join(',')!=='attempt,contractsRunId,jobIds,runId,sourceCommit,workflow')throw Error('Distribution ledger record refused.');
}
export {validateRecord as validateCanaryRecord};
export function distributionFeed(previous,record){
  if(!previous)previous={schemaVersion:1,canary:[],stable:[]};
  if(Object.keys(previous).sort().join(',')!=='canary,schemaVersion,stable'||previous.schemaVersion!==1||!Array.isArray(previous.canary)||previous.canary.length>100||!Array.isArray(previous.stable)||previous.stable.length)throw Error('Distribution ledger shape or unsupported stable state refused.');
  const records=[...previous.canary];for(const r of records)validateRecord(r);if(new Set(records.map(r=>r.version)).size!==records.length)throw Error('Duplicate distribution versions refused.');
  if(record){validateRecord(record);const existing=records.find(r=>r.version===record.version);if(existing&&!isDeepStrictEqual(existing,record))throw Error('Published version identity differs; refusing replacement.');if(!existing)records.push(record);}
  if(records.length>100)throw Error('Distribution ledger is full; review retention explicitly.');
  records.sort((a,b)=>b.publishTimestamp-a.publishTimestamp||a.version.localeCompare(b.version,'en'));
  const state={schemaVersion:1,canary:records,stable:[]},base={format:1,title:{en:'DSH-zhen',zh:'DSH-zhen 创作插件'},plugins:[]};
  const index=structuredClone(base);if(records.length)index.plugins=[{name:'dsh-zhen',title:{en:'DSH-zhen',zh:'DSH-zhen 创作空间'},versions:records.map(r=>({version:r.version,publishTimestamp:r.publishTimestamp,source:{type:'git',url:DISTRIBUTION_REPOSITORY,commit:r.snapshotCommit,path:'package'},engines:{dsh:r.upstream.version}}))}];
  const compat={schemaVersion:1,stable:[],canary:records.map(r=>({tag:r.tag,version:r.version,state:'verified-canary',snapshotCommit:r.snapshotCommit,archiveSha256:r.archiveSha256,payloadSha256:r.payloadSha256,sourceCommit:r.sourceCommit,declaredRuntimeVersions:[r.upstream.version],upstreamCommit:r.upstream.commit,runtimeEvidence:r.runtimeEvidence}))};
  return new Map([['state.json',releaseJson(state)],['market/index.json',releaseJson(base)],['channels/canary/market/index.json',releaseJson(index)],['compat.json',releaseJson(compat)],['index.html',Buffer.from('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH-zhen</title><body><h1>DSH-zhen 分发索引</h1><p>非官方社区修改版，与 DeepSeek 无隶属关系。</p><p><a href="market/index.json">稳定版索引</a> · <a href="channels/canary/market/index.json">Canary 索引</a> · <a href="compat.json">兼容信息</a></p><p>Canary 供测试使用；稳定版需经过独立晋升。</p></body></html>\n')]]);
}
export async function readDistributionFeed(api,commit){
  if(!hex(commit,40))throw Error('Feed commit refused.');
  const tree=await api.request('/git/trees/'+commit+'?recursive=1'),allowed=distributionFeed(null).keys(),names=new Set(allowed);
  if(tree.truncated||!Array.isArray(tree.tree)||tree.tree.length>20)throw Error('Distribution feed tree is incomplete.');
  const leaves=tree.tree.filter(e=>e.type!=='tree');if(leaves.length!==names.size||leaves.some(e=>e.type!=='blob'||e.mode!=='100644'||!names.has(e.path)||!hex(e.sha,40)))throw Error('Unexpected distribution feed contents.');
  const files=new Map();for(const e of leaves){const b=await api.request('/git/blobs/'+e.sha);if(b.encoding!=='base64'||b.size>1024*1024||typeof b.content!=='string')throw Error('Distribution feed blob refused.');const bytes=Buffer.from(b.content,'base64');if(bytes.length!==b.size)throw Error('Distribution feed blob size differs.');const id=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');if(id!==e.sha)throw Error('Distribution feed blob digest differs.');files.set(e.path,bytes);}
  let state;try{state=JSON.parse(files.get('state.json'));}catch{throw Error('Distribution feed state is invalid.');}
  const expected=distributionFeed(state);for(const [path,bytes] of expected)if(!bytes.equals(files.get(path)))throw Error('Distribution feed has unrecognized modifications.');return {state,files};
}
export async function publishDistributionFeed(api,record){
  const ref=await api.request('/git/ref/'+FEED_REF,{optional:true});if(ref&&ref.object?.type!=='commit')throw Error('Distribution reference is not a commit.');
  const old=ref?await readDistributionFeed(api,ref.object.sha):null,files=distributionFeed(old?.state,record);
  if(old&&[...files].every(([path,bytes])=>bytes.equals(old.files.get(path))))return {commit:ref.object.sha,reused:true};
  const entries=[];for(const [path,bytes] of files){const b=await api.request('/git/blobs',{method:'POST',body:{encoding:'base64',content:bytes.toString('base64')}});if(!hex(b.sha,40))throw Error('Feed blob response refused.');entries.push({path,mode:'100644',type:'blob',sha:b.sha});}
  const tree=await api.request('/git/trees',{method:'POST',body:{tree:entries}});if(!hex(tree.sha,40))throw Error('Feed tree response refused.');
  const commit=await api.request('/git/commits',{method:'POST',body:{message:'Publish verified DSH-zhen canary '+record.tag,tree:tree.sha,parents:ref?[ref.object.sha]:[]}});if(!hex(commit.sha,40))throw Error('Feed commit response refused.');
  if(ref)await api.request('/git/refs/'+FEED_REF,{method:'PATCH',body:{sha:commit.sha,force:false}});else await api.request('/git/refs',{method:'POST',body:{ref:'refs/'+FEED_REF,sha:commit.sha}});
  const after=await api.request('/git/ref/'+FEED_REF);if(after.object?.sha!==commit.sha)throw Error('Distribution reference readback differs.');await readDistributionFeed(api,commit.sha);return {commit:commit.sha,reused:false};
}

export async function publishCanaryRelease(p,api,evidence){
  requireCanary(p);validateRecord({version:p.archive.manifest.version,tag:p.meta.tag,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream:p.meta.upstream,publishTimestamp:0,releaseId:1,runtimeEvidence:evidence});
  const snapshot=await api.request('/git/ref/'+snapshotRef(p).slice(5));if(snapshot.object?.sha!==p.snapshot.commit)throw Error('Published snapshot reference differs.');
  const tag=await api.request('/git/ref/tags/'+p.meta.tag,{optional:true});
  if(tag&&(tag.object?.type!=='commit'||tag.object.sha!==p.meta.sourceCommit))throw Error('Release tag already has a different identity.');
  if(!tag)await api.request('/git/refs',{method:'POST',body:{ref:'refs/tags/'+p.meta.tag,sha:p.meta.sourceCommit}});
  const body='DSH-zhen verified canary\n\nSource: '+p.meta.sourceCommit+'\nSnapshot: '+p.snapshot.commit+'\nArchive-SHA256: '+p.archive.sha256+'\n';
  let release=await api.request('/releases/tags/'+p.meta.tag,{optional:true});
  if(!release)release=await api.request('/releases',{method:'POST',body:{tag_name:p.meta.tag,target_commitish:p.meta.sourceCommit,name:'DSH-zhen '+p.archive.manifest.version,body,draft:true,prerelease:true,make_latest:'false'}});
  if(!Number.isSafeInteger(release.id)||release.id<=0||release.tag_name!==p.meta.tag||release.target_commitish!==p.meta.sourceCommit||release.body!==body||release.prerelease!==true)throw Error('Existing release identity differs.');
  const assets=await api.request('/releases/'+release.id+'/assets?per_page=100');if(!Array.isArray(assets)||assets.length>=100)throw Error('Release assets are incomplete.');
  let runtime=evidence;const existingCompat=assets.find(a=>a.name==='compat.json');
  if(existingCompat){let c;try{c=JSON.parse(await api.asset(existingCompat.id,65536));}catch{throw Error('Existing release compatibility asset is invalid.');}runtime=c.runtimeEvidence;if(runtime?.sourceCommit!==p.meta.sourceCommit)throw Error('Existing runtime evidence identifies another source commit.');const verified=await checkReleaseEvidence(api,{...runtime,requiredJobs:['build','snapshot','verify']});if(!isDeepStrictEqual(runtime,verified))throw Error('Existing runtime evidence differs.');}
  const docs=releaseDocuments(p.archive,p.snapshot,{channel:'canary',tag:p.meta.tag,upstream:p.meta.upstream,publishTimestamp:p.meta.timestamp}),compat={...docs.compat,state:'verified-canary',runtimeEvidence:runtime};
  const payload=new Map([[p.meta.archiveFile,p.bytes],['compat.json',releaseJson(compat)],['provenance.json',releaseJson(p.snapshot.provenance)]]);
  payload.set('SHA256SUMS',Buffer.from([...payload].map(([name,bytes])=>sha(bytes)+'  '+name).join('\n')+'\n'));
  if(new Set(assets.map(a=>a.name)).size!==assets.length||assets.some(a=>!payload.has(a.name)))throw Error('Unexpected release assets; refusing mutation.');
  for(const [name,bytes] of payload){const asset=assets.find(a=>a.name===name);if(asset){if(asset.state!=='uploaded'||asset.size!==bytes.length||!bytes.equals(await api.asset(asset.id)))throw Error('Existing release asset differs; refusing replacement.');}else{if(!release.draft)throw Error('Published release is incomplete; refusing late asset modification.');await api.request('/releases/'+release.id+'/assets?name='+encodeURIComponent(name),{method:'POST',bytes});}}
  const uploaded=await api.request('/releases/'+release.id+'/assets?per_page=100');
  if(!Array.isArray(uploaded)||uploaded.length!==payload.size)throw Error('Release asset readback is incomplete.');
  for(const [name,bytes] of payload){const matches=uploaded.filter(a=>a.name===name);if(matches.length!==1||matches[0].state!=='uploaded'||matches[0].size!==bytes.length||!bytes.equals(await api.asset(matches[0].id)))throw Error('Release asset readback differs.');}
  if(release.draft)release=await api.request('/releases/'+release.id,{method:'PATCH',body:{draft:false,prerelease:true,make_latest:'false'}});
  release=await api.request('/releases/'+release.id);
  return {release,record:publishedRecord(p,release,runtime)};
}
