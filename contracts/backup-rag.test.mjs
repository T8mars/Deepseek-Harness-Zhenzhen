import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,realpath,rm,readdir,unlink,symlink,copyFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';
import {ZhenRag} from '../packages/dsh-zhen/lib/rag-service.js';
import {prepareRagBackup,writeRagBackup,restoreRagBackup,writeBackupArchive,openBackupArchive} from '../packages/dsh-zhen/lib/backup.js';
import {examplePdf} from './fixtures/pdf-document.mjs';
import {exampleDocx} from './fixtures/docx-document.mjs';
import {Context} from '@deepseek-ai/cordis';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
const password='EXAMPLE private RAG backup password',sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{pdf=false}={}){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-rag-backup-EXAMPLE-'))),docs=join(root,'docs'),workspace=join(root,'workspace'),other=join(root,'other'),parent=join(root,'candidates');for(const path of [docs,workspace,other,parent])await mkdir(path);
  const path=join(root,'source.sqlite'),file=join(root,'backend.json'),store=new KnowledgeStore(path),rag=new ZhenRag(()=>store,file);const handles=[store];
  t.after(async()=>{rag.close();for(const handle of handles)try{handle.close();}catch{}const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-rag-backup-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  await writeFile(join(docs,'EXAMPLE.txt'),'EXAMPLE ONLY\n示例纸灯角色松石。');if(pdf)await writeFile(join(docs,'EXAMPLE.pdf'),examplePdf(['EXAMPLE ONLY\n示例第一页。','EXAMPLE ONLY\n示例雨夜古桥。']));
  const collection=await store.create('EXAMPLE_PROJECT','示例集合',docs);await store.index('EXAMPLE_PROJECT',collection.id);await store.bind('EXAMPLE_PROJECT',workspace);store.setAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',collection.id,true);
  const policy={protectedContainers:[root],forbiddenTrees:[join(root,'EXAMPLE_NATIVE')]},state={store,rag,policy},source=()=>state,archive=join(root,'EXAMPLE.encrypted');
  return {root,docs,workspace,other,parent,path,file,store,rag,handles,collection,policy,state,source,archive};
}
async function decoded(path){const archive=await openBackupArchive(path,password),rows=[];try{for await(const row of archive.records()){const parts=[];for await(const bytes of row.data)parts.push(bytes);rows.push({metadata:row.metadata,bytes:Buffer.concat(parts)});}return rows;}finally{await archive.close();}}
async function* records(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
async function forged(f,name,edit){const rows=await decoded(f.archive),manifest=JSON.parse(rows[0].bytes);await edit(manifest,rows);rows[0].bytes=Buffer.from(JSON.stringify(manifest));const path=join(f.root,'EXAMPLE_'+name);await writeBackupArchive(path,password,records(rows));return path;}
function changeTable(manifest,rows,table,edit){const record=rows.find(row=>row.metadata.table===table),data=record.bytes.toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));edit(data);record.bytes=Buffer.from(data.map(row=>JSON.stringify(row)+'\n').join(''));Object.assign(manifest.tables.find(row=>row.table===table),{rows:data.length,bytes:record.bytes.length,sha256:sha(record.bytes)});}
async function checkUnchanged(f,expected){assert.equal(sha(await readFile(f.path)),expected);}

test('C97: fresh logical restore preserves PDF page2, exact citations, current and invalid historical grants and sequence gaps',async t=>{
  const f=await fixture(t,{pdf:true});await f.store.retrieveForAgent('EXAMPLE_OLD','seedance',f.workspace,'雨夜古桥');await f.store.bind('EXAMPLE_PROJECT',f.other);const hits=await f.store.retrieveForAgent('EXAMPLE_CURRENT','seedance',f.other,'雨夜古桥');assert.equal(hits[0].page,2);
  const raw=new DatabaseSync(f.path);raw.exec("UPDATE sqlite_sequence SET seq=10 WHERE name='binding_revisions'");raw.close();const before=sha(await readFile(f.path));await writeRagBackup(f.archive,password,f.source);const candidate=await restoreRagBackup(f.archive,password,f.parent),restored=new KnowledgeStore(candidate.database);f.handles.push(restored);
  assert.equal(candidate.activated,false);assert.equal(candidate.readyForActivation,false);assert.equal(candidate.wholeApplicationRestore,false);assert.deepEqual(candidate.resources,{matching:2,changed:0,missing:0});assert.deepEqual(restored.search('EXAMPLE_PROJECT','雨夜古桥','seedance'),f.store.search('EXAMPLE_PROJECT','雨夜古桥','seedance'));assert.deepEqual(restored.citation('EXAMPLE_PROJECT',hits[0].id,hits[0].epoch,'seedance'),hits[0]);
  await restored.assertSessionAllowed('EXAMPLE_CURRENT','seedance',f.other);await assert.rejects(restored.assertSessionAllowed('EXAMPLE_OLD','seedance',f.workspace));assert.equal(restored.hasSessionGrants('EXAMPLE_OLD'),true);assert.equal((await restored.bind('EXAMPLE_PROJECT',f.workspace)).epoch,11);
  assert.equal(sha(await readFile(join(candidate.collections[0].restoredRoot,'EXAMPLE.pdf'))),sha(await readFile(join(f.docs,'EXAMPLE.pdf'))));assert.equal(restored.list('EXAMPLE_PROJECT')[0].root,f.store.list('EXAMPLE_PROJECT')[0].root);await checkUnchanged(f,before);
  console.log(JSON.stringify({contract:'C97',actualKnowledgeRestore:true,pdfPage:2,historicalInvalidGrantRetained:true,sequenceGapPreserved:true,sourceBytesPreserved:true,activated:false,nativeWrites:0,modelRequests:0}));
});
test('C97: modified and deleted originals remain distinct from original indexed text',async t=>{
  const f=await fixture(t);await writeFile(join(f.docs,'EXAMPLE_missing.txt'),'EXAMPLE ONLY 示例旧资料。');await f.store.index('EXAMPLE_PROJECT',f.collection.id);await unlink(join(f.docs,'EXAMPLE_missing.txt'));await writeFile(join(f.docs,'EXAMPLE.txt'),'EXAMPLE ONLY 已修改原件。');
  await writeRagBackup(f.archive,password,f.source);const result=await restoreRagBackup(f.archive,password,f.parent),store=new KnowledgeStore(result.database);f.handles.push(store);assert.deepEqual(result.resources,{matching:0,changed:1,missing:1});assert.match(await readFile(join(result.collections[0].restoredRoot,'EXAMPLE.txt'),'utf8'),/已修改/);assert.equal(existsSync(join(result.collections[0].restoredRoot,'EXAMPLE_missing.txt')),false);assert.ok(store.search('EXAMPLE_PROJECT','纸灯').length);
});
test('C97: live, persisted invalid and unavailable backend settings are data, never provider activation',async t=>{
  const f=await fixture(t);let calls=0;const unregister=f.rag.register({id:'example-provider',label:'EXAMPLE provider',search(){calls++;throw Error();}});f.rag.configure('example-provider',false,f.rag.snapshot().revision);unregister();await writeFile(f.file,'EXAMPLE_INVALID_JSON');await writeRagBackup(f.archive,password,f.source);const result=await restoreRagBackup(f.archive,password,f.parent),backend=JSON.parse(await readFile(result.backendState));assert.equal(backend.settings.selected,'example-provider');assert.equal(backend.settings.enabled,false);assert.equal(backend.status.state,'paused');assert.equal(backend.persisted.valid,false);assert.equal(Buffer.from(backend.persisted.bytesBase64,'base64').toString(),'EXAMPLE_INVALID_JSON');assert.equal(calls,0);assert.equal(existsSync(join(result.root,'rag-backend.json')),false);
});
test('C97: explicit absent database stays absent and does not initialize the lazy store',async t=>{
  const f=await fixture(t),rag=new ZhenRag(()=>{throw Error('EXAMPLE_MUST_NOT_INITIALIZE');});t.after(()=>rag.close());await writeRagBackup(f.archive,password,()=>({store:null,rag,policy:f.policy}));const result=await restoreRagBackup(f.archive,password,f.parent);assert.equal(result.database,null);assert.deepEqual(result.collections,[]);assert.equal(existsSync(join(result.root,'knowledge.sqlite')),false);
});
test('C97: same-handle changes after own records fail the retained global source barrier',async t=>{
  const f=await fixture(t),lease=await prepareRagBackup(f.source);try{for await(const row of lease.records())for await(const _ of row.data){}f.store.setAccess('EXAMPLE_PROJECT',f.collection.id,false,'');await assert.rejects(lease.assertCurrent(),e=>e.code==='BACKUP_SOURCE_CHANGED');}finally{await lease.close();}
});
test('C97: another SQLite connection changes data_version and invalidates the frozen capture',async t=>{
  const f=await fixture(t),lease=await prepareRagBackup(f.source),other=new DatabaseSync(f.path);try{other.prepare('UPDATE collections SET name=?').run('EXAMPLE_CHANGED');await assert.rejects(lease.assertCurrent(),e=>e.code==='BACKUP_SOURCE_CHANGED');}finally{other.close();await lease.close();}
});
test('C97: backend registration, source replacement and policy mutation invalidate a retained lease',async t=>{
  for(const kind of ['backend','source','policy']){const f=await fixture(t),lease=await prepareRagBackup(f.source);try{if(kind==='backend')f.rag.register({id:'example-extra',label:'EXAMPLE',search:()=>[]});if(kind==='source')f.state.store=null;if(kind==='policy')f.policy.forbiddenTrees.push(join(f.root,'EXAMPLE_ADDED'));await assert.rejects(lease.assertCurrent(),e=>e.code==='BACKUP_SOURCE_CHANGED');}finally{await lease.close();}}
});
test('C97: missing originals that reappear and changed originals invalidate the tail barrier',async t=>{
  for(const missing of [true,false]){const f=await fixture(t);if(missing)await unlink(join(f.docs,'EXAMPLE.txt'));const lease=await prepareRagBackup(f.source);try{await writeFile(join(f.docs,'EXAMPLE.txt'),'EXAMPLE_NEW_ORIGINAL');await assert.rejects(lease.assertCurrent(),e=>e.code==='BACKUP_SOURCE_CHANGED');}finally{await lease.close();}}
});
test('C97: late source mutation refuses encrypted destination publication',async t=>{
  const f=await fixture(t),lease=await prepareRagBackup(f.source);try{await assert.rejects(writeBackupArchive(f.archive,password,(async function*(){yield* lease.records();await writeFile(join(f.docs,'EXAMPLE.txt'),'EXAMPLE_LATE_CHANGE');await lease.assertCurrent();})()),e=>e.code==='BACKUP_SOURCE_CHANGED');assert.equal(existsSync(f.archive),false);}finally{await lease.close();}
});
test('C97: wrong password and corrupted authentication create no candidate',async t=>{
  const f=await fixture(t);await writeRagBackup(f.archive,password,f.source);await assert.rejects(restoreRagBackup(f.archive,'EXAMPLE wrong password',f.parent));const bytes=await readFile(f.archive);bytes[bytes.length-1]^=1;const path=join(f.root,'EXAMPLE_CORRUPT');await writeFile(path,bytes);await assert.rejects(restoreRagBackup(path,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);
});
test('C97: malformed or duplicate logical rows and orphan documents cannot install an archive schema',async t=>{
  const f=await fixture(t);await writeRagBackup(f.archive,password,f.source);
  for(const kind of ['unknown-column','duplicate','orphan']){const path=await forged(f,kind,(manifest,rows)=>changeTable(manifest,rows,'documents',values=>{if(kind==='unknown-column')values[0].sql='EXAMPLE CREATE TRIGGER';if(kind==='duplicate')values.push({...values[0]});if(kind==='orphan')values[0].collection_id='00000000-0000-4000-8000-000000000000';}));await assert.rejects(restoreRagBackup(path,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);}
});
test('C97: sequence high water cannot fall below retained historical grants',async t=>{
  const f=await fixture(t);await f.store.retrieveForAgent('EXAMPLE_OLD','seedance',f.workspace,'纸灯');await f.store.bind('EXAMPLE_PROJECT',f.other);await writeRagBackup(f.archive,password,f.source);const path=await forged(f,'counter',manifest=>{manifest.sequence=1;});await assert.rejects(restoreRagBackup(path,password,f.parent),e=>e.code==='BACKUP_RAG_SEQUENCE_INVALID');assert.deepEqual(await readdir(f.parent),[]);
});
test('C97: resource digest mismatch, cross-document metadata, extra and truncated records clean only their own candidates',async t=>{
  const f=await fixture(t);await mkdir(join(f.parent,'EXAMPLE_KEEP'));await writeRagBackup(f.archive,password,f.source);
  for(const kind of ['digest','cross-document','extra','missing']){const path=await forged(f,kind,(manifest,rows)=>{if(kind==='digest')rows.at(-1).bytes=Buffer.alloc(rows.at(-1).bytes.length,120);if(kind==='cross-document')manifest.resources[0].indexedDigest='0'.repeat(64);if(kind==='extra')rows.push({metadata:{kind:'EXAMPLE_EXTRA'},bytes:Buffer.from('EXAMPLE')});if(kind==='missing')rows.pop();});await assert.rejects(restoreRagBackup(path,password,f.parent));assert.deepEqual(await readdir(f.parent),['EXAMPLE_KEEP']);}
});
test('C97: path traversal and portable normalized collisions refuse before candidate creation',async t=>{
  const f=await fixture(t);await writeRagBackup(f.archive,password,f.source);for(const kind of ['traversal','collision']){const path=await forged(f,kind,manifest=>{if(kind==='traversal')manifest.resources[0].path='../EXAMPLE_ESCAPE';else manifest.resources.push({...manifest.resources[0],documentId:'00000000-0000-4000-8000-000000000000',path:'example.TXT'});});await assert.rejects(restoreRagBackup(path,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);}
});
test('C97: cancellation after final provenance removes fresh candidate and preserves an earlier restore',async t=>{
  const f=await fixture(t);await writeRagBackup(f.archive,password,f.source);const first=await restoreRagBackup(f.archive,password,f.parent),controller=new AbortController(),original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{if(readdirSync(f.parent).some(name=>join(f.parent,name)!==first.root&&existsSync(join(f.parent,name,'dsh-zhen-rag-restore.json'))))controller.abort();original();};await assert.rejects(restoreRagBackup(f.archive,password,f.parent,{signal:controller.signal}),e=>e.name==='AbortError');assert.deepEqual(await readdir(f.parent),[first.root.split(/[\\/]/).at(-1)]);
});
test('C97: resource forbidden scope and symlinks refuse without reading the target',async t=>{
  const f=await fixture(t);f.policy.forbiddenTrees.push(f.docs);await assert.rejects(writeRagBackup(f.archive,password,f.source),e=>e.code==='BACKUP_RAG_SCOPE_REFUSED');f.policy.forbiddenTrees.pop();const file=join(f.docs,'EXAMPLE.txt');await unlink(file);await symlink(join(f.root,'EXAMPLE_NEVER_READ'),file);await assert.rejects(writeRagBackup(f.archive,password,f.source),e=>e.code==='BACKUP_RAG_LINK_REFUSED');assert.equal(existsSync(f.archive),false);
});
test('C97: unknown source schema and explicit data budgets fail, with no migration or partial backup',async t=>{
  const f=await fixture(t),raw=new DatabaseSync(f.path);raw.exec('CREATE TABLE EXAMPLE_UNKNOWN(value TEXT)');raw.close();const before=sha(await readFile(f.path));await assert.rejects(writeRagBackup(f.archive,password,f.source),e=>e.code==='BACKUP_RAG_SCHEMA_UNSUPPORTED');await checkUnchanged(f,before);assert.equal(existsSync(f.archive),false);
  const g=await fixture(t);await assert.rejects(writeRagBackup(g.archive,password,g.source,{limits:{recordBytes:10}}));assert.equal(existsSync(g.archive),false);
});
test('C97: live nonempty KnowledgeStore cannot be used as a restore target',async t=>{
  const f=await fixture(t),before=sha(await readFile(f.path));await assert.rejects(f.store.restoreBackupRows((async function*(){})(),0),e=>e.code==='BACKUP_RAG_TARGET_NOT_EMPTY');await checkUnchanged(f,before);
});
test('C97: DOCX original bytes and extracted body line citations round-trip independently',async t=>{
  const f=await fixture(t),bytes=exampleDocx();await writeFile(join(f.docs,'EXAMPLE.docx'),bytes);await f.store.index('EXAMPLE_PROJECT',f.collection.id);const hit=f.store.search('EXAMPLE_PROJECT','守护灯塔')[0];assert.ok(hit);await writeRagBackup(f.archive,password,f.source);const result=await restoreRagBackup(f.archive,password,f.parent),store=new KnowledgeStore(result.database);f.handles.push(store);assert.deepEqual(store.citation('EXAMPLE_PROJECT',hit.id,hit.epoch,'seedance'),hit);assert.deepEqual(await readFile(join(result.collections[0].restoredRoot,'EXAMPLE.docx')),Buffer.from(bytes));
});
test('C97: disabled collections and revoked session grants remain disabled after rebuilding FTS',async t=>{
  const f=await fixture(t);await f.store.retrieveForAgent('EXAMPLE_REVOKED','seedance',f.workspace,'纸灯');f.store.setAccess('EXAMPLE_PROJECT',f.collection.id,false,'');await writeRagBackup(f.archive,password,f.source);const result=await restoreRagBackup(f.archive,password,f.parent),store=new KnowledgeStore(result.database);f.handles.push(store);assert.deepEqual(store.search('EXAMPLE_PROJECT','纸灯'),[]);assert.equal(store.hasSessionGrants('EXAMPLE_REVOKED'),true);await assert.rejects(store.assertSessionAllowed('EXAMPLE_REVOKED','seedance',f.workspace));
});
async function host(t,f,{cold=true,version=3}={}){
  const home=join(f.root,'EXAMPLE_HOME'),own=join(home,'dsh-zhen'),file=join(own,'knowledge.sqlite');await mkdir(own,{recursive:true});if(cold){await copyFile(f.path,file);if(version!==3){const raw=new DatabaseSync(file);raw.exec('PRAGMA user_version='+version);raw.close();}}
  const previous=process.env.DSH_HOME;process.env.DSH_HOME=home;const ctx=new Context();ctx.provide('credentials',{});await ctx.plugin(ZhenService);t.after(async()=>{try{await ctx.fiber.dispose();}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;}});return {ctx,service:ctx.get('zhen'),home,file};
}
test('C97: actual own Host cold adapter reads existing schema3 without opening or migrating lazy KnowledgeStore',async t=>{
  const f=await fixture(t),h=await host(t,f),before=sha(await readFile(h.file));process.env.DSH_HOME=join(f.root,'EXAMPLE_AMBIENT_CHANGED');const lease=await h.service.ragBackupLease(()=>f.policy);try{await writeBackupArchive(f.archive,password,lease.records());await lease.assertCurrent();}finally{await lease.close();}assert.equal(sha(await readFile(h.file)),before);assert.equal(existsSync(join(process.env.DSH_HOME,'dsh-zhen','knowledge.sqlite')),false);const result=await restoreRagBackup(f.archive,password,f.parent),store=new KnowledgeStore(result.database);f.handles.push(store);assert.ok(store.search('EXAMPLE_PROJECT','纸灯').length);
});
test('C97: actual own Host records absent lazy database without creating it and notices later creation',async t=>{
  const f=await fixture(t),h=await host(t,f,{cold:false}),lease=await h.service.ragBackupLease(()=>f.policy);try{for await(const row of lease.records())for await(const _ of row.data){}assert.equal(existsSync(h.file),false);await copyFile(f.path,h.file);await assert.rejects(lease.assertCurrent(),e=>e.code==='BACKUP_SOURCE_CHANGED');}finally{await lease.close();}
});
test('C97: Host cold adapter refuses an older schema without silently migrating source',async t=>{
  const f=await fixture(t),h=await host(t,f,{version:2}),before=sha(await readFile(h.file));await assert.rejects(h.service.ragBackupLease(()=>f.policy),e=>e.code==='BACKUP_RAG_SCHEMA_UNSUPPORTED');assert.equal(sha(await readFile(h.file)),before);const raw=new DatabaseSync(h.file,{readOnly:true});try{assert.equal(raw.prepare('PRAGMA user_version').get().user_version,2);}finally{raw.close();}
});
