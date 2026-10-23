import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import Sessions,{SessionId,SessionSeq,buildForkSeed,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Query from '@deepseek-ai/dsh-session-query-sqlite';import Attachments from '@deepseek-ai/dsh-attachment-local';
import Projections from '@deepseek-ai/dsh-session-projection';import LocalFs from '@deepseek-ai/dsh-fs-local';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy';import Approval from '@deepseek-ai/dsh-user-approval';
import PermissionPresets from '@deepseek-ai/dsh-permission-presets';
import {writeSessionBackup,restoreSessionBackup,prepareRestoredSessions,sealRecoveryCandidate,verifyRecoveryCandidate} from '../packages/dsh-zhen/lib/backup.js';
import {ownedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {restoredPermissionConfig} from '../packages/dsh-zhen/lib/restore-permissions.js';

const password='EXAMPLE permission recovery password';
const facts=(mode='danger-full-access',approval='never',preset='danger-full-access')=>[
 {type:'permission/preset',seq:0,time:1700000000001,data:{preset}},
 {type:'sandbox/mode',seq:1,time:1700000000002,data:{mode}},
 {type:'approval/policy',seq:2,time:1700000000003,data:{policy:approval}},
];
async function fixture(t,events=facts(),{seeded=false}={}){
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-permission-restore-EXAMPLE-'))),cleanup=ownedTempCleanup(base,root,'dsh-permission-restore-EXAMPLE-'),contexts=[];
 const home=join(root,'h'),next=join(root,'n'),parent=join(root,'r'),project=join(root,'p'),selected=join(root,'s');for(const path of[home,next,parent,project,selected])await mkdir(path);
 t.after(async()=>{try{for(const ctx of contexts.toReversed())await ctx.fiber.dispose();}finally{await cleanup.cleanup();}});
 async function services(path){const ctx=new Context();contexts.push(ctx);await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(path,'sessions')});await ctx.plugin(Attachments,{dshHome:path});await ctx.plugin(Query,{path:':memory:',openAt:'never'});return ctx;}
 const source=await services(home),id=SessionId('EXAMPLE_PERMISSION_SESSION'),header={version:SESSION_FORMAT_VERSION,id,createdAt:1700000000000,cwd:project,isSeeded:seeded,...seeded?{parentSession:SessionId('EXAMPLE_HISTORICAL_PARENT'),origin:'subagent',delegationDepth:1}:{}};
 const inherited=seeded?events.length:0;
 if(seeded){const parent=await source.sessionPersistence.create({version:SESSION_FORMAT_VERSION,id:header.parentSession,createdAt:header.createdAt-1,cwd:project,isSeeded:false});try{await parent.append(events);await parent.flush();}finally{await parent.close();}events=buildForkSeed(events,SessionSeq(inherited-1));}
 const owner=await source.sessionPersistence.create(header,{inheritedEventCount:inherited});let originalHeader;try{await owner.append(events);await owner.flush();}finally{await owner.close();}
 const persisted=await source.sessionPersistence.open(id,'read');try{originalHeader=persisted.header;}finally{await persisted.close();}
 const archive=join(root,'EXAMPLE.encrypted');await writeSessionBackup(archive,password,()=>({sessions:source.sessions,sessionPersistence:source.sessionPersistence,sessionQuery:source.sessionQuery,attachments:source.attachments}));
 const component=await restoreSessionBackup(archive,password,parent),baseline=await sealRecoveryCandidate(component.root,[]);
 async function read(path){const ctx=await services(path),handle=await ctx.sessionPersistence.open(id,'read');let saved;try{saved={header:handle.header,...await handle.read(),inherited:handle.inheritedEventCount};}finally{await handle.close();}return{ctx,saved};}
 async function policy(path){const {ctx,saved}=await read(path);await ctx.plugin(Projections);await ctx.plugin(LocalFs,{cwd:next});await ctx.plugin(SystemPrompt);await ctx.plugin(WorkingDirectory,{defaultDirectory:next});await ctx.plugin(SandboxPolicy,{mode:'read-only',workspaceRoot:next});await ctx.plugin(Approval,{policy:'ask'});const session=ctx.sessions.prepare(id,{seed:[...saved.events],meta:saved.header,inheritedEventCount:saved.inherited,eventState:saved.eventState});return{...saved,mode:ctx.sandboxPolicy.resolve({session}).mode,approval:ctx.approval.overrideOf(session),directory:ctx.workingDirectory.get(session)};}
 return{root,next,parent,project,selected,source,id,events,inherited,originalHeader,component,baseline,read,policy};
}

test('C193: unmapped recovered sessions cannot inherit historical full access or unattended approval through the real SDK policy services',async t=>{
 const f=await fixture(t),copy=await prepareRestoredSessions(f.root,f.next,f.component),current=await f.policy(copy.root);
 assert.equal(current.mode,'read-only');assert.equal(current.approval,'ask');assert.equal(copy.permissionResets,1);assert.equal(copy.permissionsRestored,false);
 assert.deepEqual(current.header,f.originalHeader);assert.deepEqual(current.events.slice(0,f.events.length),f.events);assert.equal(current.events.length,f.events.length+3);
 assert.deepEqual(current.events.slice(-3).map(row=>[row.type,row.data]),[['permission/preset',{preset:'read-only'}],['sandbox/mode',{mode:'read-only'}],['approval/policy',{policy:'ask'}]]);
 assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');assert.deepEqual((await f.read(f.component.root)).saved.events,f.events);
 console.log(JSON.stringify({contract:'C193',actualPublishedPolicyServices:true,unmappedHistoryCannotRestoreWriteAuthority:true,unattendedPolicyReset:true,originalHeaderAndEventPrefixPreserved:true,originalComponentUnchanged:true,onlyNewCopyChanged:true,noModelOrAgentExecution:true,nativeRequests:0,modelRequests:0}));
});

