import type {Context,FiberState} from '@deepseek-ai/cordis';
import type {Entry} from '@deepseek-ai/cordis-plugin-loader';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {LocalFileSystem} from '@deepseek-ai/dsh-fs-local';
import type {} from '@deepseek-ai/dsh-workspace';
import type {} from '@deepseek-ai/dsh-working-directory';
import type {} from '@deepseek-ai/dsh-session';
import {BackupError} from './backup-archive.ts';
import {resolveSkillFilesystem} from './backup-skill-inventory.ts';
import type {SkillInventorySource} from './backup-skill-inventory.ts';

export type ManagedSkillBackupServices=Pick<SkillInventorySource,'local'|'github'|'market'|'feed'>;
export interface HostSkillBackupPolicy {
  protectedContainers:readonly string[];
  forbiddenTrees:readonly string[];
  /** Additional directories from the complete session backup. The Host registry
   * and live sessions alone do not describe historical working-directory changes. */
  additionalWorkspaces?:readonly string[];
}
// Published Cordis 4.0.5 declares an ambient const enum, not a runtime export.
const ACTIVE:FiberState=2,DISPOSED:FiberState=4;
function literalDisabled(entry:Entry):boolean{
  const visited=new Set<Entry>();
  for(let current:Entry|undefined=entry;current;current=current.parent.ctx.fiber.entry){
    if(visited.has(current))throw new BackupError('BACKUP_HOST_ENTRY_INVALID');visited.add(current);
    if(current.options.disabled===true)return true;
    if(current.options.disabled!==undefined&&current.options.disabled!==null&&typeof current.options.disabled!=='boolean')throw new BackupError('BACKUP_HOST_DISABLED_UNRESOLVED');
  }
  return false;
}
function assertLiteral(value:unknown):void{
  // Reject data-form expressions without evaluating them or invoking getters.
  // backupJsonString has already rejected accessors, symbols and custom classes.
  if(!value||typeof value!=='object')return;
  if(Object.hasOwn(value,'__jsExpr'))throw new BackupError('BACKUP_HOST_CONFIG_UNRESOLVED');
  for(const child of Object.values(value))assertLiteral(child);
}
function isFilesystem(entry:Entry):boolean{
  if(entry.options.name==='@deepseek-ai/dsh-skill-filesystem')return true;
  const name=entry.options.name,module=entry.moduleNamespace??(name.startsWith('cordis:')?Object.getOwnPropertyDescriptor(entry.loader.builtins,name.slice(7))?.value:undefined);
  return !!module&&(typeof module==='object'||typeof module==='function')&&Object.getOwnPropertyDescriptor(module,'FileSystemSkillProvider')?.value===FileSystemSkillProvider;
}
/** Host-only public SDK adapter. Reads configured filesystem entries, declared
 * workspaces, deployment default and committed live directories. It never loads
 * entries, evaluates expressions, scans the winner catalog or opens credentials.
 * Directly registered third-party/virtual providers need their own adapter. */
export function hostSkillInventorySource(ctx:Context,managed:ManagedSkillBackupServices,policy:HostSkillBackupPolicy):SkillInventorySource{
  try{
    const loader=ctx.get('loader'),registry=ctx.get('workspaceRegistry'),working=ctx.get('workingDirectory'),sessions=ctx.get('sessions');
    if(!loader||!registry||!working||!sessions)throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');
    const filesystem:SkillInventorySource['filesystem'][number][]=[];let count=0;
    for(const entry of loader.entries()){
      if(++count>4096)throw new BackupError('BACKUP_HOST_ENTRY_LIMIT');
      if(entry.options.group&&entry.fiber?.state!==ACTIVE&&Array.isArray(entry.options.config)&&entry.options.config.length)throw new BackupError('BACKUP_HOST_GROUP_UNAVAILABLE');
      if(!isFilesystem(entry))continue;
      if(filesystem.length>=16)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');
      const fiber=entry.fiber,active=fiber?.state===ACTIVE&&fiber.uid!==null;
      if(!active&&(!literalDisabled(entry)||fiber&&fiber.state!==DISPOSED))throw new BackupError('BACKUP_HOST_PROVIDER_UNAVAILABLE');
      const raw=active?fiber!.config:entry.options.config??{};
      // Detach only the config of this provider; do not serialize the Host tree.
      const config=resolveSkillFilesystem(raw);if(!active)assertLiteral(raw);
      const backend=entry.context.get('fs');
      if(backend!==undefined&&!(backend instanceof LocalFileSystem))throw new BackupError('BACKUP_SKILL_FILESYSTEM_UNSUPPORTED');
      filesystem.push({id:entry.id,mode:'host-local',config,enabled:!!active});
    }
    const declared=registry.list(),live=sessions.list();
    if(declared.length>10000||live.length>10000||policy.additionalWorkspaces&&policy.additionalWorkspaces.length>10000)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');
    const workspaces=[...new Set([working.defaultDirectory,...declared.map(value=>value.path),...live.map(value=>working.get(value)),...policy.additionalWorkspaces??[]])];
    if(workspaces.length>128)throw new BackupError('BACKUP_SKILL_INVENTORY_LIMIT');
    return {filesystem,workspaces,...managed,protectedContainers:[...policy.protectedContainers],forbiddenTrees:[...policy.forbiddenTrees]};
  }catch(error){if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_HOST_SKILL_READ_FAILED');}
}
