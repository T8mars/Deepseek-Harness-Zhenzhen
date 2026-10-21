import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {canvasRunFixture} from './fixtures/canvas-run.mjs';
import {canvasTransferFixture} from './fixtures/canvas-transfer.mjs';
import {activeCanvasExample} from './fixtures/active-canvas.mjs';
import {canvasPairingFixture} from './fixtures/canvas-pairing.mjs';
const require=createRequire(import.meta.url),scope={projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS'},ref={...scope,id:'EXAMPLE_TASK'},workflow={...scope,kind:'image',prompt:'EXAMPLE target-bound synthetic plan'},selection={...scope,canvasRevision:1,nodeIds:['EXAMPLE_IMAGE']};
const targetReads=f=>f.state.requests.filter(r=>/\/(?:tools|models|assets|creative-plans|run-plans|run-intents)(?:[/?]|$)/.test(r.path));
const changed=error=>error.message.includes('画布实例或配对已变化');
async function owner(f,run){const previous=process.env.DSH_HOME,home=join(f.base,'EXAMPLE_TARGET_OWNER'),ctx=new Context();process.env.DSH_HOME=home;let credentials=0;
 ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_KEY');}});
 try{f.seedHostReceipt?.(home);for(const plugin of[SystemPrompt,ToolRuntime,Typert,Access,ZhenService])await ctx.plugin(plugin);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});const config=f.config();await ctx.get('zhen').connectCanvas(config.root,'',config.digest);
  const peer={id:'EXAMPLE_TARGET_OWNER',ctx,principal:{kind:'owner'},signal:new AbortController().signal,interactions:'none',dispose:async()=>{}},invoke=(method,args={},principal=peer.principal)=>ctx.typertGateway.invoke({namespace:'zhen',method,args,peer:{...peer,principal}});
  await run({invoke,home});assert.equal(credentials,0);
 }finally{await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;await f.dispose();}
}

test('C87: published Owner codecs preserve legacy argument lists and reject old target identities after re-pairing the same API',async()=>{
 const f=await canvasRunFixture(),original=f.state.route;f.state.route=(req,body,auth,res)=>{if(req.url==='/api/agent-control/v1/active-context'){auth.authenticate(String(req.headers.authorization??'').replace(/^Bearer /,''),['canvas:read']);return activeCanvasExample(f.state.descriptor.instanceId);}return original(req,body,auth,res);};
 await owner(f,async({invoke})=>{
  const legacy=await invoke('canvasWorkspaces');assert.equal('connectionId'in legacy.canvases[0],false);assert.throws(()=>TYPERT_REMOTE.methods['zhen/canvasTargetWorkspaces'].result.create().parse(legacy));
  const configBefore=f.config(),directory=await invoke('canvasTargetWorkspaces'),old=directory.canvases[0].connectionId;assert.match(old,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(directory).includes(f.root),false);assert.equal(JSON.stringify(directory).includes('sessionId'),false);
  const active=await invoke('canvasTargetActive');assert.equal(active.workspaces.canvases[0].connectionId,old);
  const methods={canvasTargetModels:{input:{...scope,kind:'image'}},canvasTargetAssets:{input:{...scope,kind:'image'}},canvasTargetWorkflowPreview:{input:workflow},canvasTargetRunNodes:{...scope,offset:0},canvasTargetRunQuote:{selection},canvasTargetTasksList:{scope},canvasTargetTaskDetail:{reference:ref}};
  const beforeAnon=f.state.requests.length;for(const method of ['canvasTargetWorkspaces','canvasTargetActive'])await assert.rejects(invoke(method,{}, {kind:'anonymous'}));for(const[method,args]of Object.entries(methods))await assert.rejects(invoke(method,{...args,expectedConnection:old},{kind:'anonymous'}));assert.equal(f.state.requests.length,beforeAnon);
  await f.pair();const current=(await invoke('canvasTargetWorkspaces')).canvases[0].connectionId;assert.notEqual(current,old);assert.deepEqual(f.config(),configBefore);
  const before=targetReads(f).length;for(const[method,args]of Object.entries(methods))await assert.rejects(invoke(method,{...args,expectedConnection:old}),changed);assert.equal(targetReads(f).length,before);assert.equal(f.flowState.plans,0);assert.equal(f.intents.size,0);
  await assert.rejects(invoke('canvasTargetRunQuote',{selection,expectedConnection:'EXAMPLE_INVALID'}));await assert.rejects(invoke('canvasTargetRunQuote',{selection}));assert.equal(targetReads(f).length,before);
  const nodes=await invoke('canvasTargetRunNodes',{...scope,offset:0,expectedConnection:current});assert.equal(nodes.connectionId,current);assert.equal(nodes.nodes[0].id,'EXAMPLE_IMAGE');
  const oldNodes=await invoke('canvasRunNodes',{...scope,offset:0});assert.equal('connectionId'in oldNodes,false);
  const preview=await invoke('canvasTargetWorkflowPreview',{input:workflow,expectedConnection:current});assert.equal(preview.phase,'preview');assert.equal(f.flowState.plans,1);assert.equal(f.flowState.mutations,0);
  for(const[name,params]of Object.entries({canvasWorkflowModels:['input'],canvasWorkflowAssets:['input'],canvasWorkflowPreview:['input'],canvasRunNodes:['projectId','canvasId','offset'],canvasRunQuote:['selection'],canvasTasksList:['scope'],canvasTaskDetail:['reference'],canvasTransferPreview:['input']}))assert.deepEqual(TYPERT_REMOTE.methods['zhen/'+name].parameters.map(p=>p.name),params);
 });
});

