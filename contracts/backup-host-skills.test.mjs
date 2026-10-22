import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';
import {Loader,Group} from '@deepseek-ai/cordis-plugin-loader';
import {SkillRegistry} from '@deepseek-ai/dsh-skill';
import * as Filesystem from '@deepseek-ai/dsh-skill-filesystem';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {hostSkillInventorySource,writeBackupArchive,restoreSkillInventoryBackup} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE Host skill archive password';
async function fixture(t,{skills=true}={}){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-host-skills-EXAMPLE-'))),home=join(root,'home'),agents=join(root,'agents'),custom=join(root,'custom'),parent=join(root,'candidates'),ctx=new Context();
  for(const path of [home,agents,custom,parent])await mkdir(path);
  const previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
  t.after(async()=>{try{await ctx.fiber.dispose();}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;delete globalThis.EXAMPLE_HOST_CONFIG_EVALS;const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-host-skills-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
  await mkdir(join(custom,'sample'));await writeFile(join(custom,'sample','SKILL.md'),'---\nname: example-host-backup\ndescription: EXAMPLE only\n---\nEXAMPLE_RESOURCE\n');
  await ctx.plugin(Loader,{baseUrl:pathToFileURL(root+'/').href});if(skills)await ctx.plugin(SkillRegistry);
  ctx.loader.builtins['EXAMPLE-filesystem']=Filesystem;ctx.loader.builtins['EXAMPLE-group']=Group;
  const project=join(root,'project'),liveCwd=join(root,'live'),history=join(root,'history');
  for(const path of [project,liveCwd,history])await mkdir(path);
  const declared=[{path:root},{path:project}],live=[{id:'EXAMPLE_SESSION',cwd:liveCwd}];
  ctx.provide('workspaceRegistry',{list:()=>declared});ctx.provide('workingDirectory',{defaultDirectory:root,get:value=>value.cwd});ctx.provide('sessions',{list:()=>live});
  const config={dshHome:home,agentsHome:agents,customSkillDirs:[custom],includeDefaultRoots:false,watch:false},policy={protectedContainers:[root],forbiddenTrees:[join(root,'EXAMPLE_NATIVE')],additionalWorkspaces:[root,history]},managed={local:{},github:{},market:{},feed:{}};
  const create=async options=>{const id=await ctx.loader.create({name:'cordis:EXAMPLE-filesystem',config,...options});await ctx.loader.await();return ctx.loader.resolve(id);};
  return {root,home,agents,custom,parent,project,liveCwd,history,ctx,declared,live,config,policy,managed,create,source:()=>hostSkillInventorySource(ctx,managed,policy)};
}

test('C94: real Loader validated active config supplies actual provider roots without re-evaluating expressions',async t=>{
  const f=await fixture(t),expression='(globalThis.EXAMPLE_HOST_CONFIG_EVALS=(globalThis.EXAMPLE_HOST_CONFIG_EVALS??0)+1,'+JSON.stringify(f.custom)+')';
  const entry=await f.create({config:{...f.config,customSkillDirs:[{__jsExpr:expression}]}}),before=globalThis.EXAMPLE_HOST_CONFIG_EVALS;assert.ok(before>0);assert.equal(entry.fiber.state,2);
  const source=f.source();assert.equal(source.filesystem.length,1);assert.equal(source.filesystem[0].id,entry.id);assert.equal(source.filesystem[0].enabled,true);assert.deepEqual(source.filesystem[0].config.customSkillDirs,[f.custom]);assert.ok((await f.ctx.skills.list({cwd:f.root})).some(row=>row.name==='example-host-backup'));assert.equal(globalThis.EXAMPLE_HOST_CONFIG_EVALS,before);
  source.filesystem[0].config.customSkillDirs.push('EXAMPLE_MUTATION');assert.deepEqual(f.source().filesystem[0].config.customSkillDirs,[f.custom]);
});

test('C94: real local filesystem service remains eligible',async t=>{
  const f=await fixture(t);await f.ctx.plugin(LocalFileSystem,{cwd:f.root});await f.create();assert.equal(f.source().filesystem[0].mode,'host-local-resolved');
});

test('C94: arbitrary filesystem backend is refused without invoking its methods',async t=>{
  const f=await fixture(t);let calls=0;f.ctx.provide('fs',{resolve(){calls++;throw new Error('EXAMPLE_MUST_NOT_READ');}});await f.create();assert.throws(f.source,error=>error.code==='BACKUP_SKILL_FILESYSTEM_UNSUPPORTED');assert.equal(calls,0);
});

test('C94: literal disabled published-name entries retain roots without importing the provider',async t=>{
  const f=await fixture(t),entry=await f.create({name:'@deepseek-ai/dsh-skill-filesystem',disabled:true});assert.equal(entry.fiber,undefined);const source=f.source();assert.equal(source.filesystem[0].enabled,false);assert.deepEqual(source.filesystem[0].config.customSkillDirs,[f.custom]);assert.equal((await f.ctx.skills.list({cwd:f.root})).length,0);
});

test('C94: an inactive builtin alias is identified through the public dictionary without importing or starting it',async t=>{
  const f=await fixture(t),entry=await f.create({disabled:true});assert.equal(entry.moduleNamespace,undefined);assert.equal(entry.fiber,undefined);const source=f.source();assert.equal(source.filesystem.length,1);assert.equal(source.filesystem[0].enabled,false);assert.equal(entry.moduleNamespace,undefined);assert.equal(entry.fiber,undefined);
});

test('C94: a missing required Host service is unavailable instead of becoming an empty workspace set',async t=>{
  const f=await fixture(t);await f.create();const isolated=new Context();t.after(()=>isolated.fiber.dispose());assert.throws(()=>hostSkillInventorySource(isolated,f.managed,f.policy),error=>error.code==='BACKUP_HOST_SERVICES_UNAVAILABLE');
});

test('C94: inactive expression config refuses instead of executing code or silently omitting the source',async t=>{
  const f=await fixture(t);await f.create({name:'@deepseek-ai/dsh-skill-filesystem',disabled:true,config:{...f.config,watch:{__jsExpr:'globalThis.EXAMPLE_HOST_CONFIG_EVALS=999'}}});assert.throws(f.source,error=>error.code==='BACKUP_HOST_CONFIG_UNRESOLVED');assert.equal(globalThis.EXAMPLE_HOST_CONFIG_EVALS,undefined);
});

test('C94: disabled expressions are not evaluated by backup reads',async t=>{
  const f=await fixture(t),entry=await f.create({name:'@deepseek-ai/dsh-skill-filesystem',disabled:true});entry.options.disabled={__jsExpr:'(globalThis.EXAMPLE_HOST_CONFIG_EVALS=999,true)'};
  assert.throws(f.source,error=>error.code==='BACKUP_HOST_DISABLED_UNRESOLVED');assert.equal(globalThis.EXAMPLE_HOST_CONFIG_EVALS,undefined);
});

test('C94: pending provider is refused without starting or retrying its fiber',async t=>{
  const f=await fixture(t,{skills:false}),entry=await f.create();assert.equal(entry.fiber.state,0);assert.throws(f.source,error=>error.code==='BACKUP_HOST_PROVIDER_UNAVAILABLE');assert.equal(entry.fiber.state,0);
});

test('C94: registry order, deployment default, live directories and extra session paths merge without truncation',async t=>{
  const f=await fixture(t);await f.create();const source=f.source();assert.deepEqual(source.workspaces,[f.root,f.project,f.liveCwd,f.history]);source.forbiddenTrees.push('EXAMPLE_MUTATED');source.protectedContainers.push('EXAMPLE_MUTATED');assert.equal(f.policy.forbiddenTrees.length,1);assert.equal(f.policy.protectedContainers.length,1);
  f.policy.additionalWorkspaces=Array.from({length:129},(_,i)=>join(f.root,'EXAMPLE_DIR_'+i));assert.throws(f.source,error=>error.code==='BACKUP_SKILL_INVENTORY_LIMIT');
});

test('C94: real group remains materialized when disabled while its nested provider is retained inactive',async t=>{
  const f=await fixture(t);await f.ctx.loader.create({name:'cordis:EXAMPLE-group',group:true,disabled:true,config:[{id:'EXAMPLE_nested',name:'@deepseek-ai/dsh-skill-filesystem',config:f.config}]});await f.ctx.loader.await();const source=f.source();assert.equal(source.filesystem.length,1);assert.equal(source.filesystem[0].id,'EXAMPLE_nested');assert.equal(source.filesystem[0].enabled,false);
});

test('C94: real active loader group exposes its nested filesystem entry',async t=>{
  const f=await fixture(t);await f.ctx.loader.create({name:'cordis:EXAMPLE-group',group:true,config:[{id:'EXAMPLE_nested',name:'cordis:EXAMPLE-filesystem',config:f.config}]});await f.ctx.loader.await();const source=f.source();assert.equal(source.filesystem.length,1);assert.equal(source.filesystem[0].id,'EXAMPLE_nested');assert.equal(source.filesystem[0].enabled,true);
});

test('C94: raw Host exceptions are replaced with a fixed error without a cause',async t=>{
  const f=await fixture(t);await f.create();f.declared.map=()=>{throw new Error('EXAMPLE_PRIVATE_HOST_DIAGNOSTIC');};assert.throws(f.source,error=>error.code==='BACKUP_HOST_SKILL_READ_FAILED'&&!('cause'in error)&&!error.message.includes('PRIVATE'));
});

test('C94: actual own Host skill stream restores active and disabled sources without startup or policy changes',async t=>{
  const f=await fixture(t);f.ctx.provide('credentials',{});await f.create();await f.create({name:'@deepseek-ai/dsh-skill-filesystem',disabled:true,config:{...f.config,providerName:'EXAMPLE_DISABLED'}});await f.ctx.plugin(ZhenService);const service=f.ctx.get('zhen'),before=service.marketFeedSnapshot(),archive=join(f.root,'EXAMPLE.encrypted');
  await writeBackupArchive(archive,password,service.skillBackupRecords(()=>f.policy));const restored=await restoreSkillInventoryBackup(archive,password,f.parent);assert.equal(restored.activated,false);assert.equal(restored.inventory.filesystem.length,2);const disabled=restored.inventory.filesystem.find(row=>!row.enabled);assert.ok(disabled);assert.ok(restored.inventory.roots.filter(row=>row.provenance.provider===disabled.id).every(row=>!row.enabled));assert.ok(restored.roots.some(row=>row.present));assert.deepEqual(service.marketFeedSnapshot(),before);assert.equal((await readFile(archive)).includes(Buffer.from('EXAMPLE_RESOURCE')),false);
});

test('C94: Host stream refuses uninitialized managed services instead of activating them to make a snapshot',async t=>{
  const f=await fixture(t,{skills:false});f.ctx.provide('credentials',{});await f.ctx.plugin(ZhenService);const service=f.ctx.get('zhen'),archive=join(f.root,'EXAMPLE_unavailable');await assert.rejects(writeBackupArchive(archive,password,service.skillBackupRecords(()=>f.policy)),error=>error.code==='BACKUP_HOST_SERVICES_UNAVAILABLE');assert.equal(existsSync(archive),false);assert.equal(existsSync(join(f.home,'dsh-zhen','skills.sqlite')),false);
});

test('C94: unloading or disabling an entry after the manifest refuses final archive publication',async t=>{
  const f=await fixture(t);f.ctx.provide('credentials',{});const entry=await f.create();await f.ctx.plugin(ZhenService);const service=f.ctx.get('zhen'),archive=join(f.root,'EXAMPLE_changed');
  const records=(async function*(){for await(const record of service.skillBackupRecords(()=>f.policy)){yield record;if(record.metadata.kind==='skill-inventory'){await entry.update({disabled:true});await f.ctx.loader.await();}}})();
  await assert.rejects(writeBackupArchive(archive,password,records),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal(existsSync(archive),false);
});

test('C110-host: the actual Host retains a complete skill source until an outer final check',async t=>{
 const f=await fixture(t);f.ctx.provide('credentials',{});const entry=await f.create();await f.ctx.plugin(ZhenService);const service=f.ctx.get('zhen');service.marketFeedSnapshot();const lease=await service.skillBackupLease(()=>f.policy);
 try{for await(const item of lease.records())for await(const _bytes of item.data){}await lease.assertCurrent();await entry.update({disabled:true});await f.ctx.loader.await();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C110-host: retained Host methods refuse missing services without creating skill or session stores',async t=>{
 const f=await fixture(t,{skills:false});f.ctx.provide('credentials',{});await f.ctx.plugin(ZhenService);const service=f.ctx.get('zhen');await assert.rejects(service.skillBackupLease(()=>f.policy),{code:'BACKUP_HOST_SERVICES_UNAVAILABLE'});await assert.rejects(service.sessionBackupLease(),{code:'BACKUP_HOST_SERVICES_UNAVAILABLE'});assert.equal(existsSync(join(f.home,'dsh-zhen','skills.sqlite')),false);assert.equal(existsSync(join(f.home,'sessions')),false);
});
test('C110-host: the retained skill source belongs to the original Host even when provider data is unchanged',async t=>{
 const f=await fixture(t);f.ctx.provide('credentials',{});await f.create();const host=await f.ctx.plugin(ZhenService),service=f.ctx.get('zhen');service.marketFeedSnapshot();const lease=await service.skillBackupLease(()=>f.policy);
 try{for await(const item of lease.records())for await(const _bytes of item.data){}await host.dispose();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
 console.log(JSON.stringify({contract:'C110-host',actualOwnHostRetainedSkills:true,coldServicesNotInitialized:true,sourceOwnershipProtected:true,providerRootsAndEntryChangesProtected:true,nativeWrites:0,modelRequests:0}));
});
