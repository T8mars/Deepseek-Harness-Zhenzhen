import {workspaceDomainSpec,workspaceDomainState,workspaceRecord} from '@deepseek-ai/dsh-workspace';
import type {DomainFacility} from '@deepseek-ai/dsh-storage-domain';
import {Context} from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as Domain from '@deepseek-ai/dsh-storage-domain';
import * as Json from '@deepseek-ai/dsh-storage-json';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';
import {isAbsolute,join,relative} from 'node:path';
import {z} from 'zod';
import {SUPPORTED_DSH} from './compatibility.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {BackupError,openBackupArchive,writeBackupArchive} from './backup-archive.ts';
import type {BackupOptions,BackupRecord,BackupReceipt} from './backup-archive.ts';

const SCHEMA='dsh-zhen-workspaces-v1',MAX_WORKSPACES=10000,MAX_SESSION_REFS=100000,MAX_BYTES=32*1024**2;
type OpenDomain=NonNullable<ReturnType<DomainFacility['get']>>;
export interface WorkspaceBackupSource {facility:object|undefined;domain:Pick<OpenDomain,'name'|'global'|'table'>|undefined;revision:number;}
const pendingOptions=workspaceDomainState.shape.pendingMutation.unwrap().options;
const stateSchema=workspaceDomainState.extend({pendingMutation:z.discriminatedUnion('operation',[pendingOptions[0].strict(),pendingOptions[1].strict()]).optional()}).strict();
const documentSchema=z.object({
  schema:z.literal(SCHEMA),readerSdkVersion:z.literal(SUPPORTED_DSH),
  domain:z.object({name:z.literal(workspaceDomainSpec.name),declaredVersion:z.literal(workspaceDomainSpec.version)}).strict(),
  state:stateSchema,
  workspaces:z.array(z.object({id:workspaceDomainState.shape.workspaceIds.element,record:workspaceRecord.strict()}).strict()).max(MAX_WORKSPACES),
  coverage:z.object({allOpenDomainRecords:z.literal(true),allWorkspaceOrder:z.literal(true),credentialStoresIncluded:z.literal(false),workspaceDirectoryContentsIncluded:z.literal(false),activated:z.literal(false)}).strict(),
}).strict();
export type WorkspaceBackupDocument=z.infer<typeof documentSchema>;
export interface WorkspaceBackupLease {document:WorkspaceBackupDocument;records():AsyncGenerator<BackupRecord>;assertCurrent():Promise<void>;close():void;}
export interface WorkspaceRestoreCandidate {schema:typeof SCHEMA;root:string;storageRoot:string;metadata:string;workspaces:number;reviewReasons:string[];activated:false;readyForActivation:false;wholeApplicationRestore:false;}
function boundedState(state:WorkspaceBackupDocument['state']):void{
  if(state.workspaceIds.length>MAX_WORKSPACES||state.archivedSessionIds.length>MAX_SESSION_REFS||state.pinnedSessionIds.length>MAX_SESSION_REFS)throw new BackupError('BACKUP_WORKSPACE_LIMIT');
}
function validate(input:unknown):WorkspaceBackupDocument{
  const value=documentSchema.parse(input);boundedState(value.state);
  const ids=new Set<string>();let references=0;
  for(const row of value.workspaces){if(ids.has(row.id))throw new BackupError('BACKUP_WORKSPACE_ID_CONFLICT');ids.add(row.id);references+=row.record.sessionIds.length;if(references>MAX_SESSION_REFS)throw new BackupError('BACKUP_WORKSPACE_LIMIT');}
  if(Buffer.byteLength(backupJsonString(value))>MAX_BYTES)throw new BackupError('BACKUP_WORKSPACE_LIMIT');return value;
}
function capture(source:WorkspaceBackupSource):WorkspaceBackupDocument{
  if(!source.facility||!source.domain)throw new BackupError('BACKUP_WORKSPACE_UNAVAILABLE');
  if(!Number.isSafeInteger(source.revision)||source.revision<0||source.domain.name!==workspaceDomainSpec.name)throw new BackupError('BACKUP_WORKSPACE_SOURCE_INVALID');
  const state=stateSchema.parse(source.domain.global.get());boundedState(state);
  const workspaces:WorkspaceBackupDocument['workspaces']=[];
  for(const [id,value]of source.domain.table('workspaces').entries()){
    if(workspaces.length>=MAX_WORKSPACES)throw new BackupError('BACKUP_WORKSPACE_LIMIT');
    const record=workspaceRecord.strict().parse(value);if(record.sessionIds.length>MAX_SESSION_REFS)throw new BackupError('BACKUP_WORKSPACE_LIMIT');
    workspaces.push({id:workspaceDomainState.shape.workspaceIds.element.parse(id),record});
  }
  // Known optional undefined fields have the same omission semantics as the
  // published JSON backend. Unknown fields still fail the strict SDK schemas.
  return validate(JSON.parse(JSON.stringify({schema:SCHEMA,readerSdkVersion:SUPPORTED_DSH,domain:{name:workspaceDomainSpec.name,declaredVersion:workspaceDomainSpec.version},state,workspaces,coverage:{allOpenDomainRecords:true,allWorkspaceOrder:true,credentialStoresIncluded:false,workspaceDirectoryContentsIncluded:false,activated:false}})));
}
/** Reads an already open public domain; absence is unavailable, never empty.
 * Source lifecycle and domain/changed revision belong to the Host adapter. */
