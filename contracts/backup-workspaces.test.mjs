import {writeRecoveryLayout} from '../packages/dsh-zhen/lib/backup.js';
import test from'node:test';
import assert from'node:assert/strict';
import{mkdtemp,mkdir,readdir,readFile,writeFile,rm,realpath}from'node:fs/promises';
import{existsSync,readdirSync}from'node:fs';
import{join,relative,isAbsolute}from'node:path';
import{tmpdir}from'node:os';
import{Context}from'@deepseek-ai/cordis';
import Storage from'@deepseek-ai/dsh-storage';
import*as Json from'@deepseek-ai/dsh-storage-json';
import*as Domain from'@deepseek-ai/dsh-storage-domain';
import{workspaceDomainSpec,workspaceDomainState,workspaceRecord}from'@deepseek-ai/dsh-workspace';
import{summarizeWorkspaces,prepareWorkspaceBackup,writeWorkspaceBackup,restoreWorkspaceBackup,writeBackupArchive,openBackupArchive}from'../packages/dsh-zhen/lib/backup.js';
import ZhenService from'../packages/dsh-zhen/lib/index.js';
const password='EXAMPLE workspace recovery password';
const copy=value=>JSON.parse(JSON.stringify(value));
async function consume(records){const result=[];for await(const row of records){const parts=[];for await(const bytes of row.data)parts.push(bytes);result.push({metadata:row.metadata,bytes:Buffer.concat(parts)});}return result;}
async function storage(root){const ctx=new Context();try{await ctx.plugin(Storage);await ctx.plugin(Json,{root});await ctx.plugin(Domain,{backend:'json'});return ctx;}catch(error){await ctx.fiber.dispose();throw error;}}
async function fixture(t,{open=true}={}){
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-workspace-backup-EXAMPLE-'))),parent=join(root,'candidates');await mkdir(parent);const ctx=await storage(join(root,'EXAMPLE_SOURCE_STORAGE')),disposers=[];
 t.after(async()=>{try{for(const dispose of disposers.toReversed())await dispose();await ctx.fiber.dispose();}finally{const actual=await realpath(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-workspace-backup-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
 const source={facility:ctx.storage.domain,domain:open?await ctx.storage.domain.open(workspaceDomainSpec):undefined,revision:0};
 const detach=ctx.on('domain/changed',event=>{if(event.domain===workspaceDomainSpec.name)source.revision++;});disposers.push(detach);
 const record=(name)=>workspaceRecord.parse({path:join(root,'EXAMPLE_MISSING_'+name),title:'EXAMPLE_SOURCE_TITLE_'+name,sessionIds:['EXAMPLE_'+name+'_SESSION'],createdAt:'2000-01-01T00:00:00.000Z',updatedAt:'2000-01-02T00:00:00.000Z'});
 if(source.domain){for(const id of['EXAMPLE_A','EXAMPLE_B','EXAMPLE_ORPHAN'])await source.domain.table('workspaces').put(id,record(id));await source.domain.global.set(workspaceDomainState.parse({initialized:true,defaultWorkspaceId:'EXAMPLE_A',workspaceIds:['EXAMPLE_B','EXAMPLE_A'],archivedSessionIds:['EXAMPLE_ARCHIVED'],pinnedSessionIds:['EXAMPLE_PINNED'],pendingMutation:{operation:'create',workspaceId:'EXAMPLE_PENDING'}}));}
 const resolve=()=>source,archive=join(root,'EXAMPLE.dshbackup');
 const host=async()=>{const previous=process.env.DSH_HOME,agents=process.env.DSH_AGENTS_HOME;process.env.DSH_HOME=join(root,'EXAMPLE_DSH_HOME');process.env.DSH_AGENTS_HOME=join(root,'EXAMPLE_AGENTS_HOME');disposers.push(()=>{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;if(agents===undefined)delete process.env.DSH_AGENTS_HOME;else process.env.DSH_AGENTS_HOME=agents;});ctx.provide('credentials',{resolve(){throw Error('EXAMPLE_NO_KEY_READ');}});const entry=await ctx.plugin(ZhenService);return{entry,service:ctx.get('zhen')};};
 return{root,parent,ctx,source,resolve,record,archive,host};
}
async function document(path){const archive=await openBackupArchive(path,password);try{return JSON.parse((await consume(archive.records()))[0].bytes);}finally{await archive.close();}}
async function forge(path,value,extra=false){const bytes=Buffer.from(JSON.stringify(value));await writeBackupArchive(path,password,(async function*(){yield{metadata:{kind:'workspace-inventory',schema:'dsh-zhen-workspaces-v1'},size:bytes.length,data:(async function*(){yield bytes;})()};if(extra)yield{metadata:{kind:'EXAMPLE_EXTRA'},size:0,data:(async function*(){})()};})());}

test('C111: actual public workspace storage restores every record and original global state into an inactive candidate',async t=>{
 const f=await fixture(t),before=copy({state:f.source.domain.global.get(),rows:[...f.source.domain.table('workspaces').entries()]});await writeWorkspaceBackup(f.archive,password,f.resolve);const original=await document(f.archive),candidate=await restoreWorkspaceBackup(f.archive,password,f.parent);assert.equal(candidate.activated,false);assert.equal(candidate.readyForActivation,false);assert.equal(candidate.workspaces,3);assert.deepEqual(candidate.reviewReasons,['pending-mutation','unordered-record']);const detail=summarizeWorkspaces(candidate).summary;await writeRecoveryLayout(f.parent,[summarizeWorkspaces(candidate).layout]);assert.deepEqual(detail.counts,{workspaces:3});assert.ok(detail.warnings.includes('WORKSPACE_REVIEW_REQUIRED'));assert.ok(detail.warnings.includes('PATH_REBINDING_REQUIRED'));assert.equal((await readFile(f.archive)).includes(Buffer.from('EXAMPLE_SOURCE_TITLE')),false);
 const restored=await storage(candidate.storageRoot);try{const domain=await restored.storage.domain.open(workspaceDomainSpec);assert.deepEqual(copy(domain.global.get()),original.state);assert.deepEqual([...domain.table('workspaces').entries()].map(([id,record])=>({id,record})),original.workspaces);assert.equal(restored.get('workspaceRegistry'),undefined);assert.equal(restored.get('sessions'),undefined);}finally{await restored.fiber.dispose();}
 assert.deepEqual(copy({state:f.source.domain.global.get(),rows:[...f.source.domain.table('workspaces').entries()]}),before);for(const row of original.workspaces)assert.equal(existsSync(row.record.path),false);
 console.log(JSON.stringify({contract:'C111',actualPublishedStorageDomain:true,actualPublishedWorkspaceSchemas:true,allOpenDomainRecordsRestored:true,orderArchivePinsAndPendingPreserved:true,unorderedRecordsPreserved:true,sourceDirectoryContentsRead:false,sourceBytesPreserved:true,activated:false,wholeApplicationRestore:false,nativeWrites:0,modelRequests:0}));
});
test('C111: a cold public domain is unavailable without opening or initializing it',async t=>{
 const f=await fixture(t,{open:false}),before=await readdir(f.root);await assert.rejects(writeWorkspaceBackup(f.archive,password,f.resolve),{code:'BACKUP_WORKSPACE_UNAVAILABLE'});assert.equal(f.ctx.storage.domain.get(workspaceDomainSpec.name),undefined);assert.deepEqual(await readdir(f.root),before);assert.deepEqual(await readdir(f.parent),[]);
});
test('C111: actual domain events reject a same-content write round trip after the stream has ended',async t=>{
 const f=await fixture(t),lease=await prepareWorkspaceBackup(f.resolve);try{await consume(lease.records());const table=f.source.domain.table('workspaces'),original=copy(table.get('EXAMPLE_A'));await table.put('EXAMPLE_A',{...original,title:'EXAMPLE_CHANGED'});await table.put('EXAMPLE_A',original);await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C111: a new public workspace record after component completion invalidates the retained source',async t=>{
 const f=await fixture(t),lease=await prepareWorkspaceBackup(f.resolve);try{await consume(lease.records());await f.source.domain.table('workspaces').put('EXAMPLE_ADDED',f.record('ADDED'));await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C111: a replacement public facility cannot reuse identical domain data as the original source',async t=>{
 const f=await fixture(t),lease=await prepareWorkspaceBackup(f.resolve);try{await consume(lease.records());f.source.facility={};await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C111: closing a backup lease leaves the source domain open and unchanged',async t=>{
 const f=await fixture(t),lease=await prepareWorkspaceBackup(f.resolve);await consume(lease.records());await assert.rejects(consume(lease.records()),{code:'BACKUP_WORKSPACE_STREAM_USED'});lease.close();lease.close();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_WORKSPACE_LEASE_CLOSED'});assert.equal(f.ctx.storage.domain.get(workspaceDomainSpec.name),f.source.domain);assert.equal(f.source.domain.table('workspaces').size,3);
});
test('C111: cancellation before preparation never resolves any workspace source',async()=>{
 const abort=new AbortController();abort.abort();let reads=0;await assert.rejects(prepareWorkspaceBackup(()=>{reads++;throw Error('EXAMPLE_UNREACHABLE');},{signal:abort.signal}),{name:'AbortError'});assert.equal(reads,0);
});
test('C111: unknown public source failures are fixed-code only',async t=>{
 const f=await fixture(t);f.source.domain={name:workspaceDomainSpec.name,global:{get(){throw Error('EXAMPLE_PRIVATE_PATH_OR_REASON');}},table(){throw Error('EXAMPLE_UNREACHABLE');}};await assert.rejects(prepareWorkspaceBackup(f.resolve),error=>error.code==='BACKUP_WORKSPACE_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE'));
});
test('C111: future public record or pending-mutation fields are refused rather than silently discarded',async t=>{
 const f=await fixture(t);assert.equal(workspaceDomainState.shape.pendingMutation.unwrap().options.length,2);await f.source.domain.table('workspaces').put('EXAMPLE_FUTURE',{...f.record('FUTURE'),EXAMPLE_FUTURE_FIELD:'EXAMPLE_VALUE'});await assert.rejects(writeWorkspaceBackup(f.archive,password,f.resolve),{code:'BACKUP_WORKSPACE_READ_FAILED'});assert.equal(existsSync(f.archive),false);await f.source.domain.table('workspaces').delete('EXAMPLE_FUTURE');const state=f.source.domain.global.get();await f.source.domain.global.set({...state,pendingMutation:{...state.pendingMutation,EXAMPLE_FUTURE_FIELD:'EXAMPLE_VALUE'}});await assert.rejects(writeWorkspaceBackup(f.archive,password,f.resolve),{code:'BACKUP_WORKSPACE_READ_FAILED'});assert.equal(existsSync(f.archive),false);
});
test('C111: a pending deletion is restored as inert data without completing it',async t=>{
 const f=await fixture(t),pending={operation:'delete',workspaceId:'EXAMPLE_A'};await f.source.domain.global.set(workspaceDomainState.parse({...f.source.domain.global.get(),pendingMutation:pending}));await writeWorkspaceBackup(f.archive,password,f.resolve);const candidate=await restoreWorkspaceBackup(f.archive,password,f.parent),restored=await storage(candidate.storageRoot);try{const domain=await restored.storage.domain.open(workspaceDomainSpec);assert.deepEqual(domain.global.get().pendingMutation,pending);assert.ok(domain.table('workspaces').get('EXAMPLE_A'));assert.equal(restored.get('workspaceRegistry'),undefined);}finally{await restored.fiber.dispose();}
});
test('C111: a source larger than the complete record budget refuses without truncation',async t=>{
 const f=await fixture(t);let read=0;f.source.domain={name:workspaceDomainSpec.name,global:f.source.domain.global,table(){return{entries:function*(){for(let n=0;n<10002;n++){read++;yield['EXAMPLE_'+n,f.record('EXAMPLE')];}}};}};await assert.rejects(prepareWorkspaceBackup(f.resolve),{code:'BACKUP_WORKSPACE_LIMIT'});assert.equal(read,10001);
});
test('C111: authentication and full document validation precede creating a restore candidate',async t=>{
 const f=await fixture(t);await writeWorkspaceBackup(f.archive,password,f.resolve);const doc=await document(f.archive),keep=join(f.parent,'EXAMPLE_OWNER');await mkdir(keep);await writeFile(join(keep,'EXAMPLE_KEEP.txt'),'EXAMPLE_KEEP');
 const damaged=Buffer.from(await readFile(f.archive));damaged[damaged.length-1]^=1;const bad=join(f.root,'EXAMPLE_DAMAGED');await writeFile(bad,damaged);await assert.rejects(restoreWorkspaceBackup(bad,password,f.parent),{code:'BACKUP_AUTHENTICATION_FAILED'});
 doc.readerSdkVersion='EXAMPLE_FUTURE_SDK';const future=join(f.root,'EXAMPLE_FUTURE');await forge(future,doc);await assert.rejects(restoreWorkspaceBackup(future,password,f.parent),{code:'BACKUP_WORKSPACE_RESTORE_FAILED'});assert.deepEqual(await readdir(f.parent),['EXAMPLE_OWNER']);assert.equal(await readFile(join(keep,'EXAMPLE_KEEP.txt'),'utf8'),'EXAMPLE_KEEP');
});
test('C111: trailing authenticated records refuse before a candidate directory is created',async t=>{
 const f=await fixture(t);await writeWorkspaceBackup(f.archive,password,f.resolve);const other=join(f.root,'EXAMPLE_TRAILING');await forge(other,await document(f.archive),true);await assert.rejects(restoreWorkspaceBackup(other,password,f.parent),{code:'BACKUP_WORKSPACE_TRAILING_RECORDS'});assert.deepEqual(await readdir(f.parent),[]);
});
test('C111: cancellation after candidate metadata publication removes only the fresh candidate',async t=>{
 const f=await fixture(t);await writeWorkspaceBackup(f.archive,password,f.resolve);const keep=join(f.parent,'EXAMPLE_OWNER');await mkdir(keep);const abort=new AbortController(),original=abort.signal.throwIfAborted.bind(abort.signal);let reached=false;abort.signal.throwIfAborted=()=>{if(readdirSync(f.parent).some(name=>name.startsWith('dsh-zhen-workspaces-restore-')&&existsSync(join(f.parent,name,'dsh-zhen-workspaces-restore.json')))){reached=true;abort.abort(new Error('EXAMPLE_CANCEL_AFTER_METADATA'));}original();};await assert.rejects(restoreWorkspaceBackup(f.archive,password,f.parent,{signal:abort.signal}),/EXAMPLE_CANCEL_AFTER_METADATA/);assert.equal(reached,true);assert.deepEqual(await readdir(f.parent),['EXAMPLE_OWNER']);
});
test('C111: actual own Host tracks public domain events across unchanged round trips',async t=>{
 const f=await fixture(t),{service}=await f.host(),lease=await service.workspaceBackupLease();try{await consume(lease.records());await lease.assertCurrent();const table=f.source.domain.table('workspaces'),row=copy(table.get('EXAMPLE_A'));await table.put('EXAMPLE_A',{...row,title:'EXAMPLE_CHANGE'});await table.put('EXAMPLE_A',row);await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}assert.equal(f.ctx.storage.domain.get(workspaceDomainSpec.name),f.source.domain);
});
test('C111: actual own Host refuses cold workspace state without creating or initializing it',async t=>{
 const f=await fixture(t,{open:false}),before=await readdir(f.root),{service}=await f.host();await assert.rejects(service.workspaceBackupLease(),{code:'BACKUP_WORKSPACE_UNAVAILABLE'});assert.equal(f.ctx.storage.domain.get(workspaceDomainSpec.name),undefined);assert.deepEqual(await readdir(f.root),before);
});
test('C111: disposing the original own Host invalidates its retained workspace lease',async t=>{
 const f=await fixture(t),{service,entry}=await f.host(),lease=await service.workspaceBackupLease();try{await consume(lease.records());await entry.dispose();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
 console.log(JSON.stringify({contract:'C111-host',actualOwnHostWorkspaceLease:true,actualPublicDomainEvents:true,coldDomainNotInitialized:true,hostDisposalRefused:true,sourceDomainNotClosedByLease:true,nativeWrites:0,modelRequests:0}));
});
