import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,readFileSync,realpathSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join,relative,isAbsolute}from'node:path';import{randomUUID}from'node:crypto';import{parse}from'yaml';
import{Context}from'@deepseek-ai/cordis';import Agents from'@deepseek-ai/dsh-agent';import AgentLoop from'@deepseek-ai/dsh-agent-loop';import Sessions from'@deepseek-ai/dsh-session';import Projections from'@deepseek-ai/dsh-session-projection';import DefaultModel from'@deepseek-ai/dsh-agent-default-model';import Llm,{LlmAdapter,createUserMessage}from'@deepseek-ai/dsh-llm';import Prompt from'@deepseek-ai/dsh-system-prompt';import Tools,{defineTool}from'@deepseek-ai/dsh-tools';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import {createServer} from 'node:http';
import {deflateSync} from 'node:zlib';
test('C59: published AgentLoop drives scoped file tool/result and normal completion using the bundle default-model service',{timeout:15000},async()=>{
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-agent-loop-EXAMPLE-'))),file=join(root,'EXAMPLE_NOTE.txt'),contents='EXAMPLE_ONLY_CONFIRMATION_VALUE=17\n';writeFileSync(file,contents);const previous=process.env.DSH_HOME;process.env.DSH_HOME=root;const ctx=new Context(),defaults=parse(readFileSync('packages/dsh-zhen/cordis.patch.yml','utf8')).find(x=>x.id==='agent-default-model').config;let handle,timer,calls=0,reads=0,sawToolResult=false;const ends=[],failures=[];
 class ExampleAdapter extends LlmAdapter{async*stream(options){calls++;assert.equal(options.provider,defaults.provider);assert.equal(options.model,defaults.model);assert.ok(options.tools.some(x=>x.name==='read_example_note'));
  if(calls===1){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id:'EXAMPLE_READ_CALL',name:'read_example_note',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'EXAMPLE_READ_CALL',name:'read_example_note',arguments:'{}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}
  else{assert.equal(calls,2);sawToolResult=options.messages.some(message=>message.role==='tool'&&message.content.some(block=>block.type==='text'&&block.text===contents));assert.equal(sawToolResult,true);yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:'17'};yield{type:'block-end',index:0,block:{type:'text',text:'17'}};yield{type:'finish',reason:{kind:'stop'}};}
 }}
 try{
  for(const plugin of[Sessions,Projections,Agents,Llm,Prompt,Tools])await ctx.plugin(plugin);ctx.llm.registerAdapter([defaults.provider],new ExampleAdapter());await ctx.plugin(DefaultModel,structuredClone(defaults));await ctx.plugin(AgentLoop,{maxParallelToolCalls:1});
  ctx.on('session/event',(_session,event)=>{if(event.type==='turn/end')ends.push(event.data.reason.kind);});ctx.on('agent/error',payload=>{failures.push(payload.error?.code??'UNAVAILABLE');});
  const selection=ctx.agentDefaultModel.currentSelection();assert.equal(selection.provider,'seedance');assert.equal(selection.model,'deepseek/deepseek-v4.1-flash');
  handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:root},agentOptions:{...selection,maxTokens:512},setup(agentCtx){agentCtx.tools.register(defineTool({name:'read_example_note',description:'Read the fixed EXAMPLE note.',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},async execute(){assert.equal(reads,0);reads++;return readFileSync(file,'utf8');}}));}});
  assert.equal(handle.agent.ctx.tools.schemas().some(x=>x.name==='read_example_note'),false,'omitting ScopeKey reads the global view');assert.equal(handle.agent.ctx.tools.schemas(handle.agent).some(x=>x.name==='read_example_note'),true);
  timer=setTimeout(()=>handle.agent.cancel({kind:'hook',reason:'EXAMPLE_DEADLINE'}),10000);handle.agent.followup(createUserMessage({content:[{type:'text',text:'EXAMPLE：请读取测试文件校验数字。'}],source:{kind:'user'}}));await handle.agent.whenIdle();clearTimeout(timer);
  assert.deepEqual(failures,[]);assert.deepEqual(ends,['completed']);assert.equal(calls,2);assert.equal(reads,1);assert.equal(sawToolResult,true);const last=handle.agent.session.deriveMessages().filter(x=>x.role==='assistant').at(-1);assert.equal(last.content.filter(x=>x.type==='text').map(x=>x.text).join(''),'17');assert.equal(readFileSync(file,'utf8'),contents);
  const id=handle.agent.id;await handle.dispose();handle=undefined;assert.equal(ctx.agents.get(id),undefined);
 }finally{clearTimeout(timer);await handle?.dispose();await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});

