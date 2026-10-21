import {createHash} from 'node:crypto';
import type {BigIntStats} from 'node:fs';
import {lstat,mkdir,mkdtemp,open,realpath,rm,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,parse,relative,resolve} from 'node:path';
import {z} from 'zod';
import {KnowledgeStore} from './knowledge.ts';
import {knowledgeRow,knowledgeTables} from './knowledge-backup.ts';
import type {KnowledgeBackupLease,KnowledgeBackupRow,KnowledgeTable} from './knowledge-backup.ts';
import type {ZhenRag} from './rag-service.ts';
import {ragBackendSettingsSchema,ragBackendStatusSchema} from './rag-backend-schema.ts';
import {BackupError,DEFAULT_BACKUP_LIMITS,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {assertSkillResourcePath} from './backup-skills.ts';

const SCHEMA='dsh-zhen-rag-backup-v1',MAX_MANIFEST=32*1024**2,MAX_RESOURCES=40_000,CHUNK=64*1024;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const inside=(base:string,path:string)=>{const part=relative(base,path);return !isAbsolute(part)&&part!=='..'&&!part.startsWith('..\\')&&!part.startsWith('../');};
const same=(a:unknown,b:unknown)=>backupJsonString(a)===backupJsonString(b);
// Public entrypoints are independently bundled. An existing KnowledgeStore may
// come from lib/knowledge rather than this bundle, so class identity can differ.
// Forward only our fixed codes, never a foreign message/cause or arbitrary code.
const knowledgeCodes=new Set(['BACKUP_RAG_SNAPSHOT_LIMIT','BACKUP_SOURCE_CHANGED','BACKUP_RAG_SCHEMA_UNSUPPORTED','BACKUP_RAG_ROW_INVALID','BACKUP_RAG_SEQUENCE_INVALID','BACKUP_RAG_DATA_LIMIT','BACKUP_READER_CLOSED','BACKUP_TEMP_BOUNDARY']);
function sourceFailure(error:unknown):BackupError{if(error instanceof BackupError)return error;const value=error as {name?:unknown;code?:unknown}|null;if(value?.name==='BackupError'&&typeof value.code==='string'&&knowledgeCodes.has(value.code))return new BackupError(value.code);return new BackupError('BACKUP_RAG_SOURCE_FAILED');}
const hash=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const backendSchema=z.object({settings:ragBackendSettingsSchema,status:ragBackendStatusSchema,persisted:z.object({present:z.boolean(),bytesBase64:z.string().max(10924),valid:z.boolean()}).strict()}).strict();
const resourceSchema=z.object({collectionId:z.uuid(),documentId:z.uuid(),path:z.string().min(1).max(4096),indexedDigest:hash,state:z.enum(['matching','changed','missing']),bytes:count,sha256:hash.nullable()}).strict();
const collectionSchema=z.object({id:z.uuid(),originRoot:z.string().min(1).max(4096)}).strict();
const manifestSchema=z.object({schema:z.literal(SCHEMA),databasePresent:z.boolean(),sequence:count,tables:z.array(z.object({table:z.enum(knowledgeTables as [KnowledgeTable,...KnowledgeTable[]]),rows:count.max(5_000_000),bytes:count,sha256:hash}).strict()).max(6),collections:z.array(collectionSchema).max(MAX_RESOURCES),resources:z.array(resourceSchema).max(MAX_RESOURCES),backend:backendSchema,credentialStoresIncluded:z.literal(false),transientImportDiagnosticsIncluded:z.literal(false),activated:z.literal(false)}).strict();
type Manifest=z.infer<typeof manifestSchema>;
type Resource=Manifest['resources'][number];
export interface RagBackupPolicy {protectedContainers:readonly string[];forbiddenTrees:readonly string[];}
export interface RagBackupSource {store:Pick<KnowledgeStore,'backupLease'>|null;rag:ZhenRag;policy:RagBackupPolicy;}
/** Keep this lease open until every component of a composed backup has passed
 * its final source barrier. records() alone is not a global consistency check. */
export interface RagBackupLease {records():AsyncGenerator<BackupRecord>;assertCurrent():Promise<void>;close():Promise<void>;}
export interface RagRestoreCandidate {schema:typeof SCHEMA;root:string;database:string|null;backendState:string;collections:Array<{id:string;originRoot:string;restoredRoot:string}>;resources:{matching:number;changed:number;missing:number};activated:false;readyForActivation:false;wholeApplicationRestore:false;}
function identity(stat:BigIntStats):string{return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');}
async function safePath(path:string):Promise<{present:boolean;identity:string;path:string}>{
  if(!isAbsolute(path)||path.length>4096)throw new BackupError('BACKUP_RAG_PATH_INVALID');
  const absolute=resolve(path),root=parse(absolute).root;let part=root;
  for(const name of relative(root,absolute).split(/[\\/]/).filter(Boolean)){
    part=join(part,name);try{const stat=await lstat(part,{bigint:true});if(stat.isSymbolicLink())throw new BackupError('BACKUP_RAG_LINK_REFUSED');}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {present:false,identity:'absent',path:absolute};throw error;}
  }
  const stat=await lstat(absolute,{bigint:true});return {present:true,identity:identity(stat),path:absolute};
}
async function scope(root:string,policy:RagBackupPolicy){
  const path=(await safePath(root)).path;
  const containers=await Promise.all([process.cwd(),homedir(),...policy.protectedContainers].map(async item=>{if(!isAbsolute(item))throw new BackupError('BACKUP_RAG_SCOPE_REFUSED');return (await safePath(item)).path;}));
  const forbidden=await Promise.all(policy.forbiddenTrees.map(async item=>(await safePath(item)).path));
  if(path===parse(path).root||containers.some(item=>inside(path,item))||forbidden.some(item=>inside(path,item)||inside(item,path)))throw new BackupError('BACKUP_RAG_SCOPE_REFUSED');
}
function pathFor(root:string,parts:string[]):string{assertSkillResourcePath(parts);const path=join(root,...parts);if(!inside(root,path)||path===root)throw new BackupError('BACKUP_RAG_PATH_INVALID');return path;}
async function resourceIdentity(root:string,path:string):Promise<string>{
  const directory=await safePath(root);if(!directory.present)return 'absent';if(!(await lstat(directory.path)).isDirectory())throw new BackupError('BACKUP_RAG_PATH_INVALID');
  const resource=await safePath(path);if(!resource.present)return 'absent';if(!(await lstat(path)).isFile())throw new BackupError('BACKUP_RAG_PATH_INVALID');return resource.identity;
}
async function* resourceBytes(root:string,path:string,expected:string,size:number,signal?:AbortSignal):AsyncGenerator<Uint8Array>{
  signal?.throwIfAborted();if(await resourceIdentity(root,path)!==expected)throw new BackupError('BACKUP_SOURCE_CHANGED');
  const file=await open(path,'r');try{
    const before=await file.stat({bigint:true});if(!before.isFile()||identity(before)!==expected)throw new BackupError('BACKUP_SOURCE_CHANGED');
    let position=0;while(position<size){signal?.throwIfAborted();const bytes=Buffer.alloc(Math.min(CHUNK,size-position)),n=(await file.read(bytes,0,bytes.length,position)).bytesRead;if(!n)throw new BackupError('BACKUP_SOURCE_CHANGED');position+=n;yield bytes.subarray(0,n);}
    if(identity(await file.stat({bigint:true}))!==expected||await resourceIdentity(root,path)!==expected)throw new BackupError('BACKUP_SOURCE_CHANGED');
  }finally{await file.close();}
}
async function jsonRecord(metadata:Record<string,unknown>,value:unknown):Promise<BackupRecord>{const bytes=Buffer.from(backupJsonString(value));if(bytes.length>MAX_MANIFEST)throw new BackupError('BACKUP_RAG_MANIFEST_LIMIT');return {metadata,size:bytes.length,data:(async function*(){yield bytes;})()};}
/** No cold service constructor: the Host supplies its existing own instances. */
export async function prepareRagBackup(source:()=>RagBackupSource,options:BackupOptions={}):Promise<RagBackupLease>{
  options.signal?.throwIfAborted();let lease:KnowledgeBackupLease|undefined;
  try{
    const provided=source(),current={store:provided.store,rag:provided.rag},policy=structuredClone(provided.policy);backupJsonString(policy);
    if(!Array.isArray(policy.protectedContainers)||!Array.isArray(policy.forbiddenTrees)||policy.protectedContainers.length>1024||policy.forbiddenTrees.length>1024)throw new BackupError('BACKUP_RAG_SCOPE_REFUSED');
    const backend=current.rag.backupState();if(current.store)lease=await current.store.backupLease(options);
    const collections:Array<{id:string;originRoot:string}>=[],roots=new Map<string,string>();
    if(lease)for(const row of lease.rows('collections')){if(collections.length>=MAX_RESOURCES)throw new BackupError('BACKUP_RAG_RESOURCE_LIMIT');const originRoot=String(row.root);await scope(originRoot,policy);collections.push({id:String(row.id),originRoot});roots.set(String(row.id),originRoot);}
    const resources:Resource[]=[],observations:string[]=[];let total=lease?.tables.reduce((sum,row)=>sum+row.bytes,0)??0;
    if(lease)for(const row of lease.rows('documents')){
      if(resources.length>=MAX_RESOURCES)throw new BackupError('BACKUP_RAG_RESOURCE_LIMIT');const root=roots.get(String(row.collection_id));if(!root)throw new BackupError('BACKUP_RAG_ROW_INVALID');const path=pathFor(root,String(row.path).split('/')),observed=await resourceIdentity(root,path),present=observed!=='absent';
      const bytes=present?Number((await lstat(path)).size):0;if(bytes>(options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes)||(total+=bytes)>(options.limits?.archiveBytes??DEFAULT_BACKUP_LIMITS.archiveBytes))throw new BackupError('BACKUP_ARCHIVE_LIMIT');
      const digest=createHash('sha256');if(present)for await(const chunk of resourceBytes(root,path,observed,bytes,options.signal))digest.update(chunk);const actual=present?digest.digest('hex'):null;
      resources.push({collectionId:String(row.collection_id),documentId:String(row.id),path:String(row.path),indexedDigest:String(row.digest),state:!present?'missing':actual===row.digest?'matching':'changed',bytes,sha256:actual});observations.push(observed);
    }
    const manifest=validateManifest({schema:SCHEMA,databasePresent:!!lease,sequence:lease?.sequence??0,tables:lease?.tables??[],collections,resources,backend,credentialStoresIncluded:false,transientImportDiagnosticsIncluded:false,activated:false});
    let closed=false,started=false;
    const assertCurrent=async()=>{if(closed)throw new BackupError('BACKUP_READER_CLOSED');options.signal?.throwIfAborted();try{const next=source();if(next.store!==current.store||next.rag!==current.rag||!same(next.policy,policy)||!same(next.rag.backupState(),backend))throw Error();lease?.assertCurrent();for(const collection of collections)await scope(collection.originRoot,policy);for(let i=0;i<resources.length;i++){const row=resources[i]!;if(await resourceIdentity(roots.get(row.collectionId)!,pathFor(roots.get(row.collectionId)!,row.path.split('/')))!==observations[i])throw Error();}lease?.assertCurrent();if(!same(current.rag.backupState(),backend))throw Error();}catch{options.signal?.throwIfAborted();throw new BackupError('BACKUP_SOURCE_CHANGED');}};
    await assertCurrent();
    return {assertCurrent,async *records(){if(closed||started)throw new BackupError('BACKUP_READER_CLOSED');started=true;yield await jsonRecord({kind:'rag-manifest',schema:SCHEMA},manifest);
      if(lease)for(const table of lease.tables)yield {metadata:{kind:'rag-table',table:table.table},size:table.bytes,data:(async function*(){for(const row of lease!.rows(table.table)){options.signal?.throwIfAborted();yield Buffer.from(backupJsonString(row)+'\n');}})()};
      for(let index=0;index<resources.length;index++){const row=resources[index]!;if(row.state==='missing')continue;const root=roots.get(row.collectionId)!;yield {metadata:{kind:'rag-resource',index},size:row.bytes,data:resourceBytes(root,pathFor(root,row.path.split('/')),observations[index]!,row.bytes,options.signal)};}await assertCurrent();
    },async close(){if(closed)return;closed=true;await lease?.close();}};
  }catch(error){await lease?.close();options.signal?.throwIfAborted();throw sourceFailure(error);}
}
export async function* ragBackupRecords(source:()=>RagBackupSource,options:BackupOptions={}):AsyncGenerator<BackupRecord>{const lease=await prepareRagBackup(source,options);try{yield* lease.records();await lease.assertCurrent();}catch(error){options.signal?.throwIfAborted();throw sourceFailure(error);}finally{await lease.close();}}
export function writeRagBackup(destination:string,password:string,source:()=>RagBackupSource,options:BackupOptions={}):Promise<BackupReceipt>{return writeBackupArchive(destination,password,ragBackupRecords(source,options),options);}

async function* lines(data:AsyncIterable<Uint8Array>):AsyncGenerator<unknown>{let pending=Buffer.alloc(0);for await(const bytes of data){pending=Buffer.concat([pending,bytes]);let end;while((end=pending.indexOf(10))!==-1){if(end>1024**2)throw new BackupError('BACKUP_RAG_ROW_INVALID');yield parseBackupJson(pending.subarray(0,end));pending=pending.subarray(end+1);}if(pending.length>1024**2)throw new BackupError('BACKUP_RAG_ROW_INVALID');}if(pending.length)throw new BackupError('BACKUP_RAG_ROW_INVALID');}
async function bytesOf(record:BackupRecord,limit:number):Promise<Buffer>{if(record.size>limit)throw new BackupError('BACKUP_RAG_MANIFEST_LIMIT');const parts:Uint8Array[]=[];for await(const bytes of record.data)parts.push(bytes);return Buffer.concat(parts);}
function validateManifest(value:unknown):Manifest{
  const result=manifestSchema.safeParse(value);if(!result.success)throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');const manifest=result.data;
  if(!same(manifest.tables.map(row=>row.table),manifest.databasePresent?knowledgeTables:[])||(!manifest.databasePresent&&(manifest.sequence||manifest.collections.length||manifest.resources.length)))throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');
  const persisted=manifest.backend.persisted,raw=Buffer.from(persisted.bytesBase64,'base64');if(raw.length>8192||raw.toString('base64')!==persisted.bytesBase64||(!persisted.present&&(raw.length||persisted.valid)))throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');let valid=false;try{valid=ragBackendSettingsSchema.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))).success;}catch{}if(persisted.present&&valid!==persisted.valid)throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');
  const ids=new Set<string>(),paths=new Set<string>(),documents=new Set<string>(),prefixes=new Map<string,string>();for(const collection of manifest.collections){if(ids.has(collection.id))throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');ids.add(collection.id);}
  for(const row of manifest.resources){const parts=row.path.split('/');assertSkillResourcePath(parts);const path=row.collectionId+':'+row.path.normalize('NFKC').toLowerCase();if(!ids.has(row.collectionId)||paths.has(path)||documents.has(row.documentId)||(row.state==='missing'?(row.bytes!==0||row.sha256!==null):(!row.sha256||(row.state==='matching')!==(row.sha256===row.indexedDigest))))throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');paths.add(path);documents.add(row.documentId);for(let index=1;index<=parts.length;index++){const original=parts.slice(0,index).join('/'),key=row.collectionId+':'+original.normalize('NFKC').toLowerCase(),old=prefixes.get(key);if(old!==undefined&&old!==original)throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');prefixes.set(key,original);}}
  return manifest;
}
/** Authentication precedes creation; origin paths never select destinations.
 * Settings/resources are staged, never rebound, registered or activated. */
