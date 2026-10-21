import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {extractDocxText} from '../packages/dsh-zhen/lib/docx-text.js';
import {extractPdfPages} from '../packages/dsh-zhen/lib/pdf-text.js';
import {exampleDocx} from './fixtures/docx-document.mjs';

const cases=[
  {kind:'Word',extract:extractDocxText,input:exampleDocx(),reply:{ok:true,text:'EXAMPLE_BODY'}},
  {kind:'PDF',extract:extractPdfPages,input:Buffer.from('%PDF-1.4\nEXAMPLE_PARENT_ONLY'),reply:{ok:true,pageCount:1,pages:[{page:1,text:'EXAMPLE_BODY'}]}},
];
function childFixture(reply){
  const child=new EventEmitter();child.killed=false;child.killCalls=0;child.closed=false;
  const close=code=>{if(child.closed)return;child.closed=true;child.emit('close',code);};
  child.kill=()=>{child.killCalls++;child.killed=true;queueMicrotask(()=>close(1));return true;};
  child.send=(_message,callback)=>{callback?.();queueMicrotask(()=>{child.emit('message',reply);if(!child.killed)close(0);});};
  return child;
}
async function withSpawn(replacement,work){
  const original=childProcess.spawn;childProcess.spawn=replacement;syncBuiltinESMExports();
  try{await work();}finally{childProcess.spawn=original;syncBuiltinESMExports();}
}
const authorityError=(error,kind)=>error instanceof Error&&error.message===`资料权限已变化，${kind} 导入已停止。`&&!error.message.includes('EXAMPLE_PRIVATE')&&error.cause===undefined;

for(const item of cases){
test(`C90: ${item.kind} queued revocation exposes only the fixed authority message and starts no child`,async()=>{
  let spawns=0;await withSpawn(()=>{spawns++;throw Error('EXAMPLE_UNEXPECTED_SPAWN');},async()=>{
    await assert.rejects(item.extract(item.input,()=>{throw Error('EXAMPLE_PRIVATE_SOURCE_REASON');}),error=>authorityError(error,item.kind));
  });assert.equal(spawns,0);
});

test(`C90: ${item.kind} immediate worker replies deterministically redact revocation and reap before rejecting`,async()=>{
  const child=childFixture(item.reply);let checks=0;await withSpawn(()=>child,async()=>{
    await assert.rejects(item.extract(item.input,()=>{if(++checks===2)throw Error('EXAMPLE_PRIVATE_SOURCE_REASON');}),error=>authorityError(error,item.kind));
  });assert.equal(checks,2);assert.equal(child.killCalls,1);assert.equal(child.closed,true);
});

test(`C90: ${item.kind} final-close revocation remains fixed and a successful next decode releases the queue`,async()=>{
  let checks=0;const denied=childFixture(item.reply);await withSpawn(()=>denied,async()=>{
    await assert.rejects(item.extract(item.input,()=>{if(++checks===3)throw {example:'EXAMPLE_PRIVATE_NON_ERROR'};}),error=>authorityError(error,item.kind));
  });assert.equal(checks,3);assert.equal(denied.closed,true);
  const allowed=childFixture(item.reply);await withSpawn(()=>allowed,async()=>{const result=await item.extract(item.input);assert.ok(result);});assert.equal(allowed.closed,true);assert.equal(allowed.killCalls,0);
});
}
