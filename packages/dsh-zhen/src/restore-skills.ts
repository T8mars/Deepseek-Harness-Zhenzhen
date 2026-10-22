import {createHash} from 'node:crypto';
import {lstat,mkdir,open,realpath,unlink,rm,symlink} from 'node:fs/promises';
import {existsSync,lstatSync,openSync,closeSync,readSync,fstatSync,realpathSync} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import {dirname,isAbsolute,join,relative} from 'node:path';
import {z} from 'zod';
import {SkillMarket,verifySkill} from './market.ts';
import type {MarketBackupState} from './market.ts';
import {marketBackupStateSchema,validateMarketBackupState} from './market-backup-state.ts';
import {skillFeedSnapshotSchema,skillPackageSchema} from './market-schema.ts';
import {localSkillStateSchema} from './local-skills-schema.ts';
import {githubSkillStateSchema,githubSkillReleaseSchema} from './github-skills-schema.ts';
import {GithubSkills,githubSkillPath} from './github-skills.ts';
import {LocalSkills} from './local-skills.ts';
import {SkillFeed} from './skill-feed.ts';
import {validateSkillBackupInventory} from './backup-skill-inventory.ts';
import type {SkillInventoryRestoreCandidate} from './backup-skill-inventory.ts';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';

const REVIEW_FILE='skills-recovery.json',MAX_STATE=64*1024**2,MAX_FILE=8*1024**2;
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const within=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(root)&&isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const identity=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const cacheSchema=z.object({status:skillFeedSnapshotSchema,catalog:z.array(skillPackageSchema).max(100)}).strict();
const feedSchema=cacheSchema.extend({persisted:z.object({present:z.boolean(),cache:cacheSchema.optional()}).strict()}).strict();
const reviewSchema=z.object({schema:z.literal('dsh-zhen-skills-review-v1'),pending:z.literal(true),market:marketBackupStateSchema,feed:feedSchema}).strict();
export interface RestoredSkillReview {schema:'dsh-zhen-skills-review-v1';pending:true;market:MarketBackupState;feed:ReturnType<SkillFeed['backupState']>;}
export interface SkillApplicationReceipt{
  schema:'dsh-zhen-skill-application-v1';database:string;local:string;github:string;feed:string|null;review:string;
  versions:number;localSources:number;githubSources:number;githubReleases:number;
  filesystems:Array<{id:string;config:{providerName:string;includeDefaultRoots:boolean;dshHome:string;agentsHome:string;customSkillDirs:string[];bundledSkillDir:string};enabled:boolean}>;
  projects:Array<{originCwd:string;originRoot:string;root:string}>;
  reviewRequired:true;activated:false;automaticallyDownloads:false;
}
function validateReview(value:unknown):RestoredSkillReview{
  const parsed=reviewSchema.parse(value);validateMarketBackupState(parsed.market,verifySkill);
  for(const entry of[parsed.feed,...parsed.feed.persisted.cache?[parsed.feed.persisted.cache]:[]]){if(entry.status.count!==entry.catalog.length)throw new BackupError('BACKUP_SKILL_REVIEW_INVALID');for(const item of entry.catalog)verifySkill(item);}
  if(parsed.feed.persisted.present!==!!parsed.feed.persisted.cache)throw new BackupError('BACKUP_SKILL_REVIEW_INVALID');return parsed;
}
/** Pinned own home only. A missing review file is the normal running application;
 * an invalid review never falls back to activating saved pending selections. */
