import {posix,win32} from 'node:path';
import {BackupError} from './backup-archive.ts';

export interface SkillProjectionAnchor{key:string;canonicalRoot:string;present:boolean;}
interface Root{canonicalRoot:string;present:boolean;excludedMetadata?:string[];}
interface Node{root:number;parts:string[];kind:'directory'|'file';bytes:number;sha256?:string;executable?:boolean;}
export interface ProjectedLocation{group:number;parts:string[];}
export interface SkillProjection{roots:ProjectedLocation[];anchors:Array<SkillProjectionAnchor&{location:ProjectedLocation}>;directories:ProjectedLocation[];nodes:ProjectedLocation[];firstFiles:Map<string,number>;groups:number;}
/** Origin paths are lexical identifiers only. Never resolve them on this host. */
export function originKey(path:string):string{
  if(win32.isAbsolute(path)&&!posix.isAbsolute(path))return 'w|'+win32.normalize(path).replaceAll('\\','/').replace(/^([a-z]):/,(_,drive:string)=>drive.toUpperCase()).replace(/\/$/,'');
  if(posix.isAbsolute(path))return 'p|'+posix.normalize(path).replace(/\/$/,'');
  throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
}
const below=(parent:string,child:string)=>parent===child||child.startsWith(parent+'/');
export const projectedKey=(value:ProjectedLocation)=>value.group+':'+value.parts.join('/');
/** Build one physical forest for equal/overlapping origins. Conflicting bytes,
 * presence or portable spellings fail before any destination is created. */
export function projectSkillRoots(roots:readonly Root[],nodes:readonly Node[],anchors:readonly SkillProjectionAnchor[],checkParts:(parts:readonly string[])=>void):SkillProjection{
  if(anchors.length>16)throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');
  const all=[...roots,...anchors],keys=all.map(root=>originKey(root.canonicalRoot)),unique=[...new Set(keys)],top=unique.filter(key=>!unique.some(other=>other!==key&&below(other,key))),groups=new Map(top.map((key,index)=>[key,index]));
  const locations=keys.map(key=>{const parent=top.find(value=>below(value,key));if(parent===undefined)throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');const parts=key===parent?[]:key.slice(parent.length+1).split('/');if(parts.length){checkParts(parts);if(parts.some(part=>part.toLowerCase()==='.git'))throw new BackupError('BACKUP_SKILL_PATH_INVALID');}return {group:groups.get(parent)!,parts};});
  for(let i=0;i<all.length;i++)if(!all[i]!.present&&all.some((root,j)=>root.present&&below(keys[i]!,keys[j]!)))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');
  const directories=new Map<string,ProjectedLocation>(),spellings=new Map<string,string>(),files=new Map<string,{index:number;node:Node}>(),nodeLocations:ProjectedLocation[]=[];
  const spelling=(location:ProjectedLocation)=>{for(let count=0;count<=location.parts.length;count++){const exact=location.group+':'+location.parts.slice(0,count).join('/'),key=exact.normalize('NFKC').toLowerCase(),old=spellings.get(key);if(old!==undefined&&old!==exact)throw new BackupError('BACKUP_SKILL_PATH_COLLISION');spellings.set(key,exact);}};
  const directory=(location:ProjectedLocation)=>{spelling(location);for(let count=0;count<=location.parts.length;count++){const value={group:location.group,parts:location.parts.slice(0,count)},key=projectedKey(value);if(files.has(key))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');directories.set(key,value);}};
  all.forEach((root,index)=>{if(root.present)directory(locations[index]!);});
  nodes.forEach((node,index)=>{const base=locations[node.root];if(!base)throw new BackupError('BACKUP_SKILL_MANIFEST_INVALID');const location={group:base.group,parts:[...base.parts,...node.parts]};checkParts(location.parts);spelling(location);nodeLocations.push(location);if(node.kind==='directory'){directory(location);return;}directory({group:location.group,parts:location.parts.slice(0,-1)});const key=projectedKey(location);if(directories.has(key))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');const old=files.get(key);if(old&&(old.node.bytes!==node.bytes||old.node.sha256!==node.sha256||old.node.executable!==node.executable))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');if(!old)files.set(key,{index,node});});
  all.forEach((root,index)=>{const key=projectedKey(locations[index]!);if(!root.present&&(directories.has(key)||files.has(key)))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');});
  // Each declared root is a complete snapshot within its explicit exclusions.
  // A union must not silently resurrect a file absent from another full view.
  const observed=roots.map(()=>new Set<string>());nodes.forEach(node=>observed[node.root]!.add(node.parts.join('/')));
  const physical=[...directories.values(),...[...files.keys()].map(key=>{const colon=key.indexOf(':');return {group:Number(key.slice(0,colon)),parts:key.slice(colon+1).split('/')};})];
  roots.forEach((root,index)=>{if(!root.present)return;const base=locations[index]!;for(const item of physical){if(item.group!==base.group||item.parts.length<=base.parts.length||!base.parts.every((part,i)=>part===item.parts[i]))continue;const parts=item.parts.slice(base.parts.length);if(root.excludedMetadata?.includes('.system')&&parts[0]==='.system')continue;if(!observed[index]!.has(parts.join('/')))throw new BackupError('BACKUP_SKILL_ROOT_CONFLICT');}});
  return {roots:locations.slice(0,roots.length),anchors:anchors.map((anchor,index)=>({...anchor,location:locations[roots.length+index]!})),directories:[...directories.values()].sort((a,b)=>a.parts.length-b.parts.length||a.group-b.group||a.parts.join('/').localeCompare(b.parts.join('/'))),nodes:nodeLocations,firstFiles:new Map([...files].map(([key,value])=>[key,value.index])),groups:top.length};
}
