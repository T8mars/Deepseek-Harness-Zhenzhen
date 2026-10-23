import {randomUUID} from 'node:crypto';
import {lstat,mkdir,opendir,realpath} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {BackupError} from './backup-archive.ts';
import {writeComposedBackup,restoreComposedBackup} from './backup-composition.ts';
import type {BackupAdapters} from './backup-composition.ts';
import {backupComponentSchema,backupCreateSchema,backupLimitations} from './backup-center-schema.ts';
import type {BackupCreate,BackupInfo,BackupFiles,BackupJob} from './backup-center-schema.ts';
import {verifyRecoveryCandidate} from './recovery-candidate.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';
import type {RecoveryPreview} from './recovery-schema.ts';
import type {RecoveryCatalogView} from './recovery-schema.ts';
import {RecoveryCatalog,recoveryCursor,encodeRecoveryCursor,assertRecoveryReceipt} from './recovery-catalog.ts';
import type {RecoveryCatalogRecord} from './recovery-catalog.ts';
import {inspectRecoveryLayout} from './recovery-layout.ts';
import type {RecoveryPlan} from './recovery-layout-schema.ts';
import type {ApplicationRestoreOptions} from './restore-application.ts';
import {inspectRecoveryProjects,resolveRecoveryProjectBindings} from './recovery-projects.ts';
import {projectAwareRestoreSchema} from './recovery-project-schema.ts';
import type {RecoveryProjects,ProjectAwareRestore} from './recovery-project-schema.ts';

type Work={view:BackupJob;controller:AbortController;done:Promise<void>;candidate?:RecoveryBaseline;};
const running=(view:BackupJob)=>!['succeeded','failed','cancelled'].includes(view.phase);
/** Owner-facing local jobs only. No Agent tool, credential access, execution,
 * network request, raw error text, password storage or automatic activation. */
