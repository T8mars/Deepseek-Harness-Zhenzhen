import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,mkdtemp,open,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {z} from 'zod';
import {BackupError,DEFAULT_BACKUP_LIMITS,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';
import {backupComponentSchema,backupLimitations} from './backup-center-schema.ts';
import type {BackupComponent} from './backup-center-schema.ts';
import {SUPPORTED_DSH} from './compatibility.ts';
import {sealRecoveryCandidate} from './recovery-candidate.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';
import {recoverySummarySchema} from './recovery-schema.ts';
import type {RecoverySummary} from './recovery-schema.ts';
import type {RecoveryComponentLayout} from './recovery-layout-schema.ts';
import {writeRecoveryLayout} from './recovery-layout.ts';
import {prepareRestoredApplication} from './restore-application.ts';
import type {ApplicationRestoreOptions,ApplicationRestoreParts} from './restore-application.ts';
export interface ComposedRestoreOptions extends BackupOptions {application?:ApplicationRestoreOptions;}

const SCHEMA='dsh-zhen-selected-backup-v1',MAX_CHUNK=4*1024**2;
export interface BackupComponentLease {records():AsyncGenerator<BackupRecord>;assertCurrent():Promise<void>;close():void|Promise<void>;}
export interface BackupComponentAdapter {
  available?:boolean;
  prepare(password:string,options:BackupOptions):Promise<BackupComponentLease>;
  restore(source:string,password:string,parent:string,options:BackupOptions):Promise<{root:string;summary?:RecoverySummary;layout?:RecoveryComponentLayout;application?:ApplicationRestoreParts}>;
}
export type BackupAdapters=Partial<Record<BackupComponent,BackupComponentAdapter>>;
type Progress=(phase:'preparing'|'capturing'|'verifying'|'restoring',component:BackupComponent|null,completed:number,total:number)=>void;
const manifestSchema=z.object({schema:z.literal(SCHEMA),sdkVersion:z.literal(SUPPORTED_DSH),credentialStoresIncluded:z.literal(false),wholeApplicationRestore:z.literal(false),limitations:z.array(z.string()).max(16),chunkBytes:z.number().int().positive().max(MAX_CHUNK),components:z.array(z.object({kind:backupComponentSchema,bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(6)}).strict();
function checkSelection(selected:readonly BackupComponent[],adapters:BackupAdapters,backup=false):void{if(!selected.length||selected.length>6||new Set(selected).size!==selected.length||selected.some(id=>!backupComponentSchema.safeParse(id).success||!adapters[id]||backup&&adapters[id]?.available===false))throw new BackupError('BACKUP_COMPONENT_UNAVAILABLE');}
export async function removeBackupCandidate(parent:string,root:string,prefix:string):Promise<void>{
  const actual=await realpath(root),part=relative(parent,actual),stat=await lstat(root);
  if(stat.isSymbolicLink()||!stat.isDirectory()||!part||isAbsolute(part)||part==='..'||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith(prefix))throw new BackupError('BACKUP_TEMP_BOUNDARY');
  await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
function invalid():never{throw new BackupError('BACKUP_COMPOSITION_INVALID');}
/** All component leases survive to the outer archive's last source barrier.
 * Nested archives stay encrypted; the final file is published exclusively. */
export async function writeComposedBackup(destination:string,password:string,selected:readonly BackupComponent[],adapters:BackupAdapters,options:BackupOptions={},progress:Progress=()=>{}):Promise<BackupReceipt>{
  checkSelection(selected,adapters,true);const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-zhen-composed-backup-'))),leases:BackupComponentLease[]=[];
  try{
    for(const id of selected){options.signal?.throwIfAborted();progress('preparing',id,leases.length,selected.length);leases.push(await adapters[id]!.prepare(password,options));}
    const receipts:BackupReceipt[]=[],files=selected.map(id=>join(root,id+'.encrypted'));
    for(let i=0;i<selected.length;i++){progress('capturing',selected[i],i,selected.length);receipts.push(await writeBackupArchive(files[i],password,leases[i].records(),options));}
    const chunkBytes=Math.min(MAX_CHUNK,options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes),header=Buffer.from(JSON.stringify({schema:SCHEMA,sdkVersion:SUPPORTED_DSH,credentialStoresIncluded:false,wholeApplicationRestore:false,limitations:backupLimitations,chunkBytes,components:receipts.map((row,i)=>({kind:selected[i],bytes:row.bytes,sha256:row.sha256}))}));
    async function* records():AsyncGenerator<BackupRecord>{
      progress('verifying',null,0,selected.length);for(const lease of leases)await lease.assertCurrent();
      yield {metadata:{kind:'composition',schema:SCHEMA},size:header.length,data:(async function*(){yield header;})()};
      for(let i=0;i<selected.length;i++)for(let offset=0;offset<receipts[i].bytes;offset+=chunkBytes){const size=Math.min(chunkBytes,receipts[i].bytes-offset);yield {metadata:{kind:selected[i],sha256:receipts[i].sha256,offset},size,data:createReadStream(files[i],{start:offset,end:offset+size-1,signal:options.signal})};}
      for(let i=0;i<leases.length;i++){await leases[i].assertCurrent();progress('verifying',selected[i],i+1,selected.length);}
    }
    return await writeBackupArchive(destination,password,records(),options);
  }finally{const settled=await Promise.allSettled(leases.map(lease=>Promise.resolve().then(()=>lease.close())));await removeBackupCandidate(base,root,'dsh-zhen-composed-backup-');const failed=settled.find(row=>row.status==='rejected');if(failed)throw new BackupError('BACKUP_COMPONENT_CLOSE_FAILED');}
}
/** Entire outer authentication and record structure precede any restore adapter.
 * Only a new owned candidate is written. It never activates providers or tasks. */
export async function restoreComposedBackup(source:string,password:string,parent:string,adapters:BackupAdapters,options:ComposedRestoreOptions={},progress:Progress=()=>{}):Promise<{root:string;components:BackupComponent[];verification:RecoveryBaseline;activated:false;wholeApplicationRestore:false}>{
  if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');const base=await realpath(tmpdir()),target=await realpath(parent),archive=await openBackupArchive(source,password,options);let temporary:string|undefined,candidate:string|undefined,complete=false;
  try{
    const records=archive.records(),first=await records.next();if(first.done||JSON.stringify(first.value.metadata)!==JSON.stringify({kind:'composition',schema:SCHEMA})||first.value.size>16384)invalid();
    const bytes:Uint8Array[]=[];for await(const part of first.value.data)bytes.push(part);let parsed;try{parsed=manifestSchema.safeParse(JSON.parse(Buffer.concat(bytes).toString('utf8')));}catch{invalid();}if(!parsed.success)invalid();const manifest=parsed.data,selected=manifest.components.map(row=>row.kind);checkSelection(selected,adapters);
    if(manifest.chunkBytes>Math.min(MAX_CHUNK,options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes)||manifest.components.some(row=>row.bytes>(options.limits?.archiveBytes??DEFAULT_BACKUP_LIMITS.archiveBytes)))invalid();
    temporary=await realpath(await mkdtemp(join(base,'dsh-zhen-composed-input-')));const files:string[]=[];
    for(const component of manifest.components){
      progress('verifying',component.kind,files.length,selected.length);const path=join(temporary,component.kind+'.encrypted'),file=await open(path,'wx',0o600),hash=createHash('sha256');let count=0;
      try{while(count<component.bytes){options.signal?.throwIfAborted();const next=await records.next(),expected=Math.min(manifest.chunkBytes,component.bytes-count);if(next.done||next.value.size!==expected||JSON.stringify(next.value.metadata)!==JSON.stringify({kind:component.kind,sha256:component.sha256,offset:count}))invalid();for await(const part of next.value.data){hash.update(part);count+=part.length;let offset=0;while(offset<part.length){const written=await file.write(part,offset,part.length-offset);if(!written.bytesWritten)throw new BackupError('BACKUP_WRITE_FAILED');offset+=written.bytesWritten;}}}await file.sync();}finally{await file.close();}
      if(count!==component.bytes||hash.digest('hex')!==component.sha256)invalid();files.push(path);
    }
    if(!(await records.next()).done)invalid();options.signal?.throwIfAborted();
    // Check every nested envelope before asking any domain to create a candidate.
    for(const file of files){const sealed=await openBackupArchive(file,password,options);try{for await(const record of sealed.records())for await(const _part of record.data){options.signal?.throwIfAborted();}}finally{await sealed.close();}}
    candidate=await realpath(await mkdtemp(join(target,'dsh-zhen-recovery-')));const restored=[],layouts:RecoveryComponentLayout[]=[],application:ApplicationRestoreParts={};
    for(let i=0;i<selected.length;i++){progress('restoring',selected[i],i,selected.length);const item=await adapters[selected[i]]!.restore(files[i],password,candidate,options),part=relative(candidate,await realpath(item.root));if(!part||isAbsolute(part)||part.startsWith('..'))throw new BackupError('BACKUP_TEMP_BOUNDARY');const summary=recoverySummarySchema.safeParse(item.summary??{kind:selected[i],counts:{},warnings:['COMPONENT_DETAILS_UNAVAILABLE']});if(!summary.success||summary.data.kind!==selected[i])throw new BackupError('BACKUP_CANDIDATE_SUMMARY_INVALID');if(item.layout&&(item.layout.kind!==selected[i]||item.layout.root!==item.root))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');if(item.application?.knowledge){if(selected[i]!=='knowledge'||item.application.knowledge.root!==item.root)throw new BackupError('BACKUP_APPLICATION_INPUT_INVALID');application.knowledge=item.application.knowledge;}layouts.push(item.layout??{kind:selected[i],root:item.root,details:false,locations:[],profiles:[],externalPackages:0});restored.push({kind:selected[i],root:item.root,summary:summary.data});options.signal?.throwIfAborted();}
    const result={root:candidate,components:selected,activated:false as const,wholeApplicationRestore:false as const};
    await writeFile(join(candidate,'dsh-zhen-recovery.json'),JSON.stringify({...result,schema:SCHEMA,credentialStoresIncluded:false,limitations:manifest.limitations,restored})+'\n',{flag:'wx',mode:0o600});progress('verifying',null,selected.length,selected.length);if(options.application)await prepareRestoredApplication(candidate,layouts,options.application,options.signal,application);await writeRecoveryLayout(candidate,layouts,options.signal);const verification=await sealRecoveryCandidate(candidate,restored.map(row=>row.summary),options);options.signal?.throwIfAborted();complete=true;return {...result,verification};
  }finally{try{await archive.close();}finally{try{if(temporary)await removeBackupCandidate(base,temporary,'dsh-zhen-composed-input-');}finally{if(candidate&&!complete)await removeBackupCandidate(target,candidate,'dsh-zhen-recovery-');}}}
}
