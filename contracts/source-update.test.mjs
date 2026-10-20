import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,existsSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import WebServer from '@deepseek-ai/dsh-host-webserver';
import {SOURCE_REPOSITORY,setSourceAutomatic,updateSource} from '../scripts/source-update.mjs';
import {sourceAwareStart} from '../scripts/source-start.mjs';

test('C39: an actual published DSH webserver prevents source-update fetch, code replacement and dependency preparation before any real data access',async()=>{
  const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-source-host-contract-EXAMPLE-'))),ctx=new Context();let gitCalls=0,starts=0,network=0;
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'dsh-zhen-workspace'}));writeFileSync(join(root,'meta.json'),JSON.stringify({name:'DSH-zhen',repository:SOURCE_REPOSITORY}));mkdirSync(join(root,'.runtime/dsh-home'),{recursive:true});writeFileSync(join(root,'.runtime/dsh-home/EXAMPLE_LOCAL_DATA'),'EXAMPLE_UNCHANGED');setSourceAutomatic(root,true);
  const original=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('EXAMPLE_NO_NETWORK');};
  try{
    await ctx.plugin(WebServer,{host:'127.0.0.1',port:0});assert.ok(Number.isSafeInteger(ctx.webServer.port)&&ctx.webServer.port>0);
    await assert.rejects(sourceAwareStart({root,flags:['--check','--no-open'],start:async()=>{starts++;},update:options=>updateSource({...options,port:ctx.webServer.port,gitRunner:async()=>{gitCalls++;throw Error('EXAMPLE_GIT_MUST_NOT_RUN');}})}),/already in use/);
    assert.equal(gitCalls,0);assert.equal(starts,0);assert.equal(network,0);assert.equal(readFileSync(join(root,'.runtime/dsh-home/EXAMPLE_LOCAL_DATA'),'utf8'),'EXAMPLE_UNCHANGED');assert.equal(existsSync(join(root,'.runtime/launch-lock.json')),false);assert.equal(existsSync(join(root,'node_modules')),false);
  }finally{globalThis.fetch=original;await ctx.fiber.dispose();const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true});}
});
