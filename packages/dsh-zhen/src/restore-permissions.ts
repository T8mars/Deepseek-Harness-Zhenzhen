import type {} from '@deepseek-ai/dsh-permission-presets';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type {} from '@deepseek-ai/dsh-user-approval';
import {SessionSeq} from '@deepseek-ai/dsh-session';
import type {SessionEvent} from '@deepseek-ai/dsh-session';
import {BackupError} from './backup-archive.ts';

export interface RestoredPermissionFold {seen:boolean;preset:unknown;mode:unknown;approval:unknown;}
export function emptyRestoredPermissionFold():RestoredPermissionFold{return{seen:false,preset:undefined,mode:undefined,approval:undefined};}
/** Published 0.2.1-rc.2 log-only permission events. Keep original events; only
 * a NEW application copy receives the current recovery boundary below. */
export function foldRestoredPermissions(state:RestoredPermissionFold,event:SessionEvent):void{
  if(event.type==='permission/preset'){state.seen=true;state.preset=event.data.preset;}
  else if(event.type==='sandbox/mode'){state.seen=true;state.mode=event.data.mode;}
  else if(event.type==='approval/policy'){state.seen=true;state.approval=event.data.policy;}
}
export function requiresRestoredPermissionReset(state:RestoredPermissionFold):boolean{return state.seen&&(state.preset!=='read-only'||state.mode!=='read-only'||state.approval!=='ask');}
export function restoredPermissionEvents(offset:number,time=Date.now()):SessionEvent[]{
  if(!Number.isSafeInteger(offset)||offset<0||offset>Number.MAX_SAFE_INTEGER-4)throw new BackupError('BACKUP_SESSION_APPLICATION_LIMIT');
  return[
    {type:'permission/preset',seq:SessionSeq(offset),time,data:{preset:'read-only'}},
    {type:'sandbox/mode',seq:SessionSeq(offset+1),time,data:{mode:'read-only'}},
    {type:'approval/policy',seq:SessionSeq(offset+2),time,data:{policy:'ask'}},
  ];
}
const literal=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&!Object.hasOwn(value,'__jsExpr');
// Source: dsh-v0.2.1-rc.2 PermissionPresetService.Config defaults. C194 checks
// the published defaults; the full config is replaced, never deep-patched.
const implicitPresets={
  'workspace-write':{sandbox:'workspace-write',approval:'ask',name:'workspace-write',description:'Write inside the workspace and permitted temporary directories; wider retries require approval.'},
  'danger-full-access':{sandbox:'danger-full-access',approval:'never',name:'danger-full-access',description:'Full file access without approval prompts.'},
};
export function restoredPermissionConfig(module:string,input:unknown):Record<string,unknown>|null{
  if(!['@deepseek-ai/dsh-permission-presets','@deepseek-ai/dsh-sandbox-policy','@deepseek-ai/dsh-user-approval'].includes(module))return null;
  if(input!==undefined&&!literal(input))throw new BackupError('BACKUP_APPLICATION_CONFIG_REVIEW');
  const config=structuredClone(input??{}) as Record<string,unknown>;
  if(module==='@deepseek-ai/dsh-sandbox-policy')return{...config,mode:'read-only'};
  if(module==='@deepseek-ai/dsh-user-approval')return{...config,policy:'ask'};
  const presets=config.presets===undefined?implicitPresets:config.presets;
  if(!literal(presets))throw new BackupError('BACKUP_APPLICATION_CONFIG_REVIEW');
  return{...config,presets:{...presets,'read-only':{sandbox:'read-only',approval:'ask',name:'恢复后只读',description:'恢复副本先以只读方式打开；请在当前应用重新选择权限。'}},defaultPreset:'read-only'};
}
