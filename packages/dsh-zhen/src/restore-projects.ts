import{Context}from'@deepseek-ai/cordis';
import Sessions,{Session,SessionId,SessionSeq,SessionLogOffset,SESSION_FORMAT_VERSION,buildForkSeed}from'@deepseek-ai/dsh-session';
import type{SessionEvent,SessionHeader}from'@deepseek-ai/dsh-session';
import*as Jsonl from'@deepseek-ai/dsh-session-persistence-jsonl';
import Attachments from'@deepseek-ai/dsh-attachment-local';
import Query from'@deepseek-ai/dsh-session-query-sqlite';
import Storage from'@deepseek-ai/dsh-storage';import*as Json from'@deepseek-ai/dsh-storage-json';import*as Domain from'@deepseek-ai/dsh-storage-domain';
import{workspaceDomainSpec,WorkspaceId}from'@deepseek-ai/dsh-workspace';
import type{WorkspaceDomainState}from'@deepseek-ai/dsh-workspace';
import{lstat,mkdtemp,realpath,rm,writeFile}from'node:fs/promises';import{dirname,isAbsolute,join,relative,basename}from'node:path';import{randomUUID}from'node:crypto';
import{BackupError}from'./backup-archive.ts';import type{BackupOptions}from'./backup-archive.ts';
import{prepareSessionBackup,restoreVerifiedSessionRecords}from'./backup-sessions.ts';import type{SessionBackupLease}from'./backup-sessions.ts';
import{prepareWorkspaceBackup,restoreVerifiedWorkspaceRecords}from'./backup-workspaces.ts';import type{WorkspaceBackupLease}from'./backup-workspaces.ts';
import{sealRecoveryCandidate,verifyRecoveryCandidate}from'./recovery-candidate.ts';
import type{SessionApplicationReceipt}from'./restore-sessions.ts';import type{WorkspaceApplicationReceipt}from'./restore-workspaces.ts';

