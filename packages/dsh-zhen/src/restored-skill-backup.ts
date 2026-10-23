import type{Context}from'@deepseek-ai/cordis';
import{symbols}from'@deepseek-ai/cordis';
import type{}from'@deepseek-ai/dsh-app-boot';
import{LocalFileSystem}from'@deepseek-ai/dsh-fs-local';
import{createHash}from'node:crypto';
import{lstat,realpath,readFile}from'node:fs/promises';
import{dirname,isAbsolute,join,relative}from'node:path';
import{z}from'zod';
import{BackupError}from'./backup-archive.ts';
import type{BackupOptions}from'./backup-archive.ts';
import{backupJsonString,parseBackupJson}from'./backup-data.ts';
import{readRestoredSkillProjects,skillPathKey,pinRestoredSkillPath,assertRestoredSkillPin,assertRestoredSkillBoundary,assertRestoredSkillDirectory}from'./restored-skill-projects.ts';
import type{RestoredSkillPathPin}from'./restored-skill-projects.ts';
import{sdkSkillBackupRoots,resolveSkillFilesystem,skillFilesystemConfigDigest}from'./backup-skill-inventory.ts';
import type{SkillInventorySource,SkillBackupInventory}from'./backup-skill-inventory.ts';
import type{ProfileBackupSource}from'./backup-profiles.ts';
import type{PatchOptions}from'@deepseek-ai/cordis-plugin-include';
import{isFilesystemEntry}from'./backup-host-skills.ts';

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const path=z.string().min(1).max(4096).refine(isAbsolute),name=z.string().min(1).max(255);
const recipeSchema=z.object({schema:z.literal('dsh-zhen-application-restore-v1'),home:path,skills:z.object({database:path,projectBindings:z.object({file:path}).passthrough(),projects:z.array(z.object({originCwd:path,originRoot:path,root:path}).strict()).max(128)}).passthrough(),profiles:z.array(z.object({name,overlay:path.nullable(),paused:z.array(z.object({id:name,module:name}).strict()).max(4096)}).passthrough()).max(128)}).passthrough();
const patchSchema=z.array(z.object({id:name,name:name,config:z.record(z.string(),z.unknown()).optional(),disabled:z.boolean().optional()}).passthrough()).max(4096);
const nodeId=(stat:{dev:bigint;ino:bigint})=>stat.dev+':'+stat.ino;
const stamp=(stat:{dev:bigint;ino:bigint;size:bigint;mtimeNs:bigint;ctimeNs:bigint})=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const same=(a:string,b:string)=>skillPathKey(a)===skillPathKey(b);
const inside=(root:string,value:string)=>{const part=relative(root,value);return isAbsolute(root)&&isAbsolute(value)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
function fail():never{throw new BackupError('BACKUP_SKILL_PROJECT_SOURCE_CHANGED');}
const original=(value:unknown)=>value&&(value as{[symbols.original]?:object})[symbols.original]||value;

/** Prepare from owned recovery records, never from private SDK profile files.
 * Each returned source carries the ORIGINAL revision check through the entire
 * composed archive. It cannot silently fall back to ordinary cwd discovery. */
export interface RestoredSkillBackupOptions extends BackupOptions{profileOnly?:boolean;}
export interface RestoredSkillBackupSource{():SkillInventorySource;forProfiles(source:ProfileBackupSource):ProfileBackupSource;}
export async function prepareRestoredSkillBackupSource(ctx:Context,home:string,resolveBase:()=>SkillInventorySource,options:RestoredSkillBackupOptions={}):Promise<RestoredSkillBackupSource>{try{return await prepare(ctx,home,resolveBase,options);}catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_SKILL_PROJECT_SOURCE_CHANGED');}}
async function prepare(ctx:Context,home:string,resolveBase:()=>SkillInventorySource,options:RestoredSkillBackupOptions):Promise<RestoredSkillBackupSource>{
 const initial=readRestoredSkillProjects(home);if(!initial)throw new BackupError('BACKUP_SKILL_PROJECT_REVIEW_INVALID');
 const{document}=initial,profile=ctx.get('profileContext'),loader=ctx.get('loader');if(!profile||!loader||!same(profile.home,home))throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');
 const directories=new Map<string,{path:string;identity:string}>(),files=new Map<string,{path:string;version:string;digest:string}>(),pins=new Map<string,RestoredSkillPathPin>(),boundaries=new Map<string,string>();let readBytes=0;
 async function ordinary(value:string,file=false):Promise<void>{if(!inside(document.root,value))fail();let current=file?dirname(value):value;for(;;){const stat=await lstat(current,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||!same(await realpath(current),current))fail();const key=skillPathKey(current),previous=directories.get(key);if(previous&&previous.identity!==nodeId(stat))fail();directories.set(key,{path:current,identity:nodeId(stat)});if(same(current,document.root))break;const parent=dirname(current);if(parent===current)fail();current=parent;}}
 async function file(value:string):Promise<Buffer>{options.signal?.throwIfAborted();await ordinary(value,true);const before=await lstat(value,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>8n*1024n**2n||(readBytes+=Number(before.size))>32*1024**2)fail();const bytes=await readFile(value),after=await lstat(value,{bigint:true});if(stamp(before)!==stamp(after)||bytes.length!==Number(before.size))fail();files.set(skillPathKey(value),{path:value,version:stamp(before),digest:sha(bytes)});return bytes;}
 const recipe=recipeSchema.parse(parseBackupJson(await file(join(document.root,'dsh-zhen-application-restore.json'))));
 if(!same(recipe.home,home)||!same(recipe.skills.database,join(home,'dsh-zhen','skills.sqlite'))||!same(recipe.skills.projectBindings.file,join(home,'dsh-zhen','skill-project-bindings.json')))fail();
 const profiles=new Map(recipe.profiles.map(row=>[row.name,row]));if(profiles.size!==recipe.profiles.length||!profiles.has(profile.name))fail();
 const overlays=new Map<string,z.infer<typeof patchSchema>>();
 for(const selected of recipe.profiles){if(!selected.overlay)continue;const bytes=await file(selected.overlay),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^(?:#[^\r\n]*\r?\n)*/,''),patches=patchSchema.parse(parseBackupJson(Buffer.from(text)));overlays.set(selected.name,patches);}
 const normalized=(config:Record<string,unknown>)=>({...config,...config.bundledSkillDir===''?{bundledSkillDir:join(home,'dsh-zhen','skill-projects-empty-bundled')}:{}});
 const filesystem:SkillInventorySource['filesystem'][number][]=[],current=new Map<string,{name:string;configDigest:string}>();
 for(const row of document.providers){const selected=profiles.get(row.profile),matches=overlays.get(row.profile)?.filter(patch=>patch.id===row.id)??[];if(!selected||matches.length!==1)fail();const patch=matches[0];if(patch.disabled!==true||!patch.config||!selected.paused.some(item=>item.id===row.id&&item.module===patch.name)||skillFilesystemConfigDigest(normalized(patch.config))!==skillFilesystemConfigDigest(row.config))fail();
  const id='recovered:'+sha(row.profile+'\0'+row.id);filesystem.push({id,mode:'host-local-resolved',config:resolveSkillFilesystem(row.config),enabled:row.enabled,recovery:{profile:row.profile,entryId:row.id,configDigest:skillFilesystemConfigDigest(patch.config),paused:true}});
  if(row.profile===profile.name){if(current.has(row.id))fail();current.set(row.id,{name:patch.name,configDigest:skillFilesystemConfigDigest(patch.config)});}
  if(!options.profileOnly)for(const pin of row.pins){const key=skillPathKey(pin.path),previous=pins.get(key);if(previous&&backupJsonString(previous)!==backupJsonString(pin))fail();pins.set(key,pin);}
 }
 const projects:SkillBackupInventory['projects']=[],seen=new Map<string,string>(),known=new Set<string>();
 for(const project of options.profileOnly?[]:recipe.skills.projects){options.signal?.throwIfAborted();if(!same(project.root,join(home,'dsh-zhen','skill-roots','projects',sha(project.originRoot))))fail();await ordinary(project.root);const marker=await lstat(join(project.root,'.git'),{bigint:true});if(marker.isSymbolicLink()||!marker.isFile())fail();boundaries.set(project.root,nodeId(marker));known.add(skillPathKey(project.originCwd)+'\0'+skillPathKey(project.root));
  const mapped=document.projects.filter(row=>same(row.originalDirectory,project.originCwd));for(const row of mapped){if(!same(row.root,project.root))fail();for(const pin of row.pins){const key=skillPathKey(pin.path),previous=pins.get(key);if(previous&&backupJsonString(previous)!==backupJsonString(pin))fail();pins.set(key,pin);}}
  for(const cwd of mapped.length?mapped.map(row=>row.directory):[project.originCwd]){const key=skillPathKey(cwd),previous=seen.get(key);if(previous){if(!same(previous,project.root))fail();continue;}seen.set(key,project.root);projects.push({cwd,projectRoot:project.root});}
 }
 if(projects.length>128||!options.profileOnly&&document.projects.some(row=>!known.has(skillPathKey(row.originalDirectory)+'\0'+skillPathKey(row.root))))fail();
 const locations:Array<{key:string;path:string}>=[];
 for(const root of options.profileOnly?[]:sdkSkillBackupRoots({filesystem:filesystem as SkillBackupInventory['filesystem'],projects})){options.signal?.throwIfAborted();const key=skillPathKey(root.path);let pin=pins.get(key);if(!pin){pin=await pinRestoredSkillPath(document.root,root.path);pins.set(key,pin);}await assertRestoredSkillPin(document.root,pin);locations.push({key:root.key,path:pin.present?pin.target!:pin.path});}
 function assertLoader():void{if(original(ctx.get('profileContext'))!==original(profile)||original(ctx.get('loader'))!==original(loader))fail();const observed=new Set<string>();let count=0;for(const entry of loader!.entries()){if(++count>4096)fail();const expected=current.get(entry.id);if(!expected){if(isFilesystemEntry(entry))fail();continue;}if(observed.has(entry.id)||entry.options.name!==expected.name||entry.options.disabled!==true||entry.fiber&&entry.fiber.state!==4||!(entry.context.get('fs') instanceof LocalFileSystem)||skillFilesystemConfigDigest(entry.options.config??{})!==expected.configDigest)fail();observed.add(entry.id);}if(observed.size!==current.size)fail();}
 const assertCurrent=async()=>{options.signal?.throwIfAborted();if(readRestoredSkillProjects(home)?.signature!==initial.signature)fail();assertLoader();for(const row of directories.values())await assertRestoredSkillDirectory(row.path,row.identity);for(const row of files.values()){const before=await lstat(row.path,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||stamp(before)!==row.version||sha(await readFile(row.path))!==row.digest||stamp(await lstat(row.path,{bigint:true}))!==row.version)fail();}for(const[root,id]of boundaries)await assertRestoredSkillBoundary(root,id);for(const pin of pins.values())await assertRestoredSkillPin(document.root,pin);if(readRestoredSkillProjects(home)?.signature!==initial.signature)fail();options.signal?.throwIfAborted();};
 await assertCurrent();return Object.assign(()=>{if(options.profileOnly)fail();return{...resolveBase(),filesystem:structuredClone(filesystem),recovery:{projects:structuredClone(projects),locations:structuredClone(locations),assertCurrent}};},{forProfiles(source:ProfileBackupSource){if(!same(source.home,home)||source.additionalProfilePatches!==undefined)fail();const previous=source.assertCurrent?.bind(source);return{...source,additionalProfilePatches:[...overlays].map(([profile,patches])=>({profile,patches:structuredClone(patches)as PatchOptions[]})),assertCurrent:async()=>{await previous?.();await assertCurrent();}};}});
}