export async function prepareWorkspaceBackup(resolve:()=>WorkspaceBackupSource,options:BackupOptions={}):Promise<WorkspaceBackupLease>{
  const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;let closed=false,used=false;
  const check=()=>{if(closed)throw new BackupError('BACKUP_WORKSPACE_LEASE_CLOSED');signal.throwIfAborted();};
  const fail=(error:unknown):never=>{check();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_WORKSPACE_READ_FAILED');};
  const read=()=>{try{check();const source={...resolve()};return{source,document:capture(source)};}catch(error){return fail(error);}};
  const initial=read(),serialized=backupJsonString(initial.document),bytes=Buffer.from(serialized);
  const assertCurrent=async()=>{const current=read();if(current.source.facility!==initial.source.facility||current.source.domain!==initial.source.domain||current.source.revision!==initial.source.revision||backupJsonString(current.document)!==serialized)throw new BackupError('BACKUP_SOURCE_CHANGED');};
  await assertCurrent();
  return{document:structuredClone(initial.document),assertCurrent,close(){if(!closed){closed=true;controller.abort();}},async*records(){
    check();if(used)throw new BackupError('BACKUP_WORKSPACE_STREAM_USED');used=true;await assertCurrent();
    yield{metadata:{kind:'workspace-inventory',schema:SCHEMA},size:bytes.length,data:(async function*(){check();yield bytes;check();})()};
    await assertCurrent();
  }};
}
export async function* workspaceBackupRecords(source:()=>WorkspaceBackupSource,options:BackupOptions={}):AsyncGenerator<BackupRecord>{const lease=await prepareWorkspaceBackup(source,options);try{yield*lease.records();}finally{lease.close();}}
export async function writeWorkspaceBackup(destination:string,password:string,source:()=>WorkspaceBackupSource,options:BackupOptions={}):Promise<BackupReceipt>{return writeBackupArchive(destination,password,workspaceBackupRecords(source,options),options);}
function reviewReasons(value:WorkspaceBackupDocument):string[]{
  const {state,workspaces}=value,ids=new Set(workspaces.map(row=>row.id)),ordered=new Set(state.workspaceIds),reasons:string[]=[];
  if(state.pendingMutation)reasons.push('pending-mutation');
  if(state.workspaceIds.some(id=>!ids.has(id)))reasons.push('missing-ordered-record');
  if(workspaces.some(row=>!ordered.has(row.id)))reasons.push('unordered-record');
  if(ordered.size!==state.workspaceIds.length)reasons.push('duplicate-workspace-order');
  if(state.defaultWorkspaceId!==undefined&&!ids.has(state.defaultWorkspaceId))reasons.push('missing-default-record');
  const archived=new Set(state.archivedSessionIds);if(state.pinnedSessionIds.some(id=>archived.has(id)))reasons.push('pin-archive-conflict');
  if(!state.initialized)reasons.push('bootstrap-not-complete');
  return reasons;
}
/** Full authentication and schema checks precede creating the inactive target.
 * This writes only fresh owned storage through the published SDK, never cwd
 * directories, session sources, current registry, grants, scripts or Agents. */
export async function restoreWorkspaceBackup(source:string,password:string,parent:string,options:BackupOptions={}):Promise<WorkspaceRestoreCandidate>{
  if(!isAbsolute(parent))throw new BackupError('BACKUP_PATH_INVALID');
  const directory=await realpath(parent),archive=await openBackupArchive(source,password,options);let root:string|undefined,ctx:Context|undefined,complete=false;
  try{
    const records=archive.records(),first=await records.next();
    if(first.done||first.value.metadata.kind!=='workspace-inventory'||first.value.metadata.schema!==SCHEMA||Object.keys(first.value.metadata).length!==2||first.value.size>MAX_BYTES)throw new BackupError('BACKUP_WORKSPACE_MANIFEST_INVALID');
    const parts:Uint8Array[]=[];let size=0;for await(const bytes of first.value.data){options.signal?.throwIfAborted();size+=bytes.length;if(size>MAX_BYTES)throw new BackupError('BACKUP_WORKSPACE_LIMIT');parts.push(bytes);}
    const document=validate(parseBackupJson(Buffer.concat(parts,size)));if(!(await records.next()).done)throw new BackupError('BACKUP_WORKSPACE_TRAILING_RECORDS');options.signal?.throwIfAborted();
    root=await realpath(await mkdtemp(join(directory,'dsh-zhen-workspaces-restore-')));ctx=new Context();const storageRoot=join(root,'storage');
    await ctx.plugin(Storage);await ctx.plugin(Json,{root:storageRoot});await ctx.plugin(Domain,{backend:'json'});const domain=await ctx.storage.domain.open(workspaceDomainSpec),table=domain.table('workspaces');
    for(const row of document.workspaces){options.signal?.throwIfAborted();await table.put(row.id,row.record);}
    options.signal?.throwIfAborted();await domain.global.set(document.state);
    const restored=capture({facility:ctx.storage.domain,domain,revision:0});
    if(backupJsonString(restored)!==backupJsonString(document))throw new BackupError('BACKUP_WORKSPACE_RESTORE_MISMATCH');
    await ctx.fiber.dispose();ctx=undefined;options.signal?.throwIfAborted();
    const metadata=join(root,'dsh-zhen-workspaces-restore.json'),result:WorkspaceRestoreCandidate={schema:SCHEMA,root,storageRoot,metadata,workspaces:document.workspaces.length,reviewReasons:reviewReasons(document),activated:false,readyForActivation:false,wholeApplicationRestore:false};
    await writeFile(metadata,backupJsonString({document,candidate:result})+'\n',{flag:'wx',mode:0o600});options.signal?.throwIfAborted();complete=true;return result;
  }catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_WORKSPACE_RESTORE_FAILED');}
  finally{try{await ctx?.fiber.dispose();await archive.close();}finally{if(root&&!complete){const actual=await realpath(root),part=relative(directory,actual);if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-workspaces-restore-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}}
}
