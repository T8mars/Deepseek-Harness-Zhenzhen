import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,realpath,rm,rename,lstat,cp} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {LocalSkills} from '../packages/dsh-zhen/lib/local-skills.js';
import {GithubSkills} from '../packages/dsh-zhen/lib/github-skills.js';
import {SkillMarket,readBundledCatalog} from '../packages/dsh-zhen/lib/market.js';
import {SkillFeed} from '../packages/dsh-zhen/lib/skill-feed.js';
import {LOCAL_SKILL_POLICY} from '../packages/dsh-zhen/lib/local-skills-schema.js';
import {GITHUB_SKILL_POLICY} from '../packages/dsh-zhen/lib/github-skills-schema.js';
import {writeSkillInventoryBackup,restoreSkillInventoryBackup,writeSkillBackup,restoreSkillBackup,openBackupArchive,writeBackupArchive} from '../packages/dsh-zhen/lib/backup.js';
import {githubSkillFixture} from './fixtures/github-skills.mjs';

const password='EXAMPLE managed skills backup password',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const skill=(name,body='EXAMPLE_BODY')=>`---\nname: ${name}\ndescription: EXAMPLE managed source\n---\n${body}\n`;
async function put(file,bytes){await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
async function fixture(t){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-managed-EXAMPLE-'))),parent=join(root,'candidates');await mkdir(parent);
  const handles=[],local=new LocalSkills(join(root,'local.json')),github=new GithubSkills(join(root,'github'),async()=>{throw Error('EXAMPLE_NO_NETWORK');}),market=new SkillMarket(join(root,'market.sqlite'),[]),feed=new SkillFeed(join(root,'feed.json'),market,async()=>{throw Error('EXAMPLE_NO_NETWORK');});handles.push(local,github,market);
  const source={filesystem:[],workspaces:[],local,github,market,feed,protectedContainers:[root],forbiddenTrees:[]};
  t.after(async()=>{for(const handle of handles.reverse())handle.close();const actual=await realpath(root),part=relative(temp,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-managed-EXAMPLE-'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  return {root,parent,handles,local,github,market,feed,source,archive:join(root,'EXAMPLE.encrypted')};
}
async function connect(local,path,mode='library'){const draft=await local.preview(path,mode);await local.connect(path,mode,draft.digest,LOCAL_SKILL_POLICY);return local.backupState().sources.find(row=>row.root===path&&row.mode===mode);}
async function withGit(f){f.github.close();const git=githubSkillFixture(f.root),github=new GithubSkills(join(f.root,'github'),git.fetcher);f.handles.push(github);f.source.github=github;f.github=github;f.git=git;return git;}
async function backup(f){await writeSkillInventoryBackup(f.archive,password,()=>f.source);return restoreSkillInventoryBackup(f.archive,password,f.parent);}
async function decode(file){const archive=await openBackupArchive(file,password),rows=[];try{for await(const item of archive.records()){const parts=[];for await(const bytes of item.data)parts.push(bytes);rows.push({metadata:item.metadata,bytes:Buffer.concat(parts)});}return rows;}finally{await archive.close();}}
async function* records(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
async function forge(f,label,edit){const rows=await decode(f.archive);await edit(rows);const file=join(f.root,'EXAMPLE_'+label);await writeBackupArchive(file,password,records(rows));return file;}
function sdk(f,path){f.source.filesystem.push({id:'EXAMPLE-SDK-'+f.source.filesystem.length,mode:'host-local',config:{includeDefaultRoots:false,dshHome:join(f.root,'home'),agentsHome:join(f.root,'agents'),customSkillDirs:[path],watch:false}});}

test('C100: actual local sources retain IDs, policies, disabled/missing states and new physical identities without granting later replacements',async t=>{
  const f=await fixture(t),a=join(f.root,'a'),b=join(f.root,'b'),missing=join(f.root,'missing');
  for(const path of [a,b,missing])await put(join(path,'example','SKILL.md'),skill('example-shared'));
  await put(join(a,'asset.bin'),Buffer.from([255,0,4]));await put(join(a,'example','scripts','example.mjs'),'throw Error("EXAMPLE_MUST_NOT_EXECUTE");');
  const first=await connect(f.local,a),disabled=await connect(f.local,b),absent=await connect(f.local,missing);f.local.disable(disabled.id);await rename(missing,join(f.root,'missing-moved'));
  const before=f.local.backupState(),bytes=await readFile(join(f.root,'local.json')),result=await backup(f),local=new LocalSkills(result.managed.local.file);f.handles.push(local);
  const actual=local.backupState();for(const original of before.sources){const restored=actual.sources.find(row=>row.id===original.id),mapping=result.managed.local.mappings.find(row=>row.id===original.id);assert.deepEqual({...restored,root:original.root,identity:original.identity},original);assert.equal(mapping.originIdentity,original.identity);assert.equal(mapping.originRoot,original.root);if(mapping.present){const stat=await lstat(restored.root,{bigint:true});assert.equal(restored.identity,stat.dev+':'+stat.ino);assert.notEqual(restored.identity,original.identity);}}
  const views=await local.list();assert.deepEqual(views.map(row=>row.state),['ready','disabled','unavailable']);const active=actual.sources.find(row=>row.id===first.id),lost=actual.sources.find(row=>row.id===absent.id);assert.deepEqual(await readFile(join(active.root,'asset.bin')),Buffer.from([255,0,4]));assert.equal(existsSync(lost.root),false);
  await put(join(lost.root,'example','SKILL.md'),skill('example-replacement'));assert.equal((await local.list()).find(row=>row.source.id===absent.id).state,'unavailable');assert.deepEqual(await readFile(join(f.root,'local.json')),bytes);assert.equal(result.readyForActivation,false);assert.equal(result.activated,false);
});

test('C100: shared roots, parent/child roots, mixed modes and SDK roles retain one physical resource graph',async t=>{
  const f=await fixture(t),root=join(f.root,'shared'),child=join(root,'child');await put(join(root,'SKILL.md'),skill('example-parent'));await put(join(child,'SKILL.md'),skill('example-child'));await put(join(child,'asset.bin'),'EXAMPLE_SHARED');
  await connect(f.local,root,'skill');await connect(f.local,root);await connect(f.local,child,'skill');sdk(f,root);const result=await backup(f),mappings=result.managed.local.mappings;
  assert.equal(mappings[0].restoredRoot,mappings[1].restoredRoot);assert.equal(mappings[0].restoredIdentity,mappings[1].restoredIdentity);assert.equal(mappings[2].restoredRoot,join(mappings[0].restoredRoot,'child'));assert.equal(result.roots.find(row=>row.origin.key.startsWith('sdk:')).restoredPath,mappings[0].restoredRoot);
  const local=new LocalSkills(result.managed.local.file);f.handles.push(local);assert.deepEqual((await local.list()).map(row=>row.state),['ready','ready','ready']);await writeFile(join(mappings[2].restoredRoot,'asset.bin'),'EXAMPLE_CHANGED');assert.equal(await readFile(join(mappings[0].restoredRoot,'child','asset.bin'),'utf8'),'EXAMPLE_CHANGED');assert.equal(await readFile(join(child,'asset.bin'),'utf8'),'EXAMPLE_SHARED');
});

test('C100: actual GitHub verification preserves active/pending/latest and retained bytes while candidate mounts remain empty',async t=>{
  const f=await fixture(t),git=await withGit(f),first=(await f.github.download(git.spec)).release;f.github.approve(first.sourceId,first.digest,GITHUB_SKILL_POLICY);git.setHead(git.second);const second=(await f.github.download(git.spec)).release;f.github.approve(second.sourceId,second.digest,GITHUB_SKILL_POLICY);
  const before=f.github.backupState(),sourceBytes=await readFile(join(before.root,'state.json')),calls=git.calls.length,result=await backup(f),candidate=new GithubSkills(result.managed.github.root,async()=>{throw Error('EXAMPLE_NO_NETWORK');},{candidate:true});f.handles.push(candidate);const actual=candidate.backupState();assert.deepEqual(actual.sources,before.sources);assert.deepEqual(actual.releases.map(row=>row.release),before.releases.map(row=>row.release));assert.deepEqual(actual.running,[]);assert.deepEqual(result.managed.github.originRunning,before.running);assert.equal(actual.sources[0].pending,second.digest);assert.equal(actual.sources[0].active,first.digest);assert.equal(git.calls.length,calls);assert.deepEqual(await readFile(join(before.root,'state.json')),sourceBytes);
  const copy=join(f.root,'EXAMPLE_ACTIVATION_COPY');await cp(result.managed.github.root,copy,{recursive:true,errorOnExist:true,force:false});const normal=new GithubSkills(copy);f.handles.push(normal);assert.equal(normal.backupState().sources[0].active,second.digest);assert.equal(candidate.backupState().sources[0].pending,second.digest);assert.equal(result.managed.github.candidateMounted,false);
  console.log(JSON.stringify({contract:'C100',actualManagedSourcesRestored:true,retainedReleases:2,pendingPreserved:true,candidateMounted:false,activated:false,nativeWrites:0,modelRequests:0}));
});

for(const mode of ['unapproved','forgotten','disabled'])test('C100: '+mode+' GitHub releases survive without new approval or activation',async t=>{
  const f=await fixture(t),git=await withGit(f),first=(await f.github.download(git.spec)).release;
  if(mode!=='unapproved')f.github.approve(first.sourceId,first.digest,GITHUB_SKILL_POLICY);if(mode==='forgotten')f.github.forget(first.sourceId);if(mode==='disabled')f.github.disable(first.sourceId);
  const before=f.github.backupState(),result=await backup(f),candidate=new GithubSkills(result.managed.github.root,undefined,{candidate:true});f.handles.push(candidate);const actual=candidate.backupState();assert.deepEqual(actual.sources,before.sources);assert.deepEqual(actual.releases.map(row=>row.release),before.releases.map(row=>row.release));assert.equal(actual.releases.length,1);assert.deepEqual(actual.running,[]);assert.deepEqual(result.managed.github.originRunning,before.running);
});

test('C100: GitHub cache shared with local and SDK roots is projected once and preserves original state-file bytes',async t=>{
  const f=await fixture(t),git=await withGit(f),release=(await f.github.download(git.spec)).release;f.github.approve(release.sourceId,release.digest,GITHUB_SKILL_POLICY);const cache=f.github.backupState().root;await put(join(cache,'SKILL.md'),skill('example-cache'));await connect(f.local,cache,'skill');sdk(f,cache);
  const state=join(cache,'state.json'),value=JSON.parse(await readFile(state));await writeFile(state,JSON.stringify(value,null,3)+'\n');const bytes=await readFile(state),result=await backup(f);assert.equal(result.managed.github.root,result.managed.local.mappings[0].restoredRoot);assert.equal(result.roots.find(row=>row.origin.key.startsWith('sdk:')).restoredPath,result.managed.github.root);assert.deepEqual(await readFile(result.managed.github.stateFile),bytes);const releaseRoot=result.roots.find(row=>row.origin.key.startsWith('github:'));assert.equal(releaseRoot.restoredPath,join(result.managed.github.root,'releases',release.sourceId,release.digest));assert.deepEqual(await readFile(state),bytes);
});

test('C100: different live and unverified persisted feed states remain distinct without staging or granting fetch evidence',async t=>{
  const f=await fixture(t),item=readBundledCatalog()[0],file=join(f.root,'feed.json'),status={...f.feed.snapshot(),revision:'a'.repeat(40),count:1,state:'checked'};await writeFile(file,JSON.stringify({status,catalog:[item]}));f.source.feed=new SkillFeed(file,f.market,async()=>{throw Error('EXAMPLE_NO_NETWORK');});const before=f.source.feed.backupState(),market=f.market.backupState(),bytes=await readFile(file);assert.equal(before.status.state,'error');assert.equal(before.status.revision,'');assert.equal(before.persisted.cache.status.revision,'a'.repeat(40));
  const result=await backup(f);assert.deepEqual(JSON.parse(await readFile(result.managed.feed.runtimeMetadata)),{status:before.status,catalog:before.catalog});assert.deepEqual(JSON.parse(await readFile(result.managed.feed.file)),before.persisted.cache);assert.deepEqual(result.inventory.market,market);assert.equal(f.market.hasVerifiedFeed([item],'a'.repeat(40)),false);assert.deepEqual(await readFile(file),bytes);assert.deepEqual(f.market.backupState(),market);
});

test('C100: absent GitHub and feed state files stay absent; v2 requires explicit cache provenance',async t=>{
  const f=await fixture(t),result=await backup(f);assert.equal(result.inventory.schema,'dsh-zhen-skill-inventory-v2');assert.equal(result.inventory.github.statePresent,false);assert.equal(result.managed.github.stateFile,null);assert.equal(existsSync(join(result.managed.github.root,'state.json')),false);assert.equal(result.managed.feed.file,null);assert.equal(existsSync(join(result.root,'state','skills-feed.json')),false);
  for(const field of ['root','statePresent']){const path=await forge(f,field,rows=>{const value=JSON.parse(rows[0].bytes);delete value.github[field];rows[0].bytes=Buffer.from(JSON.stringify(value));});await assert.rejects(restoreSkillInventoryBackup(path,password,f.parent),e=>e.code==='BACKUP_SKILL_INVENTORY_INVALID');}assert.deepEqual(await readdir(f.parent),[result.root.split(/[\\/]/).at(-1)]);
});

test('C100: legacy v1 retained-release archives infer a coherent cache without requiring new metadata',async t=>{
  const f=await fixture(t),git=await withGit(f),item=(await f.github.download(git.spec)).release;f.github.approve(item.sourceId,item.digest,GITHUB_SKILL_POLICY);await writeSkillInventoryBackup(f.archive,password,()=>f.source);const legacy=await forge(f,'legacy',rows=>{const value=JSON.parse(rows[0].bytes);value.schema='dsh-zhen-skill-inventory-v1';rows[0].metadata.schema=value.schema;delete value.github.root;delete value.github.statePresent;rows[0].bytes=Buffer.from(JSON.stringify(value));});const result=await restoreSkillInventoryBackup(legacy,password,f.parent),candidate=new GithubSkills(result.managed.github.root,undefined,{candidate:true});f.handles.push(candidate);assert.equal(result.inventory.schema,'dsh-zhen-skill-inventory-v1');assert.equal(candidate.backupState().releases[0].release.digest,item.digest);assert.deepEqual(candidate.backupState().sources,result.inventory.github.sources);
});

async function aliasArchive(f){const root=join(f.root,'shared');await put(join(root,'asset.bin'),'EXAMPLE_ASSET');const selection={roots:['a','b'].map(key=>({key:'EXAMPLE-'+key,path:root,kind:'custom',mode:'library',enabled:true})),protectedContainers:[f.root],forbiddenTrees:[]};await writeSkillBackup(f.archive,password,()=>selection);}
test('C100: foreign-platform equal canonical roots are lexical provenance and retain shared destinations',async t=>{
  const f=await fixture(t);await aliasArchive(f);const file=await forge(f,'foreign',rows=>{const value=JSON.parse(rows[0].bytes);for(const root of value.roots)root.path=root.canonicalRoot='/EXAMPLE/foreign/shared';rows[0].bytes=Buffer.from(JSON.stringify(value));}),result=await restoreSkillBackup(file,password,f.parent);assert.equal(result.roots[0].restoredPath,result.roots[1].restoredPath);assert.equal(result.roots[0].canonicalOrigin,'/EXAMPLE/foreign/shared');assert.ok(result.roots[0].restoredPath.startsWith(result.root));assert.equal(await readFile(join(result.roots[0].restoredPath,'asset.bin'),'utf8'),'EXAMPLE_ASSET');
});

for(const conflict of ['bytes','directory','presence','portable-case','omission'])test('C100: shared-root '+conflict+' conflict refuses before creating a destination',async t=>{
  const f=await fixture(t);await aliasArchive(f);const file=await forge(f,conflict,rows=>{const value=JSON.parse(rows[0].bytes),node=value.nodes.find(row=>row.root===1);if(conflict==='bytes')node.sha256='0'.repeat(64);if(conflict==='directory'){node.kind='directory';node.bytes=0;delete node.sha256;delete node.executable;rows.splice(2,1);}if(conflict==='presence'||conflict==='omission'){if(conflict==='presence')value.roots[1].present=false;value.nodes=value.nodes.filter(row=>row.root!==1);rows.splice(2,1);}if(conflict==='portable-case')node.parts=['ASSET.bin'];rows[0].bytes=Buffer.from(JSON.stringify(value));});await assert.rejects(restoreSkillBackup(file,password,f.parent),e=>['BACKUP_SKILL_ROOT_CONFLICT','BACKUP_SKILL_PATH_COLLISION'].includes(e.code));assert.deepEqual(await readdir(f.parent),[]);
});

test('C100: deduplicated resource records are still all hashed and corruption preserves an earlier candidate',async t=>{
  const f=await fixture(t);await aliasArchive(f);const first=await restoreSkillBackup(f.archive,password,f.parent),file=await forge(f,'duplicate-payload',rows=>{rows.at(-1).bytes[0]^=1;});await assert.rejects(restoreSkillBackup(file,password,f.parent),e=>e.code==='BACKUP_SKILL_DIGEST_MISMATCH');assert.equal(await readFile(join(first.roots[0].restoredPath,'asset.bin'),'utf8'),'EXAMPLE_ASSET');assert.deepEqual(await readdir(f.parent),[first.root.split(/[\\/]/).at(-1)]);
});

for(const checkpoint of ['local-skills.json','skills-feed-runtime.json','dsh-zhen-skill-inventory-restore.json'])test('C100: cancellation after '+checkpoint+' removes only the fresh candidate',async t=>{
  const f=await fixture(t),first=await backup(f),controller=new AbortController(),original=controller.signal.throwIfAborted.bind(controller.signal);let cancelled=false;controller.signal.throwIfAborted=()=>{if(readdirSync(f.parent).some(name=>join(f.parent,name)!==first.root&&existsSync(join(f.parent,name,checkpoint.startsWith('dsh-')?'':'state',checkpoint)))){cancelled=true;controller.abort();}original();};await assert.rejects(restoreSkillInventoryBackup(f.archive,password,f.parent,{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(cancelled,true);assert.deepEqual(await readdir(f.parent),[first.root.split(/[\\/]/).at(-1)]);assert.equal(existsSync(first.market.database),true);
});

test('C100: mixed SDK system exclusions preserve explicitly selected resources without changing shared-root identity',async t=>{
  const f=await fixture(t),root=join(f.root,'shared');await put(join(root,'example','SKILL.md'),skill('example-visible'));await put(join(root,'.system','example','SKILL.md'),skill('example-explicit-system'));
  const roots=[{key:'EXAMPLE-SDK',path:root,kind:'user-dsh',mode:'library',enabled:true},{key:'EXAMPLE-custom',path:root,kind:'custom',mode:'library',enabled:false}];await writeSkillBackup(f.archive,password,()=>({roots,protectedContainers:[f.root],forbiddenTrees:[]}));const result=await restoreSkillBackup(f.archive,password,f.parent);assert.equal(result.roots[0].restoredPath,result.roots[1].restoredPath);assert.match(await readFile(join(result.roots[1].restoredPath,'.system','example','SKILL.md'),'utf8'),/example-explicit-system/);const manifest=JSON.parse(await readFile(join(result.root,'dsh-zhen-skill-restore.json')));assert.deepEqual(manifest.roots[0].excludedMetadata,['.git','.system']);assert.equal(result.roots[1].origin.enabled,false);
});

for(const origin of ['/EXAMPLE/skills','Z:\\EXAMPLE\\skills'])test('C100: nested '+(origin.startsWith('/')?'POSIX':'Windows')+' origins preserve parent/child mapping without source access',async t=>{
  const f=await fixture(t),root=join(f.root,'shared'),child=join(root,'nested');await put(join(child,'asset.bin'),'EXAMPLE_NESTED');const roots=[root,child].map((path,index)=>({key:'EXAMPLE-'+index,path,kind:'custom',mode:'library',enabled:true}));await writeSkillBackup(f.archive,password,()=>({roots,protectedContainers:[f.root],forbiddenTrees:[]}));const file=await forge(f,'nested',rows=>{const value=JSON.parse(rows[0].bytes);value.roots.forEach((row,index)=>{row.path=row.canonicalRoot=origin+(index?(origin.startsWith('/')?'/nested':'\\nested'):'');});rows[0].bytes=Buffer.from(JSON.stringify(value));}),result=await restoreSkillBackup(file,password,f.parent);assert.equal(result.roots[1].restoredPath,join(result.roots[0].restoredPath,'nested'));assert.equal(await readFile(join(result.roots[1].restoredPath,'asset.bin'),'utf8'),'EXAMPLE_NESTED');assert.equal(await readFile(join(child,'asset.bin'),'utf8'),'EXAMPLE_NESTED');
});

test('C100: shadowed local definitions retain their order and readiness after restoring actual service state',async t=>{
  const f=await fixture(t);for(const name of ['a','b']){const path=join(f.root,name);await put(join(path,'example','SKILL.md'),skill('example-shared','EXAMPLE_'+name));await connect(f.local,path);}const before=await f.local.list(),result=await backup(f),local=new LocalSkills(result.managed.local.file);f.handles.push(local);const after=await local.list(),view=rows=>rows.map(row=>({id:row.source.id,state:row.state,entries:row.entries}));assert.deepEqual(view(after),view(before));assert.equal(after[1].entries[0].shadowed,true);
});

test('C100: GitHub immutable manifest verification rejects changed bytes even when the resource archive digest is valid',async t=>{
  const f=await fixture(t),git=await withGit(f);await f.github.download(git.spec);const first=await backup(f),source=f.github.backupState(),calls=git.calls.length,file=await forge(f,'immutable-tamper',rows=>{const manifest=JSON.parse(rows[1].bytes),index=manifest.nodes.findIndex(row=>row.kind==='file'&&row.parts.join('/').endsWith('assets/example.bin')),record=rows.find(row=>row.metadata.node===index);record.bytes[0]^=1;manifest.nodes[index].sha256=sha(record.bytes);rows[1].bytes=Buffer.from(JSON.stringify(manifest));});await assert.rejects(restoreSkillInventoryBackup(file,password,f.parent),e=>e.code==='BACKUP_SKILL_RESTORE_FAILED');assert.deepEqual(f.github.backupState(),source);assert.equal(git.calls.length,calls);assert.deepEqual(await readdir(f.parent),[first.root.split(/[\\/]/).at(-1)]);
});

test('C100: GitHub root replacement is refused rather than backing up another directory under the old identity',async t=>{
  const f=await fixture(t),root=f.github.backupState().root;await rename(root,root+'-moved');await mkdir(root);await put(join(root,'EXAMPLE_REPLACEMENT'),'EXAMPLE');assert.throws(()=>f.github.backupState());await assert.rejects(writeSkillInventoryBackup(f.archive,password,()=>f.source));assert.equal(existsSync(f.archive),false);assert.equal(await readFile(join(root,'EXAMPLE_REPLACEMENT'),'utf8'),'EXAMPLE');
});
