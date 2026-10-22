import {Context} from '@deepseek-ai/cordis';
import Sessions from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import {createHash} from 'node:crypto';
import {lstat,readdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {BackupError} from './backup-archive.ts';
import {inspectRecoveryLayout} from './recovery-layout.ts';
import {verifyRecoveryCandidate} from './recovery-candidate.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';
import {recoveryProjectCursorSchema,recoveryProjectSelectionSchema,recoveryProjectsSchema} from './recovery-project-schema.ts';
import type {RecoveryProjects,RecoveryProjectSelection} from './recovery-project-schema.ts';
import type {SessionDirectoryBinding} from './restore-sessions.ts';

type Project={id:string;originalDirectory:string|null;sessionIds:string[]};
const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
/** The SDK may read session files while listing headers. Refuse any link in
 * this owned subtree before mounting it; package links elsewhere are unrelated. */
async function ordinaryTree(root:string,signal?:AbortSignal){
  let entries=0;async function visit(path:string):Promise<void>{signal?.throwIfAborted();if(++entries>300000)throw new BackupError('BACKUP_PROJECT_INVENTORY_LIMIT');const stat=await lstat(path);if(stat.isSymbolicLink()||!same(await realpath(path),path))throw new BackupError('BACKUP_TEMP_BOUNDARY');if(stat.isDirectory()){for(const row of await readdir(path,{withFileTypes:true}))await visit(join(path,row.name));}else if(!stat.isFile())throw new BackupError('BACKUP_TEMP_BOUNDARY');}await visit(root);
}
async function inventory(baseline:RecoveryBaseline,signal?:AbortSignal):Promise<{status:RecoveryProjects['status'];projects:Project[];sessions:number}>{
  signal?.throwIfAborted();const plan=await inspectRecoveryLayout(baseline,signal);if(plan.status==='legacy')return{status:'legacy',projects:[],sessions:0};const source=plan.components.find(row=>row.kind==='sessions');if(!source)return{status:'unselected',projects:[],sessions:0};if(!source.details)return{status:'legacy',projects:[],sessions:0};
  const location=source.locations.find(row=>row.role==='sessions');if(!location||location.state!=='available'||!same(location.path,join(source.root,'sessions')))throw new BackupError('BACKUP_PROJECT_INVENTORY_INVALID');await ordinaryTree(location.path,signal);
  const expected=baseline.components.find(row=>row.kind==='sessions')?.counts.sessions,ctx=new Context();let snapshots;
  try{await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:location.path});snapshots=await ctx.sessionPersistence.list({signal});}finally{await ctx.fiber.dispose();}
  if(snapshots.length>10000||snapshots.length!==expected)throw new BackupError('BACKUP_PROJECT_INVENTORY_INVALID');
  const groups=new Map<string,Project>(),ids=new Set<string>();for(const row of snapshots){signal?.throwIfAborted();const sessionId=String(row.header.id),originalDirectory=row.header.cwd??null;if(!sessionId||sessionId.length>255||ids.has(sessionId)||originalDirectory!==null&&(typeof originalDirectory!=='string'||!originalDirectory||originalDirectory.length>4096))throw new BackupError('BACKUP_PROJECT_INVENTORY_INVALID');ids.add(sessionId);const id=createHash('sha256').update(JSON.stringify(originalDirectory)).digest('hex');let group=groups.get(id);if(!group){group={id,originalDirectory,sessionIds:[]};groups.set(id,group);}group.sessionIds.push(sessionId);}
  const after=await verifyRecoveryCandidate(baseline,{signal});if(after.integrity!=='unchanged')throw new BackupError(after.integrity==='changed'?'BACKUP_CANDIDATE_CHANGED':'BACKUP_CANDIDATE_UNAVAILABLE');signal?.throwIfAborted();
  return{status:'available',projects:[...groups.values()].sort((a,b)=>{const left=a.originalDirectory??'',right=b.originalDirectory??'';return left<right?-1:left>right?1:0;}),sessions:snapshots.length};
}
async function protectedInventory(baseline:RecoveryBaseline,signal?:AbortSignal){try{return await inventory(baseline,signal);}catch(error){signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROJECT_INVENTORY_FAILED');}}
/** Owner-only bounded metadata. No message/event contents, source project
 * reads, directory permissions, Agent or archived module execution. */
export async function inspectRecoveryProjects(baseline:RecoveryBaseline,cursor='',signal?:AbortSignal):Promise<RecoveryProjects>{
  const parsed=recoveryProjectCursorSchema.safeParse(cursor);if(!parsed.success)throw new BackupError('BACKUP_PROJECT_CURSOR_INVALID');const result=await protectedInventory(baseline,signal),offset=Number(cursor),items=result.projects.slice(offset,offset+20);return recoveryProjectsSchema.parse({root:baseline.root,status:result.status,totalProjects:result.projects.length,totalSessions:result.sessions,items:items.map(row=>({id:row.id,originalDirectory:row.originalDirectory,sessions:row.sessionIds.length})),nextCursor:offset+20<result.projects.length?String(offset+20):null,activated:false});
}
/** Resolve IDs on the Host from the original candidate. The fresh restoration
 * separately checks every session's original directory before appending. */
export async function resolveRecoveryProjectBindings(baseline:RecoveryBaseline,selection:RecoveryProjectSelection,signal?:AbortSignal):Promise<SessionDirectoryBinding[]>{
  const parsed=recoveryProjectSelectionSchema.safeParse(selection);if(!parsed.success)throw new BackupError('BACKUP_PROJECT_SELECTION_INVALID');const result=await protectedInventory(baseline,signal),byId=new Map(result.projects.map(row=>[row.id,row])),bindings:SessionDirectoryBinding[]=[];
  for(const row of parsed.data.directories){signal?.throwIfAborted();const project=byId.get(row.projectId);if(!project)throw new BackupError('BACKUP_PROJECT_SELECTION_UNKNOWN');for(const sessionId of project.sessionIds)bindings.push({sessionId,directory:row.directory,originalDirectory:project.originalDirectory});}return bindings;
}
