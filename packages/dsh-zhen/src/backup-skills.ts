import {createHash} from 'node:crypto';
import {lstat,mkdir,mkdtemp,open,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,parse,posix,relative,win32} from 'node:path';
import {homedir} from 'node:os';
import {z} from 'zod';
import {BackupError,DEFAULT_BACKUP_LIMITS,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';

const SCHEMA='dsh-zhen-skill-roots-v1',MAX_ROOTS=1024,MAX_ENTRIES=80_000,MAX_MANIFEST=32*1024**2,CHUNK=64*1024;
export interface SkillBackupRoot {
  key:string;path:string;kind:'user-dsh'|'user-agents'|'project-dsh'|'project-agents'|'custom';
  mode:'skill'|'library';enabled:boolean;workspace?:string;provenance?:Record<string,unknown>;
}
export interface SkillBackupSelection {
  roots:readonly SkillBackupRoot[];
  /** Whole homes/workspaces must not be mistaken for a skill resource root. */
  protectedContainers:readonly string[];
  /** Native/user-data areas outside this task's backup authority. Any overlap refuses. */
  forbiddenTrees:readonly string[];
}
interface SkillNode {root:number;parts:string[];kind:'directory'|'file';bytes:number;sha256?:string;executable?:boolean;}
interface StoredRoot extends SkillBackupRoot {present:boolean;canonicalRoot:string;excludedMetadata:string[];}
interface SkillManifest {schema:typeof SCHEMA;credentialStoresIncluded:false;roots:StoredRoot[];nodes:SkillNode[];activated:false;}
interface ObservedNode extends SkillNode {identity:string;}
interface Snapshot {manifest:SkillManifest;observations:string[];revision:string;}
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const inside=(base:string,target:string)=>{const part=relative(base,target);return !isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const identity=(stat:{dev:bigint;ino:bigint;size:bigint;mtimeNs:bigint;ctimeNs:bigint})=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const directoryIdentity=(stat:{dev:bigint;ino:bigint})=>[stat.dev,stat.ino].join(':');
const provenanceSchema=z.custom<Record<string,unknown>>(value=>!!value&&typeof value==='object'&&!Array.isArray(value));
const rootSchema=z.object({key:z.string().min(1).max(128),path:z.string().min(1).max(4096),kind:z.enum(['user-dsh','user-agents','project-dsh','project-agents','custom']),mode:z.enum(['skill','library']),enabled:z.boolean(),workspace:z.string().max(4096).optional(),provenance:provenanceSchema.optional()}).strict();
const storedRootSchema=rootSchema.extend({present:z.boolean(),canonicalRoot:z.string().min(1).max(4096),excludedMetadata:z.array(z.enum(['.git','.system'])).max(2)}).strict();
const nodeSchema=z.object({root:z.number().int().nonnegative().max(MAX_ROOTS-1),parts:z.array(z.string().min(1).max(255)).min(1).max(64),kind:z.enum(['directory','file']),bytes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),executable:z.boolean().optional()}).strict();
const manifestSchema=z.object({schema:z.literal(SCHEMA),credentialStoresIncluded:z.literal(false),roots:z.array(storedRootSchema).max(MAX_ROOTS),nodes:z.array(nodeSchema).max(MAX_ENTRIES),activated:z.literal(false)}).strict();
async function canonical(path:string):Promise<string>{
  if(!isAbsolute(path)||path.length>4096)throw new BackupError('BACKUP_PATH_INVALID');
  try{return await realpath(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||dirname(path)===path)throw error;return join(await canonical(dirname(path)),basename(path));}
}
async function fileIdentity(path:string):Promise<string>{try{const stat=await lstat(path,{bigint:true});if(stat.isSymbolicLink())throw new BackupError('BACKUP_SKILL_LINK_REFUSED');return stat.isDirectory()?directoryIdentity(stat):identity(stat);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 'absent';throw error;}}
async function protectedSelection(selection:SkillBackupSelection,signal?:AbortSignal):Promise<StoredRoot[]>{
  if(!Array.isArray(selection.roots)||selection.roots.length>MAX_ROOTS||!Array.isArray(selection.protectedContainers)||!Array.isArray(selection.forbiddenTrees))throw new BackupError('BACKUP_SKILL_SELECTION_INVALID');
  const containers=await Promise.all([process.cwd(),homedir(),...selection.protectedContainers].map(canonical)),forbidden=await Promise.all(selection.forbiddenTrees.map(canonical));
  const keys=new Set<string>(),roots:StoredRoot[]=[];
  for(const value of selection.roots){
    signal?.throwIfAborted();backupJsonString(value);const root=rootSchema.parse(value);if(keys.has(root.key))throw new BackupError('BACKUP_SKILL_SELECTION_INVALID');keys.add(root.key);
    const canonicalRoot=await canonical(root.path);if(canonicalRoot===parse(canonicalRoot).root||containers.some(path=>inside(canonicalRoot,path))||forbidden.some(path=>inside(path,canonicalRoot)||inside(canonicalRoot,path)))throw new BackupError('BACKUP_SKILL_SCOPE_REFUSED');
    let present=true;try{const stat=await lstat(root.path);if(stat.isSymbolicLink())throw new BackupError('BACKUP_SKILL_LINK_REFUSED');if(!stat.isDirectory())throw new BackupError('BACKUP_SKILL_ROOT_INVALID');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')present=false;else throw error;}
    roots.push({...root,present,canonicalRoot,excludedMetadata:root.kind==='user-dsh'?['.git','.system']:['.git']});
  }
  // Detach caller-owned metadata before any later await or payload construction.
  return parseBackupJson(Buffer.from(backupJsonString(roots))) as StoredRoot[];
}
function childParts(parts:string[]):boolean{return parts.every(part=>part!=='.'&&part!=='..'&&!/[\\/\x00-\x1f\x7f]/.test(part));}
async function inventory(roots:StoredRoot[],options:BackupOptions):Promise<{nodes:ObservedNode[];roots:string[]}>{
  const nodes:ObservedNode[]=[],rootIdentities:string[]=[],paths=new Set<string>();let total=0;
  const visit=async(root:number,parts:string[])=>{
    options.signal?.throwIfAborted();const selected=roots[root],directory=join(selected.canonicalRoot,...parts);
    const entries=await readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const entry of entries){
      if(entry.name.toLowerCase()==='.git'||(!parts.length&&selected.excludedMetadata.includes('.system')&&entry.name==='.system'))continue;
      const child=[...parts,entry.name];if(!childParts(child)||child.length>64)throw new BackupError('BACKUP_SKILL_PATH_INVALID');destination(selected.canonicalRoot,child);
      const folded=(root+':'+child.join('/')).normalize('NFKC').toLowerCase();if(paths.has(folded))throw new BackupError('BACKUP_SKILL_PATH_COLLISION');paths.add(folded);
      options.signal?.throwIfAborted();const path=join(selected.canonicalRoot,...child),stat=await lstat(path,{bigint:true});
      if(stat.isSymbolicLink()||!inside(selected.canonicalRoot,await realpath(path)))throw new BackupError('BACKUP_SKILL_LINK_REFUSED');
      if(nodes.length>=MAX_ENTRIES)throw new BackupError('BACKUP_SKILL_ENTRY_LIMIT');
      if(stat.isDirectory()){nodes.push({root,parts:child,kind:'directory',bytes:0,identity:directoryIdentity(stat)});await visit(root,child);}
      else if(stat.isFile()){
        if(stat.size>BigInt(options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes))throw new BackupError('BACKUP_RECORD_SIZE_INVALID');
        total+=Number(stat.size);if(total>(options.limits?.archiveBytes??DEFAULT_BACKUP_LIMITS.archiveBytes))throw new BackupError('BACKUP_ARCHIVE_LIMIT');
        nodes.push({root,parts:child,kind:'file',bytes:Number(stat.size),executable:!!(Number(stat.mode)&0o111),identity:identity(stat)});
      }else throw new BackupError('BACKUP_SKILL_FILE_INVALID');
    }
  };
  for(let index=0;index<roots.length;index++){
    const root=roots[index],before=await fileIdentity(root.path);if((before!=='absent')!==root.present||await canonical(root.path)!==root.canonicalRoot)throw new BackupError('BACKUP_SOURCE_CHANGED');
    if(root.present)await visit(index,[]);if(await fileIdentity(root.path)!==before)throw new BackupError('BACKUP_SOURCE_CHANGED');rootIdentities.push(before);
  }
  return {nodes,roots:rootIdentities};
}
async function* fileBytes(root:StoredRoot,node:ObservedNode,signal?:AbortSignal):AsyncGenerator<Uint8Array>{
  signal?.throwIfAborted();const path=join(root.canonicalRoot,...node.parts);
  if(await fileIdentity(path)!==node.identity||!inside(root.canonicalRoot,await realpath(path)))throw new BackupError('BACKUP_SOURCE_CHANGED');
  const file=await open(path,'r');
  try{
    const initial=await file.stat({bigint:true});if(!initial.isFile()||identity(initial)!==node.identity)throw new BackupError('BACKUP_SOURCE_CHANGED');
    let position=0;while(position<node.bytes){signal?.throwIfAborted();const bytes=Buffer.alloc(Math.min(CHUNK,node.bytes-position)),read=(await file.read(bytes,0,bytes.length,position)).bytesRead;if(!read)throw new BackupError('BACKUP_SOURCE_CHANGED');position+=read;yield bytes.subarray(0,read);}
    if(identity(await file.stat({bigint:true}))!==node.identity||await fileIdentity(path)!==node.identity)throw new BackupError('BACKUP_SOURCE_CHANGED');
  }finally{await file.close();}
}
async function snapshot(selection:SkillBackupSelection,options:BackupOptions):Promise<Snapshot>{
  const roots=await protectedSelection(selection,options.signal),initial=await inventory(roots,options),nodes:SkillNode[]=[];
  for(const node of initial.nodes){
    const {identity:_identity,...stored}=node;
    if(node.kind==='file'){const hash=createHash('sha256');for await(const bytes of fileBytes(roots[node.root],node,options.signal))hash.update(bytes);stored.sha256=hash.digest('hex');}nodes.push(stored);
  }
  const after=await inventory(roots,options);if(backupJsonString(after)!==backupJsonString(initial))throw new BackupError('BACKUP_SOURCE_CHANGED');
  const manifest:SkillManifest={schema:SCHEMA,credentialStoresIncluded:false,roots,nodes,activated:false},serialized=backupJsonString(manifest);if(Buffer.byteLength(serialized)>MAX_MANIFEST)throw new BackupError('BACKUP_SKILL_MANIFEST_LIMIT');
  return {manifest,observations:initial.nodes.map(node=>node.identity),revision:sha(backupJsonString({roots:initial.roots,manifest,observations:initial.nodes.map(node=>node.identity)}))};
}
/** Host-selected, declared skill roots only; resources are not a marketplace publish allowlist. */
export async function* skillBackupRecords(resolveSelection:()=>SkillBackupSelection,options:BackupOptions={}):AsyncGenerator<BackupRecord>{
  const state=await snapshot(resolveSelection(),options),manifest=Buffer.from(backupJsonString(state.manifest));
  yield {metadata:{kind:'skill-manifest',schema:SCHEMA},size:manifest.length,data:(async function*(){yield manifest;})()};
  for(let index=0;index<state.manifest.nodes.length;index++){
    const node=state.manifest.nodes[index];if(node.kind!=='file')continue;
    const data=(async function*(){const hash=createHash('sha256');for await(const bytes of fileBytes(state.manifest.roots[node.root],{...node,identity:state.observations[index]},options.signal)){hash.update(bytes);yield bytes;}if(hash.digest('hex')!==node.sha256)throw new BackupError('BACKUP_SOURCE_CHANGED');})();
    yield {metadata:{kind:'skill-file',node:index},size:node.bytes,data};
  }
  if((await snapshot(resolveSelection(),options)).revision!==state.revision)throw new BackupError('BACKUP_SOURCE_CHANGED');
}
export async function writeSkillBackup(destination:string,password:string,resolveSelection:()=>SkillBackupSelection,options:BackupOptions={}):Promise<BackupReceipt>{return writeBackupArchive(destination,password,skillBackupRecords(resolveSelection,options),options);}

/** Pure preflight for the portable resource namespace; creates no paths. */
export function assertSkillResourcePath(parts:readonly string[]):void{
  if(!Array.isArray(parts)||!parts.length||parts.length>64||parts.some(part=>typeof part!=='string'||!part.length||part.length>255)||!childParts([...parts])||parts.some(part=>/[<>:"|?*]/.test(part)||/[. ]$/.test(part)||/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part)))throw new BackupError('BACKUP_SKILL_PATH_INVALID');
}
function destination(root:string,parts:string[]):string{
  assertSkillResourcePath(parts);
  const target=join(root,...parts);if(!inside(root,target)||target===root)throw new BackupError('BACKUP_SKILL_PATH_INVALID');return target;
}
async function writeAll(file:FileHandle,bytes:Uint8Array){let offset=0;while(offset<bytes.length){const written=(await file.write(bytes,offset,bytes.length-offset,null)).bytesWritten;if(!written)throw new BackupError('BACKUP_WRITE_FAILED');offset+=written;}}
export interface SkillRestoreCandidate {schema:typeof SCHEMA;root:string;roots:Array<{origin:SkillBackupRoot;restoredPath:string;present:boolean}>;files:number;activated:false;}
/** Authentication is complete before a new candidate is created. No skill is installed or run. */
export async function restoreSkillBackup(source:string,password:string,parentDirectory:string,options:BackupOptions={}):Promise<SkillRestoreCandidate>{
  if(!isAbsolute(parentDirectory))throw new BackupError('BACKUP_PATH_INVALID');const archive=await openBackupArchive(source,password,options);
  try{return await restoreAuthenticatedSkillRecords(archive.records(),parentDirectory,options);}finally{await archive.close();}
}
/** Internal composition seam. Public restore entry points authenticate the full
 * archive before passing any records here. Not exported from dsh-zhen/backup. */
export async function restoreAuthenticatedSkillRecords(records:AsyncGenerator<BackupRecord>,parentDirectory:string,options:BackupOptions={},expectedRoots?:readonly SkillBackupRoot[]):Promise<SkillRestoreCandidate>{
  if(!isAbsolute(parentDirectory))throw new BackupError('BACKUP_PATH_INVALID');const parent=await realpath(parentDirectory);let root:string|undefined,complete=false;
  try{
    const first=await records.next();if(first.done||first.value.metadata.kind!=='skill-manifest'||first.value.metadata.schema!==SCHEMA||Object.keys(first.value.metadata).length!==2||first.value.size>MAX_MANIFEST)throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
    const parts:Uint8Array[]=[];for await(const bytes of first.value.data)parts.push(bytes);const manifest=manifestSchema.parse(parseBackupJson(Buffer.concat(parts,first.value.size)));
    if(expectedRoots&&backupJsonString(manifest.roots.map(({canonicalRoot:_canonical,excludedMetadata:_excluded,present:_present,...value})=>rootSchema.parse(value)))!==backupJsonString(expectedRoots.map(value=>rootSchema.parse(value))))throw new BackupError('BACKUP_SKILL_INVENTORY_ROOTS_MISMATCH');
    const keys=new Set<string>(),paths=new Set<string>(),nodePaths=new Map<string,'directory'|'file'>();
    for(const selected of manifest.roots){
      const absolute=(path:string)=>posix.isAbsolute(path)||win32.isAbsolute(path),excluded=selected.kind==='user-dsh'?['.git','.system']:['.git'];
      if(keys.has(selected.key)||!absolute(selected.path)||!absolute(selected.canonicalRoot)||backupJsonString(selected.excludedMetadata)!==backupJsonString(excluded))throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');keys.add(selected.key);
    }
    let total=0;
    for(const node of manifest.nodes){
      if(!manifest.roots[node.root]?.present||(!node.parts.length)||!childParts(node.parts)||(node.kind==='file'?(!node.sha256||typeof node.executable!=='boolean'):(node.bytes!==0||node.sha256!==undefined||node.executable!==undefined)))throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
      if(node.parts.some(part=>part.toLowerCase()==='.git')||(manifest.roots[node.root].kind==='user-dsh'&&node.parts[0]==='.system'))throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
      total+=node.bytes;if(node.bytes>(options.limits?.recordBytes??DEFAULT_BACKUP_LIMITS.recordBytes)||total>(options.limits?.archiveBytes??DEFAULT_BACKUP_LIMITS.archiveBytes))throw new BackupError('BACKUP_ARCHIVE_LIMIT');
      destination(parent,node.parts);const path=node.root+':'+node.parts.join('/'),folded=path.normalize('NFKC').toLowerCase();if(paths.has(folded))throw new BackupError('BACKUP_SKILL_PATH_COLLISION');paths.add(folded);nodePaths.set(path,node.kind);
    }
    for(const node of manifest.nodes)if(node.parts.length>1&&nodePaths.get(node.root+':'+node.parts.slice(0,-1).join('/'))!=='directory')throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
    root=await realpath(await mkdtemp(join(parent,'dsh-zhen-skill-restore-')));await mkdir(join(root,'roots'),{mode:0o700});
    const rootPath=(index:number)=>join(root!,'roots','r'+index);
    for(let index=0;index<manifest.roots.length;index++)if(manifest.roots[index].present)await mkdir(rootPath(index),{mode:0o700});
    for(const node of manifest.nodes.filter(node=>node.kind==='directory').sort((a,b)=>a.parts.length-b.parts.length))await mkdir(destination(rootPath(node.root),node.parts),{mode:0o700});
    const expected=new Set(manifest.nodes.map((node,index)=>node.kind==='file'?index:-1).filter(index=>index>=0));let files=0;
    for await(const item of records){
      options.signal?.throwIfAborted();const index=item.metadata.node;
      if(Object.keys(item.metadata).length!==2||item.metadata.kind!=='skill-file'||typeof index!=='number'||!Number.isInteger(index)||!expected.delete(index))throw new BackupError('BACKUP_SKILL_FILE_INVALID');
      const node=manifest.nodes[index];if(node.bytes!==item.size)throw new BackupError('BACKUP_RECORD_SIZE_MISMATCH');const file=await open(destination(rootPath(node.root),node.parts),'wx',0o600),hash=createHash('sha256');
      try{for await(const bytes of item.data){options.signal?.throwIfAborted();await writeAll(file,bytes);hash.update(bytes);}if(hash.digest('hex')!==node.sha256)throw new BackupError('BACKUP_SKILL_DIGEST_MISMATCH');await file.chmod(node.executable?0o700:0o600);await file.sync();}finally{await file.close();}files++;
    }
    if(expected.size)throw new BackupError('BACKUP_SKILL_FILE_MISSING');options.signal?.throwIfAborted();
    await writeFile(join(root,'dsh-zhen-skill-restore.json'),backupJsonString(manifest)+'\n',{flag:'wx',mode:0o600});
    const result:SkillRestoreCandidate={schema:SCHEMA,root,roots:manifest.roots.map(({canonicalRoot:_canonical,excludedMetadata:_excluded,present,...selected},index)=>({origin:selected,restoredPath:rootPath(index),present})),files,activated:false};complete=true;return result;
  }finally{if(root&&!complete){const actual=await realpath(root),part=relative(parent,actual);if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-skill-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}
}
