import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {channel} from 'node:diagnostics_channel';
import {createHash} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {SkillMarket,skillBody} from '../packages/dsh-zhen/lib/market.js';
import {skillFeedSchema} from '../packages/dsh-zhen/lib/skill-feed.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {readPublic} from '../packages/dsh-zhen/lib/updates.js';

// Actual anonymous HTTPS and owned production Host service. No fetch adapter,
// gh CLI, secret, user profile, model or Native Canvas in this EXAMPLE smoke.
const repo='T8mars/Deepseek-Harness-Zhenzhen',id='zhen-knowledge-writing',disabled='zhen-creative-review',base=realpathSync.native(tmpdir()),originalFetch=globalThis.fetch,sha=x=>createHash('sha256').update(x).digest('hex');
const options=new Map(),args=process.argv.slice(2);assert.equal(args.length%2,0);for(let i=0;i<args.length;i+=2){assert.ok(!options.has(args[i]));options.set(args[i],args[i+1]);}
const phase=options.get('--worker'),baseline=options.get('--baseline'),revision=options.get('--expected-commit');assert.match(baseline??'',/^[a-f0-9]{40}$/);assert.match(revision??'',/^[a-f0-9]{40}$/);assert.notEqual(baseline,revision);
for(const key of options.keys())assert.ok((phase?['--worker','--root','--baseline','--expected-commit']:['--baseline','--expected-commit','--out-name']).includes(key));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'}),load=p=>JSON.parse(readFileSync(p,'utf8'));
function owned(path){const absolute=realpathSync.native(path),part=relative(base,absolute);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\')&&part.startsWith('dsh-public-host-EXAMPLE-'));return absolute;}
const requests=[],diagnostics=channel('undici:request:create'),observe=({request})=>{
 const origin=String(request.origin),path=String(request.path);assert.ok(['https://api.github.com','https://raw.githubusercontent.com'].includes(origin));assert.equal(request.method,'GET');assert.equal(/authorization/i.test(String(request.headers)),false);
 const allowed=[`/repos/${repo}`,`/repos/${repo}/commits/main`,`/${repo}/${baseline}/market/skills.v1.json`,`/${repo}/${revision}/market/skills.v1.json`];assert.ok(allowed.includes(path));requests.push({origin,path,method:'GET',authorization:false});
};diagnostics.subscribe(observe);
if(phase){
 assert.ok(['stage','activate','rollback'].includes(phase));const root=owned(options.get('--root'));process.env.DSH_HOME=root;const oldFile=join(root,'EXAMPLE_BASELINE.json'),stateFile=join(root,'EXAMPLE_STATE.json');
 if(phase==='stage'){
  const raw=await readPublic(`https://raw.githubusercontent.com/${repo}/${baseline}/market/skills.v1.json`,fetch,AbortSignal.timeout(15000),2*1024*1024),catalog=skillFeedSchema.parse(JSON.parse(raw)).skills;assert.equal(catalog.length,15);save(oldFile,catalog);
  const old=catalog.find(x=>x.manifest.id===id),other=catalog.find(x=>x.manifest.id===disabled);assert.equal(old.manifest.version,'1.0.0');assert.ok(other);
  const market=new SkillMarket(join(root,'dsh-zhen','skills.sqlite'),catalog);try{market.select(id,old.manifest.digest,'1.0.0');market.select(disabled,other.manifest.digest,other.manifest.version);market.disable(disabled);const personal=market.fork(id,old.manifest.digest,'EXAMPLE ONLY: independent personal version.',old.manifest.version);save(stateFile,{personal,oldDigest:old.manifest.digest,oldHash:sha(skillBody(old.content))});}finally{market.close();}
 }
 const ctx=new Context(),state=load(stateFile);let credentialResolves=0,describes=0,report;
 ctx.provide('credentials',{describe:async ref=>{assert.equal(ref,'DSH_ZHEN_GITHUB_TOKEN');describes++;return{configured:false,writable:true};},resolve:async()=>{credentialResolves++;throw Error('EXAMPLE_ANONYMOUS_ONLY');}});ctx.provide('agents',{});ctx.provide('workingDirectory',{ensure:async()=>root});
 try{
  await ctx.plugin(SkillRegistry);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(ZhenService);await ctx.plugin(SkillTool);const service=ctx.get('zhen');
  service.marketFeedAutomatic(false);service.updatesAutomatic(false);service.mcpAutomatic(false);service.gatewayCatalogAutomatic(false);
  let calls=0;const read=async name=>{const value=await ctx.tools.execute({callId:'EXAMPLE_PUBLIC_'+phase+'_'+(++calls),name:'skill',arguments:{name},signal:new AbortController().signal});assert.equal(value.isError,false);assert.equal(value.value.provider,'dsh-zhen-market');return value.value.content;},row=()=>service.marketList().find(x=>x.manifest.id===id);
  const access=await service.githubAccessInfo();assert.equal(access.configured,false);assert.equal(access.repository,repo);
  if(phase==='stage'){
   assert.equal(service.marketAutoPolicy().enabled,false);assert.equal(sha(await read(id)),state.oldHash);const personalHash=sha(await read(state.personal));service.marketAutoUpdates(true);
   for(let repeat=0;repeat<2;repeat++){const checked=await service.marketFeedCheck();assert.equal(checked.state,'checked');assert.equal(checked.revision,revision);assert.equal(checked.count,15);assert.equal(row().installedVersion,'1.0.0');assert.equal(row().pendingVersion,'1.0.1');assert.equal(row().pendingMode,'automatic');assert.equal(row().pendingRevision,revision);assert.equal(service.marketAutoPolicy().pendingAutomatic,1);assert.equal(sha(await read(id)),state.oldHash);}
   const update=service.marketPreview(id,row().pendingDigest,'1.0.1');save(join(root,'EXAMPLE_EXPECTED.json'),{personalHash,newHash:sha(skillBody(update.content))});assert.equal(sha(await read(state.personal)),personalHash);
   report={phase,pid:process.pid,liveVersion:'1.0.0',pendingVersion:'1.0.1',pendingRevision:revision,liveTextPreserved:true};assert.equal(requests.length,5);
  }else{
   const expected=load(join(root,'EXAMPLE_EXPECTED.json'));assert.equal(sha(await read(state.personal)),expected.personalHash);assert.equal(service.marketAutoPolicy().enabled,true);assert.equal(service.marketAutoPolicy().pendingAutomatic,0);assert.equal(service.marketFeedSnapshot().revision,revision);
   if(phase==='activate'){assert.equal(row().installedVersion,'1.0.1');assert.equal(sha(await read(id)),expected.newHash);assert.equal(service.marketVersions(id).length,2);service.marketSelect(id,state.oldDigest,'1.0.0');assert.equal(row().pendingMode,'manual');assert.equal(row().automaticPaused,true);assert.equal(sha(await read(id)),expected.newHash);report={phase,pid:process.pid,liveVersion:'1.0.1',pendingVersion:'1.0.0',pendingMode:'manual',automaticPaused:true};}
   else{assert.equal(row().installedVersion,'1.0.0');assert.equal(sha(await read(id)),state.oldHash);assert.equal(row().automaticPaused,true);assert.equal(row().pendingVersion,'');assert.equal(row().updateAvailable,true);report={phase,pid:process.pid,liveVersion:'1.0.0',pendingVersion:'',reviewedRollbackPreserved:true,automaticPaused:true};}
   assert.equal(requests.length,0);
  }
  assert.deepEqual(TYPERT_REMOTE.methods['zhen/marketAutoPolicy'].result.create().parse(service.marketAutoPolicy()),service.marketAutoPolicy());assert.equal(service.marketList().find(x=>x.manifest.id===disabled).enabled,false);assert.equal((await ctx.skills.list()).length,2);assert.equal(credentialResolves,0);assert.equal(globalThis.fetch,originalFetch);
  report={...report,requests,credentialMetadataReads:describes,credentialResolves:0,personalPreserved:true,disabledNotReenabled:true,newSkillsNotInstalled:true,productionHost:true,publishedSkillRegistryAndTool:true,publicRemoteCodec:true};
 }finally{await ctx.fiber.dispose();diagnostics.unsubscribe(observe);}
 save(join(root,'EXAMPLE_'+phase+'.json'),report);
}else{
 const name=options.get('--out-name');assert.match(name??'',/^[A-Za-z0-9-]+\.json$/);const output=resolve('.runtime/evidence',name);assert.equal(existsSync(output),false);
 const metadata=JSON.parse(await readPublic(`https://api.github.com/repos/${repo}`,fetch,AbortSignal.timeout(15000),256*1024));assert.equal(metadata.private,false);assert.equal(metadata.visibility,'public');assert.equal(metadata.default_branch,'main');assert.equal(requests.length,1);diagnostics.unsubscribe(observe);
 const root=owned(mkdtempSync(join(base,'dsh-public-host-EXAMPLE-'))),phases=[];let completed=false;
 try{
  for(const current of ['stage','activate','rollback']){
   console.log('Checking public production Host phase: '+current);
   await new Promise((done,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',current,'--root',root,'--baseline',baseline,'--expected-commit',revision],{windowsHide:true,stdio:['ignore','ignore','pipe'],signal:AbortSignal.timeout(90000)});let error='';child.stderr.setEncoding('utf8');child.stderr.on('data',part=>{error=(error+part).slice(-6000);});child.once('error',()=>reject(Error('Public Host worker interrupted; TEMP retained.')));child.once('close',code=>code===0?done():reject(Error('Public Host phase failed: '+current+'; '+error)));});phases.push(load(join(root,'EXAMPLE_'+current+'.json')));
  }
  assert.equal(new Set(phases.map(p=>p.pid)).size,3);assert.equal(globalThis.fetch,originalFetch);completed=true;
 }finally{if(completed)rmSync(owned(root),{recursive:true,force:true,maxRetries:5,retryDelay:200});else console.error('Failed-run TEMP retained: '+root);}
 const report={at:new Date().toISOString(),repository:'https://github.com/'+repo,visibility:'public',baseline,revision,skill:id,versions:['1.0.0','1.0.1','1.0.0'],productionHost:true,fetchReplaced:false,responseAdapterUsed:false,realAnonymousHttpsRequests:6,independentProcesses:3,phases,metadataRequest:requests[0],credentialResolves:0,modelCalls:0,paidCalls:0,nativeWrites:0,browserInspected:false,temporaryDataAndProcessesRemoved:true};mkdirSync(resolve('.runtime/evidence'),{recursive:true});save(output,report);console.log(JSON.stringify(report));
}
