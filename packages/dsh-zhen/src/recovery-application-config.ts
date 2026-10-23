import {createHash,randomUUID} from 'node:crypto';
import {readFile,lstat,realpath,mkdir,writeFile,symlink} from 'node:fs/promises';
import {dirname,join,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {writeFileAtomic} from '@deepseek-ai/dsh-atomic-write';
import {composeEntries,createRuntimeResolution,loadProfile,loadOverlayPatches,readProfilePatches,readProfileManifest,writeProfileManifest} from '@deepseek-ai/dsh-app-boot';
import type {EntryOptions} from '@deepseek-ai/cordis-plugin-loader';
import type {PatchOptions} from '@deepseek-ai/cordis-plugin-include';
import type {ProfileContext} from '@deepseek-ai/dsh-app-boot';
import {BackupError} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {assertRecoveryReceipt} from './recovery-catalog.ts';
import {verifyRecoveryCandidate} from './recovery-candidate.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';
import {restoredPermissionConfig} from './restore-permissions.ts';
import {SUPPORTED_DSH} from './compatibility.ts';

const reporting=new Set(['@deepseek-ai/dsh-session-log-deepseek','@deepseek-ai/dsh-plugin-package-inventory-deepseek','@deepseek-ai/dsh-deepseek-llm-api-extensions','@deepseek-ai/dsh-otel','@deepseek-ai/dsh-session-telemetry-otel','@deepseek-ai/dsh-host-product-telemetry-otel','@deepseek-ai/dsh-client-product-analytics','@deepseek-ai/dsh-client-ui-brand-official']);
const workspace='@deepseek-ai/dsh-workspace';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const literal=(value:unknown):value is Record<string,unknown>=>object(value)&&!Object.hasOwn(value,'__jsExpr');
const key=(value:string)=>process.platform==='win32'?value.toLowerCase():value;
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
function fail(code='BACKUP_APPLICATION_REVIEW_INVALID'):never{throw new BackupError(code);}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(object(value))return Object.fromEntries(Object.keys(value).sort().filter(name=>value[name]!==undefined).map(name=>[name,canonical(value[name])]));return value;}
const digest=(value:unknown)=>createHash('sha256').update(backupJsonString(canonical(value))).digest('hex');
async function ordinary(root:string,path:string,kind:'file'|'directory'):Promise<void>{
 if(!inside(root,path))fail('BACKUP_TEMP_BOUNDARY');let current=path;
 for(;;){const info=await lstat(current);if(info.isSymbolicLink()||key(await realpath(current))!==key(current)||current===path&&(kind==='file'?!info.isFile():!info.isDirectory()))fail('BACKUP_TEMP_BOUNDARY');if(key(current)===key(root))return;const parent=dirname(current);if(parent===current)fail('BACKUP_TEMP_BOUNDARY');current=parent;}
}
async function jsonFile(root:string,path:string):Promise<unknown>{await ordinary(root,path,'file');const info=await lstat(path);if(info.size>16*1024**2)fail('BACKUP_APPLICATION_LIMIT');return parseBackupJson(await readFile(path));}
function flatten(rows:EntryOptions[],disabled=false):EntryOptions[]{return rows.flatMap(row=>[disabled?{...row,disabled:true}:row,...row.group&&Array.isArray(row.config)?flatten(row.config,disabled||row.disabled===true):[]]);}
function config(row:EntryOptions):Record<string,unknown>{if(row.config!==undefined&&!literal(row.config))fail('BACKUP_APPLICATION_CONFIG_REVIEW');return structuredClone(row.config??{}) as Record<string,unknown>;}
/** This reserved entry is launch-local, not a restored program or permission.
 * Older snapshots may retain its harmless metadata; never reactivate an old
 * execution's control channel or its original absolute module path. */
export function ephemeralRecoveryRuntime(item:EntryOptions):boolean{if(item.id!=='dsh-zhen-recovery-runtime'||!literal(item.config)||item.config.schema!=='dsh-zhen-recovery-runtime-v1')return false;try{const url=new URL(item.name);return url.protocol==='file:'&&url.pathname.endsWith('/recovery-application-runtime.js');}catch{return false;}}
export interface RecoveryProgram {id:string;name:string;enabled:boolean;origin:'installed'|'restored'|'unresolved';version:string|null;}
export interface RecoveryApplicationConfig {
 readonly root:string;readonly home:string;readonly agentsHome:string;readonly profile:string;readonly originName:string;readonly cwd:string;readonly installAnchor:string;
 readonly baseline:RecoveryBaseline;readonly entries:EntryOptions[];readonly programs:RecoveryProgram[];readonly unresolvedPrograms:number;readonly digest:string;readonly sourceManifestDigest:string;
 readonly profiles:Array<{name:string;title:string;available:boolean}>;
}
/** Host-only retained-baseline inspection. Restored modules and expressions
 * are read as data; no profile is booted and no package manager is run. */
