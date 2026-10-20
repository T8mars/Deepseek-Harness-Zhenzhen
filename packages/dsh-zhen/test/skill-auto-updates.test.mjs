import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SkillMarket, readBundledCatalog, verifySkill } from '../lib/market.js';
import { SkillFeed } from '../lib/skill-feed.js';

// Policy/migration scenarios use explicit synthetic revisions, independently
// of release numbers in the actual catalog verified by the provider contracts.
const catalog = readBundledCatalog().slice(0,3).map(item=>({...item,manifest:{...item.manifest,version:'1.0.0'}}));
const revision='a'.repeat(40),commit='https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/commits/main';
const updated=(item,version='1.1.0')=>{const content=item.content+'\nEXAMPLE ONLY: updated creative instructions '+version+'\n';return{manifest:{...item.manifest,version,digest:createHash('sha256').update(content).digest('hex')},content};};
function fixture(t){
  const temp=realpathSync.native(tmpdir()),root=mkdtempSync(join(temp,'dsh-zhen-skill-auto-')),file=join(root,'skills.sqlite'),cache=join(root,'feed.json');
  let market=new SkillMarket(file,catalog),reply=catalog.map(item=>updated(item)),head=revision;
  const fetcher=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);if(url===commit)return Response.json({sha:head});assert.equal(url,`https://raw.githubusercontent.com/T8mars/Deepseek-Harness-Zhenzhen/${head}/market/skills.v1.json`);return Response.json({schemaVersion:1,publisher:'T8mars/Deepseek-Harness-Zhenzhen',skills:reply});};
  let feed=new SkillFeed(cache,market,fetcher);
  t.after(()=>{market?.close();const absolute=realpathSync.native(root),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Fixture cleanup refused.');rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  return{root,file,cache,fetcher,get market(){return market;},get feed(){return feed;},get reply(){return reply;},set reply(value){reply=value;},set head(value){head=value;},reopen(){market.close();market=undefined;market=new SkillMarket(file,catalog);feed=new SkillFeed(cache,market,fetcher);return market;}};
}
function install(market,item=catalog[0]){market.select(item.manifest.id,item.manifest.digest,item.manifest.version);}
const row=(market,item=catalog[0])=>market.list().find(value=>value.manifest.id===item.manifest.id);

test('trusted text updates require opt-in, stage only enabled installed source skills and preserve active/personal bodies until restart',async t=>{
  const state=fixture(t);install(state.market);install(state.market,catalog[1]);state.market.disable(catalog[1].manifest.id);
  const personal=state.market.fork(catalog[0].manifest.id,catalog[0].manifest.digest,'EXAMPLE ONLY personal creative instructions.',catalog[0].manifest.version);
  assert.equal(state.market.autoPolicy().enabled,false);
  await state.feed.check();assert.equal(row(state.market).pendingVersion,'');
  const options={signal:new AbortController().signal},candidate=(await state.market.provider().list(options)).find(item=>item.name===catalog[0].manifest.id);
  const before=(await state.market.provider().get(candidate,options)).content;
  state.feed.setAutoUpdates(true);
  assert.equal(row(state.market).pendingMode,'automatic');assert.equal(row(state.market).pendingRevision,revision);assert.equal(row(state.market).installedVersion,'1.0.0');
  assert.equal(row(state.market,catalog[1]).pendingVersion,'');assert.equal(row(state.market,catalog[2]).installedVersion,'');assert.equal(state.market.autoPolicy().pendingAutomatic,1);
  assert.equal((await state.market.provider().get(candidate,options)).content,before);
  state.head='b'.repeat(40);await state.feed.check();assert.equal(row(state.market).pendingRevision,'b'.repeat(40));
  state.feed.setAutomatic(false);
  state.reopen();assert.equal(row(state.market).installedVersion,'1.1.0');assert.equal(state.market.autoPolicy().enabled,true);assert.equal(state.market.autoPolicy().pendingAutomatic,0);
  assert.equal(state.feed.snapshot().automatic,false);
  assert.equal(await state.market.provider().get(candidate,options),undefined);
  assert.equal(state.market.list().find(item=>item.manifest.id===personal).enabled,true);assert.equal(state.market.versions(personal)[0].content.includes('personal creative'),true);
  assert.equal(state.market.versions(catalog[0].manifest.id).length,2);assert.equal(row(state.market,catalog[1]).enabled,false);
});

test('disabling a queued skill prevents cache reload or restart from re-enabling it',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);await state.feed.check();assert.equal(row(state.market).pendingMode,'automatic');
  state.market.disable(catalog[0].manifest.id);assert.equal(row(state.market).pendingVersion,'');
  state.reopen();assert.equal(row(state.market).enabled,false);assert.equal(row(state.market).installedVersion,'1.0.0');assert.equal(row(state.market).pendingVersion,'');assert.equal(state.market.autoPolicy().enabled,true);
  assert.equal((await state.market.provider().list({signal:new AbortController().signal})).length,0);
});

