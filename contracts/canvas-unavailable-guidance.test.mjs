import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parse} from 'yaml';
import {Context} from '@deepseek-ai/cordis';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Tools,{defineTool} from '@deepseek-ai/dsh-tools';
import Agents from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Sessions from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import DefaultModel from '@deepseek-ai/dsh-agent-default-model';
import Llm,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import ZhenService from '../packages/dsh-zhen/lib/index.js';

async function fixture(t){
  const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-unavailable-guidance-EXAMPLE-'))),previous=process.env.DSH_HOME,ctx=new Context();
  process.env.DSH_HOME=root;let keyReads=0;
  ctx.provide('credentials',{resolve:async()=>{keyReads++;throw Error('EXAMPLE_NO_CREDENTIAL');}});
  await ctx.plugin(Prompt);await ctx.plugin(ZhenService);
  t.after(async()=>{await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part));rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});assert.equal(keyReads,0);});
  const file=join(root,'dsh-zhen','canvas.json');
  const put=text=>{mkdirSync(join(root,'dsh-zhen'),{recursive:true});writeFileSync(file,text);};
  return{root,ctx,file,put,prompt:async()=>(await ctx.systemPrompt.assemble()).sections.find(row=>row.name==='zhen:canvas-entry').text};
}

for(const mode of['absent','empty','stale','disconnected','malformed'])test('C105: unavailable Canvas guidance survives '+mode+' own connection state without reading or trusting tools',async t=>{
  const f=await fixture(t);
  if(mode==='empty')f.put('{}\n');
  if(mode==='stale'||mode==='disconnected')f.put(JSON.stringify({root:join(f.root,'EXAMPLE_MISSING_CLI'),digest:'1'.repeat(64),instance:''}));
  if(mode==='disconnected')await f.ctx.get('zhen').disconnectCanvas();
  if(mode==='malformed')f.put('{EXAMPLE_INVALID_JSON');
  const before=existsSync(f.file)?readFileSync(f.file):null,text=await f.prompt();
  assert.match(text,/mcp__t8canvas__.*没有出现在/);
  assert.match(text,/创作空间 → 画布连接/);
  assert.match(text,/不要.*全局 zhenzhen-canvas/);
  assert.match(text,/不要.*(?:安装|修复).*画布/);
  assert.match(text,/计划仅是待审阅方案/);
  assert.equal(f.ctx.get('tools'),undefined);
  assert.deepEqual(existsSync(f.file)?readFileSync(f.file):null,before);
});

test('C105: the actual published AgentLoop retains ordinary scoped tools with unavailable Canvas guidance',{timeout:15000},async t=>{
  const f=await fixture(t),defaults=parse(readFileSync('packages/dsh-zhen/cordis.patch.yml','utf8')).find(row=>row.id==='agent-default-model').config;let calls=0,reads=0,handle,timer;const ends=[],errors=[];
  class ExampleAdapter extends LlmAdapter{
    async*stream(options){
      calls++;assert.ok(options.tools.some(row=>row.name==='read_example_note'));assert.equal(options.tools.some(row=>row.name.startsWith('mcp__t8canvas__')),false);assert.match(await f.prompt(),/创作空间 → 画布连接/);
      if(calls===1){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id:'EXAMPLE_ORDINARY_READ',name:'read_example_note',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'EXAMPLE_ORDINARY_READ',name:'read_example_note',arguments:'{}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}
      else{assert.equal(calls,2);assert.ok(options.messages.some(row=>row.role==='tool'&&row.content.some(block=>block.type==='text'&&block.text==='EXAMPLE_VALUE=17')));yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:'17'};yield{type:'block-end',index:0,block:{type:'text',text:'17'}};yield{type:'finish',reason:{kind:'stop'}};}
    }
  }
  try{
    for(const plugin of[Sessions,Projections,Agents,Llm,Tools])await f.ctx.plugin(plugin);
    f.ctx.llm.registerAdapter([defaults.provider],new ExampleAdapter());await f.ctx.plugin(DefaultModel,structuredClone(defaults));await f.ctx.plugin(AgentLoop,{maxParallelToolCalls:1});
    f.ctx.on('session/event',(_session,event)=>{if(event.type==='turn/end')ends.push(event.data.reason.kind);});f.ctx.on('agent/error',row=>errors.push(row.error?.code??'UNAVAILABLE'));
    handle=await f.ctx.agents.create({sessionId:randomUUID(),meta:{cwd:f.root},agentOptions:{...f.ctx.agentDefaultModel.currentSelection(),maxTokens:128},setup(agentCtx){agentCtx.tools.register(defineTool({name:'read_example_note',description:'Read the EXAMPLE note.',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async()=>{reads++;return'EXAMPLE_VALUE=17';}}));}});
    timer=setTimeout(()=>handle.agent.cancel({kind:'hook',reason:'EXAMPLE_DEADLINE'}),10000);handle.agent.followup(createUserMessage({content:[{type:'text',text:'EXAMPLE：读取测试笔记里的数字。'}],source:{kind:'user'}}));await handle.agent.whenIdle();
    assert.deepEqual(errors,[]);assert.deepEqual(ends,['completed']);assert.equal(calls,2);assert.equal(reads,1);assert.equal(handle.agent.session.deriveMessages().filter(row=>row.role==='assistant').at(-1).content.filter(row=>row.type==='text').map(row=>row.text).join(''),'17');
    console.log(JSON.stringify({contract:'C105',actualPublishedPromptRegistry:true,actualPublishedAgentLoop:true,unconfiguredCanvasGuidancePresent:true,ordinaryScopedToolStillExecuted:true,nativeWrites:0,modelRequests:0}));
  }finally{clearTimeout(timer);await handle?.dispose();}
});
