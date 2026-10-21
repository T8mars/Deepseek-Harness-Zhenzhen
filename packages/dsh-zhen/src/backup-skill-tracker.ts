import type {Context,Fiber} from '@deepseek-ai/cordis';
import type {Entry} from '@deepseek-ai/cordis-plugin-loader';
import {isFilesystemEntry} from './backup-host-skills.ts';
import {resolveSkillFilesystem} from './backup-skill-inventory.ts';
import type {ResolvedSkillFilesystem,SkillFilesystemDefaults} from './backup-skill-inventory.ts';
import {backupJsonString} from './backup-data.ts';
import {BackupError} from './backup-archive.ts';

declare module '@deepseek-ai/cordis' {interface Context {zhenSkillBackupSources:SkillSourceTracker;}}
interface Capture {roots:ResolvedSkillFilesystem;defaults:SkillFilesystemDefaults;}
/** Observes public activation hooks without modifying config. A validation-only
 * probe must not replace the last committed source of a running provider. */
export class SkillSourceTracker {
  private readonly pending=new WeakMap<Fiber,Capture>();
  private readonly committed=new WeakMap<Fiber,Capture>();
  private closed=false;
  constructor(ctx:Context){
    const self=this;
    ctx.on('internal/config',function(_raw,next){
      const config=next();
      if(this.entry&&isFilesystemEntry(this.entry)){
        self.pending.delete(this);
        try{
          const ambient=resolveSkillFilesystem({}),defaults:SkillFilesystemDefaults={dshHome:ambient.dshHome,agentsHome:ambient.agentsHome,cwd:process.cwd(),...ambient.bundledSkillDir!==undefined?{bundledSkillDir:ambient.bundledSkillDir}:{}};
          self.pending.set(this,{roots:resolveSkillFilesystem(config,defaults),defaults});
        }catch{/* Preserve application startup behavior; backup refuses an unobserved source. */}
      }
      return config;
    },{global:true,prepend:true});
    ctx.on('internal/status',fiber=>{
      if(fiber.state===2){const value=self.pending.get(fiber);if(value)self.committed.set(fiber,value);else self.committed.delete(fiber);}
      else self.committed.delete(fiber);
    },{global:true});
    ctx.effect(()=>()=>{this.closed=true;},'zhen: skill source activation snapshots');
  }
  get(entry:Entry):ResolvedSkillFilesystem|undefined{
    if(this.closed)throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');
    const fiber=entry.fiber;if(!fiber||fiber.state!==2)return;
    const value=this.committed.get(fiber);if(!value)return;
    if(backupJsonString(resolveSkillFilesystem(fiber.config,value.defaults))!==backupJsonString(value.roots))throw new BackupError('BACKUP_SOURCE_CHANGED');
    return structuredClone(value.roots);
  }
}
