import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {Context} from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {clientHooks} from './fixtures/client-hooks.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const require=createRequire(import.meta.url);
function owned(){const base=realpathSync.native(tmpdir()),prefix='dsh-knowledge-spaces-EXAMPLE-',root=realpathSync.native(mkdtempSync(join(base,prefix)));return{root,lease:ownedTempCleanup(base,root,prefix)};}

test('C207: published Owner gateway pages only unique space names, including revoked and binding-only spaces, without granting or reading documents',async()=>{
  const f=owned();await withOwnedTempCleanup(f.lease,async()=>{
    const previousHome=process.env.DSH_HOME,previousFetch=globalThis.fetch,ctx=new Context(),lifetime=new AbortController(),folder=join(f.root,'EXAMPLE_DOCS'),workspace=join(f.root,'EXAMPLE_WORKSPACE');
    mkdirSync(folder);mkdirSync(workspace);writeFileSync(join(folder,'EXAMPLE.txt'),'EXAMPLE_CONTENT_MUST_NOT_BE_READ');process.env.DSH_HOME=join(f.root,'EXAMPLE_HOME');
    let secrets=0,network=0;ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{secrets++;throw Error('EXAMPLE_NO_SECRET');}});globalThis.fetch=async()=>{network++;throw Error('EXAMPLE_NO_NETWORK');};
    try{
      await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(ZhenService);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});
      const peer={id:'EXAMPLE_SPACES_OWNER',ctx,principal:{kind:'owner'},signal:lifetime.signal,interactions:'none',dispose:async()=>{}};
      const call=async(method,args,principal=peer.principal)=>{const value=await ctx.typertGateway.invoke({namespace:'zhen',method,args,peer:{...peer,principal}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(value);};
      assert.deepEqual(await call('knowledgeSpaces',{after:''}),{items:[],next:null});
      for(let i=0;i<51;i++)await call('createKnowledge',{project:'EXAMPLE_'+String(i).padStart(3,'0'),name:'EXAMPLE_COLLECTION',folder});
      await call('createKnowledge',{project:'EXAMPLE_000',name:'EXAMPLE_DUPLICATE_SPACE',folder});
      const collection=(await call('knowledgeCollections',{project:'EXAMPLE_000'}))[0];await call('setKnowledgeAccess',{project:'EXAMPLE_000',collectionId:collection.id,enabled:false,cloudProvider:''});
      await call('bindKnowledge',{project:'EXAMPLE_绑定',directory:workspace});
      const before=await call('knowledgeCollections',{project:'EXAMPLE_000'}),binding=await call('knowledgeBinding',{project:'EXAMPLE_绑定'}),first=await call('knowledgeSpaces',{after:''}),second=await call('knowledgeSpaces',{after:first.next});
      assert.equal(first.items.length,50);assert.equal(first.next,'EXAMPLE_049');assert.deepEqual(second,{items:['EXAMPLE_050','EXAMPLE_绑定'],next:null});assert.equal(new Set([...first.items,...second.items]).size,52);
      assert.deepEqual(await call('knowledgeCollections',{project:'EXAMPLE_000'}),before);assert.deepEqual(await call('knowledgeBinding',{project:'EXAMPLE_绑定'}),binding);
      assert.equal(JSON.stringify([first,second]).includes(folder),false);assert.equal(JSON.stringify([first,second]).includes('EXAMPLE_CONTENT_MUST_NOT_BE_READ'),false);assert.equal(before.every(item=>item.documents===0&&!item.agentEnabled&&item.cloudProvider===''),true);
      await assert.rejects(call('knowledgeSpaces',{after:''},{kind:'anonymous'}));await assert.rejects(call('knowledgeSpaces',{after:'x'.repeat(201)}));await assert.rejects(call('knowledgeSpaces',{after:'',path:folder}));
      assert.deepEqual(await call('knowledgeSpaces',{after:"ZZZ' UNION SELECT root FROM collections --"}),{items:[],next:null});assert.equal(secrets,0);assert.equal(network,0);
    }finally{lifetime.abort();await ctx.fiber.dispose();globalThis.fetch=previousFetch;if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;}
  });
});

