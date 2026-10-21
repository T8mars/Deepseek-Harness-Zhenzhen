import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';
import {Loader} from '@deepseek-ai/cordis-plugin-loader';
import {SkillRegistry} from '@deepseek-ai/dsh-skill';
import * as Filesystem from '@deepseek-ai/dsh-skill-filesystem';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import {SkillSourceTracker,hostSkillInventorySource,collectSkillBackupInventory,writeBackupArchive,restoreSkillInventoryBackup} from '../packages/dsh-zhen/lib/backup.js';

const keys=['DSH_HOME','DSH_AGENTS_HOME','DSH_BUNDLED_SKILL_DIR'],roles=['home','agents','bundled'],password='EXAMPLE activation backup password';
async function fixture(t,{tracked=true}={}){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-activation-contract-EXAMPLE-'))),ctx=new Context(),cwd=process.cwd(),prior=Object.fromEntries(keys.map(key=>[key,process.env[key]])),workspace=join(root,'workspace'),parent=join(root,'candidates');
  t.after(async()=>{try{await ctx.fiber.dispose();}finally{process.chdir(cwd);for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-activation-contract-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
  for(const label of ['a','b'])for(const role of [...roles,'custom'])await mkdir(join(root,label,role),{recursive:true});await mkdir(workspace);await mkdir(parent);
  const homeA=join(root,'a','home'),homeB=join(root,'b','home'),customA=join(root,'a','custom'),customB=join(root,'b','custom');
  for(const [path,name]of [[join(homeA,'skills','sample'),'example-original-home'],[join(homeB,'skills','sample'),'example-new-home'],[join(customA,'sample'),'example-custom-a'],[join(customB,'sample'),'example-custom-b']]){await mkdir(path,{recursive:true});await writeFile(join(path,'SKILL.md'),'---\nname: '+name+'\ndescription: EXAMPLE\n---\nEXAMPLE_BODY_'+name);}
  const environment=label=>keys.forEach((key,i)=>process.env[key]=join(root,label,roles[i]));environment('a');await ctx.plugin(Loader,{baseUrl:pathToFileURL(root+'/').href});await ctx.plugin(SkillRegistry);ctx.loader.builtins['EXAMPLE-filesystem']=Filesystem;
  ctx.provide('workspaceRegistry',{list:()=>[{path:workspace}]});ctx.provide('workingDirectory',{defaultDirectory:workspace,get:()=>workspace});ctx.provide('sessions',{list:()=>[]});
  let tracker;const observe=()=>{tracker=new SkillSourceTracker(ctx);ctx.provide('zhenSkillBackupSources',tracker);return tracker;};if(tracked)observe();
  const create=async options=>{const id=await ctx.loader.create({name:'cordis:EXAMPLE-filesystem',config:{watch:false},...options});await ctx.loader.await();return ctx.loader.resolve(id);},policy={protectedContainers:[root],forbiddenTrees:[join(root,'EXAMPLE_NATIVE')]},managed={local:{},github:{},market:{},feed:{}};
  return {root,ctx,workspace,parent,homeA,homeB,customA,customB,environment,create,observe,policy,managed,source:()=>hostSkillInventorySource(ctx,managed,policy)};
}

test('C95: committed public activation snapshot preserves provider roots after all environment defaults change',async t=>{
  const f=await fixture(t),entry=await f.create();f.environment('b');const source=f.source(),config=source.filesystem[0].config;assert.equal(config.dshHome,f.homeA);assert.equal(config.agentsHome,join(f.root,'a','agents'));assert.equal(config.bundledSkillDir,join(f.root,'a','bundled'));assert.equal(source.filesystem[0].mode,'host-local-resolved');assert.ok((await f.ctx.skills.get('example-original-home',{cwd:f.workspace})).path.startsWith(f.homeA));assert.equal(f.ctx.get('zhenSkillBackupSources').get(entry).dshHome,f.homeA);
});

test('C95: bundled absence at activation does not become a later ambient bundled directory',async t=>{
  const f=await fixture(t);delete process.env.DSH_BUNDLED_SKILL_DIR;await f.create();f.environment('b');assert.equal(Object.hasOwn(f.source().filesystem[0].config,'bundledSkillDir'),false);
});

test('C95: source observation happens after expression interpolation without replaying expressions',async t=>{
  const f=await fixture(t);globalThis.EXAMPLE_ACTIVATION_EVALS=0;t.after(()=>delete globalThis.EXAMPLE_ACTIVATION_EVALS);await f.create({config:{watch:false,customSkillDirs:[{__jsExpr:'(globalThis.EXAMPLE_ACTIVATION_EVALS++,'+JSON.stringify(f.customA)+')'}]}});const count=globalThis.EXAMPLE_ACTIVATION_EVALS;assert.equal(count,1);assert.deepEqual(f.source().filesystem[0].config.customSkillDirs,[f.customA]);assert.equal(globalThis.EXAMPLE_ACTIVATION_EVALS,count);
});

test('C95: relative custom paths retain the activation cwd after the process changes its cwd',async t=>{
  const f=await fixture(t);process.chdir(join(f.root,'a'));await f.create({config:{watch:false,customSkillDirs:['custom']}});process.chdir(join(f.root,'b'));assert.deepEqual(f.source().filesystem[0].config.customSkillDirs,[f.customA]);assert.ok((await f.ctx.skills.get('example-custom-a',{cwd:f.workspace})).path.startsWith(f.customA));
});

test('C95: an unobserved active implicit source refuses rather than substituting current defaults',async t=>{
  const f=await fixture(t,{tracked:false});await f.create();f.environment('b');assert.throws(f.source,error=>error.code==='BACKUP_HOST_DEFAULTS_UNOBSERVED');
});

test('C95: self-contained absolute provider settings remain readable without an observer',async t=>{
  const f=await fixture(t,{tracked:false});await f.create({config:{dshHome:f.homeA,agentsHome:join(f.root,'a','agents'),includeDefaultRoots:false,customSkillDirs:[f.customA],watch:false}});f.environment('b');assert.equal(f.source().filesystem[0].config.dshHome,f.homeA);
});

test('C95: merely validating another config cannot replace the active source snapshot',async t=>{
  const f=await fixture(t),entry=await f.create({config:{watch:false,customSkillDirs:[f.customA]}}),fiber=entry.fiber;
  fiber.ctx.waterfall(fiber,'internal/config',{watch:false,customSkillDirs:[f.customB]},()=>({watch:false,customSkillDirs:[f.customB]}));assert.deepEqual(f.source().filesystem[0].config.customSkillDirs,[f.customA]);
});

test('C95: a normal Loader restart commits the replacement roots and their new ambient defaults',async t=>{
  const f=await fixture(t),entry=await f.create({config:{watch:false,customSkillDirs:[f.customA]}});f.environment('b');await entry.update({config:{watch:false,customSkillDirs:[f.customB]}});await f.ctx.loader.await();const config=f.source().filesystem[0].config;assert.equal(config.dshHome,f.homeB);assert.deepEqual(config.customSkillDirs,[f.customB]);assert.ok((await f.ctx.skills.get('example-new-home',{cwd:f.workspace})).path.startsWith(f.homeB));
});

test('C95: dependency gate holds provider pending until the actual Zhen Host installs its tracker',async t=>{
  const f=await fixture(t,{tracked:false}),entry=await f.create({inject:['skills','zhenSkillBackupSources']});assert.equal(entry.fiber.state,0);f.ctx.provide('credentials',{});await f.ctx.plugin(ZhenService);await f.ctx.loader.await();assert.equal(entry.fiber.state,2);f.environment('b');assert.equal(f.source().filesystem[0].config.dshHome,f.homeA);
});

test('C95: late observer does not guess an old implicit source; normal reactivation makes it observable',async t=>{
  const f=await fixture(t,{tracked:false}),entry=await f.create();f.observe();assert.throws(f.source,error=>error.code==='BACKUP_HOST_DEFAULTS_UNOBSERVED');await entry.update({config:{watch:false,customSkillDirs:[f.customA]}});await f.ctx.loader.await();assert.equal(f.source().filesystem[0].config.dshHome,f.homeA);
});

test('C95: mutation of public active config without provider reactivation refuses instead of inventing roots',async t=>{
  const f=await fixture(t),entry=await f.create({config:{watch:false,customSkillDirs:[f.customA]}});entry.fiber.config.customSkillDirs.push(f.customB);assert.throws(f.source,error=>error.code==='BACKUP_SOURCE_CHANGED');
});

test('C95: returned activation snapshots are detached from future backup reads',async t=>{
  const f=await fixture(t),entry=await f.create({config:{watch:false,customSkillDirs:[f.customA]}}),tracker=f.ctx.get('zhenSkillBackupSources'),value=tracker.get(entry);value.customSkillDirs.push(f.customB);value.dshHome=f.homeB;assert.deepEqual(tracker.get(entry).customSkillDirs,[f.customA]);assert.equal(tracker.get(entry).dshHome,f.homeA);
});

test('C95: resolved source config rejects accessors before invoking them or reading managed state',async t=>{
  const f=await fixture(t);let calls=0;const config=Object.defineProperty({},'dshHome',{enumerable:true,get(){calls++;return f.homeA;}});await assert.rejects(collectSkillBackupInventory({...f.source(),filesystem:[{id:'EXAMPLE_accessor',mode:'host-local-resolved',config}],workspaces:[]}));assert.equal(calls,0);
});

test('C95: environment changes after inventory emission cannot redirect encrypted resource backup',async t=>{
  const f=await fixture(t,{tracked:false});delete process.env.DSH_BUNDLED_SKILL_DIR;f.ctx.provide('credentials',{});await f.ctx.plugin(ZhenService);await f.create();const service=f.ctx.get('zhen'),archive=join(f.root,'EXAMPLE.encrypted'),records=(async function*(){for await(const record of service.skillBackupRecords(()=>f.policy)){yield record;if(record.metadata.kind==='skill-inventory')f.environment('b');}})();
  await writeBackupArchive(archive,password,records);const restored=await restoreSkillInventoryBackup(archive,password,f.parent);assert.equal(restored.inventory.filesystem[0].config.dshHome,f.homeA);assert.equal(Object.hasOwn(restored.inventory.filesystem[0].config,'bundledSkillDir'),false);assert.equal(restored.inventory.roots.some(row=>row.path.startsWith(f.homeB)||row.provenance.role==='bundled'),false);const user=restored.roots.find(row=>row.origin.kind==='user-dsh');assert.equal(await readFile(join(user.restoredPath,'sample','SKILL.md'),'utf8'),'---\nname: example-original-home\ndescription: EXAMPLE\n---\nEXAMPLE_BODY_example-original-home');assert.equal(restored.activated,false);assert.equal(existsSync(join(f.homeB,'dsh-zhen','skills.sqlite')),false);
});
