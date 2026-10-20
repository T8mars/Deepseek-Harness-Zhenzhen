import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { CuratedMcpRuntime } from '../packages/dsh-zhen/lib/mcp-runtime.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { maintenanceFixture } from './fixtures/mcp-maintenance.mjs';

test('C18: real DSH MCP calls drain before repair, old grants stay revoked, and restart creates a fresh server with the same data binding',async()=>{
  const fixture=maintenanceFixture(),ctx=new Context(),agent={session:{id:'EXAMPLE_OLD_SESSION'},options:{provider:'seedance'}};
  ctx.provide('workingDirectory',{get:()=>fixture.root,ensure:async()=>fixture.root});
  let runtime;
  try{
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);
    runtime=new CuratedMcpRuntime(ctx,fixture.market);
    fixture.market.select('memory',fixture.old.release.version,fixture.root);await runtime.sync();assert.equal(runtime.state('memory'),'ready');
    let count=0;const execute=(args={})=>ctx.tools.execute({callId:`EXAMPLE_CALL_${++count}`,name:'mcp__zhenmemory__fixture_probe',arguments:args,agent,signal:new AbortController().signal});
    const initial=await execute(),before=JSON.parse(initial.value.content[0].text),data=before.data;writeFileSync(data,'EXAMPLE ONLY persistent memory');
    const pending=execute({wait:true});const deadline=Date.now()+3000;while(!existsSync(data+'.started')&&Date.now()<deadline)await delay(10);assert.ok(existsSync(data+'.started'));
    let disconnected=false;
    const repair=fixture.market.repair('memory',fixture.old.release.version,async()=>{await runtime.quiesce('memory');disconnected=true;assert.equal(ctx.tools.schemas().some(item=>item.name.startsWith('mcp__zhenmemory__')),false);});
    assert.equal(fixture.market.active().length,0);assert.equal((await execute()).isError,true);
    assert.equal((await pending).isError,true);await repair;assert.equal(disconnected,true);assert.equal(runtime.state('memory'),'idle');assert.equal(readFileSync(data,'utf8'),'EXAMPLE ONLY persistent memory');
    fixture.market.select('memory',fixture.old.release.version,fixture.root);await runtime.sync();assert.throws(()=>fixture.market.assertSession('EXAMPLE_OLD_SESSION',fixture.root));
    agent.session.id='EXAMPLE_NEW_SESSION';const repaired=await execute(),repairedData=JSON.parse(repaired.value.content[0].text);assert.equal(repairedData.data,data);assert.notEqual(repairedData.boot,before.boot);
    const epoch=fixture.market.active()[0].epoch;await runtime.restart('memory');assert.equal(runtime.state('memory'),'ready');
    const restarted=await execute(),after=JSON.parse(restarted.value.content[0].text);assert.notEqual(after.boot,repairedData.boot);assert.equal(after.data,data);assert.equal(fixture.market.active()[0].epoch,epoch);assert.equal(readFileSync(data,'utf8'),'EXAMPLE ONLY persistent memory');
    unlinkSync(data+'.started');
  }finally{await ctx.fiber.dispose();fixture.dispose();}
});

test('C18: public maintenance codecs accept only fixed program ids, versions and archive references',()=>{
  assert.throws(()=>TYPERT_REMOTE.methods['zhen/mcpRepair'].input({strict:true}).create().parse({id:'memory',version:'../EXAMPLE_ONLY'}));
  assert.throws(()=>TYPERT_REMOTE.methods['zhen/mcpRepair'].input({strict:true}).create().parse({id:'memory',version:'2026.8.31',command:'EXAMPLE_ONLY'}));
  assert.throws(()=>TYPERT_REMOTE.methods['zhen/mcpRestoreArchive'].input({strict:true}).create().parse({archiveId:'../../EXAMPLE_ONLY'}));
  assert.throws(()=>TYPERT_REMOTE.methods['zhen/mcpRestart'].input({strict:true}).create().parse({id:'EXAMPLE_OTHER_SOURCE'}));
});
