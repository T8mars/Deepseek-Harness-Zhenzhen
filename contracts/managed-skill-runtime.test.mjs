import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {FileManagedSkillRuntimePolicy,writeSkillInventoryBackup,restoreSkillInventoryBackup,prepareRestoredSkills,readRestoredSkillReview} from '../packages/dsh-zhen/lib/backup.js';
import {SkillMarket} from '../packages/dsh-zhen/lib/market.js';
import {LocalSkills} from '../packages/dsh-zhen/lib/local-skills.js';
import {GithubSkills} from '../packages/dsh-zhen/lib/github-skills.js';
import {SkillFeed} from '../packages/dsh-zhen/lib/skill-feed.js';
import {GITHUB_SKILL_POLICY} from '../packages/dsh-zhen/lib/github-skills-schema.js';
import {inventoryFixture} from './fixtures/skill-inventory.mjs';

const revision='a'.repeat(40),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t,prepare){
  const f=await inventoryFixture(t);await prepare?.(f);
  const original={market:f.market.backupState(),github:f.github.backupState(),local:f.local.backupState(),feed:f.feed.backupState()},root=join(f.root,'EXAMPLE_ACTIVE_ROLE');await mkdir(root);
  const epoch=randomUUID();FileManagedSkillRuntimePolicy.initialize(root,epoch);let writable=true;
  const policy=new FileManagedSkillRuntimePolicy(root,epoch,()=>{if(!writable)throw Error('EXAMPLE_ROLE_PAUSED');}),marketFile=join(root,'s.db'),githubRoot=join(root,'g'),localFile=join(root,'l.json'),feedFile=join(root,'f.json');
  const empty=new SkillMarket(marketFile,[]);try{await empty.restoreBackupState(original.market);}finally{empty.close();}
  await cp(original.github.root,githubRoot,{recursive:true,errorOnExist:true,force:false});await writeFile(localFile,JSON.stringify(original.local));await cp(f.feedFile,feedFile,{errorOnExist:true,force:false});
  let market,github;const openMarket=()=>new SkillMarket(marketFile,[],{runtime:policy,catalog:original.market.catalog,bundled:original.market.bundled}),openGithub=()=>new GithubSkills(githubRoot,f.git.fetcher,{runtime:policy});
  market=openMarket();github=openGithub();const local=new LocalSkills(localFile,1000000,{runtime:policy});
  f.dispose(()=>{local.close();github?.close();market?.close();});
  return {...f,container:f.root,root,original,policy,epoch,marketFile,githubRoot,localFile,feedFile,local,get activeMarket(){return market;},get activeGithub(){return github;},pause(){writable=false;},resume(){writable=true;},reopenMarket(){market.close();market=undefined;market=openMarket();return market;},reopenGithub(){github.close();github=undefined;github=openGithub();return github;},assertOriginal(){assert.deepEqual(f.market.backupState(),original.market);assert.deepEqual(f.github.backupState(),original.github);assert.deepEqual(f.local.backupState(),original.local);assert.deepEqual(f.feed.backupState(),original.feed);}};
}

