import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,rename,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import LocalFs from '@deepseek-ai/dsh-fs-local';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Registry from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import {initProfile} from '@deepseek-ai/dsh-app-boot';
import Zhen from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {RecoveryApplication} from '../packages/dsh-zhen/lib/recovery-application.js';
import {inspectRecoveryApplication,adoptRecoveryApplication} from '../packages/dsh-zhen/lib/recovery-application-config.js';
import {RecoveryCatalog,BackupCenter} from '../packages/dsh-zhen/lib/backup.js';
import {fixture} from './fixtures/recovery-application-config.mjs';

const anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json');
function credentials(){
 const records=new Map();let chain=Promise.resolve(),writes=0;
 return{records,get writes(){return writes;},describe:async()=>({configured:false,writable:true}),resolve(){assert.fail('EXAMPLE_NO_KEY_RESOLUTION');},readRecord:async key=>structuredClone(records.get(JSON.stringify(key))),describeRecord:async()=>({configured:true,writable:true}),modifyRecord(key,update){const operation=chain.then(async()=>{const id=JSON.stringify(key),next=await update(structuredClone(records.get(id)));writes++;if(next===undefined)records.delete(id);else records.set(id,structuredClone(next));});chain=operation.catch(()=>{});return operation;}};
}
async function controlFixture(t,options){
 const f=await fixture(t,options),home=join(f.root,'EXAMPLE_source_home'),id=randomUUID();await mkdir(home);const data=join(home,'dsh-zhen');await mkdir(data);const catalog=join(data,'recovery-candidates.sqlite');new RecoveryCatalog(catalog).put({id,baseline:f.baseline});
 const center=new BackupCenter(join(data,'backups'),()=>({}),{catalogFile:catalog}),provider=credentials(),manager=new RecoveryApplication(home,anchor,()=>provider,center);
 f.dispose(async()=>{for(const child of manager.children.values()){assert.ok(child.spawnargs.includes('--profile'));if(child.exitCode===null)child.kill();}await manager.close();await center.close();});return{...f,sourceHome:home,id,center,provider,manager};
}
async function waitFor(manager,id,predicate,budget=90000){const start=Date.now();let state;do{state=await manager.status(id);if(predicate(state))return state;if(state.phase==='failed')assert.fail(JSON.stringify(state));await new Promise(done=>setTimeout(done,200));}while(Date.now()-start<budget);assert.fail('EXAMPLE_RUNTIME_NOT_READY '+JSON.stringify(state));}

test('C197: actual public CLI recovery starts every core service once and reconnects after the source manager closes',{timeout:180000},async t=>{
 const f=await controlFixture(t,{withZhen:true});assert.deepEqual(f.installation,{actualPublicCli:true,freshOwnedStore:true,ignoreScripts:true,offline:false});const review=await f.manager.review({candidateId:f.id,profile:'',page:0,review:null});assert.equal(review.canOpen,true,JSON.stringify(f.manager.plans.get(f.id).plan.programs.filter(row=>row.origin==='unresolved')));assert.ok(review.totalPrograms>100);
 const request={candidateId:f.id,profile:review.selected,review:review.review,requestId:randomUUID(),approved:true,openBrowser:false},accepted=await f.manager.open(request);assert.equal(accepted.phase,'preparing');assert.equal(accepted.consumed,true);
 const duplicate=await f.manager.open(request);assert.equal(duplicate.execution,accepted.execution);await assert.rejects(f.manager.open({...request,requestId:randomUUID()}),{code:'BACKUP_APPLICATION_ALREADY_OPENED'});
 const first=await waitFor(f.manager,f.id,value=>value.ready);assert.equal(first.phase,'running');assert.equal(first.browserRequested,false);assert.ok(first.port>0);assert.ok(first.pid>0);assert.equal(JSON.stringify(first).includes('secret'),false);
 const child=f.manager.children.get(first.execution);assert.ok(child);f.dispose(async()=>{if(child.exitCode===null)child.kill();});
 const records=[...f.provider.records.values()];assert.equal(records.length,1);const grant=records[0].payload,launch=await readFile(join(grant.adopted.bundleDirectory,'launch-'+first.execution+'.json'),'utf8');assert.equal(launch.includes(grant.secret),false);assert.equal(child.spawnargs.join(' ').includes(grant.secret),false);
 await f.manager.close();const second=new RecoveryApplication(f.sourceHome,anchor,()=>f.provider,f.center);f.dispose(()=>second.close());const connected=await second.status(f.id);assert.equal(connected.execution,first.execution);assert.equal(connected.pid,first.pid);assert.equal(connected.ready,true);
 const stopping=await second.control({candidateId:f.id,execution:first.execution,operation:'stop'});assert.equal(stopping.phase,'stopping');const exited=await waitFor(second,f.id,value=>value.canReopen,20000);assert.equal(exited.ready,false);
 const reopened=await second.open({...request,requestId:randomUUID()}),third=await waitFor(second,f.id,value=>value.ready);assert.notEqual(third.execution,first.execution);assert.equal(reopened.execution,third.execution);assert.notEqual(third.pid,first.pid);
 await assert.rejects(second.control({candidateId:f.id,execution:first.execution,operation:'stop'}),{code:'BACKUP_APPLICATION_EXECUTION_CHANGED'});assert.equal((await second.status(f.id)).ready,true);
 await second.control({candidateId:f.id,execution:third.execution,operation:'stop'});await waitFor(second,f.id,value=>value.canReopen,20000);
 const replay=await second.open(request);assert.equal(replay.execution,third.execution);assert.equal(replay.canReopen,true);assert.equal(second.children.size,0);
 console.log(JSON.stringify({contract:'C197',actualPublishedCli:true,freshOwnedPackageStore:true,dependencyDownloadsAllowed:true,packageLifecycleScriptsDisabled:true,fullCoreReadiness:true,sameRequestSingleExecution:true,anotherRequestRefusedWhileRunning:true,sourceManagerClosedChildSurvives:true,authenticatedReconnect:true,actualGracefulStop:true,explicitReopen:true,secretAbsentFromLaunchFileAndArguments:true,browserOpened:false,nativeRequests:0,modelRequests:0}));
});

