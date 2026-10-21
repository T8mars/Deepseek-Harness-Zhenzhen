import {createHash} from 'node:crypto';
import {access,lstat,realpath,rm,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve,posix,win32,relative} from 'node:path';
import {resolveDshHome,resolveAgentsHome} from '@deepseek-ai/dsh-home-paths';
import type {Config as FilesystemConfig} from '@deepseek-ai/dsh-skill-filesystem';
import {z} from 'zod';
import {BackupError,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupRecord,BackupOptions,BackupReceipt} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {skillBackupRecords,restoreAuthenticatedSkillRecords} from './backup-skills.ts';
import type {SkillBackupRoot,SkillBackupSelection,SkillRestoreCandidate} from './backup-skills.ts';
import type {LocalSkills} from './local-skills.ts';
import type {GithubSkills} from './github-skills.ts';
import {normalizeGithubSkillSpec} from './github-skills.ts';
import type {SkillMarket,MarketBackupState} from './market.ts';
import {verifySkill} from './market.ts';
import type {SkillFeed} from './skill-feed.ts';
import {localSkillStateSchema} from './local-skills-schema.ts';
import {githubSkillStateSchema,githubSkillReleaseSchema} from './github-skills-schema.ts';
import {skillFeedSnapshotSchema,skillPackageSchema,skillId,digestSchema} from './market-schema.ts';
import {SUPPORTED_DSH} from './compatibility.ts';

const SCHEMA='dsh-zhen-skill-inventory-v1',MAX_STATE=64*1024**2;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
type ResolvedFilesystem={providerName:string;includeDefaultRoots:boolean;dshHome:string;agentsHome:string;customSkillDirs:string[];bundledSkillDir?:string};
export interface SkillInventorySource {
  /** Effective settings of every Host-local filesystem skill provider. A virtual
   * filesystem requires its own backup adapter and cannot be guessed from disk. */
  filesystem:readonly {id:string;mode:'host-local';config:FilesystemConfig;enabled?:boolean}[];
  workspaces:readonly string[];
  local:Pick<LocalSkills,'backupState'>;github:Pick<GithubSkills,'backupState'>;
  market:Pick<SkillMarket,'backupState'>;feed:Pick<SkillFeed,'backupState'>;
  protectedContainers:readonly string[];forbiddenTrees:readonly string[];
}
export interface SkillBackupInventory {
  schema:typeof SCHEMA;sdkVersion:string;
  filesystem:Array<{id:string;config:ResolvedFilesystem;enabled?:boolean}>;
  projects:Array<{cwd:string;projectRoot:string}>;
  local:ReturnType<LocalSkills['backupState']>;
  github:ReturnType<GithubSkills['backupState']>;
  market:MarketBackupState;feed:ReturnType<SkillFeed['backupState']>;
  roots:SkillBackupRoot[];
  coverage:{allDeclaredSources:true;allRetainedManagedReleases:true;credentials:false;activatesSources:false;wholeApplicationRestore:false};
}
const digestOrEmpty=z.union([z.literal(''),digestSchema]),revision=z.string().regex(/^(?:[a-f0-9]{40})?$/),bit=z.union([z.literal(0),z.literal(1)]);
const selectionSchema=z.object({id:skillId,active:digestOrEmpty,pending:digestOrEmpty,enabled:bit,pending_mode:z.enum(['','manual','automatic']),pending_revision:revision,auto_paused:bit,skipped:digestOrEmpty}).strict();
const marketSchema=z.object({schemaVersion:z.literal(3),versions:z.array(z.object({key:digestSchema,package:skillPackageSchema}).strict()).max(40000),selections:z.array(selectionSchema).max(40000),preferences:z.object({id:z.literal(1),enabled:bit,scope:z.literal('first-party-text-v1'),verified_revision:revision,verified_digest:digestOrEmpty}).strict(),bundled:z.array(skillPackageSchema).max(100),catalog:z.array(skillPackageSchema).max(200)}).strict();
const cacheSchema=z.object({status:skillFeedSnapshotSchema,catalog:z.array(skillPackageSchema).max(100)}).strict();
const feedSchema=cacheSchema.extend({persisted:z.object({present:z.boolean(),cache:cacheSchema.optional()}).strict()}).strict();
const path=z.string().min(1).max(4096).refine(value=>posix.isAbsolute(value)||win32.isAbsolute(value)),resolvedSchema=z.object({providerName:z.string().min(1).max(128),includeDefaultRoots:z.boolean(),dshHome:path,agentsHome:path,customSkillDirs:z.array(path).max(128),bundledSkillDir:path.optional()}).strict();
const rootSchema=z.object({key:z.string().min(1).max(128),path,kind:z.enum(['user-dsh','user-agents','project-dsh','project-agents','custom']),mode:z.enum(['skill','library']),enabled:z.boolean(),workspace:path.optional(),provenance:z.record(z.string(),z.unknown())}).strict();
const inventorySchema=z.object({schema:z.literal(SCHEMA),sdkVersion:z.literal(SUPPORTED_DSH),filesystem:z.array(z.object({id:z.string().min(1).max(128),config:resolvedSchema,enabled:z.boolean().optional()}).strict()).max(16),projects:z.array(z.object({cwd:path,projectRoot:path}).strict()).max(128),local:localSkillStateSchema,github:z.object({schemaVersion:z.literal(1),sources:githubSkillStateSchema.shape.sources,running:z.array(z.object({id:digestSchema,digest:digestSchema}).strict()).max(16),releases:z.array(z.object({root:path,release:githubSkillReleaseSchema}).strict()).max(1024)}).strict(),market:marketSchema,feed:feedSchema,roots:z.array(rootSchema).max(1024),coverage:z.object({allDeclaredSources:z.literal(true),allRetainedManagedReleases:z.literal(true),credentials:z.literal(false),activatesSources:z.literal(false),wholeApplicationRestore:z.literal(false)}).strict()}).strict();

