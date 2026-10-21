import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {deflateSync} from 'node:zlib';
import {Context} from '@deepseek-ai/cordis';
import Sessions,{SessionId,SessionLogOffset,SessionSeq,buildForkSeed,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Query from '@deepseek-ai/dsh-session-query-sqlite';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {serializeSessionLog} from '@deepseek-ai/dsh-session-log-export';
import {writeSessionBackup,restoreSessionBackup,sessionBackupRecords,writeBackupArchive,openBackupArchive} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE session recovery password';
async function* chunks(bytes){for(let i=0;i<bytes.length;i+=16381)yield bytes.subarray(i,i+16381);}
function png(){
  const chunk=(tag,data)=>{const name=Buffer.from(tag),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);let crc=0xffffffff;for(const byte of Buffer.concat([name,data])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,name,data,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,20,40,120,255,20,40,120,255,0,20,40,120,255,20,40,120,255]))),chunk('IEND',Buffer.alloc(0))]);
}
async function services(root,imagePolicy={}){
  const ctx=new Context();await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(root,'sessions')});await ctx.plugin(LocalAttachments,{dshHome:root,...imagePolicy});await ctx.plugin(Query,{path:':memory:',openAt:'never'});
  return {ctx,deps:{sessions:ctx.sessions,sessionPersistence:ctx.sessionPersistence,sessionQuery:ctx.sessionQuery,attachments:ctx.attachments}};
}
async function fixture(t,imagePolicy={}){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-session-backup-EXAMPLE-'))),source=await services(join(root,'source'),imagePolicy);let credentialReads=0;
  source.ctx.provide('credentials',{resolve:async()=>{credentialReads++;throw Error('EXAMPLE_CREDENTIAL_SERVICE_MUST_NOT_BE_READ');}});
  const parent=join(root,'candidates');await mkdir(parent);
  t.after(async()=>{await source.ctx.fiber.dispose();const part=relative(base,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-session-backup-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const image=await source.deps.attachments.saveImage({data:png(),mediaType:'image/png',name:'EXAMPLE-image.png'});
  const fileBytes=Buffer.alloc(1024*1024+9,43);Buffer.from('EXAMPLE 文件资料').copy(fileBytes);
  const file=await source.deps.attachments.saveFileStream({data:chunks(fileBytes),name:'EXAMPLE_中文资料.txt'});
  const header={version:SESSION_FORMAT_VERSION,id:SessionId('EXAMPLE-parent'),createdAt:1700000000000,cwd:root,isSeeded:false,agentPreset:'EXAMPLE-preset'};
  const events=[{type:'user/message',seq:0,time:1700000000001,surfaceOp:'append',data:createUserMessage({content:[{type:'text',text:'EXAMPLE 请查看示例资料。'},{type:'image',attachment:image},{type:'file',attachment:file}],source:{kind:'user'}})},{type:'plugin:example/backup',seq:1,time:1700000000002,ignorable:true,data:{value:'EXAMPLE_INFO',attachmentId:'b'.repeat(64)}}];
  const handle=await source.deps.sessionPersistence.create(header);await handle.append(events);await handle.flush();await handle.close();
  const fork={...header,id:SessionId('EXAMPLE-fork'),parentSession:header.id,isSeeded:true,createdAt:1700000001000,origin:'subagent',delegationDepth:1};
  const seed=buildForkSeed(events,SessionSeq(1)),childEvents=[...seed,{type:'turn/start',seq:seed.length,time:1700000001001,data:{turn:1}}];
  const child=await source.deps.sessionPersistence.create(fork,{inheritedEventCount:SessionLogOffset(2)});await child.append(childEvents);await child.flush();await child.close();
  return {root,parent,source,header,fork,events,childEvents,image,file,fileBytes,path:join(root,'EXAMPLE.dshbackup'),credentialReads:()=>credentialReads};
}
async function decoded(path){const archive=await openBackupArchive(path,password),out=[];try{for await(const item of archive.records()){const parts=[];for await(const bytes of item.data)parts.push(bytes);out.push({metadata:item.metadata,size:item.size,bytes:Buffer.concat(parts)});}return out;}finally{await archive.close();}}
async function* encoded(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:chunks(row.bytes)};}

test('C89: published persistence round-trip preserves fork prefix, unknown ignorable events and exact image/file identity',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);
  const rows=await decoded(f.path);assert.deepEqual(rows.map(x=>x.metadata.kind).sort(),['file','image','manifest','session','session']);
  const candidate=await restoreSessionBackup(f.path,password,f.parent);assert.equal(candidate.activated,false);assert.equal(candidate.sessions,2);assert.equal(candidate.images,1);assert.equal(candidate.files,1);
  const restored=await services(candidate.root);
  try{
    assert.equal(restored.ctx.sessions.list().length,0,'Restoration never resumes a live Session or Agent.');
    for(const [header,events,cut]of [[f.header,f.events,0],[f.fork,f.childEvents,2]]){
      const original=await f.source.deps.sessionPersistence.open(header.id,'read'),handle=await restored.deps.sessionPersistence.open(header.id,'read');try{assert.deepEqual(handle.header,original.header);assert.equal(handle.inheritedEventCount,cut);assert.deepEqual((await handle.read()).events,events);assert.deepEqual((await handle.read()).events,(await original.read()).events);}finally{await handle.close();await original.close();}
    }
    assert.deepEqual((await restored.deps.attachments.readImage(f.image)).ref,f.image);
    const file=[];for await(const bytes of restored.deps.attachments.readFileStream(f.file))file.push(bytes);assert.deepEqual(Buffer.concat(file),f.fileBytes);
  }finally{await restored.ctx.fiber.dispose();}
  assert.equal(f.credentialReads(),0);assert.equal(rows.some(row=>JSON.stringify(row.metadata).includes('EXAMPLE_CREDENTIAL_SERVICE_MUST_NOT_BE_READ')||row.bytes.includes(Buffer.from('EXAMPLE_CREDENTIAL_SERVICE_MUST_NOT_BE_READ'))),false);
});

