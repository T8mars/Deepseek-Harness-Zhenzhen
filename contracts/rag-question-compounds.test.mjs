import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';
import {createRagTool} from '../packages/dsh-zhen/lib/rag-tool.js';

test('C41: published ToolRuntime compound retrieval excludes scattered characters and retains current grant, source and workspace boundaries',async()=>{
 const base=realpathSync.native(tmpdir()),home=realpathSync.native(mkdtempSync(join(base,'dsh-compound-contract-EXAMPLE-'))),docs=join(home,'EXAMPLE_DOCS'),ctx=new Context(),store=new KnowledgeStore(join(home,'EXAMPLE.sqlite'));mkdirSync(docs);let credentials=0;
 ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_CREDENTIAL_READ');}});
 try{
  writeFileSync(join(docs,'EXAMPLE_MATCH.md'),'EXAMPLE ONLY\n双轨制的安排用于节奏点。');
  writeFileSync(join(docs,'EXAMPLE_SCATTERED.md'),'EXAMPLE ONLY\n双轨灯单独亮起，系统另有制动方式。安排节奏时，圆点只作记录。');
  const collection=await store.create('EXAMPLE_PROJECT','示例资料',docs);await store.index('EXAMPLE_PROJECT',collection.id);await store.bind('EXAMPLE_PROJECT',home);store.setAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');
  await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);let directory=home;
  const tool=createRagTool(()=>store,async()=>({sessionId:'EXAMPLE_SESSION',provider:'seedance',directory}));ctx.tools.register(tool);
  const execute=()=>ctx.tools.execute({callId:'EXAMPLE_COMPOUND_CALL',name:tool.name,arguments:{query:'如何用双轨制安排节奏点？'},signal:new AbortController().signal});
  assert.deepEqual((await execute()).value.hits,[]);
  store.setAgentAccess('EXAMPLE_PROJECT',collection.id,true);
  const result=await execute();assert.equal(result.isError,false);assert.deepEqual(result.value.hits.map(h=>h.path),['EXAMPLE_MATCH.md']);
  const hit=result.value.hits[0];assert.equal(hit.line,1);assert.equal(store.source('EXAMPLE_PROJECT',hit.id,hit.epoch).sections.find(s=>s.id===hit.id).text,hit.text);
  directory=docs;assert.equal((await execute()).isError,true);directory=home;
  store.setAgentAccess('EXAMPLE_PROJECT',collection.id,false);assert.equal((await execute()).isError,true);assert.equal(credentials,0);
 }finally{await ctx.fiber.dispose();store.close();const part=relative(base,realpathSync.native(home));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(home,{recursive:true,force:true});}
});
