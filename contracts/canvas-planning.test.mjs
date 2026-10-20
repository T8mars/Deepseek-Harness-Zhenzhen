import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCanvasMcp } from '../packages/dsh-zhen/lib/canvas-mcp.js';
import { CanvasBridge, inspectCanvasCli } from '../packages/dsh-zhen/lib/canvas.js';
import { boundedCanvasInput } from '../packages/dsh-zhen/lib/canvas-contract.js';
import { canvasFixture, canvasCatalog } from './fixtures/canvas.mjs';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';

const plan=(tool=canvasCatalog.tools[0],operation=tool.defaultOperation)=>({tool:tool.name,version:tool.version,operation,projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{prompt:'EXAMPLE ONLY creative intent'}});

test('C16: all 39 published capability surfaces preserve 73 exact L0 operation/version/scope routes through the reviewed CLI',async()=>{
  const fixture=await canvasFixture();
  try{
    assert.equal(canvasCatalog.tools.length,39);assert.equal(canvasCatalog.tools.reduce((sum,tool)=>sum+tool.directOperations.length,0),73);
    assert.deepEqual(await fixture.bridge.read('capability-tools'),canvasCatalog);
    for(const tool of canvasCatalog.tools)for(const operation of tool.directOperations){
      const result=await fixture.bridge.plan(plan(tool,operation));
      assert.equal(result.tool.name,tool.name);assert.equal(result.tool.operation,operation);assert.deepEqual(result.sideEffects,{canvasWrites:0,providerCalls:0,fileWrites:0});
      assert.equal(result.data.cost.known,false);
    }
    const posts=fixture.state.calls.filter(call=>call.method==='POST');assert.equal(posts.length,73);
    assert.ok(posts.every(call=>call.path==='/api/agent-control/v1/capability-tools/invoke'&&call.body.schema==='t8-versioned-creative-tool-request-v1'));
    assert.equal(JSON.stringify(posts).includes('EXAMPLE_ONLY_TOKEN'),false);
  }finally{fixture.dispose();}
});

test('C16: planning refuses write/run/approval carriers, stale versions, drift, expired pairing and ambiguous transport without resubmission',async()=>{
  const fixture=await canvasFixture();
  try{
    for(const operation of ['apply','run','retry','submit','approve'])await assert.rejects(fixture.bridge.plan({...plan(),operation}));
    for(const input of [{headers:{Authorization:'EXAMPLE'}},{nested:{providerRequest:{}}},{nodes:[]},{__proto__:null,constructor:'EXAMPLE'},{route:'/api/settings/raw'}])await assert.rejects(fixture.bridge.plan({...plan(),input}));
    assert.equal(fixture.state.calls.length,0);
    await assert.rejects(fixture.bridge.plan({...plan(),version:'99.0.0'}));
    assert.equal(fixture.state.calls.filter(call=>call.method==='POST').length,0);
    for(const mode of ['catalog-hash','catalog-scope']){fixture.state.mode=mode;await assert.rejects(fixture.bridge.plan(plan()));}
    fixture.state.mode='good';fixture.state.expired=true;
    const before=fixture.state.calls.length;await assert.rejects(fixture.bridge.plan(plan()),error=>error.code==='PAIRING_REQUIRED');assert.equal(fixture.state.calls.length,before);
    fixture.state.expired=false;fixture.state.mode='post-failure';
    await assert.rejects(fixture.bridge.plan(plan()),error=>error.code==='AGENT_CONTROL_TIMEOUT');
    assert.equal(fixture.state.calls.filter(call=>call.method==='POST').length,1);
    fixture.state.mode='wrong-scope';await assert.rejects(fixture.bridge.plan(plan()),error=>error.code==='CAPABILITY_RESULT_MISMATCH');
    fixture.state.mode='paid-result';await assert.rejects(fixture.bridge.plan(plan()));
  }finally{fixture.dispose();}
});

test('C16: eight existing inspection tools bind request and canvas references without exposing another route',async()=>{
  const fixture=await canvasFixture();
  try{
    const tools=['inspectCanvas','inspectNodeSchema','inspectRun','searchAssets','searchSubflows','validateCanvas','simulateExecutionPlan','estimateRun'];
    for(const tool of tools){const result=await fixture.bridge.inspect({tool,projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{}});assert.equal(result.tool,tool);assert.match(result.requestId,/^[a-f0-9-]{36}$/);assert.equal(result.readOnly,true);}
    assert.ok(fixture.state.calls.every(call=>call.path==='/api/agent-control/v1/tools'&&call.method==='POST'));
    const count=fixture.state.calls.length;
    await assert.rejects(fixture.bridge.inspect({tool:'applyCanvasPatch',projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{}}));assert.equal(fixture.state.calls.length,count);
    fixture.state.mode='wrong-scope';await assert.rejects(fixture.bridge.inspect({tool:'inspectCanvas',projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{}}),error=>error.code==='INSPECTION_RESULT_MISMATCH');
    let deep={};for(let index=0;index<14;index++)deep={nested:deep};assert.equal(boundedCanvasInput(deep),false);assert.equal(boundedCanvasInput({prompt:'x'.repeat(49*1024)}),false);assert.equal(boundedCanvasInput({items:Array(2049).fill(0)}),false);
  }finally{fixture.dispose();}
});

