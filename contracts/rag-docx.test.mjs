import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Context} from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE,ragPresentationSchema} from '../packages/dsh-zhen/lib/remote.js';
import {exampleDocx} from './fixtures/docx-document.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);

test('C51: published Host/Gateway/ToolRuntime index DOCX body and preserve extracted-line citations and revocation',async()=>{
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-docx-contract-EXAMPLE-'))),docs=join(root,'EXAMPLE_DOCS'),workspace=join(root,'EXAMPLE_WORKSPACE');mkdirSync(docs);mkdirSync(workspace);writeFileSync(join(docs,'EXAMPLE.docx'),exampleDocx('<w:p><w:r><w:t>EXAMPLE ONLY 示例角色蓝桥。</w:t></w:r></w:p><w:p><w:r><w:t>EXAMPLE ONLY 示例雨夜古桥。 &lt;script&gt;EXAMPLE_UNTRUSTED_TEXT&lt;/script&gt;</w:t></w:r></w:p>'));writeFileSync(join(docs,'EXAMPLE_EMPTY.docx'),exampleDocx(''));writeFileSync(join(docs,'EXAMPLE_INVALID.docx'),Buffer.from('PK\x03\x04EXAMPLE_INVALID'));const originalHash=createHash('sha256').update(readFileSync(join(docs,'EXAMPLE.docx'))).digest('hex');
 const beforeHome=process.env.DSH_HOME,beforeFetch=globalThis.fetch;process.env.DSH_HOME=join(root,'EXAMPLE_HOME');const ctx=new Context(),signal=new AbortController();let credentials=0,network=0;
 ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_SECRET');}});ctx.provide('workingDirectory',{ensure:async()=>workspace});globalThis.fetch=async()=>{network++;throw Error('EXAMPLE_OFFLINE');};
 try{
  await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
  const peer={id:'EXAMPLE_DOCX_OWNER',ctx,principal:{kind:'owner'},signal:signal.signal,interactions:'none',dispose:async()=>{}};
  const call=async(method,args,principal=peer.principal)=>{const value=await ctx.typertGateway.invoke({namespace:'zhen',method,args:JSON.parse(JSON.stringify(args)),peer:{...peer,principal}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(value===undefined?undefined:JSON.parse(JSON.stringify(value)));};
  const collection=await call('createKnowledge',{project:'EXAMPLE_PROJECT',name:'示例Word资料',folder:docs});assert.deepEqual(await call('indexKnowledge',{project:'EXAMPLE_PROJECT',collectionId:collection.id}),{indexed:1,skipped:1,failed:1});assert.equal(createHash('sha256').update(readFileSync(join(docs,'EXAMPLE.docx'))).digest('hex'),originalHash);
  const local=(await call('searchKnowledge',{project:'EXAMPLE_PROJECT',query:'雨夜古桥'}))[0];assert.equal(local.page,undefined);assert.equal((await call('knowledgeSource',{project:'EXAMPLE_PROJECT',hitId:local.id,epoch:local.epoch})).sections.find(x=>x.id===local.id).page,undefined);await assert.rejects(call('knowledgeSource',{project:'EXAMPLE_PROJECT',hitId:local.id,epoch:local.epoch},{kind:'anonymous'}));
  await call('bindKnowledge',{project:'EXAMPLE_PROJECT',directory:workspace});await call('setKnowledgeAccess',{project:'EXAMPLE_PROJECT',collectionId:collection.id,enabled:true,cloudProvider:'seedance'});await call('setKnowledgeAgentAccess',{project:'EXAMPLE_PROJECT',collectionId:collection.id,enabled:true});
  const agent={session:{id:'EXAMPLE_DOCX_SESSION'},options:{provider:'seedance'}},run=(name,args,caller=agent)=>ctx.tools.execute({callId:'EXAMPLE_DOCX_'+name,name,arguments:args,agent:caller,signal:signal.signal});
  const search=await run('zhen_rag_search',{query:'雨夜古桥'});assert.equal(search.isError,false,JSON.stringify(search.content));const hit=search.value.hits[0];assert.equal(hit.page,undefined);assert.equal(ragPresentationSchema.parse(JSON.parse(JSON.stringify(search.meta))).hits[0].page,undefined);
  const source=await run('zhen_rag_open',{id:hit.id,epoch:hit.epoch});assert.equal(source.isError,false);assert.equal(source.value.source.sections.find(x=>x.id===hit.id).page,undefined);assert.equal((await call('knowledgeCitation',{project:'EXAMPLE_PROJECT',hitId:hit.id,epoch:hit.epoch,provider:'seedance'})).page,undefined);
  const display=join(root,'EXAMPLE_DOCX_VIEW.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/RagSources.tsx')],outfile:display,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:require.resolve('react'),'react/jsx-runtime':require.resolve('react/jsx-runtime'),zod:require.resolve('zod'),'@deepseek-ai/dsh-typert-protocol/remote-info':require.resolve('@deepseek-ai/dsh-typert-protocol/remote-info'),'dsh-zhen/remote':resolve('packages/dsh-zhen/lib/remote.js')},logLevel:'silent'});
  const {RagToolView}=require(display),html=renderToStaticMarkup(React.createElement(RagToolView,{phase:'result',toolName:'zhen_rag_search',block:{isError:false,content:search.content??[],meta:JSON.parse(JSON.stringify(search.meta))}}));assert.ok(html.includes('Word 提取文本第'));assert.equal(html.includes('第 2 页'),false);assert.ok(html.includes('提取文本第'));assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);
  assert.equal((await run('zhen_rag_open',{id:hit.id,epoch:hit.epoch},{...agent,session:{id:'EXAMPLE_OTHER_SESSION'}})).isError,true);await call('setKnowledgeAgentAccess',{project:'EXAMPLE_PROJECT',collectionId:collection.id,enabled:false});assert.equal((await run('zhen_rag_open',{id:hit.id,epoch:hit.epoch})).isError,true);assert.equal(credentials,0);assert.equal(network,0);
 }finally{signal.abort();await ctx.fiber.dispose();globalThis.fetch=beforeFetch;if(beforeHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=beforeHome;const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
