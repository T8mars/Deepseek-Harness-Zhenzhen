import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {deflateSync} from 'node:zlib';
import {createServer} from 'node:http';
import {parse} from 'yaml';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime,{BlockAssembler} from '@deepseek-ai/dsh-llm';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';

// Independently reviewed from the pinned public docs. No inference from names.
const imageModels=['deepseek/deepseek-v4.1-flash','deepseek/deepseek-v4-flash-vision-exp','glm/glm-5.3-flash','qwen/qwen3.8-omni-flash','qwen/qwen3.8-flash-next','zhenzhen/gk-4.6','zhenzhen/g6-astra','zhenzhen/g6-sol','zhenzhen/g6-luna','zhenzhen/g5.6-sol','zhenzhen/g5.6-terra','zhenzhen/g5.6-luna','zhenzhen/g5.5','zhenzhen/gm-3.8-flash','zhenzhen-op-5.5'];
const textModels=['glm-5.3','qwen/qwen3.8-max','kimi-k3'];
const patch=parse(readFileSync('packages/dsh-zhen/cordis.patch.yml','utf8'));
function png(red){
 const chunk=(tag,data)=>{const name=Buffer.from(tag),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);let crc=0xffffffff;for(const byte of Buffer.concat([name,data])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,name,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
 const rows=Buffer.from([0,red,40,120,255,red,40,120,255,0,red,40,120,255,red,40,120,255]);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
async function fixture(t,attachments=true){
 const home=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-images-EXAMPLE-'))),ctx=new Context(),requests=[];
 const server=createServer((request,response)=>{const parts=[];request.on('data',data=>parts.push(data));request.on('end',()=>{requests.push({path:request.url,authenticated:request.headers.authorization==='Bearer EXAMPLE_IMAGE_TEST_ONLY',body:JSON.parse(Buffer.concat(parts).toString('utf8'))});response.writeHead(200,{'content-type':'text/event-stream'});response.end('data: '+JSON.stringify({choices:[{index:0,delta:{role:'assistant',content:'EXAMPLE_ONLY_REPLY'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');});});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>{await ctx.fiber.dispose();await new Promise(done=>{server.close(done);server.closeAllConnections();});const part=relative(realpathSync.native(tmpdir()),home);assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(home,{recursive:true,force:true});});
 ctx.provide('credentials',{resolve:async ref=>{assert.equal(ref,'SEEDANCE_API_KEY');return {value:'EXAMPLE_IMAGE_TEST_ONLY',source:'example'};}});
 await ctx.plugin(LlmRuntime);if(attachments)await ctx.plugin(LocalAttachments,{dshHome:home});
 const config=structuredClone(patch.find(row=>row.id==='llm-pi-ai').config);config.providers.seedance.baseURL=`http://127.0.0.1:${server.address().port}/v1`;await ctx.plugin(PiAi,config);
 const stream=async(model,content)=>{const blocks=new BlockAssembler();for await(const chunk of ctx.llm.stream({provider:'seedance',model,messages:[{role:'user',content}]}))blocks.push(chunk);return blocks.finish;};
 return {ctx,requests,stream};
}

test('C37: published model discovery advertises images only for the 15 explicitly documented routes',async t=>{
 const h=await fixture(t),models=await h.ctx.llm.listModels('seedance');
 assert.deepEqual(models.filter(model=>model.inputModalities.includes('image')).map(model=>model.id).sort(),[...imageModels].sort());
 assert.deepEqual(models.filter(model=>!model.inputModalities.includes('image')).map(model=>model.id).sort(),[...textModels].sort());
 assert.equal(h.requests.length,0);assert.equal(patch.find(row=>row.id==='agent-default-model').config.model,imageModels[0]);
});

test('C37: actual durable attachments become ordered inline request images for all documented image routes',async t=>{
 const h=await fixture(t),refs=[];for(const red of [60,180])refs.push(await h.ctx.attachments.saveImage({data:png(red),mediaType:'image/png',name:'EXAMPLE_reference.png'}));
 for(const model of imageModels){
  const content=[{type:'text',text:'EXAMPLE_BEFORE'},{type:'image',attachment:refs[0]},{type:'text',text:'EXAMPLE_BETWEEN'},{type:'image',attachment:refs[1]},{type:'text',text:'EXAMPLE_AFTER'}];
  assert.equal((await h.stream(model,content)).kind,'stop');const request=h.requests.at(-1);assert.equal(request.path,'/v1/chat/completions');assert.equal(request.authenticated,true);assert.equal(request.body.model,model);assert.equal(request.body.max_tokens,4096);
  const sent=request.body.messages.find(item=>item.role==='user').content;assert.ok(Array.isArray(sent),'images must reach the wire as structured content');const images=sent.filter(part=>part.type==='image_url');assert.equal(images.length,2);
  for(let i=0;i<refs.length;i++){const expected=await h.ctx.attachments.readImageRequest(refs[i],h.ctx.llm.imageRequestTarget('seedance',model,refs[i]));assert.equal(images[i].image_url.url,`data:${expected.mediaType};base64,${Buffer.from(expected.data).toString('base64')}`);}
  const before=sent.findIndex(x=>x.text==='EXAMPLE_BEFORE'),middle=sent.findIndex(x=>x.text==='EXAMPLE_BETWEEN'),after=sent.findIndex(x=>x.text==='EXAMPLE_AFTER'),positions=sent.flatMap((x,i)=>x.type==='image_url'?[i]:[]);assert.ok(before<positions[0]&&positions[0]<middle&&middle<positions[1]&&positions[1]<after);
 }
 assert.equal(h.requests.length,15);
});

test('C37: text routes send placeholders only; missing attachment storage and nonexistent image references send no image request',async t=>{
 const h=await fixture(t),ref=await h.ctx.attachments.saveImage({data:png(60),mediaType:'image/png'}),content=[{type:'image',attachment:ref}];
 for(const model of textModels){assert.equal((await h.stream(model,content)).kind,'stop');assert.equal(JSON.stringify(h.requests.at(-1).body.messages).includes('data:image/'),false);}
 assert.equal(h.requests.length,3);assert.equal((await h.stream(imageModels[0],[{type:'image',attachment:{...ref,attachmentId:'e'.repeat(64)}}])).kind,'error');assert.equal(h.requests.length,3);
 const missing=await fixture(t,false);assert.equal((await missing.stream(imageModels[0],content)).failure.code,'UNSUPPORTED_CONTENT');assert.equal(missing.requests.length,0);
});
