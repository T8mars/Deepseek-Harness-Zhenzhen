import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,rm,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute,join,relative} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';
import {McpMarket} from '../packages/dsh-zhen/lib/mcp-market.js';
import {fixtureInstallation} from './fixtures/mcp-market.mjs';

async function fixture(t,kind,{warm=false,valid=false}={}){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-home-grants-EXAMPLE-'))),home=join(root,'home'),other=join(root,'other'),docs=join(root,'docs'),session='EXAMPLE_SESSION',ctx=new Context(),previous=process.env.DSH_HOME;let calls=0;
  for(const path of [home,other,docs])await mkdir(path);process.env.DSH_HOME=home;
  t.after(async()=>{try{await ctx.fiber.dispose();}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-home-grants-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
  const ledger=kind==='rag'?join(home,'dsh-zhen','knowledge.sqlite'):join(home,'dsh-zhen','mcp','session-grants.sqlite');
  if(kind==='rag'){
    const store=new KnowledgeStore(ledger);try{await writeFile(join(docs,'EXAMPLE.txt'),'EXAMPLE ONLY 示例纸灯');const collection=await store.create('EXAMPLE_PROJECT','EXAMPLE',docs);await store.index('EXAMPLE_PROJECT',collection.id);await store.bind('EXAMPLE_PROJECT',docs);store.setAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',collection.id,true);await store.retrieveForAgent(session,'seedance',docs,'纸灯');if(!valid)store.setAgentAccess('EXAMPLE_PROJECT',collection.id,false);}finally{store.close();}
  }else{
    const directory=join(home,'dsh-zhen','mcp');if(valid)fixtureInstallation(directory);const market=new McpMarket(directory);try{if(valid){market.select('memory','2026.8.31',docs);market.grant(session,'memory');}else{const raw=new DatabaseSync(ledger);try{raw.prepare('INSERT INTO grants VALUES(?,?,?)').run(session,'memory',1);}finally{raw.close();}}}finally{market.close();}
  }
  class ExampleAdapter extends LlmAdapter{async*stream(){calls++;}}
  ctx.provide('credentials',{});ctx.provide('agents',{get:id=>({session:{id},options:{provider:'seedance'}})});ctx.provide('workingDirectory',{ensure:async()=>docs});await ctx.plugin(LlmRuntime);ctx.llm.registerAdapter(['seedance'],new ExampleAdapter());await ctx.plugin(ZhenService);const service=ctx.get('zhen');if(warm){if(kind==='rag')service.knowledgeCollections('EXAMPLE_PROJECT');else service.mcpSnapshot();}
  const prepared=await ctx.llm.prepareCall({provider:'seedance',model:'EXAMPLE_ONLY_MODEL'},new AbortController().signal),stream=async(cached=false,id=session)=>{const options={provider:'seedance',model:'EXAMPLE_ONLY_MODEL',sessionId:id,messages:[]};for await(const _ of cached?prepared.stream({...prepared.config,...options}):ctx.llm.stream(options)){};};
  return {root,home,other,docs,ledger,ctx,service,stream,calls:()=>calls,changed:()=>{process.env.DSH_HOME=other;},refused:error=>kind==='rag'?/授权/.test(error.message):/MCP/.test(error.message)};
}

for(const kind of ['rag','mcp'])for(const warm of [false,true])for(const cached of [false,true])test(`C98: ${kind} ${warm?'warm':'cold'} ${cached?'prepared':'direct'} stream retains old grant denial after ambient home drift`,async t=>{
  const f=await fixture(t,kind,{warm});f.changed();await assert.rejects(f.stream(cached),f.refused);assert.equal(f.calls(),0);assert.equal(existsSync(join(f.other,'dsh-zhen',kind==='rag'?'knowledge.sqlite':'mcp/session-grants.sqlite')),false);await f.stream(false,'EXAMPLE_FRESH_WITHOUT_GRANTS');assert.equal(f.calls(),1);console.log(JSON.stringify({contract:'C98',kind,warm,cached,homeDrift:true,oldGrantBlocked:true,freshSessionAllowed:true,preparedCallNotReused:true,modelRequests:0,nativeWrites:0}));
});
for(const kind of ['rag','mcp'])test(`C98: ${kind} valid current grant still reaches the configured adapter through both stream entrypoints`,async t=>{
  const f=await fixture(t,kind,{valid:true});f.changed();await f.stream();await f.stream(true);assert.equal(f.calls(),2);
});
for(const kind of ['rag','mcp'])test(`C98: ${kind} OS refuses ledger rename or an existing handle retains historical denial`,async t=>{
  const f=await fixture(t,kind,{warm:true});let moved=false;try{await rename(f.ledger,f.ledger+'.EXAMPLE_MOVED');moved=true;}catch(error){assert.equal(process.platform,'win32');assert.ok(['EPERM','EACCES','EBUSY'].includes(error.code));}
  await assert.rejects(f.stream());await assert.rejects(f.stream(true));assert.equal(f.calls(),0);console.log(JSON.stringify({contract:'C98',kind,ledgerMoved:moved,operatingSystemRefusedRename:!moved,historicalDenialRetained:true,syntheticAdapterCalls:0,modelRequests:0,nativeWrites:0}));
});