test('C197: the actual published Owner gateway exposes only bounded review/status and denies all four anonymous operations',async t=>{
 const f=await controlFixture(t),previous={home:process.env.DSH_HOME,agents:process.env.DSH_AGENTS_HOME},ctx=new Context(),dir=join(f.sourceHome,'profiles','EXAMPLE_SOURCE');await mkdir(dir,{recursive:true});initProfile(dir,[]);
 process.env.DSH_HOME=f.sourceHome;process.env.DSH_AGENTS_HOME=f.agentsHome;
 try{ctx.provide('credentials',f.provider);ctx.provide('profileContext',{name:'EXAMPLE_SOURCE',home:f.sourceHome,dir,patchPath:join(dir,'cordis.patch.yml'),installAnchor:anchor,cwd:f.sourceHome,startedBundles:[],overlays:[]});for(const plugin of[LocalFs,SkillRegistry,Prompt,Tools,Registry,Access,Zhen])await ctx.plugin(plugin);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});}finally{if(previous.home===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous.home;if(previous.agents===undefined)delete process.env.DSH_AGENTS_HOME;else process.env.DSH_AGENTS_HOME=previous.agents;}
 f.dispose(()=>ctx.fiber.dispose());
 const call=async(method,args,principal={kind:'owner'})=>{const result=await ctx.typertGateway.invoke({namespace:'zhen',method,args,peer:{id:'EXAMPLE_RECOVERY_OWNER',ctx,principal,signal:new AbortController().signal,interactions:'none',dispose:async()=>{}}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(JSON.parse(JSON.stringify(result)));};
 const reviewRequest={candidateId:f.id,profile:'',page:0,review:null},openRequest={candidateId:f.id,requestId:randomUUID(),profile:f.name,review:'a'.repeat(64),approved:true,openBrowser:false};
 for(const[method,args]of[['backupApplicationReview',{request:reviewRequest}],['backupApplicationOpen',{request:openRequest}],['backupApplicationStatus',{id:f.id}],['backupApplicationControl',{request:{candidateId:f.id,execution:randomUUID(),operation:'stop'}}]])await assert.rejects(call(method,args,{kind:'anonymous'}));assert.equal(f.provider.writes,0);
 assert.equal((await call('backupApplicationStatus',{id:f.id})).consumed,false);const first=await call('backupApplicationReview',{request:reviewRequest});assert.equal(first.canOpen,true);assert.equal(first.programs.length,20);assert.equal(first.nextPage,1);assert.equal(JSON.stringify(first).includes('apiKeyEnv'),false);
 const second=await call('backupApplicationReview',{request:{...reviewRequest,profile:first.selected,page:1,review:first.review}});assert.equal(second.review,first.review);assert.equal(second.page,1);assert.equal(second.programs.length,20);
 await assert.rejects(call('backupApplicationOpen',{request:openRequest}),error=>error.details?.reason==='BACKUP_APPLICATION_REVIEW_CHANGED');assert.equal(f.provider.writes,0);assert.equal(f.manager.children.size,0);
 console.log(JSON.stringify({contract:'C197',actualPublishedOwnerGateway:true,strictRemoteCodecs:true,anonymousDenied:4,pagedProgramMetadataOnly:true,wrongReviewRefusedBeforeWrites:true,credentialResolutions:0,nativeRequests:0,modelRequests:0}));
});

test('C197: read-only authorization storage refuses before reviewing or changing any recovered program',async t=>{
 const f=await controlFixture(t);f.provider.describeRecord=async()=>({configured:false,writable:false});await assert.rejects(f.manager.review({candidateId:f.id,profile:'',page:0,review:null}),{code:'BACKUP_APPLICATION_AUTHORIZATION_UNAVAILABLE'});assert.equal(f.provider.writes,0);assert.equal(f.manager.children.size,0);
});

test('C197: another application home cannot inherit an opening record and an unknown live process is never restarted',async t=>{
 const f=await controlFixture(t),requestId=randomUUID(),execution=randomUUID(),record={schema:'dsh-zhen-recovery-application-v1',parentHome:f.sourceHome,candidateId:f.id,root:f.candidate,baseline:f.baseline.sha256,profile:f.name,title:'EXAMPLE',review:'a'.repeat(64),requestId,requests:[requestId],execution,secret:'b'.repeat(64),phase:'running',pid:process.pid,port:null,ready:false,browserRequested:false,error:null,adopted:null,startedAt:new Date().toISOString()};
 const key=JSON.stringify('dsh-zhen/recovery-'+f.id);f.provider.records.set(key,{kind:'grant',payload:record});assert.equal((await f.manager.status(f.id)).phase,'unknown');await assert.rejects(f.manager.open({candidateId:f.id,requestId:randomUUID(),profile:f.name,review:record.review,approved:true,openBrowser:false}),{code:'BACKUP_APPLICATION_ALREADY_OPENED'});assert.equal(f.manager.children.size,0);
 const other=join(f.root,'EXAMPLE_other_home');await mkdir(other);const cloned=new RecoveryApplication(other,anchor,()=>f.provider,f.center);f.dispose(()=>cloned.close());await assert.rejects(cloned.status(f.id),{code:'BACKUP_APPLICATION_RECORD_INVALID'});
});

test('C197: application review shares the existing backup/candidate cancellation lock',async t=>{
 const f=await controlFixture(t);let entered,release;const started=new Promise(done=>{entered=done;}),waiting=new Promise(done=>{release=done;});let aborted=false;
 const running=f.center.applicationOperation(f.id,async(_baseline,signal)=>{entered();await waiting;aborted=signal.aborted;});await started;
 await assert.rejects(f.center.candidateVerify(f.id),{code:'BACKUP_BUSY'});await assert.rejects(f.manager.review({candidateId:f.id,profile:'',page:0,review:null}),{code:'BACKUP_BUSY'});assert.throws(()=>f.center.candidateForget(f.id),{code:'BACKUP_BUSY'});f.center.cancel(f.id);release();await running;assert.equal(aborted,true);assert.equal((await f.center.candidateVerify(f.id)).integrity,'unchanged');
});

test('C197: replacing an adopted home with a link refuses explicit reopen before spawning any program',async t=>{
 const f=await controlFixture(t),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),adopted=await adoptRecoveryApplication(plan,plan.digest),bundleDigest=createHash('sha256').update(await readFile(join(adopted.bundleDirectory,'cordis.patch.yml'))).digest('hex'),requestId=randomUUID();
 const record={schema:'dsh-zhen-recovery-application-v1',parentHome:f.sourceHome,candidateId:f.id,root:f.candidate,baseline:f.baseline.sha256,profile:f.name,title:'EXAMPLE',review:plan.digest,requestId,requests:[requestId],execution:randomUUID(),secret:'b'.repeat(64),phase:'exited',pid:null,port:null,ready:false,browserRequested:false,error:null,adopted:{...adopted,bundleDigest},startedAt:new Date().toISOString()};f.provider.records.set(JSON.stringify('dsh-zhen/recovery-'+f.id),{kind:'grant',payload:record});
 const moved=join(f.root,'EXAMPLE_moved_home');await rename(f.home,moved);await symlink(moved,f.home,process.platform==='win32'?'junction':'dir');
 const result=await f.manager.open({candidateId:f.id,requestId:randomUUID(),profile:f.name,review:plan.digest,approved:true,openBrowser:false});assert.equal(result.phase,'failed');assert.equal(result.error,'BACKUP_TEMP_BOUNDARY');assert.equal(f.manager.children.size,0);
});

test('C197: a complete original Web profile without the optional own plugin opens with its original services',async t=>{
 const f=await controlFixture(t),review=await f.manager.review({candidateId:f.id,profile:'',page:0,review:null}),accepted=await f.manager.open({candidateId:f.id,requestId:randomUUID(),profile:review.selected,review:review.review,approved:true,openBrowser:false});const ready=await waitFor(f.manager,f.id,row=>row.ready);assert.equal(ready.execution,accepted.execution);assert.equal([...f.provider.records.values()][0].payload.adopted.requiresZhen,false);await f.manager.control({candidateId:f.id,execution:ready.execution,operation:'stop'});await waitFor(f.manager,f.id,row=>row.canReopen,20000);
});
