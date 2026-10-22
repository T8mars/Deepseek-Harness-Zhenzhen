import {createHash} from 'node:crypto';
import {lstat,mkdir,realpath,rm,symlink,writeFile,readlink} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BackupError,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupRecord,BackupOptions,BackupReceipt} from './backup-archive.ts';
import {backupJsonString as json,parseBackupJson} from './backup-data.ts';
import {linkedSkillBackupRecords,skillResourceRevision,restoreAuthenticatedSkillRecords,assertSkillResourcePath} from './backup-skills.ts';
import type {SkillRestoreCandidate} from './backup-skills.ts';
import {capturePackageGraph,validatePackageGraph,packageResourceSelection,packageManifest,manifestPackageIdentity,packageProjectionAnchors,packageLinkReservations,packageOriginApi,packageOriginFile,PACKAGE_BACKUP_SCHEMA,PACKAGE_METADATA_LIMIT} from './backup-package-graph.ts';
import type {PackageBackupDocument,PackageBackupSource,PackageGraphSnapshot,PortablePackageResolution} from './backup-package-graph.ts';
import {originKey} from './backup-skill-projection.ts';

export interface PackageBackupLease {
  document:PackageBackupDocument;
  records():AsyncGenerator<BackupRecord>;
  assertCurrent():Promise<void>;
  close():void;
}
/** Retained Host lease for a future whole-application end barrier. No package
 * manager, module entry point, lifecycle or executable resource is invoked. */
