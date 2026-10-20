import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {KnowledgeStore} from '../lib/knowledge.js';

async function fixture(t,documents){
 const base=realpathSync.native(tmpdir()),home=realpathSync.native(mkdtempSync(join(base,'dsh-compound-EXAMPLE-'))),docs=join(home,'EXAMPLE_DOCS');mkdirSync(docs);
 const store=new KnowledgeStore(join(home,'EXAMPLE.sqlite'));
 t.after(()=>{store.close();const part=relative(base,home);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(home,{recursive:true,force:true});});
 for(const [name,text]of Object.entries(documents))writeFileSync(join(docs,name),'EXAMPLE ONLY\n'+text);
 const collection=await store.create('EXAMPLE_PROJECT','示例资料',docs);await store.index('EXAMPLE_PROJECT',collection.id);
 return{store,collection,home};
}

test('Chinese question compounds reject scattered suffix/single-character distractors while keyword AND is unchanged',async t=>{
 const f=await fixture(t,{'EXAMPLE_MATCH.md':'双轨制的安排用于节奏点。','EXAMPLE_SCATTERED.md':'双轨灯单独亮起，系统另有制动方式。安排节奏时，圆点只作记录。'});
 const hits=f.store.search('EXAMPLE_PROJECT','如何用双轨制安排节奏点？');
 assert.deepEqual(hits.map(h=>h.path),['EXAMPLE_MATCH.md']);
 assert.equal(f.store.search('EXAMPLE_PROJECT','双轨 制').length,2);
 assert.deepEqual(f.store.search('EXAMPLE_OTHER_PROJECT','如何用双轨制安排节奏点？'),[]);
 f.store.setAccess('EXAMPLE_PROJECT',f.collection.id,false,'');assert.deepEqual(f.store.search('EXAMPLE_PROJECT','如何用双轨制安排节奏点？'),[]);
});

test('compound reconstruction preserves punctuation and stop-word boundaries',async t=>{
 const f=await fixture(t,{'EXAMPLE_PUNCTUATION.md':'双轨方案采用制度记录，安排节奏点。','EXAMPLE_STOP.md':'双轨方案中的制度单独说明，安排节奏点。'});
 assert.equal(f.store.search('EXAMPLE_PROJECT','如何用双轨，制安排节奏点？').length,2);
 assert.equal(f.store.search('EXAMPLE_PROJECT','如何用双轨的制安排节奏点？').length,2);
});

test('adjacent single-character runs form their own words before attachment to an earlier multi-character word',async t=>{
 const f=await fixture(t,{'EXAMPLE_MATCH.md':'喜剧需要反差。笑点依靠意外来安排。','EXAMPLE_SCATTERED.md':'喜剧表演让观众笑。圆点另有安排。'});
 assert.equal(f.store.search('EXAMPLE_PROJECT','如何安排喜剧笑点？')[0].path,'EXAMPLE_MATCH.md');
 assert.deepEqual(f.store.search('EXAMPLE_PROJECT','如何用喜剧笑点？').map(h=>h.path),['EXAMPLE_MATCH.md']);
 assert.deepEqual(f.store.search('EXAMPLE_PROJECT','如何安排喜剧火星许可证？'),[]);
});

test('compound vocabulary uses only currently authorized contiguous text and does not invent verb-object words',async t=>{
 const f=await fixture(t,{'EXAMPLE_PEOPLE.md':'人的动机与情绪关联。观察人能发现变化。'});
 const query='如何理解人的动机和情绪？';
 assert.equal(f.store.search('EXAMPLE_PROJECT',query)[0].path,'EXAMPLE_PEOPLE.md');
 const privateDocs=join(f.home,'EXAMPLE_PRIVATE');mkdirSync(privateDocs);writeFileSync(join(privateDocs,'EXAMPLE_OTHER.md'),'理解人的动机与情绪。');
 const foreign=await f.store.create('EXAMPLE_OTHER_PROJECT','示例其他资料',privateDocs);await f.store.index('EXAMPLE_OTHER_PROJECT',foreign.id);
 const hidden=await f.store.create('EXAMPLE_PROJECT','示例禁用资料',privateDocs);await f.store.index('EXAMPLE_PROJECT',hidden.id);f.store.setAccess('EXAMPLE_PROJECT',hidden.id,false,'');
 assert.deepEqual(f.store.search('EXAMPLE_PROJECT',query).map(h=>h.path),['EXAMPLE_PEOPLE.md']);
 f.store.setAccess('EXAMPLE_PROJECT',hidden.id,true,'');await f.store.bind('EXAMPLE_PROJECT',f.home);f.store.setAccess('EXAMPLE_PROJECT',f.collection.id,true,'seedance');f.store.setAgentAccess('EXAMPLE_PROJECT',f.collection.id,true);
 assert.deepEqual(f.store.search('EXAMPLE_PROJECT',query,'seedance').map(h=>h.path),['EXAMPLE_PEOPLE.md']);
 f.store.setAccess('EXAMPLE_PROJECT',hidden.id,true,'seedance');
 assert.deepEqual(f.store.search('EXAMPLE_PROJECT',query,'seedance').map(h=>h.path),['EXAMPLE_PEOPLE.md']);
});

test('compound vocabulary work stays bounded for a long valid question',async t=>{
 const characters=Array.from({length:160},(_,i)=>String.fromCharCode(0x3400+i)).join(''),f=await fixture(t,{'EXAMPLE_LONG.md':characters});
 const prepare=f.store.db.prepare.bind(f.store.db);let lookups=0;
 f.store.db.prepare=sql=>{if(sql.includes('instr(ch.text,?)'))lookups++;return prepare(sql);};
 assert.doesNotThrow(()=>f.store.search('EXAMPLE_PROJECT','如何'+characters+'？'));
 assert.ok(lookups>0&&lookups<=32);
});
