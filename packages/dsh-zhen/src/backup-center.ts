import {randomUUID} from 'node:crypto';
import {lstat,mkdir,opendir,realpath} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {BackupError} from './backup-archive.ts';
import {writeComposedBackup,restoreComposedBackup} from './backup-composition.ts';
import type {BackupAdapters} from './backup-composition.ts';
import {backupComponentSchema,backupCreateSchema,backupRestoreSchema,backupLimitations} from './backup-center-schema.ts';
import type {BackupCreate,BackupRestore,BackupInfo,BackupFiles,BackupJob} from './backup-center-schema.ts';

type Work={view:BackupJob;controller:AbortController;done:Promise<void>};
const running=(view:BackupJob)=>!['succeeded','failed','cancelled'].includes(view.phase);
/** Owner-facing local jobs only. No Agent tool, credential access, execution,
 * network request, raw error text, password storage or automatic activation. */
export class BackupCenter {
  private readonly jobs=new Map<string,Work>();
  private closed=false;
  constructor(private readonly folder:string,private readonly adapters:()=>BackupAdapters){}
  info():BackupInfo{const available=this.adapters();return{folder:this.folder,components:backupComponentSchema.options.map(id=>({id,available:!!available[id]&&available[id]!.available!==false})),limitations:[...backupLimitations],jobs:[...this.jobs.values()].map(job=>structuredClone(job.view))};}
  status(id:string):BackupJob{const job=this.jobs.get(id);if(!job)throw new BackupError('BACKUP_JOB_NOT_FOUND');return structuredClone(job.view);}
  cancel(id:string):void{const job=this.jobs.get(id);if(!job)throw new BackupError('BACKUP_JOB_NOT_FOUND');if(running(job.view))job.controller.abort();}
  async close():Promise<void>{this.closed=true;for(const job of this.jobs.values())if(running(job.view))job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(job=>job.done));}
  async files(folder:string):Promise<BackupFiles>{
    if(!isAbsolute(folder))throw new BackupError('BACKUP_PATH_INVALID');let actual:string;
    try{actual=await realpath(folder);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&folder===this.folder)return{folder,files:[],truncated:false};throw new BackupError('BACKUP_FOLDER_UNAVAILABLE');}
    const files:BackupFiles['files']=[];let truncated=false,seen=0;
    try{const directory=await opendir(actual);for await(const row of directory){if(++seen>5000){truncated=true;break;}if(!row.isFile()||!/^dsh-zhen-[A-Za-z0-9.-]+\.dshzbackup$/.test(row.name))continue;if(files.length===100){truncated=true;break;}const stat=await lstat(join(actual,row.name));if(stat.isFile()&&!stat.isSymbolicLink())files.push({name:row.name,bytes:stat.size,modified:stat.mtimeMs});}}catch{throw new BackupError('BACKUP_FOLDER_UNAVAILABLE');}
    files.sort((a,b)=>b.modified-a.modified||a.name.localeCompare(b.name));return{folder:actual,files,truncated};
  }
  startBackup(input:BackupCreate):BackupJob{const request=backupCreateSchema.parse(input);return this.start(request.id,'backup',request.components,async(job,adapters,progress)=>{
    if(!isAbsolute(request.folder))throw new BackupError('BACKUP_PATH_INVALID');if(request.folder===this.folder)await mkdir(this.folder,{recursive:true,mode:0o700});const folder=await realpath(request.folder),file=join(folder,'dsh-zhen-'+randomUUID()+'.dshzbackup');
    const receipt=await writeComposedBackup(file,request.password,request.components,adapters,{signal:job.controller.signal},progress);job.view.output=file;job.view.bytes=receipt.bytes;job.view.sha256=receipt.sha256;
  });}
  startRestore(input:BackupRestore):BackupJob{const request=backupRestoreSchema.parse(input);return this.start(request.id,'restore',[],async(job,adapters,progress)=>{
    if(!isAbsolute(request.folder)||!isAbsolute(request.target))throw new BackupError('BACKUP_PATH_INVALID');const source=join(await realpath(request.folder),request.name),target=await realpath(request.target);
    const candidate=await restoreComposedBackup(source,request.password,target,adapters,{signal:job.controller.signal},progress);job.view.output=candidate.root;job.view.components=candidate.components;
  });}
  private start(id:string,operation:BackupJob['operation'],components:BackupJob['components'],run:(job:Work,adapters:BackupAdapters,progress:(phase:'preparing'|'capturing'|'verifying'|'restoring',component:BackupJob['component'],completed:number,total:number)=>void)=>Promise<void>):BackupJob{
    if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');if(this.jobs.has(id))throw new BackupError('BACKUP_REQUEST_REPLAY');if([...this.jobs.values()].some(job=>running(job.view)))throw new BackupError('BACKUP_BUSY');
    while(this.jobs.size>=16)this.jobs.delete(this.jobs.keys().next().value!);
    const adapters=this.adapters(),job:Work={view:{id,operation,phase:'preparing',component:null,completed:0,total:components.length,components:[...components],output:null,bytes:null,sha256:null,error:null,activated:false,wholeApplicationRestore:false},controller:new AbortController(),done:Promise.resolve()};this.jobs.set(id,job);
    const progress=(phase:'preparing'|'capturing'|'verifying'|'restoring',component:BackupJob['component'],completed:number,total:number)=>{job.view.phase=phase;job.view.component=component;job.view.completed=completed;job.view.total=total;};
    job.done=Promise.resolve().then(()=>run(job,adapters,progress)).then(()=>{job.view.phase='succeeded';job.view.component=null;job.view.completed=job.view.total;},error=>{job.view.phase=job.controller.signal.aborted?'cancelled':'failed';job.view.error=error instanceof BackupError&&/^BACKUP_[A-Z_]{1,64}$/.test(error.code)?error.code:'BACKUP_OPERATION_FAILED';job.view.output=null;});
    return structuredClone(job.view);
  }
}