export function readRestoredSkillReview(home:string):RestoredSkillReview|null{
  const file=join(home,REVIEW_FILE);if(!existsSync(file))return null;
  try{
    const root=lstatSync(home),before=lstatSync(file,{bigint:true});if(!isAbsolute(home)||root.isSymbolicLink()||!root.isDirectory()||!equal(realpathSync.native(home),home)||before.isSymbolicLink()||!before.isFile()||before.size>BigInt(MAX_STATE))throw Error();
    const fd=openSync(file,'r');try{if(identity(fstatSync(fd,{bigint:true}))!==identity(before))throw Error();const bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){const count=readSync(fd,bytes,at,bytes.length-at,at);if(!count)throw Error();at+=count;}if(identity(fstatSync(fd,{bigint:true}))!==identity(before)||identity(lstatSync(file,{bigint:true}))!==identity(before))throw Error();return validateReview(parseBackupJson(bytes));}finally{closeSync(fd);}
  }catch{throw new BackupError('BACKUP_SKILL_REVIEW_INVALID');}
}
async function ordinary(root:string,path:string,file=false,missing=false):Promise<void>{
  if(!within(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');let cursor=path;
  for(;;){let stat;try{stat=await lstat(cursor);}catch(error){if(missing&&(error as NodeJS.ErrnoException).code==='ENOENT'){cursor=dirname(cursor);if(!within(root,cursor))throw new BackupError('BACKUP_TEMP_BOUNDARY');continue;}throw error;}
    if(stat.isSymbolicLink()||!equal(await realpath(cursor),cursor)||cursor===path&&(file?!stat.isFile():!stat.isDirectory()))throw new BackupError('BACKUP_TEMP_BOUNDARY');if(equal(cursor,root))return;const parent=dirname(cursor);if(parent===cursor)throw new BackupError('BACKUP_TEMP_BOUNDARY');cursor=parent;
  }
}
/** Writes only fixed own-state names beneath a new application's data home.
 * Root resources retain their declared role/scope in the original component. */
export async function prepareRestoredSkills(root:string,home:string,source:SkillInventoryRestoreCandidate,options:BackupOptions={}):Promise<SkillApplicationReceipt>{
  const data=join(home,'dsh-zhen');await ordinary(root,data);await ordinary(root,source.root);const inventory=validateSkillBackupInventory(source.inventory),created:string[]=[];
  let readBytes=0;
  async function read(owner:string,path:string,limit:number):Promise<Buffer>{
    options.signal?.throwIfAborted();await ordinary(owner,path,true);const before=await lstat(path,{bigint:true});if(before.size>BigInt(limit)||(readBytes+=Number(before.size))>(options.limits?.archiveBytes??4*1024**3))throw new BackupError('BACKUP_SKILL_APPLICATION_LIMIT');const fd=await open(path,'r');
    try{if(identity(await fd.stat({bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');const bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){options.signal?.throwIfAborted();const count=(await fd.read(bytes,at,bytes.length-at,at)).bytesRead;if(!count)throw new BackupError('BACKUP_SOURCE_CHANGED');at+=count;}if(identity(await fd.stat({bigint:true}))!==identity(before)||identity(await lstat(path,{bigint:true}))!==identity(before))throw new BackupError('BACKUP_SOURCE_CHANGED');return bytes;}finally{await fd.close();}
  }
  async function write(file:string,bytes:Buffer|string):Promise<void>{options.signal?.throwIfAborted();await ordinary(data,file,true,true);await mkdir(dirname(file),{recursive:true,mode:0o700});const handle=await open(file,'wx',0o600);created.push(file);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
  const database=join(data,'skills.sqlite'),localFile=join(data,'local-skills.json'),githubRoot=join(data,'github-skills'),feedFile=join(data,'skills-feed.json'),reviewFile=join(data,REVIEW_FILE);
  const result:SkillApplicationReceipt={schema:'dsh-zhen-skill-application-v1',database,local:localFile,github:githubRoot,feed:source.managed.feed.file?feedFile:null,review:reviewFile,versions:inventory.market.versions.length,localSources:inventory.local.sources.length,githubSources:inventory.github.sources.length,githubReleases:inventory.github.releases.length,filesystems:[],projects:[],reviewRequired:true,activated:false,automaticallyDownloads:false};
  const portals=join(data,'skill-roots');let complete=false,ownsGithub=false,ownsPortals=false,market:SkillMarket|undefined;
  try{
    const roots=new Map(source.roots.map(row=>[row.origin.key,row]));if(roots.size!==source.roots.length||roots.size!==inventory.roots.length||source.roots.some(row=>!inventory.roots.some(item=>backupJsonString(item)===backupJsonString(row.origin))))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');
    for(const row of source.roots)await ordinary(source.root,row.restoredPath,false,!row.present);
    const local=localSkillStateSchema.parse(parseBackupJson(await read(source.root,source.managed.local.file,131072)));
    if(local.sources.length!==inventory.local.sources.length)throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');
    for(const item of local.sources){const mapped=roots.get('local:'+item.id),original=inventory.local.sources.find(row=>row.id===item.id);if(!mapped||!original||item.root!==mapped.restoredPath||backupJsonString({...item,root:original.root,identity:original.identity})!==backupJsonString(original))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');if(mapped.present){const stat=await lstat(mapped.restoredPath,{bigint:true});if(item.identity!==stat.dev+':'+stat.ino)throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');}}
    await ordinary(data,portals,false,true);await mkdir(portals,{mode:0o700});ownsPortals=true;
    const links=new Map<string,string>();
    async function portal(target:string|undefined,path:string):Promise<void>{const previous=links.get(path);if(previous){await ordinary(data,dirname(path));if(previous!==target||!(await lstat(path)).isSymbolicLink()||!equal(await realpath(path),previous))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');return;}await ordinary(data,path,false,true);await mkdir(dirname(path),{recursive:true,mode:0o700});if(!target)return;const selected=source.roots.find(row=>row.restoredPath===target);if(!selected?.present)return;await ordinary(source.root,target);await symlink(target,path,process.platform==='win32'?'junction':'dir');links.set(path,target);}
    for(const fs of inventory.filesystem){const selected=source.roots.filter(row=>row.origin.provenance?.provider===fs.id),role=(name:string)=>selected.find(row=>row.origin.provenance?.role===name)?.restoredPath,base=join(portals,'providers',hash(fs.id)),dshHome=join(base,'dsh'),agentsHome=join(base,'agents');
      const custom=selected.filter(row=>row.origin.provenance?.role==='custom').sort((a,b)=>Number(a.origin.provenance?.index)-Number(b.origin.provenance?.index)).map(row=>row.restoredPath);
      await portal(role('user-dsh'),join(dshHome,'skills'));await portal(role('user-agents'),join(agentsHome,'skills'));
      result.filesystems.push({id:fs.id,enabled:fs.enabled!==false,config:{providerName:fs.config.providerName,includeDefaultRoots:fs.config.includeDefaultRoots,dshHome,agentsHome,customSkillDirs:custom,bundledSkillDir:role('bundled')??''}});
    }
    for(const project of inventory.projects){const selected=source.roots.filter(row=>row.origin.workspace===project.projectRoot&&['project-dsh','project-agents'].includes(row.origin.kind)),projectRoot=join(portals,'projects',hash(project.projectRoot));if(selected.length){for(const row of selected)await portal(row.restoredPath,join(projectRoot,row.origin.kind==='project-dsh'?'.dsh':'.agents','skills'));result.projects.push({originCwd:project.cwd,originRoot:project.projectRoot,root:projectRoot});}}
    await write(database,Buffer.alloc(0));market=new SkillMarket(database,[]);await market.restoreBackupState(inventory.market,options.signal);market.close();market=undefined;
    await write(localFile,backupJsonString(local)+'\n');
    await ordinary(data,githubRoot,false,true);await mkdir(githubRoot,{mode:0o700});ownsGithub=true;
    for(const item of inventory.github.releases){const release=githubSkillReleaseSchema.parse(item.release),key='github:'+hash(release.sourceId+':'+release.digest),selected=roots.get(key),from=join(source.managed.github.root,'releases',release.sourceId,release.digest),to=join(githubRoot,'releases',release.sourceId,release.digest);if(!selected?.present||selected.restoredPath!==from)throw new BackupError('BACKUP_GITHUB_ROOT_MAPPING_INVALID');
      const bytes=await read(source.root,join(from,'manifest.json'),MAX_FILE);if(backupJsonString(githubSkillReleaseSchema.parse(parseBackupJson(bytes)))!==backupJsonString(release))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');await write(join(to,'manifest.json'),bytes);
      for(const file of release.files){githubSkillPath(file.path);const bytes=await read(from,join(from,file.location,...file.path.split('/')),MAX_FILE);if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new BackupError('BACKUP_SOURCE_CHANGED');await write(join(to,file.location,...file.path.split('/')),bytes);}
    }
    if(source.managed.github.stateFile){const bytes=await read(source.root,source.managed.github.stateFile,262144),state=githubSkillStateSchema.parse(parseBackupJson(bytes));if(backupJsonString(state.sources)!==backupJsonString(inventory.github.sources))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');await write(join(githubRoot,'state.json'),bytes);}
    else if(inventory.github.sources.length)throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');
    const github=new GithubSkills(githubRoot,async()=>{throw Error('BACKUP_SKILL_NETWORK_REFUSED');},{reviewOnly:true});try{const actual=github.backupState();if(backupJsonString(actual.sources)!==backupJsonString(inventory.github.sources)||actual.running.length||actual.releases.length!==inventory.github.releases.length)throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');}finally{github.close();}
    if(source.managed.feed.file)await write(feedFile,await read(source.root,source.managed.feed.file,2*1024**2));
    const review:RestoredSkillReview={schema:'dsh-zhen-skills-review-v1',pending:true,market:inventory.market,feed:inventory.feed};const bytes=backupJsonString(validateReview(review))+'\n';if(Buffer.byteLength(bytes)>MAX_STATE)throw new BackupError('BACKUP_SKILL_APPLICATION_LIMIT');await write(reviewFile,bytes);
    const reopened=readRestoredSkillReview(data);if(!reopened)throw new BackupError('BACKUP_SKILL_REVIEW_INVALID');market=new SkillMarket(database,[],{candidateState:reopened.market});const feed=new SkillFeed(feedFile,market,async()=>{throw Error('BACKUP_SKILL_NETWORK_REFUSED');},undefined,{candidateState:reopened.feed,reviewOnly:true});if(backupJsonString(feed.backupState())!==backupJsonString(inventory.feed))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');market.close();market=undefined;
    const localReader=new LocalSkills(localFile,1000,{reviewOnly:true});try{if(backupJsonString(localReader.backupState())!==backupJsonString(local))throw new BackupError('BACKUP_SKILL_APPLICATION_MAPPING_INVALID');}finally{localReader.close();}
    options.signal?.throwIfAborted();complete=true;return result;
  }finally{market?.close();if(!complete){for(const file of created.toReversed()){await ordinary(data,file,true);await unlink(file);}if(ownsGithub){await ordinary(data,githubRoot);await rm(githubRoot,{recursive:true,force:true,maxRetries:3,retryDelay:100});}if(ownsPortals){await ordinary(data,portals);await rm(portals,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
