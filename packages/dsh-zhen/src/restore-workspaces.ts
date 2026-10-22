import {Context} from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as Domain from '@deepseek-ai/dsh-storage-domain';
import * as Json from '@deepseek-ai/dsh-storage-json';
import {workspaceDomainSpec} from '@deepseek-ai/dsh-workspace';
import {lstat,realpath,rm} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative} from 'node:path';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {prepareWorkspaceBackup,restoreVerifiedWorkspaceRecords} from './backup-workspaces.ts';
import type {WorkspaceRestoreCandidate,WorkspaceBackupLease} from './backup-workspaces.ts';
import {sealRecoveryCandidate,verifyRecoveryCandidate} from './recovery-candidate.ts';

const equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
async function ordinary(root:string,path:string,file=false):Promise<void>{
 if(!inside(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');
 for(let current=path;;current=dirname(current)){
  let stat;try{stat=await lstat(current);}catch{throw new BackupError('BACKUP_WORKSPACE_APPLICATION_INPUT_INVALID');}if(stat.isSymbolicLink()||!equal(await realpath(current),current)||current===path&&(file?!stat.isFile():!stat.isDirectory()))throw new BackupError('BACKUP_TEMP_BOUNDARY');
  if(equal(root,current))return;if(dirname(current)===current)throw new BackupError('BACKUP_TEMP_BOUNDARY');
 }
}
export interface WorkspaceApplicationReceipt {
 schema:'dsh-zhen-workspace-application-v1';root:string;storageRoot:string;workspaces:number;
 reviewReasons:string[];pathsRebound:false;registryEnabled:false;pendingMutationsExecuted:false;
 reviewRequired:true;activated:false;
}
/** Isolated Storage/Domain adapters copy the complete logical inventory into a
 * NEW application home. Never construct WorkspaceRegistry: opening it may
 * resolve old directories, prune membership or complete a pending mutation.
 * Published SDK membership uses immutable session-header cwd, so original
 * workspace paths and IDs are intentionally preserved for separate review. */
export async function prepareRestoredWorkspaces(root:string,home:string,source:WorkspaceRestoreCandidate,options:BackupOptions={}):Promise<WorkspaceApplicationReceipt>{
 options.signal?.throwIfAborted();await ordinary(root,home);await ordinary(root,source.root);
 if(inside(source.root,home)||inside(home,source.root)||source.schema!=='dsh-zhen-workspaces-v1'||source.activated!==false||source.readyForActivation!==false||source.wholeApplicationRestore!==false||source.storageRoot!==join(source.root,'storage')||source.metadata!==join(source.root,'dsh-zhen-workspaces-restore.json')||!Number.isSafeInteger(source.workspaces)||source.workspaces<0||source.workspaces>10000)throw new BackupError('BACKUP_WORKSPACE_APPLICATION_INPUT_INVALID');
 await ordinary(source.root,source.storageRoot);await ordinary(source.root,source.metadata,true);
 // This fixed, released single-unit location is guarded by C139. Refuse a
 // missing unit before the public backend can interpret it as an empty domain.
 await ordinary(source.storageRoot,join(source.storageRoot,'workspace.json'),true);
 const scan={signal:options.signal,maxEntries:20000,maxBytes:64*1024**2},baseline=await sealRecoveryCandidate(source.root,[],scan);
 if(baseline.links)throw new BackupError('BACKUP_TEMP_BOUNDARY');
 const ctx=new Context();let lease:WorkspaceBackupLease|undefined,copy:WorkspaceRestoreCandidate|undefined,complete=false;
 try{
  await ctx.plugin(Storage);await ctx.plugin(Json,{root:source.storageRoot});await ctx.plugin(Domain,{backend:'json'});
  const domain=await ctx.storage.domain.open(workspaceDomainSpec);
  lease=await prepareWorkspaceBackup(()=>({facility:ctx.storage.domain,domain,revision:0}),options);
  if(lease.document.workspaces.length!==source.workspaces)throw new BackupError('BACKUP_WORKSPACE_APPLICATION_COUNT_MISMATCH');
  copy=await restoreVerifiedWorkspaceRecords(lease.records(),home,options);await lease.assertCurrent();
  if((await verifyRecoveryCandidate(baseline,scan)).integrity!=='unchanged')throw new BackupError('BACKUP_SOURCE_CHANGED');
  options.signal?.throwIfAborted();complete=true;
  return {schema:'dsh-zhen-workspace-application-v1',root:copy.root,storageRoot:copy.storageRoot,workspaces:copy.workspaces,reviewReasons:[...copy.reviewReasons],pathsRebound:false,registryEnabled:false,pendingMutationsExecuted:false,reviewRequired:true,activated:false};
 }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_WORKSPACE_APPLICATION_FAILED');}
 finally{
  try{try{lease?.close();}finally{await ctx.fiber.dispose();}}catch(error){complete=false;throw error;}
  finally{if(copy&&!complete){await ordinary(home,copy.root);const part=relative(home,copy.root);if(!part||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-workspaces-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(copy.root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}
 }
}
