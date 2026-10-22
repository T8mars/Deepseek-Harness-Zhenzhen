import {Context,symbols} from '@deepseek-ai/cordis';
import Sessions,{SessionLogOffset} from '@deepseek-ai/dsh-session';
import type {SessionEvent,SessionHeader} from '@deepseek-ai/dsh-session';
import {assertContiguous,assertVersion,materializeCreateHeader,validateStoredEvents} from '@deepseek-ai/dsh-session-persistence';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import {serializeSessionLog,sessionLogZipEntries} from '@deepseek-ai/dsh-session-log-export';
import type {SessionLogExportReady} from '@deepseek-ai/dsh-session-log-export';
import LocalAttachments,{commitPreparedImageFile} from '@deepseek-ai/dsh-attachment-local';
import Query from '@deepseek-ai/dsh-session-query-sqlite';
import {AttachmentId} from '@deepseek-ai/dsh-attachment';
import type {AttachmentStore,FileAttachmentRef,ImageAttachmentRef} from '@deepseek-ai/dsh-attachment';
import {createHash} from 'node:crypto';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {isAbsolute,join,relative} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {BackupError,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';

const SESSION_BYTES=32*1024**2,IMAGE_BYTES=20*1024**2,MAX_SESSIONS=10_000,MAX_ATTACHMENTS=100_000;
const SCOPE='dsh-zhen-sessions-and-attachments-v1';
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const imageSchema=z.object({attachmentId:z.string().regex(/^sha256:[a-f0-9]{64}$/),mediaType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),bytes:integer.max(IMAGE_BYTES),width:integer.positive().max(8192),height:integer.positive().max(8192),name:z.string().max(1024).optional(),originalDimensions:z.object({width:integer.positive(),height:integer.positive()}).strict().optional()}).strict();
const fileSchema=z.object({attachmentId:z.string().regex(/^sha256:[a-f0-9]{64}$/),name:z.string().min(1).max(1024),bytes:integer}).strict();
const manifestSchema=z.object({kind:z.literal('manifest'),scope:z.literal(SCOPE),sessions:integer.max(MAX_SESSIONS),credentialStoresIncluded:z.literal(false)}).strict();
type Ref={kind:'image';ref:ImageAttachmentRef}|{kind:'file';ref:FileAttachmentRef};
const bytesOf=(data:Uint8Array)=>(async function*(){yield data;})();
function record(metadata:Record<string,unknown>,data:Uint8Array):BackupRecord{return {metadata,size:data.length,data:bytesOf(data)};}
function refKey(ref:Ref){return ref.kind+':'+ref.ref.attachmentId+(ref.kind==='file'?':'+ref.ref.name:'');}
function assertSameReference(a:Ref,b:Ref){
  if(a.kind!==b.kind||a.ref.attachmentId!==b.ref.attachmentId||a.ref.bytes!==b.ref.bytes||(a.kind==='image'&&b.kind==='image'&&(a.ref.width!==b.ref.width||a.ref.height!==b.ref.height||a.ref.mediaType!==b.ref.mediaType)))throw new BackupError('BACKUP_REFERENCE_CONFLICT');
}
function observedAttachments(store:AttachmentStore,observe:(ref:Ref)=>void):AttachmentStore {
  return new Proxy(store,{get(target,key){
    if(key==='readImage')return (ref:ImageAttachmentRef,signal?:AbortSignal)=>{observe({kind:'image',ref:structuredClone(ref)});return target.readImage(ref,signal);};
    if(key==='readFileStream')return (ref:FileAttachmentRef,signal?:AbortSignal)=>{observe({kind:'file',ref:structuredClone(ref)});return target.readFileStream(ref,signal);};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
}
async function sessionText(deps:SessionLogExportReady,header:SessionHeader,signal?:AbortSignal){
  assertVersion(header);const handle=await deps.sessionPersistence.open(header.id,'read',{signal});
  try{
    const events:SessionEvent[]=[];let budget=Buffer.byteLength(serializeSessionLog(handle.header,[]));
    for(let offset=0;;){
      signal?.throwIfAborted();const batch=(await handle.read(offset,128,{signal})).events;if(!batch.length)break;
      for(const event of batch){budget+=Buffer.byteLength(JSON.stringify(event))+1;if(budget>SESSION_BYTES)throw new BackupError('BACKUP_SESSION_LIMIT');events.push(event);}offset+=batch.length;
    }
    if(!isDeepStrictEqual(header,handle.header))throw new BackupError('BACKUP_SOURCE_CHANGED');
    return {header:materializeCreateHeader(handle.header),inheritedEventCount:handle.inheritedEventCount,eventCount:events.length,text:serializeSessionLog(handle.header,events)};
  }finally{await handle.close();}
}

/** Retain until every component has passed its final source check. No source
 * files, private persistence layout, or credential store is opened directly. */
export interface SessionBackupLease {records():AsyncGenerator<BackupRecord>;assertCurrent():Promise<void>;close():void;}
export async function prepareSessionBackup(resolve:()=>SessionLogExportReady,options:BackupOptions={}):Promise<SessionBackupLease>{
  const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
  options={...options,signal,...options.limits?{limits:{...options.limits}}:{}};
  let closed=false,used=false;
  const check=()=>{if(closed)throw new BackupError('BACKUP_SESSION_LEASE_CLOSED');signal.throwIfAborted();};
  const fail=(error:unknown):never=>{check();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_SESSION_READ_FAILED');};
  const read=async<T>(operation:()=>T|Promise<T>):Promise<T>=>{try{check();return await operation();}catch(error){return fail(error);}};
  const deps=await read(resolve);
  const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value;
  const {identity,owners}=await read(()=>({identity:deps.sessionPersistence.identity,owners:[deps.sessionQuery,deps.attachments,deps.sessions].map(original)}));
  const sameSource=()=>{check();let current:SessionLogExportReady;try{current=resolve();if(current.sessionPersistence.identity!==identity||[current.sessionQuery,current.attachments,current.sessions].some((value,index)=>original(value)!==owners[index]))throw new BackupError('BACKUP_SOURCE_CHANGED');}catch(error){fail(error);}};
  const flush=async()=>{
    if(deps.sessions)for(const session of deps.sessions.list()){
      sameSource();if(!await deps.sessions.flush(session))throw new BackupError('BACKUP_LIVE_FLUSH_UNAVAILABLE');
    }
    await deps.sessionPersistence.flush();sameSource();
  };
  try{await flush();}catch(error){return fail(error);}
  const liveSequences=await read(()=>new Map(deps.sessions?.list().map(session=>[session.id,session.seq])??[]));
  const snapshots=await read(()=>deps.sessionPersistence.list({signal}));
  sameSource();
  if(snapshots.length>MAX_SESSIONS)throw new BackupError('BACKUP_SESSION_COUNT_LIMIT');
  const revisions=new Map(snapshots.map(value=>[value.header.id,value.revision]));
  if(revisions.size!==snapshots.length)throw new BackupError('BACKUP_SESSION_ID_CONFLICT');
  if(deps.sessions?.list().some(session=>!revisions.has(session.id)))throw new BackupError('BACKUP_LIVE_SESSION_UNPERSISTED');
  const assertCurrent=async()=>{try{
    sameSource();await flush();const final=await deps.sessionPersistence.list({signal});sameSource();
    if(final.length!==revisions.size||final.some(value=>revisions.get(value.header.id)!==value.revision)||deps.sessions?.list().some(session=>!revisions.has(session.id)||liveSequences.get(session.id)!==session.seq))throw new BackupError('BACKUP_SOURCE_CHANGED');
  }catch(error){fail(error);}};
  return {assertCurrent,close(){if(!closed){closed=true;controller.abort();}},async*records(){
    check();if(used)throw new BackupError('BACKUP_SESSION_STREAM_USED');used=true;
    try{
      await assertCurrent();
      yield record({kind:'manifest',scope:SCOPE,sessions:snapshots.length,credentialStoresIncluded:false},Buffer.alloc(0));
      const attachments=new Map<string,Ref>();
      for(const snapshot of snapshots){
        sameSource();if(snapshot.formatStatus==='migration-required')throw new BackupError('BACKUP_SESSION_MIGRATION_REQUIRED');
        const saved=await sessionText(deps,snapshot.header,signal);
        yield record({kind:'session',header:saved.header,inheritedEventCount:saved.inheritedEventCount,eventCount:saved.eventCount},Buffer.from(saved.text));
        let observed:Ref|undefined,logs=0;
        const reader={...deps,attachments:observedAttachments(deps.attachments,ref=>{observed=ref;})};
        for await(const entry of sessionLogZipEntries(reader,saved.text,saved.header.id,false,signal)){
          sameSource();
          if('content'in entry){if(++logs!==1||entry.content!==saved.text)throw new BackupError('BACKUP_EXPORT_CONTRACT_CHANGED');continue;}
          const ref=observed;observed=undefined;if(!ref)throw new BackupError('BACKUP_EXPORT_CONTRACT_CHANGED');
          const key=refKey(ref),previous=attachments.get(key);
          if(previous){assertSameReference(previous,ref);continue;}
          if(attachments.size>=MAX_ATTACHMENTS)throw new BackupError('BACKUP_ATTACHMENT_COUNT_LIMIT');
          attachments.set(key,ref);
          if(ref.kind==='image'){
            imageSchema.parse(ref.ref);if(!('data'in entry)||entry.data.length!==ref.ref.bytes)throw new BackupError('BACKUP_EXPORT_CONTRACT_CHANGED');
            if('sha256:'+createHash('sha256').update(entry.data).digest('hex')!==ref.ref.attachmentId)throw new BackupError('BACKUP_ATTACHMENT_DIGEST_MISMATCH');
            yield record({kind:'image',ref:ref.ref},entry.data);
          }else{
            fileSchema.parse(ref.ref);if(!('chunks'in entry))throw new BackupError('BACKUP_EXPORT_CONTRACT_CHANGED');
            const data=(async function*(){try{const hash=createHash('sha256');for await(const bytes of entry.chunks){sameSource();hash.update(bytes);yield bytes;}sameSource();if('sha256:'+hash.digest('hex')!==ref.ref.attachmentId)throw new BackupError('BACKUP_ATTACHMENT_DIGEST_MISMATCH');}catch(error){fail(error);}})();
            yield {metadata:{kind:'file',ref:ref.ref},size:ref.ref.bytes,data};
          }
        }
        if(logs!==1)throw new BackupError('BACKUP_EXPORT_CONTRACT_CHANGED');
        sameSource();const after=await deps.sessionPersistence.stat(snapshot.header.id,{signal});
        if(after?.revision!==snapshot.revision)throw new BackupError('BACKUP_SOURCE_CHANGED');
      }
      await assertCurrent();
    }catch(error){fail(error);}
  }};
}
export async function* sessionBackupRecords(resolve:()=>SessionLogExportReady,options:BackupOptions={}):AsyncGenerator<BackupRecord>{
  const lease=await prepareSessionBackup(resolve,options);try{yield*lease.records();}finally{lease.close();}
}
export async function writeSessionBackup(destination:string,password:string,resolve:()=>SessionLogExportReady,options:BackupOptions={}):Promise<BackupReceipt>{
  return writeBackupArchive(destination,password,sessionBackupRecords(resolve,options),options);
}

async function collect(record:BackupRecord,limit:number){
  if(record.size>limit)throw new BackupError('BACKUP_RECORD_SIZE_INVALID');
  const chunks:Uint8Array[]=[];for await(const bytes of record.data)chunks.push(bytes);return Buffer.concat(chunks,record.size);
}
function refFrom(kind:'image'|'file',value:unknown):Ref{
  if(kind==='image'){const ref=imageSchema.parse(value);return {kind,ref:{...ref,attachmentId:AttachmentId(ref.attachmentId)}};}
  const ref=fileSchema.parse(value);return {kind,ref:{...ref,attachmentId:AttachmentId(ref.attachmentId)}};
}
export interface SessionRestoreCandidate {scope:typeof SCOPE;root:string;sessions:number;images:number;files:number;activated:false;}

/** Restore only into a newly created candidate. No existing home, profile or Agent is opened. */
export async function restoreSessionBackup(source:string,password:string,parentDirectory:string,options:BackupOptions={}):Promise<SessionRestoreCandidate>{
  if(!isAbsolute(parentDirectory))throw new BackupError('BACKUP_PATH_INVALID');
  const parent=await realpath(parentDirectory),archive=await openBackupArchive(source,password,options);
  try{return await restoreVerifiedSessionRecords(archive.records(),parent,options);}finally{await archive.close();}
}

/** Internal logical copy seam. Archive callers authenticate first; application
 * assembly supplies records captured through the current public SDK. */
export async function restoreVerifiedSessionRecords(input:AsyncGenerator<BackupRecord>,parentDirectory:string,options:BackupOptions={}):Promise<SessionRestoreCandidate>{
  if(!isAbsolute(parentDirectory))throw new BackupError('BACKUP_PATH_INVALID');
  const parent=await realpath(parentDirectory);
  let root:string|undefined,ctx:Context|undefined,complete=false;
  try{
    const first=await input.next();if(first.done||first.value.size!==0)throw new BackupError('BACKUP_MANIFEST_INVALID');
    const manifest=manifestSchema.parse(first.value.metadata);
    root=await realpath(await mkdtemp(join(parent,'dsh-zhen-session-restore-')));ctx=new Context();
    await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(root,'sessions')});await ctx.plugin(LocalAttachments,{dshHome:root});
    await ctx.plugin(Query,{path:':memory:',openAt:'never'});
    const attachments=ctx.attachments as LocalAttachments,deps:SessionLogExportReady={sessions:ctx.sessions,sessionPersistence:ctx.sessionPersistence,sessionQuery:ctx.sessionQuery,attachments};
    if((await deps.sessionPersistence.list()).length)throw new BackupError('BACKUP_RESTORE_NOT_EMPTY');
    const ids=new Set<string>(),refs=new Map<string,Ref>();let images=0,files=0;
    while(true){
      options.signal?.throwIfAborted();const next=await input.next();if(next.done)break;const item=next.value;
      if(item.metadata.kind==='session'){
        if(ids.size>=manifest.sessions)throw new BackupError('BACKUP_SESSION_COUNT_MISMATCH');
        const meta=z.object({kind:z.literal('session'),header:z.record(z.string(),z.unknown()),inheritedEventCount:integer,eventCount:integer}).strict().parse(item.metadata);
        const header=materializeCreateHeader(meta.header as unknown as SessionHeader);assertVersion(header);
        if(ids.has(header.id)||(!header.isSeeded&&meta.inheritedEventCount!==0)||meta.inheritedEventCount>meta.eventCount)throw new BackupError('BACKUP_SESSION_ID_CONFLICT');
        const bytes=await collect(item,SESSION_BYTES);let lines:unknown[];
        try{lines=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\n').filter(line=>line!=='').map(line=>JSON.parse(line));}catch{throw new BackupError('BACKUP_SESSION_INVALID');}
        const events=validateStoredEvents(header,lines.slice(1) as SessionEvent[]);assertContiguous(header.id,events,0);
        if(events.length!==meta.eventCount||serializeSessionLog(header,events)!==bytes.toString('utf8'))throw new BackupError('BACKUP_SESSION_INVALID');
        const handle=await deps.sessionPersistence.create(header,{inheritedEventCount:SessionLogOffset(meta.inheritedEventCount),signal:options.signal});
        try{await handle.append(events,{signal:options.signal});await handle.flush({signal:options.signal});}finally{await handle.close();}
        ids.add(header.id);
      }else if(item.metadata.kind==='image'||item.metadata.kind==='file'){
        const meta=z.object({kind:z.enum(['image','file']),ref:z.unknown()}).strict().parse(item.metadata),ref=refFrom(meta.kind,meta.ref),key=refKey(ref);
        if(refs.has(key)||refs.size>=MAX_ATTACHMENTS||ref.ref.bytes!==item.size)throw new BackupError('BACKUP_REFERENCE_CONFLICT');
        if(ref.kind==='image'){
          const data=await collect(item,IMAGE_BYTES);if('sha256:'+createHash('sha256').update(data).digest('hex')!==ref.ref.attachmentId)throw new BackupError('BACKUP_ATTACHMENT_DIGEST_MISMATCH');
          await commitPreparedImageFile(attachments.root,{ref:ref.ref,data});await attachments.readImage(ref.ref,options.signal);images++;
        }else{
          const restored=await attachments.saveFileStream({data:item.data,name:ref.ref.name,signal:options.signal});
          if(!isDeepStrictEqual(restored,ref.ref))throw new BackupError('BACKUP_ATTACHMENT_DIGEST_MISMATCH');files++;
        }
        refs.set(key,ref);
      }else throw new BackupError('BACKUP_RECORD_KIND_UNSUPPORTED');
    }
    if(ids.size!==manifest.sessions)throw new BackupError('BACKUP_SESSION_COUNT_MISMATCH');
    await deps.sessionPersistence.flush();
    // Verify every canonical referenced attachment through the published exporter.
    // Unknown informational payloads are never treated as arbitrary file paths.
    for(const snapshot of await deps.sessionPersistence.list()){
      const saved=await sessionText(deps,snapshot.header,options.signal);
      for await(const entry of sessionLogZipEntries(deps,saved.text,saved.header.id,false,options.signal))if('chunks'in entry)for await(const _bytes of entry.chunks){options.signal?.throwIfAborted();}
    }
    options.signal?.throwIfAborted();await ctx.fiber.dispose();ctx=undefined;
    const result:SessionRestoreCandidate={scope:SCOPE,root,sessions:ids.size,images,files,activated:false};
    await writeFile(join(root,'dsh-zhen-restore.json'),JSON.stringify({scope:SCOPE,sessions:ids.size,images,files,activated:false})+'\n',{flag:'wx',mode:0o600});
    complete=true;return result;
  }finally{
    try{await ctx?.fiber.dispose();}finally{
      try{await input.return(undefined);}catch(error){complete=false;throw error;}finally{if(root&&!complete){const actual=await realpath(root),part=relative(parent,actual);if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-session-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}
    }
  }
}