test('C16: real SDK planning validates arguments and redacts returned secrets without changing plan identity',async()=>{
  const fixture=await canvasFixture(),server=createCanvasMcp(fixture.bridge),client=new Client({name:'EXAMPLE_ONLY_PLAN_TEST',version:'1.0.0'}),[left,right]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(left);await client.connect(right);
    fixture.state.mode='secret-data';const result=await client.callTool({name:'canvas_plan',arguments:plan()});
    assert.equal(result.isError,undefined);assert.equal(result.structuredContent.data.planId,'EXAMPLE_ONLY_PLAN');
    for(const value of ['EXAMPLE_ONLY_HIDDEN_TOKEN','EXAMPLE_PASSWORD','EXAMPLE_SECRET_FRAGMENT','EXAMPLE_USER'])assert.equal(JSON.stringify(result).includes(value),false);
    const count=fixture.state.calls.length;const invalid=await client.callTool({name:'canvas_plan',arguments:{...plan(),operation:'run'}});assert.equal(invalid.isError,true);assert.equal(fixture.state.calls.length,count);
  }finally{await client.close();await server.close();fixture.dispose();}
});

test('C16: published DSH MCP client and ToolRuntime execute exact scoped plan and inspection requests over stdio',async()=>{
  const fixture=await canvasFixture(),ctx=new Context();
  try{
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);
    const mounted=await ctx.plugin(mcpClient,mcpClient.Config({transport:'stdio',serverName:'examplecanvasplan',command:process.execPath,args:[resolve('packages/dsh-zhen/lib/canvas-server.js'),'--cli-root',fixture.root,'--digest',fixture.config.digest],env:{},cwd:fixture.root,toolCallTimeoutMs:30000,failOnStartupError:true,maxInstructionBytes:4096,reconnect:{enabled:false}}));
    const result=await ctx.tools.execute({callId:'EXAMPLE_PLAN_CALL',name:'mcp__examplecanvasplan__canvas_plan',arguments:plan(),signal:new AbortController().signal});
    assert.equal(result.isError,false);assert.match(JSON.stringify(result),/EXAMPLE_ONLY_PLAN/);
    const inspected=await ctx.tools.execute({callId:'EXAMPLE_INSPECT_CALL',name:'mcp__examplecanvasplan__canvas_inspect',arguments:{tool:'inspectCanvas',projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{}},signal:new AbortController().signal});
    assert.equal(inspected.isError,false);assert.match(JSON.stringify(inspected),/t8-canvas-agent-tool-result-v1/);
    await mounted.dispose();assert.equal(ctx.tools.schemas().length,0);
  }finally{await ctx.fiber.dispose();fixture.dispose();}
});

test('C16: reviewing a changed CLI loads its new CommonJS code while the previous digest remains refused',async()=>{
  const fixture=await canvasFixture();
  try{
    assert.equal((await fixture.bridge.status()).compat.fixture,'EXAMPLE_ONLY');
    const path=resolve(fixture.root,'src/agentClient.cjs');
    writeFileSync(path,readFileSync(path,'utf8')+"\nconst original=exports.requestAgentControl;exports.requestAgentControl=async(...args)=>{const result=await original(...args);if(args[1].endsWith('/status'))result.data.compat.fixture='EXAMPLE_REVIEWED_NEW_CODE';return result;};\n");
    assert.equal((await fixture.bridge.status()).code,'CLI_CHANGED');
    const reviewed=new CanvasBridge(inspectCanvasCli(fixture.root));
    assert.equal((await reviewed.status()).compat.fixture,'EXAMPLE_REVIEWED_NEW_CODE');
    assert.equal((await fixture.bridge.status()).code,'CLI_CHANGED');
  }finally{fixture.dispose();}
});

test('C16: Host catalog RPC cross-checks paired tools with the strict public codec and never reads a model credential',async()=>{
  const fixture=await canvasFixture(),temp=realpathSync.native(tmpdir()),home=mkdtempSync(join(temp,'dsh-zhen-canvas-host-catalog-'));
  const previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
  const ctx=new Context();let credentials=0;
  ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_ONLY_NOT_NEEDED');}});
  try{
    await ctx.plugin(ZhenService);const service=ctx.get('zhen');
    assert.equal(await service.canvasTools(),null);
    const status=await service.connectCanvas(fixture.root,'EXAMPLE_ONLY_INSTANCE');
    assert.equal(status.instance,'EXAMPLE_ONLY_INSTANCE');
    assert.equal((await service.canvasStatus()).instance,'EXAMPLE_ONLY_INSTANCE');
    const catalog=await service.canvasTools();
    assert.deepEqual(catalog,canvasCatalog);
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasTools'].result.create().parse(catalog),catalog);
    assert.equal(credentials,0);
    await service.disconnectCanvas();assert.equal(await service.canvasTools(),null);
  }finally{
    await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;
    fixture.dispose();const absolute=realpathSync.native(home),rel=relative(temp,absolute);
    if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Host fixture cleanup refused.');
    rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
