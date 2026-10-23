import {lstat,realpath,open,unlink} from 'node:fs/promises';
import {existsSync,lstatSync,realpathSync,openSync,readSync,fstatSync,closeSync} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import {dirname,isAbsolute,join,relative,normalize} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Config as FilesystemConfig} from '@deepseek-ai/dsh-skill-filesystem';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import type {SkillApplicationReceipt} from './restore-skills.ts';
import type {SessionApplicationReceipt} from './restore-sessions.ts';

export const RESTORED_SKILL_PROJECTS_FILE='skill-project-bindings.json';
export const RESTORED_SKILL_BOUNDARY_CONTENT='DSH-zhen restored skill lookup boundary; this is not a Git checkout.\n';
const MAX_BYTES=32*1024**2;
export const skillPathKey=(path:string)=>process.platform==='win32'?normalize(path).toLowerCase():normalize(path);
const same=(a:string,b:string)=>skillPathKey(a)===skillPathKey(b);
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(root)&&isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const nodeId=(stat:BigIntStats)=>stat.dev+':'+stat.ino;
const version=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const pathSchema=z.string().min(1).max(4096).refine(isAbsolute),identity=z.string().min(1).max(255);
const pinSchema=z.object({path:pathSchema,present:z.boolean(),node:identity.optional(),target:pathSchema.optional(),identity:identity.optional()}).strict().refine(row=>row.present?row.node!==undefined&&row.target!==undefined&&row.identity!==undefined:row.node===undefined&&row.target===undefined&&row.identity===undefined);
export type RestoredSkillPathPin=z.infer<typeof pinSchema>;
export interface RestoredSkillProviderInput{profile:string;id:string;enabled:boolean;config:Record<string,unknown>;}
const providerSchema=z.object({profile:z.string().min(1).max(255),id:z.string().min(1).max(255),enabled:z.boolean(),config:z.record(z.string(),z.unknown()),pins:z.array(pinSchema).max(132)}).strict();
const projectSchema=z.object({originalDirectory:pathSchema,directory:pathSchema,identity,root:pathSchema,rootIdentity:identity,boundaryIdentity:identity,pins:z.array(pinSchema).length(2)}).strict();
export const restoredSkillProjectsSchema=z.object({schema:z.literal('dsh-zhen-skill-project-bindings-v1'),root:pathSchema,home:pathSchema,revision:z.uuid(),pending:z.boolean(),providers:z.array(providerSchema).max(2048),projects:z.array(projectSchema).max(128)}).strict();
export type RestoredSkillProjects=z.infer<typeof restoredSkillProjectsSchema>;
export interface RestoredSkillProjectsReceipt{schema:'dsh-zhen-skill-project-bindings-v1';file:string;providers:number;projects:number;reviewRequired:true;pending:true;activated:false;}

