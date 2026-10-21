import {Context} from '@deepseek-ai/cordis';
import Llm from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import {credentialRef} from '@deepseek-ai/dsh-credentials';
import {createLaunchEnvironmentSnapshot} from '@deepseek-ai/dsh-launch-environment';
import {parse} from 'yaml';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {readSmokeCandidate} from './candidate-smoke-input.mjs';

export const SMOKE_POLICY='default-flash-single-512-v1';
export const SMOKE_MODEL='deepseek/deepseek-v4.1-flash';
export const SMOKE_PROMPT='DSH-zhen automated connectivity check. Reply only OK.';
const ENDPOINT='https://api.seedance.nz/v1/chat/completions',REPOSITORY='T8mars/Deepseek-Harness-Zhenzhen';
const codes=new Set(['AUTH','MISSING_CREDENTIAL','RATE_LIMIT','TIMEOUT','SERVER','PI_AI_ERROR','NO_ADAPTER','CANCELLED','INCOMPLETE','RESPONSE_LIMIT','UNAVAILABLE','OUTBOUND_REFUSED','ROUTE_REFUSED','UNEXPECTED_TEXT','SETUP','CLEANUP']);
const fail=code=>Object.assign(new Error('Gateway smoke refused; private details withheld.'),{code});
const safeCode=value=>typeof value==='string'&&codes.has(value)?value:'UNAVAILABLE';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
let active=false;

export function smokeInvocation(args,env=process.env){
  if(args.length===1&&args[0]==='--ci'){
    if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID??'')||!/^\d{1,5}$/.test(env.GITHUB_RUN_ATTEMPT??''))throw fail('SETUP');
    const authorized=env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.DSH_SMOKE_CONFIRM==='true'||env.GITHUB_EVENT_NAME==='schedule'&&env.DSH_SMOKE_SCHEDULE_ENABLED==='true';
    if(!authorized)throw fail('SETUP');
    return {mode:'ci',runId:env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT,commit:env.GITHUB_SHA};
  }
  if(args.length===3&&args[0]==='--local'&&args[1]==='--id'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(args[2])&&env.GITHUB_ACTIONS!=='true')return {mode:'local',runId:args[2]};
  throw fail('SETUP');
}

export function smokeTransport(fetcher=globalThis.fetch){
  const facts={requests:0,blockedRequests:0,httpStatus:null};
  async function fetch(input,init){
    try{
      const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
      const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
      const body=typeof init?.body==='string'?JSON.parse(init.body):input instanceof Request?await input.clone().json():undefined;
      const message=body?.messages?.[0],text=typeof message?.content==='string'?message.content:Array.isArray(message?.content)&&message.content.every(x=>x.type==='text')?message.content.map(x=>x.text).join(''):undefined;
      if(url!==ENDPOINT||method!=='POST'||facts.requests!==0||JSON.stringify(body??{}).length>16384||body.model!==SMOKE_MODEL||body.max_tokens!==512||body.stream!==true||body.messages?.length!==1||message.role!=='user'||text!==SMOKE_PROMPT||(body.tools?.length??0)!==0)throw fail('OUTBOUND_REFUSED');
    }catch{facts.blockedRequests++;throw fail('OUTBOUND_REFUSED');}
    facts.requests++;
    const response=await fetcher(input,{...init,redirect:'error'});facts.httpStatus=response.status;return response;
  }
  return {fetch,facts};
}

function evidenceDirectory(root){
  let path=realpathSync.native(root);
  for(const name of ['.runtime','evidence']){
    path=join(path,name);
    if(!existsSync(path))mkdirSync(path);
    if(!lstatSync(path).isDirectory()||lstatSync(path).isSymbolicLink()||realpathSync.native(path)!==path)throw fail('SETUP');
  }
  return path;
}

