import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,realpath,writeFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {z} from 'zod';
import {credentialKey} from '@deepseek-ai/dsh-credentials';
import type {CredentialProvider,CredentialRecord} from '@deepseek-ai/dsh-credentials';
import type {BackupCenter} from './backup-center.ts';
import {BackupError} from './backup-archive.ts';
import {inspectRecoveryApplication,adoptRecoveryApplication,recoveryApplicationLaunchPatches,assertRecoveryApplicationLaunch} from './recovery-application-config.ts';
import {backupJsonString} from './backup-data.ts';
import type {RecoveryApplicationConfig} from './recovery-application-config.ts';
import {queryRecoveryRuntime,recoveryRuntimeInput,recoveryRuntimeState} from './recovery-application-channel.ts';
import type {RecoveryRuntimeState} from './recovery-application-channel.ts';
import {recoveryApplicationStatusSchema,recoveryApplicationReviewSchema,recoveryApplicationReviewRequest,recoveryApplicationOpenRequest,recoveryApplicationControlRequest,recoveryApplicationPhase} from './recovery-application-schema.ts';
import type {RecoveryApplicationStatus,RecoveryApplicationReview,RecoveryApplicationReviewRequest,RecoveryApplicationOpenRequest,RecoveryApplicationControlRequest} from './recovery-application-schema.ts';
import {mcpChildEnvironment} from './mcp-market.ts';

const path=z.string().min(1).max(4096),hash=z.string().regex(/^[a-f0-9]{64}$/),name=z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
const adoptedSchema=z.object({profile:name,home:path,agentsHome:path,cwd:path,bundle:z.string().min(1).max(200),bundleDirectory:path,programDigest:hash,requiresZhen:z.boolean(),bundleDigest:hash}).strict();
const grantSchema=z.object({schema:z.literal('dsh-zhen-recovery-application-v1'),parentHome:path,candidateId:z.uuid(),root:path,baseline:hash,profile:name,title:z.string().max(255),review:hash,requestId:z.uuid(),requests:z.array(z.uuid()).min(1).max(1024),execution:z.uuid(),secret:hash,phase:recoveryApplicationPhase,pid:z.number().int().positive().nullable(),port:z.number().int().min(1).max(65535).nullable(),ready:z.boolean(),browserRequested:z.boolean(),error:z.string().regex(/^BACKUP_[A-Z_]+$/).nullable(),adopted:adoptedSchema.nullable(),startedAt:z.iso.datetime()}).strict();
type Grant=z.infer<typeof grantSchema>;
const key=(id:string)=>credentialKey('dsh-zhen','recovery-'+z.uuid().parse(id).toLowerCase());
function failure(code:string):never{throw new BackupError(code);}
function decode(value:CredentialRecord|undefined,parentHome:string,id:string):Grant|undefined{if(value===undefined)return;const parsed=value.kind==='grant'?grantSchema.safeParse(value.payload):undefined;if(!parsed?.success||parsed.data.parentHome!==parentHome||parsed.data.candidateId!==id)failure('BACKUP_APPLICATION_RECORD_INVALID');return parsed.data;}
function empty(candidateId:string):RecoveryApplicationStatus{return{candidateId,consumed:false,requestId:null,execution:null,profile:null,title:null,phase:null,ready:false,pid:null,port:null,browserRequested:false,canReopen:false,error:null};}
function publicStatus(record:Grant,override:Partial<RecoveryApplicationStatus>={}):RecoveryApplicationStatus{return recoveryApplicationStatusSchema.parse({candidateId:record.candidateId,consumed:true,requestId:record.requestId,execution:record.execution,profile:record.profile,title:record.title,phase:record.phase==='exited'&&record.error?'failed':record.phase,ready:record.ready,pid:record.pid,port:record.port,browserRequested:record.browserRequested,canReopen:record.phase==='exited'&&!!record.adopted,error:record.error,...override});}
/** Owner UI lifecycle. Approval and IPC secrets live only in ctx.credentials;
 * this service never reads/writes credential files, emits Agent tools, transfers
 * old grants, logs child output, or infers shutdown from an observation timeout. */
