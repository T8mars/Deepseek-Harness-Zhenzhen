import {createHash} from 'node:crypto';
import {lstat,open,readdir,readlink,realpath} from 'node:fs/promises';
import {isAbsolute,join,relative} from 'node:path';
import type {BigIntStats} from 'node:fs';
import {BackupError} from './backup-archive.ts';
import type {RecoverySummary,RecoveryPreview} from './recovery-schema.ts';

const MAX_ENTRIES=300_000,MAX_BYTES=32*1024**3;
export interface RecoveryBaseline {root:string;createdAt:string;sha256:string;files:number;bytes:number;links:number;components:RecoverySummary[];}
type ScanOptions={signal?:AbortSignal;maxEntries?:number;maxBytes?:number;};
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const key=(value:string)=>process.platform==='win32'?value.toLowerCase():value;
const identity=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.mode,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
function limits(options:ScanOptions){const entries=options.maxEntries??MAX_ENTRIES,bytes=options.maxBytes??MAX_BYTES;if(!Number.isSafeInteger(entries)||entries<1||entries>MAX_ENTRIES||!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_BYTES)throw new BackupError('BACKUP_CANDIDATE_LIMIT');return{entries,bytes};}
/** Read only owned regular files. Link text is checked, never its target bytes.
 * Directory links are not traversed, including installation framework links. */
async function scan(root:string,content:boolean,options:ScanOptions){
  const budget=limits(options),observed:unknown[]=[],rows:unknown[]=[];let entries=0,files=0,bytes=0,links=0;
  async function walk(path:string):Promise<void>{
    options.signal?.throwIfAborted();if(++entries>budget.entries)throw new BackupError('BACKUP_CANDIDATE_LIMIT');
    const before=await lstat(path,{bigint:true}),part=relative(root,path).replaceAll('\\','/');
    if(path!==root&&(isAbsolute(part)||part==='..'||part.startsWith('../')))throw new BackupError('BACKUP_TEMP_BOUNDARY');
    if(before.isSymbolicLink()){
      if(path===root)throw new BackupError('BACKUP_TEMP_BOUNDARY');const target=await readlink(path);if(target.length>8192||identity(await lstat(path,{bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');observed.push([part,'link',identity(before),target]);rows.push([part,'link',target]);links++;return;
    }
    if(key(await realpath(path))!==key(path))throw new BackupError('BACKUP_TEMP_BOUNDARY');
    if(before.isDirectory()){
      observed.push([part,'directory',identity(before)]);rows.push([part,'directory',Number(before.mode)]);
      const children=(await readdir(path)).sort();if(children.length+entries>budget.entries)throw new BackupError('BACKUP_CANDIDATE_LIMIT');for(const child of children)await walk(join(path,child));
    }else if(before.isFile()){
      files++;const size=Number(before.size);if(!Number.isSafeInteger(size)||size<0||bytes+size>budget.bytes)throw new BackupError('BACKUP_CANDIDATE_LIMIT');bytes+=size;let digest:string|null=null;
      if(content){
        const file=await open(path,'r');try{
          if(identity(await file.stat({bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');
          const sum=createHash('sha256'),buffer=Buffer.alloc(64*1024);let position=0;
          while(position<size){options.signal?.throwIfAborted();const count=(await file.read(buffer,0,Math.min(buffer.length,size-position),position)).bytesRead;if(!count)throw new BackupError('BACKUP_SOURCE_CHANGED');sum.update(buffer.subarray(0,count));position+=count;}
          if(identity(await file.stat({bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');digest=sum.digest('hex');
        }finally{await file.close();}
      }
      observed.push([part,'file',identity(before)]);rows.push([part,'file',Number(before.mode),size,digest]);
    }else throw new BackupError('BACKUP_CANDIDATE_UNSUPPORTED_FILE');
    if(identity(await lstat(path,{bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');
  }
  if(!isAbsolute(root)||(await lstat(root)).isSymbolicLink()||key(await realpath(root))!==key(root)||!(await lstat(root)).isDirectory())throw new BackupError('BACKUP_TEMP_BOUNDARY');
  await walk(root);return{observation:hash(JSON.stringify(observed)),sha256:hash(JSON.stringify(rows)),files,bytes,links};
}
export async function sealRecoveryCandidate(root:string,components:RecoverySummary[],options:ScanOptions={}):Promise<RecoveryBaseline>{
  try{const content=await scan(root,true,options),after=await scan(root,false,options);if(content.observation!==after.observation)throw new BackupError('BACKUP_SOURCE_CHANGED');return{root,createdAt:new Date().toISOString(),sha256:content.sha256,files:content.files,bytes:content.bytes,links:content.links,components:structuredClone(components)};}
  catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_CANDIDATE_READ_FAILED');}
}
/** Compare with the baseline retained by the original Host job, never an
 * arbitrary path or a user-editable receipt. This does not grant activation. */
export async function verifyRecoveryCandidate(baseline:RecoveryBaseline,options:ScanOptions={}):Promise<RecoveryPreview>{
  let integrity:RecoveryPreview['integrity']='unavailable';
  try{const current=await sealRecoveryCandidate(baseline.root,baseline.components,options);integrity=current.sha256===baseline.sha256&&current.files===baseline.files&&current.bytes===baseline.bytes&&current.links===baseline.links?'unchanged':'changed';}
  catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError&&['BACKUP_SOURCE_CHANGED','BACKUP_TEMP_BOUNDARY','BACKUP_CANDIDATE_UNSUPPORTED_FILE'].includes(error.code))integrity='changed';}
  return {root:baseline.root,createdAt:baseline.createdAt,checkedAt:new Date().toISOString(),integrity,files:baseline.files,bytes:baseline.bytes,links:baseline.links,components:structuredClone(baseline.components),activated:false,readyForActivation:false,wholeApplicationRestore:false};
}
