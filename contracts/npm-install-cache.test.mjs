import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {findNpmCli} from '../scripts/start-local.mjs';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {npmCacheDirectory,sameNpmCache,npmInstallEnvironment} from './fixtures/npm-install-cache.mjs';

test('C204: scrubbing install credentials preserves npm cache and installer-only network routing',{timeout:60000},async()=>{
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-npm-cache-EXAMPLE-'))),lease=ownedTempCleanup(base,root,'dsh-npm-cache-EXAMPLE-',{budgetMs:30000});
 await withOwnedTempCleanup(lease,async()=>{
  const npm=findNpmCli(),user=join(root,'EXAMPLE_user.npmrc'),global=join(root,'EXAMPLE_global.npmrc'),selected=join(root,'EXAMPLE_parent_cache');await writeFile(user,'registry=https://registry.npmjs.org/\n');await writeFile(global,'');
  const flags=['--userconfig',user,'--globalconfig',global],clean=mcpChildEnvironment({}),parent=npmCacheDirectory(npm,{cwd:root,env:{...clean,NPM_CONFIG_CACHE:selected},flags}),legacy=npmCacheDirectory(npm,{cwd:root,env:clean,flags});
  assert.equal(sameNpmCache(parent,selected),true);assert.equal(sameNpmCache(legacy,parent),false,'The original scrubbed child loses a configured cache.');
  const child=npmCacheDirectory(npm,{cwd:root,env:clean,flags:[...flags,'--cache',parent]});assert.equal(sameNpmCache(child,parent),true);assert.equal(Object.keys(clean).some(name=>/npm_config_cache/i.test(name)),false);
  const requests=[],server=createServer((request,response)=>{requests.push({url:request.url,authorization:request.headers.authorization});response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({name:'example-proxy-fixture','dist-tags':{latest:'0.0.0-EXAMPLE.0'},versions:{'0.0.0-EXAMPLE.0':{name:'example-proxy-fixture',version:'0.0.0-EXAMPLE.0'}}}));});
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  try{
   const proxy='http://127.0.0.1:'+server.address().port,{environment:network}=npmInstallEnvironment(clean,{HTTP_PROXY:proxy,HTTPS_PROXY:proxy,NO_PROXY:'',SEEDANCE_API_KEY:'EXAMPLE_NOT_FOR_INSTALLER',ACTIONS_RUNTIME_TOKEN:'EXAMPLE_NOT_FOR_INSTALLER'});assert.equal(network.SEEDANCE_API_KEY,undefined);assert.equal(network.ACTIONS_RUNTIME_TOKEN,undefined);assert.equal(clean.HTTP_PROXY,undefined);
   const value=await new Promise((done,reject)=>execFile(process.execPath,[npm,'view','example-proxy-fixture@0.0.0-EXAMPLE.0','version','--registry','http://example.invalid/',...flags,'--cache',parent,'--fetch-retries=0','--fetch-timeout=5000','--no-update-notifier','--ignore-scripts','--loglevel=error'],{cwd:root,env:network,windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:65536},(error,stdout)=>error?reject(Error('EXAMPLE_NPM_PROXY_READ_FAILED')):done(stdout.trim())));assert.equal(value,'0.0.0-EXAMPLE.0');assert.ok(requests.length>0);assert.ok(requests.every(x=>x.url==='http://example.invalid/example-proxy-fixture'&&x.authorization===undefined));
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
  console.log(JSON.stringify({contract:'C204',actualNpmConfigCommands:true,configuredParentCachePreserved:true,originalScrubbedCacheMismatchReproduced:true,actualNpmRegistryReadThroughOwnedProxy:true,proxyRegistryRequests:requests.length,applicationSecretsNotForwarded:true,sdkEnvironmentStillScrubbed:true,childCredentialEnvironmentStillScrubbed:true,cacheDirectoryNotPrinted:true,networkDisabledForLookup:true,modelRequests:0,nativeWrites:0}));
 });
});
