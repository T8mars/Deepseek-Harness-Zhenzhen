import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,lstat,mkdir,rename} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {inventoryFixture} from './fixtures/skill-inventory.mjs';
import {prepareManagedRuntimeCopy,discardManagedRuntimeCopy,FileManagedSkillRuntimePolicy} from '../packages/dsh-zhen/lib/backup.js';
import {SkillMarket} from '../packages/dsh-zhen/lib/market.js';
import {LocalSkills} from '../packages/dsh-zhen/lib/local-skills.js';
import {GithubSkills} from '../packages/dsh-zhen/lib/github-skills.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),origin=hash('EXAMPLE_RESTORED_ORIGIN'),owners=f=>({market:f.market,local:f.local,github:f.github,feed:f.feed}),snapshot=f=>({market:f.market.backupState(),local:f.local.backupState(),github:f.github.backupState(),feed:f.feed.backupState()});

test('C183: the production copier retains all real versions, resources, pending records and original source files without starting them',async t=>{
  const f=await inventoryFixture(t),before=snapshot(f),requests=f.git.calls.length,result=await prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{}),policy=new FileManagedSkillRuntimePolicy(result.root,result.role.epoch,()=>{});
  assert.equal(hash(await readFile(join(result.root,'role.json'))),result.seal);const market=new SkillMarket(join(result.root,'s.db'),[],{runtime:policy,catalog:result.role.catalog,bundled:result.role.bundled}),github=new GithubSkills(join(result.root,'g'),async()=>assert.fail('EXAMPLE_COPY_MUST_NOT_FETCH'),{runtime:policy}),local=new LocalSkills(join(result.root,'l.json'),1000000,{runtime:policy});f.dispose(()=>{local.close();github.close();market.close();});
  assert.deepEqual(market.backupState(),before.market);assert.deepEqual(local.backupState(),before.local);assert.equal(github.list()[0].running,f.first.digest);assert.equal(github.list()[0].pending,f.second.digest);assert.equal(github.history(f.first.sourceId).length,2);assert.equal(github.list()[0].automatic,false);const provider=github.provider(),candidate=(await provider.list({}))[0],definition=await provider.get(candidate,{});assert.equal(await readFile(join(definition.resourceBase.path,'references','guide.md'),'utf8'),'EXAMPLE_REFERENCE');assert.match(await readFile(join(definition.resourceBase.path,'scripts','example.mjs'),'utf8'),/EXAMPLE/);
  assert.equal(f.git.calls.length,requests);assert.deepEqual(snapshot(f),before);assert.equal(market.autoPolicy().enabled,false);assert.equal(result.role.originalAutomatic,true);
  console.log(JSON.stringify({contract:'C183',actualProductionManagedCopy:true,allRetainedVersionsAndResourcesCopied:true,oldPendingPreservedAndNotApplied:true,originalSourceUnchanged:true,emptyFreshUpdatePolicy:true,networkRequests:0,programExecutions:0,nativeRequests:0,modelRequests:0}));
});

test('C183: cancellation after copying removes only the fresh leaf and preserves the original sources',async t=>{
  const f=await inventoryFixture(t),before=snapshot(f),names=await readdir(f.home),controller=new AbortController();let checks=0;
  await assert.rejects(prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{if(++checks===2)controller.abort();},{signal:controller.signal}));assert.ok(checks>=2);assert.deepEqual(await readdir(f.home),names);assert.deepEqual(snapshot(f),before);
});

test('C183: changed retained resource and total byte limits refuse publication without touching an existing target',async t=>{
  const f=await inventoryFixture(t),names=await readdir(f.home),state=f.market.backupState();await assert.rejects(prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{},{limits:{archiveBytes:1}}));assert.deepEqual(await readdir(f.home),names);
  let checks=0;await assert.rejects(prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{if(++checks===2)await writeFile(join(f.first.root??join(f.github.backupState().root,'releases',f.first.sourceId,f.first.digest),'package','references','guide.md'),'EXAMPLE_CHANGED_AFTER_COPY');}));assert.deepEqual(await readdir(f.home),names);assert.deepEqual(f.market.backupState(),state);
});

test('C183: a replaced copy root is never recursively removed as the old owned leaf',async t=>{
  const f=await inventoryFixture(t);let retained;let checks=0;
  await assert.rejects(prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{if(++checks!==2)return;const leaf=(await readdir(f.home)).find(name=>/^m[a-f0-9]{12}$/.test(name)),path=join(f.home,leaf),destination=join(f.home,'EXAMPLE_RETAINED_COPY');assert.equal(relative(f.home,path),leaf);assert.equal(isAbsolute(relative(f.home,destination)),false);assert.ok((await lstat(path)).isDirectory());await rename(path,destination);await mkdir(path);await writeFile(join(path,'EXAMPLE_KEEP'),'EXAMPLE foreign replacement');retained=path;throw Error('EXAMPLE_ROOT_REPLACED');}));
  assert.equal(await readFile(join(retained,'EXAMPLE_KEEP'),'utf8'),'EXAMPLE foreign replacement');assert.ok((await lstat(join(f.home,'EXAMPLE_RETAINED_COPY'))).isDirectory());
});

test('C183: only the matching unpublished copy can be discarded',async t=>{
  const f=await inventoryFixture(t),before=snapshot(f),result=await prepareManagedRuntimeCopy(f.home,'EXAMPLE_PROFILE',origin,owners(f),async()=>{});await assert.rejects(discardManagedRuntimeCopy(f.home,{...result,role:{...result.role,rootIdentity:'0:0'}}));assert.ok((await lstat(result.root)).isDirectory());await discardManagedRuntimeCopy(f.home,result);assert.deepEqual(snapshot(f),before);assert.equal((await readdir(f.home)).some(name=>name===result.role.leaf),false);
});