export async function restoreRagBackup(source:string,password:string,parent:string,options:BackupOptions={}):Promise<RagRestoreCandidate>{
  options.signal?.throwIfAborted();if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');const base=await realpath(parent);if(!(await lstat(base)).isDirectory())throw new BackupError('BACKUP_PATH_INVALID');
  const archive=await openBackupArchive(source,password,options);let root:string|undefined,store:KnowledgeStore|undefined,complete=false;
  try{
    const records=archive.records(),first=await records.next();if(first.done||!same(first.value.metadata,{kind:'rag-manifest',schema:SCHEMA}))throw new BackupError('BACKUP_RAG_MANIFEST_INVALID');
    const manifest=validateManifest(parseBackupJson(await bytesOf(first.value,MAX_MANIFEST)));options.signal?.throwIfAborted();
    root=await mkdtemp(join(base,'dsh-zhen-rag-restore-'));const resourcesRoot=join(root,'resources');await mkdir(resourcesRoot,{mode:0o700});const collections=manifest.collections.map(row=>({...row,restoredRoot:join(resourcesRoot,sha(row.id).slice(0,32))}));for(const row of collections)await mkdir(row.restoredRoot,{mode:0o700});
    const expectedCollections=new Map(manifest.collections.map(row=>[row.id,row])),expectedDocuments=new Map(manifest.resources.map(row=>[row.documentId,row]));
    const database=manifest.databasePresent?join(root,'knowledge.sqlite'):null;
    if(database){store=new KnowledgeStore(database);await store.restoreBackupRows((async function*(){for(const table of manifest.tables){const next=await records.next();if(next.done||!same(next.value.metadata,{kind:'rag-table',table:table.table})||next.value.size!==table.bytes)throw new BackupError('BACKUP_RAG_TABLE_INVALID');const digest=createHash('sha256');let count=0;
      const checked=(async function*(){for await(const bytes of next.value.data){digest.update(bytes);yield bytes;}})();for await(const value of lines(checked)){options.signal?.throwIfAborted();if(++count>table.rows)throw new BackupError('BACKUP_RAG_TABLE_INVALID');const row=knowledgeRow(table.table,value);
        if(table.table==='collections'){const origin=expectedCollections.get(String(row.id));if(!origin||origin.originRoot!==row.root)throw new BackupError('BACKUP_RAG_ROW_INVALID');expectedCollections.delete(String(row.id));}
        if(table.table==='documents'){const origin=expectedDocuments.get(String(row.id));if(!origin||origin.collectionId!==row.collection_id||origin.path!==row.path||origin.indexedDigest!==row.digest)throw new BackupError('BACKUP_RAG_ROW_INVALID');expectedDocuments.delete(String(row.id));}
        yield {table:table.table,row} as KnowledgeBackupRow;
      }if(count!==table.rows||digest.digest('hex')!==table.sha256)throw new BackupError('BACKUP_RAG_TABLE_INVALID');}if(expectedCollections.size||expectedDocuments.size)throw new BackupError('BACKUP_RAG_ROW_INVALID');})(),manifest.sequence,options.signal);store.close();store=undefined;}
    for(let index=0;index<manifest.resources.length;index++){
      const row=manifest.resources[index]!;if(row.state==='missing')continue;const next=await records.next();if(next.done||!same(next.value.metadata,{kind:'rag-resource',index})||next.value.size!==row.bytes)throw new BackupError('BACKUP_RAG_RESOURCE_INVALID');const directory=collections.find(item=>item.id===row.collectionId)!.restoredRoot,path=pathFor(directory,row.path.split('/'));await mkdir(dirname(path),{recursive:true,mode:0o700});const file=await open(path,'wx',0o600),digest=createHash('sha256');
      try{for await(const bytes of next.value.data){options.signal?.throwIfAborted();let offset=0;while(offset<bytes.length){const n=(await file.write(bytes,offset,bytes.length-offset,null)).bytesWritten;if(!n)throw new BackupError('BACKUP_WRITE_FAILED');offset+=n;}digest.update(bytes);}if(digest.digest('hex')!==row.sha256)throw new BackupError('BACKUP_RAG_DIGEST_MISMATCH');await file.sync();}finally{await file.close();}
    }
    if(!(await records.next()).done)throw new BackupError('BACKUP_RAG_RECORD_INVALID');const backendState=join(root,'rag-backend-candidate.json');await writeFile(backendState,backupJsonString(manifest.backend)+'\n',{flag:'wx',mode:0o600});
    const result:RagRestoreCandidate={schema:SCHEMA,root,database,backendState,collections,resources:{matching:manifest.resources.filter(row=>row.state==='matching').length,changed:manifest.resources.filter(row=>row.state==='changed').length,missing:manifest.resources.filter(row=>row.state==='missing').length},activated:false,readyForActivation:false,wholeApplicationRestore:false};
    await writeFile(join(root,'dsh-zhen-rag-restore.json'),backupJsonString({candidate:result,manifest})+'\n',{flag:'wx',mode:0o600});options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_RAG_RESTORE_FAILED');}
  finally{try{store?.close();await archive.close();}finally{if(root&&!complete){const actual=await realpath(root),part=relative(base,actual);if((await lstat(root)).isSymbolicLink()||!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-rag-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
