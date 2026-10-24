import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';
import {npmInstallEnvironment} from './fixtures/npm-install-cache.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';

test('C205: the public CLI package manager retains installer routing without forwarding application credentials',{timeout:60000},async()=>{
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-cli-transport-EXAMPLE-'))),lease=ownedTempCleanup(base,root,'dsh-cli-transport-EXAMPLE-',{budgetMs:30000});
 await withOwnedTempCleanup(lease,async()=>{
  const user=join(root,'EXAMPLE_user.npmrc'),global=join(root,'EXAMPLE_global.npmrc');await writeFile(user,'');await writeFile(global,'');
  const clean=mcpChildEnvironment({CI:'true',DSH_HOME:join(root,'EXAMPLE_home'),NPM_CONFIG_USERCONFIG:user,NPM_CONFIG_GLOBALCONFIG:global,NPM_CONFIG_CACHE:join(root,'EXAMPLE_cache')});
  const requests=[],server=createServer((request,response)=>{requests.push({url:request.url,authorization:request.headers.authorization});response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({name:'example-proxy-fixture','dist-tags':{latest:'0.0.0-EXAMPLE.0'},versions:{'0.0.0-EXAMPLE.0':{name:'example-proxy-fixture',version:'0.0.0-EXAMPLE.0'}}}));});
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  try{
   const proxy='http://127.0.0.1:'+server.address().port,{environment,transportKeys}=npmInstallEnvironment(clean,{HTTP_PROXY:proxy,HTTPS_PROXY:proxy,NO_PROXY:'',SEEDANCE_API_KEY:'EXAMPLE_NOT_FOR_INSTALLER',ACTIONS_RUNTIME_TOKEN:'EXAMPLE_NOT_FOR_INSTALLER'});
   assert.equal(environment.SEEDANCE_API_KEY,undefined);assert.equal(environment.ACTIONS_RUNTIME_TOKEN,undefined);assert.equal(clean.HTTP_PROXY,undefined);assert.deepEqual(transportKeys,['HTTPS_PROXY','HTTP_PROXY','NO_PROXY']);
   const pathKey=Object.keys(environment).find(key=>key.toLowerCase()==='path')??'PATH';environment[pathKey]=resolve('node_modules/.bin')+delimiter+(environment[pathKey]??'');
   const output=await new Promise((done,reject)=>execFile(process.execPath,[resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'),'plugin','--profile','example','view','example-proxy-fixture@0.0.0-EXAMPLE.0','version','--registry=http://example.invalid/','--fetch-retries=0','--fetch-timeout=5000'],{cwd:root,env:environment,windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:65536},(error,stdout)=>error?reject(Error('EXAMPLE_PUBLIC_CLI_PROXY_READ_FAILED '+JSON.stringify({exit:error.code,signal:error.signal}))):done(stdout.trim())));
   assert.equal(output,'0.0.0-EXAMPLE.0');assert.ok(requests.length>0);assert.ok(requests.every(item=>item.url==='http://example.invalid/example-proxy-fixture'&&item.authorization===undefined),JSON.stringify(requests.map(item=>({path:new URL(item.url,'http://example.invalid').pathname,authorized:item.authorization!==undefined}))));
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
 });
});
