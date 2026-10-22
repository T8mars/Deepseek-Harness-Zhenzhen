import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,rm} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import Sessions,{SessionId,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Query from '@deepseek-ai/dsh-session-query-sqlite';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {sessionLogExportDeps} from '@deepseek-ai/dsh-session-log-export';
import {prepareSessionBackup,prepareSkillInventoryBackup,writeBackupArchive} from '../packages/dsh-zhen/lib/backup.js';
import {LocalSkills} from '../packages/dsh-zhen/lib/local-skills.js';
import {GithubSkills} from '../packages/dsh-zhen/lib/github-skills.js';
import {SkillMarket} from '../packages/dsh-zhen/lib/market.js';
import {SkillFeed} from '../packages/dsh-zhen/lib/skill-feed.js';
import {LOCAL_SKILL_POLICY} from '../packages/dsh-zhen/lib/local-skills-schema.js';
import ZhenService from '../packages/dsh-zhen/lib/index.js';

const password='EXAMPLE retained backup password';
async function temporary(t){const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-retained-backup-EXAMPLE-'))),disposers=[];t.after(async()=>{try{for(const dispose of disposers.toReversed())await dispose();}finally{const actual=await realpath(root),part=relative(base,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-retained-backup-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:4,retryDelay:100});}});return{root,dispose:fn=>disposers.push(fn)};}
async function* chunks(bytes){for(let n=0;n<bytes.length;n+=4096)yield bytes.subarray(n,n+4096);}
async function consume(records){const result=[];for await(const record of records){const parts=[];for await(const bytes of record.data)parts.push(bytes);result.push({metadata:record.metadata,bytes:Buffer.concat(parts)});}return result;}
async function sessionFixture(t){
 const {root,dispose}=await temporary(t),ctx=new Context();dispose(()=>ctx.fiber.dispose());await ctx.plugin(Sessions);await ctx.plugin(Jsonl,{root:join(root,'EXAMPLE_SESSIONS')});await ctx.plugin(LocalAttachments,{dshHome:root});await ctx.plugin(Query,{path:':memory:',openAt:'never'});
 let keys=0;ctx.provide('credentials',{resolve(){keys++;throw Error('EXAMPLE_NO_CREDENTIAL_READ');}});dispose(()=>assert.equal(keys,0));
 const source=()=>sessionLogExportDeps(ctx),deps=source(),bytes=Buffer.from('EXAMPLE retained attachment'),file=await deps.attachments.saveFileStream({data:chunks(bytes),name:'EXAMPLE.txt'});
 const header={id:SessionId('EXAMPLE_RETAINED'),version:SESSION_FORMAT_VERSION,createdAt:1700000000000,cwd:root,isSeeded:false};
 const owner=await deps.sessionPersistence.create(header);try{await owner.append([{type:'user/message',seq:0,time:1700000000001,surfaceOp:'append',data:createUserMessage({source:{kind:'user'},content:[{type:'text',text:'EXAMPLE retained source'},{type:'file',attachment:file}]})}]);await owner.flush();}finally{await owner.close();}
 const append=async()=>{const handle=await deps.sessionPersistence.open(header.id,'write');try{const events=(await handle.read()).events;await handle.append([{type:'turn/start',seq:events.length,time:1700000000002,data:{turn:2}}]);await handle.flush();}finally{await handle.close();}};
 const add=async()=>{const handle=await deps.sessionPersistence.create({...header,id:SessionId('EXAMPLE_ADDED')});try{await handle.flush();}finally{await handle.close();}};
 return{root,ctx,source,deps,bytes,file,append,add};
}
async function hostSessionFixture(t){const f=await sessionFixture(t),before=process.env.DSH_HOME,agents=process.env.DSH_AGENTS_HOME;process.env.DSH_HOME=join(f.root,'EXAMPLE_DSH_HOME');process.env.DSH_AGENTS_HOME=join(f.root,'EXAMPLE_AGENTS_HOME');t.after(()=>{if(before===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=before;if(agents===undefined)delete process.env.DSH_AGENTS_HOME;else process.env.DSH_AGENTS_HOME=agents;});const host=await f.ctx.plugin(ZhenService);return{...f,host,service:f.ctx.get('zhen')};}
async function skillsFixture(t){
 const {root,dispose}=await temporary(t),custom=join(root,'EXAMPLE_SKILL');await mkdir(custom);await writeFile(join(custom,'SKILL.md'),'---\nname: example-retained\ndescription: EXAMPLE retained\n---\nEXAMPLE_BODY\n');const asset=join(custom,'EXAMPLE.bin');await writeFile(asset,Buffer.from([0,4,8,255]));
 const local=new LocalSkills(join(root,'EXAMPLE_LOCAL.json'),1000000),preview=await local.preview(custom,'skill');await local.connect(custom,'skill',preview.digest,LOCAL_SKILL_POLICY);
 let requests=0;const github=new GithubSkills(join(root,'EXAMPLE_GITHUB'),async()=>{requests++;throw Error('EXAMPLE_NO_NETWORK');}),market=new SkillMarket(join(root,'EXAMPLE_MARKET.sqlite'),[]),feed=new SkillFeed(join(root,'EXAMPLE_FEED.json'),market,async()=>{requests++;throw Error('EXAMPLE_NO_NETWORK');});feed.setAutomatic(false);
 dispose(()=>{local.close();github.close();market.close();assert.equal(requests,0);});
 const source={filesystem:[{id:'EXAMPLE_FILESYSTEM',mode:'host-local-resolved',config:{providerName:'EXAMPLE',includeDefaultRoots:false,dshHome:join(root,'EXAMPLE_HOME'),agentsHome:join(root,'EXAMPLE_AGENTS'),customSkillDirs:[custom]}}],workspaces:[],local,github,market,feed,protectedContainers:[root],forbiddenTrees:[]};
 return{root,custom,asset,source,local,github,market,feed};
}
test('C110: actual published session services stay stable across fresh public export facades',async t=>{
 const f=await sessionFixture(t),lease=await prepareSessionBackup(f.source);try{await lease.assertCurrent();const rows=await consume(lease.records());assert.equal(rows.filter(x=>x.metadata.kind==='session').length,1);assert.deepEqual(rows.find(x=>x.metadata.kind==='file').bytes,f.bytes);await lease.assertCurrent();await lease.assertCurrent();}finally{lease.close();}
});
for(const mutation of['append','add'])test('C110: a '+mutation+' after the session stream ends still refuses the retained lease',async t=>{
 const f=await sessionFixture(t),lease=await prepareSessionBackup(f.source);try{await consume(lease.records());await f[mutation]();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
for(const key of['sessionPersistence','sessionQuery','attachments','sessions'])test('C110: retained session source replacement is detected for '+key,async t=>{
 const f=await sessionFixture(t);let changed=false;const resolve=()=>{const deps=f.source();return changed?{...deps,[key]:key==='sessionPersistence'?{identity:Symbol('EXAMPLE_OTHER_PERSISTENCE')}:Object.create(null)}:deps;},lease=await prepareSessionBackup(resolve);
 try{await consume(lease.records());changed=true;await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C110: session cancellation before preparation never resolves a source',async()=>{
 const abort=new AbortController();abort.abort();let reads=0;await assert.rejects(prepareSessionBackup(()=>{reads++;throw Error('EXAMPLE_UNREACHABLE');},{signal:abort.signal}),{name:'AbortError'});assert.equal(reads,0);
});
test('C110: a session lease is single-use and closes without changing its stored source',async t=>{
 const f=await sessionFixture(t),before=await f.deps.sessionPersistence.list(),lease=await prepareSessionBackup(f.source);await consume(lease.records());await assert.rejects(consume(lease.records()),{code:'BACKUP_SESSION_STREAM_USED'});lease.close();lease.close();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SESSION_LEASE_CLOSED'});assert.deepEqual(await f.deps.sessionPersistence.list(),before);
});
test('C110: closing a session lease while its record is held refuses the remaining stream',async t=>{
 const f=await sessionFixture(t),lease=await prepareSessionBackup(f.source),stream=lease.records();assert.equal((await stream.next()).value.metadata.kind,'manifest');lease.close();await assert.rejects(stream.next(),{code:'BACKUP_SESSION_LEASE_CLOSED'});
});
test('C110: an outer final barrier refuses publication after the session component completed',async t=>{
 const f=await sessionFixture(t),lease=await prepareSessionBackup(f.source),path=join(f.root,'EXAMPLE_FINAL.dshbackup');
 try{const input=(async function*(){yield*lease.records();await f.append();await lease.assertCurrent();})();await assert.rejects(writeBackupArchive(path,password,input),{code:'BACKUP_SOURCE_CHANGED'});assert.equal((await readdir(f.root)).some(x=>x==='EXAMPLE_FINAL.dshbackup'||x.startsWith('.dsh-zhen-backup-')),false);}finally{lease.close();}
});
test('C110: unknown session metadata failures never expose a source path or private reason',async t=>{
 const f=await sessionFixture(t),deps=f.source(),bad=new Proxy(deps.sessionPersistence,{get(target,key){if(key==='list')return()=>{throw Error('EXAMPLE_PRIVATE_SOURCE_REASON');};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(prepareSessionBackup(()=>({...f.source(),sessionPersistence:bad})),error=>error.code==='BACKUP_SESSION_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE_SOURCE_REASON'));
});
test('C110: corrupted public attachment bytes cannot be published under their original digest',async t=>{
 const f=await sessionFixture(t),deps=f.source(),attachments=new Proxy(deps.attachments,{get(target,key){if(key==='readFileStream')return()=>chunks(Buffer.from('EXAMPLE_CORRUPTED_PAYLOAD'));const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const lease=await prepareSessionBackup(()=>({...f.source(),attachments}));try{await assert.rejects(consume(lease.records()),{code:'BACKUP_ATTACHMENT_DIGEST_MISMATCH'});}finally{lease.close();}
});
test('C110: a public attachment stream failure never exposes a private source reason',async t=>{
 const f=await sessionFixture(t),deps=f.source(),attachments=new Proxy(deps.attachments,{get(target,key){if(key==='readFileStream')return async function*(){throw Error('EXAMPLE_PRIVATE_SOURCE_REASON');};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const lease=await prepareSessionBackup(()=>({...f.source(),attachments}));try{await assert.rejects(consume(lease.records()),error=>error.code==='BACKUP_SESSION_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE_SOURCE_REASON'));}finally{lease.close();}
});
test('C110: actual own Host session lease retains the public source after its stream ends',async t=>{
 const f=await hostSessionFixture(t),lease=await f.service.sessionBackupLease();try{await consume(lease.records());await lease.assertCurrent();await f.append();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C110: disposing the own Host invalidates its retained session lease before reading former services',async t=>{
 const f=await hostSessionFixture(t),lease=await f.service.sessionBackupLease();try{await consume(lease.records());await f.host.dispose();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
 console.log(JSON.stringify({contract:'C110-session-host',actualOwnHostSessionLease:true,actualPublishedExportServices:true,hostDisposalRefused:true,coldServicesNotInitialized:true,nativeWrites:0,modelRequests:0}));
});
test('C110: complete skill inventory and resource bytes remain valid after its stream ends',async t=>{
 const f=await skillsFixture(t),lease=await prepareSkillInventoryBackup(()=>f.source);try{const rows=await consume(lease.records());assert.equal(rows[0].metadata.kind,'skill-inventory');assert.ok(rows.some(x=>x.metadata.kind==='skill-file'&&x.bytes.equals(Buffer.from([0,4,8,255]))));lease.document.roots.length=0;await lease.assertCurrent();}finally{lease.close();}
});
for(const mutation of['bytes','new-file','metadata','policy'])test('C110: a late skill '+mutation+' mutation refuses the retained inventory',async t=>{
 const f=await skillsFixture(t),lease=await prepareSkillInventoryBackup(()=>f.source);try{await consume(lease.records());if(mutation==='bytes')await writeFile(f.asset,Buffer.from([8,4,0,255]));else if(mutation==='new-file')await writeFile(join(f.custom,'EXAMPLE_ADDED.bin'),'EXAMPLE_NEW');else if(mutation==='metadata')f.local.disable(f.local.backupState().sources[0].id);else f.source.forbiddenTrees.push(f.custom);await assert.rejects(lease.assertCurrent(),error=>error.code==='BACKUP_SOURCE_CHANGED'||error.code==='BACKUP_SKILL_SCOPE_REFUSED');}finally{lease.close();}
});
for(const key of['local','github','market','feed'])test('C110: identical skill state from a replacement '+key+' source is not the original provider',async t=>{
 const f=await skillsFixture(t),lease=await prepareSkillInventoryBackup(()=>f.source),original=f.source[key];try{await consume(lease.records());f.source[key]={backupState:()=>original.backupState()};await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}
});
test('C110: skill cancellation before preparation never resolves a source',async()=>{
 const abort=new AbortController();abort.abort();let reads=0;await assert.rejects(prepareSkillInventoryBackup(()=>{reads++;throw Error('EXAMPLE_UNREACHABLE');},{signal:abort.signal}),{name:'AbortError'});assert.equal(reads,0);
});
test('C110: skill stream and lease are single-use, close is idempotent and sources remain unchanged',async t=>{
 const f=await skillsFixture(t),before=await readFile(f.asset),lease=await prepareSkillInventoryBackup(()=>f.source);await consume(lease.records());await assert.rejects(consume(lease.records()),{code:'BACKUP_SKILL_STREAM_USED'});lease.close();lease.close();await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SKILL_LEASE_CLOSED'});assert.deepEqual(await readFile(f.asset),before);
});
test('C110: an outer skill barrier refuses the entire unpublished archive after a late resource change',async t=>{
 const f=await skillsFixture(t),lease=await prepareSkillInventoryBackup(()=>f.source),path=join(f.root,'EXAMPLE_FINAL.dshbackup');try{const input=(async function*(){yield*lease.records();await writeFile(f.asset,'EXAMPLE_CHANGED');await lease.assertCurrent();})();await assert.rejects(writeBackupArchive(path,password,input),{code:'BACKUP_SOURCE_CHANGED'});assert.equal((await readdir(f.root)).some(x=>x==='EXAMPLE_FINAL.dshbackup'||x.startsWith('.dsh-zhen-backup-')),false);}finally{lease.close();}
});
test('C110: a late unknown skill source failure is fixed-code only',async t=>{
 const f=await skillsFixture(t),lease=await prepareSkillInventoryBackup(()=>f.source);try{await consume(lease.records());f.source.market={backupState(){throw Error('EXAMPLE_PRIVATE_SOURCE_REASON');}};await assert.rejects(lease.assertCurrent(),error=>error.code==='BACKUP_SKILL_INVENTORY_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE_SOURCE_REASON'));}finally{lease.close();}
 console.log(JSON.stringify({contract:'C110',actualPublishedSessionPersistence:true,actualSessionAttachments:true,completeOwnSkillInventory:true,retainedFinalSourceBarriers:true,lateChangesPreventArchivePublication:true,providerIdentityProtected:true,sourceBytesPreserved:true,nativeWrites:0,modelRequests:0}));
});
