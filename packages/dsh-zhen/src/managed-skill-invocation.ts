import {createHash} from 'node:crypto';

export type ManagedSkillKind='market'|'local'|'github';
export interface ManagedSkillInvocationRow {
  kind:ManagedSkillKind;id:string;key:string;name:string;version:string;location:string|null;enabled:boolean;eligible:boolean;
}
/** Invocation consent never enables writes, pending activation or downloads. */
export interface ManagedSkillInvocationGate {token(key:string):string|undefined;}
export function managedSkillInvocationKey(kind:ManagedSkillKind,id:string,identity:string):string{return createHash('sha256').update(kind+'\0'+id+'\0'+identity).digest('hex');}
