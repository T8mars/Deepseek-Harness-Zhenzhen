import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute,posix,win32} from 'node:path';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {localSkillStateSchema} from './local-skills-schema.ts';
import {githubSkillStateSchema} from './github-skills-schema.ts';
import {LocalSkills} from './local-skills.ts';
import {GithubSkills} from './github-skills.ts';
import {SkillFeed} from './skill-feed.ts';
import type {SkillMarket} from './market.ts';
import type {SkillBackupInventory} from './backup-skill-inventory.ts';
import type {SkillRestoreCandidate} from './backup-skills.ts';
import {originKey} from './backup-skill-projection.ts';
import type {SkillProjectionAnchor} from './backup-skill-projection.ts';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const same=(a:unknown,b:unknown)=>backupJsonString(a)===backupJsonString(b);
function originApi(path:string){return win32.isAbsolute(path)&&!posix.isAbsolute(path)?win32:posix;}
export function githubProjectionAnchor(inventory:SkillBackupInventory):SkillProjectionAnchor[]{
  let origin=inventory.github.root;
  if(!origin&&inventory.github.releases.length){
    for(const row of inventory.github.releases){const api=originApi(row.root),base=api.dirname(api.dirname(api.dirname(row.root)));if(originKey(api.join(base,'releases',row.release.sourceId,row.release.digest))!==originKey(row.root))throw new BackupError('BACKUP_GITHUB_ROOT_MAPPING_INVALID');if(origin&&originKey(origin)!==originKey(base))throw new BackupError('BACKUP_GITHUB_ROOT_MAPPING_INVALID');origin=base;}
  }
  if(origin)for(const row of inventory.github.releases){const api=originApi(origin);if(originKey(api.join(origin,'releases',row.release.sourceId,row.release.digest))!==originKey(row.root))throw new BackupError('BACKUP_GITHUB_ROOT_MAPPING_INVALID');}
  return origin?[{key:'github-cache',canonicalRoot:origin,present:true}]:[];
}
export interface ManagedSkillRestore {
  local:{file:string;mappings:Array<{id:string;originRoot:string;originIdentity:string;restoredRoot:string;restoredIdentity:string;present:boolean}>};
  github:{root:string;stateFile:string|null;originRoot:string|null;originRunning:SkillBackupInventory['github']['running'];candidateMounted:false;retainedReleases:number};
  feed:{file:string|null;runtimeMetadata:string;activated:false};
  activated:false;
}
async function owned(root:string,path:string):Promise<void>{
  const part=relative(root,path);if(!part||isAbsolute(part)||part==='..'||part.startsWith('..\\')||part.startsWith('../'))throw new BackupError('BACKUP_TEMP_BOUNDARY');
  let cursor=path;while(cursor!==root){try{const stat=await lstat(cursor);if(stat.isSymbolicLink())throw new BackupError('BACKUP_TEMP_BOUNDARY');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}cursor=dirname(cursor);}
  if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw new BackupError('BACKUP_TEMP_BOUNDARY');
}
async function persist(root:string,file:string,value:unknown,limit:number,normalize:(input:unknown)=>unknown=(input)=>input):Promise<void>{
  await owned(root,file);const text=backupJsonString(value)+'\n';if(Buffer.byteLength(text)>limit)throw new BackupError('BACKUP_MANAGED_STATE_LIMIT');
  try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>limit)throw new BackupError('BACKUP_MANAGED_STATE_CONFLICT');const original=await readFile(file);if(!same(normalize(parseBackupJson(original)),normalize(value)))throw new BackupError('BACKUP_MANAGED_STATE_CONFLICT');return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,text,{flag:'wx',mode:0o600});
}
/** Only consumes already authenticated, validated resources inside a fresh
 * candidate. Nothing in an origin path is read or used as an output root. */
