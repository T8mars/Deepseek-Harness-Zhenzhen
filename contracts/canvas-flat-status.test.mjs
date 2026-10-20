import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {CanvasBridge,inspectCanvasCli} from '../packages/dsh-zhen/lib/canvas.js';
import {createCanvasMcp} from '../packages/dsh-zhen/lib/canvas-mcp.js';

const flat={service:'t8-agent-control-v1',appVersion:'3.0.0',instanceId:'EXAMPLE_INSTANCE',skillVersion:'EXAMPLE_SKILL',cliVersion:'EXAMPLE_CLI',controlProtocol:'t8-agent-control-v1',canvasPatchProtocol:'t8-canvas-patch-v1',nodeSchemaDigest:'0'.repeat(64),providerCatalogDigest:'1'.repeat(64),creativeCapabilityManifestDigest:'2'.repeat(64),creativeCapabilityGraphDigest:'3'.repeat(64),manifestDigest:'4'.repeat(64),pairingRequired:true,runControl:{schema:'t8-agent-run-control-v1'},assetControl:{schema:'t8-agent-asset-control-v1'}};
for(const [name,raw,expected] of [['flat public status',flat,flat],['legacy nested report',{compat:{supported:false,reason:'EXAMPLE_ONLY',future:{retained:true}}},{supported:false,reason:'EXAMPLE_ONLY',future:{retained:true}}],['explicit null report',{compat:null},null]])test('C40: '+name+' survives actual Host/Gateway codec and MCP without pairing, credential reads or pin promotion',async()=>{
  const base=realpathSync.native(tmpdir()),home=realpathSync.native(mkdtempSync(join(base,'dsh-flat-status-EXAMPLE-'))),cli=join(home,'EXAMPLE_CLI');mkdirSync(join(cli,'src'),{recursive:true});
  writeFileSync(join(cli,'manifest.json'),JSON.stringify({schema:'t8-zcanvas-manifest-v1',controlProtocol:'t8-agent-control-v1'}));writeFileSync(join(cli,'src/discovery.cjs'),"exports.discoverInstances=async()=>[{instanceId:'EXAMPLE_INSTANCE',origin:'http://127.0.0.1:1'}];");
  writeFileSync(join(cli,'src/secureStore.cjs'),"exports.loadSession=()=>{throw Error('EXAMPLE_STATUS_MUST_NOT_READ_AUTH');};");writeFileSync(join(cli,'src/agentClient.cjs'),`exports.selectInstance=async()=>{throw Error('EXAMPLE_UNPAIRED');};exports.requestAgentControl=async(instance,path,options={})=>{if(path!=='/api/agent-control/v1/status'||options.accessToken||options.body||options.method&&options.method!=='GET')throw Error('EXAMPLE_READONLY_ONLY');return{ok:true,data:${JSON.stringify(raw)}};};`);
  const previousHome=process.env.DSH_HOME;process.env.DSH_HOME=join(home,'EXAMPLE_HOME');const ctx=new Context();let credentials=0;ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_CREDENTIAL');}});
  const config=inspectCanvasCli(cli,''),mcp=createCanvasMcp(new CanvasBridge(config)),client=new Client({name:'EXAMPLE_STATUS',version:'1.0.0'}),[left,right]=InMemoryTransport.createLinkedPair();
  try{
    await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
    await ctx.get('zhen').connectCanvas(cli,'',config.digest);const lifetime=new AbortController(),peer={id:'EXAMPLE_OWNER',ctx,principal:{kind:'owner'},signal:lifetime.signal,interactions:'none',dispose:async()=>{}};
    const wire=await ctx.typertGateway.invoke({namespace:'zhen',method:'canvasStatus',args:{},peer}),status=TYPERT_REMOTE.methods['zhen/canvasStatus'].result.create().parse(JSON.parse(JSON.stringify(wire)));
    assert.equal(status.connected,true);assert.deepEqual(status.compat,expected);assert.equal(status.digest,config.digest);
    await mcp.connect(left);await client.connect(right);const result=await client.callTool({name:'canvas_status',arguments:{}});assert.deepEqual(result.structuredContent,raw);assert.equal(credentials,0);
    writeFileSync(join(cli,'src/agentClient.cjs'),'// EXAMPLE_CHANGED_AFTER_REVIEW');assert.equal((await ctx.get('zhen').canvasStatus()).code,'CLI_CHANGED');assert.equal(credentials,0);
  }finally{await client.close();await mcp.close();await ctx.fiber.dispose();if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;const part=relative(base,realpathSync.native(home));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(home,{recursive:true,force:true});}
});