const key=(path:string)=>process.platform==='win32'?path.toLowerCase():path;
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(root)&&isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
function fail(code='BACKUP_PROJECT_APPLICATION_INVALID'):never{throw new BackupError(code);}
async function ordinary(root:string,path:string,file=false):Promise<void>{
 if(!inside(root,path))fail('BACKUP_TEMP_BOUNDARY');
 for(let current=path;;current=dirname(current)){const stat=await lstat(current);if(stat.isSymbolicLink()||key(await realpath(current))!==key(current)||current===path&&(file?!stat.isFile():!stat.isDirectory()))fail('BACKUP_TEMP_BOUNDARY');if(key(current)===key(root))return;if(dirname(current)===current)fail('BACKUP_TEMP_BOUNDARY');}
}
async function directory(path:string):Promise<{path:string;identity:string}>{
 try{if(!isAbsolute(path)||path.length>4096)fail('BACKUP_PROJECT_DIRECTORY_CHANGED');const actual=await realpath(path);
  for(let current=actual;;current=dirname(current)){const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail('BACKUP_PROJECT_DIRECTORY_CHANGED');if(dirname(current)===current)break;}
  const stat=await lstat(actual,{bigint:true});return{path:actual,identity:stat.dev+':'+stat.ino};
 }catch{fail('BACKUP_PROJECT_DIRECTORY_CHANGED');}
}
async function removeChild(parent:string,path:string,prefix:string):Promise<void>{await ordinary(parent,path);const actual=await realpath(path),part=relative(parent,actual);if(!part||/[\\/]/.test(part)||!part.startsWith(prefix))fail('BACKUP_TEMP_BOUNDARY');await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
export interface ProjectContinuationEntry{sourceSessionId:string;sessionId:string;directory:string;originalDirectory:string|null;workspaceEntry:boolean;}
export interface ProjectApplicationReceipt{
 schema:'dsh-zhen-project-application-v1';root:string;sessionsRoot:string;attachmentsHome:string;storageRoot:string;
 sourceSessions:number;sessions:number;images:number;files:number;workspaces:number;
 entries:ProjectContinuationEntry[];reviewReasons:string[];
 originalSessionsPreserved:true;originalWorkspacesPreserved:true;registryEnabled:false;
 reviewRequired:true;permissionsRestored:false;activated:false;wholeApplicationRestore:false;
}

/** Prepare separate, inactive application copies. Original headers and graphs
 * remain intact; NEW SDK sessions inherit history and have the selected cwd.
 * No WorkspaceRegistry/Agent is constructed, so pending work cannot execute. */
export async function prepareRestoredProjects(root:string,home:string,sessions:SessionApplicationReceipt,workspaces:WorkspaceApplicationReceipt,options:BackupOptions={}):Promise<ProjectApplicationReceipt>{
 try{sessions=structuredClone(sessions);workspaces=structuredClone(workspaces);}catch{fail();}
 const signal=options.signal;signal?.throwIfAborted();await ordinary(root,home);
 if(sessions.schema!=='dsh-zhen-session-application-v1'||workspaces.schema!=='dsh-zhen-workspace-application-v1'||sessions.activated!==false||workspaces.activated!==false||!inside(home,sessions.root)||!inside(home,workspaces.root)||sessions.sessionsRoot!==join(sessions.root,'sessions')||sessions.attachmentsHome!==sessions.root||workspaces.storageRoot!==join(workspaces.root,'storage'))fail();
 if(!Array.isArray(sessions.directories)||!sessions.directories.length||!Number.isSafeInteger(sessions.sessions)||sessions.sessions<1||sessions.sessions+sessions.directories.length>10000)fail('BACKUP_PROJECT_CONTINUATION_LIMIT');
 for(const path of[sessions.root,workspaces.root])await ordinary(home,path);await ordinary(workspaces.storageRoot,join(workspaces.storageRoot,'workspace.json'),true);
 const scan={signal},sourceBaselines=await Promise.all([sealRecoveryCandidate(sessions.root,[],scan),sealRecoveryCandidate(workspaces.root,[],scan)]);if(sourceBaselines.some(row=>row.links))fail('BACKUP_TEMP_BOUNDARY');
 const targets=new Map<string,{path:string;identity:string;eventSeq:number}>(),uniqueTargets=new Map<string,{path:string;identity:string}>();for(const row of sessions.directories){signal?.throwIfAborted();if(targets.has(row.sessionId)||!Number.isSafeInteger(row.eventSeq)||row.eventSeq<0)fail();let target=uniqueTargets.get(key(row.directory));if(!target){target=await directory(row.directory);uniqueTargets.set(key(row.directory),target);}if(key(target.path)!==key(row.directory)||target.identity!==row.identity)fail('BACKUP_PROJECT_DIRECTORY_CHANGED');targets.set(row.sessionId,{...target,eventSeq:row.eventSeq});}
 const checkTarget=async(target:{path:string;identity:string})=>{signal?.throwIfAborted();const now=await directory(target.path);if(key(now.path)!==key(target.path)||now.identity!==target.identity)fail('BACKUP_PROJECT_DIRECTORY_CHANGED');};
 const checkTargets=async()=>{for(const target of uniqueTargets.values())await checkTarget(target);};
 const contexts:Context[]=[],sessionLeases:SessionBackupLease[]=[],workspaceLeases:WorkspaceBackupLease[]=[];
 const openSessions=async(path:string)=>{const ctx=new Context();contexts.push(ctx);await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(path,'sessions')});await ctx.plugin(Attachments,{dshHome:path});await ctx.plugin(Query,{path:':memory:',openAt:'never'});return ctx;};
 const openWorkspaces=async(path:string)=>{const ctx=new Context();contexts.push(ctx);await ctx.plugin(Storage);await ctx.plugin(Json,{root:path});await ctx.plugin(Domain,{backend:'json'});const domain=await ctx.storage.domain.open(workspaceDomainSpec);return{ctx,domain};};
 let candidate:string|undefined,complete=false;
 try{
  const sourceSessions=await openSessions(sessions.root),originalRows=await sourceSessions.sessionPersistence.list({signal}),originalHeaders=new Map(originalRows.map(row=>[String(row.header.id),row.header]));if(originalRows.length!==sessions.sessions||originalHeaders.size!==originalRows.length||targets.size!==sessions.directories.length||[...targets.keys()].some(id=>!originalHeaders.has(id)))fail();
  const originalLease=await prepareSessionBackup(()=>({sessions:sourceSessions.sessions,sessionPersistence:sourceSessions.sessionPersistence,sessionQuery:sourceSessions.sessionQuery,attachments:sourceSessions.attachments}),options);sessionLeases.push(originalLease);
  const originalWorkspace=await openWorkspaces(workspaces.storageRoot),workspaceLease=await prepareWorkspaceBackup(()=>({facility:originalWorkspace.ctx.storage.domain,domain:originalWorkspace.domain,revision:0}),options);workspaceLeases.push(workspaceLease);if(workspaceLease.document.workspaces.length!==workspaces.workspaces)fail();
  // Keep this independent component beside the restored environment, rather
  // than under its nested profile home. Windows mkdtemp rejects deeply nested
  // paths even when ordinary file operations accept their extended form.
  candidate=await realpath(await mkdtemp(join(root,'dsh-zhen-projects-restore-')));
  const stagedSessions=await restoreVerifiedSessionRecords(originalLease.records(),candidate,options);if(stagedSessions.sessions!==sessions.sessions||stagedSessions.images!==sessions.images||stagedSessions.files!==sessions.files)fail();const stage=await openSessions(stagedSessions.root),entries:ProjectContinuationEntry[]=[];
  for(const[sourceId,target]of targets){
   signal?.throwIfAborted();await checkTarget(target);const read=await stage.sessionPersistence.open(SessionId(sourceId),'read',{signal});let header:SessionHeader,events:SessionEvent[]=[];
   try{header=read.header;let bytes=0;for(let offset=0;;){const page=await read.read(offset,128,{signal});if(!page.events.length)break;for(const event of page.events){bytes+=Buffer.byteLength(JSON.stringify(event));if(bytes>32*1024**2||events.length>=1000000)fail('BACKUP_PROJECT_CONTINUATION_LIMIT');events.push(event);}offset+=page.events.length;}}finally{await read.close();}
   const last=events.at(-1);if(!last||Number(last.seq)!==target.eventSeq||last.type!=='working-directory/change'||!last.data||typeof last.data!=='object'||!('cwd'in last.data)||last.data.cwd!==target.path)fail();
   const id=SessionId('dsh-zhen-continuation-'+randomUUID()),seed=buildForkSeed(events,SessionSeq(events.length-1)),createdAt=Date.now();
   const childHeader:SessionHeader={version:SESSION_FORMAT_VERSION,id,createdAt,cwd:target.path,parentSession:header.id,isSeeded:true,...header.agentPreset!==undefined?{agentPreset:header.agentPreset}:{},...header.origin!==undefined?{origin:header.origin}:{},...header.delegationDepth!==undefined?{delegationDepth:header.delegationDepth}:{}};
   let child:Session;try{child=Session.create(id,seed,childHeader,SessionLogOffset(events.length));}catch{fail('BACKUP_PROJECT_HISTORY_UNSUPPORTED');}if(Number(child.seq)!==seed.length)fail('BACKUP_PROJECT_HISTORY_UNSUPPORTED');
   await checkTarget(target);const write=await stage.sessionPersistence.create(child.header,{signal,inheritedEventCount:child.inheritedEventCount});try{await write.append(seed,{signal});await write.flush({signal});}finally{await write.close();}
   entries.push({sourceSessionId:sourceId,sessionId:String(id),directory:target.path,originalDirectory:header.cwd??null,workspaceEntry:header.origin!=='subagent'});
  }
  const expandedLease=await prepareSessionBackup(()=>({sessions:stage.sessions,sessionPersistence:stage.sessionPersistence,sessionQuery:stage.sessionQuery,attachments:stage.attachments}),options);sessionLeases.push(expandedLease);const copiedSessions=await restoreVerifiedSessionRecords(expandedLease.records(),candidate,options);if(copiedSessions.sessions!==sessions.sessions+entries.length||copiedSessions.images!==sessions.images||copiedSessions.files!==sessions.files)fail();
  const stagedWorkspaces=await restoreVerifiedWorkspaceRecords(workspaceLease.records(),candidate,options),changed=await openWorkspaces(stagedWorkspaces.storageRoot),table=changed.domain.table('workspaces'),bySource=new Map(entries.map(row=>[row.sourceSessionId,row])),represented=new Set<string>(),reviewReasons=new Set(workspaces.reviewReasons),originalPaths=new Map<string,string>();
  for(const entry of entries)if(entry.originalDirectory!==null){const old=key(entry.originalDirectory),previous=originalPaths.get(old);if(previous&&key(previous)!==key(entry.directory))fail('BACKUP_PROJECT_WORKSPACE_CONFLICT');originalPaths.set(old,entry.directory);}
  const seen=new Set<string>();for(const[id,record]of table.entries()){
   signal?.throwIfAborted();for(const sourceId of record.sessionIds){if(seen.has(sourceId))fail('BACKUP_PROJECT_WORKSPACE_CONFLICT');seen.add(sourceId);}
   const selected=record.sessionIds.map(sourceId=>bySource.get(sourceId)).filter((row):row is ProjectContinuationEntry=>!!row),paths=new Set(selected.map(row=>key(row.directory))),pathTarget=originalPaths.get(key(record.path));if(pathTarget)paths.add(key(pathTarget));if(paths.size>1)fail('BACKUP_PROJECT_WORKSPACE_CONFLICT');
   if(paths.size){if(record.sessionIds.some(sourceId=>!bySource.has(sourceId)))fail('BACKUP_PROJECT_WORKSPACE_PARTIAL');const target=selected[0]?.directory??pathTarget!;await table.put(id,{...structuredClone(record),path:target,sessionIds:record.sessionIds.filter(sourceId=>bySource.get(sourceId)!.workspaceEntry).map(sourceId=>{const entry=bySource.get(sourceId)!;represented.add(entry.sessionId);return SessionId(entry.sessionId);})});}
   else reviewReasons.add('unmapped-workspace');
   if(record.sessionIds.some(sourceId=>!originalHeaders.has(sourceId)))reviewReasons.add('missing-session');
  }
  const global:WorkspaceDomainState=structuredClone(changed.domain.global.get()),extra=new Map<string,ProjectContinuationEntry[]>();for(const entry of entries)if(!represented.has(entry.sessionId)){if(!entry.workspaceEntry){reviewReasons.add('subagent-history-retained');continue;}const list=extra.get(key(entry.directory))??[];list.push(entry);extra.set(key(entry.directory),list);}
  const byDirectory=new Map<string,WorkspaceId>();for(const[id,record]of table.entries()){const path=key(record.path);if(byDirectory.has(path))fail('BACKUP_PROJECT_WORKSPACE_CONFLICT');byDirectory.set(path,WorkspaceId(id));}
  const added:WorkspaceId[]=[];for(const group of extra.values()){const path=group[0].directory,existing=byDirectory.get(key(path)),sessionIds=group.map(row=>SessionId(row.sessionId));if(existing){const record=table.get(existing);if(!record)fail();await table.put(existing,{...structuredClone(record),sessionIds:[...record.sessionIds,...sessionIds]});}else{const id=WorkspaceId('dsh-zhen-project-'+randomUUID()),time=new Date().toISOString();await table.put(id,{path,title:basename(path)||'恢复的项目',sessionIds,createdAt:time,updatedAt:time});added.push(id);byDirectory.set(key(path),id);}}
  const remap=(ids:readonly string[])=>ids.map(id=>SessionId(bySource.get(id)?.sessionId??id));await changed.domain.global.set({...global,workspaceIds:[...global.workspaceIds,...added],archivedSessionIds:remap(global.archivedSessionIds),pinnedSessionIds:remap(global.pinnedSessionIds),...added.length?{initialized:true,defaultWorkspaceId:global.defaultWorkspaceId??added[0]}:{}});
  const finalWorkspaceLease=await prepareWorkspaceBackup(()=>({facility:changed.ctx.storage.domain,domain:changed.domain,revision:0}),options);workspaceLeases.push(finalWorkspaceLease);const copiedWorkspaces=await restoreVerifiedWorkspaceRecords(finalWorkspaceLease.records(),candidate,options);
  const result:ProjectApplicationReceipt={schema:'dsh-zhen-project-application-v1',root:candidate,sessionsRoot:join(copiedSessions.root,'sessions'),attachmentsHome:copiedSessions.root,storageRoot:copiedWorkspaces.storageRoot,sourceSessions:sessions.sessions,sessions:copiedSessions.sessions,images:copiedSessions.images,files:copiedSessions.files,workspaces:copiedWorkspaces.workspaces,entries,reviewReasons:[...reviewReasons],originalSessionsPreserved:true,originalWorkspacesPreserved:true,registryEnabled:false,reviewRequired:true,permissionsRestored:false,activated:false,wholeApplicationRestore:false};
  await checkTargets();for(const lease of sessionLeases)await lease.assertCurrent();for(const lease of workspaceLeases)await lease.assertCurrent();for(const baseline of sourceBaselines)if((await verifyRecoveryCandidate(baseline,scan)).integrity!=='unchanged')fail('BACKUP_SOURCE_CHANGED');
  await writeFile(join(candidate,'dsh-zhen-project-application.json'),JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});
  // Handles close before removing internal construction copies.
  for(const lease of sessionLeases.toReversed())await lease.close();sessionLeases.length=0;for(const lease of workspaceLeases.toReversed())lease.close();workspaceLeases.length=0;for(const ctx of contexts.toReversed())await ctx.fiber.dispose();contexts.length=0;
  await removeChild(candidate,stagedSessions.root,'dsh-zhen-session-restore-');await removeChild(candidate,stagedWorkspaces.root,'dsh-zhen-workspaces-restore-');for(const baseline of sourceBaselines)if((await verifyRecoveryCandidate(baseline,scan)).integrity!=='unchanged')fail('BACKUP_SOURCE_CHANGED');await checkTargets();signal?.throwIfAborted();complete=true;return result;
 }catch(error){signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_PROJECT_APPLICATION_FAILED');}
 finally{try{for(const lease of sessionLeases.toReversed())await lease.close();for(const lease of workspaceLeases.toReversed())lease.close();for(const ctx of contexts.toReversed())await ctx.fiber.dispose();}catch(error){complete=false;throw error;}finally{if(candidate&&!complete)await removeChild(root,candidate,'dsh-zhen-projects-restore-');}}
}
