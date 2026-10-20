import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('C49: actual model select blocks unavailable choices, clears synchronously and escapes stale custom model labels',async()=>{
 const temp=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(temp,'dsh-model-ui-EXAMPLE-')));
 try{
  const file=join(root,'EXAMPLE_MODEL_UI.cjs');await build({entryPoints:[resolve('packages/dsh-zhen/src/client/CanvasModelOptions.tsx')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{react:require.resolve('react'),'react/jsx-runtime':require.resolve('react/jsx-runtime')},logLevel:'silent'});const {NativeModelSelect}=require(file),calls=[],props={id:'EXAMPLE_MODEL_SELECT',disabled:false,onChange:value=>calls.push(value),page:{projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',kind:'image',query:'',total:2,truncated:false,items:[{id:'EXAMPLE_READY',kind:'image',provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_READY_MODEL',executable:true,credentialReady:true,requiresRuntimeCheck:true},{id:'EXAMPLE_BLOCKED',kind:'image',provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_BLOCKED_MODEL',executable:false,credentialReady:false,requiresRuntimeCheck:true}]}};
  const select=NativeModelSelect(props),change=value=>{const event={currentTarget:{value}};select.props.onChange(event);event.currentTarget=null;};change('EXAMPLE_BLOCKED');change('EXAMPLE_FORGED');assert.equal(calls.length,0);change('EXAMPLE_READY');assert.deepEqual(calls[0],{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_READY_MODEL'});change('');assert.equal(calls[1],undefined);
  const html=renderToStaticMarkup(React.createElement(NativeModelSelect,{...props,choice:{provider:'EXAMPLE_PROVIDER',model:'<script>EXAMPLE</script>'}}));assert.match(html,/<option\b(?=[^>]*value="EXAMPLE_BLOCKED")(?=[^>]*disabled="")/);assert.ok(html.includes('&lt;script&gt;EXAMPLE&lt;/script&gt;'));assert.equal(html.includes('<script>'),false);assert.match(html,/<option\b(?=[^>]*value="__selected__")(?=[^>]*selected="")/);assert.ok(html.includes('待重新读取核对'));
 }finally{const part=relative(temp,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
