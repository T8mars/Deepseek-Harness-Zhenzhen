import {loadOptionalPatches,PROFILE_PATCH_FILENAME,PROFILES_DIR,PROFILE_COMPATIBILITY_FILENAME,readProfileCompatibility,readProfileManifest,readProfilePlugins,resolveProfileDir} from '@deepseek-ai/dsh-app-boot';
import type {ProfileContext,ProfileManifest,ProfilePluginDependency} from '@deepseek-ai/dsh-app-boot';
import type {PatchOptions} from '@deepseek-ai/cordis-plugin-include';
import {lstat,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join,relative} from 'node:path';
import {BackupError,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';
import {SUPPORTED_DSH} from './compatibility.ts';
import {assertBackupJson as plainJson,backupJsonString as json,parseBackupJson} from './backup-data.ts';

const SCHEMA='dsh-zhen-profile-snapshot-v1',MAX_PROFILES=128,MAX_DEPENDENCIES=2048,MAX_FILE_BYTES=8*1024**2,MAX_TOTAL_BYTES=32*1024**2;
const COVERAGE={credentialStoresIncluded:false,profileManifest:true,profilePatches:true,machinePatch:true,compatibility:true,packageArtifacts:false,packageManagerFiles:false,restoreImplemented:false} as const;
export interface ProfileBackupSource {
  home:string;
  installAnchor:string;
  active?:Pick<ProfileContext,'name'|'dir'|'cwd'|'startedBundles'|'overlays'|'telemetryDisabledEnv'>;
}
interface Layer {present:boolean;patches:PatchOptions[];}
export interface ProfileBackupDocument {
  schema:typeof SCHEMA;
  sdkVersion:string;
  originHome:string;
  machine:Layer;
  profiles:Array<{name:string;manifest:ProfileManifest;dependencies:readonly ProfilePluginDependency[];patch:Layer;compatibility:{present:boolean;exemptions:Record<string,string[]>}}>;
  active?:{name:string;cwd:string;startedBundles:readonly string[];overlays:readonly PatchOptions[];telemetryDisabled:boolean};
  coverage:{credentialStoresIncluded:false;profileManifest:true;profilePatches:true;machinePatch:true;compatibility:true;packageArtifacts:false;packageManagerFiles:false;restoreImplemented:false};
}
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
function segment(value:string):boolean{return !!value&&value.length<=255&&!['.','..'].includes(value)&&!/[\\/\x00-\x1f\x7f]/.test(value);}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:unknown,required:string[],optional:string[]=[]):value is Record<string,unknown>{return object(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));}
const text=(value:unknown,max=4096):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const strings=(value:unknown,max=MAX_DEPENDENCIES):value is string[]=>Array.isArray(value)&&value.length<=max&&value.every(item=>text(item));
function layer(value:unknown):boolean{return keys(value,['present','patches'])&&typeof value.present==='boolean'&&Array.isArray(value.patches)&&value.patches.every(object)&&(!value.present?value.patches.length===0:true);}
function validDocument(value:unknown):value is ProfileBackupDocument{
  if(!keys(value,['schema','sdkVersion','originHome','machine','profiles','coverage'],['active'])||value.schema!==SCHEMA||value.sdkVersion!==SUPPORTED_DSH||!text(value.originHome)||!layer(value.machine)||!Array.isArray(value.profiles)||value.profiles.length>MAX_PROFILES)return false;
  const coverage=value.coverage;if(!keys(coverage,Object.keys(COVERAGE))||Object.entries(COVERAGE).some(([key,expected])=>coverage[key]!==expected))return false;
  const names=new Set<string>();
  for(const item of value.profiles){
    if(!keys(item,['name','manifest','dependencies','patch','compatibility'])||typeof item.name!=='string'||!segment(item.name)||names.has(item.name)||!object(item.manifest)||!layer(item.patch)||!Array.isArray(item.dependencies)||item.dependencies.length>MAX_DEPENDENCIES||!keys(item.compatibility,['present','exemptions'])||typeof item.compatibility.present!=='boolean'||!object(item.compatibility.exemptions))return false;
    for(const field of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])if(item.manifest[field]!==undefined&&(!object(item.manifest[field])||!Object.values(item.manifest[field]).every(value=>text(value))))return false;
    if(item.dependencies.some(dependency=>!keys(dependency,['name','version','bundle','enabled'])||!text(dependency.name,256)||!text(dependency.version)||typeof dependency.bundle!=='boolean'||typeof dependency.enabled!=='boolean'))return false;
    if(Object.entries(item.compatibility.exemptions).some(([name,versions])=>!text(name)||!strings(versions)))return false;
    if(!item.compatibility.present&&Object.keys(item.compatibility.exemptions).length)return false;
    names.add(item.name);
  }
  if(value.active!==undefined&&(!keys(value.active,['name','cwd','startedBundles','overlays','telemetryDisabled'])||typeof value.active.name!=='string'||!names.has(value.active.name)||!text(value.active.cwd)||!strings(value.active.startedBundles)||!Array.isArray(value.active.overlays)||!value.active.overlays.every(object)||typeof value.active.telemetryDisabled!=='boolean'))return false;
  return true;
}
async function observation(file:string,directory=false):Promise<{identity:string;bytes:number;present:boolean}>{
  try{
    const stat=await lstat(file,{bigint:true});
    if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile()))throw new BackupError('BACKUP_PROFILE_FILE_INVALID');
    if(!directory&&stat.size>BigInt(MAX_FILE_BYTES))throw new BackupError('BACKUP_PROFILE_LIMIT');
    return {identity:(directory?[stat.dev,stat.ino]:[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs]).join(':'),bytes:directory?0:Number(stat.size),present:true};
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {identity:'absent',bytes:0,present:false};throw error;}
}
async function profileNames(home:string):Promise<string[]>{
  const directory=join(home,PROFILES_DIR);let entries;
  try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  // Public RuntimeResolution defines profiles/node_modules as the shared package
  // interception layer. It is not a named user profile.
  const names:string[]=[];
  for(const entry of entries){
    if(entry.name==='node_modules')continue;
    if(entry.isSymbolicLink())throw new BackupError('BACKUP_PROFILE_FILE_INVALID');
    if(entry.isDirectory()){if(!segment(entry.name))throw new BackupError('BACKUP_PROFILE_NAME_INVALID');names.push(entry.name);}
  }
  if(names.length>MAX_PROFILES)throw new BackupError('BACKUP_PROFILE_COUNT_LIMIT');return names.sort();
}
async function capture(source:ProfileBackupSource,options:BackupOptions):Promise<{document:ProfileBackupDocument;revision:string}>{
  options.signal?.throwIfAborted();
  if(!isAbsolute(source.home)||!isAbsolute(source.installAnchor))throw new BackupError('BACKUP_PATH_INVALID');
  const home=await realpath(source.home),homeState=await observation(home,true),profilesState=await observation(join(home,PROFILES_DIR),true),names=await profileNames(home);
  const files=[join(home,PROFILE_PATCH_FILENAME),...names.flatMap(name=>{const dir=resolveProfileDir(name,home);return [join(dir,'package.json'),join(dir,PROFILE_PATCH_FILENAME),join(dir,PROFILE_COMPATIBILITY_FILENAME)];})];
  const before=[];let total=0;
  for(const file of files){options.signal?.throwIfAborted();const state=await observation(file);if((total+=state.bytes)>MAX_TOTAL_BYTES)throw new BackupError('BACKUP_PROFILE_LIMIT');before.push(state);}
  const machine=loadOptionalPatches('dsh-zhen backup',files[0]),profiles:ProfileBackupDocument['profiles']=[];
  for(const name of names){
    options.signal?.throwIfAborted();const dir=resolveProfileDir(name,home);
    if(!before[files.indexOf(join(dir,'package.json'))].present)throw new BackupError('BACKUP_PROFILE_MANIFEST_MISSING');
    const manifest=readProfileManifest('dsh-zhen backup',dir);
    if(Object.keys(manifest.dependencies??{}).length>MAX_DEPENDENCIES)throw new BackupError('BACKUP_PROFILE_DEPENDENCY_LIMIT');
    const inventory=readProfilePlugins({binName:'dsh-zhen backup',profileDir:dir,installAnchor:source.installAnchor}),patches=loadOptionalPatches('dsh-zhen backup',join(dir,PROFILE_PATCH_FILENAME)),compat=readProfileCompatibility(dir);
    if(!compat.rewritable||compat.warnings.length)throw new BackupError('BACKUP_PROFILE_COMPATIBILITY_INVALID');
    const present=before[files.indexOf(join(dir,PROFILE_COMPATIBILITY_FILENAME))].present;
    profiles.push({name,manifest,dependencies:inventory.dependencies,patch:{present:patches!==undefined,patches:patches??[]},compatibility:{present,exemptions:compat.exemptions}});
  }
  let active:ProfileBackupDocument['active'];
  if(source.active){
    const value=source.active;if(!names.includes(value.name)||await realpath(value.dir)!==await realpath(resolveProfileDir(value.name,home)))throw new BackupError('BACKUP_PROFILE_ACTIVE_MISMATCH');
    active={name:value.name,cwd:value.cwd,startedBundles:value.startedBundles,overlays:value.overlays,telemetryDisabled:!!value.telemetryDisabledEnv};
  }
  const document:ProfileBackupDocument={schema:SCHEMA,sdkVersion:SUPPORTED_DSH,originHome:home,machine:{present:machine!==undefined,patches:machine??[]},profiles,...active?{active}:{},coverage:COVERAGE};
  const serialized=json(document);if(Buffer.byteLength(serialized)>MAX_TOTAL_BYTES)throw new BackupError('BACKUP_PROFILE_LIMIT');
  const detached:unknown=JSON.parse(serialized);if(!validDocument(detached))throw new BackupError('BACKUP_PROFILE_RECORD_INVALID');
  const after=[];for(const file of files){options.signal?.throwIfAborted();after.push(await observation(file));}
  if(json(before)!==json(after)||await realpath(source.home)!==home||json(await profileNames(home))!==json(names)||(await observation(home,true)).identity!==homeState.identity||(await observation(join(home,PROFILES_DIR),true)).identity!==profilesState.identity)throw new BackupError('BACKUP_SOURCE_CHANGED');
  return {document:detached,revision:hash(json({home:homeState.identity,profiles:profilesState.identity,files:after,document:detached}))};
}
/** Host-only logical snapshot; no module loading, config cleanup or credential reads. */
export async function* profileBackupRecords(resolve:()=>ProfileBackupSource,options:BackupOptions={}):AsyncGenerator<BackupRecord>{
  const read=async()=>{try{return await capture(resolve(),options);}catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROFILE_READ_FAILED');}};
  const initial=await read(),data=Buffer.from(json(initial.document));
  yield {metadata:{kind:'profile-snapshot',schema:SCHEMA,profiles:initial.document.profiles.length,credentialStoresIncluded:false},size:data.length,data:(async function*(){yield data;})()};
  if((await read()).revision!==initial.revision)throw new BackupError('BACKUP_SOURCE_CHANGED');
}
export async function writeProfileBackup(destination:string,password:string,resolve:()=>ProfileBackupSource,options:BackupOptions={}):Promise<BackupReceipt>{
  return writeBackupArchive(destination,password,profileBackupRecords(resolve,options),options);
}

/** Read to Host memory only. This is not profile activation or a private-file writer. */
export async function readProfileBackup(source:string,password:string,options:BackupOptions={}):Promise<ProfileBackupDocument>{
  const archive=await openBackupArchive(source,password,options);
  try{
    const records=archive.records(),first=await records.next();if(first.done)throw new BackupError('BACKUP_PROFILE_RECORD_INVALID');const item=first.value;
    if(!keys(item.metadata,['kind','schema','profiles','credentialStoresIncluded'])||item.metadata.kind!=='profile-snapshot'||item.metadata.schema!==SCHEMA||item.metadata.credentialStoresIncluded!==false||item.size>MAX_TOTAL_BYTES)throw new BackupError('BACKUP_PROFILE_RECORD_INVALID');
    const parts:Uint8Array[]=[];for await(const bytes of item.data)parts.push(bytes);const value=parseBackupJson(Buffer.concat(parts,item.size));
    plainJson(value);
    if(!validDocument(value)||value.profiles.length!==item.metadata.profiles)throw new BackupError('BACKUP_PROFILE_RECORD_INVALID');
    if(!(await records.next()).done)throw new BackupError('BACKUP_PROFILE_RECORD_INVALID');return value;
  }finally{await archive.close();}
}