export async function inspectRecoveryApplication(baseline:RecoveryBaseline,profileName:string,installAnchor:string,signal?:AbortSignal):Promise<RecoveryApplicationConfig>{
 signal?.throwIfAborted();await assertRecoveryReceipt(baseline);if((await verifyRecoveryCandidate(baseline,{signal})).integrity!=='unchanged')fail('BACKUP_CANDIDATE_CHANGED');
 const root=baseline.root,recipe=await jsonFile(root,join(root,'dsh-zhen-application-restore.json'));
 if(!object(recipe)||recipe.schema!=='dsh-zhen-application-restore-v1'||recipe.sdkVersion!==SUPPORTED_DSH||recipe.activated!==false||recipe.reviewRequired!==true||typeof recipe.home!=='string'||typeof recipe.agentsHome!=='string'||!Array.isArray(recipe.profiles))fail();
 const home=recipe.home,agentsHome=recipe.agentsHome;await ordinary(root,home,'directory');await ordinary(root,agentsHome,'directory');
 const anchor=await realpath(installAnchor),sdk=parseBackupJson(await readFile(anchor));if(!object(sdk)||sdk.name!=='@deepseek-ai/dsh'||sdk.version!==SUPPORTED_DSH)fail('BACKUP_PROFILE_SDK_MISMATCH');
 const profiles:Array<{name:string;title:string;available:boolean}>=[];
 for(const item of recipe.profiles.filter(object)){
  signal?.throwIfAborted();let available=false;
  if(typeof item.name==='string'&&/^[A-Za-z0-9_-]{1,255}$/.test(item.name)&&object(item.launch)&&Array.isArray(item.launch.args)&&typeof item.launch.args[3]==='string'&&typeof item.launch.cwd==='string'&&String(item.originName).toLowerCase()!=='desktop')try{
   const dir=join(home,'profiles',item.name);await ordinary(root,dir,'directory');await ordinary(root,join(dir,'package.json'),'file');await ordinary(root,item.launch.args[3],'file');
   const profile=loadProfile('dsh-zhen recovery',item.name,anchor,home),context:ProfileContext={name:item.name,dir:profile.dir,patchPath:profile.patchPath,installAnchor:anchor,cwd:item.launch.cwd,home,startedBundles:profile.layers.map(layer=>layer.packageName),overlays:loadOverlayPatches('dsh-zhen recovery',item.launch.args[3]),telemetryDisabledEnv:'1'},rows=flatten(composeEntries([readProfilePatches('dsh-zhen recovery',context,profile)]));
   available=!profile.skippedBundles.length&&['@deepseek-ai/dsh-host-webserver','@deepseek-ai/dsh-web-app'].every(name=>rows.some(row=>row.name===name&&row.disabled!==true));
  }catch{signal?.throwIfAborted();}
  profiles.push({name:String(item.name),title:String(item.originName).slice(0,255),available});
 }
 if(!profileName)profileName=profiles.find(item=>item.available)?.name??'';
 if(!profiles.some(item=>item.name===profileName&&item.available))fail('BACKUP_APPLICATION_PROFILE_UNAVAILABLE');
 const selected=recipe.profiles.filter(item=>object(item)&&item.name===profileName);if(selected.length!==1)fail();const row=selected[0] as Record<string,unknown>;
 if(!/^[A-Za-z0-9_-]{1,255}$/.test(profileName)||typeof row.originName!=='string'||row.originName.toLowerCase()==='desktop'||!object(row.launch)||!object(row.launch.env)||!Array.isArray(row.launch.args)||typeof row.launch.cwd!=='string'||!Array.isArray(row.paused))fail('BACKUP_APPLICATION_PROFILE_UNAVAILABLE');
 const args=row.launch.args;if(args.length!==6||args[0]!=='--profile'||args[1]!==profileName||args[2]!=='--patch'||typeof args[3]!=='string'||args[4]!=='--patch'||typeof args[5]!=='string'||row.overlay!==args[5]||row.launch.env.DSH_HOME!==home||row.launch.env.DSH_AGENTS_HOME!==agentsHome||row.launch.env.DSH_TELEMETRY_DISABLED!=='1')fail();
 const cwd=row.launch.cwd;await ordinary(root,cwd,'directory');for(const path of[args[3],args[5]])await ordinary(root,path,'file');
 const profile=loadProfile('dsh-zhen recovery',profileName,anchor,home);if(profile.skippedBundles.length)fail('BACKUP_APPLICATION_PROFILE_UNAVAILABLE');
 const context:ProfileContext={name:profileName,dir:profile.dir,patchPath:profile.patchPath,installAnchor:anchor,cwd,home,startedBundles:profile.layers.map(layer=>layer.packageName),overlays:loadOverlayPatches('dsh-zhen recovery',args[3]),telemetryDisabledEnv:'1'};
 const original=flatten(composeEntries([readProfilePatches('dsh-zhen recovery',context,profile)]));
 const activeWorkspace=new Set(original.filter(entry=>entry.name===workspace&&entry.disabled!==true).map(entry=>entry.id));if(!activeWorkspace.size)fail('BACKUP_APPLICATION_WORKSPACE_DISABLED');
 const fullContext:ProfileContext={...context,overlays:[...context.overlays,...loadOverlayPatches('dsh-zhen recovery',args[5])]};
 const source=composeEntries([readProfilePatches('dsh-zhen recovery',fullContext,profile)]),ids=new Set<string>();let total=0;
 function normalize(rows:EntryOptions[],depth=0):EntryOptions[]{if(depth>12)fail('BACKUP_APPLICATION_LIMIT');return rows.filter(item=>!ephemeralRecoveryRuntime(item)).map(item=>{
  signal?.throwIfAborted();if(++total>10000||ids.has(item.id))fail('BACKUP_APPLICATION_LIMIT');ids.add(item.id);const next=structuredClone(item);
  if(next.group&&Array.isArray(next.config))next.config=normalize(next.config,depth+1);
  const permissions=restoredPermissionConfig(next.name,next.config);if(permissions)next.config=permissions;
  if(next.name===workspace&&activeWorkspace.has(next.id))next.disabled=false;
  if(next.name==='@deepseek-ai/dsh-schedule'||reporting.has(next.name))next.disabled=true;
  if(next.name==='@deepseek-ai/dsh-host-webserver')next.config={...config(next),host:'127.0.0.1',port:0,tls:null};
  if(next.name==='@deepseek-ai/dsh-web-app'){const value=config(next);delete value.publicUrl;next.config={...value,openBrowser:false,printUrl:false};}
  return next;
 });}
 const entries=normalize(source),effective=flatten(entries);
 if(!effective.some(item=>item.name===workspace&&item.disabled!==true))fail('BACKUP_APPLICATION_WORKSPACE_DISABLED');
 const resolution=await createRuntimeResolution({installAnchor:anchor,profile,home}),packages=new Map<string,{packageDir:string;version?:string}>(resolution.entries.map(item=>[item.name,item]));
 // The public runtime table intentionally omits selected bundle roots. Those
 // modules still resolve through the ordinary profile package directory.
 // Read their manifests as data; never import a program to identify its source.
 for(const layer of profile.layers)if(!packages.has(layer.packageName)){const metadata=parseBackupJson(await readFile(join(layer.packageDir,'package.json')));packages.set(layer.packageName,{packageDir:layer.packageDir,version:object(metadata)&&typeof metadata.version==='string'?metadata.version:undefined});}
 const require=createRequire(join(profile.dir,'package.json'));
 const installation=await createRuntimeResolution({installAnchor:anchor,home}),installationPaths=new Set(await Promise.all(installation.entries.map(async item=>key(await realpath(item.packageDir))))),programs:RecoveryProgram[]=[];
 for(const item of effective.filter(item=>!item.group)){
  const name=item.name.startsWith('@')?item.name.split('/').slice(0,2).join('/'):item.name.split('/')[0];let source=packages.get(name),origin:RecoveryProgram['origin']='unresolved';
  if(!source&&!item.name.startsWith('file:')&&!isAbsolute(item.name))try{const manifest=await realpath(require.resolve(name+'/package.json')),metadata=parseBackupJson(await readFile(manifest));if(object(metadata)&&metadata.name===name)source={packageDir:dirname(manifest),version:typeof metadata.version==='string'?metadata.version:undefined};}catch{/* A non-resolvable package remains visible and cannot be approved. */}
  // Ownership comes from physical public-resolution facts, never a namespace.
  if(source){const path=await realpath(source.packageDir);if(installationPaths.has(key(path)))origin='installed';else if(inside(root,path))origin='restored';}
  else if(item.name.startsWith('file:')||isAbsolute(item.name)){try{const path=await realpath(item.name.startsWith('file:')?fileURLToPath(item.name):item.name);await ordinary(root,path,'file');origin='restored';}catch{/* Kept visible as unresolved; it cannot be opened. */}}
  programs.push({id:/^[A-Za-z0-9_-]{1,100}$/.test(item.id)?item.id:digest(item.id).slice(0,16),name:/^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*(?:\/[a-z0-9_.-]+)*$/.test(item.name)?item.name:'本地自定义程序',enabled:item.disabled!==true,origin,version:source?.version??null});
 }
 const sourceManifestDigest=digest(readProfileManifest('dsh-zhen recovery',profile.dir));
 const cli=join(dirname(anchor),'lib','bin.js');await ordinary(dirname(anchor),cli,'file');
 return{root,home,agentsHome,profile:profileName,originName:row.originName,cwd,installAnchor:anchor,baseline:structuredClone(baseline),entries,programs,profiles,unresolvedPrograms:programs.filter(item=>item.enabled&&item.origin==='unresolved').length,digest:digest({baseline:baseline.sha256,root,home,agentsHome,cwd,installAnchor:anchor,cli:hashBytes(await readFile(cli)),profile:profileName,entries,programs,sourceManifestDigest,sdk:SUPPORTED_DSH}),sourceManifestDigest};
}
function hashBytes(value:Uint8Array):string{return createHash('sha256').update(value).digest('hex');}

