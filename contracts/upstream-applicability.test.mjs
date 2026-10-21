import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {parse} from 'yaml';
import {Context} from '@deepseek-ai/cordis';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import {credentialRef} from '@deepseek-ai/dsh-credentials';
import {createLaunchEnvironmentSnapshot} from '@deepseek-ai/dsh-launch-environment';
import Llm from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import NodePtcRuntime from '@deepseek-ai/dsh-ptc-runtime-node';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local';
import LocalSandboxProvider from '@deepseek-ai/dsh-sandbox-local';
import {createScope} from '@deepseek-ai/dsh-scope';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
const ref=credentialRef('SEEDANCE_API_KEY'),signal=()=>new AbortController().signal;
async function fixture(t,{values={},credentials=LocalCredentials}={}){
 const base=realpathSync.native(tmpdir()),home=realpathSync.native(mkdtempSync(join(base,'dsh-guide-review-EXAMPLE-'))),ctx=new Context(),beforeHome=process.env.DSH_HOME,beforeFetch=globalThis.fetch;let requests=0;
 process.env.DSH_HOME=home;globalThis.fetch=async()=>{requests++;throw Error('EXAMPLE_NETWORK_FORBIDDEN');};
 t.after(async()=>{await ctx.fiber.dispose();globalThis.fetch=beforeFetch;if(beforeHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=beforeHome;const part=relative(base,realpathSync.native(home));assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part)&&!/[\\/]/.test(part)&&part.startsWith('dsh-guide-review-EXAMPLE-'));rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});assert.equal(requests,0);});
 ctx.provide('launchEnvironment',createLaunchEnvironmentSnapshot([{source:'process',values}]));await ctx.plugin(credentials,{dshHome:home,watch:false});await ctx.plugin(Llm);
 const rows=parse(readFileSync(new URL('../packages/dsh-zhen/cordis.patch.yml',import.meta.url),'utf8')),config=rows.find(row=>row.id==='llm-pi-ai').config;await ctx.plugin(PiAi,config);await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
 const peer={id:'EXAMPLE_GUIDE_OWNER',ctx,principal:{kind:'owner'},signal:signal(),interactions:'none',dispose:async()=>{}};
 const call=async method=>{const result=await ctx.typertGateway.invoke({namespace:'zhen',method,args:{},peer});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(result===undefined?undefined:JSON.parse(JSON.stringify(result)));};
 return{ctx,home,call,service:ctx.get('zhen'),modelIds:config.providers.seedance.models.map(model=>model.id)};
}

test('C85: real pi-ai catalog hides a credential route until saved and hides it again after unset without network',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.ctx.llm.listModels('seedance'),[]);assert.equal((await f.call('status')).credentialSource,'none');
 await f.ctx.credentials.set(ref,'EXAMPLE_SAVED_CATALOG_KEY');const models=await f.ctx.llm.listModels('seedance');assert.deepEqual(models.map(model=>model.id),f.modelIds);assert.ok(models.some(model=>model.id==='deepseek/deepseek-v4.1-flash'));
 await f.ctx.credentials.unset(ref);assert.deepEqual(await f.ctx.llm.listModels('seedance'),[]);
});

test('C85: native saved-over-environment precedence and unset fallback survive the actual owner Remote without exposing values',async t=>{
 const f=await fixture(t,{values:{SEEDANCE_API_KEY:'EXAMPLE_ENVIRONMENT_KEY'}});let status=await f.call('status');assert.equal(status.credentialSource,'environment');assert.equal((await f.ctx.credentials.resolve(ref)).value,'EXAMPLE_ENVIRONMENT_KEY');
 await f.ctx.credentials.set(ref,'EXAMPLE_LOCAL_KEY');status=await f.call('status');assert.equal(status.credentialSource,'stored');assert.equal((await f.ctx.credentials.resolve(ref)).value,'EXAMPLE_LOCAL_KEY');
 await f.call('removeCredential');status=await f.call('status');assert.equal(status.credentialConfigured,true);assert.equal(status.credentialSource,'environment');assert.equal((await f.ctx.credentials.resolve(ref)).value,'EXAMPLE_ENVIRONMENT_KEY');assert.ok((await f.ctx.llm.listModels('seedance')).length>0);
 const encoded=JSON.stringify(status);assert.equal(encoded.includes('EXAMPLE_'),false);assert.equal(encoded.includes('value'),false);
});

test('C85: unknown credential source labels never leak provider paths through the owner codec',async t=>{
 class ExampleSource extends LocalCredentials{async describe(){return{configured:true,writable:true,source:'EXAMPLE_PRIVATE_SOURCE_PATH/EXAMPLE.env'};}}
 const f=await fixture(t,{credentials:ExampleSource}),status=await f.call('status');assert.equal(status.credentialSource,'fallback');assert.equal(JSON.stringify(status).includes('EXAMPLE_PRIVATE'),false);
});

