import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import {credentialRef} from '@deepseek-ai/dsh-credentials';
import {createLaunchEnvironmentSnapshot} from '@deepseek-ai/dsh-launch-environment';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import {LlmRuntime,LlmAdapter} from '@deepseek-ai/dsh-llm';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {GATEWAY_CHECK_POLICY} from '../packages/dsh-zhen/lib/gateway-check-schema.js';
import {exampleTask,exampleTaskId} from './fixtures/gateway-tasks.mjs';

const seedance=credentialRef('SEEDANCE_API_KEY'),unrelated=credentialRef('EXAMPLE_UNRELATED_REFERENCE');
const firstKey='EXAMPLE_SEEDANCE_ACCOUNT_A',secondKey='EXAMPLE_SEEDANCE_ACCOUNT_B';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
async function fixture(t,fetcher,Credentials=LocalCredentials){
 const home=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-credential-EXAMPLE-'))),previous=process.env.DSH_HOME,originalFetch=globalThis.fetch;
 process.env.DSH_HOME=home;globalThis.fetch=fetcher;
 const ctx=new Context(),lifetime=new AbortController();let streams=0;
 class ExampleAdapter extends LlmAdapter {async *stream(){streams++;yield {type:'text-delta',index:0,text:'EXAMPLE_OK'};yield {type:'finish',reason:{kind:'stop'}};}}
 t.after(async()=>{lifetime.abort();await ctx.fiber.dispose();globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const part=relative(realpathSync.native(tmpdir()),home);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..'));rmSync(home,{recursive:true,force:true});});
 ctx.provide('launchEnvironment',createLaunchEnvironmentSnapshot([{source:'process',values:{}}]));
 await ctx.plugin(Credentials,{dshHome:home,watch:false});await ctx.credentials.set(seedance,firstKey);
 await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(LlmRuntime);ctx.llm.registerAdapter(['seedance'],new ExampleAdapter());await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
 const peer={id:'EXAMPLE_LOCAL_OWNER',ctx,principal:{kind:'owner'},signal:lifetime.signal,interactions:'none',dispose:async()=>{}};
 async function call(method,args={}){const result=await ctx.typertGateway.invoke({namespace:'zhen',method,args,peer});return TYPERT_REMOTE.methods[`zhen/${method}`].result.create().parse(result===undefined?undefined:JSON.parse(JSON.stringify(result)));}
 return {ctx,call,home,streams:()=>streams};
}

test('C36: published credential replacement cancels a wallet read and suppresses its late account result through the owner Gateway',async t=>{
 const arrived=deferred(),release=deferred(),signals=[],authorizations=[];let calls=0;
 const h=await fixture(t,async(url,options)=>{
  assert.equal(url,'https://api.seedance.nz/api/usage/wallet/');assert.equal(options.redirect,'error');signals.push(options.signal);authorizations.push(options.headers.Authorization);calls++;
  if(calls===1){arrived.resolve();await release.promise;}
  return Response.json({code:true,data:{amount:calls===1?99:7,used_amount:0,display_type:'CNY',private_account:'EXAMPLE_NOT_RETURNED'}});
 });
 const pending=h.call('wallet').then(value=>({value}),error=>({error}));await arrived.promise;
 await h.ctx.credentials.set(unrelated,'EXAMPLE_UNRELATED_VALUE');assert.equal(signals[0].aborted,false);
 await h.ctx.credentials.set(seedance,secondKey);release.resolve();const result=await pending;
 assert.equal(signals[0].aborted,true,'native reference events must stop the old account read');assert.ok(result.error,'a late old-account wallet response must not be published');assert.match(result.error.message,/连接配置已变化/);assert.equal(calls,1,'rotation must never retry automatically');
 const wallet=await h.call('wallet');assert.equal(wallet.amount,7);assert.equal(calls,2);assert.deepEqual(authorizations,[`Bearer ${firstKey}`,`Bearer ${secondKey}`]);assert.equal(JSON.stringify(wallet).includes('private_account'),false);
});

test('C36: published credential removal revokes unsubmitted checks and invalidates tracked task results without dispatch or replay',async t=>{
 const arrived=deferred(),release=deferred();let signal,calls=0;
 const h=await fixture(t,async(url,options)=>{assert.equal(url,`https://api.seedance.nz/v1/image/generations/${exampleTaskId}`);assert.equal(options.method,'GET');calls++;signal=options.signal;arrived.resolve();await release.promise;return Response.json(exampleTask('image'));});
 const preview=await h.call('gatewayCheckPreview');const task=await h.call('gatewayTaskAdd',{spec:{protocol:'image',taskId:exampleTaskId}});await h.call('gatewayTaskTracking',{id:task.id,enabled:true});
 const pending=h.call('gatewayTaskRefresh',{id:task.id});await arrived.promise;
 await h.ctx.credentials.set(unrelated,'EXAMPLE_OTHER_VALUE');assert.equal(signal.aborted,false);assert.equal((await h.call('gatewayCheckHistory'))[0].state,'preview');
 await h.ctx.credentials.unset(seedance);release.resolve();const result=await pending;
 assert.equal(signal.aborted,true);assert.equal(result.code,'CONFIG_CHANGED');assert.notEqual(result.status,'succeeded');assert.equal(result.tracking,false);assert.equal((await h.call('gatewayCheckHistory'))[0].state,'cancelled');
 assert.equal((await h.call('gatewayCheckRun',{id:preview.receipt.id,confirmation:GATEWAY_CHECK_POLICY})).state,'cancelled');assert.equal(h.streams(),0);assert.equal(calls,1);
});

test('C36: a credential change during native resolution prevents the old key from reaching HTTP',async t=>{
 const arrived=deferred(),release=deferred();let held=true,calls=0;
 class HeldCredentials extends LocalCredentials {async resolve(ref){const value=await super.resolve(ref);if(held&&ref===seedance){held=false;arrived.resolve();await release.promise;}return value;}}
 const h=await fixture(t,async()=>{calls++;return Response.json({code:true,data:{amount:7,used_amount:0,display_type:'CNY'}});},HeldCredentials);
 const pending=h.call('wallet').then(value=>({value}),error=>({error}));await arrived.promise;await h.ctx.credentials.set(seedance,secondKey);release.resolve();const result=await pending;
 assert.ok(result.error);assert.match(result.error.message,/连接配置已变化/);assert.equal(calls,0);
 assert.equal((await h.call('wallet')).amount,7);assert.equal(calls,1);
});

test('C36: a native reference event revokes previously issued media tickets before any file or media download',async t=>{
 let calls=0;
 const h=await fixture(t,async(url,options)=>{assert.equal(url,`https://api.seedance.nz/v1/image/generations/${exampleTaskId}`);assert.equal(options.method,'GET');calls++;return Response.json(exampleTask('image'));});
 const task=await h.call('gatewayTaskAdd',{spec:{protocol:'image',taskId:exampleTaskId}});assert.equal((await h.call('gatewayTaskRefresh',{id:task.id})).status,'succeeded');
 const tickets=await h.call('gatewayMediaPreview',{id:task.id});assert.ok(tickets.length>0);
 await h.ctx.credentials.set(seedance,secondKey);
 await assert.rejects(h.call('gatewayMediaSave',{id:tickets[0].id,folder:h.home}),/结果清单或链接已过期/);
 await assert.rejects(h.call('gatewayMediaPreview',{id:task.id}));assert.equal(calls,1);assert.deepEqual(await h.call('gatewayMediaList'),[]);
});
