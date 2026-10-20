import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {open,appendFile,rename} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';
import {KnowledgeStore} from '../lib/knowledge.js';
import {knowledgeImportReportSchema} from '../lib/knowledge-import-schema.js';
import {exampleDocx} from '../../../contracts/fixtures/docx-document.mjs';
const project='EXAMPLE_IMPORT_SPACE';
function fixture(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-import-EXAMPLE-'))),docs=join(root,'EXAMPLE_DOCS');mkdirSync(docs);t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});});return{root,docs};}

test('import diagnostics identify real format, encoding and decoder failures without source text or absolute roots',async t=>{
 const {docs}=fixture(t),db=new KnowledgeStore(':memory:');t.after(()=>db.close());
 const files={
  'EXAMPLE.md':'EXAMPLE_BODY_PRIVATE_SENTINEL',
  '.EXAMPLE.txt':'EXAMPLE_HIDDEN_BODY',
  'EXAMPLE.bin':'EXAMPLE_UNSUPPORTED_BODY',
  'EXAMPLE_LARGE.txt':Buffer.alloc(2*1024*1024+1,65),
  'EXAMPLE_BINARY.txt':Buffer.from('EXAMPLE\0BINARY'),
  'EXAMPLE_EMPTY.docx':exampleDocx(''),
  'EXAMPLE_ENCODING.txt':Buffer.from([0xc3,0x28]),
  'EXAMPLE_INVALID.pdf':Buffer.from('%PDF-EXAMPLE_INVALID'),
  'EXAMPLE_PASSWORD.pdf':Buffer.from(JSON.parse(readFileSync(new URL('../../../contracts/fixtures/pdf-encrypted.json',import.meta.url),'utf8')).base64,'base64'),
  'EXAMPLE_INVALID.docx':Buffer.from('PK\x03\x04EXAMPLE_INVALID'),
  'EXAMPLE_UNSUPPORTED.docx':exampleDocx('<w:altChunk/>'),
 };
 for(const [name,body]of Object.entries(files))writeFileSync(join(docs,name),body);mkdirSync(join(docs,'vendor'));writeFileSync(join(docs,'vendor','EXAMPLE.txt'),'EXAMPLE_IGNORED_BODY');
 const c=await db.create(project,'示例导入',docs);assert.equal(db.importReport(project,c.id),null);
 assert.deepEqual(await db.index(project,c.id),{indexed:1,skipped:6,failed:5});
 const report=knowledgeImportReportSchema.parse(db.importReport(project,c.id));assert.equal(report.examined,12);assert.equal(report.epoch,2);assert.equal(report.omitted,0);
 const codes=Object.fromEntries(report.issues.map(x=>[x.path,x.code]));
 assert.deepEqual(codes,{
  '.EXAMPLE.txt':'HIDDEN_OR_LINK','EXAMPLE.bin':'UNSUPPORTED_FORMAT','vendor':'EXCLUDED_DIRECTORY',
  'EXAMPLE_LARGE.txt':'FILE_TOO_LARGE','EXAMPLE_BINARY.txt':'NON_TEXT','EXAMPLE_EMPTY.docx':'NO_TEXT',
  'EXAMPLE_ENCODING.txt':'TEXT_ENCODING','EXAMPLE_INVALID.pdf':'DOCUMENT_INVALID','EXAMPLE_PASSWORD.pdf':'DOCUMENT_PASSWORD',
  'EXAMPLE_INVALID.docx':'DOCUMENT_INVALID','EXAMPLE_UNSUPPORTED.docx':'DOCUMENT_UNSUPPORTED',
 });
 const serialized=JSON.stringify(report);assert.equal(serialized.includes(docs),false);assert.equal(serialized.includes('BODY'),false);assert.equal(serialized.includes('EXAMPLE_EXTERNAL'),false);assert.equal(serialized.includes('stack'),false);
 report.issues[0].path='EXAMPLE_MUTATED';assert.notEqual(db.importReport(project,c.id).issues[0].path,'EXAMPLE_MUTATED');assert.throws(()=>db.importReport('EXAMPLE_OTHER_SPACE',c.id));assert.equal(db.importReport(project,c.id).issues.length,11);
});

test('import reports cap issues, disappear on permission/reindex changes and never persist across Host restart',async t=>{
 const {root,docs}=fixture(t),path=join(root,'EXAMPLE_INDEX.sqlite');let db=new KnowledgeStore(path);t.after(()=>db?.close());
 for(let i=0;i<65;i++)writeFileSync(join(docs,`EXAMPLE_${i}.bin`),'EXAMPLE');
 const c=await db.create(project,'示例有界报告',docs);await db.index(project,c.id);let report=db.importReport(project,c.id);assert.equal(report.issues.length,50);assert.equal(report.omitted,15);assert.equal(report.skipped,65);assert.equal(report.examined,65);
 db.setAccess(project,c.id,false,'');assert.equal(db.importReport(project,c.id),null);db.setAccess(project,c.id,true,'seedance');await db.index(project,c.id);assert.ok(db.importReport(project,c.id));await db.bind(project,docs);db.setAgentAccess(project,c.id,true);assert.equal(db.importReport(project,c.id),null);
 await db.index(project,c.id);assert.ok(db.importReport(project,c.id));db.close();db=new KnowledgeStore(path);assert.equal(db.importReport(project,c.id),null);assert.equal(db.list(project)[0].documents,0);db.close();db=null;
});

test('an aborted import clears the old report and preserves the previous searchable index',async t=>{
 const {root,docs}=fixture(t),db=new KnowledgeStore(':memory:');t.after(()=>db.close());writeFileSync(join(docs,'EXAMPLE.txt'),'EXAMPLE_RETAINED_INDEX');const c=await db.create(project,'示例中断',docs);await db.index(project,c.id);assert.ok(db.importReport(project,c.id));
 const moved=join(root,'EXAMPLE_MOVED');for(const target of [docs,moved]){const part=relative(root,target);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..'));}await rename(docs,moved);
 await assert.rejects(db.index(project,c.id));assert.equal(db.importReport(project,c.id),null);assert.equal(db.search(project,'EXAMPLE_RETAINED_INDEX').length,1);
});

test('a source modified during the production bounded read is skipped with an actionable diagnostic',async t=>{
 const {docs}=fixture(t),file=join(docs,'EXAMPLE_CHANGED.txt'),db=new KnowledgeStore(':memory:');t.after(()=>db.close());writeFileSync(file,'EXAMPLE_OLD_BODY');
 const sample=await open(file,'r'),prototype=Object.getPrototypeOf(sample),read=prototype.read;await sample.close();let changed=false;
 prototype.read=async function(...args){const result=await read.apply(this,args);if(!changed&&result.bytesRead){changed=true;await appendFile(file,'EXAMPLE_NEW_BODY');}return result;};
 try{const c=await db.create(project,'示例变化',docs);assert.deepEqual(await db.index(project,c.id),{indexed:0,skipped:1,failed:0});assert.equal(db.importReport(project,c.id).issues[0].code,'SOURCE_CHANGED');assert.equal(db.search(project,'EXAMPLE_OLD_BODY').length,0);}finally{prototype.read=read;}
});

test('only the most recent 32 collection reports are retained',async t=>{
 const {docs}=fixture(t),db=new KnowledgeStore(':memory:');t.after(()=>db.close());writeFileSync(join(docs,'EXAMPLE.bin'),'EXAMPLE');const ids=[];for(let i=0;i<33;i++){const c=await db.create(project,`EXAMPLE_COLLECTION_${i}`,docs);ids.push(c.id);await db.index(project,c.id);}assert.equal(db.importReport(project,ids[0]),null);assert.ok(db.importReport(project,ids[1]));assert.ok(db.importReport(project,ids[32]));
});