test('C89: a source append during backup refuses the entire unpublished archive',async t=>{
  const f=await fixture(t);let changed=false;
  const input=(async function*(){for await(const record of sessionBackupRecords(()=>f.source.deps)){yield record;if(!changed&&record.metadata.kind==='session'){changed=true;const handle=await f.source.deps.sessionPersistence.open(record.metadata.header.id,'write');try{const current=(await handle.read()).events;await handle.append([{type:'turn/start',seq:current.length,time:1700000003000,data:{turn:2}}]);await handle.flush();}finally{await handle.close();}}}})();
  await assert.rejects(writeBackupArchive(f.path,password,input),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);assert.deepEqual(await readdir(f.parent),[]);
});

test('C89: actual live SessionStore durability barrier includes the last buffered user event',async t=>{
  const f=await fixture(t),id=SessionId('EXAMPLE-live'),createdAt=1700000010000;
  const owner=await f.source.deps.sessionPersistence.create({version:SESSION_FORMAT_VERSION,id,createdAt,cwd:f.root,isSeeded:false,delegationDepth:0});
  try{
    const live=f.source.ctx.sessions.create(id,{meta:{cwd:f.root,createdAt}});
    live.append('user/message',createUserMessage({content:[{type:'text',text:'EXAMPLE_LAST_BUFFERED_MESSAGE'}],source:{kind:'user'}}),{surfaceOp:'append'});
    await writeSessionBackup(f.path,password,()=>f.source.deps);
    const rows=await decoded(f.path),saved=rows.find(row=>row.metadata.kind==='session'&&row.metadata.header.id==='EXAMPLE-live');
    assert.ok(saved);assert.equal(saved.bytes.includes(Buffer.from('EXAMPLE_LAST_BUFFERED_MESSAGE')),true);assert.equal(rows[0].metadata.credentialStoresIncluded,false);assert.equal(f.credentialReads(),0);
    const candidate=await restoreSessionBackup(f.path,password,f.parent);assert.equal(candidate.sessions,3);assert.equal(candidate.activated,false);
  }finally{await owner.close();}
});

