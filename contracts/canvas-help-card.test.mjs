import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtempSync,realpathSync,writeFileSync,mkdirSync,readFileSync,rmSync,existsSync}from'node:fs';import{join,resolve,relative,isAbsolute}from'node:path';import{tmpdir}from'node:os';import{createRequire}from'node:module';import{build}from'esbuild';import React from'react';import{renderToStaticMarkup}from'react-dom/server';
import{Context}from'@deepseek-ai/cordis';import Prompt from'@deepseek-ai/dsh-system-prompt';import Tools from'@deepseek-ai/dsh-tools';import ZhenService from'../packages/dsh-zhen/lib/index.js';
const require=createRequire(import.meta.url),packet={schema:'dsh-zhen-canvas-help-v1',entry:'connections',notice:'请打开画布连接，按页面提示检测画布并完成窗口配对。此引导不会连接画布、批准操作或生成作品。'},block=value=>({isError:false,content:[{type:'text',text:JSON.stringify(value)}]}),nodes=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(nodes)];
function temporary(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-canvas-help-EXAMPLE-')));t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part));rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});return root;}
async function ui(t,full=false){const root=temporary(t),file=join(root,full?'client.cjs':'card.cjs');await build({entryPoints:[resolve(full?'packages/dsh-zhen/src/client/index.tsx':'packages/dsh-zhen/src/client/CanvasHelpTool.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'text'},alias:{react:require.resolve('react'),'react/jsx-runtime':require.resolve('react/jsx-runtime'),zod:require.resolve('zod'),'dsh-zhen/remote':resolve('packages/dsh-zhen/lib/remote.js'),'@deepseek-ai/dsh-typert-protocol/remote-info':require.resolve('@deepseek-ai/dsh-typert-protocol/remote-info')},logLevel:'silent'});return require(file);}
for(const damaged of[false,true])test('C106: published Host exposes a pure help card without Canvas tools, credentials or config reads damaged='+damaged,async t=>{
  const root=temporary(t),previous=process.env.DSH_HOME,ctx=new Context(),originalFetch=globalThis.fetch;process.env.DSH_HOME=root;let network=0,keys=0;globalThis.fetch=async()=>{network++;throw Error('EXAMPLE_NO_NETWORK');};ctx.provide('credentials',{resolve:async()=>{keys++;throw Error('EXAMPLE_NO_KEY');}});
  try{await ctx.plugin(Prompt);await ctx.plugin(Tools);const fork=await ctx.plugin(ZhenService);const file=join(root,'dsh-zhen','canvas.json');if(damaged){mkdirSync(join(root,'dsh-zhen'),{recursive:true});writeFileSync(file,'{EXAMPLE_INVALID_JSON');}const before=existsSync(file)?readFileSync(file):null;assert.equal(ctx.tools.schemas().filter(row=>row.name.startsWith('mcp__t8canvas__')).length,0);assert.ok(ctx.tools.schemas().some(row=>row.name==='zhen_canvas_help'));
    const result=await ctx.tools.execute({callId:'EXAMPLE_HELP',name:'zhen_canvas_help',arguments:{},agent:{session:{id:'EXAMPLE_SESSION'},options:{provider:'seedance'}},signal:new AbortController().signal});assert.equal(result.isError,false);const content=result.content.filter(row=>row.type==='text');assert.equal(content.length,1);assert.deepEqual(JSON.parse(content[0].text),packet);assert.equal(keys,0);assert.equal(network,0);assert.deepEqual(existsSync(file)?readFileSync(file):null,before);await fork.dispose();assert.equal(ctx.tools.schemas().some(row=>row.name==='zhen_canvas_help'),false);
  }finally{await ctx.fiber.dispose();globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;}
});
test('C106: card accepts one bounded fixed help record and rejects altered, ambiguous, oversized and error records',async t=>{
  const{validCanvasHelp}=await ui(t);assert.equal(validCanvasHelp(block(packet)),true);for(const value of[{...packet,entry:'settings'},{...packet,notice:'<script>EXAMPLE_UNTRUSTED</script>'},{...packet,root:'EXAMPLE_PRIVATE'},{}])assert.equal(validCanvasHelp(block(value)),false);assert.equal(validCanvasHelp({...block(packet),isError:true}),false);assert.equal(validCanvasHelp({isError:false,content:[...block(packet).content,...block(packet).content]}),false);assert.equal(validCanvasHelp({isError:false,content:[{type:'text',text:'😀'.repeat(2100)}]}),false);assert.equal(validCanvasHelp({isError:false,content:[{type:'text',text:'{EXAMPLE_INVALID'}]}),false);
});
test('C106: pending, successful and legacy help cards keep a keyboard button and never display raw tool content',async t=>{
  const{CanvasHelpCard,CanvasHelpToolView}=await ui(t);let opens=0,inspects=0;for(const props of[{phase:'pending'},{phase:'result',block:block(packet)},{phase:'result',block:block({notice:'<script>EXAMPLE_UNTRUSTED</script>'})}]){const view=CanvasHelpToolView({...props,onOpen:()=>opens++,inspect:()=>inspects++}),tree=view.type(view.props),buttons=nodes(tree).filter(row=>row.type==='button');assert.equal(buttons.length,2);assert.ok(buttons.every(row=>row.props.type==='button'));buttons[0].props.onClick();buttons[1].props.onClick();const html=renderToStaticMarkup(React.createElement(CanvasHelpCard,view.props));assert.ok(html.includes('打开画布连接'));assert.ok(html.includes('分别确认'));assert.equal(html.includes('EXAMPLE_UNTRUSTED'),false);assert.equal(html.includes('已连接'),false);}assert.equal(opens,3);assert.equal(inspects,3);
});
test('C106: actual client slot and help-button handler select the existing connections route before workspace mount',async t=>{
  const client=await ui(t,true),slots=[],panels=[];let mounted=0;
  const api=new Proxy({},{get(){return()=>{throw Error('EXAMPLE_NO_REMOTE_ACTION');};}});
  const ctx={
    configForms:{get:()=>({})},
    remote:{$mount:async()=>{mounted++;return()=>{};},zhen:api},effect:()=>{},
    inject(_names,run){return run(ctx);},layout:{selectPanel:id=>panels.push(id)},
    slots:{inject(_name,run){return run();},register(spec,component){slots.push({spec,component});}},
  };
  await client.apply(ctx);assert.equal(mounted,1);
  const main=slots.find(row=>row.spec.name==='main'),help=slots.find(row=>row.spec.name==='tool.call.toolview'&&row.spec.key==='zhen_canvas_help');assert.ok(main&&help);
  const navigation=main.spec.inject().navigation;assert.equal(navigation.current(),'home');
  const view=help.component({phase:'result',block:block(packet),callId:'EXAMPLE_CALL'}),card=view.type(view.props),tree=card.type(card.props);
  nodes(tree).find(row=>row.type==='button'&&row.props.children==='打开画布连接').props.onClick();
  assert.equal(navigation.current(),'connections');assert.deepEqual(panels,['zhen']);
  console.log(JSON.stringify({contract:'C106',actualPublishedHostTool:true,fixedNavigationMetadata:true,actualClientSlotAndButtonHandler:true,existingConnectionsRouteSelected:true,remoteMutations:0,nativeWrites:0,modelRequests:0}));
});
