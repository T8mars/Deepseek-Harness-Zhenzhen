import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {relative,isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {cssTextPlugin} from '../scripts/css-text.mjs';

test('C42: real esbuild embeds identical CSS for LF, CRLF and CR checkouts without executing a browser',async()=>{
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-css-build-EXAMPLE-'))),css='/* EXAMPLE ONLY */\n.example { color: #123456; }\n@media (prefers-reduced-motion: reduce) { .example { animation: none; } }\n';
 try{
  const bundles=[];
  for(const newline of ['\n','\r\n','\r']){
   writeFileSync(join(root,'EXAMPLE.css'),css.replaceAll('\n',newline));
   const result=await build({absWorkingDir:root,stdin:{contents:"import css from './EXAMPLE.css'; export default css;",resolveDir:root,sourcefile:'EXAMPLE_ENTRY.js'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'text'},plugins:[cssTextPlugin()]});
   bundles.push(result.outputFiles[0].text);
  }
  assert.equal(bundles[1],bundles[0]);assert.equal(bundles[2],bundles[0]);assert.ok(bundles[0].includes('prefers-reduced-motion'));
 }finally{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true});}
});

test('C42: non-CSS text retains original bytes through the same esbuild plugin',async()=>{
 const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-text-build-EXAMPLE-')));
 try{
  const outputs=[];
  for(const text of ['EXAMPLE\nUNCHANGED','EXAMPLE\r\nUNCHANGED']){
   writeFileSync(join(root,'EXAMPLE.txt'),text);
   outputs.push((await build({absWorkingDir:root,stdin:{contents:"import text from './EXAMPLE.txt'; export default text;",resolveDir:root,sourcefile:'EXAMPLE_ENTRY.js'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.txt':'text'},plugins:[cssTextPlugin()]})).outputFiles[0].text);
  }
  assert.notEqual(outputs[0],outputs[1]);
 }finally{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true});}
});