export class BackupCenter {
  private readonly jobs=new Map<string,Work>();
  private closed=false;
  private readonly application?:ApplicationRestoreOptions;
  private readonly catalog?:RecoveryCatalog;
  private inspection?:{id:string;controller:AbortController;promise:Promise<RecoveryPreview>};
  private planInspection?:{id:string;controller:AbortController;promise:Promise<RecoveryPlan>};
  private projectInspection?:{id:string;cursor:string;controller:AbortController;promise:Promise<RecoveryProjects>};
  private registrations=0;
  private registrationId?:string;
  constructor(private readonly folder:string,private readonly adapters:()=>BackupAdapters,options:{catalogFile?:string;application?:ApplicationRestoreOptions}={}){this.application=options.application?{...options.application}:undefined;if(options.catalogFile)this.catalog=new RecoveryCatalog(options.catalogFile);}
  info():BackupInfo{const available=this.adapters();return{folder:this.folder,components:backupComponentSchema.options.map(id=>({id,available:!!available[id]&&available[id]!.available!==false})),limitations:[...backupLimitations],jobs:[...this.jobs.values()].map(job=>structuredClone(job.view))};}
  status(id:string):BackupJob{const job=this.jobs.get(id);if(!job)throw new BackupError('BACKUP_JOB_NOT_FOUND');return structuredClone(job.view);}
  cancel(id:string):void{const job=this.jobs.get(id);if(!job&&this.inspection?.id!==id&&this.planInspection?.id!==id&&this.projectInspection?.id!==id&&!this.catalog?.get(id))throw new BackupError('BACKUP_JOB_NOT_FOUND');if(job&&running(job.view))job.controller.abort();if(this.inspection?.id===id)this.inspection.controller.abort();if(this.planInspection?.id===id)this.planInspection.controller.abort();if(this.projectInspection?.id===id)this.projectInspection.controller.abort();}
  async close():Promise<void>{this.closed=true;const pending:Promise<unknown>[]=[];for(const job of this.jobs.values()){job.controller.abort();pending.push(job.done);}if(this.inspection){this.inspection.controller.abort();pending.push(this.inspection.promise);}if(this.planInspection){this.planInspection.controller.abort();pending.push(this.planInspection.promise);}if(this.projectInspection){this.projectInspection.controller.abort();pending.push(this.projectInspection.promise);}await Promise.allSettled(pending);}
  private candidate(id:string):RecoveryBaseline{const job=this.jobs.get(id);if(job?.candidate)return job.candidate;if(job)throw new BackupError('BACKUP_CANDIDATE_NOT_READY');const record=this.catalog?.get(id);if(!record)throw new BackupError('BACKUP_JOB_NOT_FOUND');return record.baseline;}
  private preview(value:RecoveryBaseline):RecoveryPreview{return{root:value.root,createdAt:value.createdAt,checkedAt:null,integrity:'at-creation',files:value.files,bytes:value.bytes,links:value.links,components:structuredClone(value.components),activated:false,readyForActivation:false,wholeApplicationRestore:false};}
  candidateSnapshot(id:string):RecoveryPreview{return this.preview(this.candidate(id));}
  async candidateVerify(id:string):Promise<RecoveryPreview>{
    if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');if(this.planInspection||this.projectInspection)throw new BackupError('BACKUP_BUSY');const baseline=this.candidate(id);if(this.registrations&&this.registrationId!==id)throw new BackupError('BACKUP_BUSY');if(!this.inspection){if([...this.jobs.values()].some(row=>running(row.view)))throw new BackupError('BACKUP_BUSY');const controller=new AbortController(),promise=(async()=>{try{await assertRecoveryReceipt(baseline);}catch(error){controller.signal.throwIfAborted();return{...this.preview(baseline),checkedAt:new Date().toISOString(),integrity:(error instanceof BackupError&&error.code==='BACKUP_CANDIDATE_CHANGED'?'changed':'unavailable') as RecoveryPreview['integrity']};}return verifyRecoveryCandidate(baseline,{signal:controller.signal});})();this.inspection={id,controller,promise};}if(this.inspection.id!==id)throw new BackupError('BACKUP_BUSY');const current=this.inspection;
    try{return structuredClone(await current.promise);}catch{if(current.controller.signal.aborted)throw new BackupError('BACKUP_CANDIDATE_CANCELLED');throw new BackupError('BACKUP_CANDIDATE_READ_FAILED');}finally{if(this.inspection===current)this.inspection=undefined;}
  }
  async candidatePlan(id:string):Promise<RecoveryPlan>{
    if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');const baseline=this.candidate(id);
    if(this.registrations||this.inspection||this.projectInspection||[...this.jobs.values()].some(row=>running(row.view)))throw new BackupError('BACKUP_BUSY');
    if(!this.planInspection){const controller=new AbortController(),promise=(async()=>{await assertRecoveryReceipt(baseline);const plan=await inspectRecoveryLayout(baseline,controller.signal);controller.signal.throwIfAborted();return plan;})();this.planInspection={id,controller,promise};}
    if(this.planInspection.id!==id)throw new BackupError('BACKUP_BUSY');const current=this.planInspection;
    try{return structuredClone(await current.promise);}catch(error){if(current.controller.signal.aborted)throw new BackupError('BACKUP_CANDIDATE_CANCELLED');if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');}finally{if(this.planInspection===current)this.planInspection=undefined;}
  }
  async candidateProjects(id:string,cursor=''):Promise<RecoveryProjects>{
    if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');const baseline=this.candidate(id);if(this.registrations||this.inspection||this.planInspection||[...this.jobs.values()].some(row=>running(row.view)))throw new BackupError('BACKUP_BUSY');
    if(!this.projectInspection){const controller=new AbortController(),promise=(async()=>{await assertRecoveryReceipt(baseline);return inspectRecoveryProjects(baseline,cursor,controller.signal);})();this.projectInspection={id,cursor,controller,promise};}
    if(this.projectInspection.id!==id||this.projectInspection.cursor!==cursor)throw new BackupError('BACKUP_BUSY');const current=this.projectInspection;
    try{return structuredClone(await current.promise);}catch(error){if(current.controller.signal.aborted)throw new BackupError('BACKUP_CANDIDATE_CANCELLED');if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROJECT_INVENTORY_FAILED');}finally{if(this.projectInspection===current)this.projectInspection=undefined;}
  }
  candidateList(cursorValue=''):RecoveryCatalogView{
    const cursor=recoveryCursor(cursorValue),after=(row:RecoveryCatalogRecord)=>!cursor||row.baseline.createdAt<cursor.createdAt||row.baseline.createdAt===cursor.createdAt&&row.id<cursor.id;
    let catalog:RecoveryCatalogView['catalog']=this.catalog?'available':'memory-only',error:string|null=null,records:RecoveryCatalogRecord[]=[];
    try{records=this.catalog?.page(cursor)??[];}catch{catalog='unavailable';error='BACKUP_CANDIDATE_CATALOG_FAILED';}
    const values=new Map(records.map(row=>[row.id,{record:row,persisted:true}]));for(const job of this.jobs.values())if(job.candidate&&after({id:job.view.id,baseline:job.candidate})&&!values.has(job.view.id))values.set(job.view.id,{record:{id:job.view.id,baseline:job.candidate},persisted:false});
    const sorted=[...values.values()].sort((a,b)=>b.record.baseline.createdAt.localeCompare(a.record.baseline.createdAt)||b.record.id.localeCompare(a.record.id)),page=sorted.slice(0,20);
    return{catalog,error,items:page.map(({record,persisted})=>({id:record.id,root:record.baseline.root,createdAt:record.baseline.createdAt,components:record.baseline.components.map(row=>row.kind),persisted})),nextCursor:sorted.length>20?encodeRecoveryCursor(page.at(-1)!.record):null};
  }
  candidateForget(id:string):void{if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');if(this.registrations||this.inspection||this.planInspection||this.projectInspection||[...this.jobs.values()].some(row=>running(row.view)))throw new BackupError('BACKUP_BUSY');if(this.jobs.has(id)&&!this.jobs.get(id)!.candidate)throw new BackupError('BACKUP_CANDIDATE_NOT_READY');this.catalog?.forget(id);this.jobs.delete(id);}
  async candidateRegister(id:string):Promise<BackupJob>{
    if(!this.catalog)throw new BackupError('BACKUP_CANDIDATE_CATALOG_FAILED');if(this.planInspection||this.projectInspection)throw new BackupError('BACKUP_BUSY');if(this.registrations&&this.registrationId!==id)throw new BackupError('BACKUP_BUSY');this.registrations++;this.registrationId=id;
    try{const baseline=this.candidate(id),verified=await this.candidateVerify(id);if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');if(verified.integrity!=='unchanged')throw new BackupError('BACKUP_CANDIDATE_CHANGED');this.catalog.put({id,baseline});const job=this.jobs.get(id);if(job){job.view.phase='succeeded';job.view.error=null;return structuredClone(job.view);}return{id,operation:'restore',phase:'succeeded',component:null,completed:baseline.components.length,total:baseline.components.length,components:baseline.components.map(row=>row.kind),output:baseline.root,bytes:null,sha256:null,error:null,activated:false,wholeApplicationRestore:false};}finally{this.registrations--;if(!this.registrations)this.registrationId=undefined;}
  }
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
  startRestore(input:ProjectAwareRestore):BackupJob{const request=projectAwareRestoreSchema.parse(input),reference=request.projects?this.candidate(request.projects.candidateId):undefined;return this.start(request.id,'restore',[],async(job,adapters,progress)=>{
    this.catalog?.get(request.id);
    if(!isAbsolute(request.folder)||!isAbsolute(request.target))throw new BackupError('BACKUP_PATH_INVALID');const source=join(await realpath(request.folder),request.name),target=await realpath(request.target);
    if(reference&&!this.application)throw new BackupError('BACKUP_PROJECT_ENVIRONMENT_REQUIRED');const sessionDirectories=reference&&request.projects?await resolveRecoveryProjectBindings(reference,request.projects,job.controller.signal):undefined;
    const candidate=await restoreComposedBackup(source,request.password,target,adapters,{signal:job.controller.signal,application:this.application&&sessionDirectories?{...this.application,sessionDirectories,...request.projects?.continuations?{projectContinuations:true}:{}}:this.application},progress);job.view.output=candidate.root;job.view.components=candidate.components;job.candidate=candidate.verification;
    try{this.catalog?.put({id:request.id,baseline:candidate.verification});}catch{throw new BackupError('BACKUP_CANDIDATE_CATALOG_FAILED');}
  });}
  private start(id:string,operation:BackupJob['operation'],components:BackupJob['components'],run:(job:Work,adapters:BackupAdapters,progress:(phase:'preparing'|'capturing'|'verifying'|'restoring',component:BackupJob['component'],completed:number,total:number)=>void)=>Promise<void>):BackupJob{
    if(this.closed)throw new BackupError('BACKUP_CENTER_CLOSED');if(this.jobs.has(id))throw new BackupError('BACKUP_REQUEST_REPLAY');if(this.registrations||this.inspection||this.planInspection||this.projectInspection||[...this.jobs.values()].some(job=>running(job.view)))throw new BackupError('BACKUP_BUSY');
    try{if(this.catalog?.get(id))throw new BackupError('BACKUP_REQUEST_REPLAY');}catch(error){if(error instanceof BackupError&&error.code==='BACKUP_REQUEST_REPLAY')throw error;}
    while(this.jobs.size>=16)this.jobs.delete(this.jobs.keys().next().value!);
    const adapters=this.adapters(),job:Work={view:{id,operation,phase:'preparing',component:null,completed:0,total:components.length,components:[...components],output:null,bytes:null,sha256:null,error:null,activated:false,wholeApplicationRestore:false},controller:new AbortController(),done:Promise.resolve()};this.jobs.set(id,job);
    const progress=(phase:'preparing'|'capturing'|'verifying'|'restoring',component:BackupJob['component'],completed:number,total:number)=>{job.view.phase=phase;job.view.component=component;job.view.completed=completed;job.view.total=total;};
    job.done=Promise.resolve().then(()=>run(job,adapters,progress)).then(()=>{job.view.phase='succeeded';job.view.component=null;job.view.completed=job.view.total;},error=>{job.view.phase=job.controller.signal.aborted?'cancelled':'failed';job.view.error=error instanceof BackupError&&/^BACKUP_[A-Z_]{1,64}$/.test(error.code)?error.code:'BACKUP_OPERATION_FAILED';if(!job.candidate)job.view.output=null;});
    return structuredClone(job.view);
  }
}
