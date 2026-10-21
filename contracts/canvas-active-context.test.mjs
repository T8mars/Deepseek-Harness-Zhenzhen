import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {CanvasBridge} from '../packages/dsh-zhen/lib/canvas.js';
import {createCanvasMcp} from '../packages/dsh-zhen/lib/canvas-mcp.js';
import {parseCanvasActiveContext} from '../packages/dsh-zhen/lib/canvas-active-context.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {canvasWorkflowFixture} from './fixtures/canvas-workflow.mjs';
import {activeCanvasExample} from './fixtures/active-canvas.mjs';

async function fixture(options){
 const f=await canvasWorkflowFixture(options),original=f.state.route,activity={reads:0,workspaces:0,reply:()=>activeCanvasExample(f.state.descriptor.instanceId),afterRead:undefined,afterWorkspaces:undefined};
 f.state.route=async(req,body,auth,response)=>{
  if(req.url==='/api/agent-control/v1/active-context'){
   auth.authenticate(String(req.headers.authorization??'').replace(/^Bearer /,''),['canvas:read']);activity.reads++;
   const value=await activity.reply();await activity.afterRead?.();return value;
  }
  const result=await original(req,body,auth,response);if(req.url==='/api/agent-control/v1/workspaces'){activity.workspaces++;await activity.afterWorkspaces?.();}return result;
 };
 return{...f,activity};
}
test('C86: native active metadata is whitelisted and inconsistent target/readiness/window claims refuse before use',()=>{
 const raw=activeCanvasExample();raw.prompt='EXAMPLE_PRIVATE_BODY';raw.candidates[0].thumbnail='https://example.invalid/EXAMPLE_PRIVATE?signature=EXAMPLE_ONLY';
 const canonical=parseCanvasActiveContext(raw,raw.instanceId);assert.equal(JSON.stringify(canonical).includes('EXAMPLE_PRIVATE'),false);
 const changes=[v=>v.candidates.push({...v.candidates[0]}),v=>{v.truncated=true;},v=>{v.activeWindowId='2';},v=>{v.resolution=null;},v=>{v.resolution='focused-window';},v=>{v.candidates[0].windowReady=false;},v=>{v.candidates[0].revision=0;},v=>{v.candidates[0].canvasId='../EXAMPLE';},v=>{v.candidates[0].projectId=null;},v=>{v.candidates[0].rendererReady=false;},v=>{v.status='ambiguous';},v=>{v.candidates=Array.from({length:9},(_,i)=>({...v.candidates[0],windowId:String(i+1)}));}];
 for(const change of changes){const value=activeCanvasExample();change(value);assert.throws(()=>parseCanvasActiveContext(value,value.instanceId),error=>error.code==='ACTIVE_CONTEXT_INVALID');}
 const unicode=activeCanvasExample();unicode.candidates[0].projectId='EXAMPLE_中文';assert.equal(parseCanvasActiveContext(unicode,unicode.instanceId).candidates[0].projectId,'EXAMPLE_中文');
});
test('C86: foreign, stale and future replies never identify a current target',()=>{
 const now=Date.now(),value=activeCanvasExample();assert.throws(()=>parseCanvasActiveContext(value,'EXAMPLE_OTHER',now),error=>error.code==='ACTIVE_CONTEXT_INSTANCE_MISMATCH');
 for(const change of[v=>v.observedAt=new Date(now-31000).toISOString(),v=>v.observedAt=new Date(now+6000).toISOString(),v=>v.candidates[0].observedAt=new Date(now-31000).toISOString()]){const value=activeCanvasExample();change(value);assert.throws(()=>parseCanvasActiveContext(value,value.instanceId,now),error=>error.code==='ACTIVE_CONTEXT_EXPIRED');}
 for(const status of ['not-ready','unavailable','ambiguous']){const value=activeCanvasExample(undefined,{status,resolution:null,activeWindowId:null,candidates:[]});assert.equal(parseCanvasActiveContext(value,value.instanceId).status,status);}
});
test('C86: actual native auth/CLI bridge requires pairing and detects changed trusted resources after the read',async()=>{
 const f=await fixture({autoPair:false});try{
  const bridge=new CanvasBridge(f.config());await assert.rejects(bridge.read('active-context'),error=>error.code==='PAIRING_REQUIRED');assert.equal(f.activity.reads,0);
  await f.pair();const writes=f.state.storeWrites,result=await bridge.read('active-context');assert.equal(result.status,'resolved');assert.equal(result.instanceId,f.state.descriptor.instanceId);assert.equal(f.state.storeWrites,writes);
  f.activity.afterRead=()=>writeFileSync(join(f.root,'EXAMPLE_DRIFT.txt'),'EXAMPLE changed resource');await assert.rejects(bridge.read('active-context'),error=>error.code==='CLI_CHANGED');
 }finally{await f.dispose();}
});
test('C86: real MCP exposes eleven read/planning tools, projects current metadata and preserves public status without new mutation',async()=>{
 const f=await fixture(),server=createCanvasMcp(new CanvasBridge(f.config())),client=new Client({name:'EXAMPLE_ACTIVE_READER',version:'1.0.0'}),[left,right]=InMemoryTransport.createLinkedPair();
 try{const before=f.state.requests.length,writes=f.state.storeWrites;await server.connect(right);await client.connect(left);const tools=(await client.listTools()).tools;assert.equal(tools.length,11);assert.ok(tools.some(t=>t.name==='canvas_active_context'&&t.annotations.readOnlyHint===true&&t.annotations.destructiveHint===false));assert.equal(f.state.requests.length,before);
  f.activity.reply=()=>({...activeCanvasExample(f.state.descriptor.instanceId),EXAMPLE_PRIVATE:'EXAMPLE_PRIVATE'});const result=await client.callTool({name:'canvas_active_context',arguments:{}});assert.equal(result.isError,undefined);assert.equal(result.structuredContent.status,'resolved');assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE'),false);
  const status=await client.callTool({name:'canvas_status',arguments:{}});assert.deepEqual(status.structuredContent.compat,{supported:true,fixture:'EXAMPLE_ONLY'});assert.equal(f.state.storeWrites,writes);assert.ok(f.state.requests.slice(before).every(r=>r.method==='GET'));assert.equal(f.flowState.plans,0);assert.equal(f.flowState.mutations,0);
 }finally{await client.close();await server.close();await f.dispose();}
});
test('C86: unsupported older desktop context returns a useful fixed code while manual workspace reads keep working',async()=>{
 const f=await fixture();try{f.activity.reply=()=>{throw Object.assign(Error('EXAMPLE_PRIVATE_ROUTE_DETAIL'),{code:'EXAMPLE_ROUTE_ABSENT',status:404});};const bridge=new CanvasBridge(f.config());await assert.rejects(bridge.read('active-context'),error=>error.code==='ACTIVE_CONTEXT_UNSUPPORTED'&&!error.message.includes('EXAMPLE_PRIVATE'));assert.equal((await f.workflow.workspaces()).canvases[0].id,'EXAMPLE_CANVAS');assert.equal(f.flowState.plans,0);assert.equal(f.flowState.mutations,0);}finally{await f.dispose();}
});
for(const changedAt of ['none','context','workspaces'])test(`C86: owner Remote reads one bound context/directory and refuses ${changedAt} connection changes without exposing stale targets`,async()=>{
 const f=await fixture(),ctx=new Context(),previous=process.env.DSH_HOME;process.env.DSH_HOME=join(f.base,'EXAMPLE_ACTIVE_HOST');let credentials=0;
 ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_PROVIDER_KEY');}});
 try{for(const plugin of [SystemPrompt,ToolRuntime,Typert,Access,ZhenService])await ctx.plugin(plugin);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});const service=ctx.get('zhen'),config=f.config();await service.connectCanvas(config.root,'',config.digest);
  const peer={id:'EXAMPLE_OWNER',ctx,principal:{kind:'owner'},signal:new AbortController().signal,interactions:'none',dispose:async()=>{}},invoke=principal=>ctx.typertGateway.invoke({namespace:'zhen',method:'canvasActiveTargets',args:{},peer:{...peer,principal}});
  const before=f.activity.reads;await assert.rejects(invoke({kind:'anonymous'}));assert.equal(f.activity.reads,before);
  if(changedAt==='context')f.activity.afterRead=()=>service.disconnectCanvas();if(changedAt==='workspaces')f.activity.afterWorkspaces=()=>service.disconnectCanvas();
  if(changedAt==='none'){const result=await invoke(peer.principal),decoded=TYPERT_REMOTE.methods['zhen/canvasActiveTargets'].result.create().parse(JSON.parse(JSON.stringify(result)));assert.deepEqual(decoded,result);assert.equal(result.context.instanceId,f.state.descriptor.instanceId);assert.equal(result.workspaces.canvases[0].id,'EXAMPLE_CANVAS');}
  else{await assert.rejects(invoke(peer.principal),error=>error.message.includes('连接已变化'));if(changedAt==='context')assert.equal(f.activity.workspaces,0);}
  assert.equal(credentials,0);assert.equal(f.flowState.plans,0);assert.equal(f.flowState.mutations,0);
 }finally{await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;await f.dispose();}
});
