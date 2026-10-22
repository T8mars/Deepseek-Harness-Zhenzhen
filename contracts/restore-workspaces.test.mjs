import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,readFile,readdir,rm,symlink,unlink,writeFile,rename} from 'node:fs/promises';
import {readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Context} from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as Domain from '@deepseek-ai/dsh-storage-domain';
import * as Json from '@deepseek-ai/dsh-storage-json';
import WorkspaceRegistry,{workspaceDomainSpec} from '@deepseek-ai/dsh-workspace';
import Sessions,{SessionId,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import {writeWorkspaceBackup,restoreWorkspaceBackup,prepareRestoredWorkspaces,sealRecoveryCandidate,verifyRecoveryCandidate} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE workspace copy password';
async function open(root){const ctx=new Context();await ctx.plugin(Storage);await ctx.plugin(Json,{root});await ctx.plugin(Domain,{backend:'json'});const domain=await ctx.storage.domain.open(workspaceDomainSpec);return{ctx,domain};}
function snapshot(domain){return{global:domain.global.get(),records:[...domain.table('workspaces').entries()]};}
async function fixture(t,operation='create'){
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-workspace-home-EXAMPLE-'))),parent=join(root,'components'),home=join(root,'application'),sourceHome=join(root,'EXAMPLE_source');await Promise.all([mkdir(parent),mkdir(home),mkdir(sourceHome)]);
 const active=await open(join(sourceHome,'storage'));
 const record=name=>({path:join(root,'EXAMPLE_MISSING_'+name),title:'EXAMPLE '+name,sessionIds:['EXAMPLE_'+name,'EXAMPLE_'+name+'_ARCHIVED'],createdAt:'2000-01-01T00:00:00.000Z',updatedAt:'2000-01-02T00:00:00.000Z'});
 for(const id of ['A','B','UNORDERED'])await active.domain.table('workspaces').put('EXAMPLE_'+id,record(id));
 await active.domain.global.set({initialized:true,workspaceIds:['EXAMPLE_B','EXAMPLE_A','EXAMPLE_B'],defaultWorkspaceId:'EXAMPLE_A',archivedSessionIds:['EXAMPLE_A_ARCHIVED'],pinnedSessionIds:['EXAMPLE_B'],pendingMutation:{operation,workspaceId:operation==='create'?'EXAMPLE_PENDING':'EXAMPLE_A'}});
 const expected=snapshot(active.domain),archive=join(root,'EXAMPLE.encrypted');await writeWorkspaceBackup(archive,password,()=>({facility:active.ctx.storage.domain,domain:active.domain,revision:0}));await active.ctx.fiber.dispose();
 const source=await restoreWorkspaceBackup(archive,password,parent);await rename(sourceHome,sourceHome+'.EXAMPLE_OFFLINE');
 t.after(async()=>{const actual=await realpath(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-workspace-home-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 return{root,home,parent,source,expected};
}
for(const operation of ['create','delete'])test('C139: actual published workspace logical copy preserves complete '+operation+' state without opening the registry or old directories',async t=>{
 const f=await fixture(t,operation),before=await sealRecoveryCandidate(f.source.root,[]),copied=await prepareRestoredWorkspaces(f.root,f.home,f.source);
 assert.equal(copied.workspaces,3);assert.notEqual(copied.storageRoot,f.source.storageRoot);assert.ok(!relative(f.home,copied.storageRoot).startsWith('..'));
 assert.equal(copied.pathsRebound,false);assert.equal(copied.registryEnabled,false);assert.equal(copied.pendingMutationsExecuted,false);assert.equal(copied.activated,false);
 const current=await open(copied.storageRoot);try{assert.deepEqual(snapshot(current.domain),f.expected);assert.equal(current.ctx.get('workspaceRegistry'),undefined);}finally{await current.ctx.fiber.dispose();}
 assert.equal((await verifyRecoveryCandidate(before)).integrity,'unchanged');
 assert.ok(copied.reviewReasons.includes('pending-mutation'));assert.ok(copied.reviewReasons.includes('unordered-record'));assert.ok(copied.reviewReasons.includes('duplicate-workspace-order'));
 if(operation==='create')console.log(JSON.stringify({contract:'C139',actualPublishedWorkspaceDomain:true,completeLogicalCopy:true,sourceComponentPreserved:true,workspaceIdsAndPathsPreserved:true,sessionOrderPinsArchivesAndBothPendingStatesPreserved:true,missingOriginalDirectoriesNotRead:true,registryNotConstructed:true,pathsRebound:false,activated:false,nativeRequests:0,modelRequests:0}));
});
test('C139: writes and a separate Node reopen use only the new application storage',async t=>{
 const f=await fixture(t),before=await sealRecoveryCandidate(f.source.root,[]),copied=await prepareRestoredWorkspaces(f.root,f.home,f.source),current=await open(copied.storageRoot);
 let expected;try{const table=current.domain.table('workspaces');await table.put('EXAMPLE_NEW',{...f.expected.records[0][1],title:'EXAMPLE new application only'});expected=snapshot(current.domain);}finally{await current.ctx.fiber.dispose();}
 const child=join(f.root,'EXAMPLE_reopen.mjs');await writeFile(child,`import{Context}from ${JSON.stringify(import.meta.resolve('@deepseek-ai/cordis'))};import Storage from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-storage'))};import*as Json from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-storage-json'))};import*as Domain from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-storage-domain'))};import{workspaceDomainSpec}from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-workspace'))};const ctx=new Context();await ctx.plugin(Storage);await ctx.plugin(Json,{root:process.argv[2]});await ctx.plugin(Domain,{backend:'json'});const domain=await ctx.storage.domain.open(workspaceDomainSpec);console.log(JSON.stringify({global:domain.global.get(),records:[...domain.table('workspaces').entries()]}));await ctx.fiber.dispose();`);
 assert.deepEqual(JSON.parse(execFileSync(process.execPath,[child,copied.storageRoot],{encoding:'utf8',windowsHide:true,timeout:20000,stdio:['ignore','pipe','pipe']})),expected);
 assert.equal((await verifyRecoveryCandidate(before)).integrity,'unchanged');
});
test('C139: a missing published single-unit file refuses before treating a nonempty inventory as empty',async t=>{
 const f=await fixture(t);await unlink(join(f.source.storageRoot,'workspace.json'));await assert.rejects(prepareRestoredWorkspaces(f.root,f.home,f.source),{code:'BACKUP_WORKSPACE_APPLICATION_INPUT_INVALID'});assert.deepEqual(await readdir(f.home),[]);
});
test('C139: a linked subtree is refused without following its target',async t=>{
 const f=await fixture(t),outside=join(f.root,'EXAMPLE_ordinary');await mkdir(outside);await writeFile(join(outside,'EXAMPLE_KEEP.txt'),'EXAMPLE kept');await symlink(outside,join(f.source.storageRoot,'EXAMPLE_link'),'junction');
 await assert.rejects(prepareRestoredWorkspaces(f.root,f.home,f.source),{code:'BACKUP_TEMP_BOUNDARY'});assert.equal(await readFile(join(outside,'EXAMPLE_KEEP.txt'),'utf8'),'EXAMPLE kept');assert.deepEqual(await readdir(f.home),[]);
});
test('C139: a count mismatch refuses before creating application storage',async t=>{
 const f=await fixture(t),before=await sealRecoveryCandidate(f.source.root,[]);await assert.rejects(prepareRestoredWorkspaces(f.root,f.home,{...f.source,workspaces:2}),{code:'BACKUP_WORKSPACE_APPLICATION_COUNT_MISMATCH'});assert.deepEqual(await readdir(f.home),[]);assert.equal((await verifyRecoveryCandidate(before)).integrity,'unchanged');
});
for(const mode of ['cancel','source-change'])test('C139: '+mode+' after target creation removes only the new application copy',async t=>{
 const f=await fixture(t),before=await sealRecoveryCandidate(f.source.root,[]),controller=new AbortController(),check=controller.signal.throwIfAborted.bind(controller.signal);let triggered=false;
 controller.signal.throwIfAborted=()=>{if(!triggered&&readdirSync(f.home).some(name=>name.startsWith('dsh-zhen-workspaces-restore-'))){triggered=true;if(mode==='cancel')controller.abort();else writeFileSync(f.source.metadata,'EXAMPLE changed metadata');}check();};
 await assert.rejects(prepareRestoredWorkspaces(f.root,f.home,f.source,{signal:controller.signal}),mode==='cancel'?{name:'AbortError'}:{code:'BACKUP_SOURCE_CHANGED'});assert.equal(triggered,true);assert.deepEqual(await readdir(f.home),[]);
 assert.equal((await verifyRecoveryCandidate(before)).integrity,mode==='cancel'?'unchanged':'changed');
});
test('C140: the released registry still validates immutable header cwd after a normal directory-change event',async t=>{
 const f=await fixture(t),old=join(f.root,'EXAMPLE_OLD_PROJECT'),next=join(f.root,'EXAMPLE_NEW_PROJECT'),sessions=join(f.root,'EXAMPLE_headers');await Promise.all([mkdir(old),mkdir(next)]);
 const original=await realpath(old),target=await realpath(next),id=SessionId('EXAMPLE_MEMBERSHIP');
 for(const [index,path]of [original,target].entries()){
  const current=await open(join(f.root,'EXAMPLE_registry_'+index));
  try{
   await current.ctx.plugin(Sessions);await current.ctx.plugin(Jsonl,{root:sessions});
   if(index===0){const handle=await current.ctx.sessionPersistence.create({version:SESSION_FORMAT_VERSION,id,createdAt:1700000000000,cwd:original,isSeeded:false});try{await handle.append([{type:'working-directory/change',seq:0,time:1700000000001,data:{cwd:target}}]);await handle.flush();}finally{await handle.close();}}
   await current.domain.table('workspaces').put('EXAMPLE_OWNER',{path,title:'EXAMPLE immutable membership',sessionIds:[id],createdAt:'2000-01-01T00:00:00.000Z',updatedAt:'2000-01-02T00:00:00.000Z'});
   await current.domain.global.set({initialized:true,workspaceIds:['EXAMPLE_OWNER'],archivedSessionIds:[],pinnedSessionIds:[]});
   await current.domain.close();
   await current.ctx.plugin(WorkspaceRegistry);
   assert.deepEqual(current.ctx.workspaceRegistry.list()[0].sessionIds,index===0?[id]:[]);
   assert.equal((await current.ctx.sessionPersistence.list())[0].header.cwd,original);
  }finally{await current.ctx.fiber.dispose();}
 }
 console.log(JSON.stringify({contract:'C140',actualPublishedRegistry:true,normalDirectoryEventDoesNotRebindHeaderMembership:true,workspacePathsNotBlindlyRewritten:true,tempDirectoriesOnly:true,nativeRequests:0,modelRequests:0}));
});