test('C85: actual Node PTC nested RAG preserves native canonical values and presentation metadata, and paused tools publish neither',async t=>{
 const f=await fixture(t),folder=join(f.home,'EXAMPLE_DOCS');mkdirSync(folder);writeFileSync(join(folder,'EXAMPLE.md'),'EXAMPLE ONLY\n海边灯塔由阿岚管理。\n琵琶在茶室。');
 const collection=await f.service.createKnowledge('EXAMPLE_PROJECT','EXAMPLE_COLLECTION',folder);await f.service.indexKnowledge('EXAMPLE_PROJECT',collection.id);await f.service.bindKnowledge('EXAMPLE_PROJECT',folder);f.service.setKnowledgeAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');f.service.setKnowledgeAgentAccess('EXAMPLE_PROJECT',collection.id,true);
 const events=[],agent={session:{id:'EXAMPLE_GUIDE_SESSION',header:{cwd:folder},append:(type,data)=>{events.push({type,data:structuredClone(data)});}},options:{provider:'seedance'}};
 agent.ctx=f.ctx;f.ctx.provide('agents',{get:()=>agent});f.ctx.provide('workingDirectory',{ensure:async()=>folder});
 // Explicit controlled-test policy; this contract tests PTC transport, not OS sandbox enforcement.
 f.ctx.provide('sandboxPolicy',{defaultMode:'danger-full-access',resolve:()=>({mode:'danger-full-access',workspaceRoot:folder,sessionId:agent.session.id})});
 await f.ctx.plugin(LocalFileSystem,{cwd:folder});await f.ctx.plugin(LocalSubprocessRuntime);await f.ctx.plugin(LocalSandboxProvider);await f.ctx.plugin(NodePtcRuntime,{timeoutMs:10000,maxTimeoutMs:15000,maxOldGenerationSizeMb:128});await f.ctx.plugin(SystemPrompt);await f.ctx.plugin(ToolRuntime);
 await f.ctx.plugin({inject:['tools'],apply(inner){const scope=createScope(inner,agent);agent.ctx=scope.ctx;inner.effect(()=>()=>scope.dispose());}});
 const run=(name,args,callId)=>f.ctx.tools.execute({name,arguments:args,callId,agent,signal:signal()});
 const nativeSearch=await run('zhen_rag_search',{query:'琵琶'},'EXAMPLE_NATIVE_SEARCH');assert.equal(nativeSearch.isError,false);assert.equal(nativeSearch.value.hits.length,1);const hit=nativeSearch.value.hits[0];
 const nativeOpen=await run('zhen_rag_open',{id:hit.id,epoch:hit.epoch},'EXAMPLE_NATIVE_OPEN');assert.equal(nativeOpen.isError,false);
 agent.ctx.tools.presentAs('ptc');
 const ptc=await run('run_code',{description:'EXAMPLE fixed RAG metadata check',code:'const search = await tools.zhen_rag_search({query: "琵琶"}); const hit = search.hits[0]; const source = await tools.zhen_rag_open({id: hit.id, epoch: hit.epoch}); return {search, source};'},'EXAMPLE_PTC_RAG');
 assert.equal(ptc.isError,false,JSON.stringify(ptc.error));
 assert.deepEqual(ptc.value.result,{search:nativeSearch.value,source:nativeOpen.value});
 const nested=events.filter(e=>e.type==='tool/ptc-dispatch'&&e.data.parentCallId==='EXAMPLE_PTC_RAG');assert.equal(nested.length,2);
 for(const [event,native]of [[nested[0],nativeSearch],[nested[1],nativeOpen]]){assert.equal(event.data.isError,false);assert.deepEqual(event.data.meta,native.meta);assert.deepEqual(JSON.parse(event.data.content[0].text),native.value);assert.equal(JSON.stringify(event.data.meta).includes('EXAMPLE_ENVIRONMENT_KEY'),false);}
 const state=f.ctx.zhenRag.snapshot();f.ctx.zhenRag.configure('lexical',false,state.revision);
 const paused=await run('run_code',{description:'EXAMPLE fixed paused RAG check',code:'for (const call of [() => tools.zhen_rag_search({query: "琵琶"}), () => tools.zhen_rag_open('+JSON.stringify({id:hit.id,epoch:hit.epoch})+')]) { try { await call(); } catch {} } return "EXAMPLE_DONE";'},'EXAMPLE_PTC_PAUSED');assert.equal(paused.isError,false,JSON.stringify(paused.error));
 const denied=events.filter(e=>e.type==='tool/ptc-dispatch'&&e.data.parentCallId==='EXAMPLE_PTC_PAUSED');assert.equal(denied.length,2);for(const e of denied){assert.equal(e.data.isError,true);assert.equal(e.data.error.code,'RAG_PAUSED');assert.equal(e.data.meta,undefined);assert.equal('value'in e.data,false);}
 f.ctx.zhenRag.configure('lexical',true,f.ctx.zhenRag.snapshot().revision);f.service.setKnowledgeAgentAccess('EXAMPLE_PROJECT',collection.id,false);
 const revoked=await run('run_code',{description:'EXAMPLE fixed revoked source check',code:'try { await tools.zhen_rag_open('+JSON.stringify({id:hit.id,epoch:hit.epoch})+'); } catch {} return "EXAMPLE_DONE";'},'EXAMPLE_PTC_REVOKED');assert.equal(revoked.isError,false);
 const last=events.filter(e=>e.type==='tool/ptc-dispatch'&&e.data.parentCallId==='EXAMPLE_PTC_REVOKED');assert.equal(last.length,1);assert.equal(last[0].data.isError,true);assert.equal(last[0].data.meta,undefined);assert.equal(JSON.stringify(last[0].data).includes('琵琶'),false);
});
