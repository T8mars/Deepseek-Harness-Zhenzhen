import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeStore} from '../lib/knowledge.js';
import {examplePdf} from '../../../contracts/fixtures/pdf-document.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-pdf-index-EXAMPLE-'))),docs=join(root,'EXAMPLE_DOCS');mkdirSync(docs);t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});});return{root,docs};}
test('PDF pages are chunks of one source file, with page-aware local and authorized agent citations',async t=>{
 const f=fixture(t),store=new KnowledgeStore(':memory:');t.after(()=>store.close());const file=join(f.docs,'EXAMPLE.pdf'),bytes=examplePdf(['EXAMPLE ONLY\n示例角色蓝桥。','EXAMPLE ONLY\n示例场景雨夜古桥。']);writeFileSync(file,bytes);writeFileSync(join(f.docs,'EXAMPLE.md'),'EXAMPLE ONLY\n示例文本纸灯。');
 const c=await store.create('EXAMPLE_PROJECT','示例集合',f.docs);assert.deepEqual(await store.index('EXAMPLE_PROJECT',c.id),{indexed:2,skipped:0,failed:0});assert.equal(store.list('EXAMPLE_PROJECT')[0].documents,2);
 const hit=store.search('EXAMPLE_PROJECT','雨夜古桥')[0];assert.equal(hit.path,'EXAMPLE.pdf');assert.equal(hit.page,2);assert.ok(hit.line>=1);assert.equal(store.source('EXAMPLE_PROJECT',hit.id,hit.epoch).sections.find(s=>s.id===hit.id).page,2);assert.equal(store.search('EXAMPLE_PROJECT','纸灯')[0].page,undefined);assert.deepEqual(store.search('EXAMPLE_OTHER','雨夜古桥'),[]);
 await store.bind('EXAMPLE_PROJECT',f.root);store.setAccess('EXAMPLE_PROJECT',c.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',c.id,true);const retrieved=await store.retrieveForAgent('EXAMPLE_SESSION','seedance',f.root,'雨夜古桥'),current=retrieved[0];assert.equal(current.page,2);assert.equal(store.citation('EXAMPLE_PROJECT',current.id,current.epoch,'seedance').page,2);assert.equal((await store.sourceForAgent('EXAMPLE_SESSION','seedance',f.root,current.id,current.epoch)).sections.find(x=>x.id===current.id).page,2);
 store.setAgentAccess('EXAMPLE_PROJECT',c.id,false);await assert.rejects(store.sourceForAgent('EXAMPLE_SESSION','seedance',f.root,current.id,current.epoch));assert.equal(sha(readFileSync(file)),sha(bytes));
});
test('scan-only PDFs are skipped, damaged PDFs fail and source bytes are never modified',async t=>{
 const f=fixture(t),store=new KnowledgeStore(':memory:');t.after(()=>store.close());const empty=examplePdf([''],{imageOnly:true}),bad=Buffer.from('%PDF-1.7\nEXAMPLE_INVALID');assert.ok(empty.includes(Buffer.from('/Subtype /Image')));writeFileSync(join(f.docs,'EXAMPLE_SCAN.pdf'),empty);writeFileSync(join(f.docs,'EXAMPLE_BROKEN.pdf'),bad);const c=await store.create('EXAMPLE_PROJECT','示例集合',f.docs);assert.deepEqual(await store.index('EXAMPLE_PROJECT',c.id),{indexed:0,skipped:1,failed:1});assert.equal(sha(readFileSync(join(f.docs,'EXAMPLE_SCAN.pdf'))),sha(empty));assert.equal(sha(readFileSync(join(f.docs,'EXAMPLE_BROKEN.pdf'))),sha(bad));
});
test('schema2 migration preserves text chunks, workspace binding and existing session grants',async t=>{
 const f=fixture(t),file=join(f.root,'EXAMPLE.sqlite');writeFileSync(join(f.docs,'EXAMPLE.md'),'EXAMPLE ONLY\n示例纸灯保持。');let store=new KnowledgeStore(file);try{const c=await store.create('EXAMPLE_PROJECT','示例集合',f.docs);await store.index('EXAMPLE_PROJECT',c.id);await store.bind('EXAMPLE_PROJECT',f.root);store.setAccess('EXAMPLE_PROJECT',c.id,true,'seedance');store.setAgentAccess('EXAMPLE_PROJECT',c.id,true);const hit=(await store.retrieveForAgent('EXAMPLE_OLD_SESSION','seedance',f.root,'纸灯'))[0],binding=store.binding('EXAMPLE_PROJECT');store.close();store=undefined;
 const old=new DatabaseSync(file);try{old.exec('ALTER TABLE chunks DROP COLUMN page; PRAGMA user_version=2');}finally{old.close();}
 store=new KnowledgeStore(file);assert.deepEqual(store.binding('EXAMPLE_PROJECT'),binding);assert.equal(store.search('EXAMPLE_PROJECT','纸灯')[0].id,hit.id);assert.equal((await store.sourceForAgent('EXAMPLE_OLD_SESSION','seedance',f.root,hit.id,hit.epoch)).anchorId,hit.id);assert.equal(store.search('EXAMPLE_PROJECT','纸灯')[0].page,undefined);await store.assertSessionAllowed('EXAMPLE_OLD_SESSION','seedance',f.root);
 }finally{store?.close();}
});
test('withdrawal during PDF import leaves the previous complete index intact',async t=>{
 const f=fixture(t),store=new KnowledgeStore(':memory:');t.after(()=>store.close());writeFileSync(join(f.docs,'EXAMPLE_OLD.md'),'EXAMPLE ONLY\n示例原资料纸灯。');const c=await store.create('EXAMPLE_PROJECT','示例集合',f.docs);await store.index('EXAMPLE_PROJECT',c.id);writeFileSync(join(f.docs,'EXAMPLE_NEW.pdf'),examplePdf(Array.from({length:20},()=>('示例新增古桥。').repeat(100))));
 const importing=store.index('EXAMPLE_PROJECT',c.id);setTimeout(()=>store.setAccess('EXAMPLE_PROJECT',c.id,false,''),5);await assert.rejects(importing);assert.equal(store.list('EXAMPLE_PROJECT')[0].documents,1);store.setAccess('EXAMPLE_PROJECT',c.id,true,'');assert.equal(store.search('EXAMPLE_PROJECT','纸灯').length,1);assert.equal(store.search('EXAMPLE_PROJECT','古桥').length,0);
});
test('future index schema is refused without changing the database version',t=>{
 const f=fixture(t),file=join(f.root,'EXAMPLE_FUTURE.sqlite'),db=new DatabaseSync(file);db.exec('PRAGMA user_version=4');db.close();assert.throws(()=>new KnowledgeStore(file),/更新版本/);const check=new DatabaseSync(file);try{assert.equal(check.prepare('PRAGMA user_version').get().user_version,4);}finally{check.close();}
});
test('overlapping excerpts preserve supplementary Chinese Unicode characters and exact source slices',async t=>{
 const f=fixture(t),store=new KnowledgeStore(':memory:');t.after(()=>store.close());const text='A'+'𠮷'.repeat(2000);writeFileSync(join(f.docs,'EXAMPLE_UNICODE.md'),text);const c=await store.create('EXAMPLE_PROJECT','示例集合',f.docs);await store.index('EXAMPLE_PROJECT',c.id);const hits=store.search('EXAMPLE_PROJECT','𠮷');assert.ok(hits.length>=3);for(const hit of hits){assert.equal(hit.text.isWellFormed(),true);assert.ok(text.includes(hit.text));assert.ok(hit.text.length<=1600);}
});
