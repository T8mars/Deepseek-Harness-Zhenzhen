import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {clientHooks} from './fixtures/client-hooks.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const require=createRequire(import.meta.url);
function deferred(){let done,fail;const promise=new Promise((a,b)=>{done=value=>a({ok:true,value});fail=b;});return{promise,done,fail};}
async function fixture(work){const base=realpathSync.native(tmpdir()),prefix='dsh-connection-entry-EXAMPLE-',root=realpathSync.native(mkdtempSync(join(base,prefix)));await withOwnedTempCleanup(ownedTempCleanup(base,root,prefix),async()=>{const mock=join(root,'EXAMPLE_REACT.cjs'),file=join(root,'EXAMPLE_COMPONENT.cjs'),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime');writeFileSync(mock,`const React=require(${JSON.stringify(react)});const current=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:value=>current().state(value),useEffect:(run,deps)=>current().effect(run,deps)};`);await build({entryPoints:[resolve('packages/dsh-zhen/src/client/ConnectionEntry.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx},external:[react,jsx],logLevel:'silent'});try{await work(require(file).ConnectionEntry);}finally{delete globalThis.__DSH_EXAMPLE_TARGET_HOOKS;}});}

test('C208: a new conversation has a settings entry before status resolves, and a missing credential leads there only on explicit click',async()=>fixture(async Component=>{
 const result=deferred();let reads=0,opens=0;const api={status:()=>{reads++;return result.promise;}},driver=clientHooks(Component,{api,onOpen:()=>opens++});
 try{let tree=driver.render();assert.equal(tree.type,'button');assert.equal(tree.props.children,'连接与设置');assert.equal(opens,0);result.done({credentialConfigured:false});await driver.settle();tree=driver.render();assert.equal(tree.props.children,'连接 Seedance');assert.match(tree.props.title,/API 令牌/);assert.equal(opens,0);tree.props.onClick();assert.equal(opens,1);assert.equal(reads,1);}finally{driver.dispose();}
}));
test('C208: configured credentials hide the entry without changing models, credentials or navigation',async()=>fixture(async Component=>{
 let opens=0,reads=0;const api={status:async()=>{reads++;return{ok:true,value:{credentialConfigured:true}};}},driver=clientHooks(Component,{api,onOpen:()=>opens++});try{driver.render();await driver.settle();assert.equal(driver.render(),null);assert.equal(opens,0);assert.equal(reads,1);assert.deepEqual(Object.keys(api),['status']);}finally{driver.dispose();}
}));
test('C208: a late configured result from a previous connection cannot hide the new connection entry',async()=>fixture(async Component=>{
 const a=deferred(),b=deferred(),old={status:()=>a.promise},current={status:()=>b.promise},driver=clientHooks(Component,{api:old,onOpen:()=>{}});try{driver.render();driver.render({api:current,onOpen:()=>{}});a.done({credentialConfigured:true});await driver.settle();assert.equal(driver.render().props.children,'连接与设置');b.done({credentialConfigured:false});await driver.settle();assert.equal(driver.render().props.children,'连接 Seedance');}finally{driver.dispose();}
}));
test('C208: status failure or malformed status offers an explicit check without inventing missing credentials or retrying',async()=>fixture(async Component=>{
 for(const reply of [()=>Promise.reject(Error('EXAMPLE_DISCONNECTED')),async()=>({ok:false,error:{code:'EXAMPLE_REFUSED'}}),async()=>({ok:true,value:{}})]){let reads=0;const driver=clientHooks(Component,{api:{status:()=>{reads++;return reply();}},onOpen:()=>{}});try{driver.render();await driver.settle();assert.equal(driver.render().props.children,'检查 Seedance 连接');await driver.settle();assert.equal(reads,1);}finally{driver.dispose();}}
}));
test('C208: the pinned published root header seat is documented, empty by default and registered through the owned plugin',()=>{
 const file=name=>readFileSync(require.resolve(name+'/package.json'),'utf8'),pkg=JSON.parse(file('@deepseek-ai/dsh-client-ui-conversation'));assert.equal(pkg.version,'0.2.1-rc.3');
 const declaration=readFileSync(resolve(require.resolve('@deepseek-ai/dsh-client-ui-conversation/package.json'),'../lib/types/client/contract/slots.d.ts'),'utf8');assert.match(declaration,/'conversation\.header\.leading':\s*\{\s*kind: 'single';\s*scope: 'root';/);
 const runner=readFileSync(require.resolve('@deepseek-ai/dsh-cordis-client-runner/client'),'utf8'),entry=runner.slice(runner.indexOf('key: "conversation.header.leading"'));assert.ok(entry.startsWith('key: "conversation.header.leading"'));assert.match(entry.slice(0,3000),/occupants: \[\]/);assert.match(entry.slice(0,3000),/replaceRisk: "none"/);
 const source=readFileSync('packages/dsh-zhen/src/client/index.tsx','utf8');assert.match(source,/slots\.register\(\{name:'conversation.header.leading'\}/);assert.match(source,/navigation\.open\('settings'\);inner\.layout\.selectPanel\(workspacePanel\)/);
});