test('C193: mapped seeded subagent history keeps its immutable origin and inherited cut, with the selected directory still the final normal event',async t=>{
 const f=await fixture(t,facts(),{seeded:true}),copy=await prepareRestoredSessions(f.root,f.next,f.component,[{sessionId:f.id,directory:f.selected}]),current=await f.policy(copy.root);
 assert.equal(current.mode,'read-only');assert.equal(current.approval,'ask');assert.equal(current.directory,f.selected);assert.equal(current.header.origin,'subagent');assert.equal(current.header.delegationDepth,1);assert.equal(current.inherited,f.inherited);assert.deepEqual(current.header,f.originalHeader);
 assert.deepEqual(current.events.slice(0,f.events.length),f.events);assert.equal(current.events.at(-1).type,'working-directory/change');assert.equal(current.events.at(-1).seq,copy.directories[0].eventSeq);assert.equal(copy.permissionResets,2);assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');
});

test('C193: already neutralized and permission-free histories do not accumulate reset events on another independent application copy',async t=>{
 for(const events of[facts('read-only','ask','read-only'),[]]){
  const f=await fixture(t,events),copy=await prepareRestoredSessions(f.root,f.next,f.component),current=await f.read(copy.root);assert.deepEqual(current.saved.header,f.originalHeader);assert.deepEqual(current.saved.events,events);assert.equal(copy.permissionResets,0);
 }
});

test('C193: a later dangerous override across a paged history is reset while every unrelated event remains an unchanged prefix',async t=>{
 const events=[...facts('read-only','ask','read-only')];for(let i=0;i<260;i++)events.push({type:'plugin:example/retained',seq:events.length,time:1700000000100+i,ignorable:true,data:{index:i}});
 events.push({type:'sandbox/mode',seq:events.length,time:1700000001000,data:{mode:'danger-full-access'}});
 const f=await fixture(t,events),copy=await prepareRestoredSessions(f.root,f.next,f.component),current=await f.policy(copy.root);assert.equal(current.mode,'read-only');assert.equal(current.approval,'ask');assert.deepEqual(current.events.slice(0,events.length),events);assert.equal(copy.permissionResets,1);
});

test('C194: recovery defaults preserve the published implicit preset table and all unrelated fields while resetting the three permission owners',()=>{
 const defaults=PermissionPresets.Config({}).presets;
 assert.deepEqual(Object.keys(defaults),['workspace-write','danger-full-access']);
 for(const [name,mode,approval]of[['workspace-write','workspace-write','ask'],['danger-full-access','danger-full-access','never']])assert.deepEqual([defaults[name].sandbox,defaults[name].approval],[mode,approval]);
 const implicit=restoredPermissionConfig('@deepseek-ai/dsh-permission-presets',undefined);for(const name of Object.keys(defaults))assert.deepEqual(implicit.presets[name],defaults[name]);assert.equal(implicit.defaultPreset,'read-only');assert.equal(PermissionPresets.Config(implicit).presets['read-only'].sandbox,'read-only');
 const original={presets:{'read-only':{sandbox:'danger-full-access',approval:'never'},EXAMPLE_CUSTOM:{sandbox:'workspace-write',approval:'ask'}},defaultPreset:'EXAMPLE_CUSTOM',EXAMPLE_extra:'EXAMPLE_RETAIN'},before=structuredClone(original),reset=restoredPermissionConfig('@deepseek-ai/dsh-permission-presets',original);
 assert.deepEqual(original,before);assert.deepEqual(reset.presets.EXAMPLE_CUSTOM,before.presets.EXAMPLE_CUSTOM);assert.equal(reset.presets['read-only'].sandbox,'read-only');assert.equal(reset.presets['read-only'].approval,'ask');assert.equal(reset.defaultPreset,'read-only');assert.equal(reset.EXAMPLE_extra,'EXAMPLE_RETAIN');
 assert.deepEqual(restoredPermissionConfig('@deepseek-ai/dsh-sandbox-policy',{mode:'danger-full-access',workspaceRoot:'EXAMPLE_ROOT'}),{mode:'read-only',workspaceRoot:'EXAMPLE_ROOT'});assert.deepEqual(restoredPermissionConfig('@deepseek-ai/dsh-user-approval',{policy:'never'}),{policy:'ask'});
 for(const module of ['@deepseek-ai/dsh-permission-presets','@deepseek-ai/dsh-sandbox-policy','@deepseek-ai/dsh-user-approval'])assert.throws(()=>restoredPermissionConfig(module,{__jsExpr:'EXAMPLE_DO_NOT_EVALUATE'}),{code:'BACKUP_APPLICATION_CONFIG_REVIEW'});
 assert.equal(restoredPermissionConfig('@example/unrelated',undefined),null);
});
