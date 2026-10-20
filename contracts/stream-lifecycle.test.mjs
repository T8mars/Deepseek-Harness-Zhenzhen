import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parse} from 'yaml';
import {Context} from '@deepseek-ai/cordis';
import Agents from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Sessions from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import DefaultModel from '@deepseek-ai/dsh-agent-default-model';
import Llm,{createUserMessage} from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';

// The actual published AgentLoop/adapter receives loopback SSE; no live key/API.
async function lifecycle(kind) {
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-stream-life-EXAMPLE-'))),previous=process.env.DSH_HOME;
 process.env.DSH_HOME=root;
 const ctx=new Context(),requests=[],ends=[],errors=[],chunks=[];
 let handle,timer,cancelled=false,close,admit;
 const closed=new Promise(done=>{close=done;});
 const admitted=new Promise(done=>{admit=done;});
 const prefix=kind==='waiting'?'':'EXAMPLE partial answer',maximum=kind==='limit'?16:128;
 const server=createServer((request,response)=>{
  const data=[];request.on('data',value=>data.push(value));request.on('end',()=>{
   requests.push({path:request.url,body:JSON.parse(Buffer.concat(data).toString('utf8')),exampleKey:request.headers.authorization==='Bearer EXAMPLE_LIFECYCLE_ONLY'});
   response.on('close',close);response.writeHead(200,{'content-type':'text/event-stream'});response.flushHeaders();admit();
   if(kind!=='waiting')response.write('data: '+JSON.stringify({choices:[{index:0,delta:{role:'assistant',content:prefix},finish_reason:null}]})+'\n\n');
   if(kind==='limit')response.end('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'length'}],usage:{prompt_tokens:7,completion_tokens:16,total_tokens:23}})+'\n\ndata: [DONE]\n\n');
  });
 });
 try{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  ctx.provide('credentials',{resolve:async ref=>{assert.equal(ref,'SEEDANCE_API_KEY');return{value:'EXAMPLE_LIFECYCLE_ONLY',source:'example'};}});
  for(const plugin of[Sessions,Projections,Agents,Llm,Prompt,Tools])await ctx.plugin(plugin);
  const rows=parse(readFileSync('packages/dsh-zhen/cordis.patch.yml','utf8')),defaults=structuredClone(rows.find(row=>row.id==='agent-default-model').config),config=structuredClone(rows.find(row=>row.id==='llm-pi-ai').config);
  config.providers.seedance.baseURL=`http://127.0.0.1:${server.address().port}/v1`;await ctx.plugin(PiAi,config);await ctx.plugin(DefaultModel,defaults);await ctx.plugin(AgentLoop,{maxParallelToolCalls:1});
  ctx.on('session/event',(_session,event)=>{if(event.type==='turn/end')ends.push(event.data.reason);});ctx.on('agent/error',value=>errors.push(value.error?.code??'UNKNOWN'));
  ctx.on('llm/stream',async function*(options,next){for await(const chunk of next()){chunks.push(chunk.type);yield chunk;if(kind==='cancel'&&chunk.type==='text-delta'&&!cancelled){cancelled=true;handle.agent.cancel({kind:'user'});}}});
  handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:root},agentOptions:{...ctx.agentDefaultModel.currentSelection(),maxTokens:maximum}});
  timer=setTimeout(()=>handle.agent.cancel({kind:'hook',reason:'EXAMPLE_DEADLINE'}),10000);
  handle.agent.followup(createUserMessage({content:[{type:'text',text:'EXAMPLE stream lifecycle check.'}],source:{kind:'user'}}));if(kind==='waiting'){await admitted;cancelled=true;handle.agent.cancel({kind:'user'});}await handle.agent.whenIdle();clearTimeout(timer);
  assert.deepEqual(errors,[]);assert.equal(requests.length,1);assert.equal(requests[0].exampleKey,true);assert.equal(requests[0].path,'/v1/chat/completions');assert.equal(requests[0].body.model,defaults.model);assert.equal(requests[0].body.max_tokens,maximum);assert.equal(requests[0].body.stream,true);assert.equal((requests[0].body.tools??[]).length,0);
  const messages=handle.agent.session.deriveMessages(),last=messages.filter(message=>message.role==='assistant').at(-1);assert.equal(last?.content.filter(block=>block.type==='text').map(block=>block.text).join('')??'',prefix);
  if(kind==='limit')assert.deepEqual(ends,[{kind:'max-tokens'}]);
  else{assert.equal(cancelled,true);assert.deepEqual(ends,[{kind:'aborted',reason:{kind:'user'}}]);await Promise.race([closed,new Promise((_,reject)=>{const wait=setTimeout(()=>reject(Error('EXAMPLE cancelled connection remained open')),2000);wait.unref();})]);}
  if(kind!=='waiting')assert.ok(chunks.includes('text-delta'));const id=handle.agent.id;await handle.dispose();handle=undefined;assert.equal(ctx.agents.get(id),undefined);
 }finally{
  clearTimeout(timer);await handle?.dispose();await ctx.fiber.dispose();await new Promise(done=>{server.close(done);server.closeAllConnections();});if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}

test('C67: actual published AgentLoop reports max-tokens, retains the prefix and does not request continuation',{timeout:15000},()=>lifecycle('limit'));
test('C67: actual published AgentLoop user cancellation retains received text, closes the connection and ends aborted without a replacement request',{timeout:15000},()=>lifecycle('cancel'));
test('C67: actual published AgentLoop exits a request waiting for its first text without fabricating a completed answer or sending another request',{timeout:15000},()=>lifecycle('waiting'));
