import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';import {join,resolve,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {build} from 'esbuild';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);function nodes(element){if(!element||typeof element!=='object')return [];return[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];}
test('C55: actual setup choices recommend desktop, bind the reviewed fingerprint, block duplicate disabled events and escape metadata',async()=>{
 const temp=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(temp,'dsh-setup-ui-EXAMPLE-')));
 try{
  const file=join(root,'EXAMPLE_CHOICES.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/CanvasConnectionChoices.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:require.resolve('react'),'react/jsx-runtime':require.resolve('react/jsx-runtime')},logLevel:'silent'});
  const {CanvasConnectionChoices}=require(file),calls=[],base={root:'<script>EXAMPLE</script>',digest:'a'.repeat(64),cliVersion:'0.1.0-dev',skillVersion:'0.1.0-dev',nodeSchemaDigest:'b'.repeat(64),providerCatalogDigest:'c'.repeat(64)},props={busy:false,onConnect:(...args)=>calls.push(args),discovery:{candidates:[{...base,source:'running-desktop'},{...base,root:'EXAMPLE_BACKUP',source:'managed'}],issues:[]}};
  const buttons=nodes(CanvasConnectionChoices(props)).filter(item=>item.type==='button');assert.equal(buttons[0].props.children,'连接这台画布');buttons[0].props.onClick();assert.deepEqual(calls,[[base.root,base.digest]]);
  for(const button of nodes(CanvasConnectionChoices({...props,busy:true})).filter(item=>item.type==='button')){assert.equal(button.props.disabled,true);button.props.onClick();}assert.equal(calls.length,1);
  const html=renderToStaticMarkup(React.createElement(CanvasConnectionChoices,props));assert.ok(html.includes('正在运行的桌面画布（推荐）'));assert.ok(html.includes('&lt;script&gt;EXAMPLE&lt;/script&gt;'));assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<input'),false);
  const empty=renderToStaticMarkup(React.createElement(CanvasConnectionChoices,{...props,discovery:{candidates:[],issues:[]}}));assert.ok(empty.includes('启动桌面画布'));assert.ok(empty.includes('修复 Agent 工具'));
 }finally{const part=relative(temp,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..'));rmSync(root,{recursive:true,force:true});}
});
