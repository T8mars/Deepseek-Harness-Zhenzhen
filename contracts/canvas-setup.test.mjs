import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {inspectCanvasCli} from '../packages/dsh-zhen/lib/canvas.js';
import {exampleCanvasInstall} from './fixtures/canvas-install.mjs';
test('C55: published Owner check and prompt registry use reviewed MCP route, preserve raw status, deny anonymous access and expose no new Agent mutation tool',async()=>{
 const base=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-setup-host-EXAMPLE-'))),f=exampleCanvasInstall(base),previous=process.env.DSH_HOME;process.env.DSH_HOME=join(base,'EXAMPLE_DSH');const ctx=new Context();let keys=0;
 ctx.provide('credentials',{resolve:async()=>{keys++;throw Error('EXAMPLE_NO_PROVIDER_KEY');},describe:async()=>({configured:false,writable:true})});
 writeFileSync(join(f.root,'src/discovery.cjs'),"exports.discoverInstances=async()=>[{instanceId:'EXAMPLE_ONE',origin:'http://127.0.0.1:12345',appVersion:'3.3.7'}];");
 writeFileSync(join(f.root,'src/secureStore.cjs'),"exports.loadSession=()=>{throw Error('EXAMPLE_NO_AUTH_READ');};");
 writeFileSync(join(f.root,'src/agentClient.cjs'),"exports.selectInstance=async()=>{const e=new Error('EXAMPLE_PRIVATE');e.code='CREATIVE_CAPABILITY_GRAPH_DIGEST_MISMATCH';throw e;};exports.requestAgentControl=async()=>({ok:true,data:{pairingRequired:true,EXAMPLE_RAW:true}});");
 try{
  await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
  const service=ctx.get('zhen');assert.equal((await service.canvasConnectionCheck()).state,'not-configured');assert.equal((await ctx.systemPrompt.assemble()).sections.find(item=>item.name==='zhen:canvas-entry').text,'');
  const config=inspectCanvasCli(f.root);await service.connectCanvas(config.root,'',config.digest);
  const peer={id:'EXAMPLE_OWNER',ctx,principal:{kind:'owner'},signal:new AbortController().signal,interactions:'none',dispose:async()=>{}};
  const invoke=(method,principal=peer.principal)=>ctx.typertGateway.invoke({namespace:'zhen',method,args:{},peer:{...peer,principal}});
  const check=await invoke('canvasConnectionCheck');assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasConnectionCheck'].result.create().parse(JSON.parse(JSON.stringify(check))),check);assert.equal(check.state,'incompatible');
  assert.equal((await invoke('canvasStatus')).connected,true);await assert.rejects(invoke('canvasConnectionCheck',{kind:'anonymous'}));await assert.rejects(invoke('canvasSetupDiscover',{kind:'anonymous'}));
  const guidance=(await ctx.systemPrompt.assemble()).sections.find(item=>item.name==='zhen:canvas-entry').text;assert.match(guidance,/pairingRequired:true/);assert.match(guidance,/不要另起 shell/);assert.match(guidance,/canvas_plan/);assert.match(guidance,/计划仅是待审阅方案/);
  assert.equal(ctx.tools.schemas().filter(tool=>tool.name.startsWith('mcp__t8canvas__')).length, 11);assert.equal(ctx.tools.schemas().some(tool=>/canvasConnectionCheck|canvasSetupDiscover/.test(tool.name)),false);assert.equal(keys,0);
  const pending=service.canvasConnectionCheck();writeFileSync(join(process.env.DSH_HOME,'dsh-zhen/canvas.json'),JSON.stringify({...config,instance:'EXAMPLE_OTHER_WINDOW'}));assert.equal((await pending).code,'CONNECTION_CHANGED');
  await service.disconnectCanvas();assert.equal((await ctx.systemPrompt.assemble()).sections.find(item=>item.name==='zhen:canvas-entry').text,'');
 }finally{await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const rel=relative(realpathSync.native(tmpdir()),base);assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));rmSync(base,{recursive:true,force:true});}
});
