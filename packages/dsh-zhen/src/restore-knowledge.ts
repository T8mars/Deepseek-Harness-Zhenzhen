import {lstat,open,realpath,writeFile,unlink} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {dirname,isAbsolute,join,relative} from 'node:path';
import {KnowledgeStore} from './knowledge.ts';
import {readonlyKnowledgeSource} from './knowledge-backup.ts';
import type {KnowledgeBackupRow} from './knowledge-backup.ts';
import type {RagRestoreCandidate} from './backup-rag.ts';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {ragBackendSettingsSchema,ragBackendStatusSchema} from './rag-backend-schema.ts';
import {z} from 'zod';

const within=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(root)&&isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const identity=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
async function ordinary(root:string,path:string,file=false):Promise<void>{
  if(!within(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');let current=path;
  for(;;){const stat=await lstat(current);if(stat.isSymbolicLink()||!equal(await realpath(current),current)||current===path&&(file?!stat.isFile():!stat.isDirectory()))throw new BackupError('BACKUP_TEMP_BOUNDARY');if(equal(current,root))return;const parent=dirname(current);if(parent===current)throw new BackupError('BACKUP_TEMP_BOUNDARY');current=parent;}
}
const backendSchema=z.object({settings:ragBackendSettingsSchema,status:ragBackendStatusSchema,persisted:z.object({present:z.boolean(),bytesBase64:z.string().max(10924),valid:z.boolean()}).strict()}).strict();
const mappingsSchema=z.array(z.object({id:z.uuid(),originRoot:z.string().min(1).max(4096),restoredRoot:z.string().min(1).max(4096)}).strict()).max(40_000);
export interface KnowledgeApplicationReceipt{
  schema:'dsh-zhen-knowledge-application-v1';present:boolean;database:string|null;
  collections:Array<{id:string;project:string;root:string;previousEpoch:number;epoch:number}>;
  historicalGrants:number;backend:string;backendReview:string;backendWasValid:boolean;
  reviewRequired:true;activated:false;agentAccessRestored:false;
}
/** Host-only staging into an already-owned NEW application data directory.
 * The component database and historical grants remain unchanged. Only the new
 * application copy receives current source roots and a new authorization epoch. */
export async function prepareRestoredKnowledge(root:string,home:string,source:RagRestoreCandidate,options:BackupOptions={}):Promise<KnowledgeApplicationReceipt>{
  options.signal?.throwIfAborted();await ordinary(root,home);await ordinary(root,source.root);
  if(source.schema!=='dsh-zhen-rag-backup-v1'||source.activated!==false||source.readyForActivation!==false)throw new BackupError('BACKUP_RAG_APPLICATION_INPUT_INVALID');
  backupJsonString(source);const mappings=mappingsSchema.parse(source.collections),byId=new Map(mappings.map(row=>[row.id,row]));if(byId.size!==mappings.length)throw new BackupError('BACKUP_RAG_APPLICATION_MAPPING_INVALID');
  for(const row of mappings)await ordinary(join(source.root,'resources'),row.restoredRoot);
  const data=join(home,'dsh-zhen');await ordinary(root,data);await ordinary(source.root,source.backendState,true);
  const backendStat=await lstat(source.backendState,{bigint:true});if(backendStat.size>32768n)throw new BackupError('BACKUP_RAG_APPLICATION_LIMIT');const backendBytes=Buffer.alloc(Number(backendStat.size)),handle=await open(source.backendState,'r');
  try{if(identity(await handle.stat({bigint:true}))!==identity(backendStat))throw new BackupError('BACKUP_SOURCE_CHANGED');let at=0;while(at<backendBytes.length){options.signal?.throwIfAborted();const count=(await handle.read(backendBytes,at,backendBytes.length-at,at)).bytesRead;if(!count)throw new BackupError('BACKUP_SOURCE_CHANGED');at+=count;}if(identity(await handle.stat({bigint:true}))!==identity(backendStat)||identity(await lstat(source.backendState,{bigint:true}))!==identity(backendStat))throw new BackupError('BACKUP_SOURCE_CHANGED');}finally{await handle.close();}
  const backend=backendSchema.parse(parseBackupJson(backendBytes));
  const database=source.database?join(data,'knowledge.sqlite'):null,settings=join(data,'rag-backend.json'),review=join(data,'rag-backend-recovery.json'),created:string[]=[];
  const result:KnowledgeApplicationReceipt={schema:'dsh-zhen-knowledge-application-v1',present:!!source.database,database,collections:[],historicalGrants:0,backend:settings,backendReview:review,backendWasValid:backend.persisted.valid,reviewRequired:true,activated:false,agentAccessRestored:false};
  let lease:Awaited<ReturnType<ReturnType<typeof readonlyKnowledgeSource>['backupLease']>>|undefined,store:KnowledgeStore|undefined,complete=false;
  try{
    if(source.database&&database){await ordinary(source.root,source.database,true);lease=await readonlyKnowledgeSource(source.database).backupLease(options);const expected=new Set(byId.keys());
      // Complete mapping validation precedes target creation or a single row write.
      for(const row of lease.rows('collections')){const mapped=byId.get(String(row.id));if(!mapped||row.root!==mapped.originRoot||!Number.isSafeInteger(Number(row.epoch)+1))throw new BackupError('BACKUP_RAG_APPLICATION_MAPPING_INVALID');expected.delete(mapped.id);result.collections.push({id:mapped.id,project:String(row.project),root:mapped.restoredRoot,previousEpoch:Number(row.epoch),epoch:Number(row.epoch)+1});}
      if(expected.size)throw new BackupError('BACKUP_RAG_APPLICATION_MAPPING_INVALID');
      result.historicalGrants=lease.tables.find(row=>row.table==='session_grants')!.rows;
      const file=await open(database,'wx',0o600);created.push(database);await file.close();store=new KnowledgeStore(database);
      const frozen=lease;
      async function* rebound():AsyncGenerator<KnowledgeBackupRow>{for(const table of frozen.tables)for(const input of frozen.rows(table.table)){options.signal?.throwIfAborted();const row=table.table==='collections'?{...input,root:byId.get(String(input.id))!.restoredRoot,epoch:Number(input.epoch)+1,agent_enabled:0}:input;yield {table:table.table,row};}}
      await store.restoreBackupRows(rebound(),lease.sequence,options.signal);lease.assertCurrent();store.close();store=undefined;
    }else if(mappings.length)throw new BackupError('BACKUP_RAG_APPLICATION_MAPPING_INVALID');
    options.signal?.throwIfAborted();await writeFile(review,backendBytes,{flag:'wx',mode:0o600});created.push(review);
    await writeFile(settings,backupJsonString({...backend.settings,enabled:false})+'\n',{flag:'wx',mode:0o600});created.push(settings);
    options.signal?.throwIfAborted();complete=true;return result;
  }finally{
    try{store?.close();await lease?.close();}finally{if(!complete)for(const file of created.toReversed()){await ordinary(root,file,true);await unlink(file);}}
  }
}
