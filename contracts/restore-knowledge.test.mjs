import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,readdir,rename,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';
import {ZhenRag} from '../packages/dsh-zhen/lib/rag-service.js';
import {writeRagBackup,restoreRagBackup,prepareRestoredKnowledge} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE knowledge application password',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function snapshot(store){const lease=await store.backupLease();try{return{sequence:lease.sequence,tables:Object.fromEntries(lease.tables.map(row=>[row.table,[...lease.rows(row.table)]]))};}finally{await lease.close();}}
async function fixture(t,{cold=false}={}){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-knowledge-application-EXAMPLE-'))),docs=join(root,'EXAMPLE_docs'),workspace=join(root,'EXAMPLE_workspace'),parent=join(root,'candidates'),home=join(root,'EXAMPLE_new_home'),data=join(home,'dsh-zhen');
  for(const path of[docs,workspace,parent,home,data])await mkdir(path);
  const sourceFile=join(root,'EXAMPLE_original.sqlite'),store=cold?null:new KnowledgeStore(sourceFile),rag=new ZhenRag(()=>{if(!store)throw Error('EXAMPLE_COLD_NOT_OPENED');return store;},join(root,'EXAMPLE_backend.json')),handles=[],rags=[rag];let closed=false;
  t.after(async()=>{try{for(const item of rags)item.close();for(const item of handles)item.close();if(!closed)store?.close();}finally{const actual=await realpath(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-knowledge-application-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
  const text='EXAMPLE 创作参考资料\n示例纸灯角色松石。';await writeFile(join(docs,'EXAMPLE.txt'),text);let collection,hits=[];
  if(store){collection=await store.create('EXAMPLE_PROJECT','示例集合',docs);await store.index('EXAMPLE_PROJECT',collection.id);await store.bind('EXAMPLE_PROJECT',workspace);store.setAccess('EXAMPLE_PROJECT',collection.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',collection.id,true);hits=await store.retrieveForAgent('EXAMPLE_SESSION','seedance',workspace,'纸灯');assert.ok(hits.length>0);}
  const archive=join(root,'EXAMPLE.encrypted');await writeRagBackup(archive,password,()=>({store,rag,policy:{protectedContainers:[root],forbiddenTrees:[]}}));const source=await restoreRagBackup(archive,password,parent);
  return{root,docs,workspace,parent,home,data,sourceFile,store,source,collection,hits,text,handles,rags,closeOriginal(){if(!closed){rag.close();store?.close();closed=true;}}};
}
async function apply(f,source=f.source,options){return prepareRestoredKnowledge(f.root,f.home,source,options);}

test('C125: staged knowledge keeps all logical rows and source files, rebinds roots and invalidates historical grants without deleting them',async t=>{
  const f=await fixture(t),before=await snapshot(f.store),component=new KnowledgeStore(f.source.database);f.handles.push(component);const componentBefore=await snapshot(component),originalHash=sha(await readFile(f.source.database));
  const result=await apply(f),active=new KnowledgeStore(result.database);f.handles.push(active);const actual=await snapshot(active);
  assert.equal(result.present,true);assert.equal(result.agentAccessRestored,false);assert.equal(result.activated,false);assert.equal(result.historicalGrants,before.tables.session_grants.length);assert.equal(result.collections.length,1);
  for(const table of Object.keys(before.tables))if(table!=='collections')assert.deepEqual(actual.tables[table],before.tables[table],table);
  assert.deepEqual(actual.tables.collections,before.tables.collections.map(row=>({...row,root:f.source.collections.find(item=>item.id===row.id).restoredRoot,epoch:row.epoch+1,agent_enabled:0})));
  assert.deepEqual(await snapshot(f.store),before);assert.deepEqual(await snapshot(component),componentBefore);assert.equal(sha(await readFile(f.source.database)),originalHash);
  assert.equal(active.hasSessionGrants('EXAMPLE_SESSION'),true);await assert.rejects(active.assertSessionAllowed('EXAMPLE_SESSION','seedance',f.workspace));await f.store.assertSessionAllowed('EXAMPLE_SESSION','seedance',f.workspace);
  const backend=new ZhenRag(()=>active,result.backend);f.rags.push(backend);assert.equal(backend.snapshot().state,'paused');assert.equal(backend.snapshot().selected,'lexical');assert.equal(await readFile(result.backendReview,'utf8'),await readFile(f.source.backendState,'utf8'));
  f.closeOriginal();for(const path of[f.docs,f.workspace]){const physical=await realpath(path),part=relative(f.root,physical);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('EXAMPLE_'));await rename(physical,path+'.EXAMPLE_OFFLINE');}
  const found=active.search('EXAMPLE_PROJECT','纸灯');assert.deepEqual(found.map(row=>row.id),f.hits.map(row=>row.id));assert.equal(found[0].epoch,f.hits[0].epoch+1);assert.equal(await readFile(join(active.list('EXAMPLE_PROJECT')[0].root,'EXAMPLE.txt'),'utf8'),f.text);assert.deepEqual(active.search('EXAMPLE_PROJECT','纸灯','seedance'),[]);
  console.log(JSON.stringify({contract:'C125',actualOwnKnowledgeRowsAndFts:true,sourceDatabasePreserved:true,componentDatabasePreserved:true,actualReboundSourceBytes:true,originalSourceDirectoriesUnavailable:true,historicalGrantsPreservedAndDenied:true,chunkIdsPreserved:true,backendChoicePreservedButPaused:true,activated:false,wholeApplicationRestore:false,nativeRequests:0,modelRequests:0}));
});
test('C125: incomplete collection mappings refuse before creating application files',async t=>{const f=await fixture(t);await assert.rejects(apply(f,{...f.source,collections:[]}),{code:'BACKUP_RAG_APPLICATION_MAPPING_INVALID'});assert.deepEqual(await readdir(f.data),[]);});
test('C125: duplicate collection mappings refuse without overwriting anything',async t=>{const f=await fixture(t);await assert.rejects(apply(f,{...f.source,collections:[...f.source.collections,...f.source.collections]}),{code:'BACKUP_RAG_APPLICATION_MAPPING_INVALID'});assert.deepEqual(await readdir(f.data),[]);});
test('C125: database outside its own component is refused even inside the test composition',async t=>{const f=await fixture(t);await assert.rejects(apply(f,{...f.source,database:f.sourceFile}),{code:'BACKUP_TEMP_BOUNDARY'});assert.deepEqual(await readdir(f.data),[]);});
test('C125: an existing destination database is preserved',async t=>{const f=await fixture(t),file=join(f.data,'knowledge.sqlite');await writeFile(file,'EXAMPLE prior database bytes');await assert.rejects(apply(f));assert.equal(await readFile(file,'utf8'),'EXAMPLE prior database bytes');assert.deepEqual(await readdir(f.data),['knowledge.sqlite']);});
test('C125: an existing backend setting survives rollback of newly created files',async t=>{const f=await fixture(t),file=join(f.data,'rag-backend.json');await writeFile(file,'EXAMPLE prior settings');await assert.rejects(apply(f));assert.equal(await readFile(file,'utf8'),'EXAMPLE prior settings');assert.deepEqual(await readdir(f.data),['rag-backend.json']);});
test('C125: cancellation during import cleans only new files and retains source grants',async t=>{const f=await fixture(t),before=await snapshot(f.store),sentinel=join(f.data,'EXAMPLE_keep.txt');await writeFile(sentinel,'EXAMPLE');const controller=new AbortController();Object.defineProperty(controller.signal,'throwIfAborted',{value(){if(existsSync(join(f.data,'knowledge.sqlite')))controller.abort(Error('EXAMPLE_KNOWLEDGE_CANCEL'));AbortSignal.prototype.throwIfAborted.call(this);}});await assert.rejects(apply(f,f.source,{signal:controller.signal}),/EXAMPLE_KNOWLEDGE_CANCEL/);assert.deepEqual(await readdir(f.data),['EXAMPLE_keep.txt']);assert.deepEqual(await snapshot(f.store),before);});
test('C125: a genuinely cold source remains absent and retains a paused backend review',async t=>{const f=await fixture(t,{cold:true}),result=await apply(f);assert.equal(existsSync(f.sourceFile),false);assert.equal(result.present,false);assert.equal(result.database,null);assert.deepEqual(result.collections,[]);assert.equal(existsSync(join(f.data,'knowledge.sqlite')),false);assert.equal(JSON.parse(await readFile(result.backend,'utf8')).enabled,false);});
