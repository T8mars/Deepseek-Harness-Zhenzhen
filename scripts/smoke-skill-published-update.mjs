import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,realpathSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Context} from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import {SkillMarket,skillBody} from '../packages/dsh-zhen/lib/market.js';
import {SkillFeed,skillFeedSchema} from '../packages/dsh-zhen/lib/skill-feed.js';
import {GithubAccess} from '../packages/dsh-zhen/lib/github-access.js';

// Real published first-party bytes through authenticated gh CLI reads. The
// application Bearer transport is intentionally NOT claimed by this adapter.
// Only EXAMPLE TEMP stores/sessions; three independent Node registry lifetimes.
const repo='T8mars/Deepseek-Harness-Zhenzhen',id='zhen-knowledge-writing',disabledId='zhen-creative-review',base=realpathSync.native(tmpdir()),sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),worker=args[0]==='--worker',options=new Map();
assert.equal(args.length%2,0,'Arguments must be option/value pairs.');for(let i=0;i<args.length;i+=2){assert.ok(!options.has(args[i]));options.set(args[i],args[i+1]);}
const baseline=options.get('--baseline'),expected=options.get('--expected-commit');assert.match(baseline??'',/^[a-f0-9]{40}$/);assert.match(expected??'',/^[a-f0-9]{40}$/);assert.notEqual(baseline,expected);
const allowed=worker?['--worker','--root','--baseline','--expected-commit']:['--baseline','--expected-commit','--out-name'];for(const key of options.keys())assert.ok(allowed.includes(key),key);
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'}),load=p=>JSON.parse(readFileSync(p,'utf8'));
function owned(root){const absolute=realpathSync.native(root),part=relative(base,absolute);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\')&&part.startsWith('dsh-published-skill-EXAMPLE-'));return absolute;}
if(worker){
 const phase=options.get('--worker');assert.ok(['stage','activate','rollback'].includes(phase));const root=owned(options.get('--root')),execute=promisify(execFile);let reads=0,credentialReads=0;
 const gh=async endpoint=>{reads++;const accept=endpoint.includes('/contents/')?'application/vnd.github.raw+json':'application/vnd.github+json';const result=await execute('gh',['api',endpoint,'-H','Accept: '+accept],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:20000,windowsHide:true,cwd:root});return result.stdout;};
 const fetcher=async(url,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).has('Authorization'),false);
  let endpoint;if(url===`https://api.github.com/repos/${repo}/commits/main`)endpoint=`repos/${repo}/commits/main`;
  else{assert.equal(url,`https://raw.githubusercontent.com/${repo}/${expected}/market/skills.v1.json`);endpoint=`repos/${repo}/contents/market/skills.v1.json?ref=${expected}`;}
  return new Response(await gh(endpoint),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const catalogFile=join(root,'EXAMPLE_BASELINE.json');
 if(phase==='stage'){const raw=await gh(`repos/${repo}/contents/market/skills.v1.json?ref=${baseline}`),feed=skillFeedSchema.parse(JSON.parse(raw));assert.equal(feed.skills.length,15);save(catalogFile,feed.skills);}
 const catalog=load(catalogFile),old=catalog.find(item=>item.manifest.id===id);assert.ok(old);assert.equal(old.manifest.version,'1.0.0');
 const ctx=new Context(),market=new SkillMarket(join(root,'EXAMPLE_SKILLS.sqlite'),catalog),github=new GithubAccess(async()=>undefined,fetcher),feed=new SkillFeed(join(root,'EXAMPLE_FEED.json'),market,fetcher,github);
 ctx.provide('agents',{});ctx.provide('workingDirectory',{ensure:async()=>root});ctx.provide('credentials',{resolve:async()=>{credentialReads++;throw Error('EXAMPLE_NO_APPLICATION_CREDENTIAL_READ');}});
 let report;
 try{
  await ctx.plugin(SkillRegistry);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);ctx.skills.registerProvider(control=>{const remove=market.subscribe(control.invalidate);control.signal.addEventListener('abort',remove,{once:true});return market.provider();});await ctx.plugin(SkillTool);
  let calls=0;const read=async name=>{const result=await ctx.tools.execute({callId:'EXAMPLE_SKILL_'+phase+'_'+(++calls),name:'skill',arguments:{name},signal:new AbortController().signal});assert.equal(result.isError,false);assert.equal(result.value.provider,'dsh-zhen-market');return result.value.content;};
  const row=()=>market.list().find(item=>item.manifest.id===id),stateFile=join(root,'EXAMPLE_STATE.json');
  if(phase==='stage'){
   assert.equal(market.autoPolicy().enabled,false);market.select(id,old.manifest.digest,old.manifest.version);
   const other=catalog.find(item=>item.manifest.id===disabledId);assert.ok(other);market.select(disabledId,other.manifest.digest,other.manifest.version);market.disable(disabledId);
   const personal=market.fork(id,old.manifest.digest,'EXAMPLE ONLY: independent personal instructions remain unchanged.',old.manifest.version),personalHash=sha(await read(personal));assert.equal(await read(id),skillBody(old.content));
   feed.setAutoUpdates(true);const checked=await feed.check();assert.equal(checked.state,'checked');assert.equal(checked.revision,expected);assert.equal(checked.count,15);
   const current=row();assert.equal(current.installedVersion,'1.0.0');assert.equal(current.pendingVersion,'1.0.1');assert.equal(current.pendingMode,'automatic');assert.equal(current.pendingRevision,expected);assert.equal(market.autoPolicy().pendingAutomatic,1);
   assert.equal(await read(id),skillBody(old.content));const update=market.preview(id,current.pendingDigest,current.pendingVersion);assert.notEqual(update.content,old.content);
   assert.equal((await feed.check()).state,'checked');assert.equal(market.autoPolicy().pendingAutomatic,1);assert.equal(sha(await read(personal)),personalHash);
   save(stateFile,{personal,personalHash,oldHash:sha(skillBody(old.content)),newHash:sha(skillBody(update.content)),oldDigest:old.manifest.digest,newDigest:update.manifest.digest});
   report={phase,pid:process.pid,githubReads:reads,liveVersion:'1.0.0',pendingVersion:'1.0.1',pendingRevision:expected,liveTextPreserved:true,automaticQueue:1};
  }else{
   const state=load(stateFile);assert.equal(sha(await read(state.personal)),state.personalHash);assert.equal(market.autoPolicy().enabled,true);assert.equal(market.autoPolicy().pendingAutomatic,0);assert.equal(feed.snapshot().state,'checked');assert.equal(feed.snapshot().revision,expected);
   if(phase==='activate'){
    assert.equal(row().installedVersion,'1.0.1');assert.equal(sha(await read(id)),state.newHash);assert.equal(market.versions(id).length,2);
    market.select(id,state.oldDigest,'1.0.0');assert.equal(row().pendingMode,'manual');assert.equal(row().automaticPaused,true);assert.equal(sha(await read(id)),state.newHash);
    report={phase,pid:process.pid,githubReads:reads,liveVersion:'1.0.1',pendingVersion:'1.0.0',pendingMode:'manual',automaticPaused:true,retainedVersions:2};
   }else{
    assert.equal(row().installedVersion,'1.0.0');assert.equal(sha(await read(id)),state.oldHash);assert.equal(row().automaticPaused,true);assert.equal(row().pendingVersion,'');assert.equal(row().updateAvailable,true);
    report={phase,pid:process.pid,githubReads:reads,liveVersion:'1.0.0',pendingVersion:'',automaticPaused:true,reviewedRollbackPreserved:true};
   }
  }
  assert.equal(market.list().find(item=>item.manifest.id===disabledId).enabled,false);assert.equal((await ctx.skills.list()).length,2);assert.equal(credentialReads,0);
  report={...report,personalPreserved:true,disabledNotReenabled:true,newSkillsNotInstalled:true,applicationCredentialReads:0,nativeSkillTool:true};
 }finally{await ctx.fiber.dispose();github.close();market.close();}
 save(join(root,'EXAMPLE_'+phase+'.json'),report);
}else{
 const name=options.get('--out-name');assert.match(name??'',/^[A-Za-z0-9-]+\.json$/);const output=resolve('.runtime/evidence',name);assert.equal(existsSync(output),false,'Evidence already exists.');
 const root=owned(mkdtempSync(join(base,'dsh-published-skill-EXAMPLE-'))),phases=[];let completed=false;
 try{
  for(const phase of ['stage','activate','rollback']){
   console.log('Verifying published skill phase: '+phase);
   await new Promise((done,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',phase,'--root',root,'--baseline',baseline,'--expected-commit',expected],{windowsHide:true,stdio:['ignore','ignore','pipe'],signal:AbortSignal.timeout(120000)});let diagnostic='';child.stderr.setEncoding('utf8');child.stderr.on('data',part=>{diagnostic=(diagnostic+part).slice(-8000);});child.once('error',()=>reject(Error('Worker interrupted; retain the owned TEMP directory for inspection.')));child.once('close',code=>code===0?done():reject(Error('Skill phase failed: '+phase+'; inspect the owned TEMP directory. '+diagnostic)));});
   phases.push(load(join(root,'EXAMPLE_'+phase+'.json')));
  }
  assert.equal(new Set(phases.map(p=>p.pid)).size,3);assert.equal(phases.reduce((n,p)=>n+p.githubReads,0),5);completed=true;
 }finally{if(completed)rmSync(owned(root),{recursive:true,force:true,maxRetries:5,retryDelay:200});else console.error('Failed-run TEMP evidence retained: '+root);}
 const report={at:new Date().toISOString(),source:'https://github.com/'+repo,baseline,revision:expected,skill:id,fromVersion:'1.0.0',toVersion:'1.0.1',transport:'existing gh CLI read adapter; application Bearer path unverified',realGithubReads:5,syntheticFeedBytes:false,httpEnvelopeConstructedByAdapter:true,applicationHttpsFetchVerified:false,independentProcesses:3,phases,temporaryDataAndProcessesRemoved:true,applicationCredentialReads:0,modelCalls:0,paidCalls:0,nativeWrites:0,browserInspected:false};
 mkdirSync(resolve('.runtime/evidence'),{recursive:true});save(output,report);console.log(JSON.stringify(report));
}
