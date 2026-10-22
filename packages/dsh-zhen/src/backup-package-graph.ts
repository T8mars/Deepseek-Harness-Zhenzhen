import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,realpath,readlink,stat} from 'node:fs/promises';
import {join,relative,isAbsolute,posix,win32,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {z} from 'zod';
import type {PluginPackages} from '@deepseek-ai/dsh-app-boot';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {backupJsonString as json} from './backup-data.ts';
import {assertSkillBackupScope,assertSkillResourcePath} from './backup-skills.ts';
import type {SkillBackupSelection,ApprovedResourceLink,SkillResourceReservation} from './backup-skills.ts';
import {originKey} from './backup-skill-projection.ts';
import type {SkillProjectionAnchor} from './backup-skill-projection.ts';
import type {RuntimeResolution} from '@deepseek-ai/dsh-app-boot';

export const PACKAGE_BACKUP_SCHEMA='dsh-zhen-package-graph-v1';
export const PACKAGE_METADATA_LIMIT=32*1024**2;
const MAX_NODES=1024,MAX_EDGES=40_000,MAX_FILES=80_000,MANIFEST_LIMIT=2*1024**2;
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const packageName=z.string().min(1).max(256).regex(/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_-][A-Za-z0-9_.-]*$/);
const absolute=z.string().min(1).max(4096).refine(value=>posix.isAbsolute(value)||win32.isAbsolute(value));
const digest=z.string().regex(/^[a-f0-9]{64}$/),scope=z.enum(['installation','profile','linked','declared']);
const parts=z.array(z.string()).max(64).refine(value=>{try{if(value.length)assertSkillResourcePath(value);return true;}catch{return false;}});
export const packageSeedSchema=z.object({key:z.string().min(1).max(128),name:packageName,parentURL:z.string().min(1).max(8192),scope,directory:absolute.optional()}).strict();
export type PackageBackupSeed=z.infer<typeof packageSeedSchema>;
export interface PackageBackupSource {
  lookup:Pick<PluginPackages,'packageOf'|'resolution'>;
  seeds:readonly PackageBackupSeed[];
  protectedContainers:readonly string[];
  forbiddenTrees:readonly string[];
}
const nodeSchema=z.object({id:digest,root:absolute,name:packageName,version:z.string().max(256).nullable(),manifestDigest:digest.nullable()}).strict();
const edgeSchema=z.object({from:digest,name:packageName,to:digest.nullable(),logicalDirectory:absolute.nullable(),kinds:z.array(z.enum(['dependency','optional','peer','dev','installed'])).min(1).max(5)}).strict();
const linkSchema=z.object({from:digest,parts:parts.refine(value=>value.length>0),to:digest,targetParts:parts,directory:z.boolean(),originText:z.string().min(1).max(8192)}).strict();
const resolutionSchema=z.object({profilesDir:absolute,profileDir:absolute.nullable(),localPackageNames:z.array(packageName).max(MAX_NODES),entries:z.array(z.object({name:packageName,packageDir:absolute,version:z.string().max(256).nullable(),declarer:absolute,scope:z.enum(['installation','profile'])}).strict()).max(MAX_NODES*2),linkedRoots:z.array(z.object({name:packageName,realPath:absolute}).strict()).max(MAX_NODES)}).strict();
export type PortablePackageResolution=z.infer<typeof resolutionSchema>;
export const packageGraphSchema=z.object({schema:z.literal(PACKAGE_BACKUP_SCHEMA),resolution:resolutionSchema.nullable(),platform:z.object({os:z.string().min(1).max(64),arch:z.string().min(1).max(64),node:z.string().min(1).max(64),abi:z.string().min(1).max(64)}).strict(),seeds:z.array(packageSeedSchema.extend({node:digest.nullable(),logicalDirectory:absolute.nullable()}).strict()).max(MAX_NODES*5),nodes:z.array(nodeSchema).max(MAX_NODES),edges:z.array(edgeSchema).max(MAX_EDGES),links:z.array(linkSchema).max(MAX_FILES),coverage:z.object({wholeDeclaredPackageResources:z.literal(true),knownLinks:z.literal(true),vcsMetadata:z.literal(false),credentialStores:z.literal(false),originalPackageManagerFiles:z.literal(false),activation:z.literal(false),wholeApplicationRestore:z.literal(false)}).strict()}).strict();
export type PackageBackupDocument=z.infer<typeof packageGraphSchema>;
type Node=PackageBackupDocument['nodes'][number];
const inside=(root:string,path:string)=>{const value=relative(root,path);return !isAbsolute(value)&&value!=='..'&&!value.startsWith('../')&&!value.startsWith('..\\');};
function generation(source:PackageBackupSource):PortablePackageResolution|null{
  const value=source.lookup.resolution;if(!value)return null;
  return {profilesDir:value.profilesDir,profileDir:value.profileDir??null,localPackageNames:[...value.localPackageNames],entries:value.entries.map(row=>({name:row.name,packageDir:row.packageDir,version:row.version??null,declarer:row.declarer,scope:row.scope})),linkedRoots:value.linkedRoots.map(row=>({name:row.name,realPath:row.realPath}))};
}
export function packageOriginFile(url:string):string{const value=new URL(url);return fileURLToPath(value,{windows:/^\/[A-Za-z]:\//.test(value.pathname)||!!value.hostname&&value.hostname!=='localhost'});}
export function packageOriginApi(path:string){return win32.isAbsolute(path)&&!posix.isAbsolute(path)?win32:posix;}
export function packageProjectionAnchors(document:PackageBackupDocument):SkillProjectionAnchor[]{
  const origins=[...document.nodes.map(row=>row.root),...document.seeds.flatMap(row=>[packageOriginFile(row.parentURL),...row.directory?[row.directory]:[],...row.logicalDirectory?[row.logicalDirectory]:[]]),...document.edges.flatMap(row=>row.logicalDirectory?[row.logicalDirectory]:[]),...document.resolution?[document.resolution.profilesDir,...document.resolution.profileDir?[document.resolution.profileDir]:[],...document.resolution.entries.flatMap(row=>[row.packageDir,row.declarer]),...document.resolution.linkedRoots.map(row=>row.realPath)]:[]],roots=new Map<string,string>();for(const path of origins){const api=packageOriginApi(path),root=api.parse(path).root,parts=api.relative(root,path).split(api.sep).filter(Boolean);if(parts.length)assertSkillResourcePath(parts);roots.set(originKey(root),root);}if(roots.size>16)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');return [...roots].map(([key,canonicalRoot])=>({key:'package-filesystem:'+sha(key),canonicalRoot,present:true}));
}
export function publicPackageResolution(value:PortablePackageResolution):RuntimeResolution{json(value);const known=resolutionSchema.parse(value);return {...known,profileDir:known.profileDir??undefined,entries:known.entries.map(row=>({...row,version:row.version??undefined}))};}
function resolverSeeds(value:PortablePackageResolution):PackageBackupSeed[]{
  const result:PackageBackupSeed[]=[],url=(path:string)=>pathToFileURL(path,{windows:packageOriginApi(path)===win32}).href;
  value.entries.forEach((row,index)=>result.push({key:'resolver-entry:'+sha(index+':'+row.scope+':'+row.packageDir),name:row.name,parentURL:url(row.declarer),scope:row.scope,directory:row.packageDir}));
  if(value.profileDir)for(const name of value.localPackageNames)result.push({key:'resolver-local:'+sha(name),name,parentURL:url(packageOriginApi(value.profileDir).join(value.profileDir,'package.json')),scope:'profile',directory:packageOriginApi(value.profileDir).join(value.profileDir,'node_modules',...name.split('/'))});
  for(const row of value.linkedRoots){const parent=value.profileDir??row.realPath;result.push({key:'resolver-link:'+sha(row.name+':'+row.realPath),name:row.name,parentURL:url(packageOriginApi(parent).join(parent,'package.json')),scope:'linked',directory:row.realPath});}return result;
}
export function packageLinkReservations(document:PackageBackupDocument):SkillResourceReservation[]{
  const roots=new Map(document.nodes.map(node=>[originKey(node.root),node])),nodes=new Map(document.nodes.map(node=>[node.id,node])),result:SkillResourceReservation[]=[];
  for(const link of document.links){const from=nodes.get(link.from);if(!from)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');const api=packageOriginApi(from.root),source=api.join(from.root,...link.parts),key=originKey(source);let end=key.indexOf('/');
    while(true){const node=roots.get(end<0?key:key.slice(0,end));if(node){const parts=api.relative(node.root,source).split(api.sep).filter(Boolean);assertSkillResourcePath(parts);if(result.length>=MAX_FILES)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');result.push({key:'package:'+node.id,parts});}if(end<0)break;end=key.indexOf('/',end+1);}
  }return result;
}
export function manifestPackageIdentity(body:Record<string,unknown>,hint:string):{name:string;version:string|null}{return {name:packageName.safeParse(body.name).success?String(body.name):packageName.parse(hint),version:typeof body.version==='string'?z.string().max(256).parse(body.version):null};}
async function scopeObservation(value:PortablePackageResolution|null):Promise<unknown>{
  if(!value)return [];const states=[];for(const path of [value.profilesDir,...value.profileDir?[value.profileDir]:[]]){try{const info=await lstat(path,{bigint:true});if(info.isSymbolicLink()||!info.isDirectory())throw new BackupError('BACKUP_PACKAGE_SCOPE_CHANGED');states.push({path,canonical:await realpath(path),identity:info.dev+':'+info.ino});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;states.push({path,absent:true});}}return states;
}
export function packageResourceSelection(document:PackageBackupDocument,policy:Pick<PackageBackupSource,'protectedContainers'|'forbiddenTrees'>):SkillBackupSelection{
  return {roots:document.nodes.map(node=>({key:'package:'+node.id,path:node.root,kind:'custom',mode:'library',enabled:true,provenance:{provider:'dsh-zhen-package-backup',node:node.id}})),protectedContainers:[...policy.protectedContainers],forbiddenTrees:[...policy.forbiddenTrees]};
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export async function packageManifest(root:string):Promise<{digest:string|null;body:Record<string,unknown>}>{
  const file=join(root,'package.json');let info;try{info=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {digest:null,body:{}};throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.size>MANIFEST_LIMIT)throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');const bytes=await readFile(file);if(bytes.length>MANIFEST_LIMIT)throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');let body:unknown;try{body=JSON.parse(bytes.toString('utf8'));}catch{throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');}if(!record(body))throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');return {digest:sha(bytes),body};
}
export function validatePackageGraph(input:unknown):PackageBackupDocument{
  json(input);const value=packageGraphSchema.parse(input),nodes=new Map(value.nodes.map(node=>[node.id,node]));if(nodes.size!==value.nodes.length||new Set(value.seeds.map(row=>row.key)).size!==value.seeds.length||new Set(value.nodes.map(row=>originKey(row.root))).size!==value.nodes.length)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');
  const edges=new Set<string>(),links=new Set<string>();for(const node of value.nodes)if(node.id!==sha(node.root))throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');
  for(const seed of value.seeds){const url=new URL(seed.parentURL);if(url.protocol!=='file:'||url.search||url.hash||url.username||url.password||seed.node&&!nodes.has(seed.node)||!!seed.node!==!!seed.logicalDirectory)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');}
  for(const edge of value.edges){const key=edge.from+':'+edge.name;if(!nodes.has(edge.from)||edge.to&&!nodes.has(edge.to)||!!edge.to!==!!edge.logicalDirectory||edges.has(key)||new Set(edge.kinds).size!==edge.kinds.length)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');edges.add(key);}
  for(const link of value.links){const key=link.from+':'+link.parts.join('/');if(!nodes.has(link.from)||!nodes.has(link.to)||links.has(key)||[...link.parts,...link.targetParts].some(part=>part.toLowerCase()==='.git'))throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');links.add(key);}
  if(value.resolution)for(const expected of resolverSeeds(value.resolution)){const seed=value.seeds.find(row=>row.key===expected.key);if(!seed||seed.name!==expected.name||seed.directory!==expected.directory||seed.parentURL!==expected.parentURL||seed.scope!==expected.scope)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');}
  const outgoing=new Map<string,string[]>();for(const edge of value.edges)if(edge.to){const list=outgoing.get(edge.from)??[];list.push(edge.to);outgoing.set(edge.from,list);}const seen=new Set<string>(),queue=value.seeds.flatMap(row=>row.node?[row.node]:[]);for(let index=0;index<queue.length;index++){const id=queue[index]!;if(seen.has(id))continue;seen.add(id);queue.push(...outgoing.get(id)??[]);}if(seen.size!==nodes.size)throw new BackupError('BACKUP_PACKAGE_GRAPH_INVALID');
  packageProjectionAnchors(value);packageLinkReservations(value);if(Buffer.byteLength(json(value))>PACKAGE_METADATA_LIMIT)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');return value;
}
export interface PackageGraphSnapshot {document:PackageBackupDocument;selection:SkillBackupSelection;approved:Map<string,ApprovedResourceLink>;owner:PackageBackupSource['lookup'];generation:unknown;generationFingerprint:string;policy:string;}
export async function capturePackageGraph(source:PackageBackupSource,options:BackupOptions={}):Promise<PackageGraphSnapshot>{
  options.signal?.throwIfAborted();json({seeds:source.seeds,protectedContainers:source.protectedContainers,forbiddenTrees:source.forbiddenTrees});const seeds=z.array(packageSeedSchema).max(MAX_NODES).parse(source.seeds),initialGeneration=generation(source);if(initialGeneration)resolutionSchema.parse(initialGeneration);const scopes=await scopeObservation(initialGeneration);
  const policy={protectedContainers:[...source.protectedContainers,...initialGeneration?[initialGeneration.profilesDir,...initialGeneration.profileDir?[initialGeneration.profileDir]:[]]:[]],forbiddenTrees:[...source.forbiddenTrees]},nodes:Node[]=[],edges:PackageBackupDocument['edges']=[],mappedSeeds:PackageBackupDocument['seeds']=[],seen=new Map<string,Node>();
  if(initialGeneration)seeds.push(...resolverSeeds(initialGeneration));
  async function installedNames(root:string):Promise<string[]>{
    const directory=join(root,'node_modules');let items;try{items=await readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}const names:string[]=[];
    for(const item of items.sort((a,b)=>a.name.localeCompare(b.name))){if(item.name.startsWith('.')||!item.isDirectory()&&!item.isSymbolicLink())continue;if(item.name.startsWith('@')){for(const child of (await readdir(join(directory,item.name),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=item.name+'/'+child.name;if((child.isDirectory()||child.isSymbolicLink())&&packageName.safeParse(name).success)names.push(name);}}else if(packageName.safeParse(item.name).success)names.push(item.name);if(names.length>MAX_EDGES)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');}return names;
  }
  async function visit(directory:string,hint:string):Promise<Node>{
    options.signal?.throwIfAborted();const root=await realpath(directory),previous=seen.get(root);if(previous)return previous;if(nodes.length>=MAX_NODES)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');
    await assertSkillBackupScope({roots:[{key:'EXAMPLE-package-scope',path:root,kind:'custom',mode:'library',enabled:true}],...policy},options.signal);
    const manifest=await packageManifest(root),node={id:sha(root),root,...manifestPackageIdentity(manifest.body,hint),manifestDigest:manifest.digest};nodes.push(node);seen.set(root,node);
    const requests=new Map<string,Set<PackageBackupDocument['edges'][number]['kinds'][number]>>();
    for(const [field,kind]of [['dependencies','dependency'],['optionalDependencies','optional'],['peerDependencies','peer'],['devDependencies','dev']] as const){const values=manifest.body[field];if(values===undefined)continue;if(!record(values)||Object.keys(values).length>MAX_EDGES)throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');for(const [name,spec]of Object.entries(values)){packageName.parse(name);if(typeof spec!=='string'||spec.length>8192)throw new BackupError('BACKUP_PACKAGE_MANIFEST_INVALID');const kinds=requests.get(name)??new Set();kinds.add(kind);requests.set(name,kinds);}}
    for(const name of await installedNames(root)){const kinds=requests.get(name)??new Set();kinds.add('installed');requests.set(name,kinds);}
    for(const [name,kinds]of [...requests].sort(([a],[b])=>a.localeCompare(b))){options.signal?.throwIfAborted();if(edges.length>=MAX_EDGES)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');const edge:PackageBackupDocument['edges'][number]={from:node.id,name,to:null,logicalDirectory:null,kinds:[...kinds]};edges.push(edge);const selected=source.lookup.packageOf(name,pathToFileURL(join(root,'package.json')).href);let target=selected?.dir;
      if(!target&&kinds.has('installed')){const direct=join(root,'node_modules',...name.split('/'));try{if((await stat(direct)).isDirectory())target=direct;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
      if(target){edge.to=(await visit(target,name)).id;edge.logicalDirectory=target;}
    }return node;
  }
  for(const seed of seeds){let node:Node|undefined,logicalDirectory:string|null=null;if(seed.directory){let present=true;try{await lstat(seed.directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;present=false;}if(present){node=await visit(seed.directory,seed.name);logicalDirectory=seed.directory;}}else{const selected=source.lookup.packageOf(seed.name,seed.parentURL);if(selected){node=await visit(selected.dir,seed.name);logicalDirectory=selected.dir;}}mappedSeeds.push({...seed,node:node?.id??null,logicalDirectory});}
  const links:PackageBackupDocument['links']=[],approved=new Map<string,ApprovedResourceLink>(),visited=new Set<string>();let entries=0;
  async function walk(owner:Node,relativeParts:string[]):Promise<void>{
    options.signal?.throwIfAborted();const directory=join(owner.root,...relativeParts);if(await realpath(directory)!==directory)throw new BackupError('BACKUP_SOURCE_CHANGED');
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name.toLowerCase()==='.git')continue;const path=join(directory,entry.name),child=[...relativeParts,entry.name];assertSkillResourcePath(child);if(visited.has(path))continue;visited.add(path);if(++entries>MAX_FILES)throw new BackupError('BACKUP_PACKAGE_GRAPH_LIMIT');const info=await lstat(path,{bigint:true});
      if(info.isSymbolicLink()){const target=await realpath(path),targetNode=nodes.filter(node=>inside(node.root,target)).sort((a,b)=>b.root.length-a.root.length)[0];if(!targetNode)throw new BackupError('BACKUP_PACKAGE_LINK_SCOPE_REFUSED');const targetParts=relative(targetNode.root,target).split(/[\\/]/).filter(Boolean);if(targetParts.length)assertSkillResourcePath(targetParts);if(targetParts.some(part=>part.toLowerCase()==='.git'))throw new BackupError('BACKUP_PACKAGE_LINK_SCOPE_REFUSED');const targetInfo=await stat(target);if(!targetInfo.isFile()&&!targetInfo.isDirectory())throw new BackupError('BACKUP_PACKAGE_LINK_SCOPE_REFUSED');const text=await readlink(path);links.push({from:owner.id,parts:child,to:targetNode.id,targetParts,directory:targetInfo.isDirectory(),originText:text});approved.set(path,{target,identity:[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':'),text});
      }else if(info.isDirectory())await walk(owner,child);else if(!info.isFile())throw new BackupError('BACKUP_PACKAGE_RESOURCE_INVALID');
    }
  }
  for(const node of nodes)await walk(node,[]);
  if(json(generation(source))!==json(initialGeneration)||json(await scopeObservation(initialGeneration))!==json(scopes))throw new BackupError('BACKUP_SOURCE_CHANGED');
  const document=validatePackageGraph({schema:PACKAGE_BACKUP_SCHEMA,resolution:initialGeneration,platform:{os:process.platform,arch:process.arch,node:process.versions.node,abi:process.versions.modules??'unknown'},seeds:mappedSeeds,nodes,edges,links,coverage:{wholeDeclaredPackageResources:true,knownLinks:true,vcsMetadata:false,credentialStores:false,originalPackageManagerFiles:false,activation:false,wholeApplicationRestore:false}});
  return {document,selection:packageResourceSelection(document,policy),approved,owner:source.lookup,generation:source.lookup.resolution,generationFingerprint:json({resolution:initialGeneration,scopes}),policy:json(policy)};
}
