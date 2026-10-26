import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,realpathSync,rmSync} from 'node:fs';import {join,resolve,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {build} from 'esbuild';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {clientHooks} from './fixtures/client-hooks.mjs';
const require=createRequire(import.meta.url),react=require.resolve('react'),jsx=require.resolve('react/jsx-runtime');
const a={projectId:'EXAMPLE_A',id:'EXAMPLE_SHARED',name:'EXAMPLE alpha',revision:1},b={...a,projectId:'EXAMPLE_B',name:'<script>EXAMPLE beta</script>'};
const key=item=>JSON.stringify([item.projectId,item.id]),ok=value=>Promise.resolve({ok:true,value});
function nodes(element){if(!element||typeof element!=='object')return[];return[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];}
function text(element){return React.Children.toArray(element.props?.children).map(child=>child&&typeof child==='object'?text(child):String(child??'')).join('');}
function button(tree,label){const item=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(item,label);return item;}
async function fixture(){
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-target-ui-EXAMPLE-'))),mock=join(root,'EXAMPLE_REACT.cjs');
 writeFileSync(mock,`const React=require(${JSON.stringify(react)});const current=()=>globalThis.__DSH_EXAMPLE_TARGET_HOOKS;module.exports={...React,useState:value=>current().state(value),useRef:value=>current().ref(value),useId:()=>current().id(),useEffect:(run,deps)=>current().effect(run,deps)};`);
 const modules={};
 for(const name of['CanvasWorkflow','CanvasRun','CanvasTransfer','CanvasTasks']){const file=join(root,name+'.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/'+name+'.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:mock,'react/jsx-runtime':jsx,'dsh-zhen/remote':resolve('packages/dsh-zhen/lib/remote.js')},external:[react,jsx,resolve('packages/dsh-zhen/lib/remote.js')],logLevel:'silent'});modules[name]=require(file);}
 return{modules,dispose(){delete globalThis.__DSH_EXAMPLE_TARGET_HOOKS;const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}};
}
function apiState(){const state={report:{canvases:[a,b],total:2,truncated:false},calls:[],transfer:null};const api={canvasWorkflowSnapshot:()=>ok(null),canvasRunSnapshot:()=>ok(null),canvasTransferSnapshot:()=>ok(state.transfer),canvasCandidates:()=>ok([]),canvasWorkspaces:()=>ok(structuredClone(state.report)),canvasWorkflowPreview:input=>{state.calls.push(input);return ok(null);},canvasTransferPreview:input=>{state.calls.push(input);return ok(null);},canvasRunNodes:(projectId,canvasId)=>{state.calls.push({projectId,canvasId});return ok({projectId,canvasId,revision:1,nodes:[],nextOffset:0});},canvasTasksList:input=>{state.calls.push(input);return ok({items:[]});}};return{state,api};}

test('C65: transfer setup stays out of an empty task page and appears when a saved result is selected',async()=>{
 const f=await fixture(),{api,state}=apiState(),props={api,receiptId:'',onConnections(){}},driver=clientHooks(f.modules.CanvasTransfer.CanvasTransferPanel,props);
 try{
  driver.render();await driver.settle();assert.equal(driver.render(),null);assert.equal(state.calls.length,0);
  let tree=driver.render({...props,receiptId:'EXAMPLE_RECEIPT'});await driver.settle();tree=driver.render();
  assert.ok(button(tree,'核对所选保存结果'));assert.equal(nodes(tree).filter(node=>node.type==='select').length,1);
  const html=renderToStaticMarkup(tree);assert.equal(html.includes('单独开启'),false);assert.ok(html.includes('默认申请全部创作能力'));assert.equal(state.calls.length,0);
 }finally{driver.dispose();f.dispose();}
});

test('C65: an existing transfer remains recoverable without selecting the saved result again',async()=>{
 const f=await fixture(),{api,state}=apiState();
 state.transfer={id:'EXAMPLE_TRANSFER',receiptId:'EXAMPLE_RECEIPT',phase:'pending',stage:'import',projectId:a.projectId,canvasId:a.id,canvasRevision:1,file:{name:'EXAMPLE.png',mime:'image/png',size:10,sha256:'a'.repeat(64)},maxImportBytes:100};
 const completed=[];api.canvasTransferComplete=id=>{completed.push(id);return ok(state.transfer);};
 const driver=clientHooks(f.modules.CanvasTransfer.CanvasTransferPanel,{api,receiptId:'',onConnections(){}});
 try{
  driver.render();await driver.settle();let tree=driver.render();assert.equal(nodes(tree).filter(node=>node.type==='select').length,0);
  button(tree,'检查窗口审批并导入').props.onClick();await driver.settle();tree=driver.render();
  assert.deepEqual(completed,['EXAMPLE_TRANSFER']);assert.equal(state.calls.length,0);assert.ok(text(tree).includes('EXAMPLE.png'));
 }finally{driver.dispose();f.dispose();}
});

test('C209: production workflow review exposes changed characters and retained original after reload without prechecking approval',async()=>{
 const f=await fixture();let driver;
 try{
  const {api}=apiState(),view={id:'EXAMPLE_PREVIEW',projectId:a.projectId,canvasId:a.id,phase:'preview',ready:true,action:'create.image',goal:'EXAMPLE: A1 <script>EXAMPLE</script>',requestedGoal:'EXAMPLE：Ａ① <script>EXAMPLE</script>',canvasRevision:1,candidates:1,operationCount:3,models:[],questions:[],planId:'EXAMPLE_PLAN',planDigest:'a'.repeat(64)};
  api.canvasWorkflowSnapshot=()=>ok(view);
  driver=clientHooks(f.modules.CanvasWorkflow.CanvasWorkflowPanel,{api,online:true});driver.render();await driver.settle();
  const tree=driver.render(),all=nodes(tree),notice=all.find(node=>node.props?.role==='status'&&text(node).includes('画布已规范化'));
  assert.ok(notice);assert.ok(all.some(node=>node.type==='pre'&&text(node)===view.goal));assert.ok(all.some(node=>node.type==='pre'&&text(node)===view.requestedGoal));
  const confirmation=all.find(node=>node.type==='input'&&node.props.type==='checkbox');assert.equal(confirmation.props.checked,false);assert.equal(button(tree,'送到画布窗口确认').props.disabled,true);
  const original=all.find(node=>node.type==='details'&&text(node).startsWith('查看本次输入原文'));assert.ok(original);assert.equal(original.props.open,undefined);
  const html=renderToStaticMarkup(original);assert.equal(html.includes('<script>'),false);assert.ok(html.includes('&lt;script&gt;'));
 }finally{driver?.dispose();f.dispose();}
});

test('C65: actual workflow/run/transfer/task handlers preserve project-qualified choices and stop after the selected canvas disappears',async()=>{
 const f=await fixture();
 try{
  const cases=[['CanvasWorkflow','CanvasWorkflowPanel','读取可用画布',null],['CanvasRun','CanvasRunPanel','读取画布','读取当前节点'],['CanvasTransfer','CanvasTransferPanel','读取可用画布','核对所选保存结果'],['CanvasTasks','CanvasTasksPanel','读取可用画布','读取 / 刷新原生任务']];
  for(const[name,exportName,read,submit]of cases){
   const {state,api}=apiState(),driver=clientHooks(f.modules[name][exportName],{api,online:true,receiptId:'EXAMPLE_RECEIPT',onConnections(){}});
   const render=()=>driver.render(),select=tree=>nodes(tree).find(node=>node.type==='select');
   try{
    let tree=render();await driver.settle();tree=render();button(tree,read).props.onClick();await driver.settle();tree=render();assert.equal(select(tree).props.value,'',name+' must not select the first of several canvases.');
    const execute=tree=>{if(submit)button(tree,submit).props.onClick();else nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});};
    execute(tree);await driver.settle();assert.equal(state.calls.length,0);
    const event={currentTarget:{value:key(b)}};select(render()).props.onChange(event);event.currentTarget=null;
    tree=render();if(!submit){nodes(tree).find(node=>node.type==='textarea').props.onChange({currentTarget:{value:'EXAMPLE goal'}});tree=render();const model=nodes(tree).find(node=>typeof node.type==='function'&&node.type.name.startsWith('CanvasModelOptions'));assert.equal(model.props.projectId,b.projectId);assert.equal(model.props.canvasId,b.id);}
    const html=renderToStaticMarkup(select(tree));assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);
    state.report={canvases:[b,a],total:2,truncated:false};button(tree,read).props.onClick();await driver.settle();tree=render();assert.equal(select(tree).props.value,key(b),name+' must retain identity across reorder.');
    execute(tree);await driver.settle();assert.deepEqual(state.calls.at(-1).projectId,b.projectId);assert.deepEqual(state.calls.at(-1).canvasId,b.id);
    state.report={canvases:[a],total:1,truncated:false};tree=render();button(tree,read).props.onClick();await driver.settle();tree=render();assert.equal(select(tree).props.value,'',name+' must not replace a removed selection with another singleton.');
    const before=state.calls.length;execute(tree);await driver.settle();assert.equal(state.calls.length,before);
   }finally{driver.dispose();}
  }
 }finally{f.dispose();}
});