export class RecoveryApplication {
 private closed=false;
 private readonly plans=new Map<string,{plan:RecoveryApplicationConfig;at:number}>();
 private readonly jobs=new Map<string,{controller:AbortController;done:Promise<unknown>}>();
 private readonly children=new Map<string,ChildProcess>();
 constructor(private readonly parentHome:string,private readonly installAnchor:string,private readonly credentials:()=>CredentialProvider,private readonly center:BackupCenter,private readonly worker=fileURLToPath(new URL('./recovery-application-runtime.js',import.meta.url))){this.parentHome=realpathSync.native(parentHome);}
 private active():void{if(this.closed)failure('BACKUP_CENTER_CLOSED');}
 private async writable(id:string):Promise<void>{try{if((await this.credentials().describeRecord(key(id))).writable)return;}catch{/* Fail before recording intent or modifying the application copy. */}failure('BACKUP_APPLICATION_AUTHORIZATION_UNAVAILABLE');}
 private async read(id:string):Promise<Grant|undefined>{return decode(await this.credentials().readRecord(key(id)),this.parentHome,id);}
 private async change(id:string,execution:string,change:(current:Grant)=>Grant):Promise<void>{await this.credentials().modifyRecord(key(id),async current=>{const value=decode(current,this.parentHome,id);if(!value||value.execution!==execution)return current;return{kind:'grant',payload:grantSchema.parse(change(value))};});}
 private async state(record:Grant,state:RecoveryRuntimeState):Promise<void>{await this.change(record.candidateId,record.execution,current=>({...current,phase:state.phase,pid:state.pid,port:state.port,ready:state.ready,browserRequested:state.browserRequested,error:state.error}));}
 async status(candidateId:string):Promise<RecoveryApplicationStatus>{
  this.active();z.uuid().parse(candidateId);const record=await this.read(candidateId);if(!record)return empty(candidateId);
  if(record.pid!==null&&record.phase!=='exited'){
   const current=await queryRecoveryRuntime(record.execution,record.secret);if(current&&current.pid===record.pid){await this.state(record,current);return publicStatus({...record,...current});}
   let alive=true;try{process.kill(record.pid,0);}catch(error){alive=(error as NodeJS.ErrnoException).code!=='ESRCH';}
   if(!alive){await this.change(candidateId,record.execution,value=>({...value,phase:'exited',ready:false}));return publicStatus({...record,phase:'exited',ready:false});}
   return publicStatus(record,{phase:'unknown',ready:false,canReopen:false,error:'BACKUP_APPLICATION_STATE_UNKNOWN'});
  }
  if(record.pid===null&&record.phase!=='exited'&&record.phase!=='failed'&&!this.jobs.has(record.execution))return publicStatus(record,{phase:'unknown',ready:false,canReopen:false,error:'BACKUP_APPLICATION_STATE_UNKNOWN'});
  return publicStatus(record);
 }
 async review(input:RecoveryApplicationReviewRequest):Promise<RecoveryApplicationReview>{
  this.active();const request=recoveryApplicationReviewRequest.parse(input),status=await this.status(request.candidateId),record=await this.read(request.candidateId);
  if(record)return recoveryApplicationReviewSchema.parse({candidateId:request.candidateId,status,profiles:[{name:record.profile,title:record.title,available:true}],selected:record.profile,review:record.review,programs:[],totalPrograms:0,unresolvedPrograms:0,page:0,nextPage:null,canOpen:false});
  await this.writable(request.candidateId);
  let cached=this.plans.get(request.candidateId);
  if(request.review){if(!cached||cached.plan.digest!==request.review||request.profile&&cached.plan.profile!==request.profile||Date.now()-cached.at>15*60*1000)failure('BACKUP_APPLICATION_REVIEW_CHANGED');}
  else{
   if(request.page!==0)failure('BACKUP_APPLICATION_REVIEW_CHANGED');const plan=await this.center.applicationOperation(request.candidateId,(baseline,signal)=>inspectRecoveryApplication(baseline,request.profile,this.installAnchor,signal));this.active();cached={plan,at:Date.now()};this.plans.set(request.candidateId,cached);if(this.plans.size>32)this.plans.delete(this.plans.keys().next().value!);
  }
  const plan=cached!.plan,start=request.page*20;if(start>=plan.programs.length&&request.page>0)failure('BACKUP_APPLICATION_REVIEW_CHANGED');
  return recoveryApplicationReviewSchema.parse({candidateId:request.candidateId,status,profiles:plan.profiles,selected:plan.profile,review:plan.digest,programs:plan.programs.slice(start,start+20),totalPrograms:plan.programs.length,unresolvedPrograms:plan.unresolvedPrograms,page:request.page,nextPage:start+20<plan.programs.length?request.page+1:null,canOpen:plan.unresolvedPrograms===0});
 }
 async open(input:RecoveryApplicationOpenRequest):Promise<RecoveryApplicationStatus>{
  this.active();const request=recoveryApplicationOpenRequest.parse(input),existing=await this.read(request.candidateId);
  if(existing){const status=await this.status(request.candidateId);if(existing.requests.includes(request.requestId))return status;if(!status.canReopen||existing.profile!==request.profile||existing.review!==request.review)failure('BACKUP_APPLICATION_ALREADY_OPENED');await this.writable(request.candidateId);return this.reopen(request);}
  await this.writable(request.candidateId);
  const cached=this.plans.get(request.candidateId);if(!cached||cached.plan.profile!==request.profile||cached.plan.digest!==request.review||Date.now()-cached.at>15*60*1000)failure('BACKUP_APPLICATION_REVIEW_CHANGED');if(cached.plan.unresolvedPrograms)failure('BACKUP_APPLICATION_PROGRAM_UNAVAILABLE');
  const controller=new AbortController();let accepted!:()=>void,refused!:(error:unknown)=>void;const acknowledgment=new Promise<void>((resolve,reject)=>{accepted=resolve;refused=reject;});
  const record:Grant={schema:'dsh-zhen-recovery-application-v1',parentHome:this.parentHome,candidateId:request.candidateId,root:cached.plan.root,baseline:cached.plan.baseline.sha256,profile:cached.plan.profile,title:cached.plan.originName.slice(0,255),review:cached.plan.digest,requestId:request.requestId,requests:[request.requestId],execution:randomUUID(),secret:randomBytes(32).toString('hex'),phase:'preparing',pid:null,port:null,ready:false,browserRequested:false,error:null,adopted:null,startedAt:new Date().toISOString()};
  let claimed=false;
  const done=this.center.applicationOperation(request.candidateId,async(baseline,signal)=>{
   if(baseline.root!==record.root||baseline.sha256!==record.baseline)failure('BACKUP_APPLICATION_REVIEW_CHANGED');this.active();
   await this.credentials().modifyRecord(key(request.candidateId),async current=>{const prior=decode(current,this.parentHome,request.candidateId);if(prior)failure('BACKUP_APPLICATION_ALREADY_OPENED');claimed=true;return{kind:'grant',payload:record};});accepted();
   const adopted=await adoptRecoveryApplication(cached.plan,request.review,AbortSignal.any([controller.signal,signal]));this.active();controller.signal.throwIfAborted();signal.throwIfAborted();
   const bundleDigest=createHash('sha256').update(await readFile(join(adopted.bundleDirectory,'cordis.patch.yml'))).digest('hex');
   const ready={...adopted,bundleDigest};await this.change(request.candidateId,record.execution,current=>({...current,adopted:ready,phase:'starting'}));await this.launch({...record,adopted:ready,phase:'starting'},request.openBrowser);
  }).catch(async error=>{refused(error);if(claimed)try{await this.change(request.candidateId,record.execution,current=>({...current,phase:'failed',ready:false,error:controller.signal.aborted?'BACKUP_APPLICATION_CANCELLED':error instanceof BackupError?error.code:'BACKUP_APPLICATION_PREPARE_FAILED'}));}catch{/* The retained credential intent remains queryable; never spawn again here. */}}).finally(()=>{this.jobs.delete(record.execution);});
  this.jobs.set(record.execution,{controller,done});await acknowledgment;return publicStatus(record);
 }
 private async reopen(request:RecoveryApplicationOpenRequest):Promise<RecoveryApplicationStatus>{
  let record!:Grant;await this.credentials().modifyRecord(key(request.candidateId),async current=>{const prior=decode(current,this.parentHome,request.candidateId);if(!prior||prior.phase!=='exited'||!prior.adopted||prior.requests.includes(request.requestId))failure('BACKUP_APPLICATION_ALREADY_OPENED');if(prior.requests.length>=1024)failure('BACKUP_APPLICATION_REQUEST_LIMIT');record={...prior,requestId:request.requestId,requests:[...prior.requests,request.requestId],execution:randomUUID(),secret:randomBytes(32).toString('hex'),phase:'starting',pid:null,port:null,ready:false,browserRequested:false,error:null,startedAt:new Date().toISOString()};return{kind:'grant',payload:record};});
  try{await this.launch(record,request.openBrowser);}catch(error){await this.change(record.candidateId,record.execution,current=>({...current,phase:'failed',error:error instanceof BackupError?error.code:'BACKUP_APPLICATION_START_FAILED'}));}return this.status(request.candidateId);
 }
 private async launch(record:Grant,openBrowser:boolean):Promise<void>{
  this.active();if(!record.adopted)failure('BACKUP_APPLICATION_ADOPTION_FAILED');const adopted=record.adopted,worker=await realpath(this.worker);
  await assertRecoveryApplicationLaunch(record.root,adopted);
  const installAnchor=await realpath(this.installAnchor),cli=join(dirname(installAnchor),'lib','bin.js');
  if(createHash('sha256').update(await readFile(join(adopted.bundleDirectory,'cordis.patch.yml'))).digest('hex')!==adopted.bundleDigest)failure('BACKUP_APPLICATION_REVIEW_CHANGED');
  const input=recoveryRuntimeInput.parse({schema:'dsh-zhen-recovery-runtime-v1',execution:record.execution,secret:record.secret,root:record.root,home:adopted.home,agentsHome:adopted.agentsHome,cwd:adopted.cwd,installAnchor,profile:adopted.profile,bundleDirectory:adopted.bundleDirectory,bundleDigest:adopted.bundleDigest,requiresZhen:adopted.requiresZhen,openBrowser}),{secret,...configuration}=input;
  const patches=await recoveryApplicationLaunchPatches(adopted,installAnchor,{id:'dsh-zhen-recovery-runtime',name:pathToFileURL(worker).href,config:configuration}),overlay=join(adopted.bundleDirectory,'launch-'+record.execution+'.json');await writeFile(overlay,backupJsonString(patches)+'\n',{flag:'wx',mode:0o600});
  const child=spawn(process.execPath,[cli,'--profile',adopted.profile,'--patch',overlay,'--host','127.0.0.1','--port','0','--no-open'],{cwd:adopted.cwd,env:mcpChildEnvironment({DSH_HOME:adopted.home,DSH_AGENTS_HOME:adopted.agentsHome,DSH_TELEMETRY_DISABLED:'1'}),windowsHide:true,detached:true,stdio:['ignore','ignore','ignore','ipc']});this.children.set(record.execution,child);
  let initial=false,acceptPid!:()=>void;const pidRecorded=new Promise<void>(resolve=>{acceptPid=resolve;});
  child.on('message',message=>{const hello=z.object({kind:z.literal('recovery/init'),execution:z.literal(record.execution)}).strict().safeParse(message);if(hello.success&&!initial){initial=true;void pidRecorded.then(()=>{if(child.connected)child.send({execution:record.execution,secret},()=>{});});return;}const parsed=z.object({execution:z.literal(record.execution),state:recoveryRuntimeState}).strict().safeParse(message);if(parsed.success)void this.state(record,parsed.data.state).catch(()=>{});});
  child.once('close',code=>{this.children.delete(record.execution);void this.change(record.candidateId,record.execution,current=>({...current,phase:'exited',ready:false,error:current.error??(code===0?null:'BACKUP_APPLICATION_START_FAILED')})).catch(()=>{});});
  await new Promise<void>((resolve,reject)=>{child.once('error',()=>reject(new BackupError('BACKUP_APPLICATION_START_FAILED')));child.once('spawn',()=>resolve());});if(!child.pid)failure('BACKUP_APPLICATION_START_FAILED');
  await this.change(record.candidateId,record.execution,current=>({...current,pid:child.pid!,phase:'starting'}));
  acceptPid();child.unref();child.channel?.unref();
 }
 async control(input:RecoveryApplicationControlRequest):Promise<RecoveryApplicationStatus>{
  this.active();const request=recoveryApplicationControlRequest.parse(input),record=await this.read(request.candidateId);if(!record)failure('BACKUP_APPLICATION_NOT_OPENED');if(record.execution!==request.execution)failure('BACKUP_APPLICATION_EXECUTION_CHANGED');const pending=this.jobs.get(record.execution);
  if(request.operation==='stop'&&pending){pending.controller.abort();await this.change(record.candidateId,record.execution,value=>({...value,phase:'stopping',ready:false}));return this.status(request.candidateId);}
  if(record.pid===null)return this.status(request.candidateId);const result=await queryRecoveryRuntime(record.execution,record.secret,request.operation);if(result&&result.pid===record.pid){await this.state(record,result);return publicStatus({...record,...result});}return publicStatus(record,{phase:'unknown',ready:false,canReopen:false,error:'BACKUP_APPLICATION_STATE_UNKNOWN'});
 }
 async close():Promise<void>{this.closed=true;for(const job of this.jobs.values())job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(job=>job.done));for(const child of this.children.values())if(child.connected)child.disconnect();this.children.clear();this.plans.clear();}
}
