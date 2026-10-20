import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {KnowledgeStore} from '../lib/knowledge.js';

async function fixture(t) {
  const root=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-rag-source-'))),folder=join(root,'EXAMPLE_DOCS'),workspace=join(root,'EXAMPLE_WORKSPACE');
  mkdirSync(folder);mkdirSync(workspace);
  const text='EXAMPLE_BEGIN '+Array.from({length:18},(_,i)=>` EXAMPLE_SECTION_${i} `+'示例片段'.repeat(160)).join('')+' EXAMPLE_FINAL_CODA';
  const file=join(folder,'EXAMPLE.txt');writeFileSync(file,text);
  let db=new KnowledgeStore(join(root,'EXAMPLE.sqlite'));
  const c=await db.create('EXAMPLE_PROJECT','示例资料',folder);await db.index('EXAMPLE_PROJECT',c.id);
  const hit=db.search('EXAMPLE_PROJECT','EXAMPLE_BEGIN')[0];
  t.after(()=>{db.close();const rel=relative(realpathSync.native(tmpdir()),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(root,{recursive:true,force:true});});
  return {root,folder,workspace,file,hit,collection:c,get db(){return db;},reopen(){db.close();db=new KnowledgeStore(join(root,'EXAMPLE.sqlite'));}};
}
test('indexed source windows paginate complete same-line documents in stable order across reopen',async t=>{
  const f=await fixture(t),first=f.db.source('EXAMPLE_PROJECT',f.hit.id,f.hit.epoch);assert.match(first.sections[0].text,/EXAMPLE_BEGIN/);assert.equal(first.firstSection,1);assert.equal(first.earlierId,null);
  const seen=new Map();let window=first,steps=0;
  do {for(const hit of window.sections){assert.equal(hit.line,1);seen.set(hit.id,hit.text);}if(!window.laterId)break;assert.ok(++steps<100);window=f.db.source('EXAMPLE_PROJECT',window.laterId,f.hit.epoch);} while(true);
  assert.equal(seen.size,first.totalSections);assert.match([...seen.values()].at(-1),/EXAMPLE_FINAL_CODA/);assert.ok(window.sections.length<=3);assert.equal(window.firstSection+window.sections.length-1,window.totalSections);
  f.reopen();assert.deepEqual(f.db.source('EXAMPLE_PROJECT',f.hit.id,f.hit.epoch),first);
  rmSync(f.file);assert.deepEqual(f.db.source('EXAMPLE_PROJECT',f.hit.id,f.hit.epoch),first,'opening the index does not open deleted source files');
});
test('local source view does not authorize model reads; exact current session grant and binding are required',async t=>{
  const f=await fixture(t),{id,epoch}=f.hit;
  assert.throws(()=>f.db.source('EXAMPLE_OTHER_PROJECT',id,epoch));
  await f.db.bind('EXAMPLE_PROJECT',f.workspace);f.db.setAccess('EXAMPLE_PROJECT',f.collection.id,true,'seedance');f.db.setAgentAccess('EXAMPLE_PROJECT',f.collection.id,true);
  const hit=f.db.search('EXAMPLE_PROJECT','EXAMPLE_BEGIN')[0];assert.ok(f.db.source('EXAMPLE_PROJECT',hit.id,hit.epoch));
  await assert.rejects(f.db.sourceForAgent('EXAMPLE_SESSION','seedance',f.workspace,hit.id,hit.epoch));
  await f.db.retrieveForAgent('EXAMPLE_SESSION','seedance',f.workspace,'EXAMPLE_BEGIN');
  assert.equal((await f.db.sourceForAgent('EXAMPLE_SESSION','seedance',f.workspace,hit.id,hit.epoch)).anchorId,hit.id);
  for(const [session,provider,directory] of [['EXAMPLE_OTHER_SESSION','seedance',f.workspace],['EXAMPLE_SESSION','EXAMPLE_OTHER_PROVIDER',f.workspace],['EXAMPLE_SESSION','seedance',f.root]]) await assert.rejects(f.db.sourceForAgent(session,provider,directory,hit.id,hit.epoch));
  f.db.setAgentAccess('EXAMPLE_PROJECT',f.collection.id,false);await assert.rejects(f.db.sourceForAgent('EXAMPLE_SESSION','seedance',f.workspace,hit.id,hit.epoch));
});
test('reindex, revoked local access and collection boundaries invalidate old source references',async t=>{
  const f=await fixture(t),second=await f.db.create('EXAMPLE_PROJECT','示例未授权集合',f.folder);await f.db.index('EXAMPLE_PROJECT',second.id);
  await f.db.bind('EXAMPLE_PROJECT',f.workspace);f.db.setAccess('EXAMPLE_PROJECT',f.collection.id,true,'seedance');f.db.setAgentAccess('EXAMPLE_PROJECT',f.collection.id,true);
  const hits=await f.db.retrieveForAgent('EXAMPLE_SESSION','seedance',f.workspace,'EXAMPLE_BEGIN'),hit=hits[0],denied=f.db.search('EXAMPLE_PROJECT','EXAMPLE_BEGIN').find(x=>x.collectionId===second.id);
  await assert.rejects(f.db.sourceForAgent('EXAMPLE_SESSION','seedance',f.workspace,denied.id,denied.epoch));
  await f.db.index('EXAMPLE_PROJECT',f.collection.id);assert.throws(()=>f.db.source('EXAMPLE_PROJECT',hit.id,hit.epoch));await assert.rejects(f.db.sourceForAgent('EXAMPLE_SESSION','seedance',f.workspace,hit.id,hit.epoch));
  const fresh=f.db.search('EXAMPLE_PROJECT','EXAMPLE_BEGIN').find(x=>x.collectionId===f.collection.id);f.db.setAccess('EXAMPLE_PROJECT',f.collection.id,false,'');assert.throws(()=>f.db.source('EXAMPLE_PROJECT',fresh.id,fresh.epoch));
});
