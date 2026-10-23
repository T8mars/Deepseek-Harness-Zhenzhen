import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import Registry from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import {createServer} from 'node:http';
import {mkdtempSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {readCapabilityCatalog} from '../packages/dsh-zhen/lib/capabilities.js';
import {reviewedModelDocs,reviewedRegistry} from './fixtures/capability-docs.mjs';

function temporary(){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-capability-owner-EXAMPLE-')));return{root,close(){const actual=realpathSync.native(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-capability-owner-EXAMPLE-'));rmSync(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}};}
function restoreHome(value){if(value===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=value;}
async function ownerHost(t){
 const folder=temporary(),previous=process.env.DSH_HOME,ctx=new Context();let credentials=0;
 t.after(async()=>{try{await ctx.fiber.dispose();}finally{folder.close();}});process.env.DSH_HOME=folder.root;
 try{ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_ONLY_NOT_NEEDED');}});await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(Registry);await ctx.plugin(Access);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});}finally{restoreHome(previous);}
 const call=async(method,args={},principal={kind:'owner'})=>{const value=await ctx.typertGateway.invoke({namespace:'zhen',method,args,peer:{id:'EXAMPLE_CAPABILITY_OWNER',ctx,principal,signal:new AbortController().signal,interactions:'none',dispose:async()=>{}}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(value===undefined?undefined:JSON.parse(JSON.stringify(value)));};
 return{ctx,root:folder.root,call,credentials:()=>credentials};
}

test('C14: the Host exposes a bounded public capability search through the actual ToolRuntime without a credential', async () => {
  const folder=temporary(),previous=process.env.DSH_HOME;process.env.DSH_HOME=folder.root;
  const ctx = new Context(); let credentials = 0;
  ctx.provide('credentials', { resolve:async()=>{credentials++;throw Error('EXAMPLE_ONLY_NOT_NEEDED');} });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    assert.equal(ctx.get('zhen').gatewayCatalog().items.length, 277);
    const result = await ctx.tools.execute({callId:'EXAMPLE_CAPABILITY_QUERY',name:'zhen_capabilities',arguments:{query:'MiniMax',offset:0},signal:new AbortController().signal});
    assert.equal(result.isError,false); assert.ok(result.value.total > 0); assert.ok(result.value.items.length <= 30);
    assert.equal(credentials,0); assert.ok(result.value.notice.includes('不要把目录记录当作可调用工具'));
    const invalid = await ctx.tools.execute({callId:'EXAMPLE_INVALID_CAPABILITY_QUERY',name:'zhen_capabilities',arguments:{family:'EXAMPLE_UNKNOWN'},signal:new AbortController().signal});
    assert.equal(invalid.isError,true); assert.equal(credentials,0);
  } finally { try{await ctx.fiber.dispose();}finally{restoreHome(previous);folder.close();} }
});

test('C144: published Owner Gateway returns model changes from real public GET transport without installing tools or routes',async t=>{
 const catalog=readCapabilityCatalog(),originalFetch=globalThis.fetch,requests=[],patch=readFileSync('packages/dsh-zhen/cordis.patch.yml');let blocked=0;
 const server=createServer((request,response)=>{
  requests.push({path:request.url,method:request.method,authorization:request.headers.authorization});response.setHeader('Content-Type',request.url.endsWith('llms.txt')?'text/plain':'application/json');
  response.end(request.url.endsWith('llms.txt')?reviewedModelDocs(catalog,{extra:'## EXAMPLE future model\n`EXAMPLE_NEW_IMAGE`: POST /v1/image/generations;\n'}):reviewedRegistry(catalog,request.url.includes('midjourney')?'midjourney':'music'));
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 globalThis.fetch=async(input,options)=>{const url=new URL(input);if(url.origin!=='https://api.seedance.nz'||!['/docs/llms.txt','/api/music/actions','/api/midjourney/actions'].includes(url.pathname)){blocked++;throw Error('EXAMPLE_UNEXPECTED_ROUTE');}assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);return originalFetch('http://127.0.0.1:'+server.address().port+url.pathname,options);};
 try{
  const h=await ownerHost(t);await assert.rejects(h.call('gatewayCatalogCheck',{}, {kind:'anonymous'}));assert.equal(requests.length,0);
  const result=await h.call('gatewayCatalogCheck'),docs=result.sources.find(x=>x.id==='docs');assert.equal(docs.state,'checked');assert.deepEqual(docs.added,['model/EXAMPLE_NEW_IMAGE']);assert.deepEqual(docs.removed,[]);assert.deepEqual(docs.modified,[]);assert.equal(requests.length,3);assert.equal(blocked,0);assert.ok(requests.every(x=>x.method==='GET'&&x.authorization===undefined));
  assert.deepEqual(await h.call('gatewayCatalog'),catalog);const searched=await h.ctx.tools.execute({callId:'EXAMPLE_REVIEWED_SEARCH',name:'zhen_capabilities',arguments:{query:'EXAMPLE_NEW_IMAGE',offset:0},signal:new AbortController().signal});assert.equal(searched.value.total,0);
  const unregistered=await h.ctx.tools.execute({callId:'EXAMPLE_UNREGISTERED',name:'EXAMPLE_NEW_IMAGE',arguments:{},signal:new AbortController().signal});assert.equal(unregistered.isError,true);
  await h.call('gatewayCatalogAutomatic',{enabled:false});const saved=await h.call('gatewayCatalogCheckSnapshot');assert.equal(saved.automatic,false);assert.deepEqual(saved.sources,result.sources);assert.equal(h.credentials(),0);assert.deepEqual(readFileSync('packages/dsh-zhen/cordis.patch.yml'),patch);
  console.log(JSON.stringify({contract:'C144',actualPublishedOwnerGateway:true,anonymousCannotRefresh:true,realPublicGetTransport:true,modelChangeFactsInRemote:true,reviewedCatalogAndToolUnchanged:true,providerRowsUnchanged:true,observedModelNotExecutable:true,credentials:0,nativeRequests:0,modelRequests:0}));
 }finally{globalThis.fetch=originalFetch;server.closeAllConnections();await new Promise(done=>server.close(done));}
});