async function ordinary(root:string,path:string):Promise<void>{if(!inside(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');for(let current=path;;current=dirname(current)){const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory()||!same(await realpath(current),current))throw new BackupError('BACKUP_TEMP_BOUNDARY');if(same(current,root))break;if(dirname(current)===current)throw new BackupError('BACKUP_TEMP_BOUNDARY');}}
/** Logical portal roots may be known junctions. Their parents and resolved
 * targets must remain in this new candidate; pin both nodes, never follow an
 * archive-provided link to a foreign directory. Missing roots stay untrusted. */
export async function pinRestoredSkillPath(root:string,path:string):Promise<RestoredSkillPathPin>{
 if(!inside(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');let stat;
 try{stat=await lstat(path,{bigint:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new BackupError('BACKUP_SKILL_PROJECT_PATH_CHANGED');let parent=dirname(path);while(!existsSync(parent)){if(!inside(root,parent)||dirname(parent)===parent)throw new BackupError('BACKUP_TEMP_BOUNDARY');parent=dirname(parent);}await ordinary(root,parent);return{path,present:false};}
 await ordinary(root,dirname(path));const target=await realpath(path);await ordinary(root,target);const actual=await lstat(target,{bigint:true});return{path,present:true,node:nodeId(stat),target,identity:nodeId(actual)};
}
export async function assertRestoredSkillPin(root:string,pin:RestoredSkillPathPin):Promise<void>{const current=await pinRestoredSkillPath(root,pin.path);if(backupJsonString(current)!==backupJsonString(pin))throw new BackupError('BACKUP_SKILL_PROJECT_PATH_CHANGED');}
export async function assertRestoredSkillDirectory(path:string,expected:string):Promise<void>{try{const actual=await realpath(path),stat=await lstat(actual,{bigint:true});if(!same(actual,path)||!stat.isDirectory()||stat.isSymbolicLink()||nodeId(stat)!==expected)throw Error();}catch{throw new BackupError('BACKUP_SKILL_PROJECT_DIRECTORY_CHANGED');}}
export async function assertRestoredSkillBoundary(root:string,expected:string):Promise<void>{try{const stat=await lstat(join(root,'.git'),{bigint:true});if(stat.isSymbolicLink()||!stat.isFile()||nodeId(stat)!==expected)throw Error();}catch{throw new BackupError('BACKUP_SKILL_PROJECT_PATH_CHANGED');}}

/** Stage an inert document only. The original SDK rows remain paused. */
export async function prepareRestoredSkillProjects(root:string,home:string,skills:SkillApplicationReceipt,selections:readonly SessionApplicationReceipt['directories'][number][],providers:readonly RestoredSkillProviderInput[],options:BackupOptions={}):Promise<RestoredSkillProjectsReceipt>{
 options.signal?.throwIfAborted();await ordinary(root,home);await ordinary(home,join(home,'dsh-zhen'));
 if(skills.schema!=='dsh-zhen-skill-application-v1'||skills.activated!==false||skills.database!==join(home,'dsh-zhen','skills.sqlite')||selections.length>10000)throw new BackupError('BACKUP_SKILL_PROJECT_INPUT_INVALID');
 const document:RestoredSkillProjects={schema:'dsh-zhen-skill-project-bindings-v1',root,home,revision:randomUUID(),pending:true,providers:[],projects:[]},targets=new Map<string,RestoredSkillProjects['projects'][number]>();
 for(const selection of selections){options.signal?.throwIfAborted();if(typeof selection.originalDirectory!=='string'||!isAbsolute(selection.originalDirectory)||!isAbsolute(selection.directory))throw new BackupError('BACKUP_SKILL_PROJECT_INPUT_INVALID');await assertRestoredSkillDirectory(selection.directory,selection.identity);
  const matches=skills.projects.filter(row=>same(row.originCwd,selection.originalDirectory!));if(!matches.length)continue;if(matches.some(row=>!same(row.root,matches[0].root)))throw new BackupError('BACKUP_SKILL_PROJECT_CONFLICT');const project=matches[0];await ordinary(home,project.root);const stat=await lstat(project.root,{bigint:true}),boundary=await lstat(join(project.root,'.git'),{bigint:true});if(boundary.isSymbolicLink()||!boundary.isFile())throw new BackupError('BACKUP_SKILL_PROJECT_PATH_CHANGED');const pins=await Promise.all(['.dsh','.agents'].map(role=>pinRestoredSkillPath(root,join(project.root,role,'skills')))),key=skillPathKey(selection.directory),previous=targets.get(key);
  if(previous){if(!same(previous.root,project.root)||previous.identity!==selection.identity)throw new BackupError('BACKUP_SKILL_PROJECT_CONFLICT');continue;}
  const row={originalDirectory:selection.originalDirectory,directory:selection.directory,identity:selection.identity,root:project.root,rootIdentity:nodeId(stat),boundaryIdentity:nodeId(boundary),pins};targets.set(key,row);document.projects.push(row);
 }
 const ids=new Set<string>(),names=new Map<string,Set<string>>();for(const provider of providers){options.signal?.throwIfAborted();const id=provider.profile+'\0'+provider.id;if(ids.has(id))throw new BackupError('BACKUP_SKILL_PROJECT_CONFLICT');ids.add(id);const config=structuredClone(provider.config);
  // SDK 0.2.1-rc.2 resolves an empty bundledSkillDir as cwd. Use an explicit
  // pinned missing root to preserve an absent bundle without env/cwd fallback.
  if(config.bundledSkillDir==='')config.bundledSkillDir=join(home,'dsh-zhen','skill-projects-empty-bundled');
  let parsed;try{backupJsonString(config);parsed=FilesystemConfig(config);}catch{throw new BackupError('BACKUP_SKILL_PROJECT_CONFIG_INVALID');}
  const providerName=parsed.providerName??'filesystem',used=names.get(provider.profile)??new Set<string>();if(used.has(providerName))throw new BackupError('BACKUP_SKILL_PROJECT_CONFLICT');used.add(providerName);names.set(provider.profile,used);
  if(typeof parsed.dshHome!=='string'||typeof parsed.agentsHome!=='string'||typeof parsed.bundledSkillDir!=='string')throw new BackupError('BACKUP_SKILL_PROJECT_CONFIG_INVALID');if(!inside(home,parsed.dshHome)||!inside(home,parsed.agentsHome))throw new BackupError('BACKUP_TEMP_BOUNDARY');
  const roots=[...parsed.includeDefaultRoots!==false?[join(parsed.dshHome,'skills'),join(parsed.agentsHome,'skills')]:[],...(parsed.customSkillDirs??[]),parsed.bundledSkillDir];if(roots.some(path=>!isAbsolute(path)))throw new BackupError('BACKUP_SKILL_PROJECT_CONFIG_INVALID');const pins=await Promise.all([...new Set(roots)].map(path=>pinRestoredSkillPath(root,path)));document.providers.push({...structuredClone(provider),config,pins});
 }
 if(!restoredSkillProjectsSchema.safeParse(document).success)throw new BackupError('BACKUP_SKILL_PROJECT_INPUT_INVALID');const bytes=Buffer.from(backupJsonString(document)+'\n');if(bytes.length>MAX_BYTES)throw new BackupError('BACKUP_SKILL_PROJECT_LIMIT');const file=join(home,'dsh-zhen',RESTORED_SKILL_PROJECTS_FILE);let owned=false,complete=false;
 try{for(const project of document.projects){await assertRestoredSkillDirectory(project.directory,project.identity);await assertRestoredSkillDirectory(project.root,project.rootIdentity);await assertRestoredSkillBoundary(project.root,project.boundaryIdentity);for(const pin of project.pins)await assertRestoredSkillPin(root,pin);}for(const provider of document.providers)for(const pin of provider.pins)await assertRestoredSkillPin(root,pin);options.signal?.throwIfAborted();const handle=await open(file,'wx',0o600);owned=true;try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}options.signal?.throwIfAborted();complete=true;return{schema:document.schema,file,providers:document.providers.length,projects:document.projects.length,reviewRequired:true,pending:true,activated:false};}
 finally{if(owned&&!complete){await ordinary(home,dirname(file));const stat=await lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw new BackupError('BACKUP_TEMP_BOUNDARY');await unlink(file);}}
}

/** Read only this owned document; no archive JS, private profile or credentials. */
export function restoredSkillProjectFileVersion(home:string):string|null{
 const file=join(home,'dsh-zhen',RESTORED_SKILL_PROJECTS_FILE);let stat:BigIntStats;try{stat=lstatSync(file,{bigint:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw new BackupError('BACKUP_SKILL_PROJECT_REVIEW_INVALID');}
 try{if(stat.isSymbolicLink()||!stat.isFile()||stat.size>BigInt(MAX_BYTES))throw Error();const parents=[home,dirname(file)].map(path=>{const node=lstatSync(path,{bigint:true});if(node.isSymbolicLink()||!node.isDirectory()||!same(realpathSync.native(path),path))throw Error();return nodeId(node);});return version(stat)+':'+parents.join(':');}catch{throw new BackupError('BACKUP_SKILL_PROJECT_REVIEW_INVALID');}
}
export function readRestoredSkillProjects(home:string):{document:RestoredSkillProjects;signature:string;fileVersion:string}|null{
 const file=join(home,'dsh-zhen',RESTORED_SKILL_PROJECTS_FILE),fileVersion=restoredSkillProjectFileVersion(home);if(fileVersion===null)return null;
 try{const before=lstatSync(file,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>BigInt(MAX_BYTES)||!same(realpathSync.native(home),home)||!same(realpathSync.native(dirname(file)),dirname(file)))throw Error();const fd=openSync(file,'r');let bytes:Buffer;
  try{if(version(fstatSync(fd,{bigint:true}))!==version(before))throw Error();bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){const size=readSync(fd,bytes,at,bytes.length-at,at);if(!size)throw Error();at+=size;}if(version(fstatSync(fd,{bigint:true}))!==version(before)||version(lstatSync(file,{bigint:true}))!==version(before))throw Error();}finally{closeSync(fd);}
  const document=restoredSkillProjectsSchema.parse(parseBackupJson(bytes));if(!same(document.home,home)||!inside(document.root,home)||document.projects.some(row=>!inside(home,row.root)||row.pins.some(pin=>!inside(document.root,pin.path)))||document.providers.some(row=>row.pins.some(pin=>!inside(document.root,pin.path))))throw Error();
  const projects=new Set<string>(),providers=new Set<string>();for(const row of document.projects){const key=skillPathKey(row.directory),expected=['.dsh','.agents'].map(role=>skillPathKey(join(row.root,role,'skills'))).sort();if(projects.has(key)||JSON.stringify(row.pins.map(pin=>skillPathKey(pin.path)).sort())!==JSON.stringify(expected))throw Error();projects.add(key);}
  for(const row of document.providers){const id=row.profile+'\0'+row.id;if(providers.has(id))throw Error();providers.add(id);const config=FilesystemConfig(row.config);if(typeof config.dshHome!=='string'||typeof config.agentsHome!=='string'||typeof config.bundledSkillDir!=='string'||!config.bundledSkillDir||!inside(home,config.dshHome)||!inside(home,config.agentsHome))throw Error();const expected=[...config.includeDefaultRoots!==false?[join(config.dshHome,'skills'),join(config.agentsHome,'skills')]:[],...(config.customSkillDirs??[]),config.bundledSkillDir].map(skillPathKey);if(JSON.stringify([...new Set(expected)].sort())!==JSON.stringify(row.pins.map(pin=>skillPathKey(pin.path)).sort()))throw Error();}
  if(restoredSkillProjectFileVersion(home)!==fileVersion)throw Error();return{document,signature:createHash('sha256').update(bytes).digest('hex'),fileVersion};
 }catch{throw new BackupError('BACKUP_SKILL_PROJECT_REVIEW_INVALID');}
}