test('a cache that rewrites its own version/body hashes cannot authorize automation or poison a subsequent genuine feed',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);await state.feed.check();state.market.cancelPending(catalog[0].manifest.id);
  const forged=JSON.parse(readFileSync(state.cache,'utf8'));forged.catalog=[updated(catalog[0],'1.2.0')];forged.status.count=1;
  writeFileSync(state.cache,JSON.stringify(forged));
  state.reopen();assert.equal(row(state.market).installedVersion,'1.0.0');assert.equal(row(state.market).pendingVersion,'');assert.equal(state.feed.snapshot().revision,'');assert.equal(state.market.autoPolicy().enabled,true);
  assert.equal((await state.feed.check()).state,'checked');assert.equal(state.feed.snapshot().revision,revision);assert.equal(row(state.market).manifest.version,'1.1.0');assert.equal(row(state.market).pendingVersion,'');
});

test('disabling source automation cancels only automatic queues and preserves explicit manual selections',async t=>{
  const state=fixture(t);install(state.market);install(state.market,catalog[1]);await state.feed.check();
  const manual=state.reply[0];state.market.select(manual.manifest.id,manual.manifest.digest,manual.manifest.version);
  state.feed.setAutoUpdates(true);assert.equal(row(state.market).pendingMode,'manual');assert.equal(row(state.market,catalog[1]).pendingMode,'automatic');
  state.feed.setAutoUpdates(false);assert.equal(row(state.market).pendingVersion,'1.1.0');assert.equal(row(state.market,catalog[1]).pendingVersion,'');
  state.reopen();assert.equal(row(state.market).installedVersion,'1.1.0');assert.equal(row(state.market,catalog[1]).installedVersion,'1.0.0');assert.equal(state.market.autoPolicy().enabled,false);
});

test('a skipped release stays skipped across repeated checks and restart; a newer release remains eligible and a withdrawn candidate is cancelled',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);await state.feed.check();
  state.market.cancelPending(catalog[0].manifest.id);await state.feed.check();assert.equal(row(state.market).pendingVersion,'');
  state.reopen();assert.equal(row(state.market).pendingVersion,'');assert.equal(row(state.market).installedVersion,'1.0.0');
  state.reply=[updated(catalog[0],'1.2.0')];await state.feed.check();assert.equal(row(state.market).pendingVersion,'1.2.0');
  state.feed.pauseAutoUpdate(catalog[0].manifest.id,true);assert.equal(row(state.market).pendingVersion,'');assert.equal(row(state.market).automaticPaused,true);
  await state.feed.check();assert.equal(row(state.market).pendingVersion,'');
  state.feed.pauseAutoUpdate(catalog[0].manifest.id,false);assert.equal(row(state.market).pendingVersion,'1.2.0');
  state.reply=[];await state.feed.check();assert.equal(row(state.market).pendingVersion,'');assert.equal(row(state.market).installedVersion,'1.0.0');assert.equal(state.market.versions(catalog[0].manifest.id).length,3);
});

test('reviewed rollback pins that skill and cannot be undone by the automatic source policy',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);await state.feed.check();state.reopen();assert.equal(row(state.market).installedVersion,'1.1.0');
  state.reply=[updated(catalog[0],'1.2.0')];await state.feed.check();
  install(state.market);assert.equal(row(state.market).pendingMode,'manual');assert.equal(row(state.market).automaticPaused,true);
  state.reopen();assert.equal(row(state.market).installedVersion,'1.0.0');assert.equal(row(state.market).pendingVersion,'');
  await state.feed.check();assert.equal(row(state.market).pendingVersion,'');
  state.feed.pauseAutoUpdate(catalog[0].manifest.id,false);assert.equal(row(state.market).pendingVersion,'1.2.0');
});

