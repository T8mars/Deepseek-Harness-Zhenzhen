import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,rename,readdir,rm} from 'node:fs/promises';
import {existsSync,readdirSync as requireDirectory} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,relative,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {parseDocument} from 'yaml';
import {Context} from '@deepseek-ai/cordis';
import {PluginPackages,initProfile,resolveProfileDir,readProfileManifest,writeProfileManifest} from '@deepseek-ai/dsh-app-boot';
import Sessions,{SessionId,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Query from '@deepseek-ai/dsh-session-query-sqlite';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import Storage from '@deepseek-ai/dsh-storage';
import * as Json from '@deepseek-ai/dsh-storage-json';
import * as Domain from '@deepseek-ai/dsh-storage-domain';
import {workspaceDomainSpec,workspaceDomainState,workspaceRecord} from '@deepseek-ai/dsh-workspace';
import {
  prepareProfilePackageBackup,restoreProfilePackageBackup,prepareSessionBackup,restoreSessionBackup,
  prepareWorkspaceBackup,restoreWorkspaceBackup,prepareOwnedStateBackup,restoreOwnedStateBackup,
  summarizeEnvironment,summarizeSessions,summarizeWorkspaces,summarizeRecords,
  writeComposedBackup,restoreComposedBackup,prepareRestoredApplication,verifyRecoveryCandidate,
} from '../packages/dsh-zhen/lib/backup.js';
import {GatewayTasks} from '../packages/dsh-zhen/lib/gateway-tasks.js';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';

const password='EXAMPLE application restore password',anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json');
const cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'),bundle='@example/recovered-application';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const moduleNames={sessions:'@deepseek-ai/dsh-session-persistence-jsonl',attachments:'@deepseek-ai/dsh-attachment-local',storage:'@deepseek-ai/dsh-storage-json'};
async function put(file,bytes){await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
async function* chunks(bytes){yield bytes;}
async function fileDigests(root){const result=new Map();async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())await visit(file);else result.set(relative(root,file),sha(await readFile(file)));}}await visit(root);return result;}
function taskRows(file){const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT rowid,id,record FROM tasks ORDER BY rowid').all().map(row=>({...row,record:JSON.parse(row.record)}));}finally{db.close();}}
async function fixture(t,{patchChange,metadataChange,onlyEnvironment=false,directoryProbe=false}={}){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-application-EXAMPLE-')));
  const home=join(root,'EXAMPLE_source_home'),parent=join(root,'candidates'),sourcePackage=join(root,'EXAMPLE_source_package'),workspace=join(root,'EXAMPLE_source_workspace');
  await Promise.all([mkdir(home),mkdir(parent),mkdir(workspace)]);
  const ctx=new Context();let closed=false,requests=0;
  const forbidden=()=>{requests++;throw Error('EXAMPLE_NO_NETWORK_OR_CREDENTIALS');};
  const dispose=async()=>{if(!closed){closed=true;await ctx.fiber.dispose();}};
  t.after(async()=>{try{await dispose();}finally{const actual=await realpath(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-application-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
  await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(home,'sessions')});await ctx.plugin(Attachments,{dshHome:home});await ctx.plugin(Query,{path:':memory:',openAt:'never'});
  await ctx.plugin(Storage);await ctx.plugin(Json,{root:join(home,'storages')});await ctx.plugin(Domain,{backend:'json'});
  const domain=await ctx.storage.domain.open(workspaceDomainSpec);
  const record=workspaceRecord.parse({path:workspace,title:'EXAMPLE recovered creative workspace',sessionIds:['EXAMPLE_APP'],createdAt:'2000-01-01T00:00:00.000Z',updatedAt:'2000-01-02T00:00:00.000Z'});
  await domain.table('workspaces').put('EXAMPLE_WORKSPACE',record);
  const global=workspaceDomainState.parse({initialized:true,workspaceIds:['EXAMPLE_WORKSPACE'],defaultWorkspaceId:'EXAMPLE_WORKSPACE',archivedSessionIds:['EXAMPLE_ARCHIVED'],pinnedSessionIds:['EXAMPLE_PINNED'],pendingMutation:{operation:'delete',workspaceId:'EXAMPLE_WORKSPACE'}});
  await domain.global.set(global);
  const bytes=Buffer.from('EXAMPLE 创作参考资料 attachment bytes'),file=await ctx.attachments.saveFileStream({data:chunks(bytes),name:'EXAMPLE资料.txt'});
  const header={version:SESSION_FORMAT_VERSION,id:SessionId('EXAMPLE_APP'),createdAt:1700000000000,cwd:workspace,isSeeded:false};
  const events=[{type:'user/message',seq:0,time:1700000000001,surfaceOp:'append',data:createUserMessage({content:[{type:'text',text:'EXAMPLE restore creative reference'},{type:'file',attachment:file}],source:{kind:'user'}})}];
  const handle=await ctx.sessionPersistence.create(header);await handle.append(events);await handle.flush();await handle.close();
  const canonicalHeader=(await ctx.sessionPersistence.list())[0].header;
  const dataRoot=join(home,'dsh-zhen');await mkdir(dataRoot);const tasksFile=join(dataRoot,'gateway-tasks.sqlite'),tasks=new GatewayTasks(tasksFile,forbidden,forbidden);const task=tasks.add({protocol:'image',taskId:'EXAMPLE_TASK'});tasks.tracking(task.id,true);await tasks.close();
  const profileDir=resolveProfileDir('EXAMPLE_profile',home);initProfile(profileDir,[]);const manifest=readProfileManifest('EXAMPLE',profileDir);manifest.dependencies={[bundle]:'1.0.0'};manifest.dsh.profile.bundles=[bundle];writeProfileManifest(profileDir,manifest);
  const patch=[{insert:[
    {id:'EXAMPLE_sessions',name:'@deepseek-ai/dsh-session'},
    {id:'EXAMPLE_renamed_jsonl',name:moduleNames.sessions,config:{root:join(home,'sessions'),compression:'none',listConcurrency:2}},
    {id:'EXAMPLE_renamed_attachment',name:moduleNames.attachments,config:{dshHome:home,maxImagesPerMessage:7}},
    {id:'EXAMPLE_query',name:'@deepseek-ai/dsh-session-query-sqlite',config:{path:':memory:',openAt:'never'}},
    {id:'EXAMPLE_storage',name:'@deepseek-ai/dsh-storage'},
    {id:'EXAMPLE_renamed_storage',name:moduleNames.storage,config:{root:join(home,'storages')}},
    {id:'EXAMPLE_domain',name:'@deepseek-ai/dsh-storage-domain',config:{backend:'json'}},
    {id:'EXAMPLE_schedule',name:'@deepseek-ai/dsh-schedule'},
    {id:'EXAMPLE_workspace',name:'@deepseek-ai/dsh-workspace'},
    {id:'EXAMPLE_report',name:'@deepseek-ai/dsh-session-log-deepseek'},
    {id:'EXAMPLE_official_brand',name:'@deepseek-ai/dsh-client-ui-brand-official'},
    {id:'EXAMPLE_probe',name:bundle,config:{EXAMPLE:'preserved'}},
  ]}];
  patchChange?.(patch,root);
  const bundleManifest={name:bundle,version:'1.0.0',type:'module',exports:{'.':'./EXAMPLE-probe.mjs'},engines:{dsh:'0.2.1-rc.2'},dsh:{bundle:{patch:'./EXAMPLE.patch.json'}},scripts:{postinstall:'node EXAMPLE-must-not-run.cjs'}};
  metadataChange?.(bundleManifest,root);await put(join(sourcePackage,'package.json'),JSON.stringify(bundleManifest));
  await put(join(sourcePackage,'EXAMPLE.patch.json'),JSON.stringify(patch));
  await put(join(sourcePackage,'EXAMPLE-must-not-run.cjs'),"throw Error('EXAMPLE_INSTALL_SCRIPT_MUST_NOT_RUN');");
  // The test probe deliberately uses the current published SDK schema. Core
  // providers still resolve through the real CLI, with no private format copy.
  const workspaceSchemaUrl=pathToFileURL(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-workspace')).href;
  await put(join(sourcePackage,'EXAMPLE-probe.mjs'),`import{writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{join}from'node:path';import{DatabaseSync}from'node:sqlite';import{workspaceDomainSpec}from${JSON.stringify(workspaceSchemaUrl)};
export const inject=['sessionPersistence','attachments','storage'];
export function apply(ctx,config){ctx.effect(async()=>{const headers=await ctx.sessionPersistence.list();const handle=await ctx.sessionPersistence.open('EXAMPLE_APP','read');let log;try{log=await handle.read();}finally{await handle.close();}const file=log.events[0].data.content.find(x=>x.type==='file').attachment;const hash=createHash('sha256');for await(const part of ctx.attachments.readFileStream(file))hash.update(part);const domain=await ctx.storage.domain.open(workspaceDomainSpec);const db=new DatabaseSync(join(process.env.DSH_HOME,'dsh-zhen','gateway-tasks.sqlite'),{readOnly:true});let tasks;try{tasks=db.prepare('SELECT rowid,id,record FROM tasks ORDER BY rowid').all().map(row=>({...row,record:JSON.parse(row.record)}));}finally{db.close();}await writeFile(process.env.EXAMPLE_RECEIPT,JSON.stringify({config,headers:headers.map(x=>x.header),events:log.events,attachmentSha:hash.digest('hex'),global:domain.global.get(),workspaces:[...domain.table('workspaces').entries()],tasks,scheduleAbsent:!ctx.get('schedule'),workspaceRegistryAbsent:!ctx.get('workspaceRegistry'),home:process.env.DSH_HOME,cwd:process.cwd(),module:import.meta.url}));const timer=setTimeout(()=>void ctx.loader.ctx.fiber.dispose(),25);return()=>clearTimeout(timer);});}`);
  if(directoryProbe)await put(join(sourcePackage,'EXAMPLE-probe.mjs'),`import{writeFile,readFile}from'node:fs/promises';import{join}from'node:path';import{createHash}from'node:crypto';
export const inject=['sessions','sessionPersistence','attachments','workingDirectory'];
export function apply(ctx,config){ctx.effect(async()=>{const handle=await ctx.sessionPersistence.open('EXAMPLE_APP','read');let saved;try{saved={...await handle.read(),header:handle.header,cut:handle.inheritedEventCount};}finally{await handle.close();}const session=ctx.sessions.prepare(saved.header.id,{seed:[...saved.events],meta:saved.header,inheritedEventCount:saved.cut,eventState:saved.eventState}),directory=ctx.workingDirectory.get(session),file=saved.events[0].data.content.find(row=>row.type==='file').attachment,hash=createHash('sha256');for await(const part of ctx.attachments.readFileStream(file))hash.update(part);await writeFile(process.env.EXAMPLE_RECEIPT,JSON.stringify({header:saved.header,events:saved.events,directory,projectFile:await readFile(join(directory,'EXAMPLE_KEEP.txt'),'utf8'),attachmentSha:hash.digest('hex')}));const timer=setTimeout(()=>void ctx.loader.ctx.fiber.dispose(),25);return()=>clearTimeout(timer);});}`);
  const lookup=new PluginPackages(ctx),profileSource={home,installAnchor:anchor,active:{name:'EXAMPLE_profile',dir:profileDir,cwd:workspace,startedBundles:[bundle],overlays:[]}};
  const packageSource={lookup,seeds:[{key:'EXAMPLE',name:bundle,parentURL:pathToFileURL(join(profileDir,'package.json')).href,scope:'declared',directory:sourcePackage}],protectedContainers:[root],forbiddenTrees:[]};
  const adapters={
    environment:{prepare:(pwd,opts)=>prepareProfilePackageBackup(pwd,{profiles:()=>profileSource,packages:()=>packageSource},opts),restore:async(file,pwd,target,opts)=>summarizeEnvironment(await restoreProfilePackageBackup(file,pwd,target,{...opts,installAnchor:anchor}))},
    sessions:{prepare:(_pwd,opts)=>prepareSessionBackup(()=>({sessions:ctx.sessions,sessionPersistence:ctx.sessionPersistence,sessionQuery:ctx.sessionQuery,attachments:ctx.attachments}),opts),restore:async(file,pwd,target,opts)=>summarizeSessions(await restoreSessionBackup(file,pwd,target,opts))},
    workspaces:{prepare:(_pwd,opts)=>prepareWorkspaceBackup(()=>({facility:ctx.storage.domain,domain,revision:0}),opts),restore:async(file,pwd,target,opts)=>summarizeWorkspaces(await restoreWorkspaceBackup(file,pwd,target,opts))},
    records:{prepare:(_pwd,opts)=>prepareOwnedStateBackup(()=>({root:dataRoot,mediaRoots:[],forbiddenTrees:[]}),opts),restore:async(file,pwd,target,opts)=>summarizeRecords(await restoreOwnedStateBackup(file,pwd,target,opts))},
  };
  const archive=join(root,'EXAMPLE.encrypted'),selected=onlyEnvironment?['environment']:['environment','sessions','workspaces','records'];
  await writeComposedBackup(archive,password,selected,adapters);
  return {root,home,parent,sourcePackage,workspace,ctx,dispose,adapters,archive,bytes,header:canonicalHeader,events,record,global,task,tasksFile,requests:()=>requests};
}
async function restored(f,settings={}){const candidate=await restoreComposedBackup(f.archive,password,f.parent,f.adapters,{application:{installAnchor:anchor},...settings});const recipe=JSON.parse(await readFile(join(candidate.root,'dsh-zhen-application-restore.json'),'utf8'));return {candidate,recipe,profile:recipe.profiles[0]};}
async function runCli(profile,root,extra=[]){let output='',failed=false;const receipt=join(root,'EXAMPLE_boot_receipt.json'),child=spawn(process.execPath,[cli,...profile.launch.args,...extra],{cwd:profile.launch.cwd,env:mcpChildEnvironment({...profile.launch.env,EXAMPLE_RECEIPT:receipt}),windowsHide:true,stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(30000)});for(const stream of[child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',value=>output=(output+value).slice(-128*1024));}const code=await new Promise(done=>{child.once('error',()=>failed=true);child.once('close',done);});assert.equal(failed,false,'EXAMPLE CLI spawn failed');assert.equal(code,0,'EXAMPLE CLI failed '+output.slice(-1800));return {output,receipt};}

test('C151: actual public CLI uses independent continuation roots and whole configuration with original session and pending history retained',async t=>{
 const f=await fixture(t),directory=join(f.root,'EXAMPLE_NEW_PROJECT');await mkdir(directory);await writeFile(join(directory,'EXAMPLE_KEEP'),'EXAMPLE retained project');
 const {candidate,recipe,profile}=await restored(f,{application:{installAnchor:anchor,sessionDirectories:[{sessionId:'EXAMPLE_APP',directory}],projectContinuations:true}});
 assert.ok(recipe.projects);assert.equal(recipe.projects.sessions,2);assert.equal(recipe.sessions.sessions,1);assert.equal(recipe.workspaces.pathsRebound,false);assert.notEqual(recipe.projects.sessionsRoot,recipe.sessions.sessionsRoot);assert.notEqual(recipe.projects.storageRoot,recipe.workspaces.storageRoot);
 for(const[role,target]of Object.entries({sessions:recipe.projects.sessionsRoot,attachmentsHome:recipe.projects.attachmentsHome,workspaceStorage:recipe.projects.storageRoot}))assert.equal(profile.bindings.find(row=>row.role===role).target,target);
 assert.equal((await verifyRecoveryCandidate(candidate.verification)).integrity,'unchanged');assert.equal(recipe.readyForActivation,false);assert.equal(recipe.activated,false);
 await f.dispose();for(const path of[f.home,f.sourcePackage]){const actual=await realpath(path),part=relative(f.root,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part));await rename(actual,path+'.EXAMPLE_OFFLINE');}
 const dumpRun=await runCli(profile,f.root,['--dump-config']),rows=parseDocument(dumpRun.output).toJS(),jsonl=rows.find(row=>row.id==='EXAMPLE_renamed_jsonl');assert.equal(jsonl.config.root,recipe.projects.sessionsRoot);assert.equal(jsonl.config.listConcurrency,2);assert.equal(rows.find(row=>row.id==='EXAMPLE_renamed_attachment').config.maxImagesPerMessage,7);
 const boot=await runCli(profile,f.root),actual=JSON.parse(await readFile(boot.receipt,'utf8')),continued=actual.headers.find(row=>row.id===recipe.projects.entries[0].sessionId);assert.equal(continued.cwd,directory);assert.equal(continued.parentSession,'EXAMPLE_APP');assert.deepEqual(actual.headers.find(row=>row.id==='EXAMPLE_APP'),f.header);assert.deepEqual(actual.events.slice(0,-1),f.events);assert.equal(actual.attachmentSha,sha(f.bytes));assert.equal(actual.workspaces[0][0],'EXAMPLE_WORKSPACE');assert.equal(actual.workspaces[0][1].path,directory);assert.deepEqual(actual.workspaces[0][1].sessionIds,[continued.id]);assert.deepEqual(actual.global.pendingMutation,f.global.pendingMutation);assert.equal(actual.scheduleAbsent,true);assert.equal(actual.workspaceRegistryAbsent,true);assert.equal(await readFile(join(directory,'EXAMPLE_KEEP'),'utf8'),'EXAMPLE retained project');assert.equal(f.requests(),0);
 console.log(JSON.stringify({contract:'C151',actualPublishedCliBoot:true,continuationProfileRootsUsed:true,wholeProviderConfigurationPreserved:true,originalSessionHeaderAndEventsPreserved:true,newSessionParentAndDirectoryRetained:true,attachmentHashMatches:true,originalHomesUnavailable:true,pendingNotExecuted:true,originalProjectStillExists:true,activated:false,wholeApplicationRestore:false,nativeRequests:0,modelRequests:0}));
});
test('C151: continuation mode without selected session and workspace components refuses before application copies',async t=>{
 const f=await fixture(t,{onlyEnvironment:true}),before=(await readdir(f.parent)).sort();await assert.rejects(restored(f,{application:{installAnchor:anchor,sessionDirectories:[{sessionId:'EXAMPLE_APP',directory:f.workspace}],projectContinuations:true}}),{code:'BACKUP_PROJECT_COMPONENTS_REQUIRED'});assert.deepEqual((await readdir(f.parent)).sort(),before);
});
test('C151: omitted continuation mode preserves the prior application recipe shape',async t=>{const f=await fixture(t),{recipe}=await restored(f);assert.equal(Object.hasOwn(recipe,'projects'),false);assert.equal(recipe.sessions.sessions,1);assert.equal(recipe.workspaces.pathsRebound,false);});

test('C194: actual application overlays reset aliased permission owners without trusting a preset name or dropping unrelated configuration',async t=>{
 const f=await fixture(t,{patchChange:patch=>patch[0].insert.push(
  {id:'EXAMPLE_PERMISSION_ALIAS',name:'@deepseek-ai/dsh-permission-presets',config:{presets:{'read-only':{sandbox:'danger-full-access',approval:'never'},EXAMPLE_CUSTOM:{sandbox:'workspace-write',approval:'ask'}},defaultPreset:'EXAMPLE_CUSTOM'}},
  {id:'EXAMPLE_SANDBOX_ALIAS',name:'@deepseek-ai/dsh-sandbox-policy',config:{mode:'danger-full-access',workspaceRoot:'EXAMPLE_RETAINED_ROOT'}},
  {id:'EXAMPLE_APPROVAL_ALIAS',name:'@deepseek-ai/dsh-user-approval',config:{policy:'never'}},
 )}),before=sha(await readFile(f.archive)),{profile}=await restored(f);assert.ok(profile.launch,JSON.stringify(profile.reasons));const patches=parseDocument(await readFile(profile.overlay,'utf8')).toJS(),byId=new Map(patches.map(row=>[row.id,row]));
 const permissions=byId.get('EXAMPLE_PERMISSION_ALIAS').config;assert.equal(permissions.defaultPreset,'read-only');assert.equal(permissions.presets['read-only'].sandbox,'read-only');assert.equal(permissions.presets['read-only'].approval,'ask');assert.deepEqual(permissions.presets.EXAMPLE_CUSTOM,{sandbox:'workspace-write',approval:'ask'});
 assert.deepEqual(byId.get('EXAMPLE_SANDBOX_ALIAS').config,{mode:'read-only',workspaceRoot:'EXAMPLE_RETAINED_ROOT'});assert.deepEqual(byId.get('EXAMPLE_APPROVAL_ALIAS').config,{policy:'ask'});assert.equal(sha(await readFile(f.archive)),before);assert.ok(profile.reasons.includes('PERMISSIONS_REVIEW_REQUIRED'));
 console.log(JSON.stringify({contract:'C194',actualApplicationWholeRowOverrides:true,moduleIdentityNotRowName:true,allThreePermissionDefaultsReset:true,misleadingReadOnlyNameNotTrusted:true,unrelatedConfigurationPreserved:true,originalBackupUnchanged:true,reviewStillRequired:true,nativeRequests:0,modelRequests:0}));
});

test('C194: opaque permission configuration cannot produce an executable application recipe',async t=>{
 for(const module of ['@deepseek-ai/dsh-permission-presets','@deepseek-ai/dsh-sandbox-policy','@deepseek-ai/dsh-user-approval']){
  const f=await fixture(t,{patchChange:patch=>patch[0].insert.push({id:'EXAMPLE_OPAQUE_PERMISSION',name:module,config:{__jsExpr:'EXAMPLE_DO_NOT_EVALUATE'}})}),{profile}=await restored(f);assert.equal(profile.launch,null);assert.ok(profile.reasons.includes('BACKUP_APPLICATION_CONFIG_REVIEW'));
 }
});

test('C124: real restored public CLI reads sessions, attachment bytes, workspace inventory and paused own tasks after source removal',async t=>{
  const f=await fixture(t),originalTaskRows=taskRows(f.tasksFile),{candidate,recipe,profile}=await restored(f);
  assert.equal(recipe.readyForActivation,false);assert.equal(recipe.activated,false);assert.equal(profile.bindings.length,3);assert.ok(profile.launch,JSON.stringify(profile.reasons));assert.equal(recipe.records.find(row=>row.kind==='tasks').paused,1);
  assert.equal((await verifyRecoveryCandidate(candidate.verification)).integrity,'unchanged');
  const layout=JSON.parse(await readFile(join(candidate.root,'dsh-zhen-recovery-layout.json'),'utf8'));
  const retainedRecords=layout.components.find(row=>row.kind==='records').locations.find(row=>row.role==='ownData').path;
  const retainedWorkspaces=layout.components.find(row=>row.kind==='workspaces').root,workspaceBaseline=await fileDigests(retainedWorkspaces);
  assert.ok(recipe.workspaces);assert.equal(profile.bindings.find(row=>row.role==='workspaceStorage').target,recipe.workspaces.storageRoot);assert.notEqual(recipe.workspaces.storageRoot,join(retainedWorkspaces,'storage'));assert.equal(recipe.workspaces.registryEnabled,false);
  assert.deepEqual(taskRows(join(retainedRecords,'gateway-tasks.sqlite')),originalTaskRows);assert.deepEqual(taskRows(f.tasksFile),originalTaskRows);
  await f.dispose();
  for(const path of[f.home,f.sourcePackage,f.workspace]){const actual=await realpath(path),part=relative(f.root,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('EXAMPLE_'));await rename(actual,path+'.EXAMPLE_OFFLINE');}
  assert.deepEqual(await fileDigests(retainedWorkspaces),workspaceBaseline);const workspacePart=relative(f.root,await realpath(retainedWorkspaces));assert.ok(workspacePart&&!isAbsolute(workspacePart)&&!workspacePart.startsWith('..'));await rename(retainedWorkspaces,retainedWorkspaces+'.EXAMPLE_OFFLINE');
  const dumpRun=await runCli(profile,f.root,['--dump-config']),dump=parseDocument(dumpRun.output);assert.equal(dump.errors.length,0);assert.equal(existsSync(dumpRun.receipt),false);
  const entries=dump.toJS();assert.ok(Array.isArray(entries),'EXAMPLE dump '+dumpRun.output.slice(-2000));
  const flat=rows=>rows.flatMap(row=>[row,...row.group&&Array.isArray(row.config)?flat(row.config):[]]);const rows=flat(entries);
  const jsonl=rows.find(row=>row.name===moduleNames.sessions),attachments=rows.find(row=>row.name===moduleNames.attachments);
  assert.equal(jsonl.config.listConcurrency,2);assert.equal(jsonl.config.compression,Jsonl.Config({root:'EXAMPLE'}).compression);assert.equal(attachments.config.maxImagesPerMessage,7);
  for(const id of['EXAMPLE_schedule','EXAMPLE_workspace','EXAMPLE_report','EXAMPLE_official_brand'])assert.equal(rows.find(row=>row.id===id).disabled,true);
  const boot=await runCli(profile,f.root);assert.equal(existsSync(boot.receipt),true,'EXAMPLE missing receipt '+boot.output.slice(-6000));const actual=JSON.parse(await readFile(boot.receipt,'utf8'));
  assert.deepEqual(actual.headers,[f.header]);assert.deepEqual(actual.events,f.events);assert.equal(actual.attachmentSha,sha(f.bytes));assert.deepEqual(actual.workspaces,[['EXAMPLE_WORKSPACE',f.record]]);assert.deepEqual(actual.global,f.global);assert.equal(actual.scheduleAbsent,true);assert.equal(actual.workspaceRegistryAbsent,true);
  assert.deepEqual(actual.tasks,originalTaskRows.map(row=>({...row,record:{...row.record,tracking:false,querying:false}})));assert.equal(actual.home,recipe.home);assert.equal(actual.cwd,profile.launch.cwd);assert.equal(actual.config.EXAMPLE,'preserved');assert.ok(actual.module.includes('EXAMPLE-probe.mjs'));
  for(const path of[f.home,f.sourcePackage,f.workspace])assert.equal(existsSync(path),false);assert.equal(f.requests(),0);
  assert.equal(existsSync(retainedWorkspaces),false);assert.deepEqual(await fileDigests(retainedWorkspaces+'.EXAMPLE_OFFLINE'),workspaceBaseline);
  // The generated application recipe is part of the sealed candidate too.
  await writeFile(join(candidate.root,'dsh-zhen-application-restore.json'),'EXAMPLE_CHANGED_RECIPE');
  assert.equal((await verifyRecoveryCandidate(candidate.verification)).integrity,'changed');
  console.log(JSON.stringify({contract:'C124',actualPublishedCliBoot:true,sourceDirectoriesUnavailable:true,actualSessionEventsAndAttachmentHash:true,actualPublicWorkspaceInventory:true,pendingMutationPreservedButNotResumed:true,ownTaskRowsAndIdsPreserved:true,oldTrackingPaused:true,wholeConfigFieldsPreserved:true,officialBrandAndReportingPaused:true,activated:false,wholeApplicationRestore:false,modelRequests:0,nativeWrites:0}));
});

test('C124: unselected data scopes use fresh candidate directories and require review',async t=>{const f=await fixture(t,{onlyEnvironment:true}),{recipe,profile}=await restored(f);assert.ok(profile.launch,JSON.stringify(profile.reasons));for(const item of profile.bindings){const part=relative(recipe.home,item.target);assert.ok(!isAbsolute(part)&&!part.startsWith('..'));}assert.ok(profile.reasons.includes('SESSIONS_NOT_SELECTED'));assert.ok(profile.reasons.includes('WORKSPACES_NOT_SELECTED'));assert.deepEqual(recipe.records,[]);assert.equal(f.requests(),0);});
test('C124: whole-config expressions are retained for review without evaluation or an executable recipe',async t=>{const f=await fixture(t,{patchChange:(patch,root)=>{patch[0].insert.find(row=>row.name===moduleNames.sessions).config={__jsExpr:"require('node:fs').writeFileSync("+JSON.stringify(join(root,'EXAMPLE_EXPRESSION_RAN'))+",'EXAMPLE')"};}}),{profile}=await restored(f);assert.equal(profile.launch,null);assert.ok(profile.reasons.includes('BACKUP_APPLICATION_CONFIG_REVIEW'));assert.equal(existsSync(join(f.root,'EXAMPLE_EXPRESSION_RAN')),false);});
test('C124: duplicate IDs cannot redirect root overrides to a different module',async t=>{const f=await fixture(t,{patchChange:patch=>patch[0].insert.push({id:'EXAMPLE_renamed_jsonl',name:'@example/different'})}),{profile}=await restored(f);assert.equal(profile.launch,null);assert.ok(profile.reasons.includes('BACKUP_APPLICATION_DUPLICATE_ID'));assert.deepEqual(profile.bindings,[]);});
test('C124: disabled source providers stay disabled and are explicitly reported',async t=>{const f=await fixture(t,{patchChange:patch=>{patch[0].insert.find(row=>row.name===moduleNames.sessions).disabled=true;}}),{profile}=await restored(f);assert.ok(profile.reasons.includes('PROVIDER_DISABLED_SESSIONS'));assert.ok(profile.launch);});
test('C124: low-level restoration remains inert when application preparation is not requested',async t=>{const f=await fixture(t),candidate=await restoreComposedBackup(f.archive,password,f.parent,f.adapters);assert.equal(existsSync(join(candidate.root,'dsh-zhen-application-restore.json')),false);assert.equal((await verifyRecoveryCandidate(candidate.verification)).integrity,'unchanged');});
test('C124: no environment means no application and no output creation',async t=>{const f=await fixture(t);assert.equal(await prepareRestoredApplication(f.parent,[{kind:'sessions',root:f.parent,details:false,locations:[],profiles:[],externalPackages:0}],{installAnchor:anchor}),null);assert.deepEqual(await readdir(f.parent),[]);});
test('C124: an incompatible trusted SDK rejects composition and cleans only its new candidate',async t=>{const f=await fixture(t),other=join(f.root,'EXAMPLE_sdk.json');await writeFile(other,JSON.stringify({name:'@deepseek-ai/dsh',version:'999.0.0'}));await assert.rejects(restored(f,{application:{installAnchor:other}}),{code:'BACKUP_PROFILE_SDK_MISMATCH'});assert.deepEqual(await readdir(f.parent),[]);assert.deepEqual(taskRows(f.tasksFile).map(row=>row.record.tracking),[true]);});
test('C124: nested literal groups retain identity matching and inherited disabled state',async t=>{const f=await fixture(t,{patchChange:patch=>{const rows=patch[0].insert;patch[0].insert=[{id:'EXAMPLE_group',name:'@deepseek-ai/cordis-plugin-group',group:true,disabled:true,config:rows}];}}),{profile}=await restored(f);assert.equal(profile.bindings.length,3);for(const role of['SESSIONS','ATTACHMENTSHOME','WORKSPACESTORAGE'])assert.ok(profile.reasons.includes('PROVIDER_DISABLED_'+role));});
test('C124: a bundle patch outside its package cannot become a root configuration',async t=>{const f=await fixture(t,{metadataChange:manifest=>{manifest.dsh.bundle.patch='../EXAMPLE-outside.yml';}}),{profile}=await restored(f);assert.equal(profile.launch,null);assert.ok(profile.reasons.includes('BACKUP_TEMP_BOUNDARY'));assert.equal(profile.overlay,null);assert.equal(f.requests(),0);});
test('C124: cancellation after application staging removes the new composition and preserves prior candidates and source tracking',async t=>{const f=await fixture(t),prior=join(f.parent,'EXAMPLE_prior');await mkdir(prior);await writeFile(join(prior,'EXAMPLE.txt'),'EXAMPLE');const controller=new AbortController();Object.defineProperty(controller.signal,'throwIfAborted',{value(){for(const item of requireDirectory(f.parent))if(item.startsWith('dsh-zhen-recovery-')&&existsSync(join(f.parent,item,'dsh-zhen-application-restore.json')))controller.abort(Error('EXAMPLE_APPLICATION_CANCEL'));AbortSignal.prototype.throwIfAborted.call(this);}});await assert.rejects(restored(f,{signal:controller.signal}),/EXAMPLE_APPLICATION_CANCEL/);assert.deepEqual(await readdir(f.parent),['EXAMPLE_prior']);assert.equal(await readFile(join(prior,'EXAMPLE.txt'),'utf8'),'EXAMPLE');assert.deepEqual(taskRows(f.tasksFile).map(row=>row.record.tracking),[true]);});

test('C135: actual restored public CLI uses an explicitly selected project through the released WorkingDirectory projection',async t=>{
  const f=await fixture(t,{directoryProbe:true,patchChange:(patch,root)=>patch[0].insert.push(
    {id:'EXAMPLE_projection',name:'@deepseek-ai/dsh-session-projection'},
    {id:'EXAMPLE_fs',name:'@deepseek-ai/dsh-fs-local'},
    {id:'EXAMPLE_prompt',name:'@deepseek-ai/dsh-system-prompt'},
    {id:'EXAMPLE_directory',name:'@deepseek-ai/dsh-working-directory',config:{defaultDirectory:join(root,'EXAMPLE_source_workspace'),EXAMPLE:'whole config retained'}}
  )}),directory=join(f.root,'EXAMPLE_NEW_PROJECT');await mkdir(directory);await writeFile(join(directory,'EXAMPLE_KEEP.txt'),'EXAMPLE selected project file');
  const {candidate,recipe,profile}=await restored(f,{application:{installAnchor:anchor,sessionDirectories:[{sessionId:'EXAMPLE_APP',directory}]}});
  assert.ok(profile.launch,JSON.stringify(profile.reasons));assert.equal(recipe.sessions.unmappedSessions,0);assert.equal(recipe.sessions.directories[0].directory,directory);assert.equal(recipe.sessions.permissionsRestored,false);assert.equal(profile.reasons.includes('SESSION_DIRECTORIES_REVIEW_REQUIRED'),false);assert.ok(profile.reasons.includes('PERMISSIONS_REVIEW_REQUIRED'));assert.ok(profile.reasons.includes('PROJECT_FILES_NOT_INCLUDED'));
  const layout=JSON.parse(await readFile(join(candidate.root,'dsh-zhen-recovery-layout.json'),'utf8')),component=layout.components.find(row=>row.kind==='sessions');assert.notEqual(recipe.sessions.root,component.root);assert.equal(profile.bindings.find(row=>row.role==='sessions').target,recipe.sessions.sessionsRoot);
  await f.dispose();for(const path of[f.home,f.sourcePackage,f.workspace]){const actual=await realpath(path),part=relative(f.root,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part));await rename(actual,path+'.EXAMPLE_OFFLINE');}
  const dump=await runCli(profile,f.root,['--dump-config']),rows=parseDocument(dump.output).toJS(),row=rows.find(item=>item.id==='EXAMPLE_directory');assert.equal(row.config.defaultDirectory,profile.launch.cwd);assert.equal(row.config.EXAMPLE,'whole config retained');
  const originalOverlay=join(resolveProfileDir(profile.name,recipe.home),'cordis.yml'),overlayBefore=parseDocument(await readFile(originalOverlay,'utf8')).toJS(),before=await fileDigests(candidate.root),boot=await runCli(profile,f.root);assert.equal(existsSync(boot.receipt),true,'EXAMPLE missing directory receipt '+boot.output.slice(-2000));const actual=JSON.parse(await readFile(boot.receipt,'utf8'));assert.deepEqual(actual.header,f.header);assert.deepEqual(actual.events.slice(0,-1),f.events);assert.equal(actual.events.at(-1).type,'working-directory/change');assert.equal(actual.events.at(-1).seq,f.events.length);assert.deepEqual(actual.events.at(-1).data,{cwd:directory});assert.equal(actual.directory,directory);assert.equal(actual.projectFile,'EXAMPLE selected project file');assert.equal(actual.attachmentSha,sha(f.bytes));const after=await fileDigests(candidate.root),changed=[...new Set([...before.keys(),...after.keys()])].filter(key=>before.get(key)!==after.get(key));assert.deepEqual(changed,[relative(candidate.root,originalOverlay)]);assert.deepEqual(overlayBefore,[]);assert.deepEqual(parseDocument(await readFile(originalOverlay,'utf8')).toJS(),rows.map(row=>row.id==='EXAMPLE_probe'?{...row,disabled:true}:row));assert.equal((await verifyRecoveryCandidate(candidate.verification)).integrity,'changed');assert.equal(f.requests(),0);
  console.log(JSON.stringify({contract:'C135',actualPublishedCliBoot:true,actualWorkingDirectoryProjection:true,explicitProjectFileRead:true,originalSessionHeaderAndHistoryPreserved:true,sourceDirectoriesUnavailable:true,componentRemainsSeparate:true,wholeDirectoryConfigPreserved:true,onlyNormalDirectoryEventAppended:true,retainedComponentFilesUnchanged:true,onlyControlledProfileConfigChanged:true,controlledProbeDisposalSavesEffectiveConfig:true,usedCandidateIntegrityInvalidated:true,permissionsRestored:false,activated:false,wholeApplicationRestore:false,nativeRequests:0,modelRequests:0}));
});