export async function restoreManagedSkills(candidate:SkillRestoreCandidate,inventory:SkillBackupInventory,market:SkillMarket,options:BackupOptions):Promise<ManagedSkillRestore>{
  const root=candidate.root,state=join(root,'state');options.signal?.throwIfAborted();const mappings:ManagedSkillRestore['local']['mappings']=[],sources=[];
  for(const original of inventory.local.sources){
    const selected=candidate.roots.find(row=>row.origin.key==='local:'+original.id);if(!selected)throw new BackupError('BACKUP_LOCAL_ROOT_MAPPING_INVALID');await owned(root,selected.restoredPath);let identity='restore-unavailable-'+sha(original.id);
    if(selected.present){const info=await lstat(selected.restoredPath,{bigint:true});if(!info.isDirectory()||info.isSymbolicLink())throw new BackupError('BACKUP_LOCAL_ROOT_MAPPING_INVALID');identity=info.dev+':'+info.ino;}
    else{try{await lstat(selected.restoredPath);throw new BackupError('BACKUP_LOCAL_ROOT_MAPPING_INVALID');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
    sources.push({...original,root:selected.restoredPath,identity});mappings.push({id:original.id,originRoot:original.root,originIdentity:original.identity,restoredRoot:selected.restoredPath,restoredIdentity:identity,present:selected.present});
  }
  const localFile=join(state,'local-skills.json'),localState=localSkillStateSchema.parse({schemaVersion:1,sources});await persist(root,localFile,localState,131072,value=>localSkillStateSchema.parse(value));const local=new LocalSkills(localFile);try{if(!same(local.backupState(),localState))throw new BackupError('BACKUP_MANAGED_STATE_MISMATCH');}finally{local.close();}
  options.signal?.throwIfAborted();const anchor=candidate.anchors.find(row=>row.key==='github-cache'),cache=anchor?.restoredPath??join(state,'github-skills');await owned(root,cache);await mkdir(cache,{recursive:true,mode:0o700});
  for(const row of inventory.github.releases){const selected=candidate.roots.find(value=>value.origin.key==='github:'+sha(row.release.sourceId+':'+row.release.digest)),expected=join(cache,'releases',row.release.sourceId,row.release.digest);if(!selected?.present||selected.restoredPath!==expected)throw new BackupError('BACKUP_GITHUB_ROOT_MAPPING_INVALID');}
  const githubFile=join(cache,'state.json'),githubState=githubSkillStateSchema.parse({schemaVersion:1,sources:inventory.github.sources});let statePresent=inventory.github.statePresent;
  if(statePresent===undefined){try{await lstat(githubFile);statePresent=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;statePresent=githubState.sources.length>0;}}
  if(!statePresent&&githubState.sources.length)throw new BackupError('BACKUP_MANAGED_STATE_CONFLICT');
  if(statePresent)await persist(root,githubFile,githubState,262144,value=>githubSkillStateSchema.parse(value));else{try{await lstat(githubFile);throw new BackupError('BACKUP_MANAGED_STATE_CONFLICT');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  const github=new GithubSkills(cache,async()=>{throw Error('BACKUP_CANDIDATE_NETWORK_REFUSED');},{candidate:true});
  try{const actual=github.backupState(),sort=(values:typeof actual.releases)=>values.map(row=>row.release).sort((a,b)=>(a.sourceId+':'+a.digest).localeCompare(b.sourceId+':'+b.digest));if(!same(actual.sources,githubState.sources)||actual.running.length||actual.statePresent!==statePresent||!same(sort(actual.releases),sort(inventory.github.releases)))throw new BackupError('BACKUP_MANAGED_STATE_MISMATCH');}finally{github.close();}
  options.signal?.throwIfAborted();const feedFile=join(state,'skills-feed.json');if(inventory.feed.persisted.present)await persist(root,feedFile,inventory.feed.persisted.cache,2*1024**2);const feed=new SkillFeed(feedFile,market,async()=>{throw Error('BACKUP_CANDIDATE_NETWORK_REFUSED');},undefined,{candidateState:inventory.feed});
  try{if(!same(feed.backupState(),inventory.feed))throw new BackupError('BACKUP_MANAGED_STATE_MISMATCH');}finally{/* Feed candidate never starts a timer or a fetch. */}
  const runtimeMetadata=join(state,'skills-feed-runtime.json');await persist(root,runtimeMetadata,{status:inventory.feed.status,catalog:inventory.feed.catalog},2*1024**2);options.signal?.throwIfAborted();
  return {local:{file:localFile,mappings},github:{root:cache,stateFile:statePresent?githubFile:null,originRoot:anchor?.canonicalOrigin??null,originRunning:structuredClone(inventory.github.running),candidateMounted:false,retainedReleases:inventory.github.releases.length},feed:{file:inventory.feed.persisted.present?feedFile:null,runtimeMetadata,activated:false},activated:false};
}
