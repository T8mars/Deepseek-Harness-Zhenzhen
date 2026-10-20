import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';import {join,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';import SystemPrompt from '@deepseek-ai/dsh-system-prompt';import ToolRuntime from '@deepseek-ai/dsh-tools';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';import {createRagTool} from '../packages/dsh-zhen/lib/rag-tool.js';
test('C38: published ToolRuntime question retrieval retains exact workspace/Seedance consent, citations and post-revocation blocking with zero credential reads',async()=>{
 const home=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-rag-question-contract-EXAMPLE-'))),docs=join(home,'EXAMPLE_DOCS'),ctx=new Context(),store=new KnowledgeStore(join(home,'knowledge.sqlite'));mkdirSync(docs);let credentials=0;
 ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('No credential read allowed.');}});
 try{writeFileSync(join(docs,'EXAMPLE_CHARACTER.md'),'EXAMPLE_ONLY\n蓝桥角色的动机是守住钟楼。场景从信任转为怀疑，发生转折。');const collection=await store.create('EXAMPLE_PROJECT','示例资料',docs);await store.index('EXAMPLE_PROJECT',collection.id);await store.bind('EXAMPLE_PROJECT',home);store.setAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',collection.id,true);
  await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);const tool=createRagTool(()=>store,async()=>({sessionId:'EXAMPLE_SESSION',provider:'seedance',directory:home}));ctx.tools.register(tool);
  const execute=()=>ctx.tools.execute({callId:'EXAMPLE_QUESTION_CALL',name:tool.name,arguments:{query:'如何用蓝桥角色的动机推动场景转折？'},signal:new AbortController().signal});
  const result=await execute();assert.equal(result.isError,false);assert.equal(result.value.hits.length,1);const hit=result.value.hits[0];assert.equal(hit.path,'EXAMPLE_CHARACTER.md');assert.match(hit.text,/动机/);assert.equal(store.source('EXAMPLE_PROJECT',hit.id,hit.epoch).anchorId,hit.id);
  store.setAgentAccess('EXAMPLE_PROJECT',collection.id,false);assert.equal((await execute()).isError,true);assert.equal(credentials,0);
 }finally{await ctx.fiber.dispose();store.close();const part=relative(realpathSync.native(tmpdir()),home);assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(home,{recursive:true,force:true});}
});