const ok=value=>Promise.resolve({ok:true,value}),page=(...items)=>({items,next:null});
function deferred(){let done,fail;const promise=new Promise((a,b)=>{done=value=>a({ok:true,value});fail=b;});return{promise,done,fail};}
function nodes(value){return !value||typeof value!=='object'?[]:[value,...React.Children.toArray(value.props?.children).flatMap(nodes)];}
function text(value){return React.Children.toArray(value?.props?.children).map(child=>child&&typeof child==='object'?text(child):String(child??'')).join('');}
const button=(tree,label)=>{const value=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(value,label);return value;};
const select=tree=>nodes(tree).find(node=>node.type==='select');
async function fixture(work){const f=owned();await withOwnedTempCleanup(f.lease,async()=>{const mock=join(f.root,'EXAMPLE_REACT.cjs'),file=join(f.root,'EXAMPLE_COMPONENT.cjs'),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime');writeFileSync(mock,`const React=require(${JSON.stringify(react)});const current=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:value=>current().state(value),useRef:value=>current().ref(value),useEffect:(run,deps)=>current().effect(run,deps)};`);await build({entryPoints:[resolve('packages/dsh-zhen/src/client/KnowledgeSpaces.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx},external:[react,jsx],logLevel:'silent'});try{await work(require(file).KnowledgeSpaces);}finally{delete globalThis.__DSH_EXAMPLE_TARGET_HOOKS;}});}
async function mounted(Component,api,extra={}){const choices=[],driver=clientHooks(Component,{api,value:'EXAMPLE_NEW_DRAFT',disabled:false,onChoose:name=>choices.push(name),...extra});driver.render();await driver.settle();return{driver,choices};}

test('C207: discovering and refreshing spaces never choose or authorize one; only an explicit current option changes the form',async()=>fixture(async Component=>{
  const reads=[],api={knowledgeSpaces:after=>{reads.push(after);return ok(page('EXAMPLE_A','EXAMPLE_B'));}},f=await mounted(Component,api);try{
    let tree=f.driver.render();assert.deepEqual(f.choices,[]);assert.equal(select(tree).props.value,'');select(tree).props.onChange({currentTarget:{value:'EXAMPLE_FORGED'}});assert.deepEqual(f.choices,[]);
    select(tree).props.onChange({currentTarget:{value:'EXAMPLE_B'}});assert.deepEqual(f.choices,['EXAMPLE_B']);button(tree,'刷新空间').props.onClick();await f.driver.settle();assert.deepEqual(f.choices,['EXAMPLE_B']);assert.deepEqual(reads,['','']);
    tree=f.driver.render({...f.driver.props,disabled:true});select(tree).props.onChange({currentTarget:{value:'EXAMPLE_A'}});button(tree,'刷新空间').props.onClick();assert.deepEqual(f.choices,['EXAMPLE_B']);assert.equal(reads.length,2);
  }finally{f.driver.dispose();}
}));

test('C207: bounded pagination supports next, previous and duplicate-click admission without losing the selected draft',async()=>fixture(async Component=>{
  const reads=[],pending=deferred(),api={knowledgeSpaces:after=>{reads.push(after);return after?pending.promise:ok({items:['EXAMPLE_A'],next:'EXAMPLE_A'});}},f=await mounted(Component,api);try{
    let tree=f.driver.render();const next=button(tree,'下一页空间');next.props.onClick();next.props.onClick();assert.deepEqual(reads,['','EXAMPLE_A']);pending.done(page('EXAMPLE_B'));await f.driver.settle();tree=f.driver.render();assert.equal(select(tree).props.value,'');assert.ok(text(tree).includes('EXAMPLE_B'));button(tree,'上一页空间').props.onClick();await f.driver.settle();tree=f.driver.render();assert.ok(text(tree).includes('EXAMPLE_A'));assert.equal(select(tree).props.value,'');assert.deepEqual(f.choices,[]);assert.deepEqual(reads,['','EXAMPLE_A','']);
  }finally{pending.done(page());f.driver.dispose();}
}));

test('C207: late pages from the previous connection neither replace names nor select a space',async()=>fixture(async Component=>{
  const pending=deferred(),a={knowledgeSpaces:()=>pending.promise},b={knowledgeSpaces:()=>ok(page('EXAMPLE_NEW_CONNECTION'))},f=await mounted(Component,a);try{
    f.driver.render({...f.driver.props,api:b});await f.driver.settle();pending.done(page('EXAMPLE_OLD_CONNECTION'));await f.driver.settle();const tree=f.driver.render();assert.ok(text(tree).includes('EXAMPLE_NEW_CONNECTION'));assert.equal(text(tree).includes('EXAMPLE_OLD_CONNECTION'),false);assert.deepEqual(f.choices,[]);
  }finally{pending.done(page());f.driver.dispose();}
}));

test('C207: a refused list keeps the form draft, permits explicit refresh and never retries automatically',async()=>fixture(async Component=>{
  let reads=0;const api={knowledgeSpaces:()=>++reads===1?Promise.reject(Error('EXAMPLE_REFUSED')):ok(page('EXAMPLE_A'))},f=await mounted(Component,api);try{
    let tree=f.driver.render();assert.ok(text(tree).includes('当前草稿已保留'));assert.equal(f.driver.props.value,'EXAMPLE_NEW_DRAFT');assert.equal(reads,1);button(tree,'刷新空间').props.onClick();await f.driver.settle();tree=f.driver.render();assert.equal(reads,2);assert.equal(text(tree).includes('暂时无法读取'),false);assert.deepEqual(f.choices,[]);assert.equal(f.driver.props.value,'EXAMPLE_NEW_DRAFT');
  }finally{f.driver.dispose();}
}));