/** Isolated diagnostic only. It never loads Agent sessions, tools or user files. */
export async function runGatewaySmoke({workspace=process.cwd(),mode,runId,commit,sourceDirty=false,credentialValue,candidateTag='',fetcher=globalThis.fetch}){
  if(active)throw fail('SETUP');
  if(!['ci','local'].includes(mode)||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId??'')||!/^[a-f0-9]{40}$/.test(commit??''))throw fail('SETUP');
  if(typeof candidateTag!=='string'||candidateTag&&sourceDirty)throw fail('SETUP');
  // Check immutable candidate/archive/installed SDK before resolving credentials or spending an attempt.
  const candidate=candidateTag?readSmokeCandidate({workspace,mode,runId,commit,tag:candidateTag}):undefined;
  const directory=evidenceDirectory(workspace),stem=join(directory,'real-gateway-smoke-'+runId);
  // A spent attempt cannot be rerun, even if it crashed without a final receipt.
  writeFileSync(stem+'.intent.json',JSON.stringify({schemaVersion:1,at:new Date().toISOString(),policy:SMOKE_POLICY,mode,commit,runId,maxRequests:1,maxTokens:512})+'\n',{flag:'wx'});
  active=true;
  const previousHome=process.env.DSH_HOME,originalFetch=globalThis.fetch,transport=smokeTransport(fetcher),ctx=new Context(),controller=new AbortController();
  const sourceSha256=Object.fromEntries(['gateway-smoke-core.mjs','real-gateway-smoke.mjs','check-smoke-ci.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));
  const report={schemaVersion:1,at:new Date().toISOString(),policy:SMOKE_POLICY,mode,repository:REPOSITORY,commit,runId,sourceDirty,sourceSha256,provider:'seedance',model:SMOKE_MODEL,maxTokens:512,outcome:'not-run',code:'SETUP',requests:0,blockedRequests:0,httpStatus:null,finishKind:'unknown',inputTokens:null,outputTokens:null,visibleTextMatched:false,temporaryCleaned:false,userSessionsAccessed:false,nativeWrites:0};
  if(candidate)report.candidate=candidate.binding;
  let home,base;
  try{
    base=realpathSync.native(tmpdir());home=realpathSync.native(mkdtempSync(join(base,'dsh-gateway-smoke-')));process.env.DSH_HOME=home;
    const credentialHome=mode==='ci'?home:realpathSync.native(join(workspace,'.runtime/dsh-home'));
    if(mode==='local'&&(relative(realpathSync.native(workspace),credentialHome)!==join('.runtime','dsh-home')||!existsSync(join(workspace,'.runtime/installed.json'))))throw fail('SETUP');
    ctx.provide('launchEnvironment',createLaunchEnvironmentSnapshot([{source:'process',values:{}}]));
    await ctx.plugin(LocalCredentials,{dshHome:credentialHome,watch:false});
    const ref=credentialRef('SEEDANCE_API_KEY');
    if(mode==='ci'){
      if(typeof credentialValue!=='string'||credentialValue.length<8||credentialValue.length>4096||/\s/.test(credentialValue))throw fail('MISSING_CREDENTIAL');
      await ctx.credentials.set(ref,credentialValue);
    }
    if(!(await ctx.credentials.describe(ref)).configured)throw fail('MISSING_CREDENTIAL');
    const rows=parse(candidate?candidate.archive.files.get('cordis.patch.yml').toString('utf8'):readFileSync(new URL('../packages/dsh-zhen/cordis.patch.yml',import.meta.url),'utf8'));
    const defaults=rows.find(x=>x.id==='agent-default-model')?.config,config=structuredClone(rows.find(x=>x.id==='llm-pi-ai')?.config);
    if(defaults?.provider!=='seedance'||defaults.model!==SMOKE_MODEL||config?.providers?.seedance?.baseURL!=='https://api.seedance.nz/v1'||config.providers.seedance.apiKeyEnv!=='SEEDANCE_API_KEY'||config.providers.seedance.compat?.maxTokensField!=='max_tokens')throw fail('ROUTE_REFUSED');
    globalThis.fetch=transport.fetch;
    await ctx.plugin(Llm);await ctx.plugin(PiAi,config);
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]),prepared=await ctx.llm.prepareCall({provider:defaults.provider,model:defaults.model,maxTokens:512},signal);
    if(prepared.config.provider!=='seedance'||prepared.config.model!==SMOKE_MODEL||prepared.config.maxTokens!==512)throw fail('ROUTE_REFUSED');
    let text='',characters=0,events=0,finished=false;
    report.outcome='incomplete';report.code='INCOMPLETE';
    for await(const chunk of prepared.stream({...prepared.config,messages:[{role:'user',content:[{type:'text',text:SMOKE_PROMPT}]}],signal})){
      signal.throwIfAborted();
      if(++events>4096)throw fail('RESPONSE_LIMIT');
      if(chunk.type==='text-delta'||chunk.type==='reasoning-delta'){
        characters+=chunk.text.length;if(characters>8192)throw fail('RESPONSE_LIMIT');
        if(chunk.type==='text-delta')text+=chunk.text;
      }else if(chunk.type==='usage'){
        report.inputTokens=count(chunk.usage.inputTokens);report.outputTokens=count(chunk.usage.outputTokens);
      }else if(chunk.type==='finish'){
        finished=true;report.finishKind=['stop','max-tokens','tool-calls','error','aborted'].includes(chunk.reason.kind)?chunk.reason.kind:'unknown';
        report.visibleTextMatched=text.trim()==='OK';
        if(chunk.reason.kind==='stop'&&report.visibleTextMatched){report.outcome='passed';report.code='';}
        else if(chunk.reason.kind==='error'||chunk.reason.kind==='aborted'){report.outcome='failed';report.code=safeCode(chunk.reason.failure.code);}
        else if(chunk.reason.kind==='stop')report.code='UNEXPECTED_TEXT';
        break;
      }
    }
    if(!finished){report.outcome='incomplete';report.code='INCOMPLETE';}
  }catch(error){report.outcome=transport.facts.requests?'failed':'not-run';report.code=controller.signal.aborted?'TIMEOUT':safeCode(error?.code);}
  finally{
    controller.abort();
    try{await ctx.fiber.dispose();}catch{report.outcome='failed';report.code='CLEANUP';}
    globalThis.fetch=originalFetch;if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;
    try{
      if(home){const part=relative(base,realpathSync.native(home));if(!part||isAbsolute(part)||part.startsWith('..')||part.includes('/')||part.includes('\\')||!part.startsWith('dsh-gateway-smoke-'))throw fail('CLEANUP');rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
      report.temporaryCleaned=true;
    }catch{report.outcome='failed';report.code='CLEANUP';}
    Object.assign(report,transport.facts);if(report.blockedRequests){report.outcome='failed';report.code='OUTBOUND_REFUSED';}
    if(report.outcome==='passed'&&(report.requests!==1||report.httpStatus!==200)){report.outcome='failed';report.code='UNAVAILABLE';}
    report.finishedAt=new Date().toISOString();active=false;
    writeFileSync(stem+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}