test('C89: a live session without a persistence owner is refused without silently omitting its events',async t=>{
  const f=await fixture(t),live=f.source.ctx.sessions.create(SessionId('EXAMPLE-unpersisted'),{meta:{cwd:f.root}});
  live.append('turn/start',{turn:1});
  await assert.rejects(writeSessionBackup(f.path,password,()=>f.source.deps),error=>error.code==='BACKUP_LIVE_SESSION_UNPERSISTED');
  assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C89: a late live event during final enumeration invalidates unchanged disk revisions',async t=>{
  const f=await fixture(t),id=SessionId('EXAMPLE-live-race'),createdAt=1700000010000;
  const owner=await f.source.deps.sessionPersistence.create({version:SESSION_FORMAT_VERSION,id,createdAt,cwd:f.root,isSeeded:false});
  try{
    const live=f.source.ctx.sessions.create(id,{meta:{cwd:f.root,createdAt}});live.append('turn/start',{turn:1});
    const original=f.source.deps.sessionPersistence;let lists=0,lateEvent=false;
    const observed=new Proxy(original,{get(target,key){if(key==='list')return async options=>{const rows=await target.list(options);if(++lists===2){live.append('turn/end',{turn:1,reason:{kind:'completed'}});lateEvent=true;}return rows;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    await assert.rejects(writeSessionBackup(f.path,password,()=>({...f.source.deps,sessionPersistence:observed})),error=>error.code==='BACKUP_SOURCE_CHANGED');
    assert.equal(lateEvent,true);assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
  }finally{await owner.close();}
});

test('C89: replacing the mounted persistence identity refuses continued backup',async t=>{
  const f=await fixture(t),other=await services(join(f.root,'other'));let current=f.source.deps;
  try{
    const input=(async function*(){for await(const record of sessionBackupRecords(()=>current)){yield record;if(record.metadata.kind==='manifest')current=other.deps;}})();
    await assert.rejects(writeBackupArchive(f.path,password,input),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
  }finally{await other.ctx.fiber.dispose();}
});

test('C89: omitted referenced attachments fail verification and remove only the fresh restore candidate',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);const rows=(await decoded(f.path)).filter(row=>!['image','file'].includes(row.metadata.kind)),bad=join(f.root,'EXAMPLE_missing');await writeBackupArchive(bad,password,encoded(rows));
  const existing=join(f.parent,'EXAMPLE_owner_profile');await mkdir(existing);await writeFile(join(existing,'EXAMPLE_keep.txt'),'EXAMPLE_OWNER_DATA');
  await assert.rejects(restoreSessionBackup(bad,password,f.parent));assert.deepEqual(await readdir(f.parent),['EXAMPLE_owner_profile']);assert.equal(await readFile(join(existing,'EXAMPLE_keep.txt'),'utf8'),'EXAMPLE_OWNER_DATA');
  assert.equal((await f.source.deps.attachments.readImage(f.image)).ref.attachmentId,f.image.attachmentId);
});

test('C89: duplicate session identities refuse partial publication and clean the candidate',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);const rows=await decoded(f.path),session=rows.find(x=>x.metadata.kind==='session');rows[0].metadata.sessions++;rows.push(session);const bad=join(f.root,'EXAMPLE_duplicate');await writeBackupArchive(bad,password,encoded(rows));
  await assert.rejects(restoreSessionBackup(bad,password,f.parent),error=>error.code==='BACKUP_SESSION_ID_CONFLICT');assert.deepEqual(await readdir(f.parent),[]);
});

test('C89: corrupted attachment identity is rejected without rewriting references or changing the source',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);const rows=await decoded(f.path),image=rows.find(x=>x.metadata.kind==='image');image.bytes[0]^=1;const bad=join(f.root,'EXAMPLE_corrupt_image');await writeBackupArchive(bad,password,encoded(rows));
  await assert.rejects(restoreSessionBackup(bad,password,f.parent),error=>error.code==='BACKUP_ATTACHMENT_DIGEST_MISMATCH');assert.deepEqual(await readdir(f.parent),[]);assert.equal((await f.source.deps.attachments.readImage(f.image)).ref.attachmentId,f.image.attachmentId);
});

test('C89: unsupported required events are refused by the published storage validator',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);const rows=await decoded(f.path),session=rows.find(x=>x.metadata.kind==='session');
  const events=[{type:'EXAMPLE_FUTURE_REQUIRED',seq:0,time:1700000004000,data:{value:'EXAMPLE'}}];session.metadata.eventCount=1;session.metadata.inheritedEventCount=0;session.metadata.header.isSeeded=false;session.bytes=Buffer.from(serializeSessionLog(session.metadata.header,events));
  const bad=join(f.root,'EXAMPLE_required');await writeBackupArchive(bad,password,encoded(rows));await assert.rejects(restoreSessionBackup(bad,password,f.parent),error=>error.name==='SessionFormatUnsupportedError');assert.deepEqual(await readdir(f.parent),[]);
});

test('C89: wrong password and unrelated archive never create a restore directory',async t=>{
  const f=await fixture(t);await writeSessionBackup(f.path,password,()=>f.source.deps);
  await assert.rejects(restoreSessionBackup(f.path,'EXAMPLE wrong session password',f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');assert.deepEqual(await readdir(f.parent),[]);
  const other=join(f.root,'EXAMPLE_unrelated');await writeBackupArchive(other,password,encoded([{metadata:{kind:'EXAMPLE'},bytes:Buffer.alloc(0)}]));await assert.rejects(restoreSessionBackup(other,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);
});

test('C89: paged public reads preserve more than two batches without losing informational events',async t=>{
  const f=await fixture(t),header={...f.header,id:SessionId('EXAMPLE-batched')},events=Array.from({length:257},(_,seq)=>({type:'plugin:example/batch',seq,time:1700000100000+seq,ignorable:true,data:{value:'EXAMPLE_'+seq}}));
  const owner=await f.source.deps.sessionPersistence.create(header);try{await owner.append(events);await owner.flush();}finally{await owner.close();}
  await writeSessionBackup(f.path,password,()=>f.source.deps);const candidate=await restoreSessionBackup(f.path,password,f.parent),restored=await services(candidate.root);
  try{const handle=await restored.deps.sessionPersistence.open(header.id,'read');try{assert.deepEqual((await handle.read()).events,events);}finally{await handle.close();}}finally{await restored.ctx.fiber.dispose();}
});

test('C89: restoring a downscaled image retains its normalized digest and original dimensions',async t=>{
  const f=await fixture(t,{normalizedImageMaxDimension:1});assert.deepEqual(f.image.originalDimensions,{width:2,height:2});assert.equal(f.image.width,1);assert.equal(f.image.height,1);
  await writeSessionBackup(f.path,password,()=>f.source.deps);const candidate=await restoreSessionBackup(f.path,password,f.parent),restored=await services(candidate.root);
  try{const original=await f.source.deps.attachments.readImage(f.image),result=await restored.deps.attachments.readImage(f.image);assert.deepEqual(result.ref,f.image);assert.deepEqual(result.data,original.data);}finally{await restored.ctx.fiber.dispose();}
});