test('C182: archived manual pending survives two real market starts until a fresh explicit selection',async t=>{
  const f=await fixture(t),id=f.initial.manifest.id,pending=f.original.market.selections.find(row=>row.id===id).pending;
  for(let index=0;index<2;index++){assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.0.0');assert.equal(f.activeMarket.backupState().selections.find(row=>row.id===id).pending,pending);f.reopenMarket();}
  f.activeMarket.select(id,f.next.manifest.digest,f.next.manifest.version);assert.equal(f.policy.allowPending('market',id,pending,'manual'),true);f.reopenMarket();
  assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.1.0');assert.equal(f.activeMarket.backupState().selections.find(row=>row.id===id).pending,'');assert.equal(f.policy.allowPending('market',id,pending,'manual'),false);const provider=f.activeMarket.provider(),personal=(await provider.list({})).find(row=>row.name===f.personal);assert.ok((await provider.get(personal,{})).content.includes('EXAMPLE_PRIVATE_PERSONAL'));f.assertOriginal();
});

test('C182: inherited automatic preference and receipt cannot apply an update before this epoch verifies the feed',async t=>{
  const f=await fixture(t,f=>{f.market.cancelPending(f.initial.manifest.id);f.market.select(f.initial.manifest.id,f.initial.manifest.digest,f.initial.manifest.version);f.market.pauseAutoUpdate(f.initial.manifest.id,false);f.market.setAutoUpdates(true);f.market.recordVerifiedFeed([f.next],revision);assert.equal(f.market.stageAutomaticUpdates([f.next],revision),1);}),id=f.initial.manifest.id,pending=f.original.market.selections.find(row=>row.id===id).pending;
  assert.equal(f.activeMarket.backupState().preferences.enabled,1);assert.equal(f.activeMarket.autoPolicy().enabled,false);f.reopenMarket();assert.equal(f.activeMarket.backupState().selections.find(row=>row.id===id).pending,pending);
  f.activeMarket.setAutoUpdates(true);assert.equal(f.activeMarket.stageAutomaticUpdates([f.next],revision),0);f.reopenMarket();assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.0.0');
  f.activeMarket.recordVerifiedFeed([f.next],revision);assert.equal(f.activeMarket.stageAutomaticUpdates([f.next],revision),0);assert.equal(f.policy.allowPending('market',id,pending,'automatic',revision),true);f.reopenMarket();assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.1.0');assert.equal(f.policy.allowPending('market',id,pending,'automatic',revision),false);f.assertOriginal();
});

test('C182: actual GitHub retained versions do not apply old pending, but a new approval crosses one restart',async t=>{
  const f=await fixture(t),id=f.first.sourceId;
  assert.equal(f.activeGithub.list()[0].running,f.first.digest);assert.equal(f.activeGithub.list()[0].automatic,false);assert.equal(f.activeGithub.backupState().sources[0].automatic,true);f.reopenGithub();assert.equal(f.activeGithub.list()[0].pending,f.second.digest);
  f.activeGithub.approve(id,f.second.digest,GITHUB_SKILL_POLICY);assert.equal(f.policy.allowPending('github',id,f.second.digest,'manual'),true);assert.equal(f.activeGithub.list()[0].running,f.first.digest);f.reopenGithub();
  assert.equal(f.activeGithub.list()[0].running,f.second.digest);assert.equal(f.activeGithub.list()[0].pending,'');assert.equal(f.policy.allowPending('github',id,f.second.digest,'manual'),false);assert.equal(f.activeGithub.history(id).length,2);f.assertOriginal();
});

test('C182: pausing the current role refuses all four real managed writers and automatic requests',async t=>{
  const f=await fixture(t),localId=f.local.backupState().sources[0].id;let requests=0;
  const feed=new SkillFeed(f.feedFile,f.activeMarket,async()=>{requests++;throw Error('EXAMPLE_NO_NETWORK');},undefined,{runtime:f.policy}),before={market:f.activeMarket.backupState(),github:f.activeGithub.backupState(),local:f.local.backupState(),feed:await readFile(f.feedFile,'utf8')};
  let pausedDuringRequest=false;f.git.intercept(()=>{if(!pausedDuringRequest){pausedDuringRequest=true;f.pause();}});await assert.rejects(f.activeGithub.download(f.git.spec));assert.equal(pausedDuringRequest,true);f.git.intercept(undefined);assert.throws(()=>f.activeMarket.fork(f.initial.manifest.id,f.initial.manifest.digest,'EXAMPLE edit',f.initial.manifest.version));assert.throws(()=>f.local.disable(localId));assert.throws(()=>f.activeGithub.automatic(f.first.sourceId,true));assert.throws(()=>feed.setAutomatic(true));await feed.automaticCheck();await f.activeGithub.automaticCheck();assert.equal(requests,0);
  assert.deepEqual(f.activeMarket.backupState(),before.market);assert.deepEqual(f.activeGithub.backupState(),before.github);assert.deepEqual(f.local.backupState(),before.local);assert.equal(await readFile(f.feedFile,'utf8'),before.feed);assert.ok((await f.activeMarket.provider().list({})).some(row=>row.name===f.initial.manifest.id));f.assertOriginal();
});

test('C182: restored daily checks are effective only after a new explicit choice, with original preferences preserved',async t=>{
  const f=await fixture(t,f=>f.feed.setAutomatic(true));let requests=0;
  const feed=new SkillFeed(f.feedFile,f.activeMarket,async url=>{requests++;if(String(url).startsWith('https://api.github.com/'))return Response.json({sha:revision});return Response.json({schemaVersion:1,publisher:'T8mars/Deepseek-Harness-Zhenzhen',skills:[f.next]});},undefined,{runtime:f.policy});
  assert.equal(feed.backupState().status.automatic,true);assert.equal(feed.snapshot().automatic,false);await feed.automaticCheck();assert.equal(requests,0);feed.setAutomatic(true);await feed.automaticCheck();assert.equal(requests,2);await feed.automaticCheck();assert.equal(requests,2);
  const state=JSON.parse(await readFile(join(f.githubRoot,'state.json'),'utf8'));state.sources[0].checkedAt='';await writeFile(join(f.githubRoot,'state.json'),JSON.stringify(state));const before=f.git.calls.length;await f.activeGithub.automaticCheck();assert.equal(f.git.calls.length,before);f.activeGithub.automatic(f.first.sourceId,true);await f.activeGithub.automaticCheck();assert.ok(f.git.calls.length>before);f.assertOriginal();
});

test('C182: skip, cancellation, personal forks and manual rollback keep ordinary market behavior in an active copy',async t=>{
  const f=await fixture(t),id=f.initial.manifest.id;f.activeMarket.select(id,f.next.manifest.digest,f.next.manifest.version);f.activeMarket.cancelPending(id);f.reopenMarket();assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.0.0');
  f.activeMarket.select(id,f.next.manifest.digest,f.next.manifest.version);f.reopenMarket();const personal=f.activeMarket.fork(id,f.next.manifest.digest,'EXAMPLE new personal',f.next.manifest.version);f.activeMarket.select(id,f.initial.manifest.digest,f.initial.manifest.version);f.reopenMarket();
  assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).installedVersion,'1.0.0');assert.equal(f.activeMarket.list().find(row=>row.manifest.id===id).automaticPaused,true);assert.ok(f.activeMarket.list().some(row=>row.manifest.id===personal));assert.ok(f.activeMarket.list().some(row=>row.manifest.id===f.personal));assert.equal(f.activeMarket.versions(id).length,2);f.assertOriginal();
});