test('C65: late metadata from an old API cannot repopulate selection, and transfer approval notices a different project with the same canvas id',async()=>{
 const f=await fixture();let driver;
 try{
  const first=apiState();let deliver;first.api.canvasWorkspaces=()=>new Promise(done=>{deliver=value=>done({ok:true,value});});
  driver=clientHooks(f.modules.CanvasWorkflow.CanvasWorkflowPanel,{api:first.api,online:true});let tree=driver.render();await driver.settle();tree=driver.render();button(tree,'读取可用画布').props.onClick();
  const next=apiState();driver.render({api:next.api,online:true});await driver.settle();deliver({canvases:[a],total:1,truncated:false});await driver.settle();tree=driver.render();assert.equal(nodes(tree).find(node=>node.type==='select').props.value,'');assert.equal(nodes(tree).filter(node=>node.type==='option'&&node.props.value===key(a)).length,0);driver.dispose();driver=undefined;
  const current=apiState();current.state.transfer={id:'EXAMPLE_TRANSFER',receiptId:'EXAMPLE_RECEIPT',phase:'preview',stage:'import',projectId:a.projectId,canvasId:a.id,canvasRevision:1,file:{name:'EXAMPLE.png',mime:'image/png',size:10,sha256:'a'.repeat(64)},maxImportBytes:100};
  driver=clientHooks(f.modules.CanvasTransfer.CanvasTransferPanel,{api:current.api,receiptId:'EXAMPLE_RECEIPT',onConnections(){}});tree=driver.render();await driver.settle();tree=driver.render();button(tree,'读取可用画布').props.onClick();await driver.settle();tree=driver.render();nodes(tree).find(node=>node.type==='select').props.onChange({currentTarget:{value:key(b)}});tree=driver.render();assert.equal(button(tree,'送到画布窗口确认导入').props.disabled,true);assert.equal(current.state.calls.length,0);
 }finally{driver?.dispose();f.dispose();}
});