export interface AdoptedRecoveryApplication {profile:string;home:string;agentsHome:string;cwd:string;bundle:string;bundleDirectory:string;programDigest:string;requiresZhen:boolean;}
/** Reopening is a new program launch: reject replaced directories before the
 * public loader reads or executes anything from the retained application. */
export async function assertRecoveryApplicationLaunch(root:string,adopted:AdoptedRecoveryApplication):Promise<void>{
 for(const path of[adopted.home,adopted.agentsHome,adopted.cwd,adopted.bundleDirectory])await ordinary(root,path,'directory');
 const profile=join(adopted.home,'profiles',adopted.profile);await ordinary(root,profile,'directory');for(const path of[join(profile,'package.json'),join(profile,'cordis.patch.yml'),join(adopted.bundleDirectory,'package.json'),join(adopted.bundleDirectory,'cordis.patch.yml')])await ordinary(root,path,'file');
}
/** A narrow launch overlay leaves ordinary configuration editable. Only the
 * local listener and this execution's own control entry are command-line owned. */
export async function recoveryApplicationLaunchPatches(adopted:AdoptedRecoveryApplication,installAnchor:string,monitor:EntryOptions):Promise<PatchOptions[]>{
 const profile=loadProfile('dsh-zhen recovery',adopted.profile,installAnchor,adopted.home);if(profile.skippedBundles.length)fail('BACKUP_APPLICATION_PROFILE_UNAVAILABLE');
 const context:ProfileContext={name:adopted.profile,dir:profile.dir,patchPath:profile.patchPath,installAnchor,cwd:adopted.cwd,home:adopted.home,startedBundles:profile.layers.map(row=>row.packageName),overlays:[],telemetryDisabledEnv:'1'},entries=flatten(composeEntries([readProfilePatches('dsh-zhen recovery',context,profile)])),patches:PatchOptions[]=[];
 for(const row of entries){if(row.name==='@deepseek-ai/dsh-host-webserver')patches.push({id:row.id,name:row.name,config:{...config(row),host:'127.0.0.1',port:0,tls:null}});if(row.name==='@deepseek-ai/dsh-web-app'){const value=config(row);delete value.publicUrl;patches.push({id:row.id,name:row.name,config:{...value,openBrowser:false,printUrl:false}});}}
 const previous=entries.find(row=>row.id===monitor.id);if(previous){if(!ephemeralRecoveryRuntime(previous))fail('BACKUP_APPLICATION_RUNTIME_CONFLICT');patches.push({...monitor,disabled:false});}else patches.push({insert:[monitor]});return patches;
}
/** Explicitly consumes the prepared application copy. The encrypted archive
 * and separate session/workspace/knowledge components remain retained. No
 * persistent command-line overlay masks subsequent ConfigEditor edits. */
