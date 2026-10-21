import {initProfile,writeProfileManifest,resolveProfileDir,loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import type {ProfileManifest,ProfilePluginDependency} from '@deepseek-ai/dsh-app-boot';
import type {PatchOptions} from '@deepseek-ai/cordis-plugin-include';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,realpath,lstat,writeFile,rm} from 'node:fs/promises';
import {isAbsolute,join,relative} from 'node:path';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions} from './backup-archive.ts';
import {readProfileBackup} from './backup-profiles.ts';
import type {ProfileBackupDocument} from './backup-profiles.ts';
import {backupJsonString as json} from './backup-data.ts';

export interface RestoredProfile {
  originName:string;
  name:string;
  directory:string;
  overlay:string;
  wasActive:boolean;
  manifest:ProfileManifest;
  declaredDependencies:readonly ProfilePluginDependency[];
  pendingCompatibility:ProfileBackupDocument['profiles'][number]['compatibility'];
  launch:{args:readonly string[];env:{DSH_HOME:string;DSH_AGENTS_HOME:string;DSH_TELEMETRY_DISABLED:'1'}}|null;
  launchBlockedReason:'DESKTOP_MANAGED_PROFILE'|null;
}
export interface ProfileRestoreCandidate {
  root:string;
  home:string;
  agentsHome:string;
  provenance:string;
  profiles:RestoredProfile[];
  document:ProfileBackupDocument;
  activated:false;
  readyForActivation:false;
  coverage:{manifests:true;orderedPatchOverlays:true;expressionData:true;packageArtifacts:false;originalPackageManagerFiles:false;compatibilityGrants:false;wholeApplicationRestore:false};
}
interface Plan {source:ProfileBackupDocument['profiles'][number];name:string;patches:PatchOptions[];active:boolean;}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function preflight(document:ProfileBackupDocument):Plan[]{
  const result:Plan[]=[],names=new Set<string>();
  for(const source of document.profiles){
    // The snapshot reader keeps unknown npm metadata. Validate the structural
    // DSH fields used by a future public CLI launch, without importing packages.
    const dsh=source.manifest.dsh;
    if(dsh!==undefined){
      if(!record(dsh))throw new BackupError('BACKUP_PROFILE_MANIFEST_INVALID');
      const profile=dsh.profile;
      if(profile!==undefined&&(!record(profile)||profile.bundles!==undefined&&(!Array.isArray(profile.bundles)||profile.bundles.length>2048||profile.bundles.some(value=>typeof value!=='string'||!value||value.length>4096))))throw new BackupError('BACKUP_PROFILE_MANIFEST_INVALID');
    }
    const name='restore-'+createHash('sha256').update(source.name).digest('hex').slice(0,32);if(names.has(name))throw new BackupError('BACKUP_PROFILE_NAME_CONFLICT');names.add(name);
    const active=document.active?.name===source.name;
    // Match public readProfilePatches: bundle layers are supplied by the
    // candidate manifest; then profile, home-machine, and active CLI overlays.
    const patches=[...source.patch.patches,...document.machine.patches,...active?document.active!.overlays:[]];
    json(patches);result.push({source,name,patches,active});
  }
  return result;
}
async function removeCandidate(parent:string,root:string):Promise<void>{
  const stat=await lstat(root),actual=await realpath(root),part=relative(parent,actual);
  if(stat.isSymbolicLink()||!stat.isDirectory()||!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-profile-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');
  await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
/** Authenticate the complete archive first. Only public SDK initialization and
 * manifest writers generate a fresh, inactive home. Source patches live in our
 * own portable overlays, never in a privately reconstructed SDK storage layout. */
export async function restoreProfileBackup(source:string,password:string,parent:string,options:BackupOptions={}):Promise<ProfileRestoreCandidate>{
  options.signal?.throwIfAborted();if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');
  const directory=await realpath(parent);if(!(await lstat(directory)).isDirectory())throw new BackupError('BACKUP_PATH_INVALID');
  const document=await readProfileBackup(source,password,options),plans=preflight(document);options.signal?.throwIfAborted();
  let root:string|undefined,complete=false;
  try{
    root=await mkdtemp(join(directory,'dsh-zhen-profile-restore-'));const home=join(root,'home'),agentsHome=join(root,'agents'),overlays=join(root,'overlays');
    await mkdir(home,{mode:0o700});await mkdir(agentsHome,{mode:0o700});await mkdir(overlays,{mode:0o700});const profiles:RestoredProfile[]=[];
    for(const plan of plans){
      options.signal?.throwIfAborted();const target=resolveProfileDir(plan.name,home),overlay=join(overlays,plan.name+'.json');
      initProfile(target,[]);writeProfileManifest(target,plan.source.manifest);
      await writeFile(overlay,json(plan.patches)+'\n',{flag:'wx',mode:0o600});
      if(json(loadOverlayPatches('dsh-zhen restore',overlay))!==json(plan.patches))throw new BackupError('BACKUP_PROFILE_OVERLAY_MISMATCH');
      const desktop=plan.source.name.toLowerCase()==='desktop';
      profiles.push({originName:plan.source.name,name:plan.name,directory:target,overlay,wasActive:plan.active,manifest:structuredClone(plan.source.manifest),declaredDependencies:structuredClone(plan.source.dependencies),pendingCompatibility:structuredClone(plan.source.compatibility),launch:desktop?null:{args:['--profile',plan.name,'--patch',overlay],env:{DSH_HOME:home,DSH_AGENTS_HOME:agentsHome,DSH_TELEMETRY_DISABLED:'1'}},launchBlockedReason:desktop?'DESKTOP_MANAGED_PROFILE':null});
    }
    const provenance=join(root,'dsh-zhen-profile-restore.json'),coverage={manifests:true,orderedPatchOverlays:true,expressionData:true,packageArtifacts:false,originalPackageManagerFiles:false,compatibilityGrants:false,wholeApplicationRestore:false} as const;
    // Historical compatibility exemptions are retained as data. Fresh-machine
    // grants need the SDK's explicit informed acknowledgement during activation.
    const result:ProfileRestoreCandidate={root,home,agentsHome,provenance,profiles,document,activated:false,readyForActivation:false,coverage};
    await writeFile(provenance,json(result)+'\n',{flag:'wx',mode:0o600});options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROFILE_RESTORE_FAILED');}
  finally{if(root&&!complete)await removeCandidate(directory,root);}
}