test('C182: a normal complete skill inventory retains pending and preferences but never the active-copy approval receipts',async t=>{
  const f=await fixture(t),id=f.initial.manifest.id;f.activeMarket.select(id,f.next.manifest.digest,f.next.manifest.version);f.activeMarket.setAutoUpdates(true);const password='EXAMPLE active inventory archive password',archive=join(f.root,'EXAMPLE_ACTIVE.encrypted');
  const feed=new SkillFeed(f.feedFile,f.activeMarket,async()=>{throw Error('EXAMPLE_NO_NETWORK');},undefined,{runtime:f.policy});
  await writeSkillInventoryBackup(archive,password,()=>({...f.source,market:f.activeMarket,github:f.activeGithub,local:f.local,feed}));const restored=await restoreSkillInventoryBackup(archive,password,f.parent),home=join(f.root,'EXAMPLE_NEXT_HOME');await mkdir(join(home,'dsh-zhen'),{recursive:true});await prepareRestoredSkills(f.container,home,restored);
  const review=readRestoredSkillReview(join(home,'dsh-zhen'));assert.equal(review.market.preferences.enabled,1);assert.equal(review.market.selections.find(row=>row.id===id).pending,f.activeMarket.backupState().selections.find(row=>row.id===id).pending);assert.equal(review.pending,true);assert.equal((await readdir(join(home,'dsh-zhen'))).includes('policy.json'),false);assert.equal(JSON.stringify(restored.inventory).includes('dsh-zhen-managed-runtime-policy-v1'),false);f.assertOriginal();
  console.log(JSON.stringify({contract:'C182',actualManagedClassesAndSkillInventory:true,archivedPendingPreservedUntilFreshAction:true,freshEpochFeedVerificationRequired:true,activeCopyReceiptsNeverBackedUp:true,ordinarySkipRollbackAndForksPreserved:true,productionOwnerActivationImplemented:false,wholeApplicationRestore:false,nativeRequests:0,modelRequests:0}));
});

