import {createHash} from 'node:crypto';
import {lstat,open,realpath,writeFile} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {isAbsolute,join,relative,dirname} from 'node:path';
import {BackupError} from './backup-archive.ts';
import {backupComponentSchema} from './backup-center-schema.ts';
import {recoveryLayoutSchema,recoveryPlanSchema} from './recovery-layout-schema.ts';
import type {RecoveryComponentLayout,RecoveryPlan} from './recovery-layout-schema.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';
import {verifyRecoveryCandidate} from './recovery-candidate.ts';

const FILE='dsh-zhen-recovery-layout.json',LIMIT=4*1024**2;
const key=(path:string)=>process.platform==='win32'?path.toLowerCase():path;
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const signature=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function ordinary(root:string,path:string,type:'file'|'directory'):Promise<void>{
  if(!inside(root,path))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');
  let current=path;for(;;){const stat=await lstat(current);if(stat.isSymbolicLink()||key(await realpath(current))!==key(current))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');if(current===path&&(type==='file'?!stat.isFile():!stat.isDirectory()))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');if(key(current)===key(root))break;const parent=dirname(current);if(parent===current)throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');current=parent;}
}
/** Only actual restore results supply locations. No original setting strings,
 * module expressions, executable arguments, grants or credentials are stored. */
export async function writeRecoveryLayout(root:string,components:RecoveryComponentLayout[],signal?:AbortSignal):Promise<string>{
  const parsed=recoveryLayoutSchema.safeParse({schema:'dsh-zhen-recovery-layout-v1',components});if(!parsed.success)throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');
  for(const row of parsed.data.components){signal?.throwIfAborted();if(key(row.root)===key(root))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');await ordinary(root,row.root,'directory');for(const item of row.locations)await ordinary(row.root,item.path,item.type);for(const profile of row.profiles){await ordinary(row.root,profile.directory,'directory');await ordinary(row.root,profile.overlay,'file');}}
  const bytes=Buffer.from(JSON.stringify(parsed.data)+'\n');if(bytes.length>LIMIT)throw new BackupError('BACKUP_RECOVERY_LAYOUT_LIMIT');signal?.throwIfAborted();await writeFile(join(root,FILE),bytes,{flag:'wx',mode:0o600});return sha(bytes);
}
async function read(baseline:RecoveryBaseline,signal?:AbortSignal){
  const path=join(baseline.root,FILE);await ordinary(baseline.root,path,'file');const before=await lstat(path,{bigint:true});if(before.size>BigInt(LIMIT))throw new BackupError('BACKUP_RECOVERY_LAYOUT_LIMIT');const file=await open(path,'r');
  try{if(signature(await file.stat({bigint:true}))!==signature(before))throw new BackupError('BACKUP_CANDIDATE_CHANGED');const bytes=Buffer.alloc(Number(before.size));let position=0;while(position<bytes.length){signal?.throwIfAborted();const size=(await file.read(bytes,position,bytes.length-position,position)).bytesRead;if(!size)throw new BackupError('BACKUP_CANDIDATE_CHANGED');position+=size;}if(signature(await file.stat({bigint:true}))!==signature(before)||signature(await lstat(path,{bigint:true}))!==signature(before))throw new BackupError('BACKUP_CANDIDATE_CHANGED');const parsed=recoveryLayoutSchema.safeParse(JSON.parse(bytes.toString('utf8')));if(!parsed.success||JSON.stringify(parsed.data.components.map(row=>row.kind))!==JSON.stringify(baseline.components.map(row=>row.kind)))throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');return{layout:parsed.data,signature:signature(before),sha256:sha(bytes)};}finally{await file.close();}
}
/** Read bounded layout metadata, verify the original whole-tree baseline, then
 * reread the same metadata identity and bytes. No new catalog field is needed,
 * so older versions can still read and verify these candidates after rollback. */
export async function inspectRecoveryLayout(baseline:RecoveryBaseline,signal?:AbortSignal):Promise<RecoveryPlan>{
  signal?.throwIfAborted();const included=baseline.components.map(row=>row.kind),base={root:baseline.root,checkedAt:new Date().toISOString(),included,activated:false as const,readyForActivation:false as const,wholeApplicationRestore:false as const};
  try{
    let snapshot:Awaited<ReturnType<typeof read>>|undefined;try{await lstat(join(baseline.root,FILE));snapshot=await read(baseline,signal);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const checked=await verifyRecoveryCandidate(baseline,{signal});if(checked.integrity!=='unchanged')throw new BackupError(checked.integrity==='changed'?'BACKUP_CANDIDATE_CHANGED':'BACKUP_CANDIDATE_UNAVAILABLE');
    if(!snapshot)return recoveryPlanSchema.parse({...base,snapshot:checked,checkedAt:new Date().toISOString(),status:'legacy',components:[],reasons:['LEGACY_LAYOUT_UNAVAILABLE','PATH_REBINDING_REQUIRED','PERMISSIONS_REVIEW_REQUIRED','OTHER_STATE_NOT_COVERED']});
    const after=await read(baseline,signal);if(snapshot.signature!==after.signature||snapshot.sha256!==after.sha256)throw new BackupError('BACKUP_CANDIDATE_CHANGED');
    const layout=snapshot.layout,reasons=new Set<RecoveryPlan['reasons'][number]>(),components:RecoveryPlan['components']=[];
    if(included.length!==backupComponentSchema.options.length)reasons.add('COMPONENTS_NOT_SELECTED');
    for(const row of layout.components){signal?.throwIfAborted();await ordinary(baseline.root,row.root,'directory');const locations:RecoveryPlan['components'][number]['locations']=[];if(!row.details)reasons.add('LAYOUT_DETAILS_UNAVAILABLE');
      for(const item of row.locations){signal?.throwIfAborted();let state:'available'|'unavailable'='available';try{await ordinary(row.root,item.path,item.type);}catch{state='unavailable';reasons.add('LOCATION_UNAVAILABLE');}locations.push({...item,state});}
      for(const profile of row.profiles){signal?.throwIfAborted();try{await ordinary(row.root,profile.directory,'directory');await ordinary(row.root,profile.overlay,'file');}catch{reasons.add('LOCATION_UNAVAILABLE');}if(!profile.launchable)reasons.add('PROFILE_UNAVAILABLE');if(profile.dependencyIssues)reasons.add('DEPENDENCIES_UNAVAILABLE');}
      if(row.kind==='environment'&&!row.profiles.length)reasons.add('PROFILE_UNAVAILABLE');if(row.externalPackages)reasons.add('CURRENT_SDK_BINDINGS');components.push({...row,locations});
    }
    for(const reason of ['PATH_REBINDING_REQUIRED','PERMISSIONS_REVIEW_REQUIRED','OTHER_STATE_NOT_COVERED'] as const)reasons.add(reason);
    return recoveryPlanSchema.parse({...base,snapshot:checked,checkedAt:new Date().toISOString(),status:'available',components,reasons:[...reasons]});
  }catch(error){signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_RECOVERY_LAYOUT_INVALID');}
}