test('C60: published AgentLoop preserves the default-model durable image through the actual pi-ai wire', {timeout: 15000}, async () => {
 const base = realpathSync.native(tmpdir());
 const root = realpathSync.native(mkdtempSync(join(base, 'dsh-agent-image-EXAMPLE-')));
 const previous = process.env.DSH_HOME;
 const ctx = new Context(), requests = [], ends = [], failures = [];
 let handle, timer;
 process.env.DSH_HOME = root;
 const server = createServer((request, response) => {
  const parts = [];
  request.on('data', data => parts.push(data));
  request.on('end', () => {
   requests.push({path: request.url, exampleCredential: request.headers.authorization === 'Bearer EXAMPLE_IMAGE_ONLY', body: JSON.parse(Buffer.concat(parts).toString('utf8'))});
   response.writeHead(200, {'content-type': 'text/event-stream'});
   response.end('data: ' + JSON.stringify({choices: [{index: 0, delta: {role: 'assistant', content: 'EXAMPLE_IMAGE_ROUTE_ACCEPTED'}, finish_reason: null}]}) + '\n\ndata: ' + JSON.stringify({choices: [{index: 0, delta: {}, finish_reason: 'stop'}]}) + '\n\ndata: [DONE]\n\n');
  });
 });
 try {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  ctx.provide('credentials', {resolve: async ref => {
   assert.equal(ref, 'SEEDANCE_API_KEY');
   return {value: 'EXAMPLE_IMAGE_ONLY', source: 'example'};
  }});
  for (const plugin of [Sessions, Projections, Agents, Llm, Prompt, Tools]) await ctx.plugin(plugin);
  await ctx.plugin(LocalAttachments, {dshHome: root});
  const rows = parse(readFileSync('packages/dsh-zhen/cordis.patch.yml', 'utf8'));
  const defaults = structuredClone(rows.find(row => row.id === 'agent-default-model').config);
  const config = structuredClone(rows.find(row => row.id === 'llm-pi-ai').config);
  config.providers.seedance.baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  await ctx.plugin(PiAi, config);
  await ctx.plugin(DefaultModel, defaults);
  await ctx.plugin(AgentLoop, {maxParallelToolCalls: 1});
  const chunk = (tag, data) => {
   const name = Buffer.from(tag), length = Buffer.alloc(4), sum = Buffer.alloc(4);
   length.writeUInt32BE(data.length);
   let crc = 0xffffffff;
   for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
   }
   sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
   return Buffer.concat([length, name, data, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  const image = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0,220,20,30,20,60,220,0,20,160,60,230,200,20]))), chunk('IEND', Buffer.alloc(0))]);
  const ref = await ctx.attachments.saveImage({data: image, mediaType: 'image/png', name: 'EXAMPLE_pixels.png'});
  const projection = await ctx.attachments.readImageRequest(ref, ctx.llm.imageRequestTarget(defaults.provider, defaults.model, ref));
  ctx.on('session/event', (_session, event) => {if (event.type === 'turn/end') ends.push(event.data.reason.kind);});
  ctx.on('agent/error', payload => failures.push(payload.error?.code ?? 'UNAVAILABLE'));
  const selection = ctx.agentDefaultModel.currentSelection();
  assert.equal(selection.provider, 'seedance');
  assert.equal(selection.model, 'deepseek/deepseek-v4.1-flash');
  handle = await ctx.agents.create({sessionId: randomUUID(), meta: {cwd: root}, agentOptions: {...selection, maxTokens: 96}});
  timer = setTimeout(() => handle.agent.cancel({kind: 'hook', reason: 'EXAMPLE_DEADLINE'}), 10000);
  handle.agent.followup(createUserMessage({content: [{type: 'text', text: 'EXAMPLE image protocol check.'}, {type: 'image', attachment: ref}], source: {kind: 'user'}}));
  await handle.agent.whenIdle();
  clearTimeout(timer);
  assert.deepEqual(failures, []);
  assert.deepEqual(ends, ['completed']);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.path, '/v1/chat/completions');
  assert.equal(request.exampleCredential, true);
  assert.equal(request.body.model, selection.model);
  assert.equal(request.body.max_tokens, 96);
  const images = request.body.messages.filter(message => message.role === 'user').flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'image_url');
  assert.equal(images.length, 1);
  assert.equal(images[0].image_url.url, `data:${projection.mediaType};base64,${Buffer.from(projection.data).toString('base64')}`);
  assert.equal(handle.agent.session.deriveMessages().filter(message => message.role === 'assistant').at(-1).content.find(block => block.type === 'text').text, 'EXAMPLE_IMAGE_ROUTE_ACCEPTED');
 } finally {
  clearTimeout(timer);
  await handle?.dispose();
  await ctx.fiber.dispose();
  await new Promise(done => {server.close(done); server.closeAllConnections();});
  if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  const part = relative(base, realpathSync.native(root));
  assert.ok(part && !isAbsolute(part) && !part.startsWith('..') && !part.includes('/') && !part.includes('\\'));
  rmSync(root, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
 }
});
