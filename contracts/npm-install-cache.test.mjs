import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findNpmCli} from '../scripts/start-local.mjs';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {npmCacheDirectory,sameNpmCache} from './fixtures/npm-install-cache.mjs';

test('C204: scrubbing install credentials must retain the parent npm cache selection',{timeout:60000},async()=>{
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-npm-cache-EXAMPLE-'))),lease=ownedTempCleanup(base,root,'dsh-npm-cache-EXAMPLE-',{budgetMs:30000});
 await withOwnedTempCleanup(lease,async()=>{
  const npm=findNpmCli(),user=join(root,'EXAMPLE_user.npmrc'),global=join(root,'EXAMPLE_global.npmrc'),selected=join(root,'EXAMPLE_parent_cache');await writeFile(user,'registry=https://registry.npmjs.org/\n');await writeFile(global,'');
  const flags=['--userconfig',user,'--globalconfig',global],clean=mcpChildEnvironment({}),parent=npmCacheDirectory(npm,{cwd:root,env:{...clean,NPM_CONFIG_CACHE:selected},flags}),legacy=npmCacheDirectory(npm,{cwd:root,env:clean,flags});
  assert.equal(sameNpmCache(parent,selected),true);assert.equal(sameNpmCache(legacy,parent),false,'The original scrubbed child loses a configured cache.');
  const child=npmCacheDirectory(npm,{cwd:root,env:clean,flags:[...flags,'--cache',parent]});assert.equal(sameNpmCache(child,parent),true);assert.equal(Object.keys(clean).some(name=>/npm_config_cache/i.test(name)),false);
  console.log(JSON.stringify({contract:'C204',actualNpmConfigCommands:true,configuredParentCachePreserved:true,originalScrubbedCacheMismatchReproduced:true,childCredentialEnvironmentStillScrubbed:true,cacheDirectoryNotPrinted:true,networkDisabledForLookup:true,modelRequests:0,nativeWrites:0}));
 });
});
