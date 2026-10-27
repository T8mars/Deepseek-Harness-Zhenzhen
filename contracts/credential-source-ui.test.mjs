import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {clientHooks} from './fixtures/client-hooks.mjs';
const require=createRequire(import.meta.url),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime');
const ok=value=>Promise.resolve({ok:true,value});
const status=credentialSource=>({version:'0.1.0',provider:'seedance',model:'deepseek/deepseek-v4.1-flash',credentialConfigured:credentialSource!=='none',credentialWritable:true,credentialSource,gatewayVerified:false});
const nodes=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(nodes)];
const text=e=>React.Children.toArray(e?.props?.children).map(c=>c&&typeof c==='object'?text(c):String(c??'')).join('');
const button=(tree,label)=>nodes(tree).find(e=>e.type==='button'&&text(e)===label);
async function fixture(){
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-key-ui-EXAMPLE-'))),mock=join(root,'react.cjs'),file=join(root,'view.cjs'),entry=resolve('packages/dsh-zhen/src/client/index.tsx');
 const dispose=()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-key-ui-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});};
 try{
  writeFileSync(mock,`const React=require(${JSON.stringify(react)});const current=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:value=>current().state(value),useEffect:(run,deps)=>current().effect(run,deps),useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};`);
  // Expose the actual production component for handler testing; do not duplicate its implementation.
  await build({stdin:{contents:readFileSync(entry,'utf8')+'\nexport { Workspace as ExampleWorkspace };',resolveDir:dirname(entry),sourcefile:entry,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'text'},alias:{react:mock,'react/jsx-runtime':jsx,zod:require.resolve('zod'),'@deepseek-ai/dsh-typert-protocol/remote-info':require.resolve('@deepseek-ai/dsh-typert-protocol/remote-info'),'dsh-zhen/remote':resolve('packages/dsh-zhen/lib/remote.js')},external:[react,jsx],logLevel:'silent'});
  return{Component:require(file).ExampleWorkspace,dispose};
 }catch(error){dispose();throw error;}
}
const navigation={subscribe:()=>()=>{},current:()=> 'settings',open:()=>{}};

for(const fallback of ['environment','none'])test(`C85: actual removal handler reports ${fallback} after rereading presence and clears the previous wallet`,async()=>{
 const f=await fixture();let state=status('stored'),removals=0;const api={status:()=>ok(state),wallet:()=>ok({currency:'CNY',amount:9,checkedAt:'2026-01-01T00:00:00Z'}),removeCredential:()=>{removals++;state=status(fallback);return ok();}};
 const driver=clientHooks(f.Component,{ctx:{remote:{zhen:api}},navigation});
 try{driver.render();await driver.settle();let tree=driver.render();assert.ok(text(tree).includes('已保存本地令牌'));button(tree,'刷新余额').props.onClick();await driver.settle();tree=driver.render();assert.ok(text(tree).includes('CNY 9.00'));
  button(tree,'移除本地令牌').props.onClick();await driver.settle();tree=driver.render();assert.equal(removals,1);assert.equal(text(tree).includes('CNY 9.00'),false);assert.equal(button(tree,'移除本地令牌'),undefined);
  if(fallback==='environment'){assert.ok(text(tree).includes('使用启动环境令牌'));assert.ok(text(tree).includes('本地令牌已移除，当前使用启动环境中的令牌'));assert.ok(text(tree).includes('重启 DSH'));assert.equal(button(tree,'刷新余额').props.disabled,false);}
  else{assert.ok(text(tree).includes('当前没有可用令牌'));assert.equal(button(tree,'刷新余额').props.disabled,true);}
 }finally{driver.dispose();f.dispose();}
});

test('C85: an environment credential is labelled truthfully, cannot be removed as a local copy, and can be overridden by the actual save handler',async()=>{
 const f=await fixture();let state=status('environment'),saves=0;const api={status:()=>ok(state),saveCredential:value=>{assert.equal(value,'EXAMPLE_LOCAL_REPLACEMENT');saves++;state=status('stored');return ok();}};
 const driver=clientHooks(f.Component,{ctx:{remote:{zhen:api}},navigation});
 try{driver.render();await driver.settle();let tree=driver.render();assert.ok(text(tree).includes('使用启动环境令牌'));assert.equal(button(tree,'移除本地令牌'),undefined);assert.equal(text(tree).includes('已保存本地令牌'),false);
  nodes(tree).find(e=>e.type==='input'&&e.props.id==='zhen-key').props.onChange({target:{value:'EXAMPLE_LOCAL_REPLACEMENT'}});tree=driver.render();nodes(tree).find(e=>e.type==='form').props.onSubmit({preventDefault(){}});await driver.settle();tree=driver.render();assert.equal(saves,1);assert.ok(text(tree).includes('已保存本地令牌'));assert.ok(button(tree,'移除本地令牌'));assert.equal(nodes(tree).find(e=>e.type==='input'&&e.props.id==='zhen-key').props.value,'');
 }finally{driver.dispose();f.dispose();}
});

test('C85: a quota recovery action refreshes the actual wallet and custom account units never invent a currency',async()=>{
 const f=await fixture(),wallet={currency:'CUSTOM',amount:12.34,usedAmount:1,checkedAt:'2026-01-01T00:00:00Z'},before=structuredClone(wallet);let reads=0;const api={status:()=>ok(status('stored')),wallet:()=>{reads++;return ok(wallet);}},driver=clientHooks(f.Component,{ctx:{remote:{zhen:api}},navigation});
 try{driver.render();await driver.settle();const check=nodes(driver.render()).find(row=>typeof row.type==='function'&&row.type.name==='GatewayCheck');assert.equal(typeof check.props.onRefreshBalance,'function');assert.equal(reads,0);await check.props.onRefreshBalance();await driver.settle();const next=text(driver.render());assert.match(next,/可用额度 12\.34/);assert.match(next,/账户计价单位/);assert.doesNotMatch(next,/CUSTOM|CNY|USD|¥|￥/);assert.equal(reads,1);assert.deepEqual(wallet,before);}finally{driver.dispose();f.dispose();}
});
