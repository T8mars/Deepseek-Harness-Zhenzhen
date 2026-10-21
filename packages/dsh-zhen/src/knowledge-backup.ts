import {backup,DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {chmod,lstat,mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,join,relative} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString} from './backup-data.ts';

const string=z.string().max(4096),id=z.uuid(),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),bit=z.union([z.literal(0),z.literal(1)]);
export const knowledgeRowSchemas={
  collections:z.object({id,project:string.min(1).max(200),name:string.min(1).max(100),root:string.min(1),epoch:positive,enabled:bit,cloud_provider:string,agent_enabled:bit}).strict(),
  documents:z.object({id,collection_id:id,path:string.min(1),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  chunks:z.object({id,document_id:id,line:positive,text:z.string().max(65536),page:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict(),
  workspace_bindings:z.object({project:string.min(1).max(200),root:string.min(1),epoch:positive}).strict(),
  binding_revisions:z.object({id:positive}).strict(),
  // Historical grants intentionally have no FK: retaining revoked/orphaned
  // grants is part of the next-request denial, not corrupt data to discard.
  session_grants:z.object({session_id:string.min(1),project:string.min(1).max(200),collection_id:id,epoch:positive,binding_epoch:positive,root:string.min(1)}).strict(),
};
export type KnowledgeTable=keyof typeof knowledgeRowSchemas;
export const knowledgeTables=Object.keys(knowledgeRowSchemas) as KnowledgeTable[];
export type KnowledgeBackupRow={table:KnowledgeTable;row:Record<string,string|number>};
export interface KnowledgeTableSummary {table:KnowledgeTable;rows:number;bytes:number;sha256:string;}
export interface KnowledgeBackupLease {
  tables:KnowledgeTableSummary[];sequence:number;
  rows(table:KnowledgeTable):Iterable<Record<string,string|number>>;
  assertCurrent():void;close():Promise<void>;
}
export function knowledgeRow(table:KnowledgeTable,value:unknown):Record<string,string|number>{
  const result=knowledgeRowSchemas[table].safeParse(value);
  if(!result.success)throw new BackupError('BACKUP_RAG_ROW_INVALID');
  return result.data;
}
const columns=(table:KnowledgeTable)=>Object.keys(knowledgeRowSchemas[table].shape);
function revision(db:DatabaseSync):string{
  return backupJsonString([db.prepare('SELECT total_changes() AS value').get()?.value,...['data_version','schema_version','user_version'].map(key=>db.prepare('PRAGMA '+key).get()?.[key])]);
}
async function remove(base:string,root:string){const actual=await realpath(root),part=relative(base,actual);if((await lstat(root)).isSymbolicLink()||!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-rag-snapshot-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
/** Only called with our already-owned live KnowledgeStore handle. The temporary
 * physical copy is never installed: only validated logical rows leave it. */
export async function freezeKnowledge(db:DatabaseSync,options:BackupOptions):Promise<KnowledgeBackupLease>{
  options.signal?.throwIfAborted();const original=revision(db),size=Number(db.prepare('PRAGMA page_count').get()?.page_count)*Number(db.prepare('PRAGMA page_size').get()?.page_size);
  if(!Number.isSafeInteger(size)||size>512*1024**2)throw new BackupError('BACKUP_RAG_SNAPSHOT_LIMIT');
  const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'dsh-zhen-rag-snapshot-'));let frozen:DatabaseSync|undefined,complete=false;
  try{
    await chmod(root,0o700);const path=join(root,'knowledge.sqlite');await backup(db,path,{rate:128});await chmod(path,0o600);
    options.signal?.throwIfAborted();if(revision(db)!==original)throw new BackupError('BACKUP_SOURCE_CHANGED');
    if((await lstat(path)).size>512*1024**2)throw new BackupError('BACKUP_RAG_SNAPSHOT_LIMIT');
    frozen=new DatabaseSync(path,{readOnly:true});frozen.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
    if(frozen.prepare('PRAGMA user_version').get()?.user_version!==3)throw new BackupError('BACKUP_RAG_SCHEMA_UNSUPPORTED');
    const names=new Set([...knowledgeTables,'sqlite_sequence','search_index',...['data','idx','content','docsize','config'].map(part=>'search_index_'+part)]);
    for(const row of frozen.prepare("SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_autoindex_%'").iterate())if(row.type!=='table'||!names.delete(String(row.name)))throw new BackupError('BACKUP_RAG_SCHEMA_UNSUPPORTED');
    if(names.size)throw new BackupError('BACKUP_RAG_SCHEMA_UNSUPPORTED');
    for(const table of knowledgeTables){const actual=frozen.prepare('PRAGMA table_info('+table+')').all().map(row=>String(row.name)).sort();if(backupJsonString(actual)!==backupJsonString(columns(table).sort()))throw new BackupError('BACKUP_RAG_SCHEMA_UNSUPPORTED');}
    const rows=function*(table:KnowledgeTable){for(const value of frozen!.prepare('SELECT '+columns(table).join(',')+' FROM '+table+' ORDER BY rowid').iterate())yield knowledgeRow(table,value);};
    const tables:KnowledgeTableSummary[]=[];let total=0;
    for(const table of knowledgeTables){const hash=createHash('sha256');let count=0,bytes=0;for(const row of rows(table)){options.signal?.throwIfAborted();const line=Buffer.from(backupJsonString(row)+'\n');bytes+=line.length;total+=line.length;if(++count>5_000_000||bytes>(options.limits?.recordBytes??1024**3)||total>(options.limits?.archiveBytes??4*1024**3))throw new BackupError('BACKUP_RAG_DATA_LIMIT');hash.update(line);if(count%256===0)await new Promise<void>(resolve=>setImmediate(resolve));}tables.push({table,rows:count,bytes,sha256:hash.digest('hex')});}
    const sequence=Number(frozen.prepare("SELECT seq FROM sqlite_sequence WHERE name='binding_revisions'").get()?.seq??0);
    if(!Number.isSafeInteger(sequence)||sequence<0)throw new BackupError('BACKUP_RAG_SEQUENCE_INVALID');
    const high=Number(frozen.prepare('SELECT max(value) AS value FROM (SELECT max(id) AS value FROM binding_revisions UNION ALL SELECT max(epoch) FROM workspace_bindings UNION ALL SELECT max(binding_epoch) FROM session_grants)').get()?.value??0);
    if(sequence<high)throw new BackupError('BACKUP_RAG_SEQUENCE_INVALID');if(frozen.prepare('PRAGMA foreign_key_check').all().length)throw new BackupError('BACKUP_RAG_ROW_INVALID');
    const assertCurrent=()=>{options.signal?.throwIfAborted();try{if(revision(db)!==original)throw Error();}catch{throw new BackupError('BACKUP_SOURCE_CHANGED');}};
    assertCurrent();let closed=false;complete=true;
    return {tables,sequence,rows(table){if(closed||!knowledgeTables.includes(table))throw new BackupError('BACKUP_READER_CLOSED');return rows(table);},assertCurrent(){if(closed)throw new BackupError('BACKUP_READER_CLOSED');assertCurrent();},async close(){if(closed)return;closed=true;try{frozen!.close();}finally{await remove(base,root);}}};
  }finally{if(!complete){try{frozen?.close();}finally{await remove(base,root);}}}
}
/** Internal Host adapter for its fixed own database when the lazy store has not
 * opened. Never calls KnowledgeStore's creating/migrating constructor. */
export function readonlyKnowledgeSource(path:string):{backupLease(options:BackupOptions):Promise<KnowledgeBackupLease>}{
  return {async backupLease(options){
    const before=lstatSync(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink())throw new BackupError('BACKUP_RAG_SOURCE_FAILED');const physical=realpathSync(path),db=new DatabaseSync(path,{readOnly:true});let lease:KnowledgeBackupLease|undefined;
    const pin=()=>{const after=lstatSync(path,{bigint:true});if(after.isSymbolicLink()||!after.isFile()||realpathSync(path)!==physical||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)throw new BackupError('BACKUP_SOURCE_CHANGED');};
    try{db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');pin();lease=await freezeKnowledge(db,options);pin();let closed=false;const owned=lease;
      return {tables:owned.tables,sequence:owned.sequence,rows:table=>owned.rows(table),assertCurrent(){if(closed)throw new BackupError('BACKUP_READER_CLOSED');try{pin();owned.assertCurrent();}catch{throw new BackupError('BACKUP_SOURCE_CHANGED');}},async close(){if(closed)return;closed=true;try{await owned.close();}finally{db.close();}}};
    }catch(error){try{await lease?.close();}finally{db.close();}throw error;}
  }};
}
/** Fresh, private candidate only; archive SQL/schema/FTS is never executed. */
export async function importKnowledgeRows(db:DatabaseSync,rows:AsyncIterable<KnowledgeBackupRow>,sequence:number,terms:(text:string)=>string[],signal?:AbortSignal):Promise<void>{
  if(!Number.isSafeInteger(sequence)||sequence<0)throw new BackupError('BACKUP_RAG_SEQUENCE_INVALID');
  for(const table of [...knowledgeTables,'search_index'])if(db.prepare('SELECT count(*) AS n FROM '+table).get()?.n!==0)throw new BackupError('BACKUP_RAG_TARGET_NOT_EMPTY');
  if(db.prepare('SELECT count(*) AS n FROM sqlite_sequence').get()?.n!==0)throw new BackupError('BACKUP_RAG_TARGET_NOT_EMPTY');
  const inserts=new Map(knowledgeTables.map(table=>[table,db.prepare('INSERT INTO '+table+'('+columns(table).join(',')+') VALUES('+columns(table).map(()=>'?').join(',')+')')])),fts=db.prepare('INSERT INTO search_index(chunk_id,terms) VALUES(?,?)');
  db.exec('BEGIN IMMEDIATE');
  try{
    let high=0;
    for await(const item of rows){signal?.throwIfAborted();if(!knowledgeTables.includes(item.table))throw new BackupError('BACKUP_RAG_ROW_INVALID');const row=knowledgeRow(item.table,item.row);inserts.get(item.table)!.run(...columns(item.table).map(key=>row[key]!));if(item.table==='chunks')fts.run(row.id!,terms(String(row.text)).join(' '));if(item.table==='binding_revisions')high=Math.max(high,Number(row.id));if(item.table==='workspace_bindings')high=Math.max(high,Number(row.epoch));if(item.table==='session_grants')high=Math.max(high,Number(row.binding_epoch));}
    if(sequence<high)throw new BackupError('BACKUP_RAG_SEQUENCE_INVALID');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new BackupError('BACKUP_RAG_ROW_INVALID');
    db.prepare("DELETE FROM sqlite_sequence WHERE name='binding_revisions'").run();if(sequence)db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('binding_revisions',?)").run(sequence);
    signal?.throwIfAborted();db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
