import test from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,realpathSync,writeFileSync,readFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join,relative,isAbsolute,resolve}from'node:path';import{execFileSync}from'node:child_process';
import{extractDocumentedModels}from'../packages/dsh-zhen/src/capability-docs.ts';
import{extractSeedanceCatalog}from'../scripts/seedance-catalog.mjs';
import{CapabilityMonitor,readCapabilityCatalog}from'../packages/dsh-zhen/lib/capabilities.js';
import{capabilityCatalogSchema}from'../packages/dsh-zhen/lib/capability-schema.js';
import{exampleChat,exampleModelDocs,reviewedModelDocs,reviewedRegistry}from'./fixtures/capability-docs.mjs';
function temporary(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-doc-model-EXAMPLE-')));t.after(()=>{const actual=realpathSync.native(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-doc-model-EXAMPLE-'));rmSync(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});});return root;}
test('C142: explicit appendix declarations cover fixed protocols without making them executable',()=>{
 const routes=[['image','image-task','/v1/image/generations'],['audio','audio-task','/v1/audio/generations'],['three-d','three-d-task','/v1/3d/generations'],['video','video-task','/v1/videos'],['video','legacy-video-task','/v1/video/generations'],['chat','chat-completions','/v1/chat/completions'],['transcription','transcription','/v1/audio/transcriptions'],['decisions','decisions','/v1/decisions'],['minimax-v2','minimax-v2','/v2/video_generation']];
 const extra=routes.map((row,i)=>'## EXAMPLE appendix '+i+'\n`EXAMPLE_APPENDIX_'+i+'`: POST '+row[2]+'; GET '+row[2]+'/{id}.\n').join(''),items=extractDocumentedModels(exampleModelDocs({extra}));
 for(const[[family,protocol],i]of routes.map((r,i)=>[r,i])){const item=items.find(x=>x.model==='EXAMPLE_APPENDIX_'+i);assert.ok(item);assert.equal(item.family,family);assert.equal(item.protocol,protocol);assert.equal(item.readiness,'observed');assert.equal(item.line,exampleModelDocs({extra}).split('\n').findIndex(x=>x.startsWith('`EXAMPLE_APPENDIX_'+i+'`'))+1);}
 assert.equal(items.every(x=>x.readiness==='observed'),true);
});
test('C142: fenced examples and ordinary prose cannot invent executable or observed model entries',()=>{
 const extra='## EXAMPLE appendix\n```json\n`EXAMPLE_JSON`: POST /v1/image/generations;\n```\n~~~~text\n`EXAMPLE_TILDE`: POST /v1/videos;\n~~~~\nAn example mentions `EXAMPLE_PROSE`, POST /v1/videos.\n`EXAMPLE_REAL`: POST `/v1/image/generations`;\n';
 const items=extractDocumentedModels(exampleModelDocs({extra}));assert.ok(items.some(x=>x.model==='EXAMPLE_REAL'));for(const name of['EXAMPLE_JSON','EXAMPLE_TILDE','EXAMPLE_PROSE'])assert.equal(items.some(x=>x.model===name),false);
});
test('C142: unknown endpoints and contradictory identities refuse instead of guessing a route',()=>{
 for(const extra of['## EXAMPLE\n`EXAMPLE_UNKNOWN`: POST /v9/unknown;','## EXAMPLE\n`EXAMPLE_BASE_IMAGE`: POST /v1/videos;','## EXAMPLE\n`EXAMPLE<script>`: POST /v1/videos;'])assert.throws(()=>extractDocumentedModels(exampleModelDocs({extra})));
 const docs=exampleModelDocs({extra:'## EXAMPLE\n`EXAMPLE_REPEAT`: POST /v1/videos;\n`EXAMPLE_REPEAT`: POST /v1/videos;\n'});assert.equal(extractDocumentedModels(docs).filter(x=>x.model==='EXAMPLE_REPEAT').length,1);
});
test('C142: required prose anchors, complete fences and distinct chat ids are validated',()=>{
 for(const docs of[exampleModelDocs().replace('## 模型列表','## EXAMPLE_REMOVED'),exampleModelDocs().replace('# MiniMax-H3 API','## EXAMPLE_REMOVED'),exampleModelDocs({extra:'```json\nEXAMPLE unclosed'}),exampleModelDocs({chat:[...exampleChat.slice(0,9),exampleChat[0]]})])assert.throws(()=>extractDocumentedModels(docs));
 const forged='```text\nPOST /v1/chat/completions models `deepseek/deepseek-v4.1-flash`\n```\n'+exampleModelDocs();assert.equal(extractDocumentedModels(forged).filter(x=>x.family==='chat').length,10);
});
test('C142: model metadata and source limits are explicit without returning partial inventories',()=>{
 assert.throws(()=>extractDocumentedModels('EXAMPLE'.repeat(700000)));
 assert.throws(()=>extractDocumentedModels(exampleModelDocs({extra:'## EXAMPLE\n`'+'EXAMPLE'.repeat(25)+'`: POST /v1/videos;'})));
 assert.throws(()=>extractDocumentedModels(exampleModelDocs({extra:'## '+'EXAMPLE'.repeat(40)+'\n`EXAMPLE_MODEL`: POST /v1/videos;'})));
 assert.throws(()=>extractDocumentedModels(exampleModelDocs({extra:Array.from({length:1001},(_,i)=>'`EXAMPLE_'+i+'`: POST /v1/videos;').join('\n')})));
});
test('C142: the real Node catalog command shares appendix extraction and writes schema-valid metadata only',t=>{
 const root=temporary(t),docs=join(root,'EXAMPLE_docs.txt'),music=join(root,'EXAMPLE_music.json'),mj=join(root,'EXAMPLE_mj.json'),output=join(root,'EXAMPLE_catalog.json');
 writeFileSync(docs,exampleModelDocs({extra:'## EXAMPLE appendix\n`EXAMPLE_APPENDIX`: POST /v1/image/generations;\n'}));for(const path of[music,mj])writeFileSync(path,JSON.stringify({success:true,data:[]}));
 const result=JSON.parse(execFileSync(process.execPath,[resolve('scripts/seedance-catalog.mjs'),docs,music,mj,output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:20000,stdio:['ignore','pipe','pipe']}));assert.ok(result.models>10);const catalog=capabilityCatalogSchema.parse(JSON.parse(readFileSync(output,'utf8')));assert.equal(catalog.items.find(x=>x.model==='EXAMPLE_APPENDIX').readiness,'observed');assert.equal(catalog.items.find(x=>x.model===exampleChat[0]).readiness,'configured');
 console.log(JSON.stringify({contract:'C142',actualNodeCatalogCommand:true,sharedDocumentationExtractor:true,appendixModelsIncluded:true,protocolsDistinct:true,examplesNotInterpreted:true,observationsNotExecutable:true,credentialReads:0,nativeRequests:0,modelRequests:0}));
});
function monitorFixture(t){
 const root=temporary(t),catalog=readCapabilityCatalog(),file=join(root,'sources.json');let docs=reviewedModelDocs(catalog),calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);assert.equal(new URL(url).origin,'https://api.seedance.nz');return new Response(url.endsWith('llms.txt')?docs:reviewedRegistry(catalog,url.includes('midjourney')?'midjourney':'music'));};
 return{root,catalog,file,monitor:new CapabilityMonitor(file,catalog,fetcher),calls:()=>calls,setDocs:value=>{docs=value;}};
}
test('C143: model additions, removals and protocol changes are precise, single-flight and leave reviewed routing untouched',async t=>{
 const f=monitorFixture(t),before=structuredClone(f.catalog),initial=await f.monitor.check(),clean=initial.sources.find(x=>x.id==='docs');assert.equal(clean.state,'checked');assert.deepEqual(clean.added,[]);assert.deepEqual(clean.removed,[]);assert.deepEqual(clean.modified,[]);
 f.setDocs(reviewedModelDocs(f.catalog,{removed:['zhenzhen/gm-4-argon'],moved:[{model:'moss-image',route:'/v1/videos'}],extra:'## EXAMPLE future\n`EXAMPLE_NEW_IMAGE`: POST /v1/image/generations;\n'}));const calls=f.calls(),[first,second]=await Promise.all([f.monitor.check(),f.monitor.check()]);assert.deepEqual(first,second);assert.equal(f.calls()-calls,3);const changed=first.sources.find(x=>x.id==='docs');assert.equal(changed.state,'checked');assert.equal(changed.changed,true);assert.deepEqual(changed.added,['model/EXAMPLE_NEW_IMAGE']);assert.deepEqual(changed.removed,['model/zhenzhen/gm-4-argon']);assert.deepEqual(changed.modified,['model/moss-image']);assert.deepEqual(f.catalog,before);
 assert.deepEqual(new CapabilityMonitor(f.file,f.catalog).snapshot(),first);
 console.log(JSON.stringify({contract:'C143',actualHostMonitor:true,exactAddedRemovedModifiedModels:true,sharedMetadataParser:true,singleFlight:true,reviewedCatalogUnchanged:true,observedModelsNotInstalled:true,persistedFactsOnly:true,nativeRequests:0,modelRequests:0}));
});
test('C143: source line movement alone is not a semantic model modification',async t=>{
 const f=monitorFixture(t);f.setDocs('\n\nEXAMPLE harmless prose\n'+reviewedModelDocs(f.catalog));const source=(await f.monitor.check()).sources.find(x=>x.id==='docs');assert.equal(source.state,'checked');assert.deepEqual(source.modified,[]);assert.deepEqual(source.added,[]);assert.deepEqual(source.removed,[]);
});
test('C143: unsupported documentation fails only that source and cancellation preserves the prior snapshot',async t=>{
 const f=monitorFixture(t);await f.monitor.check();f.setDocs(reviewedModelDocs(f.catalog,{extra:'## EXAMPLE\n`EXAMPLE_UNKNOWN`: POST /v9/unreviewed;'}));const result=await f.monitor.check();assert.equal(result.sources.find(x=>x.id==='docs').state,'unavailable');assert.ok(result.sources.filter(x=>x.id!=='docs').every(x=>x.state==='checked'));
 const before=readFileSync(f.file);await f.monitor.check(AbortSignal.abort());assert.deepEqual(readFileSync(f.file),before);assert.equal(before.toString().includes('/v9/unreviewed'),false);
});
test('C143: oversized model differences are unavailable rather than silently truncated or applied',async t=>{
 const f=monitorFixture(t);f.setDocs(reviewedModelDocs(f.catalog,{extra:'## EXAMPLE many\n'+Array.from({length:201},(_,i)=>'`EXAMPLE_NEW_'+i+'`: POST /v1/image/generations;').join('\n')}));const result=(await f.monitor.check()).sources.find(x=>x.id==='docs');assert.equal(result.state,'unavailable');assert.deepEqual(result.added,[]);assert.equal(f.catalog.items.some(x=>x.model.startsWith('EXAMPLE_NEW_')),false);
});
