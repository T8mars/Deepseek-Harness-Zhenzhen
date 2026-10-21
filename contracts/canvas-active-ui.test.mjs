import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {clientHooks} from './fixtures/client-hooks.mjs';
import {activeCanvasExample} from './fixtures/active-canvas.mjs';
const require=createRequire(import.meta.url),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime'),remote=resolve('packages/dsh-zhen/lib/remote.js');
const a={projectId:'EXAMPLE_A',id:'EXAMPLE_SHARED',revision:7,name:'EXAMPLE alpha'},b={...a,projectId:'EXAMPLE_B',name:'<script>EXAMPLE beta</script>'},key=x=>JSON.stringify([x.projectId,x.id]),ok=value=>Promise.resolve({ok:true,value});
const nodes=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(nodes)];
const text=e=>React.Children.toArray(e?.props?.children).map(c=>c&&typeof c==='object'?text(c):String(c??'')).join('');
const select=tree=>nodes(tree).find(e=>e.type==='select'),control=tree=>nodes(tree).find(e=>typeof e.type==='function'&&e.type.name==='ActiveCanvasTargets');
const button=(tree,label)=>{const e=nodes(tree).find(e=>e.type==='button'&&text(e)===label);assert.ok(e,label);return e;};
function report(status='resolved'){
 const context=activeCanvasExample();context.candidates[0]={...context.candidates[0],projectId:b.projectId,canvasId:b.id};
 if(status==='ambiguous'){context.status=status;context.resolution=null;context.activeWindowId=null;context.candidates=[{...context.candidates[0],projectId:a.projectId,canvasId:a.id}, {...context.candidates[0],windowId:'2'}];}
 if(status==='not-ready'){context.status=status;context.resolution=null;context.activeWindowId=null;context.candidates=[{...context.candidates[0],rendererReady:false,projectId:null,canvasId:null,revision:null,reason:'canvas-not-ready'}];}
 return{context,workspaces:{canvases:status==='not-ready'?[a]:[a,b],total:status==='not-ready'?1:2,truncated:false}};
}
function apiState(){const state={active:()=>ok(report()),reads:0,calls:0},api={canvasWorkflowSnapshot:()=>ok(null),canvasRunSnapshot:()=>ok(null),canvasTransferSnapshot:()=>ok(null),canvasCandidates:()=>ok([]),canvasWorkspaces:()=>ok({canvases:[a,b],total:2,truncated:false}),canvasActiveTargets:()=>{state.reads++;return state.active();}};return{state,api};}
async function fixture(){
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-active-ui-EXAMPLE-'))),mock=join(root,'react.cjs'),modules={};
 const dispose=()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-active-ui-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});};
 try{writeFileSync(mock,`const React=require(${JSON.stringify(react)});const current=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:v=>current().state(v),useRef:v=>current().ref(v),useId:()=>current().id(),useEffect:(run,deps)=>current().effect(run,deps)};`);
  for(const name of ['CanvasWorkflow','CanvasRun','CanvasTasks','CanvasTransfer','ActiveCanvasTargets']){const file=join(root,name+'.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/'+name+'.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx,'dsh-zhen/remote':remote},external:[react,jsx,remote],logLevel:'silent'});modules[name]=require(file);}
  return{modules,dispose};
 }catch(error){dispose();throw error;}
}
const cases=[['CanvasWorkflow','CanvasWorkflowPanel','读取可用画布'],['CanvasRun','CanvasRunPanel','读取画布'],['CanvasTasks','CanvasTasksPanel','读取可用画布'],['CanvasTransfer','CanvasTransferPanel','读取可用画布']];
for(const [moduleName,exportName,readLabel]of cases){
 test(`C86: ${moduleName} adopts the actual resolved project-qualified target and never falls back while loading`,async()=>{
  const f=await fixture(),{state,api}=apiState(),props={api,online:true,receiptId:'EXAMPLE_RECEIPT',onConnections(){}},driver=clientHooks(f.modules[moduleName][exportName],props);
  try{driver.render();await driver.settle();let tree=driver.render();control(tree).props.onRead();await driver.settle();tree=driver.render();assert.equal(select(tree).props.value,key(b));assert.equal(state.reads,1);
   state.active=()=>ok(report('not-ready'));control(tree).props.onRead();await driver.settle();tree=driver.render();assert.equal(select(tree).props.value,'');const c=control(tree),html=renderToStaticMarkup(React.createElement(c.type,c.props));assert.ok(html.includes('正在加载'));assert.equal(state.reads,2);
  }finally{driver.dispose();f.dispose();}
 });
 test(`C86: ${moduleName} waits for an explicit named choice when native windows are ambiguous`,async()=>{
  const f=await fixture(),{state,api}=apiState();state.active=()=>ok(report('ambiguous'));const driver=clientHooks(f.modules[moduleName][exportName],{api,online:true,receiptId:'EXAMPLE_RECEIPT',onConnections(){}});
  try{driver.render();await driver.settle();control(driver.render()).props.onRead();await driver.settle();let tree=driver.render();assert.equal(select(tree).props.value,'');const c=control(tree),html=renderToStaticMarkup(React.createElement(c.type,c.props));assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);c.props.onChoose('2');tree=driver.render();assert.equal(select(tree).props.value,key(b));assert.equal(state.reads,1);
  }finally{driver.dispose();f.dispose();}
 });
 test(`C86: ${moduleName} ignores a late active reply after a manual choice or API switch`,async()=>{
  const f=await fixture(),{state,api}=apiState(),props={api,online:true,receiptId:'EXAMPLE_RECEIPT',onConnections(){}},driver=clientHooks(f.modules[moduleName][exportName],props);let done;
  try{driver.render();await driver.settle();button(driver.render(),readLabel).props.onClick();await driver.settle();let tree=driver.render();const originalSelect=select(tree);state.active=()=>new Promise(resolve=>{done=resolve;});control(tree).props.onRead();originalSelect.props.onChange({currentTarget:{value:key(a)}});done({ok:true,value:report()});await driver.settle();assert.equal(select(driver.render()).props.value,key(a));
   control(driver.render()).props.onRead();const old=done,next=apiState();driver.render({...props,api:next.api});await driver.settle();old({ok:true,value:report()});await driver.settle();assert.equal(select(driver.render()).props.value,'');assert.equal(control(driver.render()).props.report,undefined);
  }finally{done?.({ok:true,value:report()});driver.dispose();f.dispose();}
 });
}
test('C86: active controls reject stale/mismatched directory revisions and disabled event replay without issuing reads',async()=>{
 const f=await fixture();try{const {ActiveCanvasTargets,activeCanvasTarget}=f.modules.ActiveCanvasTargets,value=report();assert.equal(activeCanvasTarget(value).projectId,b.projectId);assert.equal(activeCanvasTarget(value,undefined,Date.now()+31000),undefined);value.workspaces.canvases=[{...b,revision:8}];assert.equal(activeCanvasTarget(value),undefined);let calls=0;const tree=ActiveCanvasTargets({report:report('ambiguous'),disabled:true,onRead:()=>calls++,onChoose:()=>calls++});for(const node of nodes(tree).filter(e=>e.type==='button'))node.props.onClick();assert.equal(calls,0);}finally{f.dispose();}
});
