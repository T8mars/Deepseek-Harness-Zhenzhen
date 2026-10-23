import {Context} from '@deepseek-ai/cordis';
import Sessions,{SessionId,SessionSeq} from '@deepseek-ai/dsh-session';
import type {SessionEvent} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-working-directory';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Query from '@deepseek-ai/dsh-session-query-sqlite';
import {lstat,realpath,rm} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {dirname,isAbsolute,join,relative} from 'node:path';
import {z} from 'zod';
import {prepareSessionBackup,restoreVerifiedSessionRecords} from './backup-sessions.ts';
import type {SessionRestoreCandidate} from './backup-sessions.ts';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';

const equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const within=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(root)&&isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const inode=(stat:BigIntStats)=>stat.dev+':'+stat.ino;
const mappingSchema=z.array(z.object({sessionId:z.string().min(1).max(255),directory:z.string().min(1).max(4096),originalDirectory:z.string().min(1).max(4096).nullable().optional()}).strict()).max(10000);
export interface SessionDirectoryBinding {sessionId:string;directory:string;originalDirectory?:string|null;}
export interface SessionApplicationReceipt {
  schema:'dsh-zhen-session-application-v1';root:string;sessionsRoot:string;attachmentsHome:string;
  sessions:number;images:number;files:number;
  directories:Array<{sessionId:string;directory:string;identity:string;eventSeq:number;originalDirectory?:string|null}>;
  unmappedSessions:number;reviewRequired:true;activated:false;permissionsRestored:false;
}
async function ordinary(root:string,path:string):Promise<void>{
  if(!within(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');let current=path;
  for(;;){const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory()||!equal(await realpath(current),current))throw new BackupError('BACKUP_TEMP_BOUNDARY');if(equal(current,root))return;const parent=dirname(current);if(parent===current)throw new BackupError('BACKUP_TEMP_BOUNDARY');current=parent;}
}
async function directory(path:string){
  if(!isAbsolute(path)||/^[/\\]{2}/.test(path))throw new BackupError('BACKUP_SESSION_DIRECTORY_INVALID');
  try{const canonical=await realpath(path),stat=await lstat(canonical,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();return{path:canonical,identity:inode(stat)};}catch{throw new BackupError('BACKUP_SESSION_DIRECTORY_INVALID');}
}
/** Copy the already restored component through public persistence/export APIs.
 * Directory changes are ordinary documented events appended only to this new
 * copy. No source header, event, attachment or existing target folder is written. */
export async function prepareRestoredSessions(root:string,home:string,source:SessionRestoreCandidate,bindings:readonly SessionDirectoryBinding[]=[],options:BackupOptions={}):Promise<SessionApplicationReceipt>{
  options.signal?.throwIfAborted();await ordinary(root,home);await ordinary(root,source.root);
  if(within(source.root,home)||within(home,source.root))throw new BackupError('BACKUP_SESSION_APPLICATION_INPUT_INVALID');
  if(source.scope!=='dsh-zhen-sessions-and-attachments-v1'||source.activated!==false||![source.sessions,source.images,source.files].every(value=>Number.isSafeInteger(value)&&value>=0))throw new BackupError('BACKUP_SESSION_APPLICATION_INPUT_INVALID');
  const parsed=mappingSchema.safeParse(bindings);if(!parsed.success)throw new BackupError('BACKUP_SESSION_DIRECTORY_INVALID');type Target={request:string;path:string;identity:string};const selections=new Map<string,Target>(),targets=new Map<string,Target>();
  for(const row of parsed.data){options.signal?.throwIfAborted();if(selections.has(row.sessionId))throw new BackupError('BACKUP_SESSION_DIRECTORY_CONFLICT');let pinned=targets.get(row.directory);if(!pinned){pinned={request:row.directory,...await directory(row.directory)};targets.set(row.directory,pinned);}selections.set(row.sessionId,pinned);}
  const checkDirectory=async(row:Target)=>{options.signal?.throwIfAborted();const current=await directory(row.request);if(!equal(current.path,row.path)||current.identity!==row.identity)throw new BackupError('BACKUP_SESSION_DIRECTORY_CHANGED');};
  const checkDirectories=async()=>{for(const row of targets.values())await checkDirectory(row);};
  const ctx=new Context();let lease:Awaited<ReturnType<typeof prepareSessionBackup>>|undefined,copy:SessionRestoreCandidate|undefined,target:Context|undefined,complete=false;
  try{
    await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(source.root,'sessions')});await ctx.plugin(Attachments,{dshHome:source.root});await ctx.plugin(Query,{path:':memory:',openAt:'never'});
    const snapshots=await ctx.sessionPersistence.list({signal:options.signal});if(snapshots.length!==source.sessions)throw new BackupError('BACKUP_SESSION_COUNT_MISMATCH');const ids=new Map(snapshots.map(row=>[String(row.header.id),row.header]));if([...selections.keys()].some(id=>!ids.has(id)))throw new BackupError('BACKUP_SESSION_DIRECTORY_UNKNOWN');for(const row of parsed.data)if(row.originalDirectory!==undefined&&(ids.get(row.sessionId)!.cwd??null)!==row.originalDirectory)throw new BackupError('BACKUP_SESSION_PROJECT_CHANGED');
    lease=await prepareSessionBackup(()=>({sessions:ctx.sessions,sessionPersistence:ctx.sessionPersistence,sessionQuery:ctx.sessionQuery,attachments:ctx.attachments}),options);await checkDirectories();
    copy=await restoreVerifiedSessionRecords(lease.records(),home,options);await lease.assertCurrent();if(copy.sessions!==source.sessions||copy.images!==source.images||copy.files!==source.files)throw new BackupError('BACKUP_SESSION_COUNT_MISMATCH');await ordinary(home,copy.root);
    const result:SessionApplicationReceipt={schema:'dsh-zhen-session-application-v1',root:copy.root,sessionsRoot:join(copy.root,'sessions'),attachmentsHome:copy.root,sessions:copy.sessions,images:copy.images,files:copy.files,directories:[],unmappedSessions:copy.sessions-selections.size,reviewRequired:true,activated:false,permissionsRestored:false};
    if(selections.size){
      target=new Context();await target.plugin(Sessions);await target.plugin(Jsonl,{root:result.sessionsRoot});
      for(const [id,row]of selections){options.signal?.throwIfAborted();await checkDirectory(row);const handle=await target.sessionPersistence.open(SessionId(id),'write',{signal:options.signal});
        try{let offset=0;for(;;){const batch=await handle.read(offset,128,{signal:options.signal});if(!batch.events.length)break;offset+=batch.events.length;if(offset>Number.MAX_SAFE_INTEGER-1)throw new BackupError('BACKUP_SESSION_APPLICATION_LIMIT');}
          // This released event type is owned by WorkingDirectoryService. The
          // public backend validates and durably appends it without rewriting
          // immutable headers or needing an Agent/model to run during restore.
          const event:SessionEvent<'working-directory/change'>={type:'working-directory/change',seq:SessionSeq(offset),time:Date.now(),data:{cwd:row.path}};
          await checkDirectory(row);await handle.append([event],{signal:options.signal});await handle.flush({signal:options.signal});result.directories.push({sessionId:id,directory:row.path,identity:row.identity,eventSeq:offset,originalDirectory:ids.get(id)!.cwd??null});
        }finally{await handle.close();}
      }
      await target.sessionPersistence.flush();await target.fiber.dispose();target=undefined;
    }
    await checkDirectories();await lease.assertCurrent();options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_SESSION_APPLICATION_FAILED');}
  finally{try{try{await target?.fiber.dispose();}finally{try{await lease?.close();}finally{await ctx.fiber.dispose();}}}catch(error){complete=false;throw error;}finally{if(copy&&!complete){await ordinary(home,copy.root);const part=relative(home,copy.root);if(!part||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-session-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(copy.root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