export async function adoptRecoveryApplication(plan:RecoveryApplicationConfig,approvedDigest:string,signal?:AbortSignal):Promise<AdoptedRecoveryApplication>{
 if(approvedDigest!==plan.digest)fail('BACKUP_APPLICATION_REVIEW_CHANGED');signal?.throwIfAborted();
 const fresh=await inspectRecoveryApplication(plan.baseline,plan.profile,plan.installAnchor,signal);if(fresh.digest!==plan.digest)fail('BACKUP_APPLICATION_REVIEW_CHANGED');
 plan=fresh;
 if(plan.unresolvedPrograms)fail('BACKUP_APPLICATION_PROGRAM_UNAVAILABLE');
 const ownedHome=join(plan.home,'dsh-zhen');await mkdir(ownedHome,{recursive:true,mode:0o700});await ordinary(plan.root,ownedHome,'directory');
 const directory=join(ownedHome,'recovery-app-'+randomUUID()),bundle='dsh-zhen-recovered-'+plan.digest.slice(0,16);await mkdir(directory,{mode:0o700});
 const bundleDirectory=join(directory,'bundle');await mkdir(bundleDirectory,{mode:0o700});
 await writeFile(join(bundleDirectory,'package.json'),backupJsonString({name:bundle,version:'0.1.0',private:true,type:'module',license:'MIT',engines:{dsh:SUPPORTED_DSH},dsh:{bundle:{patch:'./cordis.patch.yml'}}})+'\n',{flag:'wx',mode:0o600});
 await writeFile(join(bundleDirectory,'cordis.patch.yml'),'# Source: restored application snapshot; DSH '+SUPPORTED_DSH+'.\n# Complete reviewed tree; normal profile edits override this bundle.\n'+backupJsonString([{insert:plan.entries}])+'\n',{flag:'wx',mode:0o600});
 signal?.throwIfAborted();const loaded=loadProfile('dsh-zhen recovery',plan.profile,plan.installAnchor,plan.home),manifest=readProfileManifest('dsh-zhen recovery',loaded.dir),modules=join(loaded.dir,'node_modules');
 await ordinary(plan.root,loaded.dir,'directory');await mkdir(modules,{recursive:true,mode:0o700});await ordinary(plan.root,modules,'directory');signal?.throwIfAborted();
 // Same public manifest writer and ordinary Node projection as the existing
 // authenticated environment assembler. This own data-only bundle has no
 // dependencies or hooks. Do not ask a package manager to reconstruct an
 // already restored graph or touch its retained manager files.
 await symlink(bundleDirectory,join(modules,bundle),process.platform==='win32'?'junction':'dir');signal?.throwIfAborted();
 // The snapshot already contains the complete effective user layer. Retain
 // its original bytes, then start a fresh documented public user patch layer;
 // replaying insert patches duplicates entries and can override safety edits.
 await ordinary(plan.root,loaded.patchPath,'file');await writeFile(join(directory,'original-profile-patch.yml'),await readFile(loaded.patchPath),{flag:'wx',mode:0o600});
 await writeFileAtomic(loaded.patchPath,'[]\n',{mode:0o600});
 writeProfileManifest(loaded.dir,{...manifest,dependencies:{...manifest.dependencies,[bundle]:'link:'+bundleDirectory},dsh:{...manifest.dsh,profile:{...manifest.dsh?.profile,bundles:[bundle]}}});
 const adopted=loadProfile('dsh-zhen recovery',plan.profile,plan.installAnchor,plan.home),context:ProfileContext={name:plan.profile,dir:adopted.dir,patchPath:adopted.patchPath,installAnchor:plan.installAnchor,cwd:plan.cwd,home:plan.home,startedBundles:adopted.layers.map(layer=>layer.packageName),overlays:[],telemetryDisabledEnv:'1'};
 const actual=composeEntries([readProfilePatches('dsh-zhen recovery',context,adopted)]);if(digest(actual)!==digest(plan.entries))fail('BACKUP_APPLICATION_ADOPTION_MISMATCH');
 return{profile:plan.profile,home:plan.home,agentsHome:plan.agentsHome,cwd:plan.cwd,bundle,bundleDirectory,programDigest:plan.digest,requiresZhen:flatten(plan.entries).some(row=>row.name==='dsh-zhen'&&row.disabled!==true)};
}
