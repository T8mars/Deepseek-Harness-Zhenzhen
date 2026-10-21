import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {writeBackupArchive,openBackupArchive} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE archive password 2026';
async function fixture(t){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-backup-EXAMPLE-')));
  t.after(async()=>{const part=relative(base,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-backup-EXAMPLE-'));await rm(root,{recursive:true,force:true});});
  return {root,path:join(root,'EXAMPLE.dshbackup')};
}
async function* chunks(bytes,width=7777){for(let i=0;i<bytes.length;i+=width)yield bytes.subarray(i,i+width);}
async function* records(bytes=Buffer.from('EXAMPLE_PRIVATE_BODY'),metadata={kind:'EXAMPLE',label:'示例资料'}){yield {metadata,size:bytes.length,data:chunks(bytes)};}
async function read(archive){const output=[];for await(const record of archive.records()){const parts=[];for await(const bytes of record.data)parts.push(bytes);output.push({metadata:record.metadata,data:Buffer.concat(parts)});}return output;}
const code=expected=>error=>error.code===expected;

test('C88: encrypted archive streams multilingual metadata and binary payload without plaintext files',async t=>{
  const f=await fixture(t),bytes=Buffer.alloc(3*1024*1024+17,37);Buffer.from('EXAMPLE_PRIVATE_BODY').copy(bytes);
  const receipt=await writeBackupArchive(f.path,password,records(bytes));
  const encrypted=await readFile(f.path);assert.equal(encrypted.includes(Buffer.from('EXAMPLE_PRIVATE_BODY')),false);assert.equal(encrypted.includes(Buffer.from('示例资料')),false);
  assert.equal(receipt.bytes,encrypted.length);assert.equal(receipt.records,1);assert.equal(receipt.sha256,createHash('sha256').update(encrypted).digest('hex'));
  const archive=await openBackupArchive(f.path,password);try{assert.deepEqual(await read(archive),[{metadata:{kind:'EXAMPLE',label:'示例资料'},data:bytes}]);}finally{await archive.close();}
  assert.deepEqual(await readdir(f.root),['EXAMPLE.dshbackup']);
});

test('C88: same records use independent salts and nonces',async t=>{
  const f=await fixture(t),second=join(f.root,'EXAMPLE_second.dshbackup');
  await writeBackupArchive(f.path,password,records());await writeBackupArchive(second,password,records());
  const a=await readFile(f.path),b=await readFile(second);assert.equal(a.equals(b),false);assert.equal(a.subarray(8,36).equals(b.subarray(8,36)),false);
});

test('C88: wrong password and ciphertext/header/tag corruption fail before exposing records',async t=>{
  const f=await fixture(t);await writeBackupArchive(f.path,password,records());
  await assert.rejects(openBackupArchive(f.path,'EXAMPLE incorrect password'),code('BACKUP_AUTHENTICATION_FAILED'));
  const original=await readFile(f.path);
  for(const position of [8,24,36,original.length-1]){
    const damaged=Buffer.from(original);damaged[position]^=1;const path=join(f.root,'EXAMPLE_corrupt_'+position);await writeFile(path,damaged);
    await assert.rejects(openBackupArchive(path,password),code('BACKUP_AUTHENTICATION_FAILED'));
  }
});

test('C88: existing destination and symbolic link are never overwritten',async t=>{
  const f=await fixture(t),original=Buffer.from('EXAMPLE_EXISTING_OWNER_FILE');await writeFile(f.path,original);
  await assert.rejects(writeBackupArchive(f.path,password,records()),error=>error.code==='EEXIST');assert.deepEqual(await readFile(f.path),original);
  assert.deepEqual(await readdir(f.root),['EXAMPLE.dshbackup']);
  const alias=join(f.root,'EXAMPLE_alias');
  try{await symlink(f.path,alias,'file');}catch(error){if(['EPERM','EACCES'].includes(error.code))return;throw error;}
  await assert.rejects(openBackupArchive(alias,password),code('BACKUP_ARCHIVE_INVALID'));
});

test('C88: short and oversized records refuse publication and remove encrypted temporary files',async t=>{
  const f=await fixture(t);
  for(const size of [1,99]){
    const input=(async function*(){yield {metadata:{kind:'EXAMPLE'},size,data:chunks(Buffer.from('EXAMPLE'))};})();
    await assert.rejects(writeBackupArchive(f.path,password,input),code('BACKUP_RECORD_SIZE_MISMATCH'));assert.deepEqual(await readdir(f.root),[]);
  }
});

test('C88: producer failure and cancellation leave source and destination unchanged',async t=>{
  const f=await fixture(t),abort=new AbortController();
  const failing=(async function*(){yield* records();throw new Error('EXAMPLE_PRODUCER_FAILED');})();
  await assert.rejects(writeBackupArchive(f.path,password,failing),/EXAMPLE_PRODUCER_FAILED/);assert.deepEqual(await readdir(f.root),[]);
  const cancelling=(async function*(){yield* records();abort.abort(new Error('EXAMPLE_CANCEL'));yield* records();})();
  await assert.rejects(writeBackupArchive(f.path,password,cancelling,{signal:abort.signal}),/EXAMPLE_CANCEL/);assert.deepEqual(await readdir(f.root),[]);
});

test('C88: metadata rejects getters, prototypes, dangerous keys, holes and excessive depth',async t=>{
  const f=await fixture(t);let getterCalls=0;const getter=Object.defineProperty({},'value',{enumerable:true,get(){getterCalls++;return 'EXAMPLE';}});
  let deep={};for(let i=0;i<35;i++)deep={next:deep};
  for(const metadata of [getter,new Date(),JSON.parse('{"__proto__":{}}'),{holes:Array(2)},{value:-0},deep]){
    await assert.rejects(writeBackupArchive(f.path,password,records(Buffer.alloc(0),metadata)),code('BACKUP_METADATA_INVALID'));assert.deepEqual(await readdir(f.root),[]);
  }
  assert.equal(getterCalls,0);
});

test('C88: record and archive budgets refuse rather than truncate',async t=>{
  const f=await fixture(t);
  await assert.rejects(writeBackupArchive(f.path,password,records(),{limits:{recordBytes:2}}),code('BACKUP_RECORD_SIZE_INVALID'));
  await assert.rejects(writeBackupArchive(f.path,password,records(),{limits:{archiveBytes:56}}),code('BACKUP_ARCHIVE_LIMIT'));
  await writeBackupArchive(f.path,password,records());
  await assert.rejects(openBackupArchive(f.path,password,{limits:{archiveBytes:56}}),code('BACKUP_ARCHIVE_INVALID'));
  const archive=await openBackupArchive(f.path,password,{limits:{recordBytes:2}});try{await assert.rejects(read(archive),code('BACKUP_RECORD_SIZE_INVALID'));}finally{await archive.close();}
});

test('C88: an unread record cannot silently skip a payload or be read twice',async t=>{
  const f=await fixture(t);await writeBackupArchive(f.path,password,records());const archive=await openBackupArchive(f.path,password);
  try{const iterator=archive.records();assert.equal((await iterator.next()).done,false);await assert.rejects(iterator.next(),code('BACKUP_RECORD_NOT_CONSUMED'));assert.throws(()=>archive.records(),code('BACKUP_READER_CLOSED'));}finally{await archive.close();await archive.close();}
  assert.throws(()=>archive.records(),code('BACKUP_READER_CLOSED'));
});

test('C88: an authenticated owned snapshot survives changes to the external encrypted file',async t=>{
  const f=await fixture(t);await writeBackupArchive(f.path,password,records());const archive=await openBackupArchive(f.path,password);
  try{await writeFile(f.path,Buffer.from('EXAMPLE_REPLACED'));const result=await read(archive);assert.equal(result[0].data.toString(),'EXAMPLE_PRIVATE_BODY');}finally{await archive.close();}
});

test('C88: appended/truncated archives fail authentication and early close removes the owned snapshot',async t=>{
  const f=await fixture(t);await writeBackupArchive(f.path,password,records());const original=await readFile(f.path);
  for(const bytes of [original.subarray(0,original.length-1),Buffer.concat([original,Buffer.from('EXAMPLE')])]){
    const path=join(f.root,'EXAMPLE_bad');await writeFile(path,bytes);await assert.rejects(openBackupArchive(path,password),code('BACKUP_AUTHENTICATION_FAILED'));
  }
  const before=(await readdir(await realpath(tmpdir()))).filter(name=>name.startsWith('dsh-zhen-sealed-backup-')).sort();
  const archive=await openBackupArchive(f.path,password);await archive.records().next();await archive.close();
  const after=(await readdir(await realpath(tmpdir()))).filter(name=>name.startsWith('dsh-zhen-sealed-backup-')).sort();assert.deepEqual(after,before);
});

test('C88: invalid password, relative path and non-file archive fail closed',async t=>{
  const f=await fixture(t);await assert.rejects(writeBackupArchive(f.path,'short',records()),code('BACKUP_PASSWORD_INVALID'));
  await assert.rejects(writeBackupArchive('EXAMPLE_relative',password,records()),code('BACKUP_PATH_INVALID'));
  await assert.rejects(openBackupArchive(f.root,password),code('BACKUP_ARCHIVE_INVALID'));assert.deepEqual(await readdir(f.root),[]);
});