test('C182: changed epoch, corrupt receipts and a role revoked during commit cannot publish or inherit an approval',async t=>{
  const f=await fixture(t),path=join(f.root,'policy.json'),original=await readFile(path);assert.throws(()=>new FileManagedSkillRuntimePolicy(f.root,randomUUID(),()=>{}));await writeFile(path,'{EXAMPLE invalid');assert.equal(f.policy.allowPending('market','EXAMPLE','0'.repeat(64),'manual'),false);assert.throws(()=>f.policy.setAutomatic('market-updates',true));await writeFile(path,original);
  let calls=0;const revoked=new FileManagedSkillRuntimePolicy(f.root,f.epoch,()=>{if(++calls===2)throw Error('EXAMPLE_REVOKED_BEFORE_COMMIT');});assert.throws(()=>revoked.setAutomatic('market-updates',true));assert.equal(hash(await readFile(path)),hash(original));assert.equal((await readdir(f.root)).some(name=>name.startsWith('.p-')),false);f.assertOriginal();
});

test('C182: removing a GitHub check choice releases capacity for a newly connected source',async t=>{
  const f=await fixture(t),ids=Array.from({length:17},(_,index)=>hash('EXAMPLE_SOURCE_'+index));f.policy.setAutomatic('market-checks',true);f.policy.setAutomatic('market-updates',true);
  for(const id of ids.slice(0,16))f.policy.setAutomatic('github-checks',true,id);f.policy.setAutomatic('github-checks',false,ids[0]);f.policy.setAutomatic('github-checks',true,ids[16]);
  assert.equal(f.policy.automatic('github-checks',ids[0]),false);assert.equal(f.policy.automatic('github-checks',ids[16]),true);assert.equal(f.policy.automatic('github-checks',ids[1]),true);f.assertOriginal();
});
test('C182: a paused restart retains the verified catalog and stored preference without scheduling or checking',async t=>{
  const f=await fixture(t,f=>f.feed.setAutomatic(true));let requests=0;const content=f.initial.content+'\nEXAMPLE_CACHED_CATALOG\n',update={manifest:{...f.initial.manifest,version:'1.2.0',digest:hash(content)},content},fetcher=async url=>{requests++;return String(url).startsWith('https://api.github.com/')?Response.json({sha:revision}):Response.json({schemaVersion:1,publisher:'T8mars/Deepseek-Harness-Zhenzhen',skills:[update]});};
  const feed=new SkillFeed(f.feedFile,f.activeMarket,fetcher,undefined,{runtime:f.policy});feed.setAutomatic(true);await feed.check();assert.equal(requests,2);assert.equal(f.activeMarket.list().find(row=>row.manifest.id===f.initial.manifest.id).manifest.version,'1.2.0');f.pause();f.reopenMarket();const reopened=new SkillFeed(f.feedFile,f.activeMarket,fetcher,undefined,{runtime:f.policy});assert.equal(reopened.backupState().status.automatic,true);assert.equal(reopened.snapshot().state,'checked');assert.equal(reopened.snapshot().automatic,false);assert.equal(f.activeMarket.list().find(row=>row.manifest.id===f.initial.manifest.id).manifest.version,'1.2.0');await reopened.automaticCheck();assert.equal(requests,2);f.assertOriginal();
});
test('C182: shared pending receipts have one owner while check consent and reset remain scoped by profile',async t=>{
 const f=await fixture(t),a=new FileManagedSkillRuntimePolicy(f.root,f.epoch,()=>{},'EXAMPLE_A'),b=new FileManagedSkillRuntimePolicy(f.root,f.epoch,()=>{},'EXAMPLE_B'),id=f.initial.manifest.id,first='1'.repeat(64),second='2'.repeat(64),otherRevision='b'.repeat(40);a.setAutomatic('market-updates',true);a.verifiedFeed(revision);a.authorizePending('market',id,first,'manual');assert.equal(a.allowPending('market',id,first,'manual'),true);assert.equal(b.allowPending('market',id,first,'manual'),false);assert.equal(b.automatic('market-updates'),false);b.setAutomatic('market-updates',true);b.verifiedFeed(otherRevision);assert.equal(a.canStageAutomatic(revision),true);assert.equal(b.canStageAutomatic(revision),false);b.authorizePending('market',id,second,'manual');assert.equal(a.allowPending('market',id,first,'manual'),false);assert.equal(b.allowPending('market',id,second,'manual'),true);FileManagedSkillRuntimePolicy.reset(f.root,f.epoch,()=>{},'EXAMPLE_A');assert.equal(a.automatic('market-updates'),false);assert.equal(b.automatic('market-updates'),true);assert.equal(b.canStageAutomatic(otherRevision),true);assert.equal(b.allowPending('market',id,second,'manual'),true);b.forgetPending('market',id);assert.equal(b.allowPending('market',id,second,'manual'),false);f.assertOriginal();
});