test('C87: a saved media preview refuses a stale pairing before any native target request, import or approval',async()=>{
 const f=await canvasTransferFixture();await owner(f,async({invoke})=>{const input={...scope,receiptId:f.receipt.id},old=(await invoke('canvasTargetWorkspaces')).canvases[0].connectionId;await f.pair();const before=targetReads(f).length;await assert.rejects(invoke('canvasTargetTransferPreview',{input,expectedConnection:old}),changed);assert.equal(targetReads(f).length,before);assert.equal(f.transferState.importWrites,0);assert.equal(f.transferState.approvalPosts,0);const current=(await invoke('canvasTargetWorkspaces')).canvases[0].connectionId,preview=await invoke('canvasTargetTransferPreview',{input,expectedConnection:current});assert.equal(preview.phase,'preview');assert.equal(f.transferState.importWrites,0);assert.equal(f.transferState.approvalPosts,0);});
});

test('C87: a re-pair during the first node inspection cannot continue into a second target query',async()=>{
 const f=await canvasRunFixture();try{const old=(await f.workflow.workspaces(true)).canvases[0].connectionId,original=f.state.route;let tools=0;f.state.route=async(req,body,auth,res)=>{const result=await original(req,body,auth,res);if(req.url==='/api/agent-control/v1/tools'&&++tools===1)await f.pair();return result;};await assert.rejects(f.runs.nodes(scope.projectId,scope.canvasId,0,old),error=>error.code==='TARGET_CONNECTION_CHANGED');assert.equal(tools,1);assert.equal(existsSync(f.runFile),false);assert.equal(f.intents.size,0);}finally{await f.dispose();}
});

test('C87: re-pairing during runtime metadata reads cannot proceed into a run or media plan',async()=>{
 for(const name of ['run','transfer']){
  const f=await(name==='run'?canvasRunFixture():canvasTransferFixture());
  try{
   const old=(await f.workflow.workspaces(true)).canvases[0].connectionId,original=f.state.route,started=f.state.requests.length;let rotated=false;
   f.state.route=async(req,body,auth,res)=>{
    const result=await original(req,body,auth,res);
    // Rotate during the later metadata read, after this request has read its session.
    if(req.url==='/api/agent-control/v1/status'&&!rotated&&f.state.requests.slice(started).some(r=>r.path==='/api/agent-control/v1/session')){rotated=true;await f.pair();}
    return result;
   };
   const before=targetReads(f).length;
   await assert.rejects(name==='run'?f.runs.quote(selection,old):f.transfer.preview({...scope,receiptId:f.receipt.id},old),error=>error.code==='TARGET_CONNECTION_CHANGED',name);
   assert.equal(rotated,true);assert.equal(targetReads(f).length,before);assert.equal(f.flowState.plans,0);assert.equal(f.flowState.mutations,0);
   if(name==='run')assert.equal(f.intents.size,0);else assert.equal(f.transferState.importWrites,0);
  }finally{await f.dispose();}
 }
});