export async function preparePackageBackup(resolve:()=>PackageBackupSource,options:BackupOptions={}):Promise<PackageBackupLease>{
  const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,settings={...options,signal};let closed=false,used=false;
  const capture=async():Promise<PackageGraphSnapshot>=>{signal.throwIfAborted();try{return await capturePackageGraph(resolve(),settings);}catch(error){signal.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PACKAGE_READ_FAILED');}};
  const resourceRevision=async(value:PackageGraphSnapshot)=>{try{return await skillResourceRevision(value.selection,value.approved,settings,packageProjectionAnchors(value.document),packageLinkReservations(value.document));}catch(error){signal.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PACKAGE_RESOURCE_READ_FAILED');}};
  const initial=await capture(),anchors=packageProjectionAnchors(initial.document),reserved=packageLinkReservations(initial.document),revision=await resourceRevision(initial),documentText=json(initial.document);
  const assertCurrent=async()=>{if(closed)throw new BackupError('BACKUP_PACKAGE_LEASE_CLOSED');const current=await capture();if(current.owner!==initial.owner||current.generation!==initial.generation||current.generationFingerprint!==initial.generationFingerprint||current.policy!==initial.policy||json(current.document)!==documentText||json([...current.approved])!==json([...initial.approved])||await resourceRevision(current)!==revision)throw new BackupError('BACKUP_SOURCE_CHANGED');};
  return {document:structuredClone(initial.document),assertCurrent,close(){if(!closed){closed=true;controller.abort();}},async*records(){if(closed)throw new BackupError('BACKUP_PACKAGE_LEASE_CLOSED');if(used)throw new BackupError('BACKUP_PACKAGE_STREAM_USED');used=true;try{await assertCurrent();const bytes=Buffer.from(documentText);yield {metadata:{kind:'package-graph',schema:PACKAGE_BACKUP_SCHEMA},size:bytes.length,data:(async function*(){yield bytes;})()};yield* linkedSkillBackupRecords(()=>initial.selection,initial.approved,settings,anchors,reserved);await assertCurrent();}catch(error){signal.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PACKAGE_RESOURCE_READ_FAILED');}}};
}
export async function* packageBackupRecords(resolve:()=>PackageBackupSource,options:BackupOptions={}):AsyncGenerator<BackupRecord>{const lease=await preparePackageBackup(resolve,options);try{yield* lease.records();}finally{lease.close();}}
export async function writePackageBackup(destination:string,password:string,resolve:()=>PackageBackupSource,options:BackupOptions={}):Promise<BackupReceipt>{return writeBackupArchive(destination,password,packageBackupRecords(resolve,options),options);}
export interface PackageRestoreCandidate extends SkillRestoreCandidate {
  document:PackageBackupDocument;
  packages:Array<{id:string;name:string;version:string|null;directory:string}>;
  entrypoints:Array<{key:string;directory:string;inspectionDirectory:string;parentURL:string;name:string;node:string|null}>;
  resolution:PortablePackageResolution|null;
  links:Array<{path:string;target:string;kind:'original'|'dependency'|'entrypoint'}>;
  unresolved:Array<{seed?:string;from?:string;name:string;reason:'public-package-metadata-unavailable'}>;
  compatibility:{platformMatches:boolean;abiMatches:boolean;executionVerified:false};
  readyForActivation:false;
  wholeApplicationRestore:false;
}
const contained=(root:string,path:string)=>{const part=relative(root,path);return !!part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
async function owned(root:string,path:string):Promise<void>{
  if(!contained(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');let cursor=path;
  while(cursor!==root){try{const info=await lstat(cursor);if(info.isSymbolicLink())throw new BackupError('BACKUP_PACKAGE_LINK_PARENT_INVALID');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}cursor=dirname(cursor);}
  if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw new BackupError('BACKUP_TEMP_BOUNDARY');
}
export async function restorePackageBackup(source:string,password:string,parent:string,options:BackupOptions={}):Promise<PackageRestoreCandidate>{
  if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');const base=await realpath(parent),archive=await openBackupArchive(source,password,options);let candidate:SkillRestoreCandidate|undefined,complete=false;
  try{
    const records=archive.records(),first=await records.next();if(first.done||first.value.metadata.kind!=='package-graph'||first.value.metadata.schema!==PACKAGE_BACKUP_SCHEMA||Object.keys(first.value.metadata).length!==2||first.value.size>PACKAGE_METADATA_LIMIT)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');const chunks:Uint8Array[]=[];for await(const bytes of first.value.data)chunks.push(bytes);let document:PackageBackupDocument;try{document=validatePackageGraph(parseBackupJson(Buffer.concat(chunks,first.value.size)));}catch{throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');}
    const selection=packageResourceSelection(document,{protectedContainers:[],forbiddenTrees:[]});candidate=await restoreAuthenticatedSkillRecords(records,base,options,selection.roots,packageProjectionAnchors(document),new Map(selection.roots.map(row=>[row.key,row.path])),packageLinkReservations(document));const root=candidate.root,packages:PackageRestoreCandidate['packages']=document.nodes.map(node=>{const selected=candidate!.roots.find(row=>row.origin.key==='package:'+node.id);if(!selected?.present)throw new BackupError('BACKUP_PACKAGE_ROOTS_MISMATCH');return {id:node.id,name:node.name,version:node.version,directory:selected.restoredPath};}),paths=new Map(packages.map(node=>[node.id,node.directory])),links:PackageRestoreCandidate['links']=[],planned=new Map<string,{target:string;directory:boolean;kind:'original'|'dependency'|'entrypoint'}>();
    const mapOrigin=(origin:string)=>{const api=packageOriginApi(origin),anchor=candidate!.anchors.find(row=>originKey(row.canonicalOrigin)===originKey(api.parse(origin).root));if(!anchor)throw new BackupError('BACKUP_PACKAGE_ROOTS_MISMATCH');const parts=api.relative(anchor.canonicalOrigin,origin).split(api.sep).filter(Boolean);if(parts.length)assertSkillResourcePath(parts);const path=join(anchor.restoredPath,...parts);if(!contained(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');return path;};
    const pathFor=(node:string,parts:readonly string[]=[])=>{const base=paths.get(node);if(!base)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');if(parts.length)assertSkillResourcePath(parts);const path=join(base,...parts);if(!contained(root,path))throw new BackupError('BACKUP_TEMP_BOUNDARY');return path;};
    const plan=(path:string,target:string,directory:boolean,kind:'original'|'dependency'|'entrypoint')=>{if(!contained(root,path)||!contained(root,target))throw new BackupError('BACKUP_TEMP_BOUNDARY');const old=planned.get(path);if(old&&(old.target!==target||old.directory!==directory))throw new BackupError('BACKUP_PACKAGE_ROUTE_CONFLICT');if(!old)planned.set(path,{target,directory,kind});};
    for(const node of document.nodes){options.signal?.throwIfAborted();const actual=await packageManifest(pathFor(node.id)),identity=manifestPackageIdentity(actual.body,node.name);if(actual.digest!==node.manifestDigest||identity.name!==node.name||identity.version!==node.version)throw new BackupError('BACKUP_PACKAGE_MANIFEST_MISMATCH');if(actual.body.name!==node.name&&!document.seeds.some(row=>row.node===node.id&&row.name===node.name)&&!document.edges.some(row=>row.to===node.id&&row.name===node.name))throw new BackupError('BACKUP_PACKAGE_MANIFEST_MISMATCH');}
    for(const link of document.links){const path=pathFor(link.from,link.parts);try{await lstat(path);throw new BackupError('BACKUP_PACKAGE_LINK_RESOURCE_CONFLICT');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}const parent=await lstat(dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink())throw new BackupError('BACKUP_PACKAGE_LINK_PARENT_INVALID');plan(path,pathFor(link.to,link.targetParts),link.directory,'original');}
    // Original resource links precede synthesized package routes. Routes only
    // fill absent paths; existing bytes or relationships are never overwritten.
    const createLink=async(path:string,target:string,directory:boolean,kind:'original'|'dependency'|'entrypoint')=>{
      options.signal?.throwIfAborted();if(!contained(root,path)||!contained(root,target))throw new BackupError('BACKUP_TEMP_BOUNDARY');
      try{const info=await lstat(path);if(await realpath(path)!==await realpath(target))throw new BackupError('BACKUP_PACKAGE_ROUTE_CONFLICT');if(info.isSymbolicLink())await readlink(path);return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      await owned(root,path);const targetInfo=await lstat(target);if(targetInfo.isSymbolicLink()||(directory?!targetInfo.isDirectory():!targetInfo.isFile()))throw new BackupError('BACKUP_PACKAGE_LINK_TARGET_INVALID');await mkdir(dirname(path),{recursive:true,mode:0o700});try{await symlink(target,path,directory?(process.platform==='win32'?'junction':'dir'):'file');}catch(error){if(['EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code??''))throw new BackupError('BACKUP_PACKAGE_LINK_UNSUPPORTED');throw error;}if(await realpath(path)!==await realpath(target))throw new BackupError('BACKUP_PACKAGE_LINK_TARGET_INVALID');links.push({path,target,kind});
    };
    for(const [path,value]of planned)await createLink(path,value.target,value.directory,value.kind);planned.clear();
    for(const edge of document.edges)if(edge.to&&edge.logicalDirectory){const path=mapOrigin(edge.logicalDirectory),target=pathFor(edge.to);plan(path,target,true,'dependency');}
    for(const [path,value]of planned)await createLink(path,value.target,value.directory,value.kind);
    const entrypoints:PackageRestoreCandidate['entrypoints']=[];
    for(const seed of document.seeds){options.signal?.throwIfAborted();const inspectionDirectory=join(root,'entrypoints',createHash('sha256').update(seed.key).digest('hex')),parentFile=mapOrigin(packageOriginFile(seed.parentURL)),directory=dirname(parentFile);await owned(root,inspectionDirectory);await mkdir(inspectionDirectory,{recursive:true,mode:0o700});if(seed.node){if(seed.logicalDirectory)await createLink(mapOrigin(seed.logicalDirectory),pathFor(seed.node),true,'entrypoint');await createLink(join(inspectionDirectory,'node_modules',...seed.name.split('/')),pathFor(seed.node),true,'entrypoint');}entrypoints.push({key:seed.key,directory,inspectionDirectory,parentURL:pathToFileURL(parentFile).href,name:seed.name,node:seed.node});}
    const unresolved:PackageRestoreCandidate['unresolved']=[...document.seeds.filter(row=>!row.node).map(row=>({seed:row.key,name:row.name,reason:'public-package-metadata-unavailable' as const})),...document.edges.filter(row=>!row.to).map(row=>({from:row.from,name:row.name,reason:'public-package-metadata-unavailable' as const}))];
    const resolution=document.resolution?{...document.resolution,profilesDir:mapOrigin(document.resolution.profilesDir),profileDir:document.resolution.profileDir?mapOrigin(document.resolution.profileDir):null,entries:document.resolution.entries.map(row=>({...row,packageDir:mapOrigin(row.packageDir),declarer:mapOrigin(row.declarer)})),linkedRoots:document.resolution.linkedRoots.map(row=>({...row,realPath:mapOrigin(row.realPath)}))}:null;
    if(resolution)for(const directory of [resolution.profilesDir,...resolution.profileDir?[resolution.profileDir]:[]]){await owned(root,directory);await mkdir(directory,{recursive:true,mode:0o700});}
    const result:PackageRestoreCandidate={...candidate,document,packages,entrypoints,resolution,links,unresolved,compatibility:{platformMatches:document.platform.os===process.platform&&document.platform.arch===process.arch,abiMatches:document.platform.abi===process.versions.modules,executionVerified:false},readyForActivation:false,wholeApplicationRestore:false};
    await writeFile(join(root,'dsh-zhen-package-restore.json'),json(result)+'\n',{flag:'wx',mode:0o600});options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PACKAGE_RESTORE_FAILED');}
  finally{try{await archive.close();}finally{if(candidate&&!complete){const actual=await realpath(candidate.root),part=relative(base,actual);if((await lstat(candidate.root)).isSymbolicLink()||!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-skill-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
