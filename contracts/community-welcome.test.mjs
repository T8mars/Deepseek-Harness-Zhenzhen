import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,realpathSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import React from 'react';
import {build} from 'esbuild';
import {SlotCore} from '@deepseek-ai/dsh-client-ui-slots';
import {clientHooks} from './fixtures/client-hooks.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const require=createRequire(import.meta.url);
const nodes=el=>!el||typeof el!=='object'?[]:[el,...React.Children.toArray(el.props?.children).flatMap(nodes)];
const text=el=>React.Children.toArray(el?.props?.children).map(x=>x&&typeof x==='object'?text(x):String(x??'')).join('');
function button(tree,label){const found=nodes(tree).find(row=>row.type==='button'&&text(row)===label);assert.ok(found,label);return found;}
async function fixture(work){
 const base=realpathSync.native(tmpdir()),prefix='dsh-community-welcome-EXAMPLE-',root=realpathSync.native(mkdtempSync(join(base,prefix)));
 await withOwnedTempCleanup(ownedTempCleanup(base,root,prefix),async()=>{
  const mock=join(root,'EXAMPLE_REACT.cjs'),output=join(root,'EXAMPLE_UI.cjs'),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime');
  writeFileSync(mock,`const React=require(${JSON.stringify(react)});const h=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:v=>h().state(v),useRef:v=>h().ref(v),useEffect:(run,deps)=>h().effect(run,deps)};`);
  const remote=resolve('packages/dsh-zhen/lib/remote.js');
  await build({entryPoints:[resolve('packages/dsh-zhen/src/client/CommunityWelcome.tsx')],outfile:output,bundle:true,format:'cjs',platform:'node',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx,'dsh-zhen/remote':remote},external:[react,jsx,remote],logLevel:'silent'});
  await work(require(output));
 });
}
function form(initial={status:'ready',value:{},writable:true}){
 let snapshot=initial;const listeners=new Set(),calls=[];
 const value={getSnapshot:()=>snapshot,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},set:async(field,next)=>{calls.push([field,next]);return false;}};
 return{value,calls,publish(next){snapshot=next;for(const listener of listeners)listener();}};
}
const props=(value,complete)=>({form:value,complete,stepId:'welcome-notice',openSection:()=>assert.fail('EXAMPLE_NO_NAVIGATION')});
test('C211: loading never acknowledges or skips; the community notice appears when public settings become ready',async()=>fixture(async({CommunityWelcome})=>{
 const f=form({status:'loading',value:undefined,writable:false});let completed=0;const driver=clientHooks(CommunityWelcome,props(f.value,()=>completed++));try{assert.equal(driver.render(),null);assert.equal(completed,0);assert.deepEqual(f.calls,[]);f.publish({status:'ready',value:{welcomeNoticeVersion:'2026-09-28.1'},writable:true});const view=driver.render();assert.equal(view.type,'dialog');assert.match(text(view),/欢迎来到 DSH-zhen/);assert.match(text(view),/非官方社区修改版/);assert.doesNotMatch(text(view),/目前的 0\.2 版本|共同探索智能上限/);assert.equal(completed,0);assert.deepEqual(f.calls,[]);}finally{driver.dispose();}
}));
test('C211: acknowledgement is single submission and a refused write cannot dismiss the notice',async()=>fixture(async({CommunityWelcome,COMMUNITY_NOTICE_VERSION})=>{
 const f=form();let finish,completed=0;f.value.set=(field,next)=>{f.calls.push([field,next]);return new Promise(resolve=>{finish=resolve;});};const driver=clientHooks(CommunityWelcome,props(f.value,()=>completed++));try{const run=button(driver.render(),'我已了解，开始创作').props.onClick;run();run();assert.deepEqual(f.calls,[['welcomeNoticeVersion',COMMUNITY_NOTICE_VERSION]]);finish(false);await driver.settle();const view=driver.render();assert.match(text(view),/暂时无法保存已读状态/);assert.equal(completed,0);assert.equal(button(view,'我已了解，开始创作').props.disabled,false);}finally{driver.dispose();}
}));
test('C211: accepted persistence survives a new component without a second write',async()=>fixture(async({CommunityWelcome,COMMUNITY_NOTICE_VERSION})=>{
 const f=form();let completed=0;f.value.set=async(field,next)=>{f.calls.push([field,next]);f.publish({status:'ready',value:{[field]:next},writable:true});return true;};let driver=clientHooks(CommunityWelcome,props(f.value,()=>completed++));try{button(driver.render(),'我已了解，开始创作').props.onClick();await driver.settle();assert.equal(driver.render(),null);assert.equal(completed,1);assert.deepEqual(f.calls,[['welcomeNoticeVersion',COMMUNITY_NOTICE_VERSION]]);driver.dispose();driver=clientHooks(CommunityWelcome,props(f.value,()=>completed++));assert.equal(driver.render(),null);assert.equal(completed,2);assert.equal(f.calls.length,1);}finally{driver.dispose();}
}));
test('C211: a late previous-form write cannot acknowledge or dismiss the current profile',async()=>fixture(async({CommunityWelcome,COMMUNITY_NOTICE_VERSION})=>{
 const old=form(),current=form();let finish,completed=0;old.value.set=()=>new Promise(resolve=>{finish=resolve;});const driver=clientHooks(CommunityWelcome,props(old.value,()=>completed++));try{button(driver.render(),'我已了解，开始创作').props.onClick();driver.render(props(current.value,()=>completed++));old.publish({status:'ready',value:{welcomeNoticeVersion:COMMUNITY_NOTICE_VERSION},writable:true});finish(true);await driver.settle();assert.equal(driver.render().type,'dialog');assert.equal(completed,0);assert.equal(current.calls.length,0);}finally{driver.dispose();}
}));
test('C211: unavailable settings allow a nonpersistent reminder dismissal without any permission or credential call',async()=>fixture(async({CommunityWelcome})=>{
 const f=form({status:'unavailable',value:undefined,writable:false});let completed=0;const driver=clientHooks(CommunityWelcome,props(f.value,()=>completed++));try{const view=driver.render();assert.equal(button(view,'我已了解，开始创作').props.disabled,true);button(view,'稍后提醒').props.onClick();assert.equal(completed,1);assert.deepEqual(f.calls,[]);}finally{driver.dispose();}
}));
test('C211: published list-cell shadowing replaces only welcome and restores it on disposal',()=>{
 const core=new SlotCore(),shell=()=>null,original=()=>null,community=()=>null,credentials=()=>null;
 const root=core.register({name:'root',children:{'settings.onboarding':{kind:'list',scope:'root'}}},shell);
 const old=core.register({name:'settings.onboarding',id:'welcome-notice',order:-100},original),auth=core.register({name:'settings.onboarding',id:'deepseek-official',order:0},credentials);
 const own=core.register({name:'settings.onboarding',id:'welcome-notice',order:-100,priority:-100},community);
 assert.deepEqual(core.entriesOfSlot('settings.onboarding').map(row=>row.component),[community,credentials]);own();assert.deepEqual(core.entriesOfSlot('settings.onboarding').map(row=>row.component),[original,credentials]);auth();old();root();
 const directory=dirname(require.resolve('@deepseek-ai/dsh-client-ui-settings/package.json'));
 const contract=readFileSync(join(directory,'lib/types/client/contract/slots.d.ts'),'utf8');assert.match(contract,/'settings\.onboarding':\s*\{\s*kind: 'list';\s*scope: 'root';/);
 const models=readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-settings-models/client'),'utf8');assert.match(models,/id: "welcome-notice",\s*order: -100/);assert.match(models,/WELCOME_NOTICE_SETTINGS_NAMESPACE = "ui-settings-general"/);assert.match(models,/WELCOME_NOTICE_ACK_FIELD = "welcomeNoticeVersion"/);
});
test('C211: an explicitly reopened acknowledged notice remains readable and closes without another write',async()=>fixture(async({CommunityWelcome,COMMUNITY_NOTICE_VERSION})=>{
 const f=form({status:'ready',value:{welcomeNoticeVersion:COMMUNITY_NOTICE_VERSION},writable:true});let completed=0;const driver=clientHooks(CommunityWelcome,{...props(f.value,()=>completed++),explicit:true});try{const view=driver.render();assert.equal(view.type,'dialog');assert.equal(completed,0);button(view,'我已了解，开始创作').props.onClick();assert.equal(completed,1);assert.deepEqual(f.calls,[]);}finally{driver.dispose();}
}));
