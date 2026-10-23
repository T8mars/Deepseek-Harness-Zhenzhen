import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,realpath,rm} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {dirname,isAbsolute,join,relative} from 'node:path';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString} from './backup-data.ts';
import {skillPackageSchema} from './market-schema.ts';
import {SkillMarket,verifySkill} from './market.ts';
import {LocalSkills} from './local-skills.ts';
import {GithubSkills,githubSkillPath} from './github-skills.ts';
import type {SkillFeed} from './skill-feed.ts';
import {FileManagedSkillRuntimePolicy} from './managed-skill-runtime-policy.ts';

export interface ManagedRuntimeOwners {market:SkillMarket;local:LocalSkills;github:GithubSkills;feed:SkillFeed;}
export const managedRuntimeRoleSchema=z.object({schema:z.literal('dsh-zhen-managed-runtime-role-v1'),home:z.string().min(1).max(4096),profile:z.string().min(1).max(255),epoch:z.uuid(),leaf:z.string().regex(/^m[a-f0-9]{12}$/),origin:z.string().regex(/^[a-f0-9]{64}$/),rootIdentity:z.string().regex(/^\d+:\d+$/),catalog:z.array(skillPackageSchema).max(100),bundled:z.array(skillPackageSchema).max(100),originalAutomatic:z.boolean()}).strict();
export type ManagedRuntimeRole=z.infer<typeof managedRuntimeRoleSchema>;
export interface ManagedRuntimeCopy {role:ManagedRuntimeRole;seal:string;root:string;}
const stamp=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':'),node=(stat:BigIntStats)=>stat.dev+':'+stat.ino,hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function fail(code='BACKUP_MANAGED_RUNTIME_SOURCE_CHANGED'):never{throw new BackupError(code);}
function within(root:string,path:string):boolean{const rel=relative(root,path);return isAbsolute(path)&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\');}
async function ordinary(root:string,path:string,file=false,missing=false):Promise<void>{
  if(!within(root,path))fail();let cursor=path;
  for(;;){let stat;try{stat=await lstat(cursor);}catch(error){if(missing&&(error as NodeJS.ErrnoException).code==='ENOENT'){cursor=dirname(cursor);if(!within(root,cursor))fail();continue;}throw error;}
    if(stat.isSymbolicLink()||!same(await realpath(cursor),cursor)||cursor===path&&(file?!stat.isFile():!stat.isDirectory()))fail();if(same(cursor,root))return;const parent=dirname(cursor);if(parent===cursor)fail();cursor=parent;
  }
}
export async function discardManagedRuntimeCopy(home:string,copy:ManagedRuntimeCopy):Promise<void>{
  if(!same(copy.role.home,home)||copy.root!==join(home,copy.role.leaf)||relative(home,copy.root)!==copy.role.leaf||!/^m[a-f0-9]{12}$/.test(copy.role.leaf))fail();
  await ordinary(home,home);const stat=await lstat(copy.root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||node(stat)!==copy.role.rootIdentity||!same(await realpath(copy.root),copy.root))fail();await rm(copy.root,{recursive:true,force:false});
}

/** Build only a fresh, fixed-leaf copy. This does not publish a role, reopen a
 * normal manager, apply pending work, invoke a program or perform any request. */
export async function prepareManagedRuntimeCopy(home:string,profile:string,origin:string,owners:ManagedRuntimeOwners,assertCurrent:()=>Promise<void>,options:BackupOptions={}):Promise<ManagedRuntimeCopy>{
  if(!isAbsolute(home)||!profile||profile.length>255||!/^[a-f0-9]{64}$/.test(origin))fail();await ordinary(home,home);const homeIdentity=node(await lstat(home,{bigint:true}));
  options.signal?.throwIfAborted();await assertCurrent();const original={market:owners.market.backupState(),local:owners.local.backupState(),github:owners.github.backupState(),feed:owners.feed.backupState()},baseline=backupJsonString(original);
  const epoch=randomUUID(),leaf='m'+epoch.replaceAll('-','').slice(0,12),root=join(home,leaf);let rootIdentity:string|undefined,complete=false,bytesRead=0,bytesWritten=0;
  async function currentRoot():Promise<void>{const parent=await lstat(home,{bigint:true});if(parent.isSymbolicLink()||node(parent)!==homeIdentity||!same(await realpath(home),home))fail();if(rootIdentity){const stat=await lstat(root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||node(stat)!==rootIdentity||!same(await realpath(root),root))fail();}}
  async function write(path:string,bytes:Buffer|string,mode=0o600):Promise<void>{options.signal?.throwIfAborted();if((bytesWritten+=Buffer.byteLength(bytes))>(options.limits?.archiveBytes??4*1024**3))fail('BACKUP_MANAGED_RUNTIME_LIMIT');await currentRoot();await ordinary(root,dirname(path),false,true);await mkdir(dirname(path),{recursive:true,mode:0o700});await ordinary(root,dirname(path));const fd=await open(path,'wx',mode);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}}
  async function read(sourceRoot:string,path:string,size:number,digest:string):Promise<Buffer>{
    options.signal?.throwIfAborted();await ordinary(sourceRoot,path,true);const before=await lstat(path,{bigint:true});if(before.size!==BigInt(size)||size>8*1024**2||(bytesRead+=size)>(options.limits?.archiveBytes??4*1024**3))fail('BACKUP_MANAGED_RUNTIME_LIMIT');
    const fd=await open(path,'r');try{if(stamp(await fd.stat({bigint:true}))!==stamp(before))fail();const bytes=Buffer.alloc(size);let at=0;while(at<bytes.length){options.signal?.throwIfAborted();const {bytesRead:count}=await fd.read(bytes,at,bytes.length-at,at);if(!count)fail();at+=count;}if(hash(bytes)!==digest||stamp(await fd.stat({bigint:true}))!==stamp(before)||stamp(await lstat(path,{bigint:true}))!==stamp(before))fail();return bytes;}finally{await fd.close();}
  }
  try{
    await mkdir(root,{mode:0o700});rootIdentity=node(await lstat(root,{bigint:true}));await currentRoot();
    const market=new SkillMarket(join(root,'s.db'),[]);try{await market.restoreBackupState(original.market,options.signal);}finally{market.close();}
    bytesWritten+=Number((await lstat(join(root,'s.db'),{bigint:true})).size);if(bytesWritten>(options.limits?.archiveBytes??4*1024**3))fail('BACKUP_MANAGED_RUNTIME_LIMIT');
    await currentRoot();await write(join(root,'l.json'),backupJsonString(original.local)+'\n');await mkdir(join(root,'g'),{mode:0o700});
    if(original.github.statePresent)await write(join(root,'g','state.json'),backupJsonString({schemaVersion:1,sources:original.github.sources})+'\n');
    let metadataBytes=0;
    for(const retained of original.github.releases){
      options.signal?.throwIfAborted();const release=retained.release;if(!/^[a-f0-9]{64}$/.test(release.sourceId)||!/^[a-f0-9]{64}$/.test(release.digest)||retained.root!==join(original.github.root,'releases',release.sourceId,release.digest))fail();
      const destination=join(root,'g','releases',release.sourceId,release.digest),manifest=backupJsonString(release)+'\n';if((metadataBytes+=Buffer.byteLength(manifest))>64*1024**2)fail('BACKUP_MANAGED_RUNTIME_LIMIT');await write(join(destination,'manifest.json'),manifest);
      for(const file of release.files){githubSkillPath(file.path);const bytes=await read(original.github.root,join(retained.root,file.location,file.path),file.bytes,file.sha256);await write(join(destination,file.location,file.path),bytes,file.mode==='100755'?0o700:0o600);}
    }
    await write(join(root,'f.json'),backupJsonString({status:original.feed.status,catalog:original.feed.catalog})+'\n');FileManagedSkillRuntimePolicy.initialize(root,epoch);bytesWritten+=Number((await lstat(join(root,'policy.json'),{bigint:true})).size);if(bytesWritten>(options.limits?.archiveBytes??4*1024**3))fail('BACKUP_MANAGED_RUNTIME_LIMIT');
    const checkMarket=new SkillMarket(join(root,'s.db'),[],{candidateState:original.market});try{if(backupJsonString(checkMarket.backupState())!==backupJsonString(original.market))fail();}finally{checkMarket.close();}
    const checkLocal=new LocalSkills(join(root,'l.json'),1000000,{reviewOnly:true});try{if(backupJsonString(checkLocal.backupState())!==backupJsonString(original.local))fail();}finally{checkLocal.close();}
    const checkGithub=new GithubSkills(join(root,'g'),async()=>fail('BACKUP_MANAGED_RUNTIME_REQUEST_REFUSED'),{candidate:true});try{
      const copied=checkGithub.backupState();if(backupJsonString({...copied,root:original.github.root,running:original.github.running,releases:copied.releases.map(row=>({...row,root:join(original.github.root,relative(join(root,'g'),row.root))}))})!==backupJsonString(original.github))fail();
    }finally{checkGithub.close();}
    const role=managedRuntimeRoleSchema.parse({schema:'dsh-zhen-managed-runtime-role-v1',home,profile,epoch,leaf,origin,rootIdentity,catalog:original.market.catalog,bundled:original.market.bundled,originalAutomatic:original.market.preferences.enabled===1||original.feed.status.automatic||original.github.sources.some(row=>row.automatic)});for(const item of[...role.catalog,...role.bundled])verifySkill(item);
    const record=Buffer.from(backupJsonString(role)+'\n');if(record.length>16*1024**2)fail('BACKUP_MANAGED_RUNTIME_LIMIT');await write(join(root,'role.json'),record);await assertCurrent();
    if(backupJsonString({market:owners.market.backupState(),local:owners.local.backupState(),github:owners.github.backupState(),feed:owners.feed.backupState()})!==baseline)fail();options.signal?.throwIfAborted();await currentRoot();complete=true;return {role,seal:hash(record),root};
  }finally{
    if(!complete&&rootIdentity){await currentRoot();if(relative(home,root)!==leaf||!/^m[a-f0-9]{12}$/.test(leaf))fail();await rm(root,{recursive:true,force:false});}
  }
}
