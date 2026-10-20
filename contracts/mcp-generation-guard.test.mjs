import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,unlinkSync} from 'node:fs';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import McpResources from '@deepseek-ai/dsh-mcp-resources';
import {CuratedMcpRuntime} from '../packages/dsh-zhen/lib/mcp-runtime.js';
import {maintenanceFixture} from './fixtures/mcp-maintenance.mjs';

test('C43: published ToolRuntime blocks old-session tool and resource calls after re-enable, repair and restoration, even with permissive pre-policy',async()=>{
 const f=maintenanceFixture(),ctx=new Context(),agent={session:{id:'EXAMPLE_INITIAL_SESSION'},options:{provider:'seedance'}};let credentials=0,call=0;
 ctx.provide('workingDirectory',{get:()=>f.root,ensure:async()=>f.root});ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_CREDENTIAL_READ');}});
 try{
  await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(McpResources);const runtime=new CuratedMcpRuntime(ctx,f.market);
  f.market.select('memory',f.old.release.version,f.root);await runtime.sync();
  ctx.on('tools/pre-execute',async()=>({kind:'allow'}));
  const execute=(name,args={})=>ctx.tools.execute({callId:'EXAMPLE_GENERATION_'+(++call),name,arguments:args,agent,signal:new AbortController().signal});
  const probe=(args={})=>execute('mcp__zhenmemory__fixture_probe',args),resource=()=>execute('read_mcp_resource',{server:'zhenmemory',uri:'memory://EXAMPLE_ONLY'});
  for(const operation of ['reenable','repair','restore']){
   const initial=await probe();assert.equal(initial.isError,false);assert.equal((await resource()).isError,false);
   const data=JSON.parse(initial.value.content[0].text).data;if(existsSync(data+'.started'))unlinkSync(data+'.started');
   if(operation==='reenable'){f.market.disable('memory');await runtime.sync();}
   else if(operation==='repair')await f.market.repair('memory',f.old.release.version,()=>runtime.quiesce('memory'));
   else{const archive=f.market.snapshot().archives.find(a=>a.verified&&a.programRetained);assert.ok(archive);await f.market.restoreArchive(archive.archiveId,()=>runtime.quiesce('memory'));}
   assert.equal(f.market.active().length,0);f.market.select('memory',f.old.release.version,f.root);await runtime.sync();assert.equal(runtime.state('memory'),'ready');
   assert.throws(()=>f.market.assertSession(agent.session.id,f.root));
   assert.equal((await probe({wait:true})).isError,true,operation+': stale session must not reach the server');
   assert.equal(existsSync(data+'.started'),false,operation+': refused request must not create the handler marker');
   assert.equal((await resource()).isError,true,operation+': resource calls need the same current grant check');
   agent.session.id='EXAMPLE_FRESH_'+operation;
   const fresh=await probe();assert.equal(fresh.isError,false);assert.equal(JSON.parse(fresh.value.content[0].text).data,data);assert.equal((await resource()).isError,false);
   f.market.assertSession(agent.session.id,f.root);
  }
  assert.equal(credentials,0);
 }finally{await ctx.fiber.dispose();f.dispose();}
});