test('unsupported packages never partially schedule updates and disabling policy during a download prevents late scheduling',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);
  for(const manifest of [{permissions:['network']},{dependencies:['EXAMPLE_PROGRAM']},{host:'99.0.0'}]){
    state.reply=[updated(catalog[0]),{...updated(catalog[1]),manifest:{...updated(catalog[1]).manifest,...manifest}}];
    assert.equal((await state.feed.check()).state,'error');assert.equal(row(state.market).pendingVersion,'');assert.equal(state.market.versions(catalog[0].manifest.id).length,1);
  }
  let release,ready;const entered=new Promise(done=>{ready=done;});
  const delayed=new SkillFeed(join(state.root,'delayed.json'),state.market,async(url,options)=>{if(url!==commit){ready();await new Promise(done=>{release=done;});}return state.fetcher(url,options);});
  state.reply=[updated(catalog[0])];const pending=delayed.check();await entered;delayed.setAutoUpdates(false);release();await pending;
  assert.equal(row(state.market).pendingVersion,'');assert.equal(state.market.autoPolicy().enabled,false);
});

test('automatic staging is one database transaction even if a later queue write fails',async t=>{
  const state=fixture(t);install(state.market);install(state.market,catalog[1]);state.feed.setAutoUpdates(true);
  const database=new DatabaseSync(state.file);
  try {
    database.exec(`CREATE TRIGGER EXAMPLE_ONLY_FAIL_QUEUE BEFORE UPDATE ON selections WHEN NEW.id='${catalog[1].manifest.id}' AND NEW.pending_mode='automatic' BEGIN SELECT RAISE(ABORT,'EXAMPLE_ONLY_QUEUE_FAILURE'); END`);
    assert.equal((await state.feed.check()).state,'error');assert.equal(row(state.market).pendingVersion,'');assert.equal(row(state.market,catalog[1]).pendingVersion,'');assert.equal(state.market.versions(catalog[0].manifest.id).length,1);
    database.exec('DROP TRIGGER EXAMPLE_ONLY_FAIL_QUEUE');assert.equal((await state.feed.check()).state,'checked');assert.equal(state.market.autoPolicy().pendingAutomatic,2);
  } finally { database.close(); }
});

test('schema 2 migration preserves immutable package bytes/manual choices and defaults automatic trust off',t=>{
  const temp=realpathSync.native(tmpdir()),root=mkdtempSync(join(temp,'dsh-zhen-skill-migrate3-')),file=join(root,'skills.sqlite');let market;
  t.after(()=>{market?.close();const absolute=realpathSync.native(root),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Migration cleanup refused.');rmSync(absolute,{recursive:true,force:true});});
  const values=[catalog[0],updated(catalog[0])].map(verifySkill),keys=values.map(item=>createHash('sha256').update(JSON.stringify(item)).digest('hex'));
  const old=new DatabaseSync(file);old.exec("CREATE TABLE versions(digest TEXT PRIMARY KEY,id TEXT NOT NULL,version TEXT NOT NULL,package TEXT NOT NULL,UNIQUE(id,version));CREATE TABLE selections(id TEXT PRIMARY KEY,active TEXT NOT NULL DEFAULT '',pending TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1);PRAGMA user_version=2;");
  for(let index=0;index<values.length;index++)old.prepare('INSERT INTO versions VALUES(?,?,?,?)').run(keys[index],values[index].manifest.id,values[index].manifest.version,JSON.stringify(values[index]));
  old.prepare('INSERT INTO selections VALUES(?,?,?,0)').run(catalog[0].manifest.id,...keys);old.close();
  market=new SkillMarket(file,catalog);assert.equal(row(market).installedVersion,'1.1.0');assert.equal(row(market).enabled,true);assert.equal(market.autoPolicy().enabled,false);
  assert.deepEqual(market.versions(catalog[0].manifest.id).map(value=>JSON.stringify(value)).sort(),values.map(value=>JSON.stringify(value)).sort());
});

test('startup verifies the stored full-package identity before activating an automatic selection',async t=>{
  const state=fixture(t);install(state.market);state.feed.setAutoUpdates(true);await state.feed.check();
  const database=new DatabaseSync(state.file),before=database.prepare('SELECT active,pending FROM selections WHERE id=?').get(catalog[0].manifest.id);
  const item=verifySkill(updated(catalog[0]));item.manifest.title='EXAMPLE_ONLY_UNREVIEWED_METADATA';
  database.prepare('UPDATE versions SET package=? WHERE id=? AND version=?').run(JSON.stringify(item),item.manifest.id,item.manifest.version);
  assert.throws(()=>state.reopen(),/完整包摘要/);
  assert.deepEqual(database.prepare('SELECT active,pending FROM selections WHERE id=?').get(catalog[0].manifest.id),before);database.close();
});