function validate(input:unknown):SkillBackupInventory{
  backupJsonString(input);const value=inventorySchema.parse(input),versions=new Map<string,ReturnType<typeof verifySkill>>(),versionIds=new Set<string>();
  for(const row of value.market.versions){const item=verifySkill(row.package),id=item.manifest.id+'@'+item.manifest.version;if(versions.has(row.key)||versionIds.has(id)||sha(JSON.stringify(item))!==row.key)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');versions.set(row.key,item);versionIds.add(id);}
  const ids=new Set<string>();for(const selected of value.market.selections){if(ids.has(selected.id))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');ids.add(selected.id);for(const key of [selected.active,selected.pending,selected.skipped])if(key&&versions.get(key)?.manifest.id!==selected.id)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');if(!!selected.pending!==!!selected.pending_mode||(selected.pending_mode==='automatic'?!selected.pending_revision:!!selected.pending_revision))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');}
  for(const items of [value.market.bundled,value.market.catalog,value.feed.catalog,...value.feed.persisted.cache?[value.feed.persisted.cache.catalog]:[]]){const names=new Set<string>();for(const item of items){verifySkill(item);if(names.has(item.manifest.id))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');names.add(item.manifest.id);}}
  for(const cache of [value.feed,...value.feed.persisted.cache?[value.feed.persisted.cache]:[]])if(cache.status.count!==cache.catalog.length)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');
  if(value.feed.persisted.present!==!!value.feed.persisted.cache)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');
  const releases=new Set<string>();for(const {release}of value.github.releases){const {digest,...body}=release,spec=normalizeGithubSkillSpec(release.spec),key=release.sourceId+':'+digest;if(releases.has(key)||sha(JSON.stringify(body))!==digest||sha(JSON.stringify(spec))!==release.sourceId||JSON.stringify(spec)!==JSON.stringify(release.spec))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');releases.add(key);}
  const sources=new Set<string>();for(const source of value.github.sources){if(sources.has(source.id)||sha(JSON.stringify(normalizeGithubSkillSpec(source.spec)))!==source.id)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');sources.add(source.id);for(const digest of [source.active,source.pending,source.latest])if(digest&&!releases.has(source.id+':'+digest))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');}
  const running=new Set<string>();for(const row of value.github.running){if(running.has(row.id)||!sources.has(row.id)||!releases.has(row.id+':'+row.digest))throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');running.add(row.id);}
  for(const values of [value.filesystem.map(row=>row.id),value.projects.map(row=>row.cwd),value.roots.map(row=>row.key),value.local.sources.map(row=>row.id)])if(new Set(values).size!==values.length)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');
  if(backupJsonString(value.roots)!==backupJsonString(deriveRoots(value).map(root=>rootSchema.parse(root))))throw new BackupError('BACKUP_SKILL_INVENTORY_ROOTS_MISMATCH');
  return value;
}
function deriveRoots(value:Pick<SkillBackupInventory,'filesystem'|'projects'|'local'|'github'>):SkillBackupRoot[]{
  const roots:SkillBackupRoot[]=[];
  const add=(key:string,path:string,kind:SkillBackupRoot['kind'],provenance:Record<string,unknown>,workspace?:string,mode:SkillBackupRoot['mode']='library',enabled=true)=>roots.push({key,path,kind,mode,enabled,...workspace?{workspace}:{},provenance});
  const at=(root:string,...parts:string[])=>(win32.isAbsolute(root)&&!posix.isAbsolute(root)?win32:posix).join(root,...parts);
  for(const {id,config,enabled=true}of value.filesystem){
    const offset=roots.length;
    const seen=new Set<string>();if(config.includeDefaultRoots)for(const {projectRoot:root}of value.projects)if(!seen.has(root)){seen.add(root);for(const kind of ['project-dsh','project-agents']as const)add('sdk:'+sha(id+':'+kind+':'+root),at(root,kind==='project-dsh'?'.dsh':'.agents','skills'),kind,{provider:id,role:kind},root);}
    config.customSkillDirs.forEach((path,index)=>add('sdk:'+sha(id+':custom:'+index),path,'custom',{provider:id,role:'custom',index}));
    if(config.includeDefaultRoots){add('sdk:'+sha(id+':user-dsh'),at(config.dshHome,'skills'),'user-dsh',{provider:id,role:'user-dsh'});add('sdk:'+sha(id+':user-agents'),at(config.agentsHome,'skills'),'user-agents',{provider:id,role:'user-agents'});}
    if(config.bundledSkillDir)add('sdk:'+sha(id+':bundled'),config.bundledSkillDir,'custom',{provider:id,role:'bundled'});
    for(let i=offset;i<roots.length;i++)roots[i].enabled=enabled;
  }
  for(const item of value.local.sources)add('local:'+item.id,item.root,'custom',{provider:'dsh-zhen-local-skills',record:item},undefined,item.mode,item.enabled);
  for(const {root,release}of value.github.releases)add('github:'+sha(release.sourceId+':'+release.digest),root,'custom',{provider:'dsh-zhen-github-skills',sourceId:release.sourceId,digest:release.digest},undefined,'library',value.github.sources.some(row=>row.id===release.sourceId&&row.enabled&&row.active===release.digest));
  return roots;
}
/** Resolve only public filesystem root settings; ambient credentials are never
 * copied into the document. Project resolution is verified against the provider. */
export function resolveSkillFilesystem(config:FilesystemConfig={}):ResolvedFilesystem{
  if(!config||typeof config!=='object'||![null,Object.prototype].includes(Object.getPrototypeOf(config))||Object.getOwnPropertySymbols(config).length)throw new BackupError('BACKUP_DATA_JSON_INVALID');
  const defined:Record<string,unknown>=Object.create(null);for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(config))){if(!('value'in descriptor)||!descriptor.enumerable)throw new BackupError('BACKUP_DATA_JSON_INVALID');if(descriptor.value!==undefined)Object.defineProperty(defined,key,{value:descriptor.value,enumerable:true,writable:true,configurable:true});}backupJsonString(defined);config=defined as FilesystemConfig;
  const defaults=config.includeDefaultRoots??true,bundled=config.bundledSkillDir??(defaults?process.env.DSH_BUNDLED_SKILL_DIR:undefined);
  return resolvedSchema.parse({providerName:config.providerName??'filesystem',includeDefaultRoots:defaults,dshHome:resolveDshHome(config.dshHome),agentsHome:resolveAgentsHome(config.agentsHome),customSkillDirs:(config.customSkillDirs??[]).map(value=>resolve(value)),...bundled!==undefined?{bundledSkillDir:resolve(bundled)}:{}});
}
async function projectRoot(cwd:string,signal?:AbortSignal):Promise<string>{
  let current=cwd;while(true){signal?.throwIfAborted();try{await access(join(current,'.git'));return current;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new BackupError('BACKUP_SKILL_PROJECT_UNAVAILABLE');}const parent=dirname(current);if(parent===current)return cwd;current=parent;}
}
export async function collectSkillBackupInventory(source:SkillInventorySource,options:BackupOptions={}):Promise<{document:SkillBackupInventory;selection:SkillBackupSelection}>{
  options.signal?.throwIfAborted();if(!Array.isArray(source.filesystem)||source.filesystem.length>16||!Array.isArray(source.workspaces)||source.workspaces.length>10000)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');
  const filesystem:SkillBackupInventory['filesystem']=[],projects:SkillBackupInventory['projects']=[],seenCwd=new Set<string>(),protectedContainers=[...source.protectedContainers],forbiddenTrees=[...source.forbiddenTrees];backupJsonString({protectedContainers,forbiddenTrees});
  for(const cwd of source.workspaces){if(!isAbsolute(cwd))throw new BackupError('BACKUP_PATH_INVALID');const absolute=resolve(cwd);if(seenCwd.has(absolute))continue;seenCwd.add(absolute);if(projects.length>=128)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');projects.push({cwd:absolute,projectRoot:await projectRoot(absolute,options.signal)});}
  for(const provider of source.filesystem){
    if(provider.mode!=='host-local')throw new BackupError('BACKUP_SKILL_FILESYSTEM_UNSUPPORTED');const config=resolveSkillFilesystem(provider.config);filesystem.push({id:provider.id,config,...provider.enabled!==undefined?{enabled:provider.enabled}:{}});
  }
  const local=source.local.backupState(),github=source.github.backupState(),market=source.market.backupState(),feed=source.feed.backupState();
  for(const item of local.sources){try{const stat=await lstat(item.root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||[stat.dev,stat.ino].join(':')!==item.identity)throw new BackupError('BACKUP_SKILL_SOURCE_IDENTITY_CHANGED');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  const roots=deriveRoots({filesystem,projects,local,github});
  const document=validate({schema:SCHEMA,sdkVersion:SUPPORTED_DSH,filesystem,projects,local,github,market,feed,roots,coverage:{allDeclaredSources:true,allRetainedManagedReleases:true,credentials:false,activatesSources:false,wholeApplicationRestore:false}});
  if(Buffer.byteLength(backupJsonString(document))>MAX_STATE)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');
  return {document,selection:{roots:document.roots,protectedContainers:[...protectedContainers,...filesystem.flatMap(row=>[row.config.dshHome,row.config.agentsHome]),...projects.map(row=>row.projectRoot)],forbiddenTrees}};
}
export async function* skillInventoryBackupRecords(resolveSource:()=>SkillInventorySource,options:BackupOptions={}):AsyncGenerator<BackupRecord>{
  const capture=async()=>{try{return await collectSkillBackupInventory(resolveSource(),options);}catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_SKILL_INVENTORY_READ_FAILED');}};
  const initial=await capture(),bytes=Buffer.from(backupJsonString(initial.document));
  yield {metadata:{kind:'skill-inventory',schema:SCHEMA},size:bytes.length,data:(async function*(){yield bytes;})()};
  const resolveSelection=async()=>{const current=await capture();if(backupJsonString(current.document)!==backupJsonString(initial.document)||backupJsonString(current.selection)!==backupJsonString(initial.selection))throw new BackupError('BACKUP_SOURCE_CHANGED');return current.selection;};
  // Root membership and managed-state changes are checked around the complete
  // resource stream, including providers whose visible catalog has not changed.
  const selection=await resolveSelection();yield* skillBackupRecords(()=>selection,options);await resolveSelection();
}
export async function writeSkillInventoryBackup(destination:string,password:string,source:()=>SkillInventorySource,options:BackupOptions={}):Promise<BackupReceipt>{return writeBackupArchive(destination,password,skillInventoryBackupRecords(source,options),options);}
export async function restoreSkillInventoryBackup(source:string,password:string,parent:string,options:BackupOptions={}):Promise<SkillRestoreCandidate&{inventory:SkillBackupInventory}>{
  if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');const directory=await realpath(parent),archive=await openBackupArchive(source,password,options);let candidate:SkillRestoreCandidate|undefined,complete=false;
  try{
    const records=archive.records(),first=await records.next();if(first.done||first.value.metadata.kind!=='skill-inventory'||first.value.metadata.schema!==SCHEMA||Object.keys(first.value.metadata).length!==2||first.value.size>MAX_STATE)throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');
    const parts:Uint8Array[]=[];for await(const bytes of first.value.data)parts.push(bytes);let inventory:SkillBackupInventory;
    try{inventory=validate(parseBackupJson(Buffer.concat(parts,first.value.size)));}catch{throw new BackupError('BACKUP_SKILL_INVENTORY_INVALID');}
    candidate=await restoreAuthenticatedSkillRecords(records,directory,options,inventory.roots);options.signal?.throwIfAborted();
    await writeFile(join(candidate.root,'dsh-zhen-skill-inventory.json'),backupJsonString(inventory)+'\n',{flag:'wx',mode:0o600});complete=true;return {...candidate,inventory};
  }finally{try{await archive.close();}finally{if(candidate&&!complete){const actual=await realpath(candidate.root),part=relative(directory,actual);if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-skill-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