async function client(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-target-api-EXAMPLE-')));t.after(()=>{const rel=relative(base,realpathSync.native(root));assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..')&&!/[\\/]/.test(rel));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});const result={};for(const name of['canvas-target-api','canvas-target']){const file=join(root,name+'.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/'+name+'.ts')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'});Object.assign(result,require(file));}return result;}
test('C87: actual client dispatch carries the selected identity through every scoped entry and uses the new directories',async t=>{
 const {canvasTargetApi}=await client(t),calls=[],token='a'.repeat(64),names=['canvasTargetWorkspaces','canvasTargetActive','canvasTargetModels','canvasTargetAssets','canvasTargetWorkflowPreview','canvasTargetRunNodes','canvasTargetRunQuote','canvasTargetTasksList','canvasTargetTaskDetail','canvasTargetTransferPreview'],api=Object.fromEntries(names.map(n=>[n,(...args)=>{calls.push({name:n,args});return Promise.resolve({ok:true,value:n==='canvasTargetWorkspaces'?{canvases:[]}:n==='canvasTargetActive'?{workspaces:{canvases:[]}}:null});}])),target=canvasTargetApi(api,token);
 await target.canvasWorkspaces();await target.canvasActiveTargets();await target.canvasWorkflowModels({...scope,kind:'image'});await target.canvasWorkflowAssets({...scope,kind:'image'});await target.canvasWorkflowPreview(workflow);await target.canvasRunNodes(scope.projectId,scope.canvasId);await target.canvasRunQuote(selection);await target.canvasTasksList(scope);await target.canvasTaskDetail(ref);await target.canvasTransferPreview({...scope,receiptId:'EXAMPLE_RECEIPT'});assert.deepEqual(calls.map(c=>c.name),names);for(const call of calls.slice(2))assert.equal(call.args.at(-1),token);assert.equal(calls.find(c=>c.name==='canvasTargetRunNodes').args[2],0);
});
test('C87: actual client retains legacy calls without a directory identity but never downgrades an identified target',async t=>{
 const {canvasTargetApi}=await client(t),calls=[],api={canvasWorkspaces:(...args)=>{calls.push(args);return Promise.resolve({ok:true,value:{canvases:[]}});},canvasWorkflowPreview:(...args)=>{calls.push(args);return Promise.resolve({ok:true,value:null});}};await canvasTargetApi(api).canvasWorkspaces();await canvasTargetApi(api).canvasWorkflowPreview(workflow);assert.deepEqual(calls,[[],[workflow]]);assert.throws(()=>canvasTargetApi(api,'a'.repeat(64)).canvasWorkflowPreview(workflow),/刷新 DSH/);assert.throws(()=>canvasTargetApi(api,'').canvasWorkflowPreview(workflow),/刷新 DSH/);assert.equal(calls.length,2);
});
test('C87: actual target keys invalidate the same project/canvas after its connection identity changes',async t=>{const {canvasTargetKey,refreshedCanvasTarget}=await client(t),first={...scope,id:scope.canvasId,name:'EXAMPLE',revision:1,connectionId:'a'.repeat(64)},next={...first,connectionId:'b'.repeat(64)};assert.notEqual(canvasTargetKey(first),canvasTargetKey(next));assert.equal(refreshedCanvasTarget({canvases:[next],total:1,truncated:false},canvasTargetKey(first)),'');assert.equal(canvasTargetKey({...first,connectionId:undefined}),JSON.stringify([scope.projectId,scope.canvasId]));});

test('C87: a malformed new directory is rejected without a legacy directory or target fallback',async t=>{const {canvasTargetApi}=await client(t);let fallback=0;const api={canvasWorkspaces:()=>{fallback++;},canvasTargetWorkspaces:async()=>({ok:true,value:{canvases:[{}]}})};await assert.rejects(canvasTargetApi(api).canvasWorkspaces(),/连接信息不完整/);api.canvasTargetWorkspaces=async()=>({ok:true,value:{canvases:[{connectionId:'a'.repeat(64)},{connectionId:'b'.repeat(64)}]}});await assert.rejects(canvasTargetApi(api).canvasWorkspaces(),/连接信息不完整/);assert.equal(fallback,0);});

test('C87: the actual fixture HTTP body preserves a Chinese goal across a forced UTF-8 chunk split',async()=>{
 const f=await canvasPairingFixture(),goal='鲸'.repeat(12000),bytes=Buffer.from(JSON.stringify({goal})),cut=Buffer.byteLength('{"goal":"')+1;let req;
 try{
  let observed;const firstChunk=new Promise(resolve=>{observed=resolve;});f.state.onBodyChunk=()=>observed();f.state.route=async(_req,body)=>({sha256:createHash('sha256').update(body.goal).digest('hex'),length:body.goal.length});
  const response=new Promise((resolve,reject)=>{req=httpRequest(f.state.descriptor.origin+'/api/agent-control/v1/EXAMPLE_UTF8',{method:'POST',headers:{'content-type':'application/json','connection':'close'},agent:false,signal:AbortSignal.timeout(3000)},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.once('error',reject);res.once('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});});req.once('error',reject);});
  req.write(bytes.subarray(0,cut));await Promise.race([firstChunk,response.then(()=>{throw Error('EXAMPLE response arrived before complete body');})]);req.end(bytes.subarray(cut));const result=await response;
  assert.equal(result.data.sha256,createHash('sha256').update(goal).digest('hex'));assert.equal(result.data.length,12000);
 }finally{req?.destroy();await f.dispose();}
});
