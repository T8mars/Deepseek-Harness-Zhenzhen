import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,mkdtemp,mkdir,readFile,writeFile,realpath,rm,open,readdir,readlink,unlink,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRuntimeResolution,writeProfileManifest,readProfileManifest,PROFILES_DIR} from '@deepseek-ai/dsh-app-boot';
import type {ProfileManifest} from '@deepseek-ai/dsh-app-boot';
import {BackupError,openBackupArchive,writeBackupArchive,DEFAULT_BACKUP_LIMITS} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';
import {prepareProfileBackup} from './backup-profiles.ts';
import type {ProfileBackupSource} from './backup-profiles.ts';
import {preparePackageBackup,restorePackageBackup} from './backup-packages.ts';
import type {PackageRestoreCandidate} from './backup-packages.ts';
import type {PackageBackupSource} from './backup-package-graph.ts';
import {packageOriginApi,packageOriginFile} from './backup-package-graph.ts';
import {originKey} from './backup-skill-projection.ts';
import {restoreProfileBackup} from './backup-profile-restore.ts';
import type {ProfileRestoreCandidate,RestoredProfile} from './backup-profile-restore.ts';
import {backupJsonString as json} from './backup-data.ts';
import {SUPPORTED_DSH} from './compatibility.ts';

const SCHEMA='dsh-zhen-profile-packages-v1',FIELDS=['dependencies','devDependencies','optionalDependencies','peerDependencies'] as const;
type Field=typeof FIELDS[number];
type DependencyManifest=ProfileManifest&Partial<Record<Field,Record<string,string>>>;
export interface ProfilePackageBackupSource {profiles:()=>ProfileBackupSource;packages:()=>PackageBackupSource;includeProfileDependencies?:boolean;}
export interface ProfilePackageRestoreOptions extends BackupOptions {
  /** Trusted Host-selected published SDK. Never a Remote/tool argument. */
  installAnchor:string;
}
export interface ProfilePackageBinding {profile:string;field:Field;name:string;originSpec:string;node:string;directory:string;scope:'restored'|'current-installation';}
export interface ProfilePackageIssue {profile:string;field:Field;name:string;reason:'PACKAGE_NOT_CAPTURED'|'PACKAGE_UNAVAILABLE';}
export interface ProfilePackageRestoreCandidate {
  root:string;profiles:ProfileRestoreCandidate;packages:PackageRestoreCandidate;bindings:ProfilePackageBinding[];issues:ProfilePackageIssue[];
  assembledProfiles:string[];provenance:string;activated:false;readyForActivation:false;
  coverage:{profileAndPackageSnapshot:true;retainedSourceBarriers:true;publicOfflineAssembly:true;originalPackageManagerFiles:false;otherApplicationState:false;wholeApplicationRestore:false};
}
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function inside(root:string,path:string):boolean{const part=relative(root,path);return !!part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');}
async function removeOwned(parent:string,root:string,prefix:string):Promise<void>{const stat=await lstat(root),actual=await realpath(root),part=relative(parent,actual);if(stat.isSymbolicLink()||!stat.isDirectory()||!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith(prefix))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
async function digest(file:string,signal?:AbortSignal):Promise<string>{const result=createHash('sha256');for await(const bytes of createReadStream(file,{signal})){signal?.throwIfAborted();result.update(bytes);}return result.digest('hex');}
/** Nested components remain encrypted at rest. The outer authenticated record
 * order binds their complete bytes and both retained source leases. */
export interface ProfilePackageBackupLease {records():AsyncGenerator<BackupRecord>;assertCurrent():Promise<void>;close():Promise<void>;}
export async function prepareProfilePackageBackup(password:string,source:ProfilePackageBackupSource,options:BackupOptions={}):Promise<ProfilePackageBackupLease>{
  const profile=await prepareProfileBackup(source.profiles,options);let packages:Awaited<ReturnType<typeof preparePackageBackup>>|undefined,root:string|undefined;
  const base=await realpath(tmpdir());let retained=false,closed=false,used=false;
  const close=async()=>{if(closed)return;closed=true;try{profile.close();await packages?.close();}finally{if(root)await removeOwned(base,root,'dsh-zhen-component-backup-');}};
  try{
    const seeds=source.includeProfileDependencies?profile.document.profiles.flatMap((item,index)=>FIELDS.flatMap(field=>Object.keys((item.manifest as DependencyManifest)[field]??{}).map(name=>({key:hash(index+':'+field+':'+name),name,parentURL:pathToFileURL(join(profile.document.originHome,PROFILES_DIR,item.name,'package.json')).href,scope:'profile' as const})))):[];
    packages=await preparePackageBackup(()=>{const selected=source.packages();return {...selected,seeds:[...selected.seeds,...seeds]};},options);root=await realpath(await mkdtemp(join(base,'dsh-zhen-component-backup-')));
    const files=[join(root,'profiles.encrypted'),join(root,'packages.encrypted')];
    const receipts=[await writeBackupArchive(files[0],password,profile.records(),options),await writeBackupArchive(files[1],password,packages.records(),options)];
    const chunkBytes=Math.min(4*1024**2,options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes),header=Buffer.from(json({schema:SCHEMA,sdkVersion:SUPPORTED_DSH,chunkBytes,components:receipts.map((row,index)=>({kind:index===0?'profiles':'packages',sha256:row.sha256,bytes:row.bytes}))}));
    const packageLease=packages;
    const assertCurrent=async()=>{if(closed)throw new BackupError('BACKUP_READER_CLOSED');await profile.assertCurrent();await packageLease.assertCurrent();};
    async function* records():AsyncGenerator<BackupRecord>{
      await profile.assertCurrent();await packageLease.assertCurrent();
      yield {metadata:{kind:'profile-packages',schema:SCHEMA},size:header.length,data:(async function*(){yield header;})()};
      for(let i=0;i<files.length;i++)for(let offset=0;offset<receipts[i].bytes;offset+=chunkBytes){options.signal?.throwIfAborted();const size=Math.min(chunkBytes,receipts[i].bytes-offset);yield {metadata:{kind:i===0?'profiles':'packages',sha256:receipts[i].sha256,offset},size,data:createReadStream(files[i],{start:offset,end:offset+size-1,signal:options.signal})};}
      await profile.assertCurrent();await packageLease.assertCurrent();
    }
    retained=true;return {assertCurrent,close,async*records(){if(closed||used)throw new BackupError('BACKUP_READER_CLOSED');used=true;yield*records();}};
  }finally{if(!retained)await close();}
}
export async function writeProfilePackageBackup(destination:string,password:string,source:ProfilePackageBackupSource,options:BackupOptions={}):Promise<BackupReceipt>{
  const lease=await prepareProfilePackageBackup(password,source,options);
  try{return await writeBackupArchive(destination,password,lease.records(),options);}finally{await lease.close();}
}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{return object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
async function materialize(records:AsyncGenerator<BackupRecord>,root:string,options:BackupOptions):Promise<[string,string]>{
  const first=await records.next();if(first.done||!exact(first.value.metadata,['kind','schema'])||first.value.metadata.kind!=='profile-packages'||first.value.metadata.schema!==SCHEMA||first.value.size>4096)throw new BackupError('BACKUP_COMPONENT_INVALID');
  const bytes:Uint8Array[]=[];for await(const part of first.value.data)bytes.push(part);let header:unknown;try{header=JSON.parse(Buffer.concat(bytes,first.value.size).toString('utf8'));}catch{throw new BackupError('BACKUP_COMPONENT_INVALID');}
  if(!exact(header,['schema','sdkVersion','chunkBytes','components'])||header.schema!==SCHEMA||header.sdkVersion!==SUPPORTED_DSH||!Number.isSafeInteger(header.chunkBytes)||Number(header.chunkBytes)<1||Number(header.chunkBytes)>Math.min(4*1024**2,options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes)||!Array.isArray(header.components)||header.components.length!==2)throw new BackupError('BACKUP_COMPONENT_INVALID');
  const files:[string,string]=[join(root,'profiles.encrypted'),join(root,'packages.encrypted')];
  for(let i=0;i<2;i++){
    const expected=header.components[i],kind=i===0?'profiles':'packages';
    if(!exact(expected,['kind','sha256','bytes'])||expected.kind!==kind||typeof expected.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(expected.sha256)||!Number.isSafeInteger(expected.bytes)||Number(expected.bytes)<1||Number(expected.bytes)>(options.limits?.archiveBytes??DEFAULT_BACKUP_LIMITS.archiveBytes))throw new BackupError('BACKUP_COMPONENT_INVALID');
    const file=await open(files[i],'wx',0o600),sum=createHash('sha256');let count=0;
    try{while(count<Number(expected.bytes)){const next=await records.next();if(next.done||!exact(next.value.metadata,['kind','sha256','offset'])||next.value.metadata.kind!==kind||next.value.metadata.sha256!==expected.sha256||next.value.metadata.offset!==count||next.value.size!==Math.min(Number(header.chunkBytes),Number(expected.bytes)-count))throw new BackupError('BACKUP_COMPONENT_INVALID');for await(const part of next.value.data){options.signal?.throwIfAborted();sum.update(part);count+=part.length;let offset=0;while(offset<part.length){const written=await file.write(part,offset,part.length-offset);if(!written.bytesWritten)throw new BackupError('BACKUP_WRITE_FAILED');offset+=written.bytesWritten;}}}await file.sync();}finally{await file.close();}
    if(count!==expected.bytes||sum.digest('hex')!==expected.sha256)throw new BackupError('BACKUP_COMPONENT_INVALID');
  }
  if(!(await records.next()).done)throw new BackupError('BACKUP_COMPONENT_INVALID');return files;
}
/** Observe output resources without following links. Assembly must never alter
 * recovered package bytes or link relationships. */
async function packageRevision(root:string,options:BackupOptions):Promise<string>{
  const rows:unknown[]=[];let count=0;
  async function walk(path:string):Promise<void>{for(const entry of(await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){options.signal?.throwIfAborted();if(++count>90_000)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');const file=join(path,entry.name),stat=await lstat(file);if(stat.isSymbolicLink()){if(!inside(root,await realpath(file)))throw new BackupError('BACKUP_TEMP_BOUNDARY');rows.push([relative(root,file),'link',await readlink(file)]);}else if(stat.isDirectory()){rows.push([relative(root,file),'dir']);await walk(file);}else if(stat.isFile())rows.push([relative(root,file),'file',stat.size,await digest(file,options.signal)]);else throw new BackupError('BACKUP_RESOURCE_INVALID');}}
  await walk(root);return hash(json(rows));
}
async function planBindings(profiles:ProfileRestoreCandidate,packages:PackageRestoreCandidate,anchor:string):Promise<{bindings:ProfilePackageBinding[];issues:ProfilePackageIssue[]}>{
  const installation=await createRuntimeResolution({installAnchor:anchor,home:profiles.home}),bindings:ProfilePackageBinding[]=[],issues:ProfilePackageIssue[]=[],nodes=new Map(packages.packages.map(row=>[row.id,row]));
  for(const profile of profiles.profiles){
    const api=packageOriginApi(profiles.document.originHome),parent=originKey(api.join(profiles.document.originHome,PROFILES_DIR,profile.originName,'package.json'));
    for(const field of FIELDS)for(const [name,originSpec]of Object.entries((profile.manifest as DependencyManifest)[field]??{})){
      const seeds=packages.document.seeds.filter(row=>row.name===name&&originKey(packageOriginFile(row.parentURL))===parent),ids=new Set(seeds.map(row=>row.node).filter((id):id is string=>!!id));
      if(ids.size>1)throw new BackupError('BACKUP_PROFILE_PACKAGE_AMBIGUOUS');const id=[...ids][0],node=id?nodes.get(id):undefined;
      if(!node){issues.push({profile:profile.originName,field,name,reason:seeds.length?'PACKAGE_UNAVAILABLE':'PACKAGE_NOT_CAPTURED'});continue;}
      const original=packages.document.nodes.find(row=>row.id===id)!,owned=packages.document.resolution?.entries.find(row=>row.scope==='installation'&&originKey(row.packageDir)===originKey(original.root));
      let directory=node.directory,scope:'restored'|'current-installation'='restored';
      if(owned){const current=installation.entries.find(row=>row.scope==='installation'&&row.name===owned.name&&row.version===owned.version);if(!current)throw new BackupError('BACKUP_PROFILE_SDK_MISMATCH');directory=current.packageDir;scope='current-installation';}
      if(bindings.some(row=>row.profile===profile.originName&&row.name===name&&row.directory!==directory))throw new BackupError('BACKUP_PROFILE_PACKAGE_AMBIGUOUS');bindings.push({profile:profile.originName,field,name,originSpec:String(originSpec),node:id,directory,scope});
    }
  }
  return {bindings,issues};
}
async function assemble(profile:RestoredProfile,bindings:ProfilePackageBinding[],options:ProfilePackageRestoreOptions):Promise<void>{
  const byName=new Map(bindings.map(row=>[row.name,row.directory]));
  // Standard Node resolution paths, not pnpm's private virtual-store format.
  // Exact target bytes are already authenticated; no installer or package hook
  // needs to resolve a version, filter files, or create a second package copy.
  for(const [name,directory]of byName){options.signal?.throwIfAborted();const parts=name.split('/'),modules=join(profile.directory,'node_modules'),parent=parts.length===2?join(modules,parts[0]):modules;await mkdir(parent,{recursive:true,mode:0o700});for(const path of[modules,parent])if((await lstat(path)).isSymbolicLink())throw new BackupError('BACKUP_PROFILE_PACKAGE_LINK_MISMATCH');const path=join(parent,parts.at(-1)!);await symlink(directory,path,process.platform==='win32'?'junction':'dir');}
  options.signal?.throwIfAborted();
  const manifest:DependencyManifest=structuredClone(profile.manifest);for(const binding of bindings){manifest[binding.field]??={};manifest[binding.field]![binding.name]='link:'+binding.directory;if(await realpath(join(profile.directory,'node_modules',...binding.name.split('/')))!==await realpath(binding.directory))throw new BackupError('BACKUP_PROFILE_PACKAGE_LINK_MISMATCH');}
  writeProfileManifest(profile.directory,manifest);if(json(readProfileManifest('dsh-zhen restore',profile.directory))!==json(manifest))throw new BackupError('BACKUP_PROFILE_MANIFEST_INVALID');profile.manifest=manifest;
}
/** Fresh inactive candidate only. Public SDK manifest writers and standard
 * Node links assemble exact resources without a package manager or app launch. */
export async function restoreProfilePackageBackup(source:string,password:string,parent:string,options:ProfilePackageRestoreOptions):Promise<ProfilePackageRestoreCandidate>{
  options.signal?.throwIfAborted();if(!isAbsolute(parent)||!isAbsolute(options.installAnchor))throw new BackupError('BACKUP_PATH_INVALID');
  const anchor=JSON.parse(await readFile(options.installAnchor,'utf8'));if(anchor.name!=='@deepseek-ai/dsh'||anchor.version!==SUPPORTED_DSH)throw new BackupError('BACKUP_PROFILE_SDK_MISMATCH');
  const base=await realpath(parent),archive=await openBackupArchive(source,password,options);let root:string|undefined,complete=false;
  try{
    root=await realpath(await mkdtemp(join(base,'dsh-zhen-environment-restore-')));const files=await materialize(archive.records(),root,options),profiles=await restoreProfileBackup(files[0],password,root,options),packages=await restorePackageBackup(files[1],password,root,options);
    if(!packages.compatibility.platformMatches||!packages.compatibility.abiMatches)throw new BackupError('BACKUP_PACKAGE_PLATFORM_MISMATCH');
    const {bindings,issues}=await planBindings(profiles,packages,options.installAnchor),before=await packageRevision(packages.root,options),assembledProfiles:string[]=[];
    for(const profile of profiles.profiles){options.signal?.throwIfAborted();const own=bindings.filter(row=>row.profile===profile.originName);if(profile.launchBlockedReason||issues.some(row=>row.profile===profile.originName)){profile.launch=null;continue;}await assemble(profile,own,options);assembledProfiles.push(profile.originName);}
    if(await packageRevision(packages.root,options)!==before)throw new BackupError('BACKUP_RESTORED_PACKAGE_CHANGED');
    // Replace only our own generated receipt after assembly. Original manifests,
    // constraints, compatibility and source names remain in document/provenance.
    await writeFile(profiles.provenance,json(profiles)+'\n',{mode:0o600});for(const file of files)await unlink(file);
    const provenance=join(root,'dsh-zhen-environment-restore.json'),result:ProfilePackageRestoreCandidate={root,profiles,packages,bindings,issues,assembledProfiles,provenance,activated:false,readyForActivation:false,coverage:{profileAndPackageSnapshot:true,retainedSourceBarriers:true,publicOfflineAssembly:true,originalPackageManagerFiles:false,otherApplicationState:false,wholeApplicationRestore:false}};
    await writeFile(provenance,json(result)+'\n',{flag:'wx',mode:0o600});options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROFILE_PACKAGE_RESTORE_FAILED');}
  finally{try{await archive.close();}finally{if(root&&!complete)await removeOwned(base,root,'dsh-zhen-environment-restore-');}}
}
