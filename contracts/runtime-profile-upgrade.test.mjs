import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseDocument} from 'yaml';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';
import {profileFacts} from '../scripts/upstream-policy.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {PINNED_DSH_VERSION} from './fixtures/pinned-runtime.mjs';
import {previousRuntimeProject} from './fixtures/previous-runtime-project.mjs';
import {npmCacheDirectory,sameNpmCache} from './fixtures/npm-install-cache.mjs';

const require=createRequire(import.meta.url),currentAnchor=require.resolve('@deepseek-ai/dsh/package.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
function installDiagnostics(stdout,stderr,started){
 const output=String(stdout??'')+'\n'+String(stderr??'');
 const phases=Object.fromEntries([...output.matchAll(/npm timing (idealTree|reify|command:ci|npm) Completed in (\d+)ms/g)].map(row=>[row[1],Number(row[2])]));
 return{elapsedMs:Math.round(performance.now()-started),installMode:'ci',cacheMode:'standard-integrity-checked',freshOwnedCache:false,preferOffline:true,codes:[...new Set([...output.matchAll(/npm error code ([A-Z0-9_]+)/g)].map(row=>row[1]))],stdoutBytes:Buffer.byteLength(stdout??''),stderrBytes:Buffer.byteLength(stderr??''),httpFetchMessages:(output.match(/npm http fetch/g)??[]).length,cacheHitMessages:(output.match(/cache hit/g)??[]).length,phases};
}

test('C202: an existing public profile retains its original settings through the reviewed SDK transition and rollback',{timeout:360000},async()=>{
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-sdk-transition-EXAMPLE-'))),lease=ownedTempCleanup(base,root,'dsh-sdk-transition-EXAMPLE-',{budgetMs:30000});
 await withOwnedTempCleanup(lease,async()=>{
  const lock=await json('UPSTREAM.lock.json'),baseline=await json('contracts/upstream-baseline.json');
  const plan=existsSync('UPSTREAM.prepared.json')?await json('UPSTREAM.prepared.json'):null;
  if(plan){assert.equal(plan.target.version,PINNED_DSH_VERSION);assert.equal(plan.target.commit,lock.dsh.commit);}
  const prior=plan?.from??lock.dsh,previousBaseline=plan?.previousBaseline??baseline;
  assert.match(prior.version,/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);assert.equal(previousBaseline.dsh.version,prior.version);assert.equal(baseline.dsh.version,PINNED_DSH_VERSION);
  const home=join(root,'home'),agents=join(root,'agents'),userconfig=join(root,'EXAMPLE.npmrc');await mkdir(home);await mkdir(agents);await writeFile(userconfig,'registry=https://registry.npmjs.org/\n');
  const env=mcpChildEnvironment({DSH_HOME:home,DSH_AGENTS_HOME:agents,DSH_TELEMETRY_DISABLED:'1',NPM_CONFIG_USERCONFIG:userconfig});let previousAnchor=currentAnchor,priorSource=null,installation=null;
  if(prior.version!==PINNED_DSH_VERSION){
   priorSource=previousRuntimeProject(plan);const legacy=join(root,'EXAMPLE_legacy_sdk'),globalconfig=join(root,'EXAMPLE_global.npmrc');await mkdir(legacy);await writeFile(globalconfig,'');await writeFile(join(legacy,'package.json'),priorSource.manifestText);await writeFile(join(legacy,'package-lock.json'),priorSource.lockText);
   const npm=[process.env.npm_execpath,resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(path=>path&&existsSync(path));assert.ok(npm,'EXAMPLE_NPM_UNAVAILABLE');
   const configFlags=['--userconfig',userconfig,'--globalconfig',globalconfig],cache=npmCacheDirectory(npm),defaultChildCache=npmCacheDirectory(npm,{cwd:legacy,env,flags:configFlags}),explicitChildCache=npmCacheDirectory(npm,{cwd:legacy,env,flags:[...configFlags,'--cache',cache]});assert.equal(sameNpmCache(explicitChildCache,cache),true);
   const started=performance.now();
   // This contract checks the real old/current/old SDKs, not cold-network speed.
   // npm still verifies the reviewed lock integrities when reusing its cache;
   // missing packages can download normally, with no separate retry or script.
   const result=spawnSync(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--no-update-notifier','--workspaces=false','--registry','https://registry.npmjs.org/',...configFlags,'--cache',cache,'--prefer-offline','--timing','--loglevel=http'],{cwd:legacy,env,windowsHide:true,stdio:'pipe',timeout:180000,maxBuffer:4*1024**2});installation={...installDiagnostics(result.stdout,result.stderr,started),cacheLocationSource:'parent-npm-config',cacheMatchesParent:true,defaultScrubbedCacheMatchesParent:sameNpmCache(defaultChildCache,cache),omitDevelopmentOnly:true};
   if(result.error||result.status!==0)throw new Error('EXAMPLE_LEGACY_SDK_INSTALL_FAILED '+JSON.stringify({exit:typeof result.status==='number'?result.status:null,timedOut:result.error?.code==='ETIMEDOUT',lockedSourceCommit:priorSource.sourceCommit,...installation}));
   assert.equal(hash(await readFile(join(legacy,'package-lock.json'))),priorSource.lockSha256,'Previous dependency graph changed during installation.');
   const installed=await json(join(legacy,'package-lock.json')),entry=installed.packages['node_modules/@deepseek-ai/dsh'];assert.equal(entry.version,prior.version);assert.equal(entry.integrity,prior.registryIntegrity);previousAnchor=join(legacy,'node_modules/@deepseek-ai/dsh/package.json');
   let requiredRuntimePackages=0,omittedDevelopmentPackages=0;for(const[path,item]of Object.entries(installed.packages)){if(!path)continue;if(item.dev){assert.equal(existsSync(join(legacy,path,'package.json')),false,'Development-only dependency was installed.');omittedDevelopmentPackages++;}else if(!item.optional){assert.equal(existsSync(join(legacy,path,'package.json')),true,'Required SDK runtime dependency is missing.');requiredRuntimePackages++;}}installation.requiredRuntimePackagesVerified=requiredRuntimePackages;installation.developmentOnlyPackagesOmitted=omittedDevelopmentPackages;
  }
  assert.equal((await json(previousAnchor)).version,prior.version);const oldRequire=createRequire(previousAnchor),api=await import(pathToFileURL(oldRequire.resolve('@deepseek-ai/dsh-app-boot')).href),atomic=await import(pathToFileURL(oldRequire.resolve('@deepseek-ai/dsh-atomic-write')).href),name='EXAMPLE_TRANSITION';
  const dump=(anchor,create=false)=>{let output;try{output=execFileSync(process.execPath,[join(dirname(anchor),'lib/bin.js'),'--profile',name,...(create?['--from-default-profile','web']:[]),'--dump-config'],{cwd:root,env,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:8*1024**2});}catch(error){throw new Error('EXAMPLE_PROFILE_DUMP_FAILED '+JSON.stringify({exit:typeof error.status==='number'?error.status:null}));}const doc=parseDocument(output,{customTags:[{tag:'tag:yaml.org,2002:js',resolve:value=>value}]});assert.equal(doc.errors.length,0,'EXAMPLE_INVALID_PROFILE_DUMP');const rows=doc.toJS();assert.ok(Array.isArray(rows),'EXAMPLE_PROFILE_ROWS_UNAVAILABLE');return rows;};
  const initial=dump(previousAnchor,true);assert.deepEqual(profileFacts(initial),previousBaseline.webRows);
  const profile=api.loadProfile('EXAMPLE',name,previousAnchor,home),manifest=api.readProfileManifest('EXAMPLE',profile.dir);manifest.EXAMPLE_RETAINED_METADATA='EXAMPLE original creator preference';api.writeProfileManifest(profile.dir,manifest);
  await atomic.writeFileAtomic(profile.patchPath,JSON.stringify([{id:'agent-default-model',config:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL'}}])+'\n',{mode:0o600});const originalPatch=hash(await readFile(profile.patchPath));
  const results=[];let originalRows;
  for(const anchor of[previousAnchor,currentAnchor,previousAnchor]){const rows=dump(anchor),model=rows.find(row=>row.id==='agent-default-model');assert.deepEqual(model.config,{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL'});assert.equal(hash(await readFile(profile.patchPath)),originalPatch);assert.equal(api.readProfileManifest('EXAMPLE',profile.dir).EXAMPLE_RETAINED_METADATA,manifest.EXAMPLE_RETAINED_METADATA);if(!originalRows)originalRows=rows;else if(results.length===2)assert.deepEqual(rows,originalRows);results.push({sdk:(await json(anchor)).version,rows:rows.length});}
  console.log(JSON.stringify({contract:'C202',actualPublishedCliPair:true,from:prior.version,to:PINNED_DSH_VERSION,crossSdk:prior.version!==PINNED_DSH_VERSION,priorSourceCommit:priorSource?.sourceCommit??null,priorDependencyGraphLocked:!!priorSource,freshOwnedPackageCache:false,installation,packageLifecycleScriptsDisabled:true,originalPublishedProfileFactsMatched:true,userPatchBytesPreserved:true,publicManifestMetadataPreserved:true,rollbackCompleteRowsMatched:true,results,ownPluginUpgradeVerified:false,fullHostBootVerified:false,nativeRequests:0,modelRequests:0}));
 });
});
