import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {clientHooks} from './fixtures/client-hooks.mjs';
import {ownedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const require=createRequire(import.meta.url),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime'),ok=value=>Promise.resolve({ok:true,value});
const nodes=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(nodes)],text=e=>React.Children.toArray(e?.props?.children).map(child=>child&&typeof child==='object'?text(child):String(child??'')).join('');
const button=(tree,label)=>{const found=nodes(tree).find(row=>row.type==='button'&&text(row)===label);assert.ok(found,label);return found;},checks=tree=>nodes(tree).filter(row=>row.type==='input'&&row.props.type==='checkbox');
const state=(candidateId,extra={})=>({candidateId,consumed:false,requestId:null,execution:null,profile:null,title:null,phase:null,ready:false,pid:null,port:null,browserRequested:false,canReopen:false,error:null,...extra});
const review=(candidateId,extra={})=>({candidateId,status:state(candidateId),profiles:[{name:'EXAMPLE_WEB',title:'EXAMPLE',available:true}],selected:'EXAMPLE_WEB',review:'a'.repeat(64),programs:[{id:'EXAMPLE_PROGRAM',name:'example-program',enabled:true,origin:'restored',version:'0.0.0'}],totalPrograms:1,unresolvedPrograms:0,page:0,nextPage:null,canOpen:true,...extra});
async function component(t,name='RecoveryApplication'){
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-recovery-ui-EXAMPLE-'))),cleanup=ownedTempCleanup(base,root,'dsh-recovery-ui-EXAMPLE-');t.after(()=>cleanup.cleanup());const mock=join(root,'react.cjs'),file=join(root,'view.cjs');
 await writeFile(mock,`const React=require(${JSON.stringify(react)}),h=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:v=>h()?h().state(v):React.useState(v),useRef:v=>h()?h().ref(v):React.useRef(v),useEffect:(run,deps)=>h()?h().effect(run,deps):React.useEffect(run,deps),useLayoutEffect:(run,deps)=>h()?h().effect(run,deps):React.useLayoutEffect(run,deps)};`);
 await build({entryPoints:[resolve('packages/dsh-zhen/src/client/'+name+'.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx,zod:require.resolve('zod'),'@deepseek-ai/dsh-typert-protocol/remote-info':require.resolve('@deepseek-ai/dsh-typert-protocol/remote-info'),'dsh-zhen/remote':resolve('packages/dsh-zhen/lib/remote.js')},external:[react,jsx],logLevel:'silent'});return require(file)[name];
}
async function mount(t,overrides={}){const id=randomUUID(),requests=[],api={backupApplicationStatus:()=>ok(state(id)),backupApplicationReview:()=>ok(review(id)),backupApplicationOpen:request=>{requests.push(request);return ok(state(id,{consumed:true,execution:randomUUID(),requestId:request.requestId,profile:request.profile,title:'EXAMPLE',phase:'preparing'}));},...overrides},driver=clientHooks(await component(t),{api,candidateId:id});t.after(()=>driver.dispose());driver.render();await driver.settle();driver.render();return{id,api,driver,requests};}
async function inspect(f){button(f.driver.render(),'检查恢复应用').props.onClick();await f.driver.settle();return f.driver.render();}

test('C198: explicit program acknowledgement is required and the latest browser choice plus double click sends only one opening request',async t=>{
 const f=await mount(t);let tree=await inspect(f);assert.equal(button(tree,'确认并打开恢复应用').props.disabled,true);button(tree,'确认并打开恢复应用').props.onClick();await f.driver.settle();assert.equal(f.requests.length,0);
 checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=f.driver.render();checks(tree)[1].props.onChange({currentTarget:{checked:false}});const open=button(tree,'确认并打开恢复应用');open.props.onClick();open.props.onClick();await f.driver.settle();assert.equal(f.requests.length,1);assert.equal(f.requests[0].openBrowser,false);assert.equal(f.requests[0].approved,true);assert.equal(f.requests[0].candidateId,f.id);
});

test('C198: a retained opening handler cannot use an unchecked acknowledgement or a changed candidate/connection',async t=>{
 const f=await mount(t);let tree=await inspect(f);checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=f.driver.render();const open=button(tree,'确认并打开恢复应用');checks(tree)[0].props.onChange({currentTarget:{checked:false}});open.props.onClick();await f.driver.settle();assert.equal(f.requests.length,0);
 checks(f.driver.render())[0].props.onChange({currentTarget:{checked:true}});const old=button(f.driver.render(),'确认并打开恢复应用');const next=randomUUID();f.driver.render({api:f.api,candidateId:next});old.props.onClick();await f.driver.settle();assert.equal(f.requests.length,0);assert.equal(nodes(f.driver.render()).some(row=>row.type==='button'&&text(row)==='确认并打开恢复应用'),false);
 f.driver.render({api:{...f.api},candidateId:f.id});old.props.onClick();await f.driver.settle();assert.equal(f.requests.length,0);
});

test('C198: an unknown opening response is checked explicitly and never automatically submitted again',async t=>{
 let writes=0;const f=await mount(t,{backupApplicationOpen:()=>{writes++;return Promise.reject(Error('EXAMPLE_PRIVATE_MESSAGE'));}});let tree=await inspect(f);checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=f.driver.render();const old=button(tree,'确认并打开恢复应用');old.props.onClick();await f.driver.settle();tree=f.driver.render();assert.match(text(tree),/回执未收到/);assert.doesNotMatch(text(tree),/EXAMPLE_PRIVATE_MESSAGE/);assert.equal(button(tree,'确认并打开恢复应用').props.disabled,true);old.props.onClick();button(tree,'检查状态').props.onClick();await f.driver.settle();assert.equal(writes,1);
});

test('C198: an existing backup inspection disables even retained review and open handlers',async t=>{
 const f=await mount(t);let tree=await inspect(f);checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=f.driver.render();const old=button(tree,'确认并打开恢复应用');f.driver.render({api:f.api,candidateId:f.id,disabled:true});old.props.onClick();await f.driver.settle();assert.equal(f.requests.length,0);assert.equal(button(f.driver.render(),'确认并打开恢复应用').props.disabled,true);
});

test('C198: a long review can be explicitly cancelled and its old cancel button cannot cancel a later opening',async t=>{
 let resolved,cancelled=0;const f=await mount(t,{backupApplicationReview:()=>new Promise(done=>{resolved=done;}),backupCancel:()=>{cancelled++;return ok(undefined);}});button(f.driver.render(),'检查恢复应用').props.onClick();const old=button(f.driver.render(),'取消本次检查');old.props.onClick();await f.driver.settle();assert.equal(cancelled,1);resolved({ok:true,value:review(f.id)});await f.driver.settle();let tree=f.driver.render();checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=f.driver.render();button(tree,'确认并打开恢复应用').props.onClick();old.props.onClick();await f.driver.settle();assert.equal(f.requests.length,1);assert.equal(cancelled,1);
});

test('C198: a late review from the old candidate cannot appear in the selected candidate',async t=>{
 let resolveReview;const f=await mount(t,{backupApplicationReview:()=>new Promise(done=>{resolveReview=done;})});button(f.driver.render(),'检查恢复应用').props.onClick();const next=randomUUID();f.driver.render({api:f.api,candidateId:next});resolveReview({ok:true,value:review(f.id)});await f.driver.settle();assert.equal(text(f.driver.render()).includes('example-program'),false);assert.equal(f.requests.length,0);
});

test('C198: retained window controls carry their original execution identity instead of targeting a later window',async t=>{
 const f=await mount(t),first=randomUUID(),second=randomUUID(),requests=[];let execution=first;f.api.backupApplicationStatus=()=>ok(state(f.id,{consumed:true,execution,requestId:randomUUID(),profile:'EXAMPLE_WEB',title:'EXAMPLE',phase:'running',ready:true,pid:1234,port:12345}));f.api.backupApplicationControl=request=>{requests.push(request);return Promise.reject({details:{reason:'BACKUP_APPLICATION_EXECUTION_CHANGED'}});};button(f.driver.render(),'检查状态').props.onClick();await f.driver.settle();const old=button(f.driver.render(),'关闭恢复应用');execution=second;button(f.driver.render(),'检查状态').props.onClick();await f.driver.settle();f.driver.render();old.props.onClick();await f.driver.settle();assert.equal(requests.length,1);assert.equal(requests[0].execution,first);assert.match(text(f.driver.render()),/已重新打开/);
});

test('C198: consuming a candidate hides old integrity/project controls and retained verification handlers refuse',async t=>{
 let reads=0;const id=randomUUID(),job={id,operation:'restore',phase:'succeeded',component:null,completed:1,total:1,components:['environment'],output:'C:\\EXAMPLE_RECOVERY',bytes:1,sha256:'a'.repeat(64),error:null,activated:false,wholeApplicationRestore:false},api={backupCandidateVerify:()=>{reads++;throw Error('EXAMPLE_MUST_NOT_VERIFY_USED_CANDIDATE');}},driver=clientHooks(await component(t,'RecoveryPreview'),{api,job});t.after(()=>driver.dispose());const tree=driver.render(),old=button(tree,'校验当前候选'),app=nodes(tree).find(row=>typeof row.type==='function'&&row.type.name==='RecoveryApplication');assert.ok(app);app.props.onConsumedChange(true);old.props.onClick();await driver.settle();assert.equal(reads,0);assert.equal(nodes(driver.render()).some(row=>row.type==='button'&&text(row)==='校验当前候选'),false);
 console.log(JSON.stringify({contract:'C198',productionComponentHandlers:true,acknowledgementAndScopeGuards:true,unknownOpeningNeverResubmits:true,controlBoundToOriginalExecution:true,usedCandidateOldControlsHidden:true,browserAcceptance:false,nativeRequests:0,modelRequests:0}));
});
